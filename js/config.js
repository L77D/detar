/* =============================================================================
   DETAR — zentrale Konfiguration (alle Dashboards). EINE Quelle: die Werte
   hier sind die Live-Werte. Ein aus dem Dev-Panel exportiertes Preset kann
   als tuning.json ins Repo-Root gelegt werden und überschreibt sie beim Laden
   (loadTuning) — für Tuning-Sessions, nicht als Dauerzustand.
   ============================================================================= */

// SpeechBubble → TYPO
export const TYPO = {
  fontFamily: '"Jersey 10", monospace',
  fontWeight: "normal",
  fontSize: 52,
  lineSpacing: 0.8,
  textColor: "#f6f6f6", // UI-Update 2026-09-03 (Figma)
  strokeColor: "#000000",
  strokeWidth: 8,      // 2026-09-09: aus tuning.json übernommen (vorher 22)
  paddingPx: 28,
  maxLines: 5,
  maxWidth: 1.2,
  unitsPerPx: 0.002,
  offsetX: 0,          // 2026-09-09: aus tuning.json (vorher 0.14)
  offsetY: -0.17,      // 2026-09-09: aus tuning.json (vorher -0.3)
  msPerChar: 28,
  // Dialogsystem (2026-09-03): Baseline-Lage im Zeilenraster (Anteil fontSize,
  // alphabetic) + Highlight-Effekte im Sprechtext (Auszeichnung in der Karte:
  // <marker> <gross> <leise> <knall>; welle/zittern werden nicht bewegt).
  baselineRatio: 0.8,
  fxMarkerColor: "#fced62", // <marker>: gelbe Schrift + Unterstrich; auch Seitenzähler (Figma-Gelb)
  fxGrossScale: 1.16,       // <gross>: Schriftgröße × Faktor
  fxLeiseAlpha: 0.62,       // <leise>: Deckkraft der Füllung
  fxKnallMs: 260,           // <knall>: Dauer des Aufploppens je Zeichen
  fxKnallScale: 1.7,        // <knall>: Start-Vergrößerung
  pageLabel: "nein",        // Seitenzähler „1/3" in der Blase (Michael 2026-09-07: aus; Seiten + Weiter bleiben)
};

// Emotion-Tags der Kartendatei → heute vorhandene Körper (idle/affirm/think).
// Zwischenlösung (03.09.2026), bis der Rig die elf Posen liefert — dann
// entfällt die Tabelle, der Tag wird direkt zum Posennamen.
export const POSES = {
  neutral: "idle", erklaeren: "idle", halten: "idle", zweihaendig: "idle",
  winken: "affirm", bestaetigen: "affirm", stolz: "affirm", zeigen: "affirm",
  denken: "think", schulterzucken: "think", erschoepft: "think",
};
export const poseFor = (tag) => POSES[tag] ?? "idle";

// FaceAnimator → FACE
export const FACE = {
  blinkIntervalMin: 2.0,
  blinkIntervalMax: 5.0,
  blinkDuration: 0.12,
  talkFrameMs: 150,
};

// IdleWander → IDLE
export const IDLE = {
  markerWidth: 0.09, markerHeight: 0.125, roamFraction: 0.8, // 2026-09-09: aus tuning.json (vorher 0.033/0.033)
  bopAmplitude: 0.015, bopFrequency: 0.5, // 2026-09-09: aus tuning.json (vorher 0.04/1.1)
  walkSpeed: 0.04, walkFrequency: 2.2, walkRollMax: 0.18, stepSquash: 0.05,
  headLookMax: 0.5, headPitchMax: 0.35,
  bopHoldMin: 1.5, bopHoldMax: 3.5, actionMin: 1.2, actionMax: 2.4,
  cameraFacingThreshold: 45, faceCamLerp: 0.12,
  lookChance: 0.6, walkChance: 0.4, // 2026-09-09: lookChance aus tuning.json (vorher 0.4)
};

// ActivationAnim → ACT
export const ACT = {
  durationSec: 1.55, // 2026-09-09: aus tuning.json (vorher 1.2 / 0 / 1.7)
  spins: 2,
  overshoot: 1.75,
};

// CardController / CSS
export const CHOREO = {
  requireTap: "ja",      // "ja" = Aktivier-Phase (Karte leuchtet, Tap startet
                         // die Figur) · "nein" = Figur kommt direkt beim Scan
  uiRevealMs: 1000,      // reine CSS-Einfahr-DAUER (--q-reveal-time), keine Wartezeit
  revealOffset: 60,      // CSS --q-reveal-offset (px)
  idleReturnMs: 5500,    // Haltezeit NACH dem Typewriter (wird von der Karte überschrieben); 2026-09-09: aus tuning.json (vorher 8000)
  greetingPose: "idle",
  billboardLerp: 0.2,    // 2026-09-09: aus tuning.json (vorher 0.18)
  jumpDurationSec: 0.45, // Figur-Tap: Parabel-Hüpfer zur Kartenmitte
  jumpHeight: 0.04,
  // Dialogsystem (2026-09-03)
  continueDelayMs: 350,   // automatisches Weiter nach einer Antwort (kein Knopf)
  collapseDelayMs: 900,   // Abschiedszeile steht so lange, bevor die Figur einklappt
  collapseSec: 0.5,       // Dauer des Einklappens (Figur → Karte)
  trackingLostMs: 1500,   // ab dieser Verlustdauer friert das Menü sichtbar ein
};

// Szene (Skalierung + Nick-Achse). cardWidth koppelt die Prototyp-Einheiten an
// die MindAR-Einheiten: MindAR normiert die Kartenbreite auf 1 Einheit, im
// Prototyp war die Karte cardWidth (0.17) Einheiten breit. worldRoot wird um
// 1/cardWidth skaliert — damit gelten ALLE getunten Werte (Lauffeld, Bubble,
// Sprünge …) unverändert weiter.
export const SCENE = {
  cardWidth: 0.059,  // physische Kartenbreite in m (59 × 91 mm hochkant, Michael 2026-09-07);
                     // 2026-09-09: Default statt tuning.json-Override (vorher 0.17)
                     // (Karte 59×91 mm hochkant, Michael 2026-09-07; vorher 0.095)
  cardAspect: 2156 / 1346, // Höhe/Breite des Tracking-Targets (2026-09-07, 2. Fassung: beschnittene
                           // Demo-Karte 070926 ohne Rand, 1346×2156 px = 1,60; die Vollkarte war
                           // 2910×4488 = 1,54, die PENNY-Demokarte 2199×3000 = 1,36).
                           // MindAR normiert die Kartenbreite auf 1; die Höhe (Eck-Marker,
                           // Lauffeld, Desktop-Plane) kommt aus diesem Wert.
  figureScale: 0.85, // 2026-09-07 (Michael): gesamte AR-Szene auf ~85 % — Figur samt
                     // Sprechblase (rig.js) und Hüpf-Icon (activationFX.js); die
                     // Eck-Marker bleiben auf den Kartenecken, die sind Kartengeometrie.
  headNodAxis: 0.25, // Höhe der Kopf-Nick-Achse ÜBER dem HeadPivot (≈ Kopfmitte)
  bgColor: "#9a9a9a", // nur Desktop-Testmodus
  debug: false,       // pinke Debug-Overlays (auch per ?debug in der URL)
};

// Tracking-Glättung: UNSER PoseStabilizer (js/poseStabilizer.js, Port des in
// Zapworks verifizierten Filters): One-Euro-Position + SLERP-Rotation +
// Dead-Zone + Lost-Hold zwischen Rohpose und Figur. (Die 8th-Wall-Engine hat
// keinen konfigurierbaren Vorfilter; die MindAR-Keys filterMinCF/filterBeta/
// missTolerance/warmupTolerance sind seit 2026-09-09 weg.)
// Faustregel: erst minCutoff runter, bis das Ruhe-Zittern weg ist, dann beta
// hoch, bis schnelle Bewegung ohne Nachziehen folgt — EINE Schraube pro Test.
// EINHEITEN: Der PoseStabilizer filtert in KARTENBREITEN (er normiert die
// Rohpose intern über die Anchor-Scale = Kartenbreite). posDeadZone 0.001
// = 1/1000 Kartenbreite (≈ 0,15 mm bei 15-cm-Karte); beta bezieht sich auf
// Geschwindigkeit in Kartenbreiten/s.
export const STAB = {
  // --- Feature-Schalter (Dev-Panel „Tracking-Features an/aus") ---------------
  // Jeder Baustein einzeln abschaltbar, um sein Verhalten zu isolieren.
  enabled: "ja",     // 1 PoseStabilizer komplett (nein = rohe Anchor-Pose 1:1)
  normalize: "ja",   // 2 Einheiten-Normierung auf Kartenbreiten (nein = Pixel-Skala,
                     //   reproduziert den „Filter wirkungslos"-Zustand)
  deadZones: "ja",   // 3 Snap-to-still (Position + Rotation)
  lostHold: "ja",    // 4 letzte Pose bei Verlust kurz halten (nein = sofort weg)
  nanGuard: "ja",    // 5 kaputte Posen verwerfen (nein = alter Verschwinde-Bug möglich!)
  snap: "ja",        // 6 Re-Found-Snap statt Hinübergleiten
  scaleLock: "ja",   // 9 Anchor-Scale einfrieren + Scale-Ausreißer-Frames verwerfen
                     //   (2026-07-14: Scale ist strukturell KONSTANT — Wackeln kommt
                     //   aus MindARs elementweisem Matrix-Filter/Fehl-Homographien
                     //   und erzeugte „Figur schräg/zu groß" + Positions-Jitter über
                     //   die Normierung)
  // 7 = GYRO.enabled · 8 = extrapolate (unten)

  minCutoff: 0.1,       // Grund-Glättung in Ruhe. KLEINER = ruhiger, aber träger.
                        // 2026-07-14: 1.0 → 0.1 (deutlich ruhiger in Ruhe; beta=10
                        // öffnet den Filter bei Bewegung, daher trotzdem reaktiv).
  beta: 10,             // wie stark Bewegung die Glättung löst. GRÖSSER = wacher.
                        // 2026-07-14 (Finding 3): 0.002 → 10. Der alte Wert öffnete
                        // den Filter faktisch NIE (1 KB/s ⇒ +0.002 Hz) — der Filter
                        // war ein fixer ~1-Hz-Tiefpass, Nachlauf ~160 ms, und die
                        // Far-Debounce feuerte auf den eigenen Lag (Freeze→Pop bei
                        // schnellen Schwenks). Jetzt: 0.5 KB/s ⇒ ~6 Hz (wach),
                        // Ruhe-Rauschen (~0.03 KB/s) ⇒ ~1.3 Hz (weiter ruhig).
  dCutoff: 1.0,         // Glättung der Geschwindigkeitsschätzung (selten anfassen)
  rotMinCutoff: 0.5,    // Rotations-Glättung in Ruhe (Hz). KLEINER = ruhiger/träger.
                        // 2026-07-14: 1.5 → 0.5 (ruhiger; rotBeta öffnet bei Drehung).
  rotBeta: 4.0,         // wie stark Drehgeschwindigkeit die Glättung öffnet
                        // (adaptiv 2026-07-13 — ersetzt den fixen rotLerp)
  posDeadZone: 0.001,   // Kartenbreiten; darunter kein Update → Figur steht 100% still
  rotDeadZone: 0.0015,  // dito Rotation (Radiant)
  lostHoldMs: 250,      // letzte gute Pose so lange halten, bevor ausgeblendet
  snapDist: 0.25,       // Kartenbreiten; Messung weiter weg → snappen statt gleiten
  snapAngle: 0.5,       // Radiant (~29°); dito Rotation
  scaleOutlier: 0.1,    // relative Scale-Abweichung von der eingefrorenen Scale;
                        // darüber gilt der GANZE Frame als Fehl-Messung → verwerfen
  // AUFSETZEN PER MEDIAN (2026-09-07, Michael: „initialer Scan sitzt schief"):
  // Nicht der erste Frame prägt Pose + Scale-Lock, sondern der Median der
  // ersten Messungen (Position je Achse, Medoid-Rotation, Median-Scale). Ein
  // einzelner schräger/unscharfer Frame wird so überstimmt. Solange gesammelt
  // wird, zeigt die Szene den laufenden Median (kein Warten ohne Bild).
  acquireFrames: 10,    // so viele NEUE Vision-Messungen einsammeln
  acquireMaxMs: 700,    // spätestens danach aufsetzen (bei langsamer Vision-Hz), min. 3 Messungen
  // SCALE-RE-LOCK (2026-09-07): weicht die Scale so lange AM STÜCK um mehr als
  // scaleOutlier vom Lock ab, war der Lock falsch → komplett neu aufsetzen
  // (vorher wurden solche Frames endlos verworfen, die Figur blieb schief).
  scaleRelockMs: 600,

  // Bewegungs-Extrapolation (2026-07-09): MindAR misst nur mit ~15–30 Hz —
  // zwischen zwei Messungen wird die Pose mit der zuletzt gemessenen
  // Geschwindigkeit WEITERGEFÜHRT (Dead Reckoning), statt treppig zu stehen.
  // Zusätzlich schaltet erkannte Bewegung die Dead-Zone ab: ruhig in Ruhe,
  // flüssig in Bewegung.
  extrapolate: "ja",
  extrapMaxMs: 150,     // max. so lange vorhersagen (dann halten)
  latencyMs: 40,        // Alter der Vision-Messung (Verarbeitungszeit) — wird
                        // im Bewegt-Modus zusätzlich vorhergesagt (weniger Nachlauf)
  moveDwellMs: 250,     // so lange ohne Schwellen-Überschreitung, bevor zurück
                        // in den Ruhe-Modus
  // Ausreißer-/Überschwinger-Kappen (2026-07-13, gegen „Figur schräg/riesig"):
  maxSpeed: 3,          // Kartenbreiten/s — schnellere Schätzung = Messfehler
  maxAngSpeed: 4,       // rad/s — dito Rotation
  extrapMaxDist: 0.08,  // Kartenbreiten — max. Vorhersage-Strecke pro Frame-Ziel
  extrapMaxAngle: 0.25, // rad (~14°) — max. Vorhersage-Drehung
  minSpeed: 0.04,       // Kartenbreiten/s FENSTER-DRIFT; darunter gilt „steht".
                        // (Bewegt-Erkennung läuft über geglättete 250-ms-Drift statt
                        // Momentan-Geschwindigkeit — tremor-fest.)
                        // 2026-07-14 (Finding 3): 0.1 → 0.04. Sanftes Karten-Handling
                        // (~0,6 cm/s+) zählt jetzt als BEWEGT → Extrapolation an,
                        // Dead-Zones aus — vorher lief genau dieses Band als „ruhig"
                        // durch den geschlossenen Filter (15–30-Hz-Treppensignal).
  minAngSpeed: 0.09,    // rad/s; dito für Rotation.
                        // 2026-07-14 (Finding 3): 0.3 (~17°/s!) → 0.09 (~5°/s) —
                        // normales Kippen der Karte lag fast immer UNTER der alten
                        // Schwelle und wurde als Ruhe behandelt.
  refHz: 60,
};

// Aktivier-Phase (ActivationFX, UI-Update 2026-09-03): vier gelbe Eck-Marker
// auf den Kartenecken, wabern leicht auf und ab; beim Tap ploppen sie auf und
// faden (dann kommt die Figur). Glow + Partikel der Vorversion sind entfernt.
export const ACTFX = {
  markerSize: 0.14,    // Kantenlänge der Marker (Anteil Kartenbreite; Figma: 32 px bei ~230 px Karte)
  bobHeight: 0.05,     // Hub des Waberns (Anteil Kartenbreite)
  bobSec: 1.6,         // Periode des Waberns (s)
  burstSec: 0.35,      // Dauer des Aufploppens beim Tap bis zur Figur
  color: "#fced62",    // Marker-Füllung (Figma-Gelb)
  outline: "#000000",  // Marker-Kontur
  outlineWidth: 4.44,  // Konturstärke in viewBox-Einheiten (32,59 = Marker-Kante)
  // Handy-Icon springt beim Erkennen aus dem Panel und hüpft auf der Karten-
  // mitte (2026-09-04, seit Build 22 auch live — vorher nur Lokal-Prototyp).
  hopper: "ja",
  iconHeight: 0.34,    // Icon-Höhe (Anteil Kartenbreite)
  hopHeight: 0.12,     // Sprunghöhe (Anteil Kartenbreite)
  hopSec: 0.32,        // Dauer eines Sprungs
  hopPauseSec: 0.9,    // Pause zwischen den Sprüngen
  dropHeight: 0.6,     // Landeanflug: Starthöhe (Anteil Kartenbreite)
  dropSec: 0.4,        // Dauer des Landeanflugs
  shadowW: 1.0,        // Schatten-Rechteck: Breite (Anteil Icon-Breite), 50 % Deckkraft, direkt unter dem Icon
  shadowD: 0.35,       // Schatten-Rechteck: Tiefe (Anteil Icon-Breite)
};

// Sound-Design (js/sound.js → tiks, js/vendor/tiks.js): prozedurale UI-Sounds,
// reine Web-Audio-Synthese — keine Audio-Dateien, kein Netzwerk. Das Theme
// färbt ALLE Sounds gemeinsam ("arcade" = 8-bit/Chiptune, passt zum Pixel-Look).
export const SOUND = {
  enabled: "ja",
  theme: "arcade",   // "soft" | "crisp" | "arcade" | "glass"
  volume: 0.3,       // 0–1 (tiks-Default 0.3 — dezent), Master für UI + Stimme
  // Bubble-Text-Vertonung: "silben" = Animalese-Stimme (js/voice.js),
  // "ticks" = alte abstrakte Blips, "aus" = stumm tippen.
  speech: "silben",
  typeTicks: "ja",   // nur für speech="ticks": Ticks an/aus (Altverhalten)
  typeTickMs: 70,    // min. Abstand zwischen zwei Ticks (ms) — Dichte des Ratterns
  // Stimme (VoiceSynth) — Charakter „aufgeweckt, aber selbstsicher":
  speechPitch: 300,    // Grund-Stimmlage (Hz). Höher = heller/jünger
  speechTempoMs: 75,   // min. Abstand zwischen Silben (ms). Kleiner = plappriger
  speechLively: 2.5,   // Tonhöhen-Lebhaftigkeit (± Halbtöne). 0 = monoton
  speechLen: 90,       // Silben-Länge (ms). Länger = gedehnter, singender
  speechVolume: 0.6,   // Stimm-Pegel relativ zum Master (volume × speechVolume)
};

// Gyro-Fusion: Handy-Gyroskop stützt die visuelle Pose (Prediction) und
// überbrückt kurze Tracking-Aussetzer. Kill-Switch zusätzlich per ?nogyro.
export const GYRO = {
  enabled: "ja",
  bridgeMs: 1200,        // wie lange ein Aussetzer gyro-geführt überbrückt wird
  deltaDeadZone: 0.0012, // rad; AKKUMULATIONS-Schwelle (2026-07-14, Finding 4):
                         // qPrev rückt in GyroFusion nur vor, wenn das Delta auch
                         // ANGEWENDET wird — langsame Drehungen summieren sich auf
                         // und feuern in ~0.07°-Quanten, statt Frame für Frame
                         // verworfen zu werden (vorher trug die Prediction bei
                         // Schwenks < ~4°/s NICHTS bei). Rauschen bleibt draußen.
  deltaMax: 0.2,         // rad; größere Deltas = Sensor-Glitch → verwerfen (resync)
};

// Kamera: Die 8th-Wall-Engine wählt die Auflösung selbst (geräteabhängige
// Constraint-Leiter mit Retry); gelieferte Auflösung in ?stats ablesen.
export const CAM = {
  maxPixelRatio: 2,      // Canvas-Cap (Finding 2, 2026-07-14): main.js setzt die
                         // Canvas-Pixelgröße = CSS-Größe × min(devicePixelRatio, Cap)
                         // — Cap 2 statt 3 auf iPhones gibt der Vision-Schleife GPU-Luft.
};

const ALL = { TYPO, FACE, IDLE, ACT, CHOREO, SCENE, STAB, GYRO, ACTFX, CAM, SOUND };

/* Optional: tuning.json (Preset-Export aus dem Dev-Panel) im Repo-Root
   überschreibt die Defaults. Seit 2026-09-09 liegt KEINE tuning.json mehr im
   Repo — alle getunten Werte sind Defaults hier; die Datei bleibt ein Werkzeug
   für Tuning-Sessions (Dev-Panel → Export, Datei daneben legen, testen). */
export async function loadTuning() {
  try {
    const res = await fetch("./tuning.json", { cache: "no-store" });
    if (!res.ok) return false;
    const s = await res.json();
    for (const [name, obj] of Object.entries(ALL)) {
      if (s[name]) Object.assign(obj, s[name]);
    }
    return true;
  } catch (e) {
    return false; // Datei fehlt oder ungültig → Defaults
  }
}

/* CSS-Variablen mit CHOREO synchron halten (eine Quelle statt zwei Stellen). */
export function syncCssVars() {
  const r = document.documentElement.style;
  r.setProperty("--q-reveal-time", CHOREO.uiRevealMs / 1000 + "s");
  r.setProperty("--q-reveal-offset", CHOREO.revealOffset + "px");
}

/* Per-Frame-Lerps aus dem Mattercraft-Code (faceCamLerp, billboardLerp) sind
   fps-abhängig — auf 60-fps-Äquivalent normalisieren (identisch bei 60 fps). */
export function frameLerp60(lerpPerFrame, dt) {
  return 1 - Math.pow(1 - lerpPerFrame, dt * 60);
}
