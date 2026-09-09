/* =============================================================================
   DETAR — Vorabprüfung im Splash (Production-Härtung, 2026-09-09).

   Läuft in boot() BEVOR der Start-Button freigeschaltet wird. Bisher kam ein
   Problem erst NACH dem Klick als Kamera-Fehler oder — schlimmer — als leere
   Seite. Jetzt bekommt das Gerät vorab einen verständlichen Hinweis:

   • inapp    — In-App-Browser (Instagram, Facebook, Snapchat, TikTok, WhatsApp-
                Link-Vorschau u. a.): Kamera-API fehlt oder ist eingeschränkt →
                „Link in Safari/Chrome öffnen". Marker-Liste abgeglichen mit
                reality/app/xr/js/src/devices/compatibility.ts der Engine.
   • insecure — kein HTTPS (getUserMedia gibt es nur im Secure Context).
   • nocam    — keine Kamera-API (sehr alter Browser, Kiosk-Modus, WebView).
   • nowasm   — kein WebAssembly (die Engine ist WASM).

   Kein ES-Modul-Support ist hier NICHT prüfbar (dann läuft main.js gar nicht)
   — dafür steht ein klassisches Inline-Skript in index.html, das denselben
   Bildschirm befüllt.

   Nur zum Testen: URL-Parameter ?preflight=inapp|nocam|insecure|nowasm erzwingt
   den jeweiligen Fall (Screens am Rechner ansehen), ?preflight=aus überspringt
   die Prüfung.
   ============================================================================= */

// In-App-Browser am User-Agent. FBAN/FBAV/FB_IAB = Facebook/Messenger (iOS +
// Android), musical_ly = TikTok (ältere Kennung), Line/ mit Schrägstrich, damit
// „Outline"/„Online" nicht matchen.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|TikTok|musical_ly|Line\/|MicroMessenger|LinkedInApp|Twitter|Pinterest/;

const TEXT = {
  inapp: {
    title: "Bitte im Browser öffnen",
    // (einfache Anführungszeichen: die deutschen Schlusszeichen im Text sind ")
    text: 'Diese App braucht die Kamera. Öffne den Link in Safari (iPhone: Teilen-Symbol → „In Safari öffnen") ' +
          'bzw. Chrome (Android: Menü ⋮ → „In Chrome öffnen").',
  },
  insecure: {
    title: "Bitte im Browser öffnen",
    text: "Die Seite ist nicht über eine sichere Verbindung (https) geöffnet — ohne sie gibt der Browser die Kamera nicht frei. " +
          "Öffne den Link aus dem QR-Code noch einmal in Safari bzw. Chrome.",
  },
  nocam: {
    title: "Bitte im Browser öffnen",
    text: "Dein Browser stellt keine Kamera-Schnittstelle bereit. Öffne den Link in Safari (iPhone) bzw. Chrome (Android) " +
          "oder aktualisiere den Browser.",
  },
  nowasm: {
    title: "Bitte im Browser öffnen",
    text: "Dein Browser ist zu alt für die Bilderkennung. Öffne den Link in einem aktuellen Safari (iPhone) bzw. Chrome (Android).",
  },
};

/* Prüfen. `force` = Wert von ?preflight (nur Test). Liefert den Befund-Schlüssel
   oder null (alles in Ordnung). Reihenfolge = Handlungsnähe: In-App zuerst
   (der Nutzer kann es sofort beheben), dann HTTPS, Kamera-API, WASM. */
export function preflight(force) {
  if (force === "aus") return null;
  if (force && TEXT[force]) return force;
  const ua = navigator.userAgent || "";
  if (IN_APP.test(ua)) return "inapp";
  if (!window.isSecureContext) return "insecure";
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return "nocam";
  if (!window.WebAssembly) return "nowasm";
  return null;
}

/* Bildschirm im Splash (#preflightScreen, Stil wie #permScreen) befüllen und
   zeigen. Der Start-Button bleibt deaktiviert (boot() bricht ab). */
export function showPreflightScreen(kind) {
  const t = TEXT[kind] || TEXT.nocam;
  const el = (id) => document.getElementById(id);
  el("pfTitle").textContent = t.title;
  el("pfText").textContent = t.text;
  // Link ohne den Test-Parameter — das ist die Adresse, die der Nutzer im
  // Browser braucht.
  const u = new URL(location.href);
  u.searchParams.delete("preflight");
  const link = u.href;
  el("pfUrl").value = link;
  el("pfCopy").onclick = () => copyLink(link, el("pfUrl"), el("pfCopy"));
  document.body.classList.add("preflight-blocked");
  console.warn("DETAR Vorabprüfung:", kind, "—", navigator.userAgent);
}

/* Link kopieren: Clipboard-API, sonst Textfeld selektieren + execCommand
   (In-App-Browser haben oft kein navigator.clipboard). */
function copyLink(link, field, btn) {
  const done = (ok) => {
    const span = btn.querySelector("span");
    span.textContent = ok ? "Kopiert!" : "Markiert";
    setTimeout(() => { span.textContent = "Link kopieren"; }, 1800);
  };
  const fallback = () => {
    field.focus();
    field.select();
    field.setSelectionRange(0, link.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* bleibt markiert */ }
    done(ok);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(() => done(true), fallback);
  } else fallback();
}
