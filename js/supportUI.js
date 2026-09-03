/* =============================================================================
   DETAR — SupportUI: Handy-Icon + Balken („Support-Zeile"), UI-Update 2026-09-03.
   Wird vom Bottom-Panel (Suche, Karte gefunden, Ruhezustand) und vom Karte-
   verloren-Hinweis benutzt. Markup/CSS: .support in css/app.css.

   Icon-Frames (assets/ui/icon-handy, 80×126 px Pixelgrafik):
     neutral · blink · left · right · mouth-open · mouth-shut
   Zustände (Zuordnung abgeleitet, kein Mockup für die Bewegung):
     "suchen"   — Mund offen (mock_01), schaut abwechselnd links/rechts
     "gefunden" — lächelt (mock_02), blinzelt ab und zu
     "ruhe"     — lächelt, blinzelt
   ============================================================================= */
const ICON_DIR = "./assets/ui/icon-handy/";
const FRAMES = ["neutral", "blink", "left", "right", "mouth-open", "mouth-shut"];

// Bilder einmal vorladen, damit der Frame-Wechsel nicht flackert
const _cache = new Map();
for (const f of FRAMES) { const im = new Image(); im.src = ICON_DIR + f + ".png"; _cache.set(f, im); }

const rand = (a, b) => a + Math.random() * (b - a);

export class IconHandy {
  constructor(mode = "gefunden") {
    this.el = document.createElement("div");
    this.el.className = "support-icon";
    this.img = document.createElement("img");
    this.img.alt = "";
    this.el.appendChild(this.img);
    this.timer = null;
    this.setMode(mode);
  }
  frame(name) { this.img.src = ICON_DIR + name + ".png"; }
  stop() { if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; } }
  setMode(mode) {
    this.stop();
    this.mode = mode;
    if (mode === "suchen") this.searchStep(0);
    else this.blinkLoop("neutral");
  }
  /* Suche: Mund offen als Grundzustand, alle ~0,9 s ein Blick zur Seite */
  searchStep(i) {
    const seq = ["mouth-open", "left", "mouth-open", "right"];
    this.frame(seq[i % seq.length]);
    this.timer = setTimeout(() => this.searchStep(i + 1), i % 2 === 0 ? 900 : 550);
  }
  /* Lächeln mit Blinzeln in unregelmäßigen Abständen (wie die Figur: 2–5 s) */
  blinkLoop(base) {
    this.frame(base);
    this.timer = setTimeout(() => {
      this.frame("blink");
      this.timer = setTimeout(() => this.blinkLoop(base), 130);
    }, rand(2000, 5000));
  }
  destroy() { this.stop(); this.el.remove(); }
}

/* Support-Zeile: Icon + eine oder zwei Balken-Zeilen.
   lines: [{ text, kind: "blau"|"gelb", einzug: bool, pulse: bool, md: bool }] */
export function buildSupport(mode, lines) {
  const wrap = document.createElement("div");
  wrap.className = "support";
  const icon = new IconHandy(mode);
  wrap.appendChild(icon.el);
  const col = document.createElement("div");
  col.className = "support-lines";
  for (const l of lines) {
    const s = document.createElement("span");
    s.className = "support-line"
      + (l.kind === "gelb" ? " support-line--gelb" : "")
      + (l.einzug ? " support-line--einzug" : "")
      + (l.pulse ? " support-line--pulse" : "")
      + (l.md ? " support-line--md" : "");
    s.textContent = l.text;
    col.appendChild(s);
  }
  wrap.appendChild(col);
  wrap.icon = icon;
  return wrap;
}
