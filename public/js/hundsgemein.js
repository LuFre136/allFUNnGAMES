// Hundsgemein: Spielansicht für Fernseher und Handys (nutzt die Helfer aus lobby.js und die Regeln aus
// hundsgemein-rules.js, damit das Handy nur erlaubte Züge anbietet)

(() => {
  const TIMES = [0, 30, 60, 90];
  const RANK_LABEL = { A: 'A', J: 'B', Q: 'D', K: 'K', JK: '🃏' };
  const RANK_NAME = { A: 'Ass', J: 'Bube', Q: 'Dame', K: 'König', JK: 'Joker' };
  const RANK_HINT = { A: '1 · 11 · raus', K: '13 · raus', Q: '12', J: 'tauschen', 4: '4 vor/zurück', 7: 'aufteilen', JK: 'jede Karte' };
  const STEP_MS = 140;
  const hg = {
    sel: null, // { cardId, as, move, marble, steps: [] } – Auswahl am Handy, bis gespielt wird
    selKey: null, // Zug, zu dem die Auswahl gehört (wird beim nächsten Zug verworfen)
    gift: null, // Karte für den Kartentausch
    anim: null, // { seq, start } für die Murmel-Animation des letzten Zugs
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function setting(key, value) {
    sendHost('settings', { game: { [key]: value } });
  }

  function segmented(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, label]) =>
      `<button data-action="hgSetting" data-key="${key}" data-value="${v}" class="${value === v ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  // ---------- Lobby ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    return `<div class="card stack">
      <h3>Einstellungen</h3>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Lobbyname</span><input id="set-lobbyName" type="text" maxlength="40" value="${esc(s.lobbyName)}"></label>
        <label class="field"><span>Dein Spielername</span><input id="set-myName" type="text" maxlength="24" value="${esc(S.me.name)}"></label>
      </div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Dein Profilbild</div>${avatarPicker(S.me.avatar, 'hostAvatar')}</div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Fernseher</div>
        ${segmented('tv', g.tv, [[true, '📺 Mit Fernseher'], [false, '📱 Nur Handys']])}
        <div class="small muted" style="margin-top:6px">${g.tv
          ? 'Dieses Gerät ist der Fernseher und zeigt das Brett. Es spielt nicht mit, sonst sähen alle deine Karten. Willst du mitspielen, tritt zusätzlich mit deinem Handy bei.'
          : 'Jedes Handy zeigt das ganze Brett. Dieses Gerät spielt mit, die Host-Knöpfe stehen unten in der Leiste. Wähle oben ein Team.'}</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Zeit pro Zug</span>
          <select id="hg-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Kartentausch mit dem Partner vor jeder Runde</div>
        ${segmented('exchange', g.exchange, [[true, '🤝 An'], [false, 'Aus']])}
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Mögliche Züge zeigen</div>
        ${segmented('hints', g.hints, [[true, '💡 An'], [false, 'Aus (selbst suchen)']])}
      </div>
      <div class="small muted">So geht's: Jeder hat vier Murmeln im Zwinger und will sie mit seinem Partner über die Rundbahn ins Ziel bringen. Gezogen wird mit Karten: Zahlen gehen so viele Felder vor, die 4 auch zurück, Dame 12, König 13 oder raus aus dem Zwinger, Ass 1 oder 11 oder raus, der Bube tauscht eine eigene Murmel mit einer fremden, die 7 lässt sich auf mehrere Murmeln aufteilen und schlägt jede Murmel, die sie überholt. Der Joker ist jede Karte. Wer auf einer Murmel landet, schickt sie zurück in den Zwinger. Eine Murmel, die frisch aus dem Zwinger kommt, sperrt ihr Startfeld. Ausgeteilt werden 6, 5, 4, 3 und 2 Karten, dann wieder 6. Wer nicht spielen kann, wirft ab. Wer fertig ist, hilft seinem Partner. Das Team, das zuerst alle Murmeln im Ziel hat, gewinnt.${g.timeLimit ? ' Läuft die Zeit ab, spielt das Spiel einen zufälligen Zug.' : ''}</div>
    </div>`;
  }

  // Für alle in der Lobby: passt die Aufteilung in Teams?
  function lobbyExtra() {
    const playing = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays) && p.connected);
    const sizes = S.teams.map((t) => playing.filter((p) => p.teamId === t.id).length).filter((n) => n > 0);
    const noTeam = playing.filter((p) => !p.teamId).length;
    const n = playing.length;
    const ok = !noTeam && (n === 4 || n === 6) && sizes.every((x) => x === sizes[0]) && sizes[0] >= 2;
    const text = ok
      ? `✅ ${n} Spieler in ${sizes.length} Teams zu ${sizes[0]}. Es kann losgehen!`
      : `Hundsgemein braucht 4 oder 6 Spieler in gleich großen Teams: 2 Teams zu zweit, 3 Teams zu zweit (dafür „+ Team“) oder 2 Teams zu dritt. Gerade: ${n} Spieler${noTeam ? `, ${noTeam} ohne Team` : ''}.`;
    return `<div class="card hg-lobby-check ${ok ? 'ok' : ''}">${text}</div>`;
  }

  // ---------- Brett ----------

  function seatInfo(R, seat) {
    const s = R.seats[seat];
    const team = teamById(s.teamId);
    const member = Math.floor(seat / R.teams);
    return { player: playerById(s.playerId), color: team?.color || '#888', member, team };
  }

  function marbleNo(id) {
    return Number(id.slice(-1)) + 1;
  }

  function marbleSeat(id) {
    return Number(id.slice(1, -1));
  }

  function geometry(R) {
    const n = R.seats.length;
    const L = n * HgRules.FIELDS;
    const fa = (2 * Math.PI) / L;
    const radius = 400;
    const gap = radius * fa;
    const bottom = R.mySeat ?? 0;
    const base = Math.PI / 2 - HgRules.startOf(bottom) * fa;
    const at = (angle, r) => [500 + r * Math.cos(angle), 500 + r * Math.sin(angle)];
    const start = (seat) => HgRules.startOf(seat);
    return {
      n,
      hole: n === 4 ? 14 : 10.5,
      track: (i) => at(base + i * fa, radius),
      goal: (seat, k) => at(base + start(seat) * fa, radius - (k + 1) * gap * 1.05),
      // Zwinger und Name liegen im eigenen Abschnitt, also im Uhrzeigersinn hinter dem Startfeld
      kennel: (seat, k) => at(base + (start(seat) + 1.7 + k * 1.25) * fa, radius + gap * 1.45),
      label: (seat) => at(base + (start(seat) + HgRules.FIELDS / 2) * fa, radius * (n === 4 ? 0.62 : 0.68)),
      of(p, seat) {
        if (p.area === 'track') return this.track(p.pos);
        if (p.area === 'goal') return this.goal(seat, p.pos);
        return this.kennel(seat, p.pos);
      },
    };
  }

  // marbles: Murmeln, die gezeigt werden (bei der Vorschau schon gezogen). mark: { movable, selected, targets, moved }
  function boardHtml(R, marbles, mark = {}) {
    const G = geometry(R);
    const h = G.hole;
    const parts = [];
    const L = G.n * HgRules.FIELDS;
    for (let i = 0; i < L; i++) {
      const [x, y] = G.track(i);
      const startSeat = i % HgRules.FIELDS === 0 ? i / HgRules.FIELDS : null;
      const color = startSeat !== null ? seatInfo(R, startSeat).color : null;
      parts.push(`<circle class="hg-field ${color ? 'start' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${h}" ${color ? `style="stroke:${color}"` : ''}/>`);
    }
    for (let seat = 0; seat < G.n; seat++) {
      const { color } = seatInfo(R, seat);
      for (let k = 0; k < HgRules.GOAL; k++) {
        const [x, y] = G.goal(seat, k);
        parts.push(`<circle class="hg-hole goal" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${h}" style="stroke:${color}"/>`);
        const [kx, ky] = G.kennel(seat, k);
        parts.push(`<circle class="hg-hole kennel" cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="${h}" style="stroke:${color}"/>`);
      }
    }
    const marblesSvg = marbles.map((m) => {
      const { color, member } = seatInfo(R, m.seat);
      const [x, y] = G.of(m, m.seat);
      const cls = ['hg-marble', `mem${member}`, mark.movable?.has(m.id) ? 'movable' : '', mark.selected === m.id ? 'selected' : '',
        mark.targets?.has(m.id) ? 'target' : '', mark.moved?.has(m.id) ? 'moved' : '', R.mySeat !== null && m.seat === R.mySeat ? 'mine' : '', m.fresh ? 'fresh' : ''].join(' ');
      const tap = mark.movable?.has(m.id) || mark.targets?.has(m.id);
      return `<g class="${cls}" data-m="${m.id}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" ${tap ? `data-action="hgMarble" data-marble="${m.id}"` : ''}>
        ${tap ? `<circle class="hg-tap" r="${h * 1.6}"/>` : ''}<circle class="hg-ball" r="${h * 0.86}" style="fill:${color}"/>
        <text class="hg-no" y="${h * 0.36}" style="font-size:${h * 1.05}px">${marbleNo(m.id)}</text></g>`;
    }).join('');
    const labels = R.seats.map((s, seat) => {
      const { player, color } = seatInfo(R, seat);
      const [x, y] = G.label(seat);
      const cls = ['hg-label', seat === R.turnSeat ? 'turn' : '', s.out ? 'out' : '', player?.connected === false ? 'offline' : ''].join(' ');
      const state = s.out ? 'setzt aus' : R.phase === 'exchange' ? (s.gave ? '✓ getauscht' : 'tauscht …') : `${s.cards} 🂠`;
      return `<div class="${cls}" style="left:${x / 10}%;top:${y / 10}%;--seat:${color}">${avatarHtml(player, 'sm')}<b>${esc(player?.name || '?')}</b><small>${state}</small></div>`;
    }).join('');
    const top = R.lastPlay ? cardHtml({ rank: R.lastPlay.rank }, R.lastPlay.as ? `als ${RANK_NAME[R.lastPlay.as] || R.lastPlay.as}` : '') : '';
    return `<div class="hg-board ${mark.quiet ? 'quiet' : ''}">
      <svg viewBox="0 0 1000 1000" aria-label="Spielbrett">${parts.join('')}<g class="hg-marbles">${marblesSvg}</g></svg>
      <div class="hg-center">${top}<div class="small muted">Stapel ${R.deck}</div></div>
      ${labels}
    </div>`;
  }

  // Animation des letzten Zugs: Die Murmeln laufen ihren Weg Feld für Feld ab, Geschlagene danach zurück in den Zwinger
  function animate() {
    const R = S?.round;
    const lp = R?.lastPlay;
    if (!lp) return;
    if (!hg.anim || hg.anim.seq !== lp.seq) hg.anim = { seq: lp.seq, start: hg.anim ? performance.now() : -1e9 };
    const elapsed = performance.now() - hg.anim.start;
    const G = geometry(R);
    let delay = 0;
    const order = [...Object.keys(lp.paths).filter((id) => !lp.beaten.includes(id)), ...lp.beaten];
    for (const id of order) {
      const el = document.querySelector(`.hg-marbles [data-m="${id}"]`);
      const path = lp.paths[id];
      if (!el || path.length < 2) continue;
      const seat = marbleSeat(id);
      const pts = path.map((p) => G.of(p, seat));
      const duration = (pts.length - 1) * STEP_MS;
      const frames = pts.map(([x, y]) => ({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }));
      const a = el.animate(frames, { duration, delay, fill: 'backwards', easing: 'linear' });
      a.currentTime = Math.min(elapsed, delay + duration);
      delay += duration;
    }
  }

  // ---------- Karten ----------

  function cardHtml(c, note = '', extra = '') {
    const red = ['A', 'K', 'Q', 'J', '7'].includes(c.rank) ? 'special' : '';
    return `<span class="hg-card ${red} ${c.rank === 'JK' ? 'joker' : ''} ${extra}"><b>${RANK_LABEL[c.rank] || c.rank}</b><small>${esc(note || RANK_HINT[c.rank] || '')}</small></span>`;
  }

  function handHtml(R, { pickable, selected, playable }) {
    if (!R.hand?.length) return '<div class="muted center small">Keine Karten mehr in dieser Runde.</div>';
    return `<div class="hg-hand">${R.hand.map((c) => {
      const dim = playable && R.hints && !playable.includes(c.id);
      const extra = [selected === c.id ? 'sel' : '', dim ? 'dim' : '', R.received === c.id ? 'got' : ''].join(' ');
      const inner = cardHtml(c, R.received === c.id ? 'neu' : '', extra);
      return pickable ? `<button class="hg-card-btn" data-action="hgCard" data-card="${c.id}">${inner}</button>` : inner;
    }).join('')}</div>`;
  }

  // ---------- Zugauswahl am Handy ----------

  function board(R) {
    return { seats: R.seats.length, teams: R.teams, marbles: R.marbles };
  }

  function selectedCard(R) {
    return R.hand?.find((c) => c.id === hg.sel?.cardId) || null;
  }

  function effectiveRank(R) {
    const c = selectedCard(R);
    if (!c) return null;
    return c.rank === 'JK' ? hg.sel.as || null : c.rank;
  }

  function ownerPrefix(R, id) {
    const seat = marbleSeat(id);
    if (seat === R.mySeat) return 'Murmel';
    return `${esc(seatInfo(R, seat).player?.name || '?')}s Murmel`;
  }

  function describe(R, move) {
    const b = board(R);
    if (move.type === 'exit') return `🐕 Neue Murmel raus${marbleSeat(move.marble) !== R.mySeat ? ` (für ${esc(seatInfo(R, marbleSeat(move.marble)).player?.name || '?')})` : ''}`;
    if (move.type === 'swap') {
      const o = move.target;
      return `${ownerPrefix(R, move.marble)} ${marbleNo(move.marble)} ⇄ ${esc(seatInfo(R, marbleSeat(o)).player?.name || '?')}s Murmel ${marbleNo(o)}`;
    }
    const preview = HgRules.clone(b);
    const res = HgRules.applyMove(preview, move);
    const victims = res.beaten.map((id) => esc(seatInfo(R, marbleSeat(id)).player?.name || '?'));
    const way = move.steps > 0 ? `${move.steps} vor` : `${-move.steps} zurück`;
    return `${ownerPrefix(R, move.marble)} ${marbleNo(move.marble)}: ${way}${move.goal ? ' ins Ziel' : ''}${victims.length ? ` · schlägt ${victims.join(', ')} 💥` : ''}`;
  }

  // Stand der 7 mit den bisher gewählten Schritten
  function sevenState(R) {
    const b = HgRules.clone(board(R));
    const beaten = [];
    for (const s of hg.sel.steps) beaten.push(...HgRules.applyStep(b, s));
    return { b, beaten };
  }

  function viewSeven(R) {
    const { b, beaten } = sevenState(R);
    const left = 7 - hg.sel.steps.length;
    const options = left ? HgRules.sevenNext(b, R.mySeat, left) : [];
    const counts = {};
    for (const s of hg.sel.steps) counts[s.marble] = (counts[s.marble] || 0) + 1;
    const summary = Object.entries(counts).map(([id, k]) => `${ownerPrefix(R, id)} ${marbleNo(id)}: ${k}`).join(' · ');
    const victims = beaten.map((id) => esc(seatInfo(R, marbleSeat(id)).player?.name || '?'));
    return `<div class="hg-choice">
      <div class="hg-seven-head"><b>${left ? `Noch ${left} ${left === 1 ? 'Schritt' : 'Schritte'}` : '7 verteilt ✓'}</b>${summary ? `<span class="small muted">${summary}</span>` : ''}</div>
      ${victims.length ? `<div class="small">💥 schlägt ${victims.join(', ')}</div>` : ''}
      <div class="hg-options">${options.map((o) => `<button class="btn" data-action="hgStep" data-marble="${o.marble}" data-goal="${o.goal ? 1 : 0}">+1 ${ownerPrefix(R, o.marble)} ${marbleNo(o.marble)}${o.goal ? ' ins Ziel' : ''}</button>`).join('')}</div>
      <div class="row">
        ${hg.sel.steps.length ? '<button class="btn small" data-action="hgUndo">↶ Schritt zurück</button>' : ''}
        ${!left ? '<button class="btn primary" data-action="hgPlay">▶︎ Spielen</button>' : ''}
      </div>
    </div>`;
  }

  function viewChoice(R) {
    const card = selectedCard(R);
    if (!card) return `<div class="hg-choice small muted center">Wähle eine Karte.</div>`;
    if (card.rank === 'JK' && !hg.sel.as) {
      const ranks = HgRules.JOKER_AS.filter((r) => HgRules.playable(board(R), R.mySeat, r));
      return `<div class="hg-choice"><b>Der Joker ist …</b><div class="hg-options">${ranks.map((r) => `<button class="btn" data-action="hgAs" data-rank="${r}">${RANK_NAME[r] || r}</button>`).join('')}</div></div>`;
    }
    const rank = effectiveRank(R);
    const back = card.rank === 'JK' ? '<button class="btn small ghost" data-action="hgAs" data-rank="">↶ Andere Karte für den Joker</button>' : '';
    if (rank === '7') return viewSeven(R) + back;
    const moves = HgRules.legalMoves(board(R), R.mySeat, rank);
    if (!moves.length) return `<div class="hg-choice muted">Mit dieser Karte geht gerade kein Zug.</div>${back}`;
    const list = hg.sel.marble ? moves.filter((m) => m.marble === hg.sel.marble) : moves;
    return `<div class="hg-choice">
      <div class="hg-options">${list.map((m) => {
        const key = HgRules.moveKey(m);
        return `<button class="btn ${hg.sel.move === key ? 'primary' : ''}" data-action="hgMove" data-key="${esc(key)}">${describe(R, m)}</button>`;
      }).join('')}</div>
      <div class="row">${hg.sel.marble ? '<button class="btn small ghost" data-action="hgAllMoves">Alle Züge zeigen</button>' : ''}
        ${hg.sel.move ? '<button class="btn primary" data-action="hgPlay">▶︎ Spielen</button>' : ''}${back}</div>
    </div>`;
  }

  // Murmeln und Vorschau auf dem Brett für den Spieler am Zug
  function myBoard(R) {
    const rank = effectiveRank(R);
    if (!rank) return boardHtml(R, R.marbles);
    const b = board(R);
    if (rank === '7') {
      const { b: after } = sevenState(R);
      const left = 7 - hg.sel.steps.length;
      const movable = new Set(left ? HgRules.sevenNext(after, R.mySeat, left).map((o) => o.marble) : []);
      return boardHtml(R, after.marbles, { movable, quiet: !R.hints, moved: new Set(hg.sel.steps.map((s) => s.marble)) });
    }
    const moves = HgRules.legalMoves(b, R.mySeat, rank);
    const chosen = moves.find((m) => HgRules.moveKey(m) === hg.sel.move);
    if (chosen) {
      const after = HgRules.clone(b);
      HgRules.applyMove(after, chosen);
      return boardHtml(R, after.marbles, { moved: new Set([chosen.marble, chosen.target].filter(Boolean)), selected: chosen.marble });
    }
    // Kennel-Murmeln: jede Murmel im Zwinger steht für „raus“
    const movable = new Set();
    for (const m of moves) {
      if (m.type === 'exit') b.marbles.filter((x) => x.seat === marbleSeat(m.marble) && x.area === 'kennel').forEach((x) => movable.add(x.id));
      else movable.add(m.marble);
    }
    // Beim Buben: nach der eigenen Murmel die möglichen Tauschpartner
    const targets = new Set(rank === 'J' && hg.sel.marble ? moves.filter((m) => m.marble === hg.sel.marble).map((m) => m.target) : []);
    return boardHtml(R, R.marbles, { movable, targets, quiet: !R.hints, selected: hg.sel.marble });
  }

  // ---------- Ansichten ----------

  function status(R) {
    const seat = R.turnSeat;
    if (R.phase === 'exchange') {
      const done = R.seats.filter((s) => s.gave).length;
      return `🤝 Kartentausch läuft (${done}/${R.seats.length})`;
    }
    if (seat === null) return '';
    const p = seatInfo(R, seat).player;
    return `${avatarHtml(p, 'sm')} <b>${esc(p?.name || '?')}</b>&nbsp;ist dran`;
  }

  function header(R) {
    return `<div class="q-head">
      <div class="small muted"><b>Runde ${R.roundNo}</b> · je ${R.dealSize} Karten</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function logHtml(R, count) {
    const lines = R.log.slice().reverse().slice(0, count);
    return `<div class="hg-log">${lines.map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l.text)}</div>`).join('')}</div>`;
  }

  // Fernseher (oder wer nicht mitspielt): großes Brett, Ereignisse daneben
  function viewTv(R) {
    return `<div class="hg-tv">
      <div class="hg-tv-board">${boardHtml(R, R.marbles)}</div>
      <div class="hg-tv-side stack">
        ${header(R)}
        <div class="hg-status">${status(R)}</div>
        ${logHtml(R, 6)}
      </div>
    </div>`;
  }

  function partnerName(R) {
    const partner = (R.mySeat + R.teams) % R.seats.length;
    return esc(seatInfo(R, partner).player?.name || 'deinem Partner');
  }

  function viewExchange(R) {
    if (R.gave) {
      return `<div class="hg-panel"><b>Karte gegeben ✓</b><div class="small muted">Warte, bis alle getauscht haben.</div></div>
        ${handHtml(R, { pickable: false, selected: R.gave })}`;
    }
    if (hg.gift && !R.hand.some((c) => c.id === hg.gift)) hg.gift = null;
    return `<div class="hg-panel mine"><b>Gib ${partnerName(R)} eine Karte</b><div class="small muted">Dein Partner sieht sie erst, wenn alle getauscht haben.</div>
      ${hg.gift ? '<button class="btn primary" data-action="hgGive">🤝 Diese Karte geben</button>' : ''}</div>
      ${handHtml(R, { pickable: true, selected: hg.gift })}`;
  }

  function viewTurn(R) {
    if (!R.playable.length && R.hand.length) {
      return `<div class="hg-panel mine"><b>Du bist dran, aber keine Karte geht.</b><div class="small muted">Du wirfst alle Karten ab und setzt bis zur nächsten Runde aus.</div>
        <button class="btn primary" data-action="hgDiscard">Karten abwerfen</button></div>
        ${handHtml(R, { pickable: false, playable: R.playable })}`;
    }
    const helping = HgRules.finished(board(R), R.mySeat) ? `<div class="small">Alle deine Murmeln sind im Ziel, du spielst für dein Team.</div>` : '';
    return `<div class="hg-panel mine"><b>${esc(S.me.name)}, du bist dran!</b>${helping}</div>
      ${handHtml(R, { pickable: true, selected: hg.sel?.cardId, playable: R.playable })}
      ${viewChoice(R)}`;
  }

  function viewPlayer(R) {
    const myTurn = R.phase === 'play' && R.turnSeat === R.mySeat;
    const turnKey = `${R.roundNo}:${R.lastPlay?.seq}`;
    if (myTurn && (!hg.sel || hg.selKey !== turnKey)) {
      hg.sel = { cardId: null, as: null, move: null, marble: null, steps: [] };
      hg.selKey = turnKey;
    }
    if (!myTurn) hg.sel = null;
    let controls;
    if (R.phase === 'exchange') controls = viewExchange(R);
    else if (myTurn) controls = viewTurn(R);
    else {
      controls = `<div class="hg-status">${status(R)}</div>
        ${R.seats[R.mySeat].out ? '<div class="small muted center">Du setzt in dieser Runde aus.</div>' : ''}
        ${handHtml(R, { pickable: false })}`;
    }
    return `<div class="stack hg-phone">
      ${header(R)}
      ${R.log.length ? `<div class="hg-banner">${esc(R.log[R.log.length - 1].text)}</div>` : ''}
      ${myTurn ? myBoard(R) : boardHtml(R, R.marbles)}
      ${controls}
    </div>`;
  }

  function prizes(R) {
    const ids = R.seats.map((_, i) => i);
    const best = (key) => {
      const top = Math.max(...ids.map((i) => R.stats[i][key]));
      return top > 0 ? { top, list: ids.filter((i) => R.stats[i][key] === top) } : null;
    };
    const names = (list) => list.map((i) => `<b>${esc(seatInfo(R, i).player?.name || '?')}</b>`).join(', ');
    const out = [];
    const mean = best('beats');
    if (mean) out.push(`😈 <b>Hundsgemein:</b> ${names(mean.list)} (${mean.top}× geschlagen)`);
    const bad = best('beaten');
    if (bad) out.push(`🍂 <b>Pechvogel:</b> ${names(bad.list)} (${bad.top}× zurück in den Zwinger)`);
    const walk = best('steps');
    if (walk) out.push(`🦮 <b>Gassigeher:</b> ${names(walk.list)} (${walk.top} Felder gelaufen)`);
    return out.length ? `<div class="card stack">${out.map((t) => `<div>${t}</div>`).join('')}</div>` : '';
  }

  function viewFinal(R) {
    const winners = R.seats.map((_, i) => i).filter((i) => i % R.teams === R.winnerTeam);
    const team = seatInfo(R, winners[0]).team;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆🐕</div>
        <h1>${esc(team?.name || 'Team')} gewinnt!</h1>
        <div class="hg-winners">${winners.map((i) => { const p = seatInfo(R, i).player; return `<div>${avatarHtml(p)}<b>${esc(p?.name || '?')}</b></div>`; }).join('')}</div>
      </div>
      ${prizes(R)}
      ${boardHtml(R, R.marbles)}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Partie starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.phase === 'final') return viewFinal(R);
    if (R.mySeat === null) return viewTv(R);
    return viewPlayer(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Partie (zur Lobby)</button>';
    if (R.phase === 'exchange') return '<button class="btn" data-action="hgForce">🎲 Fehlende Karten zufällig tauschen</button>';
    if (R.turnSeat !== null && R.turnSeat !== R.mySeat) {
      return `<button class="btn" data-action="hgForce">🎲 Für ${esc(seatInfo(R, R.turnSeat).player?.name || '?')} zufällig spielen</button>`;
    }
    return '';
  }

  function afterRender() {
    if (S?.game.id !== 'hundsgemein' || S.phase !== 'playing') return;
    animate();
  }

  gameViews.hundsgemein = { settings: viewSettings, lobbyExtra, view, hostbar, afterRender };

  // ---------- Eingaben ----------

  function pickMarble(id) {
    const R = S.round;
    const rank = effectiveRank(R);
    if (!rank || R.turnSeat !== R.mySeat) return;
    if (rank === '7') {
      const { b } = sevenState(R);
      const options = HgRules.sevenNext(b, R.mySeat, 7 - hg.sel.steps.length).filter((o) => o.marble === id);
      if (options.length === 1) hg.sel.steps.push(options[0]);
      else if (!options.length) toast('Diese Murmel kann keinen Schritt mehr gehen.');
      else toast('Wähle unten: ins Ziel oder weiter auf der Bahn.');
      render();
      return;
    }
    const moves = HgRules.legalMoves(board(R), R.mySeat, rank);
    const m = R.marbles.find((x) => x.id === id);
    const mine = moves.filter((x) => x.marble === id || (x.type === 'exit' && m.area === 'kennel' && marbleSeat(x.marble) === m.seat));
    // Beim Buben: erst die eigene Murmel, dann das Ziel
    const chosen = moves.find((x) => HgRules.moveKey(x) === hg.sel.move);
    if (rank === 'J' && hg.sel.marble && !mine.length) {
      const swap = moves.find((x) => x.marble === hg.sel.marble && x.target === id);
      if (swap) hg.sel.move = HgRules.moveKey(swap);
    } else if (mine.length === 1) {
      hg.sel.marble = mine[0].marble;
      hg.sel.move = HgRules.moveKey(mine[0]);
    } else if (mine.length) {
      hg.sel.marble = mine[0].marble;
      hg.sel.move = chosen && chosen.marble === mine[0].marble ? hg.sel.move : null;
    } else {
      toast('Mit dieser Karte kann diese Murmel nicht ziehen.');
    }
    render();
  }

  Object.assign(actions, {
    hgSetting: (el) => {
      const { key, value } = el.dataset;
      setting(key, value === 'true');
    },
    hgCard: (el) => {
      const R = S.round;
      if (R.phase === 'exchange') {
        hg.gift = el.dataset.card;
      } else if (hg.sel) {
        if (hg.sel.cardId === el.dataset.card) return;
        hg.sel = { cardId: el.dataset.card, as: null, move: null, marble: null, steps: [] };
        const rank = effectiveRank(R);
        if (rank && rank !== '7' && !HgRules.playable(board(R), R.mySeat, rank)) toast('Mit dieser Karte geht gerade kein Zug.');
      }
      render();
    },
    hgAs: (el) => {
      hg.sel = { ...hg.sel, as: el.dataset.rank || null, move: null, marble: null, steps: [] };
      render();
    },
    hgMarble: (el) => pickMarble(el.dataset.marble),
    hgMove: (el) => {
      hg.sel.move = el.dataset.key;
      hg.sel.marble = el.dataset.key.split('|')[2];
      render();
    },
    hgAllMoves: () => {
      hg.sel.marble = null;
      hg.sel.move = null;
      render();
    },
    hgStep: (el) => {
      hg.sel.steps.push({ marble: el.dataset.marble, goal: el.dataset.goal === '1' });
      render();
    },
    hgUndo: () => {
      hg.sel.steps.pop();
      render();
    },
    hgPlay: () => {
      const R = S.round;
      const card = selectedCard(R);
      const rank = effectiveRank(R);
      if (!card || !rank) return;
      const data = { cardId: card.id, as: card.rank === 'JK' ? rank : undefined };
      if (rank === '7') {
        act('play', { ...data, steps: hg.sel.steps });
      } else {
        const move = HgRules.legalMoves(board(R), R.mySeat, rank).find((m) => HgRules.moveKey(m) === hg.sel.move);
        if (!move) return;
        const { rank: _, ...rest } = move;
        act('play', { ...data, move: rest });
      }
    },
    hgGive: () => {
      if (hg.gift) act('give', { cardId: hg.gift });
      hg.gift = null;
    },
    hgDiscard: () => act('discard'),
    hgForce: () => {
      const R = S.round;
      const text = R.phase === 'exchange' ? 'Wer noch nicht getauscht hat, gibt eine zufällige Karte. Fortfahren?' : `Für ${seatInfo(R, R.turnSeat).player?.name || '?'} einen zufälligen Zug spielen?`;
      if (confirm(text)) act('force');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'hundsgemein') return;
    if (e.target.id === 'hg-time') setting('timeLimit', Number(e.target.value));
  });
})();
