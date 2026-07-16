/* =============================================================================
   DETAR — IdleWander: Watscheln, Atem-Bop, Umschauen, Kamera-Blick,
   FACE_CAM-Threshold-Billboard, Antwort-Modus "attending".
   Port aus dem Lokal-Prototyp (Stand 2026-07-06) mit dem UMGEBAUTEN Walk
   (Ziel-Punkt statt Zufalls-Heading, weiche Eindrehung, Rückwärts-Watscheln,
   Ankunft beendet den Walk) und fps-normalisiertem faceCamLerp.

   KOORDINATEN (MindAR): FigureRoot hängt unter frame.worldRoot (Karten-Frame,
   Y = hoch von der Karte weg). element.position/rotation sind LOKAL in diesem
   Frame — identisch zur Prototyp-Semantik. Nur die Kamera muss per
   frame.getCamLocal() in den Karten-Frame transformiert werden.
   ACHSEN: Bop = BodyPivot.scale.y · Laufen = position.x/z · Heading =
   rotation.y · Roll = rotation.z · Nick = HeadNod.rotation.x. NIE rotation.x
   der FigureRoot anfassen.
   ============================================================================= */
import * as THREE from "three";
import { IDLE, frameLerp60 } from "./config.js";

const _camL = new THREE.Vector3();
const _headW = new THREE.Vector3();

export class IdleWander {
  constructor(nodes, frame) {
    this.P = IDLE;
    this.nodes = nodes;
    this.frame = frame;
    this.state = "bop";
    this.stateTime = 0;
    this.stateDuration = 2;
    this.clock = 0;
    this.busy = false;
    this.element = nodes.FigureRoot;
    this.heading = this.element.rotation.y;
    this.headBaseRotY = nodes.HeadPivot.rotation.y;
    this.headBaseRotZ = nodes.HeadPivot.rotation.z;
    this.headBaseRotX = nodes.HeadNod.rotation.x;
    this.headSmoothX = this.headBaseRotX;
    this.rollSmooth = 0;
    this.headTargetY = 0;
    this.headSmoothY = 0;
    this._baseRotZ = null;
    this.yawSmooth = this.heading;
    this.walkTarget = null;
    this.attending = false;
    this.pickNextState(true);
  }
  /* Antwort-Modus: stehen bleiben + zur Kamera drehen; Kopf folgt der Kamera. */
  setAttending(value) {
    this.attending = value;
    if (value) {
      this.walkTarget = null;
      this.state = "face_cam";
      this.stateTime = 0;
    } else {
      this.pickNextState(true);
    }
  }
  // (Einblick-Sway lebt seit 2026-07-15 in FigureFlip.tickSway — die Figur
  //  liegt dort FLACH, das Wackeln ist eine rotation.z-Drehung der Fläche.)
  /* Replay-Reset (Dev-Panel): sauber zurück auf Anfang. */
  reset() {
    this.state = "bop"; this.stateTime = 0; this.clock = 0;
    this.heading = 0; this.rollSmooth = 0;
    this.yawSmooth = 0; this.walkTarget = null;
    this.attending = false; this.busy = false;
    this.headSmoothY = this.headBaseRotY; this.headSmoothX = this.headBaseRotX;
    this.element.rotation.y = 0;
    this.element.rotation.z = this.figureBaseRotZ();
    this.nodes.HeadPivot.rotation.y = this.headBaseRotY;
    this.nodes.HeadNod.rotation.x = this.headBaseRotX;
    this.nodes.BodyPivot.scale.set(1, 1, 1);
    this.pickNextState(true);
  }
  setBusy(value) {
    this.busy = value;
    if (value) {
      this.state = "bop";
      this.stateTime = 0;
      this.stateDuration = this.rand(this.P.bopHoldMin, this.P.bopHoldMax);
    }
  }
  tick(dt) {
    if (dt <= 0 || dt > 0.1) dt = 0.016;
    this.clock += dt;
    if (this.busy) { this.relaxToRest(dt); return; }
    this.stateTime += dt;
    this.applyBopScale();
    const camHeading = this.computeHeadingTowardCamera();
    if (camHeading !== null) {
      const off = Math.abs(this.normalizeAngle(camHeading - this.heading));
      const thresholdRad = (this.P.cameraFacingThreshold * Math.PI) / 180;
      if (this.state !== "face_cam" && off > thresholdRad) {
        this.state = "face_cam";
        this.stateTime = 0;
      }
    }
    if (this.state === "face_cam") { this.doFaceCam(dt, camHeading); return; }
    switch (this.state) {
      case "bop":
        this.fadeRoll(dt, 0);
        if (this.attending) {
          this.fadeHead(dt, this.computeHeadTowardCamera());
          this.fadePitch(dt, this.computeHeadPitchTowardCamera());
        } else {
          this.fadeHead(dt, this.headBaseRotY);
          this.fadePitch(dt, this.headBaseRotX);
        }
        break;
      case "look_around":
        this.fadeRoll(dt, 0); this.fadeHead(dt, this.headTargetY); this.fadePitch(dt, this.headBaseRotX);
        break;
      case "walk":
        this.doWalk(dt); this.fadeHead(dt, this.headBaseRotY); this.fadePitch(dt, this.headBaseRotX);
        break;
      case "look_cam":
        this.fadeRoll(dt, 0); this.fadeHead(dt, this.computeHeadTowardCamera());
        this.fadePitch(dt, this.computeHeadPitchTowardCamera());
        break;
    }
    if (this.stateTime >= this.stateDuration) this.pickNextState();
  }
  doWalk(dt) {
    const el = this.element;
    const phase = this.clock * this.P.walkFrequency * Math.PI * 2;
    const roll = Math.sin(phase) * this.P.walkRollMax;
    this.fadeRoll(dt, roll);

    const t = this.walkTarget;
    if (!t) { this.endWalk(0.4, 0.9); return; }

    const dxT = t.x - el.position.x;
    const dzT = t.z - el.position.z;
    const distT = Math.hypot(dxT, dzT);
    if (distT < 0.0015) { this.endWalk(0.4, 0.9); return; }

    // Kurs (Bewegung) und Blick (Ausrichtung) entkoppelt: liegt der Kurs
    // ausserhalb des Kamera-Kegels, watschelt die Figur RÜCKWÄRTS —
    // Gesicht bleibt zur Kamera, FACE_CAM bricht den Walk nie ab.
    const courseYaw = Math.atan2(dxT, dzT);
    const camH = this.computeHeadingTowardCamera();
    const thr = (this.P.cameraFacingThreshold * Math.PI) / 180 * 0.9;
    let faceYaw = courseYaw;
    if (camH !== null && Math.abs(this.normalizeAngle(courseYaw - camH)) > thr) {
      faceYaw = this.normalizeAngle(courseYaw + Math.PI);
    }
    this.heading = faceYaw;

    this.yawSmooth += this.normalizeAngle(faceYaw - this.yawSmooth) * Math.min(1, dt * 8);
    el.rotation.y = this.yawSmooth;

    const dist = Math.min(this.P.walkSpeed * dt, distT);
    let nx = el.position.x + Math.sin(courseYaw) * dist;
    let nz = el.position.z + Math.cos(courseYaw) * dist;

    const halfW = (this.P.markerWidth * this.P.roamFraction) / 2;
    const halfH = (this.P.markerHeight * this.P.roamFraction) / 2;
    let hitEdge = false;
    if (nx > halfW || nx < -halfW) { nx = THREE.MathUtils.clamp(nx, -halfW, halfW); hitEdge = true; }
    if (nz > halfH || nz < -halfH) { nz = THREE.MathUtils.clamp(nz, -halfH, halfH); hitEdge = true; }
    el.position.x = nx;
    el.position.z = nz;
    if (hitEdge) { this.endWalk(0.4, 0.9); return; }

    if (this.P.stepSquash > 0) {
      const squash = 1 - Math.abs(Math.sin(phase)) * this.P.stepSquash;
      const stretch = 1 + Math.abs(Math.sin(phase)) * this.P.stepSquash * 0.5;
      this.nodes.BodyPivot.scale.y *= squash;
      this.nodes.BodyPivot.scale.x *= stretch;
    }
  }
  endWalk(minPause, maxPause) {
    this.walkTarget = null;
    this.state = "bop";
    this.stateTime = 0;
    this.stateDuration = this.rand(minPause, maxPause);
  }
  pickWalkTarget() {
    const halfW = (this.P.markerWidth * this.P.roamFraction) / 2;
    const halfH = (this.P.markerHeight * this.P.roamFraction) / 2;
    const pos = this.element.position;
    const camH = this.computeHeadingTowardCamera();
    const thr = (this.P.cameraFacingThreshold * Math.PI) / 180 * 0.9;
    const minDist = Math.min(halfW, halfH) * 0.6;
    let fallback = null;
    for (let i = 0; i < 16; i++) {
      const t = { x: this.rand(-halfW, halfW), z: this.rand(-halfH, halfH) };
      const d = Math.hypot(t.x - pos.x, t.z - pos.z);
      if (d < minDist) continue;
      if (!fallback) fallback = t;
      const h = Math.atan2(t.x - pos.x, t.z - pos.z);
      if (camH === null || Math.abs(this.normalizeAngle(h - camH)) <= thr) return t;
    }
    return fallback ?? { x: 0, z: 0 };
  }
  applyBopScale() {
    const s = (Math.sin(this.clock * this.P.bopFrequency * Math.PI * 2) + 1) / 2;
    this.nodes.BodyPivot.scale.y = 1 + s * this.P.bopAmplitude;
    this.nodes.BodyPivot.scale.x = 1;
  }
  computeHeadingTowardCamera() {
    const camL = this.frame.getCamLocal(_camL);
    if (!camL) return null; // NaN-Schutz: kaputter Frame → kein Update
    const selfPos = this.element.position; // lokal im Karten-Frame
    return Math.atan2(camL.x - selfPos.x, camL.z - selfPos.z);
  }
  doFaceCam(dt, camHeading) {
    this.fadeRoll(dt, 0);
    this.fadeHead(dt, this.headBaseRotY);
    this.fadePitch(dt, this.computeHeadPitchTowardCamera());
    if (camHeading === null) { this.state = "bop"; return; }
    const delta = this.normalizeAngle(camHeading - this.heading);
    this.heading += delta * frameLerp60(this.P.faceCamLerp, dt);
    this.element.rotation.y = this.heading;
    this.yawSmooth = this.heading;
    if (Math.abs(delta) < 0.05) {
      this.heading = camHeading;
      this.element.rotation.y = this.heading;
      this.yawSmooth = this.heading;
      this.state = "bop";
      this.stateTime = 0;
      this.stateDuration = this.rand(this.P.bopHoldMin, this.P.bopHoldMax);
    }
  }
  fadeRoll(dt, target) {
    this.rollSmooth = THREE.MathUtils.lerp(this.rollSmooth, target, Math.min(1, dt * 8));
    this.element.rotation.z = this.figureBaseRotZ() + this.rollSmooth;
  }
  fadeHead(dt, target) {
    this.headSmoothY = THREE.MathUtils.lerp(this.headSmoothY, target, Math.min(1, dt * 6));
    this.nodes.HeadPivot.rotation.y = this.headSmoothY;
  }
  fadePitch(dt, target) {
    this.headSmoothX = THREE.MathUtils.lerp(this.headSmoothX, target, Math.min(1, dt * 6));
    // Nick auf HeadNod (Achse ≈ Kopfmitte), NICHT auf HeadPivot (Hals).
    this.nodes.HeadNod.rotation.x = this.headSmoothX;
  }
  computeHeadPitchTowardCamera() {
    const camL = this.frame.getCamLocal(_camL);
    if (!camL) return this.headBaseRotX; // NaN-Schutz
    this.nodes.HeadNod.getWorldPosition(_headW);
    const headL = this.frame.toLocal(_headW);
    const dy = camL.y - headL.y;
    const dx = camL.x - headL.x;
    const dz = camL.z - headL.z;
    const horiz = Math.sqrt(dx * dx + dz * dz) || 1e-4;
    const pitch = Math.atan2(Math.max(0, dy), horiz);
    // VORZEICHEN wie im Lokal-Prototyp (three.js-Frame): Aufblick = Kopf
    // lehnt nach hinten = NEGATIV auf HeadNod.rotation.x.
    return this.headBaseRotX - THREE.MathUtils.clamp(pitch, 0, this.P.headPitchMax);
  }
  relaxToRest(dt) {
    this.fadeRoll(dt, 0);
    this.fadeHead(dt, this.headBaseRotY);
    this.fadePitch(dt, this.headBaseRotX);
    this.nodes.BodyPivot.scale.y = THREE.MathUtils.lerp(this.nodes.BodyPivot.scale.y, 1, Math.min(1, dt * 6));
    this.nodes.BodyPivot.scale.x = THREE.MathUtils.lerp(this.nodes.BodyPivot.scale.x, 1, Math.min(1, dt * 6));
  }
  computeHeadTowardCamera() {
    const camL = this.frame.getCamLocal(_camL);
    if (!camL) return this.headBaseRotY; // NaN-Schutz
    this.nodes.HeadPivot.getWorldPosition(_headW);
    const headL = this.frame.toLocal(_headW);
    const worldYaw = Math.atan2(camL.x - headL.x, camL.z - headL.z);
    const rel = worldYaw - this.heading;
    return THREE.MathUtils.clamp(this.normalizeAngle(rel), -this.P.headLookMax, this.P.headLookMax);
  }
  pickNextState(initial = false) {
    this.stateTime = 0;
    if (initial || this.state !== "bop") {
      this.state = "bop";
      this.stateDuration = this.rand(this.P.bopHoldMin, this.P.bopHoldMax);
      return;
    }
    if (this.attending) {
      this.state = "bop";
      this.stateDuration = this.rand(this.P.bopHoldMin, this.P.bopHoldMax);
      return;
    }
    const wLook = Math.max(0, this.P.lookChance);
    const wWalk = Math.max(0, this.P.walkChance);
    const wCam = 0.2;
    const r = Math.random() * (wLook + wWalk + wCam);
    if (r < wLook) {
      this.state = "look_around";
      this.headTargetY = this.headBaseRotY + (Math.random() < 0.5 ? -1 : 1) * this.rand(this.P.headLookMax * 0.4, this.P.headLookMax);
      this.stateDuration = this.rand(this.P.actionMin, this.P.actionMax);
    } else if (r < wLook + wWalk) {
      this.state = "walk";
      this.walkTarget = this.pickWalkTarget();
      this.yawSmooth = this.element.rotation.y;
      this.stateDuration = this.rand(this.P.actionMin + 0.5, this.P.actionMax + 1.5);
    } else {
      this.state = "look_cam";
      this.stateDuration = this.rand(this.P.actionMin, this.P.actionMax);
    }
  }
  figureBaseRotZ() {
    if (this._baseRotZ == null) this._baseRotZ = this.element.rotation.z;
    return this._baseRotZ;
  }
  rand(min, max) { return min + Math.random() * (max - min); }
  normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
}
