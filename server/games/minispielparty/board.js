// Brettmodus der Minispiel Party: Würfeln (1–10), Ziehen, Felder, Sterne, Shop und Duelle.
// Nach jeder Runde (jeder hat einmal gewürfelt) ruft der Ablauf in index.js ein Minispiel auf.
// Gezogen wird Schritt für Schritt; an Abzweig, Stern und Shop hält die Figur an und der Spieler entscheidet.

const crypto = require('crypto');
const BOARDS = require('./boards');

const STEP_MS = 280; // pro Feld beim Laufen
const DICE_MS = 1400; // so lange rollt der Würfel
const EFFECT_MS = 2600; // so lange steht die Meldung zum Feld da
const WHEEL_MS = 2600; // Glücksrad dreht sich
const AUTO_MS = 1500; // wer weg ist, für den wird nach dieser Zeit gespielt
const CHOICE_MS = 30000; // danach wird für Unentschlossene gewählt
const START_COINS = 10;
const MAX_ITEMS = 3;
const DUEL_STAKE = 5;

const ITEMS = {
  doppel: { id: 'doppel', name: 'Doppelwürfel', icon: '🎲', price: 6, text: 'Würfle mit zwei Würfeln (2–20).' },
  tausch: { id: 'tausch', name: 'Tauschkarte', icon: '🔄', price: 8, text: 'Tausche den Platz mit einem Mitspieler deiner Wahl.' },
  kompass: { id: 'kompass', name: 'Sternkompass', icon: '🧭', price: 15, text: 'Bringt dich direkt vor den Stern.' },
};

const WHEEL = [
  { id: 'plus5', label: '+5 Münzen', icon: '🪙' },
  { id: 'plus10', label: '+10 Münzen', icon: '💰' },
  { id: 'again', label: 'Nochmal würfeln', icon: '🎲' },
  { id: 'steal', label: '5 Münzen klauen', icon: '🧤' },
  { id: 'item', label: 'Gratis-Gegenstand', icon: '🎁' },
  { id: 'minus3', label: '−3 Münzen', icon: '💸' },
];

const KIND_TEXT = {
  start: 'Start',
  blue: 'Blaues Feld',
  red: 'Rotes Feld',
  event: 'Ereignisfeld',
  luck: 'Glücksrad',
  bad: 'Pechfeld',
  duel: 'Duellfeld',
  shop: 'Shop',
};

function rnd(n) {
  return crypto.randomInt(n);
}

class Board {
  // host: { players(), connected(id), name(id), broadcast(), roundDone(), startDuel(a, b, stake) }
  constructor(host, settings, ids) {
    this.host = host;
    this.settings = settings;
    this.def = BOARDS[settings.board] || BOARDS.rummelplatz;
    this.fieldById = new Map(this.def.fields.map((f) => [f.id, f]));
    this.order = this.shuffle(ids);
    this.p = new Map(this.order.map((id) => [id, this.newPlayer()]));
    this.round = 1;
    this.rounds = settings.rounds;
    this.turnIdx = 0;
    this.turn = null;
    this.star = this.randomStarSpot(null);
    this.log = [];
    this.timer = null;
    this.rng = rnd; // für Tests austauschbar
  }

  shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  newPlayer() {
    return { field: this.def.start, coins: START_COINS, stars: 0, items: [], earned: 0, events: 0, wins: 0, starsBought: 0 };
  }

  randomStarSpot(exclude) {
    const spots = this.def.starSpots.filter((id) => id !== exclude);
    return spots[rnd(spots.length)];
  }

  field(id) {
    return this.fieldById.get(id);
  }

  get price() {
    return this.settings.starPrice;
  }

  get lastRounds() {
    return this.settings.lastDouble && this.round > this.rounds - 3;
  }

  // ---------- Zeit ----------

  clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  later(ms, fn) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
      this.host.broadcast();
    }, ms);
  }

  // ---------- Münzen ----------

  addCoins(id, n) {
    const p = this.p.get(id);
    if (!p) return 0;
    const before = p.coins;
    p.coins = Math.max(0, p.coins + n);
    if (n > 0) p.earned += n;
    return p.coins - before;
  }

  say(text) {
    this.turn.message = text;
    this.log.push(text);
    if (this.log.length > 8) this.log.shift();
  }

  // Neue Spieler kommen mitten im Spiel hinten in die Reihe
  addMissing() {
    for (const id of this.host.players()) {
      if (!this.p.has(id)) {
        this.order.push(id);
        this.p.set(id, this.newPlayer());
      }
    }
  }

  // ---------- Runde und Zug ----------

  startRound() {
    this.addMissing();
    this.turnIdx = 0;
    this.startTurn();
  }

  nextRound() {
    this.round++;
    this.startRound();
  }

  startTurn() {
    this.clearTimer();
    if (this.turnIdx >= this.order.length) {
      this.turn = null;
      this.host.roundDone();
      return;
    }
    const id = this.order[this.turnIdx];
    this.turn = { id, step: 'start', seq: (this.turn?.seq || 0) + 1, dice: null, steps: 0, message: null, usedItem: null, double: false, anim: null, choice: null, wheel: null, extra: false };
    if (!this.host.connected(id)) {
      // Wer nicht da ist, setzt aus
      this.say(`${this.host.name(id)} ist nicht da und setzt aus.`);
      this.turn.step = 'effect';
      this.later(AUTO_MS, () => this.endTurn());
    }
  }

  endTurn() {
    this.turnIdx++;
    this.startTurn();
  }

  // ---------- Aktionen ----------

  action(player, data) {
    const t = this.turn;
    if (!t) return { error: 'Gerade ist niemand am Zug.' };
    const mine = player.id === t.id;
    switch (data.type) {
      case 'roll':
        if (!mine) return { error: 'Du bist nicht dran.' };
        return this.roll();
      case 'useItem':
        if (!mine) return { error: 'Du bist nicht dran.' };
        return this.useItem(data.item);
      case 'choose':
        if (!mine) return { error: 'Du bist nicht dran.' };
        return this.choose(data.value);
      case 'force':
        if (!player.isHost) return { error: 'Nur der Host darf das.' };
        this.force();
        return { ok: true };
      default:
        return { error: 'Unbekannte Aktion.' };
    }
  }

  // Host: für den Spieler am Zug weitermachen
  force() {
    const t = this.turn;
    if (!t) return;
    if (t.step === 'start') this.roll();
    else if (t.step === 'choice') this.choose(t.choice.fallback);
  }

  roll() {
    const t = this.turn;
    if (t.step !== 'start') return { error: 'Gerade wird nicht gewürfelt.' };
    const n = t.double ? 2 : 1;
    t.dice = Array.from({ length: n }, () => this.rng(10) + 1);
    t.steps = t.dice.reduce((s, d) => s + d, 0);
    t.step = 'dice';
    t.rolledAt = Date.now();
    t.message = null;
    this.later(DICE_MS, () => this.advance());
    return { ok: true };
  }

  useItem(itemId) {
    const t = this.turn;
    const p = this.p.get(t.id);
    if (t.step !== 'start' || t.extra) return { error: 'Gegenstände gehen nur vor dem Würfeln.' };
    if (t.usedItem) return { error: 'Nur ein Gegenstand pro Zug.' };
    const idx = p.items.indexOf(itemId);
    if (idx < 0) return { error: 'Diesen Gegenstand hast du nicht.' };
    const others = this.order.filter((id) => id !== t.id && this.host.connected(id));
    if (itemId === 'tausch' && !others.length) return { error: 'Es ist niemand zum Tauschen da.' };
    p.items.splice(idx, 1);
    t.usedItem = itemId;
    if (itemId === 'doppel') {
      t.double = true;
      this.say(`${this.host.name(t.id)} nimmt den Doppelwürfel 🎲🎲`);
    } else if (itemId === 'kompass') {
      const before = this.def.fields.find((f) => f.next.includes(this.star) && !f.shortcut) || this.field(this.star);
      const from = p.field;
      p.field = before.id;
      t.anim = { path: [before.id], from, startAt: Date.now(), teleport: true };
      this.say(`${this.host.name(t.id)} springt mit dem Sternkompass 🧭 direkt vor den Stern!`);
    } else if (itemId === 'tausch') {
      this.ask('swap', others.map((id) => ({ value: id, label: this.host.name(id), player: id })), others[0], 'Mit wem tauschst du den Platz?');
    }
    return { ok: true };
  }

  // Entscheidung vom Spieler am Zug abfragen
  ask(type, options, fallback, title, extra = {}) {
    const t = this.turn;
    t.prevStep = t.step;
    t.step = 'choice';
    t.message = null;
    t.choice = { type, options, fallback, title, ...extra };
    const ms = this.host.connected(t.id) ? CHOICE_MS : AUTO_MS;
    this.later(ms, () => this.choose(fallback));
  }

  choose(value) {
    const t = this.turn;
    if (t.step !== 'choice') return { error: 'Gerade gibt es nichts zu entscheiden.' };
    const c = t.choice;
    if (!c.options.some((o) => o.value === value)) return { error: 'Ungültige Wahl.' };
    this.clearTimer();
    t.choice = null;
    const name = this.host.name(t.id);
    const p = this.p.get(t.id);
    switch (c.type) {
      case 'fork':
        t.nextField = value;
        this.advance();
        break;
      case 'star':
        if (value === 'yes' && p.coins >= this.price) {
          p.coins -= this.price;
          p.stars++;
          p.starsBought++;
          const old = this.star;
          this.star = this.randomStarSpot(old);
          t.starMoved = { from: old, to: this.star, at: Date.now() };
          this.say(`⭐ ${name} kauft einen Stern! Er wandert weiter.`);
        }
        this.continueMove(value === 'yes' ? 1500 : 0);
        break;
      case 'shop':
        if (value !== 'none') {
          const item = ITEMS[value];
          if (item && p.coins >= item.price && p.items.length < MAX_ITEMS) {
            p.coins -= item.price;
            p.items.push(item.id);
            this.say(`🛒 ${name} kauft ${item.icon} ${item.name}.`);
          }
        }
        this.continueMove(value !== 'none' ? 1200 : 0);
        break;
      case 'swap': {
        const other = this.p.get(value);
        const from = p.field;
        p.field = other.field;
        other.field = from;
        t.anim = { path: [p.field], from, startAt: Date.now(), teleport: true, swap: { id: value, from: p.field, to: from } };
        this.say(`🔄 ${name} tauscht den Platz mit ${this.host.name(value)}!`);
        t.step = c.after || 'start';
        if (c.after === 'effect') this.later(EFFECT_MS, () => this.endTurn());
        break;
      }
      case 'steal': {
        const got = -this.addCoins(value, -5);
        this.addCoins(t.id, got);
        this.say(`🧤 ${name} klaut ${this.host.name(value)} ${got} ${got === 1 ? 'Münze' : 'Münzen'}!`);
        this.finishEffect();
        break;
      }
      case 'duel':
        this.say(`⚔️ ${name} fordert ${this.host.name(value)} zum Duell um ${DUEL_STAKE} Münzen!`);
        t.step = 'effect';
        this.later(1800, () => this.host.startDuel(t.id, value, DUEL_STAKE));
        break;
      default:
        break;
    }
    return { ok: true };
  }

  // ---------- Laufen ----------

  // Figur läuft, bis die Schritte aufgebraucht sind oder sie an Abzweig, Stern oder Shop anhält
  advance() {
    const t = this.turn;
    const p = this.p.get(t.id);
    const from = p.field;
    const path = [];
    let pause = null;
    let f = from;
    while (t.steps > 0) {
      const next = this.field(f).next;
      if (next.length > 1 && t.nextField === undefined) {
        pause = 'fork';
        break;
      }
      f = t.nextField !== undefined ? t.nextField : next[0];
      delete t.nextField;
      t.steps--;
      path.push(f);
      if (f === this.star) {
        pause = 'star';
        break;
      }
      if (this.field(f).kind === 'shop') {
        pause = 'shop';
        break;
      }
    }
    p.field = f;
    t.step = 'moving';
    t.anim = path.length ? { path, from, startAt: Date.now() } : t.anim;
    this.later(path.length * STEP_MS + 250, () => {
      if (pause === 'fork') {
        const labels = this.def.forks?.[f] || {};
        const options = this.field(f).next.map((id) => ({ value: id, label: labels[id] || `Richtung ${id}` }));
        this.ask('fork', options, options[0].value, 'Wohin geht es weiter?');
      } else if (pause === 'star') this.offerStar();
      else if (pause === 'shop') this.offerShop();
      else this.land();
    });
  }

  continueMove(delay = 0) {
    const t = this.turn;
    t.step = 'moving';
    const go = () => (t.steps > 0 ? this.advance() : this.land());
    if (delay) this.later(delay, go);
    else go();
  }

  offerStar() {
    const t = this.turn;
    const p = this.p.get(t.id);
    if (p.coins < this.price) {
      this.say(`⭐ ${this.host.name(t.id)} kommt am Stern vorbei, hat aber keine ${this.price} Münzen.`);
      this.continueMove(1600);
      return;
    }
    this.ask('star', [{ value: 'yes', label: `Ja, Stern kaufen (${this.price} 🪙)` }, { value: 'no', label: 'Nein, weiter' }], 'yes', `Stern für ${this.price} Münzen kaufen?`);
  }

  offerShop() {
    const t = this.turn;
    const p = this.p.get(t.id);
    const items = Object.values(ITEMS);
    const affordable = items.filter((i) => i.price <= p.coins);
    if (!affordable.length || p.items.length >= MAX_ITEMS) {
      this.continueMove(0);
      return;
    }
    this.ask('shop', [...affordable.map((i) => ({ value: i.id, label: `${i.icon} ${i.name} (${i.price} 🪙)`, text: i.text })), { value: 'none', label: 'Nichts kaufen' }], 'none', '🛒 Shop: Willst du etwas kaufen?');
  }

  // ---------- Felder ----------

  land() {
    const t = this.turn;
    const id = t.id;
    const name = this.host.name(id);
    const p = this.p.get(id);
    const kind = this.field(p.field).kind;
    const m = this.lastRounds ? 2 : 1;
    t.landed = { field: p.field, kind };
    const others = this.order.filter((o) => o !== id && this.host.connected(o));
    switch (kind) {
      case 'blue':
        this.addCoins(id, 3 * m);
        this.say(`🔵 ${name}: +${3 * m} Münzen`);
        break;
      case 'red': {
        const lost = -this.addCoins(id, -3 * m);
        this.say(`🔴 ${name}: −${lost} Münzen`);
        break;
      }
      case 'event':
        p.events++;
        this.event();
        return;
      case 'luck':
        this.spinWheel();
        return;
      case 'bad':
        this.bad();
        break;
      case 'duel':
        if (others.length) {
          this.ask('duel', others.map((o) => ({ value: o, label: this.host.name(o), player: o })), others[this.rng(others.length)], '⚔️ Duell! Wen forderst du heraus?');
          return;
        }
        this.say(`⚔️ ${name}: Kein Gegner da, kein Duell.`);
        break;
      default:
        this.say(`${name} landet auf ${KIND_TEXT[kind] || 'einem Feld'}.`);
    }
    this.finishEffect();
  }

  finishEffect() {
    const t = this.turn;
    t.step = 'effect';
    this.later(EFFECT_MS, () => this.endTurn());
  }

  event() {
    const t = this.turn;
    const id = t.id;
    const name = this.host.name(id);
    const p = this.p.get(id);
    const others = this.order.filter((o) => o !== id && this.host.connected(o));
    const options = ['rain', 'star', 'wind', 'gift'];
    if (others.length) options.push('swap');
    const e = options[this.rng(options.length)];
    if (e === 'rain') {
      for (const o of this.order) this.addCoins(o, 5);
      this.say(`❓ Münzregen! Alle bekommen 5 Münzen. 🌧️🪙`);
    } else if (e === 'star') {
      const old = this.star;
      this.star = this.randomStarSpot(old);
      t.starMoved = { from: old, to: this.star, at: Date.now() };
      this.say('❓ Der Stern hat keine Lust mehr und wandert woanders hin! ⭐💨');
    } else if (e === 'gift') {
      let sum = 0;
      for (const o of others) sum += -this.addCoins(o, -2);
      this.addCoins(id, sum);
      this.say(`❓ Geschenkt! Alle geben ${name} 2 Münzen (${sum} 🪙).`);
    } else if (e === 'swap') {
      const o = others[this.rng(others.length)];
      const other = this.p.get(o);
      const from = p.field;
      p.field = other.field;
      other.field = from;
      t.anim = { path: [p.field], from, startAt: Date.now(), teleport: true, swap: { id: o, from: p.field, to: from } };
      this.say(`❓ Platztausch! ${name} und ${this.host.name(o)} tauschen die Plätze.`);
    } else {
      // Rückenwind: drei Felder weiter, dort zählt nur Blau/Rot, sonst +3
      this.say(`❓ Rückenwind! ${name} rückt 3 Felder vor. 💨`);
      t.steps = 3;
      t.wind = true;
      t.step = 'effect';
      this.later(1600, () => this.windMove());
      return;
    }
    this.finishEffect();
  }

  windMove() {
    const t = this.turn;
    const p = this.p.get(t.id);
    const from = p.field;
    const path = [];
    let f = from;
    for (let i = 0; i < 3; i++) {
      f = this.field(f).next[0];
      path.push(f);
    }
    p.field = f;
    t.anim = { path, from, startAt: Date.now() };
    t.step = 'moving';
    this.later(path.length * STEP_MS + 250, () => {
      const kind = this.field(f).kind;
      const name = this.host.name(t.id);
      if (kind === 'red') {
        const lost = -this.addCoins(t.id, -3);
        this.say(`🔴 ${name}: −${lost} Münzen`);
      } else {
        this.addCoins(t.id, 3);
        this.say(`🔵 ${name}: +3 Münzen`);
      }
      this.finishEffect();
    });
  }

  spinWheel() {
    const t = this.turn;
    const index = this.rng(WHEEL.length);
    t.wheel = { options: WHEEL, index, at: Date.now() };
    t.step = 'wheel';
    this.later(WHEEL_MS, () => this.wheelResult(WHEEL[index].id));
  }

  wheelResult(id) {
    const t = this.turn;
    const me = t.id;
    const name = this.host.name(me);
    const p = this.p.get(me);
    const others = this.order.filter((o) => o !== me && this.host.connected(o) && this.p.get(o).coins > 0);
    if (id === 'plus5' || id === 'plus10') {
      const n = id === 'plus5' ? 5 : 10;
      this.addCoins(me, n);
      this.say(`🍀 ${name}: +${n} Münzen!`);
    } else if (id === 'minus3') {
      const lost = -this.addCoins(me, -3);
      this.say(`🍀 Pech gehabt! ${name}: −${lost} Münzen`);
    } else if (id === 'item') {
      const keys = Object.keys(ITEMS);
      const item = ITEMS[keys[this.rng(keys.length)]];
      if (p.items.length < MAX_ITEMS) {
        p.items.push(item.id);
        this.say(`🍀 ${name} bekommt ${item.icon} ${item.name} geschenkt!`);
      } else {
        this.addCoins(me, 5);
        this.say(`🍀 ${name} hat keinen Platz mehr und bekommt 5 Münzen.`);
      }
    } else if (id === 'steal') {
      if (others.length) {
        this.ask('steal', others.map((o) => ({ value: o, label: `${this.host.name(o)} (${this.p.get(o).coins} 🪙)`, player: o })), others[this.rng(others.length)], '🧤 Wem klaust du 5 Münzen?');
        return;
      }
      this.addCoins(me, 3);
      this.say(`🍀 Niemand zum Beklauen da, ${name} bekommt 3 Münzen.`);
    } else if (id === 'again') {
      this.say(`🍀 ${name} darf nochmal würfeln!`);
      t.step = 'start';
      t.extra = true;
      t.double = false;
      t.dice = null;
      if (!this.host.connected(me)) this.later(AUTO_MS, () => this.roll());
      return;
    }
    this.finishEffect();
  }

  bad() {
    const t = this.turn;
    const id = t.id;
    const name = this.host.name(id);
    const p = this.p.get(id);
    const last = this.standings().filter((e) => e.id !== id && this.host.connected(e.id)).pop();
    if (this.rng(2) === 0 || !last) {
      const lost = Math.floor(p.coins / 2);
      p.coins -= lost;
      this.say(`💀 Pech! ${name} verliert die Hälfte der Münzen (${lost} 🪙).`);
    } else {
      const given = -this.addCoins(id, -5);
      this.addCoins(last.id, given);
      this.say(`💀 Pech! ${name} muss ${this.host.name(last.id)} ${given} Münzen schenken.`);
    }
  }

  // Ergebnis eines Duells: Sieger bekommt den Einsatz vom Verlierer
  duelDone(winner, loser) {
    const t = this.turn;
    if (winner) {
      const got = -this.addCoins(loser, -DUEL_STAKE);
      this.addCoins(winner, got);
      this.say(`⚔️ ${this.host.name(winner)} gewinnt das Duell und bekommt ${got} Münzen von ${this.host.name(loser)}!`);
    } else this.say('⚔️ Unentschieden! Niemand zahlt.');
    if (t) this.finishEffect();
  }

  // Münzen aus dem Minispiel (Platzpunkte mal zwei)
  minigameCoins(groups) {
    const out = [];
    for (const g of groups) {
      for (const id of g.ids) {
        if (!this.p.has(id)) continue;
        const coins = g.points * 2;
        this.addCoins(id, coins);
        out.push({ id, coins });
      }
    }
    if (groups.length > 1) for (const id of groups[0].ids) if (this.p.has(id)) this.p.get(id).wins++;
    return out;
  }

  // Bonussterne am Ende
  bonusStars() {
    if (!this.settings.bonusStars) return [];
    const awards = [
      { key: 'wins', title: 'Minispiel-König', icon: '👑', units: ['Minispiel gewonnen', 'Minispiele gewonnen'] },
      { key: 'earned', title: 'Münzsammler', icon: '💰', units: ['Münze eingesammelt', 'Münzen eingesammelt'] },
      { key: 'events', title: 'Ereignis-Magnet', icon: '❓', units: ['Ereignisfeld', 'Ereignisfelder'] },
    ];
    const result = [];
    for (const a of awards) {
      const max = Math.max(0, ...this.order.map((id) => this.p.get(id)[a.key]));
      if (!max) continue;
      const ids = this.order.filter((id) => this.p.get(id)[a.key] === max);
      for (const id of ids) this.p.get(id).stars++;
      const { units, ...rest } = a;
      result.push({ ...rest, unit: units[max === 1 ? 0 : 1], ids, n: max });
    }
    return result;
  }

  standings() {
    const list = this.order.map((id) => ({ id, stars: this.p.get(id).stars, coins: this.p.get(id).coins })).sort((a, b) => b.stars - a.stars || b.coins - a.coins);
    let place = 0;
    return list.map((e, i) => {
      if (i === 0 || e.stars !== list[i - 1].stars || e.coins !== list[i - 1].coins) place = i + 1;
      return { ...e, place };
    });
  }

  playersChanged() {
    const t = this.turn;
    if (!t || this.host.connected(t.id)) return;
    // Spieler am Zug ist weg: für ihn weitermachen
    if (t.step === 'start') this.later(AUTO_MS, () => this.roll());
    else if (t.step === 'choice') this.later(AUTO_MS, () => this.choose(t.choice.fallback));
  }

  // ---------- Ansicht ----------

  view(viewer) {
    const t = this.turn;
    return {
      def: { id: this.def.id, name: this.def.name, icon: this.def.icon, fields: this.def.fields },
      round: this.round,
      rounds: this.rounds,
      lastRounds: this.lastRounds,
      price: this.price,
      star: this.star,
      order: this.order,
      players: Object.fromEntries([...this.p].map(([id, p]) => [id, { field: p.field, coins: p.coins, stars: p.stars, items: p.items }])),
      standings: this.standings(),
      items: ITEMS,
      turn: t && {
        id: t.id,
        seq: t.seq,
        step: t.step,
        dice: t.dice,
        rolledAt: t.rolledAt,
        anim: t.anim,
        message: t.message,
        usedItem: t.usedItem,
        double: t.double,
        extra: t.extra,
        wheel: t.wheel,
        starMoved: t.starMoved,
        // Entscheidungen sieht nur der Spieler am Zug (und alle sehen, dass entschieden wird)
        choice: t.choice && (viewer.id === t.id || viewer.isHost ? t.choice : { type: t.choice.type, title: t.choice.title }),
      },
      log: this.log.slice(-5),
      timing: { step: STEP_MS, dice: DICE_MS, wheel: WHEEL_MS },
    };
  }

  dispose() {
    this.clearTimer();
  }
}

Board.ITEMS = ITEMS;
Board.WHEEL = WHEEL;
Board.DUEL_STAKE = DUEL_STAKE;

module.exports = Board;
