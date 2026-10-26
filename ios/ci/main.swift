// The app's model against every recorded moment of a game (ios/TheBetrayal/Debug/Fixtures.json, from the real rules
// engine), and its SVG reader against every drawing. Built and run by .github/workflows/ios-native.yml:
//   swiftc ios/TheBetrayal/Model/{JSON,Snapshot,Logic}.swift ios/TheBetrayal/UI/Art.swift ios/ci/main.swift -o decode
//   ./decode ios/TheBetrayal/Debug/Fixtures.json
import Foundation
import CoreGraphics

var failures = 0
func check(_ ok: Bool, _ what: @autoclosure () -> String) { if !ok { failures += 1; print("FAIL", what()) } }

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "ios/TheBetrayal/Debug/Fixtures.json"
let all = try JSON(data: Data(contentsOf: URL(fileURLWithPath: path))).object
check(all.count > 100, "only \(all.count) moments")
var phases = Set<String>(), kinds = Set<String>()
for (name, f) in all.sorted(by: { $0.key < $1.key }) {
    for side in ["phone", "tv"] where !f[side].isNull {
        guard let v = Snapshot(f[side]) else { check(false, "\(name) \(side): no view"); continue }
        phases.insert(v.phase)
        check(!v.players.isEmpty, "\(name) \(side): no players")
        check(v.players.allSatisfy { !$0.id.isEmpty && $0.name != "?" }, "\(name) \(side): a player without an id or name")
        if side == "phone" { check(v.me != nil, "\(name): the phone has no me") } else { check(v.me == nil, "\(name): the TV was sent a me") }
        if side == "tv" { check(v.players.allSatisfy { $0.role == nil } || ["end", "unmask", "reveal", "day", "dawn", "trust", "honour", "vote", "talk", "night", "trial"].contains(v.phase), "\(name): the TV sees a role in \(v.phase)") }
        if let it = v.trial?.item { kinds.insert(it.k); check(!it.k.isEmpty, "\(name) \(side): an item without a kind") }
        if v.phase == "trial" { check(v.trial != nil, "\(name) \(side): a Trial without its trial") }
        if v.phase == "vote" { check(v.vote != nil, "\(name) \(side): a vote without its vote") }
        if v.phase == "reveal" { check(v.reveal != nil, "\(name) \(side): a reveal without its reveal") }
        if v.phase == "end" { check(v.result.map { !$0.awards.isEmpty } ?? false, "\(name) \(side): an end without awards") }
        _ = v.needsMe; _ = v.owedEnd; _ = v.cueSound; _ = v.mainClock(tv: side == "tv"); _ = v.screenKey
    }
}
// a few moments, field by field
func phone(_ n: String) -> Snapshot { Snapshot(all[n]!["phone"])! }
check(phone("night-forsworn-picked").me?.whispers?.count == 2, "whispers")
check(phone("night-forsworn").me?.targets.isEmpty == false, "the Forsworn's targets")
check(phone("quiz-reveal-host").trial?.item?.wrong.isEmpty == false, "the host's near misses")
check(phone("rps-reveal").trial?.item?.res.bouts.isEmpty == false, "the bouts")
check(phone("word-reveal").trial?.item?.res.words.isEmpty == false, "the words")
check(phone("likely-reveal").trial?.item?.res.counts.isEmpty == false, "Most Likely To's counts")
check(phone("vote-tie").vote?.revote?.count == 2, "the revote")
check(phone("reveal-words").reveal?.words != nil, "last words")
check(phone("reveal-exiled").me?.words == "", "the exile may speak")
check(phone("dawn-revealed").dawn?.likely.isEmpty == false, "the epitaph")
check(phone("end-host").result?.awards.isEmpty == false, "the awards")
check(phone("cast-done-winner").me?.gave == "cast", "the Casting Vote's winner")
check(phone("trial-done").trial?.scores.isEmpty == false, "a Trial's scores")
check(phone("snap-open").trial?.item?.snapSymbol(phone("snap-open").trial?.item?.snapIndex(at: phone("snap-open").now)) != nil, "Snap's symbol")
check(phone("lobby-host-set").opts?.prizes.count == 2, "the prize tiers")
check(Words.andList(["A", "B", "C"]) == "A, B and C", "andList")
check(Words.clock(75) == "1:15" && Words.clock(9) == "9s", "the clock")
check(JSON.number(150).text == "150" && JSON.number(2.5).text == "2.5", "numbers as text")
for p in ["lobby", "oath", "roles", "day", "trial", "break", "talk", "vote", "reveal", "night", "dawn", "trust", "unmask", "honour", "end"] { check(phases.contains(p), "no moment in \(p)") }
for k in ["text", "number", "hilo", "vote", "word", "recall", "cell", "snap", "rps", "survive", "actor", "truths", "tempt"] { check(kinds.contains(k), "no item of kind \(k)") }

// the drawings: every icon parses to something inside its 64-unit box, and the crest inside 120 × 140
for (name, svg) in Art.icons {
    let parts = Art.parts(svg)
    check(!parts.isEmpty, "icon \(name): nothing")
    for p in parts { let b = p.path.boundingBox; check(!b.isNull && b.minX >= -1 && b.minY >= -1 && b.maxX <= 65 && b.maxY <= 65, "icon \(name): out of its box \(b)") }
}
check(Art.crestParts.count == 12, "the crest has \(Art.crestParts.count) parts")
for p in Art.crestParts { let b = p.path.boundingBox; check(b.minX >= 4 && b.maxX <= 116 && b.minY >= 4 && b.maxY <= 136, "the crest: out of its box \(b)") }
// the moon's two arcs, against the SVG spec's own arithmetic (circles centred at 36.83, 31.23 and 53.23, 25.34)
let moon = SVGPath.cgPath("M43 7a25 25 0 1 0 14 39A21 21 0 0 1 43 7z").boundingBoxOfPath
check(abs(moon.minX - 11.83) < 0.3 && abs(moon.minY - 6.23) < 0.3 && abs(moon.maxX - 57) < 0.3 && abs(moon.maxY - 56.23) < 0.3, "the moon's arcs: \(moon)")
check(Art.blob.boundingBox.width > 80 && Art.blob.boundingBox.width < 100, "the wax")

print("\(all.count) moments, \(phases.count) phases, \(kinds.count) kinds of item; \(failures) failures")
exit(failures == 0 ? 0 : 1)
