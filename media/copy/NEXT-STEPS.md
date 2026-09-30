# Before The Betrayal goes public

> The game, the site, the screenshots and the ads are ready. Still to do by hand: 1 to 5 below.

1. **Domain.** thebetrayal.co.uk is registered with Cloudflare nameservers. Confirm it’s in your account; the QR card and every ad point to it. Keep cloakandcandle.co.uk and redirect it to thebetrayal.co.uk.
2. **Stripe, in the Dashboard (test mode and live mode are separate: do both).**
   - **Product names.** Customers see them at checkout and on receipts:
     - the £10 one-off price: **The Betrayal — a Table (one party)**
     - the £20 monthly price: **The Betrayal — Regular (monthly)**
   - **Statement descriptor:** set it so bank statements read The Betrayal.
   - **Tax codes:** with Managed Payments on, both products need an eligible tax code.
   - **Webhook** at `https://thebetrayal.co.uk/api/stripe/webhook`, subscribed to all of these:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `checkout.session.async_payment_failed`
     - `checkout.session.expired`
     - `payment_intent.payment_failed` (a card refused at checkout shows as Payment failed in the admin)
     - `invoice.payment_failed` (a Regular’s refused renewal is noted on their booking code)
     - `charge.refunded`
     - `refund.created`
     - `refund.updated`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Then a live test: buy a Table, open it, refund it, and check the admin shows each step.
3. **Business details.** The site, legal pages and press kit point to the contact form (thebetrayal.co.uk/contact) instead of a name, address or email. When you have a business name, address and email, add them to the terms, privacy notice and contact page (UK consumer law expects your name and a geographic address before you sell to the public).
4. **Discount codes and the checkout question.** Outreach template 4 offers guests a discount code, and the ad set-up notes suggest a “How did you hear about us?” question at checkout. Checkout applies one promotion code automatically (the broken seal: 10% off one party, code QR10, `STRIPE_EGG_PROMO` in `wrangler.toml`), but it has no box for buyers to type a code, and no extra fields. Check the first real seal purchase shows the discount (if Stripe refuses it, the buyer pays full price and the admin error log says why). Template 4’s guest code and the “How did you hear about us?” question still need another route: decide before sending template 4.
5. **Launch.** The site is still behind the pre-launch password. When you’re ready, it comes off with one change (remove `SITE_PASSWORD`).
