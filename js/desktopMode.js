/* =============================================================================
   DETAR — Desktop-Testmodus (?desktop): kein Tracking, Karte als Boden-Plane,
   Maus-Orbit im Smartphone-Rahmen (phoneFrame.js) — zum Entwickeln und
   Verifizieren am Rechner. Eigenes Modul seit 2026-09-09: wird nur mit
   ?desktop geladen, die Live-App trägt davon nichts.
   ============================================================================= */
import * as THREE from "../vendor/three/three.module.js";
import { SCENE } from "./config.js";

let phoneFrame = null;

/* Rahmen VOR dem Splash aufbauen, damit schon der Startscreen im Phone sitzt. */
export async function createPhoneFrame() {
  const { PhoneFrame } = await import("./phoneFrame.js");
  phoneFrame = new PhoneFrame();
  return phoneFrame;
}

/* Szene + Loop; buildExperience/attachDevTools kommen aus main.js (gemeinsamer
   Aufbau für AR und Desktop). Simuliert nach 1,2 s den Scan. */
export async function startDesktop({ buildExperience, attachDevTools }) {
  const { OrbitControls } = await import("../vendor/three/addons/controls/OrbitControls.js");
  const container = document.getElementById("ar-container");

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
  const tex = new THREE.TextureLoader().load("./assets/card/detar_demokarte_070926.jpg");
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
  setTimeout(() => { document.body.classList.remove("scanning"); controller.onCardSeen(); }, 1200);
}
