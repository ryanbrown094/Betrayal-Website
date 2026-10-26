#if DEBUG
import SwiftUI

// A Debug build can show the game without a server, for the CI's screenshots (.github/workflows/ios-native.yml):
//   -demo NAME [-tv]   one moment of Fixtures.json (ios/tools/fixtures.mjs), as that phone saw it, or as the TV did
//   -render-all        every moment, phone and TV, drawn to Documents/shots/*.png, then Documents/shots/done
//   -art               every drawing, for comparing with the website's
//   -play ROOM TOKEN   a Table as the player that token belongs to (with -server URL, the CI's local Worker)
enum Demo {
    static let fixtures: [String: JSON] = {
        guard let url = Bundle.main.url(forResource: "Fixtures", withExtension: "json"), let d = try? Data(contentsOf: url), let j = try? JSON(data: d) else { return [:] }
        return j.object
    }()

    @MainActor static let launch: AnyView? = {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-art") { return AnyView(ArtSheet()) }
        if args.contains("-render-all") { return AnyView(RenderAll()) }
        if let i = args.firstIndex(of: "-play"), i + 2 < args.count {
            let room = args[i + 1]
            UserDefaults.standard.set(args[i + 2], forKey: Session.tokKey(room))
            return AnyView(NavigationStack { TableView(session: AppModel.shared.session(for: Target(room: room))) })
        }
        if let i = args.firstIndex(of: "-demo"), i + 1 < args.count, let s = session(args[i + 1], tv: args.contains("-tv")) {
            return AnyView(TableView(session: s))
        }
        return nil
    }()

    @MainActor static func session(_ name: String, tv: Bool) -> Session? {
        guard let f = fixtures[name], let v = Snapshot(tv || f["phone"].isNull ? f["tv"] : f["phone"]) else { return nil }
        let s = Session(room: f["code"].string ?? "K7Q2XM", screen: tv || f["phone"].isNull ? .tv : .play)
        let peek = f["peekList"].isNull ? nil : f["peekList"].array.map { Peek(name: $0["name"].string ?? "?", role: $0["role"].string, alive: $0["alive"].bool ?? true) }
        let rejoin = f["rejoin"].array.map { Rejoin(id: $0["id"].string ?? "", name: $0["name"].string ?? "?") }
        s.show(v, rejoin: rejoin, peek: peek, tools: f["tools"].bool ?? false, rolePeek: f["peek"].bool ?? false)
        return s
    }
}

// every moment drawn to a picture: the phone at 390 points wide, the TV at 1280 × 720
private struct RenderAll: View {
    @State private var done = 0
    var body: some View {
        ZStack {
            Backdrop()
            Text("Rendering \(done) of \(Demo.fixtures.count)…").font(Theme.ui(18)).foregroundStyle(Theme.tallow)
        }
        .task { await render() }
    }

    @MainActor private func render() async {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("shots")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for name in Demo.fixtures.keys.sorted() {
            if let s = Demo.session(name, tv: false), !s.isTV {
                let r = ImageRenderer(content: PhonePicture(session: s))
                r.proposedSize = ProposedViewSize(width: 390, height: nil)
                r.scale = 1.5
                if let png = r.uiImage?.pngData() { try? png.write(to: dir.appendingPathComponent("phone-" + name + ".png")) }
            }
            if let s = Demo.session(name, tv: true) {
                let r = ImageRenderer(content: TVView().environment(s).frame(width: 1280, height: 720))
                r.scale = 1
                if let png = r.uiImage?.pngData() { try? png.write(to: dir.appendingPathComponent("tv-" + name + ".png")) }
            }
            done += 1
            await Task.yield()
        }
        try? Data("ok".utf8).write(to: dir.appendingPathComponent("done"))
    }
}

private struct PhonePicture: View {
    let session: Session
    var body: some View {
        PlayView()
            .environment(session)
            .environment(\.rendering, true)
            .frame(width: 390)
            .background(Backdrop())
    }
}

// every icon, the seals and the crest, for setting beside the website's (src/art.js)
private struct ArtSheet: View {
    var body: some View {
        ZStack {
            Backdrop()
            VStack(spacing: 18) {
                Crest().frame(width: 120, height: 140).foregroundStyle(Theme.brass2)
                Columns(6, spacing: 12) {
                    ForEach(Art.icons.keys.sorted(), id: \.self) { n in
                        VStack(spacing: 4) { Icon(name: n).frame(width: 44, height: 44); Text(n).font(Theme.ui(11)) }.foregroundStyle(Theme.brass2)
                    }
                }
                HStack(spacing: 10) {
                    ForEach(["#e3b53c", "#4f93dc", "#e87a45", "#37b87f", "#b06ae0", "#e5436f"], id: \.self) { c in Seal(name: "Annie", color: c).frame(width: 52, height: 52) }
                }
                HStack(spacing: 14) {
                    BigSeal(kind: .forsworn, icon: "blade").frame(width: 100, height: 100)
                    BigSeal(kind: .loyal, icon: "candle").frame(width: 100, height: 100)
                    BigSeal(kind: .steel, icon: "scales").frame(width: 100, height: 100)
                }
                Text("The Betrayal").font(Theme.disp(44)).foregroundStyle(Theme.brass2)
                Text("IM Fell · the Reckoning").font(Theme.book(26)).foregroundStyle(Theme.tallow)
                Text("ALEGREYA SANS SC · Alegreya Sans").font(Theme.ui(18)).foregroundStyle(Theme.tallow2)
            }
            .padding(16)
        }
    }
}
#endif
