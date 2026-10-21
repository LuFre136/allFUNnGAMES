# Plan: Gleichgesinnt (nach Dito!)

Stand: umgesetzt (21.10.2026), id `gleichgesinnt`, CSS-Präfix `gg-`. Lukas hat den Namen „Gleichgesinnt“ gewählt.

## Name

„Dito!“ (Martin Ang, Game Factory, Spiel des Jahres 2026) ist ein Produktname. Vorschlag: **„Gleichgesinnt“** mit
Symbol 🤝. Alternativen: „Ebenso!“, „Gedankenblitz“ oder den Namen behalten.

## Spielidee

Ein Wort-Partyspiel für alle gegeneinander. Zu einer Kategorie, etwa „Dinge, die man im Urlaub vergisst“, schreibt
jeder geheim drei Antworten. Punkte gibt es nicht für originelle Antworten, sondern für Antworten, die andere auch
haben. Man muss also überlegen: Was schreiben die anderen?

## Regeln (nach der offiziellen Spielregel)

- **Tableau:** Jeder hat ein Raster mit 3 × 3 Feldern. Rechts an den Reihen und unter den Spalten stehen
  Bonuswerte von 1 bis 3, das Feld oben rechts ist am wertvollsten. Die genauen Zahlen nennt der Regeltext nicht,
  wir nehmen: Reihen von oben nach unten 3, 2, 1; Spalten von links nach rechts 1, 2, 3.
- **Drei Runden** (einstellbar 1–5), jede mit zwei Phasen.
- **Phase 1, Kategorien:** Reihum wählt ein Spieler eine von zwei Kategorien einer Karte. Alle schreiben geheim
  drei Antworten in drei freie Felder ihrer Wahl. Das passiert dreimal, danach sind alle neun Felder voll.
  - Höchstens zwei Wörter pro Antwort, außer bei festen Begriffen, Redewendungen und Namen. Das wird nur als
    Hinweis angezeigt, nicht erzwungen.
  - Jede Antwort darf pro Runde nur einmal vorkommen, auch wenn sie zu einer anderen Kategorie passt. Das prüft
    der Server (gleicher Wortstamm zählt als gleich).
- **Phase 2, Auflösung:** In Runde 1 beginnt ein zufälliger Spieler (statt des jüngsten), ab Runde 2 der mit den
  wenigsten Punkten. Danach reihum. Wer dran ist, liest eine seiner offenen Antworten vor:
  - **mehrere** Mitspieler haben sie auch („Dito!“): alle umkreisen sie,
  - **genau einer** hat sie auch: beide umkreisen sie und bekommen zusätzlich einen BFF-Stern,
  - **niemand** hat sie: sie wird durchgestrichen.
  - Gleich sind auch Synonyme („Geige“ und „Violine“), nicht aber Ober- und Unterbegriffe („Instrument“ und
    „Geige“). Im Zweifel entscheidet die Gruppe.
- **Rundenende:** sobald ein Spieler keine offene Antwort mehr hat.
- **Wertung pro Runde:** 1 Punkt je umkreiste Antwort, 2 Punkte je Stern (bei drei Spielern nur 1), dazu der
  Bonus jeder vollständig umkreisten Reihe und Spalte.
- **Spielende:** Nach der letzten Runde gewinnt, wer die meisten Punkte hat. Bei Gleichstand zählt die beste
  einzelne Runde, danach wird geteilt.

## Umsetzung

- **Fernseher:** Kategorie groß, wer gerade wählt bzw. dran ist, und die Raster aller Spieler. Offene Antworten
  sind verdeckt, aufgelöste Antworten sieht jeder mit Kreis, Stern oder durchgestrichen. Am Rundenende die Punkte
  mit Bonus-Reihen und eine Tabelle.
- **Handy beim Schreiben:** das eigene Raster, freie Felder sind Eingabefelder. Man füllt genau drei und schickt
  ab, ändern geht, bis alle fertig sind. Farben zeigen, welche Antwort zu welcher Kategorie gehört.
- **Handy bei der Auflösung:** Wer dran ist, tippt eine offene Antwort an. Alle anderen sehen sie und tippen
  entweder die eigene gleiche Antwort an („Dito!“) oder „Hab ich nicht“. Gleiche Wörter (gleicher Wortstamm)
  sind automatisch angetippt und lassen sich zurücknehmen, ähnliche Schreibweisen werden vorgeschlagen.
  Synonyme tippt man selbst an, so wie man im Brettspiel selbst „Dito!“ ruft. Wenn alle geantwortet haben,
  wird ausgewertet.
- **Host:** kann bei der Kategoriewahl zufällig wählen, beim Schreiben nicht mehr warten (fehlende Felder bleiben
  leer und gelten als durchgestrichen), bei der Auflösung nicht mehr warten (wer nicht geantwortet hat, hat die
  Antwort nicht) und einen abwesenden Spieler überspringen.
- **Kategorien:** eigene Liste in `server/games/gleichgesinnt/categories.json` (keine aus dem Original). Pro Wahl
  werden zwei zufällige gezogen. In derselben Lobby kommt keine doppelt, solange es neue gibt.
- **Einstellungen:** Anzahl Runden (Standard 3), Zeitlimit zum Schreiben (Standard aus).
- **Spieler:** 3–12 (Original 3–7), ohne Teams, kein geteiltes Gerät, weil jeder geheim schreibt. Wer später
  kommt, spielt ab der nächsten Runde mit. Wer die Verbindung verliert, wird bei der Auflösung übersprungen.
- **Sonderpreise am Ende:** „Seelenverwandte“ (das Paar mit den meisten gemeinsamen Sternen) und „Einzelgänger“
  (die meisten durchgestrichenen Antworten).
