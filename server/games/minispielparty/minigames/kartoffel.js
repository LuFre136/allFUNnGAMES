// Heiße Kartoffel: Eine Bombe mit verstecktem Zünder wandert von Handy zu Handy.
// Wer sie hat, gibt sie mit einem Tipp weiter. Bei wem sie hochgeht, der ist raus. Neue Bombe, bis einer übrig ist.

const { randInt } = require('../helpers');
const { pick } = require('../../../util');

const HOLD_MIN = 350; // so lange muss man die Bombe mindestens halten
const BOOM_PAUSE = 2600;
const FIRST_DELAY = 600;

function fuseFor(alive) {
  return alive > 6 ? randInt(4000, 8000) : randInt(5000, 11000);
}

module.exports = {
  id: 'kartoffel',
  name: 'Heiße Kartoffel',
  icon: '💣',
  short: 'Gib die Bombe schnell weiter, bevor sie bei dir hochgeht!',
  howto: 'Einer bekommt die Bombe. Wer sie hat, tippt auf einen Mitspieler und gibt sie weiter (direkt zurück geht nicht). Wann sie hochgeht, weiß niemand. Bei wem sie explodiert, der ist raus. Dann kommt eine neue Bombe, bis nur noch einer übrig ist.',
  create(ctx) {
    let alive = [...ctx.ids];
    const eliminated = []; // [[ids], ...] in der Reihenfolge des Ausscheidens
    let holder = null;
    let prev = null;
    let receivedAt = 0;
    let state = 'wait'; // wait | live | boom
    let bomb = 0;
    let boom = null; // { id, at }
    let passes = 0;
    let fuseTimer = null;

    const connectedAlive = () => alive.filter((id) => ctx.connected(id));

    function newBomb(exclude = null) {
      const candidates = connectedAlive().filter((id) => id !== exclude);
      if (alive.length <= 1 || !candidates.length) {
        ctx.finish();
        return;
      }
      bomb++;
      state = 'live';
      holder = pick(candidates);
      prev = null;
      receivedAt = Date.now();
      fuseTimer = ctx.timer(Date.now() + fuseFor(alive.length), explode);
    }

    function explode() {
      const id = holder;
      ctx.stats.bombed(id);
      eliminated.push([id]);
      alive = alive.filter((a) => a !== id);
      boom = { id, at: Date.now() };
      holder = null;
      state = 'boom';
      if (alive.length <= 1) ctx.timer(Date.now() + BOOM_PAUSE, () => ctx.finish());
      else ctx.timer(Date.now() + BOOM_PAUSE, () => newBomb(id));
    }

    function targetsFor(id) {
      return alive.filter((a) => a !== id && ctx.connected(a) && (alive.length <= 2 || a !== prev));
    }

    function pass(to) {
      prev = holder;
      holder = to;
      receivedAt = Date.now();
      passes++;
    }

    ctx.timer(ctx.startAt + FIRST_DELAY, () => newBomb());

    return {
      view(viewer) {
        return {
          state,
          bomb,
          holder,
          prev,
          alive,
          boom,
          passes,
          targets: holder === viewer.id ? targetsFor(viewer.id) : [],
        };
      },
      action(player, { type, to }) {
        if (type !== 'pass') return { error: 'Unbekannte Aktion.' };
        if (state !== 'live' || holder !== player.id) return { error: 'Du hast die Bombe gerade nicht.' };
        if (Date.now() - receivedAt < HOLD_MIN) return { error: 'Moment, du hast sie gerade erst bekommen!' };
        if (!targetsFor(player.id).includes(to)) return { error: 'An diesen Spieler geht das gerade nicht.' };
        pass(to);
        return { ok: true };
      },
      playersChanged() {
        // Wer weg ist, scheidet aus. Hat er die Bombe, geht sie an jemand anderen.
        const gone = alive.filter((id) => !ctx.connected(id));
        if (!gone.length) return;
        eliminated.push(gone);
        alive = alive.filter((id) => ctx.connected(id));
        if (state === 'live' && gone.includes(holder)) {
          const next = connectedAlive();
          if (next.length > 1) pass(pick(next));
          else {
            ctx.clear(fuseTimer);
            ctx.finish();
          }
        } else if (alive.length <= 1 && state !== 'boom') ctx.finish();
      },
      ranking() {
        const order = [{ ids: alive, label: 'überlebt 🏅' }];
        for (let i = eliminated.length - 1; i >= 0; i--) {
          order.push({ ids: eliminated[i], label: `${i + 1}. ${eliminated[i].length > 1 ? 'raus' : 'Bombe'}` });
        }
        return { groups: order.filter((g) => g.ids.length) };
      },
    };
  },
};
