/* =============================================================================
   DETAR — Dev-Panel (?dev): das Tuning-Panel des Lokal-Prototyps, direkt in
   der App. Regler schreiben LIVE in die echten Config-Objekte; „tuning.json
   exportieren" liefert exakt die Datei, die ins Repo-Root gehört — kein
   Rückkopier-Schritt mehr. Zustand wird in localStorage gehalten (nur im
   Dev-Modus geladen), Presets speicherbar.
   ============================================================================= */
import { TYPO, FACE, IDLE, ACT, CHOREO, SCENE, STAB, GYRO, ACTFX, PORTAL, syncCssVars } from "./config.js";
import { applyNodAxis } from "./rig.js";

const ALL = { TYPO, FACE, IDLE, ACT, CHOREO, SCENE, STAB, GYRO, ACTFX, PORTAL };
const LS_KEY = "detar-dev-tuning-v1";
const PRESET_KEY = "detar-dev-presets-v1";

export class DevPanel {
  constructor({ bubble, nodes, controller, timeline, fx }) {
    this.bubble = bubble;
    this.nodes = nodes;
    this.controller = controller;
    this.timeline = timeline;
    this.fx = fx;
    this.start = JSON.parse(JSON.stringify(snapshot())); // „Zurücksetzen"-Stand
    this.loadLocal();
    this.buildDom();
    this.applyAll();
  }

  schema() {
    const rebuild = () => this.bubble.rebuild();
    const nod = () => applyNodAxis(this.nodes);
    return [
      { g: "Choreographie", items: [
        { o: CHOREO, k: "requireTap", l: "Aktivier-Tap nötig", options: ["ja", "nein"] },
        { o: CHOREO, k: "uiRevealMs", l: "UI-Einfahr-Dauer (ms)", min: 0, max: 3000, step: 50, on: syncCssVars },
        { o: CHOREO, k: "revealOffset", l: "Reveal-Offset (px)", min: 0, max: 200, step: 5, on: syncCssVars },
        { o: ACT, k: "durationSec", l: "Pop-In Dauer (s)", min: 0.1, max: 3, step: 0.05 },
        { o: ACT, k: "spins", l: "Spins (0/1)", min: 0, max: 2, step: 1 },
        { o: ACT, k: "overshoot", l: "Overshoot", min: 0, max: 4, step: 0.05 },
        { o: CHOREO, k: "idleReturnMs", l: "Haltezeit n. Text (ms)", min: 500, max: 15000, step: 250 },
        { o: CHOREO, k: "greetingPose", l: "Begrüßungs-Pose", options: ["idle", "affirm", "think"] },
        { o: CHOREO, k: "jumpDurationSec", l: "Figur-Tap: Dauer", min: 0.1, max: 1.5, step: 0.05 },
        { o: CHOREO, k: "jumpHeight", l: "Figur-Tap: Höhe", min: 0, max: 0.15, step: 0.005 },
      ]},
      { g: "Bubble + Typewriter", items: [
        { o: TYPO, k: "msPerChar", l: "ms/Zeichen", min: 0, max: 120, step: 1 },
        { o: TYPO, k: "fontSize", l: "Schriftgröße (px)", min: 20, max: 100, step: 1, on: rebuild },
        { o: TYPO, k: "lineSpacing", l: "Zeilenabstand", min: 0.5, max: 1.5, step: 0.05, on: rebuild },
        { o: TYPO, k: "strokeWidth", l: "Outline-Dicke", min: 0, max: 40, step: 1, on: rebuild },
        { o: TYPO, k: "maxWidth", l: "Max. Breite (3D)", min: 0.4, max: 2.5, step: 0.05, on: rebuild },
        { o: TYPO, k: "maxLines", l: "Max. Zeilen", min: 1, max: 8, step: 1, on: rebuild },
        { o: TYPO, k: "paddingPx", l: "Innenabstand (px)", min: 0, max: 80, step: 1, on: rebuild },
        { o: TYPO, k: "offsetX", l: "Offset X", min: -0.6, max: 0.6, step: 0.01 },
        { o: TYPO, k: "offsetY", l: "Offset Y", min: -0.8, max: 0.6, step: 0.01 },
        { o: CHOREO, k: "billboardLerp", l: "Billboard-Trägheit", min: 0.02, max: 1, step: 0.01 },
        { o: TYPO, k: "textColor", l: "Textfarbe", color: true, on: rebuild },
        { o: TYPO, k: "strokeColor", l: "Outline-Farbe", color: true, on: rebuild },
      ]},
      { g: "Gesicht", items: [
        { o: FACE, k: "blinkIntervalMin", l: "Blink-Pause min (s)", min: 0.2, max: 8, step: 0.1 },
        { o: FACE, k: "blinkIntervalMax", l: "Blink-Pause max (s)", min: 0.2, max: 10, step: 0.1 },
        { o: FACE, k: "blinkDuration", l: "Blink-Dauer (s)", min: 0.03, max: 0.5, step: 0.01 },
        { o: FACE, k: "talkFrameMs", l: "Mund-Frame (ms)", min: 40, max: 400, step: 5 },
      ]},
      { g: "Idle-Verhalten", items: [
        { o: IDLE, k: "bopAmplitude", l: "Atem-Bop (±Höhe)", min: 0, max: 0.15, step: 0.005 },
        { o: IDLE, k: "bopFrequency", l: "Atem-Frequenz", min: 0.1, max: 4, step: 0.05 },
        { o: IDLE, k: "walkChance", l: "Geh-Häufigkeit", min: 0, max: 1, step: 0.05 },
        { o: IDLE, k: "lookChance", l: "Umschau-Häufigkeit", min: 0, max: 1, step: 0.05 },
        { o: IDLE, k: "walkSpeed", l: "Geh-Tempo", min: 0, max: 0.2, step: 0.005 },
        { o: IDLE, k: "walkFrequency", l: "Watschel-Frequenz", min: 0.2, max: 6, step: 0.1 },
        { o: IDLE, k: "walkRollMax", l: "Watschel-Kippen", min: 0, max: 0.6, step: 0.01 },
        { o: IDLE, k: "stepSquash", l: "Schritt-Squash", min: 0, max: 0.25, step: 0.005 },
        { o: IDLE, k: "headLookMax", l: "Kopf-Drehung max", min: 0, max: 1.2, step: 0.02 },
        { o: IDLE, k: "headPitchMax", l: "Kopf-Nick max", min: 0, max: 0.8, step: 0.02 },
        { o: SCENE, k: "headNodAxis", l: "Nick-Achse Höhe", min: 0, max: 0.4, step: 0.005, on: nod },
        { o: IDLE, k: "bopHoldMin", l: "Ruhe-Pause min (s)", min: 0.2, max: 8, step: 0.1 },
        { o: IDLE, k: "bopHoldMax", l: "Ruhe-Pause max (s)", min: 0.2, max: 10, step: 0.1 },
        { o: IDLE, k: "actionMin", l: "Aktions-Dauer min (s)", min: 0.2, max: 6, step: 0.1 },
        { o: IDLE, k: "actionMax", l: "Aktions-Dauer max (s)", min: 0.2, max: 8, step: 0.1 },
        { o: IDLE, k: "cameraFacingThreshold", l: "Face-Cam ab (°)", min: 10, max: 120, step: 1 },
        { o: IDLE, k: "faceCamLerp", l: "Face-Cam Tempo", min: 0.01, max: 0.5, step: 0.01 },
        { o: IDLE, k: "markerWidth", l: "Lauffeld Breite", min: 0.01, max: 0.3, step: 0.005 },
        { o: IDLE, k: "markerHeight", l: "Lauffeld Tiefe", min: 0.01, max: 0.3, step: 0.005 },
        { o: IDLE, k: "roamFraction", l: "Lauffeld-Anteil", min: 0.1, max: 1, step: 0.05 },
      ]},
      { g: "Aktivierung (Karten-FX)", items: [
        { o: ACTFX, k: "count", l: "Partikel-Anzahl", min: 0, max: 60, step: 1, on: () => this.fx?.buildPool() },
        { o: ACTFX, k: "size", l: "Partikel-Größe", min: 0.002, max: 0.03, step: 0.001 },
        { o: ACTFX, k: "riseHeight", l: "Aufstiegs-Höhe", min: 0.01, max: 0.25, step: 0.005 },
        { o: ACTFX, k: "riseSec", l: "Aufstiegs-Dauer (s)", min: 0.4, max: 5, step: 0.1 },
        { o: ACTFX, k: "pulseSec", l: "Glow-Puls (s)", min: 0.3, max: 5, step: 0.1 },
        { o: ACTFX, k: "glowOpacity", l: "Glow-Stärke", min: 0, max: 1, step: 0.05 },
        { o: ACTFX, k: "burstSec", l: "Tap-Blitz-Dauer (s)", min: 0.2, max: 2, step: 0.05 },
        { o: ACTFX, k: "glowColor", l: "Glow-Farbe", color: true },
        { o: ACTFX, k: "color1", l: "Partikel-Farbe 1", color: true, on: () => this.fx?.buildPool() },
        { o: ACTFX, k: "color2", l: "Partikel-Farbe 2", color: true, on: () => this.fx?.buildPool() },
      ]},
      { g: "Einblick (Portal)", items: [
        { o: PORTAL, k: "depth", l: "Parallax-Tiefe", min: 0.01, max: 0.3, step: 0.005, on: () => window.__detar?.portal?.applyWindow() },
        { o: PORTAL, k: "oversize", l: "Bild-Oversize", min: 1.1, max: 4, step: 0.05, on: () => window.__detar?.portal?.applyWindow() },
        { o: PORTAL, k: "windowW", l: "Fenster Breite (Anteil)", min: 0.3, max: 1, step: 0.01, on: () => window.__detar?.portal?.applyWindow() },
        { o: PORTAL, k: "windowH", l: "Fenster Höhe (Anteil)", min: 0.3, max: 1, step: 0.01, on: () => window.__detar?.portal?.applyWindow() },
        { o: PORTAL, k: "damp", l: "Dämpfung (Trägheit)", min: 0.02, max: 1, step: 0.01 },
        { o: PORTAL, k: "fadeSec", l: "Bildwechsel-Fade (s)", min: 0.05, max: 1.5, step: 0.05 },
        { o: PORTAL, k: "showSec", l: "Ein-/Ausblenden (s)", min: 0.05, max: 1.5, step: 0.05 },
        { o: PORTAL, k: "flipSec", l: "Figur-Flip Dauer (s)", min: 0.2, max: 2, step: 0.05 },
        { o: PORTAL, k: "figureScale", l: "Figur-Größe im Einblick", min: 0.1, max: 1, step: 0.01 },
        { o: PORTAL, k: "flipHeight", l: "Figur-Flip Höhe", min: 0, max: 0.2, step: 0.005 },
      ]},
      { g: "Tracking-Features an/aus (nur AR)", items: [
        { o: STAB, k: "enabled", l: "1 Glättung (PoseStabilizer)", options: ["ja", "nein"] },
        { o: STAB, k: "normalize", l: "2 Einheiten-Normierung", options: ["ja", "nein"] },
        { o: STAB, k: "deadZones", l: "3 Dead-Zones (Ruhe-Snap)", options: ["ja", "nein"] },
        { o: STAB, k: "lostHold", l: "4 Lost-Hold", options: ["ja", "nein"] },
        { o: STAB, k: "nanGuard", l: "5 NaN-Schutz", options: ["ja", "nein"] },
        { o: STAB, k: "snap", l: "6 Re-Found-Snap", options: ["ja", "nein"] },
        { o: GYRO, k: "enabled", l: "7 Gyro-Fusion", options: ["ja", "nein"] },
        { o: STAB, k: "extrapolate", l: "8 Bewegungs-Extrapolation", options: ["ja", "nein"] },
      ]},
      { g: "Tracking (nur AR)", items: [
        { o: STAB, k: "minCutoff", l: "Glättung Ruhe (minCutoff)", min: 0.05, max: 5, step: 0.05 },
        { o: STAB, k: "beta", l: "Bewegungs-Öffnung (beta)", min: 0, max: 0.05, step: 0.0005 },
        { o: STAB, k: "rotMinCutoff", l: "Rot-Glättung Ruhe (Hz)", min: 0.2, max: 8, step: 0.1 },
        { o: STAB, k: "rotBeta", l: "Rot-Öffnung b. Drehung", min: 0, max: 15, step: 0.5 },
        { o: STAB, k: "latencyMs", l: "Latenz-Ausgleich (ms)", min: 0, max: 120, step: 5 },
        { o: STAB, k: "moveDwellMs", l: "Ruhe-Rückfall (ms)", min: 0, max: 1000, step: 50 },
        { o: STAB, k: "posDeadZone", l: "Pos-Dead-Zone (KB)", min: 0, max: 0.01, step: 0.0002 },
        { o: STAB, k: "snapDist", l: "Snap-Distanz (KB)", min: 0.05, max: 1, step: 0.01 },
        { o: STAB, k: "lostHoldMs", l: "Lost-Hold (ms)", min: 0, max: 1000, step: 50 },
        { o: STAB, k: "extrapMaxMs", l: "Extrapolation max (ms)", min: 0, max: 400, step: 10 },
        { o: STAB, k: "minSpeed", l: "Bewegt ab (KB/s)", min: 0, max: 0.3, step: 0.005 },
        { o: STAB, k: "minAngSpeed", l: "Bewegt ab (rad/s)", min: 0, max: 1.5, step: 0.05 },
        { o: GYRO, k: "bridgeMs", l: "Gyro-Brücke (ms)", min: 0, max: 3000, step: 100 },
        { o: GYRO, k: "deltaDeadZone", l: "Gyro-Dead-Band (rad)", min: 0, max: 0.01, step: 0.0002 },
      ]},
    ];
  }

  buildDom() {
    const style = document.createElement("style");
    style.textContent = `
      #devToggle { position: fixed; top: calc(8px + env(safe-area-inset-top)); right: 8px;
        z-index: 120; background: #ffdd00; color: #111; border: none; border-radius: 8px;
        font: bold 13px monospace; padding: 7px 10px; cursor: pointer; }
      #devPanel { position: fixed; top: 0; right: 0; bottom: 0; width: 320px; max-width: 88vw;
        z-index: 110; background: rgba(28,28,30,0.96); color: #eee; overflow-y: auto;
        font: 12px/-apple-system, monospace; padding: 46px 12px 30px; display: none;
        font-family: -apple-system, Arial, sans-serif; font-size: 12px; }
      #devPanel.open { display: block; }
      #devPanel details { background: #2e2e32; border-radius: 8px; margin-bottom: 8px;
        border: 1px solid #3a3a3e; }
      #devPanel summary { cursor: pointer; padding: 7px 10px; font-weight: 600;
        color: #ffdd00; user-select: none; }
      #devPanel .ctl { display: grid; grid-template-columns: 105px 1fr 50px; gap: 6px;
        align-items: center; padding: 3px 10px; }
      #devPanel .ctl label { font-size: 11px; color: #bbb; overflow: hidden;
        white-space: nowrap; text-overflow: ellipsis; }
      #devPanel input[type=range] { width: 100%; accent-color: #ffdd00; }
      #devPanel input[type=number] { width: 100%; box-sizing: border-box; background: #1d1d1f;
        color: #eee; border: 1px solid #444; border-radius: 4px; font-size: 11px; padding: 2px 4px; }
      #devPanel select, #devPanel input[type=color] { grid-column: 2 / 4; }
      #devPanel .row { display: flex; gap: 6px; margin-bottom: 6px; }
      #devPanel button { flex: 1; background: #3a3a3e; color: #ddd; border: none;
        border-radius: 7px; padding: 8px 6px; font-size: 12px; cursor: pointer; }
      #devPanel button.big { background: #ffdd00; color: #111; font-weight: 700; }
    `;
    document.head.appendChild(style);

    const toggle = document.createElement("button");
    toggle.id = "devToggle";
    toggle.textContent = "⚙ Dev";
    const panel = document.createElement("div");
    panel.id = "devPanel";
    toggle.onclick = () => panel.classList.toggle("open");
    document.body.appendChild(toggle);
    document.body.appendChild(panel);

    // Toolbar
    const bar = document.createElement("div");
    bar.innerHTML = `
      <div class="row"><button class="big" id="devReplay">▶ Scan simulieren (Replay)</button></div>
      <div class="row"><button id="devExport">tuning.json exportieren</button>
        <button id="devImport">laden</button>
        <input type="file" id="devImportFile" accept=".json" style="display:none"></div>
      <div class="row"><select id="devPresetSel" style="flex:2"></select>
        <button id="devPresetSave">💾</button><button id="devPresetDel">✕</button></div>
      <div class="row"><button id="devReset">Zurücksetzen (Startwerte)</button></div>
      ${this.timeline?.hasStudio ? `<div class="row"><button id="devTlPlay">▶ Timeline</button>
        <button id="devTlExport">Timeline exportieren</button></div>` : ""}
    `;
    panel.appendChild(bar);

    for (const grp of this.schema()) {
      const det = document.createElement("details");
      if (grp.g === "Choreographie") det.open = true;
      const sum = document.createElement("summary");
      sum.textContent = grp.g;
      det.appendChild(sum);
      for (const it of grp.items) det.appendChild(this.control(it));
      panel.appendChild(det);
    }

    panel.querySelector("#devReplay").onclick = () => this.controller.replay();
    panel.querySelector("#devReset").onclick = () => {
      applySnapshot(this.start); localStorage.removeItem(LS_KEY); this.applyAll(); this.refresh();
    };
    panel.querySelector("#devExport").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" }));
      a.download = "tuning.json";
      a.click();
    };
    panel.querySelector("#devImport").onclick = () => panel.querySelector("#devImportFile").click();
    panel.querySelector("#devImportFile").onchange = (e) => {
      e.target.files?.[0]?.text().then((txt) => {
        try { applySnapshot(JSON.parse(txt)); this.applyAll(); this.refresh(); this.saveLocal(); }
        catch (err) { alert("Kein gültiges Tuning-JSON."); }
      });
    };
    panel.querySelector("#devPresetSave").onclick = () => {
      const name = prompt("Name für diesen Stand:", "Stand " + new Date().toLocaleDateString("de-DE"));
      if (!name) return;
      const p = getPresets(); p[name.trim()] = snapshot(); setPresets(p); this.refreshPresets(name.trim());
    };
    panel.querySelector("#devPresetSel").onchange = (e) => {
      const p = getPresets();
      if (p[e.target.value]) { applySnapshot(p[e.target.value]); this.applyAll(); this.refresh(); this.saveLocal(); }
    };
    panel.querySelector("#devPresetDel").onclick = () => {
      const sel = panel.querySelector("#devPresetSel");
      if (!sel.value || !confirm(`Preset "${sel.value}" löschen?`)) return;
      const p = getPresets(); delete p[sel.value]; setPresets(p); this.refreshPresets("");
    };
    if (this.timeline?.hasStudio && panel.querySelector("#devTlPlay")) {
      panel.querySelector("#devTlPlay").onclick = () => this.timeline.play();
      panel.querySelector("#devTlExport").onclick = () => this.timeline.exportState();
    }
    this.panel = panel;
    this.refreshPresets("");
  }

  control(it) {
    const row = document.createElement("div");
    row.className = "ctl";
    const lab = document.createElement("label");
    lab.textContent = it.l; lab.title = it.k;
    row.appendChild(lab);
    const apply = (v) => { it.o[it.k] = v; it.on?.(); this.saveLocal(); };
    if (it.options) {
      const sel = document.createElement("select");
      for (const o of it.options) sel.add(new Option(o, o));
      sel.value = it.o[it.k];
      sel.onchange = () => apply(sel.value);
      row.appendChild(sel);
      it._els = [sel];
    } else if (it.color) {
      const inp = document.createElement("input");
      inp.type = "color"; inp.value = it.o[it.k];
      inp.oninput = () => apply(inp.value);
      row.appendChild(inp);
      it._els = [inp];
    } else {
      const rng = document.createElement("input");
      rng.type = "range"; rng.min = it.min; rng.max = it.max; rng.step = it.step; rng.value = it.o[it.k];
      const num = document.createElement("input");
      num.type = "number"; num.min = it.min; num.max = it.max; num.step = it.step; num.value = it.o[it.k];
      rng.oninput = () => { num.value = rng.value; apply(Number(rng.value)); };
      num.onchange = () => { rng.value = num.value; apply(Number(num.value)); };
      row.appendChild(rng); row.appendChild(num);
      it._els = [rng, num];
    }
    (this._items ??= []).push(it);
    return row;
  }

  refresh() {
    for (const it of this._items ?? [])
      for (const el of it._els ?? []) el.value = it.o[it.k];
  }
  refreshPresets(selected) {
    const sel = this.panel.querySelector("#devPresetSel");
    sel.innerHTML = "";
    sel.add(new Option("— Preset laden —", ""));
    for (const n of Object.keys(getPresets()).sort()) sel.add(new Option(n, n));
    sel.value = selected ?? "";
  }
  applyAll() {
    this.bubble.rebuild();
    syncCssVars();
    applyNodAxis(this.nodes);
  }
  saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(snapshot())); }
  loadLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY));
      if (s) applySnapshot(s);
    } catch (e) { /* egal */ }
  }
}

function snapshot() { return JSON.parse(JSON.stringify(ALL)); }
function applySnapshot(s) {
  for (const [name, obj] of Object.entries(ALL)) if (s[name]) Object.assign(obj, s[name]);
}
function getPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY)) || {}; } catch (e) { return {}; }
}
function setPresets(p) { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); }
