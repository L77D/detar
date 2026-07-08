/* =============================================================================
   DETAR — Debug-Overlay (pinke Hilfslinien): Lauffeld-Begrenzung + FACE_CAM-
   Kegel + aktuelle Blickrichtung. Aktivieren per ?debug in der URL.
   Port aus dem Lokal-Prototyp; Kamera-Position kommt aus dem Karten-Frame.
   ============================================================================= */
import * as THREE from "three";
import { IDLE } from "./config.js";

const DEBUG_PINK = 0xff2fd6;
const FACECAM_SEGS = 24;
const _dbgV = new THREE.Vector3();

export class DebugOverlay {
  constructor(worldRoot, nodes, frame) {
    this.nodes = nodes;
    this.frame = frame;
    this.group = new THREE.Group();
    this.group.visible = false;
    worldRoot.add(this.group);

    this.roamRectGeo = new THREE.BufferGeometry();
    this.roamRectGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    const roamRect = new THREE.LineLoop(
      this.roamRectGeo,
      new THREE.LineBasicMaterial({ color: DEBUG_PINK, depthTest: false })
    );
    roamRect.renderOrder = 10;
    this.group.add(roamRect);

    this.roamFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: DEBUG_PINK, transparent: true, opacity: 0.18,
        depthTest: false, side: THREE.DoubleSide,
      })
    );
    this.roamFill.rotation.x = -Math.PI / 2;
    this.roamFill.renderOrder = 9;
    this.group.add(this.roamFill);

    this.faceCamGeo = new THREE.BufferGeometry();
    this.faceCamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((FACECAM_SEGS + 4) * 3), 3));
    const faceCamCone = new THREE.Line(
      this.faceCamGeo,
      new THREE.LineBasicMaterial({ color: DEBUG_PINK, depthTest: false })
    );
    faceCamCone.renderOrder = 10;
    this.group.add(faceCamCone);

    this.headingGeo = new THREE.BufferGeometry();
    this.headingGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    const headingLine = new THREE.Line(
      this.headingGeo,
      new THREE.LineBasicMaterial({ color: 0xff8ae6, depthTest: false })
    );
    headingLine.renderOrder = 10;
    this.group.add(headingLine);
  }
  setVisible(v) { this.group.visible = v; }
  tick() {
    if (!this.group.visible) return;
    const FigureRoot = this.nodes.FigureRoot;
    const halfW = (IDLE.markerWidth * IDLE.roamFraction) / 2;
    const halfH = (IDLE.markerHeight * IDLE.roamFraction) / 2;
    const y = 0.0015;
    const a = this.roamRectGeo.attributes.position.array;
    a.set([-halfW, y, -halfH, halfW, y, -halfH, halfW, y, halfH, -halfW, y, halfH]);
    this.roamRectGeo.attributes.position.needsUpdate = true;
    this.roamFill.scale.set(halfW * 2, halfH * 2, 1);
    this.roamFill.position.y = y;

    const fx = FigureRoot.position.x;
    const fz = FigureRoot.position.z;
    const y2 = 0.002;
    const camL = this.frame.getCamLocal(_dbgV);
    const camH = Math.atan2(camL.x - fx, camL.z - fz);
    const thr = (IDLE.cameraFacingThreshold * Math.PI) / 180;
    const r = Math.max(halfW, halfH) * 1.8;
    const c = this.faceCamGeo.attributes.position.array;
    let k = 0;
    const put = (px, pz) => { c[k++] = px; c[k++] = y2; c[k++] = pz; };
    put(fx, fz);
    for (let i = 0; i <= FACECAM_SEGS; i++) {
      const ang = camH - thr + (2 * thr * i) / FACECAM_SEGS;
      put(fx + Math.sin(ang) * r, fz + Math.cos(ang) * r);
    }
    put(fx, fz);
    this.faceCamGeo.attributes.position.needsUpdate = true;

    const h = this.headingGeo.attributes.position.array;
    const hy = FigureRoot.rotation.y;
    h.set([fx, y2, fz, fx + Math.sin(hy) * r * 1.15, y2, fz + Math.cos(hy) * r * 1.15]);
    this.headingGeo.attributes.position.needsUpdate = true;
  }
}
