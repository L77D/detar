/* =============================================================================
   DETAR — Karten-Daten: Elektroniker/in für Betriebstechnik (Siemens)
   Dialog 1:1 aus Dialogsystem/detar_dialog_v2.html (Stand 03.09.2026).
   Figur und Marker sind PLATZHALTER (PENNY-Lagerlogistik-Assets), bis die
   Siemens-Figur produziert ist. Fachliche Angaben aus der Siemens-Stellen-
   ausschreibung (Stand 31.08.2026), Formulierungen ohne Arbeitgeber-Freigabe.

   Eine Karte ist eine Datei. Die Engine (js/dialogEngine.js) kennt keinen
   Beruf, nur die Felder: themen / greeting / asks / questions / reentry.
   Datenmodell: Dialogsystem/DETAR_Dialogsystem.md, Abschnitt 4.
   Emotion-Tags (geschlossenes Vokabular = Posennamen): neutral · winken ·
   erklaeren · denken · bestaetigen · halten · schulterzucken · stolz ·
   erschoepft · zeigen · zweihaendig — Zuordnung auf die heute vorhandenen
   Körper in js/config.js → POSES.
   Highlight-Tags im Text: <welle> <zittern> <knall> <marker> <gross> <leise>
   (welle/zittern werden im Canvas-Renderer geparst, aber nicht bewegt).
   ============================================================================= */
export const card = {
  id: "siemens_elektroniker_betriebstechnik",
  profession: "Elektroniker/in für Betriebstechnik",
  company: "Siemens",
  companyLogo: null,   // kein Logo → Firmenname als Text im Splash
  npc: "Jonas · 2. Lehrjahr",
  // Link hinter dem DEIN-ERSTER-TAG-Label oben links (neuer Tab)
  jobUrl: "https://www.ausbildung.siemens.com/offer/elektroniker-w-m-d-fur-betriebstech/21edd4e8-bc72-47bd-8846-689054d2832e",
  idleReturnMs: 8000,

  /* Themen sind über ALLE Karten identisch — dadurch kostet die Ebene inhaltlich
     fast nichts und der Schüler erkennt sie von Karte zu Karte wieder.
     Jede Frage trägt genau ein `thema`; Ausstieg und Link gehören zu keinem und
     stehen dauerhaft in der Fußzeile beider Ebenen. */
  themen: [
    { id: "alltag", label: "Alltag im Job" },
    { id: "beruf",  label: "Was der Beruf bringt" },
    { id: "wege",   label: "Wie man reinkommt" },
  ],

  /* Von Anfang an sichtbar — je Thema genau eine offene Frage zum Start,
     damit keine Themenkarte leer wirkt. */
  initial: ["was", "koennen", "jetzt_tun", "ende", "link"],

  greeting: {
    tag: "winken",
    text: "Hey! Ich bin Jonas, ich mache hier eine Ausbildung zum Elektroniker für Betriebstechnik. Frag mich <welle>was</welle>.",
  },

  /* Rückfragen der Figur. Ausgelöst über `trigger`:
       afterAnswers: n  → nach der n-ten beantworteten Frage
       onExit: true     → beim Ausstieg, vor der Verabschiedung
     Genau EINE davon führt einen Zustand (neigung), die übrigen sind
     zustandslos und kosten nur ihre Reaktionszeilen.
     REGEL: Die Reaktionen beschreiben den Berufsalltag, sie beurteilen nie die
     Person — weder verneinend noch bestätigend. Siehe DETAR_Dialogsystem.md 7.2. */
  asks: [
    { id: "neigung", trigger: { afterAnswers: 1 }, tag: "denken",
      prompt: "Sag mal — arbeitest du lieber mit Menschen oder lieber mit Maschinen?",
      options: [
        { label: "Eher mit Menschen", sets: { neigung: "menschen" }, unlocks: ["reden"],
          tag: "schulterzucken",
          reply: "Verstehe. Reden gehört hier schon dazu — im Team ständig. Den größten Teil des Tages hast du aber Werkzeug in der Hand, nicht Leute vor dir." },
        { label: "Eher mit Maschinen", sets: { neigung: "maschinen" }, unlocks: ["technik"],
          tag: "bestaetigen",
          reply: "Kenn ich. Der Tag geht fast komplett für den Kasten drauf — geredet wird vor allem mit den zwei Leuten, mit denen man dransteht." },
        { label: "Weiß ich noch nicht", sets: { neigung: "unbekannt" }, tag: "schulterzucken",
          reply: "Musst du auch nicht. Das merkt man meistens erst, wenn man es mal gemacht hat." },
      ] },

    { id: "quiz", trigger: { afterAnswers: 3 }, tag: "denken",
      prompt: "Rate mal: Wie viele einzelne Kabel stecken in so einem Kasten, den wir bauen?",
      options: [
        { label: "So zwanzig", tag: "schulterzucken",
          reply: "Deutlich mehr. Bei einem größeren Kasten sind es mehrere hundert — und jedes einzelne wird auf Länge geschnitten, an beiden Enden festgeschraubt und geprüft." },
        { label: "Ein paar hundert", tag: "bestaetigen",
          reply: "<knall>Genau.</knall> Und jedes einzelne wird auf Länge geschnitten, an beiden Enden festgeschraubt und geprüft — deshalb dauert so ein Kasten auch mehrere Tage." },
        { label: "Tausende", tag: "schulterzucken",
          reply: "So viele dann doch nicht. Ein paar hundert bei einem größeren Kasten — aber jedes davon geht einzeln durch meine Hände." },
      ] },

    { id: "fazit", trigger: { onExit: true }, tag: "denken",
      prompt: "Bevor du gehst — könntest du dir sowas vorstellen?",
      options: [
        { label: "Ja, klingt gut", tag: "bestaetigen", unlocks: ["praktikum_wie"],
          reply: "Gut. Am ehesten merkst du es in einem Praktikum — da siehst du den Alltag und nicht nur die guten Tage." },
        { label: "Eher nicht", tag: "bestaetigen",
          reply: "Auch ein Ergebnis. Dann weißt du das jetzt, ohne es drei Jahre lang auszuprobieren." },
        { label: "Keine Ahnung", tag: "schulterzucken",
          reply: "Völlig okay. Guck dir noch ein paar andere an, das sortiert sich mit der Zeit." },
      ] },
  ],

  /* Wiedereinstieg nach der Verabschiedung. Bewusst beiläufig: keine
     Aufforderung, keine Erinnerung an Link oder Bewerbung — die Figur nimmt
     das Gespräch nur locker wieder auf. Erste passende Regel gewinnt. */
  reentry: {
    rules: [
      { ifVisit: 4, tag: "schulterzucken", text: "Du schon wieder — langsam kenn ich dich." },
      { ifVisit: 3, tag: "bestaetigen",    text: "Na, doch noch was offen?" },
      { tag: "bestaetigen",                text: "Ah, da bist du ja wieder. Frag ruhig." },
    ],
  },

  questions: [
    /* --- von Anfang an sichtbar ------------------------------------------ */
    { id: "was", thema: "alltag", label: "Was machst du hier eigentlich?", tag: "erklaeren",
      text: "Ich baue Stromkästen — ungefähr so groß wie ein Kleiderschrank. Bei uns heißen die Schaltanlagen, und in einer Fabrik oder einem Krankenhaus läuft der ganze Strom da durch. Wir schrauben sie zusammen, ziehen die Kabel und prüfen alles, bevor sie rausgehen.",
      unlocks: ["tag_ablauf", "purpose"] },

    { id: "purpose", thema: "beruf", label: "Wem hilft das, was du baust?", tag: "stolz",
      text: "Die Kästen gehen in Krankenhäuser, Wasserwerke, Fabriken. Wenn der Strom da ankommt, merkt das keiner — wenn er wegbleibt, merken es <marker>alle sofort</marker>. Dafür sorgen wir.",
      unlocks: ["anstrengend"] },

    { id: "tag_ablauf", thema: "alltag", label: "Wie sieht dein Tag aus?", tag: "erklaeren",
      text: "Halb sieben in der Werkstatt, kurz besprechen, wer was macht, dann geht's an den Kasten. Vormittags wird meistens geschraubt, nachmittags gemessen. Einmal die Woche Berufsschule.",
      unlocks: ["anstrengend", "geld"] },

    { id: "koennen", thema: "beruf", label: "Was muss ich dafür können?", tag: "erklaeren",
      text: "Mittlere Reife reicht als Abschluss. Wichtiger ist, dass dir Physik und Mathe nicht komplett egal sind — und dass du sorgfältig arbeitest. Bei Strom ist Schludern <marker>keine Option</marker>.",
      unlocks: ["geld", "bewerbung"] },

    /* --- Zweige aus der Neigungs-Rückfrage -------------------------------- */
    { id: "reden", thema: "alltag", label: "Redet man da überhaupt mit jemandem?", tag: "erklaeren",
      requires: { neigung: ["menschen"] },
      text: "Im Team dauernd — wir bauen ja zu zweit oder zu dritt an einem Kasten. Was fehlt, sind die Leute, für die wir das bauen: Die sehe ich fast nie." },

    { id: "technik", thema: "alltag", label: "Wie technisch wird es wirklich?", tag: "erklaeren",
      requires: { neigung: ["maschinen"] },
      text: "Technischer als die meisten denken. Wenn der Kasten fertig ist, wird gemessen: Kommt überall Strom an, wo er hin soll — und nirgends, wo er nicht hin darf? Wenn etwas nicht stimmt, suchst du den Fehler, bis du ihn hast." },

    /* --- durch Antworten freigeschaltet ---------------------------------- */
    { id: "geld", thema: "beruf", label: "Was verdient man dabei?", tag: "bestaetigen",
      text: "Im ersten Jahr <gross>1.261 Euro</gross> im Monat, im vierten <gross>1.466</gross>. Dazu 30 Tage Urlaub und 50 Euro im Monat auf so eine Guthabenkarte. Klingt erstmal viel für die Schule, ist es auch.",
      unlocks: ["danach"] },

    { id: "anstrengend", thema: "alltag", label: "Was ist daran anstrengend?", tag: "erschoepft",
      text: "<zittern>Stehen.</zittern> Den ganzen Tag. Und im Sommer ist es in der Halle warm. Das Prüfen am Schluss braucht Geduld, da darf nichts übersehen werden — das ist der Teil, der wirklich müde macht.",
      unlocks: ["danach"] },

    { id: "danach", thema: "beruf", label: "Und was kommt danach?", tag: "stolz",
      text: "Dreieinhalb Jahre dauert die Ausbildung. Danach wirst du meistens übernommen, also fest angestellt — der Betrieb bildet aus, weil er Leute braucht, nicht weil es nett aussieht.",
      unlocks: ["bewerbung", "praktikum_wie"] },

    { id: "bewerbung", thema: "wege", label: "Wie bewirbt man sich?", tag: "zeigen",
      text: "Online, über die Ausbildungsseite des Betriebs. Dort steht, welche Unterlagen gebraucht werden und wann welche Jahrgänge starten — das ändert sich, deshalb guckst du das besser direkt dort nach." },

    { id: "jetzt_tun", thema: "wege", label: "Was sollte ich jetzt schon tun?", tag: "erklaeren",
      text: "Ehrlich? Ein Praktikum. Zwei Wochen in einer Werkstatt sagen dir mehr als jede Broschüre. Und guck dir in Physik den Teil mit Strom und Spannung genauer an, den brauchst du wirklich.",
      unlocks: ["praktikum_wie"] },

    /* --- Praktikum: der unverbindliche Weg, vom Nutzer selbst gewählt ----- */
    { id: "praktikum_wie", thema: "wege", label: "Wie kommt man an ein Praktikum?", tag: "erklaeren",
      text: "Zwei Wege. Entweder über die Schule, die haben feste Praktikumswochen und meistens auch Adressen. Oder du fragst direkt: kurze Mail an den Betrieb, mit Name, Klasse, wann du Zeit hast und warum ausgerechnet der Beruf.",
      unlocks: ["praktikum_was"] },

    { id: "praktikum_was", thema: "wege", label: "Und was bringt mir das?", tag: "stolz",
      text: "In zwei Wochen siehst du den Alltag: wie laut es ist, wie schnell gearbeitet wird, wie die Leute miteinander reden. Selber machen darfst du wenig, aber du merkst ziemlich schnell, ob dich das anzieht oder nervt. Ich hab so gemerkt, dass ich das <welle>will</welle>." },

    /* --- externer Link (dauerhafte Fußzeile) ------------------------------ */
    { id: "link", label: "Alles Offizielle zum Beruf", tag: "zeigen", link: true,
      url: "https://www.ausbildung.siemens.com/offer/elektroniker-w-m-d-fur-betriebstech/21edd4e8-bc72-47bd-8846-689054d2832e",
      text: "Ich mach dir die Seite auf. Da steht das Offizielle drin — Voraussetzungen, Ansprechpartner, alles Aktuelle." },

    /* --- Ausstieg (dauerhafte Fußzeile) ----------------------------------- */
    { id: "ende", label: "Ich muss weiter", tag: "winken", end: true,
      text: "Alles klar. Mach's gut — und viel Erfolg bei dem, was du dann machst!" },
  ],
};
