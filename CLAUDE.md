# CLAUDE.md — DETAR WebAR

Stand: 2026-09-04 · Build 19 (UI-Update + Lokal-Prototyp-Build) · Live: https://l77d.github.io/detar

## Projekt

Mobile WebAR-Demo (Studio2B / „DEIN ERSTER TAG"): Karte scannen → Comic-Figur
steht auf der Karte und führt einen Dialog nach RPG-NPC-Vorbild (Hub mit
Freischaltungen, Rückfragen der Figur, Sprechblase mit Seiten, Posen,
Gesichtsanimation). Port des Zapworks/Mattercraft-Prototyps auf MindAR — kein
LLM, keine API, kein Build-Schritt, statische Site. v1 enthält NUR den Dialog
(Scope 31.08.2026); der Einblick (Portal/Galerie, `js/portalView.js`) bleibt im
Repo, wird aber nicht mehr aufgebaut.

## UI (seit Build 18, 2026-09-03)

Quelle: Figma „DETAR" (Seite UI, Komponenten `support`/`frage`/`Auswahl`,
mock_0–05) + Mockup-PNGs in `Produktion/Quellmaterial/0309/`. Entscheidungen
Michael 2026-09-03: Themen-Namen im Mockup sind Platzhalter (Inhalt bleibt
Elektroniker-Karte) · keine Fußzeile, kein Link-Eintrag, kein DET-Logo/Job-Link
nach dem Splash · „Ich muss weiter" ist eine Kachel im Themenraster (4. Feld)
und in jedem Thema · Sprechblase bleibt 3D über dem Kopf · Attract nur
Eck-Marker · Karte verloren = Menü eingefroren, nicht bedienbar.

- **Tokens** in `css/app.css` (`--d-*`): Blau `#3aa1cd`, Reiter-Blau `#0b95d0`,
  Gelb `#fced62`, Schwarz `#171717`, NEU `#71ff51/#1d3917`, LINK
  `#23b6f5/#0e1b3d`, ausgewählt `#193d18/#58ff71`, gefragt `#3d3d3d/#b5b5b5`.
- **Fonts:** Jersey 10 (Hauptschrift) + **Silkscreen** (OFL,
  `assets/fonts/`) für Support-Zeilen — Ersatz für FS Pixel Sans aus dem
  Mockup (kommerziell). Silkscreen läuft ~1,6× breiter, Größen daher auf die
  Mockup-Kastenbreiten zurückgerechnet (22 px Hinweise, 20 px Kopfzeile).
- **Pixel-Halo** (Textkasten mit ausgefransten Kanten): SVG-Filter
  `feMorphology dilate` je Farbe/Radius, Definitionen in `index.html`,
  Zuordnung `.px-*` in `app.css`. Sprechblase (Canvas) macht dasselbe über
  Kontur mit `lineJoin miter` + `lineCap square`.
- `js/supportUI.js` — Handy-Icon (6 PNG-Frames, `assets/ui/icon-handy/`)
  + Balken; Zustände suchen/gefunden/ruhe. Genutzt von `questionMenu.js`
  (Suche, Karte gefunden, Ruhezustand) und `main.js` (`#lostHint`).
- `js/questionMenu.js` — Themen als festes 2×2-Raster; Fragen als Karussell
  mit 2×2 Kacheln je Seite + Seitenpunkte; Kachel = Reiter (THEMA/NEU/LINK/✅)
  über Textkasten 178×73, ±2,34° Tilt. Maße 1:1 aus dem 402-px-Figma-Frame.
- `js/activationFX.js` — vier gelbe Eck-Marker auf den Kartenecken (Canvas-
  Textur aus dem Figma-Pfad), wabern (`ACTFX.bobHeight/bobSec`), ploppen beim
  Tap. Glow + Partikel sind weg; `ACTFX`-Keys sind neu (tuning.json hat
  keinen ACTFX-Block).
- Suchrahmen `#scanFrame` (weiße Ecken) über `body.scanning` — an nach dem
  Start, aus bei der ersten Erkennung.
- **Ohne Entwurf, abgeleitet** (Michael liefert später Mockups nach):
  Antwortoptionen, Weiter-Kachel, Ruhezustand, Kamera-abgelehnt, Firmenname-
  Text-Fallback im Splash, Seitenzähler, NEU-Punkt am Zurückpfeil.

## Dialogsystem (seit Build 17, 2026-09-03)

Definition: `Dialogsystem/DETAR_Dialogsystem.md` im Projektordner; Prototyp
`detar_dialog_v2.html` (Themenebene) ist die Referenz, die App portiert ihn 1:1.

- `cards/elektroniker.js` — Kartendatei (Siemens-Dialog, PENNY-Figur/-Marker
  als Platzhalter). Felder: `themen`, `initial`, `greeting{tag,text}`,
  `asks[{trigger,prompt,options[{label,sets,unlocks,tag,reply}]}]`,
  `questions[{id,thema,label,text,tag,unlocks,requires,link,url,end}]`,
  `reentry.rules`. Text darf `<marker> <gross> <leise> <knall>` tragen
  (`<welle>`/`<zittern>` werden geparst, nicht bewegt — Canvas-Entscheidung).
- `js/dialogEngine.js` — Zustand + Regeln (unlocked/asked/fresh/vars/asksDone/
  visits/view), kein DOM, kein 3D.
- `js/cardController.js` — Ablauf: say() paginiert und blättert mit Weiter;
  Weiter-Knopf NUR zwischen Seiten, vor einer Rückfrage und vor „Seite öffnen"
  (window.open braucht die Nutzergeste). Ausstieg → Fazit → Abschied →
  `activation.playOut()` (Figur klappt ein) → Phase `resting` → Tap auf die
  Karte → Wiedereinstieg (beiläufige Zeile, Zustand bleibt).
- `js/speechBubble.js` — `paginate()` schneidet am Satzende (Notfall Komma/
  Gedankenstrich, dann Wortgrenze), gemessen am echten Font; Seitenzähler
  oben rechts. Kein stilles Kappen mehr.
- `js/bubbleText.js` — Markup-Parser, Satz-/Wortgrenzen.
- `js/questionMenu.js` — Phasen: themen → thema ([←] Kopfzeile mit NEU-Punkt,
  Fragen mit Reitern NEU/LINK/✅) · options · next · idle; Optik siehe „UI".
  Ausstieg als Kachel (`engine.exitQuestion()`), Link-Frage wird nicht
  angezeigt (`permaQuestions()` bleibt für später).
- `config.js → POSES`: Emotion-Tag → Körper (idle/affirm/think), bis der Rig
  die elf Posen liefert. `CHOREO`: continueDelayMs, collapseDelayMs,
  collapseSec, trackingLostMs (Menü friert nach Verlust ein).
- Randzustände: Kamera abgelehnt → `body.camera-denied` (eigener Bildschirm im
  Splash); Tracking verloren → `menu.setFrozen()` + `#lostHint` (Icon-Zeile
  mittig, Menü bleibt ungedimmt stehen).
- Tap-Entprellung in main.js (pointerup + click-Fallback binnen 120 ms) —
  seit dem Dialogsystem wäre Doppel-Auslösung NICHT mehr harmlos.
- Splash: `card.companyLogo` (Pfad) oder Firmenname als Text; `card.jobUrl`
  wird seit Build 18 nicht mehr angezeigt (DET-Label raus).
- Build 16 ist vom ungemergten Branch `tracking-runde5` belegt (Patch in
  `patches/`), deshalb springt main von 15 auf 17.

**Stack (GEPINNT, nicht bumpen):** `mind-ar@1.2.5` + `three@0.160` per
CDN-Importmap (`index.html`) — mind-ar 1.2.5 ist gegen three 0.160 gebaut.
Vanilla ES-Module, GitHub Pages (served NUR `main`).

## Branches

- `main` — live (Pages deployt automatisch)
- `pruefstand` — Strategie E: `?record` / `?replay` / `?metrics`
  (Session-Aufnahme am Gerät, Replay + Vergleichszahlen am Desktop).
  Noch nicht gemerged; `?record` braucht HTTPS = erst nach Merge am Handy nutzbar.

## Konventionen

- **Versionierung:** `js/version.js` → `BUILD` = Commit-Anzahl
  (`git rev-list --count HEAD` des neuen Commits). **Bei JEDEM Push auf main
  hochzählen.** `?stats` zeigt den laufenden Build und prüft per
  no-store-Fetch gegen den live-Stand („neu laden!" bei altem Cache).
- **tuning.json** (Repo-Root) überschreibt `js/config.js`-Defaults beim Laden.
  Enthält aktuell KEINE STAB/GYRO/CAM-Blöcke → dort gelten die config-Defaults.
  Achtung Masking-Falle: Wert-Änderungen in config.js wirken nur, wenn der
  Block nicht in tuning.json steht.
- **Lokal-Prototyp (Einzeldatei, Doppelklick, kein Server):**
  `python3 tools/build-lokal-prototyp.py <Ziel.html>` packt die App in eine
  HTML-Datei (Module als data:-URLs in der Import-Map, Assets/Fonts/tuning.json
  eingebettet, Desktop-Modus + Dev-Panel erzwungen). Nach jedem Build neu
  erzeugen; Ablage `…/Claude/Lokal-Prototyp/`. three.js kommt vom CDN, außer
  `tools/vendor/three.module.js` + `OrbitControls.js` liegen bereit (offline).
  Ersetzt `_Archiv/Lokal-Prototyp/DETAR_Lokal_Prototyp.html` (Juli-Stand).
- Kommentare/Commits auf Deutsch, Commit-Trailer `Co-Authored-By: Claude`.
- Änderungen an Tracking-Werten immer mit Datum + Begründung im Kommentar
  (Fix-Log lebt in den Code-Kommentaren).

## Tracking-Architektur

```
MindAR-Controller (Vision ~15–30 Hz)
  └─ anchor.group.matrix (roh, pixel-skaliert: Scale ≈ Target-px-Breite)
       └─ PoseStabilizer.tick() (jeden Render-Frame, js/poseStabilizer.js)
            └─ stabRoot (geglättet; trägt Figur — NICHT unter anchor.group!)
                 └─ worldRoot (Karten-Frame: rot.x=+90°, scale=1/SCENE.cardWidth)
```

PoseStabilizer: Einheiten-Normierung auf Kartenbreiten → NaN-Guard →
**Scale-Lock** (Scale strukturell konstant; >10 % Abweichung = Fehl-Homographie
→ Frame verwerfen) → Bewegungs-Schätzung (250-ms-Drift-Fenster, tremor-fest) →
Far-Debounce (2 ferne Messungen → Snap) → Extrapolation (nur BEWEGT) →
**One-Euro Position mit beta-GATE** (beta nur im BEWEGT-Modus; die Frame-
Ableitung ist in Ruhe nie ~0 → ohne Gate stand der Filter permanent offen) →
adaptives Rotations-SLERP → Dead-Zones (nur Ruhe). GyroFusion liefert
Kamera-Dreh-Deltas (Akkumulations-Dead-Band: qPrev rückt nur bei angewendetem
Delta vor) als Prediction + Verlust-Brücke.

## Aktuelle Kern-Werte (config.js, Build 13)

- `CAM`: 960×540 via **getUserMedia-Wrap** in main.js (MindAR hat keinen
  Auflösungs-Parameter; `ideal`-Constraints, `?res=WxH` / `?res=0`),
  `maxPixelRatio: 2` (GPU-Luft für tfjs-Tracker). 1280×720 riss bei
  Karten-Bewegung ab (Vision-Hz zu tief) — am Gerät verifiziert.
- `STAB`: `minCutoff 0.1` · `beta 10` (gated) · `rotMinCutoff 0.5` ·
  `rotBeta 4` · `minSpeed 0.04` · `minAngSpeed 0.09` · `scaleOutlier 0.1` ·
  `filterMinCF 0.01` (MindAR-intern; 0.001 ließ die interne Pose so
  nachhängen, dass der Tracker beim Verschieben abriss).
- Feature-Toggles 1–9 im Dev-Panel (`?dev`), Nr. 9 = Scale-Lock.

## URL-Parameter

`?stats` (Jitter roh/stab, Vision-Hz, BEWEGT/ruhig, Cam+PR, Build-Check) ·
`?dev` (Regler) · `?debug` · `?desktop` · `?timeline` · `?nogyro` ·
`?res=WxH` / `?res=0` · Branch pruefstand: `?record`, `?replay`, `?metrics`.

## Qualitäts-Richtwerte (?stats, Ruhe, 3–5 s Fenster füllen lassen)

- Jitter **stab**: aufgelegt ≈ 0–0,1 mm (Dead-Zone friert ein) · in der Hand
  < 0,3 mm (Kalibrierziel; Bestwert 0,16 mm).
- Jitter **roh**: aufgelegt 0,3–1 mm gesund; > 2–3 mm = Problem stromaufwärts
  (Marker/Licht/FOV), nicht mit Filtern kaschieren. Marker-A/B immer über
  **roh** vergleichen. stab sollte ~5–10× unter roh liegen.
- Beim Stillhalten muss `ruhig` stehen, sonst misst man Bewegung.

## Gotchas

- mindar-image-three legt IMMER einen CSS3DRenderer-Layer an, der Pointer-
  Events schluckt → wird in main.js auf `pointerEvents:none` gesetzt.
- MindARs interner One-Euro filtert die 16 Matrix-Elemente elementweise —
  bei unseren Werten faktisch Pass-Through; Haupt-Glättung ist der
  PoseStabilizer. Elementweises Filtern erzeugt nicht-starre Matrizen →
  Grund für den Scale-Lock.
- MindAR schätzt das Kamera-FOV nur (Quelle für systematisches Kipp-Wobble —
  siehe Strategie A3).
- iOS: Gyro-Permission MUSS in der Start-Geste angefragt werden (vor allen
  awaits); Safari cached JS aggressiv → Build-Check in ?stats nutzen.

## Referenzen

- `docs/tracking-strategien.md` — Strategien A–E (Rohsignal, Fork,
  WebXR-Fusion, Eck-Anker-Karte, Prüfstand) mit Wissen + Vorgehen je Punkt.
  Empfohlene Reihenfolge: E → D → A → B3/B1 → C.
- Fix-Historie: Code-Kommentare mit Datum (2026-07-08 / -09 / -13 / -14).
