// Ochs am Berg (einer gegen alle): Der Einzelne hält einen Knopf gedrückt, dann ist die Ampel rot.
// Die Gruppe tippt, um zu laufen. Wer bei Rot tippt, muss zurück an den Start.
// Kommt mindestens die Hälfte der Gruppe ins Ziel, gewinnt die Gruppe.

const DURATION = 30000;
const GOAL = 40; // Schritte bis ins Ziel
const MIN_GAP = 90; // höchstens ein Schritt alle 90 ms
const RED_MAX = 3000; // länger als 3 s am Stück geht nicht
const GREEN_MIN = 700; // nach Rot mindestens so lange Grün
const GRACE = 350; // so lange nach dem Umschalten zählt ein Tipp noch als grün (Funkverzögerung)

module.exports = {
  id: 'ochsamberg',
  name: 'Ochs am Berg',
  icon: '🚦',
  formats: ['solo'],
  short: 'Einer schaltet die Ampel, alle laufen. Bei Rot stehen bleiben!',
  howto: 'Einer ist die Ampel: Solange er den Knopf gedrückt hält, ist Rot (höchstens 3 Sekunden am Stück). Alle anderen tippen, um zu laufen. Wer bei Rot tippt, muss zurück an den Start. Kommt in 30 Sekunden mindestens die Hälfte ins Ziel, gewinnt die Gruppe, sonst die Ampel.',
  GOAL,
  RED_MAX,
  GREEN_MIN,
  create(ctx) {
    const lightId = ctx.solo;
    let runners = [...ctx.group];
    const pos = new Map(runners.map((id) => [id, 0]));
    const lastStep = new Map();
    const finished = new Map(); // id -> ms nach dem Start
    const caught = new Map();
    let red = false;
    let changedAt = 0; // wann die Ampel zuletzt umgesprungen ist
    let redTimer = null;
    let liveTimer = null;
    const endAt = ctx.startAt + DURATION;

    const need = () => Math.ceil(runners.length / 2);
    const state = () => ({ red, changedAt, pos: Object.fromEntries(pos), finished: [...finished.keys()], caught: Object.fromEntries(caught) });
    const pushLive = (now = false) => {
      if (now) {
        clearTimeout(liveTimer);
        liveTimer = null;
        ctx.live(state());
        return;
      }
      if (liveTimer) return;
      liveTimer = setTimeout(() => {
        liveTimer = null;
        ctx.live(state());
      }, 150);
    };
    const check = () => {
      if (runners.every((id) => finished.has(id) || !ctx.connected(id))) ctx.finish();
    };
    const setLight = (value) => {
      if (value === red) return;
      red = value;
      changedAt = Date.now();
      if (redTimer) ctx.clear(redTimer);
      redTimer = red ? ctx.timer(changedAt + RED_MAX, () => setLight(false)) : null;
      pushLive(true);
    };

    ctx.timer(endAt, () => ctx.finish());
    ctx.onDispose(() => clearTimeout(liveTimer));

    return {
      view() {
        return { endAt, goal: GOAL, lightId, runners, need: need(), ...state() };
      },
      draw(player, { op, red: wantRed }) {
        const now = Date.now();
        if (now < ctx.startAt || now > endAt) return { ok: true };
        if (op === 'light' && player.id === lightId) {
          if (wantRed && now - changedAt < GREEN_MIN && changedAt) return { ok: true, red };
          setLight(Boolean(wantRed));
          return { ok: true, red };
        }
        if (op === 'step' && pos.has(player.id) && !finished.has(player.id)) {
          if (now - (lastStep.get(player.id) || 0) < MIN_GAP) return { ok: true };
          lastStep.set(player.id, now);
          if (red && now - changedAt > GRACE) {
            pos.set(player.id, 0);
            caught.set(player.id, (caught.get(player.id) || 0) + 1);
            pushLive(true);
            return { ok: true, caught: true };
          }
          const p = pos.get(player.id) + 1;
          pos.set(player.id, p);
          if (p >= GOAL) {
            finished.set(player.id, now - ctx.startAt);
            pushLive(true);
            check();
            ctx.broadcast();
          } else pushLive();
        }
        return { ok: true };
      },
      playersChanged() {
        if (!ctx.connected(lightId)) {
          ctx.finish();
          return;
        }
        runners = runners.filter((id) => ctx.connected(id) || finished.has(id));
        check();
      },
      ranking() {
        const n = finished.size;
        const groupWins = !ctx.connected(lightId) || n >= need();
        return { winner: groupWins ? 'group' : 'solo', info: `${n} von ${runners.length} im Ziel (nötig: ${need()}).` };
      },
    };
  },
};
