// Gemeinsame Helfer für die Minispiele der Minispiel Party

const crypto = require('crypto');

// Zufallszahl zwischen min und max (beide inklusive bei ganzen Zahlen)
function randInt(min, max) {
  return min + crypto.randomInt(max - min + 1);
}

function rand(min, max) {
  return min + (crypto.randomInt(1_000_000) / 1_000_000) * (max - min);
}

// Sortierte Einträge [{ id, ... }] zu Platzgruppen zusammenfassen: Gleiches `key` heißt gleicher Platz.
// Ergebnis: [{ ids, label }] vom besten zum schlechtesten Platz.
function groupsOf(sorted, key, label) {
  const groups = [];
  for (const e of sorted) {
    const k = key(e);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.ids.push(e.id);
    else groups.push({ key: k, ids: [e.id], label: label(e) });
  }
  return groups.map(({ ids, label: l }) => ({ ids, label: l }));
}

// Wer kein Ergebnis hat (z. B. weg oder nichts abgegeben), landet gemeinsam hinten und bekommt keine Punkte
function withMissing(groups, ids, label = 'kein Ergebnis') {
  const seen = new Set(groups.flatMap((g) => g.ids));
  const missing = ids.filter((id) => !seen.has(id));
  return missing.length ? [...groups, { ids: missing, label, none: true }] : groups;
}

function seconds(ms, digits = 2) {
  return `${(ms / 1000).toFixed(digits).replace('.', ',')} s`;
}

module.exports = { randInt, rand, groupsOf, withMissing, seconds };
