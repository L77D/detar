# DETAR — Umstieg auf 8th Wall Image Targets (Branch `8thwall-image-targets` → `v2tracker-lean` → `v2tracker-prod`)

Stand 2026-09-09 (Abschnitt 7 = Production-Härtung, Branch `v2tracker-prod`). Ersetzt MindAR (`mind-ar@1.2.5`) als Kamera- und Tracking-
System durch die **Open-Source-8th-Wall-Engine** (MIT, github.com/8thwall/8thwall)
im reinen Bildtracking-Modus. Figur, Rig, Animationen, Sound, Dialogsystem,
Menü-UI, Splash, PoseStabilizer und Gyro-Fusion sind unverändert.

Regeln, nach denen umgebaut wurde:

1. **Nur Bildtracking, kein SLAM.** `XR8.XrController.configure({disableWorldTracking: true})`
   vor `pipelineModule()` und `XR8.run()`. Die Open-Source-Engine enthält gar
   kein SLAM; der Chunk-Name `slam` lädt dort `xr-tracking.js` = der offene
   Bildtracker. Ein geschlossenes Binary (`@8thwall/engine-binary`, `xr-slam.js`)
   wird nie angefordert.
2. **Logik & Assets bleiben.** Getauscht wurden nur Kamera-System, Skript-
   Import und die Tracking-Event-Listener (`js/main.js`, `index.html`).
3. **Lazy Start.** Die Engine wird erst im Klick auf „Scan starten" per Skript-
   Tag geladen (`loadEngine()`); Kamera erst mit `XR8.run()` danach. Der Splash
   war schon vorher da — neu ist, dass vor dem Klick kein Engine-Code läuft.
4. **1:1.** Eine Seite = eine Karte = ein Target (`targets/8thwall/card.json`).
5. **DSGVO / Selbst-Hosting.** Engine unter `vendor/8thwall/` im Repo, relative
   Pfade, kein CDN für 8th Wall, kein API-Key, keine Analytics. Die Engine-
   Quellen wurden auf Netzaufrufe geprüft (s. u.). three.js liegt seit
   `v2tracker-lean` als schlankes Bundle in `vendor/three/` (kein CDN), seit
   `v2tracker-prod` per relativem Import ohne Importmap (Abschnitt 7).

---

## 1. Target-Migration: Kartenbild → 8th-Wall-Target (`image-target-cli`)

8th Wall kompiliert nichts vor. Das Target ist eine **JSON-Beschreibung plus ein
Graustufenbild 480×640**, das die Engine zur Laufzeit lädt und selbst
featurisiert. Die JSON erzeugt das MIT-Werkzeug `@8thwall/image-target-cli`.

### Voraussetzungen

- Node ≥ 18 (`sharp` wird als native Abhängigkeit installiert)
- Das Quellbild: dasselbe wie für das bisherige `.mind`-Target, also
  `Assets/September/demo_skat_070926_mind_cropped.png` (1346 × 2156 px).

### Schritte

```bash
# 1. CLI starten (interaktiv — es gibt keine Flags)
npx @8thwall/image-target-cli@latest
```

Antworten auf die Prompts:

| Prompt | Antwort |
|---|---|
| `Enter the path to the image file:` | Pfad zum Kartenbild (Anführungszeichen/`~` erlaubt) |
| `Select the image type:` | leer lassen = `flat` (Default) |
| `Use default crop? [Y/n]` | leer lassen = Ja |
| `Enter the output folder:` | z. B. `targets/8thwall` im Repo |
| `Enter a name for the image target:` | `card` (main.js lädt `card.json`) |

Nicht-interaktiv geht dasselbe per Pipe (so wurde das Target im Repo erzeugt):

```bash
printf '%s\n' "/pfad/zur/karte.png" "" "" "targets/8thwall" "card" \
  | OVERWRITE_FILES=true npx @8thwall/image-target-cli@latest
```

### Was herauskommt

```
targets/8thwall/
  card.json            ← Target-Beschreibung (Crop, Typ, Pfade)
  card_luminance.png   ← 480×640 Graustufen — DAS lädt die Engine (Pflicht)
  card_thumbnail.png   ← 262×350 Vorschau (optional, im Repo behalten)
  card_cropped.png     ← 1346×1795 Crop (nur Kontrolle, NICHT eingecheckt)
  card_original.png    ← Kopie des Originals (NICHT eingecheckt)
```

### Zwei Dinge, die man wissen muss

**a) Der Crop ist immer 3:4.** 8th-Wall-Targets sind Hochkant 3:4 (oder 4:3
quer). Die CLI schneidet beim Default-Crop **zentriert** auf 3:4: aus
1346 × 2156 wird 1346 × 1795 (`top: 181`), die **volle Kartenbreite bleibt**,
oben und unten fallen je 181 px weg. Für die Erkennung reicht das (der Kern
der Karte trägt die Merkmale); für die Geometrie ist es wichtig, weil
`js/main.js` die Kartenbreite aus dem Target ableitet:
`Kartenbreite = detail.scale × detail.scaledWidth` (scaledWidth = 0.75 beim
3:4-Hochkant-Crop). Wer einen **eigenen Crop** wählt (`Use default crop? n`),
muss die Breite auf die Kartenbreite lassen, sonst steht die Figur falsch
skaliert.

**b) `imagePath` in der JSON ist eine URL relativ zur Seite**, fest
`image-targets/<name>_luminance.png`. Damit der CLI-Ordner 1:1 nach
`targets/8thwall/` kopiert werden kann, ignoriert `main.js → loadTargetData()`
dieses Feld und löst `resources.luminanceImage` **neben der JSON** auf. Die
eingecheckte `card.json` trägt trotzdem den korrigierten Pfad, damit sie auch
für sich stimmt. Zusätzlich setzt `main.js` zur Laufzeit `moveable: true`
(Karte in der Hand) und `physicalWidthInMeters = SCENE.cardWidth` (0,059 m aus
`tuning.json`) — dadurch ist `detail.scale` metrisch und die mm-Werte in
`?stats` stimmen; die Figurgröße hängt davon NICHT ab.

### Neue Karte / neues Layout

1. Kartenbild wie oben durch die CLI schicken (Name `card`, Ordner
   `targets/8thwall`, Dateien überschreiben).
2. `SCENE.cardAspect` in `js/config.js` auf Höhe/Breite der **ganzen Karte**
   setzen (Eck-Marker) — wie bisher.
3. Alte MindAR-Dateien (`targets/card.mind`, `targets/old/*.mind`) werden von
   diesem Branch nicht mehr gelesen; sie liegen nur noch als Historie da und
   können nach dem Merge gelöscht werden.

---

## 2. Engine selbst hosten (`vendor/8thwall/`)

Es gibt (Stand 2026-09-09) **kein npm-Paket und kein Release** der Open-
Source-Engine — nur den Bazel-Build aus dem Monorepo. Das MIT-Engine-Bundle
(`bazel build --config=wasmreleasesimd //reality/app/xr/js:bundle`) liefert
`xr.js`, `xr-tracking.js`, `xr-face.js` und `resources/`. DETAR braucht davon:

```
vendor/8thwall/
  xr.js             ← Kern (Kamera-Pipeline, GlTextureRenderer, Threejs-Modul)
  xr-tracking.js    ← Bildtracker-Chunk (wird von xr.js als Chunk „slam" geladen;
                       WASM ist eingebettet, keine .wasm-Datei nötig)
  LICENSE           ← MIT, Niantic Spatial
  README.md         ← Herkunft (Commit), Build-Befehl, was weggelassen wurde
```

`xr-face.js` (Face Effects) und `resources/` (Face-/Semantik-Modelle, Tablet-
GLBs) werden für Bildtracking nicht geladen und bleiben weg. Genauer Build-
Weg und Commit: `vendor/8thwall/README.md`.

**Netzaufrufe (geprüft in `reality/app/xr/js/src` des Open-Source-Standes):**
kein `appKey`, keine Analytics, kein `fetch` an Niantic. Einzige Fundstellen:
`xr-constants.ts → verifyDomain()` liefert als Fallback den String
`apps.8thwall.com` (nur für die alte Hosted-Plattform relevant, in den
Tracking-Pfaden ungenutzt) und `XR8.Platform.registerAuthorizationTokenCallback`
in `tracking-controller.ts`, das nur bei VPS aktiviert würde (`start()` wird
nie gerufen). In den GEBAUTEN Dateien stehen zusätzlich zwei URL-Gruppen,
die nur von Codepfaden erreicht werden, die DETAR nie aufruft:
`cdn.8thwall.com/web/resources/draco-*` (Draco-Decoder für komprimierte
GLTF-Modelle — wir laden keine GLTF) und `cdn.jsdelivr.net/npm/@webxr-input-
profiles/…` (Hand-Modelle für WebXR-Headset-Sessions). Beim Bildtracking am
Handy wird nichts davon angefragt (Netzwerk-Tab prüfen: nur eigene Dateien).
Das Kamerabild bleibt auf dem Gerät.

---

## 3. Was sich im Code geändert hat

### Entfernt

- `mindar-image-three` aus der Importmap (`index.html`) und
  `await import("mindar-image-three")` in `js/main.js`.
- `MindARThree`-Instanz, `addAnchor(0)`, `anchor.onTargetFound/onTargetLost`,
  `mindarThree.start()`, der CSS3DRenderer-`pointerEvents`-Workaround.
- Der `getUserMedia`-Wrap für die Kamera-Auflösung (`CAM.width/height`,
  `?res=`): 8th Wall wählt die Auflösung über eine eigene Constraint-Leiter mit
  Retry; ein `ideal`-Eingriff würde mit `exact`-Constraints kollidieren.
- Die Neu-Erkennung per MindAR-Interna (`controller.trackingStates[0].isTracking = false`).
  `relocalize()` ruft jetzt nur noch `stab.reacquire()` (Median-Neuaufsetzen).
  8th Wall erkennt ohnehin fortlaufend neu; ein API-Eingriff gibt es nicht.

### Ersetzt

- **Kamera + Renderer:** `XR8.run({canvas, cameraConfig: {direction: BACK},
  allowedDevices: ANY})` mit den Pipeline-Modulen `XrController` (Tracker),
  `GlTextureRenderer` (Kamerabild), `Threejs` (Szene/Kamera/Renderer auf
  demselben Canvas) und dem eigenen Modul `detar`. Der Canvas wird von
  `main.js` angelegt und in Pixelgröße = CSS × min(devicePixelRatio, 2)
  gehalten (`CAM.maxPixelRatio` gilt weiter); `#xr-canvas` bekommt per CSS
  `width/height: 100% !important`, weil `renderer.setSize` sonst Pixelmaße als
  Inline-Stil schreibt.
- **Render-Schleife:** statt `renderer.setAnimationLoop(loop)` tickt `loop()`
  im `onUpdate` des Pipeline-Moduls; gerendert wird im `onRender` des Threejs-
  Moduls (`buildExperience({render: false})`).
- **Rohpose für den PoseStabilizer:** MindARs `anchor.group.matrix`
  (kamera-relativ, Scale = Target-Pixelbreite) → eigene Gruppe `anchor`
  (nicht in der Szene), Matrix = `Kamera⁻¹ × Bildpose`, Scale = Kartenbreite
  in Szeneneinheiten. `stabRoot` hängt dafür unter der **Kamera**. Der
  Stabilizer selbst (Normierung auf Kartenbreiten, Scale-Lock, Median,
  Extrapolation, Gyro-Brücke) ist unverändert, ebenso `worldRoot`
  (`rot.x = +90°`, `scale = 1/cardWidth`): das Bild-Koordinatensystem (XY-Ebene,
  +Z zur Kamera, Ursprung Bildmitte) ist bei beiden Engines gleich.
- **three.js-Kopplung:** `window.THREE = THREE` (die Engine verlangt das
  globale THREE ≥ r125; dieselbe Modul-Instanz aus der Importmap).
- **Kamera-Fehler:** `onCameraStatusChange({status: "failed", reason})` →
  `DENY_CAMERA` wird als `NotAllowedError` verworfen, sodass der vorhandene
  Kamera-abgelehnt-Bildschirm (`body.camera-denied`) unverändert greift.

### Tracking-Events (Zuordnung)

| MindAR (vorher) | 8th Wall (jetzt, `listeners` des Pipeline-Moduls) | Wirkung |
|---|---|---|
| `anchor.onTargetFound` | `reality.imagefound` | Suchrahmen aus, `stab.onFound()`, `controller.onCardSeen()`, `onTrackingFound()` |
| (Anchor-Matrix jeden Frame) | `reality.imageupdated` | neue Rohpose (`detail.position/rotation/scale`); feuert nur bei Änderung → unveränderte Frames zählen wie bei MindAR als „stale" |
| `anchor.onTargetLost` | `reality.imagelost` | `stab.onLost()`, Karte-verloren-Hinweis, `onTrackingLost()` |
| — | `reality.imagescanning` | Target geladen (Konsole) |

Event-Namen sind die der 8th-Wall-API (Modulname `reality` + Ereignis);
`detail` enthält `name, type ("FLAT"), position{x,y,z}, rotation{x,y,z,w},
scale, scaledWidth, scaledHeight, properties`.

### Sonstiges

- `js/config.js`: `STAB.filterMinCF/filterBeta/missTolerance/warmupTolerance`
  und `CAM.width/height` sind ohne Wirkung (Kommentar), bleiben für
  `tuning.json`-Kompatibilität.
- `tools/build-lokal-prototyp.py`: MindAR-Stub entfernt, Vendor-Preload-Links
  werden aus der Einzeldatei gestrichen. `tools/dev-server.js`: MIME für `.wasm`.
- `js/version.js`: Build 47/48 (Commit-Zahl der Branch-Commits).

---

## 4. Prüfen

1. **Rechner, ohne Kamera:** `node tools/dev-server.js` →
   `http://localhost:8743/?desktop&dev` — Desktop-Modus ist unberührt.
2. **Rechner, mit Webcam:** `http://localhost:8743/?stats` → „Scan starten" →
   Kamerafreigabe → Karte vor die Webcam (`allowedDevices: ANY` erlaubt das
   ohne World-Tracking). Konsole: `8th Wall XR Version …`, `DETAR Target
   geladen`, dann `Track: FOUND` in `?stats`.
3. **Handy:** braucht HTTPS. GitHub Pages liefert nur `main` des Repos —
   der Branch wird deshalb ins Spiegel-Repo `L77D/v2tracker` gepusht
   (`git push <remote> 8thwall-image-targets:main`) und ist unter
   https://l77d.github.io/v2tracker/ erreichbar; alternativ lokal per
   `ngrok http 8743`. Richtwerte in `?stats` wie bisher (Jitter stab < 0,3 mm
   in der Hand). Erwartung: Scale-Lock hält, weil 8th Wall `scale` pro Track
   konstant liefert — falls `Re-Erk.` in `?stats` hochzählt oder die Figur
   flackert, `STAB.scaleOutlier` prüfen.
4. **Ohne Engine-Dateien** (vor dem Build): „Scan starten" zeigt die Fehlerzeile
   „8th-Wall-Engine nicht ladbar: ./vendor/8thwall/xr.js …" — gewollt, kein
   stiller Fallback auf ein CDN.

## 5. Entschlackung (Branch `v2tracker-lean`, 2026-09-09)

Nach Michaels Handytest („Tracker deutlich besser als MindAR") wurde die App auf
das Nötigste reduziert — PNGs bewusst noch nicht (kommt separat):

- **Raus:** `js/portalView.js`, `PORTAL`-Block, Flat-Modus der Sprechblase,
  `assets/einblick/`, MindAR-Targets (`targets/*.mind`), `cards/lagerlogistik.js`,
  ungenutzte Logos, `tools/vendor/` (three-Kopie), `tuning.json` (Werte sind
  jetzt Defaults in `config.js`), MindAR-Keys `STAB.filterMinCF/filterBeta/
  missTolerance/warmupTolerance`, `CAM.width/height`, der `body.lokal`-Schalter
  (die Feinschliff-Regeln sind Standard).
- **Nur per Flag:** `debugOverlay` (?debug), `statsOverlay` (?stats),
  `devPanel` (?dev), `timeline` (?dev/?timeline — vorher jeder Start inkl.
  404 auf beats.theatre.json), `desktopMode`+`phoneFrame` (?desktop),
  `tuning.json` (?dev/?tuning).
- **three.js aus dem Repo:** `vendor/three/three.module.js`, tree-shaken auf die
  genutzten Klassen (473 KB / 120 KB gz statt 1,2 MB / 250 KB gz), kein CDN
  mehr; Bau: `tools/build-three.sh`.
- **Engine-Kern zugeschnitten:** `xr.js` ohne A-Frame/Babylon/PlayCanvas/
  Sumerian/CloudStudio-Adapter, MediaRecorder, CanvasScreenshot, LayersController
  (Sky/Semantik), Pixel-Array-Module — Patch in `vendor/8thwall/README.md`.
- **Preload:** nur noch `xr.js`; der Tracker-Chunk kommt erst nach dem Klick.
- **Bewusst NICHT angefasst:** der PoseStabilizer samt Toggles — ohne A/B am
  Gerät (`?dev` → Toggles 1–9, `?stats`-Zahlen) wäre Löschen Raten.

## 6. Offen / noch nicht am Gerät verifiziert

- Prüfstand-Seiten (`Tracking-Pruefstand/`) importieren noch MindAR-Pfade und
  müssten für einen A/B nachgezogen werden.
- Stabilizer-A/B am Gerät (welche der 9 Toggles noch etwas bringen) — dann
  `js/poseStabilizer.js` + `gyroFusion.js` entsprechend kürzen.
- ~~Figur-PNGs → WebP~~ — erledigt in `v2tracker-prod` (Abschnitt 7).
- Ob 8th Wall `detail.scale` bei bewegter Karte wirklich konstant hält (Scale-
  Lock-Annahme) — am Gerät über `Re-Erk.`/„Roh↔Stab" in `?stats` ablesen.
- Safari-Cache: `vendor/8thwall/*.js` sind groß; bei Engine-Updates Dateinamen
  versionieren oder den Build-Check in `?stats` nutzen.

## 7. Production-Härtung (Branch `v2tracker-prod`, 2026-09-09, Build 50–55)

Ziel: die App läuft auf möglichst vielen Schülerhandys, und wer durchs Raster
fällt, bekommt eine verständliche Meldung statt einer leeren Seite. Jede
Änderung ist ein eigener Commit (Build 50–54), Doku = Build 55.

### 7.1 Was gemacht wurde

| # | Maßnahme | Ergebnis |
|---|---|---|
| 1 | **Importmap entfernt** — `js/*.js` importieren `../vendor/three/three.module.js` direkt, `OrbitControls.js` importiert `../../three.module.js` (sed in `tools/build-three.sh`); `tools/build-lokal-prototyp.py` bettet three + OrbitControls als normale Module ein (die Import-Map bleibt NUR im Einzeldatei-Export). | Grenze iOS 16.4 / Chrome 89 → iOS 11 / Chrome 63 (Module). Vorher blieb der Splash ohne Knopf stehen. |
| 2 | **Vorabprüfung** `js/preflight.js` in `boot()` vor dem Freischalten des Buttons: In-App-Browser (UA-Marker, Liste aus `devices/compatibility.ts` der Engine), `isSecureContext`, `mediaDevices.getUserMedia`, `WebAssembly`, WebP-mit-Alpha (Decode-Test). Befund → `#preflightScreen` („Bitte im Browser öffnen", Text je Fall, URL als Textfeld, „Link kopieren" mit Clipboard-API + execCommand-Fallback), `body.preflight-blocked`, Button bleibt aus. Klassisches Inline-Skript (ES5) in `index.html` fängt Browser ohne ES-Module UND ohne `?.`/`??`-Syntax (Parse-Fehler in main.js) mit demselben Bildschirm. Test: `?preflight=inapp\|nocam\|insecure\|nowasm\|nowebp`, `?preflight=aus`. | Kein Gerät mehr ohne Rückmeldung. 2,3 KB gz. |
| 3 | **Nicht-SIMD-Engine** `vendor/8thwall-nosimd/` (gleicher Monorepo-Commit 519b988, `--config=wasmrelease`, Trim-Patch). `main.js` wählt per `WebAssembly.validate` (Testmodul der Engine-eigenen Prüfung) — der Chunk `xr-tracking.js` lädt relativ zu `xr.js`, also automatisch die passende Variante. Preload des Kerns jetzt per JS in `boot()` (nur die gewählte Variante). `?nosimd` erzwingt den Fallback; `?stats` zeigt „Engine: …"; Konsole „8th Wall XR Version: 0.0.0.0s" (SIMD) / „0.0.0.0" (ohne). Mit wasmtime geprüft: SIMD-Variante ist ohne SIMD schon im Kern `xr.js` ungültig, nicht erst im Tracker. | WASM-SIMD (iOS 16.4 / Chrome 91) ist keine Pflicht mehr; ältere Geräte bekommen den langsameren Tracker statt eines Absturzes nach dem Klick. +1,4 MB gz im Repo, für das Gerät gleich groß. |
| 4 | **Figur → WebP** 768×1152 (exakt 2:3), Qualität 85, Lanczos auf premultipliziertem Alpha. `rig.js` auf `.webp`, PNGs gelöscht, `dev-server.js` kennt `image/webp`. | 2124 KB → 156 KB (gz 2084 → 148 KB). Neues Gate: WebP mit Alpha = iOS 14 / Chrome 32 (Vorabprüfung fängt es). |
| 5 | **Tracker-WASM als eigene Datei** — NICHT umgesetzt (s. 7.3). | — |
| 6 | **Font-Subsetting** mit pyftsubset auf die Zeichen aus `cards/*.js`, `js/*.js`, `index.html`, `css/*.css` + Latin-1 + „“”‚‘’…–—→✅ (Liste `tools/font-subset-unicodes.txt`, Skript `tools/build-fonts.sh`, Original-TTFs nicht im Repo). TTF bleibt TTF, OFL-Texte bleiben, Hinting entfernt (iOS/macOS und Android/Skia werten TrueType-Instruktionen nicht aus; Outlines identisch). | Jersey 10 76,6 → 18,5 KB (gz 26,9 → 7,0), Silkscreen 32,2 → 13,9 KB (gz 11,6 → 4,9). |
| 7 | **Versionierung/Bundle** — offen gelassen (s. 7.4). | — |

Zusätzlich: CSS `inset: 0` überall mit Vier-Seiten-Fallback (`inset` erst ab
iOS 14.5 / Chrome 87).

### 7.2 Gate-Tabelle — welche Mindestversionen jetzt gelten

| Voraussetzung | vorher (Build 49) | jetzt (Build 55) | ohne → |
|---|---|---|---|
| ES-Module + `import()` | iOS 11 / Chrome 63 | gleich | Hinweis (Inline-Skript) |
| Import-Map | **iOS 16.4 / Chrome 89** | entfällt | — |
| JS-Syntax `?.` / `??` (App-Module; Engine ist es2019, three es2020 ohne beides) | iOS 13.4 / Chrome 80 | gleich | Hinweis (Inline-Skript, `new Function`-Probe) |
| WebAssembly | iOS 11 / Chrome 57 | gleich | Hinweis (preflight) |
| WASM-SIMD | **iOS 16.4 / Chrome 91, Pflicht** | optional — Fallback `vendor/8thwall-nosimd/` | langsamer, läuft |
| WebP mit Alpha | — (PNG) | iOS 14 / Chrome 32 | Hinweis (preflight) |
| `getUserMedia` + HTTPS | iOS 11 / Chrome 53 | gleich | Hinweis (preflight) |
| In-App-Browser (Instagram, Facebook, Snapchat, TikTok, LinkedIn, X, WeChat, Line, Pinterest) | Kamera-Fehler NACH dem Klick | Hinweis VOR dem Klick + „Link kopieren" | — |
| CSS `inset` | iOS 14.5 / Chrome 87 | Fallback top/right/bottom/left | — |
| Gyro-Permission | optional | optional | Tracking ohne Gyro-Brücke |

**Effektive Grenze jetzt: iOS 14 / Safari 14 (alle iPhones ab 6s, Herbst 2020)
und Chrome 80 (Februar 2020; Chrome aktualisiert sich unabhängig von der
Android-Version, ab Android 5). Vorher: iOS 16.4 (März 2023) / Chrome 91 (Mai
2021).** Samsung Internet ≥ 13, Firefox Android ≥ 74 liegen darüber. Unterhalb
dieser Grenze sieht das Gerät die Meldung „Bitte im Browser öffnen" / „zu alt".

### 7.3 Nicht umgesetzt: Tracker-WASM als eigene `.wasm`-Datei (Aufgabe 5)

`xr-tracking.js` trägt das WASM als Base64 (schlechtere Kompression, kein
Streaming-Compile). In `reality/app/xr/js/BUILD` steht bei `xr-tracking-wasm`:
`single_file = select({"@the8thwall//bzl/conditions:wasm-pthread": 0, "//conditions:default": 1})`
— eine getrennte `.wasm` gibt es nur in der **pthread**-Konfiguration, und die
setzt `SharedArrayBuffer` voraus, also Cross-Origin-Isolation (Antwort-Header
COOP/COEP), die **GitHub Pages nicht setzen kann**. Den `select` für die
Default-Config auf 0 zu drehen wäre ein Eingriff in den Engine-Build, dessen
`locateFile`-Pfad im Tracker-Chunk (anders als der in `jsxr.ts`) nicht
verifiziert ist — in der Zeitbox nicht sauber machbar, deshalb bewusst nicht
halb eingebaut. Wenn später gewünscht: BUILD-`select` anpassen, `locateFile`
in `tracking-controller.ts` prüfen, beide Varianten bauen, `.wasm` neben die
`.js` legen (Dev-Server-MIME `application/wasm` ist schon da), im Netzwerk-Tab
den `.wasm`-Request sehen. Gewinn geschätzt: ~200–300 KB gz + Streaming-Compile.

### 7.4 Offen gelassen: Versionierung / Bundle (Aufgabe 7)

Problem: Safari cached jede Datei einzeln (Pages: max-age 600) → nach einem
Deploy können alte und neue Module gemischt laufen. Zwei Wege:

- (a) esbuild-Bundle von `js/main.js` mit `--splitting` nach `dist/` (Dev-
  Module bleiben dynamische Chunks), `index.html` lädt `./dist/main.js?v=BUILD`;
  `tools/build-app.sh` analog `build-three.sh`. Bricht den Grundsatz „kein
  Build-Schritt für die App", dafür atomare Deploys.
- (b) nichts — der Build-Check in `?stats` (v-Nummer + geladene Karte) bleibt
  die Kontrolle; bei Engine-/Karten-Updates Dateinamen versionieren.

Entscheidung offen (Michael). Bis dahin gilt (b).

### 7.5 Transfer (gzip, Normalpfad Splash → Klick, SIMD-Gerät)

| Posten | vorher (Build 49) | nachher (Build 55) |
|---|---|---|
| Splash + App-Module (HTML, CSS, JS, three, Fonts) | 238 KB | 217 KB |
| Engine SIMD + Target (nach dem Klick) | 1666 KB | 1666 KB (nicht-SIMD: 1431 KB) |
| Figur (7 Bilder) | 2084 KB | 148 KB |
| **Summe** | **3988 KB** | **2031 KB** |

Der Engine-Chunk ist damit der einzige große Posten (s. 7.3 für den nächsten
Hebel).

### 7.6 Am Handy prüfen (Michael)

Testlink https://l77d.github.io/v2tracker/ — `?stats` (Build ≥ 55, Zeile
„Engine: SIMD"), `?nosimd&stats` (Engine: nicht-SIMD (?nosimd), Tracking muss
ebenfalls laufen — langsamer), `?preflight=inapp` (Hinweis-Bildschirm, „Link
kopieren"), Link aus Instagram/WhatsApp öffnen (echter In-App-Fall), Figur
optisch (WebP-Kanten, Kopf/Gesicht), Sprechblase mit Umlauten.

## 8. Editionen: Firma / Public (`?public`, Build 56, 2026-09-09)

Zwei Fassungen derselben Karte: Firmenkunden (Logo/Firmenname im Splash,
Link-Frage im Dialog) und Public (neutral). Umschalter ist das URL-Flag
`?public` im QR-Code; Standard bleibt die Firmenversion, damit gedruckte
Codes gültig bleiben. Umsetzung in `js/edition.js` (`prepareCard`): Kopie der
Karte ohne `branded: true`-Fragen (Ids auch aus `initial`/`unlocks`
gestrichen — kein hängender NEU-Punkt), `{firma}` → `companyNeutral`,
`company/companyLogo/jobUrl` null, `edition: "public"`; Splash blendet über
`body.public` den Block „bei + Firma" aus (vorerst leer, Public-Splash wird
noch gestaltet). `?stats` zeigt „PUBLIC"/„Firma". Geprüft am Rechner
(`?public&desktop&dev`): Splash ohne Firma, Thema „Wie man reinkommt" nach
„Wie bewirbt man sich?" ohne LINK-Kachel; ohne Flag unverändert (LINK-Kachel
mit NEU). `?public` bleibt bei „Link kopieren" und „Neu laden" erhalten.
