import Foundation

// The game's server: the same Worker and the same calls as the website (worker/src/index.js). Production unless a
// Debug build is launched with -server URL (the CI's local Worker).
enum Server {
    static let production = URL(string: "https://thebetrayal.co.uk")!
    static var base: URL = {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-server"), i + 1 < args.count, let u = URL(string: args[i + 1]) { return u }
        #endif
        return production
    }()
    // what the TV and the lobby tell guests to type
    static var site: String {
        guard let host = base.host else { return "thebetrayal.co.uk" }
        if let port = base.port { return "\(host):\(port)" }
        return host
    }
    static func joinURL(_ room: String) -> String { base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/m/" + room }

    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.urlCache = nil
        c.timeoutIntervalForRequest = 15
        c.httpCookieStorage = .shared // the staging site's password cookie, if one is ever set
        return URLSession(configuration: c)
    }()
}

struct Reply {
    let status: Int
    let json: JSON
    var ok: Bool { (200..<300).contains(status) }
    var error: String? { json["error"].string }
}

struct Offline: Error {}

enum API {
    // POST with a body, GET without. X-Tok says which player this phone is.
    static func call(_ path: String, body: [String: Any]? = nil, token: String? = nil) async throws -> Reply {
        guard let url = URL(string: path, relativeTo: Server.base) else { throw Offline() }
        var req = URLRequest(url: url)
        req.httpMethod = body == nil ? "GET" : "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue(token, forHTTPHeaderField: "X-Tok") }
        if let body { req.httpBody = JSON.encode(body) }
        let result: (Data, URLResponse)
        do { result = try await Server.session.data(for: req) } catch { throw Offline() }
        let (data, resp) = result
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSON(data: data)) ?? .object(["error": .string("The server didn’t answer properly.")])
        return Reply(status: status, json: json)
    }

    static func room(_ room: String, _ path: String, body: [String: Any]? = nil, token: String? = nil) async throws -> Reply {
        try await call("/api/g/" + room + "/" + path, body: body, token: token)
    }

    // the home page's calls (site/index.html): a booking code opens its Table, and a Table says which way it plays
    struct Opened { let room: String; let test: Bool; let sub: Bool; let again: Bool }
    enum Mode { case unset, modern, classic }

    static func open(pass: String, fresh: Bool) async throws -> Opened {
        let r: Reply
        do { r = try await call("/api/games", body: ["pass": pass, "fresh": fresh]) } catch { throw Failure("Can’t reach the server. Check you’re online.") }
        guard r.ok, let room = r.json["room"].string else { throw Failure(r.error ?? "That didn’t work. Try again.") }
        return Opened(room: room, test: r.json["test"].bool ?? false, sub: r.json["sub"].bool ?? false, again: r.json["again"].bool ?? false)
    }

    static func mode(of room: String) async -> Mode {
        guard let r = try? await self.room(room, "m") else { return .unset }
        if r.json["none"].bool == true { return r.json["classic"].bool == true ? .classic : .unset }
        return r.json["view"].isNull ? .unset : .modern
    }
}

struct Failure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum Codes {
    // six letters and numbers (worker/src/codes.js leaves out 0, O, 1, I and L, but a mistyped code just isn't found)
    static func isRoom(_ s: String) -> Bool { s.count == 6 && s.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) } }
    static func clean(_ s: String) -> String { String(s.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(6)) }
}
