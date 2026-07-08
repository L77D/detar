/* =============================================================================
   DETAR — App-Boot: Splash → Kamera → MindAR-Tracking → Choreographie.

   Zwei Modi:
   • Normal (Handy): MindAR image tracking, Figur steht auf der echten Karte.
   • ?desktop:       Desktop-Testmodus ohne Kamera — Karte als Boden-Plane,
                     Maus-Orbit (wie der Lokal-Prototyp). Zum Entwickeln/Prüfen.
   • ?debug:         pinke Hilfslinien (Lauffeld + FACE_CAM-Kegel) zuschalten.

   KOORDINATEN-KERN (MindAR vs. Zapworks): Zapworks lief im Anchor-Origin-
   Modus (Karte = Welt-Ursprung, Kamera bewegt sich). MindAR ist invertiert
   (Kamera = Ursprung, der Karten-Anchor bewegt sich im Kamera-Raum). Deshalb
   leben Figur + Bubble unter einem `worldRoot` (Karten-Frame: X = Karte
   rechts, Y = hoch von der Karte weg, Z = zur Karten-Unterkante), und alle
   "Wo ist die Kamera?"-Rechnungen transformieren die Kamera-Weltposition in
   diesen Frame (frame.getCamLocal) — die komplette Behavior-Logik aus dem
   Prototyp bleibt dadurch 1:1 gültig.

   SKALIERUNG: MindAR normiert die Kartenbreite auf 1 Einheit; im Prototyp
   war sie SCENE.cardWidth (0.17). worldRoot.scale = 1/cardWidth → alle
   getunten Werte (Lauffeld, Bubble-Größen, Sprunghöhe …) gelten unverändert.
   ============================================================================= */
import * as THREE from "three";
import { card } from "../cards/lagerlogistik.js";
import { TYPO, SCENE, STAB, CHOREO, loadTuning, syncCssVars } from "./config.js";
import { buildRig } from "./rig.js";
import { FaceAnimator } from "./faceAnimator.js";
import { SpeechBubble } from "./speechBubble.js";
import { IdleWander } from "./idleWander.js";
import { ActivationAnim } from "./activationAnim.js";
import { QuestionMenu } from "./questionMenu.js";
import { CardController } from "./cardController.js";
import { DebugOverlay } from "./debugOverlay.js";
import { PoseStabilizer } from "./poseStabilizer.js";

const params = new URLSearchParams(location.search);
const DESKTOP_MODE = params.has("desktop");
// Debug NUR per URL (?debug) — SCENE.debug aus einem tuning.json-Preset wird
// bewusst ignoriert (Leftover aus Tuning-Sessions soll nie live erscheinen).
const DEBUG_MODE = params.has("debug");

const el = (id) => document.getElementById(id);

/* --------------------------------------------------------------------------
   Splash befüllen + Start-Button freigeben, sobald Tuning + Font geladen sind.
   -------------------------------------------------------------------------- */
async function boot() {
  await loadTuning();
  syncCssVars();

  el("cardName").textContent = card.profession;
  const logoLink = el("detLogo");
  logoLink.href = card.jobUrl;

  // Font muss VOR dem ersten Bubble-measureText geladen sein.
  try { await document.fonts.load(`52px "Jersey 10"`); } catch (e) { /* Fallback mono */ }

  const btn = el("launchButton");
  btn.disabled = false;
  btn.addEventListener("click", async () => {
    btn.disabled = true; // Spinner während Kamera/Tracking hochfahren
    try {
      if (DESKTOP_MODE) await startDesktop();
      else await startAR();
      document.body.classList.add("launched");
    } catch (err) {
      console.error("DETAR start failed:", err);
      showStartError(err);
      btn.disabled = false;
    }
  });
}

function showStartError(err) {
  const box = el("errorBox");
  const isCam = /permission|notallowed|denied/i.test(String(err?.name) + String(err?.message));
  box.textContent = isCam
    ? "Kein Kamera-Zugriff. Bitte in den Browser-Einstellungen die Kamera für diese Seite erlauben und neu laden."
    : "Start fehlgeschlagen. Bitte Seite neu laden. (" + (err?.message ?? err) + ")";
  box.style.display = "block";
}

/* --------------------------------------------------------------------------
   Gemeinsamer Szenen-Aufbau (Rig + Behaviors + UI + Loop) für beide Modi.
   -------------------------------------------------------------------------- */
function buildExperience({ renderer, scene, camera, worldRoot, isRunning, preTick }) {
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
      if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z)) return null;
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
  const menu = new QuestionMenu(el("question-root"), card.questions, (id) => controller.answerQuestion(id));
  const controller = new CardController({ card, nodes, bubble, face: faceAnim, wander, activation, menu });
  const debug = DEBUG_MODE ? new DebugOverlay(worldRoot, nodes, frame) : null;
  if (debug) debug.setVisible(true);

  /* ---- Figur-Tap: Parabel-Hüpfer zurück zur Kartenmitte ------------------ */
  const figureJump = { active: false, t: 0, fromX: 0, fromZ: 0 };
  function startFigureJump() {
    if (figureJump.active) return;
    figureJump.active = true;
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
  renderer.domElement.addEventListener("pointerdown", (e) => {
    _downX = e.clientX; _downY = e.clientY; _downT = performance.now();
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (Math.hypot(e.clientX - _downX, e.clientY - _downY) > 6) return;
    if (performance.now() - _downT > 400) return;
    const rect = renderer.domElement.getBoundingClientRect();
    _tapNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _tapNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    _ray.setFromCamera(_tapNdc, camera);
    const hits = _ray.intersectObjects(figureMeshes.filter((m) => m.visible), false);
    if (hits.length > 0) startFigureJump();
  });

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
      faceAnim.tick(dt);
      bubble.tick(dt);
      debug?.tick();
    }
    renderer.render(scene, camera);
  }

  return { controller, bubble, loop };
}

/* --------------------------------------------------------------------------
   AR-Modus (MindAR). Tracking-Glättung: eigener PoseStabilizer (One-Euro +
   SLERP + Dead-Zone + Lost-Hold) zwischen Anchor und Figur — die Figur hängt
   NICHT unter anchor.group, sondern unter stabRoot (Szenen-Ebene); der
   Stabilizer kopiert die Anchor-Pose geglättet rüber und steuert auch die
   Sichtbarkeit. Zusätzlich NaN-Schutz: kaputte Frames (degenerierte Matrizen
   um Tracking-Verlust) werden verworfen, Behavior-Ticks pausieren bei Verlust.
   -------------------------------------------------------------------------- */
async function startAR() {
  const { MindARThree } = await import("mindar-image-three");
  const container = el("ar-container");
  const mindarThree = new MindARThree({
    container,
    imageTargetSrc: "./targets/card.mind",
    uiLoading: "no", uiScanning: "no", uiError: "no",
    filterMinCF: STAB.filterMinCF,
    filterBeta: STAB.filterBeta,
    missTolerance: STAB.missTolerance,
    warmupTolerance: STAB.warmupTolerance,
  });
  const { renderer, scene, camera } = mindarThree;
  const anchor = mindarThree.addAnchor(0);

  // Geglätteter Träger auf Szenen-Ebene (anchor.group bleibt leer)
  const stabRoot = new THREE.Group();
  scene.add(stabRoot);
  const stab = new PoseStabilizer(anchor.group, stabRoot);

  // Karten-Frame unter dem stabRoot: X = rechts, Y = hoch von der Karte,
  // Z = zur Karten-Unterkante. (+90° X: Anchor-Z "aus dem Bild" wird zu Y.)
  const worldRoot = new THREE.Group();
  worldRoot.rotation.x = Math.PI / 2;
  worldRoot.scale.setScalar(1 / SCENE.cardWidth);
  stabRoot.add(worldRoot);

  const { controller, loop } = buildExperience({
    renderer, scene, camera, worldRoot,
    /* Behavior-Ticks nur, solange die Figur sichtbar ist — verhindert, dass
       Lost-Frames (NaN-Quelle) in die Zustands-Lerps einsickern. */
    isRunning: () => stabRoot.visible,
    preTick: () => stab.tick(),
  });

  const hint = el("trackingHint");
  anchor.onTargetFound = () => {
    hint.style.display = "none";
    stab.onFound();
    controller.onCardSeen(); // greeted-Flag: Choreographie nur beim ersten Mal
  };
  anchor.onTargetLost = () => {
    stab.onLost();
    if (controller.greeted) {
      hint.textContent = "Karte wieder ins Bild nehmen";
      hint.style.display = "block";
    }
  };

  await mindarThree.start(); // fragt die Kamera-Berechtigung an (User-Geste!)
  renderer.setAnimationLoop(loop);
}

/* --------------------------------------------------------------------------
   Desktop-Testmodus (?desktop): kein Tracking, Karte als Boden-Plane,
   Maus-Orbit — zum Entwickeln und Verifizieren am Rechner.
   -------------------------------------------------------------------------- */
async function startDesktop() {
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  const container = el("ar-container");

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.bgColor);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 20);
  camera.position.set(0, 0.24, 0.34);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.09, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.06;
  controls.maxDistance = 3;
  controls.rotateSpeed = 0.55;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  // Karte als Boden (nur Optik im Testmodus)
  const tex = new THREE.TextureLoader().load("./assets/card/detar_demokarte_0906.jpg");
  tex.colorSpace = THREE.SRGBColorSpace;
  const cardAspect = 2048 / 1500;
  const cardMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, cardAspect),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  cardMesh.rotation.x = -Math.PI / 2;
  cardMesh.position.y = -0.0005;
  cardMesh.scale.setScalar(SCENE.cardWidth);
  scene.add(cardMesh);

  // Karten-Frame = Welt (Y ist hier schon "hoch") — keine Rotation nötig.
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  const { controller, loop } = buildExperience({ renderer, scene, camera, worldRoot });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    loop();
  });

  // "Scan" simulieren wie im Lokal-Prototyp
  setTimeout(() => controller.onCardSeen(), 1200);
}

boot();
