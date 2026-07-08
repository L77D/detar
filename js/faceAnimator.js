/* =============================================================================
   DETAR — FaceAnimator: Blinzeln + Mund auf/zu (Nintendo-RPG-Stil).
   1:1-Port aus dem Lokal-Prototyp (Stand 2026-07-06), inkl. holdFace
   (festgehaltener Ausdruck beim Figur-Sprung).
   ============================================================================= */
import { FACE } from "./config.js";

export class FaceAnimator {
  constructor(nodes) {
    this.nodes = nodes;
    this.talking = false;
    this.holdFace = null;
    this.blinkTimer = this.randBlinkInterval();
    this.blinkActive = false;
    this.blinkElapsed = 0;
    this.talkTimer = 0;
    this.talkOpen = false;
    this.showFace("neutral");
  }
  setTalking(value) {
    this.talking = value;
    this.talkTimer = 0;
    if (!value) {
      this.talkOpen = false;
      this.showFace(this.blinkActive ? "blink" : "neutral");
    }
  }
  tick(dt) {
    if (this.holdFace) {
      this.showFace(this.holdFace);
      return;
    }
    if (this.talking) {
      this.talkTimer -= dt * 1000;
      if (this.talkTimer <= 0) {
        this.talkOpen = !this.talkOpen;
        this.talkTimer = FACE.talkFrameMs;
        this.showFace(this.talkOpen ? "talk" : "neutral");
      }
      this.tickBlink(dt, !this.talkOpen);
      return;
    }
    this.tickBlink(dt, true);
  }
  tickBlink(dt, applyVisual) {
    if (this.blinkActive) {
      this.blinkElapsed += dt;
      if (this.blinkElapsed >= FACE.blinkDuration) {
        this.blinkActive = false;
        this.blinkElapsed = 0;
        this.blinkTimer = this.randBlinkInterval();
        if (applyVisual) this.showFace("neutral");
      } else if (applyVisual) this.showFace("blink");
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkActive = true;
        this.blinkElapsed = 0;
        if (applyVisual) this.showFace("blink");
      }
    }
  }
  showFace(state) {
    this.nodes.FaceNeutral.visible = state === "neutral";
    this.nodes.FaceBlink.visible = state === "blink";
    this.nodes.FaceTalk.visible = state === "talk";
  }
  randBlinkInterval() {
    return FACE.blinkIntervalMin + Math.random() * (FACE.blinkIntervalMax - FACE.blinkIntervalMin);
  }
}
