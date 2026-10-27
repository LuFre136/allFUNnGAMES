// Einzelgänger: Viele Figuren, jede kommt zweimal vor, nur eine einzige einmal. Wer sie zuerst antippt, ist schneller.
// Vier Runden. Gezählt wird die Zeit über alle Runden, ein falscher Tipp kostet 3 Sekunden.

const { groupsOf, withMissing, seconds } = require('../helpers');
const { shuffle } = require('../../../util');

const POOL = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦉', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢', '🐍', '🐙', '🦀', '🐠', '🐳'];
const ROUNDS = 4;
const ROUND_MS = 15000;
const PAUSE = 2000; // Auflösung zwischen den Runden
const PAIRS = 12; // 12 Paare + 1 Einzelgänger = 25 Felder (5 × 5)
const PENALTY = 3000;

module.exports = {
  id: 'einzelgaenger',
  name: 'Einzelgänger',
  icon: '🔍',
  short: 'Alle Figuren gibt es doppelt, nur eine nicht. Finde sie!',
  howto: 'Auf dem Feld ist jede Figur zweimal zu sehen, nur eine einzige einmal. Tippe sie so schnell wie möglich an. Ein falscher Tipp kostet 3 Sekunden. Vier Runden, wer insgesamt am schnellsten ist, gewinnt.',
  ROUND_MS,
  create(ctx) {
    const rounds = Array.from({ length: ROUNDS }, (_, r) => {
      const picks = shuffle(POOL).slice(0, PAIRS + 1);
      const single = picks[PAIRS];
      const cells = shuffle([...picks.slice(0, PAIRS), ...picks.slice(0, PAIRS), single]);
      const startAt = ctx.startAt + r * (ROUND_MS + PAUSE);
      return { cells, single: cells.indexOf(single), startAt, endAt: startAt + ROUND_MS, found: new Map(), wrong: new Map() };
    });
    let current = 0;
    const timers = [];

    // Runde vorbei, wenn alle gefunden haben oder die Zeit um ist
    function endRound(r) {
      const rd = rounds[r];
      if (rd.closed) return;
      rd.closed = true;
      rd.endAt = Math.min(rd.endAt, Date.now());
      current = r + 1;
      if (current >= ROUNDS) {
        ctx.timer(Date.now() + PAUSE, () => ctx.finish());
        return;
      }
      // Die nächste Runde beginnt nach der Pause
      const next = rounds[current];
      const shift = Date.now() + PAUSE - next.startAt;
      for (let k = current; k < ROUNDS; k++) {
        rounds[k].startAt += shift;
        rounds[k].endAt += shift;
      }
      const idx = current;
      timers.push(ctx.timer(next.endAt, () => endRound(idx)));
    }

    const check = () => {
      const rd = rounds[current];
      if (rd && ctx.ids.every((id) => rd.found.has(id) || !ctx.connected(id))) endRound(current);
    };

    timers.push(ctx.timer(rounds[0].endAt, () => endRound(0)));

    const total = (id) => rounds.reduce((sum, rd) => sum + (rd.found.has(id) ? rd.found.get(id) : ROUND_MS) + (rd.wrong.get(id) || 0) * PENALTY, 0);

    return {
      view(viewer) {
        return {
          rounds: ROUNDS,
          current: Math.min(current, ROUNDS - 1),
          list: rounds.map((rd, i) => ({
            cells: rd.cells,
            startAt: rd.startAt,
            endAt: rd.endAt,
            closed: Boolean(rd.closed),
            single: rd.closed ? rd.single : null,
            found: [...rd.found.keys()],
            mine: rd.found.has(viewer.id) ? rd.found.get(viewer.id) : null,
            wrong: rd.wrong.get(viewer.id) || 0,
            index: i,
          })).filter((x) => x.index <= current),
        };
      },
      action(player, { type, round, cell }) {
        if (type !== 'tap') return { error: 'Unbekannte Aktion.' };
        if (!ctx.ids.includes(player.id)) return { error: 'Du spielst hier nicht mit.' };
        const rd = rounds[current];
        const now = Date.now();
        if (!rd || Number(round) !== current || rd.closed || now < rd.startAt) return { ok: true };
        if (rd.found.has(player.id)) return { ok: true };
        if (Number(cell) === rd.single) {
          rd.found.set(player.id, now - rd.startAt);
          check();
          return { ok: true, right: true };
        }
        rd.wrong.set(player.id, (rd.wrong.get(player.id) || 0) + 1);
        return { ok: true, right: false };
      },
      playersChanged: check,
      ranking() {
        const entries = ctx.ids.filter((id) => rounds.some((rd) => rd.found.has(id))).map((id) => ({ id, ms: total(id), n: rounds.filter((rd) => rd.found.has(id)).length }));
        entries.sort((a, b) => a.ms - b.ms);
        const groups = groupsOf(entries, (e) => Math.round(e.ms / 10), (e) => `${seconds(e.ms, 1)} (${e.n}/${ROUNDS} gefunden)`);
        return { groups: withMissing(groups, ctx.ids, 'nichts gefunden') };
      },
    };
  },
};
