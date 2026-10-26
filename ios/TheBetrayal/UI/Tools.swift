import SwiftUI

// The host's tools: for when something goes wrong. Each asks first; the roles ask three times, and everyone is told at
// the end that the host looked (toolScreen() and peekScreen() in src/modern-ui.js).
struct ToolsView: View {
    let v: Snapshot
    let me: Me
    @Environment(Session.self) private var session
    @State private var sound = Sound.shared.enabled && !Sound.shared.muted

    private struct Tool: Identifiable { let label: String; let v: String; let why: String; var id: String { v + label } }
    private static let asks = ["endTrial": "End this Trial now?", "closeVote": "Close the vote now?", "dawnNow": "End the night now?", "deal": "Deal the roles now?", "skipStep": "Skip this step?"]

    private var tools: [Tool] {
        var l: [Tool] = []
        let t = v.trial, it = t?.item
        if v.phase == "oath" { l.append(Tool(label: "Deal the roles now", v: "deal", why: "For anyone who hasn’t answered the Oath: they’re dealt in as “either way”.")) }
        if v.phase == "roles" { l.append(Tool(label: "Begin the game", v: "begin", why: "As if everyone had tapped “Got it”.")) }
        if v.phase == "day" && me.canSkip { l.append(Tool(label: "Skip “" + (v.next ?? "") + "”", v: "skipStep", why: "Leave it out and go to the next step.")) }
        if t?.stage == "intro" { l.append(Tool(label: "Start the Trial now", v: "skip", why: "Skip the rest of the introduction.")) }
        if let it, it.isOpenish { l.append(Tool(label: "Close this question now", v: "skip", why: "Whatever has been answered counts.")) }
        if let t, t.stage != "done" { l.append(Tool(label: "End this Trial now", v: "endTrial", why: "It’s scored as it stands.")) }
        if v.phase == "talk" { l.append(Tool(label: "Open the vote now", v: "voteNow", why: "Cut the talking short.")) }
        if v.phase == "vote" { l.append(Tool(label: "Close the vote now", v: "closeVote", why: "Counts the votes in; nobody else can vote.")) }
        if v.phase == "night" { l.append(Tool(label: "End the night now", v: "dawnNow", why: "Anyone who hasn’t chosen is chosen for.")) }
        return l
    }

    var body: some View {
        let others = v.players.filter { $0.id != me.id }
        VStack(alignment: .leading, spacing: 0) {
            H2("Host tools")
            Sub("For when something goes wrong. Nothing here shows you anyone’s role, except the last one.")
            let list = tools
            if list.isEmpty { Small("Nothing to fix at this moment.") }
            ForEach(list) { tool in
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(tool.label).font(Theme.ui(18, .bold)).foregroundStyle(Theme.tallow)
                        Text(tool.why).font(Theme.ui(15)).foregroundStyle(Theme.tallow2).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Do it") { run(tool.v, who: nil) }.btn(.dark, .sm, fit: true)
                }
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule2).frame(height: 1) }
            }
            More("Take someone out of the game") {
                Small("If someone is ill or has to go home. They leave for good, and nobody is told their role. If nobody Forsworn is left, the final begins.")
                PickGrid(list: others) { p in run("remove", who: p) }
            }
            More("Make someone else the host") {
                Small("Their phone gets these controls, and yours loses them.")
                PickGrid(list: others) { p in run("host", who: p) }
            }
            More("Music on this phone") {
                Small("If there’s no TV, this phone can play the music and sounds.")
                Button(!Sound.shared.enabled || !Sound.shared.follows(session) ? "Play music here" : Sound.shared.muted ? "Sound on" : "Sound off") {
                    if Sound.shared.follows(session) { Sound.shared.toggleMute() } else { Sound.shared.enable(for: session) }
                    sound.toggle()
                }
                .btn(.dark, .sm, fit: true)
            }
            VStack(alignment: .leading, spacing: 0) {
                Small(Text("The last resort.").font(Theme.ui(15, .bold)).foregroundColor(Theme.blood2) + Text(" Only if the game can’t carry on otherwise, say a phone died and nobody remembers who was Forsworn."))
                Button("Show me the roles…", action: peek).btn(.ghost, .sm, fit: true)
            }
            .padding(.top, 16).padding(.bottom, 4)
            .overlay(alignment: .top) { Rectangle().fill(Color(hex: 0x6A2733)).frame(height: 1) }
            .padding(.top, 18)
        }
    }

    private func run(_ tool: String, who: Player?) {
        let go = {
            session.tools = false
            var req: [String: Any] = ["a": "tool", "v": tool]
            if let who { req["who"] = who.id }
            session.send(req)
        }
        let q = tool == "remove" ? "Take " + (who?.name ?? "") + " out of the game? They can’t come back."
            : tool == "host" ? "Make " + (who?.name ?? "") + " the host? Your phone loses these controls." : ToolsView.asks[tool]
        if let q { session.confirm(q, then: go) } else { go() }
    }

    private func peek() {
        session.confirm("Show you every player’s role? This spoils the game for you, and should only be used if the game can’t carry on otherwise.", yes: "Carry on") {
            session.confirm("Everyone will be told at the end of the game that the host looked at the roles. Carry on?", yes: "Carry on") {
                session.ask = Session.Ask(title: "Last check", message: "Type SHOW THE ROLES to see them.", yes: "Show me", typed: true) { typed in
                    session.send(["a": "tool", "v": "roles", "sure": typed.trimmingCharacters(in: .whitespaces).uppercased()])
                }
            }
        }
    }
}

struct PeekView: View {
    let list: [Peek]
    @Environment(Session.self) private var session
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            H2("Everyone’s role")
            Sub("Put this away as soon as you can. Everyone will be told at the end that you looked.")
            VStack(spacing: 0) {
                ForEach(list) { p in
                    HStack {
                        Text(p.name + (p.alive ? "" : " (out)")).font(Theme.ui(18)).foregroundStyle(Theme.tallow)
                        Spacer()
                        points(p.role == "f" ? "Forsworn" : "Loyal", color: p.role == "f" ? Theme.blood2 : Theme.loyal)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule2).frame(height: 1) }
                }
            }
            Spacer().frame(height: 14)
            Button("Hide them") { session.peekList = nil; session.tools = false }.btn(.fill, .big)
        }
    }
}
