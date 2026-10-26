# Plan: Schach für 2–4 Spieler

Stand: umgesetzt (26.10.2026). Lukas wollte ein Mehrpersonen-Schach für 2 bis 4 Spieler, das auch an einem
einzigen Gerät spielbar ist. Die Entscheidungen unten sind Vorschläge und lassen sich leicht ändern.

## Name

„Schach“ ist frei, eine Umbenennung ist nicht nötig. Symbol ♟️, technische Kennung `schach`, CSS-Präfix `sc-`.

## Bretter und Modi

| Spieler | Brett | Modus |
| --- | --- | --- |
| 2 | klassisch 8 × 8 | Weiß gegen Schwarz |
| 3 | Kreuzbrett 14 × 14 ohne die 3 × 3-Ecken | jeder gegen jeden (Rot, Blau, Gelb; Grün bleibt leer) |
| 4 | Kreuzbrett | jeder gegen jeden (Standard) oder zwei gegen zwei (Partner gegenüber) |

Auf dem Kreuzbrett sitzt Rot unten, Blau links, Gelb oben, Grün rechts; gezogen wird im Uhrzeigersinn. Die
Aufstellung ist gedreht wie beim verbreiteten Vier-Spieler-Schach: Rot hat den König auf h1, Blau auf a7, Gelb auf
g14, Grün auf n8.

## Regeln

- Normale Schachregeln: Rochade (König zwei Felder Richtung Turm, nicht aus, durch oder in ein Schach),
  Umwandlung mit Auswahl Dame, Turm, Läufer oder Springer, klassisch auch en passant.
- Kreuzbrett: Bauern verwandeln sich auf der 8. Reihe (Mitte), en passant gibt es dort nicht.
- Ein Spieler ist erst dann matt oder patt, wenn er selbst am Zug ist und keinen Zug hat.
- Jeder gegen jeden: Matt, Patt, Aufgeben, Zeit oder Weggehen scheidet aus. Die Figuren bleiben grau als Hindernis
  stehen, geben kein Schach und dürfen von allen geschlagen werden. Bleibt ein König nach einem Zug eines anderen
  im Schach stehen (z. B. durch Abzug), darf der Nächste ihn schlagen; der Spieler ist dann raus.
- Zwei gegen zwei: Partner schlagen sich nicht und geben sich kein Schach. Das erste Matt (oder Aufgeben, Zeit)
  entscheidet für das ganze Team, Patt ist Remis.
- Remis: dreimal dieselbe Stellung, 50 Züge pro Spieler ohne Schlagen und Bauernzug, nur noch Könige (klassisch
  auch König gegen König und Leichtfigur bzw. gleichfarbige Läufer), klassisch Patt, oder der Host wertet Remis.

## Punkte und Serie

Gespielt werden 1, 3 oder 5 Partien oder ohne Ende (Standard: eine Partie). Jede Partie rückt jeder einen Platz
weiter (im Team bleiben Partner gegenüber). Punkte nach Platz: zu zweit 1 / 0, zu dritt 2 / 1 / 0, zu viert
3 / 2 / 1 / 0; bei Remis teilen sich die Übrigen die Plätze. Im Team bekommt jeder Gewinner 1 Punkt, Remis ½.

## Uhr und Abwesende

Optional eine Schachuhr pro Spieler (3, 5, 10, 15 oder 30 Minuten). Läuft sie ab, verliert man bzw. scheidet aus;
klassisch ist es Remis, wenn der Gegner nicht mehr mattsetzen kann. Wer die Verbindung verliert, hat eine Minute,
sonst gilt die Partie für ihn als aufgegeben. Der Host kann für den, der dran ist, einen Zufallszug auslösen.

## Ein Gerät

`sharedDevice`: Unter „Mitspieler an diesem Gerät“ bis zu drei weitere Spieler eintragen. Das Brett dreht sich
zu dem, der dran ist (Knopf „Brett drehen“ schaltet das ab, gespeichert pro Gerät). Die Statuszeile nennt immer
den Namen („Mia (Gelb) ist dran“). Mit eigenen Handys zeigt jedes Handy das Brett mit der eigenen Farbe unten,
der Fernseher zeigt es groß mit Spielerkarten, Uhren, geschlagenen Figuren und der Zugliste.

## Bewusst weggelassen

Kein Computergegner, keine Bestenliste, keine Punktewertung für geschlagene Figuren wie bei manchen
Vier-Spieler-Varianten, kein Remis-Angebot zwischen Spielern (das wertet der Host).
