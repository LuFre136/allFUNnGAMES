# Plan: Mühle

Stand: Plan, noch nicht gebaut. Lukas hat entschieden: nur 2 Spieler, keine Teams. Die übrigen offenen Fragen
stehen am Ende.

## Name

„Mühle“ ist ein uralter, freier Spielname, eine Umbenennung ist nicht nötig. Symbol ⚪ (alternativ ♟️).
Technische Kennung `muehle`, CSS-Präfix `mu-` (noch frei).

## Spielidee

Das klassische Brettspiel für zwei: Jeder hat 9 Steine, Weiß gegen Schwarz. Wer drei eigene Steine in eine Reihe
bringt, hat eine **Mühle** und nimmt dem Gegner einen Stein weg. Wer nur noch zwei Steine hat oder nicht mehr
ziehen kann, verliert.

Gespielt wird genau zu zweit, ohne Teams und ohne Warteschlange. Die beiden spielen eine oder mehrere Partien
hintereinander (Serie), wer mehr Partien gewinnt, gewinnt das Spiel. Alles am Brett ist offen, es gibt nichts
Geheimes. Deshalb passt Mühle sehr gut auf den Fernseher und auf ein geteiltes Handy.

## Das Brett

24 Punkte auf drei ineinanderliegenden Quadraten, die in der Mitte jeder Seite durch Linien verbunden sind.
Intern sind die Punkte 0–23 durchnummeriert (außen 0–7, Mitte 8–15, innen 16–23, jeweils im Uhrzeigersinn ab der
Ecke oben links). Nachbarn und die 16 möglichen Mühlen stehen als feste Tabellen im Code.

## Regeln im Detail

- **Wer beginnt:** Weiß. Wer Weiß ist, wird in der ersten Partie gelost, danach wechseln die
  Farben jede Partie.
- **Setzen (Phase 1):** Abwechselnd setzt jeder einen seiner 9 Steine auf einen freien Punkt, bis alle 18 Steine
  gesetzt sind (oder vorher geschlagen wurden). Schon beim Setzen zählen Mühlen.
- **Ziehen (Phase 2):** Sind alle eigenen Steine gesetzt, schiebt man in seinem Zug einen Stein entlang einer
  Linie auf einen freien Nachbarpunkt.
- **Springen (Phase 3):** Hat ein Spieler nur noch 3 Steine, darf er mit einem Stein auf jeden freien Punkt
  springen. Der Gegner zieht weiter normal, bis auch er bei 3 ist.
- **Mühle:** Entsteht durch einen Zug eine neue Reihe aus drei eigenen Steinen, nimmt der Spieler einen
  gegnerischen Stein vom Brett. Steine, die in einer Mühle stehen, sind geschützt, es sei denn, alle
  gegnerischen Steine stehen in Mühlen. Eine Mühle öffnen und im nächsten Zug wieder schließen zählt jedes Mal
  neu.
- **Doppelmühle beim Setzen oder Ziehen:** Schließt ein Zug zwei Mühlen gleichzeitig, wird nach Standardregel nur
  **ein** Stein genommen (Einstellung, siehe unten).
- **Verloren hat, wer** nach dem Setzen weniger als 3 Steine hat oder in Phase 2 keinen Zug mehr machen kann
  (eingesperrt). Kann jemand am Ende der Setzphase sofort nicht ziehen, hat er ebenfalls verloren.
- **Unentschieden:** wenn dieselbe Stellung mit demselben Spieler am Zug zum dritten Mal vorkommt, oder wenn in
  50 Zügen hintereinander (beide zusammen) kein Stein geschlagen wurde, sobald jemand springen darf. Zusätzlich
  kann der Host jederzeit „Remis“ erklären, wenn beide Spieler das wollen.
- **Aufgeben:** Jeder Spieler kann aufgeben (mit Rückfrage).

## Serie

Eine Serie besteht aus mehreren Partien zwischen denselben zwei Spielern. Sieg 1 Punkt, Remis je ½ Punkt. Die
Serie endet, sobald einer die nötigen Siege nicht mehr verlieren kann (bei „Best of 3“ also nach 2 Siegen), oder
bei „Ohne Ende“, wenn der Host das Spiel beendet. Endet eine Serie unentschieden, wird eine Entscheidungspartie
gespielt.

Weitere Leute in der Lobby gibt es nicht: `maxPlayers: 2`, ein dritter Spieler kann nicht beitreten. Der Host kann
selbst mitspielen oder nur den Fernseher stellen (`hostPlays` wie in den anderen Spielen).

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Partien | Best of 3 | 1 Partie, Best of 3, Best of 5, ohne Ende |
| Springen | an | an/aus (aus = mit 3 Steinen weiter normal ziehen) |
| Doppelmühle nimmt | 1 Stein | 1 oder 2 Steine |
| Zeit pro Zug | aus | aus, 15 s, 30 s, 60 s |
| Zugvorschau | an | an/aus (zeigt beim Antippen eines Steins die möglichen Ziele) |

Bei Ablauf der Zugzeit macht der Server einen zufälligen gültigen Zug (beim Wegnehmen: zufälliger erlaubter
Stein). Wer dreimal hintereinander die Zeit verstreichen lässt, hat die Partie verloren.

## Ablauf auf den Bildschirmen

**Fernseher (Host-Bildschirm):**

- In der Mitte groß das Brett (als SVG, skaliert auf die Bildschirmhöhe). Weiß und Schwarz als Steine mit
  leichtem Schatten, der letzte Zug ist mit einem Pfeil bzw. Ring markiert.
- Links und rechts die beiden Spieler mit Profilbild, Name, Farbe, Steinen noch auf der Hand
  (als kleine Steinreihe) und geschlagenen Steinen. Der Spieler am Zug leuchtet, darunter die Phase:
  „setzt“, „zieht“, „springt“, „nimmt einen Stein“.
- Bei einer Mühle leuchten die drei Steine auf und eine Linie fährt durch sie hindurch, der weggenommene Stein
  blendet aus.
- Oben der Stand der Serie („Partie 2 · Anna 1 : 0 Ben“).
- Partieende: „Anna gewinnt!“ mit Grund (eingesperrt, nur noch zwei Steine, aufgegeben, Zeit), kurze Statistik
  (Züge, Mühlen je Spieler), dann „Nächste Partie“ durch den Host.
- Spielende: Sieger der Serie groß mit Profilbild, Endstand und Statistik über alle Partien (Siege, Mühlen,
  längste Partie, schnellster Sieg).

**Handy des Spielers am Zug:**

- Das Brett so groß wie möglich, die eigene Farbe immer unten. Darüber eine Zeile: „Lukas setzt einen Stein“,
  „Lukas zieht“, „Lukas hat eine Mühle! Nimm einen schwarzen Stein“.
- Setzen: freien Punkt antippen. Ziehen: eigenen Stein antippen (hebt sich an, mögliche Ziele pulsieren), dann
  Ziel antippen. Erneutes Antippen hebt die Auswahl auf. Wegnehmen: die erlaubten gegnerischen Steine pulsieren
  rot.
- Damit Fehltipper nichts kaputt machen: Ein Zug wird erst nach dem Ziel ausgeführt, nicht beim Antippen des
  Steins. Rückgängig gibt es nicht.
- Kleiner Knopf „Aufgeben“ unten (mit Rückfrage).

**Handy des Gegners:**

- Dasselbe Brett, nicht antippbar, mit „Anna ist dran“ und dem letzten Zug markiert.

## Geteiltes Gerät

Ja, sinnvoll: Alles ist offen, es gibt keine Geheimnisse, und zwei Spieler können sich gut ein Handy teilen und
es zwischen den Zügen hin- und herschieben, wie ein echtes Brett. `meta().sharedDevice: true`.

- Der Status nennt immer den Namen („Lukas ist dran!“, „Lukas hat eine Mühle!“), nie „Du bist dran“, wie in den
  anderen Spielen mit geteiltem Gerät.
- Auf einem geteilten Handy dreht sich das Brett nicht mit, die Farbe des Spielers am Zug wird nur durch den Rand
  in seiner Farbe gezeigt. Ein Übergabebildschirm wie bei Mäxchen ist nicht nötig, weil nichts versteckt werden
  muss.
- Spielt der Host mit, kann er direkt auf dem Host-Gerät ziehen, wenn es einen Touchscreen oder eine Maus hat
  (Tablet, Laptop). Legt er den zweiten Spieler dort als Gast an, ist das Brett für den jeweils Ziehenden
  antippbar, und zwei Leute können ganz ohne Handys spielen.

## Technik

- **Neues Spiel** `server/games/muehle/index.js`, eingetragen in `server/games/index.js`, mit der üblichen
  Schnittstelle: `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`, `view(viewer)`,
  `playersChanged()`, `dispose()`.
- **meta():** `teams: false`, `sharedDevice: true`, `minPlayers: 2`, `maxPlayers: 2`, `players: '2 Spieler'`.
- **Regeln als eigenes Modul** `server/games/muehle/rules.js` ohne Lobby-Bezug: Brett als Array mit 24 Feldern
  (`null`, `'w'`, `'b'`), Nachbartabelle, Mühlentabelle, `legalMoves(state)`, `apply(state, move)`,
  `formsMill()`, `removable()`, `result(state)`. Das lässt sich ohne Browser testen.
- **Spielzüge** über `game:action`: `{ type: 'place', to }`, `{ type: 'move', from, to }`,
  `{ type: 'remove', at }`, `{ type: 'resign' }`, dazu Host-Aktionen `next`, `draw` (Remis erklären), `skip` (Zug für Abwesenden losen). Der
  Server prüft jeden Zug gegen `legalMoves`. Geteilte Geräte dürfen für ihre Gäste ziehen, wie bei Würfelbecher.
- **Zustand:** Brett, Steine auf der Hand je Farbe, Spieler am Zug, `pendingRemove` (nach einer Mühle),
  Stellungszähler für die Wiederholungsregel (Schlüssel = Brett + wer am Zug), Zähler „Züge ohne Schlagen“,
  letzter Zug, Zugliste. Dazu der Stand der Serie und wer gerade Weiß ist.
- **Phasen:** `play` → `gameEnd` (je Partie), am Ende der Serie `final`.
- **view():** Beide sehen das ganze Brett. Mögliche Ziele
  rechnet der Server mit und schickt sie dem Spieler am Zug, damit Handy und Server nie auseinanderlaufen.
- **Zeitgeber:** `deadline` im Zustand wie im Pub Quiz.
- **Spieler verlässt das Spiel:** Er bekommt 60 s zum Wiederkommen (Countdown auf dem Fernseher), danach gilt die
  Partie als aufgegeben und das Spiel endet, weil keiner nachrücken kann.
- **Wiederverbinden:** Alles liegt auf dem Server, nach einem Neuladen erscheint die Stellung wieder.
- **Spielwechsel:** Funktioniert ohne Zusatzarbeit über `minPlayers`/`maxPlayers`.
- **Oberfläche:** `public/js/muehle.js` und `public/css/muehle.css` (Präfix `mu-`), eingehängt über das
  `gameViews`-Register in `lobby.js`. Brett und Steine als SVG, keine Bilddateien. Ein Stein, der zieht, gleitet
  per CSS-Übergang zum Ziel.
- **Startseite:** Kachel „Mühle“, Symbol ⚪, „2 Spieler“, Beschreibung „Drei in einer Reihe, und weg ist der
  Stein. Der Klassiker für zwei.“

## Schritte zur Umsetzung

1. `rules.js` mit Tabellen, legalen Zügen, Mühlen, Wegnehmen, Springen, Ende und Remis. Dazu ein Testskript,
   das viele Zufallspartien spielt und bekannte Stellungen prüft (eingesperrt, alle Steine in Mühlen,
   Doppelmühle, Wiederholung).
2. Spielklasse mit Serie, Farbwechsel, Zeitgeber und geteilten Geräten.
3. Host-Bildschirm mit Brett, Spielerleisten, Mühlen-Animation, Serienstand, bedienbar für Spieler am Host-Gerät.
4. Handy-Ansicht mit Antippen, Zielvorschau, Wegnehmen, Aufgeben.
5. Endwertung der Serie.
6. Test mit mehreren Browsern über Playwright (ganze Partie bis zum Einsperren, Springphase, Mühle in der
   Setzphase, Zeitablauf, geteiltes Handy, Spieler verlässt, Wiederverbinden, beide Spieler an einem Gerät).

## Offene Fragen an Lukas

1. **Serie:** Passt „Best of 3“ als Standard?
2. **Computergegner:** Soll man auch allein gegen den Computer spielen können (z. B. drei Stärken)? Das wäre ein
   eigener Schritt und würde `minPlayers` auf 1 senken.
3. **Varianten:** Reichen „Springen an/aus“ und „Doppelmühle 1 oder 2 Steine“, oder soll es auch die Variante mit
   12 Steinen und Diagonalen (Zwölfermühle) geben?
4. **Remis-Regel:** Passt dreifache Wiederholung plus 50 Züge ohne Schlagen in der Springphase, oder lieber
   einfacher (z. B. nur der Host erklärt Remis)?
5. **Bestenliste:** Eine dauerhafte Rangliste (Siege je Spieler über alle Abende, wie die Würfelbecher-Bestenliste) oder
   nicht?
