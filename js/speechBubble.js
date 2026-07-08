/* =============================================================================
   DETAR — SpeechBubble: Canvas-Textur mit Stroke-Outline, Typewriter,
   Billboard. Port aus dem Lokal-Prototyp (Stand 2026-07-06) mit allen
   Änderungen: Text UNTEN verankert + horizontal zentriert, Billboard
   rechnet Roll/Pitch der Figur komplett raus (Welt-Ausrichtung exakt).

   KOORDINATEN-ANPASSUNG (MindAR): Im Zapworks/Prototyp-Setup war die Karte
   der Welt-Ursprung (Y = hoch). Unter MindAR bewegt sich der Karten-Anchor
   im Kamera-Raum — "aufrecht" und "Yaw" sind deshalb im KARTEN-Frame
   (frame.worldRoot) definiert, nicht in Weltkoordinaten. Alle Kamera-Posen
   werden über frame.getCamLocal() in diesen Frame transformiert.
   ============================================================================= */
import * as THREE from "three";
import { TYPO, CHOREO, frameLerp60 } from "./config.js";

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _euler = new THREE.Euler();

export class SpeechBubble {
  constructor(nodes, frame) {
    this.nodes = nodes;
    this.frame = frame;
    this.canvas = null; this.ctx = null; this.texture = null; this.plane = null;
    this.bubbleYaw = 0; this.bubbleYawInit = false;
    this.fullText = ""; this.wrappedLines = [];
    this.revealedChars = 0; this.lastTickMs = 0; this.typing = false; this.onDone = null;
    this.element = nodes.BubbleRoot;
    this.element.visible = false;
    this.initCanvas();
  }
  initCanvas() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    const maxPx = Math.round(TYPO.maxWidth / TYPO.unitsPerPx);
    const maxH = Math.round(
      (TYPO.fontSize * TYPO.lineSpacing * TYPO.maxLines + (TYPO.paddingPx + TYPO.strokeWidth) * 2) * 1.2
    );
    this.canvas.width = maxPx;
    this.canvas.height = maxH;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.premultiplyAlpha = false;
    const w = this.canvas.width * TYPO.unitsPerPx;
    const h = this.canvas.height * TYPO.unitsPerPx;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, depthTest: false, side: THREE.DoubleSide,
    });
    this.plane = new THREE.Mesh(geo, mat);
    this.planeH = h;
    this.plane.position.x = TYPO.offsetX;
    this.plane.position.y = h / 2 + TYPO.offsetY;
    this.plane.renderOrder = 3;
    this.element.add(this.plane);
  }
  /* Nach Font-Load oder Tuning-Änderung neu aufbauen (measureText braucht den echten Font). */
  rebuild() {
    const wasVisible = this.element.visible;
    if (this.plane) {
      this.element.remove(this.plane);
      this.plane.geometry.dispose();
      this.plane.material.dispose();
      this.texture.dispose();
    }
    this.initCanvas();
    if (wasVisible && this.fullText) {
      this.wrappedLines = this.wrapText(this.fullText.replace(/\n/g, " "));
      this.fullText = this.wrappedLines.join("\n");
      this.revealedChars = this.fullText.length;
      this.renderCanvas(this.fullText);
      this.element.visible = true;
    }
  }
  setText(text, onDone) {
    this.onDone = onDone ?? null;
    if (!text || text.length === 0) {
      this.element.visible = false;
      this.typing = false;
      this.fireDone();
      return;
    }
    this.wrappedLines = this.wrapText(text);
    this.fullText = this.wrappedLines.join("\n");
    this.revealedChars = 0;
    this.lastTickMs = performance.now();
    this.typing = true;
    this.renderCanvas("");
    this.element.visible = true;
  }
  isTyping() { return this.typing; }
  hide() { this.typing = false; this.element.visible = false; }
  fireDone() { const cb = this.onDone; this.onDone = null; cb?.(); }
  renderCanvas(visibleText) {
    const ctx = this.ctx, canvas = this.canvas;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lineH = TYPO.fontSize * TYPO.lineSpacing;
    const pad = TYPO.paddingPx + TYPO.strokeWidth;
    ctx.font = `${TYPO.fontWeight} ${TYPO.fontSize}px ${TYPO.fontFamily}`;
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // UNTEN VERANKERT: letzte Zeile immer auf derselben Höhe (über die
    // GESAMT-Zeilenzahl verankert, damit beim Typewriter nichts springt).
    const yTop = canvas.height - pad - this.wrappedLines.length * lineH;
    // HORIZONTAL ZENTRIERT über die finale Breite (breiteste Zeile des
    // fertig gewrappten Texts); Zeilen im Block bleiben linksbündig.
    let blockW = 0;
    for (const l of this.wrappedLines) blockW = Math.max(blockW, ctx.measureText(l).width);
    const xLeft = (canvas.width - blockW) / 2;
    const visLines = [];
    let charsLeft = visibleText.length;
    for (let i = 0; i < this.wrappedLines.length; i++) {
      if (charsLeft <= 0) break;
      const lineText = this.wrappedLines[i].slice(0, charsLeft);
      charsLeft -= this.wrappedLines[i].length + 1;
      visLines.push({ text: lineText, x: xLeft, y: yTop + i * lineH });
    }
    // Zwei Durchgänge: erst alle Strokes, dann alle Fills (Overlap-Fix)
    ctx.lineWidth = TYPO.strokeWidth * 2;
    ctx.strokeStyle = TYPO.strokeColor;
    for (const l of visLines) ctx.strokeText(l.text, l.x, l.y);
    ctx.fillStyle = TYPO.textColor;
    for (const l of visLines) ctx.fillText(l.text, l.x, l.y);
    if (this.texture) this.texture.needsUpdate = true;
  }
  wrapText(text) {
    const ctx = this.ctx;
    if (!ctx) return [text];
    ctx.font = `${TYPO.fontWeight} ${TYPO.fontSize}px ${TYPO.fontFamily}`;
    const maxPxWidth = this.canvas.width - (TYPO.paddingPx + TYPO.strokeWidth) * 2;
    const words = text.trim().split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
      if (lines.length >= TYPO.maxLines) break;
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (ctx.measureText(candidate).width <= maxPxWidth) current = candidate;
      else {
        if (current.length > 0) lines.push(current);
        current = word;
      }
    }
    if (lines.length < TYPO.maxLines && current.length > 0) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }
  tickTypewriter() {
    if (!this.typing) return;
    if (TYPO.msPerChar <= 0) {
      this.renderCanvas(this.fullText);
      this.typing = false;
      this.fireDone();
      return;
    }
    const now = performance.now();
    const elapsed = now - this.lastTickMs;
    if (elapsed < TYPO.msPerChar) return;
    const steps = Math.floor(elapsed / TYPO.msPerChar);
    this.lastTickMs = now;
    this.revealedChars = Math.min(this.fullText.length, this.revealedChars + steps);
    this.renderCanvas(this.fullText.slice(0, this.revealedChars));
    if (this.revealedChars >= this.fullText.length) {
      this.typing = false;
      this.fireDone();
    }
  }
  faceCamera(dt) {
    const obj = this.element;
    // Kamera + Bubble in den KARTEN-Frame transformieren (MindAR-Anpassung)
    const camL = this.frame.getCamLocal(_v1);
    obj.getWorldPosition(_v2);
    const objL = this.frame.toLocal(_v2);
    const worldYaw = Math.atan2(camL.x - objL.x, camL.z - objL.z);
    if (!this.bubbleYawInit) {
      this.bubbleYaw = worldYaw;
      this.bubbleYawInit = true;
    } else {
      const delta = this.normalizeAngle(worldYaw - this.bubbleYaw);
      this.bubbleYaw += delta * frameLerp60(CHOREO.billboardLerp, dt);
    }
    // Gewünschte Ausrichtung: aufrecht IM KARTEN-Frame + geglätteter Yaw.
    // In Welt-Quaternion umrechnen (worldRootQuat × qYaw), dann in die lokale
    // Quaternion der Bubble (parentWorld⁻¹ × gewünscht) — Roll/Pitch der
    // Figur sind damit exakt rausgerechnet, Position bleibt geteilt.
    _q1.setFromEuler(_euler.set(0, this.bubbleYaw, 0));
    this.frame.worldRoot.getWorldQuaternion(_q3).multiply(_q1);
    obj.parent.getWorldQuaternion(_q2).invert();
    obj.quaternion.copy(_q2.multiply(_q3));
  }
  normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  tick(dt) {
    if (this.plane) {
      this.plane.position.x = TYPO.offsetX;
      this.plane.position.y = this.planeH / 2 + TYPO.offsetY;
    }
    this.faceCamera(dt);
    this.tickTypewriter();
  }
}
