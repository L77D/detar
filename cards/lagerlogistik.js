/* =============================================================================
   DETAR — Karten-Daten: Fachkraft für Lagerlogistik (PENNY)
   Eine Datei pro Beruf. Neue Karte = Datei kopieren, Inhalte ändern,
   Import in js/main.js umstellen (bzw. später: per URL-Parameter wählen).
   ============================================================================= */
export const card = {
  id: "lagerlogistik",
  profession: "Fachkraft für Lagerlogistik",
  company: "PENNY",
  // Link hinter dem DEIN-ERSTER-TAG-Label oben links (öffnet neuen Tab)
  jobUrl: "https://www.deinerstertag.de/ausschreibung/133024/penny_markt_gmbh/fachkraft_fuer_lagerlogistik/grossbeeren/",
  greeting: "Hey! Willst du wissen, was bei uns im Lager so abgeht?",
  idleReturnMs: 8000,
  questions: [
    { id: "alltag", label: "Was machst du eigentlich den ganzen Tag?",
      answer: "LKWs entladen, Ware checken, einlagern, Bestellungen für die Filialen zusammenstellen – bei uns steht's nie still.", pose: "affirm" },
    { id: "technik", label: "Arbeitest du mit Technik oder nur Muskelkraft?",
      answer: "Beides! Scanner und PC für die Buchung, Ameise und Stapler fürs Grobe – Kopf und Hände gleichzeitig.", pose: "affirm" },
    { id: "lager", label: "Wird einfach alles in ein Regal gepackt?",
      answer: "Niemals – gekühlt, tiefgekühlt oder trocken, jede Ware hat ihren Platz. Sonst wird's nix mit frischer Ware im Markt.", pose: "think" },
    { id: "team", label: "Machst du das alles allein?",
      answer: "Auf keinen Fall, das läuft nur im Team. Kurz absprechen, anpacken, fertig ist die Palette.", pose: "affirm" },
    { id: "verantwortung", label: "Ist das nicht ein bisschen ein Job im Hintergrund?",
      answer: "Hinter den Kulissen, aber mega wichtig: Ohne uns wären die Regale im Markt leer.", pose: "think" },
    { id: "vorteile", label: "Lohnt sich der Job auch für dich?",
      answer: "Auf jeden Fall – Tariflohn, Urlaubs- und Weihnachtsgeld, gute Übernahmechancen und ein sicherer Job.", pose: "affirm" },
    { id: "witz", label: "Also alles Paletti bei dir?", answer: "Okay, nächste Frage.", pose: "think" },
    { id: "name", label: "Wie heisst du eigentlich?", answer: "Peter.", pose: "think" },
  ],
};
