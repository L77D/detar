/* =============================================================================
   DETAR — Edition der Karte: Firmenversion (Standard) oder Public (?public).

   Michael 2026-09-09: Es gibt zwei Versionen einer Karte — für Firmenkunden
   (Logo/Firmenname im Splash, Link zur Ausbildungsseite im Dialog) und eine
   neutrale Public-Version ohne Firmenbezug. Der Unterschied steckt im
   QR-Code: derselbe Link mit `?public` liefert die neutrale Fassung. Eine
   Kartendatei, kein zweiter Text.

   prepareCard() liefert eine KOPIE der Karte für die gewählte Edition:
   • Fragen mit `branded: true` (heute: die Link-Frage „Zeig mir die Seite")
     fliegen im Public-Modus raus — samt ihrer Ids in `initial` und in allen
     `unlocks`, damit kein NEU-Punkt auf einer Frage hängt, die es nicht gibt.
   • `{firma}` in Texten (greeting, asks, questions, reentry, labels) wird
     durch `card.company` bzw. im Public-Modus durch `card.companyNeutral`
     ersetzt (Fallback „der Betrieb"). Die heutige Karte sagt schon überall
     „der Betrieb" — der Platzhalter ist für kommende Karten da.
   • Public: `company`, `companyLogo`, `jobUrl` sind null; `edition` = "public".
   Splash-Block „bei + Logo/Firma" blendet main.js über body.public aus (der
   Public-Splash wird noch gestaltet, bis dahin steht dort nichts).
   ============================================================================= */

export function prepareCard(card, { publicMode = false } = {}) {
  const firma = publicMode ? (card.companyNeutral ?? "der Betrieb") : (card.company ?? "");
  const sub = (s) => (typeof s === "string" ? s.replace(/\{firma\}/g, firma) : s);

  // Fragen filtern; Ids der entfernten Fragen überall streichen
  const dropped = new Set();
  const questions = (card.questions ?? []).filter((q) => {
    if (publicMode && q.branded) { dropped.add(q.id); return false; }
    return true;
  }).map((q) => ({ ...q, label: sub(q.label), text: sub(q.text),
    unlocks: q.unlocks?.filter((id) => !dropped.has(id)) }));
  const clean = (ids) => ids?.filter((id) => !dropped.has(id));
  // (unlocks der Fragen sind oben schon gefiltert; ein zweiter Lauf, falls
  //  eine entfernte Frage NACH einer Frage steht, die sie freischaltet)
  for (const q of questions) q.unlocks = clean(q.unlocks);

  const asks = (card.asks ?? []).map((a) => ({ ...a, prompt: sub(a.prompt),
    options: (a.options ?? []).map((o) => ({ ...o, label: sub(o.label), reply: sub(o.reply), unlocks: clean(o.unlocks) })) }));

  return {
    ...card,
    edition: publicMode ? "public" : "firma",
    company: publicMode ? null : card.company,
    companyLogo: publicMode ? null : card.companyLogo,
    jobUrl: publicMode ? null : card.jobUrl,
    initial: clean(card.initial),
    greeting: card.greeting ? { ...card.greeting, text: sub(card.greeting.text) } : card.greeting,
    asks,
    questions,
    reentry: card.reentry ? { ...card.reentry, rules: (card.reentry.rules ?? []).map((r) => ({ ...r, text: sub(r.text) })) } : card.reentry,
  };
}
