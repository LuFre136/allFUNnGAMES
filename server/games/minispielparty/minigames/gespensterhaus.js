// Gespensterhaus (einer gegen alle): Die Gruppe versteckt sich hinter Türen, das Gespenst öffnet einige davon.
// Drei Runden. Wer erwischt wird, ist raus. Überlebt mindestens einer, gewinnt die Gruppe.

const { randInt } = require('../helpers');
const { shuffle } = require('../../../util');

const DOORS = 6;
const ROUNDS = 3;
const CHOOSE = 9000;
const REVEAL = 3500;

module.exports = {
  id: 'gespensterhaus',
  name: 'Gespensterhaus',
  icon: '👻',
  formats: ['solo'],
  short: 'Alle verstecken sich, das Gespenst öffnet Türen.',
  howto: 'Einer ist das Gespenst, alle anderen verstecken sich: Jeder wählt still eine von sechs Türen. Gleichzeitig wählt das Gespenst, welche Türen es öffnet. Wer hinter einer offenen Tür steckt, ist raus. Drei Runden. Überlebt mindestens einer, gewinnt die Gruppe, sonst das Gespenst.',
  DOORS,
  create(ctx) {
    const ghost = ctx.solo;
    let alive = [...ctx.group];
    const opens = ctx.group.length >= 4 ? 3 : 2; // so viele Türen darf das Gespenst öffnen
    let round = 0;
    let state = 'choose';
    let deadline = 0;
    let hides = new Map();
    let ghostPick = [];
    let roundTimer = null;
    let last = null;
    const out = [];

    function startRound(at) {
      round++;
      state = 'choose';
      hides = new Map();
      ghostPick = [];
      deadline = at + CHOOSE;
      roundTimer = ctx.timer(deadline, reveal);
    }

    function reveal() {
      if (state !== 'choose') return;
      ctx.clear(roundTimer);
      for (const id of alive) if (!hides.has(id)) hides.set(id, randInt(0, DOORS - 1));
      // Wählt das Gespenst zu wenige Türen, öffnet es den Rest zufällig
      const opened = [...ghostPick];
      for (const d of shuffle([...Array(DOORS).keys()])) if (opened.length < opens && !opened.includes(d)) opened.push(d);
      const caught = alive.filter((id) => opened.includes(hides.get(id)));
      last = { opened, hides: Object.fromEntries(hides), caught };
      out.push(...caught);
      alive = alive.filter((id) => !caught.includes(id));
      state = 'reveal';
      deadline = Date.now() + REVEAL;
      if (!alive.length || round >= ROUNDS) ctx.timer(deadline, () => ctx.finish());
      else ctx.timer(deadline, () => startRound(Date.now()));
    }

    const check = () => {
      if (state !== 'choose') return;
      const ghostDone = ghostPick.length >= opens || !ctx.connected(ghost);
      if (ghostDone && alive.every((id) => hides.has(id) || !ctx.connected(id))) reveal();
    };

    startRound(ctx.startAt);

    return {
      view(viewer) {
        return {
          round,
          rounds: ROUNDS,
          state,
          deadline,
          doors: DOORS,
          opens,
          ghost,
          alive,
          out,
          hidden: [...hides.keys()],
          mine: hides.has(viewer.id) ? hides.get(viewer.id) : null,
          ghostPick: viewer.id === ghost ? ghostPick : null,
          ghostDone: ghostPick.length >= opens,
          last: state === 'reveal' ? last : null,
        };
      },
      action(player, { type, door }) {
        if (state !== 'choose' || Date.now() < ctx.startAt) return { error: 'Gerade wird nicht gewählt.' };
        const d = Number(door);
        if (!Number.isInteger(d) || d < 0 || d >= DOORS) return { error: 'Diese Tür gibt es nicht.' };
        if (type === 'hide' && alive.includes(player.id)) hides.set(player.id, d);
        else if (type === 'open' && player.id === ghost) {
          // Antippen schaltet um, höchstens `opens` Türen
          if (ghostPick.includes(d)) ghostPick = ghostPick.filter((x) => x !== d);
          else if (ghostPick.length < opens) ghostPick.push(d);
          else ghostPick = [...ghostPick.slice(1), d];
        } else return { error: 'Das geht gerade nicht.' };
        check();
        return { ok: true };
      },
      playersChanged() {
        if (!ctx.connected(ghost)) {
          ctx.finish();
          return;
        }
        alive = alive.filter((id) => ctx.connected(id));
        if (!alive.length) ctx.finish();
        else check();
      },
      ranking() {
        const groupWins = alive.length > 0;
        return {
          winner: groupWins ? 'group' : 'solo',
          info: groupWins ? `${alive.length} ${alive.length === 1 ? 'hat' : 'haben'} überlebt.` : 'Das Gespenst hat alle erwischt!',
        };
      },
    };
  },
};
