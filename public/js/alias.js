// Alias: Spielansicht für Fernseher (Host), Hinweisgeber und Ermittler (nutzt die Helfer aus lobby.js)

(() => {
  const TIMES = [0, 30, 45, 60, 90, 120, 180, 240, 300];
  const al = { word: '', count: 1, turnKey: null };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function setting(key, value) {
    sendHost('settings', { game: { [key]: value } });
  }

  function teamName(id) {
    return teamById(id)?.name || 'Team';
  }

  function teamColor(id) {
    return teamById(id)?.color || 'var(--accent)';
  }

  function countLabel(n) {
    return n >= 10 ? '∞' : String(n);
  }

  function timeSelect(id, selected) {
    return `<select id="${id}">${TIMES.map((t) => `<option value="${t}" ${t === selected ? 'selected' : ''}>${!t ? 'Kein Zeitlimit' : t % 60 === 0 && t >= 120 ? `${t / 60} Minuten` : `${t} Sekunden`}</option>`).join('')}</select>`;
  }

  function segmented(key, value, options) {
    return `<div class="segmented" style="grid-template-columns:repeat(${options.length},1fr)">${options.map(([v, label]) =>
      `<button data-action="alSetting" data-key="${key}" data-value="${v}" class="${value === v ? 'on' : ''}">${label}</button>`).join('')}</div>`;
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
        <div class="small muted" style="margin-top:6px">Dein Bildschirm ist der Fernseher und zeigt nie die geheime Karte. Spielst du mit, bist du deshalb immer Ermittler. Wer als Host auch Hinweise geben will, tritt zusätzlich mit dem Handy bei.</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Partien bis zum Sieg</span>
          <select id="al-wins">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === g.winsNeeded ? 'selected' : ''}>${n === 1 ? '1 Partie' : `${n} Partien (Best of ${n * 2 - 1})`}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit für den Hinweis</span>${timeSelect('al-clue-time', g.clueTimeLimit)}</label>
        <label class="field"><span>Zeit zum Raten</span>${timeSelect('al-guess-time', g.guessTimeLimit)}</label>
        <label class="field"><span>Erster Zug jedes Teams</span>
          <select id="al-first-free"><option value="1" ${g.firstTurnFree ? 'selected' : ''}>ohne Zeitlimit</option><option value="0" ${!g.firstTurnFree ? 'selected' : ''}>mit Zeitlimit</option></select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Hinweisgeber</div>
        ${segmented('spymasterMode', g.spymasterMode, [['rotate', '🔁 Reihum'], ['random', '🎲 Zufällig'], ['manual', '✋ Festlegen']])}
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Karte aufdecken, wenn …</div>
        ${segmented('revealMode', g.revealMode, [['majority', '👥 die Mehrheit sie wählt'], ['first', '👆 einer tippt']])}
      </div>
      <div class="small muted">So geht's: Zwei Teams, 25 Wortkarten. Pro Team kennt ein Hinweisgeber auf seinem Handy die geheime Karte: welche Wörter zum eigenen Team gehören, welche zum Gegner, welche neutral sind und wo der Attentäter liegt. Er gibt ein Wort und eine Zahl als Hinweis, sein Team tippt die passenden Karten an. Pro Hinweis darf das Team Zahl + 1 Karten aufdecken. Ein Passant oder eine gegnerische Karte beendet den Zug, der Attentäter verliert sofort. Wer zuerst alle eigenen Karten gefunden hat, gewinnt. Jedes Team braucht mindestens zwei Spieler.</div>
    </div>`;
  }

  // Der Host legt die Hinweisgeber in der Lobby fest
  function lobbyExtra() {
    const g = S.settings.game;
    if (g.spymasterMode !== 'manual') return '';
    const host = S.me.isHost;
    return `<div class="card stack">
      <h3 style="margin:0">🕵️ Hinweisgeber</h3>
      <div class="small muted">${host ? 'Tippe pro Team auf den Spieler, der die Hinweise gibt.' : 'Der Host legt fest, wer die Hinweise gibt.'}</div>
      <div class="teams">${S.teams.map((t) => {
        const members = S.players.filter((p) => p.teamId === t.id && !p.isHost);
        return `<div class="team" style="--team:${t.color}"><div class="team-head"><span class="team-dot"></span><span class="team-name">${esc(t.name)}</span></div>
          <div class="chips">${members.map((p) => `<button class="chip ${g.spymasters?.[t.id] === p.id ? 'on' : ''}" ${host ? `data-action="alSpy" data-team="${t.id}" data-player="${p.id}"` : 'disabled'}>${esc(p.name)}</button>`).join('') || '<span class="small muted">Noch niemand</span>'}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  // ---------- Spiel ----------

  function viewTeams(R) {
    return `<div class="al-teams">${R.teams.map((t) => {
      const spy = playerById(t.spymasterId);
      const turn = R.turnTeamId === t.id && ['clue', 'guess'].includes(R.phase);
      const dots = Array.from({ length: R.winsNeeded }, (_, i) => `<span class="al-win ${i < t.wins ? 'on' : ''}"></span>`).join('');
      return `<div class="al-team ${turn ? 'turn' : ''} ${R.myTeamId === t.id ? 'mine' : ''}" style="--team:${teamColor(t.id)}">
        <div class="al-team-head"><span class="team-dot"></span><b>${esc(teamName(t.id))}</b>${R.winsNeeded > 1 ? `<span class="al-wins">${dots}</span>` : ''}</div>
        <div class="al-left"><span class="num">${t.remaining}</span><span class="small muted">von ${t.total} übrig</span></div>
        <div class="al-spy small">${spy ? `${avatarHtml(spy, 'sm')} 🕵️ ${esc(spy.name)}${t.spymasterOnline ? '' : ' <span class="al-offline">offline</span>'}` : '<span class="muted">kein Hinweisgeber</span>'}</div>
        <div class="stack-avatars">${t.guessers.map((id) => avatarHtml(playerById(id), 'sm')).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function viewClueForm(R) {
    const key = `${R.gameNo}:${R.history.length}`;
    if (al.turnKey !== key) {
      al.turnKey = key;
      al.word = '';
      al.count = 1;
    }
    return `<form id="al-clue-form" class="card stack al-clue-form" style="--team:${teamColor(R.turnTeamId)}">
      <b>Du bist dran: Gib deinem Team einen Hinweis.</b>
      <input id="al-word" type="text" maxlength="30" placeholder="Ein Wort" value="${esc(al.word)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="al-counts">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" class="${al.count === n ? 'on' : ''}" data-action="alCount" data-n="${n}">${countLabel(n)}</button>`).join('')}</div>
      <button class="btn primary" type="submit">Hinweis geben (${countLabel(al.count)})</button>
      <div class="small muted">Die Zahl sagt, wie viele Karten zum Hinweis passen. 0 und ∞ bedeuten: beliebig viele Versuche. Wörter vom Tisch und ihre Wortfamilie sind verboten.</div>
    </form>`;
  }

  function viewBanner(R) {
    const team = esc(teamName(R.turnTeamId));
    const style = `style="--team:${teamColor(R.turnTeamId)}"`;
    const timer = R.deadline ? '<span class="timer" id="timer"></span>' : '';
    if (R.phase === 'clue') {
      return `<div class="al-banner" ${style}><span>${team} überlegt einen Hinweis …</span>${timer}</div>`;
    }
    const left = R.guessesLeft === null ? 'beliebig viele Versuche' : `noch ${R.guessesLeft} ${R.guessesLeft === 1 ? 'Versuch' : 'Versuche'}`;
    const mine = R.role === 'guesser' && R.myTeamId === R.turnTeamId;
    return `<div class="al-banner" ${style}>
      <span class="al-clue"><span class="word">${esc(R.clue.word)}</span><span class="count">${countLabel(R.clue.count)}</span></span>
      <span class="small">${team} · ${left}</span>${timer}
      ${mine && R.needed > 1 ? `<span class="small muted" style="flex-basis:100%">Aufgedeckt wird, wenn ${R.needed} von euch dieselbe Karte wählen.</span>` : ''}
    </div>`;
  }

  function canPick(R) {
    return R.phase === 'guess' && R.role === 'guesser' && R.myTeamId === R.turnTeamId;
  }

  function viewBoard(R) {
    const pickable = canPick(R);
    const hostReveal = !pickable && S.me.isHost && R.phase === 'guess';
    const spy = R.role === 'spymaster' || R.phase === 'over' || R.phase === 'final';
    return `<div class="al-board ${spy ? 'key' : ''} ${R.phase === 'over' || R.phase === 'final' ? 'over' : ''}">${R.board.map((c, i) => {
      const color = c.color === 'neutral' || c.color === 'assassin' ? c.color : c.color ? 'team' : '';
      const action = c.revealed ? '' : pickable ? `data-action="alPick" data-i="${i}"` : hostReveal ? `data-action="alReveal" data-i="${i}"` : '';
      const mine = c.picks.includes(S.me.id);
      return `<button class="al-card ${c.revealed ? 'revealed' : ''} ${color} ${mine ? 'picked' : ''} ${c.last ? 'last' : ''}"
        style="--n:${Math.max(c.word.length + (c.color === 'assassin' && (c.revealed || spy) ? 2 : 0), 6)};${c.color && c.color !== 'neutral' && c.color !== 'assassin' ? `--team:${teamColor(c.color)}` : ''}" ${action} ${action ? '' : 'tabindex="-1"'}>
        <span class="w">${c.color === 'assassin' && (c.revealed || spy) ? '💀 ' : ''}${esc(c.word)}</span>
        ${c.picks.length ? `<span class="al-picks">${c.picks.map((id) => avatarHtml(playerById(id), 'sm')).join('')}</span>` : ''}
      </button>`;
    }).join('')}</div>`;
  }

  function viewEndTurn(R) {
    if (R.phase !== 'guess') return '';
    const avatars = R.endPicks.map((id) => avatarHtml(playerById(id), 'sm')).join('');
    if (!canPick(R)) return avatars ? `<div class="row small muted" style="justify-content:center">Wollen aufhören: ${avatars}</div>` : '';
    const mine = R.endPicks.includes(S.me.id);
    return `<div class="row" style="justify-content:center">
      <button class="btn ${mine ? 'primary' : ''}" data-action="alEnd">✋ Zug beenden${mine ? ' ✓' : ''}</button>${avatars}
    </div>`;
  }

  function viewHistory(R) {
    if (!R.history.length) return '';
    return `<div class="al-history">${R.teams.map((t) => `<div class="card" style="--team:${teamColor(t.id)}">
      <div class="al-team-head"><span class="team-dot"></span><b>Hinweise von ${esc(teamName(t.id))}</b></div>
      ${R.history.filter((h) => h.teamId === t.id).map((h) => `<div class="al-hist">
        <b>${esc(h.word)} · ${countLabel(h.count)}</b>
        <span class="small muted">${h.reveals.map((r) => esc(R.board[r.index].word)).join(', ') || '–'}</span>
      </div>`).join('') || '<div class="small muted">Noch keine</div>'}
    </div>`).join('')}</div>`;
  }

  function viewHostTools(R) {
    if (!S.me.isHost || !['clue', 'guess'].includes(R.phase)) return '';
    return `<details class="card"><summary>Hinweisgeber ändern</summary>
      <div class="grid-2" style="gap:12px;margin-top:10px">${R.teams.map((t) => {
        const members = S.players.filter((p) => p.teamId === t.id && !p.isHost && !p.guestOf);
        return `<label class="field"><span>${esc(teamName(t.id))}</span><select data-al-spy="${t.id}">${members.map((p) =>
          `<option value="${p.id}" ${p.id === t.spymasterId ? 'selected' : ''}>${esc(p.name)}${p.connected ? '' : ' (offline)'}</option>`).join('')}</select></label>`;
      }).join('')}</div>
    </details>`;
  }

  function viewOver(R) {
    const color = teamColor(R.winnerId);
    const loser = R.teams.find((t) => t.id !== R.winnerId)?.id;
    const text = R.endReason === 'assassin'
      ? `${esc(teamName(loser))} hat den Attentäter erwischt. ${esc(teamName(R.winnerId))} gewinnt!`
      : `${esc(teamName(R.winnerId))} hat alle Agenten gefunden!`;
    const head = R.phase === 'final'
      ? `<div style="font-size:3rem">🏆</div><h1>${esc(teamName(R.matchWinnerId))} gewinnt Alias!</h1>
         <div class="muted">${R.teams.map((t) => `${esc(teamName(t.id))}: ${t.wins}`).join(' · ')}</div>`
      : `<div style="font-size:2.4rem">${R.endReason === 'assassin' ? '💀' : '🎉'}</div><h2>${text}</h2>
         ${R.winsNeeded > 1 ? `<div class="muted">Stand: ${R.teams.map((t) => `${esc(teamName(t.id))} ${t.wins}`).join(' : ')}${R.matchWinnerId ? ' · Das Spiel ist entschieden!' : ''}</div>` : ''}`;
    return `<div class="al-result" style="--team:${color}">${head}</div>`;
  }

  function view() {
    const R = S.round;
    const over = R.phase === 'over' || R.phase === 'final';
    // Der Hinweisgeber tippt unter dem Gitter, damit er die Karten beim Schreiben sieht
    const clueForm = R.phase === 'clue' && R.role === 'spymaster' && R.myTeamId === R.turnTeamId;
    const roleText = { spymaster: '🕵️ Du bist Hinweisgeber', guesser: '🔎 Du bist Ermittler', spectator: '👀 Du schaust zu' }[R.role];
    return `<div class="stack al">
      <div class="q-head"><div class="small muted"><b>Partie ${R.gameNo}</b> · ${roleText}${R.myTeamId ? ` bei ${esc(teamName(R.myTeamId))}` : ''}</div></div>
      ${viewTeams(R)}
      ${over ? viewOver(R) : clueForm ? '' : viewBanner(R)}
      ${R.notice && !over ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${viewBoard(R)}
      ${clueForm ? viewClueForm(R) : ''}
      ${viewEndTurn(R)}
      ${R.role === 'spymaster' && !over ? '<div class="small muted center">Farbig umrandet: die geheime Karte. Nur du und der andere Hinweisgeber sehen sie.</div>' : ''}
      ${viewHistory(R)}
      ${viewHostTools(R)}
    </div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'over') return `<button class="btn primary" data-action="next">${R.matchWinnerId ? '🏆 Zum Endergebnis' : 'Nächste Partie ▶︎'}</button>`;
    const reject = R.phase === 'guess' && !R.history.at(-1)?.reveals.length ? '<button class="btn" data-action="alReject">↩︎ Hinweis zurückweisen</button>' : '';
    return `${reject}<button class="btn" data-action="alSkip">⏭ Zug beenden</button>`;
  }

  gameViews.alias = { settings: viewSettings, lobbyExtra, view, hostbar };

  Object.assign(actions, {
    alSetting: (el) => setting(el.dataset.key, el.dataset.value),
    alSpy: (el) => setting('spymasters', { [el.dataset.team]: el.dataset.player }),
    alCount: (el) => { al.count = Number(el.dataset.n); render(); },
    alPick: (el) => act('pick', { index: Number(el.dataset.i) }),
    alEnd: () => act('pick', { index: 'end' }),
    alReveal: (el) => {
      const word = S.round.board[Number(el.dataset.i)].word;
      if (confirm(`„${word}“ für ${teamName(S.round.turnTeamId)} aufdecken?`)) act('reveal', { index: Number(el.dataset.i) });
    },
    alSkip: () => { if (confirm('Den Zug beenden? Dann ist das andere Team dran.')) act('skip'); },
    alReject: () => { if (confirm('Hinweis zurückweisen? Der Hinweisgeber gibt dann einen neuen.')) act('rejectClue'); },
  });

  app.addEventListener('input', (e) => {
    if (S?.game.id !== 'alias') return;
    if (e.target.id === 'al-word') al.word = e.target.value;
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'alias') return;
    if (e.target.id === 'al-wins') setting('winsNeeded', Number(e.target.value));
    else if (e.target.id === 'al-clue-time') setting('clueTimeLimit', Number(e.target.value));
    else if (e.target.id === 'al-guess-time') setting('guessTimeLimit', Number(e.target.value));
    else if (e.target.id === 'al-first-free') setting('firstTurnFree', e.target.value === '1');
    else if (e.target.dataset.alSpy) act('setSpymaster', { teamId: e.target.dataset.alSpy, playerId: e.target.value });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id !== 'al-clue-form') return;
    if (!al.word.trim()) return toast('Bitte gib ein Wort ein.');
    act('clue', { word: al.word, count: al.count });
    document.activeElement?.blur?.();
  });
})();
