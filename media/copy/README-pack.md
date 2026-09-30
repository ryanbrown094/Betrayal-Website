# The Betrayal: marketing pack

Everything about the game and the brand, in one place, for building ads, social posts, a press release, a store listing or a pitch. Start with **01-game/game-guide-INTERNAL.md** to understand the game, then **02-brand/The-Betrayal-Brand-Guidelines.pdf** for how it should look.

> **Modern first.** The Betrayal is sold as a game everyone plays on their own phone: guests scan the QR code on the TV or go to thebetrayal.co.uk/join, and the Oath, roles, Trials, votes and nights are all on phones. Everyone plays, the host included. There are no props and no Keeper, and the TV is optional. **Classic** (a TV and laptop, the phone of a Keeper who doesn’t play, blindfolds and chalkboards) is the other way to play, for groups who’d rather put their phones away. Lead every piece with Modern.

> **The words rule.** Public material uses only the public words: the Forsworn, the Loyal, the Oath, Trial, the Reckoning, Sanctuary, the Purse, Ghost, the Unmasking, and the Keeper (Classic only), plus plain words like the host, exile, night, dawn, dinner and the Interval. Every other game word is one of the “twists the game explains when they happen”. The internal game guide names and explains them all; `01-game/glossary-and-naming.md` has both lists and the words never to use.

| folder | what’s in it |
|---|---|
| `01-game/game-guide-INTERNAL.md` | the whole game, start to finish, as Modern plays it: roles, a round step by step, powers, twists, the end game, awards, the product and pricing, what never to say; then a clearly marked section on what’s different in Classic |
| `01-game/setup-guide.md` | Modern first: book, open your Table, choose Modern, type your name, share the code or QR, Start, and the host’s choices. Then Classic: the Keeper’s five questions and PIN, the first game, and every choice under Customise |
| `01-game/table-sizes.csv` | for 8 to 24 players: Forsworn, rounds, who’s left after each round, estimated length, when the Casting Vote and Crown appear. Taken from Classic’s planner; Modern deals the same number of Forsworn and plans its own rounds to the same shape (the final starts with five) |
| `01-game/trials-modern.csv` | the 15 Trials and the Temptation as they’re played on phones in Modern: rules, whether they carry Sanctuary |
| `01-game/trials.csv` | the 15 Trials and the Temptation add-on in Classic: rules, what the room needs, whether they carry a prize |
| `01-game/question-banks.md` | how many questions and prompts each game draws on, with samples |
| `01-game/glossary-and-naming.md` | the name, the two tiers of game words, capitalisation, honest length, marks and type, voice, and the words never to use (with what to say instead) |
| `02-brand/` | brand guidelines (PDF); logos: the primary mark, wordmark and lockups in six colours, and the secondary mark, the cracked wax seal (“the broken oath”), in full colour and in rose, ivory and ink (SVG and PNG); palette (swatches, CSS, JSON, GIMP/Inkscape); fonts (web files, licence, where to get the full families); app icons (the seal) |
| `03-copy/press-kit.md` | taglines (the descriptor: “The party game of loyalty and lies”), calls to action, one-line / short / long descriptions, key facts, feature bullets, boilerplate |
| `03-copy/website-copy.md` | every word on the public site: home page, FAQ, How to play, the screenshot tour |
| `04-screenshots/modern/` | Modern: a player’s phone (780 wide: the lobby, a secret role, a quiz, the vote, the night) and the TV (1280 × 720: the join screen with its QR code, a quiz, a reveal) |
| `04-screenshots/classic/tv/` | Classic: the TV at 1920 × 1080, from a real game, in running order |
| `04-screenshots/classic/phone/` | Classic: the Keeper’s phone at 1170 × 2532: setup pages, the round screen, a Trial brief |
| `04-screenshots/classic/web-sized/` | the Classic screens, compressed for the web (TV 1280 × 720, phone 780 wide) |
| `05-social/` | link preview (1200 × 630), square post (1080 × 1080), story (1080 × 1920), a profile avatar (the seal, 1080 × 1080), the Modern hero image (the TV’s QR code with three phones) and a Classic TV image |
| `06-launch/` | four Meta ads (feed and story sizes), the A6 “You survived” table card with a QR code, ad copy, six short-video scripts, outreach templates and a 28-day content calendar |
| `NEXT-STEPS.md` | what has to happen before The Betrayal goes public |

## Key facts at a glance

- **Everyone plays on their own phone (Modern).** Guests scan the QR code on the TV, or go to thebetrayal.co.uk/join and type the Table code and their name. Everyone plays, the host included; the host’s phone also moves the evening on.
- **Best with 8 to 16 players**; the game takes 8 to 24.
- **About 3 to 3½ hours** for 8 to 12 players; stopping for dinner adds half an hour to an hour. Bigger tables run longer (about 4¼ hours for 16, and 5 to 6 for 20 and up).
- **Book a Table:** £10, one party. **Become a Regular:** £20 a month, a new Table whenever you like, one at a time.
- **You need** a phone each and a prize (a box of chocolates, unless the host sets their own). A TV is optional. No app, no accounts, no props.
- **Setup:** open your Table, choose Modern, type your name, share the code, Start. The game plans its own Trials and Reckonings, and, if the host switches dinner in courses on, when each course is served.
- **Classic**, for groups who’d rather put their phones away: a TV with a laptop, the Keeper’s phone, and a blindfold and small chalkboard per guest. The Keeper doesn’t play (a friend can keep so the host can). Five questions to set up; a first game keeps the twists for the second night, and there’s a Short game of about 2 hours for 8 to 10.

Screenshots use invented names; the TV title and player names can be anything.

Rebuild this pack from the repo with `./build.sh && python3 tools/marketing-pack.py` (it takes the rules and numbers from the game itself, so they always match what customers play). Screenshots are regenerated with `tools/modern-shots.py` (Modern), and `qa/media.py` and `tools/webshots.py` (Classic); the ads, social images, print card and brand guidelines with `tools/brand/make_creatives.py` and `tools/brand/make_guidelines.py`.
