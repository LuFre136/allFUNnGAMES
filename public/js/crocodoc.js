// Croco Doc: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const TIMES = [0, 5, 10, 15, 20, 30, 60];
  const cd = {
    drag: null, // { id, order } während der Host einen Spieler verschiebt
    localOrder: null, // gesendete Reihenfolge, bis der Server sie bestätigt
    seenSnap: null, // Runde, deren Zuschnappen schon animiert wurde
    snapping: false,
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

  // Reihenfolge für die Lobby: gespeicherte Reihenfolge, neue Spieler hinten dran
  function lobbyOrder() {
    const visible = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays)).map((p) => p.id);
    const saved = S.settings.game.order;
    if (cd.localOrder && sameList(cd.localOrder, saved)) cd.localOrder = null;
    const base = (cd.drag?.order || cd.localOrder || saved).filter((id) => visible.includes(id));
    return [...base, ...visible.filter((id) => !base.includes(id))];
  }

  function viewOrder() {
    const g = S.settings.game;
    const manual = g.orderMode === 'manual';
    const order = manual ? lobbyOrder() : [];
    return `<div class="stack" style="gap:8px">
      <div class="small muted" style="font-weight:700">Reihenfolge der Spieler</div>
      <div class="segmented">
        <button data-action="cdSetting" data-key="orderMode" data-value="random" class="${!manual ? 'on' : ''}">🎲 Zufällig</button>
        <button data-action="cdSetting" data-key="orderMode" data-value="manual" class="${manual ? 'on' : ''}">✋ Selbst festlegen</button>
      </div>
      ${manual ? `<ol class="cd-order" id="cd-order">${order.map((id, i) => {
        const p = playerById(id);
        return `<li class="cd-order-item ${cd.drag?.id === id ? 'dragging' : ''} ${p?.connected === false ? 'offline' : ''}" data-player="${id}">
          <span class="cd-pos">${i + 1}.</span>${avatarHtml(p, 'sm')}<span class="name">${esc(p?.name || '?')}${p?.isHost ? ' 👑' : ''}</span>
          <span class="cd-handle" title="Ziehen zum Verschieben">⠿</span></li>`;
      }).join('')}</ol>
      <div class="row spread"><span class="small muted">Zum Verschieben am Griff ⠿ ziehen.</span><button class="btn small" data-action="cdShuffle">🎲 Mischen</button></div>`
        : '<div class="small muted">Die Reihenfolge wird beim Start ausgelost.</div>'}
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
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Spielmodus</div>
        <div class="segmented">
          <button data-action="cdSetting" data-key="mode" data-value="rounds" class="${g.mode === 'rounds' ? 'on' : ''}">🔁 Feste Runden</button>
          <button data-action="cdSetting" data-key="mode" data-value="ko" class="${g.mode === 'ko' ? 'on' : ''}">💥 K.-o.</button>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Zähne (Original: 13)</span>
          <input id="cd-teeth" type="number" min="5" max="24" value="${g.teeth}" inputmode="numeric">
        </label>
        ${g.mode === 'rounds' ? `<label class="field"><span>Runden</span>
          <input id="cd-rounds" type="number" min="1" max="20" value="${g.rounds}" inputmode="numeric">
        </label>` : ''}
        <label class="field"><span>Zeit pro Zug</span>
          <select id="cd-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      ${viewOrder()}
      <div class="small muted">So geht's: Reihum drückt jeder einen Zahn des Krokodils. Einer davon ist der wunde Zahn, und dann schnappt das Maul zu. ${g.mode === 'ko'
        ? 'Wer gebissen wird, scheidet aus. Wer am Ende übrig bleibt, gewinnt.'
        : 'Wer gebissen wird, bekommt einen Biss. Nach der letzten Runde gewinnt, wer am wenigsten gebissen wurde.'} Die nächste Runde beginnt, wer nach dem Gebissenen an der Reihe ist.${g.timeLimit ? ' Läuft die Zeit ab, wird ein zufälliger Zahn gedrückt.' : ''}</div>
    </div>`;
  }

  // Zähne liegen auf einem U entlang des Unterkiefers und zeigen zur Mitte
  function viewCroc(R) {
    const n = R.teeth.length;
    const size = Math.min(12, 150 / n);
    const teeth = R.teeth.map((tooth, i) => {
      const t = (Math.PI * (i + 0.5)) / n;
      const x = 50 - 43 * Math.cos(t);
      const y = 10 + 74 * Math.sin(t);
      const rot = 90 - (t * 180) / Math.PI;
      const clickable = R.isActive && !tooth.pressed;
      const cls = [tooth.pressed ? 'pressed' : '', tooth.bad ? 'bad' : '', clickable ? 'free' : ''].join(' ');
      const by = tooth.by ? ` · ${esc(playerName(tooth.by))}` : '';
      return `<button class="cd-tooth ${cls}" style="left:${x}%;top:${y}%;width:${size}%;--rot:${rot}deg" title="Zahn ${i + 1}${by}"
        ${clickable ? `data-action="cdPress" data-i="${i}"` : 'disabled'}></button>`;
    }).join('');
    const closed = R.phase !== 'turn';
    return `<div class="cd-croc ${closed ? 'closed' : ''} ${closed && cd.snapping ? 'snap' : ''} ${R.isActive ? 'mine' : ''}">
      <div class="cd-head"><span class="cd-eye"></span><span class="cd-eye"></span><span class="cd-nose"></span></div>
      <div class="cd-jaw"><div class="cd-mouth"><div class="cd-tongue"></div>${teeth}</div><div class="cd-upper"></div></div>
    </div>`;
  }

  function viewStrip(R) {
    return `<div class="cd-strip">${R.order.map((id) => {
      const p = playerById(id);
      const out = R.out.includes(id);
      const cls = [id === R.activeId ? 'active' : '', out ? 'out' : '', id === R.bittenId && R.phase !== 'turn' ? 'bitten' : '', p?.connected === false ? 'offline' : ''].join(' ');
      return `<div class="cd-chip ${cls}">${avatarHtml(p, 'sm')}<span class="name">${esc(p?.name || '?')}${id === S.me.id ? ' (du)' : ''}</span>
        ${R.mode === 'rounds' && R.bites[id] ? `<b class="cd-bites">🐊${R.bites[id]}</b>` : ''}</div>`;
    }).join('')}</div>`;
  }

  function viewHead(R) {
    const round = R.mode === 'rounds' ? `Runde ${R.roundNo}/${R.rounds}` : `Runde ${R.roundNo} · ${R.order.length - R.out.length} im Spiel`;
    const pressed = R.teeth.filter((t) => t.pressed).length;
    return `<div class="q-head">
      <div class="small muted"><b>${round}</b> · ${pressed} von ${R.teeth.length} Zähnen gedrückt</div>
      ${R.deadline && R.phase === 'turn' ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function viewStatus(R) {
    if (R.phase === 'turn') {
      const active = playerById(R.activeId);
      if (R.isActive) return '<div class="cd-status mine">Du bist dran! Drück einen Zahn … 🫣</div>';
      return `<div class="cd-status">${avatarHtml(active, 'sm')} <b>${esc(active?.name || '?')}</b>&nbsp;ist dran</div>`;
    }
    const bitten = playerById(R.bittenId);
    const me = R.bittenId === S.me.id;
    const ko = R.mode === 'ko' ? (me ? ' Du bist raus.' : ' und ist raus.') : '';
    return `<div class="cd-status bitten">💥 SCHNAPP! ${me ? `Du wurdest gebissen!${ko}` : `${avatarHtml(bitten, 'sm')} <b>${esc(bitten?.name || '?')}</b>&nbsp;wurde gebissen${ko}!`}</div>`;
  }

  function viewFinal(R) {
    const ranked = R.ranking;
    const winners = ranked.filter((r) => r.place === 1);
    const title = winners.length === 1 ? `${esc(playerName(winners[0].id))} gewinnt!` : 'Unentschieden!';
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 1: 140, 2: 100, 3: 70 };
    return `<div class="stack">
      ${viewCroc(R)}
      ${viewStatus(R)}
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${title}</h1></div>
      <div class="podium">${top.map((t) => `<div class="step"><div>${avatarHtml(playerById(t.id))}</div><b>${esc(playerName(t.id))}</b>
        <div class="small muted">${t.bites === 1 ? '1 Biss' : `${t.bites} Bisse`}</div>
        <div class="block" style="--team:var(--accent);height:${heights[t.place] ?? 70}px">${t.place}</div></div>`).join('')}</div>
      <div class="card stack">
        <h3 style="margin:0">Wertung</h3>
        ${ranked.map((t) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${t.place}.</span>${avatarHtml(playerById(t.id), 'sm')}
          <span class="name">${esc(playerName(t.id))}</span><span class="pts">🐊 ${t.bites}</span></div>`).join('')}
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    // Zuschnappen nur einmal pro Runde animieren, nicht bei jedem Neuzeichnen
    if (R.phase !== 'turn' && cd.seenSnap !== R.roundNo) {
      cd.seenSnap = R.roundNo;
      cd.snapping = true;
      if (R.bittenId === S.me.id) navigator.vibrate?.([300, 80, 300]);
      setTimeout(() => { cd.snapping = false; }, 1200);
    }
    if (R.phase === 'final') return viewFinal(R);
    return `<div class="stack">
      ${viewHead(R)}
      ${viewStatus(R)}
      ${viewCroc(R)}
      ${viewStrip(R)}
      ${R.phase === 'bitten' && !S.me.isHost ? '<div class="muted center">Der Host startet gleich die nächste Runde.</div>' : ''}
    </div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'bitten') return '<button class="btn primary" data-action="next">Nächste Runde ▶︎</button>';
    const name = esc(playerName(R.activeId));
    return `<button class="btn" data-action="cdSkip">⏭ ${name} überspringen</button><button class="btn" data-action="cdForce">🎲 Für ${name} drücken</button>`;
  }

  gameViews.crocodoc = { settings: viewSettings, view, hostbar };

  function sendOrder(order) {
    cd.localOrder = order;
    sendHost('settings', { game: { order } });
  }

  Object.assign(actions, {
    cdSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value } }),
    cdPress: (el) => act('press', { index: Number(el.dataset.i) }),
    cdForce: () => act('force'),
    cdSkip: () => act('skip'),
    cdShuffle: () => {
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
    const handle = e.target.closest('.cd-handle');
    if (!handle || S?.game.id !== 'crocodoc' || !S.me.isHost) return;
    e.preventDefault();
    const item = handle.closest('.cd-order-item');
    cd.drag = { id: item.dataset.player, order: lobbyOrder() };
    item.classList.add('dragging');
  });

  document.addEventListener('pointermove', (e) => {
    if (!cd.drag) return;
    const list = document.getElementById('cd-order');
    const items = list ? [...list.children] : [];
    const dragged = items.find((el) => el.dataset.player === cd.drag.id);
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
    cd.drag.order = [...list.children].map((el) => el.dataset.player);
    list.querySelectorAll('.cd-pos').forEach((el, i) => { el.textContent = `${i + 1}.`; });
  });

  function endDrag() {
    if (!cd.drag) return;
    const { order } = cd.drag;
    cd.drag = null;
    if (!sameList(order, S.settings.game.order)) sendOrder(order);
    render();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'crocodoc') return;
    const keys = { 'cd-teeth': 'teeth', 'cd-rounds': 'rounds', 'cd-time': 'timeLimit' };
    const key = keys[e.target.id];
    if (key) sendHost('settings', { game: { [key]: Number(e.target.value) } });
  });
})();
