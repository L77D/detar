/* =============================================================================
   DETAR — PoseStabilizer: entzittert die Marker-Pose, BEVOR die Figur sie
   erbt. Port des in Zapworks verifizierten Stabilizers (Stand 2026-07-02).

   MindAR-Vereinfachung: MindAR läuft im Kamera-Origin-Modus — die Kamera
   steht im Ursprung, `anchor.group.matrix` IST bereits die kamera-relative
   Karten-Pose. Das ist genau das Signal, das der Zapworks-Stabilizer erst
   per camWorld⁻¹ × trackerWorld rekonstruieren musste → hier direkt filtern.

   Architektur: die Figur hängt NICHT unter anchor.group (das MindAR roh
   bewegt + togglet), sondern unter einem eigenen `stabRoot` auf Szenen-Ebene.
   Pro Frame: anchor.group.matrix lesen → One-Euro (Position) + SLERP
   (Rotation), framerate-korrekt, Dead-Zone (Snap-to-still), Lost-Hold →
   in stabRoot.matrix schreiben. Sichtbarkeit steuert der Stabilizer selbst.

   NaN-SCHUTZ (Fix 2026-07-08): In den Frames um Tracking-Verlust kann MindAR
   degenerierte Matrizen liefern. Ein einziges NaN vergiftet über lerp/atan2
   dauerhaft alle Folgewerte — Symptom: Kopf/Bubble/Figur verschwinden bis
   zum Neuladen. Deshalb wird JEDE gelesene Pose auf Endlichkeit geprüft und
   ein kaputter Frame komplett verworfen.
   ============================================================================= */
import * as THREE from "three";
import { STAB, GYRO } from "./config.js";

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _dqInv = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _predQ = new THREE.Quaternion();

function finiteVec(v) { return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
function finiteQuat(q) { return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w); }

export class PoseStabilizer {
  /**
   * @param source anchor.group (MindAR schreibt hier die rohe Pose rein)
   * @param target stabRoot (eigene Group auf Szenen-Ebene, trägt die Figur)
   * @param gyro   optionale GyroFusion (Prediction + Lost-Brücke)
   */
  constructor(source, target, gyro = null) {
    this.source = source;
    this.target = target;
    this.gyro = gyro;
    this.target.matrixAutoUpdate = false;
    this.target.visible = false;

    // One-Euro-Zustand
    this.xPrev = new THREE.Vector3();
    this.dxPrev = new THREE.Vector3();
    this.initialised = false;
    this.smoothPos = new THREE.Vector3();
    this.smoothQuat = new THREE.Quaternion();
    this.lastScale = new THREE.Vector3(1, 1, 1);

    // Tracking-Status (Lost-Hold)
    this.tracking = false;
    this.everVisible = false;
    this.lastSeenMs = 0;
    this.lastClockMs = 0;

    // Bewegungs-Extrapolation: letzte ECHTE Messung + geschätzte Geschwindigkeit
    this.measPos = new THREE.Vector3();     // letzte neue Messung (Kartenbreiten)
    this.measQuat = new THREE.Quaternion();
    this.measT = 0;                         // Zeitpunkt der Messung
    this.vel = new THREE.Vector3();         // Kartenbreiten/s (geglättet)
    this.angVel = new THREE.Vector3();      // Achse*rad/s (geglättet)
    this.hasMeas = false;
  }

  onFound() {
    const now = performance.now();
    // Nur wenn die Figur schon AUSGEBLENDET war, auf die neue Pose snappen —
    // war sie noch sichtbar (Lost-Hold/Gyro-Brücke), weich weiterkorrigieren.
    if (this.everVisible && !this.target.visible) {
      this.initialised = false;
    }
    this.tracking = true;
    this.everVisible = true;
    this.lastSeenMs = now;
    this.target.visible = true;
  }

  onLost() {
    this.tracking = false;
  }

  tick() {
    const now = performance.now();
    let dtMs = this.lastClockMs ? now - this.lastClockMs : 1000 / STAB.refHz;
    this.lastClockMs = now;
    if (dtMs <= 0) dtMs = 1000 / STAB.refHz;
    const dt = dtMs / 1000;
    const frameRatio = (STAB.refHz * dtMs) / 1000;

    // Gyro-Delta JEDEN Frame abholen (hält den internen Zustand frisch).
    // null = KEIN frisches Signal (keine Permission / kein Sensor / stale).
    const dq = this.gyro?.getDelta() ?? null;

    // --- Lost-Hold / Gyro-Brücke ----------------------------------------------
    if (this.tracking) this.lastSeenMs = now;
    if (!this.tracking) {
      const since = now - this.lastSeenMs;
      if (dq && GYRO.enabled && this.everVisible && this.target.visible && since < GYRO.bridgeMs) {
        // Gyro-Brücke: Kamera-Drehung wird kompensiert — die Figur bleibt
        // (ungefähr) auf der KARTE, nicht am Bildschirm.
        this.applyCameraDelta(dq);
        this.write();
        return;
      }
      // FIX 2026-07-08 (Handy-Test): OHNE lebendes Gyro-Signal gibt es KEINE
      // lange Brücke — die eingefrorene Pose ist kamera-relativ und klebt am
      // BILDSCHIRM, sobald sich das Handy bewegt („Figur hängt im Bild").
      // Dann nur kurzer Flacker-Schutz (lostHoldMs), danach ausblenden.
      const holdMs = dq ? GYRO.bridgeMs : STAB.lostHoldMs;
      if (this.everVisible && since > holdMs) {
        this.target.visible = false;
      }
      return; // Pose eingefroren — nie aus einem Lost-Frame lesen (NaN-Quelle)
    }

    // --- Gyro-PREDICTION: echte Kamera-Drehung sofort übernehmen ---------------
    // Das Sehen muss dann nur noch Drift/Translation korrigieren → der Filter
    // darf hart glätten, ohne dass die Figur bei Bewegung nachzieht.
    if (dq && GYRO.enabled) this.applyCameraDelta(dq);

    // --- Rohe kamera-relative Pose lesen + NaN-Schutz -------------------------
    this.source.matrix.decompose(_pos, _quat, _scale);
    if (!finiteVec(_pos) || !finiteQuat(_quat) || !finiteVec(_scale) || _scale.x < 1e-8) {
      return; // kaputter Frame → komplett verwerfen, letzte gute Pose steht
    }

    // EINHEITEN-NORMIERUNG (Prüfstand-Befund 2026-07-08): MindARs Kamera-Raum
    // ist PIXEL-skaliert (Anchor-Scale ≈ Target-Pixelbreite, Position z. B.
    // z≈-4500). Gefiltert wird deshalb in KARTENBREITEN (pos / scale) — damit
    // sind posDeadZone/beta einheitenfest, egal wie groß das Target ist.
    _pos.divideScalar(_scale.x);

    // FIX 2026-07-08: Ist die gemessene Pose WEIT weg vom geglätteten Zustand
    // (Re-Found nach Drift/Brücke), sofort SNAPPEN statt sichtbar hinüberzugleiten.
    if (this.initialised &&
        (this.smoothPos.distanceTo(_pos) > STAB.snapDist ||
         this.smoothQuat.angleTo(_quat) > STAB.snapAngle)) {
      this.initialised = false;
    }

    if (!this.initialised) {
      this.xPrev.copy(_pos);
      this.dxPrev.set(0, 0, 0);
      this.smoothPos.copy(_pos);
      this.smoothQuat.copy(_quat);
      this.lastScale.copy(_scale);
      this.measPos.copy(_pos);
      this.measQuat.copy(_quat);
      this.measT = now;
      this.hasMeas = true;
      this.vel.set(0, 0, 0);
      this.angVel.set(0, 0, 0);
      this.initialised = true;
      this.write();
      return;
    }
    this.lastScale.copy(_scale);

    // --- Bewegungs-Extrapolation (2026-07-09) -----------------------------------
    // MindAR misst nur mit ~15–30 Hz; dazwischen wiederholt der Anchor die
    // alte Pose → Treppensignal beim Karte-Bewegen. Hier: neue Messungen
    // erkennen, Geschwindigkeit schätzen, und zwischen den Messungen die
    // Ziel-Pose mit dieser Geschwindigkeit WEITERFÜHREN (_pos/_quat werden
    // durch die Prediction ersetzt). `moving` schaltet zusätzlich die
    // Dead-Zones ab — ruhig in Ruhe, flüssig in Bewegung.
    this.updateMotionEstimate(now);
    const moving = this.applyExtrapolation(now);

    // --- One-Euro auf die Position (pro Achse) --------------------------------
    this.oneEuro(_pos, this.smoothPos, dt);

    // Dead-Zone: winzige Restbewegung verwerfen (nur im RUHE-Zustand)
    if (!moving && this.smoothPos.distanceTo(this.xPrev) < STAB.posDeadZone) {
      this.smoothPos.copy(this.xPrev);
    } else {
      this.xPrev.copy(this.smoothPos);
    }

    // --- SLERP auf die Rotation ------------------------------------------------
    const angle = this.smoothQuat.angleTo(_quat);
    if (angle > STAB.rotDeadZone || moving) {
      const t = Math.min(1, STAB.rotLerp * frameRatio);
      this.smoothQuat.slerp(_quat, t);
    }

    this.write();
  }

  /* Neue Vision-Messung erkennen (Pose unterscheidet sich von der letzten) und
     lineare + Winkel-Geschwindigkeit schätzen (geglättet, 50/50-Lerp). */
  updateMotionEstimate(now) {
    const dPos = _pos.distanceTo(this.measPos);
    const dAng = this.measQuat.angleTo(_quat);
    if (dPos < 1e-6 && dAng < 1e-6) return; // stale Frame — keine neue Messung
    const dtMeas = Math.min(0.5, Math.max(0.005, (now - this.measT) / 1000));

    // linear
    const vx = (_pos.x - this.measPos.x) / dtMeas;
    const vy = (_pos.y - this.measPos.y) / dtMeas;
    const vz = (_pos.z - this.measPos.z) / dtMeas;
    if (Number.isFinite(vx)) this.vel.lerp({ x: vx, y: vy, z: vz }, 0.5);

    // Winkel: dq = meas⁻¹ ⊗ neu → Achse*Winkel/Zeit (im Mess-lokalen Frame)
    _dq.copy(this.measQuat).invert().multiply(_quat);
    if (_dq.w < 0) { _dq.x *= -1; _dq.y *= -1; _dq.z *= -1; _dq.w *= -1; } // kürzester Weg
    const s = Math.sqrt(Math.max(0, 1 - _dq.w * _dq.w));
    if (s > 1e-6) {
      const ang = 2 * Math.acos(Math.min(1, _dq.w));
      _axis.set(_dq.x / s, _dq.y / s, _dq.z / s).multiplyScalar(ang / dtMeas);
      this.angVel.lerp(_axis, 0.5);
    } else {
      this.angVel.multiplyScalar(0.5);
    }

    this.measPos.copy(_pos);
    this.measQuat.copy(_quat);
    this.measT = now;
  }

  /* Zwischen den Messungen: Ziel-Pose (_pos/_quat) per Geschwindigkeit
     vorhersagen. Liefert true, wenn die Karte gerade als „in Bewegung" gilt. */
  applyExtrapolation(now) {
    const speed = this.vel.length();
    const angSpeed = this.angVel.length();
    const moving = speed > STAB.minSpeed || angSpeed > STAB.minAngSpeed;
    if (STAB.extrapolate === "nein" || !moving) return moving;
    const tp = Math.min(now - this.measT, STAB.extrapMaxMs) / 1000;
    if (tp <= 0) return moving;
    _pos.copy(this.measPos).addScaledVector(this.vel, tp);
    const ang = angSpeed * tp;
    if (ang > 1e-5) {
      _axis.copy(this.angVel).normalize();
      _predQ.setFromAxisAngle(_axis, ang);
      _quat.copy(this.measQuat).multiply(_predQ);
    }
    return moving;
  }

  /* Kamera hat sich um dq gedreht (Kamera-Frame) → Karten-Pose im Kamera-
     Frame entsprechend gegenrotieren: R' = dq⁻¹⊗R, p' = dq⁻¹·p. Wirkt auf
     den GEGLÄTTETEN Zustand + Filter-Historie (xPrev/dxPrev mitdrehen). */
  applyCameraDelta(dq) {
    // FIX 2026-07-08 („dezentes Zittern"): Sensor-Rauschen dead-banden.
    // deviceorientation zittert auf ruhigem Handy leicht (v. a. der Kompass-
    // Anteil in alpha) — ungefiltert übernommen wird daraus Pose-Jitter.
    // Winzige Deltas ignorieren (langsame Drehung korrigiert das Sehen ohnehin),
    // absurde Deltas (Sensor-Glitch) verwerfen.
    const ang = 2 * Math.acos(Math.min(1, Math.abs(dq.w)));
    if (ang < GYRO.deltaDeadZone || ang > GYRO.deltaMax) return;
    _dqInv.copy(dq).invert();
    this.smoothQuat.premultiply(_dqInv);
    this.smoothPos.applyQuaternion(_dqInv);
    this.xPrev.applyQuaternion(_dqInv);
    this.dxPrev.applyQuaternion(_dqInv);
    // Bewegungs-Schätzung mitdrehen (Kamera-Frame hat sich gedreht)
    this.measPos.applyQuaternion(_dqInv);
    this.measQuat.premultiply(_dqInv);
    this.vel.applyQuaternion(_dqInv);
  }

  oneEuro(targetV, out, dt) {
    for (const a of ["x", "y", "z"]) {
      const dxRaw = (targetV[a] - this.xPrev[a]) / Math.max(dt, 1e-4);
      const aD = this.alpha(dt, STAB.dCutoff);
      const dxHat = this.dxPrev[a] + aD * (dxRaw - this.dxPrev[a]);
      this.dxPrev[a] = dxHat;
      const cutoff = STAB.minCutoff + STAB.beta * Math.abs(dxHat);
      const aPos = this.alpha(dt, cutoff);
      out[a] = this.xPrev[a] + aPos * (targetV[a] - this.xPrev[a]);
    }
  }

  alpha(dt, cutoff) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  write() {
    // smoothPos ist in Kartenbreiten normiert → zurück in Anchor-Einheiten
    _pos.copy(this.smoothPos).multiplyScalar(this.lastScale.x);
    this.target.matrix.compose(_pos, this.smoothQuat, this.lastScale);
    this.target.matrixWorldNeedsUpdate = true;
  }
}
