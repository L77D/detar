# DETAR — WebAR Trading Card (eigenständige App, ohne Zapworks)

Mobile WebAR-Demo: Karte scannen, Comic-Figur steht auf der Karte, beantwortet
angetippte Fragen mit Sprechblase, Posen und Gesichtsanimation. Kompletter Port
des Zapworks/Mattercraft-Prototyps auf **Open-Source-Tracking (MindAR)** —
keine Lizenzkosten, kein Build-Schritt, eine einzige statische Website.

**Kein LLM, keine externe API** — alle Inhalte sind autorisiert und hartkodiert
(`cards/*.js`). Einzige Laufzeit-Abhängigkeiten: three.js + MindAR per CDN.

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
* **`?dev`** — Entwickler-Modus: Tuning-Panel (alle Regler des alten
  Lokal-Prototyps, live) + **Theatre.js-Timeline** (visueller Keyframe-Editor).
  Typisch: `?desktop&dev`. Regler-Stand bleibt in localStorage erhalten;
  „tuning.json exportieren" erzeugt direkt die Repo-Datei.
* **`?stats`** — Live-Diagnose am Handy: Tracking-/Gyro-Status, Jitter in mm,
  Gyro-Toggle. **`?nogyro`** — Gyro-Fusion komplett aus.

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

## Getunte Werte (tuning.json)

Alle Dashboards (TYPO / FACE / IDLE / ACT / CHOREO / SCENE) liegen mit
Defaults in `js/config.js`. Ein aus dem **Lokal-Tuning-Prototyp exportiertes
Preset** (Sidebar → „→ Datei") einfach als **`tuning.json` ins Repo-Root**
legen — es überschreibt die Defaults beim Laden, ohne Code-Änderung.
Datei löschen = zurück zu den Defaults.

## Neue Karte / neuer Beruf

1. `cards/lagerlogistik.js` kopieren, Texte/Fragen/Link ändern.
2. Import oben in `js/main.js` auf die neue Datei umstellen.
3. Neues Kartenbild als Tracking-Target kompilieren (s. u.) und
   `targets/card.mind` ersetzen.
4. Character-PNGs in `assets/character/` austauschen (gleiches
   1024×1536-Canvas, gleiche Slicing-Positionen — wie im Nano-Banana-Workflow).

## Tracking-Target (.mind) neu kompilieren

Das Target ist aus `assets/card/detar_demokarte_0906.jpg` kompiliert. Bei
neuem Karten-Layout:

1. https://hiukim.github.io/mind-ar-js-doc/tools/compile/ öffnen
2. Kartenbild hochladen → „Start" → kompilierte `.mind`-Datei herunterladen
3. Als `targets/card.mind` ins Repo legen (Name beibehalten)

Gute Targets: viel Kontrast, viele unregelmäßige Details, matt gedruckt —
dieselben Regeln wie beim Zapworks-Training.

## Tracking-Glättung

MindAR hat einen **eingebauten One-Euro-Filter** (ersetzt den
Zapworks-PoseStabilizer). Schrauben in `js/config.js` → `STAB`:
erst `filterMinCF` senken, bis das Ruhe-Zittern weg ist, dann `filterBeta`
erhöhen, bis schnelle Bewegungen ohne Nachziehen folgen — eine Schraube pro
Test. `missTolerance` hält die Pose bei kurzem Tracking-Verlust.

## Struktur

```
index.html            Splash (DU SCANNST … START) + AR-Container + Overlays
css/app.css           Splash, DET-Logo-Overlay, Tracking-Hinweis, Font
css/question-menu.css Bottom-UI (Onboarding + Fragen-Karussell), CSS-Dashboard
js/main.js            Boot, MindAR-Setup, Desktop-Modus, Figur-Tap, Loop
js/config.js          ALLE Tuning-Dashboards + tuning.json-Merge
js/rig.js             Figuren-Hierarchie (Transforms aus Scene.zcomp)
js/cardController.js  Choreographie: Scan → Pop-In → Begrüßung → UI → Fragen
js/idleWander.js      Watscheln, Bop, FACE_CAM, attending-Modus
js/speechBubble.js    Canvas-Typewriter-Bubble, Billboard
js/faceAnimator.js    Blinzeln + Mund-Sync
js/activationAnim.js  Pop-In beim ersten Scan
js/questionMenu.js    Onboarding + Fragen-Karussell (DOM)
js/debugOverlay.js    pinke Hilfslinien (?debug)
cards/                ein .js pro Beruf (Inhalte, hartkodiert)
assets/               Character-PNGs, Logos, Font, Kartenbild
targets/card.mind     kompiliertes MindAR-Tracking-Target
tuning.json           (optional) Preset-Export aus dem Lokal-Prototyp
```

## Technik-Notizen (für spätere Änderungen wichtig)

* **Koordinaten:** Zapworks lief im Anchor-Origin-Modus (Karte = Ursprung,
  Kamera bewegt sich), MindAR ist invertiert (Kamera = Ursprung, Anchor bewegt
  sich). Figur + Bubble hängen deshalb unter `worldRoot` (Karten-Frame, Y =
  hoch von der Karte); alle „Wo ist die Kamera?"-Rechnungen laufen über
  `frame.getCamLocal()`. Die Behavior-Logik selbst ist 1:1 der Stand des
  Lokal-Prototyps (2026-07-06) inkl. umgebautem Walk, attending-Modus,
  Figur-Tap-Sprung, unten verankerter Bubble und HeadNod-Nick-Achse.
* **Skalierung:** MindAR normiert die Kartenbreite auf 1 Einheit; `worldRoot`
  wird um `1/SCENE.cardWidth` skaliert, damit alle Prototyp-Werte
  (Lauffeld, Sprunghöhe, Bubble-Maße) unverändert gelten.
* **Painter's Algorithm:** depthTest AUS auf allen flachen Layern, feste
  renderOrder (Body 0, Head 1, Face 2, Bubble 3) — nie ändern, sonst
  verschwindet der Kopf hinter dem Body (siehe CLAUDE.md-Gotchas).
* **CDN-Versionen sind gepinnt** (three 0.160.0, mind-ar 1.2.5) — nicht
  blind hochziehen, mind-ar ist gegen diese three-Version gebaut.

© Studio2B — Demo. Logos: DEIN ERSTER TAG / PENNY (mit Erlaubnis).
