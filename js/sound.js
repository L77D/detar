/* =============================================================================
   DETAR — SoundDesign: prozedurale UI-Sounds über tiks (js/vendor/tiks.js,
   vendored — kein CDN, keine Audio-Dateien, reine Web-Audio-Synthese).

   EIN semantisches Vokabular statt roher tiks-Aufrufe: Aufrufer sagen WAS
   passiert (cardFound, popIn, questionTap …), die Zuordnung zu tiks-Sounds
   lebt NUR hier — Klang-Umbau = nur diese Datei anfassen.

   INIT MUSS IN DER USER-GESTE PASSIEREN (START-Button, vor allen awaits):
   tiks legt den AudioContext bei der ersten Geste an — gleiche Regel wie die
   iOS-Gyro-Permission (siehe main.js boot()).

   Alle Methoden sind crash-safe: ohne init() oder mit SOUND.enabled="nein"
   sind sie stille No-Ops — die App läuft auch komplett ohne Sound.
   ============================================================================= */
import { createTiks } from "./vendor/tiks.js";
import { SOUND } from "./config.js";
import { VoiceSynth } from "./voice.js";

class SoundDesign {
  constructor() {
    this.engine = null;
    this.voice = null;
    this._lastTypeTick = 0;
    this._probeTimer = null;
  }

  /* In der START-Geste rufen. Idempotent. */
  init() {
    if (this.engine) return;
    try {
      this.engine = createTiks({
        theme: SOUND.theme,
        volume: SOUND.volume,
        // Bewusst false: die Demo soll nie "stumm ohne Erklärung" wirken, weil
        // auf einem Test-Gerät "Bewegung reduzieren" aktiv ist. Sounds sind
        // ohnehin additiv (alles hat visuelles Feedback).
        respectReducedMotion: false,
        // Eigene Drosselung in typeTick() (SOUND.typeTickMs) — tiks' internen
        // 80-ms-Hover-Throttle abschalten, sonst gewinnt immer der längere.
        hoverThrottleMs: 0,
      });
    } catch (e) {
      console.warn("Sound nicht verfügbar:", e);
    }
    // Stimme (eigener AudioContext) — ebenfalls in der Geste entsperren
    this.voice = new VoiceSynth();
    this.voice.init();
  }

  get on() {
    return this.engine !== null && SOUND.enabled !== "nein";
  }

  /* Dev-Panel-Hooks (Regler schreiben in SOUND, dann diese anwenden). */
  applyVolume() { this.engine?.setVolume(SOUND.volume); this.voice?.applyVolume(); }
  applyTheme() { this.engine?.setTheme(SOUND.theme); }

  /* ---- Ereignis-Vokabular ------------------------------------------------- */
  uiTap()       { if (this.on) this.engine.click(); }        // START-Button
  cardFound()   { if (this.on) this.engine.notify(); }       // Karte erkannt → Aktivier-Phase
  cardTapped()  { if (this.on) this.engine.swoosh(); }       // Tap auf die Karte → Burst
  popIn()       { if (this.on) this.engine.pop(); }          // Figur ploppt auf
  uiReveal()    { if (this.on) this.engine.success(); }      // Menü fährt ein (Begrüßung fertig)
  questionTap() { if (this.on) this.engine.click(); }        // Frage-Button
  tab(einblick) { if (this.on) this.engine.toggle(einblick); } // Tab-Wechsel (Einblick = an)
  gallery()     { if (this.on) this.engine.swoosh(); }       // Galerie blättern (Pfeile + 3D-Tabs)
  figureJump()  { if (this.on) this.engine.pop(); }          // Figur-Tap: Hüpfer zur Mitte

  /* Bubble-Text-Vertonung: der Typewriter liefert die frisch enthüllten
     Zeichen. Modus über SOUND.speech: "silben" (Animalese-Stimme, js/voice.js),
     "ticks" (alte abstrakte Blips) oder "aus". progress/endsQuestion steuern
     die Satz-Melodie (Fragen steigen am Ende). */
  speak(chunk, progress, endsQuestion) {
    if (!this.on || !chunk) return;
    if (SOUND.speech === "aus") return;
    if (SOUND.speech === "ticks") { this.typeTick(); return; }
    this.voice?.speak(chunk, progress, endsQuestion);
  }

  /* Typewriter-Tick (Altverhalten, speech="ticks"): selbst gedrosselt
     (SOUND.typeTickMs) — unabhängig von tiks' Hover-Throttle. */
  typeTick() {
    if (!this.on || SOUND.typeTicks === "nein") return;
    const now = performance.now();
    if (now - this._lastTypeTick < SOUND.typeTickMs) return;
    this._lastTypeTick = now;
    this.engine.hover();
  }

  /* Hörprobe fürs Dev-Panel: tippt einen Testsatz durch speak() — im echten
     Typewriter-Takt, damit Tempo-Gate und Melodie wie live klingen. */
  probeSpeech(text = "Nett hier. Frag mich was!") {
    if (this._probeTimer) clearInterval(this._probeTimer);
    let i = 0;
    this._probeTimer = setInterval(() => {
      if (i >= text.length) { clearInterval(this._probeTimer); this._probeTimer = null; return; }
      this.speak(text[i], i / text.length, text.trimEnd().endsWith("?"));
      i++;
    }, 28);
  }
}

export const sound = new SoundDesign();
