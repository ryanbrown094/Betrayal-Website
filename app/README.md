# The Betrayal for iPhone

The iPhone app: Modern, played on everyone's own phone, from the same game server as the website. This is phase 1 of
the plan (the app shell). Free Tables, ads and in-app purchases are the next phases.

## Run it

You need a Mac with Xcode 27.1 (any Xcode from 16 opens the project).

1. Open `app/TheBetrayal.xcodeproj`.
2. Pick an iPhone simulator at the top of the window and press **Run** (⌘R).

**On your own iPhone:** plug it in (or pair it over Wi-Fi), choose it at the top of the window, then in the project's
**Signing & Capabilities** tab choose your **Team**. Your Apple ID works as a free personal team: the app runs on your
phone for 7 days at a time. TestFlight and the App Store need the Apple Developer Program. If Xcode says the bundle
identifier `uk.co.thebetrayal.app` is taken, change it there.

**To test on your own:** enter the master passcode as the booking code and choose **Play against bots**.

## What it does

- **The start screen** (`HomeView.swift`) is native: join a Table with its code, or open your own with a booking code.
  It makes the same two calls as the website's home page (`POST /api/games`, then `GET /api/g/CODE/m`), offers
  "carry on or start again" to a Regular, and the test choice to the master passcode. A Table already set up for Classic
  isn't opened: Classic stays on the website. It never shows the website's prices or links to them (Apple's rule 3.1.1).
- **The game** (`GameView.swift`) is the Modern page from thebetrayal.co.uk (`/m/CODE`) in a web view, so it always
  matches the website and the server. The app only shows the game's own pages (`/m/`, `/t/`, `/join`).
- **What the page can't do in an iOS web view, the app does:**
  - it vibrates when it's your turn and taps hard when your clock runs out (the page's `navigator.vibrate`);
  - it shows `confirm()` and `prompt()` as native alerts (Start, Pause, the Crown and the host's tools rely on them);
  - it keeps the screen awake while you're at a Table;
  - it hands the host's booking code to the page, as the website does (`sessionStorage`, read by `doCreate`).
- **Look:** the game's own fonts (converted from `worker/public/fonts`, OFL), colours from `src/modern.css`, and the icon
  rendered from the seal as `tools/brand/make_seal.py` renders the web icons.
- The phone remembers its last Table for 48 hours and offers **Back to the game**.

## Checks

`.github/workflows/ios.yml` builds the app on one of GitHub's Macs whenever `app/` changes, runs it in the iPhone
simulator and saves three screenshots as the run's `ios-screens` artifact: the start screen, the bridge check (a Debug
build's `-selftest` launch argument shows a page that tests vibration, the booking code hand-over and a native
`confirm()`), and a Table from the live server (`-open CODE`). Mac minutes count ten times against the account's Actions
allowance.

## Why not Capacitor

The plan proposed a Capacitor shell. A plain Swift project does the same job with nothing to install: no Node and no
CocoaPods, and it opens straight in Xcode. Google's AdMob and RevenueCat both ship Swift packages, so the next phases add
them in Xcode directly.
