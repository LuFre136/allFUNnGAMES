// Glückstür: Jeder wählt geheim eine Tür. Hinter einer (bei vielen Spielern zwei) lauert ein Gespenst.
// Wer sie gewählt hat, ist raus. Weiter, bis einer übrig ist. Wählen alle die Falle, passiert nichts.

const { randInt } = require('../helpers');
const { shuffle } = require('../../../util');

const CHOOSE = 10000;
const REVEAL = 4000;
const MAX_ROUNDS = 12;

function layout(alive) {
  if (alive >= 7) return { doors: 5, traps: 2 };
  if (alive >= 4) return { doors: 4, traps: 1 };
  return { doors: 3, traps: 1 };
}

module.exports = {
  id: 'glueckstuer',
  name: 'Glückstür',
  icon: '🚪',
  short: 'Wähle eine Tür und hoffe, dass dahinter kein Gespenst wartet.',
  howto: 'Jede Runde wählt jeder geheim eine Tür. Hinter einer lauert ein Gespenst, bei vielen Spielern hinter zwei. Wer die falsche Tür erwischt, ist raus. Wer nicht wählt, bekommt eine zufällige Tür. Weiter, bis nur noch einer übrig ist.',
  create(ctx) {
    let alive = [...ctx.ids];
    const eliminated = []; // pro Runde die Ausgeschiedenen
    let round = 0;
    let state = 'choose'; // choose | reveal
    let doors = 3;
    let traps = [];
    let deadline = 0;
    let choices = new Map();
    let last = null; // { traps, choices, out, saved }
    let roundTimer = null;

    function startRound(at) {
      round++;
      state = 'choose';
      ({ doors } = layout(alive.length));
      const n = layout(alive.length).traps;
      traps = shuffle([...Array(doors).keys()]).slice(0, n);
      choices = new Map();
      deadline = at + CHOOSE;
      roundTimer = ctx.timer(deadline, reveal);
    }

    function reveal() {
      if (state !== 'choose') return;
      ctx.clear(roundTimer);
      for (const id of alive) if (!choices.has(id)) choices.set(id, randInt(0, doors - 1));
      let out = alive.filter((id) => traps.includes(choices.get(id)));
      const saved = out.length === alive.length;
      if (saved) out = [];
      last = { traps, choices: Object.fromEntries(choices), out, saved, doors };
      if (out.length) eliminated.push(out);
      alive = alive.filter((id) => !out.includes(id));
      state = 'reveal';
      deadline = Date.now() + REVEAL;
      if (alive.length <= 1 || round >= MAX_ROUNDS) ctx.timer(deadline, () => ctx.finish());
      else ctx.timer(deadline, () => startRound(Date.now()));
    }

    const check = () => {
      if (state === 'choose' && alive.every((id) => choices.has(id) || !ctx.connected(id))) reveal();
    };

    startRound(ctx.startAt);

    return {
      view(viewer) {
        return {
          round,
          state,
          doors,
          trapCount: state === 'choose' ? traps.length : last?.traps.length,
          deadline,
          alive,
          chosen: [...choices.keys()],
          mine: choices.has(viewer.id) ? choices.get(viewer.id) : null,
          last: state === 'reveal' ? last : null,
        };
      },
      action(player, { type, door }) {
        if (type !== 'choose') return { error: 'Unbekannte Aktion.' };
        if (state !== 'choose' || Date.now() < ctx.startAt) return { error: 'Gerade wird keine Tür gewählt.' };
        if (!alive.includes(player.id)) return { error: 'Du bist schon raus.' };
        const d = Number(door);
        if (!Number.isInteger(d) || d < 0 || d >= doors) return { error: 'Diese Tür gibt es nicht.' };
        choices.set(player.id, d);
        check();
        return { ok: true };
      },
      playersChanged() {
        const gone = alive.filter((id) => !ctx.connected(id));
        if (gone.length) {
          eliminated.push(gone);
          alive = alive.filter((id) => ctx.connected(id));
        }
        if (alive.length <= 1 && state === 'choose') ctx.finish();
        else check();
      },
      ranking() {
        const groups = [{ ids: alive, label: 'überlebt 🏅' }];
        for (let i = eliminated.length - 1; i >= 0; i--) groups.push({ ids: eliminated[i], label: 'vom Gespenst erwischt 👻' });
        return { groups: groups.filter((g) => g.ids.length) };
      },
    };
  },
};
