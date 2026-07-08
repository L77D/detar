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
import { STAB } from "./config.js";

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function finiteVec(v) { return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
function finiteQuat(q) { return Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w); }

export class PoseStabilizer {
  /**
   * @param source anchor.group (MindAR schreibt hier die rohe Pose rein)
   * @param target stabRoot (eigene Group auf Szenen-Ebene, trägt die Figur)
   */
  constructor(source, target) {
    this.source = source;
    this.target = target;
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
  }

  onFound() {
    const now = performance.now();
    // Nach längerem Verlust auf die neue Pose SNAPPEN statt über den halben
    // Bildschirm zu gleiten (und keinen riesigen Geschwindigkeits-Spike in
    // den One-Euro-Zustand geben).
    if (this.everVisible && now - this.lastSeenMs > STAB.lostHoldMs) {
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

    // --- Lost-Hold: letzte gute Pose kurz halten, dann ausblenden ------------
    if (this.tracking) this.lastSeenMs = now;
    if (!this.tracking) {
      if (this.everVisible && now - this.lastSeenMs > STAB.lostHoldMs) {
        this.target.visible = false;
      }
      return; // Pose eingefroren — nie aus einem Lost-Frame lesen (NaN-Quelle)
    }

    // --- Rohe kamera-relative Pose lesen + NaN-Schutz -------------------------
    this.source.matrix.decompose(_pos, _quat, _scale);
    if (!finiteVec(_pos) || !finiteQuat(_quat) || !finiteVec(_scale)) {
      return; // kaputter Frame → komplett verwerfen, letzte gute Pose steht
    }

    if (!this.initialised) {
      this.xPrev.copy(_pos);
      this.dxPrev.set(0, 0, 0);
      this.smoothPos.copy(_pos);
      this.smoothQuat.copy(_quat);
      this.lastScale.copy(_scale);
      this.initialised = true;
      this.write();
      return;
    }
    this.lastScale.copy(_scale);

    // --- One-Euro auf die Position (pro Achse) --------------------------------
    this.oneEuro(_pos, this.smoothPos, dt);

    // Dead-Zone: winzige Restbewegung verwerfen (Snap-to-still)
    if (this.smoothPos.distanceTo(this.xPrev) < STAB.posDeadZone) {
      this.smoothPos.copy(this.xPrev);
    } else {
      this.xPrev.copy(this.smoothPos);
    }

    // --- SLERP auf die Rotation ------------------------------------------------
    const angle = this.smoothQuat.angleTo(_quat);
    if (angle > STAB.rotDeadZone) {
      const t = Math.min(1, STAB.rotLerp * frameRatio);
      this.smoothQuat.slerp(_quat, t);
    }

    this.write();
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
    this.target.matrix.compose(this.smoothPos, this.smoothQuat, this.lastScale);
    this.target.matrixWorldNeedsUpdate = true;
  }
}
