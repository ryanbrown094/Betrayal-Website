import SwiftUI

// A Trial on a phone (trial(), itemPlay(), itemReveal() and trialDone() in src/modern-ui.js)
struct TrialView: View {
    let v: Snapshot
    let me: Me
    var body: some View {
        if let t = v.trial {
            if t.stage == "intro" { intro(t) }
            else if t.stage == "done" { TrialDone(v: v, me: me, t: t) }
            else if let it = t.item { item(t, it) }
        }
    }

    @ViewBuilder private func intro(_ t: Trial) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("trial" + TrialView.prizeLine(t))
            H1(t.title)
            Para(t.rules)
            if me.forsworn && t.key != "tempt" && t.key != "likely" {
                Banner(.plain, "Forsworn: every wrong answer costs the Purse 50, and if you win you take every point it falls short, so sabotage quietly.")
            }
            HStack(spacing: 6) { Text("Starts in").font(Theme.ui(18)).foregroundStyle(Theme.tallow2); Clock(end: t.introEnd) }
        }
    }

    static func prizeLine(_ t: Trial) -> String {
        switch t.special {
        case "cast": return " · the Casting Vote to the winner"
        case "crown": return " · the Crown to the winner"
        case "secret": return " · a special prize"
        default: return t.prize ? " · Sanctuary to the winner" : ""
        }
    }

    @ViewBuilder private func item(_ t: Trial, _ it: Item) -> some View {
        let n = it.stage == "reveal" ? t.i : t.i + 1
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Eyebrow(t.title + " · " + (it.part.map { $0 + " · " } ?? "") + "\(n)")
                Spacer()
                if ["open", "study", "prep"].contains(it.stage) { Clock(end: it.end) }
            }
            if it.isOpenish, let end = it.end, let from = it.from { TimeBar(from: from, end: end).padding(.top, 8).padding(.bottom, 14) }
            if !me.alive && it.k == "survive" && t.key == "statue" && it.stage == "open" {
                Question("You’re a Ghost, so haunt them.")
                Sub("Make the statues move or laugh, anything short of touching. Still standing: " + Words.andList(v.alive.filter { !it.out.contains($0.id) }.map(\.name)) + ".")
            } else if it.stage == "reveal" {
                ItemReveal(v: v, me: me, t: t, x: it)
            } else if !me.alive && !(it.k == "survive" && t.key == "statue") {
                GhostItem(v: v, x: it)
            } else {
                ItemPlay(v: v, me: me, t: t, x: it).id("\(t.key)\(t.i)")
            }
        }
    }
}

// "Locked in", with how many have answered (sent())
struct Sent: View {
    let x: Item
    var value: String? = nil
    var body: some View {
        DoneLine("handshake", Text("Locked in") + (value.map { $0.isEmpty ? Text("") : Text(": ") + b($0) } ?? Text("")) + Text(".\n")
                 + Text("\(x.answered) of \(x.of > 0 ? String(x.of) : "?") in").font(Theme.ui(15)))
    }
}

// a typed answer and its button (form())
struct AnswerForm: View {
    let placeholder: String
    var number = false
    var label = "Send"
    var multiline = false
    var initial = ""
    @Environment(Session.self) private var session
    @State private var text = ""
    @FocusState private var focused: Bool
    var body: some View {
        VStack(spacing: 10) {
            if multiline {
                TextEditor(text: $text)
                    .font(Theme.ui(18)).foregroundStyle(Theme.tallow).scrollContentBackground(.hidden)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(8).frame(minHeight: 150)
                    .background(RoundedRectangle(cornerRadius: 4).fill(Theme.field))
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(focused ? Theme.brass2 : Theme.edge, lineWidth: focused ? 2 : 1))
                    .focused($focused)
            } else {
                Field(placeholder: placeholder, text: $text, number: number, submit: send).focused($focused)
            }
            Button(label, action: send).btn(.fill, .big)
        }
        .onAppear { text = initial }
    }
    private func send() {
        let v = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { return session.say("Type an answer first.", error: true) }
        if !multiline { text = "" }
        session.act("ans", v)
    }
}

struct ItemPlay: View {
    let v: Snapshot
    let me: Me
    let t: Trial
    let x: Item
    @Environment(Session.self) private var session

    var body: some View {
        switch x.k {
        case "text":
            Question(x.q ?? "")
            if let m = x.mine { Sent(x: x, value: m) } else { AnswerForm(placeholder: "Your answer") }
        case "number":
            Question(x.q ?? "")
            if let m = x.mine { Sent(x: x, value: m) } else { AnswerForm(placeholder: "A number", number: true, label: "Guess") }
        case "hilo":
            Question(x.q ?? "")
            Para(Text("Is it higher or lower than ") + Text(x.ref ?? "").font(Theme.book(30)).foregroundColor(Theme.brass2) + Text("?"))
            if let m = x.mine, !m.isEmpty { Sent(x: x, value: m) } else {
                Columns(2) {
                    Button("Higher") { session.act("ans", "higher") }.btn(.fill, .big)
                    Button("Lower") { session.act("ans", "lower") }.btn(.fill, .big)
                }
            }
        case "vote":
            Question(x.q ?? "")
            if let m = x.mine, !m.isEmpty { Sent(x: x, value: v.name(m)) } else { PickGrid(list: v.alive) { p in session.act("ans", p.id) } }
        case "word":
            Sub("The longest real word from these letters. You can change it until time’s up.")
            Letters(letters: x.letters ?? "")
            if let m = x.mine, !m.isEmpty {
                DoneLine("scroll", Text("Your word: ") + b(m.uppercased()))
                Spacer().frame(height: 10)
            }
            AnswerForm(placeholder: "Your word", label: (x.mine ?? "").isEmpty ? "Send" : "Change it")
        case "recall":
            if x.stage == "study" {
                Sub("Remember these. They vanish in a moment.")
                WordWall(words: x.words)
            } else {
                Sub("Type every word you remember, separated by commas or new lines. You can send again to add more.")
                AnswerForm(placeholder: "", label: (x.mine ?? "").isEmpty ? "Send my list" : "Update my list", multiline: true, initial: x.mine ?? "")
            }
        case "cell":
            if x.stage == "study" { Sub("Study the grid."); Cells(grid: x.grid ?? []) }
            else if x.stage == "blank" { Sub("Something is changing…"); Cells(grid: [], blank: true) }
            else {
                Sub("Tap what changed. The first right answer scores double.")
                if let m = x.mine, let i = Int(m) { Cells(grid: x.grid ?? [], mine: i); Spacer().frame(height: 12); Sent(x: x) }
                else { Cells(grid: x.grid ?? [], tap: { i in session.act("ans", String(i)) }) }
            }
        case "snap": SnapPlay(x: x)
        case "rps":
            if let vs = x.vs {
                Question("You vs " + v.name(vs))
                if let m = x.mine, !m.isEmpty { Sent(x: x, value: m) } else {
                    Columns(3) {
                        ForEach(["rock", "paper", "scissors"], id: \.self) { r in Button(r.capitalized) { session.act("ans", r) }.btn(.fill, .big) }
                    }
                }
            } else if x.bye == me.id { Question("You have a bye this bout."); Sub("Sit this one out.") }
            else { Question("You’re out."); Sub("Watch the rest battle it out.") }
        case "survive":
            let out = x.out.contains(me.id)
            let still = v.alive.filter { !x.out.contains($0.id) }
            Question(t.key == "statue" ? "Freeze." : "On one leg.")
            Sub(out ? "You’re out. Watch the rest." : "Last one standing wins. If you’re out, tap it honestly.")
            if !out { Button("I’m out") { session.send(["a": "out"]) }.btn(.blood, .big).padding(.bottom, 12) }
            Small("Still in: " + still.map(\.name).joined(separator: ", "))
            if me.director {
                More("Mark someone out") { PickGrid(list: still) { p in session.send(["a": "out", "who": p.id]) } }
            }
        case "actor": ActorPlay(v: v, me: me, t: t, x: x)
        case "truths": TruthsPlay(v: v, me: me, x: x)
        case "tempt":
            Question("PURSE or SELF?")
            Sub("Exactly one SELF: they take Sanctuary and the Purse grows by \(t.offer). Nobody: it grows by \(t.offer * 2). Two or more: nobody gets it, and the Purse loses \(t.offer).")
            if let m = x.mine, !m.isEmpty { Sent(x: x, value: m.uppercased()) } else {
                Columns(2) {
                    Button("PURSE") { session.act("ans", "purse") }.btn(.verd, .big)
                    Button("SELF") { session.act("ans", "self") }.btn(.blood, .big)
                }
            }
        default: EmptyView()
        }
    }
}

// Snap: the symbol changes every few seconds; tap when it matches the one before
struct SnapPlay: View {
    let x: Item
    @Environment(Session.self) private var session
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.2)) { _ in
            let i = x.snapIndex(at: session.gameNow())
            let sym = x.snapSymbol(i)
            let prev = (i ?? 0) > 0 ? x.snapSymbol((i ?? 0) - 1) : nil
            VStack(spacing: 0) {
                ZStack {
                    if let sym { Icon(name: sym).padding(.horizontal, 50).foregroundStyle(Theme.brass2) }
                    else { HStack(spacing: 6) { Sub("Get ready…"); Clock(end: x.start).padding(.bottom, 12) } }
                }
                .frame(maxWidth: .infinity).frame(height: 300)
                if let prev {
                    HStack(spacing: 6) { Text("before:").font(Theme.ui(15)).foregroundStyle(Theme.tallow2); Icon(name: prev).frame(width: 22, height: 22).foregroundStyle(Theme.brass2) }
                        .frame(maxWidth: .infinity).padding(.bottom, 12)
                }
                Button("SNAP") { session.send(["a": "ans"]) }.btn(.blood, .big)
                Small("Tap only when the symbol matches the one before. A wrong tap loses a point." + (x.myTaps > 0 ? " Your snaps: \(x.myTaps)." : ""), center: true).padding(.top, 12)
            }
        }
    }
}

// Charades, Hum It, Pictionary: the actor's secret word, and everyone else's guess
struct ActorPlay: View {
    let v: Snapshot
    let me: Me
    let t: Trial
    let x: Item
    @Environment(Session.self) private var session
    var body: some View {
        if x.actor != me.id {
            Question(v.name(x.actor) + " is up.")
            Sub((t.key == "hum" ? "Name that song." : "Shout your guess.") + " When someone gets it, " + v.name(x.actor) + " taps who.")
        } else {
            Card(.hot, center: true) { Eyebrow("yours, secretly"); Answer(x.word ?? "", center: true) }
            Sub((t.key == "hum" ? "Hum it. No words." : t.key == "draw" ? "Draw it. No letters or numbers." : "Act it out. No words, no sounds.") + " Who got it?")
            PickGrid(list: v.alive.filter { $0.id != me.id }) { p in session.act("guess", p.id) }
            Spacer().frame(height: 10)
            HStack(spacing: 10) {
                Button("Nobody got it") { session.act("guess", "none") }.btn(.ghost, .sm)
                if x.skips < 2 { Button("A different one") { session.act("reword") }.btn(.dark, .sm) }
            }
        }
    }
}

struct TruthsPlay: View {
    let v: Snapshot
    let me: Me
    let x: Item
    @Environment(Session.self) private var session
    var body: some View {
        if x.teller == me.id {
            if x.stage == "prep" {
                Question("Your turn: two truths and a lie.")
                Sub("Choose which one will be the lie, tell all three to the table, then tap “All told”.")
                Columns(3) { ForEach(1...3, id: \.self) { n in Button("No. \(n)") { session.act("lie", n) }.btn(x.lie == n ? .on : .dark) } }
                Spacer().frame(height: 10)
                Button("All told. Open the vote") { session.act("told") }.btn(.fill, .big).disabled(x.lie == nil)
                if x.lie == nil { Small("Choose which one is the lie first.", center: true).padding(.top, 12) }
            } else {
                Question("The table is voting on your lie.")
                Sub("\(x.answered) of \(x.of) voted.")
            }
        } else if x.stage == "prep" {
            Question(v.name(x.teller) + " is telling you three things.")
            Sub("Listen closely. One is a lie.")
        } else {
            Question("Which was " + v.name(x.teller) + "’s lie?")
            if let m = x.mine, !m.isEmpty { Sent(x: x, value: "No. " + m) } else {
                Columns(3) { ForEach(1...3, id: \.self) { n in Button("No. \(n)") { session.act("ans", n) }.btn(.fill, .big) } }
            }
        }
    }
}

// an item's result on a phone, with what it meant for this player
struct ItemReveal: View {
    let v: Snapshot
    let me: Me
    let t: Trial
    let x: Item
    @Environment(Session.self) private var session

    private func names(_ ids: [String]) -> String { ids.isEmpty ? "nobody" : ids.map { v.name($0) }.joined(separator: ", ") }

    @ViewBuilder private var you: some View {
        let mine = x.res.pts[me.id]
        if me.alive {
            if let m = mine, m > 0 { YouLine(text: "+\(m) for you", tone: .good) }
            else if let m = mine, m < 0 { YouLine(text: "\(m) for you", tone: .bad) }
            else if ["text", "number", "hilo", "cell", "word", "recall"].contains(x.k) {
                YouLine(text: x.mine != nil ? "Not this time." + ((x.mine ?? "").isEmpty ? "" : " You said “" + String((x.mine ?? "").prefix(40)) + "”.") : "You didn’t answer in time.", tone: .plain)
            }
        }
    }

    var body: some View {
        let r = x.res
        switch x.k {
        case "text":
            Question(x.q ?? ""); Answer(x.a ?? "")
            Para("Right: " + names(r.right) + (r.first.map { " · fastest " + v.name($0) } ?? ""))
            you
            if me.director && !x.wrong.isEmpty {
                More("Mark a near miss right") {
                    let near = x.wrong.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
                    if near.isEmpty { Small("No wrong answers to accept.") }
                    ForEach(near, id: \.id) { w in
                        HStack { Text(v.name(w.id) + ": “" + w.text + "”").font(Theme.ui(18)).foregroundStyle(Theme.tallow); Spacer(); Button("Accept") { session.act("accept", w.id) }.btn(.ghost, .sm, fit: true) }
                            .padding(.vertical, 6)
                    }
                }
            }
        case "number":
            Question(x.q ?? ""); Answer(x.a ?? ""); Para("Closest: " + names(r.closest)); you
        case "hilo":
            Question(x.q ?? ""); Answer(x.a ?? "")
            Para((r.truth == "higher" ? "Higher" : "Lower") + " than " + (x.ref ?? "") + ". Right: " + names(r.right)); you
        case "vote":
            Question(x.q ?? ""); Answer(names(r.top))
            Sub(r.counts.map { v.name($0.id) + " \($0.n)" }.joined(separator: " · "))
        case "word":
            Letters(letters: x.letters ?? "")
            VStack(spacing: 0) {
                ForEach(r.words.sorted { $0.word.count > $1.word.count }, id: \.id) { w in
                    ScoreRow(player: v.player(w.id)) { points(w.word + (w.ok ? "" : " ✗")) }
                }
            }
            you
        case "recall":
            WordWall(words: x.words); Spacer().frame(height: 10); you
        case "cell":
            Sub("This changed:")
            Cells(grid: x.grid ?? [], mine: x.mine.flatMap { Int($0) }, hit: x.changed)
            Para("Right: " + names(r.right)).padding(.top, 12); you
        case "snap":
            Question("Snap!"); Para("Snaps caught: " + names(r.hits)); you
        case "rps":
            VStack(spacing: 0) {
                ForEach(Array(r.bouts.enumerated()), id: \.offset) { _, bt in
                    VStack(spacing: 6) {
                        HStack {
                            (Text(v.name(bt.a) + " ") + Text(bt.x).italic()).frame(maxWidth: .infinity, alignment: .leading)
                            Text("v").foregroundStyle(Theme.mist)
                            (Text(bt.y).italic() + Text(" " + v.name(bt.b))).frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .font(Theme.ui(18)).foregroundStyle(Theme.tallow)
                        Text(bt.w.map { v.name($0) + " goes through" } ?? "Draw · both go through").font(Theme.ui(15)).foregroundStyle(Theme.brass2).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule2).frame(height: 1) }
                }
            }
            if let mb = r.bouts.first(where: { $0.a == me.id || $0.b == me.id }) {
                YouLine(text: mb.w == nil ? "A draw, so you go through." : mb.w == me.id ? "You go through." : "You’re out.", tone: mb.w == nil || mb.w == me.id ? .good : .bad)
            }
        case "survive":
            Question("Last standing: " + names(r.still))
        case "actor":
            Sub(v.name(r.actor) + "’s was"); Answer(r.word ?? "")
            Para(r.guess != nil && r.guess != "none" ? v.name(r.guess) + " got it" : "Nobody got it"); you
        case "truths":
            Question(v.name(r.teller) + "’s lie was No. \(r.lie ?? 0)")
            Para("Right: " + names(r.right) + " · fooled \(r.fooled)"); you
        case "tempt":
            let n = r.selfCount
            Question(n == 1 ? "One SELF." : n > 0 ? "\(n) SELFs." : "Nobody chose SELF.")
            Sub(n == 1 ? "They take Sanctuary tonight, and the Purse grows." : n > 0 ? "Too greedy. Nobody gets Sanctuary, and the Purse shrinks." : "The table held, so the Purse grows double.")
        default: EmptyView()
        }
    }
}

struct YouLine: View { // .you
    enum Tone { case plain, good, bad }
    let text: String
    let tone: Tone
    var body: some View {
        Text(text).font(Theme.ui(18)).foregroundStyle(tone == .good ? Color(hex: 0xBFEADB) : tone == .bad ? Color(hex: 0xF3B7C4) : Theme.tallow2)
            .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.vertical, 16)
    }
}

// the question as a Ghost watches it (tvItem(x, true))
struct GhostItem: View {
    let v: Snapshot
    let x: Item
    @Environment(Session.self) private var session
    var body: some View {
        let count = x.of > 0 ? AnyView(Text("\(x.answered) of \(x.of) answered").font(Theme.sc(15)).tracking(1.5).foregroundStyle(Theme.tallow2).padding(.top, 8)) : AnyView(EmptyView())
        VStack(alignment: .leading, spacing: 0) {
            switch x.k {
            case "text", "number", "vote": Question(x.q ?? ""); count
            case "hilo": Question(x.q ?? ""); Answer("Higher or lower than " + (x.ref ?? "") + "?"); count
            case "word": Letters(letters: x.letters ?? ""); count
            case "recall": if x.stage == "study" { WordWall(words: x.words) } else { H2("Type every word you remember"); count }
            case "cell": if let g = x.grid { Cells(grid: g) } else { H2("Something is changing…") }
            case "snap":
                TimelineView(.periodic(from: .now, by: 0.2)) { _ in
                    if let s = x.snapSymbol(x.snapIndex(at: session.gameNow())) { Icon(name: s).padding(.horizontal, 50).frame(height: 300).frame(maxWidth: .infinity).foregroundStyle(Theme.brass2) }
                    else { H2("Get ready") }
                }
            case "rps":
                H2("Rock, paper, scissors")
                Flow(spacing: 18, lineSpacing: 6) {
                    ForEach(Array(x.pairs.enumerated()), id: \.offset) { _, pr in
                        (Text(v.name(pr.first)) + Text(" v ").foregroundColor(Theme.mist) + Text(v.name(pr.last))).font(Theme.ui(18)).foregroundStyle(Theme.tallow)
                    }
                    if let bye = x.bye { Text("bye: " + v.name(bye)).font(Theme.ui(18)).foregroundStyle(Theme.tallow) }
                }
                Text("\(x.answered) of \(x.of) chosen").font(Theme.sc(15)).tracking(1.5).foregroundStyle(Theme.tallow2).padding(.top, 8)
            case "survive": H2("Still standing"); Sub(v.alive.filter { !x.out.contains($0.id) }.map(\.name).joined(separator: ", "))
            case "actor": H2(v.name(x.actor) + " is up")
            case "truths": H2(v.name(x.teller) + ": two truths and a lie"); if x.stage == "open" { Sub("Vote on your phones: No. 1, 2 or 3?"); count }
            case "tempt": H2("PURSE or SELF?"); Sub("Choose on your phones, in secret."); count
            default: EmptyView()
            }
        }
    }
}

struct TrialDone: View {
    let v: Snapshot
    let me: Me
    let t: Trial
    @Environment(Session.self) private var session

    static func head(_ v: Snapshot, _ t: Trial) -> String {
        if t.key == "tempt" { return !(t.last.map { $0.selfCount > 0 } ?? false) ? "The table held" : t.last?.selfCount == 1 ? "Someone took it" : "Greed cost the table" }
        if t.special == "cast" { return "The Casting Vote is taken" }
        return t.winners.first.map { v.name($0) + " wins" } ?? "No winner"
    }

    var body: some View {
        let w = t.winners.first
        let sc = t.scores.sorted { $0.value > $1.value || ($0.value == $1.value && $0.key < $1.key) }.prefix(8)
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow(t.title + " · the result")
            H1(TrialDone.head(v, t))
            if t.special == "cast" { Sub("Whoever won holds it now. Only they know.") }
            if w != nil && t.byLot && t.key != "tempt" { Small("A tie at the top, settled by lot.") }
            (Text(Words.signed(t.points)).font(Theme.book(30)) + Text(" to the Purse").font(Theme.ui(15))).foregroundStyle(Theme.brass2).monospacedDigit().padding(.bottom, 4)
            Meter(pot: v.pot, cap: v.potCap, tiers: v.tiers)
            if t.wrongF > 0 { Small("The Forsworn gave " + Words.plural(t.wrongF, "wrong answer") + ", and the Purse paid for them.") }
            if let s = t.sanctPublic { Banner(.sanct, v.name(s) + " takes Sanctuary for tonight.") }
            if me.wonSanct == "yes" { Banner(.sanct, icon: "shield", "You won Sanctuary. Nobody can take you tonight. " + (t.sanctPublic != nil ? "" : "Only you know.")) }
            if me.wonSanct == "wasted" { Banner(.plain, "You won, but Sanctuary protects only the Loyal. Nobody else knows.") }
            if let g = t.gave { Banner(.plain, icon: "crown", g == me.id ? "You take the Crown: Sanctuary tonight, and once, at a Reckoning, you can lay it down to be safe from that exile." : v.name(g) + " takes the Crown.") }
            if me.gave == "cast" { Banner(.plain, icon: "scales", "You won the Casting Vote. If a Reckoning ties and you voted for one of them, your vote decides it. Only you know.") }
            if me.gave == "confess" {
                Banner(.ghost, icon: "eye", me.confess == "self" ? Text("You won the Confessor’s prize: no other Forsworn is left at the table.")
                       : Text("You won the Confessor’s prize: ") + Text(me.confess ?? "").font(Theme.ui(16, .bold)) + Text(" is Forsworn. Keep it to yourself."))
            }
            if !sc.isEmpty && t.key != "tempt" && t.key != "likely" {
                VStack(spacing: 0) {
                    ForEach(Array(sc), id: \.key) { e in ScoreRow(player: v.player(e.key), highlight: e.key == me.id) { points("\(e.value)") } }
                }
            }
            DirCard { Button("Back to the table") { session.act("cont") }.btn(.fill) }
            WaitHost(v: v)
        }
    }
}
