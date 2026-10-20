# all Fun n Games

Spieleplattform für Spieleabende: Spiel auswählen, Lobby erstellen, Freunde per Link oder QR-Code einladen. Als erstes Spiel gibt es ein **Pub Quiz** mit 112 Fragen in 13 Kategorien.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 18.

```bash
npm install
npm start
```

Danach im Browser `http://localhost:3000` öffnen. Der Server zeigt beim Start auch die Adresse im WLAN an (z. B. `http://192.168.0.23:3000`). Einladungslinks und QR-Codes verwenden automatisch diese Adresse, damit Handys im selben WLAN beitreten können.

Optionale Umgebungsvariablen:

| Variable | Zweck |
| --- | --- |
| `PORT` | Port des Servers (Standard 3000) |
| `PUBLIC_URL` | Feste Adresse für Einladungslinks (bei Render automatisch gesetzt) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify-Zugangsdaten (siehe unten) |
| `GITHUB_TOKEN`, `GITHUB_REPO` | Speichert ausgeschlossene Fragen dauerhaft im Repository (siehe unten) |

## Online stellen (Render)

So läuft die Plattform dauerhaft im Internet und ist von jedem Handy aus erreichbar, ganz ohne Laptop.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/LuFre136/allFUNnGAMES)

1. Auf [render.com](https://render.com) ein kostenloses Konto anlegen (am einfachsten mit „Sign in with GitHub“).
2. Den Button oben klicken (oder im Dashboard **New → Blueprint** und dieses Repository wählen). Render liest die Einstellungen aus `render.yaml`.
3. Bei den Spotify-Feldern kann man die Zugangsdaten eintragen oder sie leer lassen.
4. **Apply** klicken. Nach ein paar Minuten gibt es eine Adresse wie `https://all-fun-n-games.onrender.com`. Diese Adresse auf dem Handy öffnen, fertig.

Neue Commits auf `main` werden automatisch veröffentlicht. Falls Render das nicht von selbst mitbekommt (zum Beispiel, wenn der Dienst ohne Verbindung zu GitHub angelegt wurde), übernimmt das ein GitHub-Workflow:

1. In Render den Dienst öffnen, **Settings → Deploy Hook** und die Adresse kopieren.
2. Auf GitHub im Repository **Settings → Secrets and variables → Actions → New repository secret** öffnen, als Name `RENDER_DEPLOY_HOOK_URL` und als Wert die kopierte Adresse eintragen.

Danach stößt jeder Merge nach `main` ein Deployment an (`.github/workflows/render-deploy.yml`). Unter **Actions → Render-Deployment → Run workflow** lässt es sich auch von Hand starten.

Gut zu wissen beim kostenlosen Tarif: Nach etwa 15 Minuten ohne Besucher schläft der Server ein. Der erste Aufruf danach dauert rund eine Minute, und Lobbys aus der vorherigen Sitzung sind dann weg. Einfach die Seite kurz vor dem Spieleabend einmal öffnen.

## So läuft das Pub Quiz

**Host (Ersteller der Lobby)** stellt ein: Teams hinzufügen, umbenennen und löschen, Anzahl Fragen, Kategorien, Fragenformate (z. B. nur Schätzfragen), Lobbyname, eigener Spielername, Zeitlimit und ob er mitspielt oder nur Gamemaster ist. Der Einladungslink lässt sich kopieren, teilen oder als QR-Code scannen.

**Spieler** wählen beim Beitreten Name, Profilbild und Team.

**In jeder Frage**
- Alle Teammitglieder stimmen ab: Antwort antippen oder eintippen. Die Stimme lässt sich bis zur Auflösung ändern.
- Das Profilbild jedes Mitglieds erscheint oben rechts an der gewählten Antwort (ab vier Stimmen drei Bilder und „+N“). Die Antwort mit den meisten Stimmen wird hervorgehoben.
- Bei Freitext sehen Teammitglieder die Vorschläge der anderen und können sie mit einem Tipp übernehmen.
- Haben alle abgestimmt, läuft ein 3-Sekunden-Countdown, dann wird aufgelöst. Ist das Zeitlimit abgelaufen, wird ebenfalls aufgelöst.
- Teamantwort = Antwort mit den meisten Stimmen. Bei Gleichstand wird zwischen den Spitzenreitern gelost.
- Der Host kann eine Frage pausieren (Zeitlimit und Auflösungs-Countdown stehen still, abstimmen geht weiter) und jederzeit zur Auflösung springen. Als reiner Gamemaster kann er sich die richtige Antwort vorab anzeigen lassen.

**Fragenformate und Punkte**

| Format | Bewertung | Punkte |
| --- | --- | --- |
| Multiple Choice (A–D) | automatisch | 1 |
| Offene Frage | Vorschlag automatisch, Host entscheidet | 1 |
| Schätzfrage | automatisch, innerhalb der Toleranz | 1 |
| Musik: Interpret & Titel | Vorschlag automatisch, Host entscheidet | je 1 für Interpret und Titel |
| Musik: Interpret & Jahr (±3) | automatisch, Host kann korrigieren | je 1 für Interpret und Jahr |
| Wer ist das? (Bild) | Vorschlag automatisch, Host entscheidet | 1 |
| Länderflagge | Vorschlag automatisch, Host entscheidet | 1 |

Musikfragen haben ein eigenes Zeitlimit (Standard 3 Minuten), das der Host getrennt einstellt.

Der Host kann bei der Auflösung jede Bewertung mit ✓ oder ✗ ändern.

## Fragen ausschließen

Während einer Frage kann jeder Mitspieler auf „🚫 Frage ausschließen“ tippen. Stimmen alle verbundenen Mitspieler dafür, kommt die Frage in keiner Partie mehr vor und wird sofort durch eine unbenutzte Frage im selben Format ersetzt (bevorzugt aus den gewählten Kategorien).

Die ausgeschlossenen Fragen stehen in `data/excluded-questions.json`. Render hat keine dauerhafte Festplatte, deshalb speichert der Server die Liste zusätzlich im Repository auf dem Branch `quiz-daten`, sobald `GITHUB_TOKEN` gesetzt ist. Dafür auf GitHub unter Settings → Developer settings → Fine-grained tokens einen Token nur für dieses Repository mit der Berechtigung „Contents: Read and write“ anlegen und in Render unter Environment als `GITHUB_TOKEN` eintragen. Der Branch löst kein neues Deployment aus.

Eine Frage wieder aktivieren: den Eintrag aus `excluded-questions.json` auf dem Branch `quiz-daten` löschen. Der Server übernimmt das spätestens nach 10 Minuten. Eine Oberfläche dafür ist in [docs/plan-fragen-reaktivieren.md](docs/plan-fragen-reaktivieren.md) geplant.

## Musik über Spotify

Der Song läuft auf dem Gerät des Hosts über den eingebetteten Spotify-Player. Der Player ist bis zur Auflösung verdeckt, Titel und Cover sind also nicht zu sehen (wie bei Hitster). Die Spieler sehen nur „Song läuft“.

- Ist man im Browser des Hosts bei Spotify angemeldet, läuft der ganze Song, sonst eine 30-Sekunden-Vorschau.
- Die Songs sind mit Spotify-Track-IDs hinterlegt. Mit eigenen Zugangsdaten sucht der Server die Songs beim Start zusätzlich über die Spotify-API und nimmt die gefundenen IDs. Dafür auf [developer.spotify.com](https://developer.spotify.com/dashboard) eine App anlegen und starten mit:

```bash
SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm start
```

## Profilbilder

Alle Bilder im Ordner `public/avatars/` (PNG, JPG, WebP, GIF, SVG) stehen automatisch zur Auswahl. Die mitgelieferten Tier-Bilder sind Platzhalter und können gelöscht werden.

## Fragen bearbeiten

Alle Fragen stehen in `server/games/pubquiz/questions.json`. Beispiele je Format:

```json
{ "type": "choice", "category": "Geografie", "question": "…", "options": ["A", "B", "C", "D"], "answer": 2 }
{ "type": "open", "category": "…", "question": "…", "answer": "Zugspitze", "accepted": ["Zugspitze"] }
{ "type": "estimate", "category": "…", "question": "…", "unit": "m", "answer": 330, "tolerance": 20 }
{ "type": "music-title", "category": "Musik", "question": "…", "artist": "Queen", "title": "Bohemian Rhapsody", "year": 1975, "spotifyId": "7tFiyTwD0nx5a1eklYtX2J" }
{ "type": "music-year", "category": "Musik", "question": "…", "artist": "ABBA", "title": "Dancing Queen", "year": 1976, "spotifyId": "…" }
{ "type": "image", "category": "Promis & Comics", "question": "…", "answer": "Homer Simpson", "accepted": ["Homer"], "wiki": "Homer_Simpson" }
{ "type": "flag", "category": "Länderflaggen", "question": "…", "answer": "Japan", "accepted": ["Japan"], "flag": "jp" }
```

Bei Flaggenfragen ist `flag` der zweistellige Ländercode; das Bild kommt von flagcdn.com. Bei Bildfragen lädt `wiki` das Hauptbild des englischen Wikipedia-Artikels. Alternativ ein eigenes Bild in `public/quiz-images/` legen und `"image": "/quiz-images/datei.jpg"` eintragen. Neue Kategorien oben in `categories` ergänzen.

## So läuft Just One

Kooperatives Ratespiel ohne Teams für mindestens 3 Mitspieler. Reihum rät einer: Er wählt eine von vier verdeckten Karten, alle anderen sehen den Begriff und schreiben je ein Wort als Hinweis auf. Danach werden doppelte Hinweise automatisch gestrichen, auch bei gleichem Wortstamm („Haus“, „Häuser“, „Häuschen“), ebenso Hinweise aus der Wortfamilie des Begriffs („Apfelbaum“ zu „Apfel“). Die Hinweisgeber können vor dem Aufdecken weitere Hinweise streichen oder eine Streichung aufheben. Richtig geraten gibt einen Punkt, Passen kostet nur die Karte, ein falscher Rateversuch zusätzlich die nächste Karte. Der Host kann die Bewertung korrigieren und Karten überspringen.

Die Begriffe stehen in `server/games/justone/words.json` und lassen sich dort beliebig ergänzen.

## So läuft Stadt, Land, Fluss

Für 2–20 Spieler, jeder für sich oder in Teams (im Team-Modus füllt jedes Team ein gemeinsames Blatt aus). Stadt, Land und Fluss sind vorausgewählt; der Host kann Kategorien entfernen, eigene eintippen oder aus Vorschlägen antippen (bis zu 12). Außerdem stellt er Runden, Zeitlimit, Stopp-Knopf mit Restzeit und die erlaubten Buchstaben ein (Standard: ohne Q, X, Y).

Pro Runde wird ein Buchstabe gezogen, jeder Buchstabe nur einmal pro Partie. Wer alle Felder ausgefüllt hat, kann Stopp rufen, danach bleibt den anderen die eingestellte Restzeit. Anschließend wird Kategorie für Kategorie geprüft: Leere Antworten und falsche Anfangsbuchstaben zählen automatisch nicht (Ä zählt als A). Zweifelt die Mehrheit der übrigen Mitspieler eine Antwort an, zählt sie ebenfalls nicht; der Host kann jede Antwort fest zulassen oder ablehnen. Punkte: 20 für die einzige gültige Antwort in einer Kategorie, 10 für eine Antwort, die sonst niemand hat, 5 für eine doppelte Antwort.

## So läuft Kreuz & Quer

Würfelspiel nach Qwixx für 2 bis 8 Mitspieler, ohne Teams. Jeder hat auf dem Handy ein Spielblatt mit vier Farbreihen (Rot und Gelb von 2 bis 12, Grün und Blau von 12 bis 2). Reihum würfelt einer mit zwei weißen und vier farbigen Würfeln. Die Summe der weißen Würfel dürfen alle gleichzeitig in einer Reihe ankreuzen, danach darf der Würfelnde noch einen weißen mit einem farbigen Würfel kombinieren. Angekreuzt wird von links nach rechts, übersprungene Felder verfallen. Kreuzt der Würfelnde gar nichts an, gibt es einen Fehlwurf (−5 Punkte). Das letzte Feld einer Reihe gibt es ab fünf Kreuzen, dann ist die Reihe für alle geschlossen. Das Spiel endet bei vier Fehlwürfen oder zwei geschlossenen Reihen. Pro Reihe zählen 1, 3, 6, 10, … Punkte für 1, 2, 3, 4, … Kreuze.

Der Host stellt Bedenkzeit, Startspieler, Hilfen (erlaubte Felder leuchten) und die Zahl der Partien ein. Reagiert jemand nicht, kann er für den Würfelnden würfeln oder den Schritt beenden. Die Regeln prüft `npm test`.

## So läuft Dr Kroko

Geschicklichkeitsspiel für 2 bis 20 Mitspieler, ohne Teams. Auf allen Geräten ist dasselbe Krokodil mit offenem Maul zu sehen (Standard 13 Zähne, einstellbar von 5 bis 24). Reihum drückt jeder auf dem Handy einen Zahn. Einer davon ist zufällig der wunde Zahn: Wer ihn erwischt, wird gebissen, das Maul schnappt zu und das Handy vibriert. Die nächste Runde beginnt, wer nach dem Gebissenen an der Reihe ist.

- **Feste Runden:** Nach der eingestellten Rundenzahl gewinnt, wer am wenigsten gebissen wurde.
- **K.-o.:** Wer gebissen wird, scheidet aus. Wer übrig bleibt, gewinnt.
- **Reihenfolge:** Der Host lässt sie beim Start auslosen oder legt sie in der Lobby selbst fest, indem er die Spieler am Griff ⠿ in die gewünschte Reihenfolge zieht (klappt auch auf dem Handy). „Mischen“ lost eine Reihenfolge aus, die sich danach noch anpassen lässt.
- **Mehrere Spieler an einem Gerät:** In der Lobby kann jedes Gerät unter „Mitspieler an diesem Gerät“ weitere Namen eintragen. Diese Spieler bekommen einen eigenen Platz in der Reihenfolge und drücken auf dem Gerät, an dem sie eingetragen sind. Sind sie dran, steht ihr Name oben.
- Optional gibt es ein Zeitlimit pro Zug. Läuft es ab, wird ein zufälliger Zahn gedrückt. Der Host kann außerdem für den Spieler am Zug drücken oder ihn überspringen.

## So läuft Kniffel

Würfelspiel für 1 bis 10 Mitspieler, ohne Teams. Reihum würfelt jeder bis zu dreimal mit fünf Würfeln; zwischen den Würfen tippt man die Würfel an, die liegen bleiben sollen. Danach wird das Ergebnis in ein freies Feld des Wertungsblocks eingetragen, notfalls mit 0 Punkten (streichen). Oben (Einser bis Sechser) zählen nur die passenden Augen, ab 63 Punkten oben gibt es 35 Bonus. Unten: Dreier- und Viererpasch zählen alle Augen, Full House 25, kleine Straße 30, große Straße 40, Kniffel 50, Chance alle Augen. Nach 13 Runden sind alle Blöcke voll.

- Der Block mit allen Spielern ist auf jedem Gerät zu sehen, auf dem Fernseher also wie ein gemeinsamer Kniffelblock. Mit „Hilfen“ stehen beim Spieler am Zug die möglichen Punkte grau in den freien Feldern.
- **Reihenfolge:** Der Host lässt sie beim Start auslosen oder legt sie in der Lobby fest, indem er die Spieler am Griff ⠿ verschiebt. Jede weitere Partie beginnt der Nächste in der Reihe.
- **Mehrere Spieler an einem Gerät:** In der Lobby kann jedes Gerät unter „Mitspieler an diesem Gerät“ weitere Namen eintragen. Sie bekommen eine eigene Spalte im Block und würfeln an dem Gerät, an dem sie eingetragen sind.
- Optional gibt es ein Zeitlimit pro Zug. Läuft es ab, wird (falls nötig) gewürfelt und das Feld mit den meisten Punkten eingetragen. Das kann der Host auch per Knopf auslösen oder den Spieler überspringen, der dann in der nächsten Runde wieder dran ist.
- Ohne Extra-Kniffel-Bonus und ohne Joker-Regel; ein zweiter Kniffel zählt einfach in einem passenden Feld.

## Aufbau

```
server/index.js              Webserver, Socket.IO-Ereignisse, QR-Codes
server/lobbies.js            Lobbys, Spieler, Teams, Einstellungen
server/games/index.js        Verzeichnis der Spiele (neue Spiele hier eintragen)
server/games/pubquiz/        Pub-Quiz-Logik und Fragen
server/games/stadtlandfluss/ Stadt, Land, Fluss
server/games/justone/        Just One
server/games/kreuzquer/      Kreuz & Quer (Würfelspiel)
server/games/kniffel/        Kniffel
test/                        Regeltests (npm test)
server/spotify.js            Optionale Spotify-Suche
public/                      Startseite, Lobby-/Spielseite, Styles, Profilbilder
```

Lobbys liegen im Arbeitsspeicher. Nach einem Neustart des Servers sind laufende Lobbys weg.
