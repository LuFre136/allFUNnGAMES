// Torwart (einer gegen alle): Die Gruppe schießt, jeder wählt still eine Ecke. Der Torwart wählt jede Runde eine Ecke.
// Wer in die Ecke des Torwarts schießt, wird gehalten. Hält er mindestens jeden dritten Schuss, gewinnt er.

const ROUNDS = 5;
const CHOOSE = 6000;
const REVEAL = 2500;
const CORNERS = 3;

module.exports = {
  id: 'torwart',
  name: 'Torwart',
  icon: '🥅',
  formats: ['solo'],
  short: 'Einer hält, alle schießen: Wer errät die Ecke?',
  howto: 'Einer steht im Tor, alle anderen schießen. Jede Runde wählt jeder Schütze still eine Ecke, der Torwart wählt die Ecke, in die er springt. Wer in seine Ecke schießt, wird gehalten. Fünf Runden. Hält der Torwart mindestens jeden dritten Schuss, gewinnt er, sonst die Schützen.',
  CORNERS,
  create(ctx) {
    const keeper = ctx.solo;
    let shooters = [...ctx.group];
    let round = 0;
    let state = 'choose'; // choose | reveal
    let deadline = 0;
    let picks = new Map();
    let roundTimer = null;
    let last = null; // { keeper, shots: { id: Ecke | null }, saved: [ids] }
    let goals = 0;
    let saves = 0;
    let shots = 0;
    const goalsBy = new Map();

    function startRound(at) {
      round++;
      state = 'choose';
      picks = new Map();
      deadline = at + CHOOSE;
      roundTimer = ctx.timer(deadline, reveal);
    }

    function reveal() {
      if (state !== 'choose') return;
      ctx.clear(roundTimer);
      // Springt der Torwart nicht, bleibt er in der Mitte
      const dive = picks.has(keeper) ? picks.get(keeper) : 1;
      const shotMap = {};
      const saved = [];
      for (const id of shooters) {
        const corner = picks.has(id) ? picks.get(id) : null;
        shotMap[id] = corner;
        shots++;
        if (corner === null || corner === dive) {
          saves++;
          saved.push(id);
        } else {
          goals++;
          goalsBy.set(id, (goalsBy.get(id) || 0) + 1);
        }
      }
      last = { keeper: dive, shots: shotMap, saved };
      state = 'reveal';
      deadline = Date.now() + REVEAL;
      if (round >= ROUNDS) ctx.timer(deadline, () => ctx.finish());
      else ctx.timer(deadline, () => startRound(Date.now()));
    }

    const check = () => {
      if (state === 'choose' && [keeper, ...shooters].every((id) => picks.has(id) || !ctx.connected(id))) reveal();
    };

    const need = () => Math.ceil(shots / 3);

    startRound(ctx.startAt);

    return {
      view(viewer) {
        return {
          round,
          rounds: ROUNDS,
          state,
          deadline,
          keeper,
          shooters,
          picked: [...picks.keys()],
          mine: picks.has(viewer.id) ? picks.get(viewer.id) : null,
          last: state === 'reveal' ? last : null,
          goals,
          saves,
          shots,
          need: Math.ceil((ROUNDS * shooters.length) / 3),
        };
      },
      action(player, { type, corner }) {
        if (type !== 'pick') return { error: 'Unbekannte Aktion.' };
        if (state !== 'choose' || Date.now() < ctx.startAt) return { error: 'Gerade wird nicht gewählt.' };
        if (player.id !== keeper && !shooters.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        const c = Number(corner);
        if (!Number.isInteger(c) || c < 0 || c >= CORNERS) return { error: 'Diese Ecke gibt es nicht.' };
        picks.set(player.id, c);
        check();
        return { ok: true };
      },
      playersChanged() {
        if (!ctx.connected(keeper)) {
          ctx.finish();
          return;
        }
        shooters = shooters.filter((id) => ctx.connected(id));
        if (!shooters.length) ctx.finish();
        else check();
      },
      ranking() {
        const keeperWins = shots > 0 && saves >= need();
        return {
          winner: !ctx.connected(keeper) ? 'group' : keeperWins ? 'solo' : 'group',
          info: `${saves} von ${shots} ${shots === 1 ? 'Schuss' : 'Schüssen'} gehalten (nötig: ${need()}), ${goals} ${goals === 1 ? 'Tor' : 'Tore'}.`,
        };
      },
    };
  },
};
