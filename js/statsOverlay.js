/* =============================================================================
   DETAR — StatsOverlay (?stats): Live-Diagnose am Gerät.
   Zeigt: Tracking-Status, Gyro-Status, Roh- vs. stabilisierten Jitter (mm,
   RMS der Frame-zu-Frame-Bewegung über die letzten ~90 getrackten Frames,
   normiert auf 150-mm-Karte). Damit lässt sich STAB am Handy mit ZAHLEN
   kalibrieren: erst minCutoff runter, bis „Stab" in Ruhe < ~0,3 mm, dann
   beta hoch, bis Bewegung ohne Nachziehen folgt.
   ============================================================================= */
import * as THREE from "three";

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const MM = 150;
const N = 90;

class Ring {
  constructor() { this.buf = []; this.prev = null; }
  push(x, y, z) {
    if (this.prev) {
      const dx = x - this.prev[0], dy = y - this.prev[1], dz = z - this.prev[2];
      this.buf.push(dx * dx + dy * dy + dz * dz);
      if (this.buf.length > N) this.buf.shift();
    }
    this.prev = [x, y, z];
  }
  reset() { this.prev = null; }
  rms() {
    if (!this.buf.length) return null;
    return Math.sqrt(this.buf.reduce((a, v) => a + v, 0) / this.buf.length) * MM;
  }
}

export class StatsOverlay {
  constructor(anchorGroup, stabRoot, stab, gyro) {
    this.anchor = anchorGroup;
    this.stabRoot = stabRoot;
    this.stab = stab;
    this.gyro = gyro;
    this.raw = new Ring();
    this.smooth = new Ring();
    this.lastDom = 0;
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:calc(140px + env(safe-area-inset-top));right:8px;z-index:50;" +
      "background:rgba(0,0,0,0.72);color:#0f0;font:11px/1.5 monospace;" +
      "padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre";
    document.body.appendChild(this.el);
  }
  tick() {
    if (this.stab.tracking) {
      this.anchor.matrix.decompose(_p, _q, _s);
      if (_s.x > 1e-8 && Number.isFinite(_p.x)) {
        this.raw.push(_p.x / _s.x, _p.y / _s.x, _p.z / _s.x);
      }
      this.stabRoot.matrix.decompose(_p, _q, _s);
      if (_s.x > 1e-8) this.smooth.push(_p.x / _s.x, _p.y / _s.x, _p.z / _s.x);
    } else {
      this.raw.reset();
      this.smooth.reset();
    }
    const now = performance.now();
    if (now - this.lastDom < 500) return;
    this.lastDom = now;
    const f = (v) => (v == null ? "—" : v.toFixed(2) + " mm");
    const gy = !this.gyro ? "aus (?nogyro/Desktop)"
      : !this.gyro.enabled ? "keine Permission"
      : this.gyro.active ? "AKTIV" : "enabled, keine Events";
    this.el.textContent =
      `Track: ${this.stab.tracking ? "FOUND" : "LOST"}  sichtbar: ${this.stabRoot.visible ? "ja" : "nein"}\n` +
      `Gyro:  ${gy}\n` +
      `Jitter roh:  ${f(this.raw.rms())}\n` +
      `Jitter stab: ${f(this.smooth.rms())}`;
  }
}
