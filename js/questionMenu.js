/* =============================================================================
   DETAR — QuestionMenu: Bottom-UI. Onboarding-Instruktion vor dem ersten
   Scan, danach ZWEISTUFIGES Menü (2026-07-13): Tabs [Einblick] [Fragen
   stellen] an der Stelle der alten Titelzeile; darunter je nach Tab das
   Fragen-Karussell (CSS-Scroll-Snap, Tilt, Selected-State) oder die
   Einblick-Steuerung (◀ Zähler ▶ für die Portal-Galerie).
   ============================================================================= */
export class QuestionMenu {
  /* hooks: { onTab(tab), onNav(dir) → neuer Index, galleryCount } */
  constructor(rootEl, questions, onTap, hooks = {}) {
    this.root = rootEl;
    this.questions = questions;
    this.onTap = onTap;
    this.onTab = hooks.onTab ?? null;
    this.onNav = hooks.onNav ?? null;
    this.galleryCount = hooks.galleryCount ?? 0;
    this.galleryIndex = 0;
    this.activeTab = "fragen"; // "einblick" | "fragen"
    this.revealed = false;
    this.renderOnboarding();
  }
  static ONBOARDING_LINES = [
    "1. Leg die Karte hin.",
    "2. Schau mit der Kamera drauf.",
    "3. ???",
  ];
  static ATTRACT_LINE = "Tipp auf die Karte!";
  static TAB_LABELS = { einblick: "Einblick", fragen: "Fragen stellen" };
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

    // Tab-Zeile [Einblick] [Fragen stellen] — Stufe über den Modulen.
    // Kein Einblick-Tab, wenn die Karte keine Galerie hat.
    const tabs = document.createElement("div");
    tabs.className = "detar-tabs";
    this.tabEls = {};
    const order = this.galleryCount > 0 ? ["einblick", "fragen"] : ["fragen"];
    for (const tab of order) {
      const btn = document.createElement("button");
      btn.className = "detar-tab" + (tab === this.activeTab ? " active" : "");
      btn.textContent = QuestionMenu.TAB_LABELS[tab];
      btn.onclick = () => this.setTab(tab);
      this.tabEls[tab] = btn;
      tabs.appendChild(btn);
    }
    panel.appendChild(tabs);

    this.content = document.createElement("div");
    this.content.className = "detar-tab-content";
    panel.appendChild(this.content);
    this.renderContent();

    this.root.appendChild(panel);
    // Doppeltes rAF: Browser paintet den Startzustand, DANN animiert er.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => panel.classList.add("detar-panel--reveal-in"))
    );
  }
  setTab(tab) {
    if (tab === this.activeTab || !this.revealed) return;
    this.activeTab = tab;
    for (const [name, el] of Object.entries(this.tabEls))
      el.classList.toggle("active", name === tab);
    this.renderContent();
    this.onTab?.(tab);
  }
  renderContent() {
    this.content.innerHTML = "";
    if (this.activeTab === "fragen") this.renderQuestions(this.content);
    else this.renderEinblick(this.content);
  }
  renderQuestions(parent) {
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
    parent.appendChild(menu);
    menu.scrollLeft = 0;
  }
  /* Einblick: Galerie-Steuerung ◀ 1/3 ▶ (zyklisch). */
  renderEinblick(parent) {
    const row = document.createElement("div");
    row.className = "detar-einblick";
    const mkArrow = (dir, glyph, label) => {
      const btn = document.createElement("button");
      btn.className = "detar-arrow";
      btn.textContent = glyph;
      btn.setAttribute("aria-label", label);
      btn.onclick = () => this.galleryNav(dir);
      return btn;
    };
    this.galleryNum = document.createElement("div");
    this.galleryNum.className = "detar-gallery-num";
    this.updateGalleryNum();
    row.appendChild(mkArrow(-1, "◀", "Vorheriges Bild"));
    row.appendChild(this.galleryNum);
    row.appendChild(mkArrow(1, "▶", "Nächstes Bild"));
    parent.appendChild(row);
  }
  galleryNav(dir) {
    const idx = this.onNav?.(dir);
    if (typeof idx === "number") this.galleryIndex = idx;
    this.updateGalleryNum();
  }
  /* Sync von außen (Tap auf einen Portal-Tab in der 3D-Szene). */
  setGalleryIndex(idx) {
    this.galleryIndex = idx;
    this.updateGalleryNum();
  }
  updateGalleryNum() {
    if (this.galleryNum)
      this.galleryNum.textContent = `${this.galleryIndex + 1} / ${this.galleryCount}`;
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
    this.activeTab = "fragen";
    this.galleryIndex = 0;
    this.renderOnboarding();
  }
}
