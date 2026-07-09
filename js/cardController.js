/* =============================================================================
   DETAR — CardController: das Gehirn. Choreographie (Stand 2026-07-09):
   Karte gefunden → AKTIVIER-PHASE (Karten-Glow + Partikel, „Tipp auf die
   Karte!") → Tap auf die Karte → Burst → Pop-In → Begrüßung (Typewriter) →
   UI-Reveal erst im onDone der Begrüßungs-Bubble → Fragen → Antwort-Beat
   ("attending") → Idle.  CHOREO.requireTap = "nein" überspringt die
   Aktivier-Phase (Figur kommt direkt beim Scan, altes Verhalten).

   Phasen: waiting → attract → intro → live
   ============================================================================= */
import { CHOREO } from "./config.js";

export class CardController {
  /* Replay (Dev-Panel): kompletter Reset + erneuter „Scan". */
  replay() {
    if (this.idleTimer !== null) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    this.activation.cancel();
    this.fx?.stop();
    this.bubble.hide();
    this.face.setTalking(false);
    this.menu.reset();
    this.setPose("idle");
    this.nodes.FigureRoot.position.copy(this.nodes.FIGURE_HOME.pos);
    this.nodes.FigureRoot.scale.copy(this.nodes.FIGURE_HOME.scale);
    this.wander.reset();
    this.phase = "waiting";
    window.setTimeout(() => this.onCardSeen(), 600);
  }

  constructor({ card, nodes, bubble, face, wander, activation, menu, fx }) {
    this.data = card;
    this.nodes = nodes;
    this.bubble = bubble;
    this.face = face;
    this.wander = wander;
    this.activation = activation;
    this.menu = menu;
    this.fx = fx ?? null;
    this.idleTimer = null;
    this.phase = "waiting"; // waiting → attract → intro → live
    this.setPose("idle");
  }
  /* Kompatibilität (trackingHint etc.): „schon mal gestartet?" */
  get greeted() { return this.phase !== "waiting"; }

  /* Erster onTargetFound der Karte. Nur beim ersten Mal (Phase waiting). */
  onCardSeen() {
    if (this.phase !== "waiting" || !this.data) return;
    this.wander.setBusy(true);
    this.activation.prime(); // Figur SOFORT verstecken (kein Aufblitzen)
    if (this.fx && CHOREO.requireTap !== "nein") {
      this.phase = "attract";
      this.fx.play();
      this.menu.showAttract(); // „Tipp auf die Karte!"
    } else {
      this.phase = "intro";
      this.menu.hideOnboarding();
      this.activation.play(() => this.startGreeting());
    }
  }
  /* Tap auf die Karte während der Aktivier-Phase (Raycast in main.js). */
  onCardTapped() {
    if (this.phase !== "attract") return;
    this.phase = "intro";
    this.menu.hideOnboarding();
    // Burst-Blitz zu Ende → dann Pop-In der Figur
    this.fx.burst(() => this.activation.play(() => this.startGreeting()));
  }
  startGreeting() {
    this.phase = "live";
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
    if (this.phase !== "live") return;
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
    // CHOREO gewinnt (Dev-Panel/tuning.json regelbar), Karte ist Fallback.
    const delay = CHOREO.idleReturnMs ?? this.data.idleReturnMs ?? 3500;
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
