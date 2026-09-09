#!/usr/bin/env python3
"""
DETAR — Lokal-Prototyp bauen (2026-09-03): packt die App in EINE HTML-Datei,
die per Doppelklick läuft (kein Server, kein Kamerazugriff): Desktop-Modus mit
Phone-Rahmen + Dev-Panel, alle Module/Assets/Fonts eingebettet.

Technik: ES-Module bleiben Module — sie liegen als data:-URLs in einer
Import-Map (Spezifizierer „detar/<pfad>"), Assets als data:-URIs, tuning.json
als eingebettetes Objekt (fetch geht unter file:// nicht). three.js kommt aus
vendor/three/ (schlankes Bundle + OrbitControls, seit 2026-09-09 relative
Imports ohne Importmap in der App) — komplett offline. Die Import-Map bleibt
NUR hier im Einzeldatei-Export nötig (data:-URLs können sich nicht relativ
gegenseitig importieren); die Live-App kommt seit der Production-Härtung
(2026-09-09) ohne aus.

Aufruf:  python3 tools/build-lokal-prototyp.py [Zielpfad.html]
"""
import base64, json, mimetypes, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "DETAR_Lokal_Prototyp.html")
VENDOR = os.path.join(ROOT, "vendor", "three")  # seit 2026-09-09: das schlanke Bundle der App

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
        return spec  # (seit 2026-09-09 nur noch relative Spezifizierer — three kommt aus vendor/)
    src = re.sub(r'(from\s+|import\s*\(\s*|import\s+)(["\'])([^"\']+)\2',
                 lambda m: m.group(1) + m.group(2) + resolve(m.group(3)) + m.group(2), src)
    src = inline_literals(src)
    modules["detar/" + rel] = src

for dp, _, files in os.walk(os.path.join(ROOT, "js")):
    for f in files:
        if f.endswith(".js"): add_module(os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, "/"))
for f in os.listdir(os.path.join(ROOT, "cards")):
    if f.endswith(".js"): add_module("cards/" + f)
# three.js + OrbitControls wie normale Module (relative Imports ../vendor/three/…
# aus js/ bzw. ../../three.module.js aus OrbitControls.js lösen auf dieselben Keys)
for rel in ("vendor/three/three.module.js", "vendor/three/addons/controls/OrbitControls.js"):
    assert os.path.exists(os.path.join(ROOT, rel)), "fehlt: " + rel + " (tools/build-three.sh)"
    add_module(rel)

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
# (8th Wall, 2026-09-09: die Engine wird von main.js erst im AR-Modus per Skript-Tag
# geladen — im Lokal-Prototyp (immer Desktop) passiert das nie; auch der JS-Preload in
# boot() ist an !DESKTOP_MODE gebunden. Die Regex unten räumt vorsorglich statische
# Preload-Links aus index.html weg, falls dort wieder welche stehen.)

# --- HTML zusammensetzen ---------------------------------------------------------
html = read(os.path.join(ROOT, "index.html"))
css = inline_literals(read(os.path.join(ROOT, "css/app.css"))) + "\n" + inline_literals(read(os.path.join(ROOT, "css/question-menu.css")))
html = re.sub(r'\s*<link rel="stylesheet" href="./css/app.css" />', "", html)
html = html.replace('  <link rel="stylesheet" href="./css/question-menu.css" />', "  <style>\n" + css + "\n  </style>")
# Import-Map NUR im Einzeldatei-Export (index.html hat seit 2026-09-09 keine mehr)
html = re.sub(r'<script type="importmap">.*?</script>\s*', "", html, flags=re.S)
html = html.replace("</head>", '  <script type="importmap">' + json.dumps({"imports": imports}) + '</script>\n</head>', 1)
html = inline_literals(html)
html = re.sub(r'\s*<link rel="(?:module)?preload" href="./vendor/8thwall/[^"]+"[^>]*>', "", html)
tuning_path = os.path.join(ROOT, "tuning.json")
tuning = json.loads(read(tuning_path)) if os.path.exists(tuning_path) else {}  # seit 2026-09-09 optional
boot = ("<script>window.__LOKAL = true; window.__TUNING = %s; window.__ASSETS = %s; "
        "window.__asset = (p) => (window.__ASSETS[p] ?? p);</script>") % (json.dumps(tuning), json.dumps(assets))
html = html.replace('<script type="module" src="./js/main.js"></script>',
                    boot + '\n  <script type="module">import "detar/js/main.js";</script>')
html = html.replace("<title>DEIN ERSTER TAG — AR</title>", "<title>DETAR — Lokal-Prototyp (offline)</title>")
with open(OUT, "w", encoding="utf-8") as f: f.write(html)
print("geschrieben: %s (%.1f MB, %d Module, %d Assets, three.js eingebettet)" % (
    OUT, os.path.getsize(OUT) / 1e6, len(modules), len(assets)))
