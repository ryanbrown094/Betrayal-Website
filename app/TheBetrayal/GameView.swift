import SwiftUI
import WebKit
import AudioToolbox

// A Table: the Modern game itself (src/modern-ui.js, served by the Worker), in a web view the app looks after.
struct GameView: View {
    let target: GameTarget
    @StateObject private var game: GameModel
    @Environment(\.dismiss) private var dismiss
    @State private var leaving = false

    init(target: GameTarget) {
        self.target = target
        _game = StateObject(wrappedValue: GameModel(target: target))
    }

    var body: some View {
        WebView(webView: game.webView)
            .ignoresSafeArea(.container, edges: .bottom)
            .background(Theme.soot.ignoresSafeArea())
            .overlay { status }
            .navigationTitle("Table \(target.room)")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbarBackground(Theme.soot, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Leave") { leaving = true }.font(Theme.ui(17))
                }
            }
            .confirmationDialog("Leave this Table?", isPresented: $leaving, titleVisibility: .visible) {
                Button("Leave", role: .destructive) { dismiss() }
            } message: {
                Text("Your place is kept. Come back from the start screen while the Table is open.")
            }
            // the game runs for an hour or two with the phone face up on the table: don't let it lock
            .onAppear { UIApplication.shared.isIdleTimerDisabled = true; Recent.remember(target.room) }
            .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    @ViewBuilder private var status: some View {
        if let failed = game.failed {
            VStack(spacing: 16) {
                Text("Can’t reach the game").font(Theme.book(28)).foregroundStyle(Theme.tallow)
                Text(failed).font(Theme.ui(17)).foregroundStyle(Theme.tallow2).multilineTextAlignment(.center)
                Button("Try again") { game.load() }.buttonStyle(BrandButton()).frame(maxWidth: 260)
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.soot)
        } else if game.loading {
            ProgressView().tint(Theme.brass2)
        }
    }
}

private struct WebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

@MainActor
final class GameModel: NSObject, ObservableObject {
    @Published var loading = true
    @Published var failed: String?
    let webView: WKWebView
    private let target: GameTarget

    init(target: GameTarget) {
        self.target = target
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // the server and its logs can tell the app's phones from browsers
        config.applicationNameForUserAgent = "TheBetrayalApp/" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1")
        config.userContentController.addUserScript(WKUserScript(source: Self.bridge(for: target), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.configuration.userContentController.add(WeakHandler(self), name: "betrayal")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Theme.soot)
        webView.scrollView.backgroundColor = UIColor(Theme.soot)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        #if DEBUG
        webView.isInspectable = true // Safari's Develop menu can inspect the page
        #endif
        load()
    }

    func load() {
        failed = nil
        loading = true
        #if DEBUG
        if target.selfTest { webView.loadHTMLString(Self.selfTestPage, baseURL: target.url); return }
        #endif
        webView.load(URLRequest(url: target.url))
    }

    #if DEBUG
    // the CI's check of what the page can't do on its own (.github/workflows/ios.yml): the bridge's script ran, the
    // booking code was handed over, and confirm() comes up as a native alert
    private static let selfTestPage = """
    <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <body style="background:#09070a;color:#e8d0c8;font:19px -apple-system,sans-serif;padding:24px 20px">
    <h2>Bridge check</h2><p id="v"></p><p id="p"></p><p id="c">confirm: waiting</p>
    <script>
    document.getElementById("v").textContent = "vibrate: " + typeof navigator.vibrate + ", " + navigator.vibrate([70, 50, 70]);
    document.getElementById("p").textContent = "booking code handed over: " + sessionStorage.getItem("bt-pass-SELFTE");
    setTimeout(function () { var ok = confirm("Start the game? Nobody else can join after this."); document.getElementById("c").textContent = "confirm: " + ok; }, 800);
    </script>
    """
    #endif

    // Runs in the page before the game's own script: the page asks for vibration through navigator.vibrate, which iOS
    // web views don't have, so it comes here; and a host setting up gets their booking code the way the website's home
    // page hands it over (sessionStorage, read by doCreate in src/modern-ui.js).
    private static func bridge(for target: GameTarget) -> String {
        var js = "navigator.vibrate = function (p) { try { window.webkit.messageHandlers.betrayal.postMessage({ vibrate: p }); } catch (e) {} return true; };\n"
        if let pass = target.pass { js += "try { sessionStorage.setItem(\(literal("bt-pass-" + target.room)), \(literal(pass))); } catch (e) {}\n" }
        if target.start == .bots { js += "try { sessionStorage.setItem(\(literal("bt-test-" + target.room)), \"1\"); } catch (e) {}\n" }
        return js
    }

    private static func literal(_ s: String) -> String {
        guard let data = try? JSONEncoder().encode(s), let js = String(data: data, encoding: .utf8) else { return "\"\"" }
        return js
    }

    fileprivate func topController() -> UIViewController? {
        var top = webView.window?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }
}

extension GameModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if ["about", "blob", "data"].contains(url.scheme ?? "") || Site.isGame(url) { return decisionHandler(.allow) }
        // anything else isn't part of the game: another site opens in Safari; the website's other pages stay out of the app
        if url.host != Site.base.host, ["http", "https", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loading = false
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fail(error)
    }

    // iOS can stop a web view's page in the background to save memory: bring the game back
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load()
    }

    private func fail(_ error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return } // a navigation the policy above cancelled
        loading = false
        failed = e.domain == NSURLErrorDomain ? "Check you’re online, then try again." : e.localizedDescription
    }
}

// The game asks before anything that can't be undone (start, pause, the Crown, the host's tools) with confirm() and
// prompt(): web views only show those if the app does
extension GameModel: WKUIDelegate {
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        guard let top = topController() else { return completionHandler() }
        top.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        guard let top = topController() else { return completionHandler(false) }
        top.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText; $0.autocapitalizationType = .allCharacters }
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text ?? "") })
        guard let top = topController() else { return completionHandler(nil) }
        top.present(a, animated: true)
    }
}

extension GameModel: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let pattern = body["vibrate"] else { return }
        // a pattern means it's your turn: a real buzz, felt even with the phone face down; a single pulse means your
        // clock is running out: a hard tap
        if pattern is [Any] { AudioServicesPlaySystemSound(kSystemSoundID_Vibrate) }
        else { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
    }
}

// WKUserContentController keeps its handlers alive; this keeps the game's model from living for ever with it
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
