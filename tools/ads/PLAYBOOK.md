# The daily Google Ads sweep

You're running today's Google Ads sweep for The Betrayal (https://thebetrayal.co.uk): a hidden-role party game for 8 to 24 adults, played on everyone's phone. One party is £10; a Regular is £20 a month. The market is the UK only. The only conversion that matters is **Purchase**.

Work only through `tools/ads/ads.mjs`. Don't edit, commit or push anything in the repository, and don't touch the website.

## The owner's limits

The script enforces these, and you never look for a way round them. If one gets in the way, say so in the summary.

- **Budget cap:** enabled campaigns' daily budgets add up to **£4 at most**.
- **Bids:** keyword bids and Maximise-clicks bid limits are **£2 at most**, and move **at most 20% up or down** per change.
- **Allowed changes:** a sweep may make only these:
  - `add_negative_keyword`
  - `pause_keyword`
  - `set_keyword_bid`
  - `set_cpc_ceiling`
  - `set_budget`
  - `pause_ad`
- **Proposals only:** everything else goes to the owner as a proposal, never an action. That includes:
  - enabling anything;
  - new campaigns, ads or keywords;
  - ad text;
  - bidding strategies;
  - conversion settings.
- **At most 30 changes** in one run.

## 1. Check

Run `node tools/ads/ads.mjs check`. If it fails, the whole summary is what failed and its `hint`. That could be a missing variable, an expired refresh token, or a test-only developer token. Stop there.

## 2. Report

1. Run `node tools/ads/ads.mjs report --out /tmp/ads-report.json`, then read the file.
2. Start with `alerts` and `errors`. An entry in `errors` is a query Google refused, perhaps because a field changed in a new API version. Mention it and carry on with the rest.
3. Money is in pounds.
4. `changes` is the account's change history for the last 14 days, including your own earlier sweeps, shown as "sweep (API)".

## 3. Decide

At £4 a day there's a handful of clicks a day, so act only on clear evidence. Don't move a bid, bid limit or budget that was changed in the last 3 days (see `changes`), unless an alert says it must be fixed.

**Fix first**
- **Over the cap:** if budgets add up to more than £4, cut the largest ones until the total is £4 or less.
- **Disapproved ad:**
  - If another ad in its group is still enabled, pause the disapproved ad, and tell the owner which policy it broke so they can rewrite it.
  - If it's the group's only ad, propose a fix instead.

**Wasted spend** (search terms, last 14 days; up to 10 negatives a day, costliest first)
- Add a negative for a search that plainly can't become a purchase:
  - watching the TV show (bbc, iplayer, episode, cast, series, season, watch, stream, winner, contestant);
  - jobs and careers;
  - free printables or downloads;
  - apps;
  - buying a physical board game from a shop;
  - other products or places;
  - anything that isn't about hosting a game.
- Use PHRASE match for the telling word or phrase ("iplayer", "cast list"). Use EXACT for a whole odd query.
- Never add a negative for words the product's own searches rely on: party, game, games, games night, hidden role, murder mystery, mafia, werewolf, traitors (as in "traitors game at home"), christmas, office, adults, group, friends. The script also refuses a negative that would block one of the campaign's own keywords.

**Keywords** (last 30 days)
- **Pause:** a keyword that has cost £10 or more with no purchase. That's the price of one party. If it's its ad group's only enabled keyword, propose instead.
- **Manual bids up:** with a purchase at under £6 a sale, raise the bid 10 to 20%.
- **Manual bids down:** with 15 or more clicks and no purchase, lower it 20%.
- Otherwise, leave it.

**Maximise clicks bid limit** (last 7 days)
- **Raise it 10 to 20%** when the campaign spent less than 70% of its budget and its average cost per click (cost ÷ clicks) is at least 90% of the limit.
- **Lower it 10 to 20%** when it spent its whole budget with no purchase in 30 days.

**Budgets** (always within £4)
- Move up to £1 a day from one campaign to another when both hold:
  - the receiving campaign is spending its whole budget and getting purchases;
  - the giving campaign has spent £10 or more in 30 days with none.
- List the cut before the rise, because the script checks changes in order.
- If campaigns are held back by their budgets and selling at under £10 a sale, propose a higher cap to the owner.

**Propose to the owner, don't do**
- **Bidding strategy:** 15 or more purchases in 30 days on a campaign means it's ready for Maximise conversions (or a target cost per sale of about £6).
- **Tracking:**
  - the Purchase conversion isn't enabled and primary;
  - auto-tagging is off;
  - more than £20 spent over 7 days with no purchases at all, which means tracking needs a check (a 100% discount-code test purchase, or Tag Assistant).
- **No activity:** a campaign with almost no impressions needs its keywords or ads looked at.

## 4. Apply

If there's nothing to change, skip this step.

1. Write the changes to `/tmp/ads-changes.json` as a list, each with a short `why`:

   ```json
   [
     {"op": "set_budget", "campaignId": "123", "budget": 1.5, "why": "…"},
     {"op": "add_negative_keyword", "campaignId": "123", "text": "iplayer", "match": "PHRASE", "why": "…"},
     {"op": "pause_keyword", "adGroupId": "456", "criterionId": "789", "why": "…"},
     {"op": "set_keyword_bid", "adGroupId": "456", "criterionId": "789", "bid": 0.6, "why": "…"},
     {"op": "set_cpc_ceiling", "campaignId": "123", "ceiling": 0.9, "why": "…"},
     {"op": "pause_ad", "adGroupId": "456", "adId": "321", "why": "…"}
   ]
   ```

2. Run `node tools/ads/ads.mjs apply /tmp/ads-changes.json`. That's a dry run: Google validates the changes and changes nothing. Read each result.
3. Then run it again with `--live`.
4. A `rejected` change was stopped by the owner's limits. A `failed` one was refused by Google. Don't retry either in another form.

## 5. Summary

Your last message is sent to the owner. Keep it short and in plain English, with no tables and under 15 lines.

1. **Headline:** "Yesterday: £X of £4 spent, N clicks, N sales. Last 7 days: £X, N sales (£X a sale)."
2. **Changes made:** one line each, with why. Or "No changes", with the reason.
3. **Needs you:** each proposal or alert, one line each.
4. **Problems:** report parts or changes that failed, only if there were any.
