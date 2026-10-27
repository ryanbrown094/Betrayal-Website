// IndexNow: Bing (and the answer engines that search with it), Yandex and others hear each morning of the pages whose
// sitemap date is yesterday's, so a change is announced once, the day after it went live. The key is public by design:
// the file /<key>.txt (worker/public) shows them the site is ours. The morning job (index.js, scheduled) calls it.
export const INDEXNOW_KEY = "bf82ab3429e18a1fab22aec3893016c2";
export async function indexNow(env, now = Date.now()) {
  const host = env.SITE_HOST || "thebetrayal.co.uk", day = new Date(now - 86400000).toISOString().slice(0, 10);
  const xml = await (await env.ASSETS.fetch(new Request("https://" + host + "/sitemap.xml"))).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].filter((m) => m[2] === day && new URL(m[1]).host === host).map((m) => m[1]);
  if (!urls.length) return { sent: 0 };
  const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: "https://" + host + "/" + INDEXNOW_KEY + ".txt", urlList: urls }) });
  if (!r.ok) throw new Error("IndexNow refused " + urls.length + " pages: " + r.status);
  return { sent: urls.length, status: r.status };
}
