/* =============================================================================
   DETAR — BubbleText: Auszeichnung im Sprechtext und Satzgrenzen.
   Reine Textfunktionen, kein Canvas — die Messung (Zeilenzahl, Breite) macht
   die SpeechBubble selbst, weil nur sie den echten Font kennt.

   Auszeichnung im Text wie HTML:  "Das finde ich <welle>toll</welle>."
   FX ist ein GESCHLOSSENES Vokabular (wie die Emotion-Tags): unbekannte Tags
   bleiben als Text stehen, damit ein Tippfehler in der Kartendatei sichtbar
   wird statt still zu verschwinden.
   Ein Text wird in Zeichen zerlegt: { ch, fx } — fx = Name des Effekts oder
   null. Damit rechnen Umbruch, Seitenumbruch und Typewriter auf derselben
   Liste, und die Auszeichnung verändert die Seitenzahl nicht.
   ============================================================================= */
export const FX = ["welle", "zittern", "knall", "marker", "gross", "leise"];
const FX_RE = new RegExp("<(" + FX.join("|") + ")>([\\s\\S]*?)<\\/\\1>", "g");

/* Auszeichnung entfernen (für Stimme, Logs, Messung). */
export function plain(txt) {
  return String(txt ?? "").replace(FX_RE, "$2");
}

/* Markup → [{ ch, fx }]. Zeilenumbrüche werden zu Leerzeichen; Whitespace
   wird auf einzelne Leerzeichen eingedampft, damit der Umbruch nur an
   Wortgrenzen arbeiten muss. */
export function parseChars(txt) {
  const out = [];
  const push = (s, fx) => {
    for (const ch of s.replace(/\s+/g, " ")) out.push({ ch, fx });
  };
  const text = String(txt ?? "");
  let last = 0, m;
  FX_RE.lastIndex = 0;
  while ((m = FX_RE.exec(text)) !== null) {
    if (m.index > last) push(text.slice(last, m.index), null);
    push(m[2], m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last), null);
  // Rand-Leerzeichen weg
  while (out.length && out[0].ch === " ") out.shift();
  while (out.length && out[out.length - 1].ch === " ") out.pop();
  return out;
}

/* [{ ch, fx }] → Markup (Seiten werden als Markup weitergereicht). */
export function serialize(chars) {
  let s = "", open = null;
  for (const c of chars) {
    if (c.fx !== open) {
      if (open) s += `</${open}>`;
      if (c.fx) s += `<${c.fx}>`;
      open = c.fx;
    }
    s += c.ch;
  }
  if (open) s += `</${open}>`;
  return s;
}

export const charsToString = (chars) => chars.map((c) => c.ch).join("");

/* Wörter (mit Leerzeichen als eigene Einträge dazwischen). */
export function splitWords(chars) {
  const words = [];
  let cur = [];
  for (const c of chars) {
    if (c.ch === " ") { if (cur.length) words.push(cur); cur = []; }
    else cur.push(c);
  }
  if (cur.length) words.push(cur);
  return words;
}

/* Satzgrenzen: nach . ! ? … + Leerzeichen. Kurze Fragmente (Abkürzungen wie
   „z. B.") und kleingeschriebene Anschlüsse werden wieder angehängt, damit
   daraus keine eigene Seite wird. */
export function splitSentences(chars) {
  const parts = [];
  let cur = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c.ch === " " && cur.length && /[.!?…]/.test(cur[cur.length - 1].ch)) {
      parts.push(cur); cur = [];
      continue;
    }
    cur.push(c);
  }
  if (cur.length) parts.push(cur);
  const out = [];
  parts.forEach((p) => {
    const first = p[0]?.ch ?? "";
    if (out.length && (p.length < 4 || /^[a-zäöüß]/.test(first))) {
      out[out.length - 1] = out[out.length - 1].concat([{ ch: " ", fx: null }], p);
    } else out.push(p);
  });
  return out;
}

/* Teilstücke an Komma, Semikolon, Doppelpunkt, Gedankenstrich (Notfall bei
   Sätzen, die allein nicht auf eine Seite passen). */
export function splitClauses(chars) {
  const parts = [];
  let cur = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c.ch === " " && cur.length && /[,;:—–]/.test(cur[cur.length - 1].ch)) {
      parts.push(cur); cur = [];
      continue;
    }
    cur.push(c);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

export const joinWithSpace = (a, b) => (a.length ? a.concat([{ ch: " ", fx: null }], b) : b.slice());
