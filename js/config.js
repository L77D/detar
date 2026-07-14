/* =============================================================================
   DETAR — zentrale Konfiguration (alle Dashboards des Lokal-Prototyps).
   Parameter-NAMEN und Default-WERTE identisch zum Tuning-Prototyp
   (DETAR_Lokal_Prototyp.html) — ein dort exportiertes Preset (.json) kann
   unverändert als tuning.json ins Repo-Root gelegt werden und überschreibt
   diese Defaults beim Laden (siehe loadTuning()).
   ============================================================================= */

// SpeechBubble → TYPO
export const TYPO = {
  fontFamily: '"Jersey 10", monospace',
  fontWeight: "normal",
  fontSize: 52,
  lineSpacing: 0.8,
  textColor: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: 22,
  paddingPx: 28,
  maxLines: 5,
  maxWidth: 1.2,
  unitsPerPx: 0.002,
  offsetX: 0.14,
  offsetY: -0.3,
  msPerChar: 28,
};

// FaceAnimator → FACE
export const FACE = {
  blinkIntervalMin: 2.0,
  blinkIntervalMax: 5.0,
  blinkDuration: 0.12,
  talkFrameMs: 150,
};

// IdleWander → IDLE
export const IDLE = {
  markerWidth: 0.033, markerHeight: 0.033, roamFraction: 0.8,
  bopAmplitude: 0.04, bopFrequency: 1.1,
  walkSpeed: 0.04, walkFrequency: 2.2, walkRollMax: 0.18, stepSquash: 0.05,
  headLookMax: 0.5, headPitchMax: 0.35,
  bopHoldMin: 1.5, bopHoldMax: 3.5, actionMin: 1.2, actionMax: 2.4,
  cameraFacingThreshold: 45, faceCamLerp: 0.12,
  lookChance: 0.4, walkChance: 0.4,
};

// ActivationAnim → ACT
export const ACT = {
  durationSec: 1.2,
  spins: 0,
  overshoot: 1.7,
};

// CardController / CSS
export const CHOREO = {
  requireTap: "ja",      // "ja" = Aktivier-Phase (Karte leuchtet, Tap startet
                         // die Figur) · "nein" = Figur kommt direkt beim Scan
  uiRevealMs: 1000,      // reine CSS-Einfahr-DAUER (--q-reveal-time), keine Wartezeit
  revealOffset: 60,      // CSS --q-reveal-offset (px)
  idleReturnMs: 8000,    // Haltezeit NACH dem Typewriter (wird von der Karte überschrieben)
  greetingPose: "idle",
  billboardLerp: 0.18,
  jumpDurationSec: 0.45, // Figur-Tap: Parabel-Hüpfer zur Kartenmitte
  jumpHeight: 0.04,
};

// Szene (Skalierung + Nick-Achse). cardWidth koppelt die Prototyp-Einheiten an
// die MindAR-Einheiten: MindAR normiert die Kartenbreite auf 1 Einheit, im
// Prototyp war die Karte cardWidth (0.17) Einheiten breit. worldRoot wird um
// 1/cardWidth skaliert — damit gelten ALLE getunten Werte (Lauffeld, Bubble,
// Sprünge …) unverändert weiter.
export const SCENE = {
  cardWidth: 0.17,
  cardAspect: 2048 / 1500, // Höhe/Breite des Kartenbilds (bei neuem Layout anpassen)
  headNodAxis: 0.25, // Höhe der Kopf-Nick-Achse ÜBER dem HeadPivot (≈ Kopfmitte)
  bgColor: "#9a9a9a", // nur Desktop-Testmodus
  debug: false,       // pinke Debug-Overlays (auch per ?debug in der URL)
};

// Tracking-Glättung. ZWEI Stufen:
// (a) MindARs eingebauter One-Euro-Filter (filterMinCF/filterBeta) — Rohsignal.
// (b) UNSER PoseStabilizer (js/poseStabilizer.js, Port des in Zapworks
//     verifizierten Filters): One-Euro-Position + SLERP-Rotation + Dead-Zone
//     + Lost-Hold zwischen Anchor und Figur. Das ist die Haupt-Glättung.
// Faustregel: erst minCutoff runter, bis das Ruhe-Zittern weg ist, dann beta
// hoch, bis schnelle Bewegung ohne Nachziehen folgt — EINE Schraube pro Test.
// EINHEITEN: Der PoseStabilizer filtert in KARTENBREITEN (er normiert MindARs
// pixel-skalierte Anchor-Pose intern über die Anchor-Scale). posDeadZone 0.001
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
  // 7 = GYRO.enabled · 8 = extrapolate (unten)

  // (a) MindAR-eingebauter Filter (Rohsignal, Defaults belassen)
  filterMinCF: 0.01,    // 2026-07-14: 0.001 → 0.01. Bei Karten-Bewegung hing die
                        // intern gefilterte Pose zu weit hinter der Messung → MindARs
                        // eigener Tracker suchte am falschen Ort und verwarf den Track
                        // („verliert sich beim Verschieben"). Höheres CF = Pose folgt
                        // schneller, Tracker bleibt dran.
  filterBeta: 1000,
  missTolerance: 5,     // Frames "Karte kurz verloren" aushalten
  warmupTolerance: 3,   // Frames bis "Karte gefunden" gemeldet wird (5→3
                        // 2026-07-13: schnelleres Anspringen beim Scan)

  // (b) PoseStabilizer — Haupt-Glättung (Werte prüfstand-kalibriert 2026-07-08)
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

// Aktivier-Phase (ActivationFX): Karten-Glow + aufsteigende Pixel-Partikel,
// bevor die Figur erscheint. Optik-Dashboard — alles im Dev-Panel regelbar.
export const ACTFX = {
  count: 16,           // Partikel-Anzahl (Regler baut den Pool neu)
  size: 0.008,         // Basisgröße der Quadrate (Karten-Einheiten)
  riseHeight: 0.07,    // wie hoch sie aufsteigen
  riseSec: 1.8,        // Dauer eines Aufstiegs
  pulseSec: 1.6,       // Glow-Puls-Periode
  glowOpacity: 0.5,    // Glow-Stärke (0–1)
  burstSec: 0.7,       // Dauer des Tap-Blitzes bis zur Figur
  glowColor: "#ffdd00",
  color1: "#ffdd00",   // Partikel-Farben (Karten-Look: gelb/weiß)
  color2: "#ffffff",
};

// Einblick-Modus (PortalView + FigureFlip, js/portalView.js): Portal-Parallax-
// Karte — übergroßes Bild HINTER der Karte, stencil-maskiert aufs Karten-
// Fenster; Figur springt auf die Karte und legt sich plan hin.
// EINHEITEN: Karten-Frame (Kartenbreite = SCENE.cardWidth = 0.17).
export const PORTAL = {
  depth: 0.06,       // Tiefen-Offset des Bilds unter der Karte (mehr = stärkere Parallaxe)
  oversize: 2.0,     // Bildgröße relativ zum Fenster. MUSS mit depth wachsen:
                     // Parallax-Faktor wird auf (oversize−1) geclampt — das ist
                     // die harte „Leere nie sichtbar"-Garantie. 2.0 deckt
                     // depth/camY bis 1.0 ab (Kamera bis 45° flach).
  windowW: 0.9,      // Fenster-Breite als Anteil der Kartenbreite
  windowH: 0.9,      // Fenster-Höhe als Anteil der Kartenhöhe
  damp: 0.22,        // Offset-Dämpfung (fps-normalisierter Lerp) — glättet das
                     // durch die Tiefe verstärkte Marker-Zittern
  minCamY: 0.02,     // Kamera flacher als das → Offset einfrieren (degeneriert)
  fadeSec: 0.35,     // Crossfade beim Galerie-Wechsel
  showSec: 0.4,      // Ein-/Ausblenden des Portals beim Tab-Wechsel
  flipSec: 0.7,      // Figur-Sprung zur Portal-Oberkante (Dauer)
  flipHeight: 0.06,  // Bogenhöhe des Sprungs
  figureScale: 0.33, // Figur-Größe im Einblick (Faktor; Figur stellt sich
                     // verkleinert an die OBERKANTE des Portal-Fensters —
                     // geändert 2026-07-13, vorher: flach hinlegen/flatY)
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

// Kamera-Anforderung (2026-07-14, Finding 1): MindAR fragt die Kamera OHNE
// Auflösung an (video:{facingMode}) — Phones liefern dann meist 640×480, und
// der Tracker arbeitet direkt auf dieser Auflösung (inputWidth = videoWidth).
// Grobe Features = Pose-Rauschen; das ist der größte Roh-Signal-Hebel.
// MindARThree hat KEINEN Auflösungs-Parameter → main.js wrappt getUserMedia
// einmalig und schleust width/height als `ideal` ein (ideal kann nie zum
// Constraint-Fehler führen; das Gerät liefert das nächstbeste Format).
// A/B am Gerät: ?res=WxH übersteuert, ?res=0 schaltet den Patch ab.
// Tatsächlich gelieferte Auflösung + Vision-Hz in ?stats prüfen — bricht die
// Hz ein, 960x540 testen.
export const CAM = {
  width: 1280,
  height: 720,
  maxPixelRatio: 2,      // Renderer-Cap (Finding 2): MindAR setzt devicePixelRatio
                         // (= 3 auf iPhones) — Cap auf 2 gibt dem tfjs-Tracker
                         // GPU-Luft → höhere Vision-Hz, optisch kaum sichtbar.
};

const ALL = { TYPO, FACE, IDLE, ACT, CHOREO, SCENE, STAB, GYRO, ACTFX, PORTAL, CAM };

/* tuning.json (Preset-Export aus dem Lokal-Prototyp) laden und über die
   Defaults mergen. Fehlt die Datei, laufen die Defaults — kein Fehler. */
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
