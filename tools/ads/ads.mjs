// Google Ads, run by Claude once a day (tools/ads/PLAYBOOK.md), through the Google Ads API's REST interface. No
// dependencies.
//   node tools/ads/ads.mjs check                 are the credentials, the network and the API access in place?
//   node tools/ads/ads.mjs report [--out FILE]   the account as JSON: spend against the cap, campaigns, keywords, search
//                                                terms, ads and assets (with approvals), conversions, recent changes
//   node tools/ads/ads.mjs apply FILE [--live]   a list of changes, each checked against LIMITS first; without --live
//                                                Google only validates them
// Credentials come from the environment, never a file: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
// GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and GOOGLE_ADS_LOGIN_CUSTOMER_ID when access is through a manager
// account. Since September 2026 API access belongs to the Google Cloud project that owns the OAuth client, and Google
// ignores a developer token; GOOGLE_ADS_DEVELOPER_TOKEN, if set, is still sent (remove it if a later API version refuses
// it). GOOGLE_ADS_API_VERSION overrides VERSION (each version is retired a year after release).
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The owner's limits. Changing these is a decision for the owner, never for a sweep.
//   dailyCap   the most all enabled campaigns' daily budgets may add up to, in pounds (Google may spend up to twice a
//              day's budget on a busy day, but no more than 30.4 days' worth in a month)
//   maxCpc     the highest keyword bid or Maximise-clicks bid limit a sweep may set
//   bidStep    the most a bid or bid limit may move in one change (0.2 = 20% up or down)
//   maxChanges the most changes one run may make
export const LIMITS = { dailyCap: 4, maxCpc: 2, minCpc: 0.05, minBudget: 0.5, bidStep: 0.2, maxChanges: 30, currency: "GBP" };
export const VERSION = "v26";

const NEED = ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"];
const gbp = (micros) => Math.round(Number(micros || 0) / 10000) / 100;
const toMicros = (pounds) => String(Math.round(pounds * 100) * 10000);
const digits = (s) => String(s || "").replace(/\D/g, "");
const num = (x) => Number(x || 0);

export class AdsError extends Error {
  constructor(message, codes, hint) { super(message); this.codes = codes || []; this.hint = hint || ""; }
}
// what to do about the errors a sweep is likely to meet, by Google's error code
const HINTS = {
  MISSING_ENV: "Add them as environment variables in the cloud environment's settings, then start a new session.",
  NETWORK: "Allow googleads.googleapis.com and oauth2.googleapis.com under Allowed domains in the cloud environment's network settings.",
  OAUTH_INVALID_GRANT: "The refresh token has expired or been revoked (a consent screen left in Testing expires it after 7 days): make a new one and update GOOGLE_ADS_REFRESH_TOKEN.",
  OAUTH_INVALID_CLIENT: "GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET is wrong.",
  TEST_ACCESS_ONLY: "The Google Cloud project that owns the OAuth client only has test-account access: request Explorer (or Basic) access on the project's Google Ads API page in the Cloud Console.",
  USER_PERMISSION_DENIED: "The signed-in Google user can't reach this account. If access is through a manager account, set GOOGLE_ADS_LOGIN_CUSTOMER_ID to the manager's ID.",
  CUSTOMER_NOT_ENABLED: "The Google Ads account isn't active (billing set up?).",
  NOT_FOUND: "Google answered 404: the API version may have been retired (set GOOGLE_ADS_API_VERSION, and update VERSION in tools/ads/ads.mjs), or GOOGLE_ADS_CUSTOMER_ID is wrong.",
};
// a Google Ads API error body: its error codes (e.g. DEVELOPER_TOKEN_NOT_APPROVED) and messages
function failure(status, j) {
  const e = (j && j.error) || {}, errs = (e.details || []).flatMap((d) => d.errors || []);
  const codes = errs.map((x) => Object.values(x.errorCode || {})[0]).filter(Boolean);
  if (status === 404) codes.push("NOT_FOUND");
  const msg = errs.map((x) => x.message).filter(Boolean).join("; ") || e.message || "HTTP " + status;
  // a project without live access: the code Google gives it has changed with the access rules, the wording hasn't
  if (codes.includes("DEVELOPER_TOKEN_NOT_APPROVED") || /test accounts?|access level/i.test(msg)) codes.unshift("TEST_ACCESS_ONLY");
  return new AdsError("Google Ads said: " + msg, codes, codes.map((c) => HINTS[c]).find(Boolean) || "");
}

export function client(env = process.env) {
  const missing = NEED.filter((k) => !env[k]);
  if (missing.length) throw new AdsError("Missing credentials: " + missing.join(", "), ["MISSING_ENV"], HINTS.MISSING_ENV);
  const cid = digits(env.GOOGLE_ADS_CUSTOMER_ID), login = digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID), version = env.GOOGLE_ADS_API_VERSION || VERSION;
  const base = `https://googleads.googleapis.com/${version}/customers/${cid}`;
  let token = null;
  async function net(url, init) {
    let r;
    try { r = await fetch(url, init); } catch (e) { throw new AdsError("Couldn't reach " + new URL(url).host + ": " + ((e.cause && e.cause.message) || e.message), ["NETWORK"], HINTS.NETWORK); }
    // Google's own refusals are JSON; a 403 that isn't comes from a network policy in the way
    if (r.status === 403 && !/json/.test(r.headers.get("content-type") || "")) throw new AdsError("The network refused " + new URL(url).host, ["NETWORK"], HINTS.NETWORK);
    return r;
  }
  async function auth() {
    if (token) return token;
    const r = await net("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN }).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) { const code = "OAUTH_" + String(j.error || r.status).toUpperCase(); throw new AdsError("Google refused the sign-in: " + (j.error_description || j.error || "HTTP " + r.status), [code], HINTS[code] || ""); }
    return (token = j.access_token);
  }
  async function call(path, body) {
    const headers = { Authorization: "Bearer " + (await auth()), "Content-Type": "application/json", ...(login ? { "login-customer-id": login } : {}), ...(env.GOOGLE_ADS_DEVELOPER_TOKEN ? { "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN } : {}) };
    const r = await net(base + path, { method: "POST", headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw failure(r.status, j);
    return j;
  }
  async function search(query) {
    let rows = [], pageToken;
    for (let i = 0; i < 20; i++) { const j = await call("/googleAds:search", pageToken ? { query, pageToken } : { query }); rows = rows.concat(j.results || []); if (!(pageToken = j.nextPageToken)) break; }
    return rows;
  }
  // partialFailure: one bad operation doesn't stop the rest; validateOnly: Google checks them and changes nothing
  const mutate = (service, operations, validateOnly) => call("/" + service + ":mutate", { operations, partialFailure: true, validateOnly: !!validateOnly });
  return { cid, version, search, mutate, res: (kind, id) => `customers/${cid}/${kind}/${id}` };
}

// ---- the account's state (what report shows and apply checks against) ----
const met = (m) => (m = m || {}, { impressions: num(m.impressions), clicks: num(m.clicks), cost: gbp(m.costMicros), conversions: +num(m.conversions).toFixed(2), value: +num(m.conversionsValue).toFixed(2) });
const METRICS = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";
async function campaignState(c) {
  const rows = await c.search("SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.target_spend.cpc_bid_ceiling_micros, campaign_budget.id, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED'");
  return rows.map(({ campaign: x = {}, campaignBudget: b = {} }) => ({ id: String(x.id), name: x.name, status: x.status, serving: x.servingStatus, type: x.advertisingChannelType, bidding: x.biddingStrategyType,
    cpcCeiling: x.targetSpend && x.targetSpend.cpcBidCeilingMicros ? gbp(x.targetSpend.cpcBidCeilingMicros) : null, budgetId: b.id ? String(b.id) : null, budget: gbp(b.amountMicros), sharedBudget: !!b.explicitlyShared }));
}
// the daily budgets of enabled campaigns, each shared budget counted once
export function dailyTotal(camps, override) {
  const seen = new Map();
  for (const x of camps) if (x.status === "ENABLED" && x.budgetId) seen.set(x.budgetId, override && override.has(x.budgetId) ? override.get(x.budgetId) : x.budget);
  return +[...seen.values()].reduce((a, b) => a + b, 0).toFixed(2);
}
async function keywordState(c) {
  const rows = await c.search("SELECT campaign.id, campaign.bidding_strategy_type, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.cpc_bid_micros, ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.quality_info.quality_score FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'");
  return rows.map(({ campaign: k = {}, adGroup: g = {}, adGroupCriterion: x = {} }) => ({ campaignId: String(k.id), bidding: k.biddingStrategyType, adGroupId: String(g.id), adGroup: g.name, criterionId: String(x.criterionId),
    text: x.keyword && x.keyword.text, match: x.keyword && x.keyword.matchType, status: x.status, bid: x.cpcBidMicros ? gbp(x.cpcBidMicros) : null, effectiveBid: x.effectiveCpcBidMicros ? gbp(x.effectiveCpcBidMicros) : null, quality: x.qualityInfo ? x.qualityInfo.qualityScore || null : null }));
}
async function negativeState(c) {
  const rows = await c.search("SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE");
  return rows.map(({ campaign: k = {}, campaignCriterion: x = {} }) => ({ campaignId: String(k.id), text: x.keyword && x.keyword.text, match: x.keyword && x.keyword.matchType }));
}
async function adState(c) {
  const rows = await c.search("SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND campaign.status != 'REMOVED'");
  return rows.map(({ campaign: k = {}, adGroup: g = {}, adGroupAd: x = {} }) => ({ campaignId: String(k.id), adGroupId: String(g.id), adId: String(x.ad && x.ad.id), type: x.ad && x.ad.type, urls: (x.ad && x.ad.finalUrls) || [], status: x.status, strength: x.adStrength,
    approval: x.policySummary && x.policySummary.approvalStatus, review: x.policySummary && x.policySummary.reviewStatus, policy: ((x.policySummary && x.policySummary.policyTopicEntries) || []).map((p) => p.topic + (p.type ? " (" + p.type + ")" : "")) }));
}

export async function report(c) {
  const out = { generated: new Date().toISOString(), apiVersion: c.version, limits: LIMITS, alerts: [], errors: [] };
  // each part on its own, so one query Google refuses doesn't hide the rest
  const part = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = null; out.errors.push({ part: name, message: e.message, codes: e.codes, hint: e.hint }); } };
  await part("account", async () => {
    const [r] = await c.search("SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.auto_tagging_enabled FROM customer LIMIT 1");
    const x = (r && r.customer) || {}; return { id: String(x.id), name: x.descriptiveName, currency: x.currencyCode, timeZone: x.timeZone, autoTagging: !!x.autoTaggingEnabled };
  });
  await part("tracking", async () => { const [r] = await c.search("SELECT customer.conversion_tracking_setting.conversion_tracking_status FROM customer LIMIT 1"); return ((r && r.customer && r.customer.conversionTrackingSetting) || {}).conversionTrackingStatus || null; });
  await part("campaigns", async () => {
    const camps = await campaignState(c);
    for (const [key, range] of [["today", "TODAY"], ["yesterday", "YESTERDAY"], ["last7", "LAST_7_DAYS"], ["last30", "LAST_30_DAYS"]]) {
      const rows = await c.search(`SELECT campaign.id, ${METRICS} FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date DURING ${range}`);
      const by = new Map(rows.map((r) => [String(r.campaign.id), met(r.metrics)]));
      for (const x of camps) x[key] = by.get(x.id) || met();
    }
    return camps;
  });
  await part("keywords", async () => {
    const kws = await keywordState(c);
    for (const [key, range] of [["last7", "LAST_7_DAYS"], ["last30", "LAST_30_DAYS"]]) {
      const rows = await c.search(`SELECT ad_group.id, ad_group_criterion.criterion_id, ${METRICS} FROM keyword_view WHERE segments.date DURING ${range}`);
      const by = new Map(rows.map((r) => [r.adGroup.id + "~" + r.adGroupCriterion.criterionId, met(r.metrics)]));
      for (const x of kws) x[key] = by.get(x.adGroupId + "~" + x.criterionId) || met();
    }
    return kws;
  });
  await part("negatives", () => negativeState(c));
  await part("searchTerms", async () => (await c.search("SELECT campaign.id, ad_group.id, search_term_view.search_term, search_term_view.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_14_DAYS ORDER BY metrics.impressions DESC LIMIT 300"))
    .map((r) => ({ campaignId: String(r.campaign.id), adGroupId: String(r.adGroup.id), term: r.searchTermView.searchTerm, status: r.searchTermView.status, ...met(r.metrics) })));
  await part("ads", () => adState(c));
  await part("assets", async () => (await c.search("SELECT asset.id, asset.type, asset.sitelink_asset.link_text, asset.callout_asset.callout_text, asset.policy_summary.approval_status, asset.policy_summary.review_status FROM asset WHERE asset.type IN ('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET')"))
    .map(({ asset: x = {} }) => ({ id: String(x.id), type: x.type, text: (x.sitelinkAsset && x.sitelinkAsset.linkText) || (x.calloutAsset && x.calloutAsset.calloutText) || null, approval: x.policySummary && x.policySummary.approvalStatus, review: x.policySummary && x.policySummary.reviewStatus })));
  await part("conversionActions", async () => {
    const acts = (await c.search("SELECT conversion_action.resource_name, conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.primary_for_goal, conversion_action.counting_type, conversion_action.value_settings.default_value FROM conversion_action WHERE conversion_action.status != 'REMOVED'"))
      .map(({ conversionAction: x = {} }) => ({ resource: x.resourceName, id: String(x.id), name: x.name, status: x.status, type: x.type, category: x.category, primary: !!x.primaryForGoal, counting: x.countingType, defaultValue: x.valueSettings ? x.valueSettings.defaultValue || null : null, last30: 0 }));
    const rows = await c.search("SELECT segments.conversion_action, metrics.all_conversions FROM customer WHERE segments.date DURING LAST_30_DAYS");
    for (const r of rows) { const a = acts.find((x) => x.resource === r.segments.conversionAction); if (a) a.last30 = +num(r.metrics.allConversions).toFixed(2); }
    return acts;
  });
  await part("changes", async () => {
    const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    return (await c.search(`SELECT change_event.change_date_time, change_event.change_resource_type, change_event.change_resource_name, change_event.client_type, change_event.user_email, change_event.resource_change_operation, change_event.changed_fields FROM change_event WHERE change_event.change_date_time >= '${day(14)}' AND change_event.change_date_time <= '${day(-1)}' ORDER BY change_event.change_date_time DESC LIMIT 200`))
      .map(({ changeEvent: x = {} }) => ({ at: x.changeDateTime, type: x.changeResourceType, resource: x.changeResourceName, by: x.clientType === "GOOGLE_ADS_API" ? "sweep (API)" : x.userEmail || x.clientType, operation: x.resourceChangeOperation, fields: x.changedFields }));
  });

  // the headline numbers and what needs attention
  const camps = out.campaigns || [], sum = (k, f) => +camps.reduce((a, x) => a + x[k][f], 0).toFixed(2);
  out.totals = camps.length ? { dailyBudgets: dailyTotal(camps), cap: LIMITS.dailyCap, spendToday: sum("today", "cost"), spendYesterday: sum("yesterday", "cost"), spend7: sum("last7", "cost"), spend30: sum("last30", "cost"),
    conversions30: sum("last30", "conversions"), value30: sum("last30", "value") } : null;
  const t = out.totals, a = (level, text) => out.alerts.push({ level, text });
  if (out.account && out.account.currency && out.account.currency !== LIMITS.currency) a("stop", `The account's currency is ${out.account.currency}, not GBP: the £ limits can't be applied, so no budget or bid changes.`);
  if (t && t.dailyBudgets > LIMITS.dailyCap + 0.001) a("fix", `Enabled campaigns' daily budgets add up to £${t.dailyBudgets}, over the £${LIMITS.dailyCap} cap: bring them down.`);
  if (t && t.spendYesterday > 2 * LIMITS.dailyCap) a("warn", `Yesterday's spend (£${t.spendYesterday}) was more than twice the daily cap.`);
  if (out.account && !out.account.autoTagging) a("fix", "Auto-tagging is off, so ad clicks can't be matched to purchases. Turn it on (Admin → Account settings): the owner's job.");
  if (out.conversionActions && !out.conversionActions.some((x) => x.primary && x.status === "ENABLED" && x.category === "PURCHASE")) a("warn", "No enabled primary Purchase conversion action: conversions aren't being counted for bidding.");
  for (const x of out.ads || []) if (x.status === "ENABLED" && /DISAPPROVED|APPROVED_LIMITED/.test(x.approval || "")) a(x.approval === "DISAPPROVED" ? "fix" : "warn", `Ad ${x.adId} (ad group ${x.adGroupId}) is ${x.approval}${x.policy.length ? ": " + x.policy.join(", ") : ""}.`);
  for (const x of out.assets || []) if (/DISAPPROVED|APPROVED_LIMITED/.test(x.approval || "")) a("warn", `${x.type} asset "${x.text || x.id}" is ${x.approval}.`);
  if (out.errors.length) a("warn", `${out.errors.length} part(s) of the report failed: ${out.errors.map((e) => e.part).join(", ")}.`);
  return out;
}

// ---- changes ----
// One change, checked against the account as it is now (and the changes before it in the same run). Returns the
// operation to send, or why not.
const MATCH = ["EXACT", "PHRASE", "BROAD"];
export function vet(ch, s) {
  const no = (reason) => ({ ok: false, reason });
  const money = ["set_budget", "set_keyword_bid", "set_cpc_ceiling"].includes(ch.op);
  if (money && s.currency !== LIMITS.currency) return no(`the account is in ${s.currency}, and the limits are in £`);
  const camp = ch.campaignId != null && s.camps.find((x) => x.id === String(ch.campaignId));
  const kw = ch.criterionId != null && s.kws.find((x) => x.adGroupId === String(ch.adGroupId) && x.criterionId === String(ch.criterionId));
  const step = (from, to) => from && Math.abs(to - from) / from > LIMITS.bidStep + 1e-9;
  switch (ch.op) {
    case "add_negative_keyword": {
      const text = String(ch.text || "").trim().toLowerCase().replace(/\s+/g, " "), match = String(ch.match || "PHRASE").toUpperCase();
      if (!camp) return no("no such campaign");
      if (!text || text.length > 80 || text.split(" ").length > 10 || /[^\p{L}\p{N} '&.-]/u.test(text)) return no("a negative keyword is 1 to 10 plain words");
      if (!MATCH.includes(match)) return no("match must be EXACT, PHRASE or BROAD");
      if (s.negs.some((x) => x.campaignId === camp.id && String(x.text).toLowerCase() === text && x.match === match)) return no("that negative is already there");
      const blocks = s.kws.filter((k) => k.campaignId === camp.id && k.status === "ENABLED" && (match === "EXACT" ? k.text.toLowerCase() === text : k.text.toLowerCase().includes(text)));
      if (blocks.length) return no(`it would block this campaign's own keyword "${blocks[0].text}"`);
      s.negs.push({ campaignId: camp.id, text, match });
      return { ok: true, service: "campaignCriteria", op: { create: { campaign: s.res("campaigns", camp.id), negative: true, keyword: { text, matchType: match } } } };
    }
    case "pause_keyword":
      if (!kw) return no("no such keyword");
      if (kw.status !== "ENABLED") return no("it isn't enabled");
      kw.status = "PAUSED";
      return { ok: true, service: "adGroupCriteria", op: { update: { resourceName: s.res("adGroupCriteria", kw.adGroupId + "~" + kw.criterionId), status: "PAUSED" }, updateMask: "status" } };
    case "set_keyword_bid": {
      const to = Number(ch.bid);
      if (!kw) return no("no such keyword");
      if (kw.bidding !== "MANUAL_CPC") return no("this campaign's bids are set by Google's bidding strategy, not per keyword");
      if (!(to >= LIMITS.minCpc && to <= LIMITS.maxCpc)) return no(`a bid must be between £${LIMITS.minCpc} and £${LIMITS.maxCpc}`);
      const from = kw.bid || kw.effectiveBid;
      if (!from) return no("the keyword has no current bid to move from");
      if (step(from, to)) return no(`£${from} to £${to} is more than ${LIMITS.bidStep * 100}% in one change`);
      kw.bid = to;
      return { ok: true, service: "adGroupCriteria", op: { update: { resourceName: s.res("adGroupCriteria", kw.adGroupId + "~" + kw.criterionId), cpcBidMicros: toMicros(to) }, updateMask: "cpcBidMicros" } };
    }
    case "set_cpc_ceiling": {
      const to = Number(ch.ceiling);
      if (!camp) return no("no such campaign");
      if (camp.bidding !== "TARGET_SPEND") return no("only a Maximise clicks campaign has a bid limit");
      if (!(to >= LIMITS.minCpc && to <= LIMITS.maxCpc)) return no(`a bid limit must be between £${LIMITS.minCpc} and £${LIMITS.maxCpc}`);
      if (camp.cpcCeiling && step(camp.cpcCeiling, to)) return no(`£${camp.cpcCeiling} to £${to} is more than ${LIMITS.bidStep * 100}% in one change`);
      camp.cpcCeiling = to;
      return { ok: true, service: "campaigns", op: { update: { resourceName: s.res("campaigns", camp.id), targetSpend: { cpcBidCeilingMicros: toMicros(to) } }, updateMask: "targetSpend.cpcBidCeilingMicros" } };
    }
    case "set_budget": {
      // a cut is always allowed (it can only lower spend); a rise only while all enabled budgets stay within the cap,
      // and no single budget may exceed the cap (a paused campaign's counts once someone enables it)
      const to = Number(ch.budget);
      if (!camp) return no("no such campaign");
      if (!camp.budgetId) return no("the campaign has no budget of its own to set");
      if (!(to >= LIMITS.minBudget && to <= LIMITS.dailyCap)) return no(`a daily budget must be between £${LIMITS.minBudget} and £${LIMITS.dailyCap}`);
      const now = s.budgets.has(camp.budgetId) ? s.budgets.get(camp.budgetId) : camp.budget, next = new Map(s.budgets).set(camp.budgetId, to), total = dailyTotal(s.camps, next);
      if (to > now && total > LIMITS.dailyCap + 0.001) return no(`enabled campaigns' daily budgets would add up to £${total}, over the £${LIMITS.dailyCap} cap`);
      s.budgets = next;
      return { ok: true, service: "campaignBudgets", op: { update: { resourceName: s.res("campaignBudgets", camp.budgetId), amountMicros: toMicros(to) }, updateMask: "amountMicros" } };
    }
    case "pause_ad": {
      const ad = s.ads.find((x) => x.adGroupId === String(ch.adGroupId) && x.adId === String(ch.adId));
      if (!ad) return no("no such ad");
      if (ad.status !== "ENABLED") return no("it isn't enabled");
      if (!s.ads.some((x) => x !== ad && x.adGroupId === ad.adGroupId && x.status === "ENABLED")) return no("it's the ad group's last enabled ad");
      ad.status = "PAUSED";
      return { ok: true, service: "adGroupAds", op: { update: { resourceName: s.res("adGroupAds", ad.adGroupId + "~" + ad.adId), status: "PAUSED" }, updateMask: "status" } };
    }
    default:
      return no(`"${ch.op}" isn't a change a sweep may make (allowed: add_negative_keyword, pause_keyword, set_keyword_bid, set_cpc_ceiling, set_budget, pause_ad)`);
  }
}

export async function apply(c, changes, { live = false } = {}) {
  if (changes && Array.isArray(changes.changes)) changes = changes.changes;
  if (!Array.isArray(changes)) throw new AdsError("The changes file must hold a list of changes, or {\"changes\": [...]}");
  const [acct] = await c.search("SELECT customer.currency_code FROM customer LIMIT 1");
  const camps = await campaignState(c);
  const s = { currency: acct && acct.customer && acct.customer.currencyCode, camps, kws: await keywordState(c), ads: await adState(c), negs: await negativeState(c), res: c.res, budgets: new Map() };
  const results = changes.map((ch, i) => i >= LIMITS.maxChanges ? { change: ch, status: "rejected", reason: `more than ${LIMITS.maxChanges} changes in one run` } : (() => { const v = vet(ch || {}, s); return v.ok ? { change: ch, status: "pending", service: v.service, op: v.op } : { change: ch, status: "rejected", reason: v.reason }; })());
  for (const service of [...new Set(results.filter((r) => r.status === "pending").map((r) => r.service))]) {
    const batch = results.filter((r) => r.status === "pending" && r.service === service);
    try {
      const j = await c.mutate(service, batch.map((r) => r.op), !live);
      const bad = new Map();
      for (const e of ((j.partialFailureError && j.partialFailureError.details) || []).flatMap((d) => d.errors || [])) {
        const at = ((e.location && e.location.fieldPathElements) || []).find((p) => p.fieldName === "operations");
        bad.set(at ? at.index || 0 : 0, e.message || JSON.stringify(e.errorCode));
      }
      batch.forEach((r, i) => { if (bad.has(i)) { r.status = "failed"; r.reason = "Google refused it: " + bad.get(i); } else r.status = live ? "applied" : "valid"; });
    } catch (e) { for (const r of batch) { r.status = "failed"; r.reason = e.message + (e.hint ? " (" + e.hint + ")" : ""); } }
  }
  return { live, results: results.map(({ op, service, ...r }) => r) };
}

// ---- command line ----
async function main() {
  const [cmd, ...rest] = process.argv.slice(2), flag = (f) => rest.includes(f), val = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : null; };
  const say = (x) => process.stdout.write(JSON.stringify(x, null, 2) + "\n");
  try {
    if (cmd === "check") {
      const c = client(), [r] = await c.search("SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1");
      const x = (r && r.customer) || {};
      say({ ok: true, account: x.descriptiveName, id: String(x.id), currency: x.currencyCode, apiVersion: c.version, limits: LIMITS });
    } else if (cmd === "report") {
      const out = await report(client()), file = val("--out");
      if (file) { writeFileSync(file, JSON.stringify(out, null, 2)); say({ ok: true, wrote: file, alerts: out.alerts, errors: out.errors }); } else say(out);
    } else if (cmd === "apply" && rest[0] && !rest[0].startsWith("--")) {
      say(await apply(client(), JSON.parse(readFileSync(rest[0], "utf8")), { live: flag("--live") }));
    } else {
      process.stderr.write("usage: node tools/ads/ads.mjs check | report [--out FILE] | apply FILE [--live]\n"); process.exit(2);
    }
  } catch (e) {
    say({ ok: false, error: e.message, codes: e.codes || [], hint: e.hint || "" }); process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
