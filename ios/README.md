# The Betrayal for iPhone (native)

A native iPhone and iPad app for **Modern**: everyone plays on their own phone, against the same game server and API as
the website (`worker/src/index.js`, `worker/src/modern.js`). Nothing in it is a web view. Every screen of
`src/modern-ui.js` is redrawn in SwiftUI, with the palette and type of `src/modern.css`, the art of `src/art.js` and the
music of `src/audio.js`. It stands on its own: booking, joining, the TV, How to play, the terms and the privacy notice
are all in the app, so it needs the game server (the Worker's API) but none of the website's pages. Classic isn't in it.

## Run it

You need a Mac with Xcode 16 or later.

1. Open `ios/TheBetrayal.xcodeproj`.
2. Pick an iPhone simulator at the top of the window and press **Run** (⌘R).

**On your own iPhone:** plug it in (or pair it over Wi-Fi), choose it at the top of the window, then in the target's
**Signing & Capabilities** tab choose your **Team**. Your Apple ID works as a free personal team: the app runs on your
phone for 7 days at a time. TestFlight and the App Store need the Apple Developer Program. The bundle identifier is
`uk.co.thebetrayal.app`, the same as the web-view app on the `claude/laughing-ramanujan-q36all` branch, so the two
replace each other on a phone; change it in the target's settings to keep both.

**To test on your own:** enter the master passcode as the booking code and choose **Play against bots**.

**Buying, from Xcode:** the shared scheme runs the app with `ios/Store.storekit` (Xcode's StoreKit testing: test prices,
Apple's test purchase sheet, no money). The real server refuses those purchases ("only work on a development server")
and the app says so. To get a code from one, run the Worker locally with `npx wrangler dev --var APPSTORE_LOCAL:1` and
launch the app with `-server http://<your Mac's address>:8787` (Edit Scheme → Run → Arguments). To try real sandbox
purchases (TestFlight, or a sandbox tester), set the scheme's StoreKit Configuration to None; that needs the products set
up in App Store Connect (HANDOVER §6.2a).

## What it does

- **The start screen** (`UI/HomeView.swift`): join a Table with its code, by scanning the TV's QR code (`UI/Scanner.swift`)
  or from a `thebetrayal://join/CODE` link; use the device as a Table's TV; open your own Table with a booking code. It
  makes the website's calls (`POST /api/games`, then `GET /api/g/CODE/m`), offers "carry on or start a new game" to a
  Regular and the test choice to the master passcode, and refuses a Table already set up for Classic.
- **Booking** (`Model/Shop.swift`, `UI/ShopView.swift`): a Table (consumable) and the Regular plan (monthly
  subscription) with Apple's in-app purchase, at the App Store's price. Each purchase goes to `POST /api/appstore/claim`,
  which checks it with Apple and returns its booking code (HANDOVER §6.2a); only then does the app finish the purchase,
  so a code is never lost to a dropped connection (unfinished purchases are claimed again at the next launch). Codes
  bought, or used to open a Table, are kept on the phone under **Your booking codes**. **Restore purchases** brings a
  Regular to a new phone; **Manage subscription** is Apple's own sheet.
- **How to play, the terms and the privacy notice** (`UI/Pages.swift`): the website's pages rewritten for the app (Apple
  takes the payments, codes are kept on the phone, the camera reads QR codes). Change them with the website's.
- **The game** (`UI/PhoneView.swift`, `PhonePhases.swift`, `PhoneTrial.swift`, `Tools.swift`): every phase, every
  Trial, the host's tools (with the three checks before **Show me the roles**), pause, rejoin requests and last words,
  in the page's words. `Model/Session.swift` does what the page's `poll`, `send`, `doJoin` and `doCreate` do: it polls
  `GET /api/g/CODE/m` about once a second (faster during Snap, slower in the background), sends taps to `m/act`, and
  keeps the phone's token under the page's own storage name (`bt-m-CODE`).
- **The TV** (`UI/TVView.swift`): the TV page's every screen, sized to the screen as the page sizes it in `vh` and `vw`.
  Its QR code is `thebetrayal://join/CODE`: an iPhone's Camera opens the app at that Table. Guests need the app (there's
  no Android version); the app's scanner also reads the website TV's codes.
  - **On a TV:** AirPlay the phone to a TV (or use a cable). The app gives the second display a scene of its own
    (`ExternalDisplay` in `App/TheBetrayalApp.swift`) showing the TV of the Table the phone is at, with the music. It
    never mirrors the phone, so a player's role can't reach the TV.
  - **On an iPad or a spare phone:** type the Table code on the start screen and choose **Use this screen as the TV**.
    The narrator and sound buttons are in its bottom-left corner, as on the website.
- **What the website can't do on an iPhone, the app does:** it taps the phone when something needs its player, and
  hard ten seconds before a clock closes on an unanswered question (the page's `navigator.vibrate`, which iPhones
  ignore); it keeps the screen awake at a Table.
- **The model** (`Model/`) reads the server's views leniently: a field that's missing, or of another type, reads as
  nothing rather than failing the screen, so the server can add fields without breaking the app.

## Where the look comes from

| | made from | by |
|---|---|---|
| fonts (`Resources/Fonts`) | `worker/public/fonts`, latin and latin-ext joined; Grenze Gotisch fixed at 400 and 600 | `ios/tools/fonts.py` |
| icons, seals, crest | the SVG in `src/art.js`, kept as text and drawn natively | `UI/Art.swift` reads the path data |
| music and sounds (`Resources/Sound`) | the synthesiser in `src/audio.js`, rendered in headless Chromium: each scene a seamless 16-bar loop, each sound effect the Modern page plays | `node ios/tools/sounds.mjs` |
| colours, sizes, spacing | `src/modern.css` | by hand, in `UI/Theme.swift` and `UI/Components.swift` |
| app icon | the seal, as `tools/brand/make_seal.py` renders the web icons | |

After changing `src/art.js`'s drawings, copy them into `UI/Art.swift`. After changing `src/audio.js`, run
`./build.sh` and then `node ios/tools/sounds.mjs`.

## When the game changes

The app shows what the server sends, so most rule changes need no app change. A new screen, a new kind of Trial item
or new words on the page do: change `src/modern-ui.js`, then the matching view here, and run
`node ios/tools/fixtures.mjs > ios/TheBetrayal/Debug/Fixtures.json` so the checks below see the new moment.

## Checks

`.github/workflows/ios-native.yml` runs on the owner's own Mac, as a GitHub Actions self-hosted runner, whenever `ios/`
changes (or by hand, with options to play the whole game, or to use one of GitHub's Macs when the owner's is off):

1. `ios/ci/main.swift` builds the model with `swiftc` and reads every moment of `Debug/Fixtures.json` (a whole game
   recorded from the real rules engine by `ios/tools/fixtures.mjs`), and every drawing.
2. It builds the app (Debug and Release) and runs it in the iPhone simulator: the start screen, the art (`-art`), the
   booking card and saved codes with made-up prices (`-shop -scroll book`), the sheet after a purchase (`-bought`), the
   three pages (`-page rules`), two dozen recorded moments as the phone shows them (`-demo NAME`), and every moment as
   phone and TV drawn offscreen (`-render-all`, which can't draw text fields). `ios/ci/main.swift` also checks which
   Table a scanned code or link opens.
3. It starts the real Worker (`wrangler dev`, with a test master passcode), and `ios/ci/drive.py` plays a game against
   bots as the host while the app shows the host's phone (`-server URL -play ROOM TOKEN`), photographing each new screen.
   Pushes play the first round; a run by hand can play the whole game.

The pictures are the run's `ios-native-screens` artifact and, as one commit, the ref `refs/screens/ios-native` (not a
branch, so nothing deploys it): `git fetch origin refs/screens/ios-native && git show FETCH_HEAD --stat`. A run takes
about ten minutes.

**Setting up the Mac as the runner** (once):

1. On GitHub: the repository → **Settings → Actions → Runners → New self-hosted runner** → **macOS**, and the
   architecture of the Mac (**ARM64** for Apple silicon). Run the commands it shows in Terminal: they download the
   runner into a folder, and `./config.sh` registers it (accept the default name and labels).
2. Start it: `./run.sh` in that folder, left open while work is going on; or, to have it start whenever you log in,
   `./svc.sh install && ./svc.sh start`. GitHub shows it as **Idle** when it's ready. Runs wait in the queue while it's off.
3. Xcode needs an iOS simulator (Xcode → Settings → Components). The run makes a simulator of its own, "Betrayal CI",
   and wipes it each time, so your other simulators are left alone. It sets up Node itself, keeps its build in
   `~/Library/Caches/TheBetrayal-CI` (delete it any time), and uses port 8790 while it plays.

Only pushes and runs by hand start the workflow, never a pull request, so nobody without write access to the
repository can run anything on the Mac. GitHub's own Macs (the run-by-hand option) count ten times against the
account's Actions minutes.

The Debug build's launch arguments (`Debug/Demo.swift`) are compiled out of Release, and `Fixtures.json` is left out of
the Release bundle.

## Not checked yet

- A real iPhone, a real AirPlay TV, and the sound through a speaker: the simulator can't show a second display from the
  CI, and nobody has heard the rendered music on a device. Try both before a party.
- Buying: the StoreKit code has only been built, never run against the App Store. The server's half is tested with
  Apple stubbed (`node qa/appstore.mjs`) and with an Xcode-style purchase on `wrangler dev`. Before release: a sandbox
  purchase of each product through TestFlight, a restore on a second device, and a sandbox refund.
- The QR scanner and the `thebetrayal://` link need a real iPhone (the simulator has no camera).
- App Store review: a booking code bought on the website still opens a Table in the app. Rule 3.1.3(b) (multiplatform
  services) allows that because the same things are on sale in the app; the app never mentions or links to the website's shop.
