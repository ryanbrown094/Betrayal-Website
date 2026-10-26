import AVFoundation

// The music and sounds (src/audio.js), played from the files ios/tools/sounds.mjs renders from the website's own
// synthesiser. The score follows the scene: each change crossfades over a second or so; a big moment's sound ducks the
// music under it, as the page's duck() does. Sound plays on the TV, or on the host's phone when there's no TV.
@MainActor
final class Sound {
    static let shared = Sound()

    private(set) var enabled = false // the sound was turned on (the TV's button, or the host's tools)
    private(set) var muted = false
    private weak var owner: Session?

    private let engine = AVAudioEngine()
    private let bus = AVAudioMixerNode()          // the music, ducked under the big moments
    private var decks: [(player: AVAudioPlayerNode, mixer: AVAudioMixerNode)] = []
    private var deck = 0
    private var current: String?
    private var effects: [String: AVAudioPlayer] = [:]
    private var fades: [ObjectIdentifier: Task<Void, Never>] = [:]
    private var duckTask: Task<Void, Never>?
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)! // as the files are rendered

    // how long each sound holds the music down (duck(sec) in audio.js)
    private let ducks: [String: Double] = ["gold": 1.8, "dawn": 2.5, "poison": 3.4, "reveal": 2.4, "win": 5]
    private static let musicLevel: Float = 1

    func follows(_ s: Session) -> Bool { enabled && owner === s }
    func isPlaying(for s: Session) -> Bool { follows(s) && !muted }

    // the page's enableSound(): set the music going, and a chime to say it's on
    func enable(for s: Session) {
        owner = s
        if !enabled {
            enabled = true
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
            setUp()
        }
        muted = false
        engine.mainMixerNode.outputVolume = 1
        if let v = s.view { scene(v.scene) } else { scene("lobby") }
        cue(["chime"])
        NotificationCenter.default.post(name: Sound.changed, object: nil)
    }

    func toggleMute() {
        muted.toggle()
        ramp(engine.mainMixerNode, to: muted ? 0 : 1, over: 0.15)
        NotificationCenter.default.post(name: Sound.changed, object: nil)
    }

    // a session that ends gives up the sound
    func release(_ s: Session) { if owner === s { owner = nil; stopMusic() } }

    static let changed = Notification.Name("Sound.changed")

    private func setUp() {
        engine.attach(bus)
        engine.connect(bus, to: engine.mainMixerNode, format: nil)
        for _ in 0..<2 {
            let p = AVAudioPlayerNode(), m = AVAudioMixerNode()
            engine.attach(p); engine.attach(m)
            engine.connect(p, to: m, format: format)
            engine.connect(m, to: bus, format: format)
            decks.append((p, m))
        }
        bus.outputVolume = Sound.musicLevel
        NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.restart() }
        }
        try? engine.start()
        for name in ["chime", "drum", "beat", "alarm", "seal", "snuff", "gold", "dawn", "poison", "reveal", "win"] {
            if let url = Bundle.main.url(forResource: "sfx-" + name, withExtension: "m4a"), let p = try? AVAudioPlayer(contentsOf: url) {
                p.prepareToPlay(); effects[name] = p
            }
        }
    }

    private func restart() {
        guard enabled else { return }
        try? engine.start()
        let name = current; current = nil
        if let name { scene(name) }
    }

    // ---- the score
    func scene(_ name: String) {
        guard enabled, name != current else { return }
        current = name
        guard let url = Bundle.main.url(forResource: "music-" + name, withExtension: "m4a") else { return }
        let old = decks[deck]
        deck = 1 - deck
        let new = decks[deck]
        Task.detached(priority: .userInitiated) {
            guard let file = try? AVAudioFile(forReading: url),
                  let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
                  (try? file.read(into: buf)) != nil, buf.format.sampleRate == 44100, buf.format.channelCount == 2 else { return }
            await MainActor.run { [weak self] in
                guard let self, self.current == name else { return }
                if !self.engine.isRunning { try? self.engine.start() }
                new.player.stop()
                new.mixer.outputVolume = old.player.isPlaying ? 0.35 : 1
                new.player.scheduleBuffer(buf, at: nil, options: .loops)
                new.player.play()
                if old.player.isPlaying {
                    self.ramp(new.mixer, to: 1, over: 1.1)
                    self.ramp(old.mixer, to: 0, over: 1.2) { old.player.stop() }
                }
            }
        }
    }

    private func stopMusic() {
        current = nil
        for d in decks { d.player.stop() }
    }

    // ---- the moments
    func cue(_ names: [String]) {
        guard enabled, !muted else { return }
        for (i, name) in names.enumerated() {
            guard let p = effects[name] else { continue }
            let play = { [weak self] in
                p.currentTime = 0
                p.play()
                if let d = self?.ducks[name] { self?.duck(d) }
            }
            if i == 0 { play() } else { Task { try? await Task.sleep(nanoseconds: 1_200_000_000); play() } } // dawn, then the poison
        }
    }

    private func duck(_ seconds: Double) {
        duckTask?.cancel()
        ramp(bus, to: Sound.musicLevel * 0.28, over: 0.1)
        duckTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.ramp(self.bus, to: Sound.musicLevel, over: 1.2)
        }
    }

    // a mixer's volume, moved smoothly
    private func ramp(_ m: AVAudioMixerNode, to target: Float, over seconds: Double, then done: (() -> Void)? = nil) {
        let id = ObjectIdentifier(m)
        fades[id]?.cancel()
        let from = m.outputVolume, steps = max(1, Int(seconds * 30))
        fades[id] = Task { [weak self] in
            for i in 1...steps {
                try? await Task.sleep(nanoseconds: UInt64(seconds / Double(steps) * 1_000_000_000))
                if Task.isCancelled { return }
                m.outputVolume = from + (target - from) * Float(i) / Float(steps)
            }
            done?()
            self?.fades[id] = nil
        }
    }
}
