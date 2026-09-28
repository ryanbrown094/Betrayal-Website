# Before The Betrayal goes public

> **Status, 28 September 2026:** step 3 (the game renamed) and step 4 (new screenshots) are done and live on thebetrayal.co.uk once deployed. The Worker keeps its internal name on purpose (renaming it would wipe every pass and room); customers never see it. Still to do by hand: 1 (trade mark), 2 (confirm the domain is attached in Cloudflare), the Stripe product names and statement descriptor, the Stripe webhook URL, and 5 (placeholders).

1. **Trade mark check. Do this before anything is published.** Search "BETRAYAL" on the UK IPO's free trade mark search in classes 9, 28 and 41, and look for Hasbro / Avalon Hill's Betrayal range in particular. If "BETRAYAL" is registered on its own in class 28, stop and take advice before launching under this name. If it's clear, consider filing "THE BETRAYAL" yourself: £205 online for one class, £60 for each extra.
2. **Domain.** thebetrayal.co.uk was registered on 28 September 2026 with Cloudflare nameservers. Confirm it's yours; the QR card and every ad point to it. thebetrayal.com is registered to someone else. Keep cloakandcandle.co.uk and redirect it to the new domain.
3. **Rename the game itself.** Every screen, TV script and host line still says Cloak & Candle, Cloaks and Candles. Move them to the vocabulary in `02-words/glossary-and-naming.md`:
   - roles: Cloaks → the Forsworn, Candles → the Loyal
   - the host → the Keeper
   - missions → Trials
   - the mingle → the Interval
   - shield / blade / Champion → Sanctuary / the Casting Vote / the Crown
   - the Dilemma → the Temptation (POT/SHIELD becomes PURSE/SANCTUARY)
   - Conversion / the Bargain → the Whisper / the Last Offer
   - side-quests → Errands
   - the pot → the Purse
   - End or Exile → Trust or Doubt
   - share or take → Honour or Betray
   - the ceremony → the Unmasking
   - add the Sacrament as the name of the opening oath scene
   - rename the awards
   - rename the Worker, change the site copy and the Stripe product names
4. **New screenshots.** Once the game is renamed, regenerate the TV and phone screenshots (`qa/media.py`) and add screenshot-based ads alongside the drawn ones. The drawn ads in `04-launch/ads/` work until then.
5. **Placeholders.** Fill `[name]`, `[email]` and `[town]` in `02-words/press-kit.md` and on the last page of the guidelines (`tools/make_guidelines.py`, then rebuild). A `hello@thebetrayal.co.uk` address via Cloudflare Email Routing is free.
6. **Launch plan.** The 4-week plan doc still says Cloak & Candle. Its steps and budget don't change, only the names.
