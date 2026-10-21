# Plan: Bluff-Quiz

Stand: umgesetzt (Pull Request auf GitHub, 154 Fragen in 12 Kategorien; im Team-Modus reichen zwei Teams). Entschieden: Name „Bluff-Quiz“, keine eigenen Fragen des Hosts, mit Likes.

## Spielidee

Auf dem Fernseher erscheint eine Frage mit einer Lücke, deren echte Antwort kaum jemand kennt, z. B.
„Der Rekord im Dauerklatschen liegt bei ____ Stunden.“ Jeder Spieler erfindet auf seinem Handy eine falsche,
aber glaubwürdige Antwort. Danach werden alle erfundenen Antworten zusammen mit der echten gemischt angezeigt,
und jeder tippt auf die Antwort, die er für die echte hält. Punkte gibt es für das Finden der Wahrheit und dafür,
andere mit der eigenen Lüge hereinzulegen.

## Fragen

- **Eigene Fragendatei** `server/games/bluffquiz/questions.json`, getrennt vom Pub Quiz, weil die Fragen
  anders gebaut sind: Die Antwort muss überraschend sein, aber eine kurze Lücke füllen.
- **Aufbau einer Frage:**
  ```json
  { "id": "bq001", "category": "Tiere", "question": "Eine Gruppe Flamingos nennt man auf Englisch eine ____.",
    "answer": "Flamboyance", "alternatives": ["flamboyance"], "suggestions": ["Parade", "Pinkie", "Schwarm"] }
  ```
  - `answer`: die echte Antwort, so wie sie bei der Auflösung gezeigt wird.
  - `alternatives`: weitere Schreibweisen, die als „echte Antwort“ erkannt werden (siehe unten).
  - `suggestions`: drei bis fünf Ausweichlügen für Spieler, denen nichts einfällt, und als Füller (siehe unten).
- **Kategorien** für den Start: Tiere, Rekorde, Geschichte, Erfindungen, Essen & Trinken, Merkwürdige Gesetze,
  Wörter & Herkunft, Berufe, Promis, Orte, Zahlen. Etwa 150 Fragen zum Start, damit mehrere Partien ohne
  Wiederholung möglich sind.
- **Fragen ausschließen** wie im Pub Quiz: Während der Schreibphase kann jeder „Frage ausschließen“ antippen,
  bei Einstimmigkeit wird sie ersetzt und dauerhaft gesperrt. Dafür wird `server/exclusions.js` wiederverwendet;
  die IDs mit Präfix `bq` kollidieren nicht mit Pub-Quiz-IDs. `describe()` braucht dafür nur einen Fall für
  Fragen ohne `type` (Anzeige `question`).
- **Keine Wiederholung innerhalb einer Lobby:** bereits gespielte Fragen-IDs merkt sich die Lobby für die
  nächste Partie, solange noch genug neue da sind.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Anzahl Fragen | 8 | 3–20 |
| Kategorien | alle | einzeln an- und abwählbar (mit Anzahl Fragen pro Kategorie) |
| Zeit zum Schreiben | 60 s | 30–120 s |
| Zeit zum Wählen | 30 s | 15–60 s |
| Letzte Runde doppelt | an | an/aus (letzte Frage zählt doppelte Punkte) |
| Spielmodus | jeder für sich | jeder für sich oder Teams |

Die Zeiten enden vorzeitig, sobald alle abgegeben haben.

## Ablauf einer Frage

1. **Frage zeigen:** Kategorie und Fragetext groß auf dem Fernseher, die Lücke deutlich hervorgehoben.
   Auf dem Handy dieselbe Frage plus Eingabefeld (höchstens 40 Zeichen).
2. **Lügen schreiben:** Jeder gibt eine falsche Antwort ein. Der Host-Bildschirm zeigt, wer schon abgegeben
   hat (Profilbilder werden „umgedreht“), nicht was.
   - **Echte Antwort erwischt:** Trifft die Eingabe die echte Antwort (über `fuzzyMatch()` aus
     `server/util.js` gegen `answer` und `alternatives`), lehnt der Server sie ab mit „Das ist zu nah an der
     Wahrheit, denk dir etwas anderes aus.“ Der Spieler darf neu eingeben. So bleibt die Wahrheit nur einmal in
     der Liste.
   - **Doppelte Lügen:** Geben zwei Spieler dasselbe ein (über `normalize()`), wird es bei der Auswahl nur einmal
     gezeigt und zählt für beide als Urheber.
   - **Mir fällt nichts ein:** Ein Knopf gibt dem Spieler eine der `suggestions`, die er übernehmen oder
     abändern kann. Wer eine Vorschlagslüge nutzt, bekommt für Reinlegen nur halbe Punkte.
   - **Zeit abgelaufen ohne Eingabe:** Der Spieler bekommt automatisch eine Vorschlagslüge, damit die Liste
     nicht leer bleibt (ebenfalls halbe Punkte).
3. **Auswählen:** Alle Antworten (Lügen plus Wahrheit) erscheinen gemischt auf dem Fernseher und als Knöpfe auf
   dem Handy. Die eigene Lüge wird auf dem eigenen Handy ausgegraut und ist nicht wählbar. Bei weniger als
   vier Antworten (kleine Runden) füllt der Server mit `suggestions` auf, die niemandem gehören.
4. **Auflösung** auf dem Fernseher, Antwort für Antwort, die echte zuletzt:
   - Zu jeder Lüge erscheinen die Profilbilder derer, die darauf hereingefallen sind, dann wird enthüllt, von
     wem sie stammt („Lüge von Anna!“). Lügen, auf die niemand hereingefallen ist, werden kurz übersprungen.
   - Zum Schluss die echte Antwort mit allen, die sie gefunden haben.
   - Der Host kann die Auflösung mit „Weiter“ beschleunigen.
   - **Likes:** Während der ganzen Auflösung zeigt das Handy alle Lügen der Runde mit einem 👍-Knopf. Jeder kann
     beliebig viele fremde Lügen liken, jede aber nur einmal und die eigene nicht. Auf dem Fernseher fliegt bei
     jedem Like ein kleines 👍 an der Antwortkachel hoch, die Zahl steht daneben.
5. **Punkte:**
   - 1000 Punkte für das Finden der echten Antwort,
   - 500 Punkte für jeden Spieler, der auf die eigene Lüge hereingefallen ist,
   - halbe Punkte für Reinlegen bei genutzter Vorschlagslüge,
   - 100 Punkte für jedes Like auf die eigene Lüge,
   - Füller-Lügen ohne Urheber geben niemandem Punkte und lassen sich nicht liken,
   - in der letzten Runde alles doppelt (wenn eingestellt).
6. **Zwischenstand** mit Rangliste und Punkte-Zuwachs pro Spieler, dann startet der Host die nächste Frage.
   Die Like-Punkte werden erst beim Zwischenstand verbucht, weil bis zum Ende der Auflösung noch Likes kommen.
   Nach der letzten Frage kommt die Endwertung mit Siegerehrung wie im Pub Quiz, dazu drei Sonderpreise:
   „Bester Lügner“ (am häufigsten andere reingelegt), „Wahrheitsfinder“ (am häufigsten richtig) und
   „Publikumsliebling“ (meiste Likes). Die Lüge mit den meisten Likes der ganzen Partie wird dort noch einmal
   gezeigt.

Im Team-Modus schreibt jedes Team eine gemeinsame Lüge (das zuletzt abgeschickte Feld gilt, alle Mitglieder
sehen den Entwurf live) und wählt gemeinsam per Mehrheit, wie es `teamDecision()` im Pub Quiz schon macht.
Die eigene Teamlüge ist für alle Teammitglieder gesperrt.

## Technik

- **Neues Spiel** `server/games/bluffquiz/index.js`, eingetragen in `server/games/index.js`.
  Gleiche Schnittstelle wie die übrigen Spiele: `meta()`, `defaultSettings()`, `sanitizeSettings()`,
  `start()`, `view(viewer)`, `playersChanged()`, `dispose()`.
- **Teams optional** über `meta().teams === 'optional'` wie bei Stadt, Land, Fluss.
- **Mitspieler ohne Gerät** (`meta().sharedDevice`) nicht vorgesehen: Lügen müssen geheim bleiben, das geht an
  einem gemeinsamen Handy nicht.
- **Spielzüge** über `game:action`: `{ type: 'lie', text }`, `{ type: 'suggest' }`, `{ type: 'pick', optionId }`,
  `{ type: 'like', optionId, wanted }`, `{ type: 'exclude', wanted }`, `{ type: 'next' }` (nur Host).
- **Phasen:** `write` → `pick` → `reveal` → `scores`, am Ende `final`. Zeitgeber wie im Pub Quiz
  (`deadline` im Zustand, Countdown im Browser).
- **Zustand pro Frage:** Frage, Lügen `Map<spielerId, {text, suggested}>`, gemischte Antwortliste
  `[{ id, text, authors: [spielerIds], truth }]`, Auswahl `Map<spielerId, optionId>`, Likes `Map<optionId, Set<spielerId>>`, Punkte.
  Die Antwortliste bekommt zufällige Options-IDs, damit niemand aus der Reihenfolge oder ID auf die Wahrheit
  schließen kann. `view()` zeigt Urheber und `truth` erst in der Auflösung, Lügen anderer erst ab der
  Auswahlphase und dann ohne Urheber.
- **Wiederverbinden:** Eingabe und Auswahl liegen auf dem Server, nach einem Neuladen erscheint der Stand wieder.
- **Spieler verlässt das Spiel:** Seine Lüge bleibt in der Liste (sonst verschiebt sich die Auswahl der
  anderen), Punkte bekommt er nicht mehr. Wer während der Frage beitritt, macht ab der nächsten Frage mit.
- **Eingaben bereinigen:** auf 40 Zeichen kürzen, Leerzeichen zusammenfassen wie `cleanText()` im Pub Quiz,
  Großschreibung des ersten Buchstabens angleichen, damit sich Lügen nicht an der Schreibweise verraten.
- **Oberfläche:** `public/js/bluffquiz.js` und `public/css/bluffquiz.css` (Präfix `bq-`), eingehängt über das
  `gameViews`-Register in `lobby.js`. Host-Bildschirm mit großer Frage, Abgabe-Übersicht, Antwortkacheln und
  einer schrittweisen Auflösung; Handy mit Eingabefeld, Vorschlagsknopf und Antwortknöpfen.
- **Startseite:** Kachel „Bluff-Quiz“ mit Symbol 🤥, „3–12 Spieler“. Mindestens 3 Spieler (bzw. 3 Teams),
  sonst wird das Raten zu einfach; mehr als 12 machen die Antwortliste auf dem Handy zu lang.

## Schritte zur Umsetzung

1. Fragendatei mit etwa 150 Fragen schreiben, jede mit echter Antwort, Schreibweisen und Vorschlagslügen.
   Die Fakten werden beim Schreiben einzeln geprüft, weil das ganze Spiel davon lebt, dass die echte Antwort
   stimmt.
2. Spiellogik: Phasen, Zeitgeber, Lügen annehmen und prüfen, Antwortliste mischen und auffüllen, Punkte.
3. Frage-Ausschluss über `exclusions.js` anbinden.
4. Spielansicht für Handy und Host, Auflösung mit Animation.
5. Likes, Team-Modus, Zwischen- und Endwertung mit Sonderpreisen.
6. Test mit mehreren Browsern über Playwright (Lüge gleich Wahrheit, doppelte Lügen, Zeit abgelaufen,
   Vorschlagslüge, Likes, Wiederverbinden, Team-Modus).

## Entscheidungen

- Der Name bleibt „Bluff-Quiz“.
- Der Host kann keine eigenen Fragen eintippen, gespielt wird nur mit der Fragendatei.
- Lügen lassen sich liken, jedes Like bringt dem Urheber 100 Punkte.
