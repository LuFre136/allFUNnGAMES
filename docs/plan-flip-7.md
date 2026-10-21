# Plan: Sieben auf einen Streich (Flip 7)

Stand: umgesetzt (21.10.2026). Lukas hat alle Vorschläge angenommen, die Entscheidungen stehen am Ende.

## Name

„Flip 7“ ist ein geschützter Name (The Op Games). Vorschlag: **„Sieben auf einen Streich“**, kurz „Sieben“,
mit Symbol 🃏. Der Name passt zum Spielziel (sieben verschiedene Zahlen ohne Fehler) und klingt nach Mut und
Übermut. Alternativen: „Nur nicht doppelt“, „Glückssträhne“, „Zieh oder flieh“.

Technische Kennung `sieben`, CSS-Präfix `si-` (noch frei).

## Spielidee

Ein Push-your-luck-Kartenspiel. Reihum entscheidet jeder Spieler: noch eine Karte ziehen oder aufhören und die
Punkte sichern. Wer eine Zahl zieht, die er in dieser Runde schon vor sich liegen hat, scheidet aus der Runde aus
und bekommt 0 Punkte. Wer sieben verschiedene Zahlen schafft, beendet die Runde sofort und bekommt 15
Bonuspunkte. Gespielt wird über mehrere Runden, bis jemand 200 Punkte erreicht.

Alle Karten liegen offen. Es gibt also nichts Geheimes, und der Fernseher kann jederzeit den ganzen Tisch zeigen.
Das Spannende sind die Entscheidungen und die Aktionskarten, mit denen man andere aus der Runde wirft.

## Kartenstapel (94 Karten)

| Art | Karten | Anzahl |
| --- | --- | --- |
| Zahlen | 12 × die 12, 11 × die 11, … 1 × die 1, dazu 1 × die 0 | 79 |
| Bonus | +2, +4, +6, +8, +10, ×2 (je einmal) | 6 |
| Aktion „Einfrieren“ | Ziel sichert seine Punkte und ist raus aus der Runde | 3 |
| Aktion „Drei auf einmal“ | Ziel muss die nächsten drei Karten ziehen | 3 |
| Aktion „Zweite Chance“ | schützt einmal vor einer doppelten Zahl | 3 |

Die Aktionskarten bekommen eigene Namen, damit nichts vom Original übernommen wird. Hohe Zahlen sind häufig,
darum ist jede weitere hohe Karte riskanter, als sie aussieht.

## Regeln im Detail

- **Rundenbeginn:** Der Geber (wechselt jede Runde) gibt jedem aktiven Spieler offen eine Karte, beginnend links
  von ihm. Zieht dabei jemand „Einfrieren“ oder „Drei auf einmal“, wird die Karte sofort ausgeführt, dann geht
  das Austeilen weiter.
- **Zug:** Reihum wählt jeder aktive Spieler **Ziehen** oder **Stopp**. Stopp sichert die Punkte und nimmt den
  Spieler aus der Runde.
- **Doppelte Zahl:** Der Spieler ist raus und bekommt 0 Punkte für die Runde, es sei denn, er hat eine Zweite
  Chance. Dann werden die doppelte Zahl und die Zweite Chance abgelegt und er spielt weiter.
- **Sieben verschiedene Zahlen:** Die Runde endet sofort für alle. Alle, die noch nicht ausgeschieden sind,
  werten ihre Karten, der Spieler mit den sieben Zahlen bekommt +15.
- **Einfrieren:** Der Ziehende wählt einen aktiven Spieler (auch sich selbst), der sofort seine Punkte sichert und
  aus der Runde ist.
- **Drei auf einmal:** Der Ziehende wählt einen aktiven Spieler (auch sich selbst), der die nächsten drei Karten
  einzeln ziehen muss. Das endet früher bei Ausscheiden oder sieben Zahlen. Aktionskarten, die dabei auftauchen,
  werden erst nach den drei Karten ausgeführt, eine Zweite Chance wirkt sofort.
- **Zweite Chance:** Man darf nur eine besitzen. Zieht man eine zweite, gibt man sie einem aktiven Spieler ohne
  Zweite Chance. Hat jeder eine, wird sie abgelegt.
- **Wenn nur ein aktiver Spieler übrig ist**, muss er Aktionskarten auf sich selbst spielen. Der Server wählt das
  Ziel dann automatisch.
- **Rundenende:** wenn niemand mehr aktiv ist oder jemand sieben Zahlen hat.
- **Wertung pro Spieler:** Summe der Zahlen, mit ×2 verdoppelt (nur die Zahlen), dann die Plus-Karten dazu, dann
  +15 für sieben Zahlen. Ausgeschiedene bekommen 0.
- **Spielende:** Erreicht am Ende einer Runde jemand die Zielpunktzahl, gewinnt der mit den meisten Punkten. Bei
  Gleichstand wird eine weitere Runde gespielt.
- **Stapel:** Gespielte Karten kommen auf den Ablagestapel, der Stapel wird zwischen den Runden nicht neu gemischt
  (man kann also mitzählen). Ist er leer, wird der Ablagestapel gemischt. Karten, die gerade vor Spielern liegen,
  bleiben liegen.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Zielpunktzahl | 200 | 100, 150, 200, 300 |
| Zeit pro Zug | aus | aus, 15 s, 30 s, 60 s (bei Ablauf: Stopp) |
| Risiko anzeigen | aus | an/aus (zeigt beim Spieler am Zug „Risiko für eine doppelte Zahl: 34 %“) |
| Reihenfolge | zufällig | zufällig oder vom Host festgelegt |

Die Reihenfolge-Einstellung (`orderMode`, `order`) samt Ziehen-und-Ablegen wird wie in Würfelbecher und Dr Kroko
übernommen. Die Risikoanzeige rechnet aus den noch nicht gesehenen Karten im Stapel, also genau das, was ein
aufmerksamer Mitspieler mitzählen könnte.

## Ablauf auf den Bildschirmen

**Fernseher (Host-Bildschirm):**

- Oben Rundennummer, Zielpunktzahl, Stapel und Ablage (mit Anzahl Karten).
- Für jeden Spieler eine Zeile mit Profilbild, Name, Gesamtpunkten und den offen liegenden Karten dieser Runde,
  dazu die Punkte, die er jetzt sichern würde. Zahlen sortiert, Bonus- und Aktionskarten daneben.
- Der Spieler am Zug ist hervorgehoben. Status-Schilder: „gestoppt“, „eingefroren“, „raus“ (Zeile rot
  umrandet), „Sieben!“, dazu der Geber und wie viele der sieben Zahlen schon liegen.
- Gezogene Karten fliegen nacheinander in die Zeile und drehen sich um. Die doppelte Zahl ist rot umrandet, die
  übrigen Karten werden blass; bei sieben Zahlen leuchtet die Zeile grün.
- Bei mehr als 6 Spielern werden die Zeilen auf großen Bildschirmen in zwei Spalten gesetzt.
- Rundenende: Wertungstabelle mit Rundenpunkten und neuem Stand, der Host startet mit „Nächste Runde“.
- Spielende: Podest wie in den anderen Spielen, dazu Sonderpreise „Draufgänger“ (meiste Zahlen in einer Runde),
  „Beste Runde“, „Pechvogel“ (am häufigsten raus) und „Sieben auf einen Streich“ (wer es geschafft hat).

**Handy:**

- Eigene Karten der Runde und die Punkte, die man jetzt hätte, darunter Gesamtstand.
- Am Zug: zwei große Knöpfe **Ziehen** und **Stopp** (mit den Punkten, die man dann sichert). Nicht am Zug: Hinweis
  „Anna ist dran“ und eine kleine Übersicht der anderen.
- Bei „Einfrieren“, „Drei auf einmal“ oder einer überzähligen Zweiten Chance: Auswahl der möglichen Ziele als
  Knöpfe mit Profilbild und deren aktuellen Rundenpunkten.

## Technik

- **Neues Spiel** `server/games/sieben/index.js`, eingetragen in `server/games/index.js`, mit der üblichen
  Schnittstelle: `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`, `view(viewer)`,
  `playersChanged()`, `dispose()`.
- **meta():** `teams: false`, `sharedDevice: true` (alle Karten sind offen, ein Handy kann reihum weitergegeben
  werden, wie bei Würfelbecher), `minPlayers: 2`, `maxPlayers: 12`, `players: '2–12 Spieler'`. Das Original ist
  ab 3 gedacht, zu zweit funktioniert es aber auch. Mehr als 12 passen nicht mehr lesbar auf den Fernseher und
  machen die Wartezeit zu lang.
- **Spielzüge** über `game:action`: `{ type: 'hit' }`, `{ type: 'stay' }`, `{ type: 'target', playerId }`,
  `{ type: 'force' }` (nur Host: stoppen bzw. Ziel auslosen). Die nächste Runde startet der Host über die übliche
  Host-Aktion `next`. Bei geteilten Geräten darf das Gerät für alle seine Gäste ziehen,
  wie bei Würfelbecher.
- **Zustand:** Stapel und Ablage als Arrays von Karten `{ id, kind: 'number'|'plus'|'times'|'freeze'|'flip3'|'chance', value }`,
  pro Spieler `{ numbers, mods, actions, chance, bustCard, status: 'active'|'stayed'|'frozen'|'bust'|'seven'|'out' }`,
  Geber, Spieler am Zug, eine Warteschlange offener Aktionen (für Aktionen aus „Drei auf einmal“) und
  `pending`, falls gerade ein Ziel gewählt werden muss.
- **Phasen:** `play` → `roundEnd`, am Ende `final`. Austeilen, Ziehen und Aktionen laufen auf dem Server als
  Aufgabenliste, die nur an einer Zielwahl anhält. Jede gezogene Karte bekommt eine fortlaufende Nummer; die Geräte
  lassen neue Karten daran nacheinander hereinfliegen, so sieht man auch das Austeilen Karte für Karte.
- **view():** Die Reihenfolge im Stapel wird nie geschickt, nur die Anzahl und, wenn eingestellt, die
  Risikozahl für den Spieler am Zug.
- **Zeitgeber:** `deadline` im Zustand wie im Pub Quiz; bei Ablauf Stopp, bei offener Zielwahl ein zufälliges
  gültiges Ziel.
- **Spieler verlässt das Spiel:** Ist er am Zug, gilt das als Stopp, muss er ein Ziel wählen, wird gelost. Seine
  Punkte bleiben in der Wertung, in neuen Runden setzt er aus, bis er wieder da ist. Wer neu beitritt, macht ab der
  nächsten Runde mit 0 Punkten mit.
- **Wiederverbinden:** Alles liegt auf dem Server, nach einem Neuladen erscheint der Stand wieder.
- **Spielwechsel:** Funktioniert ohne Zusatzarbeit über `minPlayers`/`maxPlayers`.
- **Oberfläche:** `public/js/sieben.js` und `public/css/sieben.css` (Präfix `si-`), eingehängt über das
  `gameViews`-Register in `lobby.js`. Karten als reines CSS (abgerundete Rechtecke, Zahl groß, Farbe pro Zahl),
  keine Bilddateien.
- **Startseite:** Kachel „Sieben auf einen Streich“, Symbol 🃏, „2–12 Spieler“, Beschreibung „Zieh noch eine
  Karte … oder lieber nicht? Sieben verschiedene Zahlen gewinnen.“

## Schritte zur Umsetzung

1. Spiellogik ohne Oberfläche: Stapel, Austeilen, Ziehen, Stopp, Aktionen samt Warteschlange, Wertung, Spielende.
   Dazu ein kleines Testskript, das viele Zufallspartien durchspielt und prüft, dass keine Karte verloren geht
   und jede Runde endet.
2. Einstellungen, Reihenfolge, Zeitgeber, geteilte Geräte.
3. Host-Bildschirm mit Spielerzeilen und Kartenanimationen.
4. Handy-Ansicht mit Ziehen/Stopp und Zielwahl, Risikoanzeige.
5. Rundenwertung, Endwertung mit Sonderpreisen.
6. Test mit mehreren Browsern über Playwright (doppelte Zahl, Zweite Chance, Einfrieren auf sich selbst,
   Drei auf einmal mit Aktion darin, sieben Zahlen, leerer Stapel, Spieler verlässt, Wiederverbinden).

## Entscheidungen

- Name „Sieben auf einen Streich“.
- Standard-Zielpunktzahl 200, einstellbar 100, 150, 200, 300.
- Risikoanzeige als Einstellung, standardmäßig aus.
- Keine Bestenliste.
