// Sieben auf einen Streich: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const TARGETS = [100, 150, 200, 300];
  const TIMES = [0, 15, 30, 60];
  const ACTIONS = {
    freeze: { icon: '❄️', name: 'Einfrieren', ask: 'Wen willst du einfrieren?', hint: 'Wer eingefroren wird, sichert seine Punkte und ist raus aus der Runde.' },
    flip3: { icon: '🎯', name: 'Drei auf einmal', ask: 'Wer muss drei Karten ziehen?', hint: 'Das Ziel zieht sofort drei Karten nacheinander.' },
    chance: { icon: '🍀', name: 'Zweite Chance', ask: 'Wem schenkst du die Zweite Chance?', hint: 'Du hast schon eine, diese musst du weitergeben.' },
  };
  const STATUS = {
    stayed: '✋ gestoppt',
    frozen: '❄️ eingefroren',
    bust: '💥 raus',
    seven: '🎉 Sieben!',
    out: 'setzt aus',
  };
  const STAGGER = 260; // ms zwischen zwei neuen Karten
  const FLY = 650; // Dauer der Kartenanimation
  const si = {
    seen: new Map(), // Kartennummer -> { t, delay } für die Animation neuer Karten
    loaded: false,
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
    if (si.localOrder && sameList(si.localOrder, saved)) si.localOrder = null;
    const base = (si.drag?.order || si.localOrder || saved).filter((id) => visible.includes(id));
    return [...base, ...visible.filter((id) => !base.includes(id))];
  }

  function viewOrder() {
    const manual = S.settings.game.orderMode === 'manual';
    const order = manual ? lobbyOrder() : [];
    return `<div class="stack" style="gap:8px">
      <div class="small muted" style="font-weight:700">Sitzreihenfolge</div>
      <div class="segmented">
        <button data-action="siSetting" data-key="orderMode" data-value="random" class="${!manual ? 'on' : ''}">🎲 Zufällig</button>
        <button data-action="siSetting" data-key="orderMode" data-value="manual" class="${manual ? 'on' : ''}">✋ Selbst festlegen</button>
      </div>
      ${manual ? `<ol class="si-order" id="si-order">${order.map((id, i) => {
        const p = playerById(id);
        return `<li class="si-order-item ${si.drag?.id === id ? 'dragging' : ''} ${p?.connected === false ? 'offline' : ''}" data-player="${id}">
          <span class="si-pos">${i + 1}.</span>${avatarHtml(p, 'sm')}<span class="name">${esc(p?.name || '?')}${p?.isHost ? ' 👑' : ''}</span>
          <span class="si-handle" title="Ziehen zum Verschieben">⠿</span></li>`;
      }).join('')}</ol>
      <div class="row spread"><span class="small muted">Zum Verschieben am Griff ⠿ ziehen.</span><button class="btn small" data-action="siShuffle">🎲 Mischen</button></div>`
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
        <button class="btn small icon ghost" data-action="siRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      <form id="si-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="si-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
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
        <label class="field"><span>Gewonnen ab</span>
          <select id="si-target">${TARGETS.map((t) => `<option value="${t}" ${t === g.target ? 'selected' : ''}>${t} Punkten</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="si-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Risiko anzeigen</div>
        <div class="segmented">
          <button data-action="siSetting" data-key="risk" data-value="1" class="${g.risk ? 'on' : ''}">📊 An</button>
          <button data-action="siSetting" data-key="risk" data-value="0" class="${!g.risk ? 'on' : ''}">Aus (selbst mitzählen)</button>
        </div>
      </div>
      ${viewOrder()}
      <div class="small muted">So geht's: Reihum ziehst du eine Karte oder stoppst und sicherst deine Punkte. Ziehst du eine Zahl, die du in dieser Runde schon hast, bist du raus und bekommst 0 Punkte. Wer sieben verschiedene Zahlen schafft, beendet die Runde sofort und bekommt 15 Bonus. Im Stapel liegt jede Zahl so oft, wie sie zählt (zwölf Zwölfen, aber nur eine Eins). Bonuskarten: +2 bis +10 und ×2 (verdoppelt deine Zahlen). Aktionen: ❄️ Einfrieren (das Ziel sichert seine Punkte und ist raus), 🎯 Drei auf einmal (das Ziel zieht drei Karten), 🍀 Zweite Chance (rettet einmal vor einer doppelten Zahl). Gewonnen hat, wer nach einer Runde vorne liegt und die Zielpunktzahl erreicht hat.${g.timeLimit ? ' Läuft die Zeit ab, stoppt der Spieler automatisch.' : ''}</div>
    </div>`;
  }

  // ---------- Karten ----------

  // Neue Karten fliegen nacheinander herein, auch wenn zwischendurch neu gezeichnet wird
  function noteCards(R) {
    const cards = R.players.flatMap((p) => [...p.numbers, ...p.mods, ...p.actions, p.chance, p.bustCard]).filter(Boolean);
    const fresh = cards.filter((c) => !si.seen.has(c.n)).sort((a, b) => a.n - b.n);
    // Nach dem Neuladen nur das frische Austeilen zeigen, nicht die ganze Runde noch einmal
    const animate = si.loaded || cards.length <= R.players.length;
    const now = Date.now();
    fresh.forEach((c, i) => si.seen.set(c.n, { t: animate ? now : 0, delay: Math.min(i * STAGGER, 4000) }));
    si.loaded = true;
    if (si.seen.size > 400) {
      const keep = new Set(cards.map((c) => c.n));
      for (const n of si.seen.keys()) if (!keep.has(n)) si.seen.delete(n);
    }
  }

  function flyAttrs(c) {
    const s = si.seen.get(c.n);
    const age = Date.now() - (s?.t || 0);
    if (!s || age > s.delay + FLY) return { cls: '', style: '' };
    return { cls: 'fresh', style: `animation-delay:${s.delay - age}ms` };
  }

  function numberColor(v) {
    return `hsl(${(v * 31 + 200) % 360} 70% 45%)`;
  }

  function cardHtml(c, extra = '') {
    const fly = flyAttrs(c);
    const cls = `si-card ${fly.cls} ${extra}`;
    if (c.kind === 'number') {
      return `<span class="${cls} si-num" style="--c:${numberColor(c.value)};${fly.style}" title="${c.value}"><b>${c.value}</b></span>`;
    }
    if (c.kind === 'plus' || c.kind === 'times') {
      return `<span class="${cls} si-mod" style="${fly.style}" title="${c.kind === 'plus' ? `${c.value} Bonuspunkte` : 'Zahlen verdoppeln'}"><b>${c.kind === 'plus' ? `+${c.value}` : '×2'}</b></span>`;
    }
    const a = ACTIONS[c.kind];
    return `<span class="${cls} si-act si-${c.kind}" style="${fly.style}" title="${a.name}"><b>${a.icon}</b><small>${a.name}</small></span>`;
  }

  function playerCards(p) {
    const cards = [
      ...p.numbers.map((c) => cardHtml(c)),
      p.bustCard ? cardHtml(p.bustCard, 'si-dup') : '',
      ...p.mods.map((c) => cardHtml(c)),
      ...p.actions.map((c) => cardHtml(c, 'si-used')),
      p.chance ? cardHtml(p.chance) : '',
    ].join('');
    return cards || '<span class="small muted">noch keine Karte</span>';
  }

  // ---------- Spiel ----------

  function playerRow(R, p, { scores } = {}) {
    const player = playerById(p.id);
    const choosing = R.pending?.mine && R.pending.targets.includes(p.id);
    const cls = ['si-player', `st-${p.status}`, p.id === R.turnId || p.id === R.pending?.pid ? 'turn' : '', p.id === S.me.id ? 'me' : '', choosing ? 'pick' : '', player?.connected === false ? 'offline' : ''].join(' ');
    const badge = STATUS[p.status] ? `<span class="si-badge">${STATUS[p.status]}</span>` : '';
    const count = p.status !== 'out' ? `<span class="si-count" title="verschiedene Zahlen">${p.numbers.length}/${R.seven}</span>` : '';
    const gained = scores && scores[p.id] !== undefined ? `<span class="si-gain">+${scores[p.id]}</span>` : '';
    return `<div class="${cls}" ${choosing ? `data-action="siTarget" data-player="${p.id}"` : ''}>
      <div class="si-who">${avatarHtml(player, 'sm')}<span class="name">${esc(player?.name || '?')}</span>${p.id === R.dealerId ? '<span class="si-dealer" title="Gibt in dieser Runde">Geber</span>' : ''}${count}${badge}</div>
      <div class="si-cards">${playerCards(p)}</div>
      <div class="si-pts"><b>${p.status === 'bust' ? 0 : p.points}</b><span>${gained || `${p.total} gesamt`}</span></div>
    </div>`;
  }

  function viewTable(R, opts) {
    const many = R.players.length > 6 ? 'many' : '';
    return `<div class="si-table ${many}">${R.players.map((p) => playerRow(R, p, opts)).join('')}</div>`;
  }

  function viewPile(R) {
    const lines = R.log.slice().reverse().slice(0, 4);
    return `<div class="si-pile">
      <div class="si-deck" title="Karten im Stapel"><span class="si-back">🃏</span><b>${R.deck}</b><small>Stapel</small></div>
      <div class="si-log">${lines.map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l.text)}</div>`).join('')}</div>
      <div class="si-deck" title="Karten auf der Ablage"><span class="si-back used">🂠</span><b>${R.discard}</b><small>Ablage</small></div>
    </div>`;
  }

  function viewRisk(R, id) {
    if (R.risk === null || R.risk === undefined) return '';
    const p = R.players.find((x) => x.id === id);
    const level = R.risk >= 40 ? 'high' : R.risk >= 20 ? 'mid' : 'low';
    return `<div class="si-risk ${level}">📊 Risiko für eine doppelte Zahl: <b>${R.risk} %</b>${p?.chance ? ' (🍀 Zweite Chance schützt)' : ''}</div>`;
  }

  function viewControls(R) {
    if (R.pending) {
      const a = ACTIONS[R.pending.kind];
      const by = esc(playerName(R.pending.pid));
      if (!R.pending.mine) return `<div class="si-status">${avatarHtml(playerById(R.pending.pid), 'sm')} <b>${by}</b>&nbsp;wählt ein Ziel für ${a.icon} ${a.name} …</div>`;
      const forGuest = R.pending.pid !== S.me.id ? `<div class="small">für ${esc(playerName(R.pending.pid))}</div>` : '';
      return `<div class="si-panel mine">
        <div class="si-panel-head">${cardHtml({ kind: R.pending.kind, n: -1 }, 'big')}<div><h2 style="margin:0">${a.ask}</h2>${forGuest}<div class="small">${a.hint}</div></div></div>
        <div class="si-targets">${R.pending.targets.map((id) => {
          const p = R.players.find((x) => x.id === id);
          return `<button class="btn" data-action="siTarget" data-player="${id}">${avatarHtml(playerById(id), 'sm')} ${id === R.pending.pid ? 'Mich selbst' : esc(playerName(id))} <span class="small muted">${p.points} P.</span></button>`;
        }).join('')}</div>
      </div>`;
    }
    if (!R.turnId) return '';
    const p = R.players.find((x) => x.id === R.turnId);
    if (!R.myTurn) {
      return `<div class="si-status">${avatarHtml(playerById(R.turnId), 'sm')} <b>${esc(playerName(R.turnId))}</b>&nbsp;ist dran</div>${viewRisk(R, R.turnId)}`;
    }
    // Am geteilten Gerät immer den Namen zeigen, damit klar ist, wer ziehen soll
    const who = `${esc(playerName(R.turnId))} ist dran!${R.turnId === S.me.id ? '' : ' Gib das Gerät weiter.'}`;
    return `<div class="si-panel mine">
      <div class="si-panel-title">${who}</div>
      ${viewRisk(R, R.turnId)}
      <div class="si-buttons">
        <button class="btn primary big" data-action="siHit">🃏 Ziehen</button>
        <button class="btn big" data-action="siStay">✋ Stopp <span class="small">(${p.points} Punkte sichern)</span></button>
      </div>
    </div>`;
  }

  function viewPlaying(R) {
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>Runde ${R.roundNo}</b> · gewonnen ab ${R.target} Punkten</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${viewControls(R)}
      ${viewPile(R)}
      ${viewTable(R)}
    </div>`;
  }

  function ranking(R) {
    return R.players.map((p) => ({ id: p.id, pts: p.total })).sort((a, b) => b.pts - a.pts);
  }

  function viewScores(R, ranked) {
    return `<div class="card stack">
      ${ranked.map((t) => {
        const place = ranked.filter((o) => o.pts > t.pts).length + 1;
        const gained = R.lastScores?.[t.id];
        return `<div class="score-row" style="--team:var(--accent)"><span class="rank">${place}.</span>${avatarHtml(playerById(t.id), 'sm')}<span class="name">${esc(playerName(t.id))}</span>
          ${gained !== undefined ? `<span class="small muted">+${gained}</span>` : ''}<span class="pts">${t.pts}</span></div>`;
      }).join('')}
    </div>`;
  }

  function viewRoundEnd(R) {
    const ranked = ranking(R);
    const lead = ranked[0];
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🃏</div><h1>Runde ${R.roundNo} ist vorbei</h1>
        <p class="muted">${lead.pts >= R.target ? 'Gleichstand an der Spitze, es geht weiter!' : `Noch ${R.target - lead.pts} Punkte bis zum Sieg für ${esc(playerName(lead.id))}.`}</p></div>
      ${viewScores(R, ranked)}
      ${viewPile(R)}
      ${viewTable(R, { scores: R.lastScores })}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host startet gleich die nächste Runde.</div>'}
    </div>`;
  }

  // Sonderpreise: wer am häufigsten raus war, wer die meisten Zahlen in einer Runde hatte, wer sieben geschafft hat
  function viewPrizes(R) {
    const ids = Object.keys(R.stats);
    const best = (key) => {
      const top = Math.max(...ids.map((id) => R.stats[id][key]));
      return top > 0 ? { top, ids: ids.filter((id) => R.stats[id][key] === top) } : null;
    };
    const names = (list) => list.map((id) => `<b>${esc(playerName(id))}</b>`).join(', ');
    const prizes = [];
    const brave = best('mostNumbers');
    if (brave) prizes.push(`🔥 <b>Draufgänger:</b> ${names(brave.ids)} (${brave.top} Zahlen in einer Runde)`);
    const round = best('bestRound');
    if (round) prizes.push(`💰 <b>Beste Runde:</b> ${names(round.ids)} (${round.top} Punkte)`);
    const bad = best('busts');
    if (bad) prizes.push(`🍂 <b>Pechvogel:</b> ${names(bad.ids)} (${bad.top}× raus)`);
    const sevens = ids.filter((id) => R.stats[id].sevens > 0);
    if (sevens.length) prizes.push(`🎉 <b>Sieben auf einen Streich:</b> ${names(sevens)}`);
    return prizes.length ? `<div class="card stack si-prizes">${prizes.map((t) => `<div>${t}</div>`).join('')}</div>` : '';
  }

  function viewFinal(R) {
    const ranked = ranking(R);
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${esc(playerName(ranked[0].id))} gewinnt!</h1></div>
      <div class="podium">${top.map((t) => {
        const place = ranked.filter((o) => o.pts > t.pts).length;
        return `<div class="step"><div>${avatarHtml(playerById(t.id))}</div><b>${esc(playerName(t.id))}</b><div class="small muted">${t.pts} Punkte</div>
          <div class="block" style="--team:var(--accent);height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>
      ${viewPrizes(R)}
      ${viewScores(R, ranked)}
      <details class="card"><summary>Karten der letzten Runde</summary><div style="margin-top:12px">${viewTable(R, { scores: R.lastScores })}</div></details>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    noteCards(R);
    if (R.phase === 'play') return viewPlaying(R);
    if (R.phase === 'roundEnd') return viewRoundEnd(R);
    return viewFinal(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'roundEnd') return '<button class="btn primary" data-action="next">Nächste Runde ▶︎</button>';
    if (R.pending) return `<button class="btn" data-action="siForce">🎲 Ziel für ${esc(playerName(R.pending.pid))} auslosen</button>`;
    if (R.turnId) return `<button class="btn" data-action="siForce">✋ Für ${esc(playerName(R.turnId))} stoppen</button>`;
    return '';
  }

  gameViews.sieben = { settings: viewSettings, lobbyExtra, view, hostbar };

  function sendOrder(order) {
    si.localOrder = order;
    sendHost('settings', { game: { order } });
  }

  Object.assign(actions, {
    siSetting: (el) => {
      const v = el.dataset.value;
      sendHost('settings', { game: { [el.dataset.key]: el.dataset.key === 'risk' ? v === '1' : v } });
    },
    siHit: () => act('hit'),
    siStay: () => act('stay'),
    siTarget: (el) => act('target', { playerId: el.dataset.player }),
    siForce: () => {
      const R = S.round;
      const text = R.pending ? `Ziel für ${playerName(R.pending.pid)} auslosen?` : `Für ${playerName(R.turnId)} stoppen? Die Punkte werden gesichert.`;
      if (confirm(text)) act('force');
    },
    siRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
    siShuffle: () => {
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
    const handle = e.target.closest('.si-handle');
    if (!handle || S?.game.id !== 'sieben' || !S.me.isHost) return;
    e.preventDefault();
    const item = handle.closest('.si-order-item');
    si.drag = { id: item.dataset.player, order: lobbyOrder() };
    item.classList.add('dragging');
  });

  document.addEventListener('pointermove', (e) => {
    if (!si.drag) return;
    const list = document.getElementById('si-order');
    const items = list ? [...list.children] : [];
    const dragged = items.find((el) => el.dataset.player === si.drag.id);
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
    si.drag.order = [...list.children].map((el) => el.dataset.player);
    list.querySelectorAll('.si-pos').forEach((el, i) => { el.textContent = `${i + 1}.`; });
  });

  function endDrag() {
    if (!si.drag) return;
    const { order } = si.drag;
    si.drag = null;
    if (!sameList(order, S.settings.game.order)) sendOrder(order);
    render();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'si-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('si-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('si-guest-name');
      if (field) field.value = '';
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'sieben') return;
    if (e.target.id === 'si-target') sendHost('settings', { game: { target: Number(e.target.value) } });
    else if (e.target.id === 'si-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
  });
})();
