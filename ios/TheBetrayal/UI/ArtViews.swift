import SwiftUI

// The art of src/art.js on screen. Each draws in its own SVG units, scaled to the frame it's given.
struct Icon: View {
    let name: String
    var body: some View {
        Canvas { ctx, size in
            let k = min(size.width, size.height) / 64
            ctx.translateBy(x: (size.width - 64 * k) / 2, y: (size.height - 64 * k) / 2)
            ctx.scaleBy(x: k, y: k)
            paint(Art.iconParts[name] ?? [], in: &ctx, width: 2.4, shading: .foreground)
        }
        .accessibilityHidden(true)
    }
}

// a player's seal: their colour in wax, their initial pressed into it (ART.seal)
struct Seal: View {
    let name: String
    let color: String
    init(_ p: Player) { name = p.name; color = p.color }
    init(name: String, color: String) { self.name = name; self.color = color }

    var body: some View {
        let ch = String(name.trimmingCharacters(in: .whitespaces).first ?? "?").uppercased()
        Canvas { ctx, size in
            ctx.scaleBy(x: size.width / 100, y: size.height / 100)
            wax(&ctx, blob: Art.blob, color: Theme.wax(color), shadow: CGRect(x: 7, y: 13, width: 88, height: 84), shadowOpacity: 0.5, ring: 31, ringWidth: 3, ringFill: 0.05, ringStroke: 0.26, ringHi: 1.6, glint: (32, 24, 13, 0.32))
            letter(&ctx, ch, at: CGPoint(x: 51, y: 67.5), color: .white.opacity(0.3))
            letter(&ctx, ch, at: CGPoint(x: 50, y: 66), color: .black.opacity(0.5))
        }
        .accessibilityHidden(true)
    }

    private func letter(_ ctx: inout GraphicsContext, _ ch: String, at p: CGPoint, color: Color) {
        let t = ctx.resolve(Text(ch).font(.custom("GrenzeGotisch-SemiBold", fixedSize: 46)).foregroundColor(color))
        let box = t.measure(in: CGSize(width: 200, height: 200)), base = t.firstBaseline(in: box)
        ctx.draw(t, in: CGRect(x: p.x - box.width / 2, y: p.y - base, width: box.width, height: box.height))
    }
}

// a large seal with an icon pressed into it: the role card and the exile's verdict (ART.bigSeal)
struct BigSeal: View {
    enum Kind { case forsworn, loyal, steel }
    let kind: Kind
    let icon: String

    var body: some View {
        Canvas { ctx, size in
            ctx.scaleBy(x: size.width / 100, y: size.height / 100)
            let c: Color = kind == .forsworn ? Color(hex: 0x8E1B45) : kind == .loyal ? Color(hex: 0x2E7A62) : Color(hex: 0x51657C)
            wax(&ctx, blob: Art.blob2, color: c, shadow: CGRect(x: 6, y: 13, width: 90, height: 86), shadowOpacity: 0.55, ring: 33, ringWidth: 2.6, ringFill: 0.1, ringStroke: 0.35, ringHi: 1.4, glint: nil)
            let parts = Art.iconParts[icon] ?? []
            for (dx, dy, tone, fill, line) in [(29.6, 30.6, Color.white, 0.3, 0.32), (29.0, 30.0, Color.black, 0.55, 0.58)] {
                var g = ctx
                g.translateBy(x: dx, y: dy)
                g.scaleBy(x: 0.64, y: 0.64)
                for part in parts {
                    if let f = part.fill { g.fill(Path(part.path), with: .color(tone.opacity(fill * f))) }
                    if part.stroke { g.stroke(Path(part.path), with: .color(tone.opacity(line)), style: StrokeStyle(lineWidth: 3.4, lineCap: .round, lineJoin: .round)) }
                }
            }
            glint(&ctx, x: 31, y: 23, rx: 14, opacity: 0.2)
        }
        .accessibilityHidden(true)
    }
}

// the house crest (ART.crest), in the current colour
struct Crest: View {
    var body: some View {
        Canvas { ctx, size in
            let k = min(size.width / 120, size.height / 140)
            ctx.translateBy(x: (size.width - 120 * k) / 2, y: (size.height - 140 * k) / 2)
            ctx.scaleBy(x: k, y: k)
            paint(Art.crestParts, in: &ctx, width: 2, shading: .foreground)
        }
        .aspectRatio(120 / 140, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

// ---------------------------------------------------------------------------------------------------------------
private func paint(_ parts: [Art.Part], in ctx: inout GraphicsContext, width: CGFloat, shading: GraphicsContext.Shading) {
    for part in parts {
        if let f = part.fill {
            var g = ctx
            g.opacity = f
            g.fill(Path(part.path), with: shading)
        }
        if part.stroke { ctx.stroke(Path(part.path), with: shading, style: StrokeStyle(lineWidth: part.width ?? width, lineCap: .round, lineJoin: .round)) }
    }
}

// the wax itself: its shadow, the colour, the light across it (#g-wax), the pressed ring and a glint
private func wax(_ ctx: inout GraphicsContext, blob: CGPath, color: Color, shadow: CGRect, shadowOpacity: Double, ring: CGFloat, ringWidth: CGFloat, ringFill: Double, ringStroke: Double, ringHi: CGFloat, glint g: (CGFloat, CGFloat, CGFloat, Double)?) {
    ctx.fill(Path(ellipseIn: shadow), with: .color(.black.opacity(shadowOpacity)))
    let shape = Path(blob)
    ctx.fill(shape, with: .color(color))
    let b = blob.boundingBox
    ctx.fill(shape, with: .radialGradient(Gradient(stops: [
        .init(color: .white.opacity(0.5), location: 0),
        .init(color: .white.opacity(0), location: 0.42),
        .init(color: .black.opacity(0.08), location: 0.78),
        .init(color: .black.opacity(0.34), location: 1),
    ]), center: CGPoint(x: b.minX + b.width * 0.34, y: b.minY + b.height * 0.28), startRadius: 0, endRadius: b.width * 0.8))
    ctx.stroke(Path(ellipseIn: CGRect(x: 50.8 - ring, y: 51 - ring, width: ring * 2, height: ring * 2)), with: .color(.white.opacity(0.22)), lineWidth: ringHi)
    let inner = Path(ellipseIn: CGRect(x: 50 - ring, y: 50 - ring, width: ring * 2, height: ring * 2))
    ctx.fill(inner, with: .color(.black.opacity(ringFill)))
    ctx.stroke(inner, with: .color(.black.opacity(ringStroke)), lineWidth: ringWidth)
    if let g { glint(&ctx, x: g.0, y: g.1, rx: g.2, opacity: g.3) }
}

private func glint(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat, rx: CGFloat, opacity: Double) {
    var g = ctx
    g.translateBy(x: x, y: y)
    g.rotate(by: .degrees(-32))
    g.fill(Path(ellipseIn: CGRect(x: -rx, y: -5, width: rx * 2, height: 10)), with: .color(.white.opacity(opacity)))
}
