# DETAR — Tracking-Verbesserung: Strategien A–E (Wissensdokument)

Stand 2026-07-14 · Bezug: MindAR 1.2.5 + eigener PoseStabilizer (Build 10, `l77d/detar`).
Zweck: Pro Strategie das Wissen (warum/Mechanik) und das Vorgehen (konkrete Schritte) festhalten — nachschlagbar, unabhängig vom Chat-Verlauf.

---

## Kontext: Korrigierte Annahmen

Drei frühere Einschätzungen wurden revidiert; sie begründen die Strategien:

1. **„SLAM hilft bei bewegter Karte nicht" — teilweise falsch.** Der Wert von VIO/SLAM ist die *Zerlegung der Bewegung*: Ist die Kamera-Pose unabhängig bekannt, ist der Rest im Bild echte Karten-Bewegung. Unsere Gyro-Fusion leistet davon nur die Rotation; VIO liefert Rotation **und** Translation. Im realen Use-Case (Messe/Schule) liegt die Karte meist still, das *Handy* bewegt sich — genau der Fall, in dem Kamera-Odometrie am meisten bringt.
2. **„Tiefe IMU-Fusion nicht nachbaubar" — zu pessimistisch.** Android/WebXR liefert die ARCore-Kamerapose frei Haus; Browser-SLAM in WASM existiert (AlvaAR, ORB-SLAM-Ableger).
3. **„Vision-Hz-Floor ist strukturell" — nur halb wahr.** Der Floor (15–30 Hz) kommt aus MindARs *Architektur* (Main-Thread-tfjs + Worker-postMessage pro Update), nicht aus dem Browser. Mit Fork fällt er.

Zwei übersehene Hebel: **Kamera-Intrinsics** (MindAR *schätzt* das FOV aus der Videogröße — falsches FOV erzeugt systematisches Kipp-Wobble, das kein Filter entfernen kann) und **das Kartendesign selbst** (bei uns Design-Variable, bei Zappar/8th Wall gegebenes Bild).

---

## Strategie A — Rohsignal ausreizen (Aufwand: Tage · Risiko: minimal · kein Fork)

### A1 · Fokus/Belichtung sperren (Android)

**Wissen.** Beim Karten-Verschieben jagt der Autofokus nach — während der Refokus-Phase sind Frames unscharf, Features unbrauchbar, der Track reißt. Continuous-Autofocus ist eine reale, unterschätzte Abriss-Quelle. Chrome/Android exponiert `MediaTrackConstraints` für `focusMode`, `exposureMode` (u. a. `manual` / Sperren nach initialem Fokus); iOS Safari exponiert diese Constraints nicht.

**Vorgehen.**
1. Nach `mindarThree.start()`: `track = video.srcObject.getVideoTracks()[0]`, `caps = track.getCapabilities()`.
2. Wenn `caps.focusMode` vorhanden: ~1 s nach Track-Start (Fokus sitzt) `track.applyConstraints({ advanced: [{ focusMode: "manual", focusDistance: <aktueller Wert> }] })` — oder pragmatischer: `focusMode: "continuous"` belassen, aber testweise sperren und Abriss-Rate vergleichen.
3. Feature-Detect + Fail-safe (iOS: no-op). Toggle als `?nofocuslock` für A/B.
4. Messen mit Prüfstand (Strategie E): Abrisse pro 10 s Karten-Schieben, mit/ohne Sperre.

### A2 · Echte Frame-Zeitstempel statt `Date.now()`

**Wissen.** MindAR stempelt Messungen mit dem *Verarbeitungs*-Zeitpunkt; unsere Extrapolation/Latenz-Kompensation (`latencyMs` 40, geraten) rechnet gegen diesen falschen Zeitpunkt. `video.requestVideoFrameCallback(cb)` liefert pro dekodiertem Frame `mediaTime`/`presentationTime` — das echte Aufnahmealter. Damit werden `latencyMs` messbar statt geschätzt und Timing-Jitter (variable Verarbeitungsdauer) fällt aus der Geschwindigkeitsschätzung heraus.

**Vorgehen.**
1. `requestVideoFrameCallback`-Loop parallel starten; letzte `presentationTime`+`mediaTime` puffern.
2. Im PoseStabilizer: `measT` einer neuen Messung = Zeitstempel des zuletzt *verarbeiteten* Frames (Heuristik: Frame, der beim Start der Vision-Iteration aktuell war — bei Fork (B) exakt zuordenbar).
3. `latencyMs` aus gemessener Differenz (presentationTime → Pose-Ankunft) ableiten, in `?stats` anzeigen.
4. Safari: `requestVideoFrameCallback` wird unterstützt; Fallback `performance.now()` beibehalten.

### A3 · FOV/Intrinsics kalibrieren

**Wissen.** MindAR baut die Projektionsmatrix aus einer FOV-*Annahme* (`f = (inputHeight/2)/tan(fovy/2)` mit festem fovy). Weicht das reale Kamera-FOV ab, ist jede Homographie-Zerlegung systematisch verzerrt: Beim Kippen der Karte entsteht ein scheinbares Mitwandern/Wobbeln („Perspektiv-Atmen"), das *kein* Filter beheben kann, weil es kein Rauschen ist, sondern Bias.

**Vorgehen (zwei Stufen).**
1. **Schnell:** FOV pro Gerät grob korrigieren — `?fov=xx`-Parameter, MindARs Projektionsmatrix nach `start()` überschreiben (camera.fov ist zugänglich); am Gerät kippen, bis das Atmen minimal ist; Wertepaare (Gerätemodell → FOV) sammeln.
2. **Richtig:** Selbstkalibrierung aus der Homographie-Sequenz: Karte still hinlegen, Handy langsam um sie herumbewegen (~5 s), aus den Homographien die Brennweite schätzen (Standard-Selbstkalibrierung aus ≥3 Ansichten einer Ebene); Ergebnis in localStorage je Gerät cachen. Aufwändiger, aber einmalig pro Gerät und exakt.

---

## Strategie B — Fork: MindARs Engine anfassen (Aufwand: Wochen · Risiko: mittel)

Prämisse „kein Fork" ist aufgehoben. Der Fork lohnt NUR für die Punkte unten — Matching/Detektion selbst ist gut genug.

### B1 · Vision-Pipeline in einen Worker (OffscreenCanvas), Worker-Roundtrip eliminieren

**Wissen.** Heute: Tracker läuft auf dem **Main-Thread** (tfjs-WebGL) und schickt pro Update per `postMessage` einen ICP-Verfeinerungsschritt an einen Worker → Roundtrip-Latenz pro Messung, und Vision konkurriert mit unserem Render-Loop um Main-Thread **und** GPU (gekoppelt über `tf.nextFrame()`). Beides drückt die Vision-Hz und erzeugt variable Latenz.

**Vorgehen.**
1. Fork von `mind-ar@1.2.5` (Version pinnen, wir vendorn ohnehin).
2. Gesamte Pipeline (loadInput → detect/track → estimate) in **einen** Worker mit OffscreenCanvas/WebGL-Kontext; Kamera-Frames via `VideoFrame`/`createImageBitmap` transferieren (zero-copy wo möglich).
3. Poses per `postMessage` (transferable) zurück — ein Hop *nach* der Rechnung statt einer *mitten drin*.
4. Erwartung: stabilere und höhere Vision-Hz, weniger Latenz-Varianz; Render-Loop atmet frei.

### B2 · WebGPU-Backend für tfjs

**Wissen.** MindARs CV-Kernel sind tfjs-Custom-Ops; das Backend (WebGL) ist austauschbar. `@tensorflow/tfjs-backend-webgpu` ist auf modernen Phones deutlich schneller; iOS-Safari-WebGPU ist inzwischen verfügbar, aber uneinheitlich → Feature-Detect mit WebGL-Fallback.

**Vorgehen.** Im Fork Backend-Wahl konfigurierbar machen (`webgpu` → Fallback `webgl`), Kernels auf Kompatibilität testen (einige Custom-Ops brauchen ggf. Anpassung), Hz-Vergleich per Prüfstand.

### B3 · Optischer Fluss zwischen den Voll-Messungen  ⭐ größter Einzel-Hebel im Fork

**Wissen.** Die teure Kette (Template-Matching + Homographie-Verfeinerung) muss nicht jeden Frame laufen. Lucas-Kanade-Fluss auf den bereits getrackten Punktpositionen kostet einen Bruchteil und läuft mit Kamerarate; die Voll-Verfeinerung korrigiert alle N Frames den Drift. Zusatznutzen: Fluss ist gegen Bewegungsunschärfe toleranter als Template-Matching → genau unser Tisch-Schiebe-Abriss wird seltener. Das ist der klassische Industrie-Weg von 15–30 Hz auf Kamerarate (AR2/artoolkit-Lineage macht es genauso).

**Vorgehen.**
1. Im Fork nach erfolgreichem Track die 2D-Punktkoordinaten behalten.
2. Pyramidal-LK (eigener tfjs-Kernel oder kleines WASM-Modul) Frame→Frame; Homographie aus den geflossenen Punkten per DLT+RANSAC (billig).
3. Voll-Track (Template + ICP) alle N Frames oder wenn Fluss-Qualität (Punktverlust, Residuen) unter Schwelle fällt.
4. PoseStabilizer bleibt unverändert — er bekommt einfach ein dichteres, glatteres Signal.

### B4 · Sub-Pixel-Verfeinerung im Track-Schritt

**Wissen.** MindARs Matching lokalisiert Punkte auf Pixel-Raster; Zappar/8th Wall verfeinern sub-pixel (parabolische Interpolation der Matching-Kostenfläche um das Maximum). Bei 960×540 entspricht 1 px Lokalisierungsfehler bereits sichtbarem Pose-Rauschen — Sub-Pixel halbiert das Roh-Jitter typischerweise nochmal.

**Vorgehen.** Im Track-Kernel um die beste Matching-Position die 3×3-Nachbarschaft der Kostenwerte auslesen, Parabel-Fit je Achse, Offset (±0.5 px) auf die Punktkoordinate addieren. Kleiner, chirurgischer Eingriff mit direkt messbarem Effekt auf `Jitter roh`.

---

## Strategie C — Fusion groß denken: Kamera-Odometrie (der 8th-Wall-Move)

### C1 · Android: WebXR-Kamerapose + Marker-Homographie

**Wissen.** WebXR (`immersive-ar`) auf Android/Chrome liefert die ARCore-Kamerapose (echtes VIO: Rotation **und** Translation) pro Frame. Kombination: Homographie liefert Karte-relativ-zur-Kamera, WebXR liefert Kamera-in-Welt → **Karte in Weltkoordinaten**. Konsequenzen: (a) Verlust-Brücke wird korrekt — Content bleibt am Weltpunkt, auch wenn sich das Handy *verschiebt* (unsere Gyro-Brücke kann nur Drehung); (b) Kamerabewegung ist aus dem Messsignal herausgerechnet → nur echte Kartenbewegung bleibt zu filtern; (c) stillliegende Karte = praktisch perfekte Stabilität. Grenzen: iOS Safari hat kein WebXR-AR → Zweiklassen-System (ehrlich: 8th Wall ist auf iOS auch „nur" CV); Kamerabild-Zugriff in WebXR via `raw camera access`-Feature (Chrome unterstützt es, Performance des Readbacks prüfen).

**Vorgehen.**
1. Spike: WebXR-Session mit `camera-access`, Frame in Textur → MindAR-Pipeline füttern, parallel `XRFrame.getViewerPose()` abgreifen.
2. Karte-in-Welt = `cameraPoseWorld × markerPoseCamera`; **Welt-seitig** filtern (unser Stabilizer, Einheiten bleiben Kartenbreiten).
3. Verlust: Karte-in-Welt einfrieren, weiter über die live Kamerapose rendern — Brücke ohne Zeitlimit, solange SLAM steht.
4. Laufzeit-Weiche: WebXR verfügbar → Fusion-Pfad; sonst heutiger Pfad. iOS unverändert.

### C2 · iOS/experimentell: WASM-SLAM (AlvaAR) als Odometrie

**Wissen.** AlvaAR (ORB-SLAM-Lineage, WASM) liefert Kamera-Odometrie im Browser ohne WebXR — der „poor man's 8th Wall" für iOS. Realistisch: CPU-hungrig, Initialisierung fragil, Drift ohne Loop-Closure; als *Stütze* (Kurzzeit-Odometrie für Brücke + Bewegungszerlegung) brauchbar, als Weltkarte nicht.

**Vorgehen.** Nur als Forschungs-Spike nach C1-Erfolg: AlvaAR parallel im Worker, Odometrie-Delta statt/zusätzlich zum Gyro-Delta in `applyCameraDelta` (dann inkl. Translation). Abbruchkriterium definieren (CPU-Budget, Init-Zuverlässigkeit), bevor Zeit versenkt wird.

---

## Strategie D — Die Karte als Tracking-Instrument designen  ⭐ größter Hebel pro Aufwandsstunde

**Wissen.** Zappar/8th Wall müssen *beliebige* Bilder tracken — wir designen unsere Karte selbst. Ein ins Design integriertes, hochfrequentes Rahmenmuster mit **vier fiducial-artigen Eck-Ankern** (AprilTag-/ArUco-Logik, gestalterisch getarnt) ändert die Problemklasse:
- Ecken sind **sub-pixel-genau** lokalisierbar (Sattelpunkt-Detektion), NFT-Features nicht.
- Quadratische Marker sind deutlich **blur-toleranter** (starke Kanten statt feiner Texturen) → Tisch-Schieben reißt nicht.
- Homographie aus **4 sauberen Punkten** ist stabiler und um Größenordnungen billiger als aus ~100 verrauschten Korrespondenzen → Vision-Hz steigt nebenbei.
- **Hybrid-Architektur:** NFT (MindAR) identifiziert die Karte einmalig (welcher Beruf?), die Eck-Anker übernehmen dann das Pose-Tracking. Identifikation und Tracking sind getrennte Probleme — jedes bekommt das richtige Werkzeug.
- Anschlussfähig an die Tracking-Pattern-Arbeit vom Juni (Feature-Verteilung, Luminanz-Kontrast, Rahmen als „prime real estate").

**Vorgehen.**
1. **Design:** 4 Eck-Anker (~8–12 % Kartenbreite) als gestalterische Elemente (z. B. Pixel-Ornamente im DET-Look) mit klarer Schwarz-Weiß-Innenstruktur; Rest der Karte frei fürs Motiv. Matt bleibt Pflicht.
2. **Detektor:** ArUco/AprilTag-Detektion existiert fertig (js-aruco2, apriltag-wasm) oder als kleiner eigener Sattelpunkt-Detektor; läuft notfalls auf CPU in Echtzeit.
3. **Pipeline:** MindAR erkennt/identifiziert → Übergabe an Eck-Tracker → Homographie aus 4 Ecken → bestehender PoseStabilizer (unverändert).
4. **Druck-Test früh:** ein Proof-Bogen mit Ankern drucken, Prüfstand-Vergleich alt/neu (Jitter roh, Abriss-Rate, Vision-Hz), *bevor* das finale Kartenlayout entsteht — Ergebnis entscheidet, ob Anker ins Serien-Design gehen.

---

## Strategie E — Replay-Prüfstand: Messen statt Gefühl  ⭐ zuerst umsetzen

**Wissen.** Jede Strategie oben braucht ein Urteil „besser/schlechter" — bisher entsteht das am Gerät per Daumengefühl, nicht reproduzierbar. Ein Replay-Prüfstand macht Tracking-Qualität zur Zahl: echte Kamera-Sessions aufzeichnen, offline deterministisch durch den Tracker spielen, Kennzahlen vergleichen. Danach ist auch automatisches Parameter-Tuning möglich (STAB-Werte gegen Zielfunktion optimieren statt Regler-Raten).

**Vorgehen.**
1. **Aufnahme:** `?record`-Modus — MediaRecorder auf den Kamerastream (webm), parallel `deviceorientation`-Events + Zeitstempel als JSON; Download aufs Gerät. 4–5 Standard-Szenen definieren: Ruhe auf Tisch, langsames Schieben, schnelles Schieben, Kippen, Verlust/Wiederfinden.
2. **Replay:** Desktop-Harness (Node/Browser): Video Frame für Frame in die MindAR-Pipeline + Gyro-JSON in den Stabilizer — gleiche Codebasis, deterministisch.
3. **Metriken:** Jitter-RMS in Ruhe (mm, wie `?stats`), Nachlauf bei Bewegung (Phasenverzug geschätzte vs. per Marker-Ecken „wahre" Position), Abriss-Rate (LOST-Events/min), Vision-Hz, Verzerrungs-Events (Scale-/Tilt-Ausreißer vor dem Lock).
4. **Optimierung:** Grid/Nelder-Mead über STAB-Parameter gegen gewichtete Zielfunktion; bestes Set → `tuning.json`.
5. Ab dann gilt: **jede** Änderung (A–D) läuft gegen dieselben Aufnahmen — Fortschritt wird beweisbar.

---

## Empfohlene Reihenfolge

| # | Was | Warum zuerst |
|---|-----|--------------|
| 1 | **E** Prüfstand | Macht alles andere messbar; verhindert Gefühls-Tuning |
| 2 | **D** Eck-Anker-Karte | Größter Hebel/Stunde, null Software-Risiko, passt zum anstehenden Kartendesign |
| 3 | **A1–A3** Rohsignal | Billig, sofort, unabhängig von allem |
| 4 | **B3 + B1** Fluss + Worker | Kamerarate-Tracking, unschärfe-tolerant — der Fork, der sich lohnt |
| 5 | **B4, B2** Sub-Pixel, WebGPU | Feinschliff im Fork |
| 6 | **C1** WebXR-Fusion (Android) | „Level 2" nach Demo-Erfolg; iOS bleibt Ist-Stand |
| 7 | **C2** WASM-SLAM | Nur als begrenzter Forschungs-Spike |
