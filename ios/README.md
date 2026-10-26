# The Betrayal for iPhone (native)

A native iPhone and iPad app for **Modern**: everyone plays on their own phone, against the same game server and API as
the website (`worker/src/index.js`, `worker/src/modern.js`). Nothing in it is a web view. Every screen of
`src/modern-ui.js` is redrawn in SwiftUI, with the palette and type of `src/modern.css`, the art of `src/art.js` and the
music of `src/audio.js`. Classic stays on the website.

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

## What it does

- **The start screen** (`UI/HomeView.swift`): join a Table with its code, use the device as a Table's TV, or open your
  own Table with a booking code. It makes the website's calls (`POST /api/games`, then `GET /api/g/CODE/m`), offers
  "carry on or start a new game" to a Regular and the test choice to the master passcode, and refuses a Table already
  set up for Classic. It shows no prices and no link to buy (App Store rule 3.1.1).
- **The game** (`UI/PhoneView.swift`, `PhonePhases.swift`, `PhoneTrial.swift`, `Tools.swift`): every phase, every
  Trial, the host's tools (with the three checks before **Show me the roles**), pause, rejoin requests and last words,
  in the page's words. `Model/Session.swift` does what the page's `poll`, `send`, `doJoin` and `doCreate` do: it polls
  `GET /api/g/CODE/m` about once a second (faster during Snap, slower in the background), sends taps to `m/act`, and
  keeps the phone's token under the page's own storage name (`bt-m-CODE`).
- **The TV** (`UI/TVView.swift`): the TV page's every screen, sized to the screen as the page sizes it in `vh` and `vw`.
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

`.github/workflows/ios-native.yml` runs on one of GitHub's Macs whenever `ios/` changes (or by hand, with an option to
play the whole game):

1. `ios/ci/main.swift` builds the model with `swiftc` and reads every moment of `Debug/Fixtures.json` (a whole game
   recorded from the real rules engine by `ios/tools/fixtures.mjs`), and every drawing.
2. It builds the app (Debug and Release) and runs it in the iPhone simulator: the start screen, the art (`-art`), two
   dozen recorded moments as the phone shows them (`-demo NAME`), and every moment as phone and TV drawn offscreen
   (`-render-all`, which can't draw text fields).
3. It starts the real Worker (`wrangler dev`, with a test master passcode), and `ios/ci/drive.py` plays a game against
   bots as the host while the app shows the host's phone (`-server URL -play ROOM TOKEN`), photographing each new screen.
   Pushes play the first round; a run by hand can play the whole game.

The pictures are the run's `ios-native-screens` artifact and, as one commit, the ref `refs/screens/ios-native` (not a
branch, so nothing deploys it): `git fetch origin refs/screens/ios-native && git show FETCH_HEAD --stat`. Mac minutes
count ten times against the account's Actions allowance; a run takes about ten minutes.

The Debug build's launch arguments (`Debug/Demo.swift`) are compiled out of Release, and `Fixtures.json` is left out of
the Release bundle.

## Not checked yet

- A real iPhone, a real AirPlay TV, and the sound through a speaker: the simulator can't show a second display from the
  CI, and nobody has heard the rendered music on a device. Try both before a party.
- App Store review: hosting needs a booking code bought on the website, which Apple may question (rule 3.1.1 and 3.1.3).
  Joining a Table never needs one.
