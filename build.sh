#!/bin/sh
# Assemble src/ into one self-contained game page (index.html — also runs standalone), wrap it as worker/public/play.html
# (served at /g/CODE), and copy the home page (site/index.html) to worker/public/index.html.
set -e
cd "$(dirname "$0")"
mkdir -p worker/public
BUILD=$(date -u +%Y%m%d%H%M%S)
{
  printf '<title>Cloak &amp; Candle</title>\n<style>\n'
  cat src/fonts.css src/style.css
  printf '</style>\n<div id="app"></div>\n<script>\n"use strict";\n'
  cat src/content.js src/scripts.js
  sed 's/^export function /function /' worker/src/public-view.js
  cat src/core.js src/audio.js src/art.js src/tv.js src/host.js src/diag.js src/boot.js
  printf '</script>\n'
} > index.html
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="build" content="%s">\n<meta name="theme-color" content="#09070a">\n<meta name="robots" content="noindex">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Cloak &amp; Candle">\n' "$BUILD"
  printf '<link rel="preload" href="/fonts/GrenzeGotisch-n300_900-latin.woff2" as="font" type="font/woff2" crossorigin>\n'
  printf '<link rel="apple-touch-icon" href="/icon-180.png">\n<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">\n'
  printf '<style>html{color-scheme:dark}img{max-width:100%%}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
  cat index.html
  printf '\n</body>\n</html>\n'
} > worker/public/play.html
# the home page: sell, redeem a pass, join a room (site/index.html, self-contained)
awk -v b="$BUILD" '/\/\*__FONTS__\*\//{while((getline l < "src/fonts.css")>0) print l; next} {gsub("__BUILD__", b); print}' site/index.html > worker/public/index.html
# the legal and checkout pages: site/pages/NAME.html (first line <!-- title: … -->) in site/page.html → worker/public/NAME.html, served at /NAME
for f in site/pages/*.html; do
  t=$(sed -n '1s/^<!-- title: \(.*\) -->$/\1/p' "$f")
  awk -v b="$BUILD" -v t="$t" -v body="$f" '/\/\*__FONTS__\*\//{while((getline l < "src/fonts.css")>0) print l; next} /^__BODY__$/{getline l < body; while((getline l < body)>0) print l; next} {gsub("__BUILD__", b); gsub("__TITLE__", t); print}' site/page.html > "worker/public/$(basename "$f")"
done
mkdir -p worker/public/media && if [ -d media/web ]; then cp media/web/* worker/public/media/; fi
printf '%s\n' "$BUILD" > worker/public/build.txt
echo "wrote worker/public/play.html + index.html (build $BUILD)"
