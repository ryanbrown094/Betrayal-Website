// The cookie banner for Google Tag Manager on the site's own pages (never in the game). Tag Manager is in every page's
// head (site/gtm.html) behind Consent Mode defaults: until the visitor says yes Google sets no cookies and gets only
// cookieless signals; a yes lets its advertising cookies on, as UK cookie law requires. The choice is remembered
// ("bt-consent": "yes" or "no"). window.btCookieChoice() reopens the banner (the cookies page links to it).
// build.sh copies this to worker/public/.
(() => {
  let choice = null, box = null;
  try { choice = localStorage.getItem("bt-consent") } catch (e) {}
  function set(v) {
    choice = v; try { localStorage.setItem("bt-consent", v) } catch (e) {}
    if (box) { box.remove(); box = null; document.body.style.paddingBottom = "" }
    if (window.gtag) gtag("consent", "update", v === "yes" ? { ad_storage: "granted", ad_user_data: "granted" } : { ad_storage: "denied", ad_user_data: "denied" });
    // Tag Manager's Conversion Linker also fires on this, so the ad click is saved the moment they say yes
    if (v === "yes" && window.dataLayer) dataLayer.push({ event: "bt_consent_yes" });
  }
  function banner() {
    if (box) return;
    box = document.createElement("div"); box.className = "bt-consent"; box.setAttribute("role", "region"); box.setAttribute("aria-label", "Cookies");
    box.innerHTML = '<style>.bt-consent{position:fixed;left:0;right:0;bottom:0;z-index:50;background:#140c15;border-top:1px solid rgba(230,165,140,.45);box-shadow:0 -10px 30px rgba(0,0,0,.5);padding:14px max(16px,env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));font:15.5px/1.45 "Alegreya Sans",system-ui,sans-serif;color:#e8d0c8}'
      + '.bt-consent .in{max-width:980px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:10px 20px}.bt-consent p{margin:0;flex:1 1 320px;color:#d9c2ba}.bt-consent a{color:#e6a58c}'
      + '.bt-consent .b{display:flex;gap:10px}.bt-consent button{min-height:44px;padding:8px 20px;border-radius:3px;border:1px solid #e6a58c;font:700 15px/1 "Alegreya Sans SC","Alegreya Sans",sans-serif;letter-spacing:.04em;cursor:pointer}'
      + '.bt-consent .y{background:#e6a58c;color:#150b17}.bt-consent .n{background:transparent;color:#e8d0c8}</style>'
      + '<div class="in"><p>Can we use Google’s advertising cookies? They tell us which of our adverts bring people here, and nothing else. They stay off unless you say yes. <a href="/cookies">More about cookies</a></p>'
      + '<div class="b"><button type="button" class="n">No thanks</button><button type="button" class="y">Yes, that’s fine</button></div></div>';
    box.querySelector(".y").onclick = () => set("yes"); box.querySelector(".n").onclick = () => set("no");
    document.body.append(box); document.body.style.paddingBottom = box.offsetHeight + "px";
  }
  window.btCookieChoice = () => { choice = null; try { localStorage.removeItem("bt-consent") } catch (e) {} banner() };
  const start = () => { if (/^\/(admin|survey)/.test(location.pathname)) return; if (choice !== "yes" && choice !== "no") banner() };
  if (document.body) start(); else addEventListener("DOMContentLoaded", start);
})();
