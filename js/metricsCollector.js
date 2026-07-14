/* =============================================================================
   DETAR — MetricsCollector (?metrics, im ?replay automatisch): verdichtet
   einen Lauf zu VERGLEICHBAREN ZAHLEN. Damit werden Engine-/Filter-Änderungen
   an derselben Aufnahme messbar (Strategie E).

   Kennzahlen:
   • jitterRohMm / jitterStabMm — RMS der Frame-zu-Frame-Bewegung (nur getrackte
     Frames, auf 150-mm-Karte normiert; identische Rechnung wie ?stats, aber
     über den GESAMTEN Lauf statt über ein 90-Frame-Fenster)
   • lostEvents — Anzahl Tracking-Abrisse (FOUND→LOST-Flanken)
   • lostQuote — Anteil der Laufzeit ohne Tracking
   • bewegtQuote — Anteil der getrackten Frames im BEWEGT-Modus
   • visionHzAvg/Min — Vision-Messrate (Sekundenfenster aus dem Stabilizer)
   • frames, dauerS, build, ua

   Zugriff: window.__detarMetrics.summary() in der Konsole, .download() für
   JSON-Datei. Im Replay wird am Video-Ende automatisch gedumpt.
   ============================================================================= */
import * as THREE from "three";
import { BUILD } from "./version.js";

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const MM = 150;

class Accum {
  constructor() { this.sum = 0; this.n = 0; this.prev = null; }
  push(x, y, z) {
    if (this.prev) {
      const dx = x - this.prev[0], dy = y - this.prev[1], dz = z - this.prev[2];
      this.sum += dx * dx + dy * dy + dz * dz;
      this.n++;
    }
    this.prev = [x, y, z];
  }
  reset() { this.prev = null; }
  rmsMm() { return this.n ? Math.sqrt(this.sum / this.n) * MM : null; }
}

export class MetricsCollector {
  constructor(anchorGroup, stabRoot, stab) {
    this.anchor = anchorGroup;
    this.stabRoot = stabRoot;
    this.stab = stab;
    this.raw = new Accum();
    this.smooth = new Accum();
    this.t0 = performance.now();
    this.frames = 0;
    this.trackedFrames = 0;
    this.movingFrames = 0;
    this.lostEvents = 0;
    this.wasTracking = false;
    this.hzSamples = [];
    this.lastHzSeen = null;
    window.__detarMetrics = this; // Konsolen-Zugriff
  }

  tick() {
    this.frames++;
    const tr = this.stab.tracking;
    if (this.wasTracking && !tr) this.lostEvents++;
    this.wasTracking = tr;

    if (tr) {
      this.trackedFrames++;
      if (this.stab.moving) this.movingFrames++;
      this.anchor.matrix.decompose(_p, _q, _s);
      if (_s.x > 1e-8 && Number.isFinite(_p.x)) this.raw.push(_p.x / _s.x, _p.y / _s.x, _p.z / _s.x);
      this.stabRoot.matrix.decompose(_p, _q, _s);
      if (_s.x > 1e-8) this.smooth.push(_p.x / _s.x, _p.y / _s.x, _p.z / _s.x);
    } else {
      this.raw.reset();
      this.smooth.reset();
    }
    // Vision-Hz: Sekundenwert des Stabilizers einsammeln (Wertwechsel = neues Fenster)
    if (this.stab.visionHz != null && this.stab.visionHz !== this.lastHzSeen) {
      this.hzSamples.push(this.stab.visionHz);
      this.lastHzSeen = this.stab.visionHz;
    }
  }

  summary() {
    const dauerS = (performance.now() - this.t0) / 1000;
    const hz = this.hzSamples;
    const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
    return {
      build: BUILD,
      ua: navigator.userAgent,
      dauerS: r2(dauerS),
      frames: this.frames,
      jitterRohMm: r2(this.raw.rmsMm()),
      jitterStabMm: r2(this.smooth.rmsMm()),
      lostEvents: this.lostEvents,
      lostQuote: r2(1 - this.trackedFrames / Math.max(1, this.frames)),
      bewegtQuote: r2(this.movingFrames / Math.max(1, this.trackedFrames)),
      visionHzAvg: r2(hz.length ? hz.reduce((a, v) => a + v, 0) / hz.length : null),
      visionHzMin: hz.length ? Math.min(...hz) : null,
    };
  }

  download() {
    const s = this.summary();
    console.table(s);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }));
    a.download = `detar-metrics-build${BUILD}-${Date.now()}.json`;
    a.click();
    return s;
  }
}
