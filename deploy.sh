#!/bin/sh
# ./deploy.sh staging     → staging.cloakandcandle.co.uk (test here first)
# ./deploy.sh production  → cloakandcandle.co.uk (customers). Pushing to GitHub also deploys production, if the
#                           Cloudflare Git integration is connected (it runs `npx wrangler deploy` at the repo root).
# Needs CLOUDFLARE_API_TOKEN in the environment (never in a file). Deploys do NOT wipe games: every party has its own
# room, and a phone on the old build just reloads onto the new one. So never change the saved-game shape (SCHEMA in
# src/core.js) in a way an in-progress game can't load — add fields with defaults instead (see HANDOVER §6).
set -e
cd "$(dirname "$0")"
case "$1" in
  staging) CFG=wrangler.staging.toml ;;
  production) CFG=wrangler.toml ;;
  *) echo "usage: ./deploy.sh staging|production" >&2; exit 1 ;;
esac
./build.sh
[ -d node_modules ] || npm i --silent
npx wrangler deploy -c "$CFG" --var "BUILD:$(cat worker/public/build.txt)"
