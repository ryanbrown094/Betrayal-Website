// The iPhone app's tiers (ryanbrown094/Betrayal-App). A room's tier is fixed by the code that opens it and can only go up:
//   free   no code: ads between rounds, the base Trials and question banks
//   night  a Night Pass (pool "app", kind "night"): one 24-hour window of ad-free games, everything unlocked
//   host   a Host Pass (pool "app", kind "host"): a subscription, ad-free games while it's paid, everything unlocked
//   full   the website's codes, the master passcode and open access: as the website has always played
// The app's codes are a pool of their own: they open Tables only in the app, and the website's only on the website.
export const RANK = { free: 0, night: 1, host: 2, full: 3 };
export const NIGHT_MS = 24 * 3600000;

// the tier a code gives a room it opens (v: the code's record; none for a free room)
export const tierFor = (v) => (!v ? "free" : v.pool !== "app" ? "full" : v.kind === "host" ? "host" : v.kind === "night" ? "night" : "free");
// never down: a pass that lapses mid-game leaves the game as it was
export const higher = (a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);
// what the phones and the TV read with every poll
export const tierView = (tier) => ({ tier, adFree: tier !== "free", content: tier === "free" ? "base" : "all" });

// what an app code can do now, for the app's list of codes. A Night Pass whose 24 hours are over reads "ended" here;
// the Registry checks whether its night comes back (no game in it reached a first round).
export function statusOf(v, now) {
  if (v.revoked) return { kind: v.kind, state: "cancelled" };
  if (v.kind === "night") return !v.activeUntil ? { kind: "night", state: "ready" } : now < v.activeUntil ? { kind: "night", state: "active", until: v.activeUntil } : { kind: "night", state: "ended", until: v.activeUntil };
  if (v.kind === "host") return { kind: "host", state: v.subActive ? "active" : "lapsed", ...(v.subExpires ? { until: v.subExpires } : {}) };
  return { kind: v.kind || "one", state: "unknown" };
}
