/* =============================================================================
   DETAR — StatsOverlay (?stats): Live-Diagnose am Gerät.
   Zeigt: Tracking-Status, Gyro-Status, Roh- vs. stabilisierten Jitter (mm,
   RMS der Frame-zu-Frame-Bewegung über die letzten ~90 getrackten Frames,
   normiert auf 150-mm-Karte). Damit lässt sich STAB am Handy mit ZAHLEN
   kalibrieren: erst minCutoff runter, bis „Stab" in Ruhe < ~0,3 mm, dann
   beta hoch, bis Bewegung ohne Nachziehen folgt.
   ============================================================================= */
import * as THREE from "three";
import { GYRO } from "./config.js";

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
  constructor(anchorGroup, stabRoot, stab, gyro, env = null) {
    this.anchor = anchorGroup;
    this.stabRoot = stabRoot;
    this.stab = stab;
    this.gyro = gyro;
    this.env = env; // { getVideo, renderer } — Kamera-Auflösung + PixelRatio (Finding 1/2)
    this.raw = new Ring();
    this.smooth = new Ring();
    this.lastDom = 0;
    this.box = document.createElement("div");
    this.box.style.cssText =
      "position:fixed;top:calc(140px + env(safe-area-inset-top));right:8px;z-index:50;" +
      "background:rgba(0,0,0,0.72);border-radius:8px;padding:8px 10px;" +
      "font:11px/1.5 monospace;pointer-events:none";
    this.el = document.createElement("div");
    this.el.style.cssText = "color:#0f0;white-space:pre";
    this.box.appendChild(this.el);
    // Gyro-Toggle: GYRO.enabled wird pro Frame geprüft → wirkt sofort.
    // Kill-Switch-Vergleich am Gerät ohne Neuladen (Jitter mit/ohne Gyro).
    this.btn = document.createElement("button");
    this.btn.style.cssText =
      "margin-top:6px;width:100%;pointer-events:auto;cursor:pointer;" +
      "font:bold 11px monospace;border:none;border-radius:6px;padding:5px 8px";
    this.btn.onclick = () => {
      GYRO.enabled = GYRO.enabled === "nein" ? "ja" : "nein";
      this.paintBtn();
    };
    this.paintBtn();
    this.box.appendChild(this.btn);
    document.body.appendChild(this.box);
  }
  paintBtn() {
    const on = GYRO.enabled !== "nein";
    this.btn.textContent = on ? "Gyro AN — tippen: aus" : "Gyro AUS — tippen: an";
    this.btn.style.background = on ? "#ffdd00" : "#555";
    this.btn.style.color = on ? "#111" : "#eee";
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
    const gy = GYRO.enabled === "nein" ? "DEAKTIVIERT (Toggle)"
      : !this.gyro ? "aus (?nogyro/Desktop)"
      : !this.gyro.enabled ? "keine Permission"
      : this.gyro.active ? "AKTIV" : "enabled, keine Events";
    const v = this.env?.getVideo?.();
    const cam = v && v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : "—";
    const pr = this.env?.renderer ? this.env.renderer.getPixelRatio().toFixed(1) : "—";
    this.el.textContent =
      `Track: ${this.stab.tracking ? "FOUND" : "LOST"}  sichtbar: ${this.stabRoot.visible ? "ja" : "nein"}\n` +
      `Gyro:  ${gy}\n` +
      `Cam:   ${cam}  PR: ${pr}\n` +
      `Jitter roh:  ${f(this.raw.rms())}\n` +
      `Jitter stab: ${f(this.smooth.rms())}\n` +
      `Vision: ${this.stab.visionHz ?? "—"} Hz  ${this.stab.moving ? "BEWEGT" : "ruhig"}`;
  }
}
