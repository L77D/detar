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
// Einheiten-Hinweis: Positionen sind in MindAR-Einheiten (Kartenbreite = 1),
// ~10× größer als die Zapworks-Meter — beta/posDeadZone sind daher anders
// skaliert als die alten PoseStabilizer.ts-Werte.
export const STAB = {
  // (a) MindAR-eingebauter Filter (Rohsignal, Defaults belassen)
  filterMinCF: 0.001,
  filterBeta: 1000,
  missTolerance: 5,     // Frames "Karte kurz verloren" aushalten
  warmupTolerance: 5,   // Frames bis "Karte gefunden" gemeldet wird

  // (b) PoseStabilizer — Haupt-Glättung
  minCutoff: 1.0,       // Grund-Glättung in Ruhe. KLEINER = ruhiger, aber träger
  beta: 0.0015,         // wie stark Bewegung die Glättung löst. GRÖSSER = wacher
  dCutoff: 1.0,         // Glättung der Geschwindigkeitsschätzung (selten anfassen)
  rotLerp: 0.35,        // SLERP-Faktor pro Frame @60Hz. KLEINER = ruhiger/träger
  posDeadZone: 0.0015,  // darunter kein Positions-Update → Figur steht 100% still
  rotDeadZone: 0.0015,  // dito Rotation (Radiant)
  lostHoldMs: 250,      // letzte gute Pose so lange halten, bevor ausgeblendet
  refHz: 60,
};

const ALL = { TYPO, FACE, IDLE, ACT, CHOREO, SCENE, STAB };

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
