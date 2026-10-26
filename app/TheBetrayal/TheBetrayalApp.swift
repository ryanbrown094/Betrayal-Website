import SwiftUI

@main
struct TheBetrayalApp: App {
    init() {
        Theme.registerFonts()
        if let font = UIFont(name: "AlegreyaSansSC-Medium", size: 18) {
            UINavigationBar.appearance().titleTextAttributes = [.font: font, .foregroundColor: UIColor(Theme.tallow)]
        }
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .preferredColorScheme(.dark)
                .tint(Theme.brass2)
        }
    }
}
