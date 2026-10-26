import SwiftUI
import StoreKit

// Booking in the app (Model/Shop.swift): the two plans at Apple's prices, what renewing means, and the codes this phone holds.
// The words follow the website's booking page (site/pages/buy.html).
struct BookCard: View {
    let open: (String) -> Void
    let show: (Page) -> Void
    @State private var managing = false
    private var shop: Shop { Shop.shared }

    var body: some View {
        Card {
            Eyebrow("book")
            H2("Book a Table")
            Sub("One booking covers the evening: fifteen Trials and thousands of questions and prompts, played on everyone’s own phone, with a full show on your TV if you want one.")
            if let t = shop.table {
                plan(t, name: "One party", about: "One Table for one party of 8 to 24 players, open for 48 hours from when you first use it.", buy: "Book for \(t.price)")
            }
            if let r = shop.regular {
                plan(r, name: "Regular", about: "One booking code that starts a new game whenever you like, one at a time, for as long as you’re subscribed. Cancel any time.", buy: "Subscribe for \(r.price) \(r.period ?? "a month")")
            }
            if shop.table == nil && shop.regular == nil {
                if shop.loaded {
                    Small("Booking isn’t available right now. Check you’re online, then try again.")
                    Button("Try again") { Task { await shop.load() } }.btn(.ghost, .sm, fit: true).padding(.bottom, 12)
                } else {
                    Small("Asking the App Store for prices…")
                }
            } else {
                Small("Your booking code appears here as soon as you’ve paid, and stays on this phone. Use it whenever you like: the 48 hours start only when you open your Table. Prices include VAT where it applies.")
                if let r = shop.regular {
                    Small("Payment is taken from your Apple Account. The Regular plan is \(r.price) \(r.period ?? "a month") and renews automatically until you cancel, which you can do at any time up to 24 hours before the end of the month, in your Apple Account’s subscriptions.")
                }
            }
            Flow(spacing: 8) {
                Button("Restore purchases") { Task { await shop.restore() } }.btn(.dark, .sm, fit: true)
                Button("Manage subscription") { managing = true }.btn(.dark, .sm, fit: true)
                Button("Terms of sale") { show(.terms) }.btn(.dark, .sm, fit: true)
                Button("Privacy") { show(.privacy) }.btn(.dark, .sm, fit: true)
            }
            .padding(.bottom, 8)
        }
        .manageSubscriptionsSheet(isPresented: $managing)
    }

    private func plan(_ p: Shop.Plan, name: String, about: String, buy: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(name).font(Theme.book(24)).foregroundStyle(Theme.tallow)
                Spacer()
                Text(verbatim: p.price + (p.period.map { " " + $0 } ?? "")).font(Theme.ui(20, .bold)).foregroundStyle(Theme.brass2)
            }
            .padding(.bottom, 4)
            Small(about)
            Button(shop.buying == p.id ? "Waiting for the App Store…" : buy) { Task { await shop.buy(p) } }
                .btn(p.id == Shop.tableID ? .fill : .ghost)
                .disabled(shop.buying != nil || p.product == nil)
        }
        .padding(.bottom, 18)
    }
}

// the codes this phone has bought or opened a Table with, newest first
struct YourCodes: View {
    let open: (String) -> Void
    @State private var copied: String?
    private var shop: Shop { Shop.shared }

    var body: some View {
        if !shop.codes.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                Label2("Your booking codes")
                ForEach(shop.codes) { c in
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: c.pass).font(Theme.ui(20, .bold)).tracking(1.5).foregroundStyle(Theme.tallow).textSelection(.enabled)
                            Text(copied == c.pass ? "Copied" : c.sub == true ? "Regular" : c.sub == false ? "One party" : "Booking code")
                                .font(Theme.sc(13)).tracking(0.6).foregroundStyle(Theme.tallow2)
                        }
                        Spacer()
                        Button("Open") { open(c.pass) }.btn(.ghost, .sm, fit: true)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule).frame(height: 1) }
                    .contextMenu {
                        Button("Copy the code") { UIPasteboard.general.string = c.pass; copied = c.pass }
                        Button("Forget this code", role: .destructive) { shop.forget(c) }
                    }
                }
                Small("Touch and hold a code to copy it or forget it.").padding(.top, 8)
            }
            .padding(.bottom, 14)
        }
    }
}

// straight after paying: the code, and the way to the Table
struct BoughtSheet: View {
    let bought: Shop.Bought
    let open: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    var body: some View {
        ScrollView {
            Column {
                Brand(mark: "booked")
                Card(.hot, center: true) {
                    Eyebrow("your booking code")
                    Text(verbatim: bought.pass).font(Theme.ui(30, .bold)).tracking(2).foregroundStyle(Theme.brass2).textSelection(.enabled).padding(.vertical, 10)
                    Sub(bought.sub
                        ? "Your Regular code. It opens a new game whenever you like, one at a time, while you’re subscribed."
                        : "It opens one Table, for one party. The 48 hours start when you open it, so keep it for the night.")
                }
                Small("It’s saved on this phone, under Your booking codes. Write it down or take a screenshot too.", center: true)
                VStack(spacing: 10) {
                    Button("Open my Table now") { dismiss(); open(bought.pass) }.btn(.fill)
                    Button(copied ? "Copied" : "Copy the code") { UIPasteboard.general.string = bought.pass; copied = true }.btn(.ghost)
                    Button("Later") { dismiss() }.btn(.dark, .sm)
                }
            }
        }
        .background(Backdrop())
    }
}
