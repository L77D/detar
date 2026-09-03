/* =============================================================================
   DETAR — SpeechBubble: Canvas-Textur mit Stroke-Outline, Typewriter,
   Billboard. Port aus dem Lokal-Prototyp (Stand 2026-07-06) mit allen
   Änderungen: Text UNTEN verankert + horizontal zentriert, Billboard
   rechnet Roll/Pitch der Figur komplett raus (Welt-Ausrichtung exakt).

   DIALOGSYSTEM (2026-09-03): Der Text wird NICHT mehr still bei maxLines
   gekappt, sondern in SEITEN geschnitten (paginate → Satzgrenze, Notfall an
   Komma/Gedankenstrich, zuletzt Wortgrenze). Gemessen wird am echten Font,
   nicht geschätzt. Seitenzähler („1/2") klein über dem Block, rechts.
   Auszeichnung im Text (<marker> <gross> <leise> <knall>) wird gerendert;
   <welle> und <zittern> werden geparst, aber nicht bewegt (Canvas-Entscheidung
   03.09.2026: kein Neuzeichnen pro Frame für Dauer-Effekte).

   KOORDINATEN-ANPASSUNG (MindAR): Im Zapworks/Prototyp-Setup war die Karte
   der Welt-Ursprung (Y = hoch). Unter MindAR bewegt sich der Karten-Anchor
   im Kamera-Raum — "aufrecht" und "Yaw" sind deshalb im KARTEN-Frame
   (frame.worldRoot) definiert, nicht in Weltkoordinaten. Alle Kamera-Posen
   werden über frame.getCamLocal() in diesen Frame transformiert.
   ============================================================================= */
import * as THREE from "three";
import { TYPO, CHOREO, PORTAL, SCENE, frameLerp60 } from "./config.js";
import { sound } from "./sound.js";
import {
  parseChars, serialize, charsToString, splitWords, splitSentences, splitClauses, joinWithSpace,
} from "./bubbleText.js";

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
    this.markup = "";            // aktueller Seitentext (mit Auszeichnung)
    this.lines = [];             // gewrappte Zeilen: Array von [{ch, fx}]
    this.totalChars = 0;
    this.plainText = "";
    this.pageLabel = "";
    this.revealedChars = 0; this.lastTickMs = 0; this.typing = false; this.onDone = null;
    this.revealAt = [];          // Zeitstempel je Zeichen (für <knall>)
    this.knallUntil = 0;         // solange > now: Canvas weiter neu zeichnen
    this.flat = false; // Einblick: Bubble liegt FLACH auf der Kartenebene (kein Billboard)
    this.element = nodes.BubbleRoot;
    this.basePos = this.element.position.clone(); // Original-Anker über dem Kopf
    this.element.visible = false;
    this.initCanvas();
  }
  /* Einblick-Modus: Caption parallel zur Karte statt Billboard, Position
     WELT-verankert (Karten-Frame) statt über dem Kopf — rechts neben der
     Figur, Unterkante über der Tab-Reihe (siehe faceCamera). */
  setFlat(value) {
    this.flat = value;
    this.bubbleYawInit = false;
    if (!value) this.element.position.copy(this.basePos);
  }
  initCanvas() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    const maxPx = Math.round(TYPO.maxWidth / TYPO.unitsPerPx);
    // + gut eine halbe Zeile Luft für den Seitenzähler über dem Block
    const maxH = Math.round(
      (TYPO.fontSize * TYPO.lineSpacing * (TYPO.maxLines + 0.7) + (TYPO.paddingPx + TYPO.strokeWidth) * 2) * 1.2
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
    // 20: über ALLEM inkl. Einblick-Portal (Bild 10/11, Rahmen 15).
    this.plane.renderOrder = 20;
    this.plane.userData.isBubble = true; // Tap-Raycast (main.js): Blase antippen
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
    if (wasVisible && this.markup) {
      this.layout(this.markup);
      this.revealedChars = this.totalChars;
      this.revealAt = new Array(this.totalChars).fill(0);
      this.renderCanvas();
      this.element.visible = true;
    }
  }

  /* ---- Font / Messung ------------------------------------------------------ */
  fontFor(fx) {
    const size = fx === "gross" ? Math.round(TYPO.fontSize * TYPO.fxGrossScale) : TYPO.fontSize;
    return `${TYPO.fontWeight} ${size}px ${TYPO.fontFamily}`;
  }
  /* Zeichenliste → Laufstücke gleicher Auszeichnung [{fx, chars, text, w}]. */
  runsOf(chars) {
    const ctx = this.ctx;
    const runs = [];
    let cur = null;
    for (const c of chars) {
      if (!cur || cur.fx !== c.fx) { cur = { fx: c.fx, chars: [] }; runs.push(cur); }
      cur.chars.push(c);
    }
    for (const r of runs) {
      r.text = charsToString(r.chars);
      ctx.font = this.fontFor(r.fx);
      r.w = ctx.measureText(r.text).width;
    }
    return runs;
  }
  measure(chars) {
    if (!this.ctx) return 0;
    return this.runsOf(chars).reduce((s, r) => s + r.w, 0);
  }
  maxLineWidth() {
    return this.canvas.width - (TYPO.paddingPx + TYPO.strokeWidth) * 2;
  }
  /* Umbruch an Wortgrenzen, OHNE Kappung — die Seitenzahl kommt aus paginate. */
  wrapChars(chars) {
    const maxW = this.maxLineWidth();
    const lines = [];
    let current = [];
    for (const word of splitWords(chars)) {
      const candidate = current.length ? joinWithSpace(current, word) : word;
      if (current.length === 0 || this.measure(candidate) <= maxW) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current.length) lines.push(current);
    return lines.length ? lines : [[]];
  }
  lineCount(chars) { return this.wrapChars(chars).length; }

  /* ---- Seiten ---------------------------------------------------------------
     Eine Seite fasst TYPO.maxLines Zeilen. Grenze am Satzende; ein Satz, der
     allein nicht passt, wird an Komma/Gedankenstrich geteilt, zuletzt an der
     Wortgrenze. Liefert Markup je Seite (Auszeichnung bleibt erhalten). */
  paginate(markup) {
    const all = parseChars(markup);
    if (!this.ctx || all.length === 0) return [String(markup ?? "")];
    const max = TYPO.maxLines;
    const fits = (chars) => this.lineCount(chars) <= max;
    const pages = [];
    let cur = [];
    const splitOversized = (sentence) => {
      const flushWords = (chunk) => {
        let line = [];
        for (const w of splitWords(chunk)) {
          const t = line.length ? joinWithSpace(line, w) : w;
          if (fits(t)) line = t;
          else { if (line.length) pages.push(line); line = w; }
        }
        if (line.length) pages.push(line);
      };
      let acc = [];
      for (const p of splitClauses(sentence)) {
        const t = acc.length ? joinWithSpace(acc, p) : p;
        if (fits(t)) acc = t;
        else {
          if (acc.length) { pages.push(acc); acc = []; }
          if (fits(p)) acc = p; else flushWords(p);
        }
      }
      if (acc.length) pages.push(acc);
    };
    for (const sentence of splitSentences(all)) {
      const t = cur.length ? joinWithSpace(cur, sentence) : sentence;
      if (fits(t)) { cur = t; continue; }
      if (cur.length) { pages.push(cur); cur = []; }
      if (fits(sentence)) cur = sentence;
      else splitOversized(sentence);
    }
    if (cur.length) pages.push(cur);
    return pages.length ? pages.map(serialize) : [String(markup)];
  }

  /* ---- Text setzen ---------------------------------------------------------- */
  layout(markup) {
    this.markup = markup;
    this.lines = this.wrapChars(parseChars(markup));
    this.totalChars = this.lines.reduce((s, l) => s + l.length, 0);
    this.plainText = this.lines.map(charsToString).join("\n");
  }
  /* Eine SEITE anzeigen (der Aufrufer paginiert vorher, siehe CardController.say).
     pageLabel: „1/2" o. ä., leer bei einer Seite. */
  setText(markup, onDone, pageLabel = "") {
    this.onDone = onDone ?? null;
    if (!markup || String(markup).length === 0) {
      this.element.visible = false;
      this.typing = false;
      this.fireDone();
      return;
    }
    this.layout(String(markup));
    this.pageLabel = pageLabel;
    this.revealedChars = 0;
    this.revealAt = new Array(this.totalChars).fill(0);
    this.knallUntil = 0;
    this.lastTickMs = performance.now();
    this.typing = true;
    this.renderCanvas();
    this.element.visible = true;
  }
  /* Tap auf die Blase: Schreibvorgang überspringen. Liefert true, wenn etwas
     zu überspringen war. */
  skip() {
    if (!this.typing) return false;
    const now = performance.now();
    for (let i = this.revealedChars; i < this.totalChars; i++) this.revealAt[i] = now;
    this.revealedChars = this.totalChars;
    this.typing = false;
    this.renderCanvas();
    this.fireDone();
    return true;
  }
  isTyping() { return this.typing; }
  hide() { this.typing = false; this.element.visible = false; }
  fireDone() { const cb = this.onDone; this.onDone = null; cb?.(); }

  /* ---- Zeichnen ------------------------------------------------------------- */
  renderCanvas() {
    const ctx = this.ctx, canvas = this.canvas;
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const lineH = TYPO.fontSize * TYPO.lineSpacing;
    const pad = TYPO.paddingPx + TYPO.strokeWidth;
    const baseline = TYPO.fontSize * TYPO.baselineRatio;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    // UI-Update 2026-09-03: Kontur mit Gehrung + eckigen Enden → aus der
    // Kontur um die Pixelschrift wird der ausgefranste Kasten des Mockups
    // (Figma: Textkontur), statt einer weichen runden Outline.
    ctx.lineJoin = "miter";
    ctx.miterLimit = 8;
    ctx.lineCap = "square";
    // UNTEN VERANKERT: letzte Zeile immer auf derselben Höhe (über die
    // GESAMT-Zeilenzahl verankert, damit beim Typewriter nichts springt).
    const yTop = canvas.height - pad - this.lines.length * lineH;
    // HORIZONTAL ZENTRIERT über die finale Breite (breiteste Zeile des
    // fertig gewrappten Texts); Zeilen im Block bleiben linksbündig.
    // FLAT-Modus (Einblick-Caption): LINKS-verankert.
    const lineRuns = this.lines.map((l) => this.runsOf(l));
    let blockW = 0;
    for (const runs of lineRuns) blockW = Math.max(blockW, runs.reduce((s, r) => s + r.w, 0));
    const xLeft = this.flat ? pad : (canvas.width - blockW) / 2;

    // Sichtbare Glyphen einsammeln: [{font, fx, x, y, text, idx0}]
    const ops = [];
    let seen = 0;
    let knallPending = false;
    for (let i = 0; i < this.lines.length && seen < this.revealedChars; i++) {
      const y = yTop + i * lineH + baseline;
      let x = xLeft;
      for (const r of lineRuns[i]) {
        const left = this.revealedChars - seen;
        if (left <= 0) break;
        const n = Math.min(left, r.chars.length);
        ops.push({ font: this.fontFor(r.fx), fx: r.fx, x, y, text: r.text.slice(0, n), idx0: seen });
        if (r.fx === "knall") {
          for (let k = 0; k < n; k++) if (now - this.revealAt[seen + k] < TYPO.fxKnallMs) knallPending = true;
        }
        seen += n;
        x += r.w;
      }
    }
    this.knallUntil = knallPending ? now + TYPO.fxKnallMs : 0;

    // Marker-Balken zuerst (liegt unter der Outline)
    for (const o of ops) {
      if (o.fx !== "marker") continue;
      ctx.font = o.font;
      const w = ctx.measureText(o.text).width;
      ctx.fillStyle = TYPO.fxMarkerColor;
      ctx.fillRect(o.x, o.y + TYPO.fontSize * 0.06, w, Math.max(4, TYPO.fontSize * 0.12));
    }
    // Zwei Durchgänge: erst alle Strokes, dann alle Fills (Overlap-Fix)
    ctx.lineWidth = TYPO.strokeWidth * 2;
    ctx.strokeStyle = TYPO.strokeColor;
    for (const o of ops) this.drawOp(ctx, o, now, true);
    for (const o of ops) this.drawOp(ctx, o, now, false);

    // Seitenzähler über dem Block, rechts, klein
    if (this.pageLabel) {
      const small = Math.round(TYPO.fontSize * 0.55);
      ctx.font = `${TYPO.fontWeight} ${small}px ${TYPO.fontFamily}`;
      ctx.textAlign = "right";
      const lx = xLeft + blockW, ly = yTop - small * 0.25;
      ctx.lineWidth = TYPO.strokeWidth * 1.2;
      ctx.strokeText(this.pageLabel, lx, ly);
      ctx.fillStyle = TYPO.fxMarkerColor;
      ctx.fillText(this.pageLabel, lx, ly);
      ctx.textAlign = "left";
    }
    if (this.texture) this.texture.needsUpdate = true;
  }
  drawOp(ctx, o, now, strokePass) {
    ctx.font = o.font;
    if (!strokePass) {
      ctx.fillStyle = o.fx === "marker" ? TYPO.fxMarkerColor : TYPO.textColor;
      ctx.globalAlpha = o.fx === "leise" ? TYPO.fxLeiseAlpha : 1;
    }
    if (o.fx === "knall") {
      // Aufploppen: Zeichen für Zeichen, beim Erscheinen kurz vergrößert
      // (1.7 → 0.93 → 1, wie im Prototyp), um die Zeichenmitte skaliert.
      let x = o.x;
      const cy = o.y - TYPO.fontSize * 0.35;
      for (let k = 0; k < o.text.length; k++) {
        const ch = o.text[k];
        const w = ctx.measureText(ch).width;
        const t = Math.min(1, (now - this.revealAt[o.idx0 + k]) / TYPO.fxKnallMs);
        const s = t < 0.6 ? 1 + (TYPO.fxKnallScale - 1) * (1 - t / 0.6)
                          : 0.93 + 0.07 * ((t - 0.6) / 0.4);
        ctx.save();
        ctx.translate(x + w / 2, cy);
        ctx.scale(s, s);
        if (strokePass) ctx.strokeText(ch, -w / 2, o.y - cy);
        else ctx.fillText(ch, -w / 2, o.y - cy);
        ctx.restore();
        x += w;
      }
    } else if (strokePass) ctx.strokeText(o.text, o.x, o.y);
    else ctx.fillText(o.text, o.x, o.y);
    ctx.globalAlpha = 1;
  }

  tickTypewriter() {
    const now = performance.now();
    if (!this.typing) {
      // <knall> läuft nach dem letzten Zeichen noch kurz aus
      if (this.knallUntil && now < this.knallUntil) this.renderCanvas();
      return;
    }
    if (TYPO.msPerChar <= 0) { this.skip(); return; }
    const elapsed = now - this.lastTickMs;
    if (elapsed < TYPO.msPerChar) {
      if (this.knallUntil && now < this.knallUntil) this.renderCanvas();
      return;
    }
    const steps = Math.floor(elapsed / TYPO.msPerChar);
    this.lastTickMs = now;
    const prevChars = this.revealedChars;
    this.revealedChars = Math.min(this.totalChars, this.revealedChars + steps);
    for (let i = prevChars; i < this.revealedChars; i++) this.revealAt[i] = now;
    // Stimme: frisch enthüllte Zeichen sprechen (Animalese) bzw. ticken —
    // Fortschritt + Frage-Endung steuern die Satz-Melodie.
    if (this.revealedChars > prevChars) {
      const chunk = charsToString(this.lines.flat().slice(prevChars, this.revealedChars));
      sound.speak(chunk, this.revealedChars / this.totalChars, this.plainText.trimEnd().endsWith("?"));
    }
    this.renderCanvas();
    if (this.revealedChars >= this.totalChars) {
      this.typing = false;
      this.fireDone();
    }
  }
  faceCamera(dt) {
    const obj = this.element;
    // FLACH-Modus (Einblick): Welt-Ausrichtung = Kartenebene (Normale = Karten-
    // hoch, Text-Oben zur Karten-Oberkante) — exakt wie die flache Figur.
    // Gleiche Quaternion-Rechnung wie unten, nur mit Rx(−90°) statt Yaw.
    if (this.flat) {
      // matrixWorld ist im Loop einen Frame alt — vor dem Lesen aktualisieren
      this.frame.worldRoot.updateWorldMatrix(true, false);
      obj.parent.updateWorldMatrix(true, false);
      _q1.setFromEuler(_euler.set(-Math.PI / 2, 0, 0));
      this.frame.worldRoot.getWorldQuaternion(_q3).multiply(_q1);
      obj.parent.getWorldQuaternion(_q2).invert();
      obj.quaternion.copy(_q2.multiply(_q3));
      const cardH = SCENE.cardWidth * SCENE.cardAspect;
      const winW = SCENE.cardWidth * PORTAL.windowW;
      const winH = cardH * PORTAL.windowH;
      const zEdge = cardH * PORTAL.windowOffsetZ - winH / 2; // Fenster-Oberkante
      const tabTop = zEdge - PORTAL.tabH * cardH;            // Oberkante aktiver Tab
      const worldScale = this.element.scale.x * (obj.parent?.scale.x ?? 1);
      const planeHCard = this.planeH * worldScale;
      const padCard = (TYPO.paddingPx + TYPO.strokeWidth) * TYPO.unitsPerPx * worldScale;
      const planeWCard = this.canvas.width * TYPO.unitsPerPx * worldScale;
      _v1.set(
        winW * (PORTAL.peekX + PORTAL.captionDX) - padCard + planeWCard / 2,
        0.002,
        tabTop - PORTAL.captionGap * winH - planeHCard / 2
      );
      this.frame.worldRoot.localToWorld(_v1);
      obj.parent.worldToLocal(_v1);
      obj.position.copy(_v1);
      return;
    }
    // Kamera + Bubble in den KARTEN-Frame transformieren (MindAR-Anpassung)
    const camL = this.frame.getCamLocal(_v1);
    if (!camL) return; // NaN-Schutz: kaputter Frame → Ausrichtung halten
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
      if (this.flat) {
        this.plane.position.set(0, 0, 0);
      } else {
        this.plane.position.x = TYPO.offsetX;
        this.plane.position.y = this.planeH / 2 + TYPO.offsetY;
      }
    }
    this.faceCamera(dt);
    this.tickTypewriter();
  }
}
