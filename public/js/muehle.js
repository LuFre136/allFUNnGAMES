// Mühle: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const BEST_OF = [[1, 'Eine Partie'], [3, 'Best of 3'], [5, 'Best of 5'], [0, 'Ohne Ende']];
  const TIMES = [0, 15, 30, 60];
  const COLOR = { w: 'Weiß', b: 'Schwarz' };
  const STONE = { w: '⚪', b: '⚫' };
  const UNIT = 100; // Abstand der Rasterpunkte im SVG
  const mu = {
    sel: null, // angetippter eigener Stein beim Ziehen und Springen
    seenSeq: null,
    fresh: false, // der letzte Zug ist neu und wird animiert
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function fmtScore(n) {
    return String(n).replace('.5', '½').replace(/^0½/, '½');
  }

  function xy(R, p) {
    const [x, y] = R.coords[p];
    return [x * UNIT, y * UNIT];
  }

  // ---------- Lobby ----------

  function lobbyExtra() {
    if (S.me.isHost && !S.settings.hostPlays) return '';
    const guests = S.players.filter((p) => p.guestOf === S.me.id);
    return `<div class="card stack">
      <h3 style="margin:0">Mitspieler an diesem Gerät</h3>
      <div class="small muted">Dein Gegenüber hat kein Handy? Trag es hier ein, dann spielt ihr beide an diesem Gerät und gebt es nach jedem Zug weiter, wie bei einem echten Brett.</div>
      ${guests.map((p) => `<div class="member">${avatarHtml(p, 'sm')}<span class="name">${esc(p.name)}</span>
        <button class="btn small icon ghost" data-action="muRemoveGuest" data-player="${p.id}" title="Entfernen">✕</button></div>`).join('')}
      ${guests.length ? '' : `<form id="mu-guest-form" class="row" style="flex-wrap:nowrap">
        <input id="mu-guest-name" type="text" maxlength="24" placeholder="Name" autocomplete="off" style="flex:1;min-width:0">
        <button class="btn primary small" type="submit">+ Hinzufügen</button>
      </form>`}
    </div>`;
  }

  function segmented(key, value, options) {
    return `<div class="segmented">${options.map(([v, text]) => `<button data-action="muSetting" data-key="${key}" data-value="${v}" class="${String(v) === String(value) ? 'on' : ''}">${text}</button>`).join('')}</div>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const playing = S.players.filter((p) => p.connected && (!p.isHost || s.hostPlays)).length;
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
      ${playing !== 2 ? `<div class="mu-note">Mühle spielt man zu zweit. Gerade ${playing === 1 ? 'ist 1 Spieler' : `sind ${playing} Spieler`} da.</div>` : ''}
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Partien</span>
          <select id="mu-bestOf">${BEST_OF.map(([n, text]) => `<option value="${n}" ${n === g.bestOf ? 'selected' : ''}>${text}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="mu-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Mit drei Steinen</div>${segmented('flying', g.flying ? 1 : 0, [[1, '🦘 Springen'], [0, 'Weiter ziehen']])}</div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Doppelmühle nimmt</div>${segmented('doubleMill', g.doubleMill, [[1, 'Einen Stein'], [2, 'Zwei Steine']])}</div>
      <div><div class="small muted" style="font-weight:700;margin-bottom:6px">Mögliche Ziele zeigen</div>${segmented('preview', g.preview ? 1 : 0, [[1, '✨ An'], [0, 'Aus']])}</div>
      <div class="small muted">So geht's: Jeder hat 9 Steine. Erst setzt ihr abwechselnd je einen Stein auf einen freien Punkt, danach zieht ihr eure Steine entlang der Linien zum freien Nachbarpunkt.${g.flying ? ' Wer nur noch drei Steine hat, darf mit einem Stein auf jeden freien Punkt springen.' : ''} Wer drei eigene Steine in eine Reihe bringt, hat eine Mühle und nimmt dem Gegner einen Stein, aber keinen aus einer Mühle, solange es andere gibt. Wer nur noch zwei Steine hat oder nicht mehr ziehen kann, verliert. Kommt dieselbe Stellung dreimal vor${g.flying ? ` oder wird beim Springen 50 Züge lang nicht geschlagen` : ''}, ist es Remis. Die Farben wechseln jede Partie.${g.timeLimit ? ' Läuft die Zeit ab, macht das Spiel einen Zufallszug, beim dritten Mal hintereinander ist die Partie verloren.' : ''}</div>
    </div>`;
  }

  // ---------- Brett ----------

  // Was der Spieler am Zug antippen darf
  function tapInfo(R) {
    const info = { targets: new Set(), pickable: new Set(), removable: new Set() };
    if (!R.mine) return info;
    for (const m of R.legal) {
      if (m.type === 'remove') info.removable.add(m.at);
      else if (m.type === 'place') info.targets.add(m.to);
      else {
        info.pickable.add(m.from);
        if (m.from === mu.sel) info.targets.add(m.to);
      }
    }
    return info;
  }

  function viewBoard(R) {
    const info = tapInfo(R);
    if (mu.sel !== null && !info.pickable.has(mu.sel)) mu.sel = null;
    const last = R.lastMove;
    const lines = [0, 1, 2].map((r) => {
      const a = r * UNIT;
      const size = (6 - 2 * r) * UNIT;
      return `<rect x="${a}" y="${a}" width="${size}" height="${size}" />`;
    }).join('') + [[3, 0, 3, 2], [3, 4, 3, 6], [0, 3, 2, 3], [4, 3, 6, 3]].map(([x1, y1, x2, y2]) => `<line x1="${x1 * UNIT}" y1="${y1 * UNIT}" x2="${x2 * UNIT}" y2="${y2 * UNIT}" />`).join('');
    const mills = (last?.mills || []).map((m) => {
      const pts = m.map((p) => xy(R, p)).sort((a, b) => a[0] + a[1] - b[0] - b[1]);
      return `<line class="mu-millline ${mu.fresh ? 'fresh' : ''}" x1="${pts[0][0]}" y1="${pts[0][1]}" x2="${pts[2][0]}" y2="${pts[2][1]}" />`;
    }).join('');
    const ghosts = mu.fresh ? (last?.removed || []).map((p) => {
      const [x, y] = xy(R, p);
      return `<circle class="mu-stone ${last.color === 'w' ? 'b' : 'w'} mu-ghost" cx="${x}" cy="${y}" r="36" />`;
    }).join('') : '';
    const points = R.board.map((c, p) => {
      const [x, y] = xy(R, p);
      const tappable = info.targets.has(p) || info.pickable.has(p) || info.removable.has(p);
      const cls = [
        'mu-pt',
        tappable ? 'tap' : '',
        info.targets.has(p) && R.preview ? 'target' : '',
        info.removable.has(p) ? 'removable' : '',
        mu.sel === p ? 'sel' : '',
        last && last.to === p ? 'last' : '',
      ].join(' ');
      let stone = '';
      if (c) {
        const moved = mu.fresh && last && last.to === p;
        const slide = moved && last.from !== null ? `style="--dx:${(R.coords[last.from][0] - R.coords[p][0]) * UNIT}px;--dy:${(R.coords[last.from][1] - R.coords[p][1]) * UNIT}px"` : '';
        stone = `<circle class="mu-stone ${c} ${moved ? (last.from !== null ? 'slide' : 'drop') : ''}" cx="${x}" cy="${y}" r="36" ${slide} />`;
      }
      const from = last && last.from === p && !c ? `<circle class="mu-from" cx="${x}" cy="${y}" r="16" />` : '';
      return `<g class="${cls}" ${tappable ? `data-action="muTap" data-point="${p}"` : ''}>
        <circle class="mu-hit" cx="${x}" cy="${y}" r="48" />
        <circle class="mu-dot" cx="${x}" cy="${y}" r="11" />${from}${stone}
        <circle class="mu-ring" cx="${x}" cy="${y}" r="46" />
      </g>`;
    }).join('');
    return `<div class="mu-board ${R.mine ? 'mine' : ''} turn-${R.turn || ''}">
      <svg viewBox="-60 -60 720 720" role="img" aria-label="Mühlebrett">
        <g class="mu-lines">${lines}</g>${mills}${ghosts}${points}
      </svg>
    </div>`;
  }

  // ---------- Spieler ----------

  function viewSide(R, p) {
    const player = playerById(p.id);
    const active = R.phase === 'play' && R.turnId === p.id;
    const stage = { place: 'setzt', move: 'zieht', fly: 'springt' }[p.stage];
    const hand = Array.from({ length: p.hand }, () => `<span class="mu-mini ${p.color}"></span>`).join('');
    const lostEnemy = R.players.find((o) => o.id !== p.id)?.lost || 0;
    const taken = Array.from({ length: lostEnemy }, () => `<span class="mu-mini ${p.color === 'w' ? 'b' : 'w'}"></span>`).join('');
    return `<div class="mu-side ${active ? 'active' : ''} ${player?.connected === false ? 'offline' : ''}">
      <div class="mu-who">${avatarHtml(player)}<div>
        <div class="mu-name">${STONE[p.color]} ${esc(playerName(p.id))}</div>
        <div class="small muted">${COLOR[p.color]}${active ? ` · ${R.pendingRemove ? 'nimmt einen Stein' : stage}` : ''}</div>
      </div><div class="mu-score">${fmtScore(p.score)}</div></div>
      ${p.hand ? `<div class="mu-row"><span class="small muted">Noch zu setzen</span><div class="mu-minis">${hand}</div></div>` : `<div class="mu-row"><span class="small muted">Auf dem Brett</span><b>${p.onBoard}</b></div>`}
      <div class="mu-row"><span class="small muted">Geschlagen</span><div class="mu-minis">${taken || '<span class="small muted">–</span>'}</div></div>
    </div>`;
  }

  function viewStatus(R) {
    if (R.phase !== 'play') return '';
    const name = esc(playerName(R.turnId));
    const who = `${avatarHtml(playerById(R.turnId), 'sm')} ${name}`;
    const stage = R.players.find((p) => p.id === R.turnId).stage;
    let text;
    if (R.pendingRemove) {
      const enemy = R.turn === 'w' ? 'schwarzen' : 'weißen';
      const what = R.pendingRemove === 2 ? `zwei ${enemy.replace(/n$/, '')} Steine` : `einen ${enemy} Stein`;
      text = R.mine ? `${who} hat eine Mühle! Nimm ${what}` : `${who} hat eine Mühle und nimmt ${what}`;
    } else if (stage === 'place') text = R.mine ? `${who} ist dran: setz einen Stein` : `${who} setzt einen Stein`;
    else if (stage === 'fly') text = R.mine ? (mu.sel !== null ? `${who}: wohin springen?` : `${who} ist dran: spring mit einem Stein`) : `${who} springt`;
    else text = R.mine ? (mu.sel !== null ? `${who}: wohin ziehen?` : `${who} ist dran: zieh einen Stein`) : `${who} zieht`;
    return `<div class="mu-status ${R.mine ? 'mine' : ''} ${R.pendingRemove ? 'mill' : ''}">${text}</div>`;
  }

  function seriesLine(R) {
    const [a, b] = R.players;
    return `${esc(playerName(a.id))} <b>${fmtScore(a.score)} : ${fmtScore(b.score)}</b> ${esc(playerName(b.id))}`;
  }

  function viewResult(R) {
    const r = R.result;
    const head = r.winnerId ? `🏆 ${esc(playerName(r.winnerId))} gewinnt Partie ${r.gameNo}!` : `🤝 Partie ${r.gameNo}: Remis`;
    const why = r.winnerId ? `${esc(playerName(r.loserId))}: ${esc(r.reasonText)}` : esc(r.reasonText);
    return `<div class="mu-result card stack">
      <div class="mu-result-head">${head}</div>
      <div class="muted">${why}</div>
      <div class="small muted">${Math.ceil(r.plies / 2)} Züge · Mühlen: ${R.players.map((p) => `${esc(playerName(p.id))} ${r.mills[p.id]}`).join(', ')}</div>
      <div class="mu-series">${seriesLine(R)}</div>
      ${S.me.isHost ? '' : '<div class="small muted">Gleich startet der Host die nächste Partie, dann mit getauschten Farben.</div>'}
    </div>`;
  }

  function viewPlaying(R) {
    const mineIds = R.players.filter((p) => p.mine);
    // Wer nur eine Farbe spielt, hat seine Seite unten; sonst Weiß oben bzw. links
    const sides = mineIds.length === 1 ? [R.players.find((p) => !p.mine), mineIds[0]] : ['w', 'b'].map((c) => R.players.find((p) => p.color === c));
    const away = R.awayId ? `<div class="mu-note">📵 ${esc(playerName(R.awayId))} ist nicht verbunden. Ohne Rückkehr innerhalb einer Minute ${R.phase === 'play' ? 'gilt die Partie als aufgegeben' : 'endet das Spiel'}.</div>` : '';
    const resign = R.phase === 'play' && mineIds.length ? `<div class="center"><button class="btn small ghost" data-action="muResign">🏳️ Aufgeben${mineIds.length > 1 ? ` (${esc(playerName(R.turnId))})` : ''}</button></div>` : '';
    return `<div class="stack">
      <div class="q-head">
        <div class="small muted"><b>Mühle</b> · Partie ${R.gameNo}${R.bestOf ? ` · Best of ${R.bestOf}` : ''} · ${seriesLine(R)}</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${away}
      ${viewStatus(R)}
      <div class="mu-layout">
        ${viewSide(R, sides[0])}
        ${viewBoard(R)}
        ${viewSide(R, sides[1])}
      </div>
      ${R.phase === 'gameEnd' ? viewResult(R) : ''}
      ${resign}
    </div>`;
  }

  function viewFinal(R) {
    const [a, b] = R.players;
    const winner = a.score === b.score ? null : (a.score > b.score ? a : b);
    const r = R.result;
    const left = r && (r.reason === 'left' || r.leftId) ? `<div class="mu-note">${esc(playerName(r.leftId || r.loserId))} ist nicht zurückgekommen, darum endet das Spiel.</div>` : '';
    const stat = (label, fn) => `<tr><td class="muted">${label}</td>${R.players.map((p) => `<td>${fn(R.stats[p.id])}</td>`).join('')}</tr>`;
    return `<div class="stack">
      <div class="center">
        <div style="font-size:3rem">${winner ? '🏆' : '🤝'}</div>
        <h1>${winner ? `${esc(playerName(winner.id))} gewinnt!` : 'Unentschieden!'}</h1>
        ${winner ? `<div>${avatarHtml(playerById(winner.id))}</div>` : ''}
        <div class="mu-series big">${seriesLine(R)}</div>
      </div>
      ${left}
      <div class="card stack">
        <h3 style="margin:0">Partien</h3>
        ${R.results.map((x) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${x.gameNo}.</span>
          <span class="name">${x.winnerId ? `${esc(playerName(x.winnerId))} gewinnt` : 'Remis'}<div class="small muted">${esc(x.reasonText)} · ${Math.ceil(x.plies / 2)} Züge · ${STONE.w} ${esc(playerName(x.white))}</div></span></div>`).join('') || '<div class="muted">Keine Partie beendet.</div>'}
      </div>
      <div class="card stack">
        <h3 style="margin:0">Statistik</h3>
        <table class="mu-stats"><tr><td></td>${R.players.map((p) => `<th>${esc(playerName(p.id))}</th>`).join('')}</tr>
          ${stat('Siege', (s) => s.wins)}
          ${stat('Remis', (s) => s.draws)}
          ${stat('Mühlen', (s) => s.mills)}
          ${stat('Schnellster Sieg', (s) => (s.fastestWin ? `${s.fastestWin} Züge` : '–'))}
        </table>
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (!R.mine) mu.sel = null;
    const seq = R.lastMove?.seq ?? null;
    // Nur beim ersten Zeichnen nach einem neuen Zug animieren (beim ersten Laden gar nicht),
    // sonst startet jede weitere Aktualisierung die Animation neu
    mu.fresh = seq !== mu.seenSeq && mu.seenSeq !== null && seq !== null;
    if (seq !== mu.seenSeq) {
      mu.seenSeq = seq;
      mu.sel = null;
    }
    return R.phase === 'final' ? viewFinal(R) : viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    const finish = R.bestOf ? '' : '<button class="btn" data-action="muFinish">🏁 Serie beenden</button>';
    if (R.phase === 'gameEnd') return `${finish}<button class="btn primary" data-action="next">Nächste Partie ▶︎</button>`;
    return `${finish}<button class="btn" data-action="muDraw">🤝 Remis</button><button class="btn" data-action="muForce">⏩ Zug für ${esc(playerName(R.turnId))} auslosen</button>`;
  }

  gameViews.muehle = { settings: viewSettings, lobbyExtra, view, hostbar };

  Object.assign(actions, {
    muSetting: (el) => {
      const raw = el.dataset.value;
      const value = el.dataset.key === 'doubleMill' ? Number(raw) : raw === '1';
      sendHost('settings', { game: { [el.dataset.key]: value } });
    },
    muTap: (el) => {
      const R = S.round;
      const p = Number(el.dataset.point);
      if (!R.mine) return;
      const legal = R.legal;
      if (legal.some((m) => m.type === 'remove' && m.at === p)) return act('remove', { at: p });
      if (legal.some((m) => m.type === 'place' && m.to === p)) return act('place', { to: p });
      if (mu.sel !== null && legal.some((m) => m.type === 'move' && m.from === mu.sel && m.to === p)) {
        const from = mu.sel;
        mu.sel = null;
        return act('move', { from, to: p });
      }
      if (legal.some((m) => m.type === 'move' && m.from === p)) {
        mu.sel = mu.sel === p ? null : p;
        render();
      }
    },
    muResign: () => {
      const R = S.round;
      const own = R.players.filter((p) => p.mine);
      const who = own.length > 1 ? R.turnId : own[0]?.id;
      if (who && confirm(`${playerName(who)} gibt diese Partie auf?`)) act('resign');
    },
    muRemoveGuest: (el) => socket.emit('guest:remove', { playerId: el.dataset.player }, (res) => { if (res?.error) toast(res.error); }),
    muForce: () => {
      if (confirm(`Für ${playerName(S.round.turnId)} einen zufälligen Zug machen?`)) act('force');
    },
    muDraw: () => {
      if (confirm('Diese Partie als Remis werten? Beide bekommen einen halben Punkt.')) act('draw');
    },
    muFinish: () => {
      if (confirm('Die Serie jetzt beenden und den Endstand zeigen?')) act('finish');
    },
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'mu-guest-form') return;
    e.preventDefault();
    const input = document.getElementById('mu-guest-name');
    const name = input.value.trim();
    if (!name) return toast('Bitte gib einen Namen ein.');
    const avatar = avatars.length ? avatars[Math.floor(Math.random() * avatars.length)] : null;
    socket.emit('guest:add', { name, avatar }, (res) => {
      if (res?.error) return toast(res.error);
      const field = document.getElementById('mu-guest-name');
      if (field) field.value = '';
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'muehle') return;
    if (e.target.id === 'mu-bestOf') sendHost('settings', { game: { bestOf: Number(e.target.value) } });
    else if (e.target.id === 'mu-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
  });
})();
