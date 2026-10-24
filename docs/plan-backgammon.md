# Plan: Backgammon

Stand: Plan, noch nicht gebaut. Offene Fragen an Lukas stehen am Ende.

## Name

„Backgammon“ ist ein alter, freier Spielname, er kann bleiben. Symbol ⚪⚫ oder 🎲 (🎲 ist schon bei Mäxchen
vergeben, darum Vorschlag ⚫). Technische Kennung `backgammon`, CSS-Präfix `bg-` (noch frei).

## Spielidee

Klassisches Brettspiel für zwei. Jeder hat 15 Steine, die er mit zwei Würfeln einmal um das Brett in sein
Heimfeld zieht und dort hinauswürfelt. Wer zuerst alle Steine draußen hat, gewinnt. Einzelne Steine kann der
Gegner schlagen, sie müssen dann von der Bar aus neu einsteigen. Alles liegt offen, Geheimnisse gibt es nicht.
Spannend wird es durch das Würfelglück, das Abwägen zwischen Sicherheit und Tempo und den Verdopplungswürfel.

Weil Backgammon ein Zweierspiel ist, die Lobbys aber oft größer sind, schlägt der Plan zwei Modi vor (siehe
„Spieler und Modi“).

## Regeln im Detail

- **Brett:** 24 Zungen (Felder), je 12 auf jeder Seite, dazu die Bar in der Mitte und pro Spieler ein Ablagefach.
  Weiß zieht von 24 nach 1, Schwarz umgekehrt. Startaufstellung pro Spieler: 2 Steine auf der 24, 5 auf der 13,
  3 auf der 8, 5 auf der 6 (jeweils aus eigener Sicht gezählt).
- **Wer beginnt:** Jeder würfelt einen Würfel, die höhere Zahl beginnt und zieht genau diese beiden Augenzahlen.
  Bei Gleichstand wird neu gewürfelt.
- **Ziehen:** Jede Augenzahl ist ein eigener Zug eines Steins (derselbe Stein darf beide Zahlen nutzen). Ein Pasch
  zählt vierfach. Ein Stein darf auf eine Zunge, die leer ist, auf der eigene Steine liegen oder auf der genau
  ein gegnerischer Stein liegt. Zwei oder mehr gegnerische Steine sperren die Zunge.
- **Schlagen:** Landet man auf einem einzelnen gegnerischen Stein, kommt dieser auf die Bar.
- **Bar:** Wer Steine auf der Bar hat, muss zuerst alle davon ins gegnerische Heimfeld einsetzen, bevor er einen
  anderen Stein ziehen darf. Geht das nicht, verfällt der ganze Wurf.
- **Zugzwang:** Man muss so viele Augenzahlen wie möglich nutzen. Geht nur eine von beiden, muss es, wenn möglich,
  die höhere sein. Der Server prüft das und lässt nur regelgerechte Züge zu.
- **Hinauswürfeln:** Erst wenn alle 15 eigenen Steine im Heimfeld (die eigenen Zungen 1 bis 6) sind. Eine
  Augenzahl nimmt den Stein von genau dieser Zunge heraus. Ist die Zahl höher als der am weitesten entfernte Stein,
  darf dieser heraus. Wird ein Stein geschlagen, ruht das Hinauswürfeln, bis er wieder im Heimfeld ist.
- **Spielende und Wertung eines Spiels:**
  - einfacher Sieg: 1 Punkt,
  - **Gammon** (Verlierer hat noch keinen Stein draußen): 2 Punkte,
  - **Backgammon** (Verlierer hat dazu noch einen Stein auf der Bar oder im Heimfeld des Siegers): 3 Punkte,
  - alles mal dem Stand des Verdopplungswürfels.
- **Verdopplungswürfel** (Einstellung, Standard an): Vor seinem Wurf darf der Spieler, der den Würfel besitzt
  (am Anfang beide), verdoppeln. Der Gegner nimmt an (Einsatz verdoppelt, er besitzt nun den Würfel) oder gibt auf
  (verliert zum bisherigen Einsatz). Höchststand 64.
- **Partie auf Punkte:** Gespielt wird bis zu einer Zielpunktzahl (Standard 5). Mit Verdopplungswürfel gilt die
  **Crawford-Regel**: Im ersten Spiel, nachdem ein Spieler nur noch einen Punkt vom Ziel entfernt ist, darf nicht
  verdoppelt werden.
- Nicht eingebaut (vorerst): Beaver, Raccoon, Jacoby-Regel, automatische Verdopplung bei Pasch zum Start. Die
  Jacoby-Regel gilt nur für Geldspiele ohne Zielpunktzahl, die wir nicht haben.

## Spieler und Modi

| Modus | Wer spielt | Was die anderen tun |
| --- | --- | --- |
| **Duell** (Standard) | zwei Spieler | schauen zu und tippen vor jedem Spiel, wer gewinnt (ein Punkt pro richtigem Tipp, eigene kleine Wertung am Ende) |
| **Team gegen Team** | zwei Teams (`maxTeams: 2`) | ein Teammitglied ist am Zug und zieht, die Rolle wechselt jedes Spiel; die anderen sehen den Zug live und können Vorschläge antippen |

- **Duell:** Der Host wählt die beiden Spieler in der Lobby aus (Standard: die ersten beiden), alle anderen sind
  Zuschauer. Optional als **Turnier** (offene Frage): Bei 3 bis 8 Spielern spielt jeder gegen jeden ein kurzes
  Spiel bis 1 oder 3, der Fernseher zeigt die Tabelle.
- **Team gegen Team** baut auf `meta().teams === 'optional'` und `maxTeams: 2` auf (wie Stadt, Land, Fluss und
  Alias). Der Ziehende entscheidet allein, Verdoppeln und Annehmen ist eine Teamabstimmung (Mehrheit, bei
  Gleichstand entscheidet der Ziehende).
- `minPlayers: 2`, `maxPlayers: 16` (der Rest schaut zu oder spielt im Team mit).

## Geteiltes Gerät

**Ja, sinnvoll.** Es gibt nichts Geheimes, und Backgammon wird ohnehin oft an einem Brett gespielt.
`sharedDevice: true`: Zwei Spieler können ein Handy oder Tablet hin und her reichen oder direkt am Fernseher
spielen, wenn das Host-Gerät ein Touch-Gerät oder Laptop ist.

- Das Host-Gerät darf ziehen, wenn der Host mitspielt (wie bei Montagsmaler und Mäxchen). So kann man Backgammon
  auch ganz ohne Handys auf einem Tablet spielen.
- Auf dem geteilten Handy steht immer der Name: „Lukas ist dran (Weiß)“, nie „Du bist dran“.
- Kein Übergabebildschirm nötig (anders als bei Mäxchen), weil nichts verdeckt ist. Beim geteilten Gerät dreht
  sich das Brett aber zum Spieler am Zug, damit jeder sein Heimfeld unten rechts hat (Einstellung „Brett drehen“
  auf dem Gerät, Standard an bei geteiltem Gerät).

## Ablauf auf den Bildschirmen

**Fernseher (Host-Bildschirm):**

- Groß das Brett im Querformat: Zungen als Dreiecke in zwei Farben, Steine weiß und schwarz (reines CSS oder SVG,
  keine Bilddateien), Bar in der Mitte, Ablagefächer rechts mit Anzahl hinausgewürfelter Steine.
- Darüber die beiden Spieler (bzw. Teams) mit Profilbild, Name, Farbe, Punktestand der Partie, Zielpunktzahl,
  dazu die **Pip-Zahl** (wie viele Augen jeder noch braucht, Einstellung, Standard an).
- Verdopplungswürfel am Rand: in der Mitte, solange er niemandem gehört, sonst auf der Seite des Besitzers, mit
  Zahl 2, 4, 8 …
- Würfel rollen sichtbar auf der Seite des Spielers am Zug. Gezogene Steine gleiten von Zunge zu Zunge,
  geschlagene springen auf die Bar. Die Zungen des letzten Zugs bleiben kurz markiert.
- Spielende: „Gammon!“ oder „Backgammon!“ als Einblendung, Punkte fliegen zum Stand. Partieende: Podest wie in den
  anderen Spielen, dazu die Tipp-Wertung der Zuschauer und kleine Statistiken (Pasche, geschlagene Steine, höchster
  Verdopplungswürfel).

**Handy des Spielers am Zug:**

- Das ganze Brett im Querformat (Hinweis „Handy drehen“ im Hochformat), eigene Farbe immer unten.
- Großer Knopf **Würfeln**, davor, wenn erlaubt, **Verdoppeln**.
- Ziehen per Antippen: Stein antippen, die möglichen Ziele leuchten auf (mit der Augenzahl daneben), Ziel
  antippen. Zusätzlich Ziehen mit dem Finger (Pointer-Events wie das Ziehen-und-Ablegen bei Dr Kroko).
  Doppeltippen zieht den Stein mit der höheren noch freien Augenzahl.
- Knöpfe **Rückgängig** (innerhalb des eigenen Zugs) und **Zug fertig**. Erst „Zug fertig“ schickt den Zug
  endgültig. Ist nur ein Zug möglich oder gar keiner, macht der Server ihn automatisch und zeigt „Kein Zug möglich“.
- Beim Verdoppeln des Gegners: zwei Knöpfe **Annehmen** und **Aufgeben** mit dem Einsatz („Annehmen: um 4 Punkte
  weiterspielen“).

**Handy des Gegners:** dasselbe Brett, live mitlaufend, Hinweis „Anna ist dran“. **Zuschauer:** Brett klein, vor
jedem Spiel zwei Knöpfe zum Tippen auf den Sieger.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Modus | Duell | Duell, Team gegen Team |
| Spieler (bei Duell) | die ersten beiden | zwei Spieler aus der Lobby |
| Partie bis | 5 Punkte | 1, 3, 5, 7, 11 |
| Verdopplungswürfel | an | an/aus (aus: auch keine Crawford-Regel) |
| Gammon und Backgammon zählen | an | an/aus (aus: jeder Sieg 1 Punkt, gut für Anfänger) |
| Pip-Zahl anzeigen | an | an/aus |
| Zugvorschläge | aus | an/aus (leuchtet erlaubte Ziele schon beim Würfeln auf, eher für Anfänger) |
| Zeit pro Zug | aus | aus, 30 s, 60 s, 120 s (bei Ablauf zieht der Server einen zufälligen erlaubten Zug) |
| Farben | zufällig | zufällig oder vom Host festgelegt |

## Technik

- **Neues Spiel** `server/games/backgammon/index.js`, eingetragen in `server/games/index.js`, mit der üblichen
  Schnittstelle: `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`, `view(viewer)`,
  `playersChanged()`, `dispose()`.
- **meta():** `teams: 'optional'`, `maxTeams: 2`, `sharedDevice: true`, `minPlayers: 2`, `maxPlayers: 16`,
  `players: '2 Spieler (+ Zuschauer)'`.
- **Regelkern** als eigene, reine Datei `server/games/backgammon/rules.js` ohne Socket-Bezug: Brett als Array von
  26 Einträgen (24 Zungen plus zwei Bars, positive Zahl = Weiß, negative = Schwarz) plus zwei Ablagezähler.
  Funktionen `legalMoveSequences(board, color, dice)` (alle vollständigen Zugfolgen, daraus wird der Zugzwang mit
  „möglichst viele“ und „höhere Zahl“ abgeleitet), `applyMove`, `pipCount`, `winType`. Das lässt sich gut mit einem
  Testskript prüfen.
- **Spielzüge** über `game:action`: `{ type: 'roll' }`, `{ type: 'move', from, to }`, `{ type: 'undo' }`,
  `{ type: 'commit' }`, `{ type: 'double' }`, `{ type: 'take' }`, `{ type: 'drop' }`, `{ type: 'tip', playerId }`
  (Zuschauer), `{ type: 'suggest', from, to }` (Team). Die Einzelzüge eines Wurfs bleiben auf dem Server als
  vorläufig liegen und werden für alle live angezeigt, bis `commit` kommt; `commit` ist nur erlaubt, wenn die
  Zugfolge vollständig im Sinne des Zugzwangs ist.
- **Würfel** würfelt der Server (`crypto.randomInt`), nie das Gerät.
- **Phasen:** `opening` (Anfangswurf) → `turn` (Unterzustände `roll`, `doubleOffered`, `move`) → `gameEnd` →
  nächstes Spiel, am Ende `final`. Das nächste Spiel startet der Host über die übliche Host-Aktion `next`.
- **Zeitgeber:** `deadline` im Zustand wie im Pub Quiz.
- **Spieler verlässt das Spiel:** Die Partie pausiert, der Fernseher zeigt „Warte auf Anna“. Der Host kann nach
  einer Weile einen Zuschauer an seine Stelle setzen oder die Partie für den anderen werten. Im Teammodus
  übernimmt einfach das nächste Teammitglied.
- **Wiederverbinden:** Alles liegt auf dem Server, nach einem Neuladen erscheint der Stand wieder, auch ein
  halb gezogener Wurf.
- **Spielwechsel:** Funktioniert über `minPlayers`/`maxPlayers`.
- **Oberfläche:** `public/js/backgammon.js` und `public/css/backgammon.css` (Präfix `bg-`), eingehängt über das
  `gameViews`-Register in `lobby.js`. Brett als SVG, damit es auf Handy und Fernseher scharf skaliert.
- **Startseite:** Kachel „Backgammon“, „2 Spieler (+ Zuschauer)“, Beschreibung „Würfeln, ziehen, schlagen,
  verdoppeln. Der Klassiker fürs Duell auf dem Fernseher.“

## Schritte zur Umsetzung

1. Regelkern mit Testskript: Startaufstellung, alle erlaubten Zugfolgen, Zugzwang (höhere Zahl), Bar, Hinauswürfeln,
   Gammon/Backgammon. Zufallspartien Computer gegen Computer, die prüfen, dass immer 15 Steine pro Farbe da sind
   und jede Partie endet.
2. Spielablauf auf dem Server: Anfangswurf, Züge mit Rückgängig, Verdopplungswürfel, Crawford, Partie auf Punkte.
3. Brett als SVG auf dem Fernseher mit Animationen.
4. Handy: Antippen und Ziehen, Würfeln, Rückgängig, Zug fertig, Verdoppeln/Annehmen, Brett drehen.
5. Zuschauer-Tipps, Teammodus, geteiltes Gerät, Zeitgeber.
6. Test mit mehreren Browsern über Playwright (Schlagen und Wiedereinsetzen, verfallener Wurf, Pasch, nur eine Zahl
   spielbar, Hinauswürfeln mit zu hoher Zahl, Verdoppeln annehmen und aufgeben, Crawford-Spiel, Gammon,
   Wiederverbinden mitten im Zug, geteiltes Gerät).

## Offene Fragen an Lukas

1. **Mehr als zwei in der Lobby:** Reicht „Duell mit Zuschauer-Tipps“ plus „Team gegen Team“, oder soll es auch ein
   **Turnier** jeder gegen jeden geben?
2. **Computergegner:** Soll man allein gegen den Computer spielen können? Ein einfacher Gegner (wählt den Zug mit
   der besten einfachen Bewertung) ist machbar, ein starker nicht ohne viel Aufwand. Vorschlag: erst einmal ohne.
3. **Verdopplungswürfel standardmäßig an?** Für Gelegenheitsspieler ist er manchmal verwirrend. Vorschlag: an,
   mit einem kurzen Erklärtext beim ersten Verdoppeln.
4. **Partie bis 5 Punkte** als Standard, oder lieber kürzer (bis 3)?
5. **Bestenliste** (z. B. meiste gewonnene Partien pro Name) über `createBoard` wie bei Würfelbecher, oder keine?
6. **Symbol** auf der Startseite: ⚫, ⚪, 🎲 oder etwas anderes?
