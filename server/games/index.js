// Verzeichnis aller Spiele. Neue Spiele werden hier eingetragen.

const PubQuiz = require('./pubquiz');
const JustOne = require('./justone');
const StadtLandFluss = require('./stadtlandfluss');
const KreuzQuer = require('./kreuzquer');
const DrKroko = require('./drkroko');
const Musikzeitreise = require('./musikzeitreise');
const Wuerfelbecher = require('./wuerfelbecher');
const Alias = require('./alias');
const Montagsmaler = require('./montagsmaler');

const games = {
  pubquiz: PubQuiz,
  justone: JustOne,
  stadtlandfluss: StadtLandFluss,
  kreuzquer: KreuzQuer,
  drkroko: DrKroko,
  musikzeitreise: Musikzeitreise,
  wuerfelbecher: Wuerfelbecher,
  alias: Alias,
  montagsmaler: Montagsmaler,
};

// Platzhalter für die Startseite, bis die Spiele gebaut sind
const comingSoon = [
  { id: 'werbinich', name: 'Wer bin ich?', icon: '🕵️', description: 'Errate die Figur auf deiner Stirn.', available: false },
];

function list() {
  return [...Object.values(games).map((G) => G.meta()), ...comingSoon];
}

module.exports = { games, list };
