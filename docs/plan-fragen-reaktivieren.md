# Plan: Ausgeschlossene Fragen wieder aktivieren

Stand: nur geplant, noch nicht umgesetzt.

## Heute schon möglich (von Hand)

Ausgeschlossene Fragen stehen in `excluded-questions.json` auf dem Branch `quiz-daten` im Repository
(lokal ohne GitHub in `data/excluded-questions.json`). Eintrag löschen und speichern: Der Server lädt
die Liste alle 10 Minuten und beim Start neu, danach ist die Frage wieder im Spiel.

## Geplante Oberfläche

1. **Ort:** neuer Bereich „Ausgeschlossene Fragen“ auf der Startseite unter den Spielen, erreichbar über
   einen Link „Fragen verwalten“.
2. **Schutz:** Zugang mit einer PIN aus der Umgebungsvariable `ADMIN_PIN`, damit nicht jeder Mitspieler
   Fragen zurückholen kann. Ohne gesetzte PIN bleibt der Bereich ausgeblendet.
3. **Liste:** jede ausgeschlossene Frage mit Text, Format, Kategorie, Lösung und Datum des Ausschlusses,
   neueste zuerst, mit Filter nach Format.
4. **Aktion:** Button „Wieder aktivieren“ pro Frage (und „Alle aktivieren“). Der Server entfernt den
   Eintrag und speichert die Liste wie beim Ausschließen lokal und auf dem Branch `quiz-daten`.
5. **Technik:** zwei neue Endpunkte, `GET /api/admin/excluded` und `POST /api/admin/excluded/:id/restore`,
   beide prüfen die PIN. `server/exclusions.js` bekommt dafür eine Funktion `remove(id)`.
6. **Laufende Spiele:** reaktivierte Fragen erscheinen erst in neu gestarteten Partien.

## Offene Fragen

- Soll auch der Host einer Lobby Fragen reaktivieren dürfen, oder nur wer die PIN kennt?
- Soll man sehen, in welcher Lobby und von welchen Spielern eine Frage ausgeschlossen wurde?
