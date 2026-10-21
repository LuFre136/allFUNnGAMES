// Gleichgesinnt (nach Dito!): Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const gg = { key: null, cells: {} }; // Entwurf der Antworten zur aktuellen Kategorie

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  function pname(id) {
    return esc(playerById(id)?.name || 'Jemand');
  }

  function names(ids) {
    const list = ids.map(pname);
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0] || '';
  }

  // ---------- Einstellungen ----------

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
        <div class="small muted" style="margin-top:6px">Läuft dein Bildschirm auf dem Fernseher, wähle „Nur Gamemaster“ und tritt zum Mitspielen zusätzlich mit dem Handy bei. Sonst sehen alle deine Antworten.</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Runden (Original: 3)</span>
          <input id="gg-rounds" type="number" min="1" max="5" value="${g.rounds}" inputmode="numeric">
        </label>
        <label class="field"><span>Zeit zum Schreiben pro Kategorie</span>
          <select id="gg-time">${S.game.writeTimes.map((t) => `<option value="${t}" ${t === g.writeTime ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div class="small muted">So geht's: Reihum wählt einer eine von zwei Kategorien. Alle schreiben geheim drei Antworten in freie Felder ihres 3×3-Rasters, dreimal pro Runde. Danach liest reihum jeder eine Antwort vor. Haben andere sie auch, wird sie umkreist (1 Punkt). Hat sie genau einer, gibt es für beide zusätzlich einen Stern (2 Punkte, zu dritt 1). Ganz umkreiste Reihen und Spalten bringen 1 bis 3 Bonuspunkte. Die Runde endet, sobald einer keine offene Antwort mehr hat. Für 3 bis 12 Spieler.</div>
    </div>`;
  }

  // ---------- Raster ----------

  // mode: 'show' | 'write' | 'choose' | 'claim'
  function gridHtml(cells, { mode = 'show', R = null, small = false } = {}) {
    const meta = S.game;
    const cur = R?.current;
    const cellHtml = (c, i) => {
      if (mode === 'write' && (!c || c.cat === R.catIndex)) {
        const value = gg.cells[i] ?? '';
        return `<div class="gg-cell input gg-k${R.catIndex}"><input id="gg-in-${i}" data-cell="${i}" type="text" maxlength="40" value="${esc(value)}" autocomplete="off" spellcheck="false" placeholder="…"></div>`;
      }
      if (!c) return '<div class="gg-cell free"></div>';
      const cls = ['gg-cell', `gg-k${c.cat}`, c.state, c.star ? 'star' : '', c.empty ? 'empty' : ''];
      const label = c.empty ? '–' : c.text === null ? '?' : esc(c.text);
      let attrs = '';
      if (c.state === 'open' && mode === 'choose') {
        cls.push('pickable');
        attrs = `data-action="ggChoose" data-cell="${i}"`;
      } else if (c.state === 'open' && mode === 'claim') {
        cls.push('pickable');
        if (cur.myClaim === i) cls.push('claimed');
        else if (cur.suggestions.includes(i)) cls.push('suggested');
        attrs = `data-action="ggClaim" data-cell="${i}"`;
      }
      if (cur && cur.playerId && cells === R.grids[cur.playerId] && cur.cell === i) cls.push('current');
      const tag = attrs ? 'button' : 'div';
      return `<${tag} class="${cls.join(' ')}" ${attrs}><span>${label}</span>${c.star ? '<i class="gg-star">⭐</i>' : ''}</${tag}>`;
    };
    const rows = [0, 1, 2].map((r) => `${[0, 1, 2].map((col) => cellHtml(cells[r * 3 + col], r * 3 + col)).join('')}<div class="gg-bonus">+${meta.rowBonus[r]}</div>`).join('');
    const foot = `${meta.colBonus.map((b) => `<div class="gg-bonus">+${b}</div>`).join('')}<div></div>`;
    return `<div class="gg-grid ${small ? 'small' : ''}">${rows}${foot}</div>`;
  }

  function catLegend(R, { highlight = null } = {}) {
    if (!R.categories.length) return '';
    return `<div class="gg-cats">${R.categories.map((c, i) => `<span class="gg-cat gg-k${i} ${highlight === i ? 'on' : ''}">${esc(c)}</span>`).join('')}</div>`;
  }

  function boards(R, { reveal = false } = {}) {
    // Auf dem Handy reicht während der Runde das eigene Raster
    return `<div class="gg-boards ${R.playing && !reveal ? 'live' : ''}">${R.participants.map((id) => {
      const p = playerById(id);
      const sc = reveal && R.scores ? R.scores[id] : null;
      return `<div class="gg-board ${id === R.activeId ? 'active' : ''} ${p && !p.connected ? 'away' : ''}">
        <div class="gg-board-head">${avatarHtml(p, 'sm')}<b>${pname(id)}</b><span class="gg-pts">${sc ? `+${sc.points}` : `${R.totals[id] ?? 0} P.`}</span></div>
        ${gridHtml(R.grids[id], { R, small: true })}
        ${sc ? `<div class="small muted center">${sc.circles} ⭕ · ${sc.stars} ⭐ × ${sc.starValue}${sc.bonus ? ` · Bonus +${sc.bonus}` : ''}</div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  // ---------- Phasen ----------

  function head(R) {
    const k = R.phase === 'pick' ? R.categories.length + 1 : R.catIndex + 1;
    const step = ['pick', 'write'].includes(R.phase) ? ` · Kategorie ${Math.min(k, 3)}/3` : ['choose', 'claim', 'result'].includes(R.phase) ? ' · Auflösung' : '';
    return `<div class="q-head">
      <div class="small muted"><b>Runde ${R.round}/${R.rounds}</b>${step}</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function viewPick(R) {
    const mine = R.pickerId === S.me.id;
    const opts = R.options.map((o, i) => (mine
      ? `<button class="gg-option" data-action="ggPick" data-i="${i}">${esc(o)}</button>`
      : `<div class="gg-option">${esc(o)}</div>`)).join('');
    return `<div class="stack">
      <div class="gg-turn ${mine ? 'me' : ''}">${mine ? '👉 Du wählst die Kategorie!' : `${avatarHtml(playerById(R.pickerId), 'sm')} <b>${pname(R.pickerId)}</b> wählt die Kategorie …`}</div>
      <div class="gg-options">${opts}</div>
      ${catLegend(R)}
      ${R.playing ? gridHtml(R.grids[S.me.id], { R }) : boards(R)}
    </div>`;
  }

  function syncDraft(R) {
    const key = `${R.round}:${R.catIndex}`;
    if (gg.key === key) return;
    gg.key = key;
    gg.cells = {};
    (R.grids[S.me.id] || []).forEach((c, i) => { if (c && c.cat === R.catIndex && !c.empty) gg.cells[i] = c.text; });
  }

  function filled() {
    return Object.values(gg.cells).filter((t) => t.trim()).length;
  }

  function viewWrite(R) {
    const done = new Set(R.submitted);
    const progress = `<div class="gg-progress">${R.participants.map((id) => `<span class="gg-who ${done.has(id) ? 'done' : ''}">${avatarHtml(playerById(id), 'sm')}<span>${done.has(id) ? '✅' : '✏️'}</span></span>`).join('')}</div>`;
    const category = `<div class="gg-category gg-k${R.catIndex}">${esc(R.categories[R.catIndex])}</div>`;
    if (!R.playing) return `<div class="stack">${category}<p class="center muted">Alle schreiben gerade geheim drei Antworten …</p>${progress}${catLegend(R, { highlight: R.catIndex })}</div>`;
    syncDraft(R);
    const sent = done.has(S.me.id);
    return `<div class="stack">
      ${category}
      <form id="gg-write-form" class="stack" autocomplete="off">
        <div class="small muted center">Trag drei Antworten in freie Felder ein. Wo du sie hinschreibst, entscheidet über den Bonus für Reihen und Spalten.</div>
        ${gridHtml(R.grids[S.me.id], { mode: 'write', R })}
        <button class="btn primary" type="submit" id="gg-send">${sent ? 'Ändern' : 'Abschicken'} (${filled()}/3)</button>
        ${sent ? '<div class="notice">✅ Abgeschickt. Du kannst noch ändern, bis alle fertig sind.</div>' : '<div class="small muted center">Höchstens zwei Wörter, außer bei Namen und festen Begriffen. Jede Antwort nur einmal pro Runde.</div>'}
      </form>
      ${catLegend(R, { highlight: R.catIndex })}
      ${progress}
    </div>`;
  }

  function currentCard(R) {
    const cur = R.current;
    return `<div class="gg-answer gg-k${cur.cat}">
      <div class="small">${avatarHtml(playerById(cur.playerId), 'sm')} ${cur.playerId === S.me.id ? 'Du liest vor' : `${pname(cur.playerId)} liest vor`} · ${esc(R.categories[cur.cat])}</div>
      <div class="gg-answer-text">„${esc(cur.text)}“</div>
    </div>`;
  }

  function viewChoose(R) {
    const mine = R.activeId === S.me.id;
    return `<div class="stack">
      <div class="gg-turn ${mine ? 'me' : ''}">${mine ? '👉 Du bist dran! Tippe eine deiner offenen Antworten an.' : `${avatarHtml(playerById(R.activeId), 'sm')} <b>${pname(R.activeId)}</b> sucht eine Antwort aus …`}</div>
      ${catLegend(R)}
      ${R.playing ? gridHtml(R.grids[S.me.id], { mode: mine ? 'choose' : 'show', R }) : ''}
      ${boards(R)}
    </div>`;
  }

  function viewClaim(R) {
    const cur = R.current;
    const answered = new Set(cur.answered);
    const others = R.participants.filter((id) => id !== cur.playerId);
    const status = `<div class="gg-progress">${others.map((id) => `<span class="gg-who ${answered.has(id) ? 'done' : ''}">${avatarHtml(playerById(id), 'sm')}<span>${answered.has(id) ? '✅' : '🤔'}</span></span>`).join('')}</div>`;
    const asked = R.playing && cur.playerId !== S.me.id;
    let mine = '';
    if (asked) {
      const claimed = cur.myClaim !== undefined && cur.myClaim !== null;
      mine = `<div class="card stack">
        <b class="center">Hast du das auch? Tippe deine gleiche Antwort an.</b>
        ${gridHtml(R.grids[S.me.id], { mode: 'claim', R })}
        <div class="row" style="justify-content:center">
          <button class="btn ${cur.myConfirmed && !claimed ? 'primary' : 'ghost'}" data-action="ggNone">🙅 Hab ich nicht</button>
          ${claimed && !cur.myConfirmed ? '<button class="btn primary" data-action="ggConfirm">🙌 Dito!</button>' : ''}
        </div>
        <div class="small muted center">${claimed ? (cur.myConfirmed ? '🙌 Dito! Du kannst noch umentscheiden, bis alle geantwortet haben.' : 'Gleiches Wort gefunden und markiert. Bestätige mit „Dito!“.') : 'Synonyme zählen auch („Geige“ und „Violine“), Ober- und Unterbegriffe nicht.'}</div>
      </div>`;
    }
    return `<div class="stack">${currentCard(R)}${mine}${status}${asked ? '' : boards(R)}</div>`;
  }

  function viewResult(R) {
    const cur = R.current;
    const banner = {
      none: `<div class="gg-outcome none">✗ Niemand hat „${esc(cur.text)}“. Durchgestrichen!</div>`,
      bff: `<div class="gg-outcome bff">⭐ Seelenverwandt! ${names([cur.playerId, cur.matches[0]?.id])} bekommen einen Stern.</div>`,
      many: `<div class="gg-outcome many">🙌 Dito! ${cur.matches.length + 1} Spieler haben es umkreist.</div>`,
    }[cur.outcome];
    const list = cur.matches.length ? `<div class="gg-matches">${cur.matches.map((m) => `<span class="gg-match">${avatarHtml(playerById(m.id), 'sm')} ${pname(m.id)}: <b>${esc(m.text)}</b></span>`).join('')}</div>` : '';
    return `<div class="stack">${currentCard(R)}${banner}${list}${boards(R)}</div>`;
  }

  function scoreTable(R) {
    return `<div class="scoreboard">${R.ranking.map((e) => `<div class="score-row" style="--team:var(--accent)">
      <span class="rank">${e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `${e.rank}.`}</span>
      <span class="name">${avatarHtml(playerById(e.id), 'sm')} ${pname(e.id)} <span class="small muted">${e.rounds.map((p) => (p === null ? '–' : p)).join(' · ')}</span></span>
      <span class="pts">${e.total}</span></div>`).join('')}</div>`;
  }

  function viewRoundEnd(R) {
    return `<div class="stack">
      <h2 class="center">Runde ${R.round} vorbei</h2>
      ${catLegend(R)}
      ${boards(R, { reveal: true })}
      ${scoreTable(R)}
      ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet die nächste Runde.</div>'}
    </div>`;
  }

  function viewFinal(R) {
    const a = R.awards || {};
    const winners = R.ranking.filter((e) => e.rank === 1).map((e) => e.id);
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🤝</div><h1>${names(winners)} ${winners.length > 1 ? 'gewinnen' : 'gewinnt'}!</h1></div>
      ${scoreTable(R)}
      <div class="gg-awards">
        ${a.soulmates ? `<div class="card gg-award"><div class="icon">💞</div><div><b>Seelenverwandte</b><div>${names(a.soulmates.ids)}</div><div class="small muted">${a.soulmates.count} gemeinsame Sterne</div></div></div>` : ''}
        ${a.loner ? `<div class="card gg-award"><div class="icon">🦄</div><div><b>Einzelgänger</b><div>${names(a.loner.ids)}</div><div class="small muted">${a.loner.count} Antworten hatte sonst niemand</div></div></div>` : ''}
      </div>
      <h3>Letzte Runde</h3>
      ${catLegend(R)}
      ${boards(R, { reveal: true })}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    const body = { pick: viewPick, write: viewWrite, choose: viewChoose, claim: viewClaim, result: viewResult, roundEnd: viewRoundEnd, final: viewFinal }[R.phase];
    return `<div>${R.phase === 'final' ? '' : head(R)}${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'pick') return '<button class="btn ghost" data-action="ggNext">🎲 Zufällig wählen</button>';
    if (R.phase === 'write') return '<button class="btn pink" data-action="ggNext">⏭ Nicht mehr warten</button>';
    if (R.phase === 'choose') return `<button class="btn ghost" data-action="ggSkip">⏭ ${pname(R.activeId)} überspringen</button>`;
    if (R.phase === 'claim') return '<button class="btn pink" data-action="ggNext">⏭ Auswerten</button>';
    if (R.phase === 'result') return '<button class="btn primary" data-action="ggNext">Weiter ▶︎</button>';
    return `<button class="btn primary" data-action="ggNext">${R.round >= R.rounds ? '🏆 Zum Ergebnis' : 'Nächste Runde ▶︎'}</button>`;
  }

  gameViews.gleichgesinnt = { settings: viewSettings, view, hostbar };

  // ---------- Eingaben ----------

  Object.assign(actions, {
    ggPick: (el) => act('pick', { index: Number(el.dataset.i) }),
    ggChoose: (el) => act('choose', { cell: Number(el.dataset.cell) }),
    ggClaim: (el) => {
      const cell = Number(el.dataset.cell);
      act('claim', { cell: S.round.current?.myClaim === cell && S.round.current.myConfirmed ? null : cell });
    },
    ggConfirm: () => act('claim', { cell: S.round.current?.myClaim }),
    ggNone: () => act('claim', { cell: null }),
    ggNext: () => act('next'),
    ggSkip: () => act('skip'),
  });

  app.addEventListener('input', (e) => {
    if (S?.game.id !== 'gleichgesinnt' || !e.target.dataset.cell || !e.target.id.startsWith('gg-in-')) return;
    gg.cells[e.target.dataset.cell] = e.target.value;
    const btn = document.getElementById('gg-send');
    if (btn) btn.textContent = btn.textContent.replace(/\(\d+\/3\)/, `(${filled()}/3)`);
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'gleichgesinnt') return;
    if (e.target.id === 'gg-rounds') setGame({ rounds: Number(e.target.value) });
    else if (e.target.id === 'gg-time') setGame({ writeTime: Number(e.target.value) });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'gg-write-form') return;
    const cells = Object.fromEntries(Object.entries(gg.cells).filter(([, t]) => t.trim()));
    if (Object.keys(cells).length !== 3) return toast('Bitte genau drei Antworten eintragen.');
    act('write', { cells }, (res) => {
      if (res.ok) document.activeElement?.blur?.();
    });
  });
})();
