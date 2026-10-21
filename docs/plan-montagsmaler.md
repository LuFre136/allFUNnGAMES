# Plan: Montagsmaler

Stand: umgesetzt (20.10.2026). Entscheidungen: Name „Montagsmaler“, Host-Gerät (z. B. Tablet) zeichnet mit, wenn der Host mitspielt, Füll-Eimer ist dabei, Galerie nur solange die Lobby besteht. Abweichungen: 12 Farben, Zeichenfläche mit fester Auflösung 1200 × 900 (damit Füllen überall gleich aussieht), Begriff wird nach 15 s automatisch gewählt, Auflösung 8 s, Klauen 15 s, ab 2 Spielern.

## Spielidee

Reihum zeichnet ein Spieler einen geheimen Begriff mit dem Finger auf seinem Handy. Die Zeichnung erscheint
Strich für Strich live auf dem Fernseher (Host-Bildschirm) und auf allen anderen Handys. Die anderen tippen ihre
Tipps ins Handy, so oft sie wollen. Wer den Begriff zuerst errät, bekommt die meisten Punkte, der Zeichner bekommt
Punkte für jeden, der richtig liegt. Das Spiel ersetzt die Platzhalter-Kachel „Zeichnen & Raten“ (id `activity`)
auf der Startseite.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Spielmodus | jeder für sich | jeder für sich oder Teams |
| Durchgänge | 2 (jeder zeichnet zweimal) | 1–5 |
| Zeit pro Zeichnung | 80 s | 30–180 s |
| Schwierigkeit | gemischt | leicht, mittel, schwer, gemischt |
| Begriffswahl | 3 zur Auswahl | 1 (fest), 2 oder 3 Vorschläge |
| Buchstaben-Hinweise | an | an/aus |
| Eigene Begriffe | keine | Textfeld, ein Begriff pro Zeile, wahlweise „nur eigene“ |
| Reihenfolge | zufällig | zufällig oder vom Host festgelegt |

Die Reihenfolge nutzt `settings.game.orderMode` und `order` samt Ziehen und Ablegen aus Dr Kroko (PR #9).

## Ablauf einer Zeichnung

1. **Begriff wählen:** Der Zeichner sieht auf seinem Handy zwei oder drei Begriffe und tippt einen an
   (10 Sekunden, sonst wird zufällig gewählt). Alle anderen sehen „Anna sucht sich einen Begriff aus …“.
2. **Zeichnen:** Der Zeichner hat eine weiße Fläche im festen Seitenverhältnis 4:3 (auf dem Handy quer am besten),
   darunter die Werkzeuge:
   - 8 Farben (schwarz, grau, rot, orange, gelb, grün, blau, braun) und Weiß als Radierer,
   - 3 Stiftstärken,
   - „Rückgängig“ (letzten Strich entfernen) und „Alles löschen“.
   Oben steht der Begriff groß, damit er ihn nicht vergisst, und die Restzeit.
3. **Raten:** Alle anderen sehen die Zeichnung live, darüber den Begriff als Lücken („_ _ _ _ _“, Leerzeichen und
   Bindestriche sichtbar) und ein Eingabefeld mit „Raten“-Knopf. Falsche Tipps laufen für alle sichtbar als Liste
   am Rand des Fernsehers mit, das macht den Spaß aus. Richtige Tipps werden nie gezeigt, nur
   „✓ Ben hat es!“. Wer es hat, sieht den Begriff und kann nicht weiter raten.
4. **Knapp daneben:** Liegt ein Tipp nur einen Buchstaben daneben (z. B. „Leuchtturn“), bekommt nur der Ratende
   den Hinweis „Knapp daneben!“; der Tipp erscheint dann nicht in der öffentlichen Liste.
5. **Buchstaben-Hinweise:** Nach der Hälfte der Zeit wird ein zufälliger Buchstabe aufgedeckt, nach drei Vierteln
   ein zweiter (bei Begriffen bis 4 Buchstaben nur einer). Wer schon geraten hat, verliert dadurch nichts.
6. **Ende:** sobald alle geraten haben oder die Zeit abläuft. Der Fernseher zeigt den Begriff, die fertige
   Zeichnung und die Punkte dieser Zeichnung. Nach 6 Sekunden oder per Tipp des Hosts ist der Nächste dran.
7. **Spielende** nach allen Durchgängen mit Siegerehrung wie im Pub Quiz. Zusätzlich eine Galerie aller
   Zeichnungen der Partie mit Begriff und Zeichner zum Durchblättern (nur solange die Lobby besteht).

Verlässt der Zeichner die Lobby oder verliert die Verbindung länger als 15 Sekunden, endet seine Zeichnung ohne
Punkte und der Nächste ist dran. Neu beitretende Spieler steigen beim nächsten Durchgang in die Reihenfolge ein.

## Punkte

- **Ratende:** 10 Punkte für den Ersten, dann 8, 7, 6, 5, danach je 4. Zusätzlich bis zu 5 Zeitpunkte
  (anteilig zur Restzeit), damit schnelles Raten zählt.
- **Zeichner:** 3 Punkte pro richtigem Ratenden, höchstens 15. Rät niemand, gibt es 0 Punkte.
- Alle Werte zeigt der Zwischenstand nach jeder Zeichnung (wer wie viele Punkte bekommen hat).

## Team-Modus

- Ein Spieler pro Team zeichnet, reihum im Team. Die Teams sind abwechselnd dran.
- Nur das eigene Team rät. Die anderen Teams sehen die Zeichnung auch, dürfen aber nur dann raten, wenn das Team
  es bis zum Ablauf der Zeit nicht schafft: dann bekommen sie 10 Sekunden für einen einzigen Tipp pro Team
  („Klauen“, 5 Punkte).
- Punkte gehen ans Team: 10 für die richtige Lösung plus Zeitpunkte, wie oben.

## Begriffe

- **Eigene Liste** `server/games/montagsmaler/words.json` mit rund 400 gut zeichenbaren Begriffen in drei Stufen:
  - leicht: Gegenstände und Tiere (Sonne, Haus, Katze, Brille, Regenschirm),
  - mittel: Zusammensetzungen und Orte (Leuchtturm, Schneemann, Zahnarzt, Riesenrad),
  - schwer: Tätigkeiten und Begriffe (Fallschirmspringen, Heimweh, Stau, Muskelkater).
- Pro Begriff optional Synonyme, die auch als richtig gelten, z. B.
  `{ "word": "Fahrrad", "also": ["Rad", "Velo"], "level": 1 }`.
- Die Liste von Just One (531 Begriffe) taugt nur teilweise, weil viele Begriffe schwer zeichenbar sind. Daher eine
  eigene Liste; passende Wörter daraus werden übernommen.
- Jeder Begriff kommt pro Partie höchstens einmal dran.
- **Eigene Begriffe** des Hosts (bis 200, je höchstens 30 Zeichen) werden zur Liste hinzugefügt oder ersetzen sie.

## Raten prüfen

- `fuzzyMatch()` aus `server/util.js`: Groß-/Kleinschreibung, Umlaute und Füllwörter („der“, „ein“) sind egal,
  kleine Tippfehler werden je nach Wortlänge akzeptiert (wie im Pub Quiz).
- Zusätzlich die Stamm-Erkennung aus Just One (`stems()`), damit „Katzen“ für „Katze“ zählt. Die Funktion wandert
  dafür nach `server/util.js`, Just One importiert sie von dort.
- „Knapp daneben“ ist ein Levenshtein-Abstand von genau eins über der Toleranzgrenze.
- Tipps werden auf 30 Zeichen gekürzt, höchstens ein Tipp pro Sekunde und Spieler.
- Ein falscher Tipp, der den Begriff enthält (z. B. „großer Leuchtturm“), wird als richtig gewertet, damit er nicht
  öffentlich in der Liste steht und den Begriff verrät.

## Technik

- **Neues Spiel** `server/games/montagsmaler/index.js`, eingetragen in `server/games/index.js`, Platzhalter
  `activity` in `comingSoon` entfernen. Gleiche Schnittstelle wie die anderen Spiele: `meta()`,
  `defaultSettings()`, `sanitizeSettings()`, `start()`, `view(viewer)`, `action()`, `playersChanged()`,
  `dispose()`.
- **meta():** `teams: 'optional'` wie Stadt, Land, Fluss; `sharedDevice: false`, weil der Begriff geheim ist und
  sich Spieler an einem Gerät gegenseitig die Lösung zeigen würden. Kachel „Montagsmaler“, Symbol 🎨,
  „3–16 Spieler“.
- **Spielzüge** über `game:action`: `{ type: 'choose', index }`, `{ type: 'guess', text }`, `{ type: 'undo' }`,
  `{ type: 'clear' }`, `{ type: 'next' }` (nur Host).
- **Zeichnung über ein eigenes Socket-Event** `game:draw`. Das normale `lobby.broadcast()` schickt bei jedem Zug
  den ganzen Zustand an alle, das wäre für Striche viel zu viel. Stattdessen:
  - Der Zeichner sammelt Punkte eines Strichs und schickt alle 40 ms ein Paket
    `{ stroke, color, size, points: [[x, y], …] }`. Koordinaten sind Anteile der Fläche (0 bis 1, auf drei
    Nachkommastellen gerundet), damit die Zeichnung auf jeder Bildschirmgröße passt.
  - Der Server prüft, dass der Absender der aktuelle Zeichner ist und die Zeichnung läuft, hängt die Punkte an den
    Strich an und leitet das Paket mit `io.to(socketId).emit('draw', …)` an alle anderen Spieler weiter.
  - Grenzen gegen Missbrauch: höchstens 600 Striche, 30 000 Punkte pro Zeichnung, 60 Pakete pro Sekunde.
  - `view()` enthält die bisherigen Striche nur bei Bedarf (Spieler verbindet sich neu oder steigt ein): der Client
    fragt sie mit `game:action { type: 'strokes' }` ab und zeichnet sie nach. Rückgängig und Löschen laufen als
    normale Aktionen mit `broadcast()`, die Clients zeichnen dann aus der Strichliste neu.
- **Zustand pro Zeichnung:** Zeichner, Begriffsvorschläge, gewählter Begriff, Striche, Tipps
  `[{ spielerId, text, zeit, richtig }]`, aufgedeckte Buchstaben, Deadline, vergebene Punkte. Den Begriff bekommt
  in `view()` nur der Zeichner und wer ihn schon erraten hat.
- **Oberfläche:** `public/js/montagsmaler.js` und `public/css/montagsmaler.css`, eingehängt über das
  `gameViews`-Register in `lobby.js`. Zeichnen auf einem `<canvas>` mit Pointer Events
  (`touch-action: none`, damit die Seite beim Zeichnen nicht scrollt), Striche mit `lineCap: 'round'` und
  Glättung über quadratische Kurven. Die Fläche wird auf `devicePixelRatio` skaliert, damit sie scharf ist.
  - Handy des Zeichners: Fläche, Werkzeugleiste, Begriff, Zeit.
  - Handy der Ratenden: Zeichnung (kleiner), Lücken, Eingabefeld, eigene Tipps.
  - Host-Bildschirm: Zeichnung groß, Lücken, Zeitbalken, Tipp-Liste, Rangliste am Rand.
- **Einstellungen** (Begriffseditor, Schwierigkeit) im Lobby-Bereich wie der Kategorien-Editor von
  Stadt, Land, Fluss.

## Schritte zur Umsetzung

1. Begriffsliste mit Stufen und Synonymen anlegen.
2. Spiellogik: Reihenfolge, Begriffswahl, Timer, Hinweise, Raten prüfen, Punkte, Team-Modus mit Klauen.
3. Zeichen-Kanal `game:draw` mit Grenzen, Strichliste, Rückgängig, Löschen, Nachladen beim Wiederverbinden.
4. Oberfläche für Zeichner, Ratende und Host-Bildschirm.
5. Zwischenstand, Endwertung und Galerie.
6. Test mit mehreren Browsern über Playwright: Zeichnen mit simulierten Pointer-Events, Live-Übertragung,
   Raten mit Tippfehlern, Wiederverbinden mitten in der Zeichnung, Abgang des Zeichners.

## Offene Fragen

- Name: „Montagsmaler“ (nach der alten ZDF-Sendung) oder neutral „Zeichnen & Raten“, wie die Kachel bisher heißt?
- Soll der Fernseher auch selbst zeichnen können, z. B. mit Tablet als Host-Gerät? Im Plan zeichnet immer ein Handy.
- Soll es einen Füll-Eimer geben? Er ist praktisch für große Flächen, aber aufwendiger zu übertragen; im Plan fehlt er.
- Reicht die Galerie während der Lobby, oder sollen Zeichnungen als Bild heruntergeladen werden können?
