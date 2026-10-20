// Verzeichnis aller Spiele. Neue Spiele werden hier eingetragen.

const PubQuiz = require('./pubquiz');
const JustOne = require('./justone');
const StadtLandFluss = require('./stadtlandfluss');
const KreuzQuer = require('./kreuzquer');
const Karaoke = require('./karaoke');

const games = {
  pubquiz: PubQuiz,
  justone: JustOne,
  stadtlandfluss: StadtLandFluss,
  kreuzquer: KreuzQuer,
  karaoke: Karaoke,
};

// Platzhalter für die Startseite, bis die Spiele gebaut sind
const comingSoon = [
  { id: 'werbinich', name: 'Wer bin ich?', icon: '🕵️', description: 'Errate die Figur auf deiner Stirn.', available: false },
  { id: 'activity', name: 'Zeichnen & Raten', icon: '🎨', description: 'Einer zeichnet, alle anderen raten.', available: false },
];

function list() {
  return [...Object.values(games).map((G) => G.meta()), ...comingSoon];
}

module.exports = { games, list };
