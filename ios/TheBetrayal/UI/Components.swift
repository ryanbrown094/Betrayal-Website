import SwiftUI

// The page's parts (src/modern.css), as views: .eyebrow, h1, .sub, .card, .banner, .done, .people, .pick, .clock, .bar …

struct Eyebrow: View {
    let text: String
    var size: CGFloat = 15
    var tv = false
    init(_ text: String, size: CGFloat = 15, tv: Bool = false) { self.text = text; self.size = size; self.tv = tv }
    var body: some View {
        Text(text.lowercased()).font(Theme.sc(size, fixed: tv)).tracking(size * 0.05).foregroundStyle(Theme.brass2)
            .padding(.bottom, tv ? 0 : 4)
    }
}

struct H1: View {
    let text: String
    var disp = false
    var color: Color? = nil
    init(_ text: String, disp: Bool = false, color: Color? = nil) { self.text = text; self.disp = disp; self.color = color }
    var body: some View {
        Text(text)
            .font(disp ? Theme.disp(40) : Theme.book(34))
            .foregroundStyle(color ?? (disp ? Theme.brass2 : Theme.tallow))
            .lineSpacing(-2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, 10)
    }
}

struct H2: View {
    let text: String
    var sec = false
    var first = false // the first thing in its card: no space above
    init(_ text: String, sec: Bool = false, first: Bool = false) { self.text = text; self.sec = sec; self.first = first }
    var body: some View {
        Text(text).font(Theme.book(sec ? 22 : 27)).foregroundStyle(sec ? Theme.brass2 : Theme.tallow)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, sec && !first ? 22 : 0).padding(.bottom, sec ? 4 : 10)
    }
}

struct Sub: View {
    let text: Text
    init(_ s: String) { text = Text(s) }
    init(_ t: Text) { text = t }
    var body: some View { text.font(Theme.ui(18)).foregroundStyle(Theme.tallow2).lineSpacing(3).fixedSize(horizontal: false, vertical: true).padding(.bottom, 12) }
}

struct Para: View {
    let text: Text
    init(_ s: String) { text = Text(s) }
    init(_ t: Text) { text = t }
    var body: some View { text.font(Theme.ui(18)).foregroundStyle(Theme.tallow).lineSpacing(3).fixedSize(horizontal: false, vertical: true).padding(.bottom, 12) }
}

struct Small: View {
    let text: Text
    var center = false
    init(_ s: String, center: Bool = false) { text = Text(s); self.center = center }
    init(_ t: Text, center: Bool = false) { text = t; self.center = center }
    var body: some View {
        text.font(Theme.ui(15)).foregroundStyle(Theme.tallow2).fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(center ? .center : .leading)
            .frame(maxWidth: .infinity, alignment: center ? .center : .leading)
            .padding(.bottom, 12)
    }
}

// bold words within a line, as the page's <b>
func bold(_ s: String) -> Text { Text(s).font(Theme.ui(18, .bold)) }
func b(_ s: String, size: CGFloat = 18) -> Text { Text(s).font(Theme.ui(size, .bold)) }

struct Question: View { // .q
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { Text(text).font(Theme.book(26)).foregroundStyle(Theme.tallow).fixedSize(horizontal: false, vertical: true).padding(.top, 6).padding(.bottom, 16) }
}

struct Answer: View { // .ans
    let text: String
    var center = false
    init(_ text: String, center: Bool = false) { self.text = text; self.center = center }
    var body: some View {
        Text(text).font(Theme.book(30)).monospacedDigit().foregroundStyle(Theme.brass2).fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(center ? .center : .leading)
            .frame(maxWidth: center ? .infinity : nil, alignment: center ? .center : .leading)
            .padding(.bottom, 12)
    }
}

// sections are ruled, not boxed: a line above, open space around (.card, .card.hot, .card.dir)
struct Card<Content: View>: View {
    enum Kind { case plain, hot, dir, role }
    var kind: Kind = .plain
    var center = false
    @ViewBuilder let content: Content
    init(_ kind: Kind = .plain, center: Bool = false, @ViewBuilder content: () -> Content) { self.kind = kind; self.center = center; self.content = content() }
    var body: some View {
        VStack(alignment: center ? .center : .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: center ? .center : .leading)
            .multilineTextAlignment(center ? .center : .leading)
            .padding(.top, kind == .dir ? 18 : kind == .role ? 28 : 16)
            .padding(.bottom, kind == .hot ? 12 : 4)
            .overlay(alignment: .top) { if kind != .role { Rectangle().fill(kind == .hot ? Theme.brass : kind == .dir ? Color(hex: 0x5B3A4F) : Theme.rule).frame(height: 1) } }
            .overlay(alignment: .bottom) { if kind == .hot { Rectangle().fill(Theme.brass).frame(height: 1) } }
            .padding(.top, kind == .dir ? 22 : 0)
            .padding(.bottom, 14)
    }
}

struct Banner: View {
    enum Kind { case plain, ghost, sanct }
    var kind: Kind = .plain
    var icon: String? = nil
    let text: Text
    init(_ kind: Kind = .plain, icon: String? = nil, _ text: Text) { self.kind = kind; self.icon = icon; self.text = text }
    init(_ kind: Kind = .plain, icon: String? = nil, _ s: String) { self.kind = kind; self.icon = icon; text = Text(s) }
    private var fg: Color { kind == .ghost ? Color(hex: 0xC4D2E4) : kind == .sanct ? Color(hex: 0xCFE9DE) : Theme.gold }
    private var rule: Color { kind == .ghost ? Color(hex: 0x33415A) : kind == .sanct ? Theme.verd2 : Theme.goldRule }
    private var bg: Color { kind == .ghost ? Color(hex: 0x121620) : kind == .sanct ? Color(hex: 0x0F2019) : .clear }
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let icon { Icon(name: icon).frame(width: 20, height: 20).padding(.top, 1) }
            text.font(Theme.ui(16)).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(fg)
        .padding(.vertical, 10)
        .background(bg)
        .overlay(alignment: .top) { Rectangle().fill(rule).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(rule).frame(height: 1) }
        .padding(.bottom, 14)
    }
}

// "Locked in", "Done", "You voted": the green-ruled line (.done)
struct DoneLine: View {
    let icon: String
    let text: Text
    init(_ icon: String, _ text: Text) { self.icon = icon; self.text = text }
    var body: some View {
        HStack(spacing: 12) {
            Icon(name: icon).frame(width: 26, height: 26).foregroundStyle(Theme.verd)
            text.font(Theme.ui(18)).foregroundStyle(Color(hex: 0xCFE9DE)).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .top) { Rectangle().fill(Theme.verd2).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.verd2).frame(height: 1) }
    }
}

// the players as a loose line of seals and names (.people)
struct People: View {
    let list: [Player]
    var mark: ((Player) -> Bool)? = nil
    var body: some View {
        Flow(spacing: 18, lineSpacing: 6) {
            ForEach(list) { p in
                let ok = mark?(p)
                HStack(spacing: 7) {
                    Seal(p).frame(width: 28, height: 28)
                    Text(p.name).font(Theme.ui(16, .bold)).strikethrough(!p.alive)
                    if ok == true { Text("✓").font(Theme.ui(16)).foregroundStyle(Theme.verd) }
                    if p.bot { Text("bot").font(Theme.ui(15)).foregroundStyle(Theme.tallow2) }
                }
                .foregroundStyle(Theme.tallow)
                .padding(.vertical, 3)
                .opacity(!p.alive ? 0.45 : ok == false ? 0.55 : 1)
            }
        }
    }
}

// players to choose between, two to a row (.pick)
struct PickGrid: View {
    let list: [Player]
    var on: (Player) -> Bool = { _ in false }
    var badge: ((Player) -> AnyView)? = nil
    let tap: (Player) -> Void
    @Environment(Session.self) private var session
    @State private var width: CGFloat = 390
    var body: some View {
        // a table with long names gets one column on a narrow phone, so no name is broken mid-word
        let cols = (session.view?.longNames ?? false) && width <= 328 ? 1 : 2
        Columns(cols, spacing: 10) {
            ForEach(list) { p in
                Button { tap(p) } label: {
                    HStack(spacing: 10) {
                        Seal(p).frame(width: 34, height: 34)
                        Text(p.name).font(Theme.ui(17)).lineLimit(2).minimumScaleFactor(0.85).frame(maxWidth: .infinity, alignment: .leading)
                        if let badge { badge(p) }
                    }
                    .foregroundStyle(Theme.tallow)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .frame(maxWidth: .infinity, minHeight: 58, maxHeight: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 4).fill(on(p) ? Color(hex: 0x2B1520) : Color(hex: 0x150D17)))
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(on(p) ? Theme.brass2 : Theme.edge2, lineWidth: on(p) ? 2 : 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .background(GeometryReader { g in Color.clear.onAppear { width = g.size.width }.onChange(of: g.size.width) { _, w in width = w } })
    }
}

// equal columns, each row as tall as its tallest (the page's CSS grids)
struct Columns: Layout {
    var cols: Int
    var spacing: CGFloat
    init(_ cols: Int, spacing: CGFloat = 10) { self.cols = max(1, cols); self.spacing = spacing }

    private func colWidth(_ w: CGFloat) -> CGFloat { max(0, (w - spacing * CGFloat(cols - 1)) / CGFloat(cols)) }
    private func rowHeights(_ cw: CGFloat, _ subviews: Subviews) -> [CGFloat] {
        stride(from: 0, to: subviews.count, by: cols).map { r in
            (r..<min(r + cols, subviews.count)).map { subviews[$0].sizeThatFits(ProposedViewSize(width: cw, height: nil)).height }.max() ?? 0
        }
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? 320, hs = rowHeights(colWidth(w), subviews)
        return CGSize(width: w, height: hs.reduce(0, +) + spacing * CGFloat(max(0, hs.count - 1)))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let cw = colWidth(bounds.width), hs = rowHeights(cw, subviews)
        var y = bounds.minY
        for (r, h) in hs.enumerated() {
            for c in 0..<cols {
                let i = r * cols + c
                guard i < subviews.count else { break }
                subviews[i].place(at: CGPoint(x: bounds.minX + CGFloat(c) * (cw + spacing), y: y), proposal: ProposedViewSize(width: cw, height: h))
            }
            y += h + spacing
        }
    }
}

// a countdown: minutes and seconds, red and pulsing in its last five (.clock)
struct Clock: View {
    @Environment(Session.self) private var session
    let end: Double?
    var size: CGFloat = 22
    var tv = false
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.2)) { ctx in
            let s = session.secondsLeft(end)
            let pulse = s <= 5 ? 0.775 + 0.225 * cos(ctx.date.timeIntervalSinceReferenceDate * 2 * .pi) : 1
            Text(Words.clock(s)).font(Theme.book(size, fixed: tv)).monospacedDigit()
                .foregroundStyle(s <= 5 ? Theme.blood2 : Theme.brass2)
                .opacity(pulse)
        }
    }
}

// the time left as a thin bar (.bar)
struct TimeBar: View {
    @Environment(Session.self) private var session
    let from: Double
    let end: Double
    var height: CGFloat = 4
    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { _ in
            let f = max(0, min(1, (end - session.gameNow()) / max(1, end - from)))
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color(hex: 0x2A1A2C))
                    Rectangle().fill(Theme.brass2).frame(width: g.size.width * f).animation(.linear(duration: 0.25), value: f)
                }
            }
            .frame(height: height)
        }
    }
}

// the Purse as a meter, with the prize tiers marked (.meter)
struct Meter: View {
    let pot: Int
    let cap: Int
    let tiers: Bool
    var height: CGFloat = 22
    var font: CGFloat = 14
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2).fill(Color(hex: 0x1B111D))
                Rectangle().fill(Theme.brass).frame(width: g.size.width * min(1, CGFloat(pot) / CGFloat(max(1, cap)))).animation(.easeOut(duration: 0.8), value: pot)
                if tiers { Rectangle().fill(.white.opacity(0.4)).frame(width: 2).offset(x: g.size.width / 2) }
                Text(verbatim: "\(pot) / \(cap)").font(Theme.ui(font, .bold, fixed: true)).foregroundStyle(.white).shadow(color: .black, radius: 1, y: 1)
                    .frame(maxWidth: .infinity)
            }
            .clipShape(RoundedRectangle(cornerRadius: 2))
            .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(Theme.edge2, lineWidth: 1))
        }
        .frame(height: height)
        .frame(minWidth: 200)
        .padding(.top, 8).padding(.bottom, 14)
        .accessibilityElement().accessibilityLabel("Purse \(pot) of \(cap)")
    }
}

// a line of score: seal, name, points (.score li)
struct ScoreRow<Trailing: View>: View {
    let player: Player
    var highlight = false
    @ViewBuilder let trailing: Trailing
    var body: some View {
        HStack(spacing: 10) {
            Seal(player).frame(width: 30, height: 30)
            Text(player.name).font(Theme.ui(18)).foregroundStyle(highlight ? Theme.brass2 : Theme.tallow)
            Spacer(minLength: 8)
            trailing
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.rule2).frame(height: 1) }
    }
}

func points(_ s: String, color: Color = Theme.brass2) -> some View { Text(s).font(Theme.ui(18, .bold)).foregroundStyle(color) }

// the Longest Word's twelve tiles (.letters)
struct Letters: View {
    let letters: String
    var body: some View {
        Columns(6, spacing: 6) {
            ForEach(Array(letters.enumerated()), id: \.offset) { _, c in
                Text(String(c)).font(Theme.book(26)).foregroundStyle(Theme.parchmentInk)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(RoundedRectangle(cornerRadius: 3).fill(Theme.parchment))
                    .aspectRatio(1, contentMode: .fit)
            }
        }
        .padding(.bottom, 14)
    }
}

// Memory Wall's words (.words)
struct WordWall: View {
    let words: [String]
    var body: some View {
        Columns(3, spacing: 8) {
            ForEach(Array(words.enumerated()), id: \.offset) { _, w in
                Text(w).font(Theme.ui(17)).foregroundStyle(Theme.tallow).lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity).padding(.vertical, 10).padding(.horizontal, 4)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color(hex: 0x33203A)).frame(height: 1) }
            }
        }
    }
}

// What Changed?'s grid of symbols (.cells)
struct Cells: View {
    let grid: [String]
    var tap: ((Int) -> Void)? = nil
    var mine: Int? = nil
    var hit: [Int] = []
    var blank = false
    var body: some View {
        Columns(4, spacing: 8) {
            ForEach(Array((blank ? Array(repeating: "", count: 12) : grid).enumerated()), id: \.offset) { i, c in
                let cell = ZStack {
                    RoundedRectangle(cornerRadius: 4).fill(blank ? Color(hex: 0x120B13) : hit.contains(i) ? Color(hex: 0x10261E) : Color(hex: 0x1B111D))
                    RoundedRectangle(cornerRadius: 4).strokeBorder(hit.contains(i) ? Theme.verd : Theme.edge2, lineWidth: 1)
                    if mine == i { RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.brass2, lineWidth: 2) }
                    if !blank { GeometryReader { g in Icon(name: c).frame(width: g.size.width * 0.58, height: g.size.height * 0.58).position(x: g.size.width / 2, y: g.size.height / 2) } }
                }
                .foregroundStyle(hit.contains(i) ? Color(hex: 0xBFEADB) : Theme.brass2)
                .aspectRatio(1, contentMode: .fit)
                if let tap { Button { tap(i) } label: { cell }.buttonStyle(.plain).accessibilityLabel(c) } else { cell }
            }
        }
    }
}

// the crest, breathing, while someone else decides (.waiting)
struct Waiting: View {
    let who: String
    let line: String
    @State private var breathe = false
    var body: some View {
        VStack(spacing: 6) {
            Crest().frame(width: 40, height: 48).foregroundStyle(Theme.brass2)
                .opacity(breathe ? 0.45 : 1).scaleEffect(breathe ? 0.94 : 1)
                .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { breathe = true } }
            Text("Waiting for " + who).font(Theme.ui(18)).foregroundStyle(Theme.tallow2)
            Text(line).font(Theme.bookItalic(18)).foregroundStyle(Theme.mist)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 22).padding(.bottom, 8)
    }
}

// a fold that opens on a tap (details.more)
struct More<Content: View>: View {
    let title: String
    @State private var open: Bool
    @ViewBuilder let content: Content
    init(_ title: String, open: Bool = false, @ViewBuilder content: () -> Content) { self.title = title; _open = State(initialValue: open); self.content = content() }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.easeOut(duration: 0.2)) { open.toggle() } } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).rotationEffect(.degrees(open ? 90 : 0))
                    Text(title).font(Theme.ui(15))
                }
                .foregroundStyle(Theme.tallow2)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { content }
        }
        .padding(.top, 10)
    }
}

// last words, as a quotation (.lastw)
struct LastWords: View {
    let name: String
    let words: String
    var tv = false
    var vh: CGFloat = 8
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("“" + words + "”").font(Theme.bookItalic(tv ? 4 * vh : 20, fixed: tv)).foregroundStyle(Theme.tallow).fixedSize(horizontal: false, vertical: true)
            Text(name + "’s last words").font(Theme.sc(tv ? 2.2 * vh : 14, fixed: tv)).tracking(0.4).foregroundStyle(Theme.tallow2)
        }
        .padding(.leading, tv ? 3 * vh : 18).padding(.vertical, tv ? 2 * vh : 4)
        .overlay(alignment: .leading) { Rectangle().fill(Theme.brass).frame(width: 2) }
        .frame(maxWidth: tv ? vh * 120 : .infinity, alignment: .leading)
        .padding(.vertical, tv ? 0 : 14)
    }
}

// a text field as the page draws them (input.f)
struct Field: View {
    let placeholder: String
    @Binding var text: String
    var number = false
    var code = false
    var max = 80
    var submit: () -> Void = {}
    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.tallow2.opacity(0.45)))
            .font(code ? Theme.ui(28, .bold) : Theme.ui(20))
            .tracking(code ? 8 : 0)
            .multilineTextAlignment(code ? .center : .leading)
            .textInputAutocapitalization(code ? .characters : number ? .never : .sentences)
            .autocorrectionDisabled()
            .keyboardType(number ? .decimalPad : code ? .asciiCapable : .default)
            .submitLabel(.send)
            .onSubmit(submit)
            .foregroundStyle(Theme.tallow)
            .tint(Theme.brass2)
            .padding(.horizontal, 14)
            .frame(minHeight: 54)
            .background(RoundedRectangle(cornerRadius: 4).fill(Theme.field))
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.edge, lineWidth: 1))
            .onChange(of: text) { _, v in
                let clean = code ? Codes.clean(v) : String(v.prefix(max))
                if clean != v { text = clean }
            }
    }
}

struct Label2: View { // label.l
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { Text(text).font(Theme.ui(15, .bold)).foregroundStyle(Theme.tallow2).padding(.bottom, 6).frame(maxWidth: .infinity, alignment: .leading) }
}

// ---------------------------------------------------------------------------------------------------------------
// a line of things that wraps, like the page's flex-wrap
struct Flow: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8
    var center = false

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews)
        let w = rows.map { $0.width }.max() ?? 0
        let h = rows.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? w, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews) {
            var x = center ? bounds.minX + (bounds.width - row.width) / 2 : bounds.minX
            for (i, size) in row.items {
                subviews[i].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row { var items: [(Int, CGSize)] = []; var width: CGFloat = 0; var height: CGFloat = 0 }
    private func arrange(width: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows: [Row] = [], row = Row()
        for (i, v) in subviews.enumerated() {
            var s = v.sizeThatFits(.unspecified)
            if s.width > width { s = v.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
            if !row.items.isEmpty && row.width + spacing + s.width > width { rows.append(row); row = Row() }
            row.width += (row.items.isEmpty ? 0 : spacing) + s.width
            row.height = max(row.height, s.height)
            row.items.append((i, s))
        }
        if !row.items.isEmpty { rows.append(row) }
        return rows
    }
}
