# Plan: Freundeskala (nach Fun Facts)

Stand: umgesetzt (id `freundeskala`, CSS-Präfix `fk-`). Entschieden: Name „Freundeskala“, Punkte wie im Brettspiel,
gelegt wird der Reihe nach, keine eigenen Fragen des Hosts.

## Spielidee

Ein kooperatives Spiel für alle zusammen. Auf dem Fernseher erscheint eine Frage, die jeder mit einer Zahl über
sich selbst beantwortet, z. B. „Wie viele Paar Schuhe besitzt du?“ oder „Wie sehr magst du Spinnen, von 0 bis 100?“.
Jeder tippt seine Zahl geheim ins Handy. Danach legt die Gruppe die Profilbilder aller Spieler der Reihe nach auf
eine Linie von wenig nach viel, ohne die Zahlen zu kennen. Für jedes Bild an der richtigen Stelle gibt es einen
Punkt für alle. Das Spiel lebt davon, dass man sich gegenseitig einschätzt und darüber redet
(„Du hast doch nie im Leben mehr Schuhe als ich!“).

Es gibt keine Fragen mit Lösung: Die Wahrheit sind die Zahlen der Mitspieler.

## Fragen

- **Eigene Fragendatei** `server/games/freundeskala/questions.json`, getrennt vom Pub Quiz.
- **Aufbau einer Frage:**
  ```json
  { "id": "fk001", "category": "Alltag", "question": "Wie viele Paar Schuhe besitzt du?",
    "kind": "count", "max": 500, "unit": "Paar" }
  ```
  - `kind`: `count` (ganze Zahl ab 0, z. B. Anzahl, Jahre, Minuten) oder `scale` (Skala 0–100 für Meinungen
    und Gefühle). Auf dem Handy wird `scale` als Schieberegler mit Zahl angezeigt, `count` als Zifferneingabe.
  - `max`: Obergrenze bei `count`, damit niemand 10 Milliarden eintippt.
  - `unit`: optionale Einheit für die Auflösung („Paar“, „Minuten“).
  - `low`/`high`: optionale Beschriftung der Enden der Linie, sonst „wenig“ und „viel“
    (bei Skalen z. B. „gar nicht“ und „total“).
- **Kategorien:** Alltag, Essen & Trinken, Vorlieben, Erinnerungen, Gewohnheiten, Technik & Handy, Reisen,
  Mutproben, Was wäre wenn. Gut 200 Fragen, ungefähr halb Anzahl, halb Skala. Die Fragen müssen für jeden
  beantwortbar sein (keine Fragen nach Kindern, Gehalt oder Gewicht, nichts, was jemanden bloßstellt).
- **Fragen ausschließen** wie im Pub Quiz und Bluff-Quiz: Solange geantwortet wird, kann jeder
  „Frage ausschließen“ antippen, bei Einstimmigkeit wird sie ersetzt und dauerhaft gesperrt
  (`server/exclusions.js`, Präfix `fk`).
- **Keine Wiederholung innerhalb einer Lobby,** solange genug neue Fragen da sind.
- **Keine eigenen Fragen** des Hosts.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Anzahl Fragen | 8 | 3–20 |
| Kategorien | alle | einzeln an- und abwählbar (mit Anzahl Fragen pro Kategorie) |
| Fragearten | beide | nur Anzahl, nur Skala, beide |
| Zeit zum Antworten | 60 s | 30–120 s oder ohne Limit |

Die Eingabezeit endet vorzeitig, sobald alle eine Zahl abgegeben haben. Das Legen hat kein Zeitlimit, weil das
Diskutieren der Spaß ist.

## Ablauf einer Frage

1. **Frage zeigen:** Kategorie und Fragetext groß auf dem Fernseher, auf dem Handy dieselbe Frage mit
   Zifferneingabe oder Schieberegler.
2. **Zahl eingeben:** Jeder gibt geheim eine Zahl ein und kann sie bis zum Ende der Phase ändern. Der Fernseher
   zeigt, wer schon abgegeben hat, nicht was. Die eigene Zahl bleibt auf dem eigenen Handy die ganze Runde
   sichtbar. Wer bis zum Ende der Zeit nichts abgibt, macht in dieser Runde nicht mit.
3. **Legen der Reihe nach (wie im Brettspiel):** Auf dem Fernseher erscheint eine waagerechte Linie von wenig
   nach viel. Die Reihenfolge der Spieler wird jede Runde neu ausgelost. Das Bild des ersten liegt sofort auf der
   Linie. Wer dran ist, sieht auf dem Handy die bisherige Reihe (senkrecht, oben viel, unten wenig) und tippt die
   Lücke an, in die er sein Bild legt. Gelegte Bilder lassen sich nicht mehr verschieben. Der Fernseher zeigt groß,
   wer gerade dran ist. Wenn alle liegen, beginnt die Auflösung.
4. **Auflösung** auf dem Fernseher von wenig nach viel: Bild für Bild wird die Zahl aufgedeckt. Stimmt die Stelle,
   leuchtet das Bild grün, sonst rot. Danach zeigt eine zweite Reihe, wie es richtig gewesen wäre. Der Host kann
   mit „Weiter“ beschleunigen.
5. **Punkte wie im Brettspiel:** Die Gruppe bekommt einen Punkt für jedes Bild, das genau an seinem richtigen Platz
   liegt. Gleiche Zahlen sind austauschbar: Haben zwei Spieler 3 Paar Schuhe, ist jede Reihenfolge der beiden
   richtig. Technisch: Platz *i* ist richtig, wenn die Zahl dort gleich der *i*-kleinsten aller Zahlen ist.
6. **Zwischenstand:** Punkte der Runde und Gesamtpunkte gegen die höchstmöglichen Punkte. Dann startet der Host
   die nächste Frage. Am Ende eine Bewertung wie bei Just One und drei Sonderpreise: „Gedankenleser“ (eigenes Bild
   am häufigsten richtig gelegt), „Überraschungsei“ (eigenes Bild insgesamt am weitesten daneben) und
   „Extremist“ (am häufigsten die kleinste oder größte Zahl).

## Technik

- **Neues Spiel** `server/games/freundeskala/index.js`, eingetragen in `server/games/index.js`. Gleiche
  Schnittstelle wie die übrigen Spiele: `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`,
  `view(viewer)`, `playersChanged()`, `dispose()`.
- **Ohne Teams** über `meta().teams === false` wie bei Just One, `minPlayers: 3`, `maxPlayers: 12`. Bei weniger
  als drei ist die Reihenfolge trivial, bei mehr als zwölf passt die Linie nicht mehr lesbar auf den Fernseher.
- **Mitspieler ohne Gerät** (`meta().sharedDevice`) nicht vorgesehen, die Zahlen müssen geheim bleiben.
- **Spielzüge** über `game:action`: `{ type: 'answer', value }`, `{ type: 'place', index }`,
  `{ type: 'exclude', wanted }`, `{ type: 'skip' }` und `{ type: 'next' }` (beide nur Host).
- **Phasen:** `answer` → `place` → `reveal` → `scores`, am Ende `final`. Zeitgeber wie im Bluff-Quiz (`deadline`
  im Zustand, Countdown im Browser).
- **Zustand pro Frage:** Frage, Antworten `Map<spielerId, zahl>`, Legereihenfolge (`turnOrder`), aktuelle Reihe
  `[spielerId]` von wenig nach viel, Ergebnis pro Platz. `view()` gibt fremde Zahlen erst in der Auflösung heraus,
  vorher nur die eigene.
- **Wiederverbinden:** Zahl und Platz liegen auf dem Server, nach einem Neuladen ist alles wieder da.
- **Spieler verlässt das Spiel:** In der Eingabephase fällt er aus der Runde. Liegt sein Bild schon, bleibt es
  liegen und zählt mit. Ist er beim Legen gerade dran, rückt er ans Ende der Warteschlange; sind nur noch
  Getrennte übrig, fallen sie aus der Runde. Der Host kann den Spieler, der dran ist, mit „Überspringen“ aus der
  Runde nehmen. Wer während einer Frage beitritt, macht ab der nächsten mit. Antworten weniger als zwei Spieler,
  wird die Frage ohne Wertung übersprungen.
- **Oberfläche:** `public/js/freundeskala.js` und `public/css/freundeskala.css` (Präfix `fk-`), eingehängt über
  das `gameViews`-Register in `lobby.js`. Dieselbe Reihe ist auf breiten Bildschirmen waagerecht, auf dem Handy
  senkrecht (oben viel), die Lücken sind Knöpfe für den, der dran ist.
- **Startseite:** Kachel „Freundeskala“ mit Symbol 📏, „3–12 Spieler, alle zusammen“.

## Entscheidungen

- Der Name ist „Freundeskala“.
- Punkte wie im Brettspiel: ein Punkt pro Bild genau am richtigen Platz.
- Gelegt wird der Reihe nach, ein freies Legen gibt es nicht.
- Der Host kann keine eigenen Fragen eintippen.
