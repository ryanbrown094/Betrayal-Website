# Cloak & Candle — handover (1.0, 27 September 2026)

Written for whoever picks the project up next — most likely an LLM coding assistant working with Ryan. Read this, then `README.md`, then the code. Where something is untested or assumed, it says so.

---

## 1. What it is

**Cloak & Candle** is a commercial, hosted dinner-party game for 4–14 guests in one room. Guests have no phones in play; the props are blindfolds, chalkboards and chalk. Two screens run it:

- **The TV** — `/g/ROOMCD` on a laptop cast to the TV. It never receives secrets (§4.5).
- **The host phone** — `/g/ROOMCD#host`. The host plans the game up front (§5.0), then taps through it reading the lines it gives them.

It is sold as a **party pass** (`CNDL-XXXX-XXXX`): redeeming one opens a room for 48 hours. Every room is its own Cloudflare Durable Object, so any number of parties play at once.

It grew out of a private party build ("v17", played 26 September 2026). For the product it was re-dressed so it stands on its own: new name and mark (a cloaked figure with a candle flame for a face), a plum / rose-gold palette, the setting is "the house", no default host name, the letters game is **Longest Word**, and every party-only file (guest guide, invite, the old prize) was removed. Faithful / Traitor stay as role names at Ryan's request.

**Status (28 Sep 2026):** built and tested locally, including the real Worker under `wrangler dev`. Domain `cloakandcandle.co.uk` bought through Cloudflare; the repo is meant to deploy through Cloudflare's GitHub integration from the repo root (`wrangler.toml`). The whole site sits behind a pre-launch password (`SITE_PASSWORD` in `wrangler.toml`). Payments: code path written and unit-tested with Stripe stubbed; not tried against real Stripe.

---

## 2. Quick start

```sh
./build.sh
python3 qa/smoke166.py && python3 qa/plan.py && node qa/claim.mjs
npm i && npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var SITE_PASSWORD: --var BUILD:$(cat worker/public/build.txt) &
ADMIN_TOKEN=dev python3 qa/e2e.py http://127.0.0.1:8790/
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
site/index.html    the home page: SHOP settings (Stripe link, price, contact) at the bottom
worker/src/        index.js (router, GameState, Registry), codes.js, rules.js, public-view.js
worker/public/     build output + fonts, icons, words.txt (Longest Word dictionary), _headers, media/
media/             logos/, screenshots/, social/, palette/, copy/press-kit.md, src/guidelines.html, Cloak-and-Candle-Brand-Guidelines.pdf
tools/             brand.py, mediapack.py, icons.py, passes.sh, recolour.py (the one-off palette move, kept for reference)
qa/                harnesses (§8)
```

---

## 4. Architecture

### 4.1 Rooms and passes (Worker)
- **Routes:** `/` home page · `/g/ROOMCD` game page (`play.html`) · `/api/g/ROOMCD/state|settings` a room's API · `POST /api/games {pass}` redeem · `GET /api/claim?session_id=` Stripe · `/api/admin/*` (Bearer `ADMIN_TOKEN`): `POST passes {count,note}`, `GET passes`, `POST revoke {pass}`.
- **Registry** (one Durable Object, `idFromName("registry")`): passes `pass:CNDL-…` → `{created, note, source, room?, expires?, redeemed?, revoked?}`, rooms `room:CODE`, Stripe claims `claim:<session>`. Redeeming again returns the same room until it expires (a host who lost the link). 20 failed redemptions an hour per address, then 429.
- **GameState** (one per room, `idFromName("room:CODE")`): `meta {room, expires, pass}` set by the Registry on creation; unknown rooms are 404. After `expires` the room is read-only (writes get **423**); an alarm deletes it `KEEP_DAYS` later. Otherwise unchanged from the party build: PIN, wrong-PIN limiting, 409/410 save rules, poll tags, question-bank switches (now per room).
- **Vars:** `PASS_HOURS` (48), `KEEP_DAYS` (7), `BUILD` (set by deploy.sh). **Secrets:** `ADMIN_TOKEN`, `STRIPE_SECRET_KEY`. `OPEN_ACCESS=1` lets `POST /api/games` with no pass make a room — development only.
- Codes avoid 0/O/1/I/L. Rooms: 6 characters. Passes: `CNDL-` + 8.

### 4.2 The page
`build.sh` concatenates `fonts.css`, `style.css`, `content.js`, `scripts.js`, `public-view.js`, `core.js`, `audio.js`, `art.js`, `tv.js`, `host.js`, `boot.js`. `isHost` = `#host`. `ROOM` comes from the path; `API` is `/api/g/ROOM` (or `/api` with no room — the local test server's default room). The standalone `index.html` still runs on localStorage with no server.

### 4.3 State and actions
One JSON `state`; `SCHEMA = 11`, `APPV = "1.0"`. Every change goes through `act(fn, logline)` (clone, run, stamp, log, save; stale taps dropped). Undo: 30 local snapshots plus a short `prev` chain; `rewindRound` restores `roundSnap`. New in 1.0: `rules` (§5.0), `plan`, `planAt`.

### 4.4 Sync
Both screens poll `GET …/state` about once a second (`X-Have` tag → `{same:true}`). The phone queues saves and rebases after lost replies. GET bodies carry `room {code, expires, expired}`. Status handling in `flushSaves`: 426 reload, 403 wrong PIN, 410 wiped elsewhere, 409 another phone moved, **423 pass expired** (read-only toast).

### 4.5 Secrets and the public view
`worker/src/public-view.js` is the single source of truth for what the TV may know (roles, PIN, log, undo chain, Seer, secret dagger holders, mission secrets, quiz answers, the night's victim until its line, side-quests, unrevealed votes, the prize and stats until the final phase). **When you add a secret field, add it there.** `rules`, `plan` and `planAt` are not secret.

### 4.6 TV
`tvView(s)` → `{key, html, scene, sfx…}`; title cards on phase changes; large text by default; tuned for 16:9/16:10. Everything passes through `kw()` for the kill style. Before a game, the TV shows the room code and the host link.

---

## 5. The game

### 5.0 The game plan (setup)
Six collapsible sections on the phone, then a plain-English summary and **Start game**. Saved in `state.rules` (`RULES0` in `core.js` has the defaults; `cleanRules` validates):

| rule | values | effect |
|---|---|---|
| `rounds` | 0 = by table size, or 1–10 | fixed: round N becomes the final (`nextRound`). The five-left rule still applies |
| `perRound` | 0 = by the clock, 1, 2 | missions a round (`perRoundOf`) |
| `dinnerAfter` | 0–10 | the morning after that round offers dinner as the main button |
| `mingle` | on/off | a 10-minute mingle before each Reckoning |
| `pool` | mission keys or null (all) | `planMissions` deals them: the icebreaker first, Ghost games after mission two, no repeats until used up. `state.plan`/`planAt` hold the order; `nextPlanned` skips the Statue until there are Ghosts |
| `kill` | `murder` / `poison` | murder: the victim is tapped and leaves the table under blindfold; poison: told at night, announces at breakfast, last words, leaves. Wording swapped by `kw()` everywhere (host, TV, scripts) |
| `ghosts` | on/off | off: `ghostsOf` returns nobody — no lore, verdicts, Ghost round, Statue |
| `recruit`, `ultimatum` | on/off | `autoMode` picks the night: one Recruit, then one Ultimatum, only for a lone Traitor v 4+ Faithful |
| `quests` | on/off | one side-quest pre-chosen each night |
| `shield` | mix / public / secret / off | `autoPrize`; mix = hidden in round-by-round missions, public elsewhere |
| `dagger`, `warrior`, `seer`, `dilemma` | on/off | Warrior every other round; Seer only at five with one Traitor; the Dilemma offered when nobody holds a shield |

The Menu has **Your game plan** (the summary and the next six missions).

### 5.1 Flow
1. **The game plan** (phone, §5.0): players and PIN, the evening, the mission pool, nights and Ghosts, secret roles, pot and prize.
2. **Lobby** → **intro** (the rules card on the TV) → **night 0** (the Traitors are chosen and see each other).
3. **Each round:**
   - Day: the plan's next mission, one tap (the host may swap it). One or two a round, by the plan.
   - Mission: brief → prize step → play → done.
   - Shield step: ceremony or card.
   - Mingle before the table if the plan has it (always when a side-quest is in play); dinner at the morning the plan names.
   - Reckoning: talk → boards → banishment.
   - Reveal: the role is shown unless it's the final; the new Ghost gives their verdict.
   - Night: a kill (murder or poison, by the plan), or a Recruit / Ultimatum when one Traitor faces four or more (if switched on), plus a side-quest.
   - Morning: breakfast reveal (murder: an empty chair; poison: the victim stands, last words).
4. **The end game** (automatic, see §5.6).
5. **The final ceremony:** seals turned one by one (hold for a drumroll). With two or more Traitors left, share or steal; then possibly the Ghosts' round.
6. **Final screen:** winner, prize, pot split and the full roll (recruited or ultimatum Traitors marked). Then the **awards**, revealed one at a time.

### 5.2 Missions (`content.js` → `MISSIONS`)
Most Likely To; Rapid Quiz; Longest Word (key `countdown`); Closest Guess; Memory Wall; Snap; Rock Paper Scissors Royale; One Leg; Screen Charades; Hum It; The Statue; Two Truths and a Lie; Chalkboard Pictionary; Higher or Lower; What Changed?; The Dilemma (add-on); Custom.

- **Settings:** per-mission options (`MSET`) have defaults; the host can change them on the brief, and they're remembered in `prefs`.
- **Prizes** are set by the plan (`autoPrize`); the brief shows them pre-selected and the host can still change them.
- **Labels:** the TV shows "round N · mission M".
- **Brief, then prize:** the TV shows the brief first. The host picks the prizes and taps **Confirm — prize on TV**; the TV then shows a prize card with one labelled line per prize, plus the points on offer. **Start mission** begins play. Most Likely To and the Dilemma skip the prize step.
- **Quiz:** tapping who shouted shows "X — locked in"; the answer appears only after the host taps Correct or Wrong.
- **What Changed?:** runs itself. When the study clock ends the grid hides, a 10-second countdown runs, then the new grid appears. The host phone must be awake for the hide.
- **Charades, Hum It, Pictionary:** "Blindfolds on — everyone but X" (nothing else shows) → "Blindfolds are on — show X" (the word appears, with "Don't know it? Ask ‹host› to skip").
  - **Hum It** then splits "Blindfolds off" and "Start 30 s". While the clock runs the music is silent and the clock shows only for its last 5 seconds.
- **Higher or Lower:** shows the round winner before everyone stands again.
- **Ties:** broken only when something rides on the winner (a public shield or dagger).

### 5.3 Prizes: shield, dagger, Warrior, Seer
- **Shield** (safe from poison tonight): none / the overall winner (public) / 1–2 **hidden** questions or rounds (missions played in rounds only: quiz, Longest Word, Closest Guess, Higher or Lower, What Changed?).
  - A hidden shield is won by whoever wins *that* question or round (answers it correctly, is closest, has the longest word…), **not** by winning the mission. The rounds are drawn at random, never the first when there's a choice, and only the host sees them.
  - At most a quarter of the table (minimum one) holds shields at once. There are no shields in the final.
- **Dagger:** the holder's vote counts twice. Options: none / overall winner / a hidden round of its own / **with the shield** — which makes the **Warrior** (public or hidden, as the shield is). One dagger per round.
- **At the Reckoning** the dagger is automatic. Every board counts one as it turns. When the host taps "All boards in", the TV's main line becomes **"the dagger fell on Y"** and one vote is added. The holder is never named.
  - If that extra vote decided the banishment, the reveal plays a **dagger stab with a drop of blood**.
  - **Only a Warrior** may lay down shield and dagger before the first board, to be immune from that banishment (and unprotected that night).
- **Secret winners** are tapped in a ceremony. Each prize has its own tap line and the phone says who to tap on which line.
  - A Traitor who wins a hidden shield on its own gets nothing and no ceremony.
  - A Traitor who wins a hidden dagger or the hidden Warrior keeps it.
- **The Seer** is only offered with exactly **5 alive and 1 Traitor**, which means the final round, before its Reckoning. The TV calls it "a special prize".
  - Whoever wins it meets the Traitor in a ceremony straight after the mission. Nothing said aloud names it; the tapped person reads the screen.
  - The Seer can't be poisoned.
  - If the Traitor wins, the host taps them and then walks the table tapping nobody. The room hears identical lines, and nothing happens.

### 5.4 The pot
- The target is 2000 (set at setup). The pot is capped there, and **the TV does not show the target**.
- Each mission offers what's left, shared over the missions likely still to come (`offerOf`/`missionsLeft`). The final round offers the rest.
- **Everything moves in multiples of 50.**
- **Wrong shouts** (quiz Wrong, Snap −, What Changed? "wrong shout") cost 50 for a Traitor's; a Faithful's costs nothing. With the setup/Menu option "everyone's", a Faithful's costs 50 and a Traitor's 100.
  - The room sees only the total ("Wrong shouts cost it 50"); the host sees whose.
  - A failed side-quest costs 50.
- **The Dilemma's** stake is the current offer (at least 100) and says its points.
- **At the end** the winners split the pot. All share → split, and rock, paper, scissors for the prize. One steals → the pot and the prize.

### 5.5 Reckoning details
- **Talk timer.** Before the first board, the host is reminded of the Warrior's option. A secret Warrior is reminded without being named.
- **The tally is hidden on the TV by default** (the host can show it). Count nudges appear on the phone when it's close (level, one in it, or decided) — in words, never digits.
- **Ties:** revote between the tied players, or the host picks.
- **Banishment reveal:** a single tap after the banished player has said their role themselves. There is no drumroll. The final ceremony keeps a hold-for-drumroll on each seal.
- **Ghosts:** the banished and the poisoned become Ghosts. They give one secret verdict (name a Traitor) **straight after their banishment**; the first time, it comes after the ghost lore. It counts at the end.

### 5.6 The end game (reactive to player count)
- In a game that started with more than 5 players, the round that starts with **5 or fewer alive is the final**.
- **Five never becomes four by poison.** A banishment that leaves 5 goes straight into the final round with no night; `startNight` refuses at 5 too. From 6, the night's poison makes 5.
- The **final Reckoning takes 5 to 4 with no role reveal**. Then it's **End or Banish** with every remaining player voting in secret on the phone.
  - Only a unanimous END ends the game.
  - Otherwise another table (no reveal): 4→3 and vote again; 3→2 goes to the final-two ceremony.
  - A final-round table with 4 or fewer goes straight to the vote.
- **The ceremony:** the host turns each survivor's seal.
  - With two or more Traitors left: **share or steal** (phone handed round). All share → split the pot, RPS for the prize. One steals → takes both. Two or more steal → it goes to Ghosts who named a Traitor (their own share-or-steal round if there are several), otherwise the host keeps it.

### 5.7 Awards
`awardsOf` in `core.js`. There are 21 candidates, in order of weight:

1. The Sharpest Eye
2. The Grand Deceiver
3. The Deciding Blade
4. The Turncoat
5. Couldn't Be Bought
6. The Ghost Who Saw
7. The Prophet
8. The Backstabber
9. The Narrow Escape
10. First Blood
11. The Martyr
12. Mission Machine
13. The Kingmaker
14. The Lightning Rod
15. The Wild Card
16. Barking Up the Wrong Tree
17. The Shield Bearer
18. The Point Hoarder
19. The Lone Wolf
20. The Untouchable
21. Last Faithful Standing

- **One per person.** Each award goes to the best-placed player who hasn't had one yet.
- **The total is trimmed to 2, 4, 6, 8 or 12** so the cards fill a grid (2×1, 2×2, 3×2, 4×2, 4×3).
- **Reveal order:** lightest first. The TV starts with sealed cards, and the host taps "The first award", "Next award"…

### 5.8 Scripts and wording
- All host lines live in `scripts.js` (`SAY`, `nightScript`, `CEREMONY_`, `SEERNOW_`). `vr(list, round)` rotates phrasings by round so no two rounds sound the same.
- **Spoiler rules the scripts follow:**
  - nothing aloud names who holds a secret prize;
  - the Seer is "a special prize";
  - title cards are generic;
  - a shielded victim is never tapped.
- **Blindfold lines include Ghosts** when there are any.

---

---

## 6. Operations

- `deploy.sh staging|production` → `build.sh` → `wrangler deploy --var BUILD:<build>`. Cloudflare account `52f36be1337501d7eb4752e3ca42fac7`. Workers: `cloak-and-candle` (cloakandcandle.co.uk), `cloak-and-candle-staging` (staging.cloakandcandle.co.uk). Both are **new** Workers with their own Durable Objects (migration tag `v1`: GameState, Registry); the old `traitors-table` Workers are untouched.
- Rollback: `npx wrangler rollback <version-id> -c <config>`.
- Passes: `tools/passes.sh mint|list|revoke` (needs `ADMIN_TOKEN`; `BASE=` for staging or local).
- A customer who lost their link: they re-enter their pass on the home page and get the same room back.
- On the night (for customers): open the room on the laptop, click **Enable sound**, press F, cast. Open `…#host` on the phone and plan the game.

## 7. Content banks

`content.js`: QUIZ_E/M/H 150 each; ESTIMATE 80; LIKELY 80; CHARADES 118; SONGS 122; PICTIONARY 205; MEMSETS 12; CODEWORDS 60 (unused, kept for positions); QUESTS 60. **Append-only** (the question-bank switches identify items by position). The Longest Word dictionary is `worker/public/words.txt`. Song titles in SONGS are titles only (no lyrics).

## 8. Testing

Never run `build.sh` while chaos or break is running (a new `build.txt` reloads the pages). Kill stray servers with `for pid in $(pgrep -f "^node qa/server.mjs 871[4-9]"); do kill $pid; done` — don't `pkill -f` a pattern your own command line contains.

| harness | what it does | status at 1.0 |
|---|---|---|
| `qa/plan.py` (:8721) | every game-plan choice honoured: pool, rounds, missions a round, murder/poison wording, Ghosts off, prizes, Seer, recruit/ultimatum, side-quests, dinner, TV rules card | **new**, clean |
| `qa/smoke166.py` (:8719) | 74 rules checks | clean |
| `qa/e2e.py` (URL; `ADMIN_TOKEN` for the real Worker) | passes, rooms, isolation, PIN gate, redaction, two-screen sync, Seer, Ghosts, wipe | clean: 31 on `qa/server.mjs`, 38 on `wrangler dev` |
| `qa/claim.mjs` | Stripe claim: paid → one pass per session; unpaid → 402 | clean (Stripe stubbed) |
| `qa/chaos.py` (:8715) | random whole games through the host UI with **random game plans**, invariants (plan honoured, no "poison" in a murder game, redaction), TV overflow replay | clean: 81 games / 71k taps, 500 screens at 720p and 1080p |
| `qa/break.py part1` (:8718) | adversarial in-page scenarios + every TV screen at three sizes | clean, 130/130 (found a duplicate-name rename bug, fixed) |
| `qa/media.py`, `qa/shots.py` | screenshots for the media pack / quick looks | used for 1.0 |
| `qa/review.py`, `resilience.py`, `audit.py`, `banks.py`, `audio.py`, `gallery.py`, `live.py` | older harnesses | not re-run for 1.0; `review.py` has been stale since v16.6 |

Expiry was checked by hand under `wrangler dev` with `PASS_HOURS=0.001, KEEP_DAYS=0.0001`: writes 423 after expiry, reads still work, a used-and-expired pass is refused, the room is deleted by its alarm.

## 9. Known issues and ideas

- **Name clearance.** The working name was "Betrayal" until 28 Sep 2026; it was dropped because Hasbro/Avalon Hill sell a family of "Betrayal" hidden-traitor board games. "Cloak & Candle" had no matching US marks (Trademarkia, 28 Sep 2026) and cloakandcandle.com / .co.uk were unregistered. The one nearby mark: Mattel owns "CLOAK AND DAGGER" for toys and games (US class 28) — different second word, but get a UK IPO / EUIPO search (classes 9, 28, 41) done before launch.
- Not deployed; Stripe not tried live; no emails are sent (the pass appears on the thank-you page — a receipt email from Stripe should repeat it: add the pass to the Payment Link's custom fields/metadata or send one from the Worker).
- No terms, privacy policy or refund policy yet — needed before taking payment.
- A few crowded screens can overrun a 4:3 TV.
- Ideas: a printable guest guide in the new brand; per-mission lengths in the plan; an admin page instead of `tools/passes.sh`; bundle passes (3 parties).

## 10. A prompt to start the next session

> You're picking up "Cloak & Candle", a commercial two-screen dinner-party game (TV at /g/ROOM, host phone at /g/ROOM#host) on a Cloudflare Worker with a Durable Object per room and party passes. Read HANDOVER.md, then README.md. The code is plain JS in src/ built by build.sh; secrets for the TV are stripped in worker/src/public-view.js. Build and run `python3 qa/smoke166.py` and `python3 qa/plan.py` for a clean baseline. Make surgical changes, keep content banks append-only, keep saved games loadable across deploys, and add any new secret field to public-view.js. Test locally (and under `wrangler dev` for Worker changes), deploy to staging and run qa/e2e.py against it, then production only when I say. Never write tokens into files. Here's what I'd like changed: …
