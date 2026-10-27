// Kopfrechner: Alle bekommen dieselben Rechenaufgaben mit vier Antworten zur Auswahl.
// Wer zuerst 8 richtig hat, ist fertig. Eine falsche Antwort sperrt kurz. Nach 60 Sekunden ist Schluss.

const { randInt, groupsOf, withMissing, seconds } = require('../helpers');
const { shuffle } = require('../../../util');

const GOAL = 8;
const COUNT = 40; // genug Aufgaben, auch wenn man viele falsch hat
const DURATION = 60000;
const LOCK = 1200; // Sperre nach einer falschen Antwort

function task() {
  const kind = randInt(0, 3);
  let a;
  let b;
  let text;
  let result;
  if (kind === 0) {
    a = randInt(6, 49);
    b = randInt(6, 49);
    text = `${a} + ${b}`;
    result = a + b;
  } else if (kind === 1) {
    a = randInt(20, 90);
    b = randInt(4, a - 5);
    text = `${a} − ${b}`;
    result = a - b;
  } else if (kind === 2) {
    a = randInt(3, 12);
    b = randInt(3, 10);
    text = `${a} × ${b}`;
    result = a * b;
  } else {
    b = randInt(2, 9);
    result = randInt(3, 12);
    a = b * result;
    text = `${a} : ${b}`;
  }
  const wrong = new Set();
  for (const d of shuffle([1, 2, 10, -1, -2, -10, 3, -3, 11, -11])) {
    if (wrong.size >= 3) break;
    const v = result + d;
    if (v >= 0 && v !== result) wrong.add(v);
  }
  return { text, result, options: shuffle([result, ...wrong]) };
}

module.exports = {
  id: 'kopfrechner',
  name: 'Kopfrechner',
  icon: '➕',
  short: 'Rechnen auf Zeit: Wer hat zuerst 8 Aufgaben richtig?',
  howto: 'Du bekommst Rechenaufgaben mit vier Antworten zur Auswahl. Tippe die richtige an. Bei einer falschen bist du kurz gesperrt. Wer zuerst 8 richtig hat, gewinnt. Nach einer Minute ist Schluss, dann zählt, wer mehr richtig hat.',
  GOAL,
  create(ctx) {
    const tasks = Array.from({ length: COUNT }, task);
    const endAt = ctx.startAt + DURATION;
    const st = new Map(ctx.ids.map((id) => [id, { i: 0, right: 0, wrong: 0, lockUntil: 0, doneAt: null }]));

    const check = () => {
      if (ctx.ids.every((id) => st.get(id).doneAt !== null || !ctx.connected(id))) ctx.finish();
    };
    ctx.timer(endAt, () => ctx.finish());

    return {
      view(viewer) {
        const me = st.get(viewer.id);
        return {
          goal: GOAL,
          endAt,
          // Aufgaben ohne Lösung; die eigene aktuelle reicht dem Handy
          task: me && me.i < COUNT ? { text: tasks[me.i].text, options: tasks[me.i].options, i: me.i } : null,
          me: me ? { right: me.right, wrong: me.wrong, lockUntil: me.lockUntil, done: me.doneAt !== null } : null,
          progress: Object.fromEntries([...st].map(([id, s]) => [id, s.right])),
        };
      },
      action(player, { type, i, value }) {
        if (type !== 'answer') return { error: 'Unbekannte Aktion.' };
        const s = st.get(player.id);
        if (!s) return { error: 'Du spielst hier nicht mit.' };
        const now = Date.now();
        if (now < ctx.startAt || s.doneAt !== null || Number(i) !== s.i || s.i >= COUNT) return { ok: true };
        if (now < s.lockUntil) return { ok: true, locked: true };
        const right = Number(value) === tasks[s.i].result;
        s.i++;
        if (right) {
          s.right++;
          if (s.right >= GOAL) s.doneAt = now - ctx.startAt;
        } else {
          s.wrong++;
          s.lockUntil = now + LOCK;
        }
        if (s.i >= COUNT && s.doneAt === null) s.doneAt = DURATION;
        check();
        return { ok: true, right };
      },
      playersChanged: check,
      ranking() {
        const entries = [...st].filter(([, s]) => s.right > 0).map(([id, s]) => ({ id, ...s, t: s.right >= GOAL ? s.doneAt : DURATION + 1 }));
        entries.sort((a, b) => b.right - a.right || a.t - b.t || a.wrong - b.wrong);
        const groups = groupsOf(entries, (e) => `${e.right}:${e.right >= GOAL ? Math.round(e.t / 10) : e.wrong}`, (e) => (e.right >= GOAL ? `fertig nach ${seconds(e.t, 1)}` : `${e.right} richtig`));
        return { groups: withMissing(groups, ctx.ids, '0 richtig') };
      },
    };
  },
};
