#!/usr/bin/env python3
"""
DETAR — Lokal-Prototyp bauen (2026-09-03): packt die App in EINE HTML-Datei,
die per Doppelklick läuft (kein Server, kein Kamerazugriff): Desktop-Modus mit
Phone-Rahmen + Dev-Panel, alle Module/Assets/Fonts eingebettet.

Technik: ES-Module bleiben Module — sie liegen als data:-URLs in einer
Import-Map (Spezifizierer „detar/<pfad>"), Assets als data:-URIs, tuning.json
als eingebettetes Objekt (fetch geht unter file:// nicht). three.js kommt vom
CDN (Internet nötig) — oder aus tools/vendor/three.module.js +
OrbitControls.js, wenn die Dateien dort liegen (dann komplett offline).

Aufruf:  python3 tools/build-lokal-prototyp.py [Zielpfad.html]
"""
import base64, json, mimetypes, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "DETAR_Lokal_Prototyp.html")
CDN_THREE = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
CDN_ADDONS = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
VENDOR = os.path.join(ROOT, "tools", "vendor")

def read(p, mode="r"):
    with open(p, mode, encoding=None if "b" in mode else "utf-8") as f: return f.read()

def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    if path.endswith(".svg"): mime = "image/svg+xml"
    if path.endswith(".ttf"): mime = "font/ttf"
    return "data:%s;base64,%s" % (mime, base64.b64encode(read(path, "rb")).decode())

def js_data_uri(src):
    return "data:text/javascript;base64," + base64.b64encode(src.encode("utf-8")).decode()

# --- Assets (alles unter assets/, außer Einblick — in v1 nicht aufgebaut) ---
assets = {}
for dp, _, files in os.walk(os.path.join(ROOT, "assets")):
    if "/einblick" in dp: continue
    for f in files:
        if f.startswith("."): continue
        full = os.path.join(dp, f)
        rel = "./" + os.path.relpath(full, ROOT).replace(os.sep, "/")
        assets[rel] = data_uri(full)

def inline_literals(src):
    # feste Pfad-Literale "./assets/…" und "../assets/…" durch data:-URIs ersetzen
    def rep(m):
        q, path = m.group(1), m.group(2)
        key = "./" + path.split("assets/", 1)[1] if False else "./assets/" + path.split("assets/", 1)[1]
        return q + assets.get(key, path) + q
    return re.sub(r'(["\'(])(\.\.?/assets/[^"\')]+)(?=["\')])', lambda m: m.group(1) + assets.get("./assets/" + m.group(2).split("assets/", 1)[1], m.group(2)), src)

# --- Module einsammeln + Spezifizierer umschreiben --------------------------
modules = {}  # "detar/js/main.js" → Quelltext
def add_module(rel):
    src = read(os.path.join(ROOT, rel))
    d = os.path.dirname(rel)
    def resolve(spec):
        if spec.startswith("."):
            return "detar/" + os.path.normpath(os.path.join(d, spec)).replace(os.sep, "/")
        return spec  # three, three/addons/…, mindar-image-three
    src = re.sub(r'(from\s+|import\s*\(\s*|import\s+)(["\'])([^"\']+)\2',
                 lambda m: m.group(1) + m.group(2) + resolve(m.group(3)) + m.group(2), src)
    src = inline_literals(src)
    modules["detar/" + rel] = src

for dp, _, files in os.walk(os.path.join(ROOT, "js")):
    for f in files:
        if f.endswith(".js"): add_module(os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, "/"))
for f in os.listdir(os.path.join(ROOT, "cards")):
    if f.endswith(".js"): add_module("cards/" + f)

# --- Gezielte Patches für den Einzeldatei-Betrieb ----------------------------
def patch(name, old, new):
    key = "detar/" + name
    assert old in modules[key], "Patch-Stelle fehlt in %s: %s" % (name, old[:50])
    modules[key] = modules[key].replace(old, new)

patch("js/main.js", 'const DESKTOP_MODE = params.has("desktop");',
      'const DESKTOP_MODE = params.has("desktop") || !!window.__LOKAL; // Lokal-Prototyp: immer Desktop')
patch("js/main.js", 'const DEV_MODE = params.has("dev");',
      'const DEV_MODE = params.has("dev") || !!window.__LOKAL;')
patch("js/config.js", '    const res = await fetch("./tuning.json", { cache: "no-store" });',
      '    if (window.__TUNING) { const s = window.__TUNING; for (const [name, obj] of Object.entries(ALL)) if (s[name]) Object.assign(obj, s[name]); return true; }\n'
      '    const res = await fetch("./tuning.json", { cache: "no-store" });')
patch("js/rig.js", "const t = texLoader.load(url);", "const t = texLoader.load(__asset(url));")
patch("js/supportUI.js", 'im.src = ICON_DIR + f + ".png";', 'im.src = __asset(ICON_DIR + f + ".png");')
patch("js/supportUI.js", 'this.img.src = ICON_DIR + name + ".png";', 'this.img.src = __asset(ICON_DIR + name + ".png");')

# --- Import-Map -----------------------------------------------------------------
imports = {k: js_data_uri(v) for k, v in modules.items()}
three_local = os.path.join(VENDOR, "three.module.js")
orbit_local = os.path.join(VENDOR, "OrbitControls.js")
offline = os.path.exists(three_local) and os.path.exists(orbit_local)
if offline:
    imports["three"] = js_data_uri(read(three_local))
    imports["three/addons/controls/OrbitControls.js"] = js_data_uri(read(orbit_local))
else:
    imports["three"] = CDN_THREE
    imports["three/addons/"] = CDN_ADDONS
imports["mindar-image-three"] = js_data_uri("export const MindARThree = null; // Lokal-Prototyp: kein AR")

# --- HTML zusammensetzen ---------------------------------------------------------
html = read(os.path.join(ROOT, "index.html"))
css = inline_literals(read(os.path.join(ROOT, "css/app.css"))) + "\n" + inline_literals(read(os.path.join(ROOT, "css/question-menu.css")))
html = re.sub(r'\s*<link rel="stylesheet" href="./css/app.css" />', "", html)
html = html.replace('  <link rel="stylesheet" href="./css/question-menu.css" />', "  <style>\n" + css + "\n  </style>")
html = re.sub(r'<script type="importmap">.*?</script>', lambda m: '<script type="importmap">' + json.dumps({"imports": imports}) + '</script>', html, flags=re.S)
html = inline_literals(html)
tuning = json.loads(read(os.path.join(ROOT, "tuning.json")))
# Nur-Lokal-Verhalten (2026-09-04): hüpfendes Icon auf der Karte; die CSS-
# Änderungen (Silkscreen-Laufweite, Raster-Drift, Laola, enges Raster) hängen
# an body.lokal — beides greift in der Live-App nicht.
tuning.setdefault("ACTFX", {})["hopper"] = "ja"
boot = ("<script>window.__LOKAL = true; document.body.classList.add('lokal'); window.__TUNING = %s; window.__ASSETS = %s; "
        "window.__asset = (p) => (window.__ASSETS[p] ?? p);</script>") % (json.dumps(tuning), json.dumps(assets))
html = html.replace('<script type="module" src="./js/main.js"></script>',
                    boot + '\n  <script type="module">import "detar/js/main.js";</script>')
html = html.replace("<title>DEIN ERSTER TAG — AR</title>",
                    "<title>DETAR — Lokal-Prototyp (%s)</title>" % ("offline" if offline else "three.js vom CDN"))
with open(OUT, "w", encoding="utf-8") as f: f.write(html)
print("geschrieben: %s (%.1f MB, %d Module, %d Assets, three.js %s)" % (
    OUT, os.path.getsize(OUT) / 1e6, len(modules), len(assets), "eingebettet" if offline else "vom CDN"))
