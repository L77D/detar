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
import { TYPO, SCENE, STAB, CAM, CHOREO, loadTuning, syncCssVars } from "./config.js";
import { buildRig } from "./rig.js";
import { FaceAnimator } from "./faceAnimator.js";
import { SpeechBubble } from "./speechBubble.js";
import { IdleWander } from "./idleWander.js";
import { ActivationAnim } from "./activationAnim.js";
import { QuestionMenu } from "./questionMenu.js";
import { CardController } from "./cardController.js";
import { ActivationFX } from "./activationFX.js";
import { PortalView, FigureFlip } from "./portalView.js";
import { DebugOverlay } from "./debugOverlay.js";
import { PoseStabilizer } from "./poseStabilizer.js";
import { GyroFusion } from "./gyroFusion.js";
import { StatsOverlay } from "./statsOverlay.js";
import { GYRO } from "./config.js";

const params = new URLSearchParams(location.search);
const DESKTOP_MODE = params.has("desktop");
// Debug NUR per URL (?debug) — SCENE.debug aus einem tuning.json-Preset wird
// bewusst ignoriert (Leftover aus Tuning-Sessions soll nie live erscheinen).
const DEBUG_MODE = params.has("debug");
const DEV_MODE = params.has("dev");           // Tuning-Panel (Regler)
const TIMELINE_MODE = params.has("timeline"); // Theatre.js-Studio (Keyframe-Editor)

const el = (id) => document.getElementById(id);
let gyro = null; // GyroFusion — wird in der START-Geste angelegt (iOS-Permission)

/* --------------------------------------------------------------------------
   Splash befüllen + Start-Button freigeben, sobald Tuning + Font geladen sind.
   -------------------------------------------------------------------------- */
let phoneFrame = null; // Desktop-Modus: Smartphone-Rahmen (wie im Lokal-Prototyp)

async function boot() {
  await loadTuning();
  syncCssVars();

  // Rahmen VOR dem Splash aufbauen, damit schon der Startscreen im Phone sitzt
  if (DESKTOP_MODE) {
    const { PhoneFrame } = await import("./phoneFrame.js");
    phoneFrame = new PhoneFrame();
  }

  el("cardName").textContent = card.profession;
  const logoLink = el("detLogo");
  logoLink.href = card.jobUrl;

  // Font muss VOR dem ersten Bubble-measureText geladen sein.
  try { await document.fonts.load(`52px "Jersey 10"`); } catch (e) { /* Fallback mono */ }

  const btn = el("launchButton");
  btn.disabled = false;
  btn.addEventListener("click", async () => {
    btn.disabled = true; // Spinner während Kamera/Tracking hochfahren
    // Gyro-Permission MUSS direkt in der User-Geste angefragt werden (iOS) —
    // deshalb hier, VOR allen awaits. Fail-safe: ohne Gyro läuft alles normal.
    if (!DESKTOP_MODE && GYRO.enabled !== "nein" && !params.has("nogyro")) {
      gyro = new GyroFusion();
      gyro.enable(); // bewusst nicht awaiten (Geste nicht verlieren)
    }
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
  // Einblick (Portal-Parallax + Figur-Flip) — nur wenn die Karte eine Galerie hat
  const portal = new PortalView(worldRoot, frame, card.gallery ?? []);
  const flip = new FigureFlip(nodes);
  const menu = new QuestionMenu(el("question-root"), card.questions, (id) => controller.answerQuestion(id), {
    galleryCount: card.gallery?.length ?? 0,
    onTab: (tab) => controller.setTab(tab),
    onNav: (dir) => portal.nav(dir),
  });
  const controller = new CardController({ card, nodes, bubble, face: faceAnim, wander, activation, menu, fx, portal, flip });
  window.__detar = { controller, fx, portal, flip, nodes, camera, renderer }; // Debug-Zugriff (Konsole)
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
  function doTap(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    _tapNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _tapNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    _ray.setFromCamera(_tapNdc, camera);
    // Aktivier-Phase: Tap auf die KARTE (unsichtbare Tap-Plane) startet die Figur
    if (controller.phase === "attract") {
      if (_ray.intersectObject(fx.tapPlane, false).length > 0) controller.onCardTapped();
      return;
    }
    // Einblick-Modus: Figur liegt/fliegt — kein Figur-Tap-Sprung
    if (controller.einblick || flip.active) return;
    const hits = _ray.intersectObjects(figureMeshes.filter((m) => m.visible), false);
    if (hits.length > 0) startFigureJump();
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
      flip.tick(dt);      // Einblick: Figur-Flip (nach wander, gleiche Regel)
      portal.tick(dt);    // Einblick: Parallax + Edge-Lock + Fades
      activation.tick(dt);
      fx.tick(dt);
      faceAnim.tick(dt);
      bubble.tick(dt);
      debug?.tick();
    }
    renderer.render(scene, camera);
  }

  return { controller, bubble, loop, nodes, fx };
}

/* --------------------------------------------------------------------------
   Dev-Werkzeuge: Theatre.js-Timeline (Beats) + Tuning-Panel.
   Timeline lädt auch OHNE ?dev, wenn ein gespeicherter Stand
   (beats.theatre.json) existiert — dann nur der schlanke Player.
   -------------------------------------------------------------------------- */
async function attachDevTools(exp) {
  let timeline = null;
  try {
    const { initTimeline } = await import("./timeline.js");
    // Studio-UI NUR mit ?timeline (eigenes Flag — ?dev bleibt schlank);
    // ohne Flag lädt nur der Player, falls beats.theatre.json existiert.
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

  // KAMERA-AUFLÖSUNG (2026-07-14, Finding 1): MindAR fordert die Kamera ohne
  // width/height an → meist 640×480, und der Tracker arbeitet DIREKT auf
  // dieser Auflösung (grobe Features = Pose-Rauschen). MindARThree bietet
  // keinen Parameter dafür → getUserMedia EINMALIG wrappen und die Wunsch-
  // Auflösung als `ideal` einschleusen (`ideal` kann nie zum Constraint-
  // Fehler führen — das Gerät liefert das nächstbeste Format). Nach start()
  // wird das Original wiederhergestellt. A/B am Gerät: ?res=960x540 …
  // übersteuert CAM, ?res=0 schaltet den Patch ab. Gelieferte Auflösung
  // und Vision-Hz in ?stats prüfen.
  const resParam = params.get("res");
  let camW = CAM.width, camH = CAM.height;
  let patchCam = camW > 0 && resParam !== "0";
  const resMatch = resParam ? resParam.match(/^(\d+)[x×](\d+)$/i) : null;
  if (resMatch) { camW = +resMatch[1]; camH = +resMatch[2]; patchCam = true; }
  const gumOriginal = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  if (patchCam) {
    navigator.mediaDevices.getUserMedia = (constraints) => {
      if (constraints && constraints.video && typeof constraints.video === "object") {
        constraints.video.width = { ideal: camW };
        constraints.video.height = { ideal: camH };
      }
      return gumOriginal(constraints);
    };
  }

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

  // PIXEL-RATIO-CAP (2026-07-14, Finding 2): MindARThree setzt im Konstruktor
  // devicePixelRatio (= 3 auf iPhones); resize() fasst die Ratio nicht an —
  // einmal überschreiben genügt. Cap 2 gibt dem tfjs-Tracker GPU-Luft
  // (Vision-Loop und Renderer teilen sich die GPU) → höhere Vision-Hz.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CAM.maxPixelRatio));

  // GOTCHA (gefunden 2026-07-09): mindar-image-three legt IMMER einen
  // CSS3DRenderer-Layer an — ein unbenanntes, vollflächiges <div> NACH dem
  // Canvas. Es schluckt alle Pointer-Events → „Karte lässt sich nicht tappen".
  // Wir nutzen kein CSS3D → Layer für Eingaben durchlässig machen.
  if (mindarThree.cssRenderer?.domElement) {
    mindarThree.cssRenderer.domElement.style.pointerEvents = "none";
  }

  const anchor = mindarThree.addAnchor(0);

  // Geglätteter Träger auf Szenen-Ebene (anchor.group bleibt leer)
  const stabRoot = new THREE.Group();
  scene.add(stabRoot);
  const stab = new PoseStabilizer(anchor.group, stabRoot, gyro);

  // Karten-Frame unter dem stabRoot: X = rechts, Y = hoch von der Karte,
  // Z = zur Karten-Unterkante. (+90° X: Anchor-Z "aus dem Bild" wird zu Y.)
  const worldRoot = new THREE.Group();
  worldRoot.rotation.x = Math.PI / 2;
  worldRoot.scale.setScalar(1 / SCENE.cardWidth);
  stabRoot.add(worldRoot);

  // ?stats — Live-Diagnose am Gerät (Tracking/Gyro/Jitter in Zahlen)
  const stats = params.has("stats")
    ? new StatsOverlay(anchor.group, stabRoot, stab, gyro,
        { getVideo: () => mindarThree.video, renderer }) // Kamera-Auflösung + PixelRatio anzeigen
    : null;

  const exp = buildExperience({
    renderer, scene, camera, worldRoot,
    /* Behavior-Ticks nur, solange die Figur sichtbar ist — verhindert, dass
       Lost-Frames (NaN-Quelle) in die Zustands-Lerps einsickern. */
    isRunning: () => stabRoot.visible,
    preTick: () => { stab.tick(); stats?.tick(); },
  });
  const { controller, loop } = exp;
  await attachDevTools(exp);

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

  try {
    await mindarThree.start(); // fragt die Kamera-Berechtigung an (User-Geste!)
  } finally {
    if (patchCam) navigator.mediaDevices.getUserMedia = gumOriginal; // Patch zurückbauen
  }
  console.log(`DETAR Kamera: ${mindarThree.video?.videoWidth}×${mindarThree.video?.videoHeight}, PixelRatio ${renderer.getPixelRatio()}`);
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
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.bgColor);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 20);
  camera.position.set(0, 0.24, 0.34);

  // Größe kommt vom Phone-Rahmen (Format-Preset oben links)
  const sizeTo = (w, h) => {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  sizeTo(phoneFrame.w, phoneFrame.h);
  phoneFrame.onResize = sizeTo;

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

  const exp = buildExperience({ renderer, scene, camera, worldRoot });
  const { controller, loop } = exp;
  await attachDevTools(exp);

  renderer.setAnimationLoop(() => {
    controls.update();
    loop();
  });

  // "Scan" simulieren wie im Lokal-Prototyp
  setTimeout(() => controller.onCardSeen(), 1200);
}

boot();
