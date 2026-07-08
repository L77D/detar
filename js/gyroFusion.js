/* =============================================================================
   DETAR — GyroFusion: liest die Geräte-Rotation (deviceorientation, ~60 Hz)
   und liefert pro Frame das ROTATIONS-DELTA der Kamera im Kamera-Frame.

   Wozu: Das Handy-Gyroskop ist butterweich und latenzfrei, MindARs visuelle
   Pose ist verrauscht und ~15–30 Hz. Der PoseStabilizer nutzt das Delta als
   PREDICTION (echte Handy-Bewegung wird sofort übernommen, das Sehen muss
   nur noch den langsamen Drift korrigieren → Filter darf viel härter
   glätten, ohne dass die Figur nachzieht) und als BRÜCKE bei kurzem
   Tracking-Verlust (Figur klebt gyro-geführt auf der Karte statt zu
   verschwinden).

   Frames: W3C-Gerätekoordinaten (X rechts, Y Bildschirm-oben, Z aus dem
   Display) entsprechen im Portrait exakt dem three.js-Kamera-Frame der
   Rückkamera (X rechts, Y hoch, Blick entlang −Z). Für DELTAS genügt die
   Konjugation mit der Screen-Orientation-Drehung um Z.

   Fail-safe: keine Permission / keine Events / stale Daten → getDelta()
   liefert null, alles läuft wie ohne Gyro. Kill-Switch: ?nogyro.
   ============================================================================= */
import * as THREE from "three";

const DEG = Math.PI / 180;
const _qNew = new THREE.Quaternion();
const _qScreen = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

/* deviceorientation (alpha,beta,gamma; intrinsisch Z-X'-Y'') → Quaternion */
function quatFromEuler(alpha, beta, gamma, out) {
  const _x = beta * DEG, _y = gamma * DEG, _z = alpha * DEG;
  const cX = Math.cos(_x / 2), cY = Math.cos(_y / 2), cZ = Math.cos(_z / 2);
  const sX = Math.sin(_x / 2), sY = Math.sin(_y / 2), sZ = Math.sin(_z / 2);
  out.set(
    sX * cY * cZ - cX * sY * sZ,
    cX * sY * cZ + sX * cY * sZ,
    cX * cY * sZ + sX * sY * cZ,
    cX * cY * cZ - sX * sY * sZ
  );
  return out;
}

export class GyroFusion {
  constructor() {
    this.active = false;        // Events kommen an
    this.enabled = false;       // enable() gelaufen + erlaubt
    this.qCur = new THREE.Quaternion();   // Kamera-Orientierung (Welt)
    this.qPrev = new THREE.Quaternion();
    this.hasPrev = false;
    this.lastEventMs = 0;
    this.delta = new THREE.Quaternion();
    this._onEvent = (e) => this.handle(e);
  }

  /* MUSS aus einer User-Geste heraus laufen (iOS-Permission). */
  async enable() {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== "granted") return false;
      }
      window.addEventListener("deviceorientation", this._onEvent, true);
      this.enabled = true;
      return true;
    } catch (e) {
      return false; // kein Gyro / verweigert → App läuft ohne
    }
  }

  handle(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    quatFromEuler(e.alpha, e.beta, e.gamma, _qNew);
    // Screen-Orientation rausdrehen (Landscape etc.): Rotation um Geräte-Z
    const ang = (screen.orientation?.angle ?? window.orientation ?? 0) || 0;
    if (ang !== 0) {
      _qScreen.setFromAxisAngle(_zAxis, -ang * DEG);
      _qNew.multiply(_qScreen);
    }
    this.qCur.copy(_qNew);
    this.lastEventMs = performance.now();
    this.active = true;
  }

  /* Kamera-Rotations-Delta seit dem letzten Aufruf, im KAMERA-Frame.
     null = kein (frisches) Gyro-Signal → Aufrufer arbeitet rein visuell. */
  getDelta() {
    if (!this.enabled || !this.active) return null;
    if (performance.now() - this.lastEventMs > 250) { this.hasPrev = false; return null; }
    if (!this.hasPrev) {
      this.qPrev.copy(this.qCur);
      this.hasPrev = true;
      return null;
    }
    // Δ = qPrev⁻¹ ⊗ qCur (relative Drehung im Geräte-/Kamera-Frame)
    this.delta.copy(this.qPrev).invert().multiply(this.qCur);
    this.qPrev.copy(this.qCur);
    return this.delta;
  }

  dispose() {
    window.removeEventListener("deviceorientation", this._onEvent, true);
  }
}
