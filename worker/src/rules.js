// Write rules and the poll tag, shared by the Worker and the local stand-in (qa/server.mjs) so both behave the same.

// Whether a host's save may replace what is stored. null means yes; otherwise the refusal to send back.
//  - a game that was wiped (or replaced) can't come back from a phone that still holds it (410)
//  - a different game than the one running is refused, and that phone is handed the running one (409)
//  - a save built on anything other than the stored version loses the same way: every save names the version it was
//    made from (pvid), so a phone that fell behind can never skip over another phone's move by jumping its number
export function writeVerdict(current, next, wiped) {
  if (!next || typeof next !== "object") return { status: 400, text: "Expected {state}" };
  if (!next.hostPin) return { status: 400, text: "State needs a hostPin" };
  if (!current) return next.gid && (wiped || []).includes(next.gid) ? { status: 410, body: { state: null, auth: true, gone: true } } : null;
  if (next.hostPin !== current.hostPin) return { status: 400, text: "The PIN cannot change mid-game" };
  const conflict = { status: 409, body: { state: current, auth: true, conflict: true } };
  if (current.gid !== next.gid) return conflict;
  if ((next.ver || 0) <= (current.ver || 0)) return conflict;
  if (current.vid && next.pvid !== undefined && next.pvid !== current.vid) return conflict;
  return null;
}
// what a poll already has: when it matches, the reply is a few bytes instead of the whole game
export const tagOf = (current, authed) => (current ? current.gid + "." + (current.ver || 0) + "." + (current.vid || "") : "empty") + (authed ? ".a" : ".p");
// remember the last few wiped games
export const addWiped = (list, gid) => gid ? [...(list || []).filter(g => g !== gid), gid].slice(-8) : (list || []);
