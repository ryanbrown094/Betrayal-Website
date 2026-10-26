import Foundation

// The page's small rules about a view (src/modern-ui.js), kept apart from the screens so the CI can check them.
extension Snapshot {
    // what needs this player now: a new key buzzes the phone once (needsMe in modern-ui.js)
    var needsMe: String {
        guard let me, paused == nil, !me.left else { return "" }
        let t = trial, it = t?.item
        if phase == "roles" && !me.acked { return "roles" }
        if me.victim { return "victim" }
        if !me.alive { return "" }
        if let t, t.stage == "intro" { return "trial\(round)\(t.key)" }
        if let it, let t, it.stage == "prep", it.k == "truths", it.teller == me.id { return "turn\(t.i)" }
        if let it, let t, it.stage == "open", it.k == "actor", it.actor == me.id { return "turn\(t.i)" }
        if phase == "vote", let v = vote { return "vote\(round)" + (v.second ? "b" : "") + (v.tie ? "t" : "") }
        if phase == "night" { return "night\(round)" }
        if phase == "trust" { return "trust\(round)" }
        if phase == "honour" && me.forsworn { return "honour" }
        return ""
    }

    // the clock this phone still owes an answer against, or nil (owedEnd)
    var owedEnd: Double? {
        guard let me, me.alive, paused == nil else { return nil }
        if let it = trial?.item, it.stage == "open", it.mine == nil,
           ["text", "number", "hilo", "vote", "word", "recall", "cell", "tempt"].contains(it.k) || (it.k == "rps" && it.vs != nil) || (it.k == "truths" && it.teller != me.id) {
            return it.end
        }
        if phase == "vote", let v = vote, v.mine == nil { return v.voteEnd }
        if phase == "night", let n = night, !n.done { return n.end }
        return nil
    }

    // the score's scene for this moment (sceneOf)
    var scene: String {
        ["lobby": "lobby", "oath": "lobby", "roles": "lobby", "day": "day", "trial": "mission", "break": "mingle", "talk": "table", "vote": "table",
         "reveal": "table", "trust": "table", "night": "night", "dawn": "morning", "unmask": "final", "honour": "final", "end": "final"][phase] ?? "day"
    }

    // the sound a new moment gets, once (cue)
    var cueKey: String {
        phase + (trial.map { $0.stage + ($0.item?.stage ?? "") } ?? "") + (reveal?.role != nil ? "r" : "") + (dawn?.revealed == true ? "d" : "")
    }
    var cueSound: [String] {
        if phase == "trial", let t = trial {
            if t.stage == "intro" { return ["drum"] }
            if t.item?.stage == "reveal" { return ["chime"] }
            if t.stage == "done" { return ["gold"] }
            return []
        }
        switch phase {
        case "talk", "vote": return ["beat"]
        case "reveal": return [reveal?.role != nil ? "reveal" : "seal"]
        case "night": return ["snuff"]
        case "dawn": return dawn?.revealed == true ? (dawn?.victims.isEmpty == false ? ["dawn", "poison"] : ["dawn"]) : []
        case "end": return ["win"]
        default: return []
        }
    }

    // the first clock on the screen, which ticks in its last five seconds (tickSound)
    func mainClock(tv: Bool) -> Double? {
        switch phase {
        case "trial":
            guard let t = trial else { return nil }
            if t.stage == "intro" { return t.introEnd }
            guard let it = t.item, it.stage != "reveal" else { return nil }
            if tv { return ["snap", "survive"].contains(it.k) || (it.k == "cell" && it.grid == nil) ? nil : it.end }
            return ["open", "study", "prep"].contains(it.stage) ? it.end : nil
        case "break": return brk?.end
        case "talk": return vote?.talkEnd
        case "vote": return vote?.voteEnd
        case "reveal": return tv || reveal?.role != nil || reveal?.secret == true ? nil : reveal?.roleAt
        case "dawn": return dawn?.revealed == true ? dawn?.lastEnd : nil
        case "trust": return trust?.result == nil ? trust?.end : nil
        case "honour": return honour?.end
        default: return nil
        }
    }
}

enum Words {
    static func andList(_ a: [String]) -> String {
        a.count < 2 ? a.joined() : a.dropLast().joined(separator: ", ") + " and " + a[a.count - 1]
    }
    static func plural(_ n: Int, _ w: String, _ ws: String? = nil) -> String { "\(n) " + (n == 1 ? w : ws ?? w + "s") }
    // the prize at the end: with the default prize, the Purse in chocolate coins (one per 100 points)
    static func prize(_ r: GameResult) -> String {
        guard let c = r.coins else { return r.prize }
        return c > 0 ? plural(c, "chocolate coin") : r.forsworn ? "The glory, not the coins" : "No chocolate coins"
    }
    // a name never breaks across lines
    static func nb(_ s: String) -> String { s.replacingOccurrences(of: " ", with: "\u{00A0}") }
    // "+150" or "−50", as the Trial's result shows the Purse moving
    static func signed(_ n: Int) -> String { n >= 0 ? "+\(n)" : "−\(-n)" }
    static func clock(_ seconds: Int) -> String { seconds >= 60 ? "\(seconds / 60):" + String(format: "%02d", seconds % 60) : "\(seconds)s" }
}
