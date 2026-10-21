# Plan: Nach Spielende ein anderes Spiel starten

Stand: umgesetzt (21.10.2026). Lukas’ Antworten auf die offenen Fragen stehen am Ende.

## Ziel

Heute ist eine Lobby fest an ein Spiel gebunden (`new Lobby(gameId, …)`). Wer nach dem Pub Quiz noch Würfelbecher
spielen will, muss eine neue Lobby erstellen, und alle müssen mit neuem Code wieder beitreten. Künftig soll der
Host am Ende eines Spiels (und auch vorher in der Lobby) einfach ein anderes Spiel auswählen. Alle Mitspieler
bleiben mit ihrem Namen, Avatar und Gerät in derselben Lobby, der Code bleibt gleich.

Spiele, für die gerade zu viele Spieler da sind, erscheinen in der Auswahl ausgegraut, mit Grund. Zu wenige
Spieler sperren nicht, das meldet wie bisher der Spielstart.

## Ablauf aus Sicht der Spieler

1. Ein Spiel ist vorbei, der Endbildschirm (Podest) erscheint wie bisher.
2. In der Host-Leiste steht neben „Neue Runde (zur Lobby)“ ein zweiter Knopf **„🎮 Anderes Spiel“**.
3. Der Knopf öffnet ein Auswahlfenster mit denselben Spielkarten wie auf der Startseite (Symbol, Name,
   Beschreibung, Spielerzahl). Das aktuelle Spiel ist markiert.
4. Karten, die gerade nicht passen, sind ausgegraut und nicht anklickbar. Darunter steht kurz, warum, z. B.
   „Höchstens 8 Spieler, ihr seid 11.“
5. Der Host tippt ein Spiel an. Alle Geräte springen gleichzeitig in die Lobby des neuen Spiels, mit dessen
   Einstellungen. Der Host prüft die Einstellungen und tippt auf „Spiel starten“.
6. Die Mitspieler sehen kurz eine Meldung „Weiter geht’s mit Würfelbecher 🎲“.

Derselbe Knopf steht auch in der Lobby-Ansicht vor dem Start, falls der Host sich vertan hat.

## Spielerzahlen

Bisher stehen die Grenzen nur als Text in `meta().players` (z. B. „2–8 Spieler“) und als Konstanten in einzelnen
Spielen, die erst beim Start eine Fehlermeldung werfen. Dafür bekommt jedes `meta()` zwei Zahlen:

| Spiel | minPlayers | maxPlayers | Hinweis |
| --- | --- | --- | --- |
| Pub Quiz | 2 | 40 | in Teams |
| Just One | 3 | 20 | |
| Stadt, Land, Fluss | 2 | 20 | |
| Kreuz & Quer | 2 | 8 | |
| Karaoke | 1 | 30 | |
| Dr Kroko | 2 | 20 | Mitspieler am selben Gerät zählen mit |
| Musikzeitreise | 1 | 40 | in Teams; einzeln höchstens 12, das prüft der Spielstart |
| Würfelbecher | 1 | 10 | Mitspieler am selben Gerät zählen mit |
| Alias | 4 | 20 | genau 2 Teams |

Die Zahlen stammen aus den heutigen Texten und Konstanten. Der Text in `players` bleibt, weil er mehr sagt
(„in Teams“, „Sänger“). Die Start-Prüfungen in den Spielen bleiben als Sicherheitsnetz.

**Wer zählt:** alle verbundenen Spieler, die mitspielen, also `lobby.activePlayers()`. Der Host zählt nur, wenn
„Host spielt mit“ an ist. Getrennte Spieler zählen nicht. Gäste am selben Gerät zählen nur bei Spielen mit
`sharedDevice` (siehe unten).

## Was beim Wechsel mit der Lobby passiert

- **Spiel:** Das laufende Spiel wird beendet (`dispose`), `lobby.Game`, `gameId` und `teamSupport` werden auf das
  neue Spiel gesetzt, die Phase wird `lobby`.
- **Einstellungen:** `settings.game` wird auf die Standardwerte des neuen Spiels gesetzt. „Host spielt mit“ bleibt.
- **Lobbyname:** Hat der Host den automatischen Namen („Lukas’ Pub Quiz“) nicht geändert, wird er zum neuen Spiel
  angepasst („Lukas’ Würfelbecher“). Einen selbst gewählten Namen lassen wir stehen.
- **Teams:**
  - Neues Spiel ohne Teams: Teams bleiben im Hintergrund erhalten, werden aber nicht angezeigt. So sind sie
    wieder da, wenn danach wieder ein Teamspiel kommt.
  - Neues Spiel mit Teams und es gibt noch keine: zwei Teams anlegen, alle Spieler gleichmäßig zufällig verteilen.
  - Neues Spiel erlaubt weniger Teams (Alias: 2): überzählige Teams entfernen, deren Spieler auf die übrigen
    Teams verteilen, damit sie gleich groß bleiben.
- **Gäste am selben Gerät** (Dr Kroko, Würfelbecher): Beim Wechsel zu einem Spiel ohne `sharedDevice` werden sie
  entfernt, weil sie kein eigenes Handy haben. Beim Wechsel zwischen Dr Kroko und Würfelbecher bleiben sie.
  Ausgrauen und Zählen berücksichtigen das schon, damit die Zahl in der Auswahl stimmt.
- **Reihenfolge** (`orderMode`/`order` bei Dr Kroko und Würfelbecher) gehört zu den Spieleinstellungen und wird
  mit zurückgesetzt.

## Umsetzung

**Server**

- `server/games/*/index.js`: `minPlayers`, `maxPlayers` in `meta()`.
- `server/lobbies.js`:
  - `playerCountFor(Game)`: zählt die Spieler, die im neuen Spiel mitspielen würden (Gäste nur bei `sharedDevice`).
  - `gameOptions()`: Liste aller spielbaren Spiele mit `{ id, name, icon, description, players, fits, reason }`.
  - `switchGame(gameId)`: prüft `fits`, macht dann die Schritte aus dem Abschnitt oben. Gibt sonst eine
    Fehlermeldung zurück.
  - `view()`: für den Host zusätzlich `gameOptions`, damit die Auswahl ohne extra Anfrage auskommt und sich
    live aktualisiert, wenn jemand beitritt oder geht.
- `server/index.js`: neue Host-Aktion `case 'switchGame': error = lobby.switchGame(data.gameId); break;`.

**Client**

- `public/js/lobby.js`: Knopf „🎮 Anderes Spiel“ in `viewHostbar()` (auf dem Endbildschirm und in der Lobby),
  Auswahlfenster mit den Karten aus `S.gameOptions`, ausgegraute Karten mit Grund. Die Spiele mit eigener
  Host-Leiste (`gameViews[id].hostbar()`) zeigen auf dem Endbildschirm heute nur „Neue Runde (zur Lobby)“; der neue
  Knopf kommt einmal zentral dazu, statt in jede Datei kopiert zu werden.
- Kein Neuladen nötig: `lobby.html` lädt schon alle Spiel-Skripte und -Stile, und die Ansicht richtet sich nach
  `S.game.id`. Nach dem Wechsel zeichnet jedes Gerät einfach die Lobby des neuen Spiels.
- Musik: Der Spotify-Player auf dem Host verschwindet wie bisher, sobald die Lobby angezeigt wird.
- Startseite: `home.js` liest `minPlayers`/`maxPlayers` nicht, dort ändert sich nichts.

**Test**

Server lokal starten und mit Playwright mehrere Spieler simulieren: Pub Quiz mit 11 Spielern zu Ende spielen,
prüfen, dass Kreuz & Quer ausgegraut ist, Würfelbecher wählbar ist, alle Geräte in der Würfelbecher-Lobby landen
und der Lobbycode gleich bleibt. Außerdem Teamwechsel (Pub Quiz mit 3 Teams → Alias) und Gäste
(Würfelbecher → Just One).

## Entscheidungen (Lukas, 21.10.2026)

1. Das nächste Spiel wählt nur der Host.
2. Nach der Wahl geht es erst in die Lobby des neuen Spiels, nicht direkt ins Spiel.
3. Zu volle Spiele sind ganz gesperrt.
4. Zu wenige Spieler sperren nicht.
5. Gäste am selben Gerät werden entfernt, wenn das neue Spiel nicht an einem Gerät spielbar ist.
6. Keine Gesamtwertung über mehrere Spiele.
