/* =============================================================================
   DETAR — ActivationAnim: Pop-In beim ersten Scan (Ease-Out-Back auf die
   ECHTE Start-Scale, optional Spin auf rotation.y). 1:1-Port.
   ============================================================================= */
import * as THREE from "three";
import { ACT } from "./config.js";

export class ActivationAnim {
  constructor(nodes) {
    this.P = ACT;
    this.playing = false;
    this.elapsed = 0;
    this.baseRotY = 0;
    this.baseScale = new THREE.Vector3(1, 1, 1);
    this.scaleCaptured = false;
    this.onDone = null;
    this.element = nodes.FigureRoot;
  }
  /* Sofort verstecken (scale 0) + echte Start-Scale erfassen — verhindert,
     dass die Figur vor dem Pop-In kurz in voller Größe aufblitzt. */
  prime() {
    if (!this.scaleCaptured) {
      this.baseScale.copy(this.element.scale);
      this.scaleCaptured = true;
    }
    this.element.scale.set(0, 0, 0);
  }
  play(onDone) {
    this.onDone = onDone ?? null;
    this.elapsed = 0;
    this.baseRotY = this.element.rotation.y;
    if (!this.scaleCaptured) {
      this.baseScale.copy(this.element.scale);
      this.scaleCaptured = true;
    }
    this.element.scale.set(0, 0, 0);
    this.playing = true;
  }
  cancel() {
    this.playing = false;
    this.onDone = null;
    if (this.scaleCaptured) this.element.scale.copy(this.baseScale);
  }
  tick(dt) {
    if (!this.playing) return;
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.P.durationSec, 1);
    const s = this.easeOutBack(t, this.P.overshoot);
    this.element.scale.set(this.baseScale.x * s, this.baseScale.y * s, this.baseScale.z * s);
    const spinTotal = this.P.spins * Math.PI * 2;
    this.element.rotation.y = this.baseRotY + spinTotal * this.easeOut(t);
    if (t >= 1) this.finish();
  }
  finish() {
    this.playing = false;
    this.element.scale.copy(this.baseScale);
    this.element.rotation.y = this.baseRotY;
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
  easeOutBack(t, overshoot) {
    const c1 = overshoot, c3 = c1 + 1, p = t - 1;
    return 1 + c3 * p * p * p + c1 * p * p;
  }
  easeOut(t) { const p = 1 - t; return 1 - p * p * p; }
}
