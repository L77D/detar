/* =============================================================================
   DETAR — QuestionMenu: Bottom-UI. Onboarding-Instruktion vor dem ersten
   Scan, danach Fragen-Karussell (CSS-Scroll-Snap, Paar-Snapping, Tilt,
   Selected-State). 1:1-Port aus dem Lokal-Prototyp.
   ============================================================================= */
export class QuestionMenu {
  constructor(rootEl, questions, onTap) {
    this.root = rootEl;
    this.questions = questions;
    this.onTap = onTap;
    this.revealed = false;
    this.renderOnboarding();
  }
  static ONBOARDING_LINES = [
    "1. Leg die Karte hin.",
    "2. Schau mit der Kamera drauf.",
    "3. ???",
  ];
  static ATTRACT_LINE = "Tipp auf die Karte!";
  renderOnboarding() {
    this.root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "detar-panel detar-panel--onboarding";
    const intro = document.createElement("div");
    intro.className = "detar-intro";
    intro.innerHTML = QuestionMenu.ONBOARDING_LINES
      .map((line) => `<span class="detar-intro-line">${line}</span>`)
      .join("");
    panel.appendChild(intro);
    this.root.appendChild(panel);
  }
  /* Aktivier-Phase: eine einzelne Instruktionszeile („Tipp auf die Karte!"). */
  showAttract() {
    if (this.revealed) return;
    this.root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "detar-panel detar-panel--onboarding";
    const intro = document.createElement("div");
    intro.className = "detar-intro";
    intro.innerHTML = `<span class="detar-intro-line">${QuestionMenu.ATTRACT_LINE}</span>`;
    panel.appendChild(intro);
    this.root.appendChild(panel);
  }
  revealUI() {
    if (this.revealed) return;
    this.revealed = true;
    this.render();
  }
  /* Onboarding ausblenden OHNE das Menü zu zeigen (Phase zwischen Scan und
     fertig gesprochener Begrüßung — Choreographie 2026-07-06). */
  hideOnboarding() {
    if (this.revealed) return;
    this.root.innerHTML = "";
  }
  render() {
    this.root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "detar-panel detar-panel--reveal";
    const title = document.createElement("div");
    title.className = "detar-title";
    title.textContent = "Wähle eine Frage";
    panel.appendChild(title);
    const menu = document.createElement("div");
    menu.className = "detar-menu";
    for (let i = 0; i < this.questions.length; i += 2) {
      const pair = document.createElement("div");
      pair.className = "detar-q-pair";
      for (const q of this.questions.slice(i, i + 2)) {
        const btn = document.createElement("button");
        btn.className = "detar-q-btn";
        btn.textContent = q.label;
        const sign = Math.random() < 0.5 ? -1 : 1;
        const deg = (1 + Math.random()).toFixed(2);
        btn.style.setProperty("--tilt", `${sign * Number(deg)}deg`);
        btn.onclick = () => this.onQuestionTap(q.id, btn);
        pair.appendChild(btn);
      }
      menu.appendChild(pair);
    }
    panel.appendChild(menu);
    this.root.appendChild(panel);
    menu.scrollLeft = 0;
    // Doppeltes rAF: Browser paintet den Startzustand, DANN animiert er.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => panel.classList.add("detar-panel--reveal-in"))
    );
  }
  onQuestionTap(questionId, btn) {
    this.root.querySelectorAll(".detar-q-btn.selected").forEach((el) => el.classList.remove("selected"));
    btn.classList.add("selected");
    this.onTap(questionId);
  }
  clearSelection() {
    this.root.querySelectorAll(".detar-q-btn.selected").forEach((el) => el.classList.remove("selected"));
  }
  /* Replay-Reset (Dev-Panel): zurück in den Onboarding-Zustand. */
  reset() {
    this.revealed = false;
    this.renderOnboarding();
  }
}
