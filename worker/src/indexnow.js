// IndexNow: Bing (and the answer engines that search with it), Yandex and others hear each morning of the pages whose
// sitemap date is after the last morning that got through, up to yesterday's, so a change is announced the day after it
// went live, and a morning that was turned away is made up the next. The key is public by design: the file /<key>.txt
// (worker/public) shows them the site is ours. The morning job (index.js, scheduled) calls it with the last good day.
export const INDEXNOW_KEY = "bf82ab3429e18a1fab22aec3893016c2";
// any one of them shares a submission with the rest; the next is tried when one turns it away (429: too many from the
// Worker's shared address)
export const INDEXNOW_AT = ["https://api.indexnow.org/indexnow", "https://www.bing.com/indexnow", "https://yandex.com/indexnow"];
const ymd = (t) => new Date(t).toISOString().slice(0, 10);
export async function indexNow(env, now = Date.now(), since = null) {
  const host = env.SITE_HOST || "thebetrayal.co.uk", day = ymd(now - 86400000), oldest = ymd(now - 15 * 86400000);
  const after = since && since > oldest ? since : oldest;
  const xml = await (await env.ASSETS.fetch(new Request("https://" + host + "/sitemap.xml"))).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].filter((m) => m[2] > after && m[2] <= day && new URL(m[1]).host === host).map((m) => m[1]);
  if (!urls.length) return { sent: 0, through: day };
  const body = JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: "https://" + host + "/" + INDEXNOW_KEY + ".txt", urlList: urls }), no = [];
  for (const at of INDEXNOW_AT) {
    const r = await fetch(at, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) return { sent: urls.length, status: r.status, via: new URL(at).host, through: day };
    const wait = r.headers && r.headers.get("Retry-After");
    no.push(new URL(at).host + " " + r.status + (wait ? " (retry after " + wait + ")" : ""));
  }
  throw new Error("IndexNow refused " + urls.length + " pages: " + no.join(", "));
}
