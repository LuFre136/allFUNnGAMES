// Kniffel: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const TIMES = [0, 30, 45, 60, 90, 120];
  const LABELS = {
    ones: ['Einser', 'nur Einser zählen'],
    twos: ['Zweier', 'nur Zweier zählen'],
    threes: ['Dreier', 'nur Dreier zählen'],
    fours: ['Vierer', 'nur Vierer zählen'],
    fives: ['Fünfer', 'nur Fünfer zählen'],
    sixes: ['Sechser', 'nur Sechser zählen'],
    threeKind: ['Dreierpasch', 'alle Augen'],
    fourKind: ['Viererpasch', 'alle Augen'],
    fullHouse: ['Full House', '25 Punkte'],
    smallStraight: ['Kleine Straße', '30 Punkte'],
    largeStraight: ['Große Straße', '40 Punkte'],
    kniffel: ['Kniffel', '50 Punkte'],
    chance: ['Chance', 'alle Augen'],
  };
  // Augen auf einem 3×3-Raster
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const kn = {
    seenRoll: 0,
    rolling: false,
    turnKey: null, // Spieler und Wurf, zu dem die Auswahl gehört
    selected: null, // angetipptes Feld, bis es eingetragen wird
    drag: null, // { id, order } während der Host einen Spieler verschiebt
    localOrder: null, // gesendete Reihenfolge, bis der Server sie bestätigt
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function sameList(a, b) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  // ---------- Lobby ----------

  // Reihenfolge für die Lobby: gespeicherte Reihenfolge, neue Spieler hinten dran
  function lobbyOrder() {
    const visible = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays)).map((p) => p.id);
    const saved = S.settings.game.order;
    if (kn.localOrder && sameList(kn.localOrder, saved)) kn.localOrder = null;
    const base = (kn.drag?.order || kn.localOrder || saved).filter((id) => visible.includes(id));
    return [...base, ...visible.filter((id) => !base.includes(id))];
  }

  function viewOrder() {
    const manual = S.settings.game.orderMode === 'manual';
    const order = manual ? lobbyOrder() : [];
    return `<div class="stack" style="gap:8px">
      <div class="small muted" style="font-weight:700">Reihenfolge der Spieler</div>
      <div class="segmented">
        <button data-action="knSetting" data-key="orderMode" data-value="random" class="${!manual ? 'on' : ''}">🎲 Zufällig</button>
        <button data-action="knSetting" data-key="orderMode" data-value="manual" class="${manual ? 'on' : ''}">✋ Selbst festlegen</button>
      </div>
      ${manual ? `<ol class="kn-order" id="kn-order">${order.map((id, i) => {
        const p = playerById(id);
        return `<li class="kn-order-item ${kn.drag?.id === id ? 'dragging' : ''} ${p?.connected === false ? 'offline' : ''}" data-player="${id}">
          <span class="kn-pos">${i + 1}.</span>${avatarHtml(p, 'sm')}<span class="name">${esc(p?.name || '?')}${p?.isHost ? ' 👑' : ''}</span>
          <span class="kn-handle" title="Ziehen zum Verschieben">⠿</span></li>`;
      }).join('')}</ol>
      <div class="row spread"><span class="small muted">Zum Verschieben am Griff ⠿ ziehen.</span><button class="btn small" data-action="knShuffle">🎲 Mischen</button></div>`
        : '<div class="small muted">Die Reihenfolge wird beim Start ausgelost.</div>'}
    </div>`;
  }

  // Für alle in der Lobby: weitere Mitspieler an diesem Gerät
  function lobbyExtra() {
    if (S.me.isHost && !S.settings.hostPlays) return '';
    const guests = S.players.filter((p) => p.guestOf === S.me.id);
    return `<div class="card stack">
      <h3 style="margin:0">Mitspieler an diesem Gerät</h3>
      <div class="small muted">Nicht jeder hat ein Handy? Hier weitere Spieler eintragen, sie spielen an deinem Gerät mit. Wenn sie dran sind, steht ihr Name oben.</div>
      ${guests.map((p) => `<div class="member">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}</span>
        <button class="btn small icon ghost" data-action="knRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      <form id="kn-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="kn-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
        <button class="btn primary small" type="submit">+ Hinzufügen</button>
      </form>
    </div>`;
  }

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
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Deine Rolle</div>
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Zeit pro Zug</span>
          <select id="kn-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Partien hintereinander</span>
          <input id="kn-games" type="number" min="1" max="5" value="${g.games}" inputmode="numeric">
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Hilfen</div>
        <div class="segmented">
          <button data-action="knSetting" data-key="hints" data-value="1" class="${g.hints ? 'on' : ''}">💡 Mögliche Punkte zeigen</button>
          <button data-action="knSetting" data-key="hints" data-value="0" class="${!g.hints ? 'on' : ''}">Aus</button>
        </div>
      </div>
      ${viewOrder()}
      <div class="small muted">So geht's: Reihum würfelt jeder bis zu dreimal mit fünf Würfeln. Zwischen den Würfen tippst du die Würfel an, die du behalten willst. Danach trägst du das Ergebnis in ein freies Feld deines Blocks ein, notfalls mit 0 Punkten (streichen). Oben zählen nur die passenden Augen, ab 63 Punkten oben gibt es 35 Bonus. Unten: Dreier- und Viererpasch zählen alle Augen, Full House 25, kleine Straße (vier in Folge) 30, große Straße (fünf in Folge) 40, Kniffel (fünf gleiche) 50, Chance alle Augen. Nach 13 Runden ist der Block voll.${g.timeLimit ? ' Läuft die Zeit ab, wird automatisch das Feld mit den meisten Punkten gewählt.' : ''}</div>
    </div>`;
  }

  // ---------- Spiel ----------

  function dieHtml(value, i, R) {
    const pips = PIPS[value] || [];
    const canHold = R.isActive && R.rolls > 0 && R.rolls < R.maxRolls;
    const held = R.held[i];
    const cls = ['kn-die', held ? 'held' : '', kn.rolling && !held ? 'rolling' : '', canHold ? 'can' : '', value ? '' : 'empty'].join(' ');
    return `<button class="${cls}" ${canHold ? `data-action="knHold" data-i="${i}"` : 'disabled'} title="${value ? `${value}${held ? ' (gehalten)' : ''}` : ''}">
      ${value ? Array.from({ length: 9 }, (_, k) => `<span class="${pips.includes(k) ? 'pip' : ''}"></span>`).join('') : '?'}</button>`;
  }

  function viewDice(R) {
    const left = R.maxRolls - R.rolls;
    const allHeld = R.rolls > 0 && R.held.every(Boolean);
    let button = '';
    if (R.isActive) {
      button = left > 0
        ? `<button class="btn primary big kn-roll" data-action="knRoll" ${allHeld ? 'disabled' : ''}>🎲 ${R.rolls ? `Nochmal würfeln (noch ${left})` : 'Würfeln'}</button>`
        : '';
    }
    const hint = R.isActive && R.rolls > 0 && left > 0 ? '<div class="small muted center">Tippe Würfel an, um sie zu halten.</div>' : '';
    return `<div class="kn-table">
      <div class="kn-dice">${R.dice.map((d, i) => dieHtml(d, i, R)).join('')}</div>
      <div class="kn-rolls">${Array.from({ length: R.maxRolls }, (_, i) => `<span class="${i < R.rolls ? 'on' : ''}"></span>`).join('')}</div>
      ${button}${hint}
    </div>`;
  }

  function viewStatus(R) {
    const active = playerById(R.activeId);
    if (R.activeId === S.me.id) return '<div class="kn-status mine">Du bist dran! 🎲</div>';
    if (R.isActive) return `<div class="kn-status mine">${avatarHtml(active, 'sm')} ${esc(active?.name || '?')} ist dran! Gib das Gerät weiter.</div>`;
    return `<div class="kn-status">${avatarHtml(active, 'sm')} <b>${esc(active?.name || '?')}</b>&nbsp;ist dran</div>`;
  }

  function viewLast(R) {
    const l = R.last;
    if (!l) return '';
    return `<div class="small muted center">Zuletzt: ${esc(playerName(l.playerId))} trägt ${l.points ? `<b>${l.points}</b> bei` : '0 bei'} ${LABELS[l.category][0]} ein${l.points ? '' : ' (gestrichen)'}.</div>`;
  }

  // Der Wertungsblock: eine Spalte pro Spieler
  function viewBlock(R, { interactive }) {
    const cols = R.players;
    const head = `<tr><th></th>${cols.map((p) => {
      const player = playerById(p.id);
      const cls = [p.id === R.activeId ? 'active' : '', p.id === S.me.id ? 'me' : '', player?.connected === false ? 'offline' : ''].join(' ');
      return `<th class="${cls}">${avatarHtml(player, 'sm')}<div class="kn-name">${esc(player?.name || '?')}</div></th>`;
    }).join('')}</tr>`;
    const cell = (p, cat) => {
      const value = p.sheet[cat];
      const isActive = p.id === R.activeId;
      if (value !== null) {
        const fresh = R.last && R.last.playerId === p.id && R.last.category === cat;
        return `<td class="filled ${value === 0 ? 'zero' : ''} ${fresh ? 'fresh' : ''}">${value === 0 ? '–' : value}</td>`;
      }
      if (!isActive || !R.options) return '<td></td>';
      const points = R.options[cat];
      const selected = interactive && kn.selected === cat;
      const show = R.hints || selected;
      const cls = ['opt', interactive ? 'can' : '', selected ? 'selected' : '', points ? '' : 'zero'].join(' ');
      return `<td class="${cls}" ${interactive ? `data-action="knPick" data-cat="${cat}"` : ''}>${show ? points : ''}</td>`;
    };
    const row = (cat) => `<tr><th class="kn-cat"><b>${LABELS[cat][0]}</b><span>${LABELS[cat][1]}</span></th>${cols.map((p) => cell(p, cat)).join('')}</tr>`;
    const sumRow = (label, fn, cls = '') => `<tr class="kn-sum ${cls}"><th class="kn-cat">${label}</th>${cols.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`;
    const bonusCell = (p) => {
      if (p.score.bonus) return `<b>${p.score.bonus}</b>`;
      const done = R.categories.upper.every((c) => p.sheet[c] !== null);
      return done ? '–' : `<span class="small muted">noch ${R.bonus.needed - p.score.upper}</span>`;
    };
    return `<div class="kn-block-wrap"><table class="kn-block">
      <thead>${head}</thead>
      <tbody>
        ${R.categories.upper.map(row).join('')}
        ${sumRow('Summe oben', (p) => p.score.upper)}
        ${sumRow(`Bonus <span>ab ${R.bonus.needed}: +${R.bonus.points}</span>`, bonusCell)}
        ${R.categories.lower.map(row).join('')}
        ${sumRow('Summe unten', (p) => p.score.lower)}
        ${sumRow('Gesamt', (p) => `<b>${p.score.upper + p.score.bonus + p.score.lower}</b>`, 'total')}
        ${R.games > 1 ? sumRow('Alle Partien', (p) => p.total, 'total') : ''}
      </tbody>
    </table></div>`;
  }

  function viewConfirm(R) {
    if (!R.isActive || !R.options || !kn.selected || R.options[kn.selected] === undefined) return '';
    const points = R.options[kn.selected];
    const label = LABELS[kn.selected][0];
    return `<div class="kn-confirm">
      <div>${points ? `<b>${points} Punkte</b> bei ${label}` : `<b>${label}</b> streichen (0 Punkte)`}</div>
      <div class="row" style="justify-content:center">
        <button class="btn" data-action="knPick" data-cat="${kn.selected}">↩︎ Abbrechen</button>
        <button class="btn primary" data-action="knScore">✓ Eintragen</button>
      </div>
    </div>`;
  }

  function viewPlaying(R) {
    const pickHint = R.isActive && R.rolls > 0 && !kn.selected ? '<div class="small muted center">Tippe im Block auf ein freies Feld, um einzutragen.</div>' : '';
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>${R.games > 1 ? `Partie ${R.gameNo}/${R.games}` : 'Kniffel'}</b></div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${viewStatus(R)}
      ${viewDice(R)}
      ${viewConfirm(R)}
      ${pickHint}
      ${viewLast(R)}
      ${viewBlock(R, { interactive: R.isActive && R.rolls > 0 })}
    </div>`;
  }

  function viewEnd(R) {
    const ranked = R.players.map((p) => ({ id: p.id, pts: R.totals[p.id] || 0 })).sort((a, b) => b.pts - a.pts);
    const final = R.phase === 'final';
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const winner = ranked[0];
    const tie = ranked[1] && ranked[1].pts === winner.pts;
    const title = final ? (tie ? 'Unentschieden!' : `${esc(playerName(winner.id))} gewinnt!`) : `Partie ${R.gameNo} von ${R.games} ist vorbei`;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">${final ? '🏆' : '🎲'}</div><h1>${title}</h1></div>
      ${final ? `<div class="podium">${top.map((t) => {
        const place = ranked.filter((o) => o.pts > t.pts).length;
        return `<div class="step"><div>${avatarHtml(playerById(t.id))}</div><b>${esc(playerName(t.id))}</b><div class="small muted">${t.pts} Punkte</div>
          <div class="block" style="--team:var(--accent);height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>` : ''}
      <div class="card stack">
        <h3 style="margin:0">${final && R.games > 1 ? 'Gesamtwertung' : 'Wertung'}</h3>
        ${ranked.map((t) => {
          const place = ranked.filter((o) => o.pts > t.pts).length + 1;
          return `<div class="score-row" style="--team:var(--accent)"><span class="rank">${place}.</span>${avatarHtml(playerById(t.id), 'sm')}<span class="name">${esc(playerName(t.id))}</span>
            <span class="pts">${t.pts}</span></div>`;
        }).join('')}
      </div>
      <details class="card" ${final ? '' : 'open'}><summary>Wertungsblock dieser Partie</summary>
        <div style="margin-top:12px">${viewBlock(R, { interactive: false })}</div>
      </details>
      ${S.me.isHost ? '' : `<div class="muted center">${final ? 'Der Host kann eine neue Runde starten.' : 'Der Host startet gleich die nächste Partie.'}</div>`}
    </div>`;
  }

  function view() {
    const R = S.round;
    // Würfel nur einmal pro Wurf rollen lassen
    if (R.rollSeq !== kn.seenRoll) {
      kn.seenRoll = R.rollSeq;
      kn.rolling = R.rollSeq > 0;
      if (kn.rolling) setTimeout(() => { kn.rolling = false; document.querySelectorAll('.kn-die.rolling').forEach((d) => d.classList.remove('rolling')); }, 700);
    }
    // Auswahl gilt nur für den aktuellen Wurf
    const key = `${R.activeId}:${R.rollSeq}`;
    if (kn.turnKey !== key) {
      kn.turnKey = key;
      kn.selected = null;
    }
    return R.phase === 'turn' ? viewPlaying(R) : viewEnd(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'result') return '<button class="btn primary" data-action="next">Nächste Partie ▶︎</button>';
    const name = esc(playerName(R.activeId));
    return `<button class="btn" data-action="knSkip">⏭ ${name} überspringen</button><button class="btn" data-action="knForce">🎲 Für ${name} spielen</button>`;
  }

  gameViews.kniffel = { settings: viewSettings, lobbyExtra, view, hostbar };

  function sendOrder(order) {
    kn.localOrder = order;
    sendHost('settings', { game: { order } });
  }

  Object.assign(actions, {
    knSetting: (el) => {
      const v = el.dataset.value;
      sendHost('settings', { game: { [el.dataset.key]: el.dataset.key === 'hints' ? v === '1' : v } });
    },
    knRoll: () => act('roll'),
    knHold: (el) => act('hold', { index: Number(el.dataset.i) }),
    knPick: (el) => {
      kn.selected = kn.selected === el.dataset.cat ? null : el.dataset.cat;
      render();
    },
    knScore: () => {
      const category = kn.selected;
      kn.selected = null;
      act('score', { category });
    },
    knSkip: () => {
      if (confirm(`${playerName(S.round.activeId)} überspringen? Der Zug verfällt nicht, er ist in der nächsten Runde wieder dran.`)) act('skip');
    },
    knForce: () => {
      if (confirm(`Für ${playerName(S.round.activeId)} spielen? Es wird (falls nötig) gewürfelt und das Feld mit den meisten Punkten eingetragen.`)) act('force');
    },
    knRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
    knShuffle: () => {
      const order = lobbyOrder();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      sendOrder(order);
      render();
    },
  });

  // Drag and Drop über Pointer-Events, damit es auch auf Handys funktioniert
  app.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.kn-handle');
    if (!handle || S?.game.id !== 'kniffel' || !S.me.isHost) return;
    e.preventDefault();
    const item = handle.closest('.kn-order-item');
    kn.drag = { id: item.dataset.player, order: lobbyOrder() };
    item.classList.add('dragging');
  });

  document.addEventListener('pointermove', (e) => {
    if (!kn.drag) return;
    const list = document.getElementById('kn-order');
    const items = list ? [...list.children] : [];
    const dragged = items.find((el) => el.dataset.player === kn.drag.id);
    if (!dragged) return;
    e.preventDefault();
    const others = items.filter((el) => el !== dragged);
    const index = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 < e.clientY;
    }).length;
    const ref = others[index] || null;
    if (dragged.nextElementSibling === ref) return;
    list.insertBefore(dragged, ref);
    kn.drag.order = [...list.children].map((el) => el.dataset.player);
    list.querySelectorAll('.kn-pos').forEach((el, i) => { el.textContent = `${i + 1}.`; });
  });

  function endDrag() {
    if (!kn.drag) return;
    const { order } = kn.drag;
    kn.drag = null;
    if (!sameList(order, S.settings.game.order)) sendOrder(order);
    render();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'kn-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('kn-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('kn-guest-name');
      if (field) field.value = '';
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'kniffel') return;
    if (e.target.id === 'kn-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
    else if (e.target.id === 'kn-games') sendHost('settings', { game: { games: Number(e.target.value) } });
  });
})();
