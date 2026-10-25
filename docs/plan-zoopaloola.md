# Plan: Sumo Zoo (Zoopaloola)

Stand: umgesetzt (25.10.2026). Lukas hat die offenen Fragen beantwortet, die Entscheidungen stehen am Ende.

## Das Original

**Zoopaloola** war eines der Spiele, die im ICQ-Messenger mitgeliefert wurden (ICQ Games), und gab es ab etwa
2007/2008 auch als Java-Handyspiel von Redboss Games. Heute läuft es noch als Browser-Nachbau unter dem alten Namen.
Was sich übereinstimmend beschreiben lässt:

- Zwei Spieler, jeder hat **sechs Tiere** einer Tierart (Affen, Elefanten, Nilpferde, Zebras, Nashörner …). Die
  Tierart ist nur Optik.
- Die Tiere stehen auf einem **Berg mit flacher Kuppe** (von oben gesehen wie ein Billardtisch ohne Bande). Wer
  über die Kante rutscht, fällt hinunter und ist raus.
- Es gibt **keine weiße Kugel**: Wer dran ist, sucht sich eines seiner eigenen Tiere aus, zielt, wählt die Stärke
  und schubst es los. Es stößt andere Tiere an, die wieder andere anstoßen, wie beim Billard.
- Die Züge wechseln sich ab, egal ob man ein gegnerisches Tier hinunterschubst, danebenschießt oder eines der
  eigenen verliert. Dadurch kippt die Führung oft.
- Gewonnen hat, wer alle gegnerischen Tiere vom Berg geschubst hat und selbst noch mindestens eines oben hat.
- Die Aufstellung zu Beginn wechselt (Kreis, zwei Reihen gegenüber, eine lange Linie …).

Quellen: [Pocket Gamer, Test der Java-Version](https://www.pocketgamer.com/zoopaloola/review/),
[Lutris (ICQ-Herkunft)](https://lutris.net/games/zoopaloola/),
[Browser-Nachbau auf Gameflare](https://www.gameflare.com/online-game/zoopaloola/),
[Video „Zoopaloola Online - ICQ Games“](https://www.youtube.com/watch?v=pTyRH9i6BP0).

Unsicher bleibt, ob man im ICQ-Original nach einem Treffer **noch einmal** durfte (die Java-Version wechselt
immer) und ob der Berg rund oder eckig war. Lukas hat entschieden: Extrazug als Einstellung (Standard an) und
mehrere Karten, Standard eckig.

## Name

„Zoopaloola“ ist der Titel eines fremden Spiels. Ein eingetragenes Markenrecht habe ich nicht gefunden, aber wir
übernehmen sicherheitshalber weder Namen noch Grafiken. Lukas hat den Namen **„Sumo Zoo“** gewählt, Symbol 🐘.
Das passt genau: Wie beim Sumo verliert, wer aus dem Ring geschoben wird.

Technische Kennung `sumozoo`, CSS-Präfix `sz-` (noch frei).

## Spielidee bei uns

Ein Schubs-Spiel mit echter Physik, reihum gespielt. Der Fernseher zeigt den Felsen groß von oben, das Handy des
Spielers am Zug wird zum Zielgerät: Tier antippen, nach hinten ziehen wie bei einer Steinschleuder, loslassen.
Der Server rechnet den Stoß aus, alle Bildschirme spielen ihn gleichzeitig ab.

Damit es zu mehreren Spaß macht, gibt es neben dem klassischen Duell auch mehrere Tierarten auf dem Felsen und
Teams, in denen sich die Mitglieder beim Schubsen abwechseln.

## Regeln im Detail

- **Seiten:** 2 bis 4 Tierarten. Jede Tierart gehört einem Spieler oder einem Team. Jede hat zu Beginn
  6 Tiere (bei 3 oder 4 Seiten 5 Tiere, damit der Felsen nicht zu voll wird).
- **Aufstellung:** zufällig aus einer Handvoll fester Muster, passend zur Zahl der Seiten (Duell: zwei Reihen,
  Kreis, Linie, Dreiecke gegenüber; 3 bis 4 Seiten: Tortenstücke, Ring, Raster). Die Muster sind symmetrisch,
  damit keine Seite bevorzugt wird.
- **Zug:** Wer dran ist, wählt eines seiner Tiere, Richtung und Stärke, und schubst. Es wird nur das eigene Tier
  angestoßen, alles andere passiert durch Zusammenstöße.
- **Runterfallen:** Ein Tier, dessen Mitte über die Kante rutscht, fällt hinunter und ist raus, egal wem es
  gehört. Auch das geschubste Tier selbst kann hinunterfallen.
- **Extrazug (Standard an):** Wer mindestens ein fremdes Tier hinunterschubst und keines der eigenen verliert,
  darf noch einmal. Sonst ist die nächste Seite dran. Ist die Einstellung aus, ist immer die nächste Seite dran,
  wie in der Java-Version.
- **Reihenfolge der Seiten:** im Kreis, der Startspieler wird gelost. Seiten ohne Tiere werden übersprungen.
- **Teams:** Innerhalb einer Seite wechseln sich die Mitglieder ab (Anna, dann Ben, dann wieder Anna).
- **Ausscheiden:** Eine Seite ohne Tiere ist raus. Bei 3 bis 4 Seiten gewinnt die letzte Seite mit Tieren.
- **Gleichzeitig leer:** Fallen bei einem Stoß die letzten Tiere aller verbleibenden Seiten, gewinnt die Seite,
  deren letztes Tier **später** gefallen ist, egal wer geschubst hat. Fallen sie im selben Augenblick, ist es
  ein Unentschieden.
- **Partie und Satz:** Eine Partie ist ein Felsen. Der Host kann „Gewinnsätze“ einstellen (1, 2 oder 3); dann wird
  mehrfach gespielt, die Startseite wechselt jedes Mal.

## Physik

- Draufsicht, Tiere sind **Kreise** gleicher Größe und Masse (die Grafik darf unterschiedlich aussehen, die
  Physik nicht, damit keine Tierart besser ist).
- Elastische Stöße zwischen Kreisen, Reibung bremst die Tiere gleichmäßig ab, kein Drall, keine Bande.
- Der Felsen ist eine Fläche mit Kante, ihre Form kommt aus der gewählten Karte (siehe unten).
- Feste Schrittweite (z. B. 1/120 s), gerechnet nur auf dem Server. Der Stoß endet, wenn sich nichts mehr bewegt
  oder nach höchstens 10 Sekunden.
- Der Server schickt pro Stoß die Bahn aller bewegten Tiere (Position etwa alle 1/30 s, dazu Zeitpunkt des
  Runterfallens). Die Geräte spielen die Bahn ab. So sehen alle exakt dasselbe, und niemand kann schummeln.
- Eine kleine eigene Physik reicht (ein paar Dutzend Zeilen), wir brauchen keine Bibliothek.

## Karten

Der Host wählt, auf welchem Felsen gespielt wird. Jede Karte ist eine Liste von Flächen (Rechtecke, Kreise,
Vielecke) plus optional Löcher darin; ein Tier fällt, wenn seine Mitte auf keiner Fläche mehr liegt oder in einem
Loch. Zu jeder Karte gehören passende Aufstellungen für 2, 3 und 4 Seiten.

| Karte | Form | Besonderheit |
| --- | --- | --- |
| **Felsplateau** (Standard) | abgerundetes Rechteck im Querformat | wie die Java-Version, gut für Duelle |
| **Sumo-Ring** | Kreis | gleich fair für 3 bis 4 Seiten |
| **Wasserloch** | Rechteck mit rundem Loch in der Mitte | wer durch die Mitte schießt, riskiert ein Eigentor |
| **Brücke** | zwei Plateaus, verbunden durch einen schmalen Steg | jede Seite startet auf ihrer Insel |
| **Zufall** | eine der Karten oben, gelost bei jeder Partie bzw. jedem Satz | |

Weitere Karten lassen sich später als Datei `maps.json` ergänzen, ohne die Logik anzufassen. Bei 3 oder 4 Seiten
auf eckigen Karten werden die Seiten so verteilt, dass alle gleich weit von der Kante entfernt starten.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Tiere pro Seite | 6 (bei 3–4 Seiten 5) | 3 bis 8 |
| Karte | Felsplateau | Felsplateau, Sumo-Ring, Wasserloch, Brücke, Zufall |
| Treffer gibt Extrazug | an | an/aus |
| Gewinnsätze | 1 | 1, 2, 3 |
| Zeit pro Zug | aus | aus, 20 s, 40 s (bei Ablauf: kein Stoß, nächste Seite) |
| Zielhilfe | an | an/aus (zeigt eine gestrichelte Linie in Schussrichtung bis zum ersten Tier) |
| Mit Fernseher | an | an/aus, siehe unten |

Seiten sind die Teams aus der Lobby: `teams: 'optional'` mit `maxTeams: 4`. Ohne Teammodus ist jeder Spieler
eine eigene Seite, dann sind höchstens 4 Spieler möglich.

## Ablauf auf den Bildschirmen

**Fernseher (Host-Bildschirm):**

- Der Felsen füllt fast den ganzen Bildschirm, von oben gesehen, mit einer Andeutung von Abgrund und Zoo drumherum.
- Am Rand für jede Seite: Tierart, Name(n), wie viele Tiere noch oben sind (kleine Symbole, gefallene
  durchgestrichen), Sätze.
- Die Seite am Zug ist hervorgehoben, dazu „Anna ist dran“. Während Anna zielt, sieht man auf dem Fernseher live
  ihren Pfeil wachsen und sich drehen. Das macht das Zielen zur Show für alle.
- Der Stoß wird abgespielt, fallende Tiere schrumpfen mit kleinem Wirbel über die Kante, mit Geräusch und einem
  kurzen Spruch („Platsch!“, „Tschüss, Ernst!“). Eigentor wird extra kommentiert.
- Spielende: Podest wie in den anderen Spielen, dazu Sonderpreise „Abrissbirne“ (meiste Tiere mit einem Stoß),
  „Eigentor“ (meiste eigene Tiere selbst runtergeschubst) und „Letzter Mohikaner“ (mit nur einem Tier gewonnen).

**Handy, wer am Zug ist:**

- Der ganze Felsen klein im Hochformat (gedreht, damit die eigene Seite unten steht).
- Eigenes Tier antippen, dann vom Tier weg ziehen: Pfeil zeigt in die Gegenrichtung, Länge = Stärke, mit einer
  Stärke-Leiste. Loslassen schubst. Zum Abbrechen zurück aufs Tier ziehen.
- Der Stoß geht beim Loslassen sofort los, ohne Bestätigen-Knopf (Lukas' Entscheidung).

**Handy, wer wartet:**

- Den Felsen klein mit dem Stoß zum Mitschauen, darüber „Ben ist dran“ und die Übersicht der Seiten.

## Ohne Fernseher und geteiltes Gerät

- **Geteiltes Gerät (`sharedDevice: true`):** passt sehr gut. Es gibt nichts Geheimes, und das Original war genau
  so gedacht: zwei Leute an einem Bildschirm. Das Handy zeigt dann „Gib das Handy an Ben weiter“ und, wie bei den
  anderen Spielen mit geteiltem Gerät, immer den Namen („Ben ist dran!“), nie „Du bist dran!“.
- **Ohne Fernseher:** sinnvoll, weil das Handy den Felsen sowieso komplett zeigt. Einstellung „Mit Fernseher“
  wie bei Hundsgemein: Ohne Fernseher spielt der Host zwingend mit, alle Handys zeigen den Felsen groß, und der
  Stoß läuft auf allen Handys gleichzeitig. Mit Fernseher bleibt alles wie oben.
- Zusammen ergibt das den einfachsten Fall: **ein Handy, zwei Leute, kein Fernseher**, also genau das alte
  ICQ-Gefühl.

## Spielerzahl

`minPlayers: 2`, `maxPlayers: 8`, Anzeige „2–8 Spieler“. Ohne Teams 2 bis 4 Spieler (je eine Tierart), mit Teams
bis 4 Seiten zu je bis zu 2 Spielern. Mehr Leute bedeuten zu lange Wartezeit zwischen den eigenen Stößen; wer will,
kann über die Teams trotzdem mit mehr spielen, wenn wir `maxPlayers` später anheben.

## Technik

- **Neues Spiel** `server/games/sumozoo/index.js` (Logik) und `server/games/sumozoo/physics.js` (reine
  Physik ohne Abhängigkeiten, testbar), eingetragen in `server/games/index.js`, mit der üblichen Schnittstelle:
  `meta()`, `defaultSettings()`, `sanitizeSettings()`, `start()`, `view(viewer)`, `playersChanged()`, `dispose()`.
- **meta():** `teams: 'optional'`, `maxTeams: 4`, `sharedDevice: true`, `minPlayers: 2`, `maxPlayers: 8`.
- **Spielzüge** über `game:action`: `{ type: 'aim', animalId, angle, power }` (Live-Vorschau, gedrosselt auf etwa
  10 pro Sekunde, nur an den Fernseher weitergereicht über `Lobby.send()` wie die Striche bei Montagsmaler) und
  `{ type: 'shoot', animalId, angle, power }`. Der Server prüft, dass das Tier der Seite am Zug gehört und noch
  oben ist, und begrenzt die Stärke.
- **Zustand:** Seiten mit Tieren `{ id, x, y, alive }`, Seite und Spieler am Zug, letzter Stoß als Bahn mit
  fortlaufender Nummer (Geräte, die neu laden, springen direkt zum Endstand), Sätze, Statistik für die
  Sonderpreise, gewählte Karte.
- **Phasen:** `aim` → `rolling` (Server schätzt die Abspieldauer und schaltet danach weiter) → `aim` …,
  `setEnd`, am Ende `final`.
- **Zeitgeber:** `deadline` wie im Pub Quiz.
- **Spieler verlässt das Spiel:** Im Team übernimmt das nächste Mitglied. Ist eine Seite ohne Spieler, wird sie
  übersprungen, ihre Tiere bleiben als Hindernis stehen; kommt der Spieler wieder, spielt er weiter. Im Duell
  kann der Host die Partie beenden.
- **Spielwechsel:** Funktioniert über `minPlayers`/`maxPlayers`.
- **Oberfläche:** `public/js/sumozoo.js` und `public/css/sumozoo.css` (Präfix `sz-`), eingehängt über
  das `gameViews`-Register in `lobby.js`. Gezeichnet auf einem `<canvas>`, das über `afterRender` erhalten bleibt
  wie bei Montagsmaler. Tiere als Emoji-Köpfe (🐒 🐘 🦛 🦓) auf farbigen Kreisen, keine fremden Grafiken.
- **Startseite:** Kachel „Sumo Zoo“, Symbol 🐘, „2–8 Spieler“, Beschreibung „Schubs die Tiere der anderen vom
  Felsen … und pass auf deine eigenen auf.“

## Schritte zur Umsetzung

1. Physik mit Testskript: viele zufällige Stöße, prüfen, dass jeder Stoß endet, nichts ineinander steckt und
   die Bahn auf jedem Rechner gleich herauskommt.
2. Spiellogik: Karten mit Aufstellungen, Seiten, Züge, Extrazug, Runterfallen, Ausscheiden, Sätze, Einstellungen.
3. Host-Bildschirm mit Felsen, Abspielen der Bahn, Live-Zielpfeil, Sprüchen und Endwertung.
4. Handy-Zielen mit Ziehen und Loslassen, Ansicht beim Warten.
5. Geteiltes Gerät und Modus ohne Fernseher.
6. Test mit mehreren Browsern über Playwright (Duell, 4 Seiten, Teams, Eigentor, gleichzeitig leer,
   Extrazug, Spieler verlässt, Neuladen während eines Stoßes, ohne Fernseher auf einem Handy).

## Entscheidungen

- Name „Sumo Zoo“.
- Extrazug nach einem Treffer als Einstellung, standardmäßig an.
- Mehrere Karten, Standard ist das eckige Felsplateau.
- 3 bis 4 Seiten gleichzeitig sind möglich, dazu Teams.
- Der Stoß geht beim Loslassen los, ohne Bestätigen.
- 2 bis 8 Spieler reichen.
- Nachträglich (25.10.2026): Tiere sitzen im Schwimmreifen wie im Original, Steinmauern mit Lücken am Rand, die Tiere gleiten weiter, Startaufstellung im Kreis mit 2 Steinen links/rechts wie im Original, Spielsteine zeigen das Profilbild des Spielers im Schwimmreifen.
