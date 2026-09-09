# DETAR — Umstieg auf 8th Wall Image Targets (Branch `8thwall-image-targets`)

Stand 2026-09-09. Ersetzt MindAR (`mind-ar@1.2.5`) als Kamera- und Tracking-
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
   Quellen wurden auf Netzaufrufe geprüft (s. u.). three.js kommt weiter vom
   jsDelivr-CDN wie bisher — wer auch das im Haus haben will, legt
   `tools/vendor/three.module.js` (liegt schon im Repo) per Importmap um.

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

## 5. Offen / noch nicht am Gerät verifiziert

- Tracking-Qualität gegenüber MindAR (Jitter roh, Vision-Hz, Abrisse beim
  Verschieben) — Prüfstand-Seiten (`Tracking-Pruefstand/`) importieren noch
  MindAR-Pfade und müssten für einen A/B nachgezogen werden.
- Ob 8th Wall `detail.scale` bei bewegter Karte wirklich konstant hält (Scale-
  Lock-Annahme) — am Gerät über `Re-Erk.`/„Roh↔Stab" in `?stats` ablesen.
- Safari-Cache: `vendor/8thwall/*.js` sind groß; bei Engine-Updates Dateinamen
  versionieren oder den Build-Check in `?stats` nutzen.
