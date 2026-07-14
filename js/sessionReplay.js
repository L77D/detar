/* =============================================================================
   DETAR — SessionReplay (?replay): spielt eine ?record-Aufnahme durch die
   UNVERÄNDERTE App. Kern-Trick: getUserMedia wird so gepatcht, dass es statt
   der Kamera `videoEl.captureStream()` der Aufnahmedatei liefert — MindAR,
   PoseStabilizer, Choreographie … laufen exakt wie live, nur mit konserviertem
   Bild. Die aufgezeichneten deviceorientation-Events werden zeitsynchron zur
   Video-Position wieder als echte Events dispatcht (GyroFusion hört auf window
   und merkt keinen Unterschied).

   Bedienung (Desktop-Browser): …/?replay&stats — Video (+ optional Gyro-JSON)
   im Splash wählen, dann normal „Start". Am Video-Ende wird die Metrik-
   Zusammenfassung (MetricsCollector) automatisch als JSON angeboten.

   Grenzen (bewusst): Die Vision läuft weiter in Echtzeit auf der jeweiligen
   Maschine — Läufe sind auf DERSELBEN Maschine vergleichbar, nicht bit-exakt
   reproduzierbar. Für A/B von Engine-/Filter-Änderungen reicht das.
   ============================================================================= */

export class SessionReplay {
  constructor() {
    this.videoEl = document.createElement("video");
    this.videoEl.muted = true;
    this.videoEl.playsInline = true;
    this.videoEl.style.display = "none";
    document.body.appendChild(this.videoEl);
    this.gyro = [];
    this.gyroIdx = 0;
    this.onEnded = null; // wird von main.js gesetzt (Metrik-Dump)
    this.ready = false;
    this.buildUi();
  }

  buildUi() {
    const cta = document.querySelector(".splash-cta") || document.body;
    this.box = document.createElement("div");
    this.box.style.cssText =
      "margin-bottom:10px;padding:8px;border:1px dashed #888;border-radius:8px;" +
      "font:11px/1.8 monospace;color:#fff;text-align:left";
    this.box.innerHTML = "<b>REPLAY-MODUS</b><br>";
    const mkInput = (label, accept, cb) => {
      const l = document.createElement("label");
      l.style.display = "block";
      l.textContent = label + " ";
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = accept;
      inp.onchange = () => inp.files[0] && cb(inp.files[0]);
      l.appendChild(inp);
      this.box.appendChild(l);
    };
    mkInput("Video:", "video/*", (f) => this.loadVideo(f));
    mkInput("Gyro-JSON:", "application/json", (f) => this.loadGyro(f));
    cta.insertBefore(this.box, cta.firstChild);
  }

  loadVideo(file) {
    this.videoEl.src = URL.createObjectURL(file);
    this.videoEl.addEventListener("loadedmetadata", () => { this.ready = true; }, { once: true });
    // getUserMedia → captureStream der Datei. Der CAM-Constraint-Patch aus
    // main.js wrappt DIESE Funktion — seine ideal-Constraints laufen hier
    // wirkungslos durch (gewollt: die Aufnahme bestimmt die Auflösung).
    navigator.mediaDevices.getUserMedia = async () => {
      await this.videoEl.play(); // startet Wiedergabe = startet die "Kamera"
      this.startGyroPump();
      this.videoEl.addEventListener("ended", () => this.onEnded && this.onEnded(), { once: true });
      return this.videoEl.captureStream();
    };
  }

  async loadGyro(file) {
    const meta = JSON.parse(await file.text());
    this.gyro = meta.gyro ?? [];
    this.gyroIdx = 0;
  }

  /* Events zeitsynchron zur Video-Position dispatchen (t in ms ab Aufnahmestart
     ≈ Video-t0). DeviceOrientationEvent-Konstruktor, Fallback generisches Event
     mit aufgesetzten Feldern (GyroFusion liest nur e.alpha/beta/gamma). */
  startGyroPump() {
    const pump = () => {
      const tMs = this.videoEl.currentTime * 1000;
      while (this.gyroIdx < this.gyro.length && this.gyro[this.gyroIdx].t <= tMs) {
        const g = this.gyro[this.gyroIdx++];
        let ev;
        try {
          ev = new DeviceOrientationEvent("deviceorientation", { alpha: g.a, beta: g.b, gamma: g.g });
        } catch (e) {
          ev = new Event("deviceorientation");
          Object.assign(ev, { alpha: g.a, beta: g.b, gamma: g.g });
        }
        window.dispatchEvent(ev);
      }
      if (!this.videoEl.ended) requestAnimationFrame(pump);
    };
    requestAnimationFrame(pump);
  }
}
