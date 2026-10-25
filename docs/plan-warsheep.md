# Kampfschafe (Warsheep)

Stand: umgesetzt (25.10.2026). Lukas hat den Namen „Kampfschafe“ gewählt (id `kampfschafe`, Präfix `ks-`, 🐑).

## Das Original

**Warsheep** (auch „Warsheep Online“) war ein Flash-Spiel von AOL, das ab 2004 im ICQ-Messenger (ICQ 5.1 und 6)
und im AOL Game Center mitgeliefert wurde. Quelle: [Cyclowiki „Warsheep Online“](https://cyclowiki.org/wiki/Warsheep_Online)
(der Artikel hat selbst keine Belege, deckt sich aber mit Erinnerungen an das Spiel).

- Zwei Spieler, je eine Armee aus **10 Schafen** in Kampfmontur, von oben gesehen (wie Worms, aber Draufsicht).
- Reihum ist **eine Einheit** dran, Spieler und Reihenfolge werden gelost. Ein Zug dauert **10 Sekunden**:
  8 Sekunden fahren, danach nur noch drehen und schießen. Wer vorher schießt, beendet den Zug.
- Einheiten: **Funker** (10 LP, ruft einen Luftangriff aus 3 Flugzeugen mit je 2 Bomben, trifft auch eigene),
  4 **Bazookas** (20 LP, präzise), 3 **MGs** (40 LP, Feuerstoß aus 21 Schuss, Reichweite begrenzt, Gelände blockt),
  2 **Panzer** (50 LP, langsam). Auf der Karte „Lake District“ statt Bazookas 3 **Hubschrauber**, die über alles fliegen.
- Vier Karten: Green Fields, Desert Storm, White Hell, Lake District. Gelände, das man nicht befahren kann
  (manches hält Schüsse auf, manches nicht).
- **Medipacks** (3, auf Green Fields 4): einmal einsammeln heilt die ganze eigene Armee.
- Kein Unentschieden: Wer mit dem letzten Schuss auch die eigenen letzten Schafe erledigt, verliert.

## Bei uns

- Fernseher zeigt das Schlachtfeld, das Handy des Spielers am Zug hat einen **Stick zum Fahren**, man **tippt aufs
  Schlachtfeld zum Zielen** und drückt **„Feuer!“**. Am Fernseher (wenn der Host mitspielt) gehen Maus, Pfeiltasten/WASD
  und Leertaste. Die Fahrt läuft live über den Server auf allen Bildschirmen, der Schuss wird auf dem Server
  ausgerechnet und überall gleich abgespielt.
- Vor jedem Zug eine kurze Ansage („Gleich: Anna mit Panzer“). Auf einem geteilten Handy wartet der Zug auf
  „Los geht's, Anna!“, damit niemand beim Weitergeben Zeit verliert.
- 2 bis 4 Armeen, jede ein Spieler oder ein Team (im Team wird reihum gesteuert), 2–8 Spieler, wie bei Sumo Zoo.
  Ohne Fernseher geht es auch nur mit Handys, zu zweit reicht ein Handy.
- Karten frei nachgebaut: Grüne Wiesen, Wüstensturm, Weiße Hölle, Seenplatte (mit Hubschraubern), Zufall.
  Bäume, Felsen, Häuser, Iglus und Kakteen blocken Fahrt und Schüsse, Wasser nur die Fahrt.
- Über eigene Schafe wird hinweggeschossen (sonst trifft man am Anfang nur die eigene Aufstellung), Explosionen
  treffen aber alle in der Nähe.

## Einstellungen

| Einstellung | Standard | Auswahl |
| --- | --- | --- |
| Karte | Grüne Wiesen | 4 Karten oder Zufall |
| Armeegröße | automatisch: 10, bei 3–4 Armeen 6 | 6, 10 |
| Zeit pro Zug | 15 s (letztes Fünftel nur zielen) | 10 (wie im Original), 15, 20, 30 s |
| Gewinnsätze | 1 | 1, 2, 3 |
| Medipacks | an | an/aus |
| Einheit am Zug | gelost (wie im Original) | gelost, frei wählen |
| Fernseher | an | an/aus |

## Werte

Gerundet nach dem Original, Feinschliff nach den ersten Runden:

| Einheit | LP | Tempo | Waffe |
| --- | --- | --- | --- |
| Funker | 10 | 115 | Luftangriff überall hin, 6 Bomben je bis 20 Schaden, Funker selbst bleibt heil |
| Bazooka | 20 | 105 | Rakete, Reichweite 520, bis 25 Schaden |
| MG-Schaf | 40 | 95 | 21 Schuss je 1 Schaden, Reichweite 270, Streuung wächst |
| Panzer | 50 (Seenplatte 45) | 60 (75) | Granate, Reichweite 430, bis 50 (40) Schaden |
| Hubschrauber | 35 | 165 | 8 Raketen je bis 7 Schaden, Reichweite 380, sammelt keine Medipacks |

## Technik

- `server/games/kampfschafe/index.js` (Ablauf, Fahrt mit 30 Takten pro Sekunde), `combat.js` (Schüsse als Zeitleiste,
  rein und testbar), Karten und Geometrie in `public/js/kampfschafe-world.js` (Server und Browser).
- Fahrt und Zielen über `game:draw` (`op: 'input'` bzw. `'aim'`), Positionen live als `ks-pos` an alle Geräte.
  Schuss, Losfahren und Einheit wählen über `game:action` (`fire`, `go`, `select`, Host: `force`).
- Phasen: `ready` → `turn` → `firing` → …, `setEnd`, `final`. Sonderpreise: Scharfschaf, Eigenbeschuss, Sanitäter.
