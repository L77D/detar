# CLAUDE.md — DETAR WebAR

Stand: 2026-09-09 · Build 47 (Branch `8thwall-image-targets`: Tracking auf 8th Wall) · Live (main, Build 33, MindAR): https://l77d.github.io/detar

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
- **Build 27 (Michael 2026-09-07):** `SCENE.figureScale 0.85` skaliert Figur +
  Sprechblase (rig.js) und Hüpf-Icon — Eck-Marker bleiben Kartengeometrie ·
  Panel-Raster in Titelzeilen-Blau, beginnt 20 % unter der Panel-Oberkante
  (Splash-Raster bleibt gelb) · Icon ohne Schlagschatten · „Ich muss weiter"
  nur im Hauptmenü · Ruhezustand + Karte verloren: Panel-Zeile wechselt auf
  „Halte auf die Karte" (`menu.showIdle(true)`, Phase `idle-lost`), der
  mittige `#lostHint` erscheint nur außerhalb des Ruhezustands
  (`controller.lostHintWanted`).
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
  Gedankenstrich, dann Wortgrenze), gemessen am echten Font. Seitenzähler
  „1/3" seit Build 30 aus (`TYPO.pageLabel: "nein"`, Michael 2026-09-07);
  Seiten + Weiter-Kachel bleiben. Kein stilles Kappen mehr.
- `js/bubbleText.js` — Markup-Parser, Satz-/Wortgrenzen.
- `js/questionMenu.js` — Phasen: themen → thema ([←] Kopfzeile mit NEU-Punkt,
  Fragen mit Reitern NEU/LINK/✅) · options · next · idle; Optik siehe „UI".
  Ausstieg als Kachel (`engine.exitQuestion()`). Link-Frage „link" ist seit
  Build 31 eine normale Frage im Thema `wege` (Reiter LINK, „Seite öffnen" →
  neuer Tab), freigeschaltet durch „bewerbung"; `permaQuestions()` bleibt
  ungenutzt.
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

**Tracking-Target (seit Build 26, 2026-09-07):** `targets/card.mind` = beschnittene
Demo-Karte 070926 (`Assets/September/demo_skat_070926_mind_cropped.png`,
1346×2156 px, Aspekt 1,60 → `SCENE.cardAspect`), kompiliert mit dem Compiler
aus `mind-ar@1.2.5` (Skript in der Session: Seite mit `Compiler.compileImageTargets`
in headless Chrome — im versteckten Browser-Pane stallt tfjs, weil rAF pausiert).
Vorgänger in `targets/old/`: Vollkarte „DETAR Tracking-Check Juni 2026"
(2910×4488, 1,54) und PENNY-Demokarte (2199×3000, 1,36). Weil das Target
beschnitten ist, ist seine physische Breite etwas kleiner als die 59 mm der
Karte — `cardWidth 0.059` bleibt als Näherung (wirkt nur auf mm in `?stats`). Desktop-
Kartenbild: `assets/card/detar_demokarte_070926.jpg` (1200 px, ~400 KB,
aus der 3-MB-Druckdatei `Assets/September/demo_skat_070926.jpg` verkleinert —
dieselbe Vorlage wie das Target).
Physische Karte: **59 × 91 mm hochkant** (Michael 2026-09-07) →
`tuning.json → SCENE.cardWidth 0.059`. Der Wert skaliert nur die mm-Angaben
in `?stats` (Jitter-Richtwerte unten gelten weiter in mm); die Figur ist
relativ zur Kartenbreite definiert und wird dadurch nicht kleiner.

**Stack (Branch `8thwall-image-targets`, 2026-09-09):** `three@0.160` per
CDN-Importmap (gepinnt) + **Open-Source-8th-Wall-Engine** (MIT) selbst gehostet
unter `vendor/8thwall/` (`xr.js` + `xr-tracking.js`; Bildtracker, KEIN SLAM,
kein Binary, kein Niantic-Aufruf, kein API-Key). Engine wird erst in der Start-
Geste geladen. Target: `targets/8thwall/card.json` + `card_luminance.png` aus
`@8thwall/image-target-cli`. Alles dazu: `docs/8thwall-migration.md`.
`main` läuft weiter auf `mind-ar@1.2.5` (dort: mind-ar ist gegen three 0.160
gebaut, nicht bumpen). Vanilla ES-Module, GitHub Pages (served NUR `main`).

## Branches

- `main` — live (Pages deployt automatisch)
- `8thwall-image-targets` — Tracking auf 8th Wall Image Targets (Open-Source-
  Engine, selbst gehostet). Nicht gemerged; am Handy braucht ein Branch-Test
  einen eigenen HTTPS-Host (Pages served nur main). Vor dem Merge: Engine-
  Dateien in `vendor/8thwall/` vorhanden (Bazel-Build, s. dortige README),
  Gerätetest per `?stats`.
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
  **Ehemals Nur-Lokal-Änderungen (Michael 2026-09-04), seit Build 22 auch
  live:** hängen an `body.lokal` (Klasse steht jetzt fest in `index.html`;
  CSS-Blöcke am Ende von `app.css`/`question-menu.css`) und
  `ACTFX.hopper="ja"` (Default in config.js): Silkscreen −12 % Laufweite + Kasten-
  Padding 8/4/6 · Splash-Raster driftet nach rechts oben · engeres Kachel-
  raster (88/102 px Zeilen) · „Halte auf die Karte" als Laola-Welle
  (`wave`-Spans in supportUI) · Karte gefunden: Icon springt aus dem Panel
  (`IconHandy.jumpOut`) und hüpft in 3D auf der Kartenmitte mit flachem
  Pixel-Schatten (`ActivationFX.landIcon/tickHopper`).
- Kommentare/Commits auf Deutsch, Commit-Trailer `Co-Authored-By: Claude`.
- Änderungen an Tracking-Werten immer mit Datum + Begründung im Kommentar
  (Fix-Log lebt in den Code-Kommentaren).

## Tracking-Architektur

```
8th Wall XrController (xr-tracking.js) → reality.imagefound/imageupdated/imagelost
  └─ anchor.matrix (main.js: Kamera⁻¹ × Bildpose, Scale = Kartenbreite; Gruppe
     außerhalb der Szene — Ersatz für MindARs anchor.group)
       └─ PoseStabilizer.tick() (jeden Frame im onUpdate des Pipeline-Moduls)
            └─ stabRoot (geglättet, KIND DER KAMERA; trägt Figur)
                 └─ worldRoot (Karten-Frame: rot.x=+90°, scale=1/SCENE.cardWidth)
Rendern: XR8.Threejs.onRender (buildExperience({render:false}))
```

(main/MindAR: `anchor.group.matrix` roh pixel-skaliert, stabRoot auf Szenen-
Ebene, `renderer.setAnimationLoop` — Rest identisch.)

PoseStabilizer: Einheiten-Normierung auf Kartenbreiten → NaN-Guard →
**Scale-Lock** (Scale strukturell konstant; >10 % Abweichung = Fehl-Homographie
→ Frame verwerfen; hält die Abweichung `scaleRelockMs` am Stück an → **Re-Lock**
= komplett neu aufsetzen) → **Aufsetzen per Median** (Build 28: die ersten
`acquireFrames` Messungen bzw. `acquireMaxMs` → Median je Achse, Medoid-
Rotation, Median-Scale; solange läuft der laufende Median sichtbar mit — gilt
für den ersten Scan, Re-Found und Snap) → **Neu-Erkennung auf Tap** (Build 29:
Figur-Tap und Karten-Tap in „Karte gefunden" setzen `controller.trackingStates[0]
.isTracking = false` → MindAR läuft im nächsten Frame durch Detect+Match
(absolute Pose, ohne Fork) und `stab.reacquire()` setzt per Median neu auf;
`?stats` zeigt „Roh↔Stab" in Grad/‰-Kartenbreiten + Zahl der Re-Erkennungen —
Roh≈Stab und trotzdem schief = Drift in MindAR, Roh≠Stab = wir halten alt) → Bewegungs-Schätzung (250-ms-Drift-Fenster, tremor-fest) →
Far-Debounce (2 ferne Messungen → Snap) → Extrapolation (nur BEWEGT) →
**One-Euro Position mit beta-GATE** (beta nur im BEWEGT-Modus; die Frame-
Ableitung ist in Ruhe nie ~0 → ohne Gate stand der Filter permanent offen) →
adaptives Rotations-SLERP → Dead-Zones (nur Ruhe). GyroFusion liefert
Kamera-Dreh-Deltas (Akkumulations-Dead-Band: qPrev rückt nur bei angewendetem
Delta vor) als Prediction + Verlust-Brücke.

## Aktuelle Kern-Werte (config.js, Build 13)

- `CAM`: unter 8th Wall wählt die Engine die Auflösung selbst (Constraint-
  Leiter mit Retry) — `width/height` und `?res=` ohne Wirkung; `maxPixelRatio: 2`
  gilt weiter (Canvas-Pixelgröße in main.js). (main/MindAR: 960×540 per
  getUserMedia-Wrap.)
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

- 8th Wall: `disableWorldTracking: true` MUSS vor `XrController.pipelineModule()`
  und `XR8.run()` stehen. `XR8.Threejs` verlangt `window.THREE` (dieselbe
  Instanz wie die Importmap). `renderer.setSize` der Engine schreibt Pixelmaße
  als Inline-CSS → `#xr-canvas` hat `width/height: 100% !important`.
- 8th Wall: `reality.imageupdated` feuert nur bei geänderter Pose → der
  Stabilizer sieht unveränderte Frames als „stale" (wie MindAR). `detail.scale`
  gilt pro Track als konstant (Scale-Lock-Annahme, am Gerät prüfen).
- 8th-Wall-Target ist immer ein 3:4-Crop (zentriert, volle Kartenbreite);
  eigener Crop muss die Kartenbreite behalten (Skalierung!).
- (main/MindAR) mindar-image-three legt IMMER einen CSS3DRenderer-Layer an, der
  Pointer-Events schluckt → `pointerEvents:none`; MindARs elementweiser Matrix-
  Filter erzeugt nicht-starre Matrizen → Grund für den Scale-Lock; MindAR
  schätzt das Kamera-FOV nur (Kipp-Wobble, Strategie A3).
- iOS: Gyro-Permission MUSS in der Start-Geste angefragt werden (vor allen
  awaits); Safari cached JS aggressiv → Build-Check in ?stats nutzen. Achtung:
  Safari cached JEDE Datei einzeln (Pages: max-age 600) — `version.js` kann
  frisch sein, während `cards/*.js` noch alt ist. `?stats` zeigt deshalb seit
  Build 33 auch die geladene Karte (id, Fragenzahl, Link-Frage). Einzelne
  Datei erzwingen: ihre URL direkt in Safari öffnen, dann die App neu laden.

## Referenzen

- `docs/tracking-strategien.md` — Strategien A–E (Rohsignal, Fork,
  WebXR-Fusion, Eck-Anker-Karte, Prüfstand) mit Wissen + Vorgehen je Punkt.
  Empfohlene Reihenfolge: E → D → A → B3/B1 → C.
- Fix-Historie: Code-Kommentare mit Datum (2026-07-08 / -09 / -13 / -14).
