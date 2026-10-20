// Montagsmaler: Zeichenfläche, Raten und Einstellungen für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  // Gleiche Auflösung wie auf dem Server (CANVAS), damit Füllen überall gleich aussieht
  const W = 1200;
  const H = 900;
  const FLUSH_MS = 40;
  const FILL_TOLERANCE = 48;
  const LEVEL_LABELS = { leicht: 'leicht', mittel: 'mittel', schwer: 'schwer', eigene: 'eigener Begriff' };
  const REASONS = {
    solved: null,
    time: '⏰ Die Zeit ist um.',
    steal: null,
    skipped: '⏭ Der Host hat übersprungen.',
    gaveUp: '🏳️ Aufgegeben.',
    left: '🔌 Der Zeichner ist weg.',
  };

  const mm = {
    turnId: null, // Zeichnung, deren Striche gerade auf der Fläche sind
    strokes: [],
    fetching: false,
    tool: 'pen', // pen | eraser | fill
    color: '#111111',
    size: 16,
    active: null, // laufender Strich: { pointerId, stroke, sent }
    seq: 0,
    flushTimer: null,
    gallery: null, // fertige Bilder für die Endwertung
    galleryLoading: false,
    drag: null, // { id, order } während der Host einen Spieler verschiebt
    localOrder: null,
  };

  // Eine Zeichenfläche für das ganze Spiel. Sie wird nach jedem Neuzeichnen der Seite wieder eingehängt,
  // damit Striche und ein laufender Strich nicht verloren gehen.
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'mm-canvas';
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  paintAll(ctx, []);

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function send(op) {
    socket.emit('game:draw', { turn: mm.turnId, ...op }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function setting(key, value) {
    sendHost('settings', { game: { [key]: value } });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function segmented(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, label]) =>
      `<button data-action="mmSetting" data-key="${key}" data-value="${v}" class="${String(value) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  // ---------- Malen ----------

  function paintStroke(c, s, from = 0) {
    const p = s.pts;
    const n = p.length / 2;
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    c.lineWidth = s.size;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (n === 1) {
      c.beginPath();
      c.arc(p[0], p[1], s.size / 2, 0, Math.PI * 2);
      c.fill();
      return;
    }
    const start = Math.max(0, from - 1);
    c.beginPath();
    c.moveTo(p[start * 2], p[start * 2 + 1]);
    for (let i = start + 1; i < n; i++) c.lineTo(p[i * 2], p[i * 2 + 1]);
    c.stroke();
  }

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // Füllt die zusammenhängende Fläche um (x, y) mit der Farbe (Scanline-Verfahren)
  function floodFill(c, x, y, color, scale = 1) {
    const w = c.canvas.width;
    const h = c.canvas.height;
    const sx = Math.min(w - 1, Math.max(0, Math.round(x * scale)));
    const sy = Math.min(h - 1, Math.max(0, Math.round(y * scale)));
    const img = c.getImageData(0, 0, w, h);
    const d = img.data;
    const at = (sy * w + sx) * 4;
    const target = [d[at], d[at + 1], d[at + 2]];
    const [r, g, b] = hexToRgb(color);
    if (Math.abs(target[0] - r) + Math.abs(target[1] - g) + Math.abs(target[2] - b) < 8) return;
    const seen = new Uint8Array(w * h);
    const match = (i) => !seen[i] && Math.abs(d[i * 4] - target[0]) <= FILL_TOLERANCE && Math.abs(d[i * 4 + 1] - target[1]) <= FILL_TOLERANCE && Math.abs(d[i * 4 + 2] - target[2]) <= FILL_TOLERANCE;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [px, py] = stack.pop();
      let lx = px;
      while (lx > 0 && match(py * w + lx - 1)) lx--;
      let up = false;
      let down = false;
      for (let cx = lx; cx < w && match(py * w + cx); cx++) {
        const i = py * w + cx;
        seen[i] = 1;
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
        if (py > 0) {
          const m = match(i - w);
          if (m && !up) stack.push([cx, py - 1]);
          up = m;
        }
        if (py < h - 1) {
          const m = match(i + w);
          if (m && !down) stack.push([cx, py + 1]);
          down = m;
        }
      }
    }
    c.putImageData(img, 0, 0);
  }

  function paintItem(c, s, scale = 1) {
    if (s.fill) floodFill(c, s.x, s.y, s.color, scale);
    else paintStroke(c, s);
  }

  function paintAll(c, strokes, scale = 1) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(scale, 0, 0, scale, 0, 0);
    for (const s of strokes) paintItem(c, s, scale);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  function repaint() {
    paintAll(ctx, mm.strokes);
  }

  // Striche anderer Geräte (nur wer nicht selbst zeichnet, bekommt sie)
  function apply(op) {
    if (op.op === 'add') {
      const last = mm.strokes[mm.strokes.length - 1];
      if (last && last.id === op.id && !last.fill) {
        const from = last.pts.length / 2;
        last.pts.push(...op.pts);
        paintStroke(ctx, last, from);
      } else {
        const s = { id: op.id, color: op.color, size: op.size, pts: op.pts.slice() };
        mm.strokes.push(s);
        paintStroke(ctx, s);
      }
    } else if (op.op === 'fill') {
      const f = { id: op.id, fill: true, color: op.color, x: op.x, y: op.y };
      mm.strokes.push(f);
      floodFill(ctx, f.x, f.y, f.color);
    } else if (op.op === 'undo') {
      mm.strokes.pop();
      repaint();
    } else if (op.op === 'clear') {
      mm.strokes = [];
      repaint();
    }
  }

  socket.on('draw', (op) => {
    // Während die Striche geladen werden, sind ältere Befehle schon im Ergebnis enthalten
    if (S?.game.id !== 'montagsmaler' || mm.fetching || op.turn !== mm.turnId) return;
    apply(op);
  });

  // Nach einem Verbindungsabbruch alles neu laden
  socket.on('connect', () => { mm.turnId = null; });

  function syncTurn(R) {
    if (!R.turnId || R.turnId === mm.turnId) return;
    mm.turnId = R.turnId;
    mm.strokes = [];
    mm.active = null;
    repaint();
    mm.fetching = true;
    socket.emit('game:draw', { op: 'strokes' }, (res) => {
      mm.fetching = false;
      if (res?.turn !== mm.turnId) return;
      mm.strokes = res.strokes || [];
      repaint();
    });
  }

  // ---------- Selbst zeichnen ----------

  function canDraw() {
    return S?.game.id === 'montagsmaler' && S.phase === 'playing' && S.round.phase === 'draw' && S.round.isDrawer && !mm.fetching;
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return [Math.round(Math.min(Math.max(x, 0), W)), Math.round(Math.min(Math.max(y, 0), H))];
  }

  function newId() {
    mm.seq++;
    return `${mm.turnId}-${mm.seq}`;
  }

  function flush() {
    const a = mm.active;
    if (!a) return;
    const pts = a.stroke.pts;
    if (pts.length <= a.sent) return;
    const chunk = pts.slice(a.sent);
    const first = a.sent === 0;
    a.sent = pts.length;
    send(first ? { op: 'add', id: a.stroke.id, color: a.stroke.color, size: a.stroke.size, pts: chunk } : { op: 'add', id: a.stroke.id, pts: chunk });
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canDraw() || mm.active) return;
    e.preventDefault();
    const [x, y] = pointerPos(e);
    if (mm.tool === 'fill') {
      const f = { id: newId(), fill: true, color: mm.color, x, y };
      mm.strokes.push(f);
      floodFill(ctx, x, y, f.color);
      send({ op: 'fill', id: f.id, color: f.color, x, y });
      return;
    }
    const stroke = { id: newId(), color: mm.tool === 'eraser' ? '#ffffff' : mm.color, size: mm.size, pts: [x, y] };
    mm.strokes.push(stroke);
    paintStroke(ctx, stroke);
    mm.active = { pointerId: e.pointerId, stroke, sent: 0 };
    clearInterval(mm.flushTimer);
    mm.flushTimer = setInterval(flush, FLUSH_MS);
  });

  // Bewegungen am ganzen Fenster verfolgen, damit ein Strich auch beim Neuzeichnen der Seite weiterläuft
  window.addEventListener('pointermove', (e) => {
    const a = mm.active;
    if (!a || e.pointerId !== a.pointerId) return;
    if (!canDraw()) return endStroke();
    const pts = a.stroke.pts;
    const from = pts.length / 2;
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const [x, y] = pointerPos(ev);
      const lx = pts[pts.length - 2];
      const ly = pts[pts.length - 1];
      if (Math.abs(x - lx) + Math.abs(y - ly) < 3) continue;
      pts.push(x, y);
    }
    if (pts.length / 2 > from) paintStroke(ctx, a.stroke, from);
  }, { passive: true });

  function endStroke(e) {
    if (!mm.active || (e && e.pointerId !== mm.active.pointerId)) return;
    flush();
    clearInterval(mm.flushTimer);
    mm.active = null;
  }
  window.addEventListener('pointerup', endStroke);
  window.addEventListener('pointercancel', endStroke);

  // ---------- Lobby ----------

  function sameList(a, b) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }

  // Reihenfolge für die Lobby: gespeicherte Reihenfolge, neue Spieler hinten dran
  function lobbyOrder() {
    const visible = S.players.filter((p) => !(p.isHost && !S.settings.hostPlays)).map((p) => p.id);
    const saved = S.settings.game.order;
    if (mm.localOrder && sameList(mm.localOrder, saved)) mm.localOrder = null;
    const base = (mm.drag?.order || mm.localOrder || saved).filter((id) => visible.includes(id));
    return [...base, ...visible.filter((id) => !base.includes(id))];
  }

  function viewOrder() {
    const g = S.settings.game;
    const manual = g.orderMode === 'manual';
    const order = manual ? lobbyOrder() : [];
    return `<div class="stack" style="gap:8px">
      <div class="small muted" style="font-weight:700">Reihenfolge beim Zeichnen</div>
      ${segmented('orderMode', g.orderMode, [['random', '🎲 Zufällig'], ['manual', '✋ Selbst festlegen']])}
      ${manual ? `<ol class="cd-order" id="mm-order">${order.map((id, i) => {
        const p = playerById(id);
        return `<li class="cd-order-item ${mm.drag?.id === id ? 'dragging' : ''} ${p?.connected === false ? 'offline' : ''}" data-player="${id}">
          <span class="cd-pos">${i + 1}.</span>${avatarHtml(p, 'sm')}<span class="name">${esc(p?.name || '?')}${p?.isHost ? ' 👑' : ''}</span>
          <span class="cd-handle mm-handle" title="Ziehen zum Verschieben">⠿</span></li>`;
      }).join('')}</ol>
      <div class="row spread"><span class="small muted">Zum Verschieben am Griff ⠿ ziehen.</span><button class="btn small" data-action="mmShuffle">🎲 Mischen</button></div>`
        : '<div class="small muted">Die Reihenfolge wird beim Start ausgelost.</div>'}
    </div>`;
  }

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const counts = meta.wordCounts;
    const builtIn = g.difficulty === 'mixed' ? counts.leicht + counts.mittel + counts.schwer : counts[g.difficulty];
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
        <div class="small muted" style="margin-top:6px">Spielst du mit, zeichnest du reihum auf diesem Gerät, z. B. auf einem Tablet. Als Gamemaster zeigt dein Bildschirm nur die Zeichnung für alle.</div>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Spielmodus</div>
        ${segmented('teamMode', g.teamMode ? 1 : 0, [[0, '🙋 Jeder für sich'], [1, '👥 In Teams']])}
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>${g.teamMode ? 'Zeichnungen pro Team' : 'Durchgänge (jeder zeichnet so oft)'}</span>
          <select id="mm-rounds">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}" ${n === g.rounds ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zeichnung</span>
          <select id="mm-time">${meta.drawTimes.map((t) => `<option value="${t}" ${t === g.drawTime ? 'selected' : ''}>${t} Sekunden</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Schwierigkeit</div>
        ${segmented('difficulty', g.difficulty, [['mixed', 'Gemischt'], ['leicht', 'Leicht'], ['mittel', 'Mittel'], ['schwer', 'Schwer']])}
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Begriffe zur Auswahl</div>
          ${segmented('choices', g.choices, [[1, '1 (fest)'], [2, '2'], [3, '3']])}
        </div>
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Buchstaben-Hinweise</div>
          ${segmented('hints', g.hints ? 1 : 0, [[1, '💡 An'], [0, 'Aus']])}
        </div>
      </div>
      <div class="stack" style="gap:8px">
        <div class="small muted" style="font-weight:700">Eigene Begriffe (${g.customWords.length}/${meta.maxCustom})</div>
        <textarea id="mm-custom" rows="4" placeholder="Ein Begriff pro Zeile, z. B. Onkel Herbert oder unser Urlaub in Italien">${esc(g.customWords.join('\n'))}</textarea>
        <label class="row" style="gap:8px"><input type="checkbox" id="mm-only-custom" ${g.onlyCustom ? 'checked' : ''}> Nur eigene Begriffe verwenden</label>
        <div class="small muted">${g.onlyCustom ? `${g.customWords.length} eigene Begriffe` : `${builtIn} mitgelieferte Begriffe${g.customWords.length ? ` und ${g.customWords.length} eigene` : ''}`}</div>
      </div>
      ${g.teamMode ? '' : viewOrder()}
      <div class="small muted">So geht's: Reihum zeichnet einer einen geheimen Begriff, alle anderen raten auf dem Handy. ${g.teamMode
        ? 'Nur das eigene Team rät. Schafft es den Begriff nicht, darf jedes andere Team noch einmal tippen und 5 Punkte klauen.'
        : 'Wer zuerst richtig liegt, bekommt die meisten Punkte, schnell sein lohnt sich. Der Zeichner bekommt 3 Punkte für jeden, der es errät.'}</div>
    </div>`;
  }

  // ---------- Spielansicht ----------

  function keyLabel(R, key) {
    if (R.teamMode) {
      const t = teamById(key);
      return `<span class="mm-who"><span class="team-dot" style="--team:${t?.color || 'var(--line)'}"></span>${esc(t?.name || 'Team')}</span>`;
    }
    const p = playerById(key);
    return `<span class="mm-who">${avatarHtml(p, 'sm')}${esc(p?.name || 'Jemand')}${key === S.me.id ? ' <span class="muted">(du)</span>' : ''}</span>`;
  }

  function keyColor(R, key) {
    return R.teamMode ? teamById(key)?.color || 'var(--line)' : 'var(--accent)';
  }

  function ranking(R) {
    return Object.entries(R.totals).map(([key, pts]) => ({ key, pts })).sort((a, b) => b.pts - a.pts);
  }

  function viewRanking(R, plus = null) {
    let rank = 0;
    let last = null;
    return `<div class="scoreboard">${ranking(R).map((row, i) => {
      if (row.pts !== last) { rank = i + 1; last = row.pts; }
      const extra = plus?.[row.key] ? `<span class="small" style="color:var(--good);font-weight:800">+${plus[row.key]}</span>` : '';
      return `<div class="score-row" style="--team:${keyColor(R, row.key)}"><span class="rank">${rank}.</span><span class="name">${keyLabel(R, row.key)}</span>${extra}<span class="pts">${row.pts}</span></div>`;
    }).join('')}</div>`;
  }

  function viewHead(R) {
    const label = R.teamMode ? `Runde ${R.pass}/${R.rounds}` : `Durchgang ${R.pass}/${R.rounds}`;
    const drawer = playerById(R.drawerId);
    const team = R.teamMode ? teamById(R.drawerTeam) : null;
    return `<div class="q-head">
      <div class="mm-drawer">${avatarHtml(drawer, 'sm')}<span><b>${R.isDrawer ? 'Du zeichnest' : `${esc(drawer?.name || 'Jemand')} zeichnet`}</b>${team ? ` für <span style="color:${team.color};font-weight:800">${esc(team.name)}</span>` : ''}<span class="small muted"> · ${label}</span></span></div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function viewWord(R) {
    if (R.word) {
      const label = R.phase === 'reveal' ? 'Gesucht war' : R.isDrawer ? 'Dein Begriff' : 'Richtig! Der Begriff';
      return `<div class="mm-word known"><span class="small muted">${label}</span><b>${esc(R.word)}</b>${R.level && R.isDrawer && R.phase !== 'reveal' ? `<span class="mm-level">${esc(LEVEL_LABELS[R.level] || R.level)}</span>` : ''}</div>`;
    }
    if (!R.mask) return '';
    const letters = R.mask.filter((c) => c === null || /[\p{L}\p{N}]/u.test(c)).length;
    return `<div class="mm-word"><div class="mm-mask" aria-label="${letters} Buchstaben">${R.mask.map((c) => c === null
      ? '<span class="gap"></span>'
      : c === ' ' ? '<span class="space"></span>' : `<span class="ch">${esc(c)}</span>`).join('')}</div>
      <span class="small muted">${letters} Buchstaben</span></div>`;
  }

  function viewTools() {
    const meta = S.game;
    const tool = (id, icon, title) => `<button class="mm-tool ${mm.tool === id ? 'on' : ''}" data-action="mmTool" data-tool="${id}" title="${title}">${icon}</button>`;
    return `<div class="mm-tools">
      <div class="mm-colors">${meta.colors.map((c) => `<button class="mm-color ${mm.color === c && mm.tool !== 'eraser' ? 'on' : ''}" style="--c:${c}" data-action="mmColor" data-color="${c}" title="Farbe"></button>`).join('')}</div>
      <div class="mm-toolrow">
        ${tool('pen', '✏️', 'Stift')}${tool('fill', '🪣', 'Füllen')}${tool('eraser', '🧽', 'Radierer')}
        <span class="mm-sep"></span>
        ${meta.sizes.map((s) => `<button class="mm-tool mm-size ${mm.size === s ? 'on' : ''}" data-action="mmSize" data-size="${s}" title="Stiftstärke"><span style="--s:${Math.max(4, s * 0.6)}px"></span></button>`).join('')}
        <span class="mm-sep"></span>
        <button class="mm-tool" data-action="mmUndo" title="Rückgängig">↶</button>
        <button class="mm-tool" data-action="mmClear" title="Alles löschen">🗑</button>
        <button class="btn small ghost" data-action="mmGiveUp">Aufgeben</button>
      </div>
    </div>`;
  }

  function viewGuessForm(R, placeholder = 'Dein Tipp …') {
    return `<form id="mm-guess-form" class="row mm-guess" autocomplete="off">
      <input id="mm-guess" type="text" maxlength="30" placeholder="${placeholder}" autocapitalize="sentences" spellcheck="false" enterkeyhint="send">
      <button class="btn primary" type="submit">Raten</button>
    </form>`;
  }

  function viewFeed(R) {
    const items = R.guesses.slice().reverse().map((g) => {
      const name = esc(playerName(g.playerId));
      if (g.kind === 'correct') return `<div class="mm-guess-item correct">✓ <b>${name}</b> hat es!${g.text ? ` <span class="muted">(${esc(g.text)})</span>` : ''}</div>`;
      if (g.kind === 'close') return `<div class="mm-guess-item close"><b>${name}:</b> ${esc(g.text)} <span class="tag">knapp daneben</span></div>`;
      return `<div class="mm-guess-item"><b>${name}:</b> ${esc(g.text)}</div>`;
    });
    return `<div class="card mm-feed"><div class="small muted" style="font-weight:700;margin-bottom:6px">Tipps</div>
      <div class="mm-feed-list">${items.join('') || '<div class="small muted">Noch keine Tipps.</div>'}</div></div>`;
  }

  // Wer noch rät (Haken für alle, die es schon haben)
  function viewGuessers(R) {
    if (!R.guessers.length) return '';
    const solved = new Set(R.solved.map((s) => s.playerId));
    return `<div class="mm-guessers">${R.guessers.map((id) => `<span class="mm-guesser ${solved.has(id) ? 'done' : ''}" title="${esc(playerName(id))}">${avatarHtml(playerById(id), 'sm')}</span>`).join('')}</div>`;
  }

  function viewAction(R) {
    if (R.phase === 'draw') {
      if (R.isDrawer) return viewTools();
      if (R.canGuess) return viewGuessForm(R);
      if (R.solved.some((s) => s.playerId === S.me.id)) {
        const mine = R.solved.find((s) => s.playerId === S.me.id);
        return `<div class="notice good">🎉 Richtig geraten! +${mine.points} Punkte. Warte auf die anderen.</div>`;
      }
      if (R.teamMode && !isGamemaster()) return '<div class="center muted">Das andere Team rät gerade. Wenn es den Begriff nicht schafft, dürft ihr klauen.</div>';
      return '';
    }
    if (R.phase === 'steal') {
      const mine = R.steals[S.me.teamId];
      if (R.canGuess) return `<div class="notice">⏳ Zeit um! Euer Team darf klauen: ein einziger Tipp für 5 Punkte.</div>${viewGuessForm(R, 'Tipp für euer Team …')}`;
      if (mine) return `<div class="center muted">Euer Tipp: <b>${esc(mine.text || '…')}</b>. Gleich wird aufgelöst.</div>`;
      return `<div class="center muted">⏳ Zeit um! ${R.stealTeams.map((id) => esc(teamById(id)?.name || 'Team')).join(', ')} ${R.stealTeams.length > 1 ? 'dürfen' : 'darf'} jetzt noch klauen …</div>`;
    }
    return '';
  }

  function viewBoard(R) {
    // Beim Zeichnen etwas kleiner, damit die Werkzeuge darunter noch auf den Bildschirm passen
    return `<div class="mm-board ${R.isDrawer && R.phase === 'draw' ? 'with-tools' : ''}" id="mm-board"></div>`;
  }

  function viewChoose(R) {
    const drawer = esc(playerName(R.drawerId));
    if (R.isDrawer && R.choices) {
      return `<div class="stack">${viewHead(R)}
        <h2 class="center">Was möchtest du zeichnen?</h2>
        <div class="mm-choices">${R.choices.map((c, i) => `<button class="btn big mm-choice" data-action="mmChoose" data-i="${i}">${esc(c.word)}<span class="mm-level">${esc(LEVEL_LABELS[c.level] || c.level)}</span></button>`).join('')}</div>
        <div class="small muted center">Sonst wird gleich zufällig gewählt. Niemand sieht deinen Begriff.</div>
      </div>`;
    }
    return `<div class="stack">${viewHead(R)}
      <div class="center mm-wait"><div class="avatar-wrap">${avatarHtml(playerById(R.drawerId))}</div><h2>${drawer} sucht sich einen Begriff aus …</h2></div>
      ${viewRanking(R)}
    </div>`;
  }

  function viewDraw(R) {
    return `<div class="stack">${viewHead(R)}
      <div class="mm-layout">
        <div class="mm-main">
          ${viewWord(R)}
          ${viewBoard(R)}
          ${viewAction(R)}
        </div>
        <div class="mm-side">
          ${viewGuessers(R)}
          ${viewFeed(R)}
          ${viewRanking(R)}
        </div>
      </div>
    </div>`;
  }

  function viewTurnScores(R) {
    const rows = Object.entries(R.scores || {}).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '<div class="center muted">Diesmal gab es keine Punkte.</div>';
    return `<div class="mm-turn-scores">${rows.map(([key, pts]) => `<div class="mm-turn-score">${keyLabel(R, key)}<b>+${pts}</b></div>`).join('')}</div>`;
  }

  function viewSteals(R) {
    const entries = Object.entries(R.steals);
    if (!R.teamMode || !entries.length) return '';
    return `<div class="stack" style="gap:6px">${entries.map(([team, s]) => `<div class="mm-guess-item ${s.correct ? 'correct' : ''}">${keyLabel(R, team)}: ${esc(s.text || '')} ${s.correct ? '✓ geklaut!' : '✗'}</div>`).join('')}</div>`;
  }

  function viewReveal(R) {
    const reason = REASONS[R.reason];
    const nobody = !R.solved.length && !Object.values(R.steals).some((s) => s.correct);
    return `<div class="stack">${viewHead(R)}
      <div class="mm-layout">
        <div class="mm-main">
          ${viewWord(R)}
          ${viewBoard(R)}
        </div>
        <div class="mm-side">
          ${reason ? `<div class="notice">${reason}</div>` : ''}
          ${nobody ? '<div class="center muted">Niemand hat es erraten.</div>' : ''}
          ${viewSteals(R)}
          <h3 style="margin:0">Punkte dieser Zeichnung</h3>
          ${viewTurnScores(R)}
          <h3 style="margin:0">Gesamtstand</h3>
          ${viewRanking(R)}
        </div>
      </div>
    </div>`;
  }

  function viewGallery() {
    if (!mm.gallery) return '<div class="center muted">Galerie wird geladen …</div>';
    if (!mm.gallery.length) return '';
    return `<div class="card stack"><h3 style="margin:0">🖼️ Galerie</h3>
      <div class="mm-gallery">${mm.gallery.map((g) => `<figure><img src="${g.src}" alt="${esc(g.word)}"><figcaption><b>${esc(g.word)}</b><span class="small muted">von ${esc(playerName(g.drawerId))}</span></figcaption></figure>`).join('')}</div></div>`;
  }

  function viewFinal(R) {
    const ranked = ranking(R);
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const tie = ranked[1] && ranked[1].pts === ranked[0].pts;
    const winner = ranked[0] ? (R.teamMode ? teamById(ranked[0].key)?.name : playerById(ranked[0].key)?.name) : null;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${!winner ? 'Spiel beendet' : tie ? 'Unentschieden!' : `${esc(winner)} gewinnt!`}</h1></div>
      <div class="podium">${top.map((row) => {
        const place = ranked.filter((o) => o.pts > row.pts).length;
        return `<div class="step"><b>${keyLabel(R, row.key)}</b><div class="small muted">${row.pts} Punkte</div>
          <div class="block" style="--team:${R.teamMode ? keyColor(R, row.key) : 'var(--pink)'};height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>
      ${viewRanking(R)}
      ${viewGallery()}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    const body = { choose: viewChoose, draw: viewDraw, steal: viewDraw, reveal: viewReveal, final: viewFinal }[R.phase];
    return `<div class="mm">${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'reveal') return '<button class="btn primary" data-action="mmNext">Weiter ▶︎</button>';
    const label = R.phase === 'draw' && R.teamMode ? '⏭ Zeit beenden' : '⏭ Überspringen';
    return `<button class="btn pink" data-action="mmSkip">${label}</button>`;
  }

  function loadGallery() {
    if (mm.gallery || mm.galleryLoading) return;
    mm.galleryLoading = true;
    socket.emit('game:draw', { op: 'gallery' }, (res) => {
      mm.galleryLoading = false;
      const thumb = document.createElement('canvas');
      thumb.width = W / 3;
      thumb.height = H / 3;
      const c = thumb.getContext('2d', { willReadFrequently: true });
      mm.gallery = (res?.gallery || []).map((g) => {
        paintAll(c, g.strokes, 1 / 3);
        return { word: g.word, drawerId: g.drawerId, src: thumb.toDataURL('image/png') };
      });
      render();
    });
  }

  // Nach jedem Neuzeichnen der Seite: Zeichenfläche wieder einhängen
  function afterRender() {
    if (S?.phase !== 'playing') {
      mm.gallery = null;
      return;
    }
    const R = S.round;
    if (R.phase !== 'final') mm.gallery = null;
    syncTurn(R);
    const board = document.getElementById('mm-board');
    if (board) {
      board.appendChild(canvas);
      board.classList.toggle('drawing', canDraw());
      board.classList.toggle('fill', canDraw() && mm.tool === 'fill');
    }
    if (R.phase === 'final') loadGallery();
  }

  gameViews.montagsmaler = { settings: viewSettings, view, hostbar, afterRender };

  // ---------- Eingaben ----------

  function sendOrder(order) {
    mm.localOrder = order;
    setting('order', order);
  }

  Object.assign(actions, {
    mmSetting: (el) => {
      const { key, value } = el.dataset;
      const numeric = ['choices'].includes(key);
      const bool = ['teamMode', 'hints'].includes(key);
      setting(key, bool ? value === '1' : numeric ? Number(value) : value);
    },
    mmShuffle: () => {
      const order = lobbyOrder();
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      sendOrder(order);
      render();
    },
    mmChoose: (el) => act('choose', { index: Number(el.dataset.i) }),
    mmTool: (el) => { mm.tool = el.dataset.tool; render(); },
    mmColor: (el) => {
      mm.color = el.dataset.color;
      if (mm.tool === 'eraser') mm.tool = 'pen';
      render();
    },
    mmSize: (el) => {
      mm.size = Number(el.dataset.size);
      if (mm.tool === 'fill') mm.tool = 'pen';
      render();
    },
    mmUndo: () => {
      if (!canDraw() || !mm.strokes.length) return;
      mm.strokes.pop();
      repaint();
      send({ op: 'undo' });
    },
    mmClear: () => {
      if (!canDraw() || !mm.strokes.length || !confirm('Die ganze Zeichnung löschen?')) return;
      mm.strokes = [];
      repaint();
      send({ op: 'clear' });
    },
    mmGiveUp: () => { if (confirm('Aufgeben? Dann wird der Begriff aufgelöst.')) act('skip'); },
    mmSkip: () => act('skip'),
    mmNext: () => act('next'),
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'mm-guess-form') return;
    const input = document.getElementById('mm-guess');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    act('guess', { text }, (res) => {
      if (res.result === 'close') toast(`„${text}“ ist knapp daneben!`);
      else if (res.result === 'correct') toast('Richtig! 🎉', true);
    });
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'montagsmaler') return;
    if (e.target.id === 'mm-rounds') setting('rounds', Number(e.target.value));
    else if (e.target.id === 'mm-time') setting('drawTime', Number(e.target.value));
    else if (e.target.id === 'mm-custom') setting('customWords', e.target.value.split('\n'));
    else if (e.target.id === 'mm-only-custom') setting('onlyCustom', e.target.checked);
  });

  // Reihenfolge per Ziehen und Ablegen (wie bei Dr Kroko)
  app.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.mm-handle');
    if (!handle || S?.game.id !== 'montagsmaler' || !S.me.isHost) return;
    e.preventDefault();
    const item = handle.closest('.cd-order-item');
    mm.drag = { id: item.dataset.player, order: lobbyOrder() };
    item.classList.add('dragging');
  });

  document.addEventListener('pointermove', (e) => {
    if (!mm.drag) return;
    const list = document.getElementById('mm-order');
    const items = list ? [...list.children] : [];
    const dragged = items.find((el) => el.dataset.player === mm.drag.id);
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
    mm.drag.order = [...list.children].map((el) => el.dataset.player);
    list.querySelectorAll('.cd-pos').forEach((el, i) => { el.textContent = `${i + 1}.`; });
  });

  function endDrag() {
    if (!mm.drag) return;
    const { order } = mm.drag;
    mm.drag = null;
    if (!sameList(order, S.settings.game.order)) sendOrder(order);
    render();
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
})();
