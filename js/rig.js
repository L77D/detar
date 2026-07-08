/* =============================================================================
   DETAR — Figuren-Rig. Hierarchie + Transforms exakt aus Scene.zcomp /
   Lokal-Prototyp: FigureRoot → BodyPivot (Füße) → 3 Body-Sprites + HeadPivot
   (Hals) → HeadNod (Nick-Achse ≈ Kopfmitte) → Head + 3 Face-Sprites.
   Painter's Algorithm: depthTest AUS auf allen flachen Layern, feste
   renderOrder (Body 0, Head 1, Face 2, Bubble 3) — wie LayerSort.
   ============================================================================= */
import * as THREE from "three";
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

const A = "./assets/character/";

/* Baut das komplette Rig unter `parent` und liefert alle Knoten zurück. */
export function buildRig(parent) {
  const FigureRoot = new THREE.Group();
  FigureRoot.position.set(0, 0.06241394743147513, 0);
  FigureRoot.scale.setScalar(0.12759215518606418);
  parent.add(FigureRoot);

  const BodyPivot = new THREE.Group();
  BodyPivot.position.set(0, -0.4897775782082088, 0);
  FigureRoot.add(BodyPivot);

  const BodyIdle   = makeSprite(A + "body_idle.png",         1024, 1536, 0);
  const BodyAffirm = makeSprite(A + "body_react_affirm.png", 1024, 1536, 0);
  const BodyThink  = makeSprite(A + "body_react_think.png",  1024, 1536, 0);
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

  const Head = makeSprite(A + "head.png", 1024, 1536, 1);
  HeadNod.add(Head);

  const FaceNeutral = makeSprite(A + "face_neutral.png", 1024, 1536, 2);
  const FaceBlink   = makeSprite(A + "face_blink.png",   1024, 1536, 2);
  const FaceTalk    = makeSprite(A + "face_talk.png",    1024, 1536, 2);
  HeadNod.add(FaceNeutral, FaceBlink, FaceTalk);

  const nodes = {
    FigureRoot, BodyPivot, HeadPivot, HeadNod, Head,
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
