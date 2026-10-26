import Foundation
import StoreKit
import Observation

// Buying a Table, or the Regular plan, with Apple's in-app purchase. Each purchase goes to the server
// (POST /api/appstore/claim, worker/src/appstore.js), which checks it with Apple and gives back a booking code; only then
// is the purchase finished, so a code is never lost to a dropped connection (unfinished purchases are claimed again when
// the app next opens). The codes are kept on the phone (SavedCodes).
@MainActor @Observable
final class Shop {
    static let shared = Shop()
    static let tableID = "uk.co.thebetrayal.app.table"
    static let regularID = "uk.co.thebetrayal.app.regular"

    struct Plan: Identifiable {
        let id: String
        let price: String       // as the App Store shows it, in the buyer's currency
        let period: String?     // "a month" for the Regular plan
        let product: Product?
    }
    struct Bought: Identifiable { let id = UUID(); let pass: String; let sub: Bool }

    private(set) var table: Plan?
    private(set) var regular: Plan?
    private(set) var loaded = false
    private(set) var buying: String?
    var problem: String?
    var bought: Bought?
    private(set) var codes: [SavedCodes.Code] = SavedCodes.all
    @ObservationIgnored private var listening: Task<Void, Never>?

    func start() {
        guard listening == nil else { return }
        // purchases that finish away from the buy button (Ask to Buy, a renewal, another device), and any the server
        // hadn't answered for before
        listening = Task { [weak self] in
            for await r in Transaction.updates { await self?.collect(r, shown: false) }
        }
        Task {
            await load()
            for await r in Transaction.unfinished { await collect(r, shown: false) }
        }
    }

    func load() async {
        guard !shown else { return }
        guard let ps = try? await Product.products(for: [Shop.tableID, Shop.regularID]) else { loaded = true; return }
        for p in ps {
            let plan = Plan(id: p.id, price: p.displayPrice, period: p.subscription.map { Shop.period($0.subscriptionPeriod) }, product: p)
            if p.id == Shop.tableID { table = plan } else if p.id == Shop.regularID { regular = plan }
        }
        loaded = true
    }

    // a Debug build's pictures: the plans as the App Store would price them, without the App Store
    func show(table: Plan, regular: Plan) { self.table = table; self.regular = regular; loaded = true; shown = true }
    func reload() { codes = SavedCodes.all }
    @ObservationIgnored private var shown = false

    func buy(_ plan: Plan) async {
        guard let product = plan.product, buying == nil else { return }
        buying = plan.id
        defer { buying = nil }
        do {
            switch try await product.purchase() {
            case .success(let r): await collect(r, shown: true)
            case .pending: problem = "Your purchase is waiting to be approved. Your booking code will appear here once it is."
            case .userCancelled: break
            @unknown default: break
            }
        } catch {
            problem = "The App Store couldn’t complete the purchase. Nothing was charged. Try again in a moment."
        }
    }

    // the Regular plan on this Apple Account (and anything else the App Store still owes this phone)
    func restore() async {
        try? await AppStore.sync()
        var found = false
        for await r in Transaction.currentEntitlements { found = true; await collect(r, shown: true) }
        if !found { problem = "There’s no Regular plan on this Apple Account. A Table bought in the app is in Your booking codes on the phone that bought it." }
    }

    // a purchase, exchanged for its booking code
    private func collect(_ r: VerificationResult<Transaction>, shown: Bool) async {
        guard case .verified(let t) = r else {
            if shown { problem = "The App Store couldn’t confirm that purchase, so it wasn’t used." }
            return
        }
        guard t.productID == Shop.tableID || t.productID == Shop.regularID else { await t.finish(); return }
        let reply: Reply
        do { reply = try await API.call("/api/appstore/claim", body: ["jws": r.jwsRepresentation]) } catch {
            if shown { problem = "Paid, but the server can’t be reached to give you your booking code. It will appear here as soon as the app can reach it." }
            return
        }
        if let pass = reply.json["pass"].string {
            let sub = reply.json["sub"].bool ?? false
            SavedCodes.add(pass, sub: sub)
            codes = SavedCodes.all
            await t.finish()
            if shown { bought = Bought(pass: pass, sub: sub) }
        } else if reply.status == 410 || reply.status == 403 {
            // refunded, or Xcode's StoreKit testing on a real server: asking again won't change the answer. (Anything else
            // stays unfinished, so a paid purchase is claimed once the server can give its code.)
            await t.finish()
            if shown { problem = (reply.error ?? "That purchase can’t be used.") + (reply.status == 403 ? " Nothing was charged." : "") }
        } else if shown {
            problem = (reply.error ?? "The server couldn’t give you a booking code.") + " Your purchase is safe: the app will try again."
        }
    }

    func forget(_ c: SavedCodes.Code) { SavedCodes.remove(c.pass); codes = SavedCodes.all }
    // a code typed in that opened a Table (not the master passcode, which isn't a booking code's shape)
    func remember(_ typed: String) {
        guard let pass = SavedCodes.shown(typed) else { return }
        SavedCodes.add(pass, sub: nil)
        codes = SavedCodes.all
    }

    static func period(_ p: Product.SubscriptionPeriod) -> String {
        let n = p.value
        switch p.unit {
        case .day: return n == 1 ? "a day" : "every \(n) days"
        case .week: return n == 1 ? "a week" : "every \(n) weeks"
        case .month: return n == 1 ? "a month" : "every \(n) months"
        case .year: return n == 1 ? "a year" : "every \(n) years"
        @unknown default: return ""
        }
    }
}

// The booking codes this phone has bought or used, newest first: a code bought in the app lives here, so it's never
// only in a screenshot
enum SavedCodes {
    struct Code: Identifiable, Codable, Hashable {
        let pass: String
        var sub: Bool?
        let at: Date
        var id: String { pass }
    }
    private static let key = "bt-codes"

    static var all: [Code] {
        guard let d = UserDefaults.standard.data(forKey: key), let list = try? JSONDecoder().decode([Code].self, from: d) else { return [] }
        return list.sorted { $0.at > $1.at }
    }
    static func add(_ pass: String, sub: Bool?) {
        var list = all
        if let i = list.firstIndex(where: { $0.pass == pass }) { if let sub { list[i].sub = sub } }
        else { list.append(Code(pass: pass, sub: sub, at: Date())) }
        save(list)
    }
    static func remove(_ pass: String) { save(all.filter { $0.pass != pass }) }
    // as worker/src/codes.js shows a code (shownPass): OATH-XXXX-XXXX, whichever prefix it was typed with
    static func shown(_ typed: String) -> String? {
        var s = typed.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }
        if s.hasPrefix("OATH") || s.hasPrefix("CNDL") { s = String(s.dropFirst(4)) }
        guard s.count == 8 else { return nil }
        return "OATH-" + s.prefix(4) + "-" + s.suffix(4)
    }
    private static func save(_ list: [Code]) { if let d = try? JSONEncoder().encode(list) { UserDefaults.standard.set(d, forKey: key) } }
}
