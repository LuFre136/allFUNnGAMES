// Eins bis Zehn: Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const ez = { draft: '', draftKey: null };

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

  function isCaptain(R) {
    return R.captain === S.me.id;
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
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
        <div class="small muted" style="margin-top:6px">Läuft dein Bildschirm auf dem Fernseher, wähle „Nur Gamemaster“ und tritt zum Mitspielen zusätzlich mit dem Handy bei. Sonst sehen alle deine Zahl.</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Runden</span>
          <select id="ez-rounds">${meta.roundOptions.map((r) => `<option value="${r}" ${r === g.rounds ? 'selected' : ''}>${r ? `${r} Runden` : 'Jeder einmal Kapitän'}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Herzen</span>
          <input id="ez-hearts" type="number" min="3" max="15" value="${g.hearts}" inputmode="numeric">
        </label>
        <label class="field"><span>Zeit zum Antworten</span>
          <select id="ez-time">${meta.answerTimes.map((t) => `<option value="${t}" ${t === g.answerTime ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Kategorien (${S.availableQuestions} Themen)</span>
          <span class="row"><button class="btn small ghost" data-action="allCats">Alle</button><button class="btn small ghost" data-action="noCats">Keine</button></span></div>
        <div class="chips">${meta.categories.map((c) => `<button class="chip ${g.categories.includes(c.name) ? 'on' : ''}" data-action="toggleCat" data-cat="${esc(c.name)}">${esc(c.name)} <small>${c.count}</small></button>`).join('')}</div>
      </div>
      <div class="small muted">So geht's: Jede Runde ist ein anderer Spieler Kapitän und wählt ein Thema. Alle anderen bekommen geheim eine Zahl von 1 bis 10 und schreiben eine Antwort, die dazu passt. Dann deckt der Kapitän die Antworten von der kleinsten zur größten Zahl auf. Liegt eine Zahl unter einer schon aufgedeckten, kostet das ein Herz. Eine fehlerfreie Runde bringt ein Herz zurück. Für 3 bis 11 Spieler.</div>
    </div>`;
  }

  // ---------- Spielansicht ----------

  function hearts(R) {
    return `<span class="ez-hearts" title="${R.hearts} von ${R.maxHearts} Herzen">${'❤️'.repeat(R.hearts)}${'🤍'.repeat(Math.max(0, R.maxHearts - R.hearts))}</span>`;
  }

  function viewHead(R) {
    return `<div class="q-head">
      <div class="small muted"><b>Runde ${R.round + 1}/${R.totalRounds}</b> · Kapitän ${avatarHtml(playerById(R.captain), 'sm')} <b>${pname(R.captain)}</b></div>
      <div class="row">${hearts(R)}${R.deadline ? '<span class="timer" id="timer"></span>' : ''}</div>
    </div>`;
  }

  function scale(t) {
    return `<div class="ez-scale"><span><b>1</b> ${esc(t.low)}</span><span class="ez-scale-bar"></span><span>${esc(t.high)} <b>10</b></span></div>`;
  }

  function themeCard(t, { button = null } = {}) {
    const tag = button !== null ? 'button' : 'div';
    const attrs = button !== null ? ` data-action="ezChoose" data-index="${button}"` : '';
    return `<${tag} class="ez-theme ${button !== null ? 'pickable' : ''}"${attrs}>
      <div class="small muted">${esc(t.category)}</div>
      <div class="ez-theme-text">${esc(t.text)}</div>
      ${scale(t)}
    </${tag}>`;
  }

  function myNumber(R) {
    if (R.myNumber === null) return '';
    return `<div class="ez-mine"><span class="small muted">Deine geheime Zahl</span><span class="ez-number big">${R.myNumber}</span></div>`;
  }

  function viewChoose(R) {
    const captain = isCaptain(R);
    return `<div class="stack">
      ${viewHead(R)}
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${captain ? '<div class="ez-turn me">⚓ Du bist Kapitän! Wähle ein Thema.</div>'
        : `<div class="ez-turn">${avatarHtml(playerById(R.captain), 'sm')} <b>${pname(R.captain)}</b> ist Kapitän und wählt ein Thema …</div>`}
      ${myNumber(R)}
      <div class="ez-options">${R.options.map((t, i) => themeCard(t, { button: captain ? i : null })).join('')}</div>
    </div>`;
  }

  function draftValue(R) {
    const key = `${R.round}:${R.theme.id}`;
    if (ez.draftKey !== key) {
      ez.draftKey = key;
      ez.draft = R.myAnswer ?? '';
    }
    return ez.draft;
  }

  function viewAnswerForm(R) {
    return `<form id="ez-form" class="card stack" autocomplete="off">
      <label class="field"><span>Deine Antwort zur ${R.myNumber}</span>
        <input id="ez-text" type="text" maxlength="80" value="${esc(draftValue(R))}" placeholder="Passend zu deiner Zahl …" enterkeyhint="send">
      </label>
      <button class="btn primary" type="submit">${R.myAnswer === null ? 'Abschicken' : 'Ändern'}</button>
      ${R.myAnswer !== null ? `<div class="notice">✅ Abgegeben: <b>${esc(R.myAnswer)}</b>. Du kannst sie noch ändern, bis alle fertig sind.</div>` : '<div class="small muted">Verrate deine Zahl nicht! Der Kapitän soll sie an deiner Antwort erkennen.</div>'}
    </form>`;
  }

  function viewExclude(R) {
    const ex = R.exclude;
    if (!ex) return '';
    const mine = ex.ids.includes(S.me.id);
    if (!R.playing && !ex.ids.length) return '';
    return `<div class="exclude-bar">
      ${R.playing ? `<button class="btn small ${mine ? 'pink' : 'ghost'}" data-action="ezExclude" data-value="${mine ? '0' : '1'}">${mine ? '↩︎ Ausschließen zurücknehmen' : '🚫 Thema ausschließen'}</button>` : ''}
      ${ex.ids.length ? `<span class="small muted">${ex.ids.length}/${ex.needed} wollen das Thema ausschließen</span>${avatarStack(ex.ids)}` : '<span class="small muted">Stimmen alle dafür, kommt das Thema nie wieder dran.</span>'}
    </div>`;
  }

  function viewAnswer(R) {
    const answered = new Set(R.answered);
    let body;
    if (R.myNumber !== null) body = `${myNumber(R)}${viewAnswerForm(R)}`;
    else if (isCaptain(R)) body = '<p class="center muted">⚓ Du bist Kapitän. Die anderen schreiben gerade Antworten, die zu ihren Zahlen passen.</p>';
    else body = '<p class="center muted">Alle schreiben gerade ihre Antworten …</p>';
    return `<div class="stack">
      ${viewHead(R)}
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${themeCard(R.theme)}
      ${body}
      <div class="ez-progress">${R.numbered.map((id) => `<span class="ez-who ${answered.has(id) ? 'done' : ''}">${avatarHtml(playerById(id))}<span>${answered.has(id) ? '✅' : '✏️'}</span></span>`).join('')}</div>
      ${viewExclude(R)}
    </div>`;
  }

  function card(entry, { pickable = false } = {}) {
    const p = playerById(entry.id);
    const known = entry.number !== undefined;
    const state = known ? (entry.mistake ? 'wrong' : 'correct') : '';
    const tag = pickable ? 'button' : 'div';
    return `<${tag} class="ez-card ${state} ${pickable ? 'pickable' : ''} ${entry.id === S.me.id ? 'me' : ''}" ${pickable ? `data-action="ezPick" data-id="${esc(entry.id)}"` : ''}>
      ${known ? `<span class="ez-number">${entry.number}</span>` : ''}
      <span class="ez-answer">${esc(entry.text)}</span>
      <span class="ez-by">${avatarHtml(p, 'sm')} ${esc(p?.name || 'Jemand')}</span>
      ${entry.mistake ? '<span class="ez-mark">💔</span>' : ''}
    </${tag}>`;
  }

  function revealedRow(list, hidden = []) {
    if (!list.length && !hidden.length) return '<div class="ez-row empty small muted">Noch nichts aufgedeckt. Die kleinste Zahl zuerst!</div>';
    return `<div class="ez-row">${list.map((e) => card(e)).join('')}${hidden.map((e) => card({ ...e, mistake: false })).join('')}</div>`;
  }

  function viewOrder(R) {
    const canPick = isCaptain(R) || S.me.isHost;
    const banner = isCaptain(R)
      ? '<div class="ez-turn me">⚓ Tippe die Antwort an, hinter der du die kleinste Zahl vermutest.</div>'
      : `<div class="ez-turn">${avatarHtml(playerById(R.captain), 'sm')} <b>${pname(R.captain)}</b> deckt von klein nach groß auf. Diskutiert ruhig, aber keine Zahlen verraten!</div>`;
    return `<div class="stack">
      ${viewHead(R)}
      ${themeCard(R.theme)}
      ${banner}
      ${myNumber(R)}
      <div class="small muted" style="font-weight:800">Aufgedeckt</div>
      ${revealedRow(R.revealed)}
      <div class="small muted" style="font-weight:800">Noch verdeckt (${R.cards.length})</div>
      <div class="ez-cards">${R.cards.map((c) => card(c, { pickable: canPick })).join('')}</div>
    </div>`;
  }

  function viewScores(R) {
    const h = R.last;
    const nextHint = S.me.isHost ? '' : `<div class="small muted center">${R.lastRound ? 'Gleich kommt das Ergebnis.' : 'Der Host startet die nächste Runde.'}</div>`;
    if (!h) return `<div class="stack">${viewHead(R)}<div class="notice">${esc(R.notice || 'Diese Runde wurde übersprungen.')}</div>${nextHint}</div>`;
    const title = R.lost ? '💔 Alle Herzen verloren!'
      : h.perfect ? '🎉 Perfekte Runde! Ein Herz zurück.'
        : `${h.mistakes} Fehler, ${h.mistakes === 1 ? 'ein Herz' : `${h.mistakes} Herzen`} weniger`;
    return `<div class="stack">
      ${viewHead(R)}
      ${themeCard(h.theme)}
      <div class="ez-result ${R.lost ? 'bad' : h.perfect ? 'good' : ''}">${title}</div>
      ${revealedRow(h.revealed, h.hidden)}
      ${nextHint}
    </div>`;
  }

  function viewFinal(R) {
    const a = R.awards || {};
    const rows = (R.history || []).map((h, i) => (h
      ? `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span><span class="name">${avatarHtml(playerById(h.captain), 'sm')} ${esc(h.theme)}</span><span class="pts">${h.perfect ? '🎉' : h.mistakes ? `${'💔'.repeat(Math.min(h.mistakes, 5))}` : '✅'}</span></div>`
      : `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span><span class="name muted">Übersprungen</span><span class="pts">–</span></div>`)).join('');
    const captain = a.captain ? `<div class="card ez-award"><div class="icon">⚓</div><div><b>Bester Kapitän</b><div>${names(a.captain.ids)}</div><div class="small muted">${a.captain.mistakes ? `${a.captain.mistakes} Fehler` : 'fehlerfrei'}</div></div></div>` : '';
    const hardest = a.hardest ? `<div class="card ez-award"><div class="icon">🤯</div><div><b>Rätselhafteste Antwort</b><div>„${esc(a.hardest.text)}“ von ${pname(a.hardest.id)} war eine ${a.hardest.number}</div><div class="small muted">${esc(a.hardest.theme)}</div></div></div>` : '';
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">${R.won ? '🏆' : '💔'}</div>
        <h1>${R.won ? 'Geschafft!' : 'Verloren!'}</h1>
        <div>${hearts(R)}</div>
        <p style="font-weight:800">${esc(R.verdict || '')}</p>
        ${R.perfectRounds ? `<div class="small muted">${R.perfectRounds} perfekte ${R.perfectRounds === 1 ? 'Runde' : 'Runden'}</div>` : ''}
      </div>
      <div class="ez-awards">${captain}${hardest}</div>
      ${rows ? `<div class="scoreboard">${rows}</div>` : ''}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.phase === 'final') return `<div>${viewFinal(R)}</div>`;
    const body = { choose: viewChoose, answer: viewAnswer, order: viewOrder, scores: viewScores }[R.phase];
    return `<div>${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'choose') return '<button class="btn ghost" data-action="ezSkip">⏭ Anderer Kapitän</button><button class="btn pink" data-action="ezNext">🎲 Thema auslosen</button>';
    if (R.phase === 'answer') return '<button class="btn pink" data-action="ezNext">⏭ Zum Aufdecken</button>';
    if (R.phase === 'order') return '<span class="small muted">Der Kapitän deckt auf. Du kannst für ihn antippen.</span>';
    return `<button class="btn primary" data-action="ezNext">${R.lastRound ? '🏆 Zum Ergebnis' : 'Nächste Runde ▶︎'}</button>`;
  }

  gameViews.einsbiszehn = { settings: viewSettings, view, hostbar };

  // ---------- Eingaben ----------

  function submitAnswer() {
    const text = String(ez.draft ?? '').trim();
    if (!text) return toast('Bitte schreib eine Antwort.');
    act('answer', { text }, (res) => {
      if (res.ok) document.activeElement?.blur?.();
    });
  }

  Object.assign(actions, {
    ezChoose: (el) => act('choose', { index: Number(el.dataset.index) }),
    ezPick: (el) => act('pick', { id: el.dataset.id }),
    ezExclude: (el) => act('exclude', { wanted: el.dataset.value === '1' }),
    ezSkip: () => act('skip'),
    ezNext: () => act('next'),
  });

  app.addEventListener('input', (e) => {
    if (e.target.id === 'ez-text') ez.draft = e.target.value;
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'einsbiszehn') return;
    if (e.target.id === 'ez-rounds') setGame({ rounds: Number(e.target.value) });
    else if (e.target.id === 'ez-hearts') setGame({ hearts: Number(e.target.value) });
    else if (e.target.id === 'ez-time') setGame({ answerTime: Number(e.target.value) });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id === 'ez-form') submitAnswer();
  });
})();
