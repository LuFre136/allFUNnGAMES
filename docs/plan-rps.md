# RPS (Schach mit Schere, Stein, Papier)

Stand: umgesetzt (25.10.2026). Kennung `rps`, CSS-Präfix `rp-`, Symbol ✂️. Lukas hat sich das Spiel „wie bei ICQ“ gewünscht.

## Das Original

**RPS** war eines der kleinen Zwei-Spieler-Spiele im ICQ-Messenger: ein Brettspiel wie Schach oder Stratego, bei dem
jeder Kampf mit Schere, Stein, Papier entschieden wird. Eine offizielle Anleitung ist im Netz nicht mehr zu finden.
Die Regeln unten stammen aus der Erinnerung an das Spiel und aus heutigen Nachbauten, die sich ausdrücklich darauf
beziehen ([RPS Ninja](https://rpsninja.uk/): „Classic 7×6 board“, König + versteckter Schatten-Ninja, Gleichstand =
beide wählen neu; [NinjaRPS](https://ninjarps.com/): Fahne verstecken, Falle legen, ein Feld pro Zug, Fahne erobern).

- Brett 7 Spalten × 6 Reihen, jeder hat 14 Figuren auf seinen zwei Grundreihen.
- Vor dem Start legt jeder heimlich **Fahne** und **Falle** fest, die übrigen 12 Figuren sind zufällig Stein, Papier
  oder Schere (je 4). Man kann neu mischen.
- Gezogen wird ein Feld gerade. Wer auf eine fremde Figur zieht, kämpft mit Schere, Stein, Papier. Der Sieger ist danach
  für den Gegner aufgedeckt, der Verlierer verschwindet.
- **Gleichstand:** Beide wählen heimlich eine neue Waffe für ihre Figur, so lange, bis einer gewinnt.
- Wer auf die **Falle** zieht, verliert seine Figur. Wer die **Fahne** erobert, gewinnt.

## Bei uns

- Fernseher (Host als „Nur Gamemaster“) zeigt das Brett mit verdeckten Figuren, jeden Kampf groß in der Mitte und wie
  viele Steine, Papiere und Scheren jede Seite noch hat (das lässt sich aus den Kämpfen ohnehin ablesen).
- Jedes Handy zeigt die eigenen Figuren offen, das Brett ist so gedreht, dass die eigene Seite unten liegt. Figuren, die
  der Gegner kennt, haben ein 👁.
- Aufstellen: Die Figuren liegen zufällig, zwei antippen tauscht sie, „Neu mischen“ verteilt nur die Waffen neu. Dann
  „Bereit“ (lässt sich zurücknehmen, bis beide bereit sind). Der Host kann die Aufstellung beenden.
- Ziehen: eigene Figur antippen, Ziel antippen. Mögliche Ziele leuchten (abschaltbar).
- Kein geteiltes Handy (die Figuren sind geheim). Spielt der Host am Fernseher mit, bleiben seine Figuren dort verdeckt,
  bis er „Meine Figuren zeigen“ tippt.
- Ende: Fahne erobert, oder eine Seite hat keine Kämpfer mehr bzw. kann nicht mehr ziehen. Haben beide keine Kämpfer
  mehr, ist es Remis. Ergänzt: 100 Züge ohne Kampf sind Remis (sonst können zwei vorsichtige Spieler ewig tanzen), der
  Host kann auch selbst Remis werten.
- Serie wie bei Mühle: Sieg 1 Punkt, Remis ½, Farben wechseln jede Partie, Rot fängt an.

## Einstellungen

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Partien | Best of 3 | eine, Best of 3, Best of 5, ohne Ende |
| Zeit pro Zug | kein Limit | 15, 30, 60 s (Zufallszug, dreimal hintereinander = verloren; Gleichstand mind. 20 s, dann Zufallswaffe) |
| Sieger eines Kampfs | bleibt aufgedeckt (wie bei ICQ) | wird wieder verdeckt (Gedächtnis-Variante) |
| Mögliche Ziele zeigen | an | an/aus |

## Offen

- Name: „RPS“ wie im Original. Wenn Lukas einen deutschen Namen möchte, ist das nur `meta().name`.
- Figuren sind Spielsteine mit Hand-Emojis (✊ ✋ ✌️ 🚩 🕳️), keine gezeichneten Ninjas wie bei ICQ.
