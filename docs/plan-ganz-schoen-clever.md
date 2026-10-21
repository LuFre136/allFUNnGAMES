# Plan: Würfelfuchs (Würfelspiel nach „Ganz schön clever“)

Stand: Plan, noch nicht umgesetzt (21.10.2026). Alle Entscheidungen sind getroffen, siehe ganz unten.

## Spielidee

Das Würfelspiel „Ganz schön clever“: Es gibt sechs Würfel in sechs Farben (weiß, gelb, blau, grün, orange, lila).
Jeder Spieler hat auf seinem Handy ein Blatt mit fünf farbigen Feldern, in denen jeweils andere Regeln gelten.
Wer clever wählt, löst Bonusse aus, die wieder neue Kreuze bringen, und baut so Kettenreaktionen. Am Ende zählt
die Summe aller Felder plus die Füchse. Wie bei Kreuz & Quer sind alle bei jedem Zug beteiligt: Der aktive Spieler
wählt Würfel, die anderen dürfen danach aus den liegengebliebenen Würfeln einen nehmen.

Name: „Ganz schön clever“ ist ein Markenname, auf der Plattform heißt das Spiel **„Würfelfuchs“** (entschieden am
21.10.2026), weil der Fuchs im Spiel das Bonus-Symbol ist und der Name zu „Würfelbecher“ passt.

## Ablauf eines Zuges

1. **Aktiver Spieler würfelt** alle verfügbaren Würfel, höchstens dreimal pro Zug.
2. Nach jedem Wurf **wählt er einen Würfel** und trägt ihn in das Feld dieser Farbe ein. Der weiße Würfel ist ein
   Joker und darf in jedes Farbfeld.
3. Alle übrigen Würfel mit **kleinerem Wert** als der gewählte wandern aufs **Tablett** und sind für diesen Zug weg.
   Gleich hohe und höhere bleiben für den nächsten Wurf.
4. Nach drei Würfen (oder früher, wenn keine Würfel mehr übrig sind) landen alle nicht gewählten Würfel auf dem
   Tablett.
5. **Passive Phase:** Jeder andere Spieler wählt gleichzeitig **einen** Würfel vom Tablett und trägt ihn ein.
   Mehrere Spieler dürfen denselben Würfel nehmen. Ist das Tablett leer, dürfen sie aus allen sechs Würfeln wählen
   (Tablett plus gewählte Würfel, so wie die Originalregel es für diesen Fall vorsieht; beim Bauen gegen die
   Anleitung prüfen).
6. Darf jemand einen Würfel nicht sinnvoll eintragen, kann er ihn trotzdem wählen und „verfallen lassen“, beim
   aktiven Spieler zählt das als Wahl (keine Strafe wie der Fehlwurf bei Kreuz & Quer).

## Die fünf Farbfelder

- **Gelb:** Raster 4 × 4 mit Zahlen 1 bis 6, die Diagonale ist schon vorgekreuzt. Man kreuzt eine Zahl an, die zum
  gelben (oder weißen) Würfel passt. Volle Spalten bringen Punkte, volle Zeilen und die Diagonale Bonusse.
- **Blau:** Gezählt wird immer die Summe aus **blauem + weißem** Würfel, egal welcher von beiden gewählt wurde.
  Raster mit den Summen 2 bis 12, jede Summe einmal. Punkte nach Anzahl der Kreuze (1, 2, 4, 7, 11, …).
- **Grün:** 11 Kästchen von links nach rechts mit Mindestwerten (≥1, ≥2, ≥3, ≥4, ≥5, ≥1, …, ≥6). Punkte nach
  Anzahl der Kreuze (1, 3, 6, 10, 15, …).
- **Orange:** 11 Kästchen von links nach rechts, man schreibt den Würfelwert hinein, manche Kästchen zählen doppelt
  oder dreifach. Punkte = Summe.
- **Lila:** 11 Kästchen von links nach rechts, jeder Wert muss **größer** sein als der vorige, nach einer 6 geht es
  wieder bei jedem Wert los. Punkte = Summe.

Unter bestimmten Kästchen liegen **Bonusse**: ein Kreuz in einer anderen Farbe, eine feste Zahl in Orange oder
Lila, eine **Neuwurf**-Aktion, eine **+1**-Aktion oder ein **Fuchs**. Ein Bonus wird sofort ausgelöst und kann
weitere Bonusse auslösen (Kettenreaktion). Wohin genau welcher Bonus gehört und welche Punktetabellen gelten, steht
als Daten in `sheet.json` (siehe Technik) und wird beim Bauen gegen die Originalanleitung geprüft, nicht aus dem
Gedächtnis übernommen.

## Aktionen und Runden

- **Neuwurf:** Der aktive Spieler darf einen Wurf mit allen gerade verfügbaren Würfeln wiederholen. Gilt nicht für
  passive Spieler.
- **+1:** Am Ende eines beliebigen Zuges (eigener oder fremder) darf man einen der sechs Würfel **zusätzlich**
  eintragen, auch einen schon gewählten. Mehrere +1 pro Zug sind möglich, aber jeder Würfel nur einmal.
- **Rundenleiste:** Zu Beginn bestimmter Runden bekommt jeder einen Bonus (Neuwurf, +1, …). Rundenzahl je nach
  Spielerzahl: 1–2 Spieler 6 Runden, 3 Spieler 5 Runden, ab 4 Spielern 4 Runden. Eine Runde = jeder war einmal aktiv.
- **Füchse:** Jeder Fuchs zählt am Ende so viele Punkte wie das **schwächste** Farbfeld des Spielers.
- **Solo (1 Spieler):** Nach dem eigenen Zug würfelt das Spiel alle sechs Würfel für einen gedachten Mitspieler,
  die drei niedrigsten kommen aufs Tablett und der Spieler nimmt einen davon wie ein passiver Spieler.

Das Spiel zeigt für jeden Würfel an, **wo er hinpasst** und welche Bonusse dadurch ausgelöst würden („Gelb 5 →
Zeile voll → Kreuz in Blau“). Ein Tipp auf den Würfel öffnet die passenden Kästchen, ein zweiter Tipp trägt ein.
Weil Bonusse Ketten bilden, ist diese Hilfe hier wichtiger als bei Kreuz & Quer.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Bedenkzeit pro Schritt | ohne Limit | 30–120 s oder „ohne Limit“ |
| Reihenfolge | zufällig | zufällig oder vom Host festgelegt (wie Würfelbecher) |
| Hilfen anzeigen | an | an/aus (passende Kästchen und Bonus-Vorschau) |
| Partien hintereinander | 1 | 1–5, Punkte werden addiert |

Läuft die Bedenkzeit ab, wählt das Spiel für den aktiven Spieler den Würfel, der die meisten Punkte bringt, passive
Spieler verzichten auf ihren Würfel. Offene Bonus-Kreuze werden nicht verfallen gelassen, sondern bleiben stehen,
bis der Spieler wieder dran ist.

## Ansichten

- **Handy:** oben die Würfel mit Tablett-Bereich, darunter das eigene Blatt mit fünf Farbfeldern, unten die Leiste
  mit Neuwurf, +1 und Füchsen. Das Blatt ist hochkant gebaut, die Felder scrollen nicht seitlich. Wer am Zug ist,
  sieht oben den Knopf „Würfeln“, wer passiv ist, „Wähle einen Würfel vom Tablett“ mit Häkchen, sobald er fertig ist.
  Ein Tipp auf das Profilbild eines Mitspielers zeigt dessen Blatt zum Anschauen.
- **Host-Bildschirm (Fernseher):** große Würfel in der Mitte, daneben das Tablett und die schon gewählten Würfel,
  darüber die Rundenleiste. Rundherum alle Spieler mit Profilbild, Punktestand, Füchsen und Häkchen. Das Blatt des
  aktiven Spielers wird verkleinert gezeigt, damit alle seine Kettenreaktionen mitverfolgen können.
- **Endwertung:** alle Blätter nebeneinander mit Punkten pro Farbe und Füchsen, danach die Siegerehrung wie im
  Pub Quiz. Danach lässt sich die Bestenliste einblenden wie bei Würfelbecher.

## Technik

- **Neues Spiel** `server/games/wuerfelfuchs/index.js` (id `wuerfelfuchs`, CSS-Präfix `wf-`), eingetragen in
  `server/games/index.js`. Gleiche Schnittstelle wie die anderen Spiele: `meta()`, `defaultSettings()`,
  `sanitizeSettings()`, `start()`, `action()`, `view(viewer)`, `playersChanged()`, `dispose()`.
- **meta():** `teams: false`, `minPlayers: 1`, `maxPlayers: 6` (entschieden; Original 1–4, mit 5–6 Spielern geht es dank
  gleichzeitiger passiver Phase noch gut, dann 4 Runden). `players: '1–6 Spieler'`. Kein `sharedDevice`, weil die
  passive Phase gleichzeitig läuft und sich zwei Spieler sonst ein Handy hin- und herreichen müssten.
- **Blatt als Daten:** `server/games/wuerfelfuchs/sheet.json` beschreibt jedes Kästchen (Farbe, Bedingung,
  Multiplikator, Bonus) und die Punktetabellen. Server und Client lesen dieselbe Datei, so stecken die Regeln
  nicht doppelt im Code und lassen sich gegen die Anleitung abhaken.
- **Spielzüge** über `game:action`:
  `{ type: 'roll' }`, `{ type: 'reroll' }`, `{ type: 'pick', die, field }` (Würfel wählen und eintragen),
  `{ type: 'plusOne', die, field }`, `{ type: 'bonus', field }` (ausgelöstes Bonus-Kreuz setzen),
  `{ type: 'done' }`, dazu für den Host `force` und `skip` wie bei Würfelbecher.
- **Würfeln nur auf dem Server** mit `crypto.randomInt`, der Client spielt nur die Animation ab (`rollSeq` wie bei
  Würfelbecher).
- **Zustand:** Runde, aktiver Spieler, Wurf-Nummer (0–3), Würfel mit Ort (`free` | `chosen` | `tray`), Schritt
  (`active` | `passive` | `result` | `final`), pro Spieler die Einträge je Farbe, offene Bonusse (Warteschlange),
  verfügbare Neuwürfe, +1 und Füchse, „fertig“-Status.
- **Bonus-Kette:** Jeder Eintrag läuft durch eine Funktion, die neue Bonusse in die Warteschlange des Spielers legt.
  Bonusse, die eine Wahl brauchen (z. B. „Kreuz in Gelb“, wo es mehrere Kästchen gibt), wartet das Spiel ab,
  Bonusse ohne Wahl (feste Zahl in Orange) werden sofort eingetragen. Ein Undo im laufenden Schritt nimmt den
  letzten Eintrag samt seiner Kette zurück.
- **Prüfung jedes Eintrags auf dem Server:** richtiger Würfel, Kästchen frei, Bedingung erfüllt (Gelb-Zahl,
  Blau-Summe, Grün-Mindestwert, Lila größer). Der Client zeigt dieselbe Prüfung nur als Hilfe.
- **Wiederverbinden:** Alles liegt auf dem Server. Wer in der passiven Phase getrennt ist, verzichtet nach Ablauf
  der Bedenkzeit oder wenn der Host weiterdrängt. Verlässt der aktive Spieler das Spiel, kann der Host ihn
  überspringen.
- **Oberfläche:** `public/js/wuerfelfuchs.js` und `public/css/wuerfelfuchs.css`, eingehängt über das
  `gameViews`-Register in `lobby.js`. Würfel als CSS-Punkte wie bei Kreuz & Quer und Würfelbecher, die
  Würfel-Bausteine von dort werden wiederverwendet. Eigene Gestaltung des Blatts, keine Grafiken aus dem Original.
- **Bestenliste:** `createBoard('wuerfelfuchs-highscores')` aus `server/highscores.js`, genau wie bei
  Würfelbecher.
- **Startseite:** Kachel „Würfelfuchs“ mit Symbol 🦊, „1–6 Spieler“. README bekommt einen Abschnitt „So läuft
  Würfelfuchs“.

## Schritte zur Umsetzung

1. `sheet.json` aus der Anleitung abschreiben und Punkte-Rechnung schreiben, mit Unit-Tests (volle Blätter aus der
   Anleitung nachrechnen).
2. Spiellogik: Würfeln, Wählen, Tablett, passive Phase, Neuwurf, +1, Bonus-Kette, Runden und Spielende. Tests für
   die Ketten und Grenzfälle (leeres Tablett, weißer Würfel in Blau, Lila nach 6).
3. Handy-Blatt mit Hilfen (passende Kästchen, Bonus-Vorschau, Undo).
4. Host-Bildschirm mit Würfeln, Tablett, Rundenleiste und Spielerübersicht.
5. Endwertung, Siegerehrung, mehrere Partien und Bestenliste.
6. Test mit mehreren Browsern über Playwright (Solo, 3 Spieler gleichzeitig passiv, Kettenreaktion,
   Wiederverbinden, Bedenkzeit).

## Entscheidungen (21.10.2026)

- **Name:** „Würfelfuchs“.
- **Spielerzahl:** 1–6 Spieler.
- **Bestenliste:** wird gleich mitgebaut (die zehn besten Blätter, wie bei Würfelbecher).
- **Varianten** wie „Doppelt so clever“ oder „Clever hoch drei“: erst später, dann mit eigener `sheet.json`.
