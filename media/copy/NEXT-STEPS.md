# Before The Betrayal goes public

> **Status, 29 September 2026:** the rename from Cloak & Candle and the new screenshots are done. On 29 September the product words changed again (see “was → now” in `01-game/glossary-and-naming.md`): an Invitation is now **a Table** (Book a Table) with a **booking code**, a Standing Invitation is now **a Regular** (Become a Regular), and the Sacrament is now **the Oath**. The game, the site and this pack move to them together. Still to do by hand: 1 (trade mark), 2 (confirm the domain in Cloudflare), 3 (Stripe), 5 (business details) and 6 (the launch plan).

1. **Trade mark check. Do this before anything is published.** Search “BETRAYAL” on the UK IPO’s free trade mark search in classes 9, 28 and 41, and look for Hasbro / Avalon Hill’s Betrayal range in particular. If “BETRAYAL” is registered on its own in class 28, stop and take advice before launching under this name. If it’s clear, consider filing “THE BETRAYAL” yourself: £205 online for one class, £60 for each extra.
2. **Domain.** thebetrayal.co.uk was registered on 28 September 2026 with Cloudflare nameservers. Confirm it’s yours; the QR card and every ad point to it. thebetrayal.com is registered to someone else. Keep cloakandcandle.co.uk and redirect it to the new domain.
3. **Stripe, in the Dashboard (test mode and live mode are separate: do both).**
   - **Product names.** Customers see them at checkout and on receipts:
     - the £15 one-off price: **The Betrayal — a Table (one party)**
     - the £20 monthly price: **The Betrayal — Regular (monthly)**
   - **Statement descriptor:** make bank statements read The Betrayal, not Cloak & Candle.
   - **Tax codes:** with Managed Payments on, both products need an eligible tax code.
   - **Webhook** at `https://thebetrayal.co.uk/api/stripe/webhook`, subscribed to all of these:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
     - `payment_intent.payment_failed` (new: a card refused at checkout shows as Payment failed in the admin)
     - `invoice.payment_failed` (new: a Regular’s refused renewal is noted on their booking code)
     - `charge.refunded`
     - `refund.created`
     - `refund.updated`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - `tools/stripe-setup.sh` still names the product “Cloak & Candle party pass” and leaves out the two new events. If you use it for a new environment, rename the product and add the events in the Dashboard afterwards.
4. **New screenshots.** Once the game shows the 29 September words (the Oath, the Table, booking codes, the Short game, dinner in courses), regenerate the TV and phone screenshots (`qa/media.py`) and add screenshot-based ads alongside the drawn ones. The drawn ads in `06-launch/ads/` are up to date.
5. **Business details.** Removed for now: the site, legal pages and press kit point to the contact form (thebetrayal.co.uk/contact) instead of a name, address or email. When you have a business name, address and email, add them to the terms, privacy notice and contact page (UK consumer law expects your name and a geographic address before you sell to the public).
6. **Launch plan.** The 4-week plan doc still says Cloak & Candle and Invitation. Its steps and budget don’t change, only the names: The Betrayal, Book a Table, Become a Regular.
7. **Discount codes and the checkout question.** Outreach template 4 offers guests a discount code, and the ad set-up notes suggest a “How did you hear about us?” question at checkout. Checkout runs with Managed Payments, which carries no promotion codes or extra fields. Decide how to handle both before sending template 4.
