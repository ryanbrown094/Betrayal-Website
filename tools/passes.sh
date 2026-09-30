#!/bin/sh
# Booking codes, from the command line. Needs ADMIN_TOKEN (the Worker secret) in the environment.
#   tools/passes.sh mint 5 "gift for Annie"      → five new booking codes
#   tools/passes.sh list                          → every code: made, redeemed, which room, when it runs out
#   tools/passes.sh revoke OATH-XXXX-XXXX         → cancel a code (refunds, mistakes)
# BASE defaults to production; BASE=https://staging.thebetrayal.co.uk for staging, http://127.0.0.1:8790 for wrangler dev.
set -e
BASE=${BASE:-https://thebetrayal.co.uk}
[ -n "$ADMIN_TOKEN" ] || { echo "set ADMIN_TOKEN" >&2; exit 1; }
AUTH="Authorization: Bearer $ADMIN_TOKEN"
case "$1" in
  mint) curl -fsS -X POST "$BASE/api/admin/passes" -H "$AUTH" -H "Content-Type: application/json" -d "{\"count\":${2:-1},\"note\":\"${3:-}\"}" ;;
  list) curl -fsS "$BASE/api/admin/passes" -H "$AUTH" ;;
  revoke) curl -fsS -X POST "$BASE/api/admin/revoke" -H "$AUTH" -H "Content-Type: application/json" -d "{\"pass\":\"$2\"}" ;;
  *) echo "usage: tools/passes.sh mint [n] [note] | list | revoke CODE" >&2; exit 1 ;;
esac
echo
