// Memekönig (nach „What Do You Meme?“): Auf dem Fernseher ist ein Bild, jeder legt vom Handy die
// lustigste Bildunterschrift aus seiner Hand. Ein Juror (reihum) oder alle zusammen wählen die beste.

const path = require('path');
const fs = require('fs');
const { shuffle } = require('../../util');

const IMAGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'images.json'), 'utf8')).images;
const CAPTIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'captions.json'), 'utf8')).captions;
const LOCAL_DIR = path.join(__dirname, '..', '..', '..', 'public', 'meme-images');
const PLAY_TIMES = [0, 30, 45, 60, 90, 120];
const ROUNDS = [5, 8, 10, 12, 15, 20];
const MODES = ['judge', 'vote'];
const SOURCES = ['both', 'wiki', 'local'];
const HAND_SIZE = 7;
const MAX_JOKERS = 3;
const MAX_TEXT = 100;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;

const byId = new Map(IMAGES.map((img) => [img.id, img]));

function wikiImageById(id) {
  return byId.get(id) || null;
}

// Eigene Bilder: alles in public/meme-images
function localImages() {
  const files = fs.existsSync(LOCAL_DIR) ? fs.readdirSync(LOCAL_DIR) : [];
  return files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)).sort().map((f) => ({
    id: `local:${f}`,
    url: `/meme-images/${encodeURIComponent(f)}`,
    text: 'Eigenes Bild',
    credit: null,
  }));
}

function wikiImages() {
  return IMAGES.map((img) => ({
    id: img.id,
    url: `/api/meme-image/${img.id}`,
    text: img.text,
    credit: `Bild: Wikipedia · ${img.wiki.replace(/_/g, ' ')}`,
  }));
}

function imagePool(settings) {
  const pool = [];
  if (settings.source !== 'local') pool.push(...wikiImages());
  if (settings.source !== 'wiki') pool.push(...localImages());
  return pool;
}

function cleanText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

class Memekoenig {
  constructor(lobby) {
    this.lobby = lobby;
    this.phase = 'play';
    this.index = 0;
    this.images = []; // Bilder dieser Partie, das erste ist dran, danach Ersatz
    this.spare = [];
    this.deck = []; // Kartennummern zum Nachziehen
    this.discard = [];
    this.hands = new Map(); // Spieler-ID -> Kartennummern
    this.jokers = new Map(); // Spieler-ID -> übrige Joker
    this.swapped = new Set(); // wer seine Hand schon getauscht hat
    this.plays = new Map(); // Spieler-ID -> { card } oder { text }
    this.entries = []; // in der Auswahl: [{ key, playerId, text, card }]
    this.votes = new Map(); // Wähler-ID -> key
    this.pick = null; // Juror-Wahl (key)
    this.judgeId = null;
    this.result = null; // { winners: [key], points: { id: n } }
    this.scores = new Map();
    this.history = [];
    this.notice = null;
    this.deadline = null;
    this.timer = null;
  }

  static meta() {
    return {
      id: 'memekoenig',
      name: 'Memekönig',
      icon: '👑',
      description: 'Ein Bild, viele Bildunterschriften: Wer legt die lustigste Karte?',
      players: '3–12 Spieler, jeder für sich',
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      available: true,
      teams: false,
      playTimes: PLAY_TIMES,
      roundOptions: ROUNDS,
      imageCounts: { wiki: IMAGES.length, local: localImages().length },
      captionCount: CAPTIONS.length,
    };
  }

  static defaultSettings() {
    return { rounds: 10, mode: 'judge', playTime: 60, jokers: 1, source: 'both' };
  }

  static sanitizeSettings(current, patch) {
    const next = { ...current };
    if (patch.rounds !== undefined && ROUNDS.includes(Number(patch.rounds))) next.rounds = Number(patch.rounds);
    if (MODES.includes(patch.mode)) next.mode = patch.mode;
    if (patch.playTime !== undefined && PLAY_TIMES.includes(Number(patch.playTime))) next.playTime = Number(patch.playTime);
    if (patch.jokers !== undefined) {
      const n = Math.round(Number(patch.jokers));
      if (Number.isFinite(n)) next.jokers = Math.min(Math.max(n, 0), MAX_JOKERS);
    }
    if (SOURCES.includes(patch.source)) next.source = patch.source;
    return next;
  }

  static availableCount(settings) {
    return imagePool(settings).length;
  }

  get settings() {
    return this.lobby.settings.game;
  }

  get image() {
    return this.images[this.index] || null;
  }

  get judging() {
    return this.settings.mode === 'judge';
  }

  players() {
    return this.lobby.activePlayers();
  }

  isPlaying(player) {
    return Boolean(player) && this.players().includes(player);
  }

  connected(id) {
    return Boolean(this.lobby.players.get(id)?.connected);
  }

  start() {
    const count = this.players().length;
    if (count < MIN_PLAYERS) throw new Error(`Memekönig braucht mindestens ${MIN_PLAYERS} Mitspieler.`);
    if (count > MAX_PLAYERS) throw new Error(`Memekönig geht mit höchstens ${MAX_PLAYERS} Spielern.`);
    const pool = imagePool(this.settings);
    if (!pool.length) throw new Error('Keine Bilder gefunden. Lege Bilder in public/meme-images ab oder nutze die Wikipedia-Bilder.');
    // Bilder, die in dieser Lobby schon dran waren, kommen erst wieder, wenn die neuen ausgehen
    if (!this.lobby.memePlayed) this.lobby.memePlayed = new Set();
    const played = this.lobby.memePlayed;
    const ordered = [...shuffle(pool.filter((img) => !played.has(img.id))), ...shuffle(pool.filter((img) => played.has(img.id)))];
    const rounds = Math.min(this.settings.rounds, ordered.length);
    this.images = ordered.slice(0, rounds);
    this.spare = ordered.slice(rounds);
    for (const img of this.images) played.add(img.id);
    this.deck = shuffle(CAPTIONS.map((_, i) => i));
    this.index = 0;
    this.judgeId = null;
    this.startRound();
  }

  // ---------- Karten ----------

  draw() {
    if (!this.deck.length) {
      this.deck = shuffle(this.discard);
      this.discard = [];
    }
    return this.deck.pop();
  }

  hand(id) {
    if (!this.hands.has(id)) {
      // Wer später dazukommt, bekommt beim ersten Blick seine Hand
      const cards = [];
      for (let i = 0; i < HAND_SIZE; i++) {
        const c = this.draw();
        if (c !== undefined) cards.push(c);
      }
      this.hands.set(id, cards);
      this.jokers.set(id, this.settings.jokers);
    }
    return this.hands.get(id);
  }

  refill(id) {
    const cards = this.hand(id);
    while (cards.length < HAND_SIZE) {
      const c = this.draw();
      if (c === undefined) break;
      cards.push(c);
    }
  }

  swapHand(player) {
    if (this.phase !== 'play') return { error: 'Tauschen geht nur, solange gelegt wird.' };
    if (!this.isPlaying(player)) return { error: 'Du spielst nicht mit.' };
    if (this.swapped.has(player.id)) return { error: 'Du hast deine Hand schon getauscht.' };
    const cards = this.hand(player.id);
    // Erst neue ziehen, dann die alten ablegen, damit keine Karte gleich zurückkommt
    const fresh = [];
    for (let i = 0; i < HAND_SIZE; i++) {
      const c = this.draw();
      if (c !== undefined) fresh.push(c);
    }
    this.discard.push(...cards);
    this.hands.set(player.id, fresh);
    this.swapped.add(player.id);
    if (this.plays.get(player.id)?.card !== undefined) this.plays.delete(player.id);
    return { ok: true };
  }

  // ---------- Runde ----------

  chooseJudge() {
    const ids = this.players().map((p) => p.id);
    if (!ids.length) return null;
    const prev = ids.indexOf(this.judgeId);
    return ids[(prev + 1) % ids.length];
  }

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  setTimer(ms, fn) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
      this.lobby.broadcast();
    }, ms);
  }

  startRound() {
    this.phase = 'play';
    this.plays = new Map();
    this.entries = [];
    this.votes = new Map();
    this.pick = null;
    this.result = null;
    this.judgeId = this.judging ? this.chooseJudge() : null;
    const t = this.settings.playTime;
    this.deadline = t ? Date.now() + t * 1000 : null;
    if (t) this.setTimer(t * 1000, () => this.toPick());
    else this.clearTimer();
  }

  // Wer in dieser Runde legt (im Juror-Modus alle außer dem Juror)
  layers() {
    return this.players().filter((p) => p.id !== this.judgeId);
  }

  play(player, { card, text }) {
    if (this.phase !== 'play') return { error: 'Gerade wird nicht gelegt.' };
    if (!this.isPlaying(player)) return { error: 'Du spielst nicht mit.' };
    if (player.id === this.judgeId) return { error: 'Du bist diese Runde Juror.' };
    if (text !== undefined) {
      const clean = cleanText(text);
      if (!clean) return { error: 'Schreib erst etwas auf deinen Joker.' };
      const used = this.plays.get(player.id)?.text !== undefined;
      if (!used && !(this.jokers.get(player.id) ?? this.settings.jokers)) return { error: 'Du hast keinen Joker mehr.' };
      this.plays.set(player.id, { text: clean });
    } else {
      const c = Number(card);
      if (!this.hand(player.id).includes(c)) return { error: 'Diese Karte hast du nicht.' };
      this.plays.set(player.id, { card: c });
    }
    this.checkAllPlayed();
    return { ok: true };
  }

  unplay(player) {
    if (this.phase !== 'play') return { error: 'Gerade wird nicht gelegt.' };
    this.plays.delete(player.id);
    return { ok: true };
  }

  checkAllPlayed() {
    if (this.phase !== 'play') return;
    const layers = this.layers();
    if (layers.length && layers.every((p) => this.plays.has(p.id))) this.toPick();
  }

  toPick() {
    if (this.phase !== 'play') return;
    this.clearTimer();
    this.deadline = null;
    for (const id of [...this.plays.keys()]) if (!this.connected(id) || id === this.judgeId) this.plays.delete(id);
    if (this.plays.size < 2) {
      this.notice = 'Zu wenige Karten gelegt, dieses Bild wird übersprungen.';
      this.plays = new Map();
      this.history[this.index] = null;
      this.phase = 'result';
      return;
    }
    this.notice = null;
    // Gelegte Karten wandern auf den Ablagestapel, Joker sind verbraucht
    for (const [id, play] of this.plays) {
      if (play.card !== undefined) {
        const cards = this.hand(id);
        cards.splice(cards.indexOf(play.card), 1);
        this.discard.push(play.card);
        this.refill(id);
      } else {
        this.jokers.set(id, Math.max(0, (this.jokers.get(id) ?? 0) - 1));
      }
    }
    this.entries = shuffle([...this.plays].map(([playerId, play]) => ({
      playerId,
      text: play.text ?? CAPTIONS[play.card],
      joker: play.text !== undefined,
    }))).map((e, i) => ({ key: `e${i}`, ...e }));
    this.phase = 'pick';
  }

  // Im Abstimmungsmodus stimmen alle Mitspieler ab, die eine fremde Karte wählen können
  voters() {
    return this.players();
  }

  choose(player, key) {
    if (this.phase !== 'pick') return { error: 'Gerade wird nicht gewählt.' };
    const entry = this.entries.find((e) => e.key === key);
    if (!entry) return { error: 'Diese Karte gibt es nicht.' };
    if (this.judging) {
      const judgeGone = !this.connected(this.judgeId);
      if (player.id !== this.judgeId && !(player.isHost && judgeGone)) return { error: 'Nur der Juror wählt.' };
      this.pick = key;
      this.toResult();
      return { ok: true };
    }
    if (!this.isPlaying(player)) return { error: 'Du spielst nicht mit.' };
    if (entry.playerId === player.id) return { error: 'Für die eigene Karte kannst du nicht stimmen.' };
    this.votes.set(player.id, key);
    this.checkAllVoted();
    return { ok: true };
  }

  checkAllVoted() {
    if (this.phase !== 'pick' || this.judging) return;
    const voters = this.voters();
    if (voters.length && voters.every((p) => this.votes.has(p.id))) this.toResult();
  }

  toResult() {
    if (this.phase !== 'pick') return;
    const points = {};
    const counts = {};
    let winners = [];
    if (this.judging) {
      if (this.pick) winners = [this.pick];
    } else {
      for (const key of this.votes.values()) counts[key] = (counts[key] || 0) + 1;
      const top = Math.max(0, ...Object.values(counts));
      if (top) winners = Object.keys(counts).filter((k) => counts[k] === top);
    }
    for (const e of this.entries) {
      const gained = this.judging ? (winners.includes(e.key) ? 1 : 0) : counts[e.key] || 0;
      if (gained) {
        points[e.playerId] = (points[e.playerId] || 0) + gained;
        this.scores.set(e.playerId, (this.scores.get(e.playerId) || 0) + gained);
      }
    }
    this.result = { winners, points, counts };
    const best = this.entries.filter((e) => winners.includes(e.key));
    this.history[this.index] = { image: this.image, winners: best.map((e) => ({ playerId: e.playerId, text: e.text })), judgeId: this.judgeId };
    this.phase = 'result';
  }

  // Host: anderes Bild, solange noch gelegt wird
  skipImage() {
    if (this.phase !== 'play' || !this.spare.length) return { error: 'Es gibt kein weiteres Bild.' };
    const next = this.spare.shift();
    this.spare.push(this.images[this.index]);
    this.images[this.index] = next;
    this.lobby.memePlayed?.add(next.id);
    return { ok: true };
  }

  next() {
    if (this.phase === 'play') this.toPick();
    else if (this.phase === 'pick') {
      // Im Juror-Modus entscheidet der Juror, außer er ist weg: dann ohne Gewinner weiter
      if (!this.judging || !this.connected(this.judgeId)) this.toResult();
    } else if (this.phase === 'result') {
      if (this.index + 1 >= this.images.length) {
        this.clearTimer();
        this.phase = 'final';
        return;
      }
      this.index++;
      this.notice = null;
      this.startRound();
    }
  }

  action(player, { type, ...data }) {
    if (['next', 'skipImage'].includes(type) && !player.isHost) return { error: 'Nur der Host darf das.' };
    switch (type) {
      case 'play': return this.play(player, data.joker ? { text: data.text } : { card: data.card });
      case 'unplay': return this.unplay(player);
      case 'swap': return this.swapHand(player);
      case 'choose': return this.choose(player, data.key);
      case 'skipImage': return this.skipImage();
      case 'next': this.next(); return { ok: true };
      default: return { error: 'Unbekannte Aktion.' };
    }
  }

  playersChanged() {
    if (this.phase === 'play' && this.judgeId && !this.connected(this.judgeId)) {
      // Juror ist weg: der Nächste übernimmt, seine gelegte Karte geht zurück auf die Hand
      this.judgeId = this.chooseJudge();
      if (this.judgeId) this.plays.delete(this.judgeId);
    }
    this.checkAllPlayed();
    this.checkAllVoted();
  }

  // ---------- Ansicht ----------

  ranking() {
    const ids = new Set([...this.players().map((p) => p.id), ...this.scores.keys()]);
    return [...ids]
      .filter((id) => this.lobby.players.has(id))
      .map((id) => ({ id, points: this.scores.get(id) || 0 }))
      .sort((a, b) => b.points - a.points);
  }

  view(viewer) {
    const playing = this.isPlaying(viewer);
    const view = {
      phase: this.phase,
      index: this.index,
      total: this.images.length,
      mode: this.settings.mode,
      image: this.image,
      judge: this.judgeId,
      players: this.players().map((p) => p.id),
      ranking: this.ranking(),
      notice: this.notice,
      deadline: this.phase === 'play' ? this.deadline : null,
      paused: false,
      serverNow: Date.now(),
      playing,
      canSkipImage: this.spare.length > 0,
    };
    if (this.phase === 'play') {
      view.played = [...this.plays.keys()];
      view.layers = this.layers().map((p) => p.id);
    }
    if (playing && ['play', 'pick', 'result'].includes(this.phase)) {
      view.hand = this.hand(viewer.id).map((c) => ({ card: c, text: CAPTIONS[c] }));
      view.jokers = this.jokers.get(viewer.id) ?? this.settings.jokers;
      view.canSwap = !this.swapped.has(viewer.id);
      const mine = this.plays.get(viewer.id);
      view.myPlay = this.phase === 'play' && mine ? (mine.text !== undefined ? { text: mine.text, joker: true } : { card: mine.card, text: CAPTIONS[mine.card] }) : null;
    }
    if (this.phase === 'pick') {
      view.entries = this.entries.map((e) => ({ key: e.key, text: e.text, mine: e.playerId === viewer.id }));
      view.voted = [...this.votes.keys()];
      view.myVote = this.votes.get(viewer.id) || null;
      view.judgeGone = this.judging && !this.connected(this.judgeId);
    }
    if (this.phase === 'result') {
      view.entries = this.entries.map((e) => ({ key: e.key, text: e.text, playerId: e.playerId, joker: e.joker, votes: this.result?.counts[e.key] || 0 }));
      view.winners = this.result?.winners || [];
      view.points = this.result?.points || {};
      view.last = this.history[this.index] ?? null;
    }
    if (this.phase === 'final') {
      view.history = this.history.map((h) => (h ? { image: h.image, winners: h.winners } : null));
    }
    return view;
  }

  dispose() {
    this.clearTimer();
  }
}

Memekoenig.wikiImageById = wikiImageById;

module.exports = Memekoenig;
