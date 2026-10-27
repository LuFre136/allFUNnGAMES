// Bluff-Quiz: Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const bq = { draft: '', draftKey: null, lastLikes: {} };

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  // ---------- Namen der Blätter (Spieler oder Team) ----------

  function sheetLabel(R, key) {
    if (R.teamMode) {
      const t = teamById(key);
      return `<span class="bq-who"><span class="team-dot" style="--team:${t?.color || 'var(--line)'}"></span>${esc(t?.name || 'Team')}</span>`;
    }
    const p = playerById(key);
    return `<span class="bq-who">${avatarHtml(p, 'sm')}${esc(p?.name || 'Jemand')}${key === S.me.id ? ' <span class="muted">(du)</span>' : ''}</span>`;
  }

  function sheetName(R, key) {
    return R.teamMode ? teamById(key)?.name || 'Team' : playerById(key)?.name || 'Jemand';
  }

  function sheetColor(R, key) {
    return R.teamMode ? teamById(key)?.color || 'var(--line)' : 'var(--accent)';
  }

  function names(R, keys) {
    const list = keys.map((k) => esc(sheetName(R, k)));
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0] || '';
  }

  function avatars(R, keys) {
    if (R.teamMode) return keys.map((k) => `<span class="team-dot" style="--team:${sheetColor(R, k)}" title="${esc(sheetName(R, k))}"></span>`).join('');
    return keys.map((k) => avatarHtml(playerById(k), 'sm')).join('');
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const seg = (key, value, options) => `<div class="segmented">${options.map(([v, label]) =>
      `<button data-action="bqSetting" data-key="${key}" data-value="${v ? 1 : 0}" class="${Boolean(value) === v ? 'on' : ''}">${label}</button>`).join('')}</div>`;
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
        <div class="small muted" style="margin-top:6px">Läuft dein Bildschirm auf dem Fernseher, wähle „Nur Gamemaster“ und tritt zum Mitspielen zusätzlich mit dem Handy bei. Sonst sehen alle deine Lüge.</div>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Spielmodus</div>
        ${seg('teamMode', g.teamMode, [[false, '🙋 Jeder für sich'], [true, '👥 In Teams']])}
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Fragen (${S.availableQuestions} verfügbar)</span>
          <input id="bq-count" type="number" min="3" max="20" value="${g.questionCount}" inputmode="numeric">
        </label>
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Letzte Frage doppelt</div>
          ${seg('doubleLast', g.doubleLast, [[true, '✖️2 An'], [false, 'Aus']])}
        </div>
        <label class="field"><span>Zeit zum Schreiben</span>
          <select id="bq-write">${meta.writeTimes.map((t) => `<option value="${t}" ${t === g.writeTime ? 'selected' : ''}>${t} Sekunden</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit zum Wählen</span>
          <select id="bq-pick">${meta.pickTimes.map((t) => `<option value="${t}" ${t === g.pickTime ? 'selected' : ''}>${t} Sekunden</option>`).join('')}</select>
        </label>
      </div>
      ${g.questionCount > S.availableQuestions ? `<div class="small" style="color:var(--accent)">Für die gewählten Kategorien gibt es nur ${S.availableQuestions} Fragen. Es werden alle gespielt.</div>` : ''}
      <div>
        <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Kategorien</span>
          <span class="row"><button class="btn small ghost" data-action="allCats">Alle</button><button class="btn small ghost" data-action="noCats">Keine</button></span></div>
        <div class="chips">${meta.categories.map((c) => `<button class="chip ${g.categories.includes(c.name) ? 'on' : ''}" data-action="toggleCat" data-cat="${esc(c.name)}">${esc(c.name)} <small>${c.count}</small></button>`).join('')}</div>
      </div>
      <div class="small muted">So geht's: Zu jeder Frage erfindet jeder eine falsche, aber glaubwürdige Antwort. Danach stehen alle Lügen und die echte Antwort gemischt zur Auswahl. Punkte: ${meta.points.truth} für die echte Antwort, ${meta.points.fooled} für jeden, der auf deine Lüge hereinfällt (halb so viel mit einem Vorschlag), ${meta.points.like} für jedes 👍 auf deine Lüge.</div>
    </div>`;
  }

  // ---------- Spielansicht ----------

  function questionHtml(R) {
    const parts = esc(R.question.text).split('____');
    return `<div class="bq-question">${parts.join('<span class="bq-blank">______</span>')}</div>`;
  }

  function viewHead(R) {
    return `<div class="q-head">
      <div class="small muted"><b>Frage ${R.index + 1}/${R.total}</b> · ${esc(R.question.category)}${R.double ? ' · <span class="bq-double">✖️2 Doppelte Punkte</span>' : ''}</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function viewNoSheet() {
    if (isGamemaster()) return '';
    if (S.usesTeams && !S.me.teamId) {
      return `<div class="card stack center"><b>Tritt einem Team bei, um mitzuspielen:</b>
        <div class="row" style="justify-content:center">${S.teams.map((t) => `<button class="btn small" style="border-color:${t.color}" data-action="pickTeam" data-team="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>`;
    }
    return '';
  }

  function viewProgress(R, done) {
    return `<div class="status-bar">${R.sheets.map((sh) => `<div class="status-team ${done(sh) ? 'bq-done' : ''}" style="--team:${sheetColor(R, sh.key)}">
      ${sheetLabel(R, sh.key)}<span>${done(sh) ? '✅' : '⏳'}</span></div>`).join('')}</div>`;
  }

  function viewExclude(R) {
    const ex = R.exclude;
    if (!ex) return '';
    const mine = ex.ids.includes(S.me.id);
    if (!R.mySheet && !ex.ids.length) return '';
    return `<div class="exclude-bar">
      ${R.mySheet ? `<button class="btn small ${mine ? 'pink' : 'ghost'}" data-action="bqExclude" data-value="${mine ? '0' : '1'}">${mine ? '↩︎ Ausschließen zurücknehmen' : '🚫 Frage ausschließen'}</button>` : ''}
      ${ex.ids.length ? `<span class="small muted">${ex.ids.length}/${ex.needed} wollen die Frage ausschließen</span>${avatarStack(ex.ids)}` : '<span class="small muted">Stimmen alle dafür, kommt die Frage nie wieder dran.</span>'}
    </div>`;
  }

  function viewWrite(R) {
    const key = `${R.index}:${R.question.id}`;
    if (bq.draftKey !== key) {
      bq.draftKey = key;
      bq.draft = '';
    }
    let form = '';
    if (R.mySheet) {
      const mine = R.myLie;
      const by = mine?.by && R.teamMode && mine.by !== S.me.id ? ` (von ${esc(playerById(mine.by)?.name || 'jemandem')})` : '';
      form = `<form id="bq-form" class="card stack" autocomplete="off">
        <label class="field"><span>${R.teamMode ? 'Eure' : 'Deine'} Lüge</span>
          <input id="bq-lie" type="text" maxlength="40" placeholder="Eine glaubwürdige falsche Antwort" value="${esc(bq.draft)}" spellcheck="false" enterkeyhint="send">
        </label>
        <div class="row">
          <button class="btn primary" type="submit">${mine ? 'Ändern' : 'Abschicken'}</button>
          <button class="btn ghost" type="button" data-action="bqSuggest">💡 Mir fällt nichts ein</button>
        </div>
        ${mine ? `<div class="notice">✅ ${R.teamMode ? 'Eure' : 'Deine'} Lüge: <b>${esc(mine.text)}</b>${by}${mine.suggested ? ' · Vorschlag, gibt halbe Punkte' : ''}. Du kannst sie noch ändern.</div>` : ''}
        ${R.teamMode ? '<div class="small muted">Euer Team hat eine gemeinsame Lüge. Die zuletzt abgeschickte gilt.</div>' : ''}
      </form>`;
    }
    return `<div class="stack">
      ${viewHead(R)}
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${questionHtml(R)}
      ${form || viewNoSheet() || '<p class="center muted">Alle denken sich gerade eine Lüge aus …</p>'}
      ${viewProgress(R, (sh) => sh.written)}
      ${viewExclude(R)}
    </div>`;
  }

  function viewPick(R) {
    const canPick = Boolean(R.mySheet);
    const teamVotes = (id) => (R.teamPicks || []).filter((t) => t.option === id && t.playerId !== S.me.id).map((t) => t.playerId);
    const pickedPlayers = new Set(R.picked);
    return `<div class="stack">
      ${viewHead(R)}
      ${questionHtml(R)}
      <p class="center muted">${canPick ? 'Welche Antwort ist die echte?' : 'Alle suchen die echte Antwort …'}</p>
      <div class="bq-options">${R.options.map((o) => {
        const mine = R.myPick === o.id;
        const votes = teamVotes(o.id);
        return `<button class="bq-option ${mine ? 'picked' : ''} ${o.own ? 'own' : ''}" ${canPick && !o.own ? `data-action="bqPick" data-option="${o.id}"` : 'disabled'}>
          <span class="text">${esc(o.text)}</span>
          ${o.own ? `<span class="small muted">${R.teamMode ? 'Eure' : 'Deine'} Lüge</span>` : ''}
          ${votes.length ? `<span class="bq-votes">${votes.map((id) => avatarHtml(playerById(id), 'sm')).join('')}</span>` : ''}
        </button>`;
      }).join('')}</div>
      <div class="status-bar">${R.sheets.map((sh) => `<div class="status-team" style="--team:${sheetColor(R, sh.key)}">
        ${R.teamMode ? `<b class="small">${esc(sheetName(R, sh.key))}</b>` : ''}${sh.members.map((id) => avatarHtml(playerById(id), `sm ${pickedPlayers.has(id) ? 'voted' : ''}`)).join('')}</div>`).join('')}</div>
    </div>`;
  }

  function likeButton(o) {
    if (!o.likeable) return o.likes ? `<span class="bq-likes">👍 ${o.likes}</span>` : '';
    return `<button class="btn small ${o.liked ? 'pink' : 'ghost'} bq-like" data-action="bqLike" data-option="${o.id}" data-value="${o.liked ? '0' : '1'}">👍 ${o.likes}</button>`;
  }

  function viewReveal(R) {
    const current = R.steps[R.revealIndex];
    const order = [...R.options].sort((a, b) => {
      const sa = a.step === -1 ? 1000 : a.step;
      const sb = b.step === -1 ? 1000 : b.step;
      return sa - sb;
    });
    return `<div class="stack">
      ${viewHead(R)}
      ${questionHtml(R)}
      <div class="bq-reveal">${order.map((o) => {
        const now = o.id === current && !R.revealDone;
        if (!o.revealed) {
          return `<div class="bq-card hidden-card"><div class="text">${esc(o.text)}</div><div class="row" style="gap:6px">${likeButton(o)}</div></div>`;
        }
        const pickers = o.pickers || [];
        let who;
        if (o.truth) who = `<div class="bq-tag truth">✅ Die Wahrheit!${o.authors?.length ? ` Auch geschrieben von ${names(R, o.authors)}, das gibt keine Punkte.` : ''}</div>`;
        else if (o.filler) who = `<div class="bq-tag">🎲 Lüge vom Spiel</div>`;
        else who = `<div class="bq-tag lie">🤥 Lüge von ${names(R, o.authors)}</div>`;
        const fooled = o.truth
          ? pickers.length ? `Gefunden von ${avatars(R, pickers)}` : 'Niemand hat sie gefunden.'
          : pickers.length ? `Reingefallen: ${avatars(R, pickers)}` : 'Niemand ist darauf hereingefallen.';
        return `<div class="bq-card ${o.truth ? 'truth' : ''} ${now ? 'current' : ''}" data-like-id="${o.id}">
          <div class="text">${esc(o.text)}</div>
          ${who}
          <div class="row spread" style="gap:6px"><span class="small bq-pickers">${fooled}</span>${o.truth ? '' : likeButton(o)}</div>
        </div>`;
      }).join('')}</div>
      <p class="small muted center">Gefällt dir eine Lüge? Gib ihr ein 👍, jedes bringt ${S.game.points.like} Punkte.</p>
    </div>`;
  }

  function ranking(R) {
    const keys = new Set([...Object.keys(R.totals), ...R.sheets.map((s) => s.key)]);
    return [...keys].map((key) => ({ key, pts: R.totals[key] || 0 })).sort((a, b) => b.pts - a.pts);
  }

  function viewRanking(R, roundPoints = null) {
    let rank = 0;
    let last = null;
    return `<div class="scoreboard">${ranking(R).map((row, i) => {
      if (row.pts !== last) { rank = i + 1; last = row.pts; }
      const plus = roundPoints?.[row.key] ? `<span class="small muted">+${roundPoints[row.key].total}</span>` : '';
      return `<div class="score-row" style="--team:${sheetColor(R, row.key)}"><span class="rank">${rank}.</span><span class="name">${sheetLabel(R, row.key)}</span>${plus}<span class="pts">${row.pts}</span></div>`;
    }).join('')}</div>`;
  }

  function viewRoundTable(R) {
    const rows = Object.entries(R.last?.points || {}).sort((a, b) => b[1].total - a[1].total);
    if (!rows.length) return '';
    return `<div class="slf-table-wrap"><table class="slf-table bq-table">
      <thead><tr><th></th><th>✅ Wahrheit</th><th>🤥 Reingelegt</th><th>👍 Likes</th><th>Σ</th></tr></thead>
      <tbody>${rows.map(([key, p]) => `<tr><th>${sheetLabel(R, key)}</th><td>${p.truth}</td><td>${p.fooled}${p.fooledCount ? ` <span class="muted">(${p.fooledCount}×)</span>` : ''}</td><td>${p.likes}${p.likeCount ? ` <span class="muted">(${p.likeCount}×)</span>` : ''}</td><td><b>${p.total}</b></td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function viewScores(R) {
    return `<div class="stack">
      ${viewHead(R)}
      <div class="card center"><div class="small muted">Die echte Antwort</div><div class="bq-answer">${esc(R.last?.answer || '')}</div></div>
      ${viewRoundTable(R)}
      <h3>Gesamtstand</h3>
      ${viewRanking(R, R.last?.points)}
      ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet die nächste Frage.</div>'}
    </div>`;
  }

  function award(R, icon, title, a, unit) {
    if (!a) return '';
    return `<div class="card bq-award"><div class="icon">${icon}</div><div><b>${title}</b><div>${names(R, a.keys)}</div><div class="small muted">${a.count} ${unit}</div></div></div>`;
  }

  function viewFinal(R) {
    const ranked = ranking(R);
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const tie = ranked[1] && ranked[1].pts === ranked[0].pts;
    const winner = ranked[0] ? sheetName(R, ranked[0].key) : null;
    const a = R.awards || {};
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${!winner ? 'Spiel beendet' : tie ? 'Unentschieden!' : `${esc(winner)} gewinnt!`}</h1></div>
      <div class="podium">${top.map((row) => {
        const place = ranked.filter((o) => o.pts > row.pts).length;
        return `<div class="step"><b>${sheetLabel(R, row.key)}</b><div class="small muted">${row.pts} Punkte</div>
          <div class="block" style="--team:${R.teamMode ? sheetColor(R, row.key) : 'var(--pink)'};height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>
      <div class="bq-awards">
        ${award(R, '🤥', 'Bester Lügner', a.liar, 'Mal andere reingelegt')}
        ${award(R, '🔎', 'Wahrheitsfinder', a.finder, 'Mal die Wahrheit gefunden')}
        ${award(R, '💖', 'Publikumsliebling', a.favorite, 'Likes')}
      </div>
      ${a.bestLie ? `<div class="card center stack" style="gap:4px"><div class="small muted">Beliebteste Lüge der Partie (👍 ${a.bestLie.likes})</div>
        <div class="small">${esc(a.bestLie.question)}</div><div class="bq-answer">„${esc(a.bestLie.text)}“</div><div class="small muted">von ${names(R, a.bestLie.authors)}</div></div>` : ''}
      ${viewRanking(R)}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (!R.question) return `<div>${viewFinal(R)}</div>`;
    const body = { write: viewWrite, pick: viewPick, reveal: viewReveal, scores: viewScores, final: viewFinal }[R.phase];
    return `<div>${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'write') return '<button class="btn pink" data-action="bqNext">⏭ Zur Auswahl</button>';
    if (R.phase === 'pick') return '<button class="btn pink" data-action="bqNext">⏭ Zur Auflösung</button>';
    if (R.phase === 'reveal') return `<button class="btn primary" data-action="bqNext">${R.revealDone ? 'Punkte zeigen ▶︎' : 'Weiter ▶︎'}</button>`;
    return `<button class="btn primary" data-action="bqNext">${R.index + 1 >= R.total ? '🏆 Zum Ergebnis' : 'Nächste Frage ▶︎'}</button>`;
  }

  // Bei jedem neuen Like fliegt ein 👍 an der Antwortkarte hoch
  function afterRender() {
    const R = S?.round;
    if (S?.game.id !== 'bluffquiz' || S.phase !== 'playing' || R?.phase !== 'reveal') {
      bq.lastLikes = {};
      return;
    }
    for (const o of R.options) {
      const before = bq.lastLikes[o.id] ?? o.likes;
      if (o.likes > before) {
        const card = app.querySelector(`[data-like-id="${o.id}"]`);
        for (let i = 0; i < Math.min(o.likes - before, 5); i++) {
          const fly = document.createElement('span');
          fly.className = 'bq-fly';
          fly.textContent = '👍';
          fly.style.left = `${20 + Math.random() * 60}%`;
          fly.style.animationDelay = `${i * 120}ms`;
          card?.appendChild(fly);
        }
      }
      bq.lastLikes[o.id] = o.likes;
    }
  }

  gameViews.bluffquiz = { settings: viewSettings, view, hostbar, afterRender };

  // ---------- Eingaben ----------

  function submitLie() {
    const text = bq.draft.trim();
    if (!text) return toast('Bitte gib eine Antwort ein.');
    act('lie', { text }, (res) => {
      if (res.ok) {
        bq.draft = '';
        document.activeElement?.blur?.();
      }
      render();
    });
  }

  Object.assign(actions, {
    bqSetting: (el) => setGame({ [el.dataset.key]: el.dataset.value === '1' }),
    bqSuggest: () => act('suggest', {}, (res) => {
      if (!res.ok) return;
      bq.draft = res.text;
      render();
      document.getElementById('bq-lie')?.focus();
    }),
    bqPick: (el) => act('pick', { option: el.dataset.option }),
    bqLike: (el) => act('like', { option: el.dataset.option, wanted: el.dataset.value === '1' }),
    bqExclude: (el) => act('exclude', { wanted: el.dataset.value === '1' }),
    bqNext: () => act('next'),
  });

  app.addEventListener('input', (e) => {
    if (e.target.id === 'bq-lie') bq.draft = e.target.value;
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'bluffquiz') return;
    if (e.target.id === 'bq-count') setGame({ questionCount: Number(e.target.value) });
    else if (e.target.id === 'bq-write') setGame({ writeTime: Number(e.target.value) });
    else if (e.target.id === 'bq-pick') setGame({ pickTime: Number(e.target.value) });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id === 'bq-form') submitLie();
  });
})();
