/* =============================================================================
   DETAR — SessionRecorder (?record): zeichnet am Gerät den KAMERASTREAM
   (MediaRecorder → webm/mp4, je nach Browser) und parallel die
   deviceorientation-Events (JSON, Zeit relativ zum Aufnahmestart) auf.

   Zweck (Strategie E, Prüfstand): echte Sessions konservieren und später am
   Desktop per ?replay deterministisch-vergleichbar durch die Tracking-
   Pipeline spielen — Änderungen an Engine/Filtern werden damit an IDENTISCHEM
   Material messbar statt am Daumengefühl.

   Standard-Szenen für Aufnahmen (je ~15 s): 1 Ruhe auf Tisch · 2 langsames
   Schieben · 3 schnelles Schieben · 4 Kippen · 5 Verlust/Wiederfinden.

   UI: kleine Bar unten links — ● REC / ■ STOP, danach Download-Links für
   Video + Gyro-JSON (iOS: landet in „Dateien").
   ============================================================================= */

export class SessionRecorder {
  /** @param stream MediaStream der Kamera (mindarThree.video.srcObject) */
  constructor(stream) {
    this.stream = stream;
    this.rec = null;
    this.chunks = [];
    this.gyro = [];
    this.t0 = 0;
    this.mime =
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
        .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
    this._onGyro = (e) => {
      if (e.alpha == null) return;
      this.gyro.push({
        t: Math.round(performance.now() - this.t0),
        a: e.alpha, b: e.beta, g: e.gamma,
      });
    };
    this.buildUi();
  }

  buildUi() {
    this.box = document.createElement("div");
    this.box.style.cssText =
      "position:fixed;bottom:calc(8px + env(safe-area-inset-bottom));left:8px;z-index:60;" +
      "background:rgba(0,0,0,0.72);border-radius:8px;padding:8px 10px;" +
      "font:11px/1.6 monospace;color:#0f0";
    this.btn = document.createElement("button");
    this.btn.style.cssText =
      "font:bold 11px monospace;border:none;border-radius:6px;padding:5px 10px;" +
      "cursor:pointer;background:#f33;color:#fff";
    this.btn.textContent = "● REC";
    this.btn.onclick = () => (this.rec ? this.stop() : this.start());
    this.links = document.createElement("div");
    this.box.appendChild(this.btn);
    this.box.appendChild(this.links);
    document.body.appendChild(this.box);
    if (!window.MediaRecorder) {
      this.btn.disabled = true;
      this.btn.textContent = "MediaRecorder fehlt";
    }
  }

  start() {
    this.chunks = [];
    this.gyro = [];
    this.links.textContent = "";
    this.t0 = performance.now();
    this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => this.offerDownloads();
    this.rec.start(1000); // 1-s-Chunks: robust gegen Tab-Abwürgen
    window.addEventListener("deviceorientation", this._onGyro, true);
    this.btn.textContent = "■ STOP";
    this.btn.style.background = "#555";
  }

  stop() {
    window.removeEventListener("deviceorientation", this._onGyro, true);
    this.rec.stop();
    this.rec = null;
    this.btn.textContent = "● REC";
    this.btn.style.background = "#f33";
  }

  offerDownloads() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const ext = this.mime.includes("mp4") ? "mp4" : "webm";
    const videoBlob = new Blob(this.chunks, { type: this.mime || "video/webm" });
    const meta = {
      recordedAt: new Date().toISOString(),
      ua: navigator.userAgent,
      videoTrack: this.stream.getVideoTracks()[0]?.getSettings?.() ?? null,
      screenAngle: (screen.orientation && screen.orientation.angle) || 0,
      gyro: this.gyro,
    };
    const jsonBlob = new Blob([JSON.stringify(meta)], { type: "application/json" });
    this.links.innerHTML = "";
    for (const [blob, name, label] of [
      [videoBlob, `detar-session-${stamp}.${ext}`, "Video sichern"],
      [jsonBlob, `detar-session-${stamp}.json`, "Gyro sichern"],
    ]) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.textContent = "↓ " + label;
      a.style.cssText = "display:block;color:#ffdd00";
      this.links.appendChild(a);
    }
  }
}
