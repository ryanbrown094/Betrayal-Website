import Foundation

// Where the game lives, and the calls the start screen makes: the same ones as the website's home page (site/index.html).
enum Site {
    static let base = URL(string: "https://thebetrayal.co.uk")!
    // the only pages the app shows: a player's phone, the TV, and joining
    static func isGame(_ url: URL) -> Bool {
        guard url.host == base.host else { return false }
        return url.path.hasPrefix("/m/") || url.path.hasPrefix("/t/") || url.path == "/join"
    }
}

// What the app opens: a Table, and how (as a player, or as the host setting it up)
struct GameTarget: Hashable {
    enum Start: Hashable { case play, create, bots }
    let room: String
    var start: Start = .play
    var pass: String? = nil
    var selfTest = false // DEBUG: GameView shows its bridge check instead (see GameModel.selfTestPage)

    var url: URL {
        var c = URLComponents(url: Site.base.appendingPathComponent("m/" + room), resolvingAgainstBaseURL: false)!
        c.fragment = start == .create ? "create" : start == .bots ? "create-bots" : nil
        return c.url!
    }
}

struct TableError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

enum Tables {
    struct Opened { let room: String; let test: Bool; let sub: Bool; let again: Bool }
    enum Mode { case unset, modern, classic }

    // POST /api/games {pass, fresh}: a booking code opens its Table, or reopens the one it already has
    static func open(pass: String, fresh: Bool = false) async throws -> Opened {
        var req = URLRequest(url: Site.base.appendingPathComponent("api/games"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["pass": pass, "fresh": fresh])
        let result: (Data, URLResponse)
        do { result = try await URLSession.shared.data(for: req) } catch { throw TableError(message: "Can’t reach the server. Check you’re online.") }
        let (data, resp) = result
        let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let ok = ((resp as? HTTPURLResponse)?.statusCode).map { (200..<300).contains($0) } ?? false
        guard ok, let room = j["room"] as? String else { throw TableError(message: j["error"] as? String ?? "That didn’t work. Try again.") }
        return Opened(room: room, test: j["test"] as? Bool ?? false, sub: j["sub"] as? Bool ?? false, again: j["again"] as? Bool ?? false)
    }

    // GET /api/g/ROOM/m: has the Table been set up, and which way? (the website asks the same before showing its choice)
    static func mode(of room: String) async -> Mode {
        var req = URLRequest(url: Site.base.appendingPathComponent("api/g/\(room)/m"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        guard let result = try? await URLSession.shared.data(for: req),
              let j = (try? JSONSerialization.jsonObject(with: result.0)) as? [String: Any] else { return .unset }
        if j["none"] as? Bool == true { return j["classic"] as? Bool == true ? .classic : .unset }
        return .modern
    }

    static func isRoom(_ s: String) -> Bool { s.count == 6 && s.allSatisfy { $0.isLetter || $0.isNumber } }
}

// The last Table this phone played, so the start screen can offer it again while it's open (48 hours, as on the website)
enum Recent {
    private static let roomKey = "recent.room", atKey = "recent.at"
    static let hours: Double = 48

    static var room: String? {
        let d = UserDefaults.standard
        guard let r = d.string(forKey: roomKey), Date().timeIntervalSince1970 - d.double(forKey: atKey) < hours * 3600 else { return nil }
        return r
    }
    static func remember(_ room: String) {
        let d = UserDefaults.standard
        if d.string(forKey: roomKey) != room { d.set(Date().timeIntervalSince1970, forKey: atKey) }
        d.set(room, forKey: roomKey)
    }
}
