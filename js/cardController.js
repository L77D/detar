/* =============================================================================
   DETAR — CardController: das Gehirn. Choreographie (Stand 2026-07-06):
   Karte gefunden → Onboarding weg → Pop-In → Begrüßung (Typewriter) →
   UI-Reveal erst im onDone der Begrüßungs-Bubble → Fragen → Antwort-Beat
   ("attending": Figur bleibt stehen, wendet sich der Kamera zu) → Idle.
   ============================================================================= */
import { CHOREO } from "./config.js";

export class CardController {
  constructor({ card, nodes, bubble, face, wander, activation, menu }) {
    this.data = card;
    this.nodes = nodes;
    this.bubble = bubble;
    this.face = face;
    this.wander = wander;
    this.activation = activation;
    this.menu = menu;
    this.idleTimer = null;
    this.greeted = false;
    this.setPose("idle");
  }
  /* Erster onTargetFound der Karte. Nur beim ersten Mal (greeted-Flag). */
  onCardSeen() {
    if (this.greeted || !this.data) return;
    this.greeted = true;
    this.wander.setBusy(true);
    this.activation.prime();
    this.menu.hideOnboarding();
    this.activation.play(() => this.startGreeting());
  }
  startGreeting() {
    this.wander.setBusy(false);
    this.face.setTalking(true);
    this.setPose(CHOREO.greetingPose);
    this.bubble.setText(this.data.greeting, () => {
      this.face.setTalking(false);
      this.menu.revealUI(); // Begrüßung fertig getippt → JETZT fährt das Menü ein
      this.scheduleIdleReturn();
    });
  }
  answerQuestion(questionId) {
    if (!this.greeted) return;
    const q = this.data.questions.find((x) => x.id === questionId);
    if (!q) return;
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.wander.setAttending(true);
    this.face.setTalking(true);
    this.bubble.setText(q.answer, () => {
      this.face.setTalking(false);
      this.scheduleIdleReturn();
    });
    this.setPose(q.pose);
  }
  setPose(pose) {
    this.nodes.BodyIdle.visible = pose === "idle";
    this.nodes.BodyAffirm.visible = pose === "affirm";
    this.nodes.BodyThink.visible = pose === "think";
  }
  /* Startet erst, wenn der Typewriter fertig ist (onDone) — idleReturnMs ist
     damit reine Lesezeit, unabhängig von der Textlänge. */
  scheduleIdleReturn() {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    const delay = this.data.idleReturnMs ?? CHOREO.idleReturnMs ?? 3500;
    this.idleTimer = window.setTimeout(() => {
      this.setPose("idle");
      this.wander.setBusy(false);
      this.wander.setAttending(false);
      this.face.setTalking(false);
      this.bubble.hide();
      this.menu.clearSelection();
      this.idleTimer = null;
    }, delay);
  }
}
