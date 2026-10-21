// Würfelfuchs: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const TIMES = [0, 30, 45, 60, 90, 120];
  const NAMES = { white: 'Weiß', yellow: 'Gelb', blue: 'Blau', green: 'Grün', orange: 'Orange', purple: 'Lila' };
  const AREAS = ['yellow', 'blue', 'green', 'orange', 'purple'];
  // Augen auf einem 3×3-Raster
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const wf = {
    seenRoll: 0,
    rolling: false,
    sel: null, // angetippter Würfel
    plus: false, // +1-Modus: jeder Würfel darf gewählt werden
    turnKey: null,
    openSheet: null, // Blatt eines Mitspielers zum Anschauen
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function me(R) {
    return R.players.find((p) => p.id === S.me.id) || null;
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
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Deine Rolle</div>
        <div class="segmented">
          <button data-action="hostPlays" data-value="1" class="${s.hostPlays ? 'on' : ''}">🎮 Spielt mit</button>
          <button data-action="hostPlays" data-value="0" class="${!s.hostPlays ? 'on' : ''}">🎩 Nur Gamemaster</button>
        </div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Bedenkzeit pro Schritt</span>
          <select id="wf-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Partien hintereinander</span>
          <input id="wf-games" type="number" min="1" max="5" value="${g.games}" inputmode="numeric">
        </label>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Wer fängt an</div>
          <div class="segmented">
            <button data-action="wfSetting" data-key="starter" data-value="random" class="${g.starter === 'random' ? 'on' : ''}">🎲 Zufällig</button>
            <button data-action="wfSetting" data-key="starter" data-value="host" class="${g.starter === 'host' ? 'on' : ''}">👑 Host</button>
          </div>
        </div>
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Hilfen</div>
          <div class="segmented">
            <button data-action="wfSetting" data-key="hints" data-value="1" class="${g.hints ? 'on' : ''}">💡 An</button>
            <button data-action="wfSetting" data-key="hints" data-value="0" class="${!g.hints ? 'on' : ''}">Aus</button>
          </div>
        </div>
      </div>
      <div class="small muted">So geht's: Wer am Zug ist, würfelt bis zu dreimal und nimmt jedes Mal einen Würfel für das Feld seiner Farbe. Weiß ist ein Joker für jede Farbe. Alle Würfel, die kleiner sind als der genommene, wandern aufs Tablett. Danach nimmt sich jeder andere einen Würfel vom Tablett. Gelb: passende Zahl ankreuzen. Blau: Summe aus Blau und Weiß. Grün: von links, mindestens die angegebene Zahl. Orange: Wert eintragen, manche Kästchen zählen doppelt oder dreifach. Lila: jeder Wert größer als der vorige, nach einer 6 geht alles. Volle Reihen und bestimmte Kästchen bringen Bonusse: Kreuze in anderen Farben, Neuwürfe, +1 (einen Würfel am Ende eines Zuges zusätzlich nutzen) und Füchse (zählen so viel wie dein schwächstes Feld). Mit „Hilfen“ sind Würfel, die nirgends passen, ausgegraut.</div>
    </div>`;
  }

  // ---------- Bausteine ----------

  function bonusIcon(b, extra = '') {
    if (!b) return '';
    const title = { reroll: 'Neuwurf', plusOne: '+1', fox: 'Fuchs', free: 'Kreuz nach Wahl' }[b.type]
      || (b.type === 'cross' ? `Kreuz in ${NAMES[b.color]}` : `${b.value} in ${NAMES[b.color]}`);
    const inner = { reroll: '↻', plusOne: '+1', fox: '🦊', free: '?' }[b.type] || (b.type === 'cross' ? '✕' : b.value);
    const cls = b.color ? `c-${b.color}` : `t-${b.type}`;
    return `<span class="wf-b ${cls} ${extra}" title="${title}">${inner}</span>`;
  }

  function dieHtml(d, i, { can = false, dead = false, sel = false, small = false } = {}) {
    const pips = PIPS[d.value] || [];
    const cls = ['wf-die', d.color, wf.rolling && d.where !== 'chosen' ? 'rolling' : '', can ? 'can' : '', dead ? 'dead' : '', sel ? 'sel' : '', small ? 'sm' : '', d.value ? '' : 'empty'].join(' ');
    return `<button class="${cls}" ${can ? `data-action="wfDie" data-i="${i}"` : 'disabled'} title="${NAMES[d.color]}${d.value ? ` ${d.value}` : ''}">
      ${d.value ? Array.from({ length: 9 }, (_, k) => `<span class="${pips.includes(k) ? 'pip' : ''}"></span>`).join('') : ''}</button>`;
  }

  // Welche Würfel der Spieler gerade antippen darf
  function selectable(R) {
    const m = R.me;
    if (!m || m.pending.length) return [];
    if (wf.plus) return R.dice.map((d, i) => i).filter((i) => !m.plusUsed.includes(i) && m.targets[i].length);
    return m.pickable;
  }

  function viewDice(R) {
    const can = new Set(selectable(R));
    const m = R.me;
    const die = (d, i) => dieHtml(d, i, { can: can.has(i), sel: wf.sel === i, dead: R.hints && can.has(i) && m && !m.targets[i].length });
    const group = (where) => R.dice.map((d, i) => ({ d, i })).filter((x) => x.d.where === where);
    const free = group('free');
    const chosen = group('chosen');
    const tray = group('tray');
    const label = R.solo && R.phase === 'passive' ? 'Für den gedachten Mitspieler' : 'Gewählt';
    return `<div class="wf-table">
      ${free.length ? `<div class="wf-dice">${free.map((x) => die(x.d, x.i)).join('')}</div>` : ''}
      <div class="wf-zones">
        <div class="wf-zone"><div class="wf-zone-label">${label}</div><div class="wf-dice">${chosen.map((x) => die(x.d, x.i)).join('') || '<span class="muted small">–</span>'}</div></div>
        <div class="wf-zone tray"><div class="wf-zone-label">Tablett</div><div class="wf-dice">${tray.map((x) => die(x.d, x.i)).join('') || '<span class="muted small">–</span>'}</div></div>
      </div>
      ${R.phase === 'active' ? `<div class="wf-rolls">${Array.from({ length: R.maxRolls }, (_, i) => `<span class="${i < R.rollNo ? 'on' : ''}"></span>`).join('')}</div>` : ''}
    </div>`;
  }

  function viewRounds(R) {
    return `<div class="wf-rounds">${Array.from({ length: R.maxRounds }, (_, i) => {
      const b = R.layout.roundBonus[i];
      return `<div class="wf-round ${i + 1 === R.round ? 'on' : ''} ${i + 1 < R.round ? 'past' : ''}"><b>${i + 1}</b>${bonusIcon(b)}</div>`;
    }).join('')}</div>`;
  }

  // Zellen, die gerade angetippt werden können: Schlüssel „Farbe:Feld“ -> Aktion
  function tappable(R) {
    const m = R.me;
    const out = new Map();
    if (!m) return out;
    if (m.pending.length) {
      for (const t of m.bonusTargets) out.set(`${t.color}:${t.cell}`, 'bonus');
    } else if (wf.sel !== null && m.targets[wf.sel]) {
      for (const t of m.targets[wf.sel]) out.set(`${t.color}:${t.cell}`, wf.plus ? 'plusOne' : m.pickType);
    }
    return out;
  }

  function cell(color, i, content, cls, taps) {
    const action = taps?.get(`${color}:${i}`);
    return `<button class="wf-cell ${cls} ${action ? 'can' : ''}" ${action ? `data-action="wfCell" data-color="${color}" data-cell="${i}"` : 'disabled'}>${content}</button>`;
  }

  function viewSheet(R, p, taps = null) {
    const L = R.layout;
    const s = p.sheet;
    const sc = p.score;
    const head = (color, label = NAMES[color]) => `<div class="wf-area-head"><b>${label}</b><span class="wf-pts">${sc[color]}</span></div>`;

    const yellow = `<div class="wf-area yellow">${head('yellow')}
      <div class="wf-grid y">
        ${L.yellow.grid.map((row, r) => `${row.map((v, c) => {
          const i = r * 4 + c;
          if (v === 0) return '<div class="wf-cell pre">✕</div>';
          return cell('yellow', i, v, `${s.yellow[r][c] ? 'x' : ''} ${r === c ? 'diag' : ''}`, taps);
        }).join('')}<div class="wf-side">${bonusIcon(L.yellow.rowBonus[r])}</div>`).join('')}
        ${L.yellow.columnPoints.map((pts, c) => `<div class="wf-foot ${s.yellow.every((row) => row[c]) ? 'got' : ''}">${pts}</div>`).join('')}<div class="wf-side">${bonusIcon(L.yellow.diagonalBonus, 'diag')}</div>
      </div></div>`;

    const blueCount = s.blue.flat().filter(Boolean).length - 1;
    const blue = `<div class="wf-area blue">${head('blue', 'Blau + Weiß')}
      <div class="wf-grid b">
        ${L.blue.grid.map((row, r) => `${row.map((v, c) => {
          if (v === 0) return '<div class="wf-cell sym" title="Summe aus Blau und Weiß"><i class="d blue"></i>+<i class="d white"></i></div>';
          return cell('blue', r * 4 + c, v, s.blue[r][c] ? 'x' : '', taps);
        }).join('')}<div class="wf-side">${bonusIcon(L.blue.rowBonus[r])}</div>`).join('')}
        ${L.blue.columnBonus.map((b) => `<div class="wf-foot">${bonusIcon(b)}</div>`).join('')}<div></div>
      </div>
      <div class="wf-ladder">${L.blue.points.slice(1).map((pts, k) => `<span class="${k < blueCount ? 'got' : ''}"><small>${k + 1}</small>${pts}</span>`).join('')}</div>
    </div>`;

    const rowArea = (color, boxes) => `<div class="wf-area ${color}">${head(color)}
      <div class="wf-row">${boxes.map((b, i) => `<div class="wf-slot">${b}${bonusIcon(L[color].bonus[i])}</div>`).join('')}</div></div>`;
    const green = rowArea('green', L.green.min.map((min, i) => cell('green', i, i < s.green ? '✕' : `≥${min}`, i < s.green ? 'x' : '', taps)));
    const orange = rowArea('orange', L.orange.factor.map((f, i) => {
      const v = s.orange[i];
      return cell('orange', i, v ? `${v}${f > 1 ? `<small>×${f}</small>` : ''}` : f > 1 ? `<small>×${f}</small>` : '', v ? 'x val' : '', taps);
    }));
    const purple = rowArea('purple', Array.from({ length: L.purple.length }, (_, i) => {
      const v = s.purple[i];
      return cell('purple', i, v || (i ? '<small>&gt;</small>' : ''), v ? 'x val' : '', taps);
    }));

    return `<div class="wf-sheet">
      <div class="wf-top">${yellow}${blue}</div>
      ${green}${orange}${purple}
      <div class="wf-extras">
        <span title="Neuwürfe">${bonusIcon({ type: 'reroll' })} ${s.rerolls}</span>
        <span title="+1">${bonusIcon({ type: 'plusOne' })} ${s.plusOnes}</span>
        <span title="Füchse">${bonusIcon({ type: 'fox' })} ${s.foxes}${sc.fox ? ` = ${sc.fox}` : ''}</span>
        <b class="wf-total">${sc.total} Punkte</b>
      </div>
    </div>`;
  }

  function bonusLabel(p) {
    if (p.type === 'free') return 'Kreuz in einer Farbe nach Wahl (Orange und Lila: 6)';
    return `Kreuz in ${NAMES[p.color]}`;
  }

  // Hinweis und Knöpfe für den eigenen Zug
  function viewActions(R) {
    const m = R.me;
    if (!m) return '';
    const buttons = [];
    let info = '';
    if (m.pending.length) {
      info = `🎁 Bonus: <b>${bonusLabel(m.pending[0])}</b>. Tippe auf ein leuchtendes Feld.`;
    } else if (wf.sel !== null) {
      const d = R.dice[wf.sel];
      info = `<b>${NAMES[d.color]} ${d.value}</b>${wf.plus ? ' mit +1' : ''}: tippe auf ein leuchtendes Feld.`;
      if (!m.targets[wf.sel].length) info = `<b>${NAMES[d.color]} ${d.value}</b> passt nirgends hin.`;
      if (!wf.plus) buttons.push(`<button class="btn" data-action="wfWaste">Nehmen, nichts eintragen</button>`);
      buttons.push('<button class="btn ghost" data-action="wfCancel">↩︎ Abbrechen</button>');
    } else if (m.canRoll) {
      info = R.rollNo ? 'Würfle weiter.' : 'Du bist dran!';
      buttons.push(`<button class="btn primary big" data-action="wfRoll">🎲 ${R.rollNo ? `Würfeln (Wurf ${R.rollNo + 1}/${R.maxRolls})` : 'Würfeln'}</button>`);
    } else if (m.isActive) {
      info = 'Tippe auf einen Würfel, den du nehmen willst.';
      if (m.canReroll) buttons.push(`<button class="btn" data-action="wfReroll">↻ Neuwurf (${me(R).sheet.rerolls})</button>`);
    } else if (R.phase === 'passive' && !m.done) {
      if (wf.plus) info = 'Tippe auf einen Würfel für dein +1.';
      else if (m.canTake) info = R.solo ? 'Nimm einen Würfel vom Tablett.' : 'Nimm dir einen Würfel vom Tablett.';
      else info = m.canPlusOne ? 'Du kannst noch ein +1 einsetzen.' : 'Fertig?';
      if (m.canPlusOne) buttons.push(`<button class="btn ${wf.plus ? 'on' : ''}" data-action="wfPlus">${wf.plus ? '✕ Kein +1' : `+1 einsetzen (${me(R).sheet.plusOnes})`}</button>`);
      if (m.picked || m.plusUsed.length) buttons.push('<button class="btn ghost" data-action="wfUndo">↩︎ Rückgängig</button>');
      buttons.push(`<button class="btn primary" data-action="wfDone" data-skip="${m.canTake ? 1 : 0}">✓ ${m.canTake ? 'Ohne Würfel fertig' : 'Fertig'}</button>`);
    } else if (R.phase === 'passive') {
      info = '✓ Fertig. Warte auf die anderen …';
    } else {
      info = `${esc(playerName(R.activeId))} wählt gerade Würfel.`;
    }
    return `<div class="wf-actions"><div>${info}</div>${buttons.length ? `<div class="row" style="justify-content:center">${buttons.join('')}</div>` : ''}</div>`;
  }

  function viewStatus(R) {
    const active = playerById(R.activeId);
    if (R.phase === 'passive') {
      const waiting = R.players.filter((p) => !p.done && playerById(p.id)?.connected !== false).length;
      return `<div class="wf-status">${R.solo ? 'Tablett für dich' : `Alle nehmen sich einen Würfel vom Tablett`} · noch ${waiting} offen</div>`;
    }
    if (R.activeId === S.me.id) return '<div class="wf-status mine">Du bist dran! 🎲</div>';
    return `<div class="wf-status">${avatarHtml(active, 'sm')} <b>${esc(active?.name || '?')}</b>&nbsp;ist dran</div>`;
  }

  function viewLog(R) {
    const items = R.log.slice(-5);
    if (!items.length) return '';
    return `<div class="wf-log">${items.map((e) => `<div>${e.playerId ? `<b>${esc(playerName(e.playerId))}</b> ` : ''}${esc(e.text)}</div>`).join('')}</div>`;
  }

  function viewPlayers(R) {
    return `<div class="wf-players">${R.players.map((p) => {
      const player = playerById(p.id);
      const status = R.phase === 'passive' ? (p.done ? '✓' : '…') : p.id === R.activeId ? '🎲' : '';
      return `<button class="wf-player ${p.id === R.activeId ? 'active' : ''} ${wf.openSheet === p.id ? 'open' : ''} ${player?.connected === false ? 'offline' : ''}" data-action="wfOpen" data-player="${p.id}">
        ${avatarHtml(player, 'sm')}<span class="name">${esc(player?.name || '?')}${p.id === S.me.id ? ' (du)' : ''}</span>
        <span class="small">🦊${p.sheet.foxes}</span><b>${p.total}</b><span class="st">${status}</span></button>`;
    }).join('')}</div>`;
  }

  function viewOtherSheet(R) {
    const p = R.players.find((x) => x.id === wf.openSheet && x.id !== S.me.id);
    if (!p) return '';
    return `<div class="card stack"><div class="row spread"><b>Blatt von ${esc(playerName(p.id))}</b><button class="btn small ghost" data-action="wfOpen" data-player="${p.id}">✕</button></div>${viewSheet(R, p)}</div>`;
  }

  function viewPlaying(R) {
    const mine = me(R);
    const head = `<div class="q-head">
        <div class="small muted"><b>${R.games > 1 ? `Partie ${R.gameNo}/${R.games} · ` : ''}Runde ${R.round}/${R.maxRounds}</b></div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>`;
    if (!mine) {
      // Fernseher: Würfel groß, daneben alle Blätter
      return `<div class="stack wf-tv">
        ${head}${viewRounds(R)}${viewStatus(R)}
        <div class="wf-tv-top">${viewDice(R)}${viewLog(R)}</div>
        ${viewPlayers(R)}
        <div class="wf-all">${R.players.map((p) => `<div class="card stack ${p.id === R.activeId ? 'wf-active-card' : ''}"><div class="row">${avatarHtml(playerById(p.id), 'sm')} <b>${esc(playerName(p.id))}</b>${p.done ? ' ✓' : ''}</div>${viewSheet(R, p)}</div>`).join('')}</div>
      </div>`;
    }
    return `<div class="stack">
      ${head}${viewRounds(R)}${viewStatus(R)}
      ${viewDice(R)}
      ${viewActions(R)}
      ${viewSheet(R, mine, tappable(R))}
      ${viewLog(R)}
      ${viewPlayers(R)}
      ${viewOtherSheet(R)}
    </div>`;
  }

  // ---------- Ende ----------

  function formatDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function scoreTable(rows) {
    return `<div class="wf-score-wrap"><table class="wf-score">
      <thead><tr><th></th>${AREAS.map((c) => `<th class="c-${c}">${NAMES[c]}</th>`).join('')}<th>🦊</th><th>Gesamt</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.isNew ? 'new' : ''}"><th>${r.label}</th>${AREAS.map((c) => `<td>${r.score[c]}</td>`).join('')}<td>${r.score.fox}</td><td><b>${r.score.total}</b></td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function viewHighscores(R) {
    const list = R.highscores || [];
    const isNew = (e) => R.newHighscores.includes(e.id);
    const ranked = list.map((e) => ({ ...e, rank: list.filter((o) => o.total > e.total).length + 1 }));
    const mine = ranked.filter(isNew);
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>Bestenliste</h1>
        <p class="muted">${mine.length ? `Neu in der Bestenliste: ${mine.map((e) => `<b>${esc(e.name)}</b> (Platz ${e.rank})`).join(', ')} 🎉` : 'Die zehn besten Blätter, die je gespielt wurden.'}</p></div>
      ${ranked.length ? `<div class="card">${scoreTable(ranked.map((e) => ({
        label: `${e.rank}. ${esc(e.name)} <span class="small muted">${formatDate(e.date)}</span>`,
        score: e,
        isNew: isNew(e),
      })))}</div>` : '<div class="card center muted">Noch keine Einträge. Spielt eine Partie bis zum Ende!</div>'}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann die Bestenliste wieder ausblenden.</div>'}
    </div>`;
  }

  function viewEnd(R) {
    if (R.showHighscores) return viewHighscores(R);
    const ranked = R.players.map((p) => ({ id: p.id, pts: R.totals[p.id] || 0 })).sort((a, b) => b.pts - a.pts);
    const final = R.phase === 'final';
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const winner = ranked[0];
    const tie = ranked[1] && ranked[1].pts === winner.pts;
    const title = final ? (ranked.length === 1 ? `${winner.pts} Punkte!` : tie ? 'Unentschieden!' : `${esc(playerName(winner.id))} gewinnt!`) : `Partie ${R.gameNo} von ${R.games} ist vorbei`;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">${final ? '🏆' : '🦊'}</div><h1>${title}</h1></div>
      ${R.highscorePlayers.length ? `<div class="notice center">🏆 Neu in der Bestenliste: ${R.highscorePlayers.map((id) => `<b>${esc(playerName(id))}</b>`).join(', ')}!${S.me.isHost ? ' Unten kannst du sie einblenden.' : ''}</div>` : ''}
      ${final && ranked.length > 1 ? `<div class="podium">${top.map((t) => {
        const place = ranked.filter((o) => o.pts > t.pts).length;
        return `<div class="step"><div>${avatarHtml(playerById(t.id))}</div><b>${esc(playerName(t.id))}</b><div class="small muted">${t.pts} Punkte</div>
          <div class="block" style="--team:var(--accent);height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>` : ''}
      <div class="card stack">
        <h3 style="margin:0">Wertung dieser Partie</h3>
        ${scoreTable(R.players.map((p) => ({ label: esc(playerName(p.id)), score: p.score })))}
        ${R.games > 1 ? ranked.map((t) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${ranked.filter((o) => o.pts > t.pts).length + 1}.</span>${avatarHtml(playerById(t.id), 'sm')}<span class="name">${esc(playerName(t.id))}</span><span class="pts">${t.pts}</span></div>`).join('') : ''}
      </div>
      <details class="card"><summary>Blätter dieser Partie</summary>
        <div class="wf-all" style="margin-top:12px">${R.players.map((p) => `<div class="stack"><b>${esc(playerName(p.id))}</b>${viewSheet(R, p)}</div>`).join('')}</div>
      </details>
      ${S.me.isHost ? '' : `<div class="muted center">${final ? 'Der Host kann eine neue Runde starten.' : 'Der Host startet gleich die nächste Partie.'}</div>`}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.rollSeq !== wf.seenRoll) {
      wf.seenRoll = R.rollSeq;
      wf.rolling = R.rollSeq > 0;
      if (wf.rolling) setTimeout(() => { wf.rolling = false; document.querySelectorAll('.wf-die.rolling').forEach((d) => d.classList.remove('rolling')); }, 700);
    }
    // Auswahl gilt nur für den aktuellen Schritt
    const key = `${R.activeId}:${R.phase}:${R.rollSeq}:${R.rollNo}`;
    if (wf.turnKey !== key) {
      wf.turnKey = key;
      wf.sel = null;
      wf.plus = false;
    }
    if (wf.sel !== null && !selectable(R).includes(wf.sel)) wf.sel = null;
    if (wf.plus && !R.me?.canPlusOne) wf.plus = false;
    return R.phase === 'active' || R.phase === 'passive' ? viewPlaying(R) : viewEnd(R);
  }

  function hostbar() {
    const R = S.round;
    const scores = `<button class="btn" data-action="wfHighscores">${R.showHighscores ? '✕ Bestenliste ausblenden' : '🏆 Bestenliste'}</button>`;
    if (R.phase === 'final') return `${scores}<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>`;
    if (R.phase === 'result') return `${scores}<button class="btn primary" data-action="next">Nächste Partie ▶︎</button>`;
    if (R.phase === 'passive') return '<button class="btn" data-action="wfForce">⏭ Nicht mehr warten</button>';
    const name = esc(playerName(R.activeId));
    return `<button class="btn" data-action="wfSkip">⏭ ${name} überspringen</button><button class="btn" data-action="wfForce">🎲 Für ${name} spielen</button>`;
  }

  gameViews.wuerfelfuchs = { settings: viewSettings, view, hostbar };

  Object.assign(actions, {
    wfSetting: (el) => {
      const v = el.dataset.value;
      sendHost('settings', { game: { [el.dataset.key]: el.dataset.key === 'hints' ? v === '1' : v } });
    },
    wfRoll: () => act('roll'),
    wfReroll: () => act('reroll'),
    wfDie: (el) => {
      const i = Number(el.dataset.i);
      wf.sel = wf.sel === i ? null : i;
      render();
    },
    wfCancel: () => { wf.sel = null; render(); },
    wfCell: (el) => {
      const R = S.round;
      const type = tappable(R).get(`${el.dataset.color}:${el.dataset.cell}`);
      if (!type) return;
      const data = { color: el.dataset.color, cell: Number(el.dataset.cell) };
      if (type !== 'bonus') data.die = wf.sel;
      wf.sel = null;
      wf.plus = false;
      act(type, data);
    },
    wfWaste: () => {
      const R = S.round;
      const d = R.dice[wf.sel];
      if (!confirm(`${NAMES[d.color]} ${d.value} nehmen, ohne etwas einzutragen?`)) return;
      act(R.me.pickType, { die: wf.sel, color: null });
      wf.sel = null;
    },
    wfPlus: () => { wf.plus = !wf.plus; wf.sel = null; render(); },
    wfUndo: () => { wf.sel = null; wf.plus = false; act('undo'); },
    wfDone: (el) => {
      if (el.dataset.skip === '1' && !confirm('Fertig, ohne einen Würfel vom Tablett zu nehmen?')) return;
      act('done');
    },
    wfOpen: (el) => {
      wf.openSheet = wf.openSheet === el.dataset.player ? null : el.dataset.player;
      render();
    },
    wfHighscores: () => act('highscores'),
    wfSkip: () => {
      if (confirm(`${playerName(S.round.activeId)} überspringen? Der Zug verfällt.`)) act('skip');
    },
    wfForce: () => {
      const R = S.round;
      const text = R.phase === 'passive'
        ? 'Nicht mehr warten? Wer noch nicht fertig ist, verzichtet auf seinen Würfel.'
        : `Für ${playerName(R.activeId)} spielen? Es werden automatisch die Würfel mit den meisten Punkten genommen.`;
      if (confirm(text)) act('force');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'wuerfelfuchs') return;
    if (e.target.id === 'wf-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
    else if (e.target.id === 'wf-games') sendHost('settings', { game: { games: Number(e.target.value) } });
  });
})();
