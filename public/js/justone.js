// Just One: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const joDrafts = {}; // Eingaben pro Karte, damit beim Neuzeichnen nichts verloren geht

  function draft() {
    const key = S.round.card;
    if (!joDrafts[key]) joDrafts[key] = { clue: S.round.myClue || '', guess: '' };
    return joDrafts[key];
  }

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  const OUTCOMES = {
    correct: { icon: '🎉', text: 'Richtig geraten!', cls: 'good' },
    wrong: { icon: '😬', text: 'Leider falsch. Die nächste Karte wird zusätzlich abgelegt.', cls: 'bad' },
    pass: { icon: '🤷', text: 'Gepasst. Die Karte ist weg, sonst passiert nichts.', cls: '' },
    skipped: { icon: '⏭', text: 'Der Host hat die Karte übersprungen.', cls: '' },
    lost: { icon: '🗑', text: 'Abgelegt', cls: 'bad' },
  };

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  function amGiver(R) {
    return R.givers.some((g) => g.id === S.me.id);
  }

  const WORD_LEVELS = [['normal', 'Normal'], ['hard', 'Schwer'], ['mixed', 'Gemischt']];

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
        <label class="field"><span>Anzahl Karten (Original: 13)</span>
          <input id="jo-cards" type="number" min="3" max="${S.availableQuestions}" value="${g.cardCount}" inputmode="numeric">
        </label>
        <label class="field"><span>Zeitlimit für Hinweise</span>
          <select id="jo-time">${timeOptions(g.clueTimeLimit)}</select>
        </label>
      </div>
      <label class="field"><span>Begriffe</span>
        <select id="jo-level">${WORD_LEVELS.map(([v, label]) => `<option value="${v}" ${v === (g.wordLevel || 'normal') ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </label>
      <div class="small muted">So geht's: Reihum rät einer. Er wählt eine von vier verdeckten Karten, alle anderen sehen den Begriff und schreiben je ein Wort als Hinweis auf. Gleiche Hinweise, auch mit gleichem Wortstamm, fliegen raus. Ein falscher Rateversuch kostet zusätzlich die nächste Karte, Passen nur die aktuelle. Ihr braucht mindestens 3 Mitspieler.</div>
    </div>`;
  }

  function viewGivers(R) {
    return `<div class="status-bar"><div class="status-team" style="--team:var(--accent)"><b class="small">Hinweise</b>
      ${R.givers.map((g) => avatarHtml(playerById(g.id), `sm ${g.done ? 'voted' : ''}`)).join('')}
      <span class="small muted">${R.givers.filter((g) => g.done).length}/${R.givers.length}</span></div></div>`;
  }

  function viewWord(R) {
    return `<div class="jo-word"><div class="small muted">Der Begriff</div><div class="big">${esc(R.word)}</div></div>`;
  }

  function viewClueList(R, { editable }) {
    if (!R.clues.length) return '<div class="card muted center">Keine Hinweise abgegeben.</div>';
    return `<div class="jo-clues">${R.clues.map((c) => {
      const p = playerById(c.playerId);
      if (c.hidden) return `<div class="jo-clue hidden-clue">${avatarHtml(p, 'sm')}<span class="text">?</span></div>`;
      return `<div class="jo-clue ${c.invalid ? 'invalid' : ''}">
        ${avatarHtml(p, 'sm')}
        <span class="text"><span class="word">${esc(c.text)}</span>${c.invalid && c.reason ? `<span class="reason">${esc(c.reason)}</span>` : ''}</span>
        ${editable ? `<button class="btn small ${c.invalid ? '' : 'ghost'}" data-action="joToggle" data-player="${c.playerId}">${c.invalid ? '↩︎ Zulassen' : '✕ Streichen'}</button>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  function viewPick(R) {
    const name = esc(playerName(R.guesserId));
    if (R.isGuesser) {
      return `<div class="stack center">
        <h2>Du rätst! 🤔</h2>
        <p class="muted">Wähle eine der vier verdeckten Karten. Die anderen sehen dann den Begriff und geben dir Hinweise.</p>
        <div class="jo-pick">${Array.from({ length: R.wordCount }, (_, i) => `<button class="jo-card" data-action="joPick" data-i="${i}">${i + 1}</button>`).join('')}</div>
      </div>`;
    }
    return `<div class="stack center">
      <h2>${name} wählt eine Karte …</h2>
      <div class="jo-pick">${R.words.map((w, i) => `<div class="jo-card open">${i + 1}<span>${esc(w)}</span></div>`).join('')}</div>
    </div>`;
  }

  function viewClues(R) {
    const name = esc(playerName(R.guesserId));
    if (R.isGuesser) {
      return `<div class="stack center"><h2>Die anderen überlegen sich Hinweise für dich …</h2>
        <p class="muted">Du hast Karte ${R.choice + 1} gewählt.</p>${viewGivers(R)}</div>`;
    }
    if (!amGiver(R)) {
      return `<div class="stack">${viewWord(R)}<p class="center muted">Die Mitspieler schreiben ihre Hinweise für ${name}.</p>${viewGivers(R)}</div>`;
    }
    const d = draft();
    return `<div class="stack">
      ${viewWord(R)}
      <form id="jo-clue-form" class="answer-form card">
        <div class="inputs"><input id="jo-clue" type="text" maxlength="30" placeholder="Dein Hinweis für ${name} (ein Wort)" value="${esc(d.clue)}" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <button class="btn primary" type="submit">${R.myClue ? 'Hinweis ändern' : 'Hinweis abgeben'}</button>
        <div class="small ${R.myClue ? '' : 'muted'}">${R.myClue ? `✓ Dein Hinweis: <b>${esc(R.myClue)}</b>. Du kannst ihn ändern, bis alle fertig sind.` : 'Nur ein Wort. Gleiche Hinweise fliegen raus, also sei kreativ!'}</div>
      </form>
      ${viewGivers(R)}
    </div>`;
  }

  function viewCheck(R) {
    const name = esc(playerName(R.guesserId));
    if (R.isGuesser) {
      return `<div class="stack center"><h2>Die anderen prüfen die Hinweise …</h2><p class="muted">Gleich darfst du raten.</p></div>`;
    }
    return `<div class="stack">
      ${viewWord(R)}
      <p class="muted">Doppelte Hinweise und Hinweise zu nah am Begriff sind schon gestrichen. Passt etwas nicht, könnt ihr Hinweise streichen oder wieder zulassen.</p>
      ${viewClueList(R, { editable: true })}
      <button class="btn primary big" data-action="joRelease">Hinweise an ${name} zeigen ▶︎</button>
    </div>`;
  }

  function viewGuess(R) {
    const name = esc(playerName(R.guesserId));
    if (R.isGuesser) {
      const valid = R.clues.filter((c) => !c.hidden && !c.invalid);
      const removed = R.clues.length - valid.length;
      return `<div class="stack">
        <h2 class="center">Was ist der Begriff?</h2>
        ${valid.length ? `<div class="jo-clues big">${valid.map((c) => `<div class="jo-clue">${avatarHtml(playerById(c.playerId), 'sm')}<span class="text">${esc(c.text)}</span></div>`).join('')}</div>` : '<div class="card muted center">Alle Hinweise sind rausgeflogen. Viel Glück!</div>'}
        ${removed ? `<div class="small muted center">${removed} ${removed === 1 ? 'Hinweis wurde' : 'Hinweise wurden'} gestrichen.</div>` : ''}
        <form id="jo-guess-form" class="answer-form card">
          <div class="inputs"><input id="jo-guess" type="text" maxlength="30" placeholder="Deine Lösung" value="${esc(draft().guess)}" autocomplete="off" spellcheck="false"></div>
          <div class="row"><button class="btn primary" type="submit" style="flex:1">Raten</button><button class="btn" type="button" data-action="joPass">Passen</button></div>
        </form>
      </div>`;
    }
    return `<div class="stack">${viewWord(R)}<p class="center muted">${name} rät gerade …</p>${viewClueList(R, { editable: false })}</div>`;
  }

  function viewResult(R) {
    const o = OUTCOMES[R.outcome];
    const name = esc(playerName(R.guesserId));
    const judgeable = S.me.isHost && ['correct', 'wrong'].includes(R.outcome);
    return `<div class="stack">
      <div class="jo-outcome ${o.cls}"><div style="font-size:2.4rem">${o.icon}</div><b>${o.text}</b></div>
      ${viewWord(R)}
      ${R.guess !== null ? `<div class="center">${name} hat <b>„${esc(R.guess)}“</b> geraten.</div>` : ''}
      ${judgeable ? `<div class="row" style="justify-content:center"><span class="small muted">Bewertung korrigieren:</span>
        <span class="toggle"><button class="${R.outcome === 'correct' ? 'on yes' : ''}" data-action="joJudge" data-value="1">✓</button><button class="${R.outcome === 'wrong' ? 'on no' : ''}" data-action="joJudge" data-value="0">✗</button></span></div>` : ''}
      <h3>Die Hinweise</h3>
      ${viewClueList(R, { editable: false })}
    </div>`;
  }

  function viewFinal(R) {
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">💡</div><h1>${R.score} von ${R.totalCards} Karten</h1><p class="muted">${esc(R.verdict)}</p></div>
      <div class="card stack">${R.history.map((h, i) => {
        const o = OUTCOMES[h.outcome] || OUTCOMES.lost;
        return `<div class="row spread"><span><b>${i + 1}.</b> ${h.word ? esc(h.word) : '<span class="muted">abgelegte Karte</span>'}${h.guesserId ? ` <span class="small muted">· ${esc(playerName(h.guesserId))}${h.guess ? ` riet „${esc(h.guess)}“` : ''}</span>` : ''}</span><span>${o.icon}</span></div>`;
      }).join('')}</div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    if (R.phase === 'final') {
      for (const key of Object.keys(joDrafts)) delete joDrafts[key];
      return viewFinal(R);
    }
    const body = { pick: viewPick, clues: viewClues, check: viewCheck, guess: viewGuess, result: viewResult }[R.phase](R);
    const guesser = playerById(R.guesserId);
    return `<div>
      ${R.notice ? `<div class="notice">🗑 ${esc(R.notice)}</div>` : ''}
      <div class="q-head">
        <div class="small muted"><b>Karte ${R.card}/${R.totalCards}</b> · ${R.score} richtig</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      <div class="jo-guesser">${avatarHtml(guesser, 'sm')} <b>${esc(guesser?.name || '?')}</b>&nbsp;${R.isGuesser ? '(du) rätst' : 'rät'}</div>
      ${body}
    </div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'result') {
      const last = R.card >= R.totalCards || (R.outcome === 'wrong' && R.card + 1 >= R.totalCards);
      return `<button class="btn primary" data-action="next">${last ? '🏆 Zum Ergebnis' : 'Nächste Karte ▶︎'}</button>`;
    }
    return '<button class="btn" data-action="joSkip">⏭ Karte überspringen</button>';
  }

  gameViews.justone = { settings: viewSettings, view, hostbar };

  Object.assign(actions, {
    joPick: (el) => act('pick', { index: Number(el.dataset.i) }),
    joToggle: (el) => act('toggle', { playerId: el.dataset.player }),
    joRelease: () => act('release'),
    joPass: () => { if (confirm('Wirklich passen?')) act('guess', { pass: true }); },
    joJudge: (el) => act('judge', { correct: el.dataset.value === '1' }),
    joSkip: () => { if (confirm('Diese Karte überspringen?')) act('skip'); },
  });

  app.addEventListener('input', (e) => {
    if (S?.game.id !== 'justone' || !S.round) return;
    if (e.target.id === 'jo-clue') draft().clue = e.target.value;
    if (e.target.id === 'jo-guess') draft().guess = e.target.value;
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'jo-cards') sendHost('settings', { game: { cardCount: Number(e.target.value) } });
    else if (e.target.id === 'jo-time') sendHost('settings', { game: { clueTimeLimit: Number(e.target.value) } });
    else if (e.target.id === 'jo-level') sendHost('settings', { game: { wordLevel: e.target.value } });
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id === 'jo-clue-form') {
      act('clue', { text: draft().clue });
      document.activeElement?.blur?.();
    } else if (e.target.id === 'jo-guess-form') {
      if (!draft().guess.trim()) return toast('Bitte gib einen Begriff ein.');
      act('guess', { text: draft().guess });
    }
  });
})();
