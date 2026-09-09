/* =============================================================================
   DETAR — App-Boot: Splash → Kamera → 8th-Wall-Bildtracking → Choreographie.

   Zwei Modi:
   • Normal (Handy): 8th Wall Image Targets (Open-Source-Engine, selbst gehostet
                     unter vendor/8thwall/), Figur steht auf der echten Karte.
   • ?desktop:       Desktop-Testmodus ohne Kamera (js/desktopMode.js) — Karte
                     als Boden-Plane, Maus-Orbit. Zum Entwickeln/Prüfen.
   • ?debug:         pinke Hilfslinien (Lauffeld + FACE_CAM-Kegel) zuschalten.

   TRACKING (seit 2026-09-09, Branch 8thwall-image-targets): Die Kamera und die
   Bilderkennung liefert die Open-Source-8th-Wall-Engine (MIT, ohne SLAM). Sie
   läuft in einer eigenen Kamera-Pipeline (XR8.run) — KEIN SLAM/World-Tracking
   (disableWorldTracking: true), kein Niantic-Cloud-Aufruf, kein API-Key. Die
   Engine wird ERST in der Start-Geste geladen (Splash → „Scan starten"), vorher
   läuft weder Skript noch Kamera. Die Bildpose kommt als Event
   (reality.imagefound / imageupdated / imagelost) in Szenen-Koordinaten und wird
   hier in die KAMERA-relative Rohpose umgerechnet, die der PoseStabilizer seit
   dem MindAR-Stand erwartet — Glättung, Gyro-Fusion, Median-Aufsetzen, ?stats
   und die gesamte Choreographie bleiben unverändert.

   KOORDINATEN-KERN (unverändert): Zapworks lief im Anchor-Origin-Modus (Karte =
   Welt-Ursprung, Kamera bewegt sich). Der Stabilizer arbeitet invertiert
   (Kamera = Ursprung, der Karten-Anchor bewegt sich im Kamera-Raum) — deshalb
   hängt stabRoot unter der Kamera. Figur + Bubble leben unter einem `worldRoot`
   (Karten-Frame: X = Karte rechts, Y = hoch von der Karte weg, Z = zur Karten-
   Unterkante), und alle "Wo ist die Kamera?"-Rechnungen transformieren die
   Kamera-Weltposition in diesen Frame (frame.getCamLocal) — die komplette
   Behavior-Logik aus dem Prototyp bleibt dadurch 1:1 gültig.

   SKALIERUNG: Die Anchor-Scale wird auf die KARTENBREITE in Szeneneinheiten
   gesetzt (8th Wall: scale × scaledWidth; der 3:4-Crop des Targets behält die
   volle Kartenbreite, s. docs/8thwall-migration.md). Damit ist eine Anchor-
   Einheit = eine Kartenbreite — genau wie bei MindAR — und worldRoot.scale =
   1/cardWidth lässt alle getunten Werte (Lauffeld, Bubble, Sprünge …) gelten.
   ============================================================================= */
import * as THREE from "three";
import { card } from "../cards/elektroniker.js";
import { SCENE, STAB, CAM, CHOREO, GYRO, loadTuning, syncCssVars } from "./config.js";
import { buildRig } from "./rig.js";
import { FaceAnimator } from "./faceAnimator.js";
import { SpeechBubble } from "./speechBubble.js";
import { IdleWander } from "./idleWander.js";
import { ActivationAnim } from "./activationAnim.js";
import { QuestionMenu } from "./questionMenu.js";
import { CardController } from "./cardController.js";
import { ActivationFX } from "./activationFX.js";
import { PoseStabilizer } from "./poseStabilizer.js";
import { GyroFusion } from "./gyroFusion.js";
import { sound } from "./sound.js";
import { buildSupport } from "./supportUI.js";

const params = new URLSearchParams(location.search);
const DESKTOP_MODE = params.has("desktop");
// Debug NUR per URL (?debug) — SCENE.debug aus einem Preset wird bewusst
// ignoriert (Leftover aus Tuning-Sessions soll nie live erscheinen).
const DEBUG_MODE = params.has("debug");
const DEV_MODE = params.has("dev");           // Tuning-Panel (Regler)
const TIMELINE_MODE = params.has("timeline"); // Theatre.js-Studio (Keyframe-Editor)
// NEU-AUFSETZEN auf Tap (2026-09-07): wird im AR-Modus gesetzt (startAR) —
// PoseStabilizer per Median neu aufsetzen. Aufrufer: Figur-Tap (Hüpfer
// kaschiert den Sprung) und Karten-Tap in der „Karte gefunden"-Phase. Im
// Desktop-Modus null. (Unter MindAR wurde hier zusätzlich die Neu-Erkennung
// des Trackers erzwungen; 8th Wall erkennt kontinuierlich neu, ein Eingriff in
// den Tracker ist weder nötig noch über die API möglich.)
let relocalize = null;
// Dev-Module werden NUR mit ihrem URL-Flag geladen (kein Byte davon im Normalfall):
// ?debug → debugOverlay.js · ?stats → statsOverlay.js · ?dev → devPanel.js ·
// ?dev/?timeline → timeline.js (Theatre.js) · ?desktop → desktopMode.js (+ phoneFrame.js)
let DebugOverlay = null, StatsOverlay = null, desktop = null;

// 8th-Wall-Engine, selbst gehostet (Open-Source-Build, MIT — s. vendor/8thwall/
// README.md). xr.js lädt daneben den Chunk „slam", der in der Open-Source-Engine
// xr-tracking.js ist: der reine Bildtracker, KEIN SLAM-Binary.
const XR_ENGINE_URL = "./vendor/8thwall/xr.js";
// Image-Target-Daten (image-target-cli, s. docs/8thwall-migration.md). Eine
// Seite = eine Karte = ein Target.
const TARGET_URL = "./targets/8thwall/card.json";

const el = (id) => document.getElementById(id);
let gyro = null; // GyroFusion — wird in der START-Geste angelegt (iOS-Permission)

/* --------------------------------------------------------------------------
   Splash befüllen + Start-Button freigeben, sobald Tuning + Font geladen sind.
   -------------------------------------------------------------------------- */
async function boot() {
  // tuning.json nur in Tuning-Sessions holen (?dev oder ?tuning) — im Normalfall
  // gibt es die Datei nicht, alle Werte sind Defaults in config.js (2026-09-09).
  if (DEV_MODE || params.has("tuning")) await loadTuning();
  syncCssVars();

  // Desktop-Modus: eigenes Modul; Rahmen VOR dem Splash aufbauen, damit schon
  // der Startscreen im Phone sitzt
  if (DESKTOP_MODE) {
    desktop = await import("./desktopMode.js");
    await desktop.createPhoneFrame();
  }
  if (DEBUG_MODE) ({ DebugOverlay } = await import("./debugOverlay.js"));
  if (params.has("stats")) ({ StatsOverlay } = await import("./statsOverlay.js"));

  el("cardName").textContent = card.profession;
  // Firmenlogo nur, wenn die Karte eines mitbringt — sonst der Name als Text
  const logoImg = el("companyLogo"), companyText = el("companyText");
  if (card.companyLogo) { logoImg.src = card.companyLogo; logoImg.alt = card.company; companyText.hidden = true; }
  else { logoImg.hidden = true; companyText.textContent = card.company ?? ""; }
  // (DET-Logo mit Job-Link nach dem Splash: seit dem UI-Update 2026-09-03 raus)

  // Font muss VOR dem ersten Bubble-measureText geladen sein.
  try {
    await Promise.all([document.fonts.load(`52px "Jersey 10"`), document.fonts.load(`26px "Silkscreen"`)]);
  } catch (e) { /* Fallback mono */ }

  const btn = el("launchButton");
  btn.disabled = false;
  btn.addEventListener("click", async () => {
    btn.disabled = true; // Spinner während Kamera/Tracking hochfahren
    // Sound MUSS in der User-Geste initialisiert werden (AudioContext-Unlock,
    // gleiche Regel wie die Gyro-Permission) — VOR allen awaits.
    sound.init();
    sound.uiTap();
    // Gyro-Permission MUSS direkt in der User-Geste angefragt werden (iOS) —
    // deshalb hier, VOR allen awaits. Fail-safe: ohne Gyro läuft alles normal.
    if (!DESKTOP_MODE && GYRO.enabled !== "nein" && !params.has("nogyro")) {
      gyro = new GyroFusion();
      gyro.enable(); // bewusst nicht awaiten (Geste nicht verlieren)
    }
    try {
      if (DESKTOP_MODE) await desktop.startDesktop({ buildExperience, attachDevTools });
      else await startAR();
      document.body.classList.add("launched");
      document.body.classList.add("scanning"); // Suchrahmen (weiße Ecken) bis zur ersten Erkennung
    } catch (err) {
      console.error("DETAR start failed:", err);
      showStartError(err);
      btn.disabled = false;
    }
  });
}

/* Startfehler. Kamera abgelehnt → eigener Bildschirm ohne Kamerabild
   (Dialogsystem 2026-09-03, UI-Inventar Abschnitt 6); alles andere bleibt
   eine Fehlerzeile im Splash. */
function showStartError(err) {
  const isCam = /permission|notallowed|denied/i.test(String(err?.name) + String(err?.message));
  if (isCam) {
    document.body.classList.add("camera-denied");
    el("permReload").onclick = () => location.reload();
    return;
  }
  const box = el("errorBox");
  box.textContent = "Start fehlgeschlagen. Bitte Seite neu laden. (" + (err?.message ?? err) + ")";
  box.style.display = "block";
}

/* --------------------------------------------------------------------------
   Gemeinsamer Szenen-Aufbau (Rig + Behaviors + UI + Loop) für beide Modi.
   `render: false` → der Loop rendert NICHT selbst (AR: das übernimmt der
   Threejs-Pipeline-Modul-Hook onRender der 8th-Wall-Engine, sonst doppelt).
   -------------------------------------------------------------------------- */
function buildExperience({ renderer, scene, camera, worldRoot, isRunning, preTick, render = true }) {
  const frame = {
    worldRoot,
    camera,
    /* Kamera-Weltposition in den Karten-Frame transformieren. WICHTIG:
       updateWorldMatrix VOR dem Lesen — matrixWorld ist im Animation-Loop
       sonst einen Frame alt (Zapworks-Gotcha, gilt in three.js generell).
       NaN-SCHUTZ: liefert null, wenn die Transformation nicht endlich ist
       (degenerierte Matrix um Tracking-Verlust) — Aufrufer überspringen den
       Frame dann, statt NaN in ihre Lerps einsickern zu lassen. */
    getCamLocal(out) {
      camera.getWorldPosition(out);
      worldRoot.updateWorldMatrix(true, false);
      worldRoot.worldToLocal(out);
      if (STAB.nanGuard !== "nein" &&
          (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z))) return null;
      return out;
    },
    /* Welt → Karten-Frame (matrixWorld muss aktuell sein — getCamLocal wird
       in allen Verwendungen zuerst gerufen und aktualisiert sie). */
    toLocal(v) {
      return worldRoot.worldToLocal(v);
    },
  };

  const nodes = buildRig(worldRoot);

  const faceAnim = new FaceAnimator(nodes);
  const bubble = new SpeechBubble(nodes, frame);
  const wander = new IdleWander(nodes, frame);
  const activation = new ActivationAnim(nodes);
  const fx = new ActivationFX(worldRoot);
  let controller = null;
  const menu = new QuestionMenu(el("question-root"), null, {
    onQuestion: (q) => controller.answerQuestion(q),
    onTheme: (id) => controller.onTheme(id),
    onBack: () => controller.onBack(),
    onOption: (o) => controller.onOption(o),
    onNext: () => controller.onNext(),
    onReentry: () => controller.onCardTapped(),
  });
  controller = new CardController({ card, nodes, bubble, face: faceAnim, wander, activation, menu, fx });
  menu.engine = controller.engine;
  window.__detar = { controller, engine: controller.engine, fx, nodes, camera, renderer, sound }; // Debug-Zugriff (Konsole)
  const debug = DebugOverlay ? new DebugOverlay(worldRoot, nodes, frame) : null;
  if (debug) debug.setVisible(true);

  /* ---- Figur-Tap: Parabel-Hüpfer zurück zur Kartenmitte ------------------ */
  const figureJump = { active: false, t: 0, fromX: 0, fromZ: 0 };
  function startFigureJump() {
    if (figureJump.active) return;
    figureJump.active = true;
    sound.figureJump();
    figureJump.t = 0;
    figureJump.fromX = nodes.FigureRoot.position.x;
    figureJump.fromZ = nodes.FigureRoot.position.z;
    wander.setBusy(true);
    wander.walkTarget = null;
    faceAnim.holdFace = "talk"; // gehaltener Ausdruck — sonst überschreibt der nächste Tick
  }
  function tickFigureJump(dt) {
    if (!figureJump.active) return;
    figureJump.t += dt;
    const k = Math.min(1, figureJump.t / Math.max(0.05, CHOREO.jumpDurationSec));
    const e = k * k * (3 - 2 * k); // smoothstep horizontal
    nodes.FigureRoot.position.x = figureJump.fromX * (1 - e);
    nodes.FigureRoot.position.z = figureJump.fromZ * (1 - e);
    nodes.FigureRoot.position.y = nodes.FIGURE_HOME.pos.y + Math.sin(Math.PI * k) * CHOREO.jumpHeight;
    if (k >= 1) {
      figureJump.active = false;
      nodes.FigureRoot.position.set(0, nodes.FIGURE_HOME.pos.y, 0);
      wander.setBusy(false);
      faceAnim.holdFace = null;
      if (!faceAnim.talking) faceAnim.showFace(faceAnim.blinkActive ? "blink" : "neutral");
    }
  }

  // Tap-Erkennung (Tap ≠ Wackeln/Drag: max 6px Bewegung, max 400ms)
  const _ray = new THREE.Raycaster();
  const _tapNdc = new THREE.Vector2();
  let _downX = 0, _downY = 0, _downT = 0;
  const figureMeshes = [
    nodes.BodyIdle, nodes.BodyAffirm, nodes.BodyThink,
    nodes.Head, nodes.FaceNeutral, nodes.FaceBlink, nodes.FaceTalk,
  ];
  let _lastTapT = 0;
  function doTap(clientX, clientY) {
    // Entprellen: pointerup UND der native click-Fallback (iOS) rufen doTap —
    // seit dem Dialogsystem ist Doppel-Auslösung NICHT mehr harmlos (Blase
    // überspringen + Weiter in einem Tap). Zweiter Aufruf binnen 120 ms fällt weg.
    const nowT = performance.now();
    if (nowT - _lastTapT < 120) return;
    _lastTapT = nowT;
    const rect = renderer.domElement.getBoundingClientRect();
    _tapNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _tapNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    _ray.setFromCamera(_tapNdc, camera);
    // Aktivier-Phase + Ruhezustand: Tap auf die KARTE (unsichtbare Tap-Plane)
    // startet die Figur bzw. holt sie zurück (Wiedereinstieg).
    if (controller.phase === "attract" || controller.phase === "resting") {
      if (_ray.intersectObject(fx.tapPlane, false).length > 0) {
        const wasAttract = controller.phase === "attract";
        controller.onCardTapped();
        if (wasAttract) relocalize?.(); // Nutzer hält still → beste Gelegenheit für eine saubere Pose
      }
      return;
    }
    // Sprechblase: Schreibvorgang überspringen bzw. Weiter-Schritt auslösen
    if (bubble.element.visible && _ray.intersectObject(bubble.plane, false).length > 0) {
      if (controller.onBubbleTapped()) return;
    }
    if (controller.phase !== "live") return;
    const hits = _ray.intersectObjects(figureMeshes.filter((m) => m.visible), false);
    if (hits.length > 0) { startFigureJump(); relocalize?.(); } // Hüpfer + „Geraderücken"
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    _downX = e.clientX; _downY = e.clientY; _downT = performance.now();
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - _downX, e.clientY - _downY) > 6) return;
    if (performance.now() - _downT > 400) return;
    doTap(e.clientX, e.clientY);
  });
  // FALLBACK (iOS): bricht der Browser die Pointer-Sequenz mit pointercancel
  // ab, kommt nie ein pointerup — der native click feuert trotzdem. Doppel-
  // Auslösung ist ungefährlich: onCardTapped ist über die Phase idempotent,
  // der Figur-Sprung über figureJump.active.
  renderer.domElement.addEventListener("click", (e) => doTap(e.clientX, e.clientY));

  /* ---- Render-Loop -------------------------------------------------------- */
  let lastT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;
    preTick?.(); // AR: PoseStabilizer (glättet Anchor-Pose → stabRoot)
    if (!isRunning || isRunning()) {
      wander.tick(dt);
      tickFigureJump(dt); // nach wander: überschreibt die Position während des Sprungs
      activation.tick(dt);
      fx.tick(dt);
      faceAnim.tick(dt);
      bubble.tick(dt);
      debug?.tick();
    }
    if (render) renderer.render(scene, camera);
  }

  return { controller, bubble, loop, nodes, fx };
}

/* --------------------------------------------------------------------------
   Dev-Werkzeuge: Theatre.js-Timeline (Beats) + Tuning-Panel — NUR mit ?dev
   bzw. ?timeline. (Bis 2026-09-09 lud jeder Start timeline.js und holte
   beats.theatre.json per fetch, obwohl es die Datei nie gab. Sollen autorisierte
   Beats einmal live laufen, hier wieder einen Player-Pfad ohne Flag öffnen.)
   -------------------------------------------------------------------------- */
async function attachDevTools(exp) {
  if (!DEV_MODE && !TIMELINE_MODE) return;
  let timeline = null;
  try {
    const { initTimeline } = await import("./timeline.js");
    timeline = await initTimeline({ nodes: exp.nodes, withStudio: TIMELINE_MODE });
  } catch (e) {
    console.warn("Timeline nicht verfügbar:", e);
  }
  if (DEV_MODE) {
    const { DevPanel } = await import("./devPanel.js");
    new DevPanel({ bubble: exp.bubble, nodes: exp.nodes, controller: exp.controller, timeline, fx: exp.fx });
  }
}

/* --------------------------------------------------------------------------
   8th-Wall-Engine LAZY laden — erst aus der Start-Geste heraus. Vor dem Klick
   auf „Scan starten" läuft kein Engine-Skript und keine Kamera. xr.js zieht
   über data-preload-chunks="slam" den Tracking-Chunk nach (Open-Source-Engine:
   xr-tracking.js = Bildtracker ohne SLAM) und feuert danach `xrloaded`.
   -------------------------------------------------------------------------- */
function loadEngine() {
  if (window.XR8) return Promise.resolve(window.XR8);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = XR_ENGINE_URL;
    s.async = true;
    s.setAttribute("data-preload-chunks", "slam");
    s.onerror = () => reject(new Error("8th-Wall-Engine nicht ladbar: " + XR_ENGINE_URL +
      " (Build nach vendor/8thwall/ legen, s. vendor/8thwall/README.md)"));
    window.addEventListener("xrloaded", () => resolve(window.XR8), { once: true });
    document.head.appendChild(s);
  });
}

/* Target-Daten (JSON aus image-target-cli) laden. Das Luminanz-Bild wird
   NEBEN der JSON gesucht (resources.luminanceImage) — so kann ein frisch
   generierter CLI-Ordner 1:1 nach targets/8thwall/ kopiert werden, ohne den
   von der CLI fest eingetragenen Pfad „image-targets/…" anzupassen. */
async function loadTargetData() {
  const res = await fetch(TARGET_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Target-Datei fehlt: " + TARGET_URL);
  const data = await res.json();
  const base = new URL(TARGET_URL, location.href);
  const lum = data.resources?.luminanceImage;
  data.imagePath = lum ? new URL(lum, base).href : new URL(data.imagePath, location.href).href;
  // Karte liegt in der Hand → beweglich (kein „static target"). Physische
  // Breite = Kartenbreite (SCENE.cardWidth, 0.059 m): damit ist
  // detail.scale metrisch und die mm-Angaben in ?stats stimmen; die Figur
  // hängt davon nicht ab (Anchor-Einheit = Kartenbreite, s. Kopfkommentar).
  data.moveable = true;
  data.physicalWidthInMeters = SCENE.cardWidth;
  return data;
}

/* --------------------------------------------------------------------------
   AR-Modus (8th Wall Image Targets). Tracking-Glättung: eigener PoseStabilizer
   (One-Euro + SLERP + Dead-Zone + Lost-Hold + Median-Aufsetzen) zwischen
   Rohpose und Figur — die Figur hängt unter stabRoot (Kind der KAMERA, weil
   der Stabilizer kamera-relativ arbeitet); `anchor` ist eine Gruppe außerhalb
   der Szene, deren Matrix pro Frame aus der 8th-Wall-Bildpose gebaut wird
   (Kamera⁻¹ × Bild, Scale = Kartenbreite). Der Stabilizer kopiert die Pose
   geglättet nach stabRoot und steuert auch die Sichtbarkeit. NaN-Schutz und
   Behavior-Pause bei Verlust bleiben wie gehabt.

   Aufgelöst wird das Promise, sobald die Kamera läuft und die Szene steht
   (onStart); verworfen bei Kamera-Fehler (onCameraStatusChange „failed" →
   NotAllowedError für den Kamera-abgelehnt-Bildschirm) oder Engine-Ausnahme.
   -------------------------------------------------------------------------- */
async function startAR() {
  const container = el("ar-container");
  const [XR8, targetData] = await Promise.all([loadEngine(), loadTargetData()]);

  // XR8.Threejs verlangt das globale THREE (>= r125) — dieselbe Instanz wie
  // unsere Module (Importmap three@0.160), sonst passen Klassen nicht zusammen.
  window.THREE = THREE;

  // Canvas für Kamerabild + Szene. Die Engine liest canvas.width/height jeden
  // Frame und passt Renderer/Projektion an (onCanvasSizeChange) — Größe setzen
  // wir selbst: CSS-Größe × PixelRatio, gecappt (CAM.maxPixelRatio, Finding 2:
  // Cap 2 statt 3 auf iPhones gibt der Vision-Schleife GPU-Luft).
  const canvas = document.createElement("canvas");
  canvas.id = "xr-canvas";
  container.appendChild(canvas);
  const sizeCanvas = () => {
    const pr = Math.min(window.devicePixelRatio || 1, CAM.maxPixelRatio);
    canvas.width = Math.max(1, Math.round(container.clientWidth * pr));
    canvas.height = Math.max(1, Math.round(container.clientHeight * pr));
  };
  sizeCanvas();
  window.addEventListener("resize", () => requestAnimationFrame(sizeCanvas));
  window.addEventListener("orientationchange", () => setTimeout(sizeCanvas, 300));

  // NUR Bildtracking: disableWorldTracking MUSS vor pipelineModule() und run()
  // stehen. Ohne World-Tracking fragt die Engine weder Bewegungssensoren an
  // noch lädt sie je einen SLAM-Chunk; unsere GyroFusion bleibt davon getrennt.
  XR8.XrController.configure({
    disableWorldTracking: true,
    imageTargetData: [targetData],
  });

  return new Promise((resolve, reject) => {
    XR8.addCameraPipelineModules([
      XR8.XrController.pipelineModule(),      // „reality": Bildtracker, feuert reality.image*-Events
      XR8.GlTextureRenderer.pipelineModule(), // Kamerabild auf den Canvas (vor der Szene)
      XR8.Threejs.pipelineModule(),           // three.js-Szene/-Kamera/-Renderer auf demselben Canvas
      detarPipelineModule(XR8, { resolve, reject }),
    ]);
    XR8.run({
      canvas,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK },
      // ANY statt MOBILE: ohne World-Tracking läuft Bildtracking auch am
      // Rechner mit Webcam (Schnelltest) — die Engine lässt das nur so zu.
      allowedDevices: XR8.XrConfig.device().ANY,
    });
  });
}

/* Unser Kamera-Pipeline-Modul: baut in onStart die Szene auf (nach dem
   Threejs-Modul, damit XR8.Threejs.xrScene() steht), tickt in onUpdate und
   übersetzt die Bild-Events in die bisherigen Hooks (Stabilizer, Controller,
   Suchrahmen, Karte-verloren-Hinweis). Ereignis-Zuordnung zu MindAR:
     anchor.onTargetFound → reality.imagefound
     (Pose-Update)        → reality.imageupdated  (nur wenn sich die Pose ändert;
                                                    sonst „stale" wie bei MindAR)
     anchor.onTargetLost  → reality.imagelost
     (Target geladen)     → reality.imagescanning */
function detarPipelineModule(XR8, { resolve, reject }) {
  let exp = null, stab = null, stats = null;
  let anchor = null, stabRoot = null;
  let latest = null;                                  // letzte Bildpose (detail) — null = nicht getrackt
  const video = { videoWidth: 0, videoHeight: 0 };    // für ?stats (Kamera-Auflösung)
  const _img = new THREE.Matrix4(), _camInv = new THREE.Matrix4();
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

  // Karte verloren: Support-Zeile mit Icon mittig im Bild (mock 05), das Menü
  // bleibt stehen und friert nach CHOREO.trackingLostMs ein.
  const hint = el("lostHint");
  const lost = buildSupport("gefunden", [{ text: "Halte auf die Karte" }]);
  lost.icon.stop();
  hint.appendChild(lost);

  /* Bildpose (Szenen-Frame; Bild = XY-Ebene, +Z zur Kamera, Höhe des 3:4-Crops
     = 1 × scale) → kamera-relative Rohpose mit Scale = KARTENBREITE. Der Crop
     behält die volle Kartenbreite, also Kartenbreite = scale × scaledWidth.
     Wird jeden Frame gerechnet (Kamera-Matrix des aktuellen Frames, vom
     Threejs-Modul gesetzt); ohne neue Messung bleibt die Matrix bitidentisch →
     der Stabilizer sieht den Frame korrekt als „stale". */
  function updateAnchor(camera) {
    const d = latest;
    if (!d) return;
    const aspect = d.scaledWidth ?? (d.properties ? d.properties.width / d.properties.height : 1);
    const cardWidth = (d.scale || 1) * aspect;
    _p.set(d.position.x, d.position.y, d.position.z);
    _q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
    _s.setScalar(cardWidth);
    _img.compose(_p, _q, _s);
    camera.updateMatrixWorld(true);
    _camInv.copy(camera.matrixWorld).invert();
    anchor.matrix.multiplyMatrices(_camInv, _img);
  }

  function onFound(detail) {
    latest = detail;
    document.body.classList.remove("scanning");
    if (hint.classList.contains("show")) { hint.classList.remove("show"); lost.icon.stop(); }
    if (exp) updateAnchor(exp.camera); // Pose steht, BEVOR der Stabilizer aufsetzt
    stab.onFound();
    const { controller } = exp;
    controller.onCardSeen(); // greeted-Flag: Choreographie nur beim ersten Mal
    controller.onTrackingFound(); // Menü wieder freigeben
  }

  function onLost() {
    latest = null;
    stab.onLost();
    const { controller } = exp;
    if (controller.greeted) {
      if (controller.lostHintWanted) { hint.classList.add("show"); lost.icon.setMode("suchen"); }
      controller.onTrackingLost(); // nach CHOREO.trackingLostMs friert das Menü ein; im Ruhezustand wechselt die Panel-Zeile
    }
  }

  let settled = false;
  const fail = (err) => { if (!settled) { settled = true; reject(err); } };

  return {
    name: "detar",

    onCameraStatusChange: ({ status, reason }) => {
      if (status !== "failed") return;
      // DENY_CAMERA → NotAllowedError, damit showStartError den eigenen
      // Kamera-abgelehnt-Bildschirm zeigt (Regex permission|notallowed|denied).
      const err = new Error("Kamera nicht verfügbar (" + (reason ?? "UNSPECIFIED") + ")");
      err.name = reason === "DENY_CAMERA" ? "NotAllowedError" : "CameraError";
      fail(err);
    },

    onException: (err) => {
      console.error("XR8:", err);
      fail(err instanceof Error ? err : new Error(String(err)));
    },

    onStart: ({ videoWidth, videoHeight }) => {
      video.videoWidth = videoWidth; video.videoHeight = videoHeight;
      const { scene, camera, renderer } = XR8.Threejs.xrScene();

      // Rohpose-Träger (Ersatz für MindARs anchor.group): NICHT in der Szene,
      // matrixAutoUpdate aus — nur die Matrix zählt (der Stabilizer liest sie).
      anchor = new THREE.Group();
      anchor.matrixAutoUpdate = false;

      // Geglätteter Träger als KIND DER KAMERA (kamera-relative Pose)
      stabRoot = new THREE.Group();
      camera.add(stabRoot);
      stab = new PoseStabilizer(anchor, stabRoot, gyro);
      relocalize = () => stab.reacquire();

      // Karten-Frame unter dem stabRoot: X = rechts, Y = hoch von der Karte,
      // Z = zur Karten-Unterkante. (+90° X: Anchor-Z "aus dem Bild" wird zu Y.)
      const worldRoot = new THREE.Group();
      worldRoot.rotation.x = Math.PI / 2;
      worldRoot.scale.setScalar(1 / SCENE.cardWidth);
      stabRoot.add(worldRoot);

      // ?stats — Live-Diagnose am Gerät (Tracking/Gyro/Jitter in Zahlen)
      stats = StatsOverlay
        ? new StatsOverlay(anchor, stabRoot, stab, gyro, { getVideo: () => video, renderer, card })
        : null;

      exp = buildExperience({
        renderer, scene, camera, worldRoot,
        /* Behavior-Ticks nur, solange die Figur sichtbar ist — verhindert, dass
           Lost-Frames (NaN-Quelle) in die Zustands-Lerps einsickern. */
        isRunning: () => stabRoot.visible,
        preTick: () => { updateAnchor(camera); stab.tick(); stats?.tick(); },
        render: false, // rendert XR8.Threejs in onRender
      });
      exp.camera = camera;
      console.log(`DETAR Kamera: ${videoWidth}×${videoHeight}, Canvas ${renderer.domElement.width}×${renderer.domElement.height}`);
      // Erst auflösen (Splash weg, body.scanning an), DANN die Dev-Werkzeuge
      // nachladen — der Tracker läuft ab hier schon; würde ein Fund vor dem
      // Auflösen kommen, setzte boot() den Suchrahmen danach wieder an.
      if (!settled) { settled = true; resolve(); }
      attachDevTools(exp);
    },

    onUpdate: () => { exp?.loop(); },

    listeners: [
      { event: "reality.imagescanning", process: () => console.log("DETAR Target geladen, suche Karte …") },
      { event: "reality.imagefound",   process: ({ detail }) => { if (exp) onFound(detail); } },
      { event: "reality.imageupdated", process: ({ detail }) => { latest = detail; } },
      { event: "reality.imagelost",    process: () => { if (exp) onLost(); } },
    ],
  };
}

boot();
