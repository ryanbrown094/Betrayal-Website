# The Betrayal: marketing pack

Everything about the game and the brand, in one place, for building ads, social posts, a press release, a store listing or a pitch. Start with **01-game/game-guide-INTERNAL.md** to understand the game, then **02-brand/The-Betrayal-Brand-Guidelines.pdf** for how it should look.

> **Spoiler rule.** The internal game guide explains every secret, including the Confessor. Public material must follow the website's rules (`03-copy/website-copy.md`) and only ever call it "a secret role" or "a special prize".

| folder | what's in it |
|---|---|
| `01-game/game-guide-INTERNAL.md` | the whole game, start to finish: roles, a round step by step, powers, twists, the end game, awards, the product and pricing, what never to say |
| `01-game/setup-guide.md` | every choice the Keeper makes at setup, with the recommendation and how it adapts |
| `01-game/table-sizes.csv` | for 8 to 24 players: Forsworn, rounds, who's left after each round, estimated length, when the Casting Vote and Crown appear |
| `01-game/missions.csv` | the 15 Trials and the Temptation: rules, what the room needs, whether they carry a prize |
| `01-game/question-banks.md` | how many questions and prompts each game draws on, with samples |
| `01-game/glossary-and-naming.md` | the name, game words and capitalisation, voice, and words to never use |
| `02-brand/` | brand guidelines (PDF); logos (mark, wordmark, lockups in six colours, SVG and PNG); palette (swatches, CSS, JSON, GIMP/Inkscape); fonts (web files, licence, where to get the full families); app icons |
| `03-copy/press-kit.md` | taglines, one-line / short / long descriptions, key facts, feature bullets, boilerplate |
| `03-copy/website-copy.md` | every word on the public site: home page, FAQ, How to play, the screenshot tour |
| `04-screenshots/tv/` | the TV at 1920 × 1080, from a real game, in running order |
| `04-screenshots/phone/` | the Keeper's phone at 1170 × 2532: setup pages, the round screen, a Trial brief |
| `04-screenshots/web-sized/` | the same, compressed for the web (TV 1280 × 720, phone 780 wide) |
| `06-launch/` | four Meta ads (feed and story sizes), the A6 "You survived" table card with a QR code, ad copy, six short-video scripts, outreach templates and a 28-day content calendar |
| `NEXT-STEPS.md` | what has to happen before The Betrayal goes public (trade mark check first) |
| `05-social/` | link preview (1200 × 630), square post (1080 × 1080), story (1080 × 1920), and the hero image of the TV |

Key facts at a glance: **8–24 players** (best 10–16) plus a Keeper · **about 3¼–4¼ hours** for 8–12 players, longer for bigger tables · **£15** a party, or **£20 a month** for unlimited games · a TV with a laptop, the Keeper's phone, a blindfold and a small chalkboard per guest · no app, no accounts, guests need no phones.

Before sending anything out, replace `[name]`, `[email]` and `[town]` in `03-copy/press-kit.md`. Screenshots use invented names; the TV title and Keeper name can be anything.

Rebuild this pack from the repo with `./build.sh && python3 tools/marketing-pack.py` (it takes the rules and numbers from the game itself, so they always match what customers play). Screenshots are regenerated with `qa/media.py` and `tools/webshots.py`.
