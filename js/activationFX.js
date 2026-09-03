/* =============================================================================
   DETAR — ActivationFX: „Karte gefunden"-Phase, BEVOR die Figur erscheint.
   UI-UPDATE 2026-09-03 (Figma mock_02): vier gelbe Eck-Marker (L-Form mit
   schwarzer Kontur, assets/ui/corner-gelb.svg) sitzen auf den Kartenecken,
   Kerbe zur Kartenmitte, und wabern leicht auf und ab. Glow + Partikel der
   Vorversion sind entfernt (Entscheidung Michael). burst(): Marker ploppen
   kurz auf und faden, dann kommt die Figur.
   • tapPlane: unsichtbare Karten-Plane NUR für den Tap-Raycast (three.js-
     Raycaster ignoriert das visible-Flag — bewusst genutzt).
   Optik-Werte im ACTFX-Dashboard (js/config.js) → Dev-Panel-Regler.
   Painter's-Algorithm-Regeln: depthTest false, KEIN depthWrite, renderOrder
   unter der Figur (0.5 — Figur ab 0..3, Marker sind nur sichtbar, solange
   die Figur versteckt ist).
   ============================================================================= */
import * as THREE from "three";
import { ACTFX, SCENE } from "./config.js";

// L-Form aus dem Figma-Export (viewBox 32,59): Quadrat ohne die Ecke oben rechts
const VB = 32.5934;
const L_PATH = [[18.5188, 2.2219], [18.5188, 14.0744], [30.3713, 14.0744], [30.3713, 30.3713],
                [2.2219, 30.3713], [2.2219, 2.2219]];
// Ecken im Karten-Frame (X rechts, Z zur Unterkante) + In-Plane-Drehung, damit
// die Kerbe (im Bild oben rechts) zur Kartenmitte zeigt.
const CORNERS = [
  { sx: -1, sz:  1, rot: 0 },               // unten links
  { sx: -1, sz: -1, rot: -Math.PI / 2 },    // oben links
  { sx:  1, sz: -1, rot: Math.PI },         // oben rechts
  { sx:  1, sz:  1, rot: Math.PI / 2 },     // unten rechts
];

export class ActivationFX {
  constructor(worldRoot) {
    this.state = "idle"; // idle | attract | burst
    this.clock = 0;
    this.burstT = 0;
    this.onBurstDone = null;

    this.group = new THREE.Group();
    worldRoot.add(this.group);

    // --- Tap-Plane (unsichtbar, nur Raycast) ----------------------------------
    this.tapPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    this.tapPlane.visible = false;
    this.tapPlane.rotation.x = -Math.PI / 2;
    this.group.add(this.tapPlane);

    // --- Eck-Marker -------------------------------------------------------------
    this.texture = null;
    this.markers = CORNERS.map((c, i) => {
      const mat = new THREE.MeshBasicMaterial({
        map: null, transparent: true, opacity: 1,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = 0.5;
      mesh.rotation.set(-Math.PI / 2, 0, c.rot);
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, corner: c, phase: (i * Math.PI) / 2 };
    });
    this.buildPool();
    this.applySizes();
  }

  /* Textur (neu) zeichnen — auch live über die Farb-Regler im Dev-Panel. */
  buildPool() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    const s = 128 / VB;
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath();
    L_PATH.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.closePath();
    ctx.fillStyle = ACTFX.color;
    ctx.fill();
    ctx.lineJoin = "miter";
    ctx.lineWidth = ACTFX.outlineWidth * s;
    ctx.strokeStyle = ACTFX.outline;
    ctx.stroke();
    this.texture?.dispose();
    this.texture = new THREE.CanvasTexture(cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    for (const m of this.markers) { m.mesh.material.map = this.texture; m.mesh.material.needsUpdate = true; }
  }

  applySizes() {
    const w = SCENE.cardWidth;
    const h = w * SCENE.cardAspect;
    // Tap-Fläche großzügiger als die Karte (leichter zu treffen, v. a. schräg)
    this.tapPlane.scale.set(w * 1.25, h * 1.25, 1);
    const size = w * ACTFX.markerSize;
    for (const m of this.markers) {
      m.mesh.scale.set(size, size, 1);
      // Marker-Mitte sitzt auf der Kartenecke (halb drauf, halb drüber — mock_02)
      m.mesh.position.x = m.corner.sx * (w / 2);
      m.mesh.position.z = m.corner.sz * (h / 2);
      m.mesh.position.y = 0.002;
    }
  }

  setVisible(v) { for (const m of this.markers) m.mesh.visible = v; }

  /* Attract-Phase starten (Karte gefunden, Figur noch versteckt). */
  play() {
    this.state = "attract";
    this.clock = 0;
    this.applySizes();
    for (const m of this.markers) m.mesh.material.opacity = 1;
    this.setVisible(true);
  }

  /* Tap-Feedback: Marker ploppen auf und faden, dann onDone (einmalig). */
  burst(onDone) {
    if (this.state !== "attract") { onDone?.(); return; }
    this.state = "burst";
    this.burstT = 0;
    this.onBurstDone = onDone ?? null;
  }

  stop() {
    this.state = "idle";
    this.setVisible(false);
  }

  tick(dt) {
    if (this.state === "idle") return;
    this.clock += dt;
    const w = SCENE.cardWidth;
    const base = w * ACTFX.markerSize;
    const bob = w * ACTFX.bobHeight;
    const omega = (Math.PI * 2) / Math.max(0.2, ACTFX.bobSec);

    let k = 0;
    if (this.state === "burst") {
      this.burstT += dt;
      k = Math.min(1, this.burstT / Math.max(0.05, ACTFX.burstSec));
    }
    for (const m of this.markers) {
      const lift = 0.5 + 0.5 * Math.sin(this.clock * omega + m.phase);
      m.mesh.position.y = 0.002 + bob * lift;
      const s = base * (1 + k * 0.6);
      m.mesh.scale.set(s, s, 1);
      m.mesh.material.opacity = 1 - k;
    }
    if (this.state === "burst" && k >= 1) {
      const cb = this.onBurstDone;
      this.onBurstDone = null;
      this.stop();
      cb?.();
    }
  }
}
