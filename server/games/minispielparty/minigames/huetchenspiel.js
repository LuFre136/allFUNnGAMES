// Hütchenspiel (einer gegen alle): Unter einem von drei Hütchen liegt eine Kugel. Der Einzelne vertauscht die Hütchen,
// so schnell und so oft er kann. Danach rät die Gruppe, wo die Kugel ist. Zwei Runden.
// Liegt mindestens die Hälfte aller Tipps richtig, gewinnt die Gruppe.

const { randInt } = require('../helpers');

const CUPS = 3;
const ROUNDS = 2;
const SHOW_MS = 2000; // Kugel zeigen
const SHUFFLE_MS = 9000; // so lange darf getauscht werden
const SWAP_MS = 420; // ein Tausch dauert so lange
const GUESS_MS = 8000;
const REVEAL_MS = 3000;

module.exports = {
  id: 'huetchenspiel',
  name: 'Hütchenspiel',
  icon: '🥜',
  formats: ['solo'],
  short: 'Einer vertauscht die Hütchen, alle anderen behalten die Kugel im Blick.',
  howto: 'Unter einem von drei Hütchen liegt eine Kugel. Der Einzelne tippt zwei Hütchen an, um sie zu vertauschen, so oft er in 9 Sekunden schafft. Alle anderen behalten die Kugel im Auge und tippen danach auf das richtige Hütchen. Zwei Runden. Liegt mindestens die Hälfte aller Tipps richtig, gewinnt die Gruppe.',
  SWAP_MS,
  CUPS,
  create(ctx) {
    const dealer = ctx.solo;
    let guessers = [...ctx.group];
    const rounds = [];
    let current = -1;
    let right = 0;
    let total = 0;
    let stepTimer = null;

    function startRound(at) {
      current++;
      const rd = {
        ball: randInt(0, CUPS - 1), // Platz, unter dem die Kugel am Anfang liegt
        showUntil: at + SHOW_MS,
        shuffleEnd: at + SHOW_MS + SHUFFLE_MS,
        swaps: [], // { a, b, at } Plätze, die getauscht werden
        state: 'shuffle', // shuffle | guess | reveal
        guessEnd: 0,
        guesses: new Map(),
        revealUntil: 0,
        result: null,
      };
      rounds.push(rd);
      stepTimer = ctx.timer(rd.shuffleEnd, () => toGuess(rd));
    }

    // Wo liegt die Kugel nach allen Täuschen?
    function ballSlot(rd) {
      let slot = rd.ball;
      for (const s of rd.swaps) {
        if (slot === s.a) slot = s.b;
        else if (slot === s.b) slot = s.a;
      }
      return slot;
    }

    function lastEnd(rd) {
      const last = rd.swaps[rd.swaps.length - 1];
      return last ? last.at + SWAP_MS : 0;
    }

    function toGuess(rd) {
      if (rd.state !== 'shuffle') return;
      ctx.clear(stepTimer);
      rd.state = 'guess';
      // Raten geht los, sobald der letzte Tausch zu Ende ist
      const from = Math.max(Date.now(), lastEnd(rd));
      rd.guessFrom = from;
      rd.guessEnd = from + GUESS_MS;
      stepTimer = ctx.timer(rd.guessEnd, () => reveal(rd));
    }

    function reveal(rd) {
      if (rd.state !== 'guess') return;
      ctx.clear(stepTimer);
      const slot = ballSlot(rd);
      const ok = guessers.filter((id) => rd.guesses.get(id) === slot);
      right += ok.length;
      total += guessers.length;
      rd.result = { slot, ok };
      rd.state = 'reveal';
      rd.revealUntil = Date.now() + REVEAL_MS;
      if (current + 1 >= ROUNDS) ctx.timer(rd.revealUntil, () => ctx.finish());
      else ctx.timer(rd.revealUntil, () => startRound(Date.now()));
    }

    const check = () => {
      const rd = rounds[current];
      if (rd?.state === 'guess' && guessers.every((id) => rd.guesses.has(id) || !ctx.connected(id))) reveal(rd);
    };

    startRound(ctx.startAt);

    return {
      view(viewer) {
        const rd = rounds[current];
        const isDealer = viewer.id === dealer;
        return {
          dealer,
          guessers,
          round: current + 1,
          rounds: ROUNDS,
          swapMs: SWAP_MS,
          state: rd.state,
          // Die Kugel kennt der Einzelne immer, die anderen sehen sie nur am Anfang und bei der Auflösung
          ball: rd.ball,
          showUntil: rd.showUntil,
          shuffleEnd: rd.shuffleEnd,
          swaps: rd.swaps,
          guessFrom: rd.guessFrom || 0,
          guessEnd: rd.guessEnd,
          guessed: [...rd.guesses.keys()],
          mine: rd.guesses.has(viewer.id) ? rd.guesses.get(viewer.id) : null,
          result: rd.state === 'reveal' ? { ...rd.result, guesses: Object.fromEntries(rd.guesses) } : null,
          dealerSlot: isDealer ? ballSlot(rd) : null,
          right,
          total,
        };
      },
      action(player, { type, a, b, slot }) {
        const rd = rounds[current];
        const now = Date.now();
        if (type === 'swap') {
          if (player.id !== dealer) return { error: 'Nur der Einzelne tauscht.' };
          if (rd.state !== 'shuffle' || now < rd.showUntil) return { error: 'Gerade wird nicht getauscht.' };
          const x = Number(a);
          const y = Number(b);
          if (![x, y].every((v) => Number.isInteger(v) && v >= 0 && v < CUPS) || x === y) return { error: 'Zwei verschiedene Hütchen antippen.' };
          const at = Math.max(now, lastEnd(rd));
          if (at + SWAP_MS > rd.shuffleEnd + SWAP_MS) return { error: 'Die Zeit ist um.' };
          rd.swaps.push({ a: x, b: y, at });
          return { ok: true };
        }
        if (type === 'done') {
          if (player.id === dealer && rd.state === 'shuffle' && rd.swaps.length) toGuess(rd);
          return { ok: true };
        }
        if (type !== 'guess') return { error: 'Unbekannte Aktion.' };
        if (!guessers.includes(player.id)) return { error: 'Du rätst hier nicht mit.' };
        if (rd.state !== 'guess' || now < rd.guessFrom) return { error: 'Noch wird getauscht.' };
        const s = Number(slot);
        if (!Number.isInteger(s) || s < 0 || s >= CUPS) return { error: 'Dieses Hütchen gibt es nicht.' };
        rd.guesses.set(player.id, s);
        check();
        return { ok: true };
      },
      playersChanged() {
        if (!ctx.connected(dealer)) {
          ctx.finish();
          return;
        }
        guessers = guessers.filter((id) => ctx.connected(id));
        if (!guessers.length) ctx.finish();
        else check();
      },
      ranking() {
        const groupWins = !ctx.connected(dealer) || (total > 0 && right * 2 >= total);
        return { winner: groupWins ? 'group' : 'solo', info: `${right} von ${total} ${total === 1 ? 'Tipp' : 'Tipps'} richtig.` };
      },
    };
  },
};
