/* =============================================================================
   DETAR — VoiceSynth: Animalese-artige Silben-Stimme, rein synthetisch
   (Web Audio, KEINE Audio-Dateien — Guardrail wie tiks).

   PRINZIP (konkatenative Synthese auf Silben-Ebene, wie Animal Crossing —
   nur synthetisiert statt gesampelt): Der Typewriter liefert die echten
   Zeichen; jeder VOKAL zündet eine kurze Silbe. Der Konsonant DAVOR bestimmt
   den Anlaut (Rausch-Burst: Zischlaut/Plosiv/weich), der Vokal die FORMANTEN
   (zwei Bandpass-Filter F1/F2 auf einem Sägezahn — das macht aus einem Buzz
   ein „a" oder „i"). Dadurch folgt der Klang hörbar dem Text, ohne Sprache
   zu sein.

   CHARAKTER „aufgeweckt, aber selbstsicher":
   • aufgeweckt   = helle Grundlage, kleiner Tonhöhen-Auftakt pro Silbe
                    (startet ~12 % höher, gleitet aufs Ziel), lebhafte
                    Zufalls-Variation (speechLively, in Halbtönen)
   • selbstsicher = stabiles Tonzentrum (Variation um EINE Mitte, kein
                    Wandern), satter Tiefen-Anteil (Direkt-Pfad mit Lowpass
                    zusätzlich zu den Formanten), ruhiges Silben-Tempo,
                    Satz-Deklination (Tonhöhe sinkt zum Satzende minimal —
                    wie bei echten Aussagesätzen); Fragen steigen am Ende.

   PERFORMANCE: Klangerzeugung läuft im Audio-Thread des Browsers (nativ);
   der Main-Thread zahlt nur den Node-Aufbau (~µs pro Silbe, ~10/s).
   Nodes räumt der Browser nach onended selbst ab.

   Alle Regel-Werte kommen aus SOUND (config.js) — live über das Dev-Panel.
   ============================================================================= */
import { SOUND } from "./config.js";

// Vokal → Formant-Frequenzen [F1, F2, F3] (grobe Sprech-Formanten, Hz).
// Umlaute auf die nächstliegende Klangfarbe gemappt.
const FORMANTS = {
  a: [800, 1200, 2600],
  e: [500, 1900, 2600],
  i: [320, 2300, 3000],
  o: [500, 900, 2500],
  u: [340, 800, 2400],
  ä: [650, 1700, 2600],
  ö: [450, 1500, 2500],
  ü: [330, 1600, 2600],
  y: [320, 2100, 2900],
};
const FORMANT_GAINS = [1.0, 0.55, 0.22]; // F1 trägt, F2 färbt, F3 glänzt

// Konsonant → Anlaut-Klasse (Rausch-Burst vor der Silbe).
const SIBILANT = "szcß";   // Zischen: heller, längerer Burst
const PLOSIVE = "ptkbdg";  // Knall: sehr kurzer, mittiger Burst
const SOFT = "fvwhjlrmn";  // weich: leiser, dunkler Hauch

export class VoiceSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.pendingCons = null;   // zuletzt gesehener Konsonant (wartet auf Vokal)
    this.lastSylMs = 0;        // Tempo-Gate (performance.now)
    this.declination = 1.0;    // sinkt pro Silbe leicht, Reset am Satzende
  }

  /* In der User-Geste rufen (AudioContext-Unlock) — via sound.init(). */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume();
      // 0.3 s weißes Rauschen, einmalig — Quelle für alle Anlaute
      const len = Math.floor(this.ctx.sampleRate * 0.3);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      console.warn("VoiceSynth nicht verfügbar:", e);
      this.ctx = null;
    }
  }

  applyVolume() {
    if (this.master) this.master.gain.value = SOUND.volume * SOUND.speechVolume;
  }

  /* Vom Typewriter: die frisch enthüllten Zeichen (chunk), Fortschritt 0–1,
     und ob der GESAMTE Text mit "?" endet (→ Frage-Melodie am Ende). */
  speak(chunk, progress = 0, endsQuestion = false) {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    for (const raw of chunk) {
      const c = raw.toLowerCase();
      if (FORMANTS[c]) {
        // Tempo-Gate: bei 28 ms/Zeichen wäre jeder Vokal zu dicht — min. Abstand
        const now = performance.now();
        if (now - this.lastSylMs >= SOUND.speechTempoMs) {
          this.lastSylMs = now;
          const rise = endsQuestion && progress > 0.82; // Frage: Ende steigt
          this.syllable(this.pendingCons, c, rise);
          this.declination = Math.max(0.88, this.declination * 0.985);
        }
        this.pendingCons = null;
      } else if (/[a-zäöüß]/.test(c)) {
        this.pendingCons = c;
      } else {
        this.pendingCons = null;
        if (c === "." || c === "!" || c === "?" || c === ",") this.declination = 1.0;
      }
    }
  }

  /* Eine Silbe: [Anlaut-Rauschen] + Sägezahn → Formant-Bandpässe + Tiefen-Pfad. */
  syllable(cons, vowel, rise) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.002;
    const dur = SOUND.speechLen / 1000;

    // Tonhöhe: stabiles Zentrum ± speechLively Halbtöne, Satz-Deklination,
    // Frage-Ende eine kleine Terz hoch.
    const semis = (Math.random() * 2 - 1) * SOUND.speechLively;
    let f0 = SOUND.speechPitch * Math.pow(2, semis / 12) * this.declination;
    if (rise) f0 *= 1.19;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    // Auftakt: startet leicht drüber, landet auf dem Ziel, sackt am Ende
    // minimal ab — „munter, aber geerdet".
    osc.frequency.setValueAtTime(f0 * 1.12, t0);
    osc.frequency.exponentialRampToValueAtTime(f0, t0 + dur * 0.35);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.94, t0 + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + 0.012);
    env.gain.setTargetAtTime(0, t0 + dur * 0.55, dur * 0.2);
    osc.connect(env);

    // Formanten (parallel): Bandpässe machen die Vokal-Farbe
    const F = FORMANTS[vowel];
    for (let i = 0; i < F.length; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = F[i];
      bp.Q.value = 7;
      const g = ctx.createGain();
      g.gain.value = FORMANT_GAINS[i];
      env.connect(bp); bp.connect(g); g.connect(this.master);
    }
    // Tiefen-Pfad: etwas ungefilterter Grundton für Körper („selbstsicher")
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = f0 * 2.2;
    const lg = ctx.createGain();
    lg.gain.value = 0.3;
    env.connect(lp); lp.connect(lg); lg.connect(this.master);

    osc.start(t0);
    osc.stop(t0 + dur + 0.15);
    osc.onended = () => { try { env.disconnect(); osc.disconnect(); } catch (e) {} };

    if (cons) this.onset(cons, t0);
  }

  /* Anlaut: kurzer, klassenabhängig gefilterter Rausch-Burst VOR dem Vokal. */
  onset(cons, t0) {
    const ctx = this.ctx;
    let freq = 1800, q = 1.2, len = 0.03, level = 0.18, type = "bandpass";
    if (SIBILANT.includes(cons)) { freq = 4800; q = 0.8; len = 0.05; level = 0.22; type = "highpass"; }
    else if (PLOSIVE.includes(cons)) { freq = 1600; q = 1.5; len = 0.016; level = 0.3; }
    else if (SOFT.includes(cons)) { freq = 1100; q = 1.0; len = 0.028; level = 0.12; }

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const tStart = Math.max(ctx.currentTime, t0 - 0.012);
    g.gain.setValueAtTime(level, tStart);
    g.gain.setTargetAtTime(0, tStart + len * 0.6, len * 0.4);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(tStart);
    src.stop(tStart + len + 0.05);
    src.onended = () => { try { g.disconnect(); src.disconnect(); } catch (e) {} };
  }
}
