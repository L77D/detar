/* =============================================================================
   DETAR — QuestionMenu: Bottom-UI des Dialogsystems (Stand 2026-09-03).

   Onboarding-Instruktion vor dem ersten Scan, danach je Phase ein Aufbau:
     themen   Titel „Wähle ein Thema" + Karussell mit Themenkarten
              (Zähler „2 Fragen offen", Marke „neu") + Fußzeile
     thema    Kopfzeile [←] THEMA (NEU-Punkt am Pfeil, wenn anderswo etwas
              wartet) + Karussell mit den Fragen (Marken neu/nochmal/link)
              + Fußzeile
     options  Titel „Deine Antwort" + Karussell mit den Antwortoptionen
     next     nur der Weiter-Knopf (zwischen zwei Seiten, vor einer
              Rückfrage, vor dem Öffnen eines Links)
     idle     Titel „Karte im Ruhezustand" + Hinweis „auf die Karte tippen"
     leer     während die Figur spricht (Titel weg, Blase hat die Aufmerksamkeit)
   Die Fußzeile (Ausstieg + Link) steht auf BEIDEN Menü-Ebenen, damit sie nie
   zwei Taps entfernt ist. Das Karussell ist das bestehende Scroll-Snap-Paar-
   Layout (Tilt, Selected-State); Styling ist Struktur im alten Look — das
   neue Design folgt als eigener Schritt.
   ============================================================================= */
import { sound } from "./sound.js";

export class QuestionMenu {
  /* hooks: { onQuestion(q), onTheme(id), onBack(), onOption(o), onNext(), onReentry() } */
  constructor(rootEl, engine, hooks = {}) {
    this.root = rootEl;
    this.engine = engine;
    this.hooks = hooks;
    this.revealed = false;
    this.phase = "onboarding";
    this.frozen = false;
    this.renderOnboarding();
  }
  static ONBOARDING_LINES = [
    "1. Leg die Karte hin.",
    "2. Schau mit der Kamera drauf.",
    "3. ???",
  ];
  static ATTRACT_LINE = "Tipp auf die Karte!";
  static TITLES = {
    themen: "Wähle ein Thema",
    options: "Deine Antwort",
    idle: "Karte im Ruhezustand",
  };

  /* ---- Grundgerüst ------------------------------------------------------ */
  panel(extraClass = "") {
    this.root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "detar-panel " + extraClass;
    if (this.frozen) panel.classList.add("detar-panel--frozen");
    this.root.appendChild(panel);
    return panel;
  }
  introPanel(lines) {
    const panel = this.panel("detar-panel--onboarding");
    const intro = document.createElement("div");
    intro.className = "detar-intro";
    intro.innerHTML = lines.map((l) => `<span class="detar-intro-line">${l}</span>`).join("");
    panel.appendChild(intro);
  }
  renderOnboarding() {
    this.phase = "onboarding";
    this.introPanel(QuestionMenu.ONBOARDING_LINES);
  }
  /* Aktivier-Phase: eine einzelne Instruktionszeile („Tipp auf die Karte!"). */
  showAttract() {
    if (this.revealed) return;
    this.phase = "attract";
    this.introPanel([QuestionMenu.ATTRACT_LINE]);
  }
  /* Onboarding ausblenden OHNE das Menü zu zeigen (Phase zwischen Scan und
     fertig gesprochener Begrüßung — Choreographie 2026-07-06). */
  hideOnboarding() {
    if (this.revealed) return;
    this.root.innerHTML = "";
  }
  /* Erstes Einfahren nach der Begrüßung (Reveal-Animation), danach normal. */
  revealUI() {
    if (this.revealed) return;
    this.revealed = true;
    this.showHub(true);
  }
  /* Leer: während die Figur spricht. Titelzeile weg. */
  clear() {
    this.phase = "speaking";
    this.root.innerHTML = "";
  }
  /* Tracking verloren: Menü bleibt stehen, reagiert aber nicht. */
  setFrozen(value) {
    this.frozen = value;
    this.root.querySelector(".detar-panel")?.classList.toggle("detar-panel--frozen", value);
  }

  /* ---- Bausteine -------------------------------------------------------- */
  title(panel, text) {
    const t = document.createElement("div");
    t.className = "detar-title";
    t.textContent = text;
    panel.appendChild(t);
    return t;
  }
  badge(kind) {
    const b = document.createElement("span");
    b.className = "detar-badge detar-badge--" + kind;
    b.textContent = kind;
    return b;
  }
  /* Karussell aus Paaren (Snap-Ziel = Paar, wie bisher). */
  carousel(panel, items, build) {
    const menu = document.createElement("div");
    menu.className = "detar-menu";
    for (let i = 0; i < items.length; i += 2) {
      const pair = document.createElement("div");
      pair.className = "detar-q-pair";
      for (const it of items.slice(i, i + 2)) pair.appendChild(build(it));
      menu.appendChild(pair);
    }
    panel.appendChild(menu);
    menu.scrollLeft = 0;
    return menu;
  }
  button(label, cls, onTap, badges = []) {
    const btn = document.createElement("button");
    btn.className = "detar-q-btn " + cls;
    const sign = Math.random() < 0.5 ? -1 : 1;
    btn.style.setProperty("--tilt", `${sign * (1 + Math.random()).toFixed(2)}deg`);
    const label_ = document.createElement("span");
    label_.className = "detar-q-label";
    label_.textContent = label;
    btn.appendChild(label_);
    if (badges.length) {
      const row = document.createElement("span");
      row.className = "detar-badges";
      badges.forEach((k) => row.appendChild(this.badge(k)));
      btn.appendChild(row);
    }
    btn.onclick = () => {
      if (this.frozen) return;
      sound.questionTap();
      this.root.querySelectorAll(".detar-q-btn.selected").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
      onTap();
    };
    return btn;
  }
  /* Dauerhafte Fußzeile: Ausstieg + Link — ruhig gesetzt, auf beiden Ebenen. */
  footer(panel) {
    const perma = this.engine.permaQuestions();
    if (!perma.length) return;
    const row = document.createElement("div");
    row.className = "detar-footer";
    for (const q of perma) {
      const b = document.createElement("button");
      b.className = "detar-footer-btn " + (q.link ? "detar-footer-btn--link" : "detar-footer-btn--end");
      b.textContent = q.label + (q.link ? " ↗" : "");
      b.onclick = () => { if (this.frozen) return; sound.questionTap(); this.hooks.onQuestion?.(q); };
      row.appendChild(b);
    }
    panel.appendChild(row);
  }

  /* ---- Phasen ----------------------------------------------------------- */
  /* Hub: Themenebene oder ein Thema — je nach engine.view. */
  showHub(reveal = false) {
    if (this.engine.view.mode === "thema") this.showThema(this.engine.view.thema, reveal);
    else this.showThemen(reveal);
  }
  showThemen(reveal = false) {
    this.phase = "themen";
    const panel = this.panel(reveal ? "detar-panel--reveal" : "");
    this.title(panel, QuestionMenu.TITLES.themen);
    this.carousel(panel, this.engine.themes(), (t) => {
      const btn = this.button(t.label, "detar-q-btn--theme" + (t.done ? " detar-q-btn--done" : ""),
        () => this.hooks.onTheme?.(t.id), t.fresh ? ["neu"] : []);
      const meta = document.createElement("span");
      meta.className = "detar-q-meta";
      meta.textContent = t.open ? (t.open === 1 ? "1 Frage offen" : t.open + " Fragen offen") : "alle gefragt";
      btn.appendChild(meta);
      return btn;
    });
    this.footer(panel);
    if (reveal) this.animateReveal(panel);
  }
  showThema(themaId, reveal = false) {
    this.phase = "thema";
    const t = (this.engine.card.themen ?? []).find((x) => x.id === themaId);
    const panel = this.panel(reveal ? "detar-panel--reveal" : "");
    // Kopfzeile [←] THEMA — an der Stelle der Titelzeile
    const bar = document.createElement("div");
    bar.className = "detar-themebar";
    const back = document.createElement("button");
    back.className = "detar-back" + (this.engine.freshElsewhere(themaId) ? " detar-back--new" : "");
    back.textContent = "←";
    back.setAttribute("aria-label", "Zurück zu den Themen");
    back.onclick = () => { if (this.frozen) return; sound.uiTap(); this.hooks.onBack?.(); };
    const name = document.createElement("div");
    name.className = "detar-title detar-title--inline";
    name.textContent = t?.label ?? "";
    bar.appendChild(back); bar.appendChild(name);
    panel.appendChild(bar);

    this.carousel(panel, this.engine.sortedQuestionsOf(themaId), (q) =>
      this.button(q.label, this.engine.asked.has(q.id) ? "detar-q-btn--asked" : "",
        () => this.hooks.onQuestion?.(q), this.engine.badgesFor(q)));
    this.footer(panel);
    if (reveal) this.animateReveal(panel);
  }
  /* Rückfrage der Figur: Antwortoptionen. */
  showOptions(options) {
    this.phase = "options";
    const panel = this.panel();
    this.title(panel, QuestionMenu.TITLES.options);
    this.carousel(panel, options, (o) =>
      this.button(o.label, "detar-q-btn--option", () => this.hooks.onOption?.(o)));
  }
  /* Weiter-Schritt: genau ein Knopf. Der Handler läuft synchron im Tap —
     wichtig für „Seite öffnen" (window.open braucht die Nutzergeste). */
  showNext(label = "Weiter") {
    this.phase = "next";
    const panel = this.panel();
    const wrap = document.createElement("div");
    wrap.className = "detar-next-row";
    const btn = document.createElement("button");
    btn.className = "detar-q-btn detar-q-btn--next";
    btn.textContent = label + " ▸";
    btn.onclick = () => { if (this.frozen) return; sound.uiTap(); this.hooks.onNext?.(); };
    wrap.appendChild(btn);
    panel.appendChild(wrap);
  }
  /* Ruhezustand nach der Verabschiedung: Figur ist eingeklappt. */
  showIdle() {
    this.phase = "idle";
    const panel = this.panel();
    this.title(panel, QuestionMenu.TITLES.idle);
    const intro = document.createElement("div");
    intro.className = "detar-intro detar-intro--idle";
    intro.innerHTML = `<span class="detar-intro-line detar-intro-line--pulse">Tipp auf die Karte</span>`;
    intro.onclick = () => { if (this.frozen) return; this.hooks.onReentry?.(); };
    panel.appendChild(intro);
  }
  animateReveal(panel) {
    // Doppeltes rAF: Browser paintet den Startzustand, DANN animiert er.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => panel.classList.add("detar-panel--reveal-in"))
    );
  }
  clearSelection() {
    this.root.querySelectorAll(".detar-q-btn.selected").forEach((el) => el.classList.remove("selected"));
  }
  /* Replay-Reset (Dev-Panel): zurück in den Onboarding-Zustand. */
  reset() {
    this.revealed = false;
    this.frozen = false;
    this.renderOnboarding();
  }
}
