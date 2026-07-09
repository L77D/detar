/* =============================================================================
   DETAR — ActivationFX: „Aktiviere mich"-Phase auf der Karte, BEVOR die Figur
   erscheint. Platzhalter-Optik (gut tunebar, leicht ersetzbar):
   • Glow-Puls: additiv geblendete Radial-Gradient-Plane flach auf der Karte.
   • Partikel: kleine Pixel-Quadrate (Karten-Deko-Look, gelb/weiß), steigen
     von der Kartenfläche auf, drehen leicht, faden aus, respawnen.
   • burst(): Tap-Feedback — Glow-Blitz + Partikel schießen hoch und faden.
   • tapPlane: unsichtbare Karten-Plane NUR für den Tap-Raycast (three.js-
     Raycaster ignoriert das visible-Flag — bewusst genutzt).

   Alle Optik-Werte im ACTFX-Dashboard (js/config.js) → Dev-Panel-Regler.
   Painter's-Algorithm-Regeln gelten: depthTest false, KEIN depthWrite,
   renderOrder unter der Figur (Glow -1, Partikel 0.5 — Figur ab 0..3).
   Eigene Optik ersetzen = nur diese Datei anfassen (play/stop/burst/tick
   sind die Schnittstelle, die der CardController benutzt).
   ============================================================================= */
import * as THREE from "three";
import { ACTFX, SCENE } from "./config.js";

const rand = (a, b) => a + Math.random() * (b - a);

export class ActivationFX {
  constructor(worldRoot) {
    this.state = "idle"; // idle | attract | burst
    this.clock = 0;
    this.burstT = 0;
    this.onBurstDone = null;

    this.group = new THREE.Group();
    worldRoot.add(this.group);

    // --- Glow-Plane (Radial-Gradient, additiv) --------------------------------
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    this.glowMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true, opacity: 0,
      depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.0012;
    this.glow.renderOrder = -1; // hinter allem Flachen
    this.group.add(this.glow);

    // --- Tap-Plane (unsichtbar, nur Raycast) ----------------------------------
    this.tapPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial()
    );
    this.tapPlane.visible = false;
    this.tapPlane.rotation.x = -Math.PI / 2;
    this.group.add(this.tapPlane);

    // --- Partikel-Pool ----------------------------------------------------------
    this.parts = [];
    this.buildPool();
    this.applySizes();
    this.setVisible(false);
  }

  /* Pool (neu) aufbauen — auch live über den Dev-Regler „Anzahl". */
  buildPool() {
    for (const p of this.parts) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.parts = [];
    for (let i = 0; i < ACTFX.count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.5 ? ACTFX.color1 : ACTFX.color2,
        transparent: true, opacity: 0,
        depthTest: false, depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.renderOrder = 0.5;
      this.group.add(mesh);
      const p = { mesh };
      this.resetPart(p, true);
      this.parts.push(p);
    }
    this.setVisible(this.state !== "idle");
  }

  applySizes() {
    const w = SCENE.cardWidth;
    const h = w * SCENE.cardAspect;
    this.glow.scale.set(w * 1.15, h * 1.15, 1);
    // Tap-Fläche großzügiger als die Karte (leichter zu treffen, v. a. schräg)
    this.tapPlane.scale.set(w * 1.25, h * 1.25, 1);
  }

  resetPart(p, randomPhase) {
    const hw = SCENE.cardWidth * 0.42;
    const hh = SCENE.cardWidth * SCENE.cardAspect * 0.42;
    p.x = rand(-hw, hw);
    p.z = rand(-hh, hh);
    p.t = randomPhase ? Math.random() : 0;
    p.speed = rand(0.75, 1.35);
    p.spin = rand(-2.5, 2.5);
    p.size = ACTFX.size * rand(0.6, 1.5);
    p.sway = rand(0.15, 0.5) * ACTFX.size * 6;
    p.swayHz = rand(0.5, 1.4);
    p.mesh.scale.set(p.size, p.size, 1);
  }

  setVisible(v) {
    this.glow.visible = v;
    for (const p of this.parts) p.mesh.visible = v;
  }

  /* Attract-Phase starten (Karte gefunden, Figur noch versteckt). */
  play() {
    this.state = "attract";
    this.clock = 0;
    this.applySizes();
    for (const p of this.parts) this.resetPart(p, true);
    this.setVisible(true);
  }

  /* Tap-Feedback: Blitz + Partikel hochschießen, dann onDone (einmalig). */
  burst(onDone) {
    if (this.state !== "attract") { onDone?.(); return; }
    this.state = "burst";
    this.burstT = 0;
    this.onBurstDone = onDone ?? null;
    for (const p of this.parts) p.speed *= rand(2.2, 3.2);
  }

  stop() {
    this.state = "idle";
    this.glowMat.opacity = 0;
    this.setVisible(false);
  }

  tick(dt) {
    if (this.state === "idle") return;
    this.clock += dt;
    this.glowMat.color.set(ACTFX.glowColor);

    if (this.state === "attract") {
      const pulse = 0.6 + 0.4 * Math.sin((this.clock / Math.max(0.1, ACTFX.pulseSec)) * Math.PI * 2);
      this.glowMat.opacity = ACTFX.glowOpacity * pulse;
    } else { // burst: kurzer Blitz, dann ausfaden
      this.burstT += dt;
      const k = Math.min(1, this.burstT / Math.max(0.1, ACTFX.burstSec));
      this.glowMat.opacity = (1 - k) * Math.min(1, ACTFX.glowOpacity * 2.2);
      if (k >= 1) {
        const cb = this.onBurstDone;
        this.onBurstDone = null;
        this.stop();
        cb?.();
        return;
      }
    }

    const riseH = ACTFX.riseHeight;
    for (const p of this.parts) {
      p.t += (dt / Math.max(0.2, ACTFX.riseSec)) * p.speed;
      if (p.t >= 1) {
        if (this.state === "burst") { p.mesh.material.opacity = 0; continue; }
        this.resetPart(p, false);
      }
      const m = p.mesh;
      m.position.set(
        p.x + Math.sin(this.clock * p.swayHz * Math.PI * 2) * p.sway,
        p.t * riseH,
        p.z
      );
      m.rotation.z = p.spin * p.t * Math.PI;
      // Einblenden → oben ausfaden (sin-Bogen), im Burst zusätzlich dimmen
      const fade = Math.sin(Math.PI * Math.min(1, p.t));
      m.material.opacity = fade * (this.state === "burst" ? Math.max(0, 1 - this.burstT / ACTFX.burstSec) : 1);
    }
  }
}
