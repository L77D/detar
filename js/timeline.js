/* =============================================================================
   DETAR — Timeline (Theatre.js): visueller Keyframe-Editor für AUTORISIERTE
   Animations-Beats (Pop-In-Varianten, Wink, Übergänge …), als Ersatz für die
   Mattercraft-Timeline.

   Arbeitsteilung: Die Timeline animiert NUR den neutralen Wrapper `BeatRoot`
   (zwischen worldRoot und FigureRoot) — die Behaviors (IdleWander & Co.)
   animieren weiterhin FigureRoot. Beides addiert sich, nichts kollidiert.

   Workflow:
   1. `?desktop&dev` öffnen → Theatre-Studio-UI erscheint (Timeline unten).
   2. Im Studio Keyframes auf „Beats / Figur" setzen (posX/Y/Z, rotY/Z, scale),
      scrubben, Kurven editieren. ▶-Button im Dev-Panel spielt die Sequenz.
   3. Dev-Panel → „Timeline exportieren" → `beats.theatre.json` ins Repo-Root
      legen (neben index.html) und pushen.
   4. Live (ohne ?dev) lädt die App NUR den schlanken Core + diese JSON und
      spielt die Beats ab — kein Editor-Code im Produktiv-Pfad.

   Ohne beats.theatre.json und ohne ?dev wird Theatre GAR NICHT geladen.
   ============================================================================= */

const BUNDLE = "https://cdn.jsdelivr.net/npm/@theatre/browser-bundles@0.7.2/dist/core-and-studio.js";
const DEG = Math.PI / 180;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Theatre.js-Bundle nicht ladbar"));
    document.head.appendChild(s);
  });
}

export async function initTimeline({ nodes, withStudio }) {
  // Gespeicherten Stand laden (Produktiv-Pfad braucht ihn zwingend)
  let state;
  try {
    const r = await fetch("./beats.theatre.json", { cache: "no-store" });
    if (r.ok) state = await r.json();
  } catch (e) { /* keine Datei = ok */ }
  if (!state && !withStudio) return null; // nichts zu tun, nichts laden

  // Shim: das Bundle erwartet Node-`process` (checkForUpdates) — sonst
  // wirft es einen (harmlosen, aber lauten) ReferenceError.
  if (typeof window.process === "undefined") window.process = { env: {} };
  await loadScript(BUNDLE);
  const T = window.Theatre;
  if (!T?.core) return null;
  if (withStudio && T.studio) T.studio.initialize();

  const project = T.core.getProject("DETAR", state ? { state } : undefined);
  const sheet = project.sheet("Beats");
  const t = T.core.types;
  const obj = sheet.object("Figur", {
    posX:  t.number(0, { range: [-0.15, 0.15] }), // Karten-Einheiten (Prototyp-Skala)
    posY:  t.number(0, { range: [-0.05, 0.25] }),
    posZ:  t.number(0, { range: [-0.15, 0.15] }),
    rotY:  t.number(0, { range: [-360, 360] }),   // Grad
    rotZ:  t.number(0, { range: [-60, 60] }),
    scale: t.number(1, { range: [0, 2] }),
  });

  const beat = nodes.BeatRoot;
  obj.onValuesChange((v) => {
    beat.position.set(v.posX, v.posY, v.posZ);
    beat.rotation.set(0, v.rotY * DEG, v.rotZ * DEG); // NIE rotation.x (Aufrichtung!)
    beat.scale.setScalar(v.scale);
  });
  await project.ready;

  return {
    hasStudio: !!(withStudio && T.studio),
    /* Sequenz abspielen, z. B. play({ range: [0, 2] }) oder play() für alles.
       Rückgabe: Promise, resolved wenn fertig. */
    play: (opts) => sheet.sequence.play(opts ?? {}),
    stop: () => sheet.sequence.pause(),
    /* Studio-Stand als beats.theatre.json herunterladen (nur mit ?dev). */
    exportState: () => {
      if (!withStudio || !T.studio) return;
      const json = T.studio.createContentOfSaveFile("DETAR");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
      a.download = "beats.theatre.json";
      a.click();
    },
  };
}
