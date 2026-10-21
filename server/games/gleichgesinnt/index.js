// Gleichgesinnt (nach Dito!): Zu drei Kategorien schreibt jeder geheim drei Antworten in sein 3×3-Raster.
// Punkte gibt es für Antworten, die andere auch haben, mit Stern, wenn genau einer sie auch hat.

const path = require('path');
const fs = require('fs');
const { shuffle, stems, sameStem, fuzzyMatch } = require('../../util');

const CATEGORIES = JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json'), 'utf8')).categories;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const CELLS = 9;
const PER_CATEGORY = 3;
const CATEGORIES_PER_ROUND = 3;
const WRITE_TIMES = [0, 60, 90, 120, 180];
const RESULT_MS = 4000;
// Bonus für eine ganz umkreiste Reihe (oben nach unten) bzw. Spalte (links nach rechts)
const ROW_BONUS = [3, 2, 1];
const COL_BONUS = [1, 2, 3];
const LINES = [
  ...[0, 1, 2].map((r) => ({ kind: 'row', index: r, cells: [r * 3, r * 3 + 1, r * 3 + 2], bonus: ROW_BONUS[r] })),
  ...[0, 1, 2].map((c) => ({ kind: 'col', index: c, cells: [c, c + 3, c + 6], bonus: COL_BONUS[c] })),
];

function cleanAnswer(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// Gleiche Antwort: gleicher Wortstamm (z. B. „Kerze“ und „Kerzen“)
function sameAnswer(a, b) {
  return sameStem(stems(a), stems(b));
}

class Gleichgesinnt {
  constructor(lobby) {
    this.lobby = lobby;
    this.round = 0;
    this.order = []; // Sitzreihenfolge (Spieler-IDs), daraus ergeben sich Wählende und Auflösende
    this.pickerTurn = 0;
    this.totals = new Map(); // Spieler-ID -> Gesamtpunkte
    this.roundScores = []; // pro Runde: Map Spieler-ID -> { points, circles, stars, bonus, lines }
    this.stats = new Map(); // Spieler-ID -> { crossed, bff: Map Partner-ID -> Anzahl }
    this.timer = null;
    this.deadline = null;
  }

  static meta() {
    return {
      id: 'gleichgesinnt',
      name: 'Gleichgesinnt',
      icon: '🤝',
      description: 'Was schreiben die anderen? Punkte gibt es für Antworten, die andere auch haben.',
      players: '3–12 Spieler, jeder gegen jeden',
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      writeTimes: WRITE_TIMES,
      rowBonus: ROW_BONUS,
      colBonus: COL_BONUS,
    };
  }

  static defaultSettings() {
    return { rounds: 3, writeTime: 0 };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.rounds !== undefined) {
      const n = Math.round(Number(patch.rounds));
      if (Number.isFinite(n)) next.rounds = Math.min(Math.max(n, 1), 5);
    }
    if (patch.writeTime !== undefined && WRITE_TIMES.includes(Number(patch.writeTime))) next.writeTime = Number(patch.writeTime);
    return next;
  }

  static availableCount() {
    return CATEGORIES.length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  players() {
    return this.lobby.activePlayers();
  }

  connected(id) {
    return Boolean(this.lobby.players.get(id)?.connected);
  }

  // Wer in dieser Runde mitspielt und noch da ist
  present() {
    return this.participants.filter((id) => this.connected(id));
  }

  start() {
    const count = this.players().length;
    if (count < MIN_PLAYERS) throw new Error(`Gleichgesinnt braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (count > MAX_PLAYERS) throw new Error(`Gleichgesinnt geht mit höchstens ${MAX_PLAYERS} Spielern.`);
    if (!this.lobby.gleichgesinntPlayed) this.lobby.gleichgesinntPlayed = new Set();
    const played = this.lobby.gleichgesinntPlayed;
    // Kategorien, die in dieser Lobby schon angeboten wurden, kommen erst wieder, wenn die neuen ausgehen
    this.deck = [...shuffle(CATEGORIES.filter((c) => !played.has(c))), ...shuffle(CATEGORIES.filter((c) => played.has(c)))];
    this.order = shuffle(this.players().map((p) => p.id));
    this.startRound();
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  setTimer(ms, fn) {
    this.clearTimer();
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.deadline = null;
      fn();
      this.lobby.broadcast();
    }, ms);
  }

  // ---------- Runde und Kategorien ----------

  startRound() {
    this.round++;
    for (const p of this.players()) if (!this.order.includes(p.id)) this.order.push(p.id);
    this.participants = this.order.filter((id) => this.players().some((p) => p.id === id));
    this.grids = new Map(this.participants.map((id) => [id, Array.from({ length: CELLS }, () => null)]));
    for (const id of this.participants) {
      if (!this.totals.has(id)) this.totals.set(id, 0);
      if (!this.stats.has(id)) this.stats.set(id, { crossed: 0, bff: new Map() });
    }
    this.categories = [];
    this.notice = null;
    this.startPick();
  }

  drawOptions() {
    if (this.deck.length < 2) this.deck.push(...shuffle(CATEGORIES.filter((c) => !this.deck.includes(c) && !this.categories.includes(c))));
    const options = this.deck.splice(0, 2);
    for (const c of options) this.lobby.gleichgesinntPlayed?.add(c);
    return options;
  }

  nextPicker() {
    const present = new Set(this.present());
    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[(this.pickerTurn + i) % this.order.length];
      if (present.has(id)) {
        this.pickerTurn = (this.pickerTurn + i + 1) % this.order.length;
        return id;
      }
    }
    return this.present()[0] || null;
  }

  startPick() {
    this.clearTimer();
    this.phase = 'pick';
    this.options = this.drawOptions();
    this.pickerId = this.nextPicker();
    this.submitted = new Set();
  }

  pick(player, index) {
    if (this.phase !== 'pick') return { error: 'Die Kategorie ist schon gewählt.' };
    if (player && player.id !== this.pickerId && !player.isHost) return { error: 'Gerade wählt jemand anders.' };
    const i = Number(index);
    if (i !== 0 && i !== 1) return { error: 'Ungültige Auswahl.' };
    this.categories.push(this.options[i]);
    this.phase = 'write';
    if (this.settings.writeTime) this.setTimer(this.settings.writeTime * 1000, () => this.finishWrite());
    return { ok: true };
  }

  // ---------- Schreiben ----------

  get catIndex() {
    return this.categories.length - 1;
  }

  write(player, cells) {
    if (this.phase !== 'write') return { error: 'Gerade wird nicht geschrieben.' };
    const grid = this.grids.get(player.id);
    if (!grid) return { error: 'Du spielst ab der nächsten Runde mit.' };
    const entries = Object.entries(cells || {}).map(([k, v]) => [Number(k), cleanAnswer(v)]).filter(([, text]) => text);
    if (entries.length !== PER_CATEGORY) return { error: `Bitte genau ${PER_CATEGORY} Antworten eintragen.` };
    const cat = this.catIndex;
    // Felder dieser Kategorie dürfen neu belegt werden, Felder früherer Kategorien nicht
    for (const [i] of entries) {
      if (!Number.isInteger(i) || i < 0 || i >= CELLS) return { error: 'Ungültiges Feld.' };
      if (grid[i] && grid[i].cat !== cat) return { error: 'Dieses Feld ist schon belegt.' };
    }
    const earlier = grid.filter((c) => c && c.cat !== cat);
    for (let a = 0; a < entries.length; a++) {
      const text = entries[a][1];
      const twice = entries.slice(0, a).find(([, t]) => sameAnswer(t, text)) || earlier.find((c) => sameAnswer(c.text, text));
      if (twice) return { error: `„${text}“ hast du in dieser Runde schon. Jede Antwort darf nur einmal vorkommen.` };
    }
    for (let i = 0; i < CELLS; i++) if (grid[i]?.cat === cat) grid[i] = null;
    for (const [i, text] of entries) grid[i] = { text, cat, state: 'open', star: false };
    this.submitted.add(player.id);
    this.checkAllWritten();
    return { ok: true };
  }

  checkAllWritten() {
    if (this.phase !== 'write') return;
    const present = this.present();
    if (present.length && present.every((id) => this.submitted.has(id))) this.finishWrite();
  }

  // Wer nicht fertig ist, bekommt leere Felder; sie zählen wie durchgestrichene
  finishWrite() {
    if (this.phase !== 'write') return;
    this.clearTimer();
    const cat = this.catIndex;
    for (const id of this.participants) {
      if (this.submitted.has(id)) continue;
      const grid = this.grids.get(id);
      let missing = PER_CATEGORY - grid.filter((c) => c?.cat === cat).length;
      for (let i = 0; i < CELLS && missing > 0; i++) {
        if (!grid[i]) {
          grid[i] = { text: '', cat, state: 'cross', star: false, empty: true };
          missing--;
        }
      }
    }
    if (this.categories.length < CATEGORIES_PER_ROUND) this.startPick();
    else this.startReveal();
  }

  // ---------- Auflösung ----------

  openCells(id) {
    return (this.grids.get(id) || []).map((c, i) => (c?.state === 'open' ? i : -1)).filter((i) => i >= 0);
  }

  startReveal() {
    this.phase = 'choose';
    this.current = null;
    this.revealTurn = 0;
    // Runde 1: zufällig (statt des jüngsten Spielers), danach beginnt, wer die wenigsten Punkte hat
    let first;
    if (this.round === 1) first = shuffle(this.participants)[0];
    else first = [...this.participants].sort((a, b) => this.totals.get(a) - this.totals.get(b))[0];
    this.revealTurn = this.participants.indexOf(first);
    if (this.roundOver()) this.finishRound();
    else this.advanceTo(this.revealTurn);
  }

  // Ab Platz start den nächsten anwesenden Spieler mit offenen Antworten wählen lassen
  advanceTo(start) {
    const n = this.participants.length;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const id = this.participants[i];
      if (this.connected(id) && this.openCells(id).length) {
        this.revealTurn = i;
        this.activeId = id;
        this.phase = 'choose';
        this.current = null;
        return;
      }
    }
    this.finishRound();
  }

  // Die Runde endet, sobald ein Spieler keine offene Antwort mehr hat. Wer gar nichts geschrieben hat
  // (z. B. weil er weg war), beendet sie nicht.
  roundOver() {
    return this.participants.some((id) => !this.openCells(id).length && this.grids.get(id).some((c) => c && !c.empty));
  }

  choose(player, cell) {
    if (this.phase !== 'choose') return { error: 'Gerade wird keine Antwort vorgelesen.' };
    if (player.id !== this.activeId) return { error: 'Du bist gerade nicht dran.' };
    const i = Number(cell);
    const c = this.grids.get(player.id)[i];
    if (!c || c.state !== 'open') return { error: 'Diese Antwort ist nicht mehr offen.' };
    this.current = { playerId: player.id, cell: i, text: c.text, cat: c.cat };
    this.claims = new Map(); // Spieler-ID -> Feld oder null („hab ich nicht“)
    this.confirmedIds = new Set(); // wer selbst geantwortet hat
    this.suggestions = new Map(); // Spieler-ID -> [Felder mit ähnlicher Antwort]
    for (const id of this.participants) {
      if (id === player.id) continue;
      const open = this.openCells(id);
      const grid = this.grids.get(id);
      const same = open.find((j) => sameAnswer(grid[j].text, c.text));
      if (same !== undefined) this.claims.set(id, same);
      this.suggestions.set(id, open.filter((j) => j === same || fuzzyMatch(grid[j].text, [c.text])));
      if (!open.length) this.claims.set(id, null);
    }
    this.phase = 'claim';
    this.checkAllClaimed();
    return { ok: true };
  }

  claim(player, cell) {
    if (this.phase !== 'claim') return { error: 'Gerade wird nichts verglichen.' };
    if (player.id === this.current.playerId) return { error: 'Das ist deine eigene Antwort.' };
    if (!this.grids.has(player.id)) return { error: 'Du spielst ab der nächsten Runde mit.' };
    if (cell === null || cell === undefined) {
      this.claims.set(player.id, null);
    } else {
      const i = Number(cell);
      if (!this.openCells(player.id).includes(i)) return { error: 'Diese Antwort ist nicht mehr offen.' };
      this.claims.set(player.id, i);
    }
    this.confirmedIds.add(player.id);
    this.checkAllClaimed();
    return { ok: true };
  }

  // Gewertet wird, wenn alle anwesenden Mitspieler geantwortet haben. Gleiche Wörter sind schon
  // vorausgewählt, trotzdem bestätigt jeder, damit niemand ein Synonym verpasst.
  checkAllClaimed() {
    if (this.phase !== 'claim') return;
    const others = this.present().filter((id) => id !== this.current.playerId);
    if (others.every((id) => this.confirmed(id))) this.resolve();
  }

  confirmed(id) {
    return this.confirmedIds.has(id) || !this.openCells(id).length;
  }

  resolve() {
    if (this.phase !== 'claim') return;
    const { playerId, cell } = this.current;
    const matches = [...this.claims.entries()].filter(([, j]) => j !== null && j !== undefined);
    const star = matches.length === 1;
    const own = this.grids.get(playerId)[cell];
    if (!matches.length) {
      own.state = 'cross';
      this.stats.get(playerId).crossed++;
    } else {
      own.state = 'circle';
      own.star = star;
      for (const [id, j] of matches) {
        const c = this.grids.get(id)[j];
        c.state = 'circle';
        c.star = star;
      }
      if (star) {
        const other = matches[0][0];
        const bump = (a, b) => this.stats.get(a).bff.set(b, (this.stats.get(a).bff.get(b) || 0) + 1);
        bump(playerId, other);
        bump(other, playerId);
      }
    }
    this.current.matches = matches.map(([id, j]) => ({ id, text: this.grids.get(id)[j].text }));
    this.current.outcome = !matches.length ? 'none' : star ? 'bff' : 'many';
    this.phase = 'result';
    this.setTimer(RESULT_MS, () => this.afterResult());
  }

  afterResult() {
    if (this.phase !== 'result') return;
    this.clearTimer();
    if (this.roundOver()) this.finishRound();
    else this.advanceTo(this.revealTurn + 1);
  }

  // ---------- Wertung ----------

  scoreGrid(grid) {
    const starValue = this.participants.length === 3 ? 1 : 2;
    const circles = grid.filter((c) => c?.state === 'circle').length;
    const stars = grid.filter((c) => c?.star).length;
    const lines = LINES.filter((l) => l.cells.every((i) => grid[i]?.state === 'circle'));
    const bonus = lines.reduce((s, l) => s + l.bonus, 0);
    return {
      circles,
      stars,
      starValue,
      bonus,
      lines: lines.map(({ kind, index, bonus: b }) => ({ kind, index, bonus: b })),
      points: circles + stars * starValue + bonus,
    };
  }

  finishRound() {
    this.clearTimer();
    this.current = null;
    this.activeId = null;
    const scores = new Map();
    for (const id of this.participants) {
      const s = this.scoreGrid(this.grids.get(id));
      scores.set(id, s);
      this.totals.set(id, (this.totals.get(id) || 0) + s.points);
    }
    this.roundScores.push(scores);
    this.phase = this.round >= this.settings.rounds ? 'final' : 'roundEnd';
  }

  bestRound(id) {
    return Math.max(0, ...this.roundScores.map((m) => m.get(id)?.points ?? 0));
  }

  ranking() {
    const ids = [...this.totals.keys()];
    const sorted = ids.sort((a, b) => this.totals.get(b) - this.totals.get(a) || this.bestRound(b) - this.bestRound(a));
    let rank = 0;
    return sorted.map((id, i) => {
      const prev = sorted[i - 1];
      if (i === 0 || this.totals.get(prev) !== this.totals.get(id) || this.bestRound(prev) !== this.bestRound(id)) rank = i + 1;
      return { id, total: this.totals.get(id), best: this.bestRound(id), rank, rounds: this.roundScores.map((m) => m.get(id)?.points ?? null) };
    });
  }

  awards() {
    let soul = null;
    let loner = null;
    for (const [id, s] of this.stats) {
      for (const [other, n] of s.bff) {
        if (id < other && (!soul || n > soul.count)) soul = { ids: [id, other], count: n };
      }
      if (s.crossed && (!loner || s.crossed > loner.count)) loner = { ids: [id], count: s.crossed };
      else if (s.crossed && loner && s.crossed === loner.count) loner.ids.push(id);
    }
    return { soulmates: soul, loner };
  }

  // ---------- Host und Verbindungen ----------

  // Host: weiter, ohne auf alle zu warten
  next() {
    if (this.phase === 'pick') return this.pick(null, shuffle([0, 1])[0]);
    if (this.phase === 'write') this.finishWrite();
    else if (this.phase === 'claim') this.resolve();
    else if (this.phase === 'result') this.afterResult();
    else if (this.phase === 'roundEnd') this.startRound();
    return { ok: true };
  }

  // Host: wer gerade auflösen soll, wird übersprungen
  skip() {
    if (this.phase !== 'choose') return { error: 'Gerade ist niemand zu überspringen.' };
    this.advanceTo(this.revealTurn + 1);
    return { ok: true };
  }

  action(player, { type, ...data }) {
    if (['next', 'skip'].includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'pick': return this.pick(player, data.index);
      case 'write': return this.write(player, data.cells);
      case 'choose': return this.choose(player, data.cell);
      case 'claim': return this.claim(player, data.cell);
      case 'next': return this.next();
      case 'skip': return this.skip();
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'final') return;
    if (this.phase === 'pick' && !this.connected(this.pickerId)) this.pickerId = this.nextPicker();
    this.checkAllWritten();
    this.checkAllClaimed();
    if (this.phase === 'choose' && !this.connected(this.activeId)) this.advanceTo(this.revealTurn + 1);
  }

  // ---------- Ansicht ----------

  // Raster für einen Betrachter: eigene Antworten immer, fremde erst nach der Auflösung
  gridView(id, viewer) {
    const grid = this.grids.get(id) || [];
    return grid.map((c) => {
      if (!c) return null;
      const visible = id === viewer.id || c.state !== 'open' || this.phase === 'final' || this.phase === 'roundEnd';
      return { cat: c.cat, state: c.state, star: c.star, empty: Boolean(c.empty), text: visible ? c.text : null };
    });
  }

  view(viewer) {
    const playing = this.grids?.has(viewer.id) || false;
    const lastScores = this.roundScores[this.roundScores.length - 1];
    const v = {
      phase: this.phase,
      round: this.round,
      rounds: this.settings.rounds,
      categories: this.categories,
      catIndex: this.catIndex,
      options: this.phase === 'pick' ? this.options : null,
      pickerId: this.phase === 'pick' ? this.pickerId : null,
      playing,
      participants: this.participants,
      submitted: this.phase === 'write' ? [...this.submitted] : [],
      grids: Object.fromEntries(this.participants.map((id) => [id, this.gridView(id, viewer)])),
      totals: Object.fromEntries(this.totals),
      activeId: ['choose', 'claim', 'result'].includes(this.phase) ? this.activeId : null,
      current: null,
      deadline: this.phase === 'write' ? this.deadline : null,
      serverNow: Date.now(),
      notice: this.notice,
      starValue: this.participants.length === 3 ? 1 : 2,
    };
    if (this.current && ['claim', 'result'].includes(this.phase)) {
      v.current = {
        playerId: this.current.playerId,
        cell: this.current.cell,
        text: this.current.text,
        cat: this.current.cat,
        outcome: this.current.outcome || null,
        matches: this.current.matches || null,
        answered: this.phase === 'claim' ? this.present().filter((id) => id !== this.current.playerId && this.confirmed(id)) : [],
        myClaim: this.claims?.has(viewer.id) ? this.claims.get(viewer.id) : undefined,
        myConfirmed: this.phase === 'claim' ? this.confirmed(viewer.id) : true,
        suggestions: this.suggestions?.get(viewer.id) || [],
      };
    }
    if ((this.phase === 'roundEnd' || this.phase === 'final') && lastScores) {
      v.scores = Object.fromEntries(lastScores);
      v.ranking = this.ranking();
    }
    if (this.phase === 'final') v.awards = this.awards();
    return v;
  }

  dispose() {
    this.clearTimer();
  }
}

Gleichgesinnt.LINES = LINES;
module.exports = Gleichgesinnt;
