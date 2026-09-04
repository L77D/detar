/* =============================================================================
   DETAR — CardController: das Gehirn. Choreographie (Stand 2026-09-03):
   Karte gefunden → AKTIVIER-PHASE (gelbe Eck-Marker auf der Karte, „Karte
   gefunden / Tipp sie an!") → Tap auf die Karte → Marker ploppen → Pop-In → Begrüßung (Typewriter)
   → Menü fährt ein → HUB (Themen → Fragen) → Antwort → ggf. Weiter-Schritt
   → ggf. Rückfrage der Figur (nach der 1. und 3. Antwort) → zurück in den Hub
   → Ausstieg „Ich muss weiter" → Fazit-Rückfrage → Verabschiedung → Figur
   klappt in die Karte → RUHEZUSTAND → Tap auf die Karte → Wiedereinstieg
   (beiläufige Zeile, kein zweites Hallo) → Hub im alten Zustand.

   Der Gesprächszustand liegt in DialogEngine (js/dialogEngine.js); hier
   liegen Sprechen (Seiten + Weiter), Posen, Menü-Phasen und die Figur.
   Ablauf und Regeln: Dialogsystem/DETAR_Dialogsystem.md, Abschnitt 6.
   Weiter-Knopf an genau drei Stellen: zwischen zwei Seiten, vor einer
   Rückfrage, vor dem Öffnen eines Links (Nutzergeste für window.open).

   Phasen: waiting → attract → intro → live → resting (Karte ruht) → live …
   ============================================================================= */
import { CHOREO, ACTFX, poseFor } from "./config.js";
import { sound } from "./sound.js";
import { DialogEngine } from "./dialogEngine.js";

export class CardController {
  constructor({ card, nodes, bubble, face, wander, activation, menu, fx }) {
    this.data = card;
    this.engine = new DialogEngine(card);
    this.nodes = nodes;
    this.bubble = bubble;
    this.face = face;
    this.wander = wander;
    this.activation = activation;
    this.menu = menu;
    this.fx = fx ?? null;
    this.einblick = false;     // Kompatibilität (Einblick ist in v1 nicht aktiv)
    this.idleTimer = null;
    this.timer = null;         // automatisches Weiter (setTimeout)
    this.pendingContinue = null;
    this.speaking = false;
    this.lostTimer = null;
    this.phase = "waiting";    // waiting → attract → intro → live → resting
    this.setPose("idle");
  }

  /* Replay (Dev-Panel): kompletter Reset + erneuter „Scan". */
  replay() {
    this.clearTimers();
    this.activation.cancel();
    this.fx?.stop();
    this.bubble.hide();
    this.face.setTalking(false);
    this.engine.reset();
    this.menu.reset();
    this.setPose("idle");
    this.nodes.FigureRoot.position.copy(this.nodes.FIGURE_HOME.pos);
    this.nodes.FigureRoot.scale.copy(this.nodes.FIGURE_HOME.scale);
    this.wander.reset();
    this.phase = "waiting";
    document.body.classList.add("scanning"); // Suchrahmen wieder an (wie nach dem Start)
    window.setTimeout(() => { document.body.classList.remove("scanning"); this.onCardSeen(); }, 600);
  }
  clearTimers() {
    if (this.idleTimer !== null) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.lostTimer !== null) { clearTimeout(this.lostTimer); this.lostTimer = null; }
    this.pendingContinue = null;
  }
  /* Kompatibilität (trackingHint etc.): „schon mal gestartet?" */
  get greeted() { return this.phase !== "waiting"; }

  /* ---- Aktivierung ------------------------------------------------------ */
  /* Erster onTargetFound der Karte. Nur beim ersten Mal (Phase waiting). */
  onCardSeen() {
    if (this.phase !== "waiting" || !this.data) return;
    this.wander.setBusy(true);
    this.activation.prime(); // Figur SOFORT verstecken (kein Aufblitzen)
    if (this.fx && CHOREO.requireTap !== "nein") {
      this.phase = "attract";
      sound.cardFound(); // Ping: „da ist was auf der Karte"
      this.fx.play();          // Eck-Marker auf der Karte
      this.menu.showAttract(); // „Karte gefunden / → Tipp sie an!"
      // Lokal-Prototyp: Icon springt aus dem Panel und landet auf der Karte
      if (ACTFX.hopper === "ja") this.menu.jumpIconOut(() => this.fx.landIcon());
    } else {
      this.phase = "intro";
      this.menu.hideOnboarding();
      sound.popIn();
      this.activation.play(() => this.startGreeting());
    }
  }
  /* Tap auf die Karte (Raycast in main.js): startet die Figur (attract) oder
     holt sie aus dem Ruhezustand zurück (resting). */
  onCardTapped() {
    if (this.phase === "resting") { this.reentry(); return; }
    if (this.phase !== "attract") return;
    this.phase = "intro";
    this.menu.hideOnboarding();
    sound.cardTapped(); // Swoosh in den Burst hinein
    this.fx.burst(() => {
      sound.popIn();
      this.activation.play(() => this.startGreeting());
    });
  }
  startGreeting() {
    this.phase = "live";
    this.wander.setBusy(false);
    const g = this.data.greeting;
    const text = typeof g === "string" ? g : g.text;
    const tag = typeof g === "string" ? CHOREO.greetingPose : g.tag;
    this.say(text, tag, () => {
      sound.uiReveal(); // Chime synchron zur Menü-Einfahrt
      this.menu.revealUI(); // Begrüßung fertig getippt → JETZT fährt das Menü ein
      this.scheduleIdleReturn();
    }, { first: true });
  }

  /* ---- Sprechen ----------------------------------------------------------
     say(): paginiert und blättert mit Weiter durch; Pose aus dem Tag.
     Die Blase bleibt stehen, bis die nächste Zeile kommt oder die Lesezeit
     (idleReturn) abläuft — aber nie, solange ein Weiter-Schritt wartet. */
  say(markup, tag, onDone, opts = {}) {
    this.cancelIdleReturn();
    this.pendingContinue = null;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const pages = this.bubble.paginate(markup);
    const step = (i) => {
      this.menu.clear();
      this.speaking = true;
      this.wander.setAttending(!opts.first);
      this.face.setTalking(true);
      this.setPose(poseFor(tag));
      const label = pages.length > 1 ? (i + 1) + "/" + pages.length : "";
      this.bubble.setText(pages[i], () => {
        this.speaking = false;
        this.face.setTalking(false);
        if (i + 1 < pages.length) this.waitContinue(() => step(i + 1), "Weiter");
        else onDone?.();
      }, label);
    };
    step(0);
  }
  /* Weiterschalten nach dem Text: erzwungen (Knopf) oder automatisch. */
  advance(fn, { force = false, label = "Weiter", delay = CHOREO.continueDelayMs } = {}) {
    if (force) this.waitContinue(fn, label);
    else this.timer = window.setTimeout(() => { this.timer = null; fn(); }, delay);
  }
  /* RPG-Muster: Text bleibt stehen, bis der Nutzer weitertippt (Knopf oder Blase). */
  waitContinue(fn, label) {
    this.pendingContinue = () => { this.pendingContinue = null; fn(); };
    this.menu.showNext(label);
  }
  /* Tap auf die Sprechblase (Raycast in main.js). */
  onBubbleTapped() {
    if (this.speaking) { this.bubble.skip(); return true; }
    if (this.pendingContinue) { this.pendingContinue(); return true; }
    return false;
  }
  /* Weiter-Knopf im Menü. */
  onNext() {
    if (this.pendingContinue) this.pendingContinue();
  }

  /* ---- Hub ---------------------------------------------------------------- */
  renderHub() {
    this.pendingContinue = null;
    this.menu.showHub();
    this.scheduleIdleReturn();
  }
  onTheme(id) {
    if (this.phase !== "live" || this.speaking) return;
    this.engine.enterThema(id);
    this.menu.showThema(id);
  }
  onBack() {
    if (this.phase !== "live" || this.speaking) return;
    this.engine.leaveThema();
    this.menu.showThemen();
  }
  /* Frage aus dem Menü (auch Ausstieg und Link aus der Fußzeile). */
  answerQuestion(q) {
    if (this.phase !== "live" || this.speaking) return;
    if (typeof q === "string") q = this.engine.questionById(q);
    if (!q) return;
    const again = this.engine.markAsked(q);

    if (q.end) {
      const farewell = () => this.say(q.text, q.tag, () => {
        this.timer = window.setTimeout(() => { this.timer = null; this.collapse(); }, CHOREO.collapseDelayMs);
      });
      const fazit = this.engine.askOnExit();
      if (fazit) this.askBack(fazit, farewell); else farewell();
      return;
    }
    const nextAsk = again ? null : this.engine.askAfterAnswers();
    const after = () => {
      if (q.link) { window.open(q.url, "_blank", "noopener"); this.backTo(); return; }
      if (nextAsk) { this.askBack(nextAsk, () => this.backTo()); return; }
      this.backTo();
    };
    this.say(q.text, q.tag, () => this.advance(after, {
      force: !!nextAsk || !!q.link || !!q.wait,
      label: q.link ? "Seite öffnen" : "Weiter",
    }));
  }
  /* Rückkehr nach einer Antwort: im Thema bleiben, bis es leer ist. */
  backTo() {
    this.engine.settleView();
    this.renderHub();
  }
  /* Rückfrage der Figur: Prompt, Auswahl, Reaktion — danach weiter mit `done`. */
  askBack(ask, done) {
    this.engine.beginAsk(ask);
    this.say(ask.prompt, ask.tag, () => {
      this.pendingContinue = null;
      this.menu.showOptions(ask.options);
      this.currentAsk = { ask, done };
    });
  }
  onOption(o) {
    if (!this.currentAsk || this.speaking) return;
    const { done } = this.currentAsk;
    this.currentAsk = null;
    this.engine.applyOption(o);
    this.say(o.reply, o.tag, () => this.advance(done, { force: !!o.wait }));
  }

  /* ---- Ausstieg / Ruhezustand / Wiedereinstieg ---------------------------- */
  /* Figur klappt in die Karte zurück; Tracking läuft weiter, Zustand bleibt. */
  collapse() {
    this.cancelIdleReturn();
    this.phase = "resting";
    this.bubble.hide();
    this.face.setTalking(false);
    this.wander.setAttending(false);
    this.wander.setBusy(true);
    this.setPose("idle");
    this.menu.showIdle();
    this.activation.playOut(() => {
      this.nodes.FigureRoot.position.copy(this.nodes.FIGURE_HOME.pos);
    }, CHOREO.collapseSec);
  }
  /* Erneuter Tap: kein zweites Hallo, sondern eine beiläufige Zeile. */
  reentry() {
    if (this.phase !== "resting") return;
    this.phase = "intro";
    this.menu.clear();
    sound.popIn();
    this.activation.play(() => {
      this.phase = "live";
      this.wander.setBusy(false);
      const r = this.engine.reenter();
      if (!r) { this.renderHub(); return; }
      this.say(r.text, r.tag, () => this.advance(() => this.renderHub(), { force: !!r.wait }));
    });
  }

  /* ---- Tracking verloren --------------------------------------------------- */
  onTrackingLost() {
    if (this.phase === "waiting" || this.phase === "attract") return;
    if (this.lostTimer !== null) return;
    this.lostTimer = window.setTimeout(() => {
      this.lostTimer = null;
      this.menu.setFrozen(true);
    }, CHOREO.trackingLostMs);
  }
  onTrackingFound() {
    if (this.lostTimer !== null) { clearTimeout(this.lostTimer); this.lostTimer = null; }
    this.menu.setFrozen(false);
  }

  /* ---- Posen / Lesezeit ---------------------------------------------------- */
  setPose(pose) {
    this.nodes.BodyIdle.visible = pose === "idle";
    this.nodes.BodyAffirm.visible = pose === "affirm";
    this.nodes.BodyThink.visible = pose === "think";
  }
  /* Lesezeit nach dem Typewriter: Blase weg, Pose zurück auf idle — das Menü
     bleibt. Läuft nur im Hub, nie während ein Weiter-Schritt wartet. */
  scheduleIdleReturn() {
    this.cancelIdleReturn();
    const delay = CHOREO.idleReturnMs ?? this.data.idleReturnMs ?? 3500;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (this.phase !== "live" || this.speaking || this.pendingContinue) return;
      this.setPose("idle");
      this.wander.setBusy(false);
      this.wander.setAttending(false);
      this.face.setTalking(false);
      this.bubble.hide();
      this.menu.clearSelection();
    }, delay);
  }
  cancelIdleReturn() {
    if (this.idleTimer !== null) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  }
}
