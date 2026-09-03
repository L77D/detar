/* =============================================================================
   DETAR — DialogEngine: der Zustand des Gesprächs, ohne DOM und ohne 3D.
   Port der Engine aus Dialogsystem/detar_dialog_v2.html (Stand 03.09.2026).

   Die Engine kennt keinen Beruf, nur die Regeln der Kartendatei:
     unlocks   — eine beantwortete Frage schaltet weitere frei (nur hinzu)
     requires  — eine Frage erscheint nur bei bestimmten Variablenwerten
     sets      — eine Antwortoption der Rückfrage setzt die eine Variable
     trigger   — wann die Figur zurückfragt (afterAnswers n / onExit)
   Was gesprochen und gezeigt wird, entscheidet der CardController; hier
   liegen nur Zustand und Abfragen. Grundform ist der Hub (kein Baum): alle
   freigeschalteten Fragen liegen gleichzeitig vor, gestellte rutschen ans
   Ende und tragen „nochmal", Freischaltungen tragen „neu".
   ============================================================================= */
export class DialogEngine {
  constructor(card) {
    this.card = card;
    this.reset();
  }

  reset() {
    const initial = this.card.initial ?? [];
    this.unlocked = new Set(initial);
    this.asked = new Set();      // schon gestellte Fragen (auch Ausstieg/Link)
    this.fresh = new Set();      // frisch freigeschaltet → Marke „neu"
    this.vars = {};              // die eine steuernde Variable (Name aus der Karte)
    this.asksDone = new Set();   // Rückfragen, die schon dran waren
    this.visits = 1;             // Besuche (Wiedereinstieg zählt hoch)
    this.view = { mode: "themen", thema: null }; // Themenebene oder ein Thema
  }

  /* ---- Abfragen ----------------------------------------------------------- */
  meetsRequirement(q) {
    if (!q.requires) return true;
    return Object.entries(q.requires).every(([k, allowed]) => allowed.includes(this.vars[k]));
  }
  /* Fragen eines Themas: alles Freigeschaltete, dessen Bedingung erfüllt ist —
     auch schon gestellte (die bleiben wählbar, mit Marke „nochmal"). */
  questionsOf(themaId) {
    return this.card.questions.filter((q) => q.thema === themaId
      && this.unlocked.has(q.id) && this.meetsRequirement(q));
  }
  openOf(themaId) {
    return this.questionsOf(themaId).filter((q) => !this.asked.has(q.id));
  }
  /* Reihenfolge im Thema: freigeschalteter Zweig (requires) zuerst, sonst
     Reihenfolge der Datei; gestellte ans Ende. */
  sortedQuestionsOf(themaId) {
    const rank = (q) => (this.asked.has(q.id) ? 50 : 0) + (q.requires ? 0 : 5);
    return this.questionsOf(themaId).sort((a, b) => rank(a) - rank(b));
  }
  /* Themenkarten mit Zähler und Marke. */
  themes() {
    return (this.card.themen ?? []).map((t) => {
      const open = this.openOf(t.id).length;
      const fresh = this.questionsOf(t.id).some((q) => this.fresh.has(q.id));
      return { ...t, open, fresh, done: open === 0 };
    });
  }
  /* Liegt außerhalb des aktuellen Themas etwas Neues? (NEU-Punkt am Zurück-Pfeil) */
  freshElsewhere(themaId) {
    return this.card.questions.some((q) => this.fresh.has(q.id) && q.thema && q.thema !== themaId);
  }
  /* Dauerhafte Fußzeile: Ausstieg + Link, auf beiden Ebenen erreichbar. */
  permaQuestions() {
    // Ausstieg an vorletzter Stelle, Link ganz unten (UI-Inventar, Abschnitt 3)
    return this.card.questions.filter((q) => (q.end || q.link) && this.unlocked.has(q.id))
      .sort((a, b) => (a.link ? 1 : 0) - (b.link ? 1 : 0));
  }
  /* Ausstieg („Ich muss weiter") — seit dem UI-Update 2026-09-03 eine normale
     Kachel im Themenraster und in jedem Thema (keine Fußzeile mehr). */
  exitQuestion() {
    return this.card.questions.find((q) => q.end && this.unlocked.has(q.id)) ?? null;
  }
  /* Marken einer Frage: neu freigeschaltet, schon gefragt, führt nach außen. */
  badgesFor(q) {
    const out = [];
    if (this.fresh.has(q.id)) out.push("neu");
    if (this.asked.has(q.id)) out.push("nochmal");
    if (q.link) out.push("link");
    return out;
  }
  questionById(id) { return this.card.questions.find((q) => q.id === id) ?? null; }

  /* ---- Übergänge ---------------------------------------------------------- */
  unlock(ids) {
    (ids ?? []).forEach((id) => {
      if (!this.unlocked.has(id)) { this.unlocked.add(id); this.fresh.add(id); }
    });
  }
  /* Frage wird gestellt. Liefert true, wenn sie schon einmal dran war —
     dann schaltet sie nichts frei und löst keine Rückfrage aus. */
  markAsked(q) {
    const again = this.asked.has(q.id);
    this.asked.add(q.id);
    this.fresh.delete(q.id);
    if (!again) this.unlock(q.unlocks);
    return again;
  }
  /* Nächste fällige Rückfrage suchen (erste, die noch nicht dran war). */
  pendingAsk(pred) {
    return (this.card.asks ?? []).find((a) => !this.asksDone.has(a.id) && pred(a)) ?? null;
  }
  askAfterAnswers() {
    const n = this.asked.size;
    return this.pendingAsk((a) => a.trigger && a.trigger.afterAnswers === n);
  }
  askOnExit() {
    return this.pendingAsk((a) => a.trigger && a.trigger.onExit);
  }
  beginAsk(ask) { this.asksDone.add(ask.id); }
  /* Antwortoption des Nutzers: setzt Variable, schaltet frei. */
  applyOption(o) {
    Object.assign(this.vars, o.sets ?? {});
    this.unlock(o.unlocks);
  }
  /* Rückkehr nach einer Antwort: im Thema bleiben, bis dort keine offene
     Frage mehr steht — dieser Zeitpunkt ist für den Nutzer vorhersehbar.
     Freischaltungen in anderen Themen werden nicht angesprungen, sondern über
     die NEU-Marke am Zurück-Pfeil signalisiert. */
  settleView() {
    if (this.view.mode === "thema" && this.openOf(this.view.thema).length === 0) {
      this.view = { mode: "themen", thema: null };
    }
  }
  enterThema(id) { this.view = { mode: "thema", thema: id }; }
  leaveThema() { this.view = { mode: "themen", thema: null }; }

  /* Wiedereinstieg nach dem Ruhezustand: erste passende Regel gewinnt,
     die letzte Regel ist der Standard. */
  reenter() {
    this.visits++;
    const endQ = this.card.questions.find((q) => q.end);
    if (endQ) this.asked.delete(endQ.id); // Ausstieg bleibt jederzeit möglich
    const rules = this.card.reentry?.rules ?? [];
    return rules.find((r) =>
      (!r.ifVar || Object.entries(r.ifVar).every(([k, v]) => v.includes(this.vars[k]))) &&
      (!r.ifAsked || r.ifAsked.every((id) => this.asked.has(id))) &&
      (!r.ifNotAsked || r.ifNotAsked.every((id) => !this.asked.has(id))) &&
      (!r.ifVisit || this.visits >= r.ifVisit)
    ) ?? rules[rules.length - 1] ?? null;
  }

  /* Kurzfassung des Zustands (Konsole / Dev). */
  summary() {
    const open = this.card.questions.filter((q) => this.unlocked.has(q.id)
      && this.meetsRequirement(q) && !this.asked.has(q.id)).map((q) => q.id);
    return {
      vars: { ...this.vars }, asked: [...this.asked], open,
      visits: this.visits, view: { ...this.view },
    };
  }
}
