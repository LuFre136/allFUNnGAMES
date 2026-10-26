# Plan: „Einer gegen alle“ und Team-Minispiele für die Minispiel Party

Stand: Plan, noch nicht gebaut (26.10.2026). Offene Fragen an Lukas stehen am Ende.

Bisher spielt in jedem Minispiel jeder gegen jeden. Im Original gibt es außerdem **1 gegen 3** und **2 gegen 2**.
Dieser Plan bringt beides in die Minispiel Party, in die Minispiel-Reihe und ins Spielbrett, und zwar für
3 bis 16 Spieler statt nur für vier.

## Drei Spielarten

| Spielart | Ab | Wer gegen wen |
| --- | --- | --- |
| Jeder gegen jeden | 2 | wie bisher |
| **Einer gegen alle** | 3 | Ein Spieler allein gegen die ganze Gruppe. Die Gruppe gewinnt oder verliert gemeinsam. |
| **Team gegen Team** | 4 | Zwei gleich große Teams (bei ungerader Zahl hat ein Team einen mehr und bekommt einen kleinen Nachteil im Spiel). |

Vor jedem Minispiel zeigt die Ansage groß, wer gegen wen spielt: beim Einzelnen ein Scheinwerfer, bei Teams zwei
Farben (🔵 gegen 🔴). Jedes Handy hat in der Farbe seines Teams einen Rahmen, damit jeder sofort weiß, wo er steht.

## Wer ist der Einzelne, wer in welchem Team?

- **Einer gegen alle:** Reihum, sodass jeder einmal dran ist, bevor jemand zum zweiten Mal allein spielt
  (Vorschlag, siehe Fragen).
- **Teams in der Minispiel-Reihe:** Jedes Mal neu gemischt und nach dem Stand ausgeglichen (Erster und Zweiter
  kommen in verschiedene Teams).
- **Teams auf dem Brett:** Wie im Original nach der Farbe des Feldes, auf dem man steht: blau gegen rot.
  Passen die Farben nicht (alle blau, oder 1 gegen 5), wird ausgeglichen gelost.

## Wertung

Damit sich die Spielarten mit „Jeder gegen jeden“ mischen lassen, gibt es feste Regeln:

| Ausgang | Minispiel-Reihe (Punkte) | Spielbrett (Münzen) |
| --- | --- | --- |
| Team gewinnt | jeder im Siegerteam so viele Punkte, wie das andere Team Spieler hat | jeder im Siegerteam 10 |
| Einzelner gewinnt | so viele Punkte wie Gegner | 5 Münzen pro Gegner, die Gegner zahlen je 3 (wie im Original) |
| Gruppe gewinnt gegen den Einzelnen | jeder in der Gruppe 1 Punkt | jeder in der Gruppe 5 |
| Unentschieden | niemand bekommt etwas | niemand bekommt etwas |

Bei 3/2/1-Wertung bekommt ein Sieger 3 Punkte, unabhängig von der Spielart.

## Einstellungen (neu)

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Spielarten | gemischt | nur jeder gegen jeden, gemischt, viel Team |
| Anteil bei „gemischt“ | etwa jedes dritte Minispiel ist „Einer gegen alle“ oder „Team“ | |

Ob ein Minispiel eine bestimmte Spielart kann, steht im Minispiel selbst (`formats: ['ffa', 'solo', 'teams']`).
Das Programm zieht nur Minispiele, die zur Spielart und zur Spielerzahl passen.

## Neue Minispiele: Einer gegen alle

1. **🥅 Torwart:** Die Gruppe schießt, jeder wählt still eine von drei Ecken. Der Torwart wählt für jeden Schützen
   eine Ecke zum Halten. Gehalten ist gehalten. Hält er mindestens die Hälfte, gewinnt er. Fünf Sekunden pro Runde,
   drei Runden.
2. **🚦 Ochs am Berg:** Der Einzelne hält einen Knopf gedrückt: rot. Solange er loslässt, ist grün. Die Gruppe tippt,
   um zu laufen. Wer bei Rot tippt, muss zurück an den Start. Erreicht in 30 Sekunden mindestens die Hälfte das Ziel,
   gewinnt die Gruppe.
3. **👻 Gespensterhaus:** Wie die Glückstür andersherum. Die Gruppe versteckt sich, jeder hinter einer von sechs
   Türen. Das Gespenst darf drei Türen öffnen. Erwischt es mindestens die Hälfte, gewinnt es.
4. **💣 Minenfeld:** Der Einzelne versteckt 5 Minen auf einem Feld von 5×5. Danach läuft jeder aus der Gruppe einen
   Weg von unten nach oben. Wer durchkommt, ist sicher. Schafft es die Hälfte, gewinnt die Gruppe.
5. **🦈 Hai-Alarm (schnell):** Der Hai tippt auf eine von vier Inseln, gleichzeitig springt jeder aus der Gruppe
   auf eine Insel. Wen der Hai erwischt, der ist raus. Fünf Durchgänge.

## Neue Minispiele: Team gegen Team

1. **🪢 Tauziehen:** Alle tippen so schnell sie können (oder schütteln). Gezählt wird der Durchschnitt pro
   Teammitglied, so sind ungleich große Teams fair. Das Seil wandert live auf dem Fernseher und den Handys.
2. **🎨 Staffel-Farbfolge:** Farbfolge als Staffel. Jedes Teammitglied tippt der Reihe nach eine Farbe der Folge,
   wer dran ist, sieht es auf dem Handy. Ein Fehler beendet die Runde fürs Team. Längste Folge gewinnt.
3. **🗼 Turmbau:** Die Teammitglieder lassen der Reihe nach einen schwingenden Block fallen. Wer den höheren Turm
   in 40 Sekunden hat, gewinnt. Ein schiefer Block fällt herunter.
4. **🔢 Team-Zählfieber:** Wie Zählfieber, aber jedes Teammitglied zählt eine andere Tierart. Das Team liegt richtig,
   wenn alle Zahlen stimmen, sonst zählt die Summe der Abweichungen.
5. **🎈 Team-Ballon:** Ein großer Ballon pro Team, alle pumpen gemeinsam. Er platzt bei einem geheimen Wert. Das Team,
   das näher dran ist, ohne dass er platzt, gewinnt. Hier gilt: Aufhören können ist wichtig, „Stopp“ zählt fürs
   ganze Team, sobald die Hälfte gedrückt hat.

Vorschlag für die erste Version: Torwart, Ochs am Berg und Gespensterhaus, dazu Tauziehen, Staffel-Farbfolge und
Turmbau. Die anderen kommen später.

## Ohne Fernseher

Alle neuen Minispiele laufen auch nur mit Handys: Jedes Handy zeigt das Spielfeld selbst. Beim Torwart sieht der
Torwart die Schützen als Liste mit drei Knöpfen pro Schütze. Bei Ochs am Berg sieht die Gruppe die Ampel und die
Läufer, der Einzelne den großen Knopf.

## Technik

- Minispiel-Schnittstelle bleibt gleich (`create(ctx)`, `ranking()`). Neu in `ctx`: `format` (`'ffa'`, `'solo'`,
  `'teams'`), `solo` (die id des Einzelnen) und `teams` (zwei Listen mit ids und Farbe).
- Minispiele melden mit `meta.formats`, was sie können, und mit `meta.minPlayers`, ab wie vielen Spielern.
- `ranking()` gibt bei Teams und beim Einzelnen weiter Gruppen zurück (Sieger zuerst). Die Wertung oben macht der
  Ablauf in `index.js`, nicht das Minispiel.
- Auswahl der Spielart in `index.js`: Playlist um die Spielart ergänzen, Spielerzahl beachten. Auf dem Brett: Teams
  aus den Feldfarben bilden (`board.js` merkt sich die letzte Feldfarbe pro Spieler).
- Ansage und Ergebnis bekommen eine Ansicht „wer gegen wen“ und „Team Blau gewinnt“.
- Siegerehrung: neue Sonderpreise „Einzelkämpfer“ (meiste Siege allein) und „Teamplayer“.
- Tests: Wertung und Teamauslosung mit `node --test`, jedes neue Minispiel mit Playwright mit und ohne Fernseher.

## Offene Fragen an Lukas

1. **Wer ist der Einzelne?** Reihum (jeder einmal), zufällig, oder immer der Letzte im Stand (hilft beim Aufholen)?
2. **Teams:** In der Minispiel-Reihe jedes Mal neu und ausgeglichen gemischt, oder feste Teams für die ganze Partie
   (die Lobby kann schon Teams bilden)? Auf dem Brett nach Feldfarbe wie im Original?
3. **Wie oft:** Ist „etwa jedes dritte Minispiel“ als Standard gut?
4. **Eigener Teammodus:** Soll es zusätzlich eine „Team-Party“ geben, in der zwei feste Teams die ganze Partie
   gemeinsam Punkte sammeln?
5. **Erste Minispiele:** Passen Torwart, Ochs am Berg, Gespensterhaus, Tauziehen, Staffel-Farbfolge und Turmbau, oder
   lieber andere aus der Liste?
