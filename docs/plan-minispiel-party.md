# Plan: Minispiel-Party (nach dem Vorbild von „Mario Party“)

Stand: Plan, noch nicht gebaut (26.10.2026). Offene Fragen an Lukas stehen am Ende.

## Name

„Mario Party“ und die Namen der Figuren (Mario, Bob-omb, Goomba …) sind Marken von Nintendo, sie kommen weder im
Spielnamen noch in den Minispielen vor. Die Minispiele selbst sind einfache Ideen (Reaktion, Merken, Schätzen,
Schütteln) und werden frei nachgebaut, mit eigenen Namen und eigener Grafik.

Vorschlag: **„Partyparcours“**, Symbol 🎪, technische Kennung `partyparcours`, CSS-Präfix `pp-` (noch frei).
Andere Ideen: „Minispiel-Marathon“, „Zappel-Olympiade“, „Kunterbunt“.

## Spielidee

Eine Partie ist eine Reihe kurzer Minispiele von je 20 bis 60 Sekunden. Alle spielen gleichzeitig, jeder auf
seinem Handy. Der Fernseher zeigt die Bühne: Ansage, Erklärung, das laufende Minispiel und danach die Platzierung.
Nach jedem Minispiel gibt es Punkte, nach dem letzten gewinnt, wer die meisten hat.

Das passt gut zur Plattform, weil das Handy als Controller sowieso in der Hand liegt und die Minispiele so kurz
sind, dass auch Leute mitmachen, die keine Lust auf ein langes Spiel haben.

Ein Spielbrett mit Würfeln und Feldern wie im Original lassen wir weg. Es macht die Partie lang und braucht viel
Grafik. Es kann später als eigener Modus dazukommen (siehe „Später“).

## Ablauf einer Partie

1. **Ansage** am Fernseher: Name und Symbol des nächsten Minispiels, eine Zeile Erklärung und ein kleines
   Vorführbild. Auf den Handys steht dieselbe Erklärung groß.
2. **Bereit:** Jeder tippt „Bereit!“. Sind alle bereit (oder nach 20 Sekunden), zählt der Fernseher 3, 2, 1.
   Der Host kann das Minispiel jederzeit überspringen.
3. **Minispiel** läuft.
4. **Ergebnis:** Platzierung des Minispiels mit den Punkten, danach der Gesamtstand mit Pfeilen, wer aufgestiegen ist.
5. Weiter zum nächsten Minispiel, bis die eingestellte Anzahl erreicht ist.
6. **Siegerehrung** mit Podest und drei Sonderpreisen (z. B. „Blitzmerker“ für die schnellste Reaktion,
   „Pechvogel“ für die meisten letzten Plätze, „Dauerbrenner“ für die meisten Siege).

## Punkte

Jeder bekommt so viele Punkte, wie Spieler hinter ihm liegen. Bei 6 Spielern bekommt der Erste also 5, der Letzte 0.
Gleichstand teilt sich den besseren Platz. So zählt jeder Platz etwas, egal wie viele mitspielen, und ein einzelnes
Pechspiel entscheidet nicht die ganze Partie.

Optional (Einstellung, Standard aus): Das letzte Minispiel zählt doppelt, damit es bis zum Schluss spannend bleibt.

## Minispiele

Jedes Minispiel ist ein eigenes kleines Modul. Die erste Runde soll sechs bis acht davon haben, der Rest kommt nach
und nach dazu. Vorschlag für den Anfang (alle gehen mit 2 bis 12 Spielern):

| Minispiel | Vorbild | So geht's | Wertung |
| --- | --- | --- | --- |
| **Schnellzieher** ⚡ | Quick Draw | Das Handy zeigt „Warten …“, nach zufälliger Zeit „JETZT!“. Wer zuerst tippt, gewinnt. Wer zu früh tippt, ist raus. 3 Durchgänge. | Summe der Reaktionszeiten, zu früh = Strafe |
| **Seilhüpfer** 🪢 | Hot Rope Jump | Ein Seil schwingt am Fernseher und auf dem Handy, man tippt, wenn es unten ist. Das Seil wird schneller. Wer verpasst, fliegt raus. | Wer länger dabei bleibt |
| **Farbfolge** 🎨 | Merkspiele | Vier Farbfelder leuchten in einer Reihenfolge auf, man tippt sie nach. Jede Runde eins mehr. | Längste richtige Folge, dann Zeit |
| **Zählfieber** 🐞 | „Wie viele Goombas?“ | Über den Fernseher wuseln Käfer, Pilze und Igel. Danach tippt jeder, wie viele es von einer Sorte waren. | Abstand zur richtigen Zahl, dann Zeit |
| **Ballonpumpe** 🎈 | Schüttelspiele | 10 Sekunden lang schütteln (oder ohne Bewegungssensor schnell tippen), der Ballon am Fernseher wird größer. | Größter Ballon |
| **Heiße Kartoffel** 💣 | Bob-omb-Kartoffel | Eine Bombe mit verstecktem Zeitzünder. Wer sie hat, tippt auf einen Mitspieler, um sie weiterzugeben. Bei wem sie hochgeht, der ist raus. Neue Bombe, bis einer übrig ist. | Reihenfolge des Ausscheidens |
| **Stoppuhr** ⏱️ | eigene Idee | Eine Uhr läuft los und wird nach 3 Sekunden unsichtbar. Man tippt, wenn man glaubt, dass genau 10,00 Sekunden um sind. | Abstand zu 10,00 s |
| **Glückstür** 🚪 | Truhe oder Röhre wählen | Drei bis fünf Türen, jeder wählt geheim eine. Hinter einer lauert eine Falle. Wer sie gewählt hat, ist raus. Weiter bis einer übrig ist. | Reihenfolge des Ausscheidens |

Für eine zweite Runde vorgemerkt:

- **Phantombild** 🙂 (Face Lift): Augen, Nase und Mund auf einem Gesicht verschieben, bis es der Vorlage gleicht.
  Wertung nach Abstand. Braucht etwas mehr Grafik, deshalb nicht in der ersten Runde.
- **Tauziehen** 💪 (Teamspiel, zwei Hälften): Beide Seiten tippen so schnell sie können.
- **Balancierer** 🤹: Handy kippen, um eine Kugel in der Mitte zu halten (Bewegungssensor, sonst Wischen).
- **Wer fehlt?** 🔍: Viele Figuren auf dem Fernseher, eine kommt nur einmal vor. Wer sie zuerst antippt, gewinnt.
- **Kopfrechner** ➕: Kurze Rechenaufgaben, wer zuerst 5 richtig hat.

## Spieler, Teams, Geräte

- **2 bis 12 Spieler**, jeder für sich. Teams in der Lobby gibt es nicht (`teams: false`). Einzelne Minispiele
  wie Tauziehen teilen die Spieler selbst in zwei Hälften auf.
- **Kein geteiltes Handy** (`sharedDevice: false`): Fast alle Minispiele laufen gleichzeitig, zwei Leute an einem
  Handy gehen da nicht.
- **Fernseher:** Standard ist mit Fernseher. Der Host-Bildschirm zeigt die Bühne. Spielt der Host mit
  (`hostPlays`), tippt er am Fernseher mit Maus oder Leertaste wie alle anderen. Zählfieber und Wer fehlt? brauchen
  den großen Bildschirm, alle anderen Minispiele gehen auch nur mit Handys. Ohne Fernseher (Einstellung) werden
  Minispiele, die ihn brauchen, ausgelassen und jedes Handy zeigt Platzierung und Stand selbst.

## Fairness bei Reaktionsspielen

Das Handy misst die Zeit selbst. Bei Schnellzieher, Seilhüpfer und Stoppuhr zeigt das Handy das Signal an und misst,
wie viele Millisekunden bis zum Tippen vergehen. Zum Server geht nur das Ergebnis. So spielt es keine Rolle, ob ein
Handy im WLAN langsamer ist als ein anderes.

Damit alle Handys gleichzeitig starten, gleicht jedes Handy beim Betreten der Partie seine Uhr mit dem Server ab
(einige Pings, der kürzeste zählt). Der Server schickt dann „Start um 12:00:05,300 Serverzeit“ statt „Start jetzt“.

Geschummelt werden kann damit theoretisch, unter Freunden ist das aber egal. Werte unter 100 ms zählen als zu früh.

## Bewegungssensor

Schütteln und Kippen laufen über `devicemotion`. iPhones fragen beim ersten Mal um Erlaubnis
(`DeviceMotionEvent.requestPermission()`), das geht nur nach einem Tippen und nur über HTTPS (Render hat HTTPS).
Deshalb fragt das Handy schon beim „Bereit!“-Tippen. Wer ablehnt oder keinen Sensor hat, spielt mit schnellem Tippen.
Für die Wertung sind beide Wege gleich viel wert (gedeckelt), damit Tippen kein Nachteil ist.

## Einstellungen

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Anzahl Minispiele | 8 | 5, 8, 12, 16 |
| Auswahl | zufällig, keine Wiederholung bis alle dran waren | zufällig, Host wählt Liste |
| Minispiele an/aus | alle an | einzelne abwählen (z. B. Ballonpumpe ohne Sensor) |
| Letztes Minispiel doppelt | aus | an/aus |
| Fernseher | an | an/aus |

## Technik

- `server/games/partyparcours/index.js` steuert den Ablauf (Phasen `intro` → `ready` → `countdown` → `play` →
  `result` → … → `final`) und die Punkte.
- `server/games/partyparcours/minigames/<name>.js`: je ein Modul mit `meta` (Name, Symbol, Erklärung, braucht
  Fernseher, braucht Sensor, Dauer), `start(ctx)`, `action(player, data)`, `tick(dt)` (falls nötig) und
  `ranking()`. Neue Minispiele kommen nur durch eine neue Datei dazu.
- `public/js/partyparcours.js` mit einem Register für die Darstellung der Minispiele (je eine Funktion für
  Fernseher und Handy), eingehängt über `gameViews` in `lobby.js` wie bei den anderen Spielen.
- Tippen, Ergebnisse und Auswahl über `game:action`. Schnelle Eingaben (Schütteln, Tippen beim Pumpen) werden auf
  dem Handy gesammelt und fünfmal pro Sekunde über `game:draw` geschickt (immer mit Rückruf, sonst läuft `draw()`
  nicht). Live-Stände für den Fernseher gehen per `Lobby.send()` an den Host.
- `meta()` mit `minPlayers: 2`, `maxPlayers: 12`, `teams: false`, `sharedDevice: false`.
- Grafik als SVG und CSS-Animation im Browser, keine Bilddateien. Kurze Töne über Web Audio (Piep beim Countdown,
  Knall bei der Bombe), abschaltbar.
- Test: Server lokal starten und mit Playwright mehrere Handys plus Fernseher steuern, Reaktionszeiten mit
  gefälschter Uhr prüfen.

## Später

- **Brettmodus** wie im Original: Würfeln, Felder, Sterne kaufen, zwischen den Zügen ein Minispiel.
- Minispiele 2 gegen 2 und 1 gegen 3.
- Bestenliste für einzelne Minispiele (schnellste Reaktion, längste Farbfolge) über `createBoard`.

## Offene Fragen an Lukas

1. **Name:** „Partyparcours“ oder ein anderer?
2. **Erste Minispiele:** Passen die acht aus der Tabelle, oder fehlt eins, das dir wichtig ist (z. B. Phantombild)?
3. **Punkte:** „So viele Punkte, wie Spieler hinter dir“ oder lieber nur die ersten drei (3/2/1)?
4. **Brett:** Reicht erst mal die Reihe von Minispielen, oder soll gleich ein Spielbrett wie im Original dazu?
5. **Fernseher:** Soll es auch ganz ohne Fernseher gehen (dann ohne Zählfieber), oder ist der Fernseher Pflicht?
