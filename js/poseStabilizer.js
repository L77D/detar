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
    this.measPos = new THREE.Vector3();     // letzte neue Messung (Kartenbreiten,
                                            // wird von der Gyro-Prediction MITGEDREHT)
    this.measQuat = new THREE.Quaternion();
    this.measT = 0;                         // Zeitpunkt der Messung
    this.vel = new THREE.Vector3();         // Kartenbreiten/s (geglättet)
    this.angVel = new THREE.Vector3();      // Achse*rad/s (geglättet)
    this.hasMeas = false;

    // FIX 2026-07-13: Stale-Erkennung braucht die UNGEDREHTE Rohpose. measPos
    // wird vom Gyro mitrotiert — der Vergleich damit meldete bei Handy-Drehung
    // jeden stale Frame als „neue Messung" (Mini-dt, Rückwärts-Geschwindigkeit)
    // und vergiftete die Bewegungsschätzung.
    this.rawPrev = new THREE.Vector3();
    this.rawPrevQ = new THREE.Quaternion();
    this.hasRaw = false;

    // Bewegt-Zustand mit Hysterese + Verweilzeit (statt binärem Flackern)
    this.moving = false;
    this.lastAboveMs = 0;

    // DRIFT-Detektor (Fix 2026-07-13): „bewegt sich" wird an der Verschiebung
    // über ein ~250-ms-Fenster gemessen, nicht an der Momentan-Geschwindigkeit.
    // Hand-Tremor pendelt um einen Punkt (Drift ≈ 0), echte Bewegung
    // akkumuliert Strecke — Momentan-Geschwindigkeit kann beides nicht
    // unterscheiden (Tremor erreicht kurzzeitig hohe Werte).
    this.snapOld = { p: new THREE.Vector3(), q: new THREE.Quaternion(), t: 0, ok: false };
    this.snapNew = { p: new THREE.Vector3(), q: new THREE.Quaternion(), t: 0, ok: false };
    this.driftSpeed = 0;
    this.driftAngSpeed = 0;

    // Vision-Messrate (für ?stats)
    this.measCount = 0;
    this.hzWindowT = 0;
    this.visionHz = null;
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

    const gyroOn = GYRO.enabled !== "nein";

    // --- Lost-Hold / Gyro-Brücke ----------------------------------------------
    if (this.tracking) this.lastSeenMs = now;
    if (!this.tracking) {
      const since = now - this.lastSeenMs;
      if (dq && gyroOn && this.everVisible && this.target.visible && since < GYRO.bridgeMs) {
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
      const holdMs = STAB.lostHold === "nein" ? 0 : (dq ? GYRO.bridgeMs : STAB.lostHoldMs);
      if (this.everVisible && since > holdMs) {
        this.target.visible = false;
      }
      return; // Pose eingefroren — nie aus einem Lost-Frame lesen (NaN-Quelle)
    }

    // --- FEATURE-SCHALTER #1: Stabilizer komplett aus → rohe Anchor-Pose 1:1 ---
    if (STAB.enabled === "nein") {
      this.target.matrix.copy(this.source.matrix);
      this.target.matrixWorldNeedsUpdate = true;
      this.initialised = false; // beim Wieder-Einschalten sauber neu aufsetzen
      return;
    }

    // --- Gyro-PREDICTION: echte Kamera-Drehung sofort übernehmen ---------------
    // Das Sehen muss dann nur noch Drift/Translation korrigieren → der Filter
    // darf hart glätten, ohne dass die Figur bei Bewegung nachzieht.
    if (dq && gyroOn) this.applyCameraDelta(dq);

    // --- Rohe kamera-relative Pose lesen + NaN-Schutz (#5) ----------------------
    this.source.matrix.decompose(_pos, _quat, _scale);
    if (STAB.nanGuard !== "nein" &&
        (!finiteVec(_pos) || !finiteQuat(_quat) || !finiteVec(_scale) || _scale.x < 1e-8)) {
      return; // kaputter Frame → komplett verwerfen, letzte gute Pose steht
    }

    // EINHEITEN-NORMIERUNG (#2, Prüfstand-Befund 2026-07-08): MindARs Kamera-
    // Raum ist PIXEL-skaliert (Anchor-Scale ≈ Target-Pixelbreite, Position
    // z. B. z≈-4500). Gefiltert wird deshalb in KARTENBREITEN (pos / scale) —
    // damit sind posDeadZone/beta einheitenfest, egal wie groß das Target ist.
    if (STAB.normalize !== "nein") _pos.divideScalar(_scale.x);

    // Snap-Logik (#6) ist 2026-07-13 in updateMotionEstimate gewandert:
    // sie wird nur noch auf NEUE Messungen angewandt und braucht ZWEI
    // aufeinanderfolgende ferne Messungen (Ausreißer-Debounce) — eine einzelne
    // Fehl-Messung unter Bewegungsunschärfe teleportierte sonst die Figur
    // („mal schräg, mal doppelt so groß").

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
      this.rawPrev.copy(_pos);
      this.rawPrevQ.copy(_quat);
      this.hasRaw = true;
      this.vel.set(0, 0, 0);
      this.angVel.set(0, 0, 0);
      this.moving = false;
      this.snapOld.ok = false;
      this.snapNew.ok = false;
      this.driftSpeed = 0;
      this.driftAngSpeed = 0;
      this.farCount = 0;
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

    // Dead-Zone (#3): winzige Restbewegung verwerfen (nur im RUHE-Zustand)
    const dzOn = STAB.deadZones !== "nein";
    if (dzOn && !moving && this.smoothPos.distanceTo(this.xPrev) < STAB.posDeadZone) {
      this.smoothPos.copy(this.xPrev);
    } else {
      this.xPrev.copy(this.smoothPos);
    }

    // --- ADAPTIVE Rotations-Glättung (One-Euro-Prinzip, 2026-07-13) -------------
    // Vorher fixer SLERP-Faktor: ließ in Ruhe 35 % des Rotations-Rauschens
    // durch und hing bei schnellen Drehungen nach. Jetzt: Cutoff wächst mit
    // der gemessenen Winkelgeschwindigkeit — Ruhe = dicht, Drehung = wach.
    const angle = this.smoothQuat.angleTo(_quat);
    if (angle > STAB.rotDeadZone || moving || !dzOn) {
      const rotCutoff = STAB.rotMinCutoff + STAB.rotBeta * this.angVel.length();
      const t = Math.min(1, this.alpha(dt, rotCutoff));
      this.smoothQuat.slerp(_quat, t);
    }

    this.write();
  }

  /* Neue Vision-Messung erkennen (ROHPOSE unterscheidet sich von der letzten —
     ungedreht, damit die Gyro-Prediction keine Fehl-Messungen erzeugt) und
     lineare + Winkel-Geschwindigkeit schätzen (geglättet, 50/50-Lerp).
     Die Geschwindigkeit selbst wird gegen die GYRO-KOMPENSIERTE measPos
     gerechnet — Kamera-Drehung ist damit herausgerechnet, übrig bleibt die
     echte Karten-Bewegung. */
  updateMotionEstimate(now) {
    // Vision-Hz-Fenster (für ?stats)
    if (now - this.hzWindowT > 1000) {
      this.visionHz = this.measCount;
      this.measCount = 0;
      this.hzWindowT = now;
    }

    const isNew = !this.hasRaw ||
      _pos.distanceTo(this.rawPrev) > 1e-6 || this.rawPrevQ.angleTo(_quat) > 1e-6;
    this.rawPrev.copy(_pos);
    this.rawPrevQ.copy(_quat);
    this.hasRaw = true;
    if (!isNew) return; // stale Frame — MindAR hat nicht neu gemessen
    this.measCount++;

    // AUSREISSER-DEBOUNCE + Snap (#6, 2026-07-13): Messung weit weg vom
    // Glättungszustand? EINE solche Messung ist meist ein Fehlgriff unter
    // Bewegungsunschärfe → verwerfen (weder Geschwindigkeit noch Snap daraus).
    // Erst die ZWEITE ferne Messung in Folge gilt als echt (Re-Found nach
    // Drift) → Filter snappt neu auf.
    const far = this.smoothPos.distanceTo(_pos) > STAB.snapDist ||
                this.smoothQuat.angleTo(_quat) > STAB.snapAngle;
    if (far) {
      this.farCount = (this.farCount ?? 0) + 1;
      if (this.farCount >= 2 && STAB.snap !== "nein") {
        this.initialised = false; // nächster Tick setzt hart neu auf
      }
      return; // Ausreißer (oder Snap folgt) — Messung nicht in vel/meas übernehmen
    }
    this.farCount = 0;

    const dtMeas = Math.min(0.5, Math.max(0.02, (now - this.measT) / 1000));

    // RAUSCH-SCHWELLE (Fix 2026-07-13): Verschiebungen unterhalb der Dead-Zone
    // sind Mess-Rauschen — daraus KEINE Geschwindigkeit schätzen, sondern die
    // Schätzung abklingen lassen. Sonst hält Ruhe-Rauschen den Bewegt-Modus
    // fälschlich am Leben und die Latenz-Kompensation VERSTÄRKT das Rauschen.
    const dPosMeas = _pos.distanceTo(this.measPos);
    if (dPosMeas > STAB.posDeadZone) {
      const vx = (_pos.x - this.measPos.x) / dtMeas;
      const vy = (_pos.y - this.measPos.y) / dtMeas;
      const vz = (_pos.z - this.measPos.z) / dtMeas;
      if (Number.isFinite(vx)) this.vel.lerp({ x: vx, y: vy, z: vz }, 0.5);
      // Spike-Kappe: mehr als maxSpeed ist keine Hand mehr, sondern Messfehler
      if (this.vel.length() > STAB.maxSpeed) this.vel.setLength(STAB.maxSpeed);
    } else {
      this.vel.multiplyScalar(0.5);
    }

    // Winkel: dq = meas⁻¹ ⊗ neu → Achse*Winkel/Zeit (im Mess-lokalen Frame)
    _dq.copy(this.measQuat).invert().multiply(_quat);
    if (_dq.w < 0) { _dq.x *= -1; _dq.y *= -1; _dq.z *= -1; _dq.w *= -1; } // kürzester Weg
    const s = Math.sqrt(Math.max(0, 1 - _dq.w * _dq.w));
    const angMeas = 2 * Math.acos(Math.min(1, _dq.w));
    if (s > 1e-6 && angMeas > STAB.rotDeadZone) {
      _axis.set(_dq.x / s, _dq.y / s, _dq.z / s).multiplyScalar(angMeas / dtMeas);
      this.angVel.lerp(_axis, 0.5);
      if (this.angVel.length() > STAB.maxAngSpeed) this.angVel.setLength(STAB.maxAngSpeed);
    } else {
      this.angVel.multiplyScalar(0.5);
    }

    this.measPos.copy(_pos);
    this.measQuat.copy(_quat);
    this.measT = now;

    // Drift-Fenster fortschreiben (Snapshots alle ~250 ms)
    if (!this.snapNew.ok) {
      this.snapNew.p.copy(_pos); this.snapNew.q.copy(_quat);
      this.snapNew.t = now; this.snapNew.ok = true;
    } else if (now - this.snapNew.t > 250) {
      this.snapOld.p.copy(this.snapNew.p); this.snapOld.q.copy(this.snapNew.q);
      this.snapOld.t = this.snapNew.t; this.snapOld.ok = true;
      this.snapNew.p.copy(_pos); this.snapNew.q.copy(_quat); this.snapNew.t = now;
    }
    if (this.snapOld.ok) {
      const dtW = Math.max(0.1, (now - this.snapOld.t) / 1000);
      // Geglättet (EMA): einzelne Tremor-Spitzen am Fensterrand dürfen den
      // Bewegt-Modus nicht zünden; echte Bewegung hebt das Signal in ~200 ms.
      this.driftSpeed += (_pos.distanceTo(this.snapOld.p) / dtW - this.driftSpeed) * 0.25;
      this.driftAngSpeed += (this.snapOld.q.angleTo(_quat) / dtW - this.driftAngSpeed) * 0.25;
    }
  }

  /* Zwischen den Messungen: Ziel-Pose (_pos/_quat) per Geschwindigkeit
     vorhersagen. Liefert true, wenn die Karte gerade als „in Bewegung" gilt.

     HYSTERESE + VERWEILZEIT (2026-07-13): Einschalten ab minSpeed, Ausschalten
     erst unter der HALBEN Schwelle UND nachdem moveDwellMs lang keine
     Bewegung mehr über der Einschalt-Schwelle war — kein Regime-Flackern an
     der Grenze mehr (das war das „produziert zu schnell wieder Zittern").

     LATENZ-KOMPENSATION (2026-07-13): Jede Vision-Messung ist bei Ankunft
     schon ~latencyMs alt (Verarbeitungszeit) — die Prediction rechnet dieses
     Alter mit ein, sonst läuft die Figur der Karte konstant hinterher. */
  applyExtrapolation(now) {
    // Bewegt-Entscheidung über die FENSTER-DRIFT (tremor-fest), nicht über
    // die Momentan-Geschwindigkeit (die dient nur der Vorhersage selbst).
    const speed = this.driftSpeed;
    const angSpeed = this.driftAngSpeed;
    const above = speed > STAB.minSpeed || angSpeed > STAB.minAngSpeed;
    if (above) {
      this.moving = true;
      this.lastAboveMs = now;
    } else if (this.moving && now - this.lastAboveMs > STAB.moveDwellMs) {
      // Rückfall: dwellMs lang KEIN Überschreiten mehr → zurück in Ruhe.
      // (Kein „Band-Halten" mehr — das hielt den Bewegt-Modus bei Tremor
      // dauerhaft fest, Diagnose 2026-07-13: 100 % Bewegt-Quote in Ruhe.)
      this.moving = false;
    }
    const moving = this.moving;
    if (STAB.extrapolate === "nein" || !moving) return moving;
    const tp = (Math.min(now - this.measT, STAB.extrapMaxMs) + STAB.latencyMs) / 1000;
    if (tp <= 0) return moving;
    // VORHERSAGE-KAPPEN (2026-07-13): Strecke und Winkel der Prediction hart
    // begrenzen — ein Überschwinger Richtung Kamera wirkt sonst wie eine
    // Größen-Explosion der Figur, ein Winkel-Überschwinger wie Schrägstand.
    const dist = Math.min(this.vel.length() * tp, STAB.extrapMaxDist);
    if (dist > 1e-7 && this.vel.lengthSq() > 0) {
      _axis.copy(this.vel).normalize();
      _pos.copy(this.measPos).addScaledVector(_axis, dist);
    }
    const ang = Math.min(this.angVel.length() * tp, STAB.extrapMaxAngle);
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
    // Bewegungs-Schätzung + Drift-Snapshots mitdrehen (Kamera-Frame gedreht)
    this.measPos.applyQuaternion(_dqInv);
    this.measQuat.premultiply(_dqInv);
    this.vel.applyQuaternion(_dqInv);
    if (this.snapOld.ok) { this.snapOld.p.applyQuaternion(_dqInv); this.snapOld.q.premultiply(_dqInv); }
    if (this.snapNew.ok) { this.snapNew.p.applyQuaternion(_dqInv); this.snapNew.q.premultiply(_dqInv); }
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
    _pos.copy(this.smoothPos);
    if (STAB.normalize !== "nein") _pos.multiplyScalar(this.lastScale.x);
    this.target.matrix.compose(_pos, this.smoothQuat, this.lastScale);
    this.target.matrixWorldNeedsUpdate = true;
  }
}
