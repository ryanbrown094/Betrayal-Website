import SwiftUI

// The start screen: join a Table with its code, or open your own with a booking code. It does what the website's
// home page does (site/index.html: open, go, subChoice), without the website's prices or links.
struct HomeView: View {
    @State private var path: [GameTarget] = []
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
                VStack(spacing: 0) {
                    header
                    if let recent { tonight(recent) }
                    joinSection
                    hostSection
                    Text("Everyone plays on their own phone, the host included. Best with 8 to 16 players.")
                        .font(Theme.ui(15)).foregroundStyle(Theme.tallow2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 24)
                }
                .padding(.horizontal, 20)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(backdrop)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: GameTarget.self) { GameView(target: $0) }
        }
        .onChange(of: path) { _, now in if now.isEmpty { recent = Recent.room } }
        .confirmationDialog(question?.title ?? "", isPresented: Binding(get: { question != nil }, set: { if !$0 { question = nil } }), titleVisibility: .visible, presenting: question) { q in
            switch q {
            case .regular(let room, let pass):
                Button("Carry on") { Task { await go(room: room, pass: pass, test: false) } }
                Button("Start a new game", role: .destructive) { Task { await open(pass: pass, fresh: true) } }
            case .test(let room, let pass):
                Button("Play Modern") { path.append(GameTarget(room: room, start: .create, pass: pass)) }
                Button("Play against bots") { path.append(GameTarget(room: room, start: .bots)) }
            }
        } message: { q in
            Text(q.message)
        }
        .alert("That didn’t work", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(problem ?? "")
        }
        .onAppear(perform: debugLaunch)
    }

    private var header: some View {
        VStack(spacing: 14) {
            Image("Crest").resizable().scaledToFit().frame(height: 110).accessibilityHidden(true)
            Image("Wordmark").resizable().scaledToFit().frame(maxWidth: 300).accessibilityLabel("The Betrayal")
            Text("Everyone swore an oath. Not everyone meant it.")
                .font(Theme.bookItalic(21)).foregroundStyle(Theme.tallow)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 36)
        .padding(.bottom, 28)
    }

    private func tonight(_ room: String) -> some View {
        section("tonight", title: "Table \(room)", note: "Your last Table is still open.") {
            Button("Back to the game") { path.append(GameTarget(room: room)) }.buttonStyle(BrandButton())
        }
    }

    private var joinSection: some View {
        section("play", title: "Join a game", note: "Type the Table code from the host’s phone or the TV.") {
            CodeField(placeholder: "ABC123", text: $tableCode, maxLength: 6, submit: join)
            Button("Join", action: join).buttonStyle(BrandButton()).disabled(!Tables.isRoom(tableCode))
        }
    }

    private var hostSection: some View {
        section("host", title: "Host a game", note: "Enter your booking code to open your Table. It stays open for 48 hours from when you first open it.") {
            CodeField(placeholder: "OATH-XXXX-XXXX", text: $bookingCode, maxLength: 24, spacing: 2, submit: host)
            Button(busy ? "Opening…" : "Open my Table", action: host)
                .buttonStyle(BrandButton(kind: .ghost))
                .disabled(busy || bookingCode.count < 4)
        }
    }

    // a section as the game draws them (.eyebrow, h2 and .sub in modern.css): ruled above, open space around
    private func section<Content: View>(_ eyebrow: String, title: String, note: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow).font(Theme.sc(15)).foregroundStyle(Theme.brass2)
                Text(title).font(Theme.book(28)).foregroundStyle(Theme.tallow)
                Text(note).font(Theme.ui(17)).foregroundStyle(Theme.tallow2).fixedSize(horizontal: false, vertical: true)
            }
            content()
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Theme.rule).frame(height: 1) }
    }

    private var backdrop: some View {
        RadialGradient(colors: [Theme.dusk, Theme.soot], center: .top, startRadius: 0, endRadius: 560)
            .background(Theme.soot)
            .ignoresSafeArea()
    }

    private func join() {
        guard Tables.isRoom(tableCode) else { return }
        path.append(GameTarget(room: tableCode))
    }

    private func host() {
        let pass = bookingCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pass.count >= 4, !busy else { return }
        Task { await open(pass: pass, fresh: false) }
    }

    @MainActor private func open(pass: String, fresh: Bool) async {
        busy = true
        defer { busy = false }
        do {
            let t = try await Tables.open(pass: pass, fresh: fresh)
            if t.sub && t.again { question = .regular(room: t.room, pass: pass); return }
            await go(room: t.room, pass: pass, test: t.test)
        } catch {
            problem = error.localizedDescription
        }
    }

    // a Table plays Modern or Classic, chosen once; the app plays Modern, so a new Table is set up as Modern
    @MainActor private func go(room: String, pass: String, test: Bool) async {
        switch await Tables.mode(of: room) {
        case .modern:
            path.append(GameTarget(room: room))
        case .classic:
            problem = "This Table is set up for Classic, which plays on a laptop and a TV rather than in the app."
        case .unset:
            if test { question = .test(room: room, pass: pass) } else { path.append(GameTarget(room: room, start: .create, pass: pass)) }
        }
    }

    private static var launched = false
    // the CI's screenshots (.github/workflows/ios.yml): -open ROOM opens a Table as a player, -selftest the bridge check
    private func debugLaunch() {
        #if DEBUG
        guard !Self.launched else { return }
        Self.launched = true
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-open"), i + 1 < args.count { path = [GameTarget(room: args[i + 1])] }
        if args.contains("-selftest") { path = [GameTarget(room: "SELFTE", pass: "TESTPASS", selfTest: true)] }
        #endif
    }
}
