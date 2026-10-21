// Freundeskala: Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const fk = { draft: null, draftKey: null };

  function act(type, data = {}, done) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
      done?.(res || {});
    });
  }

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  function name(id) {
    return id === S.me.id ? 'Du' : playerById(id)?.name || 'Jemand';
  }

  function names(ids) {
    const list = ids.map((id) => esc(playerById(id)?.name || 'Jemand'));
    return list.length > 1 ? `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}` : list[0] || '';
  }

  function valueText(q, v) {
    return `${fmtNumber(v)}${q?.unit ? ` ${esc(q.unit)}` : ''}`;
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const kinds = [['both', '🔀 Beide'], ['count', '🔢 Nur Anzahl'], ['scale', '🎚 Nur Skala']];
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
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Fragearten</div>
        <div class="segmented">${kinds.map(([v, label]) => `<button data-action="fkKinds" data-value="${v}" class="${g.kinds === v ? 'on' : ''}">${label}</button>`).join('')}</div>
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Fragen (${S.availableQuestions} verfügbar)</span>
          <input id="fk-count" type="number" min="3" max="20" value="${g.questionCount}" inputmode="numeric">
        </label>
        <label class="field"><span>Zeit zum Antworten</span>
          <select id="fk-time">${meta.answerTimes.map((t) => `<option value="${t}" ${t === g.answerTime ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      ${g.questionCount > S.availableQuestions ? `<div class="small" style="color:var(--accent)">Für diese Auswahl gibt es nur ${S.availableQuestions} Fragen. Es werden alle gespielt.</div>` : ''}
      <div>
        <div class="row spread" style="margin-bottom:6px"><span class="small muted" style="font-weight:700">Kategorien</span>
          <span class="row"><button class="btn small ghost" data-action="allCats">Alle</button><button class="btn small ghost" data-action="noCats">Keine</button></span></div>
        <div class="chips">${meta.categories.map((c) => `<button class="chip ${g.categories.includes(c.name) ? 'on' : ''}" data-action="toggleCat" data-cat="${esc(c.name)}">${esc(c.name)} <small>${c.count}</small></button>`).join('')}</div>
      </div>
      <div class="small muted">So geht's: Jeder beantwortet die Frage geheim mit einer Zahl über sich selbst. Dann legt ihr der Reihe nach eure Profilbilder auf eine Linie von wenig nach viel, ohne die Zahlen zu kennen. Gelegte Bilder bleiben liegen. Für jedes Bild am richtigen Platz bekommt ihr gemeinsam einen Punkt. Für 3 bis 12 Spieler.</div>
    </div>`;
  }

  // ---------- Spielansicht ----------

  function viewHead(R) {
    return `<div class="q-head">
      <div class="small muted"><b>Frage ${R.index + 1}/${R.total}</b> · ${esc(R.question.category)} · ⭐ ${R.score}/${R.maxScore}</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function questionHtml(R) {
    return `<div class="fk-question">${esc(R.question.text)}</div>`;
  }

  function myNumber(R) {
    if (R.myAnswer === null) return '';
    return `<div class="fk-mine">Deine Zahl: <b>${valueText(R.question, R.myAnswer)}</b></div>`;
  }

  function viewExclude(R) {
    const ex = R.exclude;
    if (!ex) return '';
    const mine = ex.ids.includes(S.me.id);
    if (!R.playing && !ex.ids.length) return '';
    return `<div class="exclude-bar">
      ${R.playing ? `<button class="btn small ${mine ? 'pink' : 'ghost'}" data-action="fkExclude" data-value="${mine ? '0' : '1'}">${mine ? '↩︎ Ausschließen zurücknehmen' : '🚫 Frage ausschließen'}</button>` : ''}
      ${ex.ids.length ? `<span class="small muted">${ex.ids.length}/${ex.needed} wollen die Frage ausschließen</span>${avatarStack(ex.ids)}` : '<span class="small muted">Stimmen alle dafür, kommt die Frage nie wieder dran.</span>'}
    </div>`;
  }

  function draftValue(R) {
    const key = `${R.index}:${R.question.id}`;
    if (fk.draftKey !== key) {
      fk.draftKey = key;
      fk.draft = R.myAnswer ?? (R.question.kind === 'scale' ? 50 : '');
    }
    return fk.draft;
  }

  function viewAnswerForm(R) {
    const q = R.question;
    const value = draftValue(R);
    const input = q.kind === 'scale'
      ? `<div class="fk-slider">
          <div class="fk-slider-value" id="fk-slider-value">${fmtNumber(value)}</div>
          <input id="fk-range" type="range" min="0" max="100" step="1" value="${value}">
          <div class="row spread small muted"><span>0 · ${esc(q.low)}</span><span>${esc(q.high)} · 100</span></div>
        </div>`
      : `<label class="field"><span>Deine Zahl${q.unit ? ` (${esc(q.unit)})` : ''}</span>
          <input id="fk-number" type="number" min="0" max="${q.max}" step="1" inputmode="numeric" value="${esc(String(value))}" placeholder="0 bis ${fmtNumber(q.max)}" enterkeyhint="send">
        </label>`;
    return `<form id="fk-form" class="card stack" autocomplete="off">
      ${input}
      <button class="btn primary" type="submit">${R.myAnswer === null ? 'Abschicken' : 'Ändern'}</button>
      ${R.myAnswer !== null ? `<div class="notice">✅ Abgegeben: <b>${valueText(q, R.myAnswer)}</b>. Du kannst sie noch ändern, bis alle fertig sind.</div>` : '<div class="small muted">Ehrlich sein! Die anderen sehen deine Zahl erst bei der Auflösung.</div>'}
    </form>`;
  }

  function viewAnswer(R) {
    const answered = new Set(R.answered);
    return `<div class="stack">
      ${viewHead(R)}
      ${R.notice ? `<div class="notice">${esc(R.notice)}</div>` : ''}
      ${questionHtml(R)}
      ${R.playing ? viewAnswerForm(R) : '<p class="center muted">Alle tippen gerade ihre Zahl ein …</p>'}
      <div class="fk-progress">${R.players.map((id) => `<span class="fk-who ${answered.has(id) ? 'done' : ''}">${avatarHtml(playerById(id))}<span>${answered.has(id) ? '✅' : '⏳'}</span></span>`).join('')}</div>
      ${viewExclude(R)}
    </div>`;
  }

  function chip(R, entry, { gapIndex = null, sortedView = false } = {}) {
    const p = playerById(entry.id);
    const known = entry.value !== undefined;
    const state = sortedView ? '' : known ? (entry.correct ? 'correct' : 'wrong') : '';
    return `<div class="fk-chip ${state} ${entry.id === S.me.id ? 'me' : ''}" ${gapIndex !== null ? `data-chip="${gapIndex}"` : ''}>
      ${avatarHtml(p, 'lg')}
      <span class="fk-name">${esc(p?.name || 'Jemand')}</span>
      ${known ? `<span class="fk-value">${valueText(R.question, entry.value)}</span>` : ''}
      ${state ? `<span class="fk-mark">${entry.correct ? '✅' : '❌'}</span>` : ''}
    </div>`;
  }

  // Die Reihe von wenig nach viel; wer dran ist, bekommt Lücken zum Antippen
  function lineHtml(R, entries, { gaps = false, sortedView = false } = {}) {
    const gap = (i) => (gaps ? `<button class="fk-gap" data-action="fkPlace" data-index="${i}"><span>Hier hin</span></button>` : '');
    const items = entries.map((e, i) => `${gap(i)}${chip(R, e, { gapIndex: i, sortedView })}`).join('') + gap(entries.length);
    return `<div class="fk-line ${gaps ? 'with-gaps' : ''}">
      <div class="fk-end low">${esc(R.question.low)}</div>
      <div class="fk-track">${items}</div>
      <div class="fk-end high">${esc(R.question.high)}</div>
    </div>`;
  }

  function viewPlace(R) {
    const mine = R.turn === S.me.id;
    const turnPlayer = playerById(R.turn);
    const banner = mine
      ? '<div class="fk-turn me">👉 Du bist dran! Tippe auf die Stelle, an die du gehörst.</div>'
      : `<div class="fk-turn">${avatarHtml(turnPlayer, 'sm')} <b>${esc(turnPlayer?.name || 'Jemand')}</b> ist dran und legt sich in die Reihe.</div>`;
    const waiting = R.waiting.filter((id) => id !== R.turn);
    return `<div class="stack">
      ${viewHead(R)}
      ${questionHtml(R)}
      ${banner}
      ${myNumber(R)}
      ${lineHtml(R, R.line, { gaps: mine })}
      ${waiting.length ? `<div class="small muted center">Danach: ${waiting.map((id) => avatarHtml(playerById(id), 'sm')).join('')}</div>` : '<div class="small muted center">Das ist der Letzte, danach wird aufgedeckt.</div>'}
    </div>`;
  }

  function viewReveal(R) {
    const hits = R.line.filter((e) => e.correct).length;
    return `<div class="stack">
      ${viewHead(R)}
      ${questionHtml(R)}
      ${lineHtml(R, R.line)}
      ${R.revealDone ? `<div class="fk-hits">${hits} von ${R.line.length} richtig</div>
        <div class="small muted center" style="font-weight:800">So wäre es richtig gewesen</div>
        ${lineHtml(R, R.sorted, { sortedView: true })}` : '<p class="center muted">Die Zahlen werden aufgedeckt …</p>'}
    </div>`;
  }

  function viewScores(R) {
    const h = R.last;
    if (!h) {
      return `<div class="stack">${viewHead(R)}<div class="notice">${esc(R.notice || 'Diese Frage wurde übersprungen.')}</div>
        ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet die nächste Frage.</div>'}</div>`;
    }
    return `<div class="stack">
      ${viewHead(R)}
      ${questionHtml(R)}
      <div class="fk-hits">${h.points === h.max ? '🎉 ' : ''}${h.points} von ${h.max} richtig</div>
      ${lineHtml(R, h.result)}
      <div class="card center"><div class="small muted">Gemeinsamer Stand</div><div class="fk-total">⭐ ${R.score} von ${R.maxScore}</div></div>
      ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet die nächste Frage.</div>'}
    </div>`;
  }

  function award(icon, title, a, unit) {
    if (!a) return '';
    return `<div class="card fk-award"><div class="icon">${icon}</div><div><b>${title}</b><div>${names(a.ids)}</div><div class="small muted">${a.count} ${unit}</div></div></div>`;
  }

  function viewFinal(R) {
    const a = R.awards || {};
    const rows = (R.history || []).map((h, i) => (h
      ? `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span><span class="name">${esc(h.question)}</span><span class="pts">${h.points}/${h.max}</span></div>`
      : `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span><span class="name muted">Übersprungen</span><span class="pts">–</span></div>`)).join('');
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">📏</div><h1>⭐ ${R.score} von ${R.maxScore}</h1><p style="font-weight:800">${esc(R.verdict || '')}</p></div>
      <div class="fk-awards">
        ${award('🔮', 'Gedankenleser', a.reader, 'Mal am richtigen Platz')}
        ${award('🥚', 'Überraschungsei', a.surprise, 'Plätze daneben insgesamt')}
        ${award('🎢', 'Extremist', a.extremist, 'Mal ganz außen')}
      </div>
      ${rows ? `<div class="scoreboard">${rows}</div>` : ''}
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (!R.question || R.phase === 'final') return `<div>${viewFinal(R)}</div>`;
    const body = { answer: viewAnswer, place: viewPlace, reveal: viewReveal, scores: viewScores }[R.phase];
    return `<div>${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'answer') return '<button class="btn pink" data-action="fkNext">⏭ Zum Legen</button>';
    if (R.phase === 'place') return `<button class="btn ghost" data-action="fkSkip">⏭ ${esc(name(R.turn))} überspringen</button>`;
    if (R.phase === 'reveal') return `<button class="btn primary" data-action="fkNext">${R.revealDone ? 'Weiter ▶︎' : 'Alles aufdecken ▶︎'}</button>`;
    return `<button class="btn primary" data-action="fkNext">${R.index + 1 >= R.total ? '🏆 Zum Ergebnis' : 'Nächste Frage ▶︎'}</button>`;
  }

  gameViews.freundeskala = { settings: viewSettings, view, hostbar };

  // ---------- Eingaben ----------

  function submitAnswer() {
    const raw = String(fk.draft ?? '').trim();
    if (raw === '') return toast('Bitte gib eine Zahl ein.');
    act('answer', { value: Number(raw) }, (res) => {
      if (res.ok) document.activeElement?.blur?.();
    });
  }

  Object.assign(actions, {
    fkKinds: (el) => setGame({ kinds: el.dataset.value }),
    fkPlace: (el) => act('place', { index: Number(el.dataset.index) }),
    fkExclude: (el) => act('exclude', { wanted: el.dataset.value === '1' }),
    fkSkip: () => act('skip'),
    fkNext: () => act('next'),
  });

  app.addEventListener('input', (e) => {
    if (e.target.id === 'fk-number') fk.draft = e.target.value;
    if (e.target.id === 'fk-range') {
      fk.draft = Number(e.target.value);
      const label = document.getElementById('fk-slider-value');
      if (label) label.textContent = fmtNumber(fk.draft);
    }
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'freundeskala') return;
    if (e.target.id === 'fk-count') setGame({ questionCount: Number(e.target.value) });
    else if (e.target.id === 'fk-time') setGame({ answerTime: Number(e.target.value) });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id === 'fk-form') submitAnswer();
  });
})();
