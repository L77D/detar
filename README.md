# DETAR — WebAR Trading Card (eigenständige App, ohne Zapworks)

Mobile WebAR-Demo: Karte scannen, Comic-Figur steht auf der Karte und führt
einen Dialog nach RPG-NPC-Vorbild (Fragen nach Themen, Freischaltungen,
Rückfragen der Figur) mit Sprechblase, Posen und Gesichtsanimation. Kompletter Port
des Zapworks/Mattercraft-Prototyps auf **Open-Source-Tracking** — keine
Lizenzkosten, kein Build-Schritt, eine einzige statische Website.

**Tracking (Branch `8thwall-image-targets`, 2026-09-09):** 8th Wall Image
Targets aus der **Open-Source-8th-Wall-Engine** (MIT), selbst gehostet unter
`vendor/8thwall/` — nur Bildtracking, kein SLAM, kein Niantic-Server, kein
API-Key. Die Engine startet erst nach „Scan starten". Umstieg, Target-
Erzeugung und Event-Zuordnung: `docs/8thwall-migration.md`. (`main` läuft
noch auf MindAR.) Testlink des Branches: https://l77d.github.io/v2tracker/
(Spiegel-Repo `L77D/v2tracker`, Pages von dessen `main`).

**Kein LLM, keine externe API, kein CDN** — alle Inhalte sind autorisiert und
hartkodiert (`cards/*.js`). Laufzeit-Abhängigkeiten liegen komplett im Repo:
three.js 0.160 als schlankes Bundle (`vendor/three/`, tree-shaken auf die
genutzten Klassen) + die zugeschnittene 8th-Wall-Engine (`vendor/8thwall/`).
Nach dem Klick geht kein Byte an Dritte. Schlank seit Branch `v2tracker-lean`
(2026-09-09): keine tuning.json (Werte sind Defaults in `js/config.js`),
Dev-Module nur per URL-Flag, Desktop-Modus als eigenes Modul, Einblick/Portal
und MindAR-Targets entfernt.

UI (Build 18, 2026-09-03) nach Figma „DETAR": Blau/Gelb/Schwarz, Pixel-Halo-
Kästen, Handy-Icon, Eck-Marker. Fonts: Jersey 10 + Silkscreen, beide SIL Open
Font License (`assets/fonts/`, Lizenztexte daneben).

---

## Veröffentlichen (GitHub Pages)

1. Auf github.com ein neues Repository anlegen (z. B. `detar-webar`, Public).
2. Diesen kompletten Ordner hochladen (Drag & Drop auf „uploading an existing
   file" funktioniert, oder GitHub Desktop).
3. Im Repo: **Settings → Pages → Source: „Deploy from a branch" → Branch:
   `main` / `/ (root)` → Save.**
4. Nach ~1 Minute läuft die App unter
   `https://<dein-name>.github.io/detar-webar/` — diese URL als QR-Code auf
   die Karte drucken.

Kamera-Zugriff braucht HTTPS — GitHub Pages liefert das automatisch.

## Lokal testen

Direktes Öffnen der Datei per Doppelklick funktioniert NICHT (ES-Module
brauchen einen Server). Im Ordner starten:

```
python3 -m http.server 8080        # oder: npx serve
```

dann `http://localhost:8080` öffnen.

* **`?desktop`** — Desktop-Testmodus ohne Kamera: Karte als Boden-Plane,
  Maus = Orbit/Zoom (wie der Lokal-Tuning-Prototyp). Zum Prüfen von
  Choreographie/Verhalten am Rechner: `http://localhost:8080/?desktop`
* **`?debug`** — pinke Hilfslinien (Lauffeld + FACE_CAM-Kegel), kombinierbar:
  `?desktop&debug`
* **`?dev`** — Tuning-Panel (alle Regler live, localStorage-persistent,
  Presets, tuning.json-Export, Replay, Tracking-Feature-Toggles). Bewusst
  OHNE Theatre — bleibt auch am Handy übersichtlich.
* **`?timeline`** — Theatre.js-Studio (visueller Keyframe-Editor). Für
  Animations-Arbeit am Rechner: `?desktop&dev&timeline`.
* **`?stats`** — Live-Diagnose am Handy: Tracking-/Gyro-Status, Jitter in mm,
  Gyro-Toggle. **`?nogyro`** — Gyro-Fusion komplett aus.

Flags sind frei kombinierbar (z. B. `?dev&stats` am Handy fürs Tracking-Tuning).

## Animationen / Timeline (Theatre.js)

Autorisierte Animations-Beats werden visuell gekeyframed statt programmiert:

1. `?desktop&dev` öffnen → Theatre-Studio erscheint (Outline links, Timeline
   unten). Objekt „Beats / Figur" animiert den `BeatRoot`-Wrapper
   (posX/Y/Z, rotY/Z, scale) — die reaktiven Behaviors (IdleWander, FACE_CAM)
   laufen unabhängig weiter und addieren sich dazu.
2. Keyframes setzen, scrubben, Kurven im Studio editieren;
   „▶ Timeline" im Dev-Panel spielt die Sequenz ab.
3. Dev-Panel → „Timeline exportieren" → die Datei als **`beats.theatre.json`**
   ins Repo-Root legen und pushen.
4. Live lädt die App nur den schlanken Player + diese JSON (ohne die Datei
   und ohne `?dev` wird Theatre gar nicht geladen).

Reaktives Verhalten (Watscheln, Kamera-Blick, Billboard) bleibt bewusst Code —
das lässt sich nicht keyframen, weil es auf die Kamera reagiert.

Am Handy testen ohne Deploy: Rechner und Handy im selben WLAN, dann
`http://<rechner-ip>:8080` — Achtung, Kamera geht nur über HTTPS; für echte
AR-Tests am Handy die GitHub-Pages-URL nehmen (push = live).

## Getunte Werte

Alle Dashboards (TYPO / FACE / IDLE / ACT / CHOREO / SCENE / STAB …) liegen als
Live-Werte in `js/config.js` — EINE Quelle. Für Tuning-Sessions: Dev-Panel
(`?dev`) → „tuning.json exportieren", die Datei ins Repo-Root legen und mit
`?dev` oder `?tuning` laden (nur dann wird sie geholt). Ergebnis danach in
`config.js` übernehmen, Datei nicht einchecken.

## Neue Karte / neuer Beruf

1. `cards/elektroniker.js` kopieren, Texte/Fragen/Rückfragen/Link ändern
   (Datenmodell und Regeln: `Dialogsystem/DETAR_Dialogsystem.md` im Projekt-
   ordner; Emotion-Tags aus dem geschlossenen Vokabular, Highlight-Tags
   `<marker> <gross> <leise> <knall>`).
2. Import oben in `js/main.js` auf die neue Datei umstellen.
3. Neues Kartenbild als 8th-Wall-Target erzeugen (s. u.) und die Dateien in
   `targets/8thwall/` ersetzen.
4. Character-PNGs in `assets/character/` austauschen (gleiches
   1024×1536-Canvas, gleiche Slicing-Positionen — wie im Nano-Banana-Workflow).

## Tracking-Target (8th Wall) neu erzeugen

Das Target ist aus dem beschnittenen Kartenbild erzeugt
(`Assets/September/demo_skat_070926_mind_cropped.png`, 1346×2156; Druckdatei
`demo_skat_070926.jpg`). Bei neuem Karten-Layout:

1. `npx @8thwall/image-target-cli@latest` — Bildpfad, Typ `flat`, Default-Crop,
   Ordner `targets/8thwall`, Name `card` (Details und Pipe-Variante:
   `docs/8thwall-migration.md`, Abschnitt 1)
2. `card.json`, `card_luminance.png`, `card_thumbnail.png` einchecken
   (`_cropped`/`_original` nicht)
3. `SCENE.cardAspect` in `js/config.js` auf Höhe/Breite der ganzen Karte setzen

Der Crop ist immer 3:4 (zentriert, volle Kartenbreite). Gute Targets: viel
Kontrast, viele unregelmäßige Details, matt gedruckt — dieselben Regeln wie
beim Zapworks-Training.

## Tracking-Glättung

Die Haupt-Glättung ist unser **PoseStabilizer** (`js/poseStabilizer.js`,
`STAB` in `js/config.js`): erst `minCutoff` senken, bis das Ruhe-Zittern weg
ist, dann `beta` erhöhen, bis schnelle Bewegungen ohne Nachziehen folgen —
eine Schraube pro Test, Zahlen in `?stats`. `lostHoldMs`/`GYRO.bridgeMs`
halten die Pose bei kurzem Tracking-Verlust. (`filterMinCF`/`filterBeta`/
`missTolerance`/`warmupTolerance` waren MindAR-intern und sind ohne Wirkung.)

## Struktur

```
index.html            Splash (DU SCANNST … START) + AR-Container + Overlays
css/app.css           Splash, DET-Logo-Overlay, Tracking-Hinweis, Font
css/question-menu.css Bottom-UI (Onboarding + Fragen-Karussell), CSS-Dashboard
js/main.js            Boot, 8th-Wall-Setup (Pipeline-Modul), Figur-Tap, Loop
js/desktopMode.js     ?desktop: Karte als Boden-Plane, Maus-Orbit (nur per Flag geladen)
js/config.js          ALLE Tuning-Dashboards + tuning.json-Merge
js/rig.js             Figuren-Hierarchie (Transforms aus Scene.zcomp)
js/cardController.js  Choreographie + Dialogablauf: Scan → Pop-In → Begrüßung →
                      Hub (Themen → Fragen) → Antwort/Seiten → Rückfragen →
                      Ausstieg → Ruhezustand → Wiedereinstieg
js/dialogEngine.js    Gesprächszustand: Freischaltungen, Variable, Rückfragen
js/bubbleText.js      Markup-Parser (Highlight-Tags), Satz-/Wortgrenzen
js/idleWander.js      Watscheln, Bop, FACE_CAM, attending-Modus
js/speechBubble.js    Canvas-Typewriter-Bubble mit Seiten, Billboard
js/faceAnimator.js    Blinzeln + Mund-Sync
js/activationAnim.js  Pop-In beim ersten Scan, Einklappen beim Ausstieg
js/questionMenu.js    Onboarding + Dialog-Menü: Themenkarten, Fragen mit Marken,
                      Antwortoptionen, Weiter, Fußzeile (DOM, Karussell)
js/debugOverlay.js    pinke Hilfslinien (?debug)
cards/                ein .js pro Beruf (Inhalte, hartkodiert)
assets/               Character-PNGs, Logos, Font, Kartenbild
targets/8thwall/      Image-Target (card.json + card_luminance.png) aus image-target-cli
vendor/8thwall/       Open-Source-8th-Wall-Engine, zugeschnitten (xr.js + xr-tracking.js, MIT)
vendor/three/         three.js 0.160, tree-shaken (tools/build-three.sh)
docs/8thwall-migration.md  Umstieg MindAR → 8th Wall: Target-Erzeugung, Änderungen, Events
```

## Technik-Notizen (für spätere Änderungen wichtig)

* **Koordinaten:** Zapworks lief im Anchor-Origin-Modus (Karte = Ursprung,
  Kamera bewegt sich), der PoseStabilizer arbeitet invertiert (Kamera =
  Ursprung, Anchor bewegt sich). 8th Wall liefert die Bildpose im Szenen-Frame;
  `main.js` rechnet sie in Kamera⁻¹ × Bild um, `stabRoot` hängt unter der
  Kamera. Figur + Bubble hängen unter `worldRoot` (Karten-Frame, Y =
  hoch von der Karte); alle „Wo ist die Kamera?"-Rechnungen laufen über
  `frame.getCamLocal()`. Die Behavior-Logik selbst ist 1:1 der Stand des
  Lokal-Prototyps (2026-07-06) inkl. umgebautem Walk, attending-Modus,
  Figur-Tap-Sprung, unten verankerter Bubble und HeadNod-Nick-Achse.
* **Skalierung:** Die Anchor-Scale ist die Kartenbreite (8th Wall:
  `scale × scaledWidth`, der 3:4-Crop behält die volle Breite) → eine Anchor-
  Einheit = eine Kartenbreite wie bei MindAR; `worldRoot` wird um
  `1/SCENE.cardWidth` skaliert, damit alle Prototyp-Werte (Lauffeld,
  Sprunghöhe, Bubble-Maße) unverändert gelten.
* **Painter's Algorithm:** depthTest AUS auf allen flachen Layern, feste
  renderOrder (Body 0, Head 1, Face 2, Bubble 3) — nie ändern, sonst
  verschwindet der Kopf hinter dem Body (siehe CLAUDE.md-Gotchas).
* **three.js ist gepinnt** (0.160.0, Bundle in `vendor/three/`) — nicht blind
  hochziehen; `XR8.Threejs` braucht das globale THREE ≥ r125 und dieselbe
  Instanz wie unsere Module (`window.THREE = THREE` in main.js). Neue
  `THREE.*`-Klasse im Code → `tools/three-slim-entry.js` + `tools/build-three.sh`.

© Studio2B — Demo. Logos: DEIN ERSTER TAG / PENNY (mit Erlaubnis).
