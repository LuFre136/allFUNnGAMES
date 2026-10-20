// Hilfsfunktionen für Textvergleich, IDs und Zufall

const crypto = require('crypto');

function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Lobby-Codes ohne leicht verwechselbare Zeichen (0/O, 1/I)
function randomCode(length = 5) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[crypto.randomInt(arr.length)];
}

// Vereinheitlicht Texte für Gruppierung und Vergleich
function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FILLER = new Set(['the', 'der', 'die', 'das', 'ein', 'eine', 'einen', 'a', 'an', 'feat', 'ft', 'featuring', 'and', 'und']);

function stripFiller(text) {
  return normalize(text).split(' ').filter((w) => w && !FILLER.has(w)).join(' ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Toleranter Vergleich: kleine Tippfehler sind erlaubt. Dient nur als Vorschlag,
// die endgültige Entscheidung trifft bei Freitext der Host.
function fuzzyMatch(input, accepted) {
  const given = stripFiller(input);
  if (!given) return false;
  return accepted.some((candidate) => {
    const target = stripFiller(candidate);
    if (!target) return false;
    if (given === target) return true;
    const allowed = target.length <= 4 ? 0 : target.length <= 8 ? 1 : 2;
    return levenshtein(given, target) <= allowed;
  });
}

module.exports = { randomToken, randomCode, shuffle, pick, normalize, fuzzyMatch };
