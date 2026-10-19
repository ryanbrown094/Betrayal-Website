#!/bin/sh
# Assemble src/ into one self-contained game page (index.html — also runs standalone), wrap it as worker/public/play.html
# (served at /t/CODE), and copy the home page (site/index.html) to worker/public/index.html.
set -e
cd "$(dirname "$0")"
mkdir -p worker/public
BUILD=$(date -u +%Y%m%d%H%M%S)
{
  printf '<title>The Betrayal</title>\n<style>\n'
  cat src/fonts.css src/style.css
  printf '</style>\n<div id="app"></div>\n<script>\n"use strict";\n'
  cat src/content.js src/scripts.js
  sed 's/^export function /function /' worker/src/public-view.js
  cat src/core.js src/audio.js src/art.js src/tv.js src/host.js src/diag.js src/boot.js
  printf '</script>\n'
} > index.html
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="build" content="%s">\n<meta name="theme-color" content="#09070a">\n<meta name="robots" content="noindex">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="The Betrayal">\n<title>The Betrayal</title>\n' "$BUILD"
  printf '<link rel="preload" href="/fonts/GrenzeGotisch-n300_900-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
  printf '<link rel="preload" href="/fonts/IMFellDWPica-n400-latin.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="apple-touch-icon" href="/icon-180.png">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">\n'
  printf '<style>html{color-scheme:dark}img{max-width:100%%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
  tail -n +2 index.html
  printf '\n</body>\n</html>\n'
} > worker/public/play.html
# the home page: sell, redeem a booking code, join a room (site/index.html, self-contained)
# Google Tag Manager goes first in the head (site/gtm.html, at __GTM__) and straight after <body> (site/gtm-body.html, at
# __GTM_BODY__) of the home page and every site page but /admin.
awk -v b="$BUILD" '/\/\*__FONTS__\*\//{while((getline l < "src/fonts.css")>0) print l; next} /^__GTM__$/{while((getline l < "site/gtm.html")>0) print l; next} /^__GTM_BODY__$/{while((getline l < "site/gtm-body.html")>0) print l; next} {gsub("__BUILD__", b); print}' site/index.html > worker/public/index.html
# the legal, checkout and guide pages: site/pages/NAME.html in site/page.html → worker/public/NAME.html, served at /NAME.
# Each starts with <!-- title: … --> (short name: nav, breadcrumbs; the <title> is "NAME · The Betrayal") and
# <!-- desc: … -->; an optional <!-- fulltitle: … --> replaces the whole <title>. The head gets a BreadcrumbList, plus
# site/pages/NAME.jsonld if it exists (more JSON-LD); 404, admin and seal get noindex instead.
SITE=https://thebetrayal.co.uk
for f in site/pages/*.html; do
  t=$(sed -n '1s/^<!-- title: \(.*\) -->$/\1/p' "$f"); d=$(sed -n 's/^<!-- desc: \(.*\) -->$/\1/p' "$f"); slug=$(basename "$f" .html)
  ft=$(sed -n 's/^<!-- fulltitle: \(.*\) -->$/\1/p' "$f"); [ -n "$ft" ] || ft="$t · The Betrayal"
  hf=$(mktemp)
  case "$slug" in
    404|admin|seal) printf '<meta name="robots" content="noindex">\n' > "$hf" ;;
    *) printf '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"The Betrayal","item":"%s/"},{"@type":"ListItem","position":2,"name":"%s","item":"%s/%s"}]}</script>\n' "$SITE" "$t" "$SITE" "$slug" > "$hf"
       if [ -f "site/pages/$slug.jsonld" ]; then { printf '<script type="application/ld+json">\n'; cat "site/pages/$slug.jsonld"; printf '</script>\n'; } >> "$hf"; fi ;;
  esac
  awk -v b="$BUILD" -v t="$t" -v ft="$ft" -v d="$d" -v slug="$slug" -v body="$f" -v hf="$hf" '/\/\*__FONTS__\*\//{while((getline l < "src/fonts.css")>0) print l; next} /^__GTM__$/{if (slug != "admin") while((getline l < "site/gtm.html")>0) print l; next} /^__GTM_BODY__$/{if (slug != "admin") while((getline l < "site/gtm-body.html")>0) print l; next} /^__HEAD__$/{while((getline l < hf)>0) print l; next} /^__BODY__$/{getline l < body; while((getline l < body)>0) if (l !~ /^<!-- (desc|fulltitle): /) print l; next} {gsub("__BUILD__", b); gsub("__FULLTITLE__", ft); gsub("__TITLE__", t); gsub("__DESC__", d); gsub("__SLUG__", slug); print}' site/page.html > "worker/public/$(basename "$f")"
  rm -f "$hf"
done
# the sitemap: the home page and every indexable page, each dated by the last commit of its source (today if it has
# uncommitted changes, or without git)
lastmod() { if [ -z "$(git status --porcelain -- "$1" 2>/dev/null)" ] && m=$(git log -1 --format=%cs -- "$1" 2>/dev/null) && [ -n "$m" ]; then echo "$m"; else date -u +%Y-%m-%d; fi; }
{
  printf '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  printf '<url><loc>%s/</loc><lastmod>%s</lastmod></url>\n' "$SITE" "$(lastmod site/index.html)"
  for f in site/pages/*.html; do
    slug=$(basename "$f" .html); case "$slug" in 404|admin|seal) continue ;; esac
    printf '<url><loc>%s/%s</loc><lastmod>%s</lastmod></url>\n' "$SITE" "$slug" "$(lastmod "$f")"
  done
  printf '</urlset>\n'
} > worker/public/sitemap.xml
# llms-full.txt for AI assistants: worker/public/llms.txt (hand-written) then the plain text of the rules and the guides
{
  cat worker/public/llms.txt
  for slug in rules traitors-at-home party-games-for-large-groups; do
    printf '\n\n---\n\nSource: %s/%s\n\n' "$SITE" "$slug"
    awk '/^<(style|script)>/{skip=1} skip{if(/^<\/(style|script)>/)skip=0; next} /^<!-- /||/class="toc"/{next} {print}' "site/pages/$slug.html" |
      sed -e 's/<h1[^>]*>/# /; s/<h2[^>]*>/\n## /; s/<h3[^>]*>/\n### /; s/<li>/- /g; s/<dt>/- /g; s/<dd>/  /g; s/<\/tr>//g; s/<\/t[dh]>/ | /g' \
          -e 's/<[^>]*>//g; s/&amp;/\&/g; s/&nbsp;/ /g' | sed -e 's/ | $//' | cat -s
  done
} > worker/public/llms-full.txt
# the content banks for the server (Modern runs its game on the Worker): src/content.js as a module
{ printf '// generated by build.sh from src/content.js: do not edit\n'; cat src/content.js; printf '\nexport { QUIZ_E, QUIZ_M, QUIZ_H, LIKELY, ESTIMATE, MEMSETS, CHARADES, SONGS, SNAPSYM, PICTIONARY, COLORS };\n'; } > worker/src/content.gen.js
# Modern's page (phones, the TV and the director): /join, /m/CODE, and /t/CODE for a Modern Table
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="build" content="%s">\n<meta name="theme-color" content="#09070a">\n<meta name="robots" content="noindex">\n<title>The Betrayal</title>\n' "$BUILD"
  printf '<link rel="preload" href="/fonts/IMFellDWPica-n400-latin.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="apple-touch-icon" href="/icon-180.png">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">\n'
  # the preview card when a host sends thebetrayal.co.uk/join to their guests
  D="You're invited to a game of The Betrayal. Type the Table code and your name, and get your secret role on your phone. No app, no account."
  printf '<meta name="description" content="%s">\n<meta property="og:title" content="Join a game of The Betrayal"><meta property="og:description" content="%s"><meta property="og:type" content="website"><meta property="og:site_name" content="The Betrayal"><meta property="og:locale" content="en_GB">\n' "$D" "$D"
  printf '<meta property="og:image" content="%s/media/og-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="The Betrayal: the party game of loyalty and lies"><meta name="twitter:card" content="summary_large_image">\n' "$SITE"
  printf '<style>\nhtml{color-scheme:dark}[hidden]{display:none!important}\n'
  cat src/fonts.css src/modern.css
  printf '</style>\n</head>\n<body>\n<div id="app"></div>\n<script>\n"use strict";\n'
  sed -n '/^const esc = /p' src/core.js
  cat src/art.js src/qr.js src/audio.js src/modern-ui.js
  printf '</script>\n</body>\n</html>\n'
} > worker/public/modern.html
mkdir -p worker/public/media && if [ -d media/web ]; then cp media/web/* worker/public/media/; fi
cp site/consent.js worker/public/consent.js
# /media/* is cached for a week, so every page asks for each image by a fingerprint of its contents (?v=…): a changed
# image gets a new address and nobody sees a stale one.
python3 - <<'PY'
import hashlib, pathlib, re
pub = pathlib.Path('worker/public'); media = pub / 'media'
ver = {f.name: hashlib.md5(f.read_bytes()).hexdigest()[:8] for f in media.iterdir() if f.is_file()}
for page in pub.glob('*.html'):
    s = page.read_text(encoding='utf-8')
    t = re.sub(r'(/media/)([\w.-]+)(\?v=\w+)?', lambda m: m.group(1) + m.group(2) + ('?v=' + ver[m.group(2)] if m.group(2) in ver else ''), s)
    if t != s: page.write_text(t, encoding='utf-8')
PY
printf '%s\n' "$BUILD" > worker/public/build.txt
echo "wrote worker/public/play.html + index.html (build $BUILD)"
