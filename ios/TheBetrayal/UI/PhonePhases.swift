import SwiftUI

// Each moment of the evening on a phone (phase() in src/modern-ui.js), with the page's words.
struct PhaseView: View {
    let v: Snapshot
    let me: Me
    var body: some View {
        switch v.phase {
        case "lobby": LobbyView(v: v, me: me)
        case "oath": OathView(v: v, me: me)
        case "roles": RoleCard(v: v, me: me)
        case "day": DayView(v: v, me: me)
        case "trial": TrialView(v: v, me: me)
        case "break": BreakView(v: v)
        case "talk": TalkView(v: v, me: me)
        case "vote": VoteView(v: v, me: me)
        case "reveal": RevealView(v: v, me: me)
        case "night": NightView(v: v, me: me)
        case "dawn": DawnView(v: v, me: me)
        case "trust": TrustView(v: v, me: me)
        case "unmask": VStack(alignment: .leading, spacing: 0) { Eyebrow("the unmasking"); H1("Who were they?"); UnmaskList(v: v) }
        case "honour": HonourView(v: v, me: me)
        case "end": EndView(v: v, me: me)
        default: EmptyView()
        }
    }
}

struct LobbyView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    @State private var prize = ""
    @State private var tier1 = ""
    @State private var tier2 = ""
    @State private var loaded = false
    @FocusState private var focus: String?

    var body: some View {
        let n = v.players.count
        let o = v.opts
        VStack(alignment: .leading, spacing: 0) {
            H2("You’re in")
            Sub(Text("Friends join in The Betrayal app with the code ") + b(session.room) + Text(", or by scanning the code on the TV."))
            People(list: v.players)
            Small(Words.plural(n, "player") + " · 8 to 24 can play").padding(.top, 10)
            if !me.director { WaitHost(v: v) } else {
                if v.test {
                    Banner(.plain, "Test game: the bots play themselves, Trials score at random, and every countdown is ten seconds.")
                    Button("Add a bot") { session.act("bots", String(n + 1)) }.btn(.dark, .sm, fit: true).padding(.bottom, 14)
                }
                Card(.dir) {
                    H2("Before you start", sec: true, first: true)
                    Label2("Sanctuary")
                    two("shield", ("secret", "Secret"), ("public", "Public"), on: o?.shield)
                    Small(o?.shield == "public" ? "Everyone sees who won Sanctuary." : "Only the winner knows they hold Sanctuary. (A Forsworn winner gets nothing, and learns so.)").padding(.top, 6)
                    Label2("The prize")
                    Field(placeholder: "", text: $prize, max: 80, submit: sendPrize).focused($focus, equals: "prize")
                    if o?.coins == true { Small("Every 100 points in the Purse is one chocolate coin.").padding(.top, 6) }
                    More("Better prizes for a fuller Purse", open: !(o?.prizes.isEmpty ?? true)) {
                        Small("Optional. If the Forsworn win it works the other way: half empty wins them the better prize, empty the best. Nobody sees these until the end.")
                        Label2("At a half-full Purse")
                        Field(placeholder: "e.g. a big box of chocolates", text: $tier1, max: 80, submit: sendTiers).focused($focus, equals: "tier1")
                        Spacer().frame(height: 8)
                        Label2("At a full Purse")
                        Field(placeholder: "e.g. dinner out", text: $tier2, max: 80, submit: sendTiers).focused($focus, equals: "tier2")
                    }
                    Label2("Twists").padding(.top, 12)
                    two("twists", (true, "On"), (false, "Off"), on: o?.twists)
                    Small(o?.twists == true ? "Once each: the Casting Vote, the Temptation, the Crown, and the Confessor in the final." : "Off: a plainer game, good for a first night.").padding(.top, 6)
                    Label2("Eating as you play?")
                    two("courses", (true, "Yes, in courses"), (false, "No"), on: o?.courses)
                    Small(o?.courses == true ? "Dinner in courses: a starter, a main and dessert are served between the rounds." : "No meal breaks. Turn this on to serve dinner in courses between the rounds. You can always call a short break.").padding(.top, 6)
                    Spacer().frame(height: 12)
                    Button(n < 8 ? "Waiting for \(8 - n) more" : "Start with \(n) players") {
                        session.confirm("Start the game? Nobody else can join after this.", yes: "Start") { session.act("start") }
                    }
                    .btn(.fill, .big).disabled(n < 8)
                    Small(Text("For the TV, if you want one, AirPlay this phone to it: the TV shows the game, never your screen. Or open the app on an iPad, type ") + b(session.room, size: 15) + Text(" and choose ") + b("Use this screen as the TV", size: 15) + Text("."), center: true).padding(.top, 12)
                }
            }
        }
        .onAppear(perform: load)
        .onChange(of: focus) { was, _ in if was == "prize" { sendPrize() } else if was == "tier1" || was == "tier2" { sendTiers() } }
    }

    private func load() {
        guard !loaded, let o = v.opts else { return }
        loaded = true; prize = o.prize ?? ""; tier1 = o.tier(0.5); tier2 = o.tier(1)
    }
    private func sendPrize() { if prize != (v.opts?.prize ?? "") { session.send(["a": "opts", "opts": ["prize": prize]]) } }
    private func sendTiers() {
        var list: [[String: Any]] = []
        let a = tier1.trimmingCharacters(in: .whitespaces), c = tier2.trimmingCharacters(in: .whitespaces)
        if !a.isEmpty { list.append(["at": 0.5, "what": a]) }
        if !c.isEmpty { list.append(["at": 1, "what": c]) }
        session.send(["a": "opts", "opts": ["prizes": list]])
    }
    private func two<T: Equatable>(_ k: String, _ a: (T, String), _ c: (T, String), on: T?) -> some View {
        HStack(spacing: 10) {
            Button(a.1) { session.send(["a": "opts", "opts": [k: a.0]]) }.btn(on == a.0 ? .on : .dark, .sm)
            Button(c.1) { session.send(["a": "opts", "opts": [k: c.0]]) }.btn(on == c.0 ? .on : .dark, .sm)
        }
    }
}

struct OathView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if me.optIn != nil {
                H2("Sworn")
                Sub("Waiting for everyone to take the Oath.")
                People(list: v.players, mark: { $0.optedIn })
                Tally(n: v.players.filter(\.optedIn).count, of: v.players.count, word: "sworn")
                if me.director { Small("Someone stuck? Tools can deal the roles now.") }
            } else {
                Eyebrow("the oath")
                H2("Would you like to be Forsworn?")
                Sub("The Forsworn lie all evening, choose who to poison each night and try to steal the prize. Nobody sees your answer. The game uses it when it deals the roles, but it can’t always give everyone what they asked for.")
                VStack(spacing: 10) {
                    Button("Yes, make me Forsworn") { session.act("optin", "yes") }.btn(.fill)
                    Button("I’d rather be Loyal") { session.act("optin", "no") }.btn(.ghost)
                    Button("Either way") { session.act("optin", "any") }.btn(.dark)
                }
            }
        }
    }
}

struct RoleCard: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        if me.acked {
            VStack(alignment: .leading, spacing: 0) {
                DoneLine("handshake", Text("Role seen. Waiting for everyone else…"))
                Spacer().frame(height: 12)
                People(list: v.players, mark: { $0.acked })
                Tally(n: v.players.filter(\.acked).count, of: v.players.count, word: "ready")
            }
        } else if !session.rolePeek {
            Button { session.rolePeek = true } label: {
                VStack(spacing: 0) {
                    Eyebrow("your role")
                    H2("Hold your phone close")
                    Sub("Tap here when nobody can see your screen.")
                }
                .multilineTextAlignment(.center)
                .padding(20)
                .frame(maxWidth: .infinity, minHeight: 300)
                .background(Stripes())
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.edge2, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            let f = me.forsworn
            Card(.role, center: true) {
                BigSeal(kind: f ? .forsworn : .loyal, icon: f ? "blade" : "candle").frame(width: 150, height: 150).padding(.bottom, 14)
                H1(f ? "Forsworn" : "Loyal", color: f ? Theme.blood2 : Theme.loyal)
                Sub(f ? "You took the Oath and never meant it. Each night, choose on your phone who is poisoned. Blend in, vote with the table, and reach the end unmasked to steal the prize, and every point the Purse falls short of its target. So sabotage the Trials, quietly."
                      : "You are true to the table. Win Trials to fill the Purse (if you win, it’s yours; if the Forsworn win, they take whatever it falls short), find the Forsworn, and exile them at the Reckoning before they pick you off.")
                if f {
                    if let allies = me.allies, !allies.isEmpty { Para(Text("Your fellow Forsworn: ") + b(allies.map(\.name).joined(separator: ", "))) }
                    else { Para("You are the only Forsworn. Trust nobody.") }
                }
                Button("Got it. Hide my role") { session.rolePeek = false; session.act("ack") }.btn(.fill)
            }
            .padding(.horizontal, 18)
        }
    }
}

// the veil over the role card: dark diagonal stripes
struct Stripes: View {
    var body: some View {
        Canvas { ctx, size in
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: 0x140B15)))
            var x: CGFloat = -size.height
            while x < size.width + size.height {
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x + 14 * 1.414, y: 0))
                p.addLine(to: CGPoint(x: x + 14 * 1.414 - size.height, y: size.height)); p.addLine(to: CGPoint(x: x - size.height, y: size.height))
                p.closeSubpath()
                ctx.fill(p, with: .color(Color(hex: 0x170D18)))
                x += 28 * 1.414
            }
        }
    }
}

struct DayView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if !v.final { Eyebrow("round \(v.round)") }
            H1(v.final ? "The final" : v.roundTrials > 0 ? "Back at the table" : "A new day")
            Sub(v.final ? "Five or fewer remain. An exile’s role stays hidden until the end. When the table trusts everyone left, it ends." : "Talk among yourselves, and watch each other.")
            People(list: v.players)
            Small(Text("Next: ") + b(v.next ?? "", size: 15) + Text(v.tiers ? " · the Purse decides the prize" : "")).padding(.top, 12)
            WaitHost(v: v)
            DirCard {
                VStack(spacing: 10) {
                    Button("Begin: " + (v.next ?? "next")) { session.act("next") }.btn(.fill, .big)
                    Button("A short break first · 10 min") { session.act("break", "interval") }.btn(.ghost, .sm)
                }
            }
        }
    }
}

struct BreakView: View {
    let v: Snapshot
    @Environment(Session.self) private var session
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("a break")
            H1(v.brk?.name ?? "A break")
            Clock(end: v.brk?.end, size: 56).padding(.bottom, 12)
            Sub("Eat, drink and plot quietly.")
            DirCard {
                HStack(spacing: 10) {
                    Button("+5 minutes") { session.act("brkMore") }.btn(.dark, .sm)
                    Button("End the break") { session.act("brkEnd") }.btn(.fill, .sm)
                }
            }
        }
    }
}

struct TalkView: View {
    let v: Snapshot
    let me: Me
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("the reckoning" + (v.vote?.second == true ? " · the second exile" : ""))
            H1("Make your accusations")
            Clock(end: v.vote?.talkEnd, size: 56).padding(.bottom, 12)
            Sub("Voting opens on every phone when the time is up.")
            CrownCard(v: v, me: me)
        }
    }
}

struct CrownCard: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        if let immune = v.vote?.immune {
            Banner(.plain, icon: "crown", immune == me.id ? "You laid down the Crown, so nobody can exile you this Reckoning." : v.name(immune) + " laid down the Crown, and is safe from this exile.")
        } else if me.crown {
            Card(.hot) {
                HStack(alignment: .top, spacing: 6) {
                    Icon(name: "crown").frame(width: 18, height: 18).foregroundStyle(Theme.tallow).padding(.top, 3)
                    Para("You wear the Crown. Lay it down now and nobody can exile you this Reckoning. Once only.")
                }
                Button("Lay down the Crown") { session.confirm("Lay down the Crown? Nobody can exile you this Reckoning, and it’s gone for good.", yes: "Lay it down") { session.act("crown") } }.btn(.dark)
            }
        }
    }
}

struct VoteView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        let vote = v.vote
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("the reckoning" + (vote?.tie == true ? " · a tie: vote again" : ""))
            H1(me.alive ? "Who do you exile?" : "Call it, Ghost")
            Sub(line)
            if let end = vote?.voteEnd {
                HStack(alignment: .firstTextBaseline) { Text("Closes in").font(Theme.ui(15)).foregroundStyle(Theme.tallow2); Spacer(); Clock(end: end) }.padding(.bottom, 12)
            }
            CrownCard(v: v, me: me)
            if let mine = vote?.mine {
                DoneLine("scales", Text(me.alive ? "You voted " : "You called ") + b(v.name(mine)) + Text(".\n") + Text("You can change it until everyone’s in.").font(Theme.ui(15)))
                Spacer().frame(height: 12)
            }
            PickGrid(list: cands, on: { $0.id == vote?.mine }) { p in session.act("ballot", p.id) }
        }
    }
    private var cands: [Player] {
        let vote = v.vote
        return v.alive.filter { (p: Player) -> Bool in
            p.id != me.id && p.id != vote?.immune && (vote?.revote?.contains(p.id) ?? true)
        }.sorted { $0.name < $1.name }
    }
    private var line: String {
        let vote = v.vote
        var s = ""
        if let r = vote?.revote { s = "A tie between " + Words.andList(r.map { v.name($0) }) + ". " }
        s += me.alive ? "Your vote is secret until the count." : "Ghosts don’t vote, but if you call it right the table will know."
        return s + " \(vote?.voted ?? 0) of \(vote?.of ?? 0) voted."
    }
}

struct RevealView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    @State private var words = ""
    var body: some View {
        if let r = v.reveal {
            VStack(alignment: .leading, spacing: 0) {
                H1(r.name + " is exiled")
                Sub(r.counts.map { v.name($0.id) + " \($0.n)" }.joined(separator: " · "))
                if r.cast { Small("A tie, settled by the Casting Vote.") } else if r.byLot { Small("A tie, settled by lot.") }
                if r.secret { Para("In the final, the exiled go without a word.") }
                else if r.role == nil { Verdict(role: nil, wait: r.roleAt) }
                else {
                    Verdict(role: r.role, wait: nil)
                    if !r.called.isEmpty { Small("The Ghosts who called it: " + Words.andList(r.called), center: true) }
                }
                if let w = r.words { LastWords(name: r.name, words: w) }
                if me.id == r.id {
                    Banner(.ghost, icon: "ghost", "You’re a Ghost now. Stay at the table.")
                    if me.words == "" {
                        Card {
                            Label2("Your last words, for the whole table (optional, 140 characters)")
                            Field(placeholder: "One line for the table", text: $words, max: 140, submit: say)
                            Spacer().frame(height: 10)
                            Button("Say it", action: say).btn(.dark)
                        }
                    }
                }
                if r.role != nil || r.secret { DirCard { Button("Continue") { session.act("cont") }.btn(.fill) } }
            }
        }
    }
    private func say() {
        let t = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return session.say("Type something first.", error: true) }
        words = ""
        session.act("words", t)
    }
}

// the exile's seal, stamped (.verdict)
struct Verdict: View {
    let role: String?
    let wait: Double?
    var tv = false
    var vh: CGFloat = 8
    @State private var stamped = false
    @State private var breathe = false
    var body: some View {
        VStack(spacing: 6) {
            if let role {
                let f = role == "f"
                BigSeal(kind: f ? .forsworn : .loyal, icon: f ? "blade" : "candle").frame(width: tv ? 22 * vh : 120, height: tv ? 22 * vh : 120)
                Text(f ? "Forsworn" : "Loyal").font(Theme.disp(tv ? 9 * vh : 42, fixed: tv)).foregroundStyle(f ? Theme.blood2 : Theme.loyal)
                    .shadow(color: tv ? (f ? Color(hex: 0xEA5A8F, alpha: 0.45) : Color(hex: 0x5FA88F, alpha: 0.4)) : .clear, radius: 12)
            } else {
                BigSeal(kind: .steel, icon: "scales").frame(width: tv ? 22 * vh : 120, height: tv ? 22 * vh : 120)
                    .opacity(breathe ? 0.45 : 1).scaleEffect(breathe ? 0.94 : 1)
                    .onAppear { withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { breathe = true } }
                HStack(spacing: 6) {
                    Text("They were…").font(Theme.book(tv ? 4 * vh : 22, fixed: tv)).foregroundStyle(Theme.tallow2)
                    if let wait, !tv { Clock(end: wait) }
                }
            }
        }
        .scaleEffect(role != nil && !stamped ? 1.35 : 1)
        .opacity(role != nil && !stamped ? 0 : 1)
        .onAppear { if role != nil { withAnimation(.spring(response: 0.5, dampingFraction: 0.55)) { stamped = true } } }
        .onChange(of: role) { _, r in if r != nil { stamped = false; withAnimation(.spring(response: 0.5, dampingFraction: 0.55)) { stamped = true } } }
        .frame(maxWidth: .infinity)
        .padding(.vertical, tv ? 0 : 16)
    }
}

struct NightView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        let n = v.night
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("the night")
            H1("Heads down")
            if !me.alive {
                Sub("The Forsworn are choosing. Ghosts, watch in silence.")
            } else {
                Sub("Everyone taps someone now, so nobody can tell who is choosing. Keep your screen hidden.")
                if me.forsworn { forsworn(n) } else {
                    Para("Who do you suspect most? Nothing happens to them; tapping only keeps the night secret.")
                    if n?.done == true { DoneLine("moon", Text("Done. Heads down until dawn.")) }
                    else { PickGrid(list: v.alive.filter { $0.id != me.id }) { _ in session.send(["a": "sleep"]) } }
                }
            }
        }
    }

    @ViewBuilder private func forsworn(_ n: Night?) -> some View {
        let kills = n?.kills ?? 1
        let votes = tally
        Card(.hot) {
            Para(Text(kills > 1 ? "Choose \(kills). The \(kills) chosen most by the Forsworn are poisoned." : "Choose who is poisoned tonight. The one chosen most goes.")
                 + (me.sanct.isEmpty ? Text("") : Text(" ") + b(Words.andList(me.sanct)) + Text(me.sanct.count > 1 ? " hold Sanctuary." : " holds Sanctuary.")))
            ForEach(me.picks.filter { $0.name != me.name }, id: \.name) { p in
                Small(p.name + ": " + (p.picks.isEmpty ? "not yet" : Words.andList(p.picks)))
            }
            Small("\(me.mine.count) of \(kills) chosen")
        }
        PickGrid(list: me.targets.map { v.player($0) }, on: { me.mine.contains($0.id) }, badge: { p in
            AnyView(HStack(spacing: 6) {
                if let c = votes[p.name] { Text("\(c)").font(Theme.ui(14, .bold)).foregroundStyle(Color(hex: 0xF3B7C4)) }
                if me.sanct.contains(p.name) { Text("Sanctuary").font(Theme.ui(14, .medium)).foregroundStyle(Theme.loyalSoft) }
            })
        }) { p in session.act("pick", p.id) }
        if me.mine.count >= kills { Small("Chosen. You can change it until everyone’s done.", center: true).padding(.top, 10) }
        if let w = me.whispers {
            More("Whisper to the Forsworn" + (w.isEmpty ? "" : " · \(w.count)"), open: !w.isEmpty) {
                if w.isEmpty { Small("Only the Forsworn see these.") }
                else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(w.enumerated()), id: \.offset) { _, x in
                            (Text(x.name + "  ").font(Theme.ui(16, .bold)).foregroundColor(Theme.blood2) + Text(x.text).font(Theme.ui(16)).foregroundColor(Theme.tallow))
                                .padding(.vertical, 4).frame(maxWidth: .infinity, alignment: .leading)
                                .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.06)).frame(height: 1) }
                        }
                    }
                    .padding(.top, 8).padding(.bottom, 12)
                }
                Columns(2, spacing: 8) {
                    ForEach(Array(me.whisperSay.enumerated()), id: \.offset) { i, m in
                        Button(m) { session.act("whisper", i) }.btn(.dark, .sm)
                    }
                }
            }
        }
    }
}

extension NightView {
    // how many Forsworn chose each name tonight
    var tally: [String: Int] {
        var c: [String: Int] = [:]
        for p in me.picks { for n in p.picks { c[n, default: 0] += 1 } }
        return c
    }
}

struct DawnView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        if let d = v.dawn {
            if !d.revealed {
                if me.victim {
                    Card(.hot, center: true) { H1("You were poisoned"); Sub("Say nothing yet. When the host reveals the night, you get your last words.") }
                    DirCard { Button("Reveal the night") { session.act("cont") }.btn(.fill) }
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        Eyebrow("dawn"); H1("Heads up"); Sub("Who made it through the night?")
                        DirCard { Button("Reveal the night") { session.act("cont") }.btn(.fill) }
                        WaitHost(v: v)
                    }
                }
            } else if d.victims.contains(me.name), let last = d.lastEnd {
                Card(.hot, center: true) {
                    H1("Your last words")
                    Sub("Stand up, tell the table you were poisoned, and say what you like. Then you’re a Ghost.")
                    Clock(end: last, size: 56)
                }
                DirCard { Button("On to the next round") { session.act("cont") }.btn(.fill) }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Eyebrow("dawn")
                    H1(d.victims.isEmpty ? "Nobody was poisoned" : Words.andList(d.victims.map(Words.nb)) + (d.victims.count > 1 ? " were" : " was") + " poisoned")
                    if d.victims.isEmpty { Sub(d.saved > 0 ? "Sanctuary held. The Forsworn struck, and failed." : "The night passed quietly.") }
                    else if let last = d.lastEnd { HStack(spacing: 6) { Sub("Poisoned in the night. Last words:"); Clock(end: last).padding(.bottom, 12) } }
                    else { Sub("Poisoned in the night. Last words.") }
                    if d.victims.contains(me.name) { Banner(.ghost, icon: "ghost", "You were poisoned. You’re a Ghost now.") }
                    Epitaphs(d: d)
                    DirCard { Button("On to the next round") { session.act("cont") }.btn(.fill) }
                    WaitHost(v: v)
                }
            }
        }
    }
}

// each victim in turn: what the table once voted them most likely to do
struct Epitaphs: View {
    let d: Dawn
    var tv = false
    var vh: CGFloat = 8
    var body: some View {
        ForEach(d.victims, id: \.self) { n in
            if let q = d.likely.first(where: { $0.name == n })?.q {
                Text("The table voted \(n) " + Epitaphs.lower(q) + ". Now we’ll never find out.")
                    .font(Theme.bookItalic(tv ? 3.4 * vh : 18, fixed: tv)).foregroundStyle(Theme.brass2)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: tv ? 120 * vh : .infinity, alignment: tv ? .center : .leading)
                    .multilineTextAlignment(tv ? .center : .leading)
                    .padding(.vertical, tv ? 0 : 10)
            }
        }
    }
    static func lower(_ q: String) -> String { q.lowercased().hasPrefix("most") ? "most" + q.dropFirst(4) : q }
}

struct TrustView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        if let t = v.trust {
            VStack(alignment: .leading, spacing: 0) {
                if let r = t.result {
                    H1(r == "trust" ? "The table trusts" : "Doubt")
                    Sub(r == "trust" ? "Everyone chose Trust. The masks come off." : Words.plural(t.count, "player") + " doubted. Another Reckoning.")
                } else if !me.alive {
                    Eyebrow("trust or doubt"); H1("The survivors decide"); Sub("\(t.voted) of \(t.of) have chosen.")
                } else {
                    H1("Do you trust everyone left?")
                    Sub("If every survivor chooses Trust, the game ends and the masks come off. One Doubt, and there’s another Reckoning. No answer in time counts as Doubt.")
                    if let e = t.end { Clock(end: e).padding(.bottom, 12) }
                    if let m = t.mine {
                        DoneLine("handshake", Text("You chose ") + b(m.uppercased()) + Text(".\n") + Text("\(t.voted) of \(t.of) in.").font(Theme.ui(15)))
                    } else {
                        Columns(2) {
                            Button("Trust") { session.act("trust", "trust") }.btn(.verd, .big)
                            Button("Doubt") { session.act("trust", "doubt") }.btn(.blood, .big)
                        }
                    }
                }
            }
        }
    }
}

struct UnmaskList: View {
    let v: Snapshot
    var body: some View {
        if let u = v.unmask {
            VStack(spacing: 0) {
                ForEach(Array(u.order.enumerated()), id: \.offset) { i, id in
                    let p = v.player(id)
                    ScoreRow(player: p) {
                        if i < u.shown { points(p.forsworn ? "Forsworn" : "Loyal", color: p.forsworn ? Theme.blood2 : Theme.loyalSoft) }
                        else { points("…") }
                    }
                }
            }
        }
    }
}

struct HonourView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("the last betrayal")
            if !me.forsworn || !me.alive {
                H1("The Forsworn decide")
                Sub("They reached the end together. Now each chooses, in secret: share the prize, or betray the others for all of it.")
            } else {
                H1("Honour or betray?")
                Sub("If every Forsworn honours, you share the prize. One betrayer takes it all. Two or more betrayers, and nobody gets it. If you don’t choose in time, you honour.")
                if let e = v.honour?.end { Clock(end: e).padding(.bottom, 12) }
                if let m = v.honour?.mine { DoneLine("blade", Text("You chose ") + b(m.uppercased()) + Text(".")) }
                else {
                    Columns(2) {
                        Button("Honour") { session.act("honour", "honour") }.btn(.verd, .big)
                        Button("Betray") { session.act("honour", "betray") }.btn(.blood, .big)
                    }
                }
            }
        }
    }
}

struct EndView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    var body: some View {
        if let r = v.result {
            let fw = r.forsworn
            VStack(alignment: .leading, spacing: 0) {
                H1(fw ? "The Forsworn win" : "The Loyal win", disp: true)
                Sub(EndView.how(r))
                VStack(spacing: 0) {
                    Eyebrow(EndView.prizeHead(r))
                    Answer(Words.prize(r), center: true)
                    Small(EndView.purse(r), center: true)
                }
                .padding(.top, 18).padding(.bottom, 8)
                .overlay(alignment: .top) { DoubleRule() }
                .overlay(alignment: .bottom) { DoubleRule() }
                .padding(.bottom, 14)
                if me.won { Banner(.sanct, icon: "crown", "You won.") }
                if !r.peeked.isEmpty { Small("The host opened the roles in round " + r.peeked.map(String.init).joined(separator: ", ") + " (Tools, for when something went wrong).") }
                H2("Who was who", sec: true)
                VStack(spacing: 0) {
                    ForEach(v.players.sorted { ($0.forsworn ? 0 : 1) < ($1.forsworn ? 0 : 1) }) { p in
                        HStack(spacing: 10) {
                            Seal(p).frame(width: 30, height: 30)
                            (Text(p.name).foregroundColor(p.forsworn ? Color(hex: 0xF3C5D3) : Theme.tallow) + Text(p.alive ? "" : " out").font(Theme.ui(14)).foregroundColor(Theme.mist))
                                .font(Theme.ui(18)).frame(maxWidth: .infinity, alignment: .leading)
                            Text(p.forsworn ? "Forsworn" : "Loyal").font(Theme.sc(15)).tracking(0.45).foregroundStyle(p.forsworn ? Theme.blood2 : Theme.loyalSoft)
                        }
                        .padding(.vertical, 7)
                        .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule2).frame(height: 1) }
                    }
                }
                .overlay(alignment: .top) { Rectangle().fill(Theme.rule2).frame(height: 1) }
                .padding(.top, 6)
                if !r.awards.isEmpty {
                    H2("The awards", sec: true)
                    VStack(spacing: 0) {
                        ForEach(r.awards, id: \.title) { a in
                            HStack(spacing: 10) {
                                Seal(v.player(a.id)).frame(width: 30, height: 30)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(a.title).font(Theme.ui(18, .bold)).foregroundStyle(Theme.tallow)
                                    Text(a.name + " " + a.why).font(Theme.ui(15)).foregroundStyle(Theme.tallow2)
                                }
                                Spacer()
                            }
                            .padding(.vertical, 8)
                            .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule2).frame(height: 1) }
                        }
                    }
                }
                DirCard { Button("Play again with the same people") { session.confirm("Start a new game with the same players?", yes: "Play again") { session.act("again") } }.btn(.dark) }
            }
        }
    }
}

extension EndView {
    static func how(_ r: GameResult) -> String {
        if r.how == "betrayed" { return Words.andList(r.to) + " betrayed the others at the last, and takes it all." }
        if r.how == "nobody" { return "Too many betrayed, so nobody takes the prize." }
        return r.to.isEmpty ? "" : "The prize goes to " + Words.andList(r.to) + "."
    }
    static func prizeHead(_ r: GameResult) -> String {
        guard r.tier > 0 else { return "the prize" }
        let full: String = r.forsworn ? (r.pot <= 0 ? "an empty" : "a half-empty") : (r.pot >= r.cap ? "a full" : "a half-full")
        return "the prize · " + full + " Purse"
    }
    static func purse(_ r: GameResult) -> String {
        let s: String
        if r.forsworn { s = r.won > 0 ? "The Loyal built \(r.pot) of \(r.cap), so the Forsworn take the \(r.won) it fell short." : "The Loyal filled the Purse, so there was nothing left for the Forsworn to take." }
        else { s = "The Purse: \(r.pot) of \(r.cap)." }
        return s + (r.coins != nil ? " One coin for every 100 points." : "")
    }
}

// .card.prize's border: 3px double, in brass
struct DoubleRule: View {
    var body: some View { VStack(spacing: 1) { Rectangle().fill(Theme.brass).frame(height: 1); Rectangle().fill(Theme.brass).frame(height: 1) } }
}
