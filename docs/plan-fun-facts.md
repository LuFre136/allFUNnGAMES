# Plan: Fun Facts

Stand: Plan, noch nicht umgesetzt. Offene Entscheidungen stehen am Ende.

## Spielidee

Ein kooperatives Spiel für alle zusammen. Auf dem Fernseher erscheint eine Frage, die jeder mit einer Zahl über
sich selbst beantwortet, z. B. „Wie viele Paar Schuhe besitzt du?“ oder „Wie sehr magst du Spinnen, von 0 bis 100?“.
Jeder tippt seine Zahl geheim ins Handy. Danach muss die Gruppe die Profilbilder aller Spieler gemeinsam der Größe
nach auf eine Linie legen, ohne die Zahlen zu kennen. Gelingt die Reihenfolge, gibt es Punkte für alle. Das Spiel
lebt davon, dass man sich gegenseitig einschätzt und darüber redet („Du hast doch nie im Leben mehr Schuhe als ich!“).

Es gibt keine richtige Antwort und keine Fragen mit Lösung: Die Wahrheit sind die Zahlen der Mitspieler.

## Fragen

- **Eigene Fragendatei** `server/games/funfacts/questions.json`, getrennt vom Pub Quiz, weil es keine Lösungen gibt.
- **Aufbau einer Frage:**
  ```json
  { "id": "ff001", "category": "Alltag", "question": "Wie viele Paar Schuhe besitzt du?",
    "kind": "count", "min": 0, "max": 999, "unit": "Paar", "low": "wenige", "high": "viele" }
  ```
  - `kind`: `count` (freie ganze Zahl, z. B. Anzahl, Jahre, Minuten) oder `scale` (Skala 0–100 für Meinungen
    und Gefühle, „Wie gern …?“). Auf dem Handy wird `scale` als Schieberegler mit Zahl angezeigt, `count` als
    Zifferneingabe.
  - `min`/`max`: erlaubter Bereich, damit niemand 10 Milliarden eintippt.
  - `unit`: optionale Einheit für die Auflösung („Paar“, „Minuten“, „€“).
  - `low`/`high`: Beschriftung der Enden der Linie auf dem Fernseher.
- **Kategorien** für den Start: Alltag, Essen & Trinken, Vorlieben (Skala), Erinnerungen, Gewohnheiten,
  Technik & Handy, Reisen, Mutproben (Skala), Was-wäre-wenn (Skala). Etwa 200 Fragen, ungefähr halb `count`,
  halb `scale`. Die Fragen müssen für jeden beantwortbar sein (keine Fragen nach Kindern, Gehalt oder Gewicht,
  nichts, was jemanden bloßstellt) und sollen die Antworten breit streuen.
- **Fragen ausschließen** wie im Pub Quiz und Bluff-Quiz: In der Eingabephase kann jeder „Frage ausschließen“
  antippen, bei Einstimmigkeit wird sie ersetzt und dauerhaft gesperrt (`server/exclusions.js`, Präfix `ff`).
- **Keine Wiederholung innerhalb einer Lobby,** solange genug neue Fragen da sind.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Anzahl Fragen | 8 | 3–20 |
| Kategorien | alle | einzeln an- und abwählbar (mit Anzahl Fragen pro Kategorie) |
| Fragearten | beide | nur Anzahl, nur Skala, beide |
| Zeit zum Antworten | 45 s | 20–120 s oder ohne Limit |
| Legen | der Reihe nach | der Reihe nach oder frei (siehe unten) |

Die Eingabezeit endet vorzeitig, sobald alle eine Zahl abgegeben haben. Das Sortieren hat kein Zeitlimit, weil
das Diskutieren der Spaß ist.

## Ablauf einer Frage

1. **Frage zeigen:** Kategorie und Fragetext groß auf dem Fernseher, auf dem Handy dieselbe Frage mit
   Zifferneingabe oder Schieberegler.
2. **Zahl eingeben:** Jeder gibt geheim eine Zahl ein. Der Fernseher zeigt, wer schon abgegeben hat, nicht was.
   Die eigene Zahl bleibt auf dem eigenen Handy die ganze Runde sichtbar, damit man beim Sortieren nicht
   vergisst, was man getippt hat. Wer bis zum Ende der Zeit nichts abgibt, macht in dieser Runde nicht mit.
3. **Sortieren:** Auf dem Fernseher erscheint eine waagerechte Linie von `low` nach `high`. Darauf werden die
   Profilbilder abgelegt, ohne Zahlen.
   - **Der Reihe nach (Standard, wie im Brettspiel):** Ein zufällig gewählter Spieler beginnt. Wer dran ist,
     sieht auf dem Handy die bisherige Reihe und tippt die Lücke an, in die er sein Bild legt (zwischen zwei
     anderen, ganz links oder ganz rechts). Danach ist der Nächste dran. Wer gelegt hat, darf sein Bild später
     nicht mehr verschieben. Der Fernseher zeigt groß, wer gerade dran ist.
   - **Frei:** Alle legen gleichzeitig und dürfen ihr eigenes Bild beliebig oft verschieben. Fremde Bilder
     kann man nicht verschieben, man muss die anderen überreden.
   - In beiden Varianten tippt am Ende jeder „Passt so“. Sind alle einverstanden, beginnt die Auflösung. Der
     Host kann die Auflösung auch vorzeitig starten („Auflösen“), falls jemand nicht mehr reagiert.
4. **Auflösung** auf dem Fernseher von links nach rechts: Bild für Bild wird die Zahl darunter aufgedeckt,
   mit kurzer Pause. Stimmt die Stelle, leuchtet das Bild grün, sonst rot. Zum Schluss rutschen falsch liegende
   Bilder an ihre richtige Stelle, damit alle sehen, wer sich wie verschätzt hat. Der Host kann mit „Weiter“
   beschleunigen.
5. **Punkte:** Die Gruppe bekommt einen Punkt für jedes Bild, das an der richtigen Stelle liegt (siehe
   Entscheidung 2 für die genaue Zählweise). Gleiche Zahlen gelten als austauschbar: Haben zwei Spieler 3 Paar
   Schuhe, ist jede Reihenfolge der beiden richtig.
6. **Zwischenstand:** Punkte der Runde und Gesamtpunkte gegen die höchstmöglichen Punkte. Dann startet der Host
   die nächste Frage. Am Ende eine Bewertung wie bei Just One („Perfekt! Ihr kennt euch in- und auswendig.“)
   und drei Sonderpreise: „Gedankenleser“ (lag am häufigsten richtig, wenn er gelegt hat), „Überraschungsei“
   (lag am häufigsten falsch, weil die eigene Zahl alle überrascht hat) und „Extremist“ (am häufigsten ganz
   außen in der Reihe).

## Technik

- **Neues Spiel** `server/games/funfacts/index.js`, eingetragen in `server/games/index.js`. Gleiche
  Schnittstelle wie die übrigen Spiele: `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`,
  `view(viewer)`, `playersChanged()`, `dispose()`.
- **Ohne Teams** über `meta().teams === false` wie bei Just One, `minPlayers: 3`, `maxPlayers: 12`. Bei weniger
  als drei ist die Reihenfolge trivial, bei mehr als zwölf passt die Linie nicht mehr lesbar auf den Fernseher
  und eine Runde dauert zu lange.
- **Mitspieler ohne Gerät** (`meta().sharedDevice`) nicht vorgesehen, die Zahlen müssen geheim bleiben.
- **Spielzüge** über `game:action`: `{ type: 'answer', value }`, `{ type: 'place', index }`,
  `{ type: 'ready', wanted }`, `{ type: 'exclude', wanted }`, `{ type: 'reveal' }` und `{ type: 'next' }`
  (beide nur Host).
- **Phasen:** `answer` → `sort` → `reveal` → `scores`, am Ende `final`. Zeitgeber wie im Pub Quiz (`deadline`
  im Zustand, Countdown im Browser).
- **Zustand pro Frage:** Frage, Antworten `Map<spielerId, zahl>`, Legereihenfolge der Spieler (`turnOrder`),
  aktuelle Reihe `[spielerId]`, `ready: Set<spielerId>`, Ergebnis pro Spieler (richtig/falsch).
  `view()` gibt fremde Zahlen erst in der Auflösung heraus, vorher nur die eigene.
- **Punkte berechnen:** Die richtige Reihenfolge ist die nach Zahl sortierte Liste. Bei gleichen Zahlen wird
  die gelegte Reihenfolge übernommen, damit Gleichstände nie Punkte kosten.
- **Wiederverbinden:** Zahl, Platz und „Passt so“ liegen auf dem Server, nach einem Neuladen ist alles wieder da.
- **Spieler verlässt das Spiel:** Ist er in der Eingabephase, fällt er aus der Runde. Liegt sein Bild schon, bleibt
  es liegen und zählt mit. Ist er beim Legen gerade dran, wird er übersprungen und am Ende angehängt, falls er
  zurückkommt. Wer während einer Frage beitritt, macht ab der nächsten mit.
- **Oberfläche:** `public/js/funfacts.js` und `public/css/funfacts.css` (Präfix `ff-`), eingehängt über das
  `gameViews`-Register in `lobby.js`. Fernseher mit großer Frage, Abgabe-Übersicht und der Linie mit
  Profilbildern; Handy mit Eingabe, eigener Zahl und der Reihe als Liste mit antippbaren Lücken. Im freien Modus
  zusätzlich Ziehen per Finger, angelehnt an das Pointer-Ziehen in `public/js/drkroko.js`. Auf dem Handy steht
  die Reihe senkrecht (oben = viel, unten = wenig), weil zwölf Bilder nebeneinander nicht passen.
- **Startseite:** Kachel „Fun Facts“ mit Symbol 🔢, „3–12 Spieler, alle zusammen“.

## Schritte zur Umsetzung

1. Fragendatei mit etwa 200 Fragen schreiben, jede mit Art, Bereich und Beschriftung der Enden.
2. Spiellogik: Phasen, Zeitgeber, Zahlen annehmen und prüfen, Legen der Reihe nach und frei, Punkte mit
   Gleichständen.
3. Frage-Ausschluss über `exclusions.js` anbinden.
4. Spielansicht für Handy und Fernseher, Auflösung mit Animation.
5. Zwischen- und Endwertung mit Sonderpreisen, Spielwechsel-Angaben in `meta()`.
6. Test mit mehreren Browsern über Playwright (Gleichstände, Zeit abgelaufen, Spieler verlässt beim Legen,
   Wiederverbinden, freier Modus, Ausschluss).

## Offene Entscheidungen

1. **Name:** „Fun Facts“ ist der Name eines gekauften Brettspiels. Behalten oder umbenennen, z. B. in
   „Zahlenreihe“, „Kennst du mich?“ oder „Der Größe nach“?
2. **Zählweise der Punkte:** Vorschlag ist „so viele Bilder wie möglich dürfen liegen bleiben“: Es zählt die
   größte Zahl an Bildern, die schon untereinander richtig sortiert sind (die anderen müsste man nur umlegen).
   Liegt nur einer völlig falsch, verliert die Gruppe so nur einen Punkt. Die strengere Variante aus dem
   Brettspiel zählt jedes Bild, das genau an seinem richtigen Platz liegt; dort kann ein einziges falsches Bild
   ganz vorne alle Punkte kosten.
3. **Legen:** Standard „der Reihe nach“ (wie im Brettspiel, spannender, aber langsamer) oder „frei“
   (schneller, chaotischer)? Der Plan sieht beides als Einstellung vor.
4. **Eigene Fragen:** Soll der Host eigene Fragen eintippen können? Bei diesem Spiel passt das besser als beim
   Bluff-Quiz, weil keine Lösung nötig ist („Wie oft war Lukas dieses Jahr zu spät?“). Vorschlag: zunächst nicht.
