# The Betrayal — media

Everything you need to write about, sell or show The Betrayal.

**Modern first.** The Betrayal is sold as a game everyone plays on their own phone (guests scan the QR code on the TV or go to thebetrayal.co.uk/join; the host plays too; no blindfolds, no chalkboards, no Keeper; the TV is optional). Classic, with one phone, a Keeper, blindfolds and chalk, is the secondary option. Lead with Modern in everything you make; the vocabulary rules are in `copy/glossary.md`.

| folder | what's in it |
|---|---|
| `The-Betrayal-Brand-Guidelines.pdf` | the mark, lockups, clear space, colour, type, voice — read this first |
| `logos/` | the mark, the wordmark, horizontal and stacked lockups, each in rose-gold, rose, ivory, ink, black and white — SVG (outlined, no fonts needed) and transparent PNG (2400 px). Plus the secondary mark, the cracked wax seal (“the broken oath”): `the-betrayal-seal.svg/.png` in colour and one-colour `-mono-` versions, made by `tools/brand/make_seal.py` |
| `web/tour-modern-*`, `web/hero-modern.jpg` | Modern: a player’s phone (the lobby, a secret role, a quiz, the vote, the night) and the TV (the join screen with its QR code, a quiz, a reveal), made by `tools/modern-shots.py`; the hero shows the TV’s QR code with three phones |
| `screenshots/` | Classic: the TV at 1920 × 1080 (JPEG) and the Keeper’s phone at 1170 × 2532 (PNG), from a real game |
| `social/` | link preview (1200 × 630), square post (1080 × 1080), story (1080 × 1920), and an avatar (the seal) for profile pictures |
| `palette/` | swatch image, CSS variables, JSON and a GIMP/Inkscape palette |
| `copy/press-kit.md` | name, taglines, descriptions (one line, short, long), key facts, feature bullets, boilerplate |
| `launch/` | four Meta ads (feed and story), the A6 table card with a QR code, ad copy, six short-video scripts, outreach templates and a 28-day content calendar; the ads are made by `tools/brand/make_creatives.py` |
| fonts | not stored here: `python3 tools/marketing-pack.py` builds the full marketing pack (fonts with their licence, the game guide, data sheets and everything in this folder) into `dist/The-Betrayal-Marketing-Pack.zip` |

Rose-gold on dark plum is the hero combination. Use ink on light grounds. Please don't recolour, stretch or retype the logo, and don't pair The Betrayal with the name, logo or imagery of any TV programme.

Replace the `[name] · [email] · [domain]` placeholders in `copy/press-kit.md` before sending.
