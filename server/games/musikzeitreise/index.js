// Musikzeitreise: Songs hören und auf der eigenen Zeitleiste nach Erscheinungsjahr einordnen.
// Der Song läuft verdeckt beim Host (Spotify, siehe public/js/music.js). Wer zuerst genug Karten hat, gewinnt.

const path = require('path');
const fs = require('fs');
const { shuffle, fuzzyMatch } = require('../../util');
const spotify = require('../../spotify');

const SONGS = JSON.parse(fs.readFileSync(path.join(__dirname, 'songs.json'), 'utf8')).songs;
const START_CHIPS = 2;
const MAX_CHIPS = 5;
const BUY_COST = 3;

// Nur Songs mit Spotify-ID lassen sich abspielen
function playableSongs() {
  return SONGS.filter((s) => spotify.trackIdFor(s));
}

function cleanText(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// Passt das Jahr an diese Stelle der Zeitleiste? Gleiche Jahre gelten an beiden Seiten als richtig.
function fits(cards, slot, year) {
  return (slot === 0 || cards[slot - 1].year <= year) && (slot === cards.length || year <= cards[slot].year);
}

function sortedSlot(cards, year) {
  const i = cards.findIndex((c) => c.year > year);
  return i === -1 ? cards.length : i;
}

// Interpret: auch nur der Hauptinterpret zählt („Mark Ronson“ statt „Mark Ronson feat. Bruno Mars“)
function artistVariants(artist) {
  const parts = artist.split(/\s+(?:feat\.?|ft\.?|&|x|and|und)\s+|,\s*/i);
  return [artist, ...parts];
}

// Titel: mit und ohne Klammerzusatz („Satisfaction“ für „(I Can't Get No) Satisfaction“)
function titleVariants(title) {
  return [title, title.replace(/\([^)]*\)/g, ' '), title.replace(/[()]/g, ' ')];
}

function guessIsRight(guess, song) {
  if (!guess?.artist || !guess?.title) return false;
  return fuzzyMatch(guess.artist, artistVariants(song.artist)) && fuzzyMatch(guess.title, titleVariants(song.title));
}

function publicSong(s) {
  return s ? { artist: s.artist, title: s.title, year: s.year } : null;
}

class Musikzeitreise {
  constructor(lobby) {
    this.lobby = lobby;
    this.units = new Map(); // Spieler- oder Team-ID -> { cards, chips }
    this.order = [];
    this.turn = -1;
    this.deck = [];
    this.phase = 'place'; // place | challenge | reveal | final
    this.activeKey = null;
    this.song = null;
    this.slot = null;
    this.guess = null;
    this.challenges = new Map(); // Spieler- oder Team-ID -> Stelle auf der Zeitleiste des Aktiven
    this.passed = new Set();
    this.result = null;
    this.notice = null;
  }

  static meta() {
    return {
      id: 'musikzeitreise',
      name: 'Musikzeitreise',
      icon: '🎶',
      description: 'Song hören, Jahr schätzen und auf der eigenen Zeitleiste richtig einordnen.',
      players: '1–12 Spieler oder Teams',
      available: true,
      teams: 'optional',
      totalSongs: SONGS.length,
      startChips: START_CHIPS,
      maxChips: MAX_CHIPS,
      buyCost: BUY_COST,
    };
  }

  static defaultSettings() {
    return { targetCards: 10, teamMode: false, chips: true };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.targetCards !== undefined) {
      const n = Math.round(Number(patch.targetCards));
      if (Number.isFinite(n)) next.targetCards = Math.min(Math.max(n, 3), 30);
    }
    if (patch.teamMode !== undefined) next.teamMode = Boolean(patch.teamMode);
    if (patch.chips !== undefined) next.chips = Boolean(patch.chips);
    return next;
  }

  static availableCount() {
    return playableSongs().length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get teamMode() {
    return Boolean(this.settings.teamMode);
  }

  // Die Zeitleiste eines Spielers: im Team-Modus teilt sich das Team eine Zeitleiste
  unitKey(player) {
    if (!player || (player.isHost && !this.lobby.settings.hostPlays)) return null;
    if (!this.teamMode) return player.id;
    return this.lobby.teamById(player.teamId) ? player.teamId : null;
  }

  members(key) {
    return this.lobby.activePlayers().filter((p) => this.unitKey(p) === key);
  }

  presentKeys() {
    return [...new Set(this.lobby.activePlayers().map((p) => this.unitKey(p)).filter(Boolean))];
  }

  addUnit(key) {
    const card = this.deck.pop();
    this.units.set(key, { cards: card ? [card] : [], chips: this.settings.chips ? START_CHIPS : 0 });
    this.order.push(key);
  }

  start() {
    const keys = this.presentKeys();
    if (!keys.length) throw new Error(this.teamMode ? 'Mindestens ein Team braucht Spieler.' : 'Musikzeitreise braucht mindestens einen Mitspieler.');
    this.deck = shuffle(playableSongs());
    if (this.deck.length < keys.length * 2) {
      throw new Error('Es sind zu wenige Songs mit Spotify-ID hinterlegt. Mit Spotify-Zugangsdaten auf dem Server werden alle Songs abspielbar.');
    }
    for (const key of shuffle(keys)) this.addUnit(key);
    this.nextTurn();
  }

  drawSong() {
    this.song = this.deck.pop() || null;
    this.slot = null;
    this.guess = null;
    this.challenges.clear();
    this.passed.clear();
    this.result = null;
    if (!this.song) this.phase = 'final';
    else this.phase = 'place';
  }

  nextTurn() {
    const present = new Set(this.presentKeys());
    for (let i = 1; i <= this.order.length; i++) {
      const index = (this.turn + i) % this.order.length;
      if (present.has(this.order[index])) {
        this.turn = index;
        break;
      }
    }
    this.activeKey = this.order[this.turn] ?? this.order[0];
    this.notice = null;
    this.drawSong();
  }

  isActive(player) {
    return this.unitKey(player) === this.activeKey;
  }

  activeCards() {
    return this.units.get(this.activeKey)?.cards || [];
  }

  validSlot(raw) {
    const slot = Number(raw);
    return Number.isInteger(slot) && slot >= 0 && slot <= this.activeCards().length ? slot : null;
  }

  place(player, raw) {
    if (this.phase !== 'place') return { error: 'Die Karte liegt schon.' };
    if (!this.isActive(player)) return { error: 'Du bist gerade nicht dran.' };
    const slot = this.validSlot(raw);
    if (slot === null) return { error: 'Ungültige Stelle.' };
    this.slot = slot;
    return { ok: true };
  }

  // Wer noch Chips hat, darf Einspruch erheben
  challengers() {
    if (!this.settings.chips) return [];
    return this.presentKeys().filter((k) => k !== this.activeKey && (this.units.get(k)?.chips > 0 || this.challenges.has(k)));
  }

  confirm(player, { artist, title } = {}) {
    if (this.phase !== 'place') return { error: 'Die Karte liegt schon.' };
    if (!this.isActive(player)) return { error: 'Du bist gerade nicht dran.' };
    if (this.slot === null) return { error: 'Wähle zuerst eine Stelle auf deiner Zeitleiste.' };
    const guess = { artist: cleanText(artist), title: cleanText(title) };
    this.guess = guess.artist || guess.title ? guess : null;
    if (this.challengers().length) this.phase = 'challenge';
    else this.reveal();
    return { ok: true };
  }

  challenge(player, raw) {
    if (this.phase !== 'challenge') return { error: 'Gerade ist kein Einspruch möglich.' };
    const key = this.unitKey(player);
    if (!key || key === this.activeKey) return { error: 'Du kannst hier keinen Einspruch erheben.' };
    if (this.challenges.has(key) || this.passed.has(key)) return { error: 'Du hast schon entschieden.' };
    const unit = this.units.get(key);
    if (!unit || unit.chips < 1) return { error: 'Du hast keinen Chip mehr.' };
    const slot = this.validSlot(raw);
    if (slot === null) return { error: 'Ungültige Stelle.' };
    if (slot === this.slot) return { error: 'Dort liegt die Karte schon. Wähle eine andere Stelle.' };
    if ([...this.challenges.values()].includes(slot)) return { error: 'Diese Stelle ist schon belegt.' };
    unit.chips--;
    this.challenges.set(key, slot);
    this.checkChallenges();
    return { ok: true };
  }

  pass(player) {
    if (this.phase !== 'challenge') return { error: 'Gerade ist kein Einspruch möglich.' };
    const key = this.unitKey(player);
    if (!key || key === this.activeKey) return { error: 'Du kannst hier nicht passen.' };
    this.passed.add(key);
    this.checkChallenges();
    return { ok: true };
  }

  checkChallenges() {
    if (this.phase !== 'challenge') return;
    if (this.challengers().every((k) => this.challenges.has(k) || this.passed.has(k))) this.reveal();
  }

  // Für einen Chip einen anderen Song ziehen
  skipSong(player) {
    if (this.phase !== 'place') return { error: 'Jetzt nicht mehr.' };
    if (!this.isActive(player)) return { error: 'Du bist gerade nicht dran.' };
    const unit = this.units.get(this.activeKey);
    if (!this.settings.chips || unit.chips < 1) return { error: 'Du hast keinen Chip.' };
    unit.chips--;
    this.drawSong();
    this.notice = 'Song übersprungen (1 Chip). Hier kommt ein neuer.';
    return { ok: true };
  }

  // Für drei Chips wird die Karte ohne Raten richtig eingeordnet
  buy(player) {
    if (this.phase !== 'place') return { error: 'Jetzt nicht mehr.' };
    if (!this.isActive(player)) return { error: 'Du bist gerade nicht dran.' };
    const unit = this.units.get(this.activeKey);
    if (!this.settings.chips || unit.chips < BUY_COST) return { error: `Dafür brauchst du ${BUY_COST} Chips.` };
    unit.chips -= BUY_COST;
    this.slot = sortedSlot(unit.cards, this.song.year);
    unit.cards.splice(this.slot, 0, this.song);
    this.result = { bought: true, correct: true, winnerKey: this.activeKey, guess: null, guessOk: false };
    this.phase = 'reveal';
    return { ok: true };
  }

  // Host: Song lässt sich nicht abspielen, ein neuer kommt (Chips aus Einsprüchen gibt es zurück)
  hostSkipSong() {
    if (this.phase !== 'place' && this.phase !== 'challenge') return;
    for (const key of this.challenges.keys()) this.units.get(key).chips++;
    this.drawSong();
    this.notice = 'Der Host hat den Song übersprungen.';
  }

  // Host: Wer dran ist, ist weg
  hostSkipTurn() {
    if (this.phase === 'final') return;
    for (const key of this.challenges.keys()) this.units.get(key).chips++;
    this.nextTurn();
  }

  reveal() {
    if (this.phase === 'place' && this.slot === null) return;
    if (this.phase !== 'place' && this.phase !== 'challenge') return;
    const year = this.song.year;
    const cards = this.activeCards();
    const correct = fits(cards, this.slot, year);
    let winnerKey = null;
    if (correct) {
      winnerKey = this.activeKey;
      cards.splice(this.slot, 0, this.song);
    } else {
      // Bei mehreren Einsprüchen gewinnt, wer zuerst richtig lag
      for (const [key, slot] of this.challenges) {
        if (fits(cards, slot, year)) {
          winnerKey = key;
          const own = this.units.get(key).cards;
          own.splice(sortedSlot(own, year), 0, this.song);
          break;
        }
      }
    }
    const guessOk = this.settings.chips && guessIsRight(this.guess, this.song);
    if (guessOk) this.addChip(this.activeKey, 1);
    this.result = { bought: false, correct, winnerKey, guess: this.guess, guessOk };
    this.phase = 'reveal';
  }

  addChip(key, n) {
    const unit = this.units.get(key);
    if (unit) unit.chips = Math.min(MAX_CHIPS, Math.max(0, unit.chips + n));
  }

  // Host korrigiert, ob Interpret und Titel richtig erraten wurden
  judge(ok) {
    if (this.phase !== 'reveal' || !this.result?.guess || !this.settings.chips) return;
    if (this.result.guessOk === ok) return;
    this.result.guessOk = ok;
    this.addChip(this.activeKey, ok ? 1 : -1);
  }

  leader() {
    const target = this.settings.targetCards;
    return this.order.find((k) => this.units.get(k).cards.length >= target) || null;
  }

  next() {
    if (this.phase !== 'reveal') return;
    if (this.leader()) {
      this.phase = 'final';
      return;
    }
    this.nextTurn();
  }

  action(player, { type, ...data }) {
    switch (type) {
      case 'place': return this.place(player, data.slot);
      case 'confirm': return this.confirm(player, data);
      case 'challenge': return this.challenge(player, data.slot);
      case 'pass': return this.pass(player);
      case 'skip': return this.skipSong(player);
      case 'buy': return this.buy(player);
      case 'judge':
      case 'hostSkip':
      case 'skipTurn':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        if (type === 'judge') this.judge(Boolean(data.ok));
        else if (type === 'hostSkip') this.hostSkipSong();
        else this.hostSkipTurn();
        return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'final') return;
    // Neue Mitspieler bzw. Teams bekommen eine Startkarte und kommen hinten in die Reihe
    for (const key of this.presentKeys()) if (!this.units.has(key)) this.addUnit(key);
    this.checkChallenges();
  }

  ranking() {
    return [...this.order]
      .map((key) => ({ key, cards: this.units.get(key).cards.length, chips: this.units.get(key).chips }))
      .sort((a, b) => b.cards - a.cards || b.chips - a.chips);
  }

  view(viewer) {
    const myKey = this.unitKey(viewer);
    const open = this.phase === 'reveal' || this.phase === 'final';
    const present = new Set(this.presentKeys());
    const view = {
      phase: this.phase,
      teamMode: this.teamMode,
      chipsEnabled: Boolean(this.settings.chips),
      target: this.settings.targetCards,
      deckLeft: this.deck.length,
      myKey,
      activeKey: this.activeKey,
      isMyTurn: Boolean(myKey) && myKey === this.activeKey,
      units: this.order.map((key) => ({
        key,
        cards: this.units.get(key).cards.map(publicSong),
        chips: this.units.get(key).chips,
        members: this.members(key).map((p) => p.id),
        present: present.has(key),
      })),
      slot: this.slot,
      challenges: [...this.challenges].map(([key, slot]) => ({ key, slot })),
      waitingFor: this.phase === 'challenge' ? this.challengers().filter((k) => !this.challenges.has(k) && !this.passed.has(k)) : [],
      song: open ? publicSong(this.song) : null,
      result: this.phase === 'reveal' ? this.result : null,
      notice: this.notice,
      serverNow: Date.now(),
    };
    // Nur das Gerät des Hosts spielt die Musik
    if (viewer.isHost && this.song && this.phase !== 'final') view.trackId = spotify.trackIdFor(this.song);
    if (this.phase === 'final') view.ranking = this.ranking();
    return view;
  }

  dispose() {}
}

Musikzeitreise.fits = fits;
Musikzeitreise.guessIsRight = guessIsRight;
Musikzeitreise.songs = SONGS;
module.exports = Musikzeitreise;
