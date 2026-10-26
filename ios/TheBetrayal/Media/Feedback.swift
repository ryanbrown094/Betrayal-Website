import UIKit
import AVFoundation
import CoreImage
import CoreImage.CIFilterBuiltins

// A phone put down on the table: it stays awake, and taps its player when something needs them (the page's
// navigator.vibrate, which iPhones never had), and again ten seconds before a clock closes on an unanswered question.
@MainActor
enum Feedback {
    static func buzz() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func late() { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
    static func keepAwake(_ on: Bool) { UIApplication.shared.isIdleTimerDisabled = on }
}

// The TV's narrator: each new screen's heading read aloud, in a British voice where the phone has one (speak())
@MainActor
final class Narrator {
    static let shared = Narrator()
    private let synth = AVSpeechSynthesizer()
    private var saidKey = "", saidBits: [String] = []
    var on = false { didSet { if !on { synth.stopSpeaking(at: .immediate) }; saidKey = ""; saidBits = [] } }

    func speak(key: String, bits: [String]) {
        guard on else { return }
        let fresh = key == saidKey ? bits.filter { !saidBits.contains($0) } : bits
        saidKey = key; saidBits = bits
        let text = fresh.joined(separator: ". ")
        guard !text.isEmpty else { return }
        if fresh == bits { synth.stopSpeaking(at: .immediate) }
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice.speechVoices().first { $0.language == "en-GB" } ?? AVSpeechSynthesisVoice(language: "en-GB")
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        synth.speak(u)
    }
}

// The join link as a QR code, in the TV's ink and parchment
enum QR {
    static func image(_ text: String) -> CGImage? {
        let gen = CIFilter.qrCodeGenerator()
        gen.message = Data(text.utf8)
        gen.correctionLevel = "M"
        let tint = CIFilter.falseColor()
        tint.inputImage = gen.outputImage
        tint.color0 = CIColor(red: 0x15 / 255, green: 0x0B / 255, blue: 0x17 / 255)
        tint.color1 = CIColor(red: 0xEF / 255, green: 0xE0 / 255, blue: 0xD4 / 255)
        guard let out = tint.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)) else { return nil }
        return CIContext().createCGImage(out, from: out.extent)
    }
}
