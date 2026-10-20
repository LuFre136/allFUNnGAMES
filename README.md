# all Fun n Games

Spieleplattform für Spieleabende: Spiel auswählen, Lobby erstellen, Freunde per Link oder QR-Code einladen. Als erstes Spiel gibt es ein **Pub Quiz** mit 50 Fragen.

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

## Online stellen (Render)

So läuft die Plattform dauerhaft im Internet und ist von jedem Handy aus erreichbar, ganz ohne Laptop.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/LuFre136/allFUNnGAMES)

1. Auf [render.com](https://render.com) ein kostenloses Konto anlegen (am einfachsten mit „Sign in with GitHub“).
2. Den Button oben klicken (oder im Dashboard **New → Blueprint** und dieses Repository wählen). Render liest die Einstellungen aus `render.yaml`.
3. Bei den Spotify-Feldern kann man die Zugangsdaten eintragen oder sie leer lassen.
4. **Apply** klicken. Nach ein paar Minuten gibt es eine Adresse wie `https://all-fun-n-games.onrender.com`. Diese Adresse auf dem Handy öffnen, fertig.

Neue Commits auf `main` werden automatisch veröffentlicht. Gut zu wissen beim kostenlosen Tarif: Nach etwa 15 Minuten ohne Besucher schläft der Server ein. Der erste Aufruf danach dauert rund eine Minute, und Lobbys aus der vorherigen Sitzung sind dann weg. Einfach die Seite kurz vor dem Spieleabend einmal öffnen.

## So läuft das Pub Quiz

**Host (Ersteller der Lobby)** stellt ein: Teams hinzufügen, umbenennen und löschen, Anzahl Fragen, Kategorien, Lobbyname, eigener Spielername, Zeitlimit und ob er mitspielt oder nur Gamemaster ist. Der Einladungslink lässt sich kopieren, teilen oder als QR-Code scannen.

**Spieler** wählen beim Beitreten Name, Profilbild und Team.

**In jeder Frage**
- Alle Teammitglieder stimmen ab: Antwort antippen oder eintippen. Die Stimme lässt sich bis zur Auflösung ändern.
- Das Profilbild jedes Mitglieds erscheint oben rechts an der gewählten Antwort (ab vier Stimmen drei Bilder und „+N“). Die Antwort mit den meisten Stimmen wird hervorgehoben.
- Bei Freitext sehen Teammitglieder die Vorschläge der anderen und können sie mit einem Tipp übernehmen.
- Haben alle abgestimmt, läuft ein 3-Sekunden-Countdown, dann wird aufgelöst. Ist das Zeitlimit abgelaufen, wird ebenfalls aufgelöst.
- Teamantwort = Antwort mit den meisten Stimmen. Bei Gleichstand wird zwischen den Spitzenreitern gelost.
- Der Host kann jederzeit zur Auflösung springen. Als reiner Gamemaster kann er sich die richtige Antwort vorab anzeigen lassen.

**Fragenformate und Punkte**

| Format | Bewertung | Punkte |
| --- | --- | --- |
| Multiple Choice (A–D) | automatisch | 1 |
| Offene Frage | Vorschlag automatisch, Host entscheidet | 1 |
| Schätzfrage | automatisch, innerhalb der Toleranz | 1 |
| Musik: Interpret & Titel | Vorschlag automatisch, Host entscheidet | je 1 für Interpret und Titel |
| Musik: Interpret & Jahr (±3) | automatisch, Host kann korrigieren | je 1 für Interpret und Jahr |
| Wer ist das? (Bild) | Vorschlag automatisch, Host entscheidet | 1 |

Der Host kann bei der Auflösung jede Bewertung mit ✓ oder ✗ ändern.

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
```

Bei Bildfragen lädt `wiki` das Hauptbild des englischen Wikipedia-Artikels. Alternativ ein eigenes Bild in `public/quiz-images/` legen und `"image": "/quiz-images/datei.jpg"` eintragen. Neue Kategorien oben in `categories` ergänzen.

## Aufbau

```
server/index.js              Webserver, Socket.IO-Ereignisse, QR-Codes
server/lobbies.js            Lobbys, Spieler, Teams, Einstellungen
server/games/index.js        Verzeichnis der Spiele (neue Spiele hier eintragen)
server/games/pubquiz/        Pub-Quiz-Logik und Fragen
server/spotify.js            Optionale Spotify-Suche
public/                      Startseite, Lobby-/Spielseite, Styles, Profilbilder
```

Lobbys liegen im Arbeitsspeicher. Nach einem Neustart des Servers sind laufende Lobbys weg.
