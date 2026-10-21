// Würfelfuchs (nach „Ganz schön clever“): Der aktive Spieler wählt bis zu drei Würfel, kleinere landen auf dem
// Tablett, von dem sich danach alle anderen gleichzeitig einen nehmen. Bonusse lösen weitere Kreuze aus.

const crypto = require('crypto');
const { shuffle, randomToken } = require('../../util');
const { createBoard } = require('../../highscores');
const LAYOUT = require('./sheet.json');

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 6;
const ROLLS = 3;
const ROW = 11; // Kästchen in Grün, Orange und Lila
const TIME_LIMITS = [0, 30, 45, 60, 90, 120];
const HIGHSCORES = 10;
const AREAS = ['yellow', 'blue', 'green', 'orange', 'purple'];
const NAMES = { white: 'Weiß', yellow: 'Gelb', blue: 'Blau', green: 'Grün', orange: 'Orange', purple: 'Lila' };

function die() {
  return crypto.randomInt(1, 7);
}

function emptySheet() {
  return {
    // Gelb und Blau als 4er-Raster, Feld mit 0 ist vorgekreuzt (Gelb) bzw. das Summen-Symbol (Blau)
    yellow: LAYOUT.yellow.grid.map((row) => row.map((v) => v === 0)),
    blue: LAYOUT.blue.grid.map((row) => row.map((v) => v === 0)),
    green: 0,
    orange: [],
    purple: [],
    rerolls: 0,
    plusOnes: 0,
    foxes: 0,
    awarded: [], // schon ausgelöste Bonusse
    pending: [], // Bonusse, bei denen der Spieler noch ein Feld wählen muss
  };
}

function cloneSheet(s) {
  return JSON.parse(JSON.stringify(s));
}

// Freie Kästchen in einer Farbe, in die der Wert passt (bei Blau ist der Wert die Summe Blau + Weiß)
function cellsFor(sheet, color, value) {
  const grid = (c) => LAYOUT[c].grid.flatMap((row, r) => row.map((v, k) => ({ v, i: r * 4 + k, done: sheet[c][r][k] })));
  switch (color) {
    case 'yellow':
    case 'blue':
      return grid(color).filter((x) => !x.done && (value === null || x.v === value)).map((x) => x.i);
    case 'green':
      return sheet.green < ROW && (value === null || value >= LAYOUT.green.min[sheet.green]) ? [sheet.green] : [];
    case 'orange':
      return sheet.orange.length < ROW ? [sheet.orange.length] : [];
    case 'purple': {
      const list = sheet.purple;
      const last = list[list.length - 1];
      const ok = value === null || !list.length || last === 6 || value > last;
      return list.length < ROW && ok ? [list.length] : [];
    }
    default:
      return [];
  }
}

// Wohin ein Würfel passt: [{ color, cell }]
function dieTargets(sheet, dice, index) {
  const d = dice[index];
  if (!d || d.value === null) return [];
  const white = dice.find((x) => x.color === 'white').value;
  const blue = dice.find((x) => x.color === 'blue').value;
  const colors = d.color === 'white' ? AREAS : [d.color];
  const out = [];
  for (const color of colors) {
    const value = color === 'blue' ? white + blue : d.value;
    for (const cell of cellsFor(sheet, color, value)) out.push({ color, cell });
  }
  return out;
}

function mark(sheet, color, cell, value) {
  if (color === 'yellow' || color === 'blue') sheet[color][Math.floor(cell / 4)][cell % 4] = true;
  else if (color === 'green') sheet.green++;
  else sheet[color].push(value);
}

// Alle Bonusse, die das Blatt gerade freigeschaltet hat
function earned(sheet) {
  const out = [];
  const y = sheet.yellow;
  y.forEach((row, r) => { if (row.every(Boolean)) out.push([`y-r${r}`, LAYOUT.yellow.rowBonus[r]]); });
  if ([0, 1, 2, 3].every((i) => y[i][i])) out.push(['y-d', LAYOUT.yellow.diagonalBonus]);
  const b = sheet.blue;
  b.forEach((row, r) => { if (row.every(Boolean)) out.push([`b-r${r}`, LAYOUT.blue.rowBonus[r]]); });
  for (let c = 0; c < 4; c++) if (b.every((row) => row[c])) out.push([`b-c${c}`, LAYOUT.blue.columnBonus[c]]);
  for (let i = 0; i < sheet.green; i++) if (LAYOUT.green.bonus[i]) out.push([`g-${i}`, LAYOUT.green.bonus[i]]);
  for (const color of ['orange', 'purple']) {
    for (let i = 0; i < sheet[color].length; i++) if (LAYOUT[color].bonus[i]) out.push([`${color[0]}-${i}`, LAYOUT[color].bonus[i]]);
  }
  return out;
}

function bonusText(b) {
  switch (b.type) {
    case 'cross': return `Kreuz in ${NAMES[b.color]}`;
    case 'number': return `${b.value} in ${NAMES[b.color]}`;
    case 'reroll': return 'Neuwurf';
    case 'plusOne': return '+1';
    case 'fox': return 'Fuchs';
    case 'free': return 'Kreuz nach Wahl';
    default: return '';
  }
}

// Bonus gutschreiben. Feste Einträge werden sofort gemacht, Kreuze mit Auswahl warten auf den Spieler.
function applyBonus(sheet, b, log) {
  log?.push(bonusText(b));
  if (b.type === 'reroll') sheet.rerolls++;
  else if (b.type === 'plusOne') sheet.plusOnes++;
  else if (b.type === 'fox') sheet.foxes++;
  else if (b.type === 'number') {
    if (sheet[b.color].length < ROW) sheet[b.color].push(b.value);
  } else if (b.type === 'cross') {
    const cells = cellsFor(sheet, b.color, null);
    if (cells.length === 1 || b.color === 'green') {
      if (cells.length) mark(sheet, b.color, cells[0]);
    } else if (cells.length) sheet.pending.push({ type: 'cross', color: b.color });
  } else if (b.type === 'free') sheet.pending.push({ type: 'free' });
}

// Kettenreaktion: so lange Bonusse auslösen, bis nichts Neues mehr dazukommt
function settle(sheet, log) {
  for (;;) {
    const fresh = earned(sheet).filter(([key]) => !sheet.awarded.includes(key));
    if (!fresh.length) break;
    for (const [key, b] of fresh) {
      sheet.awarded.push(key);
      applyBonus(sheet, b, log);
    }
  }
  prune(sheet);
}

// Bonusse, für die kein Feld mehr frei ist, verfallen
function prune(sheet) {
  while (sheet.pending.length && !bonusTargets(sheet).length) sheet.pending.shift();
}

function enter(sheet, color, cell, value, log) {
  mark(sheet, color, cell, value);
  settle(sheet, log);
}

// Felder für den vordersten offenen Bonus. Ein freies Kreuz zählt in Orange und Lila als 6.
function bonusTargets(sheet) {
  const p = sheet.pending[0];
  if (!p) return [];
  const colors = p.type === 'free' ? AREAS : [p.color];
  return colors.flatMap((color) => cellsFor(sheet, color, ['orange', 'purple'].includes(color) ? 6 : null).map((cell) => ({ color, cell })));
}

function resolveBonus(sheet, color, cell, log) {
  if (!bonusTargets(sheet).some((t) => t.color === color && t.cell === cell)) return false;
  sheet.pending.shift();
  enter(sheet, color, cell, 6, log);
  return true;
}

// Offene Bonusse automatisch auf das erste passende Feld setzen (Zeit abgelaufen)
function autoResolve(sheet) {
  while (sheet.pending.length) {
    const [t] = bonusTargets(sheet);
    if (t) resolveBonus(sheet, t.color, t.cell);
    else sheet.pending.shift();
  }
}

function sheetScore(sheet) {
  const yellow = LAYOUT.yellow.columnPoints.reduce((a, pts, c) => a + (sheet.yellow.every((row) => row[c]) ? pts : 0), 0);
  const blue = LAYOUT.blue.points[sheet.blue.flat().filter(Boolean).length - 1];
  const green = LAYOUT.green.points[sheet.green];
  const orange = sheet.orange.reduce((a, v, i) => a + v * LAYOUT.orange.factor[i], 0);
  const purple = sheet.purple.reduce((a, v) => a + v, 0);
  const fox = sheet.foxes * Math.min(yellow, blue, green, orange, purple);
  return { yellow, blue, green, orange, purple, fox, total: yellow + blue + green + orange + purple + fox };
}

class Wuerfelfuchs {
  constructor(lobby) {
    this.lobby = lobby;
    this.order = [];
    this.gameNo = 0;
    this.totals = {};
    this.results = [];
    this.timer = null;
    this.deadline = null;
    this.rollSeq = 0;
  }

  static meta() {
    return {
      id: 'wuerfelfuchs',
      name: 'Würfelfuchs',
      icon: '🦊',
      description: 'Sechs Würfel, fünf Farben: Wer wählt am cleversten und löst die meisten Bonusse aus?',
      players: `${MIN_PLAYERS}–${MAX_PLAYERS} Spieler`,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
    };
  }

  static defaultSettings() {
    return { timeLimit: 0, starter: 'random', hints: true, games: 1 };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.timeLimit !== undefined) {
      const t = Number(patch.timeLimit);
      if (TIME_LIMITS.includes(t)) next.timeLimit = t;
    }
    if (patch.starter !== undefined) next.starter = patch.starter === 'host' ? 'host' : 'random';
    if (patch.hints !== undefined) next.hints = Boolean(patch.hints);
    if (patch.games !== undefined) {
      const n = Math.round(Number(patch.games));
      if (Number.isFinite(n)) next.games = Math.min(Math.max(n, 1), 5);
    }
    return next;
  }

  static availableCount() {
    return 0;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  players() {
    return this.lobby.activePlayers();
  }

  present() {
    return new Set(this.players().map((p) => p.id));
  }

  start() {
    const players = this.players();
    if (players.length < MIN_PLAYERS) throw new Error(`Würfelfuchs braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (players.length > MAX_PLAYERS) throw new Error(`Würfelfuchs geht mit höchstens ${MAX_PLAYERS} Mitspielern.`);
    let order = shuffle(players.map((p) => p.id));
    if (this.settings.starter === 'host' && order.includes(this.lobby.hostId)) {
      order = [this.lobby.hostId, ...order.filter((id) => id !== this.lobby.hostId)];
    }
    this.order = order;
    this.gameNo = 0;
    this.totals = {};
    this.results = [];
    this.startGame();
  }

  startGame() {
    this.gameNo++;
    this.sheets = new Map(this.order.map((id) => [id, emptySheet()]));
    this.maxRounds = LAYOUT.rounds[Math.min(this.order.length, MAX_PLAYERS)] || 4;
    this.round = 1;
    // Jede Partie beginnt der Nächste in der Reihe
    this.firstTurn = (this.gameNo - 1) % this.order.length;
    this.turn = this.firstTurn;
    this.log = [];
    this.giveRoundBonus();
    this.startTurn();
  }

  get solo() {
    return this.order.length === 1;
  }

  sheet(id) {
    if (!this.sheets.has(id)) this.sheets.set(id, emptySheet());
    return this.sheets.get(id);
  }

  giveRoundBonus() {
    const b = LAYOUT.roundBonus[this.round - 1];
    if (!b) return;
    for (const sheet of this.sheets.values()) {
      applyBonus(sheet, b);
      prune(sheet);
    }
    this.log.push({ playerId: null, text: `Runde ${this.round}: alle bekommen ${bonusText(b)}` });
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  startTimer(onTimeout) {
    this.clearTimer();
    const limit = this.settings.timeLimit;
    if (!limit) return;
    this.deadline = Date.now() + limit * 1000;
    this.timer = setTimeout(() => {
      this.timer = null;
      onTimeout();
      this.lobby.broadcast();
    }, limit * 1000);
  }

  startTurn() {
    this.activeId = this.order[this.turn];
    this.phase = 'active';
    this.rollNo = 0;
    this.await = 'roll';
    this.dice = LAYOUT.colors.map((color) => ({ color, value: null, where: 'free' }));
    this.picked = new Set();
    this.done = new Set();
    this.plusUsed = new Map();
    this.snapshots = new Map();
    this.log = this.log.slice(-1).filter((e) => e.playerId === null);
    // Wer nicht verbunden ist, verliert seinen Zug, solange jemand anderes da ist
    const present = this.present();
    if (!present.has(this.activeId) && [...present].some((id) => this.sheets.has(id))) return this.endTurn();
    this.startTimer(() => this.autoActive());
  }

  note(playerId, text) {
    this.log.push({ playerId, text });
    if (this.log.length > 12) this.log.shift();
  }

  // ---------- Aktiver Spieler ----------

  roll() {
    if (this.phase !== 'active' || this.await !== 'roll') return { error: 'Gerade wird nicht gewürfelt.' };
    if (this.sheet(this.activeId).pending.length) return { error: 'Setze zuerst deinen Bonus.' };
    for (const d of this.dice) if (d.where === 'free') d.value = die();
    this.rollNo++;
    this.rollSeq++;
    this.await = 'pick';
    this.startTimer(() => this.autoActive());
    return { ok: true };
  }

  reroll() {
    if (this.phase !== 'active' || this.await !== 'pick') return { error: 'Neuwurf geht nur direkt nach einem Wurf.' };
    const sheet = this.sheet(this.activeId);
    if (sheet.rerolls < 1) return { error: 'Du hast keinen Neuwurf.' };
    sheet.rerolls--;
    for (const d of this.dice) if (d.where === 'free') d.value = die();
    this.rollSeq++;
    this.note(this.activeId, 'nutzt einen Neuwurf');
    return { ok: true };
  }

  // Würfel auf das Blatt bringen (color null: Würfel nehmen, aber nichts eintragen)
  use(id, index, color, cell) {
    const sheet = this.sheet(id);
    const d = this.dice[index];
    if (color === null || color === undefined) return { ok: true, text: `nimmt ${NAMES[d.color]} ${d.value} und trägt nichts ein` };
    const c = Number(cell);
    if (!dieTargets(sheet, this.dice, index).some((t) => t.color === color && t.cell === c)) return { error: 'Da passt dieser Würfel nicht hin.' };
    const value = color === 'blue' ? this.dice[0].value + this.dice[2].value : d.value;
    const log = [];
    enter(sheet, color, c, d.value, log);
    const via = d.color === color ? '' : ` (mit ${NAMES[d.color]})`;
    return { ok: true, text: `${NAMES[color]} ${value}${via}${log.length ? ` → ${log.join(', ')}` : ''}` };
  }

  pick(player, index, color, cell) {
    if (this.await !== 'pick') return { error: 'Erst würfeln.' };
    const i = Number(index);
    const d = this.dice[i];
    if (!d || d.where !== 'free') return { error: 'Diesen Würfel kannst du nicht nehmen.' };
    if (this.sheet(this.activeId).pending.length) return { error: 'Setze zuerst deinen Bonus.' };
    const res = this.use(this.activeId, i, color, cell);
    if (res.error) return res;
    this.note(this.activeId, res.text);
    d.where = 'chosen';
    for (const o of this.dice) if (o.where === 'free' && o.value < d.value) o.where = 'tray';
    if (this.rollNo >= ROLLS || !this.dice.some((o) => o.where === 'free')) return this.beginPassive();
    this.await = 'roll';
    this.startTimer(() => this.autoActive());
    return { ok: true };
  }

  // Zeit abgelaufen oder Host drängt: Bonusse setzen, würfeln und jeweils den Würfel mit den meisten Punkten nehmen
  autoActive() {
    while (this.phase === 'active') {
      autoResolve(this.sheet(this.activeId));
      if (this.await === 'roll') this.roll();
      const sheet = this.sheet(this.activeId);
      let best = null;
      this.dice.forEach((d, i) => {
        if (d.where !== 'free') return;
        for (const t of dieTargets(sheet, this.dice, i)) {
          const copy = cloneSheet(sheet);
          enter(copy, t.color, t.cell, d.value);
          const gain = sheetScore(copy).total + copy.rerolls + copy.plusOnes;
          if (!best || gain > best.gain) best = { gain, i, ...t };
        }
      });
      if (!best) {
        // Nichts passt: den kleinsten Würfel nehmen, dann bleiben die meisten für den nächsten Wurf
        const free = this.dice.map((d, i) => ({ d, i })).filter((x) => x.d.where === 'free');
        const low = free.reduce((a, x) => (x.d.value < a.d.value ? x : a));
        best = { i: low.i, color: null, cell: null };
      }
      this.pick(null, best.i, best.color, best.cell);
    }
  }

  // ---------- Passive Phase ----------

  beginPassive() {
    if (this.solo) {
      // Allein würfelt das Spiel für einen gedachten Mitspieler, die drei kleinsten Würfel kommen aufs Tablett
      for (const d of this.dice) d.value = die();
      const sorted = this.dice.map((d, i) => i).sort((a, b) => this.dice[a].value - this.dice[b].value);
      sorted.forEach((i, k) => { this.dice[i].where = k < 3 ? 'tray' : 'chosen'; });
      this.rollSeq++;
    } else {
      for (const d of this.dice) if (d.where === 'free') d.where = 'tray';
    }
    this.phase = 'passive';
    this.await = null;
    for (const [id, sheet] of this.sheets) this.snapshots.set(id, cloneSheet(sheet));
    this.startTimer(() => this.endPassive());
    this.checkPassiveDone();
    return { ok: true };
  }

  canTakeTray(id) {
    return this.phase === 'passive' && this.sheets.has(id) && (id !== this.activeId || this.solo) && !this.picked.has(id) && !this.done.has(id);
  }

  take(player, index, color, cell) {
    const id = player.id;
    if (!this.canTakeTray(id)) return { error: 'Du kannst gerade keinen Würfel vom Tablett nehmen.' };
    const i = Number(index);
    if (this.dice[i]?.where !== 'tray') return { error: 'Dieser Würfel liegt nicht auf dem Tablett.' };
    if (this.sheet(id).pending.length) return { error: 'Setze zuerst deinen Bonus.' };
    const res = this.use(id, i, color, cell);
    if (res.error) return res;
    this.picked.add(id);
    this.note(id, res.text);
    return { ok: true };
  }

  plusOne(player, index, color, cell) {
    const id = player.id;
    if (this.phase !== 'passive' || !this.sheets.has(id) || this.done.has(id)) return { error: '+1 geht nur am Ende eines Zuges.' };
    const sheet = this.sheet(id);
    if (sheet.plusOnes < 1) return { error: 'Du hast kein +1.' };
    if (sheet.pending.length) return { error: 'Setze zuerst deinen Bonus.' };
    const i = Number(index);
    if (!this.dice[i]) return { error: 'Diesen Würfel gibt es nicht.' };
    const used = this.plusUsed.get(id) || [];
    if (used.includes(i)) return { error: 'Diesen Würfel hast du in diesem Zug schon mit +1 genommen.' };
    if (color === null || color === undefined) return { error: 'Wähle ein Feld für den Würfel.' };
    const res = this.use(id, i, color, cell);
    if (res.error) return res;
    sheet.plusOnes--;
    this.plusUsed.set(id, [...used, i]);
    this.note(id, `+1: ${res.text}`);
    return { ok: true };
  }

  bonus(player, color, cell) {
    const id = player.id;
    const activeTurn = this.phase === 'active' && id === this.activeId;
    if (!activeTurn && !(this.phase === 'passive' && !this.done.has(id))) return { error: 'Gerade kannst du keinen Bonus setzen.' };
    const sheet = this.sheet(id);
    if (!sheet.pending.length) return { error: 'Du hast keinen offenen Bonus.' };
    const log = [];
    if (!resolveBonus(sheet, color, Number(cell), log)) return { error: 'Dort geht der Bonus nicht hin.' };
    this.note(id, `Bonus in ${NAMES[color]}${log.length ? ` → ${log.join(', ')}` : ''}`);
    return { ok: true };
  }

  finish(player) {
    const id = player.id;
    if (this.phase !== 'passive' || !this.sheets.has(id) || this.done.has(id)) return { error: 'Gerade gibt es nichts abzuschließen.' };
    if (this.sheet(id).pending.length) return { error: 'Setze zuerst deinen Bonus.' };
    this.done.add(id);
    this.checkPassiveDone();
    return { ok: true };
  }

  // Alles aus der passiven Phase zurücknehmen
  undo(player) {
    const id = player.id;
    if (this.phase !== 'passive' || this.done.has(id) || !this.snapshots.has(id)) return { error: 'Nichts zum Zurücknehmen.' };
    this.sheets.set(id, cloneSheet(this.snapshots.get(id)));
    this.picked.delete(id);
    this.plusUsed.delete(id);
    this.log = this.log.filter((e) => !(e.playerId === id && e.passive));
    return { ok: true };
  }

  checkPassiveDone() {
    if (this.phase !== 'passive') return;
    const present = this.present();
    const waiting = [...this.sheets.keys()].filter((id) => present.has(id) && !this.done.has(id));
    if (!waiting.length) this.endTurn();
  }

  // Zeit abgelaufen: Wer noch nicht fertig ist, verzichtet, offene Bonusse werden automatisch gesetzt
  endPassive() {
    if (this.phase !== 'passive') return;
    for (const [id, sheet] of this.sheets) {
      if (!this.done.has(id)) autoResolve(sheet);
    }
    this.endTurn();
  }

  endTurn() {
    this.clearTimer();
    for (const sheet of this.sheets.values()) autoResolve(sheet);
    this.turn = (this.turn + 1) % this.order.length;
    if (this.turn === this.firstTurn) {
      this.round++;
      if (this.round > this.maxRounds) return this.endGame();
      this.giveRoundBonus();
    }
    this.startTurn();
  }

  // Host: Spieler am Zug überspringen (sein Zug verfällt)
  skip() {
    if (this.phase === 'active' || this.phase === 'passive') this.endTurn();
  }

  force() {
    if (this.phase === 'active') this.autoActive();
    else if (this.phase === 'passive') this.endPassive();
  }

  scores() {
    return Object.fromEntries([...this.sheets.entries()].map(([id, s]) => [id, sheetScore(s)]));
  }

  endGame() {
    this.clearTimer();
    this.activeId = null;
    const scores = this.scores();
    for (const [id, s] of Object.entries(scores)) this.totals[id] = (this.totals[id] || 0) + s.total;
    this.results.push({ scores });
    this.phase = this.gameNo >= this.settings.games ? 'final' : 'result';
    this.showHighscores = false;
    this.saveHighscores();
  }

  saveHighscores() {
    const date = new Date().toISOString();
    const list = [...this.sheets.entries()];
    const entries = list.map(([id, sheet]) => {
      const p = this.lobby.players.get(id);
      return { id: `hs_${randomToken().slice(0, 12)}`, name: p?.name || 'Spieler', avatar: p?.avatar || null, ...sheetScore(sheet), foxes: sheet.foxes, players: this.order.length, date };
    });
    this.newHighscores = Wuerfelfuchs.highscores().add(entries);
    this.highscorePlayers = list.filter((_, i) => this.newHighscores.includes(entries[i].id)).map(([id]) => id);
  }

  toggleHighscores() {
    if (this.phase !== 'result' && this.phase !== 'final') return { error: 'Die Bestenliste gibt es am Ende einer Partie.' };
    this.showHighscores = !this.showHighscores;
    return { ok: true };
  }

  next() {
    if (this.phase !== 'result') return;
    this.startGame();
  }

  action(player, { type, ...data }) {
    const hostOnly = ['force', 'skip', 'highscores'];
    if (hostOnly.includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    const activeOnly = ['roll', 'reroll', 'pick'];
    if (activeOnly.includes(type) && !(this.phase === 'active' && player.id === this.activeId)) return { error: 'Du bist nicht dran.' };
    const color = data.color ?? null;
    if (color !== null && !AREAS.includes(color)) return { error: 'Diese Farbe gibt es nicht.' };
    const before = this.log.length;
    let res;
    switch (type) {
      case 'roll': return this.roll();
      case 'reroll': return this.reroll();
      case 'pick': return this.pick(player, data.die, color, data.cell);
      case 'take': res = this.take(player, data.die, color, data.cell); break;
      case 'plusOne': res = this.plusOne(player, data.die, color, data.cell); break;
      case 'bonus': res = this.bonus(player, color, data.cell); break;
      case 'done': return this.finish(player);
      case 'undo': return this.undo(player);
      case 'force': this.force(); return { ok: true };
      case 'skip': this.skip(); return { ok: true };
      case 'highscores': return this.toggleHighscores();
      default: return { error: 'Unbekannte Aktion.' };
    }
    // Einträge aus der passiven Phase lassen sich mit „Rückgängig“ wieder entfernen
    if (this.phase === 'passive') for (const e of this.log.slice(before)) e.passive = true;
    return res;
  }

  playersChanged() {
    if (this.phase !== 'active' && this.phase !== 'passive') return;
    // Neue Mitspieler kommen hinten in die Reihe und bekommen ein leeres Blatt
    for (const p of this.players()) {
      if (!this.order.includes(p.id)) this.order.push(p.id);
      this.sheet(p.id);
    }
    this.checkPassiveDone();
  }

  view(viewer) {
    const scores = this.scores();
    const playing = this.phase === 'active' || this.phase === 'passive';
    const players = this.order.filter((id) => this.sheets.has(id)).map((id) => {
      const s = this.sheets.get(id);
      return {
        id,
        sheet: { yellow: s.yellow, blue: s.blue, green: s.green, orange: s.orange, purple: s.purple, rerolls: s.rerolls, plusOnes: s.plusOnes, foxes: s.foxes, pending: s.pending.length },
        score: scores[id],
        total: (this.totals[id] || 0) + (playing ? scores[id].total : 0),
        done: this.phase === 'passive' && this.done.has(id),
        picked: this.picked?.has(id) || false,
      };
    });
    const view = {
      phase: this.phase,
      layout: LAYOUT,
      gameNo: this.gameNo,
      games: this.settings.games,
      hints: this.settings.hints,
      round: this.round,
      maxRounds: this.maxRounds,
      solo: this.solo,
      activeId: this.activeId,
      rollNo: this.rollNo,
      maxRolls: ROLLS,
      await: this.await,
      dice: this.dice,
      rollSeq: this.rollSeq,
      log: this.log,
      players,
      deadline: this.deadline,
      paused: false,
      serverNow: Date.now(),
    };
    if (playing && this.sheets.has(viewer.id)) {
      const id = viewer.id;
      const sheet = this.sheet(id);
      const isActive = this.phase === 'active' && id === this.activeId;
      view.me = {
        isActive,
        pending: sheet.pending,
        bonusTargets: bonusTargets(sheet),
        canRoll: isActive && this.await === 'roll',
        canReroll: isActive && this.await === 'pick' && sheet.rerolls > 0,
        // Würfel, die gerade genommen werden dürfen
        pickable: this.dice.map((d, i) => (isActive && this.await === 'pick' && d.where === 'free') || (this.canTakeTray(id) && d.where === 'tray') ? i : -1).filter((i) => i >= 0),
        pickType: isActive ? 'pick' : 'take',
        canTake: this.canTakeTray(id),
        canPlusOne: this.phase === 'passive' && !this.done.has(id) && sheet.plusOnes > 0,
        plusUsed: this.plusUsed.get(id) || [],
        targets: this.dice.map((d, i) => dieTargets(sheet, this.dice, i)),
        canDone: this.phase === 'passive' && !this.done.has(id),
        done: this.done.has(id),
        picked: this.picked.has(id),
      };
    }
    if (!playing) {
      view.totals = this.totals;
      view.showHighscores = this.showHighscores;
      view.newHighscores = this.newHighscores;
      view.highscorePlayers = this.highscorePlayers;
      if (this.showHighscores) view.highscores = Wuerfelfuchs.highscores().list();
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

let board = null;
Wuerfelfuchs.highscores = () => board || (board = createBoard('wuerfelfuchs-highscores', { limit: HIGHSCORES }));
Wuerfelfuchs.useHighscores = (b) => { board = b; };
Object.assign(Wuerfelfuchs, { emptySheet, enter, sheetScore, dieTargets, cellsFor, bonusTargets, resolveBonus, LAYOUT });
module.exports = Wuerfelfuchs;
