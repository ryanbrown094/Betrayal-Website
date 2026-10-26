import SwiftUI

// The TV: never a secret (tvScreen(), tvBody(), tvItem() and tvReveal() in src/modern-ui.js). Sized to the screen, as
// the page sizes it in vh and vw. On an iPad it's a screen of its own; on a TV it's the phone's second display.
struct TVView: View {
    var external = false // on a second display, which can't be tapped
    @Environment(Session.self) private var session

    var body: some View {
        GeometryReader { g in
            let u = TVUnits(size: g.size)
            ZStack {
                Backdrop(night: session.view?.phase == "night", tv: true)
                if let v = session.view {
                    VStack(spacing: 0) {
                        if v.test { Text("test game · bots").font(Theme.sc(u.vh * 2.4, fixed: true)).tracking(u.vh * 0.29).foregroundStyle(Theme.blood2).frame(maxWidth: .infinity) }
                        HStack(alignment: .firstTextBaseline) {
                            Text((v.title ?? "The Betrayal") + " · " + (v.final ? "the final" : v.round > 0 ? "round \(v.round)" : "table " + session.room))
                                .font(Theme.sc(u.vh * 2.4, fixed: true)).tracking(u.vh * 0.29).foregroundStyle(Theme.tallow2)
                            Spacer()
                            if v.phase != "lobby" { Text(verbatim: "Purse \(v.pot)").font(Theme.sc(u.vh * 3.2, fixed: true)).tracking(u.vh * 0.38).monospacedDigit().foregroundStyle(Theme.brass2) }
                        }
                        TVBody(v: v, u: u)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .id(v.screenKey)
                            .transition(.asymmetric(insertion: .opacity, removal: .identity))
                            .animation(.easeOut(duration: 0.35), value: v.screenKey)
                    }
                    .padding(.vertical, u.vh * 4).padding(.horizontal, u.vw * 5)
                    if v.paused != nil { PauseBox(v: v, me: nil, tv: true, vh: u.vh) }
                } else {
                    VStack(spacing: u.vh * 2.4) {
                        Brand()
                        Text(session.screen == .tv ? "Table \(session.room) isn’t set up yet." : "Connecting…").font(Theme.ui(u.vh * 3, fixed: true)).foregroundStyle(Theme.tallow2)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                if !external && !session.demo { TVButtons(u: u) }
            }
        }
        .ignoresSafeArea()
        .onChange(of: session.view?.screenKey) { _, _ in narrate() }
        .onChange(of: session.view?.ver) { _, _ in narrate() }
    }

    private func narrate() {
        guard let v = session.view, !session.demo else { return }
        Narrator.shared.speak(key: v.screenKey, bits: TVBody.speech(v))
    }
}

// the page's units: a hundredth of the screen's height and width
struct TVUnits {
    let size: CGSize
    var vh: CGFloat { size.height / 100 }
    var vw: CGFloat { size.width / 100 }
}

// .tvbtns: sound and the narrator, in the corner, faint
private struct TVButtons: View {
    let u: TVUnits
    @Environment(Session.self) private var session
    @State private var refresh = false
    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: 8) {
                Button(Sound.shared.isPlaying(for: session) ? "Mute" : "Turn on sound") {
                    if Sound.shared.follows(session) { Sound.shared.toggleMute() } else { Sound.shared.enable(for: session) }
                    refresh.toggle()
                }
                .btn(.ghost, .sm, fit: true)
                Button(Narrator.shared.on ? "Narrator: on" : "Narrator: off") {
                    Narrator.shared.on.toggle()
                    if let v = session.view { Narrator.shared.speak(key: v.screenKey, bits: TVBody.speech(v)) }
                    refresh.toggle()
                }
                .btn(.ghost, .sm, fit: true)
                Spacer()
            }
            .opacity(0.55)
            .id(refresh)
        }
        .padding(.leading, u.vw * 2).padding(.bottom, u.vh * 2)
    }
}

struct TVBody: View {
    let v: Snapshot
    let u: TVUnits
    @Environment(Session.self) private var session

    var body: some View {
        VStack(spacing: u.vh * 2.4) { content }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // the type, in the page's sizes (.tvmain h1, h2, .sub …)
    private func h1(_ s: String, disp: Bool = false, color: Color? = nil) -> some View {
        Text(s).font(disp ? Theme.disp(u.vh * 11, fixed: true) : Theme.book(u.vh * 8, fixed: true)).foregroundStyle(color ?? (disp ? Theme.brass2 : Theme.tallow)).lineLimit(3).minimumScaleFactor(0.6)
    }
    private func h2(_ s: String) -> some View { Text(s).font(Theme.book(u.vh * 5.4, fixed: true)).foregroundStyle(Theme.tallow).frame(maxWidth: u.vw * 80).lineLimit(4).minimumScaleFactor(0.6) }
    private func sub(_ s: String) -> some View { Text(s).font(Theme.ui(u.vh * 3, fixed: true)).foregroundStyle(Theme.tallow2).frame(maxWidth: u.vw * 70).fixedSize(horizontal: false, vertical: true) }
    private func eyebrow(_ s: String) -> some View { Eyebrow(s, size: u.vh * 2.6, tv: true) }
    private func ans(_ s: String) -> some View { Text(s).font(Theme.book(u.vh * 7, fixed: true)).monospacedDigit().foregroundStyle(Theme.brass2).lineLimit(2).minimumScaleFactor(0.5) }
    private func count(_ s: String) -> some View { Text(s).font(Theme.sc(u.vh * 2.8, fixed: true)).tracking(u.vh * 0.28).foregroundStyle(Theme.tallow2) }
    private func clock(_ end: Double?) -> some View { Clock(end: end, size: u.vh * 5, tv: true) }
    private func meter() -> some View { Meter(pot: v.pot, cap: v.potCap, tiers: v.tiers, height: u.vh * 3.4, font: u.vh * 2).frame(width: u.vw * 40) }

    @ViewBuilder private var content: some View {
        switch v.phase {
        case "lobby":
            HStack(spacing: u.vw * 5) {
                QRBox(text: Server.joinURL(session.room)).frame(width: u.vh * 30, height: u.vh * 30)
                VStack(alignment: .leading, spacing: u.vh * 1.5) {
                    Text(session.room).font(Theme.book(u.vh * 13, fixed: true)).tracking(u.vh * 1.5).foregroundStyle(Theme.brass2)
                    (Text("Scan, or go to ") + Text(Server.site + "/join").font(Theme.ui(u.vh * 3.4, .bold, fixed: true)).foregroundColor(Theme.tallow))
                        .font(Theme.ui(u.vh * 3.4, fixed: true)).foregroundStyle(Theme.tallow2)
                }
            }
            TVPeople(v: v, list: v.players, u: u)
            count(Words.plural(v.players.count, "player") + " · 8 to 24")
        case "oath":
            eyebrow("the oath"); h1("Swear on your phones"); sub("Would you like to be Forsworn? Nobody sees your answer.")
            TVPeople(v: v, list: v.players, u: u, mark: { $0.optedIn })
        case "roles":
            h1("Look at your role"); sub("Hold your phone close. Tell no one.")
            TVPeople(v: v, list: v.players, u: u, mark: { $0.acked })
        case "day":
            h1(v.final ? "The final" : "Day \(v.round)")
            meter()
            TVPeople(v: v, list: v.players, u: u, roles: true)
            count("next: " + (v.next ?? "") + (v.tiers ? " · the Purse decides the prize" : ""))
        case "break":
            eyebrow("a break"); h1(v.brk?.name ?? "A break"); clock(v.brk?.end)
        case "trial":
            if let t = v.trial { trial(t) }
        case "talk":
            eyebrow("the reckoning"); h1("Make your accusations"); clock(v.vote?.talkEnd)
            TVPeople(v: v, list: v.players, u: u)
        case "vote":
            if let vote = v.vote {
                eyebrow("the reckoning" + (vote.tie ? " · a tie" : ""))
                h1(vote.tie ? "Vote again" : "Vote on your phones")
                if let r = vote.revote { sub("Between " + Words.andList(r.map { v.name($0) })) }
                HStack(spacing: u.vw * 0.6) { count("\(vote.voted) of \(vote.of) voted · "); clock(vote.voteEnd) }
                if let i = vote.immune { sub(v.name(i) + " laid down the Crown, and is safe from this exile.") }
                TVPeople(v: v, list: v.players, u: u, mark: vote.revote.map { r in { (p: Player) in r.contains(p.id) } })
            }
        case "reveal":
            if let r = v.reveal {
                h1(r.name + " is exiled")
                sub(r.counts.map { v.name($0.id) + " \($0.n)" }.joined(separator: " · ") + (r.cast ? " · settled by the Casting Vote" : ""))
                if r.secret { sub("In the final, the exiled go without a word.") }
                else if r.role != nil {
                    Verdict(role: r.role, wait: nil, tv: true, vh: u.vh)
                    if !r.called.isEmpty { sub("Called from beyond by " + Words.andList(r.called)) }
                    if let w = r.words { LastWords(name: r.name, words: w, tv: true, vh: u.vh).multilineTextAlignment(.leading) }
                } else { Verdict(role: nil, wait: nil, tv: true, vh: u.vh) }
            }
        case "night":
            eyebrow("the night"); h1("Heads down"); sub("Everyone, tap your phone. The Forsworn are choosing.")
        case "dawn":
            if let d = v.dawn {
                eyebrow("dawn")
                if d.revealed {
                    h1(d.victims.isEmpty ? "Nobody was poisoned" : Words.andList(d.victims.map(Words.nb)) + (d.victims.count > 1 ? " were" : " was") + " poisoned")
                    if let last = d.lastEnd {
                        HStack(alignment: .firstTextBaseline, spacing: u.vw * 0.6) { Text("Last words").font(Theme.ui(u.vh * 3, fixed: true)).foregroundStyle(Theme.tallow2); clock(last) }
                    } else if d.saved > 0 { sub("Sanctuary held.") }
                    if d.victims.contains(where: { n in d.likely.contains { $0.name == n } }) { Epitaphs(d: d, tv: true, vh: u.vh) }
                    else { TVPeople(v: v, list: v.players, u: u) }
                } else { h1("Heads up"); sub("Who made it through the night?") }
            }
        case "trust":
            if let t = v.trust {
                h1(t.result.map { $0 == "trust" ? "The table trusts" : "Doubt" } ?? "Do you trust everyone left?")
                if t.result == nil { HStack(spacing: u.vw * 0.6) { count("\(t.voted) of \(t.of) chosen" + (t.end != nil ? " · " : "")); if let e = t.end { clock(e) } } }
            }
        case "unmask":
            eyebrow("the unmasking"); h1("Who were they?")
            TVPeople(v: v, list: (v.unmask?.order ?? []).map { v.player($0) }, u: u, roles: true)
        case "honour":
            if let h = v.honour {
                eyebrow("the last betrayal"); h1("Honour or betray?"); sub("The Forsworn choose, in secret.")
                HStack(spacing: u.vw * 0.6) { count("\(h.made) of \(h.of) chosen" + (h.end != nil ? " · " : "")); if let e = h.end { clock(e) } }
            }
        case "end":
            if let r = v.result { end(r) }
        default: EmptyView()
        }
    }

    @ViewBuilder private func trial(_ t: Trial) -> some View {
        if t.stage == "intro" {
            eyebrow("trial" + TrialView.prizeLine(t)); h1(t.title, disp: true); sub(t.rules); clock(t.introEnd)
        } else if t.stage == "done" {
            let w = t.winners.first
            eyebrow(t.title)
            h1(TrialDone.head(v, t))
            if w != nil && t.byLot && t.key != "tempt" { count("a tie at the top, settled by lot") }
            ans(Words.signed(t.points) + " to the Purse")
            meter()
            if let g = t.gave { sub(v.name(g) + " takes the Crown.") }
            else if t.special == "cast" { sub("Whoever won holds it. Only they know.") }
            else if t.special == "secret" && w != nil { sub("The special prize is on their phone.") }
            else if let s = t.sanctPublic { sub(v.name(s) + " takes Sanctuary.") }
            else if t.prize && w != nil { sub("Did they take Sanctuary? Only they know.") }
            if !["tempt", "likely"].contains(t.key) && !t.scores.isEmpty { TVScores(v: v, t: t, u: u) }
        } else if let x = t.item {
            eyebrow(t.title + " · \(x.stage == "reveal" ? t.i : t.i + 1)")
            if x.stage == "reveal" { reveal(x) } else { item(x) }
        }
    }

    @ViewBuilder private func item(_ x: Item) -> some View {
        let c = x.end != nil && x.stage != "reveal"
        let cnt = x.of > 0
        switch x.k {
        case "text", "number", "vote":
            h2(x.q ?? ""); if c { clocked(x) }; if cnt { answered(x) }
        case "hilo":
            h2(x.q ?? ""); ans("Higher or lower than " + (x.ref ?? "") + "?"); if c { clocked(x) }; if cnt { answered(x) }
        case "word":
            TVLetters(letters: x.letters ?? "", u: u); if c { clocked(x) }; if cnt { answered(x) }
        case "recall":
            if x.stage == "study" { TVWords(words: x.words, u: u); if c { clocked(x) } }
            else { h2("Type every word you remember"); if c { clocked(x) }; if cnt { answered(x) } }
        case "cell":
            if let g = x.grid { TVGrid(grid: g, hit: [], u: u); if c { clocked(x) } } else { h2("Something is changing…") }
        case "snap":
            TimelineView(.periodic(from: .now, by: 0.2)) { _ in
                if let s = x.snapSymbol(x.snapIndex(at: session.gameNow())) { Icon(name: s).frame(width: u.vh * 40, height: u.vh * 40).foregroundStyle(Theme.brass2) }
                else { h2("Get ready") }
            }
        case "rps":
            h2("Rock, paper, scissors")
            Flow(spacing: u.vw * 3.2, lineSpacing: u.vh, center: true) {
                ForEach(Array(x.pairs.enumerated()), id: \.offset) { _, pr in
                    (Text(v.name(pr.first)) + Text(" v ").foregroundColor(Theme.mist) + Text(v.name(pr.last))).font(Theme.ui(u.vh * 3, fixed: true)).foregroundStyle(Theme.tallow)
                }
                if let bye = x.bye { Text("bye: " + v.name(bye)).font(Theme.ui(u.vh * 3, fixed: true)).foregroundStyle(Theme.tallow) }
            }
            .frame(maxWidth: u.vw * 84)
            if c { clocked(x) }
            count("\(x.answered) of \(x.of) chosen")
        case "survive":
            h2("Still standing"); sub(v.alive.filter { !x.out.contains($0.id) }.map(\.name).joined(separator: ", "))
        case "actor":
            h2(v.name(x.actor) + " is up"); if c { clocked(x) }
        case "truths":
            h2(v.name(x.teller) + ": two truths and a lie")
            if x.stage == "open" { sub("Vote on your phones: No. 1, 2 or 3?"); if cnt { answered(x) } }
            if c { clocked(x) }
        case "tempt":
            h2("PURSE or SELF?"); sub("Choose on your phones, in secret."); if c { clocked(x) }; if cnt { answered(x) }
        default: EmptyView()
        }
    }

    @ViewBuilder private func clocked(_ x: Item) -> some View {
        clock(x.end)
        if let from = x.from, let end = x.end { TimeBar(from: from, end: end, height: u.vh).frame(width: u.vw * 50) }
    }
    private func answered(_ x: Item) -> some View { TVPeople(v: v, list: v.players, u: u, mark: { x.who.contains($0.id) }, answered: true) }

    @ViewBuilder private func reveal(_ x: Item) -> some View {
        let r = x.res
        let names: ([String]) -> String = { ids in ids.isEmpty ? "nobody" : ids.map { v.name($0) }.joined(separator: ", ") }
        switch x.k {
        case "text": h2(x.q ?? ""); ans(x.a ?? ""); sub("Right: " + names(r.right))
        case "number", "hilo": h2(x.q ?? ""); ans(x.a ?? ""); sub((x.k == "number" ? "Closest: " : "Right: ") + names(x.k == "number" ? r.closest : r.right))
        case "vote": h2(x.q ?? ""); ans(names(r.top))
        case "word":
            let best = r.words.filter { $0.ok }.sorted { $0.word.count > $1.word.count }.first
            TVLetters(letters: x.letters ?? "", u: u); ans(best?.word ?? "No real words"); sub(best.map { v.name($0.id) } ?? "")
        case "recall": TVWords(words: x.words, u: u)
        case "cell": TVGrid(grid: x.grid ?? [], hit: x.changed, u: u); sub("Right: " + names(r.right))
        case "snap": h2("Snap!"); sub(names(r.hits))
        case "rps": h2(r.bouts.map { b in b.w.map { w in v.name(w) + " beats " + v.name(w == b.a ? b.b : b.a) } ?? v.name(b.a) + " and " + v.name(b.b) + " draw" }.joined(separator: " · "))
        case "survive": h2("Last standing: " + names(r.still))
        case "actor": ans(r.word ?? ""); sub(r.guess != nil && r.guess != "none" ? v.name(r.guess) + " got it" : "Nobody got it")
        case "truths": h2("The lie was No. \(r.lie ?? 0)"); sub("Right: " + names(r.right) + " · " + v.name(r.teller) + " fooled \(r.fooled)")
        case "tempt":
            let n = r.selfCount
            h2(n == 1 ? "One SELF" : n > 0 ? "\(n) SELFs" : "Nobody chose SELF")
            sub(n == 1 ? "They take Sanctuary, and the Purse grows." : n > 0 ? "Too greedy. Nobody gets Sanctuary, and the Purse shrinks." : "The table held, so the Purse grows double.")
        default: EmptyView()
        }
    }

    @ViewBuilder private func end(_ r: GameResult) -> some View {
        let fw = r.forsworn
        let inner = u.vw * 86 // the screen less its sides (5vw each) and the 4vw between the columns
        HStack(alignment: .center, spacing: u.vw * 4) {
            VStack(alignment: .leading, spacing: 0) {
                Text(fw ? "The Forsworn win" : "The Loyal win").font(Theme.disp(u.size.width / u.size.height < 1.5 ? u.vh * 7 : u.vh * 9, fixed: true)).foregroundStyle(fw ? Theme.blood2 : Theme.brass2)
                VStack(alignment: .leading, spacing: u.vh * 0.6) {
                    Text("the prize").font(Theme.sc(u.vh * 2.2, fixed: true)).tracking(u.vh * 0.3).foregroundStyle(Theme.brass2)
                    Text(Words.prize(r)).font(Theme.book(u.vh * 5, fixed: true)).foregroundStyle(Theme.tallow)
                    Text((r.to.isEmpty ? "Nobody takes it" : "To " + Words.andList(r.to)) + (fw ? ", with the \(r.won) the Purse fell short" : ", with the Purse of \(r.pot)"))
                        .font(Theme.ui(u.vh * 3, fixed: true)).foregroundStyle(Theme.tallow2)
                }
                .padding(.vertical, u.vh * 3).padding(.horizontal, u.vw * 2.4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: u.vh * 2).strokeBorder(Theme.brass, lineWidth: 1))
                .overlay(RoundedRectangle(cornerRadius: u.vh * 1.6).strokeBorder(Theme.brass2.opacity(0.3), lineWidth: 1).padding(u.vh * 0.7))
                .padding(.top, u.vh * 3)
                if !r.peeked.isEmpty { count("the host opened the roles in round " + r.peeked.map(String.init).joined(separator: ", ")).padding(.top, u.vh * 2) }
            }
            .multilineTextAlignment(.leading)
            .frame(width: inner / 2.1, alignment: .leading)
            VStack(spacing: u.vh * 3) {
                TVPeople(v: v, list: v.players, u: u, roles: true, end: true)
                if !r.awards.isEmpty {
                    Columns(2, spacing: u.vw * 2) {
                        ForEach(r.awards.prefix(v.players.count > 16 ? 2 : 4), id: \.title) { a in
                            HStack(spacing: u.vw) {
                                Seal(v.player(a.id)).frame(width: u.vh * 5, height: u.vh * 5)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(a.title).font(Theme.ui(u.vh * 2.4, .bold, fixed: true)).foregroundStyle(Theme.brass2)
                                    Text(a.name + " " + a.why).font(Theme.ui(u.vh * 2.2, fixed: true)).foregroundStyle(Theme.tallow)
                                }
                                Spacer(minLength: 0)
                            }
                            .multilineTextAlignment(.leading)
                        }
                    }
                }
            }
            .frame(width: inner * 1.1 / 2.1)
        }
    }

    // what the narrator reads: the screen's headings, then any last words (speak() reads .eyebrow, h1, h2, .sub, .ans and .say)
    static func speech(_ v: Snapshot) -> [String] {
        var bits: [String] = [], say: [String] = []
        switch v.phase {
        case "lobby": break
        case "oath": bits = ["the oath", "Swear on your phones", "Would you like to be Forsworn? Nobody sees your answer."]
        case "roles": bits = ["Look at your role", "Hold your phone close. Tell no one."]
        case "day": bits = [v.final ? "The final" : "Day \(v.round)"]
        case "break": bits = ["a break", v.brk?.name ?? ""]
        case "trial":
            guard let t = v.trial else { break }
            if t.stage == "intro" { bits = ["trial" + TrialView.prizeLine(t), t.title, t.rules] }
            else if t.stage == "done" { bits = [t.title, TrialDone.head(v, t), Words.signed(t.points) + " to the Purse"] }
            else if let x = t.item {
                bits = [t.title]
                if x.stage == "reveal" {
                    if let q = x.q { bits.append(q) }
                    if let a = x.a { bits.append(a) }
                } else if let q = x.q { bits.append(q) }
                else if x.k == "actor" { bits.append(v.name(x.actor) + " is up") }
                else if x.k == "tempt" { bits += ["PURSE or SELF?", "Choose on your phones, in secret."] }
            }
        case "talk": bits = ["the reckoning", "Make your accusations"]
        case "vote": bits = ["the reckoning", v.vote?.tie == true ? "Vote again" : "Vote on your phones"]
        case "reveal":
            if let r = v.reveal {
                bits = [r.name + " is exiled"]
                if r.secret { bits.append("In the final, the exiled go without a word.") }
                else if let role = r.role { bits.append(role == "f" ? "Forsworn" : "Loyal") }
                if let w = r.words, r.role != nil { say.append("“" + w + "” " + r.name + "’s last words") }
            }
        case "night": bits = ["the night", "Heads down", "Everyone, tap your phone. The Forsworn are choosing."]
        case "dawn":
            if let d = v.dawn {
                if d.revealed {
                    bits = ["dawn", d.victims.isEmpty ? "Nobody was poisoned" : Words.andList(d.victims) + (d.victims.count > 1 ? " were" : " was") + " poisoned"]
                    if d.lastEnd == nil && d.saved > 0 { bits.append("Sanctuary held.") }
                    for n in d.victims { if let q = d.likely.first(where: { $0.name == n })?.q { say.append("The table voted \(n) " + Epitaphs.lower(q) + ". Now we’ll never find out.") } }
                } else { bits = ["dawn", "Heads up", "Who made it through the night?"] }
            }
        case "trust": bits = [v.trust?.result.map { $0 == "trust" ? "The table trusts" : "Doubt" } ?? "Do you trust everyone left?"]
        case "unmask": bits = ["the unmasking", "Who were they?"]
        case "honour": bits = ["the last betrayal", "Honour or betray?", "The Forsworn choose, in secret."]
        case "end": if let r = v.result { bits = [r.forsworn ? "The Forsworn win" : "The Loyal win", "the prize", Words.prize(r)] }
        default: break
        }
        return Array(bits.filter { !$0.isEmpty }.prefix(4)) + say
    }
}

// the players as rows of seals, each row the same length (.tvpeople)
struct TVPeople: View {
    let v: Snapshot
    let list: [Player]
    let u: TVUnits
    var mark: ((Player) -> Bool)? = nil
    var roles = false
    var end = false
    var answered = false

    var body: some View {
        let n = list.count
        let many = n > 16
        let per = max(1, Int(ceil(Double(n) / Double(n > 16 ? 3 : n > 8 ? 2 : 1))))
        let narrow = u.size.width / u.size.height < 1.5
        let w = many ? (end && narrow ? u.vw * 7.2 : u.vw * 8) : max(u.vw * 9, min(u.vh * 15, u.vw * 9.6))
        let seal = many ? (end && narrow ? u.vh * 4.4 : u.vh * 5.4) : u.vh * 7
        Flow(spacing: u.vw * 1.4, lineSpacing: u.vh * 1.4, center: true) {
            ForEach(list) { p in
                let ok = mark?(p) ?? false
                VStack(spacing: u.vh * 0.6) {
                    Seal(p).frame(width: seal, height: seal)
                        .shadow(color: ok ? Theme.verd.opacity(0.8) : roles && p.forsworn ? Theme.blood2.opacity(0.8) : .clear, radius: u.vh * (ok ? 1.2 : 1.4))
                    Text(p.name).font(Theme.ui(many ? u.vh * 1.9 : u.vh * 2.2, fixed: true)).foregroundStyle(Theme.tallow).lineLimit(2).multilineTextAlignment(.center)
                    if roles, let role = p.role {
                        Text(role == "f" ? "forsworn" : "loyal").font(Theme.sc(end && many && narrow ? u.vh * 1.6 : u.vh * 2.1, fixed: true)).tracking(u.vh * 0.17)
                            .foregroundStyle(role == "f" ? Theme.blood2 : Theme.loyalSoft)
                    }
                }
                .frame(width: w)
                .opacity(answered ? (ok ? 1 : 0.4) : (!p.alive && !end) ? 0.35 : 1)
            }
        }
        .frame(maxWidth: min(u.vw * 88, CGFloat(per) * (w + u.vw * 1.4)))
    }
}

// the Trial's scores, two columns of five (.tvscore), the winner first
struct TVScores: View {
    struct Entry { let key: String; let value: Int }
    static func columns(_ scores: [String: Int], winner: String?) -> [[Entry]] {
        let all = scores.map { Entry(key: $0.key, value: $0.value) }.sorted { (a: Entry, b: Entry) -> Bool in
            if (a.key == winner) != (b.key == winner) { return a.key == winner }
            if a.value != b.value { return a.value > b.value }
            return a.key < b.key
        }
        let top = Array(all.prefix(10))
        return [Array(top.prefix(5)), Array(top.dropFirst(5))]
    }
    let v: Snapshot
    let t: Trial
    let u: TVUnits
    var body: some View {
        let w = t.winners.first
        let cols = TVScores.columns(t.scores, winner: w)
        HStack(alignment: .top, spacing: u.vw * 4) {
            ForEach(0..<2, id: \.self) { c in
                VStack(spacing: u.vh * 0.6) {
                    ForEach(cols[c], id: \.key) { e in
                        HStack(spacing: u.vw) {
                            Seal(v.player(e.key)).frame(width: u.vh * 4.5, height: u.vh * 4.5)
                                .shadow(color: e.key == w ? Theme.brass2.opacity(0.8) : .clear, radius: u.vh)
                            Text(v.name(e.key)).foregroundStyle(e.key == w ? Theme.brass2 : Theme.tallow)
                            Spacer()
                            Text(verbatim: "\(e.value)").font(Theme.ui(u.vh * 3, .bold, fixed: true)).foregroundStyle(Theme.brass2)
                        }
                        .font(Theme.ui(u.vh * 3, fixed: true))
                    }
                }
                .frame(width: u.vw * 25)
            }
        }
    }
}

struct TVLetters: View {
    let letters: String
    let u: TVUnits
    var body: some View {
        HStack(spacing: u.vh) {
            ForEach(Array(letters.enumerated()), id: \.offset) { _, c in
                Text(String(c)).font(Theme.book(u.vh * 6, fixed: true)).foregroundStyle(Theme.parchmentInk)
                    .frame(width: u.vh * 9, height: u.vh * 9)
                    .background(RoundedRectangle(cornerRadius: u.vh).fill(Theme.parchment))
            }
        }
    }
}

struct TVWords: View {
    let words: [String]
    let u: TVUnits
    var body: some View {
        Columns(4, spacing: u.vw * 4) {
            ForEach(Array(words.enumerated()), id: \.offset) { _, w in Text(w).font(Theme.book(u.vh * 5, fixed: true)).foregroundStyle(Theme.tallow).lineLimit(1).minimumScaleFactor(0.5) }
        }
        .frame(maxWidth: u.vw * 80)
    }
}

struct TVGrid: View {
    let grid: [String]
    let hit: [Int]
    let u: TVUnits
    var body: some View {
        Columns(6, spacing: u.vh * 1.4) {
            ForEach(Array(grid.enumerated()), id: \.offset) { i, g in
                ZStack {
                    RoundedRectangle(cornerRadius: u.vh * 1.4).fill(hit.contains(i) ? Color(hex: 0x10261E) : Color(hex: 0x1B111D))
                    RoundedRectangle(cornerRadius: u.vh * 1.4).strokeBorder(hit.contains(i) ? Theme.verd : Theme.edge2, lineWidth: 1)
                    Icon(name: g).frame(width: u.vh * 6.6, height: u.vh * 6.6).foregroundStyle(Theme.brass2)
                }
                .frame(width: u.vh * 11, height: u.vh * 11)
            }
        }
        .frame(width: u.vh * 11 * 6 + u.vh * 1.4 * 5)
    }
}

// the join link's QR code, on parchment (.qrbox)
struct QRBox: View {
    let text: String
    var body: some View {
        Group {
            if let img = QR.image(text) { Image(decorative: img, scale: 1).interpolation(.none).resizable().scaledToFit().padding(10) }
            else { Color.clear }
        }
        .background(Color(hex: 0xEFE0D4))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: Theme.brass2.opacity(0.18), radius: 30)
    }
}
