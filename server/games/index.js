// Verzeichnis aller Spiele. Neue Spiele werden hier eingetragen.

const PubQuiz = require('./pubquiz');
const JustOne = require('./justone');
const StadtLandFluss = require('./stadtlandfluss');
const KreuzQuer = require('./kreuzquer');
const Karaoke = require('./karaoke');
const DrKroko = require('./drkroko');
const Musikzeitreise = require('./musikzeitreise');
const Wuerfelbecher = require('./wuerfelbecher');
const Alias = require('./alias');
const SagsAnders = require('./sagsanders');
const Montagsmaler = require('./montagsmaler');
const BluffQuiz = require('./bluffquiz');

const games = {
  pubquiz: PubQuiz,
  justone: JustOne,
  stadtlandfluss: StadtLandFluss,
  kreuzquer: KreuzQuer,
  karaoke: Karaoke,
  drkroko: DrKroko,
  musikzeitreise: Musikzeitreise,
  wuerfelbecher: Wuerfelbecher,
  alias: Alias,
  sagsanders: SagsAnders,
  montagsmaler: Montagsmaler,
  bluffquiz: BluffQuiz,
};

// Platzhalter für die Startseite, bis die Spiele gebaut sind
const comingSoon = [
  { id: 'werbinich', name: 'Wer bin ich?', icon: '🕵️', description: 'Errate die Figur auf deiner Stirn.', available: false },
];

function list() {
  return [...Object.values(games).map((G) => G.meta()), ...comingSoon];
}

module.exports = { games, list };
