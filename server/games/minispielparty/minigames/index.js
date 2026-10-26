// Alle Minispiele der Minispiel Party. Ein neues Minispiel ist eine neue Datei in diesem Ordner plus ein Eintrag hier.

const list = [
  require('./schnellzieher'),
  require('./seilhuepfer'),
  require('./farbfolge'),
  require('./zaehlfieber'),
  require('./ballonpumpe'),
  require('./kartoffel'),
  require('./stoppuhr'),
  require('./glueckstuer'),
  require('./phantombild'),
];

const byId = Object.fromEntries(list.map((m) => [m.id, m]));

module.exports = { list, byId };
