# The Betrayal: developer and operator handover

For whoever runs or changes the product next, most likely an LLM coding assistant working with Ryan. Read this, then `README.md`, then the code. Values of vars live in `wrangler.toml` and `wrangler.staging.toml`; secrets are only ever named here.

---

## 1. What it is

**The Betrayal** is a hosted party game of loyalty and lies for 8 to 24 players in one room. A few players are secretly **the Forsworn**; the rest are **the Loyal**. Each day the table plays **Trials** to fill **the Purse**, then meets at **the Reckoning** to exile someone. Each night the Forsworn poison someone. It runs on a Cloudflare Worker at **thebetrayal.co.uk**.

There are two ways to play, chosen once per Table on the home page after the booking code is entered (Modern is offered first, marked recommended):

- **Modern:** everyone plays on their own phone and the server runs the game. The first to join is **the host**, a player whose phone also moves the evening on. The TV is optional. Phones join at `/join` or `/m/ROOMCD`; the TV is `/t/ROOMCD`.
- **Classic:** phones away. **The Keeper** runs the game from one phone at `/t/ROOMCD#keeper` and reads the lines it gives them; the TV (a laptop cast to it) is `/t/ROOMCD`. Props: blindfolds, chalkboards, chalk.

It is sold as:

- **a Table:** £10, one party. The buyer gets a **booking code**, `OATH-XXXX-XXXX`. Entering it opens a Table (a room) that stays writable for 48 hours (`PASS_HOURS`).
- **a Regular:** £20 a month (a Stripe subscription). One code opens a new Table whenever its owner likes, one at a time, while the subscription is active.

Every Table is its own Durable Object, so any number of parties play at once.

---

## 2. Quick start

```sh
./build.sh
python3 qa/smoke166.py && python3 qa/plan.py && node qa/claim.mjs && node qa/admin.mjs && node qa/modern-engine.mjs
npm i
npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var MASTER_PASS:MASTERTEST --var SITE_PASSWORD: --var BUILD:$(cat worker/public/build.txt) &
ADMIN_TOKEN=dev python3 qa/e2e.py http://127.0.0.1:8790/
python3 qa/big.py
```

The Python harnesses need Playwright with Chromium; some tools also need Pillow. Section 8 lists every harness.

**Rules of the road:**

- **Never write the Cloudflare API token, `ADMIN_TOKEN`, `ADMIN_PASSWORD`, `MASTER_PASS`, `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` into any file, zip or commit.** The Cloudflare token goes in the environment at deploy time (`CLOUDFLARE_API_TOKEN`); the rest are Worker secrets (`wrangler secret put`).
- **Deploys must not break games in progress.** Customers may be mid-party. Never change a saved game's shape in a way a running game can't load: add fields with defaults and read them through helpers such as `rulesIn` (Classic). Classic's Keeper phone and TV refuse a saved game whose `v` differs from `SCHEMA` in `src/core.js` ("A game from an older version"), so bumping `SCHEMA` strands every Classic game in progress.
- **Run `./build.sh` before committing.** The built pages in `worker/public` and `worker/src/content.gen.js` are committed; the Git deploy does not run `build.sh`.
- Deploy to **staging** first, run `qa/e2e.py` against it, then production.
- **Stay original.** No names, logos, music, catchphrases, presenter names or set pieces from any TV programme, in code, copy, art or commit messages. All art is original inline SVG; the fonts are OFL. Public wording follows `media/copy/glossary.md`.
- Ryan's preferences: answer first; surgical changes; match file conventions; mark verified versus assumed; never report something done that wasn't run.

---

## 3. Files

```
HANDOVER.md, README.md
build.sh              src/ → index.html (standalone game) and worker/public/play.html (Classic);
                      src/modern-ui.js, modern.css, qr.js, art.js, audio.js → worker/public/modern.html (Modern);
                      site/index.html → worker/public/index.html; site/pages/NAME.html in site/page.html → worker/public/NAME.html;
                      src/content.js → worker/src/content.gen.js; media/web/* → worker/public/media/; worker/public/build.txt
deploy.sh             build, then wrangler deploy: ./deploy.sh staging | production
wrangler.toml         production Worker (also read by Cloudflare's Git integration and by `wrangler preview`)
wrangler.staging.toml staging Worker
package.json          wrangler as a dev dependency
src/                  the game pages (no framework, no bundler)
  content.js          Trial definitions (MISSIONS, MSET) and the content banks (append-only, §7)
  scripts.js          every Keeper line, the night and ceremony scripts
  core.js             Classic: store and sync, the game plan (RULES0), every rule, awards
  host.js             Classic Keeper phone: the setup wizard (WIZ, RECS), then every phase
  tv.js               Classic TV renderer
  art.js, audio.js    inline SVG drawings; synthesised sound and score (both pages)
  diag.js             device trail, "Report a problem", the admin replay hooks
  boot.js             start-up, build auto-reload, wake lock
  modern-ui.js        Modern's page: every phone, the host and the TV
  qr.js               the join QR code encoder
  style.css, modern.css, fonts.css
site/index.html       the home page (sell, redeem a code, choose Modern or Classic, join, claim after checkout); SHOP price text near the bottom
site/page.html        the shell for every other page; each site/pages/NAME.html starts with <!-- title: … --> and <!-- desc: … -->
site/pages/           404, admin, buy, contact, cookies, privacy, refunds, rules, seal, terms, tour, and the guides traitors-at-home and
                      party-games-for-large-groups; NAME.jsonld beside a page adds JSON-LD to its head (§6.9)
worker/src/
  index.js            router, GameState (one per room), Registry (booking codes, logs, reports), Stripe, admin, alert email
  codes.js            room and booking-code formats
  rules.js            Classic save rules and poll tag (shared with qa/server.mjs)
  public-view.js      what Classic's TV may see (shared with the page)
  modern.js           Modern's rules engine
  content.gen.js      generated by build.sh; commit it
worker/public/        build output, fonts/, icons, words.txt (Longest Word dictionary), _headers, robots.txt, sitemap.xml, media/
media/                logos/, palette/, screenshots/ (Classic), web/ (site images), social/, copy/, launch/, brand guidelines PDF
tools/                see §6.8; tools/ads/ is the daily Google Ads sweep (§6.10)
qa/                   test harnesses (§8)
```

---

## 4. Architecture

### 4.1 Routing and domains (`worker/src/index.js`)

- **One address.** `SITE_HOST` (thebetrayal.co.uk) is canonical. `www.` and every host in `OLD_HOSTS` (cloakandcandle.co.uk and its `www.`, attached as custom domains) get a 301 to `SITE_HOST` for every page, with `/g/` paths sent to `/t/`. `/api/*` answers on every attached domain without redirecting, so a webhook or open Table pointed at an old host keeps working.
- **Password gate.** With `SITE_PASSWORD` set, every page, asset and API call needs the `cc_gate` cookie (30 days) from a small password page. `/api/admin/*` (own auth) and `/api/stripe/webhook` (signed) are exempt. Production has no `SITE_PASSWORD`; staging and previews set one.
- **Pages:** `/` and `/claim` → `index.html`; `/terms`, `/privacy`, `/cookies`, `/refunds`, `/contact`, `/buy`, `/admin`, `/rules`, `/tour`, `/seal`, `/traitors-at-home`, `/party-games-for-large-groups` → `NAME.html` (`/NAME.html` and `/index.html` 301 to the clean address) (`/admin` and `/seal` are sent `noindex`; `/admin` also `X-Frame-Options: DENY`). `/join` → `modern.html`.
- **A Table:** `/t/CODE`, `/g/CODE` and `/m/CODE` (six characters; lower case is redirected to upper). `/m/` always serves `modern.html`; `/t/` and `/g/` ask the room which mode it is in (`/_mode`) and serve `modern.html` for a Modern room, otherwise `play.html`.
- **Unknown pages** get `404.html` with status 404; unknown `/api/*` gets JSON 404.
- **Static files** (`[assets]`, `run_worker_first = true`) pass through the Worker, so the gate covers them. Cache policy is in `worker/public/_headers` (fonts and `words.txt` immutable, `/media/*` a week, HTML and `build.txt` no-cache).
- **API:**
  - `GET|PUT|DELETE /api/g/CODE/state`, `GET|PUT /api/g/CODE/settings` (Classic), `POST /api/g/CODE/events` (device trail), `GET /api/g/CODE/m`, `POST /api/g/CODE/m/create|m/join|m/act` (Modern)
  - `POST /api/games {pass, fresh?}` redeem a booking code (or the master passcode)
  - `POST /api/checkout {terms, supply, plan?, egg?, discount?}`, `GET /api/claim?session_id=`, `POST /api/stripe/webhook`, `POST /api/portal {pass}`, `GET /api/egg`
  - `POST /api/report` (problem reports and contact messages)
  - `/api/admin/*` (§6.6)

### 4.2 Booking codes and rooms (Registry)

- One Durable Object for the whole service (`idFromName("registry")`). Keys: `pass:CNDL-XXXX-XXXX` → `{created, note, source, kind?, room?, expires?, redeemed?, revoked?, pending?, paid?, failed?, refunded?, session?, pi?, subId?, customer?, subActive?, subStatus?, games?}`; `room:CODE`; `claim:<checkout session>` and `pi:<payment intent>` → pass; `co:<ip>` checkout rate; `err:` master log; `hook:` webhook log; `rep:` / `repx:` reports.
- **Code formats** (`codes.js`): the alphabet avoids 0/O and 1/I/L. Rooms are 6 characters. Booking codes are 8 characters, **stored under a `CNDL-` key and shown as `OATH-`** (`shownPass`). `normPass` strips either prefix or none, so `CNDL-…`, `OATH-…` and the bare 8 characters all find the same record.
- **Redeeming** a one-party code creates a room good for `PASS_HOURS`; redeeming it again returns the same room until it expires (a host who lost the link), then 410. Pending (unpaid) codes get 402, cancelled ones 410. A Regular's code returns the open room ("Carry on") or, with `fresh: true`, closes it (GameState `/_close`) and opens a new one; it works only while `subActive` (Stripe status `active` or `trialing`), otherwise 402.
- **Limits:** 20 failed redemptions an hour per address, then 429 (admin sign-in failures and billing-portal lookups count too). Checkouts: 10 an hour per address.
- **Master passcode** (`MASTER_PASS` secret): entered in the home page's code box (any case, trimmed) it opens a fresh room every time, recorded as `pass: "MASTER"`, and the home page offers a third card, *Modern test*. Unset, it does nothing.
- `OPEN_ACCESS=1` lets `POST /api/games` with no pass make a room. Development only.

### 4.3 GameState (one per room)

- `idFromName("room:CODE")`. `meta {room, expires, pass, created, keepUntil?, reports?}` is set by the Registry; a room without it is 404.
- After `expires` the room is read-only: writes get **423**. An alarm deletes the whole room `KEEP_DAYS` later (or at `keepUntil`, if a problem report asked to keep it).
- Keys: `state` (Classic game), `modern` (Modern game), `settings` (question-bank switches), `wiped`, `recN`/`recl:`/`recs:` (recording), `evN`/`ev:` (device trail). A room holds one mode: Classic writes are refused once a Modern game exists and vice versa.
- **Classic writes** need the Keeper PIN (`X-Pin`; the first PUT sets it). Reads without it get `publicView`. Wrong PINs: more than 8 a minute from one address (IPv6 per /64), or 30 a minute in total, get 429.
- **Save rules** (`rules.js`, `writeVerdict`): 410 for a wiped game coming back; 409 (with the stored game) for a different game or a save not built on the stored version; the PIN can't change mid-game. Bodies over 900 KB get 413.
- **Build check:** when the `BUILD` var is set (`deploy.sh` sets it), a write from a page on another build gets 426 and the page reloads. Every page also polls `/build.txt` and reloads onto a new build. A Git-integration deploy does not set `BUILD`, so only the poll applies there.

### 4.4 Classic page

- `build.sh` concatenates `fonts.css`, `style.css`, `content.js`, `scripts.js`, `public-view.js`, `core.js`, `audio.js`, `art.js`, `tv.js`, `host.js`, `diag.js`, `boot.js` into `index.html` (which also runs standalone on `localStorage`) and wraps it as `play.html`.
- `isHost` is true for `#keeper` or `#host` (the same page). `ROOM` comes from the path; `API` is `/api/g/ROOM` (or `/api` with no room: the local test server's default room).
- **State:** one JSON `state`, `SCHEMA = 12`. Every change goes through `act(fn, logline)` (clone, run, stamp, log, save; stale taps dropped). Undo: 30 local snapshots plus a short `prev` chain; `rewindRound` restores `roundSnap`.
- **Sync:** both screens poll `GET …/state` about once a second (`X-Have` tag → `{same:true}`). The phone queues saves and rebases after lost replies. `flushSaves` handles 426 (reload), 403 (wrong PIN), 410 (wiped elsewhere), 409 (another phone moved), 423 (Table closed, read-only).
- **What the TV may see:** `worker/src/public-view.js` is the single source of truth: it strips roles, the PIN, the log, the undo chain, the Confessor, secret Casting Vote and Crown holders, Trial secrets, quiz answers, the night's victim until its line, Errands, unrevealed votes, and the prize and stats until the final phase. **Add any new secret field there.** `rules`, `plan` and `planAt` are not secret.
- **TV:** `tvView(s)` → `{key, html, scene, sfx…}`; title cards on phase changes; tuned for 16:9 and 16:10, with 4:3 checked. Before a game the TV shows the room code and the Keeper link. F toggles full screen.

### 4.5 Modern

- **Engine:** `worker/src/modern.js` is pure: `newGame`, `join`, `act`, `tick`, `viewFor`. Stored under `modern` in the room's GameState. Every request calls `tick` first, so clocks move on without a background process. A rules exception during `tick` is logged and the room keeps answering.
- **API:** `GET /api/g/CODE/m` returns what this phone may see (`X-Tok` identifies the phone; `?v=&me=` returns `{same:true}` when nothing changed). `m/create` makes the game and joins its creator as host: the booker proves the booking code; master and open rooms need none. `m/join` joins by name in the lobby; after the start, a lost phone asks by name and the host lets it back in (refused while the original phone polled in the last 20 seconds). `m/act` takes every input. Bodies are capped at 64 KB; tokens come from `crypto`.
- **Page:** `worker/public/modern.html` (built from `src/modern-ui.js`, `src/modern.css`, `qr.js`, `art.js`, `audio.js`). The TV shows a QR code for the join link, a narrator (the browser's voice reads each new screen) and the Classic music and sounds. Phones keep awake (Wake Lock) and vibrate when something needs that player, and again 10 seconds before a clock closes while they still owe an answer (Android only; iPhones don't support it).
- **Content** reaches the Worker as `worker/src/content.gen.js`, generated by `build.sh`. The Longest Word dictionary (`words.txt`) is loaded once per room instance into a `Set`.
- **Master-code rooms** may fix the Trial order at `m/create` (`plan`, used by `qa/modern.py`) and create a **test game against bots** (`test: true`, `/m/CODE#create-bots`): bots fill the table (`addBots`) and swear, look at their role, vote (Forsworn bots vote for the Loyal), choose at night, answer the Temptation, and trust and honour (`botsMove`); Trials skip to random scores; every countdown is at most 10 seconds (`T()`).

### 4.6 Diagnostics

- **Recording** (`GameState.record`): every accepted Classic save stores `recl:<n>` (time, kind start/save/wipe, the newest log line, phase, round, version) and `recs:<n>` (the whole state, gzipped). Modern is recorded on every new screen and at most every 15 seconds otherwise, with the TV's and host's views. Up to `RECMAX` (20,000) a room; deleted with the room.
- **Device trail** (`src/diag.js`): taps (button labels only), screen changes, visibility, network, sync failures (`crumb()`), errors and unhandled rejections. Sent every 15 s (errors at once, and on pagehide) to `POST /api/g/CODE/events`, stored as `ev:<n>` batches (up to `EVMAX` = 2,000, each at most 32 KB). Errors are copied to the master log.
- **Reports** (10 an hour per address): `POST /api/report {room, what, expected, email, snap, crumbs…}`, where `snap` is the page without scripts, gzipped and base64. The Registry keeps `rep:<R-XXXXXX>` and the snapshot in 100 KB chunks (`repx:`). The room is kept 90 days for its replay. The contact form posts here too. Every report is emailed (§6.4).
- **Master log** (Registry `err:`, newest 3,000): `src` = `browser`, `server` (every Worker and GameState exception is caught, logged, then 500), `stripe` (bad signatures, unmatched refunds, refused checkouts or discounts), `report`, `mail` (failed alert emails). **Webhook log** `hook:` (newest 1,000): every verified Stripe event and what it did.
- **Replay:** `/play.html#replay-tv` and `#replay-host` (and the same hashes on `modern.html`) start nothing and expose `replayShow(state)`. `/admin` loads both in iframes and feeds them recorded states. Its list, **What happened**, is the game's log rather than every save: for Modern, the whole log of each game played in the room (from its last save), with arrivals as one line, and every decision named (who voted for whom and who didn't, the Forsworn's night picks, who chose SELF in the Temptation, trust or doubt, honour or betray, who was dealt Forsworn); for Classic, each save that added a log line. Tapping a line, ◀ ▶ and Play move between those lines; the slider and the **Every save** box still reach every save. The devices' trail is folded under its heading, with a count of reports and errors. The Modern log is only ever read by `/admin`: `viewFor` never sends it to a phone or the TV.
- **Workers Logs** (`[observability]` in `wrangler.toml`): console output and uncaught exceptions, under Workers → cloak-and-candle → Logs.

### 4.7 Internal names

The code keeps its own identifiers; players only see the public words. Saved games use these keys, so don't rename them.

| in the code | public word |
|---|---|
| role `"cloak"` / `"candle"` (Classic), `"f"` / `"l"` (Modern); `cloaks()`, `candles()`; winner `"cloaks"` / `"candles"` | the Forsworn / the Loyal |
| `isHost`, `#host`, "host" in Classic code | the Keeper (Classic) |
| `director` (Modern) | the host |
| pass, `pass:` | booking code |
| room | Table |
| `mission`, `MISSIONS`, phase `"mission"` | Trial |
| `countdown` (Trial key) | Longest Word |
| `shield` | Sanctuary |
| `blade`, `dag` (Classic), `cast` (Modern) | the Casting Vote |
| `champion`, `championOf` (Classic), `crown` (Modern) | the Crown |
| `witness`, `WITNESSNOW_` (Classic), `confess` (Modern) | the Confessor |
| `dilemma` (Classic), `tempt` (Modern) | the Temptation |
| `convert` / `bargain` | the Whisper / the Last Offer |
| `quests`, `QUESTS` | Errands |
| `mingle` | the Interval (or a dinner break) |
| `pot` | the Purse |
| `table` | the Reckoning |
| `morning` | dawn |
| phase `endvote`, votes `"end"` / `"exile"` | Trust or Doubt (TRUST / DOUBT) |
| phase `final2`, `castTake`, votes `"share"` / `"take"` | Honour or Betray |
| Worker `cloak-and-candle`, `cloak-and-candle-staging` | production and staging Workers |
| `candle-pin`, `candle-played`, `candle-draft`, `candle-settings` (browser storage); `cc_admin`, `cc_gate` (cookies) | storage keys and cookies |

The Worker names, the `CNDL-` storage prefix, the cookie names and the gate's hash prefix (`cloak-and-candle-gate:`) are bound to live data: renaming a Worker creates a new one with empty Durable Objects (every booking code and room lost), and renaming a cookie signs everyone out.

---

## 5. The game

### 5.1 Common to both

- **8 to 24 players** (`MINP`, `MAXP`). Forsworn: 2 (8 to 10), 3 (11 to 15), 4 (16 to 22), 5 (23 to 24).
- **Exiles:** two a Reckoning while more than 16 are at the table (`exilesAt`). **Night victims:** 2 from 12 alive, 3 from 20 (`killsAt`), never taking the table below five.
- **The final** begins when five or fewer remain, or no Forsworn is left.
- **The Purse** is capped at its target (2000 by default). The winners take the Purse the Loyal built; if the Forsworn win, they take what it **fell short** of its target (`wonPot` in `core.js`, `won` in `modern.js`), so sabotage pays. **Prize tiers** (a better prize at a half-full and a full Purse) follow the same amount. The default prize is **chocolate coins** (`PRIZE0` in both `core.js` and `modern.js`): every 100 points the winners take is one coin (`coinsOf`, floor(won / 100)), so the end screens say "15 chocolate coins" for a Purse of 1,500, and for the Forsworn the shortfall converted the same way. The Modern lobby and the Classic prize page explain the rate; a prize the host types gets no coins and behaves as before. In Classic, chocolate coins are shared out like the Purse: no rock, paper, scissors for them (`s.rps` stays null).
- **Poison is the only kill.** Murder was removed from both modes. Saved games with `kill: "murder"` (Modern `s.opts.kill`, Classic `rules.kill`) still load and play as poison, because nothing reads the field any more. Internally the kill night keeps its old key `"murder"` (`s.night.mode`, `s.morning.kind`, `s.stats.murders`, `MODES.murder`, labelled Poison) so games in progress load; never show that key to players.
- **Ghosts:** the exiled and the dead. They stay in the game.

### 5.2 Modern

- **Lobby:** the host sets Sanctuary (secret or public), the prize and up to two prize tiers, the title, **twists** (on by default) and **dinner in courses** (off by default; the lobby asks "Eating as you play?"). Start needs 8 players.
- **The Oath:** each player says whether they'd like to be Forsworn (yes, no, either way); roles are dealt to volunteers first, then "either way", then whoever must. Then each player sees their role.
- **The evening plans itself** (`planDay`): each day is a list of steps and the host's phone has one button, **Begin: <next step>**, plus a short break (the 10-minute Interval), "+5 minutes" / "end the break", and "continue" after each result, reveal and dawn. The host can't choose Trials, call the Temptation or open the Reckoning early.
  - Round one opens with **Most Likely To** (no prize).
  - **Courses** (if on): the Starter (15 min) before round two's Trial, the Main Course (25 min) mid-game, Dessert (15 min) in the final.
  - **Twists** (if on, once a game each): the **Casting Vote** about halfway (that Trial's winner gets it instead of Sanctuary, privately), followed the same day by **the Temptation**; the **Crown** on the last round before the final (it carries Sanctuary that night); the **Confessor** in the final Trial when five remain (its winner is privately told one Forsworn's name).
- **Trials on phones:** Rapid Quiz, Closest Guess, Higher or Lower, Most Likely To, Longest Word, Memory Wall, What Changed?, Snap, Rock Paper Scissors Royale, One Leg, The Statue (only once there are Ghosts), Screen Charades, Hum It, Pictionary, Two Truths and a Lie. Each has a 12-second introduction. The order is shuffled at the start and doesn't repeat until used up.
- **Sanctuary:** a Trial's top scorer (a tie settled by lot) is safe that night. At most a quarter of the living (at least one) hold it at once, and none is given in the final. With secret Sanctuary, a Forsworn winner gets nothing.
- **The Purse:** each Trial offers a share of what's left; the table's success fills it, and each wrong answer from a Forsworn takes 50 back (up to half the offer). Everything moves in 50s.
- **The Temptation:** everyone answers PURSE or SELF in secret. Exactly one SELF takes Sanctuary and the Purse grows; nobody: the Purse grows double; two or more: nobody gets it and the Purse shrinks.
- **The Reckoning:** talk (4 minutes by default), then a 2-minute vote. Ghosts vote too, as "calls" that don't count but are named. A tie goes to a 90-second revote between the tied; the **Casting Vote** settles a tie its holder voted in (the table sees it was used, never by whom); a second tie, or no votes, is settled by lot. The exile's role is shown five seconds later (not in the final). The **Crown** holder may lay it down once, during the talk or the vote, to be safe from that exile. Above 16 players a second Reckoning follows the first.
- **Last words:** an exiled player (not in the final) gets one optional typed line of up to 140 characters; the TV shows it and the narrator reads it. The poisoned get 30 seconds of spoken last words each at dawn.
- **Night** (2 minutes): the Forsworn choose on their phones; the Loyal tap to sleep. With two or more Forsworn alive they can send set phrases (`WHISPERS`, up to 8 each a night), seen only by the Forsworn. If they choose nobody, the house chooses. Sanctuary saves its holder.
- **Dawn:** names the victims; if one topped a Most Likely To prompt, the TV says so.
- **The final:** one Trial, then Reckonings with no role reveal until four or fewer remain; then **Trust or Doubt**: only a unanimous TRUST ends the game, otherwise another Reckoning. At two left the game ends. **The Unmasking** shows every survivor's role. With two or more Forsworn among the survivors comes **Honour or Betray**: all honour, they share; exactly one betrays, they take it all; two or more betray, nobody wins it.
- **The end:** winner, prize, Purse, a who-was-who roster, and up to six awards.
- **Pause:** the host's top bar has Pause. Every clock stops (`tick` does nothing; every action but the host's tools is refused). Carry on moves each deadline and each answer's time on by the length of the pause (`shiftClocks`). A tool used while paused acts from the moment of the pause.
- **Host tools** (the Tools button), for when something goes wrong: start the Trial now, close a question, end a Trial, skip a step, open or close the vote, end the night, deal or begin for stragglers, take someone out (illness: their phone says they've left; a Casting Vote or Crown they held is spent; if no Forsworn is left, the final begins), hand the host role to someone else, music on this phone. None shows a role except the last resort, **Show me the roles**: two confirmations, then typing SHOW THE ROLES. The server returns the roles only in that one reply, and the end screen, the TV and `/admin` all say the host looked.

### 5.3 Classic: the game plan (setup)

A wizard on the Keeper phone (`WIZ` in `host.js`).

- **Five core pages** (`core: true`): who's playing, how long, the prize, who keeps, and the Keeper PIN (4 to 8 digits), then **Ready**: a summary with every other choice made. Each line has **Change** (back with **Done**); **Go through every choice** walks the Customise pages and returns.
- **Who keeps:** the host, or "a friend will keep, and I'll play" (the host must be among the players, the Keeper must not). Ready's button becomes **Hand over to …**, where the Keeper can change the PIN and presses **Start game**.
- **Recommendations** (`RECS`) follow earlier choices (rounds from table size and hours via `estMins`, an Interval from 3 hours, one Trial a round at 2.5 hours or less). The **Short game** (about 2 hours for 8 or 9, 2½ for 10) is one Trial a round, no Interval, no dinner. Dinner is never recommended. **A first game is kept plain:** every twist off and Sanctuary public until `localStorage['candle-played']` is set, which happens when a game reaches its final screen on that phone. Until the Keeper picks something (`d.touched`), `settle()` keeps each choice on its recommendation. Pages that don't apply are skipped.
- The draft lives in `sessionStorage` (`candle-draft`); tests set `setupDraft` and call `submitSetup()`. The result is `state.rules` (`RULES0` in `core.js` has the defaults; `cleanRules` validates):

| rule | values | effect |
|---|---|---|
| `rounds` | 0 = by table size, or 1 to 10 | round N is the final (`nextRound`); clamped to `roundsRange` |
| `perRound` | 0 = by the clock, 1, 2 | Trials a round (`perRoundOf`) |
| `dinnerAfter` | 0 to 10 | the morning after that round offers dinner as the main button |
| `courses` | on/off | dinner in three courses: starter after round one, main mid-game, dessert before the final (`courseDue`, `COURSES`) |
| `mingle` | on/off | a 10-minute Interval before each Reckoning |
| `pool` | Trial keys or null (all) | `planMissions` deals them: the icebreaker first, Ghost games after Trial two, no repeats until used up; `state.plan`/`planAt` hold the order; `nextPlanned` skips the Statue until there are Ghosts |
| `ghosts` | on/off | off: `ghostsOf` returns nobody (no lore, verdicts, Ghost round or Statue) |
| `convert`, `bargain` | on/off | `autoMode` picks the night: one Whisper, then one Last Offer, only for a lone Forsworn against 4 or more Loyal |
| `quests` | on/off | one Errand pre-chosen each night |
| `shield` | mix / public / secret / off | `autoPrize`; mix = hidden in round-by-round Trials, public elsewhere |
| `blade`, `champion`, `witness`, `dilemma` | on/off | the Casting Vote, Crown, Confessor, Temptation (§5.5) |
| `narrator` | on/off | the TV reads the Keeper's lines aloud (`narrTV`; once, never replayed by an undo or reload) |

Setup also takes the Purse target and whether a Loyal wrong shout costs anything (`wrongRule`). The Menu has **Your game plan** (the summary and the next six Trials).

### 5.4 Classic: flow

1. **The game plan** (§5.3).
2. **Lobby** → **intro** (the rules card on the TV) → **night 0** (the Forsworn are chosen and see each other).
3. **Each round:**
   - Day: the plan's next Trial, one tap (the Keeper may swap it). One or two a round.
   - Trial: brief → prize step → play → done.
   - Sanctuary step: ceremony or card.
   - Interval before the Reckoning if the plan has it (always when an Errand is in play); dinner at the morning the plan names.
   - Reckoning: talk → boards → exile.
   - Reveal: the role is shown unless it's the final; the new Ghost gives their verdict.
   - Night: a kill, or a Whisper / Last Offer when one Forsworn faces four or more (if on), plus an Errand.
   - Morning: dawn (the victim stands, announces it and has 30 seconds of last words).
4. **The end game** (§5.7).
5. **The final ceremony:** seals turned one by one (hold for a drumroll). With two or more Forsworn left, Honour or Betray; then possibly the Ghosts' round.
6. **Final screen:** winner, prize, Purse split and the full roll (converted or bargaining Forsworn marked). Then the **awards**, one at a time.

### 5.5 Classic: Trials and prizes

**Trials** (`content.js` → `MISSIONS`): Most Likely To; Rapid Quiz; Longest Word (key `countdown`); Closest Guess; Memory Wall; Snap; Rock Paper Scissors Royale; One Leg; Screen Charades; Hum It; The Statue; Two Truths and a Lie; Chalkboard Pictionary; Higher or Lower; What Changed?; The Temptation; Custom Trial.

- Per-Trial options (`MSET`) have defaults; the Keeper can change them on the brief, and they're remembered in `prefs`. Prizes are set by the plan (`autoPrize`) and shown pre-selected.
- The TV shows the brief first. The Keeper confirms the prizes; the TV shows a prize card with one line per prize and the points on offer; **Start Trial** begins play. Most Likely To and the Temptation skip the prize step.
- **Quiz:** tapping who shouted shows "X, locked in"; the answer appears only after Correct or Wrong.
- **What Changed?:** runs itself; the Keeper phone must be awake for the hide.
- **Charades, Hum It, Pictionary:** "Blindfolds on, everyone but X" → "Blindfolds are on, show X". Hum It then splits "Blindfolds off" and "Start 30 s"; while the clock runs the music is silent.
- **Ties** are broken only when something rides on the winner.

**Sanctuary** (safe from the kill that night): none, the overall winner (public), or 1 to 2 **hidden** questions or rounds in round-by-round Trials (quiz, Longest Word, Closest Guess, Higher or Lower, What Changed?).

- A hidden Sanctuary goes to whoever wins *that* question or round, not the Trial. The rounds are drawn at random (never the first when there's a choice) and only the Keeper sees them.
- At most a quarter of the table (at least one) holds Sanctuary at once. None in the final.
- A Forsworn who wins a hidden Sanctuary on its own gets nothing and no ceremony; one who wins a hidden Casting Vote or the hidden Crown keeps it.

**The Casting Vote** breaks a tie. Every board counts once; at "All boards in", if the top is level and the holder chalked one of the tied, that one gets +1 (`tally`) and the TV says "the Casting Vote fell on Y"; otherwise it does nothing and the tie goes to a revote. The holder is never named. If it decided the exile (`bladeKill`), the reveal plays a Casting Vote stab with a drop of blood. Options: none, the overall winner, a hidden round of its own, or **with Sanctuary**, which makes **the Crown** (public or hidden). Each is given once a game, from the round `onceRound` picks; an unclaimed one comes round again on the next Trial. On the Casting Vote's round a Trial without rounds offers it instead of Sanctuary. The Keeper can put either on a Trial sooner from "Change the prizes" on the brief. **Only the Crown** may be laid down before the first board, to be immune from that exile (and unprotected that night).

**The Confessor** is offered only with exactly 5 alive and 1 Forsworn (the final round, before its Reckoning); the TV calls it "a special prize". The winner meets the Forsworn in a ceremony straight after the Trial; nothing said aloud names it. The Confessor can't be poisoned. If the Forsworn wins it, the Keeper taps them and then walks the table tapping nobody: the room hears identical lines and nothing happens.

**The Temptation** is PURSE or SELF, offered once a game when nobody holds Sanctuary (`dilemmaFree`); its stake is the current offer (at least 100).

**Secret winners** are tapped in a ceremony; each prize has its own tap line and the phone says who to tap on which line.

### 5.6 Classic: Purse, Reckoning, Ghosts

- **The Purse:** the TV never shows the target. Each Trial offers what's left over the Trials likely still to come (`offerOf`, `missionsLeft`); the final round offers the rest. Everything moves in 50s.
- **Wrong shouts** (quiz Wrong, Snap −, What Changed? wrong shout) cost 50 for a Forsworn's, nothing for a Loyal player's; with "everyone's", a Loyal player's costs 50 and a Forsworn's 100. The room sees only the total; the Keeper sees whose. A failed Errand costs 50.
- **Reckoning:** a talk timer (the Keeper is reminded of the Crown's option; a secret Crown without being named). The tally is hidden on the TV by default; the phone nudges in words (level, one in it, decided), never digits. Ties: revote between the tied, or the Keeper picks. The exile reveal is one tap after the exiled player has said their role.
- **Ghosts:** each gives one secret verdict (name a Forsworn) straight after their exile, after the ghost lore the first time; it counts at the end. At each Reckoning the Ghosts chalk who goes; the Keeper taps who called it (`s.calls`) and the TV names them.

### 5.7 Classic: the end game

- **Rounds** are the Keeper's choice within `roundsRange`: from the fewest (every round at full stretch, `capacityAt`) to the most (one exile and one victim a round). Setup shows the range for the names entered; `startGame` clamps anything outside it; Auto is the fewest. `roundsFrom` gives the fewest: 8 → 3 rounds, 12 → 5, 16 → 6, 20 → 7, 24 → 8 (final included).
- **Each round is sized as it starts** (`roundTarget`, kept in `state.rt`): what's left to lose before five, spread over the rounds left.
- **Two exiles** above 16: after the first reveal the Keeper's button is **The second vote**, a fresh table (`table.second`) where nobody holds the Casting Vote or can lay down the Crown; its talk timer is 3 minutes.
- **Several night victims:** each is a pass of the night script (`night.pass`, `night.kills`, `night.victims`, redacted on the TV); each later pass wakes the Forsworn again ("The night isn't over"), with **Next victim** between. Dawn names every victim (`morning.victimIds`).
- **No early endings mid-game.** Forsworn at parity keep playing; with no Forsworn left the Keeper is sent to the final round. The Menu's "End game now" is the only override.
- The round that starts with **5 or fewer alive is the final**. **Five never becomes four by poison:** an exile that leaves 5 goes straight into the final with no night.
- If the final opens with more than five (Sanctuary held on the last night), `fiveMission()` plays one more Trial before the last vote so the Confessor can be won. The final never deals Most Likely To.
- **The final Reckoning** takes the table to four with no role reveal ("Another vote, N more to go" if more than five). Then **Trust or Doubt**, every remaining player voting in secret on the phone: only a unanimous TRUST ends the game; otherwise another table (no reveal), 4 → 3 and vote again; 3 → 2 goes to the ceremony.
- **The ceremony:** the Keeper turns each survivor's seal. With two or more Forsworn left, **Honour or Betray** (phone handed round): all honour, they split the Purse and play rock, paper, scissors for the prize (unless it is chocolate coins, which are shared); one betrays, they take both; two or more betray, it goes to the Ghosts who named a Forsworn (their own round if several), otherwise the Keeper keeps it.

### 5.8 Classic: awards, scripts

- **Awards** (`awardsOf` in `core.js`), 21 candidates by weight: The Sharpest Eye, The Grand Deceiver, The Deciding Vote, The Turncoat, Couldn't Be Bought, The Ghost Who Saw, The Confessor, The Backstabber, The Narrow Escape, First Blood, The Martyr, Trial Machine, The Kingmaker, The Lightning Rod, The Wild Card, Barking Up the Wrong Tree, Sanctuary Seeker, The Hoarder, The Lone Wolf, The Untouchable, Last Oath Standing. One per person. Trimmed to 2, 4 or 6; revealed lightest first from sealed cards; the Keeper can **Show the rest** after the first. The Ghost Who Saw weighs a correct verdict 2 and each Ghosts' call 1.
- **Scripts:** every Keeper line is in `scripts.js` (`SAY`, `nightScript`, `CEREMONY_`, `WITNESSNOW_`); `vr(list, round)` rotates phrasings by round. Spoiler rules: nothing aloud names who holds a secret prize; the Confessor is "a special prize"; title cards are generic; a protected victim is never tapped. Blindfold lines include Ghosts when there are any.
- **Big tables** on the TV: above 16 the final roll goes six across without seals and the Ghost-rules screen hides the rail; the rules card mentions two exiles and several victims when they apply.

---

## 6. Operations

### 6.1 Environments, deploy, rollback

| | production | staging | previews |
|---|---|---|---|
| config | `wrangler.toml` | `wrangler.staging.toml` | `[previews]` block of `wrangler.toml` |
| Worker | `cloak-and-candle` | `cloak-and-candle-staging` | per branch |
| address | thebetrayal.co.uk, www., cloakandcandle.co.uk, www. | staging.thebetrayal.co.uk | Cloudflare preview URL |
| deploy | push to `main` (Git integration runs `npx wrangler deploy` at the repo root), or `./deploy.sh production` | `./deploy.sh staging` | every non-`main` branch (`npx wrangler preview`) |
| password gate | off | on (`SITE_PASSWORD`) | on |
| Durable Objects | own | own | fresh and empty per preview |

- Cloudflare account ID is in both `.toml` files. Both Workers use migration tag `v1` (`GameState`, `Registry`, SQLite).
- `./deploy.sh staging|production` needs `CLOUDFLARE_API_TOKEN` in the environment; it runs `build.sh`, installs `node_modules` if missing, then `wrangler deploy -c <config> --var BUILD:<build>`.
- **Order:** `./deploy.sh staging`, then `ADMIN_TOKEN=… python3 qa/e2e.py https://staging.thebetrayal.co.uk/` (add `SITE_PASSWORD=…` for the gate), then production.
- **Rollback:** `npx wrangler rollback <version-id> -c <config>`.
- **Deploys don't wipe games.** Rooms live in Durable Objects; open pages reload onto the new build (§4.3). Keep saved games loadable (§2).
- **Staging differs from production:** no `STRIPE_SUB_PRICE_ID` (the Regular isn't on sale), no `ADMIN_USER` (so `/admin` sign-in is off; the Bearer token works), no `SITE_HOST`/`OLD_HOSTS`, no `ALERT_TO` or `MAIL` binding, no `[observability]`.
- **Previews** get only what the `[previews]` block spells out: their own vars (`KEEP_DAYS` 1, the gate, empty Stripe prices, so checkout is closed) and fresh Durable Object namespaces. No secrets, so no admin and no master passcode, and no alert email.

### 6.2 Stripe

- **Two plans.** A Table: £10, `STRIPE_PRICE_ID`, `mode=payment`. A Regular: £20 a month, `STRIPE_SUB_PRICE_ID`, `mode=subscription`. An empty price ID means that plan isn't on sale (`/api/checkout` returns 503).
- **Flow:** `/buy` → `POST /api/checkout {terms: true, supply: true, plan, egg}` → the Registry mints a **pending** code → the Worker creates a Checkout Session (one line item, `success_url` `/claim?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` `/buy`, `client_reference_id` = the code, metadata `pass`, `plan`, consent timestamps, `egg` when the seal's discount applies and `discount` when the buyer typed a code (sent as the session's `discounts`); a subscription also carries `subscription_data.metadata.pass`) → the buyer pays on Stripe → `/claim` asks `/api/claim`, which checks the session is paid (or free: a 100% discount comes back as `no_payment_required`, which counts as paid) and activates the code. The webhook activates it too, even if the buyer never returns. One code per checkout session, however often it's claimed; a Payment Link checkout (no code of its own) gets one minted.
- **Managed Payments** is on: Stripe is the seller of record and handles tax. Sessions are created with `managed_payments[enabled]=true` and the `Stripe-Version: 2026-02-25.preview` header. It refuses invoice details and other extras, so sessions carry only the line item, URLs, metadata and (for the seal) `discounts`. Both products need an eligible **tax code** in the Dashboard. The booking code is **not** on Stripe's receipt: the buyer sees it on screen, and a lost code is found on `/admin` by the buyer's email (stored as the code's note). If a checkout fails, `/buy` shows Stripe's reason, and Workers Logs and the error log have it.
- **Webhook** `POST /api/stripe/webhook`, signature checked with `STRIPE_WEBHOOK_SECRET` (5-minute tolerance; failures logged, 400). Events and what they do:
  - `checkout.session.completed` (paid) and `checkout.session.async_payment_succeeded`: activate the code.
  - `checkout.session.expired`: a checkout nobody tried to pay is dropped; one whose payment was refused is kept, cancelled, as **Payment failed** with Stripe's reason.
  - `checkout.session.async_payment_failed`, `payment_intent.payment_failed`: note the refusal on the code.
  - `invoice.payment_failed`: notes a refused Regular renewal on its code.
  - `charge.refunded`, `refund.created`, `refund.updated` (and `charge.refund.updated` if sent): `refundFor` finds the code by the payment noted at checkout (`pi:`), failing that asks Stripe for the charge, then the checkout session with that payment, then the invoice's subscription. An unused one-party code is cancelled; a used one, or a Regular's, is marked refunded.
  - `customer.subscription.created`, `.updated`, `.deleted`: the Registry's `/substatus`. A Regular's code opens games only while `active` or `trialing`; `past_due`, `unpaid` or `canceled` get 402 with a reason.
- **Subscribe the endpoint to all twelve:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `invoice.payment_failed`, `charge.refunded`, `refund.created`, `refund.updated`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- **Admin listing:** a Stripe code nobody paid for or tried to pay for is never listed, and is deleted after 48 hours. `GET /api/admin/passes` shows `pending`, `paid`, `failed`, `session`, `refunded`, `subStatus`.
- **Manage subscription** (home page) → `POST /api/portal {pass}` → a Stripe billing-portal session for that code's customer. In the Dashboard, **Settings → Billing → Customer portal**: save it (test and live separately), allow cancelling **at the end of the billing period** (the terms promise the code works until then) and updating the payment method.
- **Setting up an environment:**
  1. `STRIPE_SECRET_KEY=sk_… tools/stripe-setup.sh https://<domain> 1000` creates the one-party product, a tax-inclusive GBP price, and the webhook endpoint with all twelve events. It prints the price ID and the signing secret.
  2. Create the Regular's price by hand in the Dashboard (recurring, monthly).
  3. Put the price IDs in that environment's `.toml`; `npx wrangler secret put STRIPE_SECRET_KEY -c <config>` and `… STRIPE_WEBHOOK_SECRET`.
  4. In the Dashboard: product names (“The Betrayal — a Table (one party)” and “The Betrayal — Regular (monthly)”; `stripe-setup.sh` names the Table's product), tax codes, statement descriptor, customer portal, public business details.
  5. Test on staging with test keys and card 4242 4242 4242 4242: the code appears and opens a Table, `/admin` shows it, a refund cancels it. Then live keys on production.
- The publishable key isn't used: Checkout is Stripe-hosted.

### 6.3 Vars and secrets

**Vars** (`[vars]`, values in the `.toml`):

| name | meaning |
|---|---|
| `SITE_HOST` | the canonical host; `www.` and `OLD_HOSTS` redirect to it (production only) |
| `OLD_HOSTS` | comma-separated hosts whose pages redirect to `SITE_HOST` |
| `PASS_HOURS` | how long a redeemed code keeps its room writable (48) |
| `KEEP_DAYS` | then read-only this many days, then deleted (7; previews 1) |
| `STRIPE_PRICE_ID` | the Table's Stripe Price; empty = not on sale |
| `STRIPE_SUB_PRICE_ID` | the Regular's monthly Price; empty = not on sale |
| `STRIPE_EGG_PROMO` | the broken seal's Stripe promotion code ID (`promo_…`); empty = no discount |
| `ALERT_TO` | where alert emails go |
| `ALERT_FROM` | optional sender; default `alerts@<SITE_HOST>` |
| `ADMIN_USER` | the `/admin` username |
| `SITE_PASSWORD` | the pre-launch gate; unset = open |
| `BUILD` | set by `deploy.sh` from `build.txt` |
| `OPEN_ACCESS` | `1` = rooms without a code (development only) |

**Secrets** (`npx wrangler secret put NAME -c <config>`, or Workers & Pages → the Worker → Settings → Variables and Secrets): `ADMIN_PASSWORD`, `ADMIN_TOKEN`, `STRIPE_SECRET_KEY` (`sk_test_…` on staging, `sk_live_…` on production), `STRIPE_WEBHOOK_SECRET` (`whsec_…`), `MASTER_PASS`.

**Bindings:** `GAME` (GameState), `REGISTRY` (Registry), `ASSETS` (`worker/public`), `MAIL` (send_email, production only).

### 6.4 Alert emails

- Every contact message and problem report is emailed to `ALERT_TO` (info@thebetrayal.co.uk) from `alerts@thebetrayal.co.uk`, with Reply-To set to the customer's email when given. The subject carries the report ID; the body links to `/admin` (Reports).
- It uses the `MAIL` send_email binding (`[[send_email]]` in `wrangler.toml`; `alertMail` in `index.js`). **Prerequisites:** Email Routing on for thebetrayal.co.uk, and `ALERT_TO` verified under Email Routing → Destination addresses.
- Without them, or if sending fails, the report is still saved and the failure goes to the error log (`src: "mail"`). The customer never sees a mail error.
- Under `wrangler dev`, each email is written to `.wrangler/tmp/email/`; `--test-scheduled` adds `/__scheduled` to fire the morning summary by hand.
- **The owner's emails** (`Registry.notify`), each once, sent only when the Registry's record actually changes, so the thank-you page and the webhook both claiming, or Stripe's several events for one refund, still make one email:
  - **Sale:** a Table or a Regular, the amount (£0.00 for a 100% discount code), the booking code, the buyer's email, where they came from and any discount code.
  - **Refund:** the amount, the code, and whether its unplayed code was cancelled. A larger later total (a second partial refund) is news again.
  - **A Regular cancelled.**
  - **A Regular's payment failed**, once per attempt. A card refused at checkout isn't emailed; it shows in the admin and in the morning summary.
- **The morning summary** (`[triggers] crons` in `wrangler.toml`, 07:00 UTC; the Worker's `scheduled` handler and the Registry's `/digest`): the last 24 hours' sales and their total, refunds, Regulars who cancelled, refused payments, Tables opened (test rooms counted apart), new and open reports, and errors with the commonest three; then how many Regulars there are. Sent every day, even when nothing happened, so its absence means something's wrong.

### 6.4a The booking email

- When a payment clears, the buyer is emailed their booking code (`worker/src/booking-mail.js`: HTML in the brand's look plus a plain-text copy; Table and Regular versions). It's from `bookings@thebetrayal.co.uk` (`BOOKING_FROM` var to change it), replies go to `info@thebetrayal.co.uk` (`REPLY_TO`), and its "Open your Table" button links to `/?code=…#start`, which fills the code in on the home page. The images are `media/web/email-crest.png` and `email-wordmark.png`, loaded from the live site.
- The Registry sends it (`Registry.mailCode`) from `/claim`, so the webhook and the thank-you page can't both send it: the pass is marked `mailing` while it's in flight and `mailed` (+ `mailedTo`) once sent. A failed send is logged (`src: "mail"`), the payment is unaffected, and the next claim (the thank-you page) tries again. The thank-you page adds "We've emailed it to you too" only when it went.
- **Prerequisite for real inboxes:** the `MAIL` binding can only reach verified destination addresses until thebetrayal.co.uk is onboarded to Cloudflare **Email Sending** (Cloudflare dashboard → Email → Email Sending; it adds the domain's sending DNS records). Until then every booking email fails quietly and is logged; the code still shows on the thank-you page.
- Tests: `qa/claim.mjs` (sent once, retried after a failure, admin resend, cancelled codes refused).

### 6.4b Where buyers come from

- Every site page notes, once per tab, how the visit arrived: the link's `utm_source`/`utm_medium`/`utm_campaign`/`utm_term`, an ad click id (`gclid`, `gbraid` or `wbraid` → "google ads", `msclkid` → "microsoft ads", `ttclid` → "tiktok ads", `fbclid` → "facebook / instagram") or the referring site, plus the landing page.
- Google Ads keywords: set the account's **Final URL suffix** to `utm_term={keyword}` and each buyer's From line carries the keyword ("google ads · traitors game at home"). It's kept in `sessionStorage` as `bt-src` (listed on `/cookies` and in the privacy notice) and sent with the checkout.
- `sourceOf` in `index.js` turns it into one short line ("instagram · bio · launch (via l.instagram.com)", "google.com", "direct"), stored on the booking as `from` (and `land`) and on the Stripe payment's metadata as `source` and `landing`. The admin's booking-code list shows it in the **From** column.
- Tag your own links to get clean names: e.g. the Instagram bio link `https://thebetrayal.co.uk/?utm_source=instagram&utm_medium=bio`.

### 6.4c Google Tag Manager, Google Ads and consent

- **Tag Manager** (`GTM-MW8SWKVS`) is `site/gtm.html` (first in the head) and `site/gtm-body.html` (the `noscript` iframe straight after `<body>`), which `build.sh` puts in the home page and every site page except `/admin`; the game never gets it. Which Google tags run is set in Tag Manager itself, not here: nothing fires until a container version is published there.
- **Consent Mode:** `site/gtm.html` sets `ad_storage`, `ad_user_data`, `ad_personalization` and `analytics_storage` to denied (with ad click ids redacted) before Tag Manager loads, then applies a stored yes, and sets `url_passthrough` (until the banner is answered, an ad click's id rides along in internal links, so it can still be saved after a yes on a later page). `site/consent.js` (copied to `worker/public/consent.js`, inactive on `/admin`) is the banner: yes grants `ad_storage` and `ad_user_data` (never `ad_personalization`: no remarketing) and pushes the event `bt_consent_yes`, no denies them. The choice is kept in `localStorage` as `bt-consent`; `/cookies` has a "Change your cookie choice" button (`btCookieChoice()`).
- **Purchases:** the thank-you page pushes `{event: "purchase", ecommerce: {transaction_id, value, currency: "GBP", items}}` to the dataLayer once the code shows: the value is what Stripe says was paid (`/api/claim` returns `value`), the transaction id is the checkout session, so a refreshed page isn't counted twice.
- **In Tag Manager** (what the container needs for Google Ads):
  - Data Layer Variables `ecommerce.value`, `ecommerce.transaction_id` and `ecommerce.currency`.
  - A Custom Event trigger on `purchase`.
  - Tags: a Google tag `AW-18517139586` on Initialization – All Pages; a Conversion Linker on All Pages and on a Custom Event trigger `bt_consent_yes` (so the click is saved the moment someone says yes); a Google Ads Conversion Tracking tag (conversion ID `18517139586`, label `QFUdCKnQj58dEILB1P1E`, value, transaction ID and currency from the three variables) on the `purchase` trigger.

### 6.5 The broken seal (discount)

- The QR code in the marketing pictures (the home page's hero and the tour's TV lobby) leads to `/seal` (`noindex`, disallowed in `robots.txt`). Claiming it stores `bt-egg` in `localStorage`; the buy page then shows £9 once `/api/egg` confirms the discount is on, and says the Regular isn't discounted.
- At checkout the Worker applies `STRIPE_EGG_PROMO` (Stripe code QR10, 10% off) through `discounts`, so the buyer types nothing. One party only, never the subscription. If Stripe refuses it, the checkout opens at full price and the error log says so. `bt-egg` is cleared after a one-party purchase and is listed in the cookie notice.
- Checkout has no box for typing a promotion code.

### 6.5a Discount codes

- **Admin → Discount codes** makes them: a code (3 to 20 letters and numbers, stored upper case), 1 to 100% off, for one party only or a Regular's first month too, an optional number of uses and an optional last day (to the end of that day, UTC). Each is a Stripe coupon (`duration: once`) with a promotion code on it, made through `/api/admin/discounts` on the pinned API version `PROMO_VERSION` (`2025-09-30.clover`, whose promotion codes name their coupon in `promotion[coupon]`). The list shows every promotion code in Stripe (QR10 too) with its uses; **Switch off** sets it inactive (`/api/admin/discounts/off`). Stripe can't delete one.
- **Buying with one:** `/buy` has "Have a discount code?", which opens a box. The checkout looks the code up in Stripe before making a pending booking code, and refuses one that's unknown, switched off, used up, past its last day, or for one party when the buyer chose the Regular (a code made in Stripe's dashboard counts as one-party). A good code goes to Stripe as the session's `discounts` (instead of the seal's) and in its metadata as `discount`; if Stripe then refuses it, the buyer sees the error rather than paying full price. The booking keeps the code (`disc`), shown in the admin under the code's type.
- **Testing without paying:** make a 100% code (one use is enough) and book with it. Stripe asks for no card, the checkout comes back `no_payment_required`, and the claim and the webhook treat that as paid. The ad conversion reports £0.

### 6.6 Admin and booking codes

- The booking-code list shows each code's **Email** (its `email`, or a purchase's address) and **From**, never a free-text note; click a code to copy it. New codes take an optional email rather than a note. A row has **Email** when the code has an address and **Set email** when it doesn't.
- **Set email** stores the address a code's booking emails go to (`email` on the pass, used before `note`). **Delete** (only on cancelled or refunded codes) removes a code from the list; Stripe keeps its own record of the sale.
- **Email** (on a paid code's row) sends the booking email again, to the buyer or to an address you type. **Extend** (on a code that has opened a Table, and "Extend this Table" on a Table's page in Rooms) keeps the Table open 1 to 720 hours longer, counted from its closing time, or from now if it has closed. It updates the code, the Registry's list of Tables and the Table itself (`/_extend` sets its `meta.expires` and its deletion alarm), so a closed Table reopens. A Table whose game has already been deleted can't be reopened.

- **`/admin`:** sign in as `ADMIN_USER` with the `ADMIN_PASSWORD` secret. A signed, HttpOnly, SameSite=Strict cookie (`cc_admin`) lasts 12 hours; changing the password signs every session out. Wrong passwords count with wrong codes (20 an hour per address). Signed-in browsers may only make changes from the site's own origin.
- **Tabs:** **Booking codes** (totals, search by code, note, email or room; filter; copy; cancel; create one-party codes or free Regular codes that never lapse; open a test room with links for Classic and Modern, including *Modern against bots*), **Rooms** (config, full log, replay of TV and phone, device trails; Modern rooms show every role and whether the host looked), **Reports** (snapshot, trail, status and note), **Errors** (the master log), **Stripe events** (the webhook log).
- **Admin API** (session cookie or `Authorization: Bearer <ADMIN_TOKEN>`): `POST login`, `POST logout`, `GET me`, `POST room` (test room), `GET|POST passes {count, note, kind}`, `POST revoke {pass}`, `GET rooms`, `GET room/CODE/room|recs|rec?n=|events`, `GET errors`, `GET hooks`, `GET reports`, `GET|POST report`.
- **From a terminal:** `tools/passes.sh mint [n] [note] | list | revoke CODE`. Needs `ADMIN_TOKEN`; `BASE=` for staging or `http://127.0.0.1:8790` locally (defaults to production).
- **Lost link:** the customer re-enters their code on the home page and gets the same Table back. A lost code: find it on `/admin` by email.
- **On the night (Classic, for customers):** open the Table on the laptop, click **Enable sound**, press F, cast; open `…#keeper` on the phone and plan the game.

### 6.7 Site and legal pages

- `site/pages/`: `terms` (sale and use; the £10 and £20 prices, 48 hours, 7 days, discounts), `privacy` (UK GDPR notice), `cookies` (the storage the site needs, and Google's advertising cookies, which only start after a yes on the banner in `site/consent.js`; lists every `bt-` key), `refunds` (14-day cancellation until the code is first used; Consumer Rights Act remedies), `contact` (a form that posts to `/api/report`, and info@thebetrayal.co.uk), `buy` (price, two required ticks for the terms and for immediate supply with loss of the right to cancel, as the Consumer Contracts Regulations require), `rules` (Modern, with a `#classic` section), `tour` (Modern / Classic toggle; `/tour#classic` opens Classic; both show without JavaScript), `seal`, `404`, `admin`.
- Each page's `<!-- desc: -->` line becomes its description, canonical and social tags. Every footer links the legal pages; the nav links How to play, See a game and Book a Table.
- `robots.txt` (disallows `/admin`, `/seal`, `/api/`, `/t/`, `/m/`, `/g/`) and `llms.txt` in `worker/public/` are hand-maintained; `sitemap.xml` and `llms-full.txt` are generated by `build.sh` (§6.9).
- The home page's price line is `SHOP` near the bottom of `site/index.html`; the buy page states its prices in `site/pages/buy.html`.
- Public copy follows `media/copy/glossary.md`: no em dashes in visible copy, the tagline "the party game of loyalty and lies", dinner as optional.

### 6.8 Screenshots, brand and marketing pack

| tool | what it makes | run |
|---|---|---|
| `tools/modern-shots.mjs` + `tools/modern-shots.py` | the Modern tour's 39 screenshots (phone 390 wide at 2x, TV 1280×720) in `media/web/`, from a whole evening played by the engine and photographed in replay mode | `./build.sh` then `python3 tools/modern-shots.py` |
| `tools/hero-modern.py` | the home page hero, `media/web/hero-modern.jpg`, from the tour shots, and WebP copies at several widths of the hero and the home page's two tour shots (`*-640.webp` etc.), which `site/index.html` offers by screen size | after modern-shots, and after changing either tour shot |
| `qa/media.py` | Classic screenshots in `media/screenshots/` (TV 1920×1080, phone 390×844 at 3x) | `node qa/server.mjs 8714 &` then `python3 qa/media.py` |
| `tools/webshots.py` | web-sized copies of `media/screenshots` in `media/web/` for the Classic tour | after `qa/media.py` |
| `tools/marketing-pack.py` | `dist/The-Betrayal-Marketing-Pack.zip`: game guide, setup guide, data sheets from the built game, brand, copy, screenshots, social, launch | `./build.sh` first |
| `tools/brand/make_logos.py` | wordmark and lockups in `media/logos/` | |
| `tools/brand/make_seal.py` | the cracked wax seal (`media/logos/the-betrayal-seal*`) and the app and browser icons | `./build.sh` first |
| `tools/brand/make_creatives.py` | ads, social images and print card | |
| `tools/brand/make_guidelines.py` | `media/The-Betrayal-Brand-Guidelines.pdf` | after make_creatives |

- The Modern tour game has **twists off**, so no secret prize, Temptation or Honour or Betray appears (no spoilers), and it ends in a Loyal win so the end screens are stable. Keep it that way. It passes `qr` so the TV lobby's QR code leads to `/seal`.
- `build.sh` copies `media/web/*` to `worker/public/media/`; rebuild after regenerating images.
- Brand: plum and rose-gold palette (`media/palette/`), Grenze Gotisch for the wordmark and the TV's big moments, IM Fell DW Pica for headings, the cracked seal as the secondary mark.


### 6.9 Search (SEO) and AI answer engines (GEO)

- **Titles and descriptions.** Each `site/pages/NAME.html` starts with `<!-- title: … -->` (the short name, used in breadcrumbs; the `<title>` becomes "NAME · The Betrayal"), an optional `<!-- fulltitle: … -->` (replaces the whole `<title>`, og:title and twitter:title) and `<!-- desc: … -->`. Keep titles to 60 characters and descriptions to 155, each different; `qa/site.py` checks both. The home page's are in `site/index.html`'s head.
- **Head tags** come from `site/page.html`: `lang="en-GB"`, canonical `https://thebetrayal.co.uk/NAME`, Open Graph (og-card.png, 1200×630) and Twitter tags. `build.sh` fills `__HEAD__` with a BreadcrumbList for every indexable page, plus `site/pages/NAME.jsonld` if it exists, or `noindex` for 404, admin and seal.
- **JSON-LD:** the home page (inline in `site/index.html`) has Organization, WebSite, Product+Game with both Offers (£10 Table, £20/month Regular, GBP) and FAQPage; `buy.jsonld` repeats the Product; `traitors-at-home.jsonld` has HowTo and FAQPage. **FAQ and HowTo text must match the page word for word**: when you edit a home question (`<details>`), a guide step or a guide question, edit the JSON-LD too. `qa/site.py` fails if they drift, and if prices change, change them in the JSON-LD, `llms.txt` and the guides as well.
- **Sitemap:** `build.sh` writes `worker/public/sitemap.xml` from `site/index.html` and every page in `site/pages/` except 404, admin and seal, each dated by its source's last commit. A new page is added to it automatically; also add its slug to the page regex in `worker/src/index.js` (and to the `.html` redirect list there).
- **AI assistants:** `worker/public/robots.txt` names the AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended and others) and allows them everything public. `worker/public/llms.txt` is a hand-written factual summary (players, length, prices, how it works, links): update it when facts change. `build.sh` writes `llms-full.txt` as `llms.txt` plus the plain text of `/rules` and the two guides.
- **Target searches:** party games for adults and for large groups (8, 10, 12, 20 people), social deduction or hidden-role game, games night ideas, murder mystery party alternative, Christmas, office Christmas, hen and birthday party games, a party game played on phones, and "traitors at home" style searches. The home page and `/party-games-for-large-groups` take the party searches; `/traitors-at-home` (a practical guide to running a hidden-traitor game, by hand or with The Betrayal) takes the traitors searches.
- **"The Traitors" is a BBC programme and a trade mark.** It appears only descriptively: the home FAQ "Is it like The Traitors?", the guide at `/traitors-at-home` (its title says "traitors-style") and `llms.txt`, each saying plainly that The Betrayal is original and not connected to the programme, the BBC or its makers. Never put it in the brand, another page's title, the game's own words or a keyword list. The game’s roles stay the Forsworn and the Loyal (`media/copy/glossary.md`).
- **Weight:** the home hero (`hero-modern.jpg`, about 95 KB) is preloaded with `fetchpriority="high"`; every other image has width, height and `loading="lazy"`.

### 6.10 Google Ads, swept daily by Claude

- **What runs:** a Claude Code scheduled task, "Google Ads daily sweep", starts a fresh session in this repository's cloud environment at 07:52 UK time every day. It follows `tools/ads/PLAYBOOK.md`, and its last message (a short summary) reaches the owner by push and email. It works only through `tools/ads/ads.mjs`, which is the Google Ads API over REST with no dependencies. It runs `check`, `report --out FILE` and `apply FILE [--live]`; without `--live`, Google only validates the changes. Run them by hand the same way.
- **The owner's limits** are `LIMITS` in `ads.mjs`, and changing them is the owner's call:
  - enabled campaigns' daily budgets add up to £4 at most, and no single budget is over £4;
  - keyword bids and Maximise-clicks bid limits are £2 at most, and move ±20% per change;
  - 30 changes a run;
  - money changes only on a GBP account;
  - only six kinds of change: `add_negative_keyword`, `pause_keyword`, `set_keyword_bid`, `set_cpc_ceiling`, `set_budget` and `pause_ad`. Never a negative that would block a campaign's own keyword, and never an ad group's last enabled ad.
  - Everything else is proposed to the owner: enabling, new campaigns, ads or keywords, ad text, bidding strategy and conversion settings. `qa/ads.mjs` tests each limit.
  - Google may spend up to twice a day's budget on a busy day, but no more than 30.4 days' worth in a month.
- **Permission to act:** in auto mode the safety check refuses any change to the live account unless a permission rule allows `node tools/ads/ads.mjs …`; without one a sweep can only report. The rule belongs in `.claude/settings.json` (`{"permissions": {"allow": ["Bash(node tools/ads/ads.mjs *)"]}}`) and is the owner's to add, since it changes what Claude may do. `LIMITS` in the script is what keeps the sweep's changes safe.
- **The 19 Oct 2026 setup** (a one-off script, removed once it had run; it's in the git history): Performance Max cut from £3.90 to £1 a day; the unused duplicate conversion "Purchase (1)" made secondary ("Purchase", the one the site's tag feeds, stays primary); 145 mobile-app categories excluded account-wide (Performance Max had spent 98% on Display, mostly app taps, with no sales); and a Search campaign "Search: party games" at £3 a day: Maximise clicks with a £1 limit, UK presence, English, Google Search only, three ad groups (game at home → /traitors-at-home, party games → /party-games-for-large-groups, hidden role games → /) with 17 phrase keywords, an ad each from the brief's headlines and descriptions, and the 15 negatives. Sitelinks, callouts and the snippet are account-level, so it has them too.
- **API version:** `VERSION` (v26). Each version is retired about a year after release. A retired version gives a 404, and `check` says so; then set `GOOGLE_ADS_API_VERSION`, or update `VERSION`.
- **Credentials:** environment variables in the cloud environment's settings, never a file. Google retired developer tokens in September 2026, and API access now belongs to the Google Cloud project that owns the OAuth client. `GOOGLE_ADS_DEVELOPER_TOKEN` is optional: if set it's still sent, and Google ignores it (remove it if a later API version refuses it).
  - `GOOGLE_ADS_CLIENT_ID`
  - `GOOGLE_ADS_CLIENT_SECRET`
  - `GOOGLE_ADS_REFRESH_TOKEN`
  - `GOOGLE_ADS_CUSTOMER_ID` (the ad account, dashes allowed)
  - `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (the manager account's ID, when access is through one)
- **Network:** `googleads.googleapis.com` and `oauth2.googleapis.com` were reachable from the cloud environment as it was set up on 19 Oct 2026. If that changes, `check` names the hosts to allow.
- **Setting it up once:**
  1. In Google Cloud (console.cloud.google.com), make a project and enable the **Google Ads API**.
  2. Set up the OAuth consent screen: External, then **publish it (In production)**. In Testing, Google expires the refresh token after 7 days.
  3. Create an OAuth client ID of type **Web application**, with the authorised redirect URI `https://developers.google.com/oauthplayground`.
  4. In the OAuth Playground (developers.google.com/oauthplayground):
     1. Open the gear menu, choose "Use your own OAuth credentials" and enter the client ID and secret.
     2. Use the scope `https://www.googleapis.com/auth/adwords` and authorise as the Google user with access to the ad account. Pass Google's "unverified app" warning through Advanced.
     3. Exchange the code for tokens, and keep the **refresh token**.
  5. **API access level:** on the same Cloud project, request **Explorer** access (2,880 operations a day on live accounts, plenty for a daily sweep) on the Google Ads API's page in the Cloud Console. A new project starts with test-account access only. Basic needs brand verification of the consent screen first.
  6. **Manager account** (optional, if access is through one): link the ad account to it and set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` to the manager's ID.
  7. Put the values in the environment's settings. The next day's sweep, or `node tools/ads/ads.mjs check`, confirms it works.
- **Refresh token problems:** if `check` says `OAUTH_INVALID_GRANT`, the refresh token has expired or been revoked. Make a new one (step 4) and replace `GOOGLE_ADS_REFRESH_TOKEN`.

---

## 7. Content banks

`src/content.js`: QUIZ_E 420, QUIZ_M 520, QUIZ_H 595; ESTIMATE 264; LIKELY 264; CHARADES 342; SONGS 497; PICTIONARY 520; MEMSETS 30; CODEWORDS 60; QUESTS 165.

- **Append-only.** Each room's question-bank switches (`settings.off`) identify items by position, so never reorder, insert or delete. CODEWORDS is listed in the switches but no Trial draws from it; keep it.
- New items avoid time-sensitive facts (office-holders, records, capitals that move) and tie populations to a census year.
- SONGS are titles only, never lyrics.
- The Longest Word dictionary is `worker/public/words.txt`.
- After editing, run `./build.sh` (Modern reads the banks from `content.gen.js`) and `python3 qa/banks.py`.

---

## 8. Testing

Never run `build.sh` while break is running (a new `build.txt` reloads the pages). Kill stray local servers with `for pid in $(pgrep -f "^node qa/server.mjs 871[4-9]"); do kill $pid; done`; don't `pkill -f` a pattern your own command line contains.

**The local Worker** (for every harness marked *wrangler dev*):

```sh
npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var ADMIN_PASSWORD:testpw --var MASTER_PASS:MASTERTEST --var SITE_PASSWORD: --var BUILD:$(cat worker/public/build.txt)
```

`qa/server.mjs [port]` (default 8714) is a lightweight stand-in with the same API contract and redaction, rooms in memory, `/api/state` as a default room, and the home page at `/home`.

| harness | run | checks |
|---|---|---|
| `qa/smoke166.py` | own server :8719 | one pass through each Classic rule with the real functions |
| `qa/plan.py` | own server :8721 | every game-plan choice honoured |
| `qa/wizard.py` | own server :8724 | every setup page on a phone, recommendations, the handover; screenshots in `qa/shots/wizard/` |
| `qa/flow.py` | own server :8726 | courses, prize tiers, the Ghosts' call, the awards cap, the narrator, PURSE or SELF, the Casting Vote wording |
| `qa/big.py` | own server :8722 | 8 to 24 players, the rounds control, the second vote, many-victim nights, the five floor, every screen of a 24-player game at 720p, 1080p and 4:3 |
| `qa/e2e.py [URL]` | `qa/server.mjs` or wrangler dev with `ADMIN_TOKEN=` (optionally `MASTER_PASS=`, `SITE_PASSWORD=`) | booking codes, rooms, isolation, PIN gate, redaction, two-screen sync, Confessor, Ghosts, wipe |
| `qa/resilience.py [URL]` | `qa/server.mjs` :8714 | PIN persistence and lockout, colliding hosts, dropped connections, night masking. Its last step trips the stand-in's wrong-PIN limit on purpose, so restart `qa/server.mjs` (or wait a minute) before running it again |
| `qa/diag.py URL` | wrangler dev | recording, device trails, errors, reports from phone and TV, every `/admin` tab including the replay |
| `qa/site.py URL` | wrangler dev (optionally `--var STRIPE_EGG_PROMO:promo_x`) | every public page at 320/390/768/1440 without sideways scroll or console errors, nav, code boxes, buy page |
| `qa/modern.py URL` | wrangler dev | eight phones and a TV: the mode choice, joining, host settings, the Oath, a whole quiz, the Temptation, Reckoning, night, dawn, a course, host tools and the roles, rejoin, QR, narrator and sound, `/admin` replay, and every Trial's screen |
| `qa/modern-bots.py URL` | wrangler dev | the master code's *Modern test* and a whole game against bots (about three minutes); the admin's test room |
| `node qa/modern-engine.mjs` | none | Modern's engine alone: lobby, Oath, private views, every Trial, twists, host tools, whole games at many sizes |
| `node qa/claim.mjs` | none (Stripe and Durable Objects stubbed) | checkout, claim, signed webhook (paid, async, expired, refused, refunded before and after use), Payment Link fallback, subscriptions, the billing portal |
| `node qa/admin.mjs` | none (stubbed) | admin sign-in, cookie flags and tampering, the attempt limit, Bearer token, cross-site requests, codes, test room |
| `node qa/ads.mjs` | none (Google Ads API stubbed) | the sweep's script: sign-in, Google's errors and their hints, every part of the report, and every limit on changes (the £4 cap, bid steps and ceiling, negatives that would block a keyword, an ad group's last ad, non-GBP accounts, dry run vs live, partial failures) |
| `node qa/worker.mjs` | none | the real Worker class with in-memory storage: PIN limits, stale-build writes, the settings rule |
| `qa/break.py part2` | `qa/server.mjs` :8717 | sync and hand attacks: two phones, lost replies, offline taps, wipes, rate limits |
| `qa/banks.py` | own server :8717 | every bank item on the TV; duplicates and well-formedness |
| `qa/media.py`, `qa/shots.py`, `qa/gallery.py` | `qa/server.mjs` :8714 | screenshots |

Unmaintained: `qa/break.py part1` and `qa/review.py` drive an older Classic setup form and small tables; `qa/smoke.py`, `qa/audit.py`, `qa/audio.py`, `qa/live.py` are older checks. Rework them before trusting a result.

**Room expiry by hand:** `wrangler dev` with `--var PASS_HOURS:0.001 --var KEEP_DAYS:0.0001`: writes get 423 after expiry, reads still work, a used and expired code is refused, and the alarm deletes the room.

The standard checks before a deploy are smoke166, plan, big, claim, admin, modern-engine and e2e; add modern, site and diag for changes to Modern, the site or diagnostics.

---

## 9. Known limitations and open to-dos

- **Business details:** the terms name "an independent business based in England" and info@thebetrayal.co.uk, with no trading name or geographic address. UK consumer law expects both before selling to the public; add them to the terms, privacy notice and contact page.
- **The seal discount under Managed Payments** is unverified: check the first real seal purchase shows 10% off. If Stripe refuses it, the buyer pays full price and the error log says why.
- **No extra checkout fields** (Managed Payments). Discount codes are typed on the booking page instead (§6.5a), and where a buyer came from is recorded without asking (§6.4b).
- **The booking code isn't on Stripe's receipt** (Managed Payments refuses the extras that would carry it). Buyers get it on screen after paying and in the booking email (§6.4a); `/admin` finds a lost code by email address.
- **Live payments:** `qa/claim.mjs` covers the Stripe paths against a stub. After any Stripe change, run the staging test in §6.2 and one live purchase and refund.
- **Vibration** doesn't work on iPhones.
- **Big tables** (20 to 24) are checked by simulation and `qa/big.py`; a 24-player Classic game runs about 8 rounds.
- **A Git-integration deploy doesn't set `BUILD`**, so stale pages aren't refused with 426 there; they rely on the `build.txt` poll to reload.
- **Ideas:** a printable guest guide; per-Trial lengths in Classic's plan; bundles (three parties).

---

## 10. A prompt to start the next session

> You're picking up "The Betrayal", a commercial party game for 8 to 24 players on a Cloudflare Worker (thebetrayal.co.uk), with a Durable Object per Table and booking codes in a Registry. Modern: everyone on their own phone, the server runs the game (worker/src/modern.js; phones at /m/ROOM, TV at /t/ROOM). Classic: a Keeper phone (/t/ROOM#keeper) and a TV (/t/ROOM). Read HANDOVER.md, then README.md. The code is plain JS in src/ built by build.sh; Classic's TV secrets are stripped in worker/src/public-view.js. Build and run `python3 qa/smoke166.py`, `python3 qa/plan.py` and `node qa/modern-engine.mjs` for a baseline. Make surgical changes, keep content banks append-only, keep saved games loadable across deploys, add any new Classic secret field to public-view.js, and never rename the Worker or the CNDL- key prefix. Test locally (and under `wrangler dev` for Worker changes), deploy to staging and run qa/e2e.py against it, then production only when I say. Never write tokens into files. Here's what I'd like changed: …
