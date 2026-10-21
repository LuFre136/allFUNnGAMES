# Plan: Memekönig (nach „What Do You Meme?“)

Stand: umgesetzt (Pull Request auf GitHub). Arbeitsname „Memekönig“ (id `memekoenig`, CSS-Präfix `mk-`), weil
„What Do You Meme?“ ein Markenname ist.

## Spielidee

Auf dem Fernseher erscheint ein Bild. Jeder Spieler hat sieben Bildunterschrift-Karten auf dem Handy und legt die,
die am lustigsten zum Bild passt. Dann werden alle gelegten Karten ohne Namen gezeigt, und die lustigste gewinnt die
Runde. Nach der eingestellten Rundenzahl ist Memekönig, wer die meisten Runden gewonnen hat.

## Bilder (ohne geschützte Memes)

Echte Meme-Vorlagen (Distracted Boyfriend, Drake usw.) sind fremde Fotos und werden nicht eingebettet. Stattdessen:

- **Wikipedia-Bilder wie beim Pub Quiz:** `server/games/memekoenig/images.json` listet Wikipedia-Artikel, deren
  Hauptbild von sich aus komisch wirkt: Tiere mit Gesichtsausdruck (Quokka, Nasenaffe, Schuhschnabel, Manul …) und
  gemeinfreie Gemälde (American Gothic, Der Schrei, Saturn verschlingt seinen Sohn …). Der Server holt das Bild über
  `server/images.js` und liefert es unter `/api/meme-image/<id>` aus. Diese Bilder stehen auf Wikimedia Commons unter
  freien Lizenzen oder sind gemeinfrei; unter dem Bild steht als Quellenangabe „Bild: Wikipedia · Artikel“.
- **Eigene Bilder:** Alles, was in `public/meme-images/` liegt (jpg, png, gif, webp), kommt zusätzlich in den Stapel.
  So können eigene Fotos von Freunden oder selbst gemachte Bilder mitspielen. Der Host kann in den Einstellungen
  wählen: Wikipedia-Bilder, eigene Bilder oder beide.
- **Kein Bild geladen** (z. B. offline): Statt des Bildes steht eine kurze Beschreibung auf einer Karte
  („Ein Quokka grinst in die Kamera“), damit die Runde trotzdem funktioniert. Der Host kann jederzeit
  „Anderes Bild“ drücken.

## Bildunterschriften

Eigene deutsche Karten in `server/games/memekoenig/captions.json` (280 Stück), im typischen Meme-Ton:
„Wenn der Chef fragt, wer den letzten Kaffee getrunken hat“, „Ich, nachdem ich einmal joggen war“ usw. Die Texte
des Originalspiels werden nicht übernommen.

- Jeder bekommt 7 Karten, nach dem Legen wird eine neue nachgezogen. Der Stapel wird gemischt und nie doppelt verteilt,
  bis er leer ist.
- **Joker-Karten** (Einstellung 0–3, Standard 1): leere Karten, auf die man selbst einen Text schreibt (höchstens
  100 Zeichen). Ein benutzter Joker ist weg.
- **Hand tauschen:** einmal pro Partie darf jeder seine ganze Hand gegen sieben neue Karten tauschen.

## Einstellungen des Hosts

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Runden | 10 | 5–20 |
| Wer entscheidet | Juror | Juror (reihum, wie im Original) oder alle stimmen ab |
| Zeit zum Legen | 60 s | kein Limit, 30–120 s |
| Joker-Karten | 1 | 0–3 |
| Bilder | beide | Wikipedia, eigene, beide |

## Ablauf einer Runde

1. **Legen:** Bild groß auf dem Fernseher, auf dem Handy das Bild klein plus die Hand. Im Juror-Modus legt der Juror
   nicht und sieht „Du bist Juror“. Gelegte Karten lassen sich ändern, bis alle fertig sind. Der Fernseher zeigt nur,
   wer schon gelegt hat. Läuft die Zeit ab, spielen nur die mit, die gelegt haben.
2. **Auswählen:** Alle Karten gemischt und ohne Namen auf dem Fernseher. Der Juror tippt auf dem Handy seine
   Lieblingskarte; im Abstimmungsmodus stimmt jeder für eine fremde Karte. Ist der Juror weg, entscheidet der Host.
3. **Auflösung:** Die Gewinnerkarte groß unter dem Bild, alle Karten mit Namen. Juror-Modus: 1 Punkt für den Gewinner.
   Abstimmung: 1 Punkt pro Stimme.
4. **Nächste Runde:** Der Juror wechselt reihum.

Am Ende: Rangliste mit Siegerkrone und die Gewinnerkarte jeder Runde mit ihrem Bild.

## Spieleranzahl

3–12 Spieler (`meta().minPlayers`/`maxPlayers`), keine Teams, kein geteiltes Gerät (jeder braucht seine geheime Hand).

## Später denkbar

- Fotos direkt vom Handy hochladen und als Runde spielen (bräuchte Speicherung der Bilder auf dem Server).
- Eigene Karten des Hosts dauerhaft speichern.
