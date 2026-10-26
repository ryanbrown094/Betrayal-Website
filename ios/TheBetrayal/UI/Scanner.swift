import SwiftUI
import AVFoundation
import UIKit

// The TV's QR code, read with the camera (the iPhone's own Camera app opens the app from it too: thebetrayal://join/CODE)
struct ScanSheet: View {
    let found: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var access = AVCaptureDevice.authorizationStatus(for: .video)
    @State private var unreadable = false

    var body: some View {
        ZStack {
            Theme.soot.ignoresSafeArea()
            if AVCaptureDevice.default(for: .video) == nil {
                note("This device has no camera. Type the Table code instead.")
            } else if access == .authorized {
                QRCamera { text in
                    if let room = Codes.room(in: text) { Feedback.buzz(); found(room); dismiss() } else { unreadable = true }
                }
                .ignoresSafeArea()
                VStack {
                    Spacer()
                    Text(unreadable ? "That isn’t a Table’s code. Point at the code on the TV." : "Point at the code on the TV.")
                        .font(Theme.ui(18)).foregroundStyle(Theme.tallow)
                        .padding(.horizontal, 18).padding(.vertical, 12)
                        .background(Capsule().fill(Theme.soot.opacity(0.8)))
                        .padding(.bottom, 40)
                }
            } else if access == .notDetermined {
                Color.clear.task { _ = await AVCaptureDevice.requestAccess(for: .video); access = AVCaptureDevice.authorizationStatus(for: .video) }
            } else {
                VStack(spacing: 14) {
                    note("The Betrayal needs the camera to read the code. Allow it in Settings, or type the Table code instead.")
                    Button("Open Settings") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }.btn(.ghost, .sm, fit: true)
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            Button("Close") { dismiss() }.btn(.dark, .sm, fit: true).padding(16)
        }
    }

    private func note(_ s: String) -> some View {
        Text(s).font(Theme.ui(18)).foregroundStyle(Theme.tallow2).multilineTextAlignment(.center).padding(30)
    }
}

private struct QRCamera: UIViewControllerRepresentable {
    let read: (String) -> Void
    func makeUIViewController(context: Context) -> CameraController { CameraController(read: read) }
    func updateUIViewController(_ vc: CameraController, context: Context) {}
}

final class CameraController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let read: (String) -> Void
    private let capture = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?
    private var last = ""

    init(read: @escaping (String) -> Void) { self.read = read; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        guard let cam = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: cam), capture.canAddInput(input) else { return }
        capture.addInput(input)
        let out = AVCaptureMetadataOutput()
        guard capture.canAddOutput(out) else { return }
        capture.addOutput(out)
        out.setMetadataObjectsDelegate(self, queue: .main)
        out.metadataObjectTypes = [.qr]
        let layer = AVCaptureVideoPreviewLayer(session: capture)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        preview = layer
    }

    override func viewDidLayoutSubviews() { super.viewDidLayoutSubviews(); preview?.frame = view.bounds }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let c = capture
        DispatchQueue.global(qos: .userInitiated).async { if !c.isRunning { c.startRunning() } }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        let c = capture
        DispatchQueue.global(qos: .userInitiated).async { if c.isRunning { c.stopRunning() } }
    }

    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let text = (objects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }
        MainActor.assumeIsolated {
            guard text != last else { return }
            last = text
            read(text)
        }
    }
}
