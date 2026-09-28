# The Betrayal

A hosted dinner-party game for 8–24 players. The TV (a laptop cast to it) runs the show; the Keeper's phone runs the game.
Sold as a **Invitation**: one pass opens one room for 48 hours. Many parties play at once, each in its own room.

- Home page: `https://cloakandcandle.co.uk/` — buy a pass, open a room, join a room on the TV
- A room: `https://cloakandcandle.co.uk/g/ROOMCD` (TV) and `…/g/ROOMCD#host` (Keeper phone)
- Staging: `https://staging.cloakandcandle.co.uk/`

Read `HANDOVER.md` before changing anything.

## Layout

```
src/            the game page, split by job — build.sh concatenates it into one file (no framework, no bundler)
  content.js    mission definitions and content banks (append-only)
  scripts.js    every host line and the night / ceremony scripts
  core.js       store and sync, rooms, the game plan (RULES0, planMissions, autoPrize, autoMode), every rule
  audio.js      synthesised sound and the adaptive score
  art.js        every drawing (inline SVG), including the Cloak & Candle mark (ART.crest)
  tv.js         the TV renderer
  host.js       the host phone: the game-plan setup, then every phase
  boot.js       startup, build auto-reload, wake lock
  style.css, fonts.css
site/index.html the home page (sell, redeem a pass, join a room, claim after checkout)
worker/         Cloudflare Worker: src/index.js (router, GameState room object, Registry pass object), src/codes.js,
                src/rules.js (save rules), src/public-view.js (what the TV may see), (config: wrangler.toml / wrangler.staging.toml at the repo root)
media/          brand: logos (tools/brand.py), screenshots (qa/media.py), social, palette, copy, guidelines source
tools/          brand.py (logo files), mediapack.py (guidelines PDF + media pack zip), icons.py, passes.sh (admin), recolour.py
qa/             test harnesses (see HANDOVER §8)
```

## Build, test, run locally

```sh
./build.sh                                   # → index.html (standalone game), worker/public/{play.html,index.html,media/,build.txt}
python3 qa/smoke166.py                       # rules checks (own server) — ~3 min
python3 qa/plan.py                           # the game plan: every setup choice honoured — ~1 min
node qa/claim.mjs                            # Stripe claim path, stubbed
node qa/server.mjs 8714 & python3 qa/e2e.py  # sync, PIN, redaction, whole-game flow (single default room)

# the real Worker, rooms and passes included:
npm i && npx wrangler dev --port 8790 --var ADMIN_TOKEN:dev --var SITE_PASSWORD: --var BUILD:$(cat worker/public/build.txt)
ADMIN_TOKEN=dev python3 qa/e2e.py http://127.0.0.1:8790/     # 38 checks: passes, rooms, isolation + the game
BASE=http://127.0.0.1:8790 ADMIN_TOKEN=dev tools/passes.sh mint 3 "testing"
```

## Deploy

```sh
CLOUDFLARE_API_TOKEN=… ./deploy.sh staging
ADMIN_TOKEN=… python3 qa/e2e.py https://staging.cloakandcandle.co.uk/
CLOUDFLARE_API_TOKEN=… ./deploy.sh production
```

Deploys don't wipe games. Once, per environment: `npx wrangler secret put ADMIN_TOKEN -c wrangler.toml`
(and `STRIPE_SECRET_KEY` when payments are live).

## Selling passes

- **By hand:** `tools/passes.sh mint 10 "launch friends"` prints codes (`CNDL-XXXX-XXXX`). Send one per party.
- **Stripe Checkout** (the `/buy` page): once per environment, run
  `STRIPE_SECRET_KEY=sk_… tools/stripe-setup.sh https://<domain> <price-in-pence>`. It creates the product, the price
  and the webhook endpoint. Put the printed `price_…` in `STRIPE_PRICE_ID` in that environment's wrangler `.toml`, then
  `npx wrangler secret put STRIPE_SECRET_KEY` and `… STRIPE_WEBHOOK_SECRET` (the printed `whsec_…`). Show the price in
  `SHOP` (home page) and `BUY` (`site/pages/buy.html`). Test keys on staging, live keys on production.
  The buyer ticks the two consent boxes, pays on Stripe, and comes back to the home page with their pass on screen.
  Stripe's emailed invoice/receipt carries the pass too. See HANDOVER §6.2.
- `tools/passes.sh list` shows every pass, whether it was redeemed, its room and when it runs out; `revoke` cancels one.

## The domain, GitHub and the password gate

- **Domain:** `cloakandcandle.co.uk` (and `www.`) is the production Worker's custom domain in `wrangler.toml`; staging is `staging.cloakandcandle.co.uk`. Cloudflare creates the DNS records on the first deploy.
- **GitHub → Cloudflare:** with the repo connected to the Worker (Workers & Pages → the Worker → Settings → Build), every push to `main` runs `npx wrangler deploy` at the repo root. The built pages in `worker/public` are committed, so **run `./build.sh` before you commit** — Cloudflare does not run it. The Worker's name in Cloudflare must match `name` in `wrangler.toml` (`cloak-and-candle`).
- **Password gate (pre-launch):** `SITE_PASSWORD` in `wrangler.toml` [vars] locks every page, asset and API call behind a password page (a 30-day cookie once it's entered). `/api/admin/*` skips it (it has its own token). Delete the line and deploy to open the site. The password is visible to anyone who can read the repo — keep the repo private.
