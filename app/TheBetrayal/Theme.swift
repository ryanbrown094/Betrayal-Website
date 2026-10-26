import SwiftUI
import CoreText

// The Modern palette and type (src/modern.css), so the native screens look like the game they open.
enum Theme {
    static let soot = Color(hex: 0x09070A)
    static let dusk = Color(hex: 0x1D1020)
    static let tallow = Color(hex: 0xE8D0C8)
    static let tallow2 = Color(hex: 0xAFA198)
    static let brass = Color(hex: 0xC0715A)
    static let brass2 = Color(hex: 0xE6A58C)
    static let blood2 = Color(hex: 0xEA5A8F)
    static let rule = Color(hex: 0x2E1D33)
    static let edge = Color(hex: 0x4A3150)
    static let field = Color(hex: 0x0F0910)
    static let ink = Color(hex: 0x1A0A0C)

    // the fonts ship in Fonts/ (converted from the website's own files) and are registered at launch
    static func book(_ size: CGFloat) -> Font { .custom("IM_FELL_DW_Pica_Roman", size: size, relativeTo: .title) }
    static func bookItalic(_ size: CGFloat) -> Font { .custom("IM_FELL_DW_Pica_Italic", size: size, relativeTo: .body) }
    static func ui(_ size: CGFloat, bold: Bool = false) -> Font { .custom(bold ? "AlegreyaSans-Bold" : "AlegreyaSans-Regular", size: size, relativeTo: .body) }
    static func sc(_ size: CGFloat) -> Font { .custom("AlegreyaSansSC-Medium", size: size, relativeTo: .caption) }

    static func registerFonts() {
        let urls = (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? [])
            + (Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: "Fonts") ?? [])
        for url in urls { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

// .btn and .btn.ghost from modern.css
struct BrandButton: ButtonStyle {
    enum Kind { case fill, ghost }
    var kind: Kind = .fill

    func makeBody(configuration: Configuration) -> some View { Face(configuration: configuration, kind: kind) }

    private struct Face: View {
        let configuration: ButtonStyleConfiguration
        let kind: Kind
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(Theme.ui(18, bold: true))
                .foregroundStyle(kind == .fill ? Theme.ink : Theme.tallow)
                .frame(maxWidth: .infinity, minHeight: 54)
                .padding(.horizontal, 18)
                .background(RoundedRectangle(cornerRadius: 6).fill(kind == .fill ? Theme.brass : Color.clear))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(kind == .fill ? Color.clear : Theme.edge, lineWidth: 1))
                .scaleEffect(configuration.isPressed ? 0.98 : 1)
                .opacity(isEnabled ? 1 : 0.45)
                .contentShape(Rectangle())
        }
    }
}

// input.f.code from modern.css: a short code, spaced out and centred
struct CodeField: View {
    let placeholder: String
    @Binding var text: String
    var maxLength: Int
    var spacing: CGFloat = 6
    var submit: () -> Void

    var body: some View {
        TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(Theme.tallow2.opacity(0.45)))
            .font(Theme.ui(26, bold: true))
            .kerning(spacing)
            .multilineTextAlignment(.center)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .keyboardType(.asciiCapable)
            .submitLabel(.go)
            .onSubmit(submit)
            .foregroundStyle(Theme.tallow)
            .frame(minHeight: 58)
            .padding(.horizontal, 12)
            .background(RoundedRectangle(cornerRadius: 4).fill(Theme.field))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.edge, lineWidth: 1))
            .onChange(of: text) { _, value in
                let clean = String(value.uppercased().filter { $0.isLetter || $0.isNumber || $0 == "-" }.prefix(maxLength))
                if clean != value { text = clean }
            }
    }
}
