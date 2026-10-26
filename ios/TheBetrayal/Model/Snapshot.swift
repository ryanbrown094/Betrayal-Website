import Foundation

// What one phone (or the TV) may see of a Modern game: viewFor() in worker/src/modern.js, as typed values.
// Times are the server's milliseconds since 1970. Roles are "f" (the Forsworn) and "l" (the Loyal).
struct Snapshot {
    let raw: JSON
    let test: Bool
    let ver: Int
    let now: Double
    let phase: String
    let round: Int
    let final: Bool
    let pot: Int
    let potCap: Int
    let title: String?
    let tiers: Bool
    let director: Director?
    let players: [Player]
    let paused: Double?
    let brk: Break?
    let roundTrials: Int
    let opts: Opts?
    let next: String?
    let trial: Trial?
    let vote: Vote?
    let reveal: Reveal?
    let night: Night?
    let dawn: Dawn?
    let trust: Trust?
    let unmask: Unmask?
    let honour: Honour?
    let result: GameResult?
    let me: Me?

    init?(_ j: JSON) {
        guard let phase = j["phase"].string else { return nil }
        raw = j
        test = j["test"].bool ?? false
        ver = j["ver"].int ?? 0
        now = j["now"].double ?? Date().timeIntervalSince1970 * 1000
        self.phase = phase
        round = j["round"].int ?? 0
        final = j["final"].bool ?? false
        pot = j["pot"].int ?? 0
        potCap = j["potCap"].int ?? 2000
        title = j["title"].string
        tiers = j["tiers"].bool ?? false
        director = j["director"].isNull ? nil : Director(id: j["director"]["id"].string ?? "", name: j["director"]["name"].string ?? "the host")
        players = j["players"].array.map(Player.init)
        paused = j["paused"].double
        brk = j["brk"].isNull ? nil : Break(j["brk"])
        roundTrials = j["roundTrials"].int ?? 0
        opts = j["opts"].isNull ? nil : Opts(j["opts"])
        next = j["next"].string
        trial = j["trial"].isNull ? nil : Trial(j["trial"])
        vote = j["vote"].isNull ? nil : Vote(j["vote"])
        reveal = j["reveal"].isNull ? nil : Reveal(j["reveal"])
        night = j["night"].isNull ? nil : Night(j["night"])
        dawn = j["dawn"].isNull ? nil : Dawn(j["dawn"])
        trust = j["trust"].isNull ? nil : Trust(j["trust"])
        unmask = j["unmask"].isNull ? nil : Unmask(j["unmask"])
        honour = j["honour"].isNull ? nil : Honour(j["honour"])
        result = j["result"].isNull ? nil : GameResult(j["result"])
        me = j["me"].isNull ? nil : Me(j["me"])
    }

    func player(_ id: String?) -> Player { players.first { $0.id == id } ?? .unknown }
    func name(_ id: String?) -> String { player(id).name }
    var alive: [Player] { players.filter(\.alive) }
    // a table with long names gets one column of buttons, so no name is broken mid-word
    var longNames: Bool { players.contains { $0.name.count > 11 } }
    // the screen as a whole: a new key fades a new screen in, and the same key with a new count or clock doesn't
    var screenKey: String {
        guard let t = trial else { return phase + "." }
        return phase + "." + t.stage + String(t.i) + (t.item?.stage ?? "")
    }
}

struct Director { let id: String; let name: String }

struct Player: Identifiable, Hashable {
    let id: String
    let name: String
    let color: String
    let bot: Bool
    let alive: Bool
    let role: String?
    let shield: Bool
    let optedIn: Bool
    let acked: Bool

    init(_ j: JSON) {
        id = j["id"].string ?? ""
        name = j["name"].string ?? "?"
        color = j["color"].string ?? "#ae6249"
        bot = j["bot"].bool ?? false
        alive = j["alive"].bool ?? false
        role = j["role"].string
        shield = j["shield"].bool ?? false
        optedIn = j["optedIn"].bool ?? false
        acked = j["acked"].bool ?? false
    }

    init(id: String, name: String, color: String = "#ae6249", alive: Bool = true, role: String? = nil) {
        self.id = id; self.name = name; self.color = color; self.alive = alive; self.role = role
        bot = false; shield = false; optedIn = false; acked = false
    }

    static let unknown = Player(id: "", name: "?")
    var forsworn: Bool { role == "f" }
}

struct Break {
    let kind: String
    let name: String
    let end: Double?
    init(_ j: JSON) { kind = j["kind"].string ?? ""; name = j["name"].string ?? "A break"; end = j["end"].double }
}

struct PrizeTier { let at: Double; let what: String }

struct Opts {
    let shield: String
    let twists: Bool
    let courses: Bool
    let prize: String?
    let coins: Bool
    let prizes: [PrizeTier]
    let title: String?
    init(_ j: JSON) {
        shield = j["shield"].string ?? "secret"
        twists = j["twists"].bool ?? true
        courses = j["courses"].bool ?? false
        prize = j["prize"].string
        coins = j["coins"].bool ?? false
        prizes = j["prizes"].array.map { PrizeTier(at: $0["at"].double ?? 0.5, what: $0["what"].string ?? "") }
        title = j["title"].string
    }
    func tier(_ at: Double) -> String { prizes.first { $0.at == at }?.what ?? "" }
}

struct Trial {
    let key: String
    let title: String
    let rules: String
    let stage: String
    let introEnd: Double?
    let i: Int
    let prize: Bool
    let offer: Int
    let scores: [String: Int]
    let winners: [String]
    let points: Int
    let sanctPublic: String?
    let wrongF: Int
    let special: String?
    let byLot: Bool
    let gave: String?
    let item: Item?
    let last: ItemResult?

    init(_ j: JSON) {
        key = j["key"].string ?? ""
        title = j["title"].string ?? "A Trial"
        rules = j["rules"].string ?? ""
        stage = j["stage"].string ?? "intro"
        introEnd = j["introEnd"].double
        i = j["i"].int ?? 0
        prize = j["prize"].bool ?? false
        offer = j["offer"].int ?? 0
        scores = j["scores"].object.compactMapValues(\.int)
        winners = j["winners"].strings
        points = j["points"].int ?? 0
        sanctPublic = j["sanctPublic"].string
        wrongF = j["wrongF"].int ?? 0
        special = j["special"].string
        byLot = j["byLot"].bool ?? false
        gave = j["gave"].string
        item = j["item"].isNull ? nil : Item(j["item"])
        last = j["last"].isNull ? nil : ItemResult(j["last"])
    }
}

// one item of a Trial: a question, a turn, a bout
struct Item {
    let raw: JSON
    let k: String
    let stage: String
    let end: Double?
    let from: Double?
    let who: [String]
    let q: String?
    let part: String?
    let ref: String?
    let letters: String?
    let answered: Int
    let of: Int
    let words: [String]
    let grid: [String]?
    let changed: [Int]
    let seq: [Int]
    let start: Double?
    let step: Double?
    let syms: [String]
    let pairs: [[String]]
    let bye: String?
    let out: [String]
    let actor: String?
    let teller: String?
    let a: String?
    let res: ItemResult
    let mine: String?
    let myTaps: Int
    let word: String?
    let skips: Int
    let lie: Int?
    let vs: String?
    let wrong: [(id: String, text: String)]

    init(_ j: JSON) {
        raw = j
        k = j["k"].string ?? ""
        stage = j["stage"].string ?? "open"
        end = j["end"].double
        from = j["from"].double
        who = j["who"].strings
        q = j["q"].string
        part = j["part"].string
        ref = j["ref"].text
        letters = j["letters"].string
        answered = j["answered"].int ?? 0
        of = j["of"].int ?? 0
        words = j["words"].strings
        grid = j["grid"].isNull ? nil : j["grid"].strings
        changed = j["changed"].array.compactMap(\.int)
        seq = j["seq"].array.compactMap(\.int)
        start = j["start"].double
        step = j["step"].double
        syms = j["syms"].strings
        pairs = j["pairs"].array.map(\.strings)
        bye = j["bye"].string
        out = j["out"].strings
        actor = j["actor"].string
        teller = j["teller"].string
        a = j["a"].text
        res = ItemResult(j["res"])
        mine = j["mine"].text
        myTaps = j["myTaps"].int ?? 0
        word = j["word"].string
        skips = j["skips"].int ?? 0
        lie = j["lie"].int
        vs = j["vs"].string
        wrong = j["wrong"].array.compactMap { p in p[0].string.map { (id: $0, text: p[1].text ?? "") } }
    }

    var isOpenish: Bool { ["open", "study", "prep", "blank"].contains(stage) }

    // Snap: the symbol on show at a moment of the game's clock, and the one before it
    func snapIndex(at t: Double) -> Int? {
        guard let start, let step, step > 0 else { return nil }
        let i = Int(floor((t - start) / step))
        return i < 0 ? nil : i
    }
    func snapSymbol(_ i: Int?) -> String? {
        guard let i, i >= 0, !seq.isEmpty else { return nil }
        let n = seq[min(i, seq.count - 1)]
        return n >= 0 && n < syms.count ? syms[n] : nil
    }
}

// what an item came to: each kind fills in its own fields
struct ItemResult {
    let raw: JSON
    init(_ j: JSON) { raw = j }
    var right: [String] { raw["right"].strings }
    var first: String? { raw["first"].string }
    var closest: [String] { raw["closest"].strings }
    var truth: String? { raw["truth"].string }
    var top: [String] { raw["top"].strings }
    // Most Likely To: [[id, votes]] (Memory Wall keeps a map under the same name, which nothing shows)
    var counts: [(id: String, n: Int)] { raw["counts"].array.compactMap { p in p[0].string.map { (id: $0, n: p[1].int ?? 0) } } }
    var words: [(id: String, word: String, ok: Bool)] { raw["words"].array.compactMap { p in p[0].string.map { (id: $0, word: p[1].text ?? "", ok: p[2].bool ?? false) } } }
    var hits: [String] { raw["hits"].strings }
    // Rock Paper Scissors: [a, a's throw, b, b's throw, winner or null]
    var bouts: [(a: String, x: String, b: String, y: String, w: String?)] {
        raw["bouts"].array.compactMap { p in
            guard let a = p[0].string, let b = p[2].string else { return nil }
            return (a: a, x: p[1].string ?? "", b: b, y: p[3].string ?? "", w: p[4].string)
        }
    }
    var still: [String] { raw["still"].strings }
    var word: String? { raw["word"].string }
    var guess: String? { raw["guess"].string }
    var actor: String? { raw["actor"].string }
    var lie: Int? { raw["lie"].int }
    var teller: String? { raw["teller"].string }
    var fooled: Int { raw["fooled"].int ?? 0 }
    var selfCount: Int { raw["self"].int ?? 0 }
    var pts: [String: Int] { raw["pts"].object.compactMapValues(\.int) }
}

struct Vote {
    let stage: String
    let talkEnd: Double?
    let voteEnd: Double?
    let revote: [String]?
    let tie: Bool
    let voted: Int
    let of: Int
    let second: Bool
    let mine: String?
    let immune: String?
    init(_ j: JSON) {
        stage = j["stage"].string ?? "talk"
        talkEnd = j["talkEnd"].double
        voteEnd = j["voteEnd"].double
        revote = j["revote"].isNull ? nil : j["revote"].strings
        tie = j["tie"].bool ?? false
        voted = j["voted"].int ?? 0
        of = j["of"].int ?? 0
        second = j["second"].bool ?? false
        mine = j["mine"].string
        immune = j["immune"].string
    }
}

struct Reveal {
    let id: String
    let name: String
    let counts: [(id: String, n: Int)]
    let byLot: Bool
    let cast: Bool
    let roleAt: Double?
    let role: String?
    let called: [String]
    let secret: Bool
    let words: String?
    init(_ j: JSON) {
        id = j["id"].string ?? ""
        name = j["name"].string ?? "?"
        counts = j["counts"].array.compactMap { p in p[0].string.map { (id: $0, n: p[1].int ?? 0) } }
        byLot = j["byLot"].bool ?? false
        cast = j["cast"].bool ?? false
        roleAt = j["roleAt"].double
        role = j["role"].string
        called = j["called"].strings
        secret = j["secret"].bool ?? false
        words = j["words"].string
    }
}

struct Night {
    let end: Double?
    let kills: Int
    let done: Bool
    init(_ j: JSON) { end = j["end"].double; kills = j["kills"].int ?? 1; done = j["done"].bool ?? false }
}

struct Dawn {
    let revealed: Bool
    let victims: [String]
    let saved: Int
    let lastEnd: Double?
    let likely: [(name: String, q: String)]
    init(_ j: JSON) {
        revealed = j["revealed"].bool ?? false
        victims = j["victims"].strings
        saved = j["saved"].int ?? 0
        lastEnd = j["lastEnd"].double
        likely = j["likely"].array.compactMap { p in p[0].string.map { (name: $0, q: p[1].string ?? "") } }
    }
}

struct Trust {
    let end: Double?
    let voted: Int
    let of: Int
    let result: String?
    let count: Int
    let mine: String?
    init(_ j: JSON) {
        end = j["end"].double; voted = j["voted"].int ?? 0; of = j["of"].int ?? 0
        result = j["result"].string; count = j["count"].int ?? 0; mine = j["mine"].string
    }
}

struct Unmask {
    let order: [String]
    let shown: Int
    init(_ j: JSON) { order = j["order"].strings; shown = j["shown"].int ?? 0 }
}

struct Honour {
    let end: Double?
    let made: Int
    let of: Int
    let mine: String?
    init(_ j: JSON) { end = j["end"].double; made = j["made"].int ?? 0; of = j["of"].int ?? 0; mine = j["mine"].string }
}

struct Award { let title: String; let id: String; let name: String; let why: String }

struct GameResult {
    let winner: String
    let prize: String
    let tier: Double
    let to: [String]
    let how: String?
    let pot: Int
    let won: Int
    let coins: Int?
    let cap: Int
    let awards: [Award]
    let peeked: [Int]
    init(_ j: JSON) {
        winner = j["winner"].string ?? "loyal"
        prize = j["prize"].string ?? ""
        tier = j["tier"].double ?? 0
        to = j["to"].strings
        how = j["how"].string
        pot = j["pot"].int ?? 0
        won = j["won"].int ?? 0
        coins = j["coins"].int
        cap = j["cap"].int ?? 2000
        awards = j["awards"].array.map { Award(title: $0["title"].string ?? "", id: $0["id"].string ?? "", name: $0["name"].string ?? "", why: $0["why"].string ?? "") }
        peeked = j["peeked"].array.compactMap(\.int)
    }
    var forsworn: Bool { winner == "forsworn" }
}

struct Ally { let name: String; let alive: Bool }
// the Forsworn's choices tonight, by name (only the Forsworn are sent them)
struct Picks { let name: String; let picks: [String] }

struct Me {
    let id: String
    let name: String
    let left: Bool
    let alive: Bool
    let director: Bool
    let role: String?
    let optIn: String?
    let acked: Bool
    let shield: Bool
    let allies: [Ally]?
    let targets: [String]
    let picks: [Picks]
    let mine: [String]
    let sanct: [String]
    let victim: Bool
    let words: String?
    let whispers: [(name: String, text: String)]?
    let whisperSay: [String]
    let wonSanct: String?
    let won: Bool
    let cast: Bool
    let crown: Bool
    let confess: String?
    let gave: String?
    let canSkip: Bool

    init(_ j: JSON) {
        id = j["id"].string ?? ""
        name = j["name"].string ?? "?"
        left = j["left"].bool ?? false
        alive = j["alive"].bool ?? false
        director = j["director"].bool ?? false
        role = j["role"].string
        optIn = j["optIn"].string
        acked = j["acked"].bool ?? false
        shield = j["shield"].bool ?? false
        allies = j["allies"].isNull ? nil : j["allies"].array.map { Ally(name: $0["name"].string ?? "", alive: $0["alive"].bool ?? false) }
        targets = j["targets"].strings
        picks = j["picks"].object.map { Picks(name: $0.key, picks: $0.value.strings) }.sorted { $0.name < $1.name }
        mine = j["mine"].strings
        sanct = j["sanct"].strings
        victim = j["victim"].bool ?? false
        words = j["words"].string
        whispers = j["whispers"].isNull ? nil : j["whispers"].array.map { (name: $0[0].string ?? "", text: $0[1].string ?? "") }
        whisperSay = j["whisperSay"].strings
        wonSanct = j["wonSanct"].string
        won = j["won"].bool ?? false
        cast = j["cast"].bool ?? false
        crown = j["crown"].bool ?? false
        confess = j["confess"].string
        gave = j["gave"].string
        canSkip = j["canSkip"].bool ?? false
    }
    var forsworn: Bool { role == "f" }
}

// a phone asking the host to let it back in (only the host's phone is told)
struct Rejoin: Identifiable { let id: String; let name: String }
// the host's last resort: every role, in the one reply that asked
struct Peek: Identifiable { let id = UUID(); let name: String; let role: String?; let alive: Bool }
