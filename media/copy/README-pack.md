# The Betrayal: marketing pack

Everything about the game and the brand, in one place, for building ads, social posts, a press release, a store listing or a pitch. Start with **01-game/game-guide-INTERNAL.md** to understand the game, then **02-brand/The-Betrayal-Brand-Guidelines.pdf** for how it should look.

> **The words rule.** Public material uses only the public words: the Forsworn, the Loyal, the Keeper, the Oath, Trial, the Reckoning, Sanctuary, the Purse, Ghost and the Unmasking, plus plain words like exile, night, dawn, dinner and the Interval. Every other game word is one of the “twists the TV explains when they happen”. The internal game guide names and explains them all; `01-game/glossary-and-naming.md` has both lists, and the “was → now” list of what changed on 29 September 2026.

| folder | what’s in it |
|---|---|
| `01-game/game-guide-INTERNAL.md` | the whole game, start to finish: roles, a round step by step, powers, twists, the end game, awards, the product and pricing, what never to say |
| `01-game/setup-guide.md` | the Keeper’s five questions and PIN, the first game (Classic), and every choice under Customise |
| `01-game/table-sizes.csv` | for 8 to 24 players: Forsworn, rounds, who’s left after each round, estimated length, when the Casting Vote and Crown appear |
| `01-game/trials.csv` | the 15 Trials and the Temptation add-on: rules, what the room needs, whether they carry a prize |
| `01-game/question-banks.md` | how many questions and prompts each game draws on, with samples |
| `01-game/glossary-and-naming.md` | the name, the two tiers of game words, capitalisation, honest length, marks and type, voice, and words to never use |
| `02-brand/` | brand guidelines (PDF); logos: the primary mark, wordmark and lockups in six colours, and the secondary mark, the cracked wax seal (“the broken oath”), in full colour and in rose, ivory and ink (SVG and PNG); palette (swatches, CSS, JSON, GIMP/Inkscape); fonts (web files, licence, where to get the full families); app icons (the seal) |
| `03-copy/press-kit.md` | taglines, calls to action, one-line / short / long descriptions, key facts, feature bullets, boilerplate |
| `03-copy/website-copy.md` | every word on the public site: home page, FAQ, How to play, the screenshot tour |
| `04-screenshots/tv/` | the TV at 1920 × 1080, from a real game, in running order |
| `04-screenshots/phone/` | the Keeper’s phone at 1170 × 2532: setup pages, the round screen, a Trial brief |
| `04-screenshots/web-sized/` | the same, compressed for the web (TV 1280 × 720, phone 780 wide) |
| `05-social/` | link preview (1200 × 630), square post (1080 × 1080), story (1080 × 1920), a profile avatar (the seal, 1080 × 1080), and the hero image of the TV |
| `06-launch/` | four Meta ads (feed and story sizes), the A6 “You survived” table card with a QR code, ad copy, six short-video scripts, outreach templates and a 28-day content calendar |
| `NEXT-STEPS.md` | what has to happen before The Betrayal goes public |

## Key facts at a glance

- **Best with 8 to 16 players**, plus a Keeper; the game takes 8 to 24. The host can play, with a friend keeping.
- **About 3 to 4 hours** with dinner for 8 to 12 players. **The Short game:** about 2 hours for 8 to 10. Bigger tables run longer (about 6 hours for 20 or more).
- **Book a Table:** £15, one party. **Become a Regular:** £20 a month, a new Table whenever you like, one at a time.
- A TV with a laptop, the Keeper’s phone, a blindfold and a small chalkboard per guest. No app, no accounts, guests need no phones.
- Five questions to set up. The first game is Classic; the twists wait for the second night.

Screenshots use invented names; the TV title and Keeper name can be anything.

Rebuild this pack from the repo with `./build.sh && python3 tools/marketing-pack.py` (it takes the rules and numbers from the game itself, so they always match what customers play). Screenshots are regenerated with `qa/media.py` and `tools/webshots.py`; the ads, social images, print card and brand guidelines with `tools/brand/make_creatives.py` and `tools/brand/make_guidelines.py`.
