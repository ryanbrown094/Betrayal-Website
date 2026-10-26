import SwiftUI
import CoreText
import CoreImage
import CoreImage.CIFilterBuiltins

// The Modern palette and type, from src/modern.css (the names are the stylesheet's own).
enum Theme {
    static let soot = Color(hex: 0x09070A)
    static let peat = Color(hex: 0x130D14)
    static let dusk = Color(hex: 0x1D1020)
    static let tallow = Color(hex: 0xE8D0C8)
    static let tallow2 = Color(hex: 0xAFA198)
    static let mist = Color(hex: 0x877E78)
    static let brass = Color(hex: 0xAE6249)
    static let brass2 = Color(hex: 0xE6A58C)
    static let blood = Color(hex: 0xC22961)
    static let blood2 = Color(hex: 0xEA5A8F)
    static let verd = Color(hex: 0x5FA88F)
    static let verd2 = Color(hex: 0x2E6B57)
    static let loyal = Color(hex: 0xBFE0D3)     // .role.l h1, .verdict.l
    static let loyalSoft = Color(hex: 0x9ED3C0) // the roster's "Loyal"
    static let rule = Color(hex: 0x2E1D33)      // .card's line
    static let rule2 = Color(hex: 0x25172A)     // the score's lines
    static let edge = Color(hex: 0x4A3150)      // fields and ghost buttons
    static let edge2 = Color(hex: 0x3B2640)     // dark buttons, the pick grid
    static let field = Color(hex: 0x0F0910)
    static let ink = Color(hex: 0x1A0A0C)
    static let gold = Color(hex: 0xECDCAE)      // .banner
    static let goldRule = Color(hex: 0x4A3D1F)
    static let parchment = Color(hex: 0xEFE0D4) // the Longest Word's tiles
    static let parchmentInk = Color(hex: 0x241018)

    // the fonts ship in Resources/Fonts (made from the website's own files by ios/tools/fonts.py)
    static func disp(_ size: CGFloat, fixed: Bool = false) -> Font { font("GrenzeGotisch-Regular", size, .largeTitle, fixed) }
    static func book(_ size: CGFloat, fixed: Bool = false) -> Font { font("IMFellDWPica-Roman", size, .title, fixed) }
    static func bookItalic(_ size: CGFloat, fixed: Bool = false) -> Font { font("IMFellDWPica-Italic", size, .body, fixed) }
    static func ui(_ size: CGFloat, _ weight: Weight = .regular, fixed: Bool = false) -> Font {
        font(weight == .bold ? "AlegreyaSans-Bold" : weight == .medium ? "AlegreyaSans-Medium" : "AlegreyaSans-Regular", size, .body, fixed)
    }
    static func sc(_ size: CGFloat, bold: Bool = false, fixed: Bool = false) -> Font { font(bold ? "AlegreyaSansSC-Bold" : "AlegreyaSansSC-Medium", size, .caption, fixed) }
    enum Weight { case regular, medium, bold }

    private static func font(_ name: String, _ size: CGFloat, _ style: Font.TextStyle, _ fixed: Bool) -> Font {
        fixed ? .custom(name, fixedSize: size) : .custom(name, size: size, relativeTo: style)
    }

    static func registerFonts() {
        for sub in [nil, "Fonts", "Resources/Fonts"] as [String?] {
            for url in Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: sub) ?? [] {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }

    // a player's wax: their colour from the server, or the brass
    static func wax(_ hex: String) -> Color {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return brass }
        return Color(hex: v)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

// ---------------------------------------------------------------------------------------------------------------
// .btn and its kinds, from modern.css
struct Btn: ButtonStyle {
    enum Kind { case fill, ghost, dark, on, blood, verd }
    enum Size { case normal, big, sm }
    var kind: Kind = .fill
    var size: Size = .normal
    var fit = false // as wide as its words (in a row of tools, the top bar), not the whole line

    func makeBody(configuration: Configuration) -> some View { Face(configuration: configuration, kind: kind, size: size, fit: fit) }

    private struct Face: View {
        let configuration: ButtonStyleConfiguration
        let kind: Kind
        let size: Size
        let fit: Bool
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            let radius: CGFloat = size == .sm ? 5 : 6
            configuration.label
                .font(Theme.ui(size == .big ? 22 : size == .sm ? 15 : 18, .bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(text)
                .padding(.horizontal, size == .sm ? 12 : 18)
                .padding(.vertical, size == .sm ? 8 : 12)
                .frame(maxWidth: fit ? nil : .infinity, minHeight: size == .big ? 72 : size == .sm ? 44 : 54)
                .background(RoundedRectangle(cornerRadius: radius).fill(fill))
                .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(border, lineWidth: 1))
                .scaleEffect(configuration.isPressed ? 0.98 : 1)
                .brightness(configuration.isPressed && kind == .blood ? 0.15 : 0)
                .opacity(isEnabled ? 1 : 0.45)
                .contentShape(Rectangle())
                .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
        }
        private var fill: Color {
            switch kind {
            case .fill: return Color(hex: 0xC0715A)
            case .ghost: return .clear
            case .dark: return Color(hex: 0x1F1321)
            case .on: return Theme.brass2
            case .blood: return Color(hex: 0xB8285C)
            case .verd: return Theme.verd
            }
        }
        private var text: Color {
            switch kind {
            case .fill, .on: return Theme.ink
            case .ghost, .dark: return Theme.tallow
            case .blood: return .white
            case .verd: return Color(hex: 0x04120D)
            }
        }
        private var border: Color {
            switch kind {
            case .ghost: return Theme.edge
            case .dark: return Theme.edge2
            case .on: return Color(hex: 0xF4C9B7)
            default: return .clear
            }
        }
    }
}

extension View {
    func btn(_ kind: Btn.Kind = .fill, _ size: Btn.Size = .normal, fit: Bool = false) -> some View { buttonStyle(Btn(kind: kind, size: size, fit: fit)) }
}

// ---------------------------------------------------------------------------------------------------------------
// The page behind everything: a warm glow at the top, the grain, and the vignette (body, body::before, body::after)
struct Backdrop: View {
    var night = false
    var tv = false
    var body: some View {
        ZStack {
            Theme.soot
            if night && tv { Color(hex: 0x030204) }
            else if tv {
                GeometryReader { g in
                    ZStack {
                        RadialGradient(colors: [Theme.dusk, Theme.soot], center: .top, startRadius: 0, endRadius: max(g.size.width, g.size.height) * 0.7)
                        RadialGradient(colors: [Color(hex: 0xD96A4C, alpha: 0.18), .clear], center: UnitPoint(x: 0.5, y: 1.1), startRadius: 0, endRadius: g.size.width * 0.55)
                    }
                }
            } else {
                GeometryReader { g in
                    RadialGradient(colors: [Theme.dusk, Theme.soot], center: .top, startRadius: 0, endRadius: max(g.size.height * 0.45, g.size.width * 0.85))
                }
            }
            Grain.image.map { Image(decorative: $0, scale: 1).resizable(resizingMode: .tile).opacity(0.06) }
            GeometryReader { g in
                RadialGradient(colors: [.clear, .black.opacity(0.55)], center: UnitPoint(x: 0.5, y: 0.4), startRadius: max(g.size.width, g.size.height) * 0.42, endRadius: max(g.size.width, g.size.height) * 0.85)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

// fractal noise, as the page's feTurbulence: grey, tiled, barely there
enum Grain {
    static let image: CGImage? = {
        let noise = CIFilter.randomGenerator().outputImage?.cropped(to: CGRect(x: 0, y: 0, width: 200, height: 200))
        let grey = CIFilter.colorControls()
        grey.inputImage = noise
        grey.saturation = 0
        grey.contrast = 1.1
        guard let out = grey.outputImage else { return nil }
        return CIContext().createCGImage(out, from: CGRect(x: 0, y: 0, width: 200, height: 200))
    }()
}
