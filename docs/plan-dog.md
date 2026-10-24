# Plan: Hundsgemein (nach „Brändi Dog“)

Stand: Plan, noch nicht gebaut (24.10.2026). Offene Fragen an Lukas stehen am Ende.

## Name

„Brändi Dog“ ist ein Markenname der Stiftung Brändi. Das Spiel selbst geht auf ältere Volksspiele zurück
(„Dog“ in der Schweiz, „Tock“ in Kanada), die Regeln sind frei. Vorschlag: **„Hundsgemein“**, Symbol 🐕. Der Name
behält den Hund und beschreibt, worum es geht: andere Murmeln rauswerfen und mit dem Buben fies tauschen.
Alternativen: „Tock“, „Zwinger“, „Treue Pfoten“, „Hund & Herrchen“.

Technische Kennung `hundsgemein`, CSS-Präfix `hg-` (noch frei).

## Spielidee

Ein Teamspiel wie „Mensch ärgere dich nicht“, nur mit Karten statt Würfel. Jeder Spieler hat vier Murmeln, die
aus dem Zwinger über die Rundbahn ins eigene Ziel müssen. Gezogen wird mit Spielkarten, die jeder geheim auf der
Hand hat. Zwei Partner sitzen sich gegenüber, tauschen vor jeder Runde eine Karte und helfen sich gegenseitig.
Gewonnen hat das Team, das zuerst alle Murmeln im Ziel hat.

Das passt gut zur Plattform: Das Brett liegt offen auf dem Fernseher, die Handkarten sind geheim auf den Handys.

## Spieler und Teams

- **4 Spieler:** zwei Teams zu zweit, Partner sitzen sich gegenüber.
- **6 Spieler:** drei Teams zu zweit (Partner gegenüber) oder zwei Teams zu dritt (jeder Zweite gehört zum
  selben Team). Der Host wählt die Aufteilung.
- Andere Spielerzahlen gehen nicht, weil das Brett genau so viele Abschnitte wie Spieler hat und die Teams
  gleich groß sein müssen. Die Lobby sperrt den Start, bis 4 oder 6 Spieler in passenden Teams sind.
- Die Teams werden in der Lobby wie bei Alias zugeteilt. Die Sitzordnung am Brett wird daraus automatisch so
  gebaut, dass sich die Teams abwechseln.

## Brett

- Rundbahn mit 16 Feldern pro Spieler (64 Felder bei 4, 96 bei 6 Spielern).
- Jeder Spieler hat einen **Zwinger** mit 4 Plätzen, ein **Startfeld** auf der Bahn und ein **Ziel** mit 4 Feldern,
  das kurz vor dem Startfeld abzweigt.
- Gezeichnet als SVG im Browser, keine Bilddateien. Jeder Spieler hat eine Farbe, Partner bekommen ähnliche Töne
  oder das Teamzeichen, damit man Teams auf einen Blick erkennt.

## Karten

110 Karten: je 8 Stück von Ass bis König und 6 Joker. Gezeigt als einfache CSS-Karten mit Wert und Farbe.

| Karte | Wirkung |
| --- | --- |
| Ass | 1 oder 11 vorwärts, oder eine Murmel aus dem Zwinger aufs Startfeld |
| König | 13 vorwärts, oder eine Murmel aus dem Zwinger aufs Startfeld |
| Dame | 12 vorwärts |
| Bube | eine eigene Murmel mit einer fremden Murmel auf der Bahn tauschen |
| 10, 9, 8, 6, 5, 3, 2 | so viele Felder vorwärts |
| 7 | 7 Schritte, beliebig auf eigene Murmeln verteilt; jede überholte Murmel fliegt raus |
| 4 | 4 vorwärts oder 4 rückwärts |
| Joker | zählt als jede andere Karte |

## Regeln im Detail

- **Austeilen:** In der ersten Runde 6 Karten pro Spieler, dann 5, 4, 3, 2 und wieder von vorne mit 6. Der Geber
  wechselt jede Runde. Ist der Stapel leer, wird der Ablagestapel neu gemischt.
- **Kartentausch:** Vor jeder Runde gibt jeder seinem Partner eine Karte verdeckt. Erst wenn alle getauscht
  haben, sieht man die neue Karte. (Bei Teams zu dritt gibt jeder an den nächsten Partner im Uhrzeigersinn.)
- **Zug:** Reihum spielt jeder genau eine Karte und zieht damit. Wer eine Karte spielen kann, muss es tun, auch
  wenn der Zug schlecht ist.
- **Keine Karte spielbar:** Der Spieler wirft alle Karten ab und setzt bis zum Ende der Runde aus.
- **Rundenende:** wenn alle Karten gespielt oder abgeworfen sind.
- **Schlagen:** Wer genau auf einem Feld mit einer anderen Murmel landet, schickt sie zurück in ihren Zwinger,
  auch die eigene oder die des Partners. Mit der 7 werden alle Murmeln geschlagen, die man überholt oder auf
  denen man landet.
- **Startfeld-Schutz:** Eine Murmel, die gerade aus dem Zwinger aufs eigene Startfeld gekommen ist, blockiert:
  Niemand darf sie überholen, schlagen oder mit dem Buben tauschen, bis sie weitergezogen ist.
- **Ziel:** Ins Ziel kommt eine Murmel nur vorwärts und erst, nachdem sie einmal über ihr Startfeld hinaus die
  Runde gemacht hat. Im Ziel darf man nicht über andere Murmeln springen, und die Zahl muss genau passen.
  Rückwärts mit der 4 geht es nicht ins Ziel.
- **Bube:** Tauscht nur Murmeln auf der Rundbahn, nicht im Zwinger, im Ziel oder auf einem geschützten Startfeld.
  Getauschte Murmeln werden nicht geschlagen.
- **Partner helfen:** Wer alle vier Murmeln im Ziel hat, spielt seine Karten ab dem nächsten Zug für die Murmeln
  seines Partners. Bei der 7 darf man die Schritte schon im selben Zug aufteilen: Sobald die letzte eigene Murmel
  im Ziel ist, gehen die übrigen Schritte an den Partner.
- **Spielende:** Das Team, dessen Murmeln alle im Ziel stehen, gewinnt sofort.

Der Server rechnet für jede Karte alle erlaubten Züge aus. Die Handys bieten nur diese an, ungültige Züge sind
dadurch unmöglich.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Aufteilung bei 6 Spielern | 3 Teams zu zweit | 3 × 2 oder 2 × 3 |
| Zeit pro Zug | aus | aus, 30 s, 60 s, 90 s (bei Ablauf spielt der Server einen zufälligen erlaubten Zug) |
| Kartentausch | an | an/aus |
| Mögliche Züge zeigen | an | an/aus (markiert auf dem Handy, welche Murmeln sich mit der gewählten Karte bewegen können) |
| Schlagen beim Überholen mit der 7 | an | an/aus (Hausregel: nur beim Landen schlagen) |

## Ablauf auf den Bildschirmen

**Fernseher (Host-Bildschirm):**

- Das Brett groß in der Mitte, alle Murmeln, Zwinger und Ziele. Neben jedem Abschnitt Profilbild, Name, Anzahl
  Handkarten (als verdeckter Fächer) und ein Schild „setzt aus“, wenn jemand abwerfen musste.
- Oben Rundennummer, wie viele Karten diese Runde ausgeteilt werden, Stapel und Ablage. Die zuletzt gespielte
  Karte liegt groß in der Mitte des Bretts.
- Der Spieler am Zug ist hervorgehoben. Gezogene Murmeln gleiten Feld für Feld, geschlagene Murmeln hüpfen zurück
  in den Zwinger, beim Buben tauschen beide Murmeln sichtbar den Platz.
- Während des Kartentauschs: „Kartentausch läuft“ und ein Häkchen pro Spieler, der schon getauscht hat.
- Spielende: Gewinnerteam groß mit Profilbildern, dazu kleine Sonderpreise wie „Hundsgemein“ (am meisten
  geschlagen), „Pechvogel“ (am häufigsten geschlagen worden) und „Gassigeher“ (meiste gelaufene Felder).

**Handy:**

- Unten die eigenen Handkarten als Fächer. Oben ein verkleinertes Brett, auf dem die eigenen Murmeln und die des
  Partners zu sehen sind. Das Brett lässt sich ganz zeigen oder auf den eigenen Abschnitt zoomen.
- **Am Zug:** Karte antippen, dann die Murmel auf dem Brett antippen. Gibt es mehrere Möglichkeiten (Ass 1 oder 11,
  4 vor oder zurück, Joker als welche Karte), erscheinen große Knöpfe zur Auswahl. Ein Vorschau-Schatten zeigt,
  wo die Murmel landet und wen sie schlägt, erst „Spielen“ führt den Zug aus.
- **7 aufteilen:** Murmel antippen, mit Plus/Minus Schritte zuweisen, bis alle 7 verteilt sind. Unten steht
  „noch 3 Schritte“. Der Server prüft jede Aufteilung, die Vorschau zeigt alle Schläge.
- **Bube:** erst die eigene, dann die fremde Murmel antippen.
- **Keine Karte spielbar:** Das Handy sagt es und bietet nur „Karten abwerfen“ an.
- **Kartentausch:** „Gib Anna eine Karte“, Karte antippen, bestätigen. Danach sieht man, welche Karte man bekommen
  hat.
- **Nicht am Zug:** Hinweis „Anna ist dran“, die eigenen Karten bleiben sichtbar, damit man planen kann.
- Die Karten des Partners sind nicht sichtbar, wie im Original. Absprechen am Tisch ist erlaubt, Karten verraten
  nicht.

## Geteiltes Gerät

Schwierig, weil die Handkarten geheim sind und Partner sich gegenübersitzen. Möglich wäre es wie bei Mäxchen:
Das Handy zeigt „Gib das Handy an Anna weiter“ und die Karten erst nach „Karten ansehen“. Der Kartentausch braucht
dann aber für jeden Spieler auf dem Gerät eine eigene Übergabe, und wer gerade nicht dran ist, kann seine Karten
nicht ansehen. Vorschlag: im ersten Schritt **ohne** geteiltes Gerät (`sharedDevice: false`), weil man zu viert
oder sechst in der Regel genug Handys hat. Siehe offene Fragen.

## Technik

- **Neues Spiel** `server/games/hundsgemein/index.js`, eingetragen in `server/games/index.js`, mit der üblichen
  Schnittstelle: `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`, `view(viewer)`,
  `playersChanged()`, `dispose()`.
- **meta():** Teamspiel wie Alias, `maxTeams: 3`, `minPlayers: 4`, `maxPlayers: 6`, `players: '4 oder 6 Spieler
  in Teams'`, `sharedDevice: false`. Die Lobby braucht eine zusätzliche Prüfung „genau 4 oder 6 Spieler, Teams
  gleich groß, passend zur Aufteilung“, z. B. als neuer Haken `meta().canStart(lobby)` oder als Prüfung in
  `start()`, die eine verständliche Meldung an den Host zurückgibt.
- **Regelkern getrennt** in `server/games/hundsgemein/rules.js`: reine Funktionen für Brett, Felder,
  `legalMoves(state, playerId, card)` und `applyMove(state, move)`. So lässt sich die Logik ohne Oberfläche
  testen. Die 7 wird als Liste von Teilschritten `[{ marble, steps }]` geschickt und vom Server Schritt für Schritt
  geprüft.
- **Spielzüge** über `game:action`: `{ type: 'exchange', cardId }`, `{ type: 'play', cardId, move }`,
  `{ type: 'discard' }`, `{ type: 'force' }` (nur Host: zufälligen erlaubten Zug ausführen, wenn jemand hängt).
- **Zustand:** Stapel und Ablage, Handkarten pro Spieler, Murmeln als `{ id, owner, pos }` mit `pos` = Zwinger,
  Bahnfeld, Startfeld (geschützt) oder Zielfeld, dazu Sitzordnung, Geber, Spieler am Zug, Rundennummer und
  Phase.
- **Phasen:** `exchange` → `play` → (neue Runde) `exchange` …, am Ende `final`.
- **view():** Jeder bekommt nur die eigenen Handkarten, von den anderen nur die Anzahl. Die Reihenfolge des
  Stapels wird nie geschickt. Der Spieler am Zug bekommt zusätzlich die erlaubten Züge für jede Handkarte.
- **Zeitgeber:** `deadline` im Zustand wie im Pub Quiz.
- **Spieler verlässt das Spiel:** Seine Murmeln bleiben stehen, seine Züge werden übersprungen (er wirft ab), bis
  er wieder da ist. Der Host kann ihn auch ersetzen lassen: Wer neu beitritt, übernimmt den freien Platz mit Karten
  und Murmeln.
- **Wiederverbinden:** Alles liegt auf dem Server, nach einem Neuladen erscheint der Stand mit den eigenen Karten
  wieder.
- **Spielwechsel:** Funktioniert über `minPlayers`/`maxPlayers`, dazu die Teamprüfung oben.
- **Oberfläche:** `public/js/hundsgemein.js` und `public/css/hundsgemein.css` (Präfix `hg-`), eingehängt über das
  `gameViews`-Register in `lobby.js`. Das Brett wird einmal als SVG erzeugt und nur die Murmeln werden bewegt,
  damit die Animationen flüssig bleiben.
- **Startseite:** Kachel „Hundsgemein“, Symbol 🐕, „4 oder 6 Spieler in Teams“, Beschreibung „Karten statt Würfel:
  Bring mit deinem Partner alle Murmeln ins Ziel und schick die anderen zurück in den Zwinger.“

## Schritte zur Umsetzung

1. Regelkern ohne Oberfläche: Brett, Karten, erlaubte Züge für jede Karte, 7 aufteilen, Bube, Startfeld-Schutz,
   Ziel, Partner helfen, Spielende. Dazu ein Testskript, das viele Zufallspartien mit zufälligen erlaubten Zügen
   durchspielt und prüft, dass keine Murmel und keine Karte verloren geht und jede Partie endet.
2. Spielablauf: Austeilen 6-5-4-3-2, Kartentausch, Abwerfen, Teams und Sitzordnung, Lobby-Prüfung.
3. Host-Bildschirm mit Brett und Animationen.
4. Handy mit Kartenfächer, Mini-Brett, Zugauswahl, Vorschau, 7-Aufteilung und Kartentausch.
5. Einstellungen, Zeitgeber, Endwertung mit Sonderpreisen.
6. Test mit mehreren Browsern über Playwright (4 und 6 Spieler, Schlagen, 7 über mehrere Murmeln und den Partner,
   Bube, geschütztes Startfeld, Abwerfen, Spieler verlässt, Wiederverbinden).

## Offene Fragen an Lukas

1. **Name:** „Hundsgemein“ oder lieber „Tock“, „Zwinger“, „Treue Pfoten“, „Hund & Herrchen“ oder einfach „Dog“?
2. **Geteiltes Gerät:** erst mal weglassen (Vorschlag) oder gleich mit Übergabe-Bildschirm wie bei Mäxchen?
3. **6 Spieler:** Sollen beide Aufteilungen (3 × 2 und 2 × 3) wählbar sein, oder reicht 3 × 2?
4. **Andere Spielerzahlen:** Soll es auch eine Variante ohne Teams für 2 oder 3 Spieler geben (jeder für sich,
   ohne Kartentausch)? Oder 8 Spieler auf einem größeren Brett? Beides würde ich erst später machen.
5. **Mögliche Züge zeigen:** standardmäßig an (Vorschlag, hilft Neulingen) oder aus?
6. **Hausregeln:** Gibt es bei euch Regeln, die anders gespielt werden, z. B. beim Schlagen des Partners, beim
   Buben oder bei der 7?
