# The Betrayal — handover (1.1, 28 September 2026)

Written for whoever picks the project up next — most likely an LLM coding assistant working with Ryan. Read this, then `README.md`, then the code. Where something is untested or assumed, it says so.

---

## 1. What it is

**The Betrayal** is a commercial, hosted dinner-party game for 8–24 guests in one room. Guests have no phones in play; the props are blindfolds, chalkboards and chalk. Two screens run it:

- **The TV** — `/g/ROOMCD` on a laptop cast to the TV. It never receives secrets (§4.5).
- **The Keeper phone** — `/g/ROOMCD#host`. The Keeper plans the game up front (§5.0), then taps through it reading the lines it gives them.

It is sold as **a Table** (£15; a **booking code**, `OATH-XXXX-XXXX`, the first ones `CNDL-`) or as **a Regular** (£20 a month): redeeming a code opens a room (a Table) for 48 hours. Every room is its own Cloudflare Durable Object, so any number of parties play at once.

It grew out of a private party build ("v17", played 26 September 2026). For the product it was re-dressed so it stands on its own: new name and mark (a cloaked figure with a candle flame for a face), a plum / rose-gold palette, the setting is "the house", no default Keeper name, the letters game is **Longest Word**, and every party-only file (guest guide, invite, the old prize) was removed. On 28 Sep 2026 every term borrowed from TV formats was replaced with original ones (§5.9).

**Status (28 Sep 2026):** built and tested locally, including the real Worker under `wrangler dev`. Domain `cloakandcandle.co.uk` bought through Cloudflare; the repo is meant to deploy through Cloudflare's GitHub integration from the repo root (`wrangler.toml`). The whole site sits behind a pre-launch password (`SITE_PASSWORD` in `wrangler.toml`). Payments: code path written and unit-tested with Stripe stubbed; not tried against real Stripe.

**1.1 (28 Sep 2026):** every term borrowed from TV formats replaced (§5.9); 8–24 players, with bigger tables losing more a round (§5.10); legal pages and a placeholder checkout (§6.1); a master passcode for testing (§4.1); the TV final roll and Ghost rules fit 4:3 screens.

**1.2 (28 Sep 2026):** the end game always starts with four, with the Keeper choosing the rounds within what the table allows (§5.6); Stripe Checkout wired end to end, tested against a stub only (§6.2).

**1.3 (28 Sep 2026), for sale:** setup is a step-by-step wizard, one decision a page with a full explanation and a recommendation that follows the earlier choices (§5.0); only Sanctuary comes every round, and the Casting Vote, Crown, Confessor and Temptation come once a game (§5.3); Trial prize and setting overrides fold away on the brief; the site has `/rules` and `/tour` (real screenshots); the question banks are roughly three times bigger (§7).

**1.3.1 (28 Sep 2026), diagnostics:** Stripe's webhook is exempt from the site password (it was being refused with 401 while `SITE_PASSWORD` was set, so refunds and subscription changes never arrived; checkout only worked through the thank-you page). Refunds are matched however Stripe reports them (§6.2). Every game is recorded save by save; each TV and phone sends a trail of taps, screens, sync trouble and errors; "Report a problem" (Keeper: footer and Menu; TV: bottom-left) files a report with a snapshot of the screen; /admin has Rooms (config, full log, a replay of TV and phone, device trails), Reports, Errors (the master log) and Stripe events (§4.7).

**1.4 (28 September 2026), rebrand: Cloak & Candle → The Betrayal** (thebetrayal.co.uk). Every word players, hosts and buyers see moved to the vocabulary in `media/copy/glossary.md` (the Forsworn and the Loyal, the Keeper, Trials, the Interval, Sanctuary, the Casting Vote, the Crown, the Temptation, the Confessor, the Whisper, the Last Offer, Errands, the Purse, Trust or Doubt, Honour or Betray, the Sacrament, the Unmasking, Invitations, the Table). **Code, keys and saved games did not change:** roles are still `"cloak"`/`"candle"`, prizes `shield`/`dag`, phases `mission`/`mingle`, votes `end`/`exile`/`share`/`take`, so games in progress load. The rename was done with `tools/rebrand.py` (visible text only), `tools/rebrand_fixes.py` and `tools/rebrand_site.py` (the lines that needed writing: the Sacrament oath, the endings, the Crown being worn). The quiz, memory walls, songs and pictures banks were left alone (they are facts and objects). Tables are at `/t/CODE` and `/t/CODE#keeper`; `/g/CODE` and `#host` still work. `SITE_HOST` makes thebetrayal.co.uk the one address: `www.` and `OLD_HOSTS` (cloakandcandle.co.uk) redirect every page there with a 301, but the API answers on every domain so Stripe's webhook and open Tables keep working. **The Worker keeps its name `cloak-and-candle`:** renaming a Worker creates a new one with empty Durable Objects, which would lose every pass and room. Pass codes keep their `CNDL-` prefix for the same reason. Brand assets are from The Betrayal Brand Pack 2.0 (`media/`, `tools/brand/`).

**1.4.1 (29 Sep 2026), failed payments and polish:**

- **Admin passes**: a checkout nobody paid for or tried to pay for is never listed (it is dropped when Stripe says the checkout expired, and anything left over is cleared after 48 hours). A refused payment is kept as **Payment failed** with Stripe's reason (`payment_intent.payment_failed`, `async_payment_failed`, or an expiry whose payment carries a refusal), counted on the dashboard and filterable. `invoice.payment_failed` notes a refused renewal on a subscription code. **Add `payment_intent.payment_failed` and `invoice.payment_failed` to the Stripe webhook's events.** A checkout Stripe refuses to start now goes in the error log too.
- **Site**: a nav with a Buy button on every page; the home page leads with the pitch, a TV-and-phone showcase and the prices, and puts the code boxes after the FAQ; the code boxes stack on phones so the whole code shows; hover, focus and pressed states on every button; the brand font preloaded; skip links, live regions, safe areas. The buy page names the price on the button, explains instead of greying out when a box is unticked, and uses Invitation/Table throughout (the terms now say a “pass” is an Invitation and a “room” a Table). Fixed: the rules page showed the Sacrament paragraph three times; “a The Betrayal Invitation”, “The The Betrayal name”.
- **Keeper phone**: screen titles in the brand's display face; the top bar says Trial, Interval, Reckoning… instead of the code's phase names; “NOT SYNCED / OFFLINE” on a line of its own so it can't push Menu off a small phone; the Keeper PIN is 4–8 digits (a PIN with letters couldn't be typed on the unlock screen's number pad); Forsworn tagged F, not C; “9 Loyal”, not “9 candle”; “1 line”; the Confessor named in the prize picker; long names hyphenate instead of breaking mid-letter; a bigger “Report a problem” target; curly apostrophes in every spoken line. The play page's title and home-screen name were still “Cloak & Candle”.


**1.6 (29 Sep 2026), Modern:** a second way to play. After the booking code the home page asks **Classic** (as before: a Keeper, blindfolds, chalk, the TV) or **Modern** (everyone on their own phone). The choice is made once per Table. In Modern **the server runs the game**: `worker/src/modern.js` is a pure rules engine (`newGame`, `join`, `act`, `tick`, `viewFor`), stored under the `modern` key in the same GameState Durable Object. It is served at `/api/g/CODE/m` (GET, what this phone may see; `X-Tok` identifies the phone), `m/create` (the booker proves the booking code; master and open rooms need none), `m/join` (by name; after the start, a lost phone asks by name and the host lets it back in) and `m/act`. Every request calls `tick` first, so the timers move on without a background process. The page is `worker/public/modern.html`, built from `src/modern-ui.js` and `src/modern.css`, and served at `/join`, `/m/CODE`, and `/t/CODE` when the room is Modern (the TV is optional, and a phone at /t/ is offered "join as a player"). The content banks reach the Worker as `worker/src/content.gen.js`, which build.sh generates (commit it: the Git deploy doesn't run build.sh). The first to join is the **host (director)**. They play too, never see a role, and drive the evening's shape: Next Trial (or choose one), the Temptation (once), the Interval and the three courses, the Reckoning, revealing dawn. Inside a Trial it runs itself: each question closes when everyone has answered or its clock ends, shows the answer for five seconds, and moves on. The Oath asks each phone "Would you like to be Forsworn?" (yes / rather not / either), and the deal honours volunteers first. All fifteen Trials are played on phones (typed quiz answers marked leniently, with a fastest-answer bonus and a host "accept"; the Longest Word checked against `words.txt`; Snap timed by the server; actors get their word privately). Each wrong answer from a Forsworn costs the Purse 50, capped at half the Trial's offer. Sanctuary is secret or public (host's choice). At night the Forsworn choose on their phones while the Loyal make a dummy pick, so nobody can tell who is choosing; the victim is told first, in secret. The final covers exiles without reveal, Trust or Doubt, the Unmasking, and Honour or Betray. Tests: `node qa/modern-engine.mjs` (whole games at 6 to 24 players, every Trial, both outcomes) and `qa/modern.py` (eight phones and a TV under wrangler dev with `--var MASTER_PASS:MASTERTEST`). Not in Modern yet: Classic's twist powers (Casting Vote, Champion, Witness), the narrator, prize tiers set in the lobby, music and sound, and recording for the admin replay.

**1.5 (29 Sep 2026), brand and flow review:** the product is **a Table** (“Book a Table”, a booking code, `OATH-`) and the subscription **a Regular**; “Invitation” is gone (it clashed with inviting guests) and the terms define a pass as a booking code and a room as a Table. **The Sacrament** is **the Oath**. **The Casting Vote breaks a tie** instead of counting twice. **The Temptation** is PURSE or SELF. Setup is **five questions** then a ready summary, with **Customise** for the rest (§5.0); a **Short game**; a **Classic first game** (twists off until a game has been played on the phone); **a friend can keep** so the host plays. **Dinner in three courses** (`courses`: the starter after round one, the main mid-game, dessert before the final; `courseDue`, `COURSES`); **prizes that follow the Purse** (`s.prizes` at half and full, `prizeTier`; the TV only hears `tiers`); the **Ghosts’ call** (at each Reckoning the Ghosts chalk who goes; the Keeper taps who called it, `s.calls`, and the TV names them); **awards capped at six**; an optional **TV narrator** (▶ TV beside every line; the TV speaks it with the browser’s voice, `narrTV`, once, never replayed by an undo or a reload). Public copy uses the **core words** only (Forsworn, Loyal, Keeper, the Oath, Trial, Reckoning, Sanctuary, Purse, Ghost, the Unmasking); the other names are the TV’s to explain when they happen. Headings on the site and the Keeper’s phone are in **IM Fell DW Pica**; Grenze Gotisch is kept for the wordmark and the TV’s big moments. The **cracked wax seal** is the secondary mark (`tools/brand/make_seal.py`: `media/logos/the-betrayal-seal*`, the favicon and app icons). Fixed: the Unmasking cards said CLOAK / CANDLE; the Trust or Doubt result said “chose to exile”; the Ghost rules card overflowed a 4:3 TV. New test: `qa/flow.py`. The marketing pack, glossary and brand guidelines follow all of it.

---

## 2. Quick start

```sh
./build.sh
python3 qa/smoke166.py && python3 qa/plan.py && node qa/claim.mjs
npm i && npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var SITE_PASSWORD: --var BUILD:$(cat worker/public/build.txt) &
ADMIN_TOKEN=dev python3 qa/e2e.py http://127.0.0.1:8790/     # add MASTER_PASS=… (and --var MASTER_PASS:… above) to test it
python3 qa/big.py                                            # 8–24 players, second vote, many-victim nights, 24-player TV at 3 sizes
```

**Rules of the road:**

- **Never write the Cloudflare API token, `ADMIN_TOKEN` or `STRIPE_SECRET_KEY` into any file, zip or commit.** Pass the Cloudflare token as an environment variable at deploy time; the other two are Worker secrets (`wrangler secret put`). The Cloudflare token used during the party build was shared in chat — rotating it is recommended.
- **Deploys no longer wipe games** — customers may be mid-party. So: never change the saved game's shape in a way an in-progress game can't load. Add fields with defaults (read them through `rulesIn`-style helpers); bump `SCHEMA` only with a migration. A phone on an old build gets 426 and reloads onto the new build, keeping its game.
- Deploy to **staging** first, wait a minute, run `ADMIN_TOKEN=… qa/e2e.py https://staging.cloakandcandle.co.uk/`, then production.
- **Stay original.** No names, logos, music, catchphrases, presenter names or set pieces from any TV programme — in code, copy, art or commit messages. All art is original inline SVG; fonts are OFL.
- Ryan's style preferences: answer first; surgical changes; match file conventions; mark verified versus assumed; never report something done that wasn't run.

---

## 3. Files

```
HANDOVER.md, README.md
build.sh           src/ → index.html (standalone game) + worker/public/play.html; site/index.html → worker/public/index.html
                   (fonts inlined); media/web → worker/public/media; build.txt
deploy.sh          build + wrangler deploy (staging | production)
src/               the game page (§4)
site/index.html    the home page: SHOP settings (price, contact) at the bottom
site/page.html     the shell for the legal and checkout pages; site/pages/NAME.html → worker/public/NAME.html, served at /NAME
                   (terms, privacy, cookies, refunds, contact, buy, admin, rules, tour — BUY price display at the bottom of buy.html)
tools/marketing-pack.py  builds dist/The-Betrayal-Marketing-Pack.zip: game guide, setup guide, data sheets from the built game, brand, copy, screenshots, social (sources in media/copy/)
tools/webshots.py      web-sized copies of media/screenshots for the /tour page (run after qa/media.py)
tools/stripe-setup.sh  creates the Stripe product, price and webhook endpoint for one environment (§6.2)
worker/src/        index.js (router, GameState, Registry), codes.js, rules.js, public-view.js
worker/public/     build output + fonts, icons, words.txt (Longest Word dictionary), _headers, media/
media/             logos/, screenshots/, social/, palette/, copy/press-kit.md, src/guidelines.html, The-Betrayal-Brand-Guidelines.pdf
tools/             brand.py, mediapack.py, icons.py, passes.sh, recolour.py (the one-off palette move, kept for reference)
qa/                harnesses (§8)
```

---

## 4. Architecture

### 4.1 Rooms and passes (Worker)
- **Routes:** `/` home page · `/g/ROOMCD` game page (`play.html`) · `/api/g/ROOMCD/state|settings` a room's API · `POST /api/games {pass}` redeem · `POST /api/checkout {terms, supply}` → Stripe Checkout URL · `GET /api/claim?session_id=` · `POST /api/stripe/webhook` (signed) · `/api/admin/*` (Bearer `ADMIN_TOKEN`): `POST passes {count,note}`, `GET passes`, `POST revoke {pass}`.
- **Registry** (one Durable Object, `idFromName("registry")`): passes `pass:CNDL-…` → `{created, note, source, room?, expires?, redeemed?, revoked?}`, rooms `room:CODE`, Stripe claims `claim:<session>` and `pi:<payment_intent>` → pass, checkout rate `co:<ip>`. A pass bought through Checkout is `pending` until paid; a pending pass is refused with 402. Redeeming again returns the same room until it expires (a Keeper who lost the link). 20 failed redemptions an hour per address, then 429.
- **GameState** (one per room, `idFromName("room:CODE")`): `meta {room, expires, pass}` set by the Registry on creation; unknown rooms are 404. After `expires` the room is read-only (writes get **423**); an alarm deletes it `KEEP_DAYS` later. Otherwise unchanged from the party build: PIN, wrong-PIN limiting, 409/410 save rules, poll tags, question-bank switches (now per room).
- **Vars:** `PASS_HOURS` (48), `KEEP_DAYS` (7), `BUILD` (set by deploy.sh), `SITE_PASSWORD` (the pre-launch gate). **Secrets:** `ADMIN_TOKEN`, `STRIPE_SECRET_KEY`, `MASTER_PASS`.
- **Master passcode** (`MASTER_PASS`, a secret): entered in the home page's pass box (any case, spaces trimmed) it opens a **fresh room every time**, recorded with `pass: "MASTER"`. For testing; unset it to switch it off. Wrong guesses count against the same 20-an-hour limit as passes.
- **Pages:** `/terms`, `/privacy`, `/cookies`, `/refunds`, `/contact`, `/buy` are served from `worker/public/NAME.html`. `OPEN_ACCESS=1` lets `POST /api/games` with no pass make a room — development only.
- Codes avoid 0/O/1/I/L. Rooms: 6 characters. Passes: 8 characters, shown as `OATH-XXXX-XXXX` (`shownPass` in `codes.js`); stored under `pass:CNDL-…` as they always were, and `normPass` accepts either prefix or none, so codes sold before 1.5 keep working.

### 4.2 The page
`build.sh` concatenates `fonts.css`, `style.css`, `content.js`, `scripts.js`, `public-view.js`, `core.js`, `audio.js`, `art.js`, `tv.js`, `host.js`, `boot.js`. `isHost` = `#host`. `ROOM` comes from the path; `API` is `/api/g/ROOM` (or `/api` with no room — the local test server's default room). The standalone `index.html` still runs on localStorage with no server.

### 4.3 State and actions
One JSON `state`; `SCHEMA = 12`, `APPV = "1.2"` (12: role keys became `cloak`/`candle`; a game saved by 1.0 is refused with "a game from an older version" — nothing was live). Every change goes through `act(fn, logline)` (clone, run, stamp, log, save; stale taps dropped). Undo: 30 local snapshots plus a short `prev` chain; `rewindRound` restores `roundSnap`. New in 1.0: `rules` (§5.0), `plan`, `planAt`.

### 4.4 Sync
Both screens poll `GET …/state` about once a second (`X-Have` tag → `{same:true}`). The phone queues saves and rebases after lost replies. GET bodies carry `room {code, expires, expired}`. Status handling in `flushSaves`: 426 reload, 403 wrong PIN, 410 wiped elsewhere, 409 another phone moved, **423 pass expired** (read-only toast).

### 4.5 Secrets and the public view
`worker/src/public-view.js` is the single source of truth for what the TV may know (roles, PIN, log, undo chain, Confessor, secret Casting Vote holders, Trial secrets, quiz answers, the night's victim until its line, Errands, unrevealed votes, the prize and stats until the final phase). **When you add a secret field, add it there.** `rules`, `plan` and `planAt` are not secret.

### 4.7 Diagnostics
- **Recording** (`GameState.record`): every accepted PUT stores `recl:<n>` (time, kind start/save/wipe, the newest log line, phase, round, version) and `recs:<n>` (the whole state, gzipped). Up to `RECMAX` (20,000) a room; deleted with the room.
- **Device trail** (`src/diag.js`): taps (button labels only), screen changes, visibility, network, sync failures (`crumb()` calls in `core.js`), errors and unhandled rejections. Sent every 15 s (errors at once, and on pagehide) to `POST /api/g/CODE/events`, stored as `ev:<n>` batches (up to `EVMAX` = 2,000 of at most 32 KB). Errors are copied to the master log.
- **Reports** (10 an hour per address): `POST /api/report` {room, what, expected, email, snap (gzipped base64 HTML of the page without scripts), crumbs…}. The Registry keeps `rep:<R-XXXXXX>` and the snapshot in 100 KB chunks (`repx:`); the room gets `keepUntil` = +90 days (its alarm waits for it) and notes the report. A report also goes in the master log.
- **Master log** (Registry `err:<time>`, newest 3,000): `src` browser / server (every Worker and GameState exception is caught and logged, then 500) / stripe (bad signatures, refunds that match no pass) / report. **Webhook log** `hook:<time>` (newest 1,000): every verified Stripe event and what it did.
- **Replay:** `/play.html#replay-tv` and `#replay-host` start nothing (no polling, no saves) and expose `replayShow(state)`; the TV side gets `publicView(state)`, as the real TV would. `/admin` loads both in iframes and feeds them recorded states.
- **Admin API** (session or Bearer): `GET rooms`, `room/CODE/room|recs|rec?n=|events`, `errors`, `hooks`, `reports`, `report?id=`, `POST report {id, status, note}`.
- Workers Logs (`[observability]` in wrangler.toml) also keep console output in the Cloudflare dashboard.

### 4.6 TV
`tvView(s)` → `{key, html, scene, sfx…}`; title cards on phase changes; large text by default; tuned for 16:9/16:10. Everything passes through `kw()` for the kill style. Before a game, the TV shows the room code and the Keeper link.

---

## 5. The game

### 5.0 The game plan (setup)
A wizard on the phone (`WIZ` in `host.js`). **Five questions** (`core: true`: players, how long, murder or poison, the prize, who keeps) and the PIN lead to **Ready**, a summary with every other choice already made; each line has **Change** (back with **Done**), and **Go through every choice** walks the **Customise** pages (the rest of `WIZ`) and returns to the summary. **Who keeps:** the host, or “a friend will keep, and I’ll play” (the host must be in the players, the Keeper must not); then Ready's button is **Hand over to …**, a handover page where the Keeper can change the PIN and presses **Start game**. The **Short game** (2 hours) recommends one Trial a round, no Interval, no dinner. A **first game is Classic**: `RECS` recommends every twist off and Sanctuary public until `localStorage['candle-played']` is set, which happens when a game reaches its final screen on that phone. `RECS` gives every choice a recommendation worked out from the ones before it (e.g. rounds from table size and hours via `estMins`, dinner mid-game, Errands only with an Interval). Until the Keeper picks something themselves (`d.touched`), `settle()` keeps each choice on its recommendation. Pages that don't apply are skipped (no Sanctuaries → no Crown or Temptation page). The draft lives in `sessionStorage` (`candle-draft`); tests drive it by setting `setupDraft` and calling `submitSetup()`. Saved in `state.rules` (`RULES0` in `core.js` has the defaults; `cleanRules` validates):

| rule | values | effect |
|---|---|---|
| `rounds` | 0 = by table size, or 1–10 | fixed: round N becomes the final (`nextRound`). The five-left rule still applies |
| `perRound` | 0 = by the clock, 1, 2 | Trials a round (`perRoundOf`) |
| `dinnerAfter` | 0–10 | the morning after that round offers dinner as the main button |
| `mingle` | on/off | a 10-minute Interval before each Reckoning |
| `pool` | Trial keys or null (all) | `planMissions` deals them: the icebreaker first, Ghost games after Trial two, no repeats until used up. `state.plan`/`planAt` hold the order; `nextPlanned` skips the Statue until there are Ghosts |
| `kill` | `murder` / `poison` | murder: the victim is tapped and leaves the table under blindfold; poison: told at night, announces at dawn, last words, leaves. Wording swapped by `kw()` everywhere (Keeper, TV, scripts) |
| `ghosts` | on/off | off: `ghostsOf` returns nobody — no lore, verdicts, Ghost round, Statue |
| `convert`, `bargain` | on/off | `autoMode` picks the night: one Whisper, then one Last Offer, only for a lone Forsworn v 4+ Loyal |
| `quests` | on/off | one Errand pre-chosen each night |
| `shield` | mix / public / secret / off | `autoPrize`; mix = hidden in round-by-round Trials, public elsewhere |
| `blade`, `champion`, `witness`, `dilemma` | on/off | Casting Vote and Crown once a game each (`onceRound`: the Casting Vote about halfway to the final, the Crown later; `state.gave` records them); Confessor only at five with one Forsworn; the Temptation once, offered when nobody holds Sanctuary |

The Menu has **Your game plan** (the summary and the next six Trials).

### 5.1 Flow
1. **The game plan** (phone, §5.0): players and PIN, the evening, the Trial pool, nights and Ghosts, secret roles, Purse and prize.
2. **Lobby** → **intro** (the rules card on the TV) → **night 0** (the Forsworn are chosen and see each other).
3. **Each round:**
   - Day: the plan's next Trial, one tap (the Keeper may swap it). One or two a round, by the plan.
   - Trial: brief → prize step → play → done.
   - Sanctuary step: ceremony or card.
   - Interval before the table if the plan has it (always when an Errand is in play); dinner at the morning the plan names.
   - Reckoning: talk → boards → exile.
   - Reveal: the role is shown unless it's the final; the new Ghost gives their verdict.
   - Night: a kill (murder or poison, by the plan), or a Whisper / Last Offer when one Forsworn faces four or more (if switched on), plus an Errand.
   - Morning: dawn reveal (murder: an empty chair; poison: the victim stands, last words).
4. **The end game** (automatic, see §5.6).
5. **The final ceremony:** seals turned one by one (hold for a drumroll). With two or more Forsworn left, honour or betray; then possibly the Ghosts' round.
6. **Final screen:** winner, prize, Purse split and the full roll (converted or bargain Forsworn marked). Then the **awards**, revealed one at a time.

### 5.2 Trials (`content.js` → `MISSIONS`)
Most Likely To; Rapid Quiz; Longest Word (key `countdown`); Closest Guess; Memory Wall; Snap; Rock Paper Scissors Royale; One Leg; Screen Charades; Hum It; The Statue; Two Truths and a Lie; Chalkboard Pictionary; Higher or Lower; What Changed?; The Temptation (add-on); Custom.

- **Settings:** per-mission options (`MSET`) have defaults; the Keeper can change them on the brief, and they're remembered in `prefs`.
- **Prizes** are set by the plan (`autoPrize`); the brief shows them pre-selected and the Keeper can still change them.
- **Labels:** the TV shows "round N · Trial M".
- **Brief, then prize:** the TV shows the brief first. The Keeper picks the prizes and taps **Confirm — prize on TV**; the TV then shows a prize card with one labelled line per prize, plus the points on offer. **Start Trial** begins play. Most Likely To and the Temptation skip the prize step.
- **Quiz:** tapping who shouted shows "X — locked in"; the answer appears only after the Keeper taps Correct or Wrong.
- **What Changed?:** runs itself. When the study clock ends the grid hides, a 10-second countdown runs, then the new grid appears. The Keeper phone must be awake for the hide.
- **Charades, Hum It, Pictionary:** "Blindfolds on — everyone but X" (nothing else shows) → "Blindfolds are on — show X" (the word appears, with "Don't know it? Ask ‹Keeper› to skip").
  - **Hum It** then splits "Blindfolds off" and "Start 30 s". While the clock runs the music is silent and the clock shows only for its last 5 seconds.
- **Higher or Lower:** shows the round winner before everyone stands again.
- **Ties:** broken only when something rides on the winner (a public Sanctuary or Casting Vote).

### 5.3 Prizes: Sanctuary, Casting Vote, Crown, Confessor
- **Sanctuary** (safe from poison tonight): none / the overall winner (public) / 1–2 **hidden** questions or rounds (Trials played in rounds only: quiz, Longest Word, Closest Guess, Higher or Lower, What Changed?).
  - A hidden Sanctuary is won by whoever wins *that* question or round (answers it correctly, is closest, has the longest word…), **not** by winning the Trial. The rounds are drawn at random, never the first when there's a choice, and only the Keeper sees them.
  - At most a quarter of the table (minimum one) holds Sanctuaries at once. There are no Sanctuaries in the final.
- **Casting Vote:** breaks a tie (1.5; it used to count twice). Every board counts once; at “All boards in”, if the top is level and the holder chalked one of the tied, that one gets +1 (`tally`); otherwise it does nothing and a tie goes to the usual revote. `bladeKill` = the tie-break decided the exile. Options: none / overall winner / a hidden round of its own / **with Sanctuary** — which makes the **Crown** (public or hidden, as Sanctuary is). **Once a game:** the Casting Vote (on its own) and the Crown are each given once, from the round `onceRound` picks; an unclaimed one comes round again on the next Trial. On the Casting Vote's round a Trial without rounds offers the Casting Vote *instead of* Sanctuary. The Keeper can still put either on a Trial sooner from "Change the prizes" on the brief, until it has been given. The Temptation is offered once a game (`dilemmaFree`).
- **At the Reckoning** the Casting Vote is automatic. Every board counts one as it turns. When the Keeper taps "All boards in", the TV's main line becomes **"the Casting Vote fell on Y"** and one vote is added. The holder is never named.
  - If that extra vote decided the exile, the reveal plays a **Casting Vote stab with a drop of blood**.
  - **Only the Crown** may lay down Sanctuary and Casting Vote before the first board, to be immune from that exile (and unprotected that night).
- **Secret winners** are tapped in a ceremony. Each prize has its own tap line and the phone says who to tap on which line.
  - A Forsworn who wins a hidden Sanctuary on its own gets nothing and no ceremony.
  - A Forsworn who wins a hidden Casting Vote or the hidden Crown keeps it.
- **The Confessor** is only offered with exactly **5 alive and 1 Forsworn**, which means the final round, before its Reckoning. The TV calls it "a special prize".
  - Whoever wins it meets the Forsworn in a ceremony straight after the Trial. Nothing said aloud names it; the tapped person reads the screen.
  - The Confessor can't be poisoned.
  - If the Forsworn wins, the Keeper taps them and then walks the table tapping nobody. The room hears identical lines, and nothing happens.

### 5.4 The Purse
- The target is 2000 (set at setup). The Purse is capped there, and **the TV does not show the target**.
- Each Trial offers what's left, shared over the Trials likely still to come (`offerOf`/`missionsLeft`). The final round offers the rest.
- **Everything moves in multiples of 50.**
- **Wrong shouts** (quiz Wrong, Snap −, What Changed? "wrong shout") cost 50 for a Forsworn's; a Loyal player's costs nothing. With the setup/Menu option "everyone's", a Loyal player's costs 50 and a Forsworn's 100.
  - The room sees only the total ("Wrong shouts cost it 50"); the Keeper sees whose.
  - A failed Errand costs 50.
- **The Temptation's** stake is the current offer (at least 100) and says its points.
- **At the end** the winners split the Purse. All share → split, and rock, paper, scissors for the prize. One takes → the Purse and the prize.

### 5.5 Reckoning details
- **Talk timer.** Before the first board, the Keeper is reminded of the Crown's option. A secret Crown is reminded without being named.
- **The tally is hidden on the TV by default** (the Keeper can show it). Count nudges appear on the phone when it's close (level, one in it, or decided) — in words, never digits.
- **Ties:** revote between the tied players, or the Keeper picks.
- **Exile reveal:** a single tap after the exiled player has said their role themselves. There is no drumroll. The final ceremony keeps a hold-for-drumroll on each seal.
- **Ghosts:** the exiled and the poisoned become Ghosts. They give one secret verdict (name a Forsworn) **straight after their exile**; the first time, it comes after the ghost lore. It counts at the end.

### 5.6 The end game — always starts at four
- **Five-left Trial (1.3.2):** if the final opens with more than five (Sanctuary held on the last night), its unrevealed votes go down to five, then `fiveMission()` plays one more Trial before the last vote, so the Confessor can be won. The final never deals Most Likely To (it carries no prize).
- **Whatever the plan, Trust or Doubt starts with four at the table.** The final round opens with five; its Reckoning takes one more with no role reveal (the unannounced exit), then Trust or Doubt.
- **The rounds are the Keeper's choice, within what the table allows** (`roundsRange`): from the fewest (every round at full stretch: `capacityAt`) to the most (one exile and one victim a round). Setup shows the range for the names entered; `startGame` clamps anything outside it. Auto = the fewest.
- **Each round is sized as it starts** (`roundTarget`, kept in `state.rt`): what's left to lose before five, spread over the rounds left, raised until the later rounds can still finish at full stretch. It sets the Reckoning's exiles (1, or 2 above sixteen) and the night's victims (up to 2 from 12 alive, 3 from 20). A simulation of every table size (8–24) against every allowed plan reaches the final with exactly five on the planned round.
- **When the final opens with more than five** (Sanctuary held, someone left), its Reckoning keeps voting — no reveals — until four remain ("Another vote — N more to go"). Fewer than five (people left) goes straight to Trust or Doubt.
- **No early endings mid-game.** Forsworn at parity keep playing into the night; with no Forsworn left the Keeper is sent straight to the final round. The Menu's "End game now" is the only override.
- In a game that started with more than 5 players, the round that starts with **5 or fewer alive is the final**.
- **Five never becomes four by poison.** An exile that leaves 5 goes straight into the final round with no night; `startNight` refuses at 5 too. From 6, the night's poison makes 5.
- The **final Reckoning takes 5 to 4 with no role reveal**. Then it's **Trust or Doubt** with every remaining player voting in secret on the phone.
  - Only a unanimous TRUST ends the game.
  - Otherwise another table (no reveal): 4→3 and vote again; 3→2 goes to the final-two ceremony.
  - A final-round table with 4 or fewer goes straight to the vote.
- **The ceremony:** the Keeper turns each survivor's seal.
  - With two or more Forsworn left: **honour or betray** (phone handed round). All share → split the Purse, RPS for the prize. One takes → takes both. Two or more take → it goes to Ghosts who named a Forsworn (their own share-or-take round if there are several), otherwise the Keeper keeps it.

### 5.7 Awards
`awardsOf` in `core.js`. There are 21 candidates, in order of weight:

1. The Sharpest Eye
2. The Grand Deceiver
3. The Deciding Vote
4. The Turncoat
5. Couldn't Be Bought
6. The Ghost Who Saw
7. The Confessor
8. The Backstabber
9. The Narrow Escape
10. First Blood
11. The Martyr
12. Trial Machine
13. The Kingmaker
14. The Lightning Rod
15. The Wild Card
16. Barking Up the Wrong Tree
17. Sanctuary Seeker
18. The Hoarder
19. The Lone Wolf
20. The Untouchable
21. Last Oath Standing

- **One per person.** Each award goes to the best-placed player who hasn't had one yet.
- **The total is trimmed to 2, 4 or 6** (1.5: six at most, so the end stays short), and the Keeper can **Show the rest** at once after the first.
- **The Ghost Who Saw** weighs a correct verdict (2) and each Ghosts’ call (1).
- **Reveal order:** lightest first. The TV starts with sealed cards, and the Keeper taps "The first award", "Next award"…

### 5.8 Scripts and wording
- All Keeper lines live in `scripts.js` (`SAY`, `nightScript`, `CEREMONY_`, `WITNESSNOW_`). `vr(list, round)` rotates phrasings by round so no two rounds sound the same.
- **Spoiler rules the scripts follow:**
  - nothing aloud names who holds a secret prize;
  - the Confessor is "a special prize";
  - title cards are generic;
  - a shielded victim is never tapped.
- **Blindfold lines include Ghosts** when there are any.

### 5.9 Original terms (1.1)
Everything that echoed a TV format was renamed, in copy and in code:

| was | now | code |
|---|---|---|
| Faithful / Traitor | **Loyal / Forsworn** | `role: "candle" / "cloak"`, `candles()`, `cloaks()`, `winner: "candles" / "cloaks"` |
| banish, banishment, "End or Banish" | **exile**, "Trust or Doubt" | `exile()`, vote value `"exile"` |
| Seer | **the Confessor** | `witness`, `witnessOffer`, `WITNESSNOW_` |
| Dagger / Warrior | **the Casting Vote / the Crown** | `blade`, `champion`, `championOf` |
| Recruit / Ultimatum | **Whisper / Last Offer** | modes `convert` / `bargain` |
| breakfast | **dawn** | |
| share or steal | **honour or betray** | `castTake`, vote `"take"` |

Kept as ordinary game words: Sanctuary, murder, poison, Trial, Ghosts, the Reckoning (original). CODEWORDS (unused) had its show words swapped in place, so positions are unchanged. The Keeper's spoiler strip reads "6 Forsworn v 33 Loyal".

### 5.10 Big tables (8–24 players)
- Setup takes **8 to 24** names (`MINP`, `MAXP` in `core.js`). Default Forsworn: 2 (8–10), 3 (11–15), 4 (16–22), 5 (23–24).
- **Two exiles** while more than 16 sit at the Reckoning (`exilesAt`): after the first reveal (and Ghost lore) the Keeper's button is **The second vote**, which opens a fresh table (`table.second`). The Casting Vote has already fallen, so in the second vote nobody holds it and nobody can buy immunity (`championOf` is null there); the talk timer is 3 minutes.
- **Several night victims** (`killsAt`): 2 from 12 alive, 3 from 20, never below five. Each victim is a **pass** of the night script (`night.pass`, `night.kills`, earlier picks in `night.victims`, redacted to "·" on the TV). Pass 1 is the usual night; each later pass wakes the Forsworn again ("The night isn't over"); the Keeper taps **Next victim** between passes. Sanctuary saves its holder as before. Dawn names every victim (`morning.victimIds`, `many`, `saved` when Sanctuary held too); poison gives 30 s of last words each.
- `roundsFrom(a)` simulates this to plan rounds and pace: 8 → 3 rounds, 14 → 5, 16 → 6, 20 → 7, 24 → 8 (final included).
- TV: the final roll goes six across without seals above 16 players; the Ghost-rules screen hides the candle rail above 16; the rules card mentions two exiles and several victims when they apply.

---

---

## 6. Operations

### 6.1 Legal pages and checkout (placeholders)
- `site/pages/`: `terms.html` (sale and use), `privacy.html` (UK GDPR notice), `cookies.html` (only strictly necessary storage, so no banner), `refunds.html` (14-day cancellation until the pass is first used; Consumer Rights Act remedies), `contact.html` (trader details the E-Commerce Regulations require). Placeholders are `<span class="ph">[…]</span>` — they show highlighted on the page until filled.
- `buy.html`: price, what you get, two required ticks (terms; immediate supply and losing the right to cancel once used — the Consumer Contracts Regulations need that consent) and a Pay button that posts them to `/api/checkout` (§6.2).
- Every page's footer links all five legal pages.

### 6.2 Stripe
- **Flow:** `/buy` → `POST /api/checkout {terms: true, supply: true}` → the Registry mints a **pending** pass → the Worker creates a Checkout Session (`mode=payment`, one `STRIPE_PRICE_ID`, promotion codes allowed, the pass in `metadata`, `client_reference_id`, the PaymentIntent's description and metadata, consent timestamps in metadata; see Managed Payments below) → the buyer pays on Stripe → back to `/claim?session_id=…`, where the home page asks `/api/claim`, which checks the session is paid and activates the pass.
- **Managed Payments.** The Stripe account has Managed Payments on (Stripe is the seller of record and handles tax). Checkout Sessions are created with `managed_payments[enabled]=true` and the API version header `2026-02-25.preview` (Stripe's Managed Payments blueprint); both products need an eligible **tax code** set in the Dashboard. It refuses invoice details and other extras, so sessions carry only the line item, URLs and metadata (no promotion codes) (the pass; for a subscription also `subscription_data.metadata.pass`). The pass is therefore **not** on Stripe's receipt: buyers see it on screen, and a lost pass is found on `/admin` by the buyer's email. If a checkout fails, `/buy` shows Stripe's reason in brackets and Workers Logs has it.
- **Refunds** arrive as `charge.refunded` (full or partial), `refund.created`/`refund.updated` or `charge.refund.updated`. `refundFor` finds the pass by the payment noted at checkout (`pi:`); failing that it asks Stripe for the charge, then the checkout session with that payment (its `metadata.pass`), then the invoice's subscription. An unused one-off pass is cancelled; a used one, or a subscription, is marked refunded. The webhook is exempt from the site password (it is signed). Subscribe the endpoint to `refund.created` and `refund.updated` as well as the events below.
- **Webhook** `/api/stripe/webhook` (signature checked with `STRIPE_WEBHOOK_SECRET`, 5-minute tolerance): `checkout.session.completed` (paid) and `async_payment_succeeded` activate the pass even if the buyer never returns; a checkout that expires with no payment tried is dropped (the admin never lists a checkout nobody paid for, and clears any left over after 48 hours); a refused payment (`payment_intent.payment_failed`, `async_payment_failed`, or an expiry whose payment carries a refusal) keeps the pass as **Payment failed** with Stripe's reason, cancelled once the checkout closes; `invoice.payment_failed` notes a refused subscription renewal on its code; `charge.refunded` (full refunds) cancels the pass if it hasn't opened a room, and only notes the refund if it has.
- **Settings:** `STRIPE_PRICE_ID` (var; empty = checkout closed, 503), secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. The publishable key isn't used: Checkout is Stripe-hosted.
- **Going live, per environment:** `STRIPE_SECRET_KEY=sk_… tools/stripe-setup.sh https://<domain> <pence>` → put the price ID in the `.toml`, put both secrets → in the Stripe Dashboard, turn on emailed receipts and fill the public business details → staging first with a test card (4242 4242 4242 4242): check the pass appears, the receipt carries it, and a refund cancels it → then live keys on production.
- **Billing:** the Unlimited plan is a Stripe Billing subscription. The one-off pass also uses Checkout's post-payment invoice (it puts the pass on the emailed paperwork). Stripe charges a fee per invoice: check its pricing page, and drop `invoice_creation` in `/api/checkout` to go without.
- **Two plans.** One party: £15, `STRIPE_PRICE_ID`, `mode=payment`, one game (as above). Unlimited: £20 a month, `STRIPE_SUB_PRICE_ID`, `mode=subscription`: the pending pass has `kind: "sub"` and rides on the subscription (`subscription_data.metadata.pass`, and its description shows the code). A subscription code opens a **new room whenever its owner likes, one at a time**: entering it again offers "Carry on" (the open room) or "Start a new game" (`POST /api/games {pass, fresh: true}`, which closes the open room through the GameState's internal `/_close`). It opens games only while the subscription is `active`/`trialing` (`customer.subscription.created/updated/deleted` → Registry `/substatus`); `past_due`, `unpaid` or `canceled` get 402 with a reason.
- **Manage subscription** (home page link) → `POST /api/portal {pass}` → a Stripe billing-portal session for that code's customer. In the Dashboard, **Settings → Billing → Customer portal**: save it (test and live separately), allow cancelling **at the end of the billing period** (the terms promise the code works until then) and updating the payment method.
- **Webhook events** to enable: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `invoice.payment_failed`, `charge.refunded`, `refund.created`, `refund.updated`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Checkouts are limited to ten an hour per address (each makes a pending pass). Admin `GET /api/admin/passes` shows `pending`, `paid`, `session`, `refunded`.
- VAT: the price is created tax-inclusive (`tax_behavior=inclusive`); Stripe Tax isn't switched on.

- `SITE_PASSWORD` is now `candlelight` (was changed from a show-derived word in 1.1).
- The master passcode: `npx wrangler secret put MASTER_PASS -c wrangler.toml` (and `-c wrangler.staging.toml`), or Workers & Pages → the Worker → Settings → Variables and Secrets. Unset, no master passcode works.
- `deploy.sh staging|production` → `build.sh` → `wrangler deploy --var BUILD:<build>`. Cloudflare account `52f36be1337501d7eb4752e3ca42fac7`. Workers: `cloak-and-candle` (thebetrayal.co.uk), `cloak-and-candle-staging` (staging.thebetrayal.co.uk). Both are **new** Workers with their own Durable Objects (migration tag `v1`: GameState, Registry); the Workers from the party build are untouched.
- **Previews:** Cloudflare builds every non-`main` branch (so every PR) with `npx wrangler preview`, which reads only the `[previews]` block of `wrangler.toml`: its own vars, and Durable Object bindings that give each preview fresh, empty namespaces, never production's passes or rooms. Previews have no secrets (no admin, no master passcode, checkout closed). Only `main` deploys production.
- Rollback: `npx wrangler rollback <version-id> -c <config>`.
- **Admin page: `/admin`.** Sign in as `ADMIN_USER` (`ryanab94.admin`, in `wrangler.toml`) with the `ADMIN_PASSWORD` secret; a signed, HttpOnly, SameSite=Strict session cookie lasts 12 hours, and changing the password signs every session out. Wrong passwords count with wrong pass codes (20 an hour per address). The page shows totals, every pass (search, filter, copy, cancel), creates one-party passes or free unlimited codes, and opens a test room. It's `noindex`. Previews have no password, so no admin there.
- Passes from a terminal: `tools/passes.sh mint|list|revoke` (needs `ADMIN_TOKEN`; `BASE=` for staging or local). The same API accepts the admin page's cookie.
- A customer who lost their link: they re-enter their pass on the home page and get the same room back.
- On the night (for customers): open the room on the laptop, click **Enable sound**, press F, cast. Open `…#host` on the phone and plan the game.

## 7. Content banks

`content.js` (1.3): QUIZ_E 420, QUIZ_M 520, QUIZ_H 595; ESTIMATE 264; LIKELY 264; CHARADES 342; SONGS 497; PICTIONARY 520; MEMSETS 30; CODEWORDS 60 (unused, kept for positions); QUESTS 165. The 1.3 additions avoid time-sensitive facts (office-holders, records, moving capitals) and tie populations to a census year. **Append-only** (the question-bank switches identify items by position). The Longest Word dictionary is `worker/public/words.txt`. Song titles in SONGS are titles only (no lyrics).

## 8. Testing

**Never run `qa/chaos.py` unless Ryan explicitly asks for a chaos test.** The standard checks are smoke166, plan, big, claim and e2e.

Never run `build.sh` while chaos or break is running (a new `build.txt` reloads the pages). Kill stray servers with `for pid in $(pgrep -f "^node qa/server.mjs 871[4-9]"); do kill $pid; done` — don't `pkill -f` a pattern your own command line contains.

| harness | what it does | status at 1.0 |
|---|---|---|
| `qa/plan.py` (:8721) | every game-plan choice honoured: pool, rounds, Trials a round, murder/poison wording, Ghosts off, prizes, Confessor, convert/bargain, Errands, dinner, TV rules card | **new**, clean |
| `qa/diag.py` (URL, under `wrangler dev` with `--var ADMIN_PASSWORD:testpw`) | **new in 1.3.1**: recording, device trails, errors from both screens, reports from the phone and the TV (snapshot, trail, email), the room kept, and every /admin tab including the replay | clean (25 checks) |
| `qa/wizard.py` (:8724) | **new in 1.3**: every setup page on a phone (no overflow, screenshots in `qa/shots/wizard/`), the checks that stop Next, recommendations following earlier choices, pages skipped, the quick path, Change/Done, the game it starts | clean |
| `qa/smoke166.py` (:8719) | 74 rules checks | clean |
| `qa/e2e.py` (URL; `ADMIN_TOKEN` for the real Worker) | passes, rooms, isolation, PIN gate, redaction, two-screen sync, Confessor, Ghosts, wipe | clean: 31 on `qa/server.mjs`, 38 on `wrangler dev` |
| `qa/admin.mjs` | the `/admin` sign-in and API, Durable Objects stubbed: credentials, cookie flags, tampered/expired cookies, password change, the attempt limit, the Bearer token, cross-site requests, creating/listing/cancelling passes and free unlimited codes, the test room | clean (19 checks) |
| `qa/claim.mjs` | Stripe with its API stubbed: checkout (consent, pending pass, session parameters, rate limit), claim, signed webhook (paid, async, expired, refunded before and after use), Payment Link fallback, the subscription (mode, activation, carry on / new game closing the old room, past_due / active / cancelled, the billing portal) | clean (41 checks, incl. subscriptions) |
| `qa/chaos.py` (:8715) | **only on request.** Random whole games through the Keeper UI with **random game plans**, invariants (plan honoured, no "poison" in a murder game, redaction), TV overflow replay | clean: 81 games / 71k taps, 500 screens at 720p and 1080p |
| `qa/big.py` (:8722) | **new in 1.1**: 7/25 names refused, 8/24 start, the rounds control (range, Auto, clamps), round plan, the second vote, a three-victim night (redaction per pass, the picker, Sanctuary), dawn, the five floor, the final voting silently down to four, parity playing on, and every screen of a 24-player game at 720p, 1080p and 4:3 | see §8 status |
| `qa/break.py part1` (:8718) | adversarial in-page scenarios + every TV screen at three sizes | **stale since 1.1**: its scenarios use 4–7 players and the pre-wizard setup form; needs rewriting for 8–24 players before it means anything |
| `qa/break.py part2` (:8717) | sync and hand attacks: two phones, lost replies, offline taps, wipes, rate limits, holds | clean, 42/42 (1.4.1) |
| `qa/flow.py` (:8726) | **new in 1.5**: dinner in courses, prize tiers (and what the TV may know), the Ghosts’ call, the awards cap, the TV narrator (speech stubbed; once, not replayed by undo), PURSE or SELF, the Casting Vote wording | clean |
| `qa/modern-engine.mjs` | **new in 1.6**: Modern's rules engine on its own: lobby, Oath, private views, every Trial to a result, courses, Temptation, whole games at 6/8/10/12/17/24 players won by either side | clean |
| `qa/modern.py` (URL, under `wrangler dev` with `--var MASTER_PASS:MASTERTEST`) | **new in 1.6**: eight phones and a TV: the Classic/Modern choice, joining, host settings, the Oath, roles, every Trial's phone screen, a whole quiz, the Reckoning, a night, dawn, a lost phone let back in, no sideways scroll at 320px | clean |
| `qa/site.py` (URL, under `wrangler dev`) | **new in 1.4.1**: every public page at 320/390/768/1440 without sideways scroll or console errors, the home page's order and code box, the rules page's single Sacrament paragraph, the nav, the buy page's consent and Pay button | clean |
| `qa/resilience.py` (:8714) | PIN persistence and lockout, colliding hosts, dropped connections, night masking | clean again in 1.4.1 (it had been left at 7 players) |
| `qa/media.py`, `qa/shots.py` | screenshots for the media pack / quick looks | used for 1.0 |
| `qa/review.py`, `resilience.py`, `audit.py`, `banks.py`, `audio.py`, `gallery.py`, `live.py` | older harnesses | not re-run for 1.0; `review.py` has been stale since v16.6 |

Expiry was checked by hand under `wrangler dev` with `PASS_HOURS=0.001, KEEP_DAYS=0.0001`: writes 423 after expiry, reads still work, a used-and-expired pass is refused, the room is deleted by its alarm.

## 9. Known issues and ideas

- Not deployed. **Stripe has never been called for real**: this build environment's network policy blocked api.stripe.com. Everything is tested against a stub (`qa/claim.mjs`). First real test: staging with test keys (§6.2).
- **Legal pages** (§6.1) were written to UK consumer and data-protection law; the business name, address and email go in once there is a business (see `media/copy/NEXT-STEPS.md`).
- **Big tables are longer.** Even with two exiles and up to three victims a round, 24 players need about 8 rounds (§5.10). Only simulated and scripted (qa/big.py), never played.
- A chaos run (before the §5.6 rework) had a 16-player game stuck at the Reckoning for 400 random taps — probably random ballots tying and revoting; not investigated.
- Ideas: a printable guest guide in the new brand; per-mission lengths in the plan; an admin page instead of `tools/passes.sh`; bundle passes (3 parties).

## 10. A prompt to start the next session

> You're picking up "The Betrayal", a commercial two-screen dinner-party game (TV at /g/ROOM, Keeper phone at /g/ROOM#host) on a Cloudflare Worker with a Durable Object per room and Invitations. Read HANDOVER.md, then README.md. The code is plain JS in src/ built by build.sh; secrets for the TV are stripped in worker/src/public-view.js. Build and run `python3 qa/smoke166.py` and `python3 qa/plan.py` for a clean baseline. Make surgical changes, keep content banks append-only, keep saved games loadable across deploys, and add any new secret field to public-view.js. Test locally (and under `wrangler dev` for Worker changes), deploy to staging and run qa/e2e.py against it, then production only when I say. Never write tokens into files. Here's what I'd like changed: …
