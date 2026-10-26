import SwiftUI

// What the start screen opens: a Table, and how (as a player, as the host setting it up, or as the TV)
struct Target: Hashable {
    enum Start: Hashable { case play, create, bots, tv }
    let room: String
    var start: Start = .play
    var pass: String? = nil
}

// The start screen: join a Table with its code, or open your own with a booking code. The same calls as the website's
// home page (site/index.html: open, go, subChoice), without its prices or links to them (App Store rule 3.1.1).
struct HomeView: View {
    @State private var path: [Target] = []
    @State private var tableCode = ""
    @State private var bookingCode = ""
    @State private var busy = false
    @State private var problem: String?
    @State private var question: Question?
    @State private var recent = Recent.room

    enum Question {
        case regular(room: String, pass: String) // a Regular whose last game is still open
        case test(room: String, pass: String)    // the master code's test Table
        var title: String {
            switch self {
            case .regular: return "You have a game open"
            case .test: return "A test Table"
            }
        }
        var message: String {
            switch self {
            case .regular: return "Carry on with it, or start a new one? A new game closes the one that’s open."
            case .test: return "Play Modern with real phones, or against bots that play by themselves."
            }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                Column {
                    header
                    if let recent { tonight(recent) }
                    join
                    host
                    Small("Everyone plays on their own phone, the host included. Best with 8 to 16 players.").padding(.vertical, 12)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Backdrop())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Target.self) { t in TableView(session: AppModel.shared.session(for: t)) }
        }
        .onChange(of: path) { _, now in if now.isEmpty { recent = Recent.room } }
        .confirmationDialog(question?.title ?? "", isPresented: Binding(get: { question != nil }, set: { if !$0 { question = nil } }), titleVisibility: .visible, presenting: question) { q in
            switch q {
            case .regular(let room, let pass):
                Button("Carry on") { Task { await go(room: room, pass: pass, test: false) } }
                Button("Start a new game", role: .destructive) { Task { await open(pass: pass, fresh: true) } }
            case .test(let room, let pass):
                Button("Play Modern") { path.append(Target(room: room, start: .create, pass: pass)) }
                Button("Play against bots") { path.append(Target(room: room, start: .bots, pass: pass)) }
            }
        } message: { q in Text(q.message) }
        .alert("That didn’t work", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(problem ?? "") }
    }

    private var header: some View {
        VStack(spacing: 10) {
            Crest().frame(width: 96, height: 112).foregroundStyle(Theme.brass2)
            Text("The Betrayal").font(Theme.disp(52)).foregroundStyle(Theme.brass2)
            Text("Everyone swore an oath. Not everyone meant it.").font(Theme.bookItalic(21)).foregroundStyle(Theme.tallow).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 30).padding(.bottom, 26)
    }

    private func tonight(_ room: String) -> some View {
        Card {
            Eyebrow("tonight")
            H2("Table \(room)")
            Sub("Your last Table is still open.")
            Button("Back to the game") { path.append(Target(room: room)) }.btn(.fill)
        }
    }

    private var join: some View {
        Card {
            Eyebrow("play")
            H2("Join a game")
            Sub("Type the Table code from the host’s phone or the TV.")
            VStack(spacing: 10) {
                Field(placeholder: "ABC123", text: $tableCode, code: true, submit: joinTable)
                Button("Join", action: joinTable).btn(.fill).disabled(!Codes.isRoom(tableCode))
                Button("Use this screen as the TV") { if Codes.isRoom(tableCode) { path.append(Target(room: tableCode, start: .tv)) } }
                    .btn(.ghost, .sm).disabled(!Codes.isRoom(tableCode))
            }
        }
    }

    private var host: some View {
        Card {
            Eyebrow("host")
            H2("Host a game")
            Sub("Enter your booking code to open your Table. It stays open for 48 hours from when you first open it.")
            VStack(spacing: 10) {
                BookingField(text: $bookingCode, submit: hostTable)
                Button(busy ? "Opening…" : "Open my Table", action: hostTable).btn(.ghost).disabled(busy || bookingCode.count < 4)
            }
        }
    }

    private func joinTable() {
        guard Codes.isRoom(tableCode) else { return }
        let room = tableCode
        Task {
            if await API.mode(of: room) == .classic { problem = "This Table plays Classic, which runs on a laptop and a TV from the website rather than in the app."; return }
            path.append(Target(room: room))
        }
    }

    private func hostTable() {
        let pass = bookingCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pass.count >= 4, !busy else { return }
        Task { await open(pass: pass, fresh: false) }
    }

    private func open(pass: String, fresh: Bool) async {
        busy = true
        defer { busy = false }
        do {
            let t = try await API.open(pass: pass, fresh: fresh)
            if t.sub && t.again { question = .regular(room: t.room, pass: pass); return }
            await go(room: t.room, pass: pass, test: t.test)
        } catch { problem = error.localizedDescription }
    }

    // a Table plays Modern or Classic, chosen once; the app plays Modern, so a new Table is set up as Modern
    private func go(room: String, pass: String, test: Bool) async {
        switch await API.mode(of: room) {
        case .modern: path.append(Target(room: room))
        case .classic: problem = "This Table is set up for Classic, which plays on a laptop and a TV from the website rather than in the app."
        case .unset: if test { question = .test(room: room, pass: pass) } else { path.append(Target(room: room, start: .create, pass: pass)) }
        }
    }
}

// the booking code: OATH-XXXX-XXXX, typed any way
private struct BookingField: View {
    @Binding var text: String
    let submit: () -> Void
    var body: some View {
        TextField("", text: $text, prompt: Text("OATH-XXXX-XXXX").foregroundColor(Theme.tallow2.opacity(0.45)))
            .font(Theme.ui(24, .bold)).tracking(2).multilineTextAlignment(.center)
            .textInputAutocapitalization(.characters).autocorrectionDisabled().keyboardType(.asciiCapable)
            .submitLabel(.go).onSubmit(submit)
            .foregroundStyle(Theme.tallow).tint(Theme.brass2)
            .padding(.horizontal, 12).frame(minHeight: 58)
            .background(RoundedRectangle(cornerRadius: 4).fill(Theme.field))
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.edge, lineWidth: 1))
            .onChange(of: text) { _, v in
                let clean = String(v.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }.prefix(24))
                if clean != v { text = clean }
            }
    }
}
