/* =============================================================================
   DETAR — QuestionMenu: Bottom-UI des Dialogsystems.
   UI-UPDATE 2026-09-03 nach Figma (mock_01–05, Komponenten support/frage/
   Auswahl). Struktur und Zustände wie Build 17, Optik neu:

     support   Handy-Icon + Balken: Suche „Halte auf die Karte" (Icon sucht),
               Karte gefunden „Karte gefunden / → Tipp sie an!", Ruhezustand
               „Tipp auf die Karte"
     themen    Kopfzeile „Was interessiert dich?" + festes 2×2-Raster: drei
               Themenkacheln (Reiter THEMA, NEU wenn dort etwas wartet) und
               „Ich muss weiter" als vierte Kachel
     thema     Kopfzeile [←] Thema + Seitenpunkte; Karussell mit 2×2 Kacheln
               je Seite (Scroll-Snap, nächste Seite lugt rechts an); Reiter
               NEU / LINK / ✅ (schon gefragt); „Ich muss weiter" als letzte
               Kachel jedes Themas
     options   Kopfzeile „Deine Antwort" + Raster mit den Antwortoptionen
     next      genau eine Kachel „Weiter" / „Seite öffnen"
     leer      während die Figur spricht
   Entscheidungen 2026-09-03 (Michael): keine Fußzeile, kein Link-Eintrag,
   Menü bei Tracking-Verlust eingefroren (nicht bedienbar, nicht gedimmt).
   ============================================================================= */
import { sound } from "./sound.js";
import { buildSupport } from "./supportUI.js";

export class QuestionMenu {
  /* hooks: { onQuestion(q), onTheme(id), onBack(), onOption(o), onNext(), onReentry() } */
  constructor(rootEl, engine, hooks = {}) {
    this.root = rootEl;
    this.engine = engine;
    this.hooks = hooks;
    this.revealed = false;
    this.phase = "onboarding";
    this.frozen = false;
    this.support = null;   // aktive Support-Zeile (Icon-Timer stoppen beim Wechsel)
    this.renderOnboarding();
  }
  static TITLES = {
    themen: "Was interessiert dich?",
    options: "Deine Antwort",
  };
  static LINES = {
    suchen:   [{ text: "Halte auf die Karte" }],
    gefunden: [{ text: "Karte gefunden", kind: "gelb" }, { text: "→ Tipp sie an!", einzug: true }],
    ruhe:     [{ text: "Tipp auf die Karte", pulse: true }],
  };

  /* ---- Grundgerüst ------------------------------------------------------ */
  panel(extraClass = "") {
    this.support?.icon.destroy();
    this.support = null;
    this.root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "detar-panel d-dots " + extraClass;
    if (this.frozen) panel.classList.add("detar-panel--frozen");
    this.root.appendChild(panel);
    return panel;
  }
  supportPanel(mode, lines) {
    const panel = this.panel("detar-panel--support");
    this.support = buildSupport(mode, lines);
    panel.appendChild(this.support);
    return this.support;
  }
  renderOnboarding() {
    this.phase = "onboarding";
    this.supportPanel("suchen", QuestionMenu.LINES.suchen);
  }
  /* Aktivier-Phase: Karte gefunden, Tap startet die Figur. */
  showAttract() {
    if (this.revealed) return;
    this.phase = "attract";
    this.supportPanel("gefunden", QuestionMenu.LINES.gefunden);
  }
  /* Support ausblenden OHNE das Menü zu zeigen (zwischen Tap und fertig
     gesprochener Begrüßung). */
  hideOnboarding() {
    if (this.revealed) return;
    this.clear();
  }
  /* Erstes Einfahren nach der Begrüßung (Reveal-Animation), danach normal. */
  revealUI() {
    if (this.revealed) return;
    this.revealed = true;
    this.showHub(true);
  }
  /* Leer: während die Figur spricht. */
  clear() {
    this.phase = "speaking";
    this.support?.icon.destroy();
    this.support = null;
    this.root.innerHTML = "";
  }
  /* Tracking verloren: Menü bleibt stehen, reagiert aber nicht. */
  setFrozen(value) {
    this.frozen = value;
    this.root.querySelector(".detar-panel")?.classList.toggle("detar-panel--frozen", value);
  }

  /* ---- Bausteine -------------------------------------------------------- */
  /* Kopfzeile: [←] Titel ······ Seitenpunkte */
  head(panel, { title, back = null, backNew = false, dots = 0 }) {
    const h = document.createElement("div");
    h.className = "detar-head" + (back ? " detar-head--thema" : "");
    if (back) {
      const b = document.createElement("button");
      b.className = "detar-back" + (backNew ? " detar-back--new" : "");
      b.setAttribute("aria-label", "Zurück zu den Themen");
      b.innerHTML = `<img class="px-back" src="./assets/ui/pfeil-links.svg" alt="" />`;
      b.onclick = () => { if (this.frozen) return; sound.uiTap(); back(); };
      h.appendChild(b);
    }
    const t = document.createElement("div");
    t.className = "detar-title";
    t.textContent = title;
    h.appendChild(t);
    let dotEls = [];
    if (dots > 1) {
      const d = document.createElement("div");
      d.className = "detar-dots";
      for (let i = 0; i < dots; i++) {
        const s = document.createElement("span");
        s.className = "detar-dot" + (i === 0 ? " active" : "");
        d.appendChild(s);
        dotEls.push(s);
      }
      h.appendChild(d);
    }
    panel.appendChild(h);
    return dotEls;
  }
  /* Reiter über der Kachel: {kind: "thema"|"neu"|"link"|"check"|"neutral", text} */
  reiter(items) {
    const row = document.createElement("span");
    row.className = "detar-reiter";
    for (const it of items) {
      const s = document.createElement("span");
      if (it.kind === "check") { s.className = "detar-reiter--check"; s.textContent = "✅"; }
      else { s.className = "px-reiter px-reiter--" + it.kind; s.textContent = it.text; }
      row.appendChild(s);
    }
    return row;
  }
  /* Kachel (Auswahl-Komponente): Reiter-Zeile + Textkasten. */
  tile({ label, cls = "", reiter = [], tilt = 0, onTap }) {
    const btn = document.createElement("button");
    btn.className = "detar-tile " + cls;
    btn.style.setProperty("--tilt", tilt.toFixed(2) + "deg");
    btn.appendChild(this.reiter(reiter));
    const k = document.createElement("span");
    k.className = "detar-kachel px-kachel" + (cls.includes("--asked") ? " px-kachel--asked" : "");
    k.textContent = label;
    btn.appendChild(k);
    btn.onclick = () => {
      if (this.frozen) return;
      sound.questionTap();
      this.root.querySelectorAll(".detar-tile.selected").forEach((el) => el.classList.remove("selected"));
      btn.classList.add("selected");
      onTap();
    };
    return btn;
  }
  cell(tileEl) {
    const c = document.createElement("div");
    c.className = "detar-cell";
    c.appendChild(tileEl);
    return c;
  }
  /* Festes Raster (2 Spalten). */
  grid(panel, tiles) {
    const g = document.createElement("div");
    g.className = "detar-grid";
    tiles.forEach((t) => g.appendChild(this.cell(t)));
    panel.appendChild(g);
    return g;
  }
  /* Karussell: Seiten à 2×2, Snap je Seite; Seitenpunkte laufen mit. */
  pages(panel, tiles, dotEls) {
    const wrap = document.createElement("div");
    wrap.className = "detar-pages";
    const pages = [];
    for (let i = 0; i < tiles.length; i += 4) {
      const pg = document.createElement("div");
      pg.className = "detar-page";
      tiles.slice(i, i + 4).forEach((t) => pg.appendChild(this.cell(t)));
      wrap.appendChild(pg);
      pages.push(pg);
    }
    panel.appendChild(wrap);
    wrap.scrollLeft = 0;
    if (dotEls.length > 1) {
      wrap.addEventListener("scroll", () => {
        const w = pages[0].getBoundingClientRect().width + 4;
        const idx = Math.max(0, Math.min(dotEls.length - 1, Math.round(wrap.scrollLeft / w)));
        dotEls.forEach((d, i) => d.classList.toggle("active", i === idx));
      }, { passive: true });
    }
    return wrap;
  }
  /* „Ich muss weiter" — als Kachel im Themenraster und in jedem Thema. */
  exitTile(tilt = 0) {
    const q = this.engine.exitQuestion();
    if (!q) return null;
    return this.tile({ label: q.label, tilt, onTap: () => this.hooks.onQuestion?.(q) });
  }
  questionTile(q, i) {
    const asked = this.engine.asked.has(q.id);
    const reiter = [];
    if (this.engine.fresh.has(q.id)) reiter.push({ kind: "neu", text: "NEU" });
    if (q.link) reiter.push({ kind: "link", text: "LINK" });
    if (asked) reiter.push({ kind: "check" });
    return this.tile({
      label: q.label,
      cls: asked ? "detar-tile--asked" : "",
      reiter,
      tilt: (i % 2 === 0 ? -1 : 1) * 2.34,
      onTap: () => this.hooks.onQuestion?.(q),
    });
  }

  /* ---- Phasen ----------------------------------------------------------- */
  showHub(reveal = false) {
    if (this.engine.view.mode === "thema") this.showThema(this.engine.view.thema, reveal);
    else this.showThemen(reveal);
  }
  showThemen(reveal = false) {
    this.phase = "themen";
    const panel = this.panel(reveal ? "detar-panel--reveal" : "");
    this.head(panel, { title: QuestionMenu.TITLES.themen });
    const tiles = this.engine.themes().map((t) => this.tile({
      label: t.label,
      cls: "detar-tile--theme",
      reiter: [{ kind: "thema", text: "THEMA" }, ...(t.fresh ? [{ kind: "neu", text: "NEU" }] : [])],
      onTap: () => this.hooks.onTheme?.(t.id),
    }));
    const exit = this.exitTile();
    if (exit) tiles.push(exit);
    this.grid(panel, tiles);
    if (reveal) this.animateReveal(panel);
  }
  showThema(themaId, reveal = false) {
    this.phase = "thema";
    const t = (this.engine.card.themen ?? []).find((x) => x.id === themaId);
    const panel = this.panel(reveal ? "detar-panel--reveal" : "");
    const qs = this.engine.sortedQuestionsOf(themaId);
    const tiles = qs.map((q, i) => this.questionTile(q, i));
    const exit = this.exitTile(tiles.length % 2 === 0 ? -2.34 : 2.34);
    if (exit) tiles.push(exit);
    const dotEls = this.head(panel, {
      title: t?.label ?? "",
      back: () => this.hooks.onBack?.(),
      backNew: this.engine.freshElsewhere(themaId),
      dots: Math.ceil(tiles.length / 4),
    });
    this.pages(panel, tiles, dotEls);
    if (reveal) this.animateReveal(panel);
  }
  /* Rückfrage der Figur: Antwortoptionen. */
  showOptions(options) {
    this.phase = "options";
    const panel = this.panel();
    this.head(panel, { title: QuestionMenu.TITLES.options });
    this.grid(panel, options.map((o, i) => this.tile({
      label: o.label, tilt: (i % 2 === 0 ? -1 : 1) * 2.34, onTap: () => this.hooks.onOption?.(o),
    })));
  }
  /* Weiter-Schritt: genau eine Kachel. Der Handler läuft synchron im Tap —
     wichtig für „Seite öffnen" (window.open braucht die Nutzergeste). */
  showNext(label = "Weiter") {
    this.phase = "next";
    const panel = this.panel();
    const btn = this.tile({ label, tilt: -2.34, onTap: () => this.hooks.onNext?.() });
    btn.onclick = () => { if (this.frozen) return; sound.uiTap(); this.hooks.onNext?.(); };
    this.grid(panel, [btn]);
  }
  /* Ruhezustand nach der Verabschiedung: Figur ist eingeklappt. */
  showIdle() {
    this.phase = "idle";
    const s = this.supportPanel("ruhe", QuestionMenu.LINES.ruhe);
    s.style.pointerEvents = "auto";
    s.style.cursor = "pointer";
    s.onclick = () => { if (this.frozen) return; this.hooks.onReentry?.(); };
  }
  animateReveal(panel) {
    // Doppeltes rAF: Browser paintet den Startzustand, DANN animiert er.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => panel.classList.add("detar-panel--reveal-in"))
    );
  }
  clearSelection() {
    this.root.querySelectorAll(".detar-tile.selected").forEach((el) => el.classList.remove("selected"));
  }
  /* Replay-Reset (Dev-Panel): zurück in den Suche-Zustand. */
  reset() {
    this.revealed = false;
    this.frozen = false;
    this.renderOnboarding();
  }
}
