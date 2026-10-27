// Minenfeld (einer gegen alle): Der Einzelne versteckt Minen auf einem Feld. Danach läuft jeder aus der Gruppe
// Reihe für Reihe von unten nach oben, immer auf ein Feld daneben oder darüber. Wer auf eine Mine tritt, ist raus.
// Kommt mindestens die Hälfte durch, gewinnt die Gruppe.

const { randInt } = require('../helpers');

const COLS = 5;
const ROWS = 6;
const MINES = 4;
const HIDE_MS = 15000;
const RUN_MS = 30000;

module.exports = {
  id: 'minenfeld',
  name: 'Minenfeld',
  icon: '🚩',
  formats: ['solo'],
  short: 'Einer versteckt Minen, alle anderen müssen über das Feld.',
  howto: 'Erst versteckt der Einzelne heimlich 4 Minen auf dem Feld. Danach läuft jeder aus der Gruppe von unten nach oben: Tippe in jeder Reihe ein Feld an, gerade oder schräg über deinem letzten. Wer auf eine Mine tritt, ist raus, die Mine ist dann für alle zu sehen. Kommt mindestens die Hälfte oben an, gewinnt die Gruppe.',
  COLS,
  ROWS,
  create(ctx) {
    const layer = ctx.solo;
    let runners = [...ctx.group];
    let mines = [];
    let phase = 'hide'; // hide | run
    const hideEnd = ctx.startAt + HIDE_MS;
    let runEnd = hideEnd + RUN_MS;
    const paths = new Map(runners.map((id) => [id, []])); // id -> [Spalte pro Reihe]
    const boom = new Map(); // id -> Feld
    const safe = new Set();
    let hideTimer = null;

    const cell = (r, c) => r * COLS + c;

    function startRun() {
      if (phase !== 'hide') return;
      ctx.clear(hideTimer);
      // Zu wenige Minen gelegt: der Rest kommt zufällig dazu
      while (mines.length < MINES) {
        const k = randInt(0, COLS * ROWS - 1);
        if (!mines.includes(k)) mines.push(k);
      }
      phase = 'run';
      runEnd = Date.now() + RUN_MS;
      ctx.timer(runEnd, () => ctx.finish());
      ctx.broadcast();
    }

    const check = () => {
      if (phase === 'run' && runners.every((id) => boom.has(id) || safe.has(id) || !ctx.connected(id))) ctx.finish();
    };
    const need = () => Math.ceil(runners.length / 2);

    hideTimer = ctx.timer(hideEnd, startRun);

    return {
      view(viewer) {
        const revealed = [...new Set(boom.values())];
        return {
          cols: COLS,
          rows: ROWS,
          mineCount: MINES,
          phase,
          layer,
          runners,
          hideEnd,
          runEnd,
          need: need(),
          // Minen sieht nur, wer sie legt; sonst nur die, auf die schon jemand getreten ist
          mines: viewer.id === layer || phase === 'done' ? mines : revealed,
          paths: Object.fromEntries(paths),
          boom: Object.fromEntries(boom),
          safe: [...safe],
        };
      },
      action(player, { type, row, col }) {
        const r = Number(row);
        const c = Number(col);
        if (Date.now() < ctx.startAt) return { error: 'Gleich geht es los.' };
        if (type !== 'done' && (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS)) return { error: 'Dieses Feld gibt es nicht.' };
        if (type === 'mine') {
          if (player.id !== layer || phase !== 'hide') return { error: 'Jetzt werden keine Minen gelegt.' };
          const k = cell(r, c);
          if (mines.includes(k)) mines = mines.filter((x) => x !== k);
          else if (mines.length < MINES) mines.push(k);
          else return { error: `Es sind schon ${MINES} Minen gelegt. Tippe eine an, um sie wegzunehmen.` };
          return { ok: true };
        }
        if (type === 'done') {
          if (player.id !== layer || phase !== 'hide') return { ok: true };
          if (mines.length < MINES) return { error: `Leg erst alle ${MINES} Minen.` };
          startRun();
          return { ok: true };
        }
        if (type !== 'step') return { error: 'Unbekannte Aktion.' };
        if (phase !== 'run') return { error: 'Noch werden Minen versteckt.' };
        const path = paths.get(player.id);
        if (!path || boom.has(player.id) || safe.has(player.id)) return { ok: true };
        if (r !== path.length) return { error: 'Immer die nächste Reihe nach oben.' };
        if (path.length && Math.abs(c - path[path.length - 1]) > 1) return { error: 'Nur gerade oder schräg nach oben.' };
        path.push(c);
        if (mines.includes(cell(r, c))) boom.set(player.id, cell(r, c));
        else if (path.length >= ROWS) safe.add(player.id);
        check();
        return { ok: true, boom: boom.has(player.id) };
      },
      playersChanged() {
        if (!ctx.connected(layer) && phase === 'hide') startRun();
        runners = runners.filter((id) => ctx.connected(id) || safe.has(id));
        check();
      },
      ranking() {
        phase = 'done';
        const groupWins = safe.size >= need();
        return { winner: groupWins ? 'group' : 'solo', info: `${safe.size} von ${runners.length} sicher angekommen (nötig: ${need()}).` };
      },
    };
  },
};
