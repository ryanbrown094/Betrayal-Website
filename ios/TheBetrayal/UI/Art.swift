import SwiftUI

// Every drawing in the game, from src/art.js: the wax seals, the icons, the crest. The SVG is kept as the page has it
// and drawn natively (SVGPath below reads its path data), so the art can't drift from the website's.
enum Art {
    // the icons: a 64-unit box, stroked 2.4 with round ends; class="f" parts are filled
    static let icons: [String: String] = [
        "moon": #"<path d="M43 7a25 25 0 1 0 14 39A21 21 0 0 1 43 7z"/><path class="f" d="M17 12l1.4 3.6L22 17l-3.6 1.4L17 22l-1.4-3.6L12 17l3.6-1.4zM27 28l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>"#,
        "sun": #"<path d="M14 44a18 18 0 0 1 36 0"/><path d="M4 44h56M10 52h44M18 59h28M32 8v9M9 21l6 6M55 21l-6 6M2 36h6M56 36h6"/>"#,
        "blade": #"<path d="M32 60L27 24h10z"/><path d="M32 24v26"/><path d="M19 24c4-3 22-3 26 0"/><path d="M32 24V12"/><circle cx="32" cy="8" r="4"/>"#,
        "crown": #"<path d="M9 46L13 19l11 14 8-20 8 20 11-14 4 27z"/><path d="M9 53h46"/><circle class="f" cx="13" cy="16" r="2.6"/><circle class="f" cx="32" cy="10" r="2.6"/><circle class="f" cx="51" cy="16" r="2.6"/>"#,
        "shield": #"<path d="M32 5l22 8v17c0 14-10 24-22 30C20 54 10 44 10 30V13z"/><path d="M32 14v36M19 27h26"/>"#,
        "table": #"<circle cx="32" cy="32" r="17"/><circle cx="32" cy="32" r="9"/><circle class="f" cx="32" cy="7" r="3"/><circle class="f" cx="53.6" cy="19.5" r="3"/><circle class="f" cx="53.6" cy="44.5" r="3"/><circle class="f" cx="32" cy="57" r="3"/><circle class="f" cx="10.4" cy="44.5" r="3"/><circle class="f" cx="10.4" cy="19.5" r="3"/>"#,
        "chalice": #"<path d="M17 7h30c0 15-6 24-15 24S17 22 17 7z"/><path d="M32 31v17M21 57c0-6 5-9 11-9s11 3 11 9z"/><path d="M19 15h26"/>"#,
        "scroll": #"<path d="M18 9h30a6 6 0 0 1 6 6v3H24"/><path d="M18 9a6 6 0 0 0-6 6v34a6 6 0 0 0 6 6h26a6 6 0 0 0 6-6V18"/><path d="M18 9a6 6 0 0 1 6 6v3M21 28h20M21 36h20M21 44h13"/>"#,
        "hourglass": #"<path d="M16 6h32M16 58h32"/><path d="M19 6c0 15 11 18 13 26-2 8-13 11-13 26M45 6c0 15-11 18-13 26 2 8 13 11 13 26"/><path class="f" d="M25 14h14c-2 6-5 9-7 12-2-3-5-6-7-12zM24 56c1-7 5-9 8-12 3 3 7 5 8 12z"/>"#,
        "scales": #"<path d="M32 8v48M20 58h24M10 16h44"/><path d="M10 16L3 36h14zM54 16l-7 20h14z"/><path d="M3 36a7 5 0 0 0 14 0M47 36a7 5 0 0 0 14 0"/><circle class="f" cx="32" cy="8" r="3"/>"#,
        "raven": #"<path class="f" d="M4 22l13-5c3-8 13-11 20-5 9 5 15 16 23 38l-9-5 2 13-9-11c-8 2-17-2-21-10-3-5-2-9-5-12z"/><path d="M33 47l-2 11M40 48l1 10M27 58h8M37 58h8"/>"#,
        "ghost": #"<path d="M13 57V27a19 19 0 0 1 38 0v30l-6.3-5-6.4 5-6.3-5-6.3 5-6.4-5z"/><circle class="f" cx="25" cy="27" r="3.2"/><circle class="f" cx="39" cy="27" r="3.2"/><path d="M28 38c2 2 6 2 8 0"/>"#,
        "key": #"<circle cx="18" cy="20" r="11"/><circle cx="18" cy="20" r="4"/><path d="M26 28l30 30M44 46l7-7M50 52l6-6"/>"#,
        "skull": #"<path d="M12 30a20 20 0 0 1 40 0c0 8-3 12-8 15v9H20v-9c-5-3-8-7-8-15z"/><circle class="f" cx="24" cy="30" r="5"/><circle class="f" cx="40" cy="30" r="5"/><path d="M32 37l-3 6h6zM27 54v-6M32 54v-6M37 54v-6"/>"#,
        "candle": #"<path d="M24 28h16v30H24z"/><path d="M24 36c3 3 5-2 8 1s5-1 8 1M18 58h28"/><path d="M32 28v-5"/><path class="f" d="M32 4c5 6 7 10 7 13a7 7 0 0 1-14 0c0-3 2-7 7-13z"/>"#,
        "eye": #"<path d="M4 32c8-13 18-19 28-19s20 6 28 19c-8 13-18 19-28 19S12 45 4 32z"/><circle cx="32" cy="32" r="9"/><circle class="f" cx="32" cy="32" r="3.6"/>"#,
        "handshake": #"<path d="M4 22l12-4 10 4 6-3 6 3 10-4 12 4v20l-10 2-14 12a4 4 0 0 1-5 0L17 44 4 42z"/><path d="M26 22l-6 8c2 3 6 3 9 0l3-3 14 13M38 36l4 4M33 41l4 4"/>"#,
    ]

    // the house crest: a cloaked figure in a lozenge, a candle flame where the face should be (120 × 140)
    static let crest = #"<path class="fillin" d="M60 16l44 54-44 54-44-54z" fill-opacity=".14" stroke="none"/><path d="M60 5l55 65-55 65L5 70z"/><path d="M60 16l44 54-44 54-44-54z" stroke-width="1"/><path d="M60 29C51 35 44.5 44 44 56c-.3 6 1.5 8-.5 14-2.5 8-1.5 17-3.5 26h40c-2-9-1-18-3.5-26-2-6-.2-8-.5-14-.5-12-7-21-16-27z"/><path d="M60 41c-6 5-9 10.5-9 16 0 6 4 9.5 9 9.5s9-3.5 9-9.5c0-5.5-3-11-9-16z" stroke-width="1.4"/><path d="M60 48c3 4.4 4.6 7.2 4.6 9.5a4.6 4.6 0 0 1-9.2 0c0-2.3 1.6-5.1 4.6-9.5z" fill-opacity=".35"/><circle cx="60" cy="70.5" r="1.6"/><path d="M60 73c-.4 8-.8 15.5-1.2 23" stroke-width="1.3"/><path d="M50 77c-1 6.5-2 13-3 19M70 77c1 6.5 2 13 3 19" stroke-width="1"/><path d="M27 70h-9M93 70h9" stroke-width="1.4"/><circle cx="14" cy="70" r="1.6"/><circle cx="106" cy="70" r="1.6"/>"#

    // the seals' wax: an irregular blob, from the same seeded wobble as blobPath() in art.js
    static let blob = blobPath(cx: 50, cy: 50, r: 44, wob: 3.2, n: 18, seed: 7)
    static let blob2 = blobPath(cx: 50, cy: 50, r: 45, wob: 4, n: 22, seed: 23)

    static func blobPath(cx: Double, cy: Double, r: Double, wob: Double, n: Int, seed: Int64) -> CGPath {
        var x = seed
        func rnd() -> Double { x = (x * 16807) % 2147483647; return Double(x) / 2147483647 }
        var pts: [CGPoint] = []
        for i in 0..<n {
            let a = Double(i) / Double(n) * .pi * 2, rr = r + (rnd() - 0.5) * 2 * wob
            pts.append(CGPoint(x: cx + cos(a) * rr, y: cy + sin(a) * rr))
        }
        // to one decimal place, as the page writes it
        func f(_ p: CGPoint) -> CGPoint { CGPoint(x: (p.x * 10).rounded() / 10, y: (p.y * 10).rounded() / 10) }
        func mid(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }
        let p = CGMutablePath()
        p.move(to: f(mid(pts[n - 1], pts[0])))
        for i in 0..<n { p.addQuadCurve(to: f(mid(pts[i], pts[(i + 1) % n])), control: f(pts[i])) }
        p.closeSubpath()
        return p
    }

    // an SVG fragment as drawable parts
    struct Part {
        let path: CGPath
        let stroke: Bool
        let width: CGFloat?
        let fill: Double? // the fill's opacity (with the current colour), or no fill
    }

    static func parts(_ svg: String) -> [Part] {
        var out: [Part] = []
        for el in svg.components(separatedBy: "<").dropFirst() {
            let tag = el.prefix { $0.isLetter }
            let at = attributes(el)
            let filled = at["class"] == "f" || at["fill-opacity"] != nil
            let fill: Double? = at["class"] == "f" ? Optional(1.0) : at["fill-opacity"].flatMap { Double($0) }
            let stroke = at["stroke"] != "none" && at["class"] != "f"
            let width = at["stroke-width"].flatMap { Double($0) }.map { CGFloat($0) }
            if tag == "path", let d = at["d"] {
                out.append(Part(path: SVGPath.cgPath(d), stroke: stroke, width: width, fill: filled ? fill : nil))
            } else if tag == "circle", let cx = at["cx"].flatMap({ Double($0) }), let cy = at["cy"].flatMap({ Double($0) }), let r = at["r"].flatMap({ Double($0) }) {
                let p = CGMutablePath(); p.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r))
                out.append(Part(path: p, stroke: stroke, width: width, fill: filled ? fill : nil))
            }
        }
        return out
    }

    private static func attributes(_ el: String) -> [String: String] {
        var out: [String: String] = [:]
        var rest = Substring(el)
        while let eq = rest.range(of: "=\"") {
            let name = rest[..<eq.lowerBound].split(whereSeparator: { $0 == " " }).last.map(String.init) ?? ""
            let after = rest[eq.upperBound...]
            guard let close = after.firstIndex(of: "\"") else { break }
            out[name] = String(after[..<close])
            rest = after[after.index(after: close)...]
        }
        return out
    }

    static let iconParts: [String: [Part]] = icons.mapValues(parts)
    static let crestParts = parts(crest)
}

// ---------------------------------------------------------------------------------------------------------------
// SVG path data (the d attribute) as a CGPath: M L H V C S Q T A Z, absolute and relative
enum SVGPath {
    static func cgPath(_ d: String) -> CGPath {
        let p = CGMutablePath()
        var s = PathScanner(Array(d.utf8))
        var cur = CGPoint.zero, start = CGPoint.zero, ctrl: CGPoint? = nil
        var cmd: UInt8 = 0, last: UInt8 = 0
        while true {
            s.skip()
            guard let c = s.peek() else { break }
            if isCommand(c) { cmd = c; s.i += 1 }
            else if !s.startsNumber() { s.i += 1; continue }
            else if cmd == 0 { break }
            let rel = cmd >= 97 // lower case
            let base = rel ? cur : .zero
            func pt() -> CGPoint? { guard let x = s.number(), let y = s.number() else { return nil }; return CGPoint(x: base.x + x, y: base.y + y) }
            switch cmd | 0x20 {
            case UInt8(ascii: "z"):
                p.closeSubpath(); cur = start; ctrl = nil; last = cmd; cmd = 0; continue
            case UInt8(ascii: "m"):
                guard let q = pt() else { return p }
                p.move(to: q); cur = q; start = q; ctrl = nil
                cmd = rel ? UInt8(ascii: "l") : UInt8(ascii: "L") // further pairs are lines
            case UInt8(ascii: "l"):
                guard let q = pt() else { return p }
                p.addLine(to: q); cur = q; ctrl = nil
            case UInt8(ascii: "h"):
                guard let x = s.number() else { return p }
                cur = CGPoint(x: (rel ? cur.x : 0) + x, y: cur.y); p.addLine(to: cur); ctrl = nil
            case UInt8(ascii: "v"):
                guard let y = s.number() else { return p }
                cur = CGPoint(x: cur.x, y: (rel ? cur.y : 0) + y); p.addLine(to: cur); ctrl = nil
            case UInt8(ascii: "c"):
                guard let c1 = pt(), let c2 = pt(), let q = pt() else { return p }
                p.addCurve(to: q, control1: c1, control2: c2); ctrl = c2; cur = q
            case UInt8(ascii: "s"):
                guard let c2 = pt(), let q = pt() else { return p }
                let c1 = "cCsS".utf8.contains(last) && ctrl != nil ? CGPoint(x: 2 * cur.x - ctrl!.x, y: 2 * cur.y - ctrl!.y) : cur
                p.addCurve(to: q, control1: c1, control2: c2); ctrl = c2; cur = q
            case UInt8(ascii: "q"):
                guard let c1 = pt(), let q = pt() else { return p }
                p.addQuadCurve(to: q, control: c1); ctrl = c1; cur = q
            case UInt8(ascii: "t"):
                guard let q = pt() else { return p }
                let c1 = "qQtT".utf8.contains(last) && ctrl != nil ? CGPoint(x: 2 * cur.x - ctrl!.x, y: 2 * cur.y - ctrl!.y) : cur
                p.addQuadCurve(to: q, control: c1); ctrl = c1; cur = q
            case UInt8(ascii: "a"):
                guard let rx = s.number(), let ry = s.number(), let rot = s.number(), let large = s.flag(), let sweep = s.flag(), let q = pt() else { return p }
                arc(p, from: cur, rx: rx, ry: ry, rotation: rot, large: large, sweep: sweep, to: q); cur = q; ctrl = nil
            default:
                return p
            }
            last = cmd
        }
        return p
    }

    private static func isCommand(_ c: UInt8) -> Bool { "MmLlHhVvCcSsQqTtAaZz".utf8.contains(c) }

    private struct PathScanner {
        let b: [UInt8]
        var i = 0
        init(_ b: [UInt8]) { self.b = b }
        func peek() -> UInt8? { i < b.count ? b[i] : nil }
        mutating func skip() { while i < b.count, b[i] == 32 || b[i] == 44 || b[i] == 9 || b[i] == 10 || b[i] == 13 { i += 1 } }
        func startsNumber() -> Bool { guard let c = peek() else { return false }; return (c >= 48 && c <= 57) || c == 46 || c == 45 || c == 43 }
        mutating func number() -> CGFloat? {
            skip()
            let from = i
            if i < b.count, b[i] == 45 || b[i] == 43 { i += 1 }
            var dot = false, digits = false
            while i < b.count {
                let c = b[i]
                if c >= 48 && c <= 57 { digits = true; i += 1 }
                else if c == 46 && !dot { dot = true; i += 1 }
                else { break }
            }
            if digits, i < b.count, b[i] == 101 || b[i] == 69 { // an exponent
                var j = i + 1
                if j < b.count, b[j] == 45 || b[j] == 43 { j += 1 }
                if j < b.count, b[j] >= 48 && b[j] <= 57 { i = j; while i < b.count, b[i] >= 48 && b[i] <= 57 { i += 1 } }
            }
            guard digits, let v = Double(String(decoding: b[from..<i], as: UTF8.self)) else { i = from; return nil }
            return CGFloat(v)
        }
        mutating func flag() -> Bool? {
            skip()
            guard let c = peek(), c == 48 || c == 49 else { return nil }
            i += 1
            return c == 49
        }
    }

    // an elliptical arc as cubic curves (the SVG spec's endpoint-to-centre conversion, F.6.5)
    private static func arc(_ p: CGMutablePath, from p0: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, rotation: CGFloat, large: Bool, sweep: Bool, to p1: CGPoint) {
        if p0 == p1 { return }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { p.addLine(to: p1); return }
        let phi = rotation * .pi / 180, cp = cos(phi), sp = sin(phi)
        let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
        let x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 { rx *= sqrt(lambda); ry *= sqrt(lambda) }
        let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var k = den == 0 ? 0 : sqrt(max(0, num / den))
        if large == sweep { k = -k }
        let cxp = k * rx * y1 / ry, cyp = -k * ry * x1 / rx
        let cx = cp * cxp - sp * cyp + (p0.x + p1.x) / 2, cy = sp * cxp + cp * cyp + (p0.y + p1.y) / 2
        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat { atan2(ux * vy - uy * vx, ux * vx + uy * vy) }
        let ux = (x1 - cxp) / rx, uy = (y1 - cyp) / ry, vx = (-x1 - cxp) / rx, vy = (-y1 - cyp) / ry
        let t1 = angle(1, 0, ux, uy)
        var dt = angle(ux, uy, vx, vy)
        if !sweep && dt > 0 { dt -= 2 * .pi } else if sweep && dt < 0 { dt += 2 * .pi }
        let n = max(1, Int(ceil(abs(dt) / (.pi / 2)))), d = dt / CGFloat(n), t = 4 / 3 * tan(d / 4)
        func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: cx + rx * x * cp - ry * y * sp, y: cy + rx * x * sp + ry * y * cp) }
        var a = t1
        for _ in 0..<n {
            let c1 = cos(a), s1 = sin(a), c2 = cos(a + d), s2 = sin(a + d)
            p.addCurve(to: map(c2, s2), control1: map(c1 - t * s1, s1 + t * c1), control2: map(c2 + t * s2, s2 - t * c2))
            a += d
        }
    }
}
