import Foundation
import Observation

// One Table, as one phone (or the TV) takes part: it joins, polls what it may see, and sends taps. The same steps as
// src/modern-ui.js (api, take, poll, send, doJoin, doCreate), with the token kept on the phone like the page's
// localStorage, under the same name.
@MainActor @Observable
final class Session {
    enum Screen: Equatable { case join, create(test: Bool), choose, wait, nogame, play, tv }
    struct Toast: Equatable { let text: String; let error: Bool }
    // a question before a tap that can't be taken back (the page's confirm() and prompt())
    struct Ask: Identifiable {
        let id = UUID()
        let title: String
        var message: String? = nil
        var yes = "Yes"
        var typed = false // the answer must be typed (the host's last resort)
        let then: (String) -> Void
    }

    let room: String
    var screen: Screen
    private(set) var view: Snapshot?
    private(set) var rejoin: [Rejoin] = []
    var peekList: [Peek]?
    var tools = false
    var ask: Ask?
    var toast: Toast?
    private(set) var online = true
    private(set) var busy = false
    private(set) var classic = false
    var pass: String?           // the booking code, for the host setting the Table up
    var rolePeek = false        // the role card is showing (the veil was tapped)
    var background = false      // the app is in the background: poll slowly
    private(set) var freshKey = "" // the screen's key: a new one fades the screen in
    private(set) var token: String?

    @ObservationIgnored private var off: Double = 0 // the server's clock minus this phone's, in milliseconds
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var beat: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored private var buzzed = ""
    @ObservationIgnored private var buzzEnd: Double = 0
    @ObservationIgnored private var cueKey = ""
    @ObservationIgnored private var tickKey = ""
    @ObservationIgnored var demo = false // a Debug build showing a recorded moment: no polling, no sound

    var isTV: Bool { screen == .tv }

    init(room: String, screen: Screen? = nil, pass: String? = nil) {
        self.room = room
        self.pass = pass
        let tok = UserDefaults.standard.string(forKey: Session.tokKey(room))
        token = tok
        if let screen { self.screen = screen }
        else if UserDefaults.standard.string(forKey: Session.reqKey(room)) != nil && tok == nil { self.screen = .wait }
        else { self.screen = tok != nil ? .play : .join }
    }

    nonisolated static func tokKey(_ room: String) -> String { "bt-m-" + room }
    nonisolated static func reqKey(_ room: String) -> String { "bt-mreq-" + room }

    // ---- the clocks: the server's time, and the game's, which stands still while the host has paused
    func now() -> Double { Date().timeIntervalSince1970 * 1000 + off }
    func gameNow() -> Double { view?.paused ?? now() }
    func secondsLeft(_ end: Double?) -> Int { max(0, Int(ceil(((end ?? 0) - gameNow()) / 1000))) }

    // ---- starting and stopping
    func start() {
        guard !demo else { return }
        if loop == nil {
            loop = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self else { return }
                    await self.poll()
                    let it = self.view?.trial?.item
                    let fast = it?.k == "snap" && it?.stage == "open"
                    let wait = fast ? 0.35 : self.background ? 4 : 1.2
                    try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
                }
            }
        }
        if beat == nil {
            beat = Task { [weak self] in
                while !Task.isCancelled {
                    self?.heartbeat()
                    try? await Task.sleep(nanoseconds: 200_000_000)
                }
            }
        }
    }

    func stop() {
        loop?.cancel(); loop = nil
        beat?.cancel(); beat = nil
    }

    // a Debug build's recorded moment (ios/tools/fixtures.mjs), shown without a server
    func show(_ v: Snapshot, rejoin: [Rejoin] = [], peek: [Peek]? = nil, tools: Bool = false, rolePeek: Bool = false) {
        demo = true
        view = v
        off = v.now - Date().timeIntervalSince1970 * 1000
        freshKey = v.screenKey
        self.rejoin = rejoin
        peekList = peek
        self.tools = tools
        self.rolePeek = rolePeek
    }

    // ---- talking to the server
    func poll() async {
        guard [.play, .tv, .wait].contains(screen) else { return }
        do {
            if screen == .wait {
                let r = try await API.room(room, "m/join", body: ["req": UserDefaults.standard.string(forKey: Session.reqKey(room)) ?? ""])
                if let t = r.json["tok"].string { setToken(t); UserDefaults.standard.removeObject(forKey: Session.reqKey(room)); screen = .play }
                else if r.json["gone"].bool == true { UserDefaults.standard.removeObject(forKey: Session.reqKey(room)); screen = .join; say(r.error ?? "The host turned that request down.", error: true) }
            } else {
                let q = "m?v=" + (view.map { String($0.ver) } ?? "") + "&me=" + (view?.me?.id ?? "")
                let r = try await API.room(room, q, token: isTV ? nil : token)
                if r.json["none"].bool == true {
                    classic = r.json["classic"].bool == true
                    view = nil
                    if !isTV { screen = .nogame }
                } else { take(r.json) }
            }
            online = true
        } catch { online = false }
    }

    private func take(_ j: JSON) {
        let local = Date().timeIntervalSince1970 * 1000
        if let n = j["now"].double { off = n - local }
        if let v = Snapshot(j["view"]) { view = v; off = v.now - local; changed() }
        if !j["rejoin"].isNull { rejoin = j["rejoin"].array.compactMap { r in r["id"].string.map { Rejoin(id: $0, name: r["name"].string ?? "?") } } }
        else if !j["view"].isNull { rejoin = [] }
        if !j["peek"].isNull { peekList = j["peek"].array.map { Peek(name: $0["name"].string ?? "?", role: $0["role"].string, alive: $0["alive"].bool ?? false) } }
    }

    func send(_ a: [String: Any]) {
        guard !busy, !demo else { return }
        busy = true
        Task {
            defer { busy = false }
            do {
                let r = try await API.room(room, "m/act", body: a, token: token)
                if r.json["lost"].bool == true {
                    clearToken(); screen = .join
                    say("This phone lost its place. Type your name to ask the host to let you back in.", error: true)
                } else {
                    take(r.json)
                    if let e = r.error { say(e, error: true) }
                }
            } catch { say("Can’t reach the game. Check you’re online.", error: true) }
        }
    }

    func act(_ a: String, _ v: Any? = nil) {
        var body: [String: Any] = ["a": a]
        if let v { body["v"] = v }
        send(body)
    }

    func confirm(_ title: String, yes: String = "Yes", then: @escaping () -> Void) {
        ask = Ask(title: title, yes: yes) { _ in then() }
    }

    func join(name: String) async {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return say("Type your name.", error: true) }
        say("Joining…")
        do {
            let r = try await API.room(room, "m/join", body: ["name": name])
            if r.json["none"].bool == true {
                if r.json["classic"].bool == true { classic = true; return say("This Table plays Classic, which the app doesn’t play.", error: true) }
                return say("This Table hasn’t been set up yet. The host opens it first.", error: true)
            }
            if let t = r.json["tok"].string { setToken(t); take(r.json); screen = .play; toast = nil; start(); return }
            if let q = r.json["req"].string { UserDefaults.standard.set(q, forKey: Session.reqKey(room)); screen = .wait; toast = nil; start(); return }
            say(r.status == 404 ? "There’s no Table with that code." : r.error ?? "That didn’t work.", error: true)
        } catch { say("Can’t reach the game. Check you’re online.", error: true) }
    }

    func create(name: String, bots: Int? = nil) async {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return say("Type your name.", error: true) }
        say("Opening…")
        var body: [String: Any] = ["name": name, "pass": pass ?? ""]
        if let bots { body["test"] = true; body["bots"] = bots }
        do {
            let r = try await API.room(room, "m/create", body: body)
            if let t = r.json["tok"].string { setToken(t); take(r.json); screen = .play; toast = nil; start(); return }
            if r.json["mode"].string == "modern" {
                screen = token != nil ? .play : .join
                if token == nil { say(r.error ?? "This Table is already set up. Join it with your name.", error: true) } else { start() }
                return
            }
            say(r.error ?? "That didn’t work.", error: true)
        } catch { say("Can’t reach the server. Check you’re online.", error: true) }
    }

    func say(_ text: String, error: Bool = false) {
        toast = text.isEmpty ? nil : Toast(text: text, error: error)
        toastTask?.cancel()
        guard !text.isEmpty else { return }
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { self?.toast = nil }
        }
    }

    func letIn(_ r: Rejoin, _ yes: Bool) {
        rejoin.removeAll { $0.id == r.id }
        send(["a": yes ? "letin" : "keepout", "v": r.id])
    }

    private func setToken(_ t: String) {
        token = t
        UserDefaults.standard.set(t, forKey: Session.tokKey(room))
        Recent.remember(room)
    }

    private func clearToken() {
        token = nil
        UserDefaults.standard.removeObject(forKey: Session.tokKey(room))
    }

    // ---- what a change of screen sets off: the fade, a buzz for this player, the TV's sound
    private func changed() {
        guard let v = view else { return }
        if v.screenKey != freshKey { freshKey = v.screenKey; if v.phase != "roles" { rolePeek = false } }
        if !isTV {
            let k = v.needsMe
            if !k.isEmpty && k != buzzed { if !buzzed.isEmpty || k != "roles" { Feedback.buzz() }; buzzed = k }
        }
        if Sound.shared.follows(self) {
            Sound.shared.scene(v.scene)
            if v.cueKey != cueKey { cueKey = v.cueKey; Sound.shared.cue(v.cueSound) }
        }
    }

    private func heartbeat() {
        guard let v = view else { return }
        if !isTV, let e = v.owedEnd {
            let r = Int(ceil((e - now()) / 1000))
            if r > 0 && r <= 10 && buzzEnd != e { buzzEnd = e; Feedback.late() }
        }
        if Sound.shared.follows(self), v.paused == nil, let end = v.mainClock(tv: isTV) {
            let r = Int(ceil((end - now()) / 1000)), k = "\(end):\(r)"
            if r > 0 && r <= 5 && k != tickKey { tickKey = k; Sound.shared.cue(["alarm"]) }
            else if r == 0 && tickKey != "\(end)" { tickKey = "\(end)"; Sound.shared.cue(["chime"]) }
        }
    }
}

// The Tables this phone has played lately, so the start screen can offer "Back to the game" (48 hours, as a Table lasts)
enum Recent {
    private static let roomKey = "recent.room", atKey = "recent.at"
    static var room: String? {
        let d = UserDefaults.standard
        guard let r = d.string(forKey: roomKey), Date().timeIntervalSince1970 - d.double(forKey: atKey) < 48 * 3600,
              d.string(forKey: Session.tokKey(r)) != nil else { return nil }
        return r
    }
    static func remember(_ room: String) {
        let d = UserDefaults.standard
        if d.string(forKey: roomKey) != room { d.set(Date().timeIntervalSince1970, forKey: atKey) }
        d.set(room, forKey: roomKey)
    }
}
