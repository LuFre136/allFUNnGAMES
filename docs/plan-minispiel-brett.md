# Plan: Brettmodus für die Minispiel Party

Stand: Plan, noch nicht gebaut (26.10.2026). Offene Fragen an Lukas stehen am Ende.

Die Minispiel Party läuft bisher als Reihe von Minispielen mit Punkten (siehe `plan-minispiel-party.md`). Lukas
möchte zusätzlich ein Spielbrett wie im Original, das auch ganz ohne Fernseher funktioniert. Dieser Plan beschreibt
den Brettmodus als zweiten Modus desselben Spiels, nicht als eigenes Spiel.

## Spielidee

Alle Figuren laufen auf einem Rundkurs. Wer dran ist, würfelt auf dem Handy und zieht so viele Felder vor. Das Feld,
auf dem man landet, bringt Münzen, kostet Münzen oder löst ein Ereignis aus. Nach jeder Runde (jeder hat einmal
gewürfelt) kommt ein Minispiel aus der Minispiel Party, das Münzen bringt. Mit Münzen kauft man **Sterne**, die an
einer Stelle auf dem Brett warten und danach weiterwandern. Nach der eingestellten Rundenzahl gewinnt, wer die
meisten Sterne hat, bei Gleichstand die meisten Münzen.

## Ablauf einer Runde

1. **Würfeln:** Reihum würfelt jeder (Würfel 1–6, Vorschlag; siehe Fragen). Die Figur läuft Feld für Feld auf allen
   Bildschirmen. Kommt sie am Stern vorbei, fragt das Handy „Stern für 20 Münzen kaufen?“.
2. **Feld auswerten:** Siehe Felder unten.
3. Haben alle gewürfelt: **Minispiel** wie in der Minispiel Party (Ansage, Bereit, Countdown, Ergebnis).
   Münzen statt Punkte: so viele Münzen wie Spieler dahinter, mal 2 (Erster bei 6 Spielern: 10 Münzen).
4. **Zwischenstand** mit Sternen und Münzen, dann die nächste Runde.

Die Reihenfolge beim Würfeln wird am Anfang gelost und bleibt die ganze Partie gleich.

### Schneller bei vielen Spielern

Mit 8 bis 12 Spielern dauert reihum würfeln lange. Deshalb eine Einstellung **„Gleichzeitig würfeln“**: Alle
würfeln zur selben Zeit, die Figuren laufen gemeinsam, Ereignisse werden danach der Reihe nach abgehandelt.
Vorschlag: Standard reihum bis 5 Spieler, ab 6 gleichzeitig.

## Felder

| Feld | Anteil | Was passiert |
| --- | --- | --- |
| 🔵 Blau | ca. 50 % | +3 Münzen |
| 🔴 Rot | ca. 20 % | −3 Münzen (nicht unter 0) |
| ❓ Ereignis | ca. 10 % | Zufall: alle tauschen Plätze, Münzregen für alle, der Stern wandert, 3 Felder zurück … |
| 🍀 Glücksrad | ca. 8 % | Handy dreht ein Rad: +5, +10, Würfel nochmal, Münzen von jemandem klauen |
| 💀 Pechfeld | ca. 6 % | −Hälfte der Münzen an die Bank oder an den Letzten |
| ⚔️ Duell | ca. 6 % | Wähle einen Gegner, kurzes Zweier-Minispiel (Schnellzieher oder Stoppuhr) um 5 Münzen |
| ⭐ Stern | wandert | Stern kaufen für 20 Münzen, danach springt er an eine zufällige andere Stelle |

Felder, auf die man nur vorbeiläuft, zählen nicht (außer dem Stern).

## Bretter

Für den Anfang **ein** Brett: „Rummelplatz“ 🎡 mit 36 Feldern im Rundkurs und einer Abkürzung, an der man sich
entscheiden muss (Abzweig links/rechts auf dem Handy). Gezeichnet als SVG im Browser, keine Bilddateien.
Später weitere Bretter (z. B. „Geisterschloss“ mit Falltüren, „Strand“ mit Flut, die Felder überspült).

## Fernseher und Handys

- **Mit Fernseher:** Der Fernseher zeigt das ganze Brett, Sterne und Münzen aller Spieler am Rand und die laufende
  Figur. Das Handy des Spielers am Zug zeigt den großen Würfelknopf und Entscheidungen (Abzweig, Stern kaufen,
  Duellgegner). Alle anderen Handys zeigen den eigenen Stand und wer gerade dran ist.
- **Ohne Fernseher:** Jedes Handy zeigt das Brett selbst. Es folgt automatisch der Figur, die gerade läuft, und
  zoomt auf die Umgebung; ein Knopf „Ganzes Brett“ zeigt die Übersicht. Der Spieler am Zug hat darunter den
  Würfelknopf. Die Minispiele laufen wie bisher ohne Fernseher. Das Host-Gerät spielt mit.
- **Geteiltes Handy:** Nicht für die Minispiele (die laufen gleichzeitig), deshalb auch im Brettmodus nicht.

## Einstellungen (neu im Brettmodus)

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Modus | Minispiel-Reihe | Minispiel-Reihe, Spielbrett |
| Runden | 10 | 5, 10, 15, 20 |
| Würfeln | reihum (ab 6 Spielern gleichzeitig) | reihum, gleichzeitig |
| Sternpreis | 20 Münzen | 10, 20, 30 |
| Bonussterne am Ende | aus | an/aus (Minispiel-König, Münzsammler, Ereignis-Magnet) |
| Letzte drei Runden | doppelte Münzen auf blauen und roten Feldern | an/aus |

Minispiele an/aus, Fernseher und die Punkteart aus dem bisherigen Spiel bleiben gültig.

## Technik

- Gleiches Spiel `minispielparty`, neue Einstellung `mode: 'serie' | 'brett'`. Die Minispiele bleiben unverändert;
  der Ablauf ruft sie über dieselbe Schnittstelle (`create(ctx)`, `ranking()`) auf und rechnet die Platzierung in
  Münzen um.
- `server/games/minispielparty/board.js`: Würfeln, Ziehen, Felder, Sterne, Ereignisse. Reine Logik ohne Zeit, damit
  sie gut testbar ist (wie `rules.js` bei Schach und Backgammon).
- `server/games/minispielparty/boards/rummelplatz.json`: Felder mit Position, Art und Nachfolger (für Abzweige).
- `public/js/minispielparty-board.js`: Brett als SVG, Figuren laufen Feld für Feld (die Animation rechnet jeder
  Bildschirm aus dem Zug selbst, der Server schickt nur „Anna zieht 5 von Feld 12“).
- Duelle nutzen die vorhandenen Minispiele mit nur zwei Teilnehmern (Schnellzieher, Stoppuhr, Farbfolge).
- Phasen: `roll` → `move` → `field` → (`choice`) → … → Minispiel-Phasen → `standings` → … → `final`.
- Tests: Zugregeln und Felder mit `node --test`, ein ganzer Durchlauf mit Playwright mit und ohne Fernseher.

## Später

- Gegenstände (Doppelwürfel, Stern-Pfeife, Tauschkarte) im Shop.
- Minispiele 2 gegen 2 und 1 gegen 3, ausgelöst durch die Farben der Felder, auf denen alle stehen.
- Weitere Bretter.

## Offene Fragen an Lukas

1. **Würfel:** 1–6 (ruhiger, mehr Felder werden besucht) oder 1–10 wie im Original (schneller, mehr Zufall)?
2. **Reihum oder gleichzeitig würfeln:** Passt der Vorschlag „reihum bis 5 Spieler, ab 6 gleichzeitig“?
3. **Runden:** Ist 10 als Standard gut (etwa 45–60 Minuten mit Minispielen)?
4. **Felder:** Sollen Duelle und Münzen klauen dabei sein, oder lieber ohne gemeine Felder?
5. **Gegenstände/Shop:** schon in der ersten Version oder später?
