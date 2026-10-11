#!/usr/bin/env python3
"""Build the iPhone app (index.html) from src/coach.html, the same source the Claude artifact uses.
Run:  python3 build.py   then commit and push. The service worker cache name changes with every build,
so installed phones pick up the new version the next time the app opens online."""
import hashlib, pathlib, re
root = pathlib.Path(__file__).parent
src = (root / "src" / "coach.html").read_text(encoding="utf-8")
ver = hashlib.sha1(src.encode()).hexdigest()[:10]

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="CA Coach">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#F2F4F5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111316" media="(prefers-color-scheme: dark)">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<script>window.CAC_STANDALONE=true;window.CAC_VERSION="%s";</script>
<script src="firebase-config.js"></script>
<script src="auth.js"></script>
""" % ver

TAIL = """
<script>
if("serviceWorker" in navigator){addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").then(r=>{
  r.addEventListener("updatefound",()=>{const w=r.installing;w&&w.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller){try{toast("Update ready. Close and reopen the app to use it.")}catch(_){}}})});
}).catch(()=>{})})}
</script>
</body>
</html>
"""
# the source starts at <title>; its tags belong in <head> until the first <div class="wrap">, which starts the body
cut = src.index('<div class="wrap">')
page = HEAD + src[:cut] + "</head>\n<body>\n" + src[cut:] + TAIL
(root / "index.html").write_text(page, encoding="utf-8")
sw = (root / "sw.template.js").read_text(encoding="utf-8").replace("__VERSION__", ver)
(root / "sw.js").write_text(sw, encoding="utf-8")
print("built index.html + sw.js, version", ver, f"({len(page)//1024} KB)")
