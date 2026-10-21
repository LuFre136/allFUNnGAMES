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
| `GITHUB_TOKEN`, `GITHUB_REPO` | Speichert ausgeschlossene Fragen und die Bestenlisten von Würfelbecher und Würfelfuchs dauerhaft im Repository (siehe unten) |
| `YOUTUBE_API_KEY` | Songsuche direkt in der App beim Karaoke (siehe unten) |

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

Der Song läuft auf dem Gerät des Hosts über den eingebetteten Spotify-Player. Der Player ist bis zur Auflösung verdeckt, Titel und Cover sind also nicht zu sehen (wie bei der Musikzeitreise). Die Spieler sehen nur „Song läuft“.

- Ist man im Browser des Hosts bei Spotify angemeldet, läuft der ganze Song, sonst eine 30-Sekunden-Vorschau.
- Die Songs sind mit Spotify-Track-IDs hinterlegt. Mit eigenen Zugangsdaten sucht der Server die Songs beim Start zusätzlich über die Spotify-API und nimmt die gefundenen IDs. Dieselben Zugangsdaten schalten beim Karaoke die Spotify-Suche frei. Dafür auf [developer.spotify.com](https://developer.spotify.com/dashboard) eine App anlegen (siehe unten) und starten mit:

```bash
SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... npm start
```

So kommt man an die Zugangsdaten:

1. Auf [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) mit dem Spotify-Konto anmelden und die Nutzungsbedingungen bestätigen.
2. **Create app**: Name und Beschreibung frei wählen, als Redirect URI die eigene Adresse eintragen (z. B. `https://all-fun-n-games.onrender.com/callback`, sie wird nicht benutzt), bei den APIs **Web API** ankreuzen, speichern.
3. In der App **Settings** öffnen: Dort steht die **Client ID**, das **Client secret** zeigt „View client secret“.
4. In Render den Dienst öffnen, **Environment** → die Werte bei `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` eintragen und speichern. Render startet den Dienst danach neu.

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

## So läuft Karaoke

Das Host-Gerät ist die Bühne: am besten an den Fernseher anschließen oder auf den Beamer streamen. Gesungen wird zu Karaoke-Videos von YouTube, der Liedtext kommt also aus dem Video. Alle tragen auf dem Handy Songs in die Warteschlange ein (Interpret und Titel, dazu der YouTube-Link, optional mit Duettpartner). Ohne Link sucht der Host das Video, wenn der Song dran ist. Der Host kann auch Songs für Gäste ohne Handy eintragen, Songs vorziehen, entfernen oder sofort starten.

Bei „Reihum“ kommt immer zuerst dran, wer am wenigsten gesungen hat. Während des Songs schicken die anderen Applaus-Emojis, die über das Video fliegen. Ist das Video zu Ende (oder tippen Sänger oder Host auf „Fertig“), vergeben alle außer den Sängern 1 bis 5 Sterne. Mit „Abschluss“ zeigt der Host die Rangliste nach Durchschnittsbewertung. Die Bewertung lässt sich in den Einstellungen abschalten.

Manche Videos dürfen nicht eingebettet werden. Dann zeigt die Bühne einen Hinweis, und der Host öffnet das Video auf YouTube oder fügt einen anderen Link ein.

**Spotify statt YouTube:** Beim Eintragen wählt man „🎧 Spotify“. Gespielt wird über den Spotify-Player auf dem Host-Gerät, den Text liefert die freie Datenbank [LRCLIB](https://lrclib.net), denn Spotify gibt keine Songtexte heraus. Mit Zeitstempeln läuft der Text zeilenweise mit, die aktuelle Zeile groß und gelb. Passt der Takt nicht (z. B. bei Karaoke-Versionen mit anderem Intro), verschiebt der Host den Text in halben Sekunden. Gibt es nur Text ohne Zeitstempel, scrollt er gleichmäßig über die Länge des Songs. In der Warteschlange steht, ob ein Text gefunden wurde. Für ganze Songs muss der Host-Browser bei open.spotify.com angemeldet sein, sonst spielt Spotify 30 Sekunden. Mit `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` (siehe [Musik über Spotify](#musik-über-spotify)) gibt es die Suche in der App, Original und Karaoke-Versionen gleichrangig gemischt. Ohne sie fügt man den Spotify-Link ein.

Ohne Schlüssel öffnet „Auf YouTube suchen“ die YouTube-Suche, den Link kopiert man von dort. Mit `YOUTUBE_API_KEY` gibt es die Suche direkt in der App. Den Schlüssel gibt es kostenlos in der [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com): Projekt anlegen, „YouTube Data API v3“ aktivieren, unter „Anmeldedaten“ einen API-Schlüssel erstellen und in Render unter Environment eintragen. Das kostenlose Kontingent reicht für rund 100 Suchen am Tag.

## So läuft Dr Kroko

Geschicklichkeitsspiel für 2 bis 20 Mitspieler, ohne Teams. Auf allen Geräten ist dasselbe Krokodil mit offenem Maul zu sehen (Standard 13 Zähne, einstellbar von 5 bis 24). Reihum drückt jeder auf dem Handy einen Zahn. Einer davon ist zufällig der wunde Zahn: Wer ihn erwischt, wird gebissen, das Maul schnappt zu und das Handy vibriert. Die nächste Runde beginnt, wer nach dem Gebissenen an der Reihe ist.

- **Feste Runden:** Nach der eingestellten Rundenzahl gewinnt, wer am wenigsten gebissen wurde.
- **K.-o.:** Wer gebissen wird, scheidet aus. Wer übrig bleibt, gewinnt.
- **Reihenfolge:** Der Host lässt sie beim Start auslosen oder legt sie in der Lobby selbst fest, indem er die Spieler am Griff ⠿ in die gewünschte Reihenfolge zieht (klappt auch auf dem Handy). „Mischen“ lost eine Reihenfolge aus, die sich danach noch anpassen lässt.
- **Mehrere Spieler an einem Gerät:** In der Lobby kann jedes Gerät unter „Mitspieler an diesem Gerät“ weitere Namen eintragen. Diese Spieler bekommen einen eigenen Platz in der Reihenfolge und drücken auf dem Gerät, an dem sie eingetragen sind. Sind sie dran, steht ihr Name oben.
- Optional gibt es ein Zeitlimit pro Zug. Läuft es ab, wird ein zufälliger Zahn gedrückt. Der Host kann außerdem für den Spieler am Zug drücken oder ihn überspringen.

## So läuft Musikzeitreise

Musik-Zeitleistenspiel für 1–12 Spieler, jeder für sich oder in Teams (ein Team teilt sich eine Zeitleiste). Jeder startet mit einer offenen Karte. Reihum läuft auf dem Gerät des Hosts ein Song, verdeckt wie bei den Musikfragen im Pub Quiz. Wer dran ist, tippt auf die Stelle seiner Zeitleiste, an die das Erscheinungsjahr passt; gleiche Jahre gelten an beiden Seiten als richtig. Stimmt die Stelle, bleibt die Karte liegen, sonst fliegt sie raus. Wer zuerst die eingestellte Zahl an Karten hat (Standard 10), gewinnt.

Mit Chips (an- und abschaltbar) startet jeder mit 2 Chips, höchstens 5. Wer zusätzlich Interpret und Titel richtig eintippt, bekommt einen Chip (Vorschlag automatisch, der Host kann korrigieren). Ein Chip tauscht den eigenen Song oder setzt bei einem anderen Spieler auf eine andere Stelle; liegt der falsch und der Einspruch richtig, bekommt der Einspruch die Karte. Für 3 Chips gibt es die Karte ohne Raten. Der Host kann einen Song tauschen, der nicht abspielt, und einen Zug überspringen.

Die Songs stehen in `server/games/musikzeitreise/songs.json` (Interpret, Titel, Jahr der Veröffentlichung, optional `spotifyId`). Gespielt werden nur Songs mit Spotify-ID. Sind die Spotify-Zugangsdaten gesetzt (siehe „Musik über Spotify“), sucht der Server beim Start alle Songs selbst und alle werden abspielbar. Die Regeln prüft `npm test`.

## So läuft Würfelbecher

Würfelspiel nach Kniffel für 1 bis 10 Mitspieler, ohne Teams. Reihum würfelt jeder bis zu dreimal mit fünf Würfeln; zwischen den Würfen tippt man die Würfel an, die liegen bleiben sollen. Danach wird das Ergebnis in ein freies Feld des Wertungsblocks eingetragen, notfalls mit 0 Punkten (streichen). Oben (Einser bis Sechser) zählen nur die passenden Augen, ab 63 Punkten oben gibt es 35 Bonus. Unten: Dreier- und Viererpasch zählen alle Augen, Full House 25, kleine Straße 30, große Straße 40, Kniffel 50, Chance alle Augen. Nach 13 Runden sind alle Blöcke voll.

- Der Block mit allen Spielern ist auf jedem Gerät zu sehen, auf dem Fernseher also wie ein gemeinsamer Wertungsblock. Mit „Hilfen“ stehen beim Spieler am Zug die möglichen Punkte grau in den freien Feldern.
- **Reihenfolge:** Der Host lässt sie beim Start auslosen oder legt sie in der Lobby fest, indem er die Spieler am Griff ⠿ verschiebt. Jede weitere Partie beginnt der Nächste in der Reihe.
- **Mehrere Spieler an einem Gerät:** In der Lobby kann jedes Gerät unter „Mitspieler an diesem Gerät“ weitere Namen eintragen. Sie bekommen eine eigene Spalte im Block und würfeln an dem Gerät, an dem sie eingetragen sind.
- Optional gibt es ein Zeitlimit pro Zug. Läuft es ab, wird (falls nötig) gewürfelt und das Feld mit den meisten Punkten eingetragen. Das kann der Host auch per Knopf auslösen oder den Spieler überspringen, der dann in der nächsten Runde wieder dran ist.
- Ohne Extra-Kniffel-Bonus und ohne Joker-Regel; ein zweiter Kniffel zählt einfach in einem passenden Feld.
- **Bestenliste:** Nach jeder Partie kommen volle Blöcke unter die zehn besten aller Zeiten, wenn sie gut genug sind. Am Ende einer Partie blendet der Host sie mit „🏆 Bestenliste“ für alle ein: Rangliste plus die zehn Blöcke nebeneinander, neue Einträge sind markiert. Gespeichert wird sie in `data/wuerfelbecher-highscores.json` und, wie die ausgeschlossenen Quizfragen, mit `GITHUB_TOKEN` zusätzlich auf dem Daten-Branch (sonst ist sie bei Render nach einem Neustart weg). Zum Zurücksetzen die Datei löschen bzw. leeren.

## So läuft Würfelfuchs

Würfelspiel nach „Ganz schön clever“ für 1 bis 6 Mitspieler, ohne Teams. Es gibt sechs Würfel (Weiß, Gelb, Blau, Grün, Orange, Lila) und auf jedem Handy ein Blatt mit fünf Farbfeldern. Wer am Zug ist, würfelt bis zu dreimal und nimmt nach jedem Wurf einen Würfel für das Feld seiner Farbe; Weiß ist ein Joker für jede Farbe. Alle Würfel, die kleiner sind als der genommene, wandern aufs Tablett. Danach nehmen sich alle anderen gleichzeitig einen Würfel vom Tablett. Gelb: passende Zahl im Raster ankreuzen, volle Spalten bringen 10/14/16/20 Punkte. Blau: Summe aus Blau und Weiß ankreuzen, Punkte nach Anzahl der Kreuze. Grün: von links nach rechts, mindestens die angegebene Zahl. Orange: Wert eintragen, manche Kästchen zählen doppelt oder dreifach. Lila: jeder Wert größer als der vorige, nach einer 6 geht alles. Gespielt wird je nach Spielerzahl 6, 5 oder 4 Runden.

- **Bonusse:** Volle Reihen und Spalten in Gelb und Blau sowie bestimmte Kästchen in Grün, Orange und Lila lösen Bonusse aus: Kreuze in anderen Farben (auch als Kettenreaktion), Neuwürfe, +1 (am Ende eines Zuges einen der sechs Würfel zusätzlich nutzen) und Füchse (jeder Fuchs zählt am Ende so viel wie das schwächste Farbfeld). Die Runden 1 bis 4 bringen allen einen Neuwurf, ein +1, einen Neuwurf und ein Kreuz nach Wahl.
- **Bedienung:** Würfel antippen, dann leuchten die Felder, in die er passt; ein Tipp auf das Feld trägt ein. In der Tablett-Phase lässt sich alles mit „Rückgängig“ zurücknehmen, bis man auf „Fertig“ tippt. Mit „Hilfen“ sind Würfel, die nirgends passen, ausgegraut.
- **Fernseher:** Würfel mit Tablett, Rundenleiste, die letzten Züge und alle Blätter nebeneinander.
- **Allein:** Nach dem eigenen Zug würfelt das Spiel alle sechs Würfel für einen gedachten Mitspieler, die drei kleinsten kommen aufs Tablett.
- Optional gibt es eine Bedenkzeit pro Schritt. Läuft sie ab, nimmt das Spiel für den Spieler am Zug jeweils den Würfel mit den meisten Punkten, in der Tablett-Phase verzichtet, wer nicht fertig ist. Der Host kann das auch per Knopf auslösen oder den Spieler am Zug überspringen.
- Aufbau des Blatts (Zahlen, Bonusse, Punkte) steht in `server/games/wuerfelfuchs/sheet.json`.
- **Bestenliste:** wie bei Würfelbecher, gespeichert in `data/wuerfelfuchs-highscores.json` (mit `GITHUB_TOKEN` zusätzlich auf dem Daten-Branch).

## So läuft Alias

Teamspiel nach Codenames für 4 bis 20 Spieler in genau zwei Teams. Auf dem Fernseher liegen 25 Wortkarten. Pro Team ist ein Spieler Hinweisgeber und sieht auf seinem Handy die geheime Karte: 9 Karten für das Startteam, 8 für das andere, 7 neutrale Passanten und 1 Attentäter. Er gibt seinem Team ein Wort und eine Zahl; Wörter, die noch auf dem Tisch liegen, und ihre Wortfamilie lehnt das Spiel ab. Die Ermittler tippen auf dem Handy Karten an, ihre Profilbilder erscheinen auf den Karten. Aufgedeckt wird, sobald die Mehrheit des Teams dieselbe Karte gewählt hat (oder per Einstellung beim ersten Tipp). Pro Hinweis gibt es Zahl + 1 Versuche, bei 0 und ∞ beliebig viele. Ein Passant oder eine gegnerische Karte beendet den Zug, der Attentäter verliert sofort. Wer zuerst alle eigenen Karten gefunden hat, gewinnt die Partie.

- Der Host-Bildschirm ist der Fernseher und zeigt nie die geheime Karte. Spielt der Host mit, ist er deshalb immer Ermittler.
- Der Host stellt ein, wie viele Partien zum Sieg nötig sind, wer Hinweisgeber ist (reihum, zufällig oder fest), wann aufgedeckt wird und optionale Zeitlimits. Das Startteam wechselt mit jeder Partie.
- Während des Spiels kann der Host eine Karte direkt aufdecken (Karte antippen), den Zug beenden, einen Hinweis zurückweisen und Hinweisgeber neu vergeben.

Die Wörter stehen in `server/games/alias/words.json`. Die Regeln prüft `npm test`.

## So läuft Sag's anders!

Erklärspiel nach Tabu für 4 bis 20 Spieler in mindestens zwei Teams. Die Teams sind abwechselnd dran, in jedem Team erklärt reihum ein anderer Spieler. Er sieht auf seinem Handy einen Begriff und fünf verbotene Wörter und erklärt ihn, ohne diese Wörter, den Begriff selbst oder Teile davon zu sagen. Sein Team rät laut im Raum. Die Spieler der anderen Teams sehen dieselbe Karte und drücken „Buzz!“, wenn etwas Verbotenes fällt. Pro Zug läuft eine Sanduhr (Standard 60 Sekunden).

- Der Erklärer wertet mit „Richtig“ (+1) und „Überspringen“ und kann die letzte Wertung zurücknehmen. Ein Buzz kostet einen Punkt, nur der erste Buzz pro Karte zählt. Der Punktestand eines Teams fällt nie unter 0.
- Der Host-Bildschirm ist der Fernseher und zeigt die Karte nie, nur Team, Erklärer, Sanduhr und Zwischenstand. Spielt der Host mit, rät er mit seinem Team.
- Nach jedem Zug zeigt der Fernseher alle Karten mit Ergebnis. Der Host kann jedes Ergebnis ändern, z. B. einen Begriff zählen lassen, der genau beim Gong gerufen wurde.
- Einstellbar: Zeit pro Zug, Spielende nach Runden (jeder erklärt so oft) oder bei Zielpunktzahl, Überspringen (Anzahl und Strafe), Strafe für Buzz, 3 bis 5 verbotene Wörter, Schwierigkeit, Kategorien und Reihenfolge. Der Host kann pausieren, den Zug beenden und den Erklärer vor dem Zug wechseln. Verliert der Erklärer die Verbindung, hält die Sanduhr an.
- Töne für Buzz, Treffer und Gong kommen aus dem Browser (Web Audio), es braucht keine Dateien.

Die 300 Karten in 8 Kategorien stehen in `server/games/sagsanders/cards.json`. Die Regeln und den Kartenstapel prüft `npm test`.

## So läuft Montagsmaler

Für 2 bis 20 Spieler, einzeln oder in Teams. Reihum zeichnet einer einen geheimen Begriff auf seinem Handy (oder als Host auf dem Tablet), er sucht sich dafür einen von bis zu drei Vorschlägen aus. Die Striche erscheinen live auf dem Fernseher und allen Handys, die anderen tippen ihre Tipps ein, so oft sie wollen. Falsche Tipps sieht jeder, richtige nur als „hat es!“. Wer einen Buchstaben danebenliegt, sieht für sich „knapp daneben“. Nach der Hälfte und nach drei Vierteln der Zeit wird je ein Buchstabe aufgedeckt.

- Punkte: 10, 8, 7, 6, 5, danach 4 für die Ratenden in der Reihenfolge, in der sie es erraten, plus bis zu 5 Zeitpunkte. Der Zeichner bekommt 3 Punkte pro richtigem Tipp, höchstens 15.
- Team-Modus: Nur das eigene Team rät (10 Punkte plus Zeitpunkte). Schafft es den Begriff nicht, darf jedes andere Team einmal tippen und 5 Punkte klauen.
- Werkzeuge: 12 Farben, drei Stiftstärken, Füll-Eimer, Radierer, Rückgängig und Alles löschen.
- Der Host stellt Durchgänge, Zeit, Schwierigkeit, Anzahl der Vorschläge, Hinweise, eigene Begriffe und die Reihenfolge ein. Spielt er nur als Gamemaster, zeigt sein Bildschirm den Begriff erst bei der Auflösung.
- Am Ende gibt es eine Galerie aller Zeichnungen der Partie.

Die Begriffe stehen in `server/games/montagsmaler/words.json` (leicht, mittel, schwer; Synonyme nach `|`).

## So läuft das Bluff-Quiz

Für 3 bis 12 Spieler, einzeln oder in Teams (wie Fibbage). Auf dem Fernseher steht eine Frage mit Lücke, deren echte Antwort kaum jemand kennt. Jeder erfindet auf dem Handy eine glaubwürdige falsche Antwort; ist sie zu nah an der Wahrheit, lehnt das Spiel sie ab. Danach stehen alle Lügen und die echte Antwort gemischt zur Auswahl, die eigene Lüge ist gesperrt. Bei der Auflösung zeigt der Fernseher Lüge für Lüge, wer darauf hereingefallen ist und von wem sie stammt, zum Schluss die Wahrheit.

- Punkte: 1000 für die echte Antwort, 500 für jeden, der auf die eigene Lüge hereinfällt, 100 für jedes 👍. Während der Auflösung kann jeder fremde Lügen liken.
- „Mir fällt nichts ein“ schlägt eine Lüge vor; damit gibt es fürs Reinlegen nur halbe Punkte. Wer bis zum Ende der Zeit nichts abschickt, bekommt automatisch einen Vorschlag.
- Einstellungen: Anzahl Fragen, Kategorien, Zeit zum Schreiben und Wählen, letzte Frage doppelt, Team-Modus (eine Lüge pro Team, gewählt wird per Mehrheit).
- Am Ende gibt es Sonderpreise für den besten Lügner, den Wahrheitsfinder und den Publikumsliebling sowie die beliebteste Lüge der Partie.
- Fragen lassen sich wie im Pub Quiz einstimmig dauerhaft ausschließen. In derselben Lobby kommt keine Frage doppelt, solange es neue gibt.

Die Fragen stehen in `server/games/bluffquiz/questions.json`. Die Regeln prüft `npm test`.

## Aufbau

```
server/index.js              Webserver, Socket.IO-Ereignisse, QR-Codes
server/lobbies.js            Lobbys, Spieler, Teams, Einstellungen
server/games/index.js        Verzeichnis der Spiele (neue Spiele hier eintragen)
server/games/pubquiz/        Pub-Quiz-Logik und Fragen
server/games/stadtlandfluss/ Stadt, Land, Fluss
server/games/justone/        Just One
server/games/kreuzquer/      Kreuz & Quer (Würfelspiel)
server/games/karaoke/        Karaoke (Warteschlange, Bewertung, YouTube- und Spotify-Suche, Songtexte)
server/games/musikzeitreise/ Musikzeitreise (Songs und Zeitleisten)
server/games/wuerfelbecher/  Würfelbecher (nach Kniffel)
server/games/wuerfelfuchs/   Würfelfuchs (nach Ganz schön clever)
server/games/alias/          Alias (nach Codenames)
server/games/sagsanders/     Sag's anders! (nach Tabu)
server/games/montagsmaler/   Montagsmaler (Zeichnen und Raten)
server/games/bluffquiz/      Bluff-Quiz (nach Fibbage)
test/                        Regeltests (npm test)
server/spotify.js            Optionale Spotify-Suche
public/                      Startseite, Lobby-/Spielseite, Styles, Profilbilder
```

Lobbys liegen im Arbeitsspeicher. Nach einem Neustart des Servers sind laufende Lobbys weg.
