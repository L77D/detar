/* =============================================================================
   DETAR — Figuren-Rig. Hierarchie + Transforms exakt aus Scene.zcomp /
   Lokal-Prototyp: FigureRoot → BodyPivot (Füße) → 3 Body-Sprites + HeadPivot
   (Hals) → HeadNod (Nick-Achse ≈ Kopfmitte) → Head + 3 Face-Sprites.
   Painter's Algorithm: depthTest AUS auf allen flachen Layern, feste
   renderOrder (Body 0, Head 1, Face 2, Bubble 3) — wie LayerSort.
   ============================================================================= */
import * as THREE from "../vendor/three/three.module.js";
import { SCENE } from "./config.js";

const texLoader = new THREE.TextureLoader();

function loadTex(url) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* Flaches Sprite — Mattercraft-Image-Node-Konvention: Höhe 1, Breite = Seitenverhältnis. */
function makeSprite(url, aspectW, aspectH, renderOrder) {
  const geo = new THREE.PlaneGeometry(aspectW / aspectH, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: loadTex(url),
    transparent: true,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = renderOrder;
  return m;
}

// Figur-Bilder als WebP mit Alpha (Production-Härtung 2026-09-09): 768×1152 px
// statt PNG 1024×1536 (2124 KB → 156 KB gesamt; Qualität 85, Lanczos auf
// premultipliziertem Alpha, damit keine dunklen Säume entstehen). Das
// Seitenverhältnis 2:3 ist EXAKT beibehalten — die Plane-Maße unten (1024:1536)
// und alle Pivots sind relativ, sonst verrutschen Kopf und Gesicht. Die Figur
// ist am Handy nie größer als ~400 px, 768 px reichen für Retina. WebP mit
// Alpha: Safari ab iOS 14, Chrome ab 32 — unter der Modul-Grenze (iOS 11) liegt
// nur iOS 11–13, dort bliebe die Figur unsichtbar (bewusst hingenommen).
const A = "./assets/character/";

/* Baut das komplette Rig unter `parent` und liefert alle Knoten zurück. */
export function buildRig(parent) {
  // BeatRoot: neutraler Wrapper für AUTORISIERTE Animationen (Theatre.js-
  // Timeline). Behaviors fassen nur FigureRoot an, die Timeline nur BeatRoot —
  // beide addieren sich, ohne sich in die Quere zu kommen.
  const BeatRoot = new THREE.Group();
  parent.add(BeatRoot);

  const FigureRoot = new THREE.Group();
  FigureRoot.position.set(0, 0.06241394743147513, 0);
  FigureRoot.scale.setScalar(0.12759215518606418 * (SCENE.figureScale ?? 1)); // Szene 85 % (2026-09-07)
  BeatRoot.add(FigureRoot);

  const BodyPivot = new THREE.Group();
  BodyPivot.position.set(0, -0.4897775782082088, 0);
  FigureRoot.add(BodyPivot);

  const BodyIdle   = makeSprite(A + "body_idle.webp",         1024, 1536, 0);
  const BodyAffirm = makeSprite(A + "body_react_affirm.webp", 1024, 1536, 0);
  const BodyThink  = makeSprite(A + "body_react_think.webp",  1024, 1536, 0);
  for (const b of [BodyIdle, BodyAffirm, BodyThink]) {
    b.position.set(0, 0.5, 0);
    BodyPivot.add(b);
  }

  const HeadPivot = new THREE.Group();
  HeadPivot.position.set(0, 0.6251773316593252, 0.01);
  BodyPivot.add(HeadPivot);

  // Nick-Achse ≈ Kopfmitte: Pivot hoch, Kinder um denselben Betrag runter —
  // Art bleibt exakt stehen (Pivot-Technik). Yaw bleibt am HeadPivot.
  const HeadNod = new THREE.Group();
  HeadPivot.add(HeadNod);

  const HEAD_Y0 = -0.1157760907793379;
  const FACE_Y0 = -0.11886690574041192;

  const Head = makeSprite(A + "head.webp", 1024, 1536, 1);
  HeadNod.add(Head);

  const FaceNeutral = makeSprite(A + "face_neutral.webp", 1024, 1536, 2);
  const FaceBlink   = makeSprite(A + "face_blink.webp",   1024, 1536, 2);
  const FaceTalk    = makeSprite(A + "face_talk.webp",    1024, 1536, 2);
  HeadNod.add(FaceNeutral, FaceBlink, FaceTalk);

  const nodes = {
    BeatRoot, FigureRoot, BodyPivot, HeadPivot, HeadNod, Head,
    BodyIdle, BodyAffirm, BodyThink,
    FaceNeutral, FaceBlink, FaceTalk,
  };

  applyNodAxis(nodes);

  const BubbleRoot = new THREE.Group();
  BubbleRoot.position.set(0, 0.6471286419944263, 0.01);
  BubbleRoot.scale.setScalar(1.0569890223828002);
  FigureRoot.add(BubbleRoot);
  nodes.BubbleRoot = BubbleRoot;

  nodes.FIGURE_HOME = {
    pos: FigureRoot.position.clone(),
    scale: FigureRoot.scale.clone(),
  };

  return nodes;
}

export function applyNodAxis(nodes) {
  const a = SCENE.headNodAxis;
  nodes.HeadNod.position.set(0, a, 0);
  nodes.Head.position.set(0, -0.1157760907793379 - a, 0);
  for (const f of [nodes.FaceNeutral, nodes.FaceBlink, nodes.FaceTalk]) {
    f.position.set(0, -0.11886690574041192 - a, 0.002275570500326991);
  }
}
