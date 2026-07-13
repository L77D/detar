/* =============================================================================
   DETAR — Einblick: Portal-Parallax-Karte + Figur-Flip.

   PortalView: Ein übergroßes Bild liegt HINTER der Karte (Karten-Frame,
   y = -depth) und wird per STENCIL auf das Karten-Fenster maskiert — nur der
   Ausschnitt im Fenster ist sichtbar, die Bildränder erscheinen nie.

   Zwei Zustände, PRO ACHSE (X und Z unabhängig) ausgewertet:
   • Pan — solange das (durch die Kamera projizierte) Fenster innerhalb der
     Bildgrenzen bleibt, gleitet das Portal über das Bild. Die Parallaxe
     entsteht AUTOMATISCH aus dem Tiefen-Offset unter Perspektivprojektion —
     hier wird nur der Bild-OFFSET berechnet, der die Kante versteckt.
   • Edge-Lock — würde die Fensterkante die Bildkante überschreiten, ankert
     diese Kante und das Bild wird ab dort starr mitgeschleppt. REVERSIBEL:
     der Offset wird jede Frame frisch als Clamp berechnet — bewegt man
     zurück, setzt das Pan sofort wieder ein (Ruhelage = zentriert).

   HARTE INVARIANTE — die Leere hinter dem Bild ist NIE sichtbar:
   (1) f = depth/camY wird auf (oversize−1) geclampt → die projizierte
       Fensterregion passt IMMER ins Bild (auch bei streifenden Winkeln).
   (2) Der gedämpfte Offset wird nach dem Lerp HART auf die gültigen
       Grenzen geclampt — Dämpfung glättet nur INNERHALB des Erlaubten.

   Dämpfung: die Tiefen-Ebene verstärkt rohes Marker-Zittern stärker als der
   Rahmen — der abgeleitete Offset wird deshalb fps-normalisiert gelerpt
   (PORTAL.damp). Streifende Winkel (schwächstes Tracking = größte Exkursion)
   deckt derselbe Lerp + der f-Clamp ab.

   STENCIL-VORAUSSETZUNG: three r160 erstellt den WebGLRenderer mit
   stencil:true (Default bis r162) — gilt für MindARs Renderer UND den
   Desktop-Modus. Bei einem three-Upgrade ab r163 muss stencil:true explizit
   gesetzt werden!

   FigureFlip: Parabel-Sprung der Figur zur Kartenmitte, dabei Drehung um
   rotation.x auf −90° → liegt PLAN auf der Karte (über dem Portal, painter's
   order Figur 0..3 > Portal −20). toUpright() kehrt zu FIGURE_HOME zurück.
   (rotation.x der FigureRoot ist hier — anders als in Mattercraft — frei:
   im MindAR-Port steckt die Aufrichtung im worldRoot, nicht in der Figur.)
   ============================================================================= */
import * as THREE from "three";
import { PORTAL, SCENE, frameLerp60 } from "./config.js";

const _camL = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export class PortalView {
  constructor(worldRoot, frame, urls) {
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

    // --- Galerie vorladen ------------------------------------------------------
    const loader = new THREE.TextureLoader();
    this.items = urls.map((url) => {
      const item = { url, tex: null, aspect: 1.5 };
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
    m.renderOrder = -20;
    m.userData.item = null;
    this.group.add(m);
    return m;
  }

  /* Fenster- + Bildgrößen aus PORTAL/SCENE ableiten (auch live vom Dev-Panel). */
  applyWindow() {
    this.winW = SCENE.cardWidth * PORTAL.windowW;
    this.winH = SCENE.cardWidth * SCENE.cardAspect * PORTAL.windowH;
    this.mask.scale.set(this.winW, this.winH, 1);
    for (const layer of this.layers) this.applyLayerSize(layer);
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

  /* Galerie: dir = +1 (rechts) / -1 (links), zyklisch. Liefert neuen Index. */
  nav(dir) {
    const n = this.items.length;
    if (n < 2) return this.index;
    // laufenden Crossfade hart beenden, bevor der nächste startet
    if (this.xfade < 1) { this.xfade = 1; this.settleFade(); }
    this.index = ((this.index + dir) % n + n) % n;
    const back = this.layers[1 - this.active];
    this.setLayerImage(back, this.items[this.index]);
    // neue Ebene ÜBER der alten zeichnen und einfaden
    back.renderOrder = -19;
    this.layers[this.active].renderOrder = -20;
    this.xfade = 0;
    return this.index;
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

    // --- Parallax + reversibles Edge-Lock (pro Achse) ---------------------------
    const cam = this.frame.getCamLocal(_camL);
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
   FigureFlip — Sprung der Figur zur Kartenmitte + Hinlegen (plan zur Karte).
   ============================================================================= */
export class FigureFlip {
  constructor(nodes) {
    this.nodes = nodes;
    this.active = false;
    this.flat = false;      // liegt die Figur gerade (Einblick-Modus)?
    this.t = 0;
    this.from = null;
    this.to = null;
    this.targetFlat = false;
    this.onDone = null;
  }
  toFlat(onDone) { this.start(true, onDone); }
  toUpright(onDone) { this.start(false, onDone); }

  start(toFlat, onDone) {
    const el = this.nodes.FigureRoot;
    const home = this.nodes.FIGURE_HOME.pos;
    this.active = true;
    this.targetFlat = toFlat;
    this.t = 0;
    this.onDone = onDone ?? null;
    this.from = {
      x: el.position.x, y: el.position.y, z: el.position.z,
      rx: el.rotation.x, ry: normalizeAngle(el.rotation.y),
    };
    this.to = toFlat
      ? { x: 0, y: PORTAL.flatY, z: 0, rx: -Math.PI / 2, ry: 0 }
      : { x: home.x, y: home.y, z: home.z, rx: 0, ry: 0 };
  }

  tick(dt) {
    if (!this.active) return;
    this.t += dt;
    const k = Math.min(1, this.t / Math.max(0.05, PORTAL.flipSec));
    const e = k * k * (3 - 2 * k); // smoothstep
    const el = this.nodes.FigureRoot;
    el.position.x = THREE.MathUtils.lerp(this.from.x, this.to.x, e);
    el.position.z = THREE.MathUtils.lerp(this.from.z, this.to.z, e);
    el.position.y = THREE.MathUtils.lerp(this.from.y, this.to.y, e)
      + Math.sin(Math.PI * k) * PORTAL.flipHeight;
    el.rotation.x = THREE.MathUtils.lerp(this.from.rx, this.to.rx, e);
    el.rotation.y = THREE.MathUtils.lerp(this.from.ry, this.to.ry, e);
    if (k >= 1) {
      this.active = false;
      this.flat = this.targetFlat;
      el.position.set(this.to.x, this.to.y, this.to.z);
      el.rotation.x = this.to.rx;
      el.rotation.y = this.to.ry;
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    }
  }

  /* Replay-Reset: hart aufrecht; Position setzt CardController.replay. */
  reset() {
    this.active = false;
    this.flat = false;
    this.onDone = null;
    this.nodes.FigureRoot.rotation.x = 0;
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
