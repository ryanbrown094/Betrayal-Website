#!/bin/sh
# One-time Stripe setup for an environment: creates the party pass product and its price, and the webhook endpoint the
# Worker listens on. (The monthly subscription's price is made by hand in the Dashboard: recurring, monthly.) Prints the Price ID (for STRIPE_PRICE_ID in wrangler*.toml) and the webhook signing secret (for
# `npx wrangler secret put STRIPE_WEBHOOK_SECRET`). The key comes from the environment and is never written anywhere.
#
#   STRIPE_SECRET_KEY=sk_test_… tools/stripe-setup.sh https://staging.thebetrayal.co.uk 1500
#   STRIPE_SECRET_KEY=sk_live_… tools/stripe-setup.sh https://thebetrayal.co.uk 1500
#
# The price is in pence (1500 = £15.00). Run it once per key (test mode and live mode are separate in Stripe).
set -e
BASE=${1:?usage: STRIPE_SECRET_KEY=… $0 <site-url> <price-in-pence>}
PENCE=${2:?usage: STRIPE_SECRET_KEY=… $0 <site-url> <price-in-pence>}
: "${STRIPE_SECRET_KEY:?set STRIPE_SECRET_KEY in the environment}"
api() { path=$1; shift; curl -sS --fail-with-body https://api.stripe.com/v1/"$path" -u "$STRIPE_SECRET_KEY:" "$@"; }

product=$(api products -d name="Cloak & Candle party pass" \
  -d description="One game room for one party of 8 to 24 players, open for 48 hours from first use." | jq -r .id)
price=$(api prices -d product="$product" -d currency=gbp -d unit_amount="$PENCE" -d tax_behavior=inclusive | jq -r .id)
hook=$(api webhook_endpoints -d url="$BASE/api/stripe/webhook" \
  -d "enabled_events[]=checkout.session.completed" -d "enabled_events[]=checkout.session.async_payment_succeeded" \
  -d "enabled_events[]=checkout.session.async_payment_failed" -d "enabled_events[]=checkout.session.expired" \
  -d "enabled_events[]=charge.refunded" -d "enabled_events[]=refund.created" -d "enabled_events[]=refund.updated" -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" -d "enabled_events[]=customer.subscription.deleted" \
  -d description="Cloak & Candle passes")
echo "product:          $product"
echo "STRIPE_PRICE_ID:  $price        (put it in the wrangler .toml for this environment)"
echo "webhook endpoint: $(echo "$hook" | jq -r .id) → $BASE/api/stripe/webhook"
echo "webhook secret:   $(echo "$hook" | jq -r .secret)"
echo "  → npx wrangler secret put STRIPE_WEBHOOK_SECRET -c <the environment's wrangler .toml>   (paste the secret above)"
