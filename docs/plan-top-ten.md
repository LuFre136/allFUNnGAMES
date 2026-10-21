# Plan: Eins bis Zehn (nach Top Ten)

Stand: umgesetzt (id `einsbiszehn`, CSS-Präfix `ez-`). Der Name ist ein Vorschlag, weil „Top Ten“ (Cocktail Games)
wahrscheinlich geschützt ist.

## Spielidee

Kooperativ für alle zusammen. Jede Runde ist ein anderer Spieler **Kapitän**. Der Kapitän wählt auf dem Handy eins
von zwei Themen, z. B. „Wie nützlich ist das auf einer einsamen Insel? 1 = völlig nutzlos, 10 = rettet dein Leben“.
Alle anderen bekommen geheim eine Zahl von 1 bis 10 (jede Zahl höchstens einmal) und schreiben eine Antwort, die zu
ihrer Zahl passt („Ein Sonnenschirm“ für eine 4, „Ein Boot“ für eine 10). Danach stehen alle Antworten auf dem
Fernseher und der Kapitän deckt sie von der kleinsten zur größten Zahl auf. Die Gruppe darf diskutieren, aber
niemand verrät seine Zahl.

## Ablauf einer Runde

1. **Thema wählen:** Der Kapitän sieht zwei Themen und tippt eins an. Der Fernseher zeigt, wer Kapitän ist.
2. **Antworten:** Thema mit Skala (1 = …, 10 = …) auf dem Fernseher. Jeder außer dem Kapitän sieht auf dem Handy
   groß seine geheime Zahl und schreibt eine Antwort (höchstens 80 Zeichen), änderbar bis zum Ende der Phase.
   Der Fernseher zeigt nur, wer fertig ist. Wer nichts abgibt, macht diese Runde nicht mit.
3. **Aufdecken:** Alle Antworten mit Namen und Profilbild auf dem Fernseher. Der Kapitän tippt auf dem Handy die
   Antwort an, die er für die kleinste hält. Die Zahl wird aufgedeckt und die Karte wandert in die Reihe. Ist die
   Zahl kleiner als eine schon aufgedeckte, ist das ein **Fehler** und kostet ein Herz. Weiter, bis alles liegt.
   Der Host kann für einen abwesenden Kapitän antippen.
4. **Rundenende:** Fehler der Runde, übrige Herzen. Eine fehlerfreie Runde ist eine **perfekte Runde** und bringt
   ein Herz zurück (höchstens bis zum Startwert).

## Ende und Wertung

- Die Gruppe startet mit **8 Herzen** (Einstellung 3–15). Sind alle weg, ist das Spiel sofort verloren.
- Gespielt wird, bis **jeder einmal Kapitän** war (Standard) oder eine feste Rundenzahl (3–15).
- Ende: gewonnen oder verloren, übrige Herzen, perfekte Runden, Bewertung nach übrigen Herzen und
  Sonderpreise „Bester Kapitän“ (wenigste Fehler pro Runde) und „Rätselhafteste Antwort“ (die Antwort, die den
  Kapitän am weitesten danebenliegen ließ).

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Runden | Jeder einmal Kapitän | oder 3–15 |
| Herzen | 8 | 3–15 |
| Zeit zum Antworten | 90 s | 45–180 s oder ohne Limit |
| Kategorien | alle | einzeln an- und abwählbar |

## Themen

`server/games/einsbiszehn/themes.json`, gut 150 Themen in Kategorien (Alltag, Essen & Trinken, Tiere, Urlaub,
Filme & Promis, Peinlich, Was wäre wenn, Wild). Jedes Thema hat `text`, `low` (Bedeutung der 1) und `high`
(Bedeutung der 10). Themen lassen sich während der Themenwahl und beim Antworten einstimmig dauerhaft
ausschließen (`server/exclusions.js`), sie werden dann ersetzt. In derselben Lobby kommt kein Thema doppelt,
solange es neue gibt.

## Technik

- `server/games/einsbiszehn/index.js`, eingetragen in `server/games/index.js`, gleiche Schnittstelle wie die
  Freundeskala. `meta().teams === false`, `minPlayers: 3` (Kapitän plus zwei), `maxPlayers: 11` (zehn Zahlen).
  Kein `sharedDevice`, die Zahlen sind geheim.
- Spielzüge über `game:action`: `choose`, `answer`, `pick`, `exclude`, `next`/`skip` (Host).
- Phasen `choose` → `answer` → `order` → `scores`, am Ende `final`.
- `view()` gibt jedem nur die eigene Zahl, fremde Zahlen erst nach dem Aufdecken.
- Kapitän weg: In der Themenwahl wird sofort gelost. Der Host kann „Thema auslosen“ oder „Anderer Kapitän“
  drücken und beim Aufdecken für den Kapitän antippen. Wer während einer Runde beitritt, macht ab der nächsten mit.
- Oberfläche `public/js/einsbiszehn.js`, `public/css/einsbiszehn.css`, Kachel 🔟 „3–11 Spieler, alle zusammen“.
