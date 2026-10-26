import SwiftUI

@main
struct TheBetrayalApp: App {
    init() {
        Theme.registerFonts()
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
                .preferredColorScheme(.dark)
                .tint(Theme.brass2)
        }
    }
}
