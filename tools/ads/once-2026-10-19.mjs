// One-off Google Ads changes the owner approved on 19 Oct 2026, kept as a record of what was done to the account:
// Performance Max cut to £1 a day, the duplicate "Purchase (1)" made secondary, all mobile-app categories excluded
// account-wide, and a £3-a-day Search campaign. Dry run (Google validates only) unless --live.
//   node tools/ads/once-2026-10-19.mjs [--live]
import { client, VERSION } from "./ads.mjs";
const live = process.argv.includes("--live"), env = process.env;
const cid = env.GOOGLE_ADS_CUSTOMER_ID.replace(/\D/g, ""), login = (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/\D/g, "");
const c = client();
let token;
async function call(path, body) {
  if (!token) { const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN }).toString() }); token = (await r.json()).access_token; }
  const r = await fetch(`https://googleads.googleapis.com/${VERSION}/customers/${cid}${path}`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(login ? { "login-customer-id": login } : {}), ...(env.GOOGLE_ADS_DEVELOPER_TOKEN ? { "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const errs = ((j.error && j.error.details) || []).flatMap((d) => d.errors || []); throw new Error(r.status + ": " + (errs.map((e) => JSON.stringify(e.errorCode) + " " + e.message + (e.location ? " @" + JSON.stringify(e.location.fieldPathElements) : "")).join("\n  ") || JSON.stringify(j).slice(0, 600))); }
  return j;
}
const R = (kind, id) => `customers/${cid}/${kind}/${id}`;
const step = async (name, fn) => { try { const out = await fn(); console.log((live ? "DONE  " : "VALID ") + name + (out ? " — " + out : "")); } catch (e) { console.log("FAIL  " + name + "\n  " + e.message); process.exitCode = 1; } };

// 1. Performance Max to £1 a day (first, so the new £3 budget keeps the total within £4)
await step("Performance Max budget £3.90 → £1.00", async () => {
  await call("/campaignBudgets:mutate", { operations: [{ update: { resourceName: R("campaignBudgets", "15947483987"), amountMicros: "1000000" }, updateMask: "amountMicros" }], validateOnly: !live });
});

// 2. the unused duplicate "Purchase (1)" (label D1rC…) to Secondary; "Purchase" (QFUd…, the site's tag) stays primary
await step("\"Purchase (1)\" → secondary", async () => {
  await call("/conversionActions:mutate", { operations: [{ update: { resourceName: R("conversionActions", "7856492824"), primaryForGoal: false }, updateMask: "primaryForGoal" }], validateOnly: !live });
});

// 3. no ads in mobile apps, account-wide (every app category)
await step("exclude all mobile app categories (account level)", async () => {
  const cats = await c.search("SELECT mobile_app_category_constant.resource_name FROM mobile_app_category_constant");
  const have = new Set((await c.search("SELECT customer_negative_criterion.mobile_app_category.mobile_app_category_constant FROM customer_negative_criterion WHERE customer_negative_criterion.type = 'MOBILE_APP_CATEGORY'")).map((r) => r.customerNegativeCriterion.mobileAppCategory.mobileAppCategoryConstant));
  const todo = cats.map((r) => r.mobileAppCategoryConstant && r.mobileAppCategoryConstant.resourceName).filter((x) => x && !have.has(x)); // the root ("/", id 0) has no resource name
  if (!todo.length) return "already excluded";
  const j = await call("/customerNegativeCriteria:mutate", { operations: todo.map((x) => ({ create: { mobileAppCategory: { mobileAppCategoryConstant: x } } })), partialFailure: true, validateOnly: !live });
  const bad = ((j.partialFailureError && j.partialFailureError.details) || []).flatMap((d) => d.errors || []);
  return `${todo.length - bad.length} of ${todo.length} categories` + (bad.length ? `; refused: ${bad.slice(0, 3).map((e) => e.message).join("; ")}` : "");
});

// 4. a Search campaign, £3 a day, Maximise clicks with a £1 bid limit, UK, English, Google Search only
const HEAD = ["The Betrayal Party Game", "A Party Game for 8 to 24", "Played on Everyone's Phones", "No App to Download", "£10 for the Whole Party", "Secret Roles. Trust Nobody.", "Host a Hidden-Role Game Night", "Book Your Table Today", "A Murder Mystery Alternative", "Great for Christmas Parties", "Your Code Arrives Instantly", "Loyalty, Lies, Secret Votes", "Office Party Game for Groups", "Full Show on Your TV", "From £10 a Party"];
const DESC = ["A hidden-role party game for 8 to 24 adults, played on everyone's phone. No app needed.", "Secret roles, a secret vote and a poisoning each night. £10 covers the whole party.", "Fifteen Trials and thousands of questions, with a full show on your TV if you want one.", "Your code is on screen as soon as you pay. Your Table opens for 48 hours from first use."];
const GROUPS = [
  { name: "Game at home", url: "https://thebetrayal.co.uk/traitors-at-home", kws: ["traitors game at home", "traitors party game", "traitors game for parties", "play traitors at home", "traitors style game"] },
  { name: "Party games", url: "https://thebetrayal.co.uk/party-games-for-large-groups", kws: ["party games for adults", "party games for large groups", "party games for big groups", "christmas party games", "office party games", "games night ideas", "group party games"] },
  { name: "Hidden role games", url: "https://thebetrayal.co.uk/", kws: ["hidden role game", "social deduction game", "murder mystery party game", "mafia party game", "werewolf party game"] },
];
const NEGS = ["tickets", "jobs", "presenter", "watch", "cast", "castle", "winner", "streaming", "bbc", "series", "episodes", "season", "episode", "contestants", "iplayer"];
await step("Search campaign (£3/day, 3 ad groups, " + GROUPS.reduce((a, g) => a + g.kws.length, 0) + " keywords, 3 ads, " + NEGS.length + " negatives)", async () => {
  const B = R("campaignBudgets", "-1"), C = R("campaigns", "-2"), ops = [];
  ops.push({ campaignBudgetOperation: { create: { resourceName: B, name: "Search: party games", amountMicros: "3000000", deliveryMethod: "STANDARD", explicitlyShared: false } } });
  ops.push({ campaignOperation: { create: { resourceName: C, name: "Search: party games", status: "ENABLED", advertisingChannelType: "SEARCH", campaignBudget: B, targetSpend: { cpcBidCeilingMicros: "1000000" },
    networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
    geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE", negativeGeoTargetType: "PRESENCE" }, containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING" } } });
  ops.push({ campaignCriterionOperation: { create: { campaign: C, location: { geoTargetConstant: "geoTargetConstants/2826" } } } });
  ops.push({ campaignCriterionOperation: { create: { campaign: C, language: { languageConstant: "languageConstants/1000" } } } });
  for (const t of NEGS) ops.push({ campaignCriterionOperation: { create: { campaign: C, negative: true, keyword: { text: t, matchType: "BROAD" } } } });
  GROUPS.forEach((g, i) => {
    const G = R("adGroups", String(-3 - i));
    ops.push({ adGroupOperation: { create: { resourceName: G, name: g.name, campaign: C, status: "ENABLED", type: "SEARCH_STANDARD" } } });
    for (const k of g.kws) ops.push({ adGroupCriterionOperation: { create: { adGroup: G, status: "ENABLED", keyword: { text: k, matchType: "PHRASE" } } } });
    ops.push({ adGroupAdOperation: { create: { adGroup: G, status: "ENABLED", ad: { finalUrls: [g.url], responsiveSearchAd: { headlines: HEAD.map((text) => ({ text })), descriptions: DESC.map((text) => ({ text })), path1: "party-game", path2: "8-to-24" } } } } });
  });
  const j = await call("/googleAds:mutate", { mutateOperations: ops, validateOnly: !live });
  return live ? (j.mutateOperationResponses || []).length + " objects created; campaign " + ((j.mutateOperationResponses || [])[1] || {}).campaignResult?.resourceName : ops.length + " operations checked";
});
