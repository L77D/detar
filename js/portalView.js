/* =============================================================================
   DETAR — Einblick: Portal-Parallax-Karte + Figur-Flip.

   PortalView: Ein übergroßes Bild liegt HINTER der Karte (Karten-Frame,
   y = -depth) und wird per STENCIL auf das Karten-Fenster maskiert — nur der
   Ausschnitt im Fenster ist sichtbar, die Bildränder erscheinen nie.

   DESIGN-RUNDE 2 (2026-07-15, Mockup einblick_02):
   • Zwei PIXEL-PUNKT-RINGE auf Zwischentiefen (dotDepth1/2 × depth) zwischen
     Karte und Bild — statische, transparente Ebenen, stencil-maskiert. Ihre
     Parallaxe entsteht REIN aus der Perspektivprojektion (kein Offset nötig,
     Ebenen sind durchsichtig → kein „Leere sichtbar"-Problem). Ergebnis:
     progressiver Tiefen-Tunnel beim Bewegen der Kamera.
   • TABS an der Portal-Oberkante: eine Farbfläche pro Galeriebild (aktiv =
     neon, inaktiv = oliv), per Raycast antappbar (main.js). Bottom-UI-Pfeile
     bleiben parallel — die UI ist die Fernbedienung, Tabs der direkte Weg.
   • Galerie-Einträge sind jetzt { url, caption } — captionAt(i) liefert den
     gesprochenen Text (CardController.speakCaption). Strings bleiben als
     Fallback erlaubt (caption = null).

   Bild-Parallax, zwei Zustände PRO ACHSE (X und Z unabhängig):
   • Pan — solange das (durch die Kamera projizierte) Fenster innerhalb der
     Bildgrenzen bleibt, gleitet das Portal über das Bild.
   • Edge-Lock — würde die Fensterkante die Bildkante überschreiten, ankert
     diese Kante. REVERSIBEL: der Offset wird jede Frame frisch als Clamp
     berechnet (Ruhelage = zentriert).

   HARTE INVARIANTE — die Leere hinter dem BILD ist NIE sichtbar:
   (1) f = depth/camY wird auf (oversize−1) geclampt.
   (2) Der gedämpfte Offset wird nach dem Lerp HART geclampt.

   RENDER-REIHENFOLGE (Painter, transparent-Pass — GEÄNDERT 2026-07-15,
   „Figur HINTER dem Fenster"): Figur 0..2 → Bild 10/11 → Ring innen 12 →
   Ring außen 13 → Tabs 14 → RAHMEN 15 → Bubble 20 (SpeechBubble).
   Das Fenster VERDECKT damit die Figur, wo sie es überlappt — sie steht per
   peekZ leicht IM Fenster und nur der Teil über der Kante bleibt sichtbar
   („lugt hinter dem Fenster hervor", Mockup einblick_02). Außerhalb des
   Einblicks ist die Portal-Gruppe unsichtbar, die hohen renderOrder stören
   also nie. Maske −30 (Opaque-Pass).

   FENSTER-GEOMETRIE (Mockup einblick_02): windowW 1.05 (etwas breiter als die
   Karte), windowH 0.75, windowOffsetZ −0.125 ⇒ Fenster-Oberkante bündig mit
   der Karten-Oberkante, unten bleiben 25% Karte (Zitat-Box) sichtbar. Die
   GANZE Gruppe wird um offsetZ versetzt; die Kamera wird in tick() in
   Fenster-Koordinaten gebracht (cam.z − group.position.z).

   STENCIL-VORAUSSETZUNG: three r160 erstellt den WebGLRenderer mit
   stencil:true (Default bis r162). Bei einem three-Upgrade ab r163 muss
   stencil:true explizit gesetzt werden!

   FigureFlip (GEÄNDERT 2026-07-15): Parabel-Sprung an die OBERKANTE des
   Portal-Fensters, verkleinert (figureScale) und seitlich versetzt (peekX) —
   die Figur „lugt über die Kante". Die Bubble (BubbleRoot, Kind der Figur)
   wird GEGENSKALIERT (captionScale/figureScale), damit der Caption-Text in
   normaler Größe bleibt. toUpright() kehrt zu FIGURE_HOME zurück.
   API unverändert: toFlat()/toUpright() — Name historisch.
   ============================================================================= */
import * as THREE from "three";
import { PORTAL, SCENE, frameLerp60 } from "./config.js";

const _camL = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export class PortalView {
  constructor(worldRoot, frame, gallery) {
    this.frame = frame;
    this.index = 0;
    this.visible = false;   // Soll-Zustand (show/hide faden)
    this.fade = 0;          // Ein-/Ausblend-Fortschritt 0..1
    this.xfade = 1;         // Bildwechsel-Crossfade 0..1 (1 = fertig)
    this.ox = 0;            // gedämpfter Bild-Offset (Karten-Frame, X)
    this.oz = 0;            // dito Z
    this.active = 0;        // Index der aktiven Bild-Ebene (0/1)

    this.group = new THREE.Group();
    worldRoot.add(this.group);

    // --- Stencil-Maske: Fenster-Rect auf der Kartenebene ----------------------
    // colorWrite aus (unsichtbar), schreibt nur Stencil=1. Opaque-Pass
    // (transparent:false) → wird VOR allen transparenten Ebenen gezeichnet.
    this.mask = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: false, depthTest: false,
        stencilWrite: true, stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilZPass: THREE.ReplaceStencilOp,
      })
    );
    this.mask.rotation.x = -Math.PI / 2;
    this.mask.renderOrder = -30;
    this.group.add(this.mask);

    // --- zwei Bild-Ebenen (Crossfade beim Galerie-Wechsel) --------------------
    this.layers = [this.makeLayer(), this.makeLayer()];

    // --- zwei Punkt-Ringe (Zwischentiefen) + Rahmen + Tabs --------------------
    this.rings = [this.makeRing(), this.makeRing()]; // [0] außen/flach · [1] innen/tief
    this.frame3d = this.makeFrame();
    this.tabs = [];

    // --- Galerie vorladen. Einträge: { url, caption } oder plain String. ------
    const loader = new THREE.TextureLoader();
    this.items = (gallery ?? []).map((entry) => {
      const url = typeof entry === "string" ? entry : entry.url;
      const caption = typeof entry === "string" ? null : (entry.caption ?? null);
      const item = { url, caption, tex: null, aspect: 1.5 };
      item.tex = loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        item.aspect = t.image.width / t.image.height;
        this.applyWindow(); // echte Seitenverhältnisse nachziehen
      });
      item.tex.colorSpace = THREE.SRGBColorSpace;
      return item;
    });

    if (this.items.length > 0) this.setLayerImage(this.layers[0], this.items[0]);
    this.applyWindow();
    this.group.visible = false;
  }

  /* Gesprochener Text zum Bild i (null = keine Caption). */
  captionAt(i) { return this.items[i]?.caption ?? null; }

  makeLayer() {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0,
      depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
      // Stencil-TEST an (nur im Fenster zeichnen), aber nie selbst schreiben.
      stencilWrite: true, stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc,
    });
    mat.stencilWriteMask = 0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2; // wie die Karte: Textur-Oben zeigt zur Karten-Oberkante
    m.renderOrder = 10; // ÜBER der Figur (0..2) — Fenster verdeckt sie (peek)
    m.userData.item = null;
    this.group.add(m);
    return m;
  }

  /* Punkt-Ring: transparente Ebene mit Pixel-Quadraten am Rand, stencil-
     maskiert. STATISCH — die Parallaxe liefert die Perspektive gratis. */
  makeRing() {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0,
      depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc,
    });
    mat.stencilWriteMask = 0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    this.group.add(m);
    return m;
  }

  /* Fenster- + Bildgrößen aus PORTAL/SCENE ableiten (auch live vom Dev-Panel).
     Das Fenster ist per windowOffsetZ Richtung Karten-Oberkante verschoben
     (Mockup: Oberkante bündig mit der Karte, unten bleibt die Zitat-Box frei) —
     die GANZE Portal-Gruppe wird versetzt, die Fenster-Mathe bleibt lokal. */
  applyWindow() {
    this.winW = SCENE.cardWidth * PORTAL.windowW;
    this.winH = SCENE.cardWidth * SCENE.cardAspect * PORTAL.windowH;
    this.group.position.z = SCENE.cardWidth * SCENE.cardAspect * PORTAL.windowOffsetZ;
    this.mask.scale.set(this.winW, this.winH, 1);
    for (const layer of this.layers) this.applyLayerSize(layer);
    this.rebuildRings();
    this.rebuildFrame();
    this.buildTabs();
  }

  rebuildRings() {
    // Ring 2 ist um (inset2 − inset1) ENTLANG der Kante phasenverschoben →
    // seine Punkte sitzen diagonal neben denen von Ring 1 = PAARE (Mockup).
    const pair = Math.max(0, PORTAL.dotInset2 - PORTAL.dotInset1);
    const defs = [
      { depthFrac: PORTAL.dotDepth1, inset: PORTAL.dotInset1, phase: 0, order: 13 },    // außen
      { depthFrac: PORTAL.dotDepth2, inset: PORTAL.dotInset2, phase: pair, order: 12 }, // innen
    ];
    this.rings.forEach((ring, i) => {
      const d = defs[i];
      ring.material.map?.dispose();
      ring.material.map = this.makeDotTexture(d.inset, d.phase);
      ring.material.needsUpdate = true;
      ring.scale.set(this.winW, this.winH, 1);
      ring.position.y = -PORTAL.depth * clamp(d.depthFrac, 0, 1);
      ring.renderOrder = d.order;
    });
  }

  /* Pixel-Quadrate entlang des Fensterrands (NearestFilter = scharfe Pixel).
     phase verschiebt die Punkte entlang der Kante (für den Paar-Effekt). */
  makeDotTexture(inset, phase = 0) {
    const W = 512;
    const H = Math.max(64, Math.round(W * (this.winH / this.winW)));
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PORTAL.dotColor;
    const s = Math.max(2, Math.round(PORTAL.dotSize * W));
    const gap = Math.max(s * 2, Math.round(PORTAL.dotGap * W));
    const inPx = Math.round(inset * W);
    const ph = Math.round(phase * W);
    for (let x = inPx + ph; x <= W - inPx - s; x += gap) {   // obere + untere Reihe
      ctx.fillRect(x, inPx, s, s);
      ctx.fillRect(x, H - inPx - s, s, s);
    }
    for (let y = inPx + gap + ph; y <= H - inPx - s - gap; y += gap) { // Seiten (ohne Ecken)
      ctx.fillRect(inPx, y, s, s);
      ctx.fillRect(W - inPx - s, y, s, s);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* Schwarzer Rahmen mit runden Ecken um das Fenster (Mockup). Liegt ÜBER
     allem außer der Bubble — deckt Tab-Unterkanten UND die Figur ab (peek).
     NICHT stencil-maskiert (ragt raus). */
  makeFrame() {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 15;
    this.group.add(m);
    return m;
  }

  rebuildFrame() {
    const fw = Math.max(0.001, PORTAL.frameW) * this.winW;   // Outline-Dicke (Welt)
    const planeW = this.winW + 2 * fw;
    const planeH = this.winH + 2 * fw;
    const W = 1024;
    const H = Math.max(64, Math.round(W * (planeH / planeW)));
    const px = W / planeW;                                    // Welt → Canvas-px
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = PORTAL.frameColor;
    ctx.lineWidth = fw * px;
    const r = Math.max(0, PORTAL.frameRadius) * this.winW * px;
    // Pfad = Fensterkante; der Stroke liegt automatisch halb innen/halb außen
    ctx.beginPath();
    ctx.roundRect(fw * px, fw * px, this.winW * px, this.winH * px, r);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.frame3d.material.map?.dispose();
    this.frame3d.material.map = tex;
    this.frame3d.material.needsUpdate = true;
    this.frame3d.scale.set(planeW, planeH, 1);
  }

  /* Tabs an der Portal-Oberkante: pro Bild eine schwarze Trägerfläche (=
     Outline) + eingerückte Farbfläche. Die Outline-Dicke ist frameW — GLEICH
     dem Hauptrahmen — und in WELT-Einheiten gerechnet, dadurch auf allen
     Seiten gleichmäßig (Canvas-Texturen würden beim Höhen-Animieren
     verzerren). NICHT stencil-maskiert (liegen außerhalb des Fensters).
     Raycast-Ziele für main.js über userData.tabIndex (Trägerfläche). */
  buildTabs() {
    for (const t of this.tabs) {
      t.userData.fill.material.dispose();
      t.userData.fill.geometry.dispose();
      this.group.remove(t.userData.fill);
      t.material.dispose();
      t.geometry.dispose();
      this.group.remove(t);
    }
    this.tabs = [];
    const n = this.items.length;
    if (n < 2) return; // ein Bild braucht keine Tabs
    const inset = Math.max(0, PORTAL.tabInset) * this.winW; // Einzug von beiden Kanten
    const rowW = this.winW - 2 * inset;
    const gap = PORTAL.tabGap * this.winW;
    const w = (rowW - gap * (n - 1)) / n;
    const flatMat = (color, order) => {
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = order;
      this.group.add(m);
      return m;
    };
    for (let i = 0; i < n; i++) {
      const back = flatMat(PORTAL.frameColor, 14);   // Outline (unter dem Rahmen 15)
      const fill = flatMat(PORTAL.tabInactive, 14.5); // Farbfläche darüber
      back.userData.tabIndex = i;
      back.userData.fill = fill;
      back.userData.w = w;
      back.userData.x = -this.winW / 2 + inset + w / 2 + i * (w + gap);
      // Höhe: aktiv = tabH, inaktiv = tabHInactive; Wechsel animiert in tick()
      // (Unterkante bleibt an der Fensterkante verankert, Wachstum nach oben).
      back.userData.h = this.tabTargetH(i);
      this.layoutTab(back);
      this.tabs.push(back);
    }
    this.updateTabs();
  }

  /* Ziel-Höhe eines Tabs (Welt-Einheiten): aktiv hoch, inaktiv flach. */
  tabTargetH(i) {
    const cardH = SCENE.cardWidth * SCENE.cardAspect;
    const frac = i === this.index ? PORTAL.tabH : PORTAL.tabHInactive;
    return Math.max(0.001, frac * cardH);
  }

  /* Träger + Farbfläche aus userData (w/x/h) positionieren; Outline = frameW
     rundum gleichmäßig (Farbfläche zentriert eingerückt). */
  layoutTab(back) {
    const b = Math.max(0.0002, PORTAL.frameW * this.winW); // wie der Hauptrahmen
    const { w, x, h, fill } = back.userData;
    back.scale.set(w, h, 1);
    back.position.set(x, 0, -this.winH / 2 - h / 2);
    fill.scale.set(Math.max(0.0005, w - 2 * b), Math.max(0.0005, h - 2 * b), 1);
    fill.position.copy(back.position);
  }

  updateTabs() {
    for (const t of this.tabs)
      t.userData.fill.material.color.set(
        t.userData.tabIndex === this.index ? PORTAL.tabActive : PORTAL.tabInactive
      );
  }

  /* Cover-Fit: Bild füllt Fenster × oversize auf BEIDEN Achsen, Aspekt bleibt. */
  applyLayerSize(layer) {
    const item = layer.userData.item;
    if (!item) return;
    const os = Math.max(1.05, PORTAL.oversize);
    const planeH = Math.max(this.winH * os, (this.winW * os) / item.aspect);
    const planeW = planeH * item.aspect;
    layer.scale.set(planeW, planeH, 1);
    layer.position.y = -PORTAL.depth;
    layer.userData.hw = planeW / 2;
    layer.userData.hh = planeH / 2;
  }

  setLayerImage(layer, item) {
    layer.userData.item = item;
    layer.material.map = item.tex;
    layer.material.needsUpdate = true;
    this.applyLayerSize(layer);
  }

  /* Direkt zu Bild i (Tabs). Liefert den neuen Index. */
  goTo(i) {
    const n = this.items.length;
    if (n === 0) return this.index;
    i = ((i % n) + n) % n;
    if (i === this.index) return this.index;
    // laufenden Crossfade hart beenden, bevor der nächste startet
    if (this.xfade < 1) { this.xfade = 1; this.settleFade(); }
    this.index = i;
    const back = this.layers[1 - this.active];
    this.setLayerImage(back, this.items[this.index]);
    // neue Ebene ÜBER der alten zeichnen und einfaden
    back.renderOrder = 11;
    this.layers[this.active].renderOrder = 10;
    this.xfade = 0;
    this.updateTabs();
    return this.index;
  }

  /* Galerie: dir = +1 (rechts) / -1 (links), zyklisch. Liefert neuen Index. */
  nav(dir) {
    if (this.items.length < 2) return this.index;
    return this.goTo(this.index + dir);
  }

  settleFade() {
    // Crossfade fertig: neue Ebene wird die aktive, alte unsichtbar.
    this.active = 1 - this.active;
    this.layers[1 - this.active].material.opacity = 0;
  }

  show() {
    if (this.items.length === 0) return;
    this.visible = true;
    this.group.visible = true;
    this.ox = 0;
    this.oz = 0;
  }
  hide() { this.visible = false; }
  hideInstant() {
    this.visible = false;
    this.fade = 0;
    this.group.visible = false;
    this.index = 0;
    if (this.items.length > 0) this.setLayerImage(this.layers[this.active], this.items[0]);
    this.xfade = 1;
    this.updateTabs();
  }

  tick(dt) {
    if (!this.group.visible) return;

    // --- Ein-/Ausblenden + Bildwechsel-Crossfade -------------------------------
    const fadeStep = dt / Math.max(0.05, PORTAL.showSec);
    this.fade = clamp(this.fade + (this.visible ? fadeStep : -fadeStep), 0, 1);
    if (!this.visible && this.fade <= 0) { this.group.visible = false; return; }

    if (this.xfade < 1) {
      this.xfade = Math.min(1, this.xfade + dt / Math.max(0.05, PORTAL.fadeSec));
      if (this.xfade >= 1) this.settleFade();
    }
    const front = this.layers[1 - this.active]; // während Crossfade: die NEUE
    const backA = this.layers[this.active];
    if (this.xfade < 1) {
      backA.material.opacity = this.fade;
      front.material.opacity = this.fade * this.xfade;
    } else {
      backA.material.opacity = this.fade;
    }
    // Ringe + Rahmen + Tabs faden mit dem Portal
    for (const r of this.rings) r.material.opacity = this.fade;
    this.frame3d.material.opacity = this.fade;
    for (const t of this.tabs) {
      t.material.opacity = this.fade;
      t.userData.fill.material.opacity = this.fade;
      // Tab-Höhe animiert zum Ziel (aktiv hoch / inaktiv runter), Unterkante fix
      const target = this.tabTargetH(t.userData.tabIndex);
      t.userData.h += (target - t.userData.h) * frameLerp60(PORTAL.tabRaiseLerp, dt);
      this.layoutTab(t);
    }

    // --- Parallax + reversibles Edge-Lock (pro Achse, nur BILD-Ebenen) ----------
    // Kamera-Z RELATIV zur Fenster-Mitte (Gruppe ist um windowOffsetZ versetzt).
    const cam = this.frame.getCamLocal(_camL);
    if (cam) cam.z -= this.group.position.z;
    if (cam && cam.y > PORTAL.minCamY) {
      // f = Parallax-Faktor. Clamp auf (oversize−1) ⇒ projizierte Fenster-
      // region passt IMMER ins Bild (Invariante 1) — auch streifend.
      const os = Math.max(1.05, PORTAL.oversize);
      const f = Math.min(PORTAL.depth / cam.y, os - 1);

      // Bildgrenzen: während des Crossfades die STRENGERE beider Ebenen,
      // damit auch das gerade einfadende Bild nie seine Kante zeigt.
      let hw = this.layers[this.active].userData.hw ?? this.winW;
      let hh = this.layers[this.active].userData.hh ?? this.winH;
      if (this.xfade < 1 && front.userData.hw) {
        hw = Math.min(hw, front.userData.hw);
        hh = Math.min(hh, front.userData.hh);
      }

      this.ox = this.solveAxis(this.ox, cam.x, this.winW / 2, f, hw, dt);
      this.oz = this.solveAxis(this.oz, cam.z, this.winH / 2, f, hh, dt);
    }
    for (const layer of this.layers) {
      layer.position.x = this.ox;
      layer.position.z = this.oz;
    }
  }

  /* Eine Achse: projizierte Fensterregion auf der Bildebene → Offset, der sie
     im Bild hält. Ruhelage 0 (Pan), Clamp = Edge-Lock (reversibel, weil jede
     Frame frisch gerechnet). Danach Dämpfung + HARTER Clamp (Invariante 2). */
  solveAxis(current, camAxis, winHalf, f, imgHalf, dt) {
    const half = winHalf * (1 + f);   // halbe Breite der projizierten Region
    const shift = -camAxis * f;       // ihr Zentrum (Kamera gegenüber verschoben)
    const lo = (shift + half) - imgHalf;
    const hi = (shift - half) + imgHalf;
    const target = lo > hi ? (lo + hi) / 2 : clamp(0, lo, hi);
    let v = current + (target - current) * frameLerp60(PORTAL.damp, dt);
    if (lo <= hi) v = clamp(v, lo, hi); // Kante darf durch Dämpfungs-Lag nicht rein
    return v;
  }
}

/* =============================================================================
   FigureFlip — Einblick-Pose der Figur (GEÄNDERT 2026-07-15):
   Parabel-Sprung an die OBERKANTE des Portal-Fensters, dort VERKLEINERT
   (PORTAL.figureScale) und seitlich versetzt (PORTAL.peekX) aufgestellt —
   die Figur „lugt über die Kante" wie im Mockup. Füße bleiben auf der
   Kartenebene (y skaliert mit). Die BUBBLE wird GEGENSKALIERT
   (captionScale / figureScale), damit Caption-Text in Normalgröße bleibt.
   toUpright() kehrt zu FIGURE_HOME (Position + volle Größe) zurück.
   API unverändert: toFlat()/toUpright() — Name historisch.
   ============================================================================= */
export class FigureFlip {
  constructor(nodes) {
    this.nodes = nodes;
    this.active = false;
    this.flat = false;      // Einblick-Pose aktiv?
    this.t = 0;
    this.from = null;
    this.to = null;
    this.targetFlat = false;
    this.onDone = null;
    this.bubbleBase = nodes.BubbleRoot.scale.x; // Original-Scale aus dem Rig
    // In-Plane-Sway der FLACHEN Figur (±swayDeg um die Bild-Normale =
    // rotation.z, unregelmäßige Abstände; PORTAL.swayDeg/swayMin/swayMax).
    this.swayCur = 0;
    this.swayTarget = 0;
    this.swayNext = 0;
    this.swayClock = 0;
  }
  toFlat(onDone) { this.start(true, onDone); }
  toUpright(onDone) { this.start(false, onDone); }

  start(toFlat, onDone) {
    const el = this.nodes.FigureRoot;
    const home = this.nodes.FIGURE_HOME;
    this.active = true;
    this.targetFlat = toFlat;
    this.t = 0;
    this.onDone = onDone ?? null;
    this.from = {
      x: el.position.x, y: el.position.y, z: el.position.z,
      rx: el.rotation.x, ry: normalizeAngle(el.rotation.y),
      sc: el.scale.x / home.scale.x, // aktueller Größen-Faktor
      bs: this.nodes.BubbleRoot.scale.x,
    };
    // Oberkante des Portal-Fensters (Karten-Frame: −Z = Karten-Oberkante).
    // Fenster ist um windowOffsetZ versetzt — Ziel-Z entsprechend mitrechnen.
    // peekZ schiebt die Figur INS Fenster: das Fenster rendert ÜBER ihr →
    // ihr unterer Teil wird verdeckt, sie „lugt hinter der Kante hervor".
    const cardH = SCENE.cardWidth * SCENE.cardAspect;
    const winW = SCENE.cardWidth * PORTAL.windowW;
    const winH = cardH * PORTAL.windowH;
    const zTop = cardH * PORTAL.windowOffsetZ - winH / 2 + PORTAL.peekZ * winH;
    const s = Math.max(0.05, PORTAL.figureScale);
    this.to = toFlat
      // FLACH auf der Kartenebene (rx = −90°, Kopf zur Karten-Oberkante,
      // Bild-Normale zeigt von der Karte weg) — alles parallel zur Karte wie
      // im Mockup. Das Fenster (renderOrder 10+) verdeckt den Teil der
      // Figur, der im Fenster liegt → sie lugt hinter der Kante hervor.
      // Bubble gegenskaliert → Caption-Text bleibt in Weltgröße konstant.
      ? { x: winW * PORTAL.peekX, y: 0.0015, z: zTop, rx: -Math.PI / 2, ry: 0, sc: s,
          bs: this.bubbleBase * Math.max(0.05, PORTAL.captionScale) / s }
      : { x: home.pos.x, y: home.pos.y, z: home.pos.z, rx: 0, ry: 0, sc: 1,
          bs: this.bubbleBase };
    // Sway zurücksetzen (Flug räumt rotation.z nicht selbst auf — IdleWander
    // relaxToRest zieht den Roll zurück, wir starten neutral).
    this.swayCur = 0;
    this.swayTarget = 0;
    this.swayNext = 0;
    this.swayClock = 0;
  }

  tick(dt) {
    if (!this.active) {
      this.tickSway(dt);
      return;
    }
    this.t += dt;
    const k = Math.min(1, this.t / Math.max(0.05, PORTAL.flipSec));
    const e = k * k * (3 - 2 * k); // smoothstep
    const el = this.nodes.FigureRoot;
    const home = this.nodes.FIGURE_HOME;
    el.position.x = THREE.MathUtils.lerp(this.from.x, this.to.x, e);
    el.position.z = THREE.MathUtils.lerp(this.from.z, this.to.z, e);
    el.position.y = THREE.MathUtils.lerp(this.from.y, this.to.y, e)
      + Math.sin(Math.PI * k) * PORTAL.flipHeight;
    el.rotation.x = THREE.MathUtils.lerp(this.from.rx, this.to.rx, e);
    el.rotation.y = THREE.MathUtils.lerp(this.from.ry, this.to.ry, e);
    const sc = THREE.MathUtils.lerp(this.from.sc, this.to.sc, e);
    el.scale.set(home.scale.x * sc, home.scale.y * sc, home.scale.z * sc);
    this.nodes.BubbleRoot.scale.setScalar(THREE.MathUtils.lerp(this.from.bs, this.to.bs, e));
    if (k >= 1) {
      this.active = false;
      this.flat = this.targetFlat;
      el.position.set(this.to.x, this.to.y, this.to.z);
      el.rotation.x = this.to.rx;
      el.rotation.y = this.to.ry;
      el.scale.set(home.scale.x * this.to.sc, home.scale.y * this.to.sc, home.scale.z * this.to.sc);
      this.nodes.BubbleRoot.scale.setScalar(this.to.bs);
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    }
  }

  /* Lebendigkeit der FLACHEN Figur: kleine ±swayDeg-Drehung um die
     Bild-Normale (rotation.z), unregelmäßige Abstände. Läuft NACH
     IdleWander.tick (Loop-Reihenfolge) und überschreibt dessen Roll-Reset. */
  tickSway(dt) {
    if (!this.flat) return;
    this.swayClock += dt;
    if (this.swayClock >= this.swayNext) {
      const amp = (Math.max(0, PORTAL.swayDeg) * Math.PI) / 180;
      this.swayTarget = (Math.random() < 0.5 ? -1 : 1)
        * (amp * 0.4 + Math.random() * amp * 0.6);
      this.swayNext = this.swayClock + PORTAL.swayMin
        + Math.random() * Math.max(0, PORTAL.swayMax - PORTAL.swayMin);
    }
    this.swayCur += (this.swayTarget - this.swayCur) * Math.min(1, dt * 2.5);
    // Grunddrehung peekTilt (+ = links) + Sway obendrauf
    this.nodes.FigureRoot.rotation.z =
      (PORTAL.peekTilt * Math.PI) / 180 + this.swayCur;
  }

  /* Replay-Reset: hart aufrecht + volle Größe; Position setzt CardController.replay. */
  reset() {
    this.active = false;
    this.flat = false;
    this.onDone = null;
    this.swayCur = 0;
    this.swayTarget = 0;
    this.nodes.FigureRoot.rotation.x = 0;
    this.nodes.FigureRoot.rotation.z = 0;
    this.nodes.FigureRoot.scale.copy(this.nodes.FIGURE_HOME.scale);
    this.nodes.BubbleRoot.scale.setScalar(this.bubbleBase);
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
