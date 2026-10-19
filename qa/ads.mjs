// The Google Ads sweep's script (tools/ads/ads.mjs) against a stubbed Google Ads API: signing in, Google's errors, the
// report, and every limit a change must pass. node qa/ads.mjs
import { client, report, apply, LIMITS, VERSION, AdsError } from "../tools/ads/ads.mjs";
let ok = true;
const check = (name, cond, extra) => { console.log((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra).slice(0, 500))); ok = ok && !!cond };
const ENV = { GOOGLE_ADS_DEVELOPER_TOKEN: "devtok", GOOGLE_ADS_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_ADS_CLIENT_SECRET: "sec", GOOGLE_ADS_REFRESH_TOKEN: "rt", GOOGLE_ADS_CUSTOMER_ID: "123-456-7890", GOOGLE_ADS_LOGIN_CUSTOMER_ID: "111-222-3333" };
const M = (p) => String(Math.round(p * 1e6));
const json = (status, body, type) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": type || "application/json; charset=UTF-8" } });

// the stubbed account
let db;
const reset = () => db = {
  currency: "GBP",
  campaigns: [
    { id: "11", name: "Search party games", status: "ENABLED", biddingStrategyType: "MANUAL_CPC", budget: { id: "901", amountMicros: M(2.5) } },
    { id: "12", name: "Search game night", status: "ENABLED", biddingStrategyType: "TARGET_SPEND", targetSpend: { cpcBidCeilingMicros: M(0.8) }, budget: { id: "902", amountMicros: M(1.5) } },
    { id: "13", name: "Paused test", status: "PAUSED", biddingStrategyType: "MANUAL_CPC", budget: { id: "903", amountMicros: M(1) } },
  ],
  keywords: [
    { c: "11", b: "MANUAL_CPC", g: "21", k: "31", text: "party games for adults", match: "PHRASE", status: "ENABLED", bid: M(0.5) },
    { c: "11", b: "MANUAL_CPC", g: "21", k: "32", text: "hidden role game", match: "EXACT", status: "ENABLED", bid: M(1.9) },
    { c: "12", b: "TARGET_SPEND", g: "22", k: "33", text: "games night ideas", match: "PHRASE", status: "ENABLED" },
  ],
  negatives: [{ c: "11", text: "bbc", match: "PHRASE" }],
  ads: [
    { c: "11", g: "21", a: "41", status: "ENABLED", approval: "APPROVED" },
    { c: "11", g: "21", a: "42", status: "ENABLED", approval: "DISAPPROVED", topics: [{ topic: "TRADEMARKS_IN_AD_TEXT", type: "PROHIBITED" }] },
    { c: "12", g: "22", a: "43", status: "ENABLED", approval: "APPROVED" },
  ],
  cost: { TODAY: { "11": 0.4, "12": 0.2 }, YESTERDAY: { "11": 2.1, "12": 1.3 }, LAST_7_DAYS: { "11": 15, "12": 9 }, LAST_30_DAYS: { "11": 40, "12": 30 } },
  terms: Array.from({ length: 12 }, (_, i) => ({ term: i ? "term " + i : "traitors bbc watch online", clicks: 12 - i })),
};
reset();
let calls = [], oauth = [], mode = {};
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (mode.throw) throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND") });
  if (url === "https://oauth2.googleapis.com/token") { oauth.push(new URLSearchParams(init.body)); return mode.oauth ? json(400, mode.oauth) : json(200, { access_token: "at-1", expires_in: 3599 }) }
  const m = url.match(/^https:\/\/googleads\.googleapis\.com\/(v\d+)\/customers\/(\d+)\/(.+)$/), body = JSON.parse(init.body);
  calls.push({ version: m[1], cid: m[2], path: m[3], headers: init.headers, body });
  if (mode.fail) return mode.fail();
  if (m[3] === "googleAds:search") { const out = search(body); return out instanceof Response ? out : json(200, out) }
  const mm = m[3].match(/^(\w+):mutate$/);
  if (mm) {
    const bad = mode.partial && mode.partial.service === mm[1] ? mode.partial.index : -1;
    return json(200, { results: body.operations.map((o, i) => i === bad ? {} : { resourceName: "ok" }),
      ...(bad >= 0 ? { partialFailureError: { code: 3, message: "x", details: [{ errors: [{ errorCode: { criterionError: "KEYWORD_HAS_INVALID_CHARS" }, message: "The keyword has invalid characters.", location: { fieldPathElements: [{ fieldName: "operations", index: bad }] } }] }] } } : {}) });
  }
  return json(404, "<!doctype html>", "text/html");
};
function search({ query: q, pageToken }) {
  const rows = (r) => ({ results: r });
  const range = (q.match(/DURING (\w+)/) || [])[1];
  if (/conversion_tracking_status/.test(q)) return rows([{ customer: { conversionTrackingSetting: { conversionTrackingStatus: "CONVERSION_TRACKING_MANAGED_BY_SELF" } } }]);
  if (/FROM customer LIMIT 1/.test(q)) return rows([{ customer: { id: "1234567890", descriptiveName: "The Betrayal", currencyCode: db.currency, timeZone: "Europe/London", autoTaggingEnabled: true } }]);
  if (/FROM campaign WHERE campaign.status != 'REMOVED'$/.test(q)) return rows(db.campaigns.map((x) => ({ campaign: { id: x.id, name: x.name, status: x.status, advertisingChannelType: "SEARCH", biddingStrategyType: x.biddingStrategyType, ...(x.targetSpend ? { targetSpend: x.targetSpend } : {}) }, campaignBudget: x.budget })));
  if (/FROM campaign WHERE .* DURING/.test(q)) return rows(Object.entries(db.cost[range]).map(([id, cost]) => ({ campaign: { id }, metrics: { clicks: String(Math.round(cost * 2)), costMicros: M(cost), ...(id === "11" && range === "LAST_30_DAYS" ? { conversions: 3, conversionsValue: 30 } : {}) } })));
  if (/FROM ad_group_criterion/.test(q)) return rows(db.keywords.map((x) => ({ campaign: { id: x.c, biddingStrategyType: x.b }, adGroup: { id: x.g, name: "AG" + x.g }, adGroupCriterion: { criterionId: x.k, keyword: { text: x.text, matchType: x.match }, status: x.status, ...(x.bid ? { cpcBidMicros: x.bid } : {}), effectiveCpcBidMicros: x.bid || M(0.7) } })));
  if (/FROM keyword_view/.test(q)) return rows([{ adGroup: { id: "21" }, adGroupCriterion: { criterionId: "31" }, metrics: { clicks: "20", costMicros: M(12) } }]);
  if (/FROM campaign_criterion/.test(q)) return rows(db.negatives.map((x) => ({ campaign: { id: x.c }, campaignCriterion: { keyword: { text: x.text, matchType: x.match } } })));
  if (/FROM search_term_view/.test(q)) { const all = db.terms.map((t) => ({ campaign: { id: "11" }, adGroup: { id: "21" }, searchTermView: { searchTerm: t.term, status: "NONE" }, metrics: { clicks: String(t.clicks), costMicros: M(t.clicks * 0.3) } })); return pageToken === "p2" ? { results: all.slice(10) } : { results: all.slice(0, 10), nextPageToken: "p2" } }
  if (/FROM ad_group_ad/.test(q)) return rows(db.ads.map((x) => ({ campaign: { id: x.c }, adGroup: { id: x.g }, adGroupAd: { ad: { id: x.a, type: "RESPONSIVE_SEARCH_AD", finalUrls: ["https://thebetrayal.co.uk/buy"] }, status: x.status, policySummary: { approvalStatus: x.approval, policyTopicEntries: x.topics || [] } } })));
  if (/FROM asset/.test(q)) { if (mode.assetFail) return json(400, { error: { code: 400, details: [{ errors: [{ errorCode: { queryError: "UNRECOGNIZED_FIELD" }, message: "Unrecognized field in the query: 'asset.policy_summary.review_status'." }] }] } }); return rows([{ asset: { id: "51", type: "SITELINK", sitelinkAsset: { linkText: "Book a Table" }, policySummary: { approvalStatus: "APPROVED" } } }]) }
  if (/FROM conversion_action/.test(q)) return rows([{ conversionAction: { resourceName: "customers/1234567890/conversionActions/61", id: "61", name: "Purchase", status: "ENABLED", category: "PURCHASE", primaryForGoal: true, countingType: "MANY_PER_CLICK" } }]);
  if (/segments.conversion_action/.test(q)) return rows([{ segments: { conversionAction: "customers/1234567890/conversionActions/61" }, metrics: { allConversions: 3 } }]);
  if (/FROM change_event/.test(q)) return rows([{ changeEvent: { changeDateTime: "2026-10-18 07:53:10", changeResourceType: "AD_GROUP_CRITERION", clientType: "GOOGLE_ADS_API", resourceChangeOperation: "UPDATE", changedFields: "cpc_bid_micros" } }]);
  throw new Error("unexpected query: " + q);
}

// ---- signing in and Google's errors ----
let e1; try { client({ ...ENV, GOOGLE_ADS_REFRESH_TOKEN: "" }) } catch (e) { e1 = e }
check("credentials: a missing one is named, and nothing is called", e1 instanceof AdsError && e1.codes[0] === "MISSING_ENV" && /GOOGLE_ADS_REFRESH_TOKEN/.test(e1.message) && !calls.length && !oauth.length, e1 && e1.message);
const c = client(ENV);
await c.search("SELECT customer.id FROM customer LIMIT 1"); await c.search("SELECT customer.id FROM customer LIMIT 1");
const h = calls[0].headers;
check("sign-in: the refresh token is exchanged once, then reused", oauth.length === 1 && oauth[0].get("grant_type") === "refresh_token" && oauth[0].get("refresh_token") === "rt" && oauth[0].get("client_id") === ENV.GOOGLE_ADS_CLIENT_ID);
check("requests: the pinned API version, the customer ID without dashes, the developer token, the manager ID", calls[0].version === VERSION && calls[0].cid === "1234567890" && h.Authorization === "Bearer at-1" && h["developer-token"] === "devtok" && h["login-customer-id"] === "1112223333", [calls[0].version, calls[0].cid, h]);
check("requests: no manager header without a manager ID", await (async () => { calls = []; await client({ ...ENV, GOOGLE_ADS_LOGIN_CUSTOMER_ID: "" }).search("SELECT customer.id FROM customer LIMIT 1"); return !("login-customer-id" in calls[0].headers) })());
check("requests: GOOGLE_ADS_API_VERSION overrides the version", await (async () => { calls = []; await client({ ...ENV, GOOGLE_ADS_API_VERSION: "v99" }).search("SELECT customer.id FROM customer LIMIT 1").catch(() => {}); return calls[0].version === "v99" })());
const fails = async (setup) => { Object.assign(mode, setup); try { await client(ENV).search("SELECT customer.id FROM customer LIMIT 1"); return null } catch (e) { return e } finally { mode = {} } };
let e = await fails({ oauth: { error: "invalid_grant", error_description: "Token has been expired or revoked." } });
check("errors: an expired refresh token says how to fix it", e && e.codes[0] === "OAUTH_INVALID_GRANT" && /7 days/.test(e.hint), e);
e = await fails({ fail: () => json(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "The caller does not have permission", details: [{ "@type": "type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure", errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }, message: "The developer token is only approved for use with test accounts." }] }] } }) });
check("errors: a test-only developer token is recognised", e && e.codes.includes("DEVELOPER_TOKEN_NOT_APPROVED") && /Explorer or Basic/.test(e.hint) && /only approved for use with test accounts/.test(e.message), e);
e = await fails({ fail: () => json(403, { error: { code: 403, details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" }, message: "User doesn't have permission to access customer." }] }] } }) });
check("errors: no access suggests the manager ID", e && /GOOGLE_ADS_LOGIN_CUSTOMER_ID/.test(e.hint));
e = await fails({ fail: () => json(404, "<!DOCTYPE html>", "text/html") });
check("errors: a 404 (a retired version) says to move the version on", e && e.codes.includes("NOT_FOUND") && /GOOGLE_ADS_API_VERSION/.test(e.hint));
e = await fails({ fail: () => json(403, "Forbidden by policy", "text/plain") });
check("errors: a network policy's refusal says which hosts to allow", e && e.codes[0] === "NETWORK" && /googleads.googleapis.com/.test(e.hint), e);
e = await fails({ throw: true });
check("errors: no connection at all says the same", e && e.codes[0] === "NETWORK" && /ENOTFOUND/.test(e.message));

// ---- the report ----
calls = [];
const r = await report(client(ENV));
const camp = (id) => r.campaigns.find((x) => x.id === id);
check("report: account, tracking and the API version", r.account.name === "The Betrayal" && r.account.currency === "GBP" && r.tracking === "CONVERSION_TRACKING_MANAGED_BY_SELF" && r.apiVersion === VERSION, [r.account, r.tracking]);
check("report: campaigns with their budget, bidding and spend by period (pence, not micros)", camp("11").budget === 2.5 && camp("12").cpcCeiling === 0.8 && camp("12").bidding === "TARGET_SPEND" && camp("11").yesterday.cost === 2.1 && camp("11").last30.conversions === 3 && camp("13").last7.cost === 0, camp("11"));
check("report: totals count only enabled campaigns' budgets, against the £4 cap", r.totals.dailyBudgets === 4 && r.totals.cap === 4 && r.totals.spendYesterday === 3.4 && r.totals.spend30 === 70 && r.totals.conversions30 === 3, r.totals);
check("report: keywords with bids and their last 30 days", r.keywords.length === 3 && r.keywords[0].bid === 0.5 && r.keywords[0].last30.cost === 12 && r.keywords[0].last30.clicks === 20 && r.keywords[2].bid === null, r.keywords[0]);
check("report: every page of search terms", r.searchTerms.length === 12 && r.searchTerms[0].term === "traitors bbc watch online", r.searchTerms.length);
check("report: ads with their approval and policy topics, existing negatives, conversion actions, recent changes", r.ads[1].approval === "DISAPPROVED" && r.ads[1].policy[0] === "TRADEMARKS_IN_AD_TEXT (PROHIBITED)" && r.negatives[0].text === "bbc" && r.conversionActions[0].primary && r.conversionActions[0].last30 === 3 && r.changes[0].by === "sweep (API)", [r.ads[1], r.changes[0]]);
check("report: alerts for a disapproved ad, none for budgets within the cap", r.alerts.some((a) => a.level === "fix" && /Ad 42/.test(a.text) && /TRADEMARKS/.test(a.text)) && !r.alerts.some((a) => /cap/.test(a.text)), r.alerts);
db.campaigns[1].budget.amountMicros = M(2); mode.assetFail = true;
const r2 = await report(client(ENV)); mode = {}; reset();
check("report: budgets over the cap are flagged", r2.alerts.some((a) => a.level === "fix" && /£4.5, over the £4 cap/.test(a.text)), r2.alerts);
check("report: a part Google refuses is reported, and the rest still comes back", r2.assets === null && r2.errors.length === 1 && r2.errors[0].part === "assets" && r2.campaigns.length === 3 && r2.alerts.some((a) => /assets/.test(a.text)), r2.errors);

// ---- changes and their limits ----
const run = async (changes, opts) => { calls = []; reset(); return (await apply(client(ENV), changes, opts)).results };
let res = await run([{ op: "set_budget", campaignId: "11", budget: 2.6 }]);
check("budget: a rise that takes enabled budgets over £4 is refused", res[0].status === "rejected" && /£4.1, over the £4 cap/.test(res[0].reason), res);
res = await run([{ op: "set_budget", campaignId: "11", budget: 2.2 }, { op: "set_budget", campaignId: "12", budget: 1.8 }]);
const bm = calls.find((x) => x.path === "campaignBudgets:mutate");
check("budget: a cut makes room for a rise in the same run, checked in order", res.every((x) => x.status === "valid") && bm.body.operations.length === 2 && bm.body.operations[0].update.amountMicros === "2200000" && bm.body.operations[0].update.resourceName === "customers/1234567890/campaignBudgets/901" && bm.body.operations[0].updateMask === "amountMicros", [res, bm && bm.body]);
check("changes: Google only validates them unless --live", bm.body.validateOnly === true && bm.body.partialFailure === true);
res = await run([{ op: "set_budget", campaignId: "12", budget: 1.8 }, { op: "set_budget", campaignId: "11", budget: 2.2 }]);
check("budget: the rise listed before the cut is refused", res[0].status === "rejected" && res[1].status === "valid", res);
res = await run([{ op: "set_budget", campaignId: "13", budget: 4.5 }, { op: "set_budget", campaignId: "13", budget: 3 }]);
check("budget: no single budget over the cap, even a paused campaign's", res[0].status === "rejected" && res[1].status === "valid", res);
db.campaigns[1].budget.amountMicros = M(3);
res = (await apply(client(ENV), [{ op: "set_budget", campaignId: "12", budget: 1.5 }])).results;
check("budget: an account over the cap can always be cut", res[0].status === "valid", res);
res = await run([{ op: "set_keyword_bid", adGroupId: "21", criterionId: "31", bid: 0.6 }, { op: "set_keyword_bid", adGroupId: "21", criterionId: "32", bid: 2.2 }, { op: "set_keyword_bid", adGroupId: "22", criterionId: "33", bid: 0.5 }]);
const km = calls.find((x) => x.path === "adGroupCriteria:mutate");
check("bids: up to 20% at a time is allowed, and sent as micros", res[0].status === "valid" && km.body.operations[0].update.cpcBidMicros === "600000" && km.body.operations[0].update.resourceName === "customers/1234567890/adGroupCriteria/21~31" && km.body.operations[0].updateMask === "cpcBidMicros", [res[0], km && km.body]);
check("bids: never above £2, and never per keyword where Google sets the bids", res[1].status === "rejected" && /£2/.test(res[1].reason) && res[2].status === "rejected" && /bidding strategy/.test(res[2].reason), res);
res = await run([{ op: "set_keyword_bid", adGroupId: "21", criterionId: "31", bid: 0.61 }, { op: "set_keyword_bid", adGroupId: "21", criterionId: "31", bid: 0.39 }, { op: "set_keyword_bid", adGroupId: "21", criterionId: "31", bid: 0.4 }]);
check("bids: more than 20% up or down in one change is refused", res[0].status === "rejected" && res[1].status === "rejected" && res[2].status === "valid", res);
res = await run([{ op: "set_cpc_ceiling", campaignId: "12", ceiling: 0.96 }, { op: "set_cpc_ceiling", campaignId: "12", ceiling: 1.2 }, { op: "set_cpc_ceiling", campaignId: "11", ceiling: 1 }]);
const cm = calls.find((x) => x.path === "campaigns:mutate");
check("bid limit: a Maximise clicks campaign's limit moves up to 20% (from where the run left it)", res[0].status === "valid" && res[1].status === "rejected" && cm.body.operations[0].update.targetSpend.cpcBidCeilingMicros === "960000" && cm.body.operations[0].updateMask === "targetSpend.cpcBidCeilingMicros", [res, cm && cm.body]);
check("bid limit: not on a manual-bid campaign", res[2].status === "rejected" && /Maximise clicks/.test(res[2].reason));
res = await run([{ op: "add_negative_keyword", campaignId: "11", text: "  Watch   ONLINE ", match: "phrase" }, { op: "add_negative_keyword", campaignId: "11", text: "bbc" }, { op: "add_negative_keyword", campaignId: "11", text: "party games" }, { op: "add_negative_keyword", campaignId: "11", text: "free!!!" }, { op: "add_negative_keyword", campaignId: "11", text: "jobs", match: "FUZZY" }, { op: "add_negative_keyword", campaignId: "99", text: "jobs" }, { op: "add_negative_keyword", campaignId: "11", text: "watch online", match: "PHRASE" }]);
const nm = calls.find((x) => x.path === "campaignCriteria:mutate");
check("negatives: added to the campaign as a negative keyword, tidied", res[0].status === "valid" && nm.body.operations.length === 1 && nm.body.operations[0].create.negative === true && nm.body.operations[0].create.keyword.text === "watch online" && nm.body.operations[0].create.keyword.matchType === "PHRASE" && nm.body.operations[0].create.campaign === "customers/1234567890/campaigns/11", nm && nm.body);
check("negatives: not a duplicate (already there, or twice in one run)", res[1].status === "rejected" && /already/.test(res[1].reason) && res[6].status === "rejected", res);
check("negatives: never one that blocks the campaign's own keyword", res[2].status === "rejected" && /party games for adults/.test(res[2].reason), res[2]);
check("negatives: plain words, a real match type, a real campaign", res[3].status === "rejected" && res[4].status === "rejected" && res[5].status === "rejected", res.slice(3, 6));
res = await run([{ op: "pause_keyword", adGroupId: "21", criterionId: "31" }, { op: "pause_keyword", adGroupId: "21", criterionId: "31" }, { op: "pause_ad", adGroupId: "21", adId: "42" }, { op: "pause_ad", adGroupId: "21", adId: "41" }, { op: "enable_campaign", campaignId: "13" }]);
check("pausing: a keyword once; an ad, but never an ad group's last", res[0].status === "valid" && res[1].status === "rejected" && res[2].status === "valid" && res[3].status === "rejected" && /last enabled ad/.test(res[3].reason), res);
check("anything else (enabling, new campaigns, strategy changes) is refused", res[4].status === "rejected" && /isn't a change a sweep may make/.test(res[4].reason));
res = await run(Array.from({ length: LIMITS.maxChanges + 1 }, (_, i) => ({ op: "add_negative_keyword", campaignId: "12", text: "junk " + i })));
check(`changes: at most ${LIMITS.maxChanges} in one run`, res.filter((x) => x.status === "valid").length === LIMITS.maxChanges && res[LIMITS.maxChanges].status === "rejected");
reset(); db.currency = "USD";
res = (await apply(client(ENV), [{ op: "set_budget", campaignId: "11", budget: 1 }, { op: "add_negative_keyword", campaignId: "11", text: "jobs" }])).results;
check("currency: no money changes on an account not in pounds (negatives still fine)", res[0].status === "rejected" && /USD/.test(res[0].reason) && res[1].status === "valid", res);
res = await run([{ op: "add_negative_keyword", campaignId: "11", text: "jobs" }, { op: "add_negative_keyword", campaignId: "11", text: "careers" }, { op: "pause_keyword", adGroupId: "21", criterionId: "32" }], { live: true });
check("live: applied for real (validateOnly off)", res.every((x) => x.status === "applied") && calls.filter((x) => /:mutate$/.test(x.path)).every((x) => x.body.validateOnly === false), res);
mode.partial = { service: "campaignCriteria", index: 1 };
res = await run([{ op: "add_negative_keyword", campaignId: "11", text: "jobs" }, { op: "add_negative_keyword", campaignId: "11", text: "careers" }], { live: true }); mode = {};
check("live: one refused by Google is marked failed, with its reason, and the rest applied", res[0].status === "applied" && res[1].status === "failed" && /invalid characters/.test(res[1].reason), res);
{ const x = (await apply(client(ENV), { changes: [{ op: "pause_keyword", adGroupId: "22", criterionId: "33" }] })).results[0]; check("changes file: {changes: [...]} is accepted too", x.status === "valid", x) }

console.log(ok ? "RESULT: CLEAN" : "RESULT: FAILED"); process.exit(ok ? 0 : 1);
