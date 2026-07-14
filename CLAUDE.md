# CLAUDE.md — DETAR WebAR

Stand: 2026-07-14 · Build 13 · Live: https://l77d.github.io/detar

## Projekt

Mobile WebAR-Demo (Studio2B / „DEIN ERSTER TAG"): Karte scannen → Comic-Figur
steht auf der Karte, beantwortet hartkodierte Fragen (Sprechblase, Posen,
Gesichtsanimation, Einblick-Portal). Port des Zapworks/Mattercraft-Prototyps
auf MindAR — kein LLM, keine API, kein Build-Schritt, statische Site.

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
