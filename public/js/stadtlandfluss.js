// Stadt, Land, Fluss: Einstellungen und Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const SEND_DELAY_MS = 350;
  const pending = {}; // Feld -> Text, solange der Server ihn noch nicht bestätigt hat
  const sendTimers = {};
  let pendingRound = null;
  let newCategory = '';

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  // Eingaben gehören zur Runde; bei einer neuen Runde fangen alle Felder leer an
  function syncPending(R) {
    const key = `${R.round}:${R.letter}`;
    if (pendingRound !== key) {
      pendingRound = key;
      for (const i of Object.keys(pending)) delete pending[i];
    }
    if (!R.myAnswers) return;
    for (const i of Object.keys(pending)) {
      if (R.myAnswers[i] === pending[i].trim().replace(/\s+/g, ' ') && !sendTimers[i]) delete pending[i];
    }
  }

  function answerValue(R, i) {
    return pending[i] ?? R.myAnswers?.[i] ?? '';
  }

  function sendAnswer(i) {
    clearTimeout(sendTimers[i]);
    delete sendTimers[i];
    if (pending[i] === undefined) return;
    act('answer', { index: i, text: pending[i] });
  }

  // ---------- Namen der Blätter (Spieler oder Team) ----------

  function sheetLabel(R, key, { withAvatar = true } = {}) {
    if (R.teamMode) {
      const t = teamById(key);
      return `<span class="slf-who"><span class="team-dot" style="--team:${t?.color || 'var(--line)'}"></span>${esc(t?.name || 'Team')}</span>`;
    }
    const p = playerById(key);
    return `<span class="slf-who">${withAvatar ? avatarHtml(p, 'sm') : ''}${esc(p?.name || 'Jemand')}${key === S.me.id ? ' <span class="muted">(du)</span>' : ''}</span>`;
  }

  function sheetColor(R, key) {
    return R.teamMode ? teamById(key)?.color || 'var(--line)' : 'var(--accent)';
  }

  // ---------- Einstellungen ----------

  function viewSettings() {
    const s = S.settings;
    const g = s.game;
    const meta = S.game;
    const active = new Set(g.categories.map((c) => c.toLowerCase()));
    const suggestions = meta.suggestions.filter((c) => !active.has(c.toLowerCase()));
    const full = g.categories.length >= meta.maxCategories;
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
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Spielmodus</div>
        <div class="segmented">
          <button data-action="slfTeamMode" data-value="0" class="${!g.teamMode ? 'on' : ''}">🙋 Jeder für sich</button>
          <button data-action="slfTeamMode" data-value="1" class="${g.teamMode ? 'on' : ''}">👥 In Teams</button>
        </div>
      </div>
      <div class="stack" style="gap:8px">
        <div class="small muted" style="font-weight:700">Kategorien (${g.categories.length}/${meta.maxCategories})</div>
        <div class="chips">${g.categories.map((c, i) => `<button class="chip on" data-action="slfRemoveCat" data-i="${i}" title="Entfernen">${esc(c)} ✕</button>`).join('') || '<span class="small" style="color:var(--bad);font-weight:800">Bitte mindestens eine Kategorie wählen.</span>'}</div>
        <form id="slf-cat-form" class="row">
          <input id="slf-new-cat" type="text" maxlength="24" placeholder="Eigene Kategorie, z. B. Tier" value="${esc(newCategory)}" style="flex:1;min-width:160px" ${full ? 'disabled' : ''}>
          <button class="btn small" type="submit" ${full ? 'disabled' : ''}>+ Hinzufügen</button>
        </form>
        ${suggestions.length && !full ? `<div class="small muted">Vorschläge zum Antippen:</div>
          <div class="chips">${suggestions.map((c) => `<button class="chip" data-action="slfAddCat" data-cat="${esc(c)}">+ ${esc(c)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="grid-2" style="gap:12px">
        <label class="field"><span>Anzahl Runden</span>
          <input id="slf-rounds" type="number" min="1" max="${Math.max(1, S.availableQuestions)}" value="${Math.min(g.rounds, Math.max(1, S.availableQuestions))}" inputmode="numeric">
        </label>
        <label class="field"><span>Zeitlimit pro Runde</span>
          <select id="slf-time">${timeOptions(g.timeLimit)}</select>
        </label>
      </div>
      <div class="grid-2" style="gap:12px">
        <div>
          <div class="small muted" style="font-weight:700;margin-bottom:6px">Stopp-Knopf</div>
          <div class="segmented">
            <button data-action="slfStopEnabled" data-value="1" class="${g.stopEnabled ? 'on' : ''}">✋ An</button>
            <button data-action="slfStopEnabled" data-value="0" class="${!g.stopEnabled ? 'on' : ''}">Aus</button>
          </div>
        </div>
        ${g.stopEnabled ? `<label class="field"><span>Restzeit nach Stopp</span>
          <select id="slf-grace">${meta.stopGrace.map((t) => `<option value="${t}" ${t === g.stopGrace ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Sofort vorbei'}</option>`).join('')}</select>
        </label>` : ''}
      </div>
      <div class="stack" style="gap:8px">
        <div class="row spread"><span class="small muted" style="font-weight:700">Buchstaben (${g.letters.length})</span>
          <span class="row" style="gap:6px"><button class="btn small ghost" data-action="slfLetters" data-set="all">Alle</button><button class="btn small ghost" data-action="slfLetters" data-set="default">Ohne Q, X, Y</button></span></div>
        <div class="slf-letters">${meta.allLetters.map((l) => `<button class="chip ${g.letters.includes(l) ? 'on' : ''}" data-action="slfToggleLetter" data-letter="${l}">${l}</button>`).join('')}</div>
      </div>
      <div class="small muted">So geht's: Pro Runde wird ein Buchstabe gezogen. Alle füllen zu jeder Kategorie einen Begriff mit diesem Anfangsbuchstaben aus. Wer alles hat, ruft Stopp, dann bleibt den anderen nur noch die Restzeit. Danach prüft ihr gemeinsam: Zweifelt die Mehrheit der anderen eine Antwort an, zählt sie nicht. Punkte: ${meta.points.alone} wenn nur du in der Kategorie eine gültige Antwort hast, ${meta.points.unique} für eine Antwort, die sonst niemand hat, ${meta.points.shared} wenn jemand dasselbe hat.</div>
    </div>`;
  }

  // ---------- Spielansicht ----------

  function viewHead(R, extra = '') {
    return `<div class="q-head">
      <div class="small muted"><b>Runde ${R.round}/${R.totalRounds}</b>${extra}</div>
      ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
    </div>`;
  }

  function viewLetter(R) {
    return `<div class="stack center">
      ${viewHead(R)}
      <h2>Der Buchstabe wird gezogen …</h2>
      <div class="slf-letter rolling" id="slf-roll">?</div>
    </div>`;
  }

  function viewProgress(R) {
    return `<div class="status-bar">${R.sheets.map((sh) => `<div class="status-team" style="--team:${sheetColor(R, sh.key)}">
      ${sheetLabel(R, sh.key)}<span class="small muted">${sh.filled}/${R.categories.length}</span></div>`).join('')}</div>`;
  }

  function viewNoSheet() {
    if (isGamemaster()) return '';
    if (S.usesTeams && !S.me.teamId) {
      return `<div class="card stack center"><b>Tritt einem Team bei, um mitzuschreiben:</b>
        <div class="row" style="justify-content:center">${S.teams.map((t) => `<button class="btn small" style="border-color:${t.color}" data-action="pickTeam" data-team="${t.id}">${esc(t.name)}</button>`).join('')}</div></div>`;
    }
    return '';
  }

  function viewWrite(R) {
    const stopper = R.stoppedBy ? playerById(R.stoppedBy) : null;
    const stopBanner = stopper ? `<div class="notice">✋ ${esc(stopper.name)} hat Stopp gerufen!${R.deadline ? ' Schnell noch fertig schreiben.' : ''}</div>` : '';
    const letterBox = `<div class="slf-letter">${esc(R.letter)}</div>`;
    if (!R.mySheet) {
      return `<div class="stack">${viewHead(R)}${stopBanner}${letterBox}${viewNoSheet()}
        <p class="center muted">Alle schreiben gerade.</p>${viewProgress(R)}</div>`;
    }
    const allFilled = R.categories.every((_, i) => answerValue(R, i).trim());
    return `<div class="stack">
      ${viewHead(R, R.teamMode ? ` · ${sheetLabel(R, R.mySheet)}` : '')}
      ${stopBanner}
      ${letterBox}
      <form id="slf-form" class="card stack slf-form" autocomplete="off">
        ${R.categories.map((c, i) => {
          const v = answerValue(R, i);
          const wrong = v.trim() && !startsWith(v, R.letter);
          return `<label class="field"><span>${esc(c)}</span>
            <input id="slf-a-${i}" data-i="${i}" type="text" maxlength="40" placeholder="${esc(R.letter)} …" value="${esc(v)}" autocapitalize="words" spellcheck="false" enterkeyhint="${i + 1 < R.categories.length ? 'next' : 'done'}" class="${wrong ? 'slf-wrong' : ''}">
          </label>`;
        }).join('')}
        ${R.stopEnabled && !R.stoppedBy ? `<button class="btn pink big" type="button" data-action="slfStop" ${allFilled ? '' : 'disabled'}>✋ Stopp!</button>
          <div class="small muted center">${allFilled ? 'Alles ausgefüllt. Ruf Stopp, dann haben die anderen nur noch die Restzeit.' : 'Wenn alle Felder ausgefüllt sind, kannst du Stopp rufen.'}</div>` : ''}
        ${R.teamMode ? '<div class="small muted">Euer Team füllt dieses Blatt gemeinsam aus. Änderungen sehen alle Teammitglieder sofort.</div>' : ''}
      </form>
      ${viewProgress(R)}
    </div>`;
  }

  // Gleiche Regel wie auf dem Server: Umlaute zählen als Grundvokal
  function startsWith(text, letter) {
    const first = String(text).trim().toLowerCase().replace(/^ä/, 'a').replace(/^ö/, 'o').replace(/^ü/, 'u')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[^a-z0-9]+/, '')[0];
    return first === letter.toLowerCase();
  }

  const AUTO_REASONS = { empty: 'Leer', letter: 'Falscher Buchstabe' };

  function entryStatus(e) {
    if (e.valid) return `<span class="slf-pts good">${e.points}</span>`;
    let reason = AUTO_REASONS[e.auto] || 'Abgelehnt';
    if (e.override === false) reason = 'Vom Host abgelehnt';
    return `<span class="slf-pts bad" title="${esc(reason)}">0</span>`;
  }

  function entryNote(e) {
    const notes = [];
    if (e.auto && e.text && e.override !== true) notes.push(AUTO_REASONS[e.auto]);
    if (e.override === true) notes.push('Vom Host zugelassen');
    if (e.override === false) notes.push('Vom Host abgelehnt');
    if (e.valid && e.duplicate) notes.push('Doppelt');
    return notes.length ? `<span class="reason">${notes.join(' · ')}</span>` : '';
  }

  function viewCheck(R) {
    const cat = R.categories[R.checkIndex];
    const host = S.me.isHost;
    return `<div class="stack">
      ${viewHead(R, ` · Buchstabe <b>${esc(R.letter)}</b>`)}
      <div class="slf-cat-head"><span class="small muted">Kategorie ${R.checkIndex + 1}/${R.categories.length}</span><h2>${esc(cat)}</h2></div>
      <p class="small muted">Passt eine Antwort nicht? Tippe auf 👎. Zweifelt die Mehrheit der anderen sie an, gibt es dafür keine Punkte.${host ? ' Als Host kannst du jede Antwort mit ✓ oder ✗ fest entscheiden.' : ''}</p>
      <div class="slf-entries">${R.entries.map((e) => {
        const own = e.key === R.mySheet;
        const canChallenge = R.mySheet && !own && e.text && !e.auto;
        return `<div class="slf-entry ${e.valid ? '' : 'invalid'}" style="--team:${sheetColor(R, e.key)}">
          <div class="who">${sheetLabel(R, e.key)}</div>
          <div class="text"><span class="word">${e.text ? esc(e.text) : '<span class="muted">–</span>'}</span>${entryNote(e)}</div>
          <div class="row" style="gap:6px;flex-wrap:nowrap">
            ${e.text && !e.auto ? `<span class="small muted" title="Anzweifelungen">👎 ${e.challengers.length}/${e.voters}</span>` : ''}
            ${canChallenge ? `<button class="btn small ${e.challenged ? 'pink' : 'ghost'}" data-action="slfChallenge" data-sheet="${esc(e.key)}" title="Anzweifeln">👎</button>` : ''}
            ${host && e.text ? `<span class="toggle"><button class="${e.override === true ? 'on yes' : ''}" data-action="slfOverride" data-sheet="${esc(e.key)}" data-value="1" title="Zulassen">✓</button><button class="${e.override === false ? 'on no' : ''}" data-action="slfOverride" data-sheet="${esc(e.key)}" data-value="0" title="Ablehnen">✗</button></span>` : ''}
            ${entryStatus(e)}
          </div>
        </div>`;
      }).join('')}</div>
      ${host ? '' : '<div class="small muted center">Der Host geht zur nächsten Kategorie weiter.</div>'}
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
      const plus = roundPoints && roundPoints[row.key] !== undefined ? `<span class="small muted">+${roundPoints[row.key]}</span>` : '';
      return `<div class="score-row" style="--team:${sheetColor(R, row.key)}"><span class="rank">${rank}.</span><span class="name">${sheetLabel(R, row.key)}</span>${plus}<span class="pts">${row.pts}</span></div>`;
    }).join('')}</div>`;
  }

  function viewTable(R) {
    const keys = R.table[0]?.map((e) => e.key) || [];
    return `<div class="slf-table-wrap"><table class="slf-table">
      <thead><tr><th></th>${R.categories.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Σ</th></tr></thead>
      <tbody>${keys.map((key, k) => `<tr>
        <th>${sheetLabel(R, key)}</th>
        ${R.table.map((col) => {
          const e = col[k];
          return `<td class="${e.valid ? '' : 'invalid'}"><span class="word">${e.text ? esc(e.text) : '–'}</span><span class="slf-pts ${e.valid ? 'good' : 'bad'}">${e.points}</span></td>`;
        }).join('')}
        <td><b>${R.roundPoints[key] ?? 0}</b></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function viewScores(R) {
    return `<div class="stack">
      ${viewHead(R, ` · Buchstabe <b>${esc(R.letter)}</b>`)}
      <h2>Punkte dieser Runde</h2>
      ${viewTable(R)}
      <h3>Gesamtstand</h3>
      ${viewRanking(R, R.roundPoints)}
      ${S.me.isHost ? '' : '<div class="small muted center">Der Host startet die nächste Runde.</div>'}
    </div>`;
  }

  function viewFinal(R) {
    const ranked = ranking(R);
    const top = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
    const heights = { 0: 140, 1: 100, 2: 70 };
    const tie = ranked[1] && ranked[1].pts === ranked[0].pts;
    const winner = ranked[0] ? (R.teamMode ? teamById(ranked[0].key)?.name : playerById(ranked[0].key)?.name) : null;
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${!winner ? 'Spiel beendet' : tie ? 'Unentschieden!' : `${esc(winner)} gewinnt!`}</h1>
        <p class="muted">Gespielte Buchstaben: ${R.history.map((h) => esc(h.letter)).join(', ')}</p></div>
      <div class="podium">${top.map((row) => {
        const place = ranked.filter((o) => o.pts > row.pts).length;
        return `<div class="step"><b>${sheetLabel(R, row.key)}</b><div class="small muted">${row.pts} Punkte</div>
          <div class="block" style="--team:${R.teamMode ? sheetColor(R, row.key) : 'var(--pink)'};height:${heights[place] ?? 70}px">${place + 1}</div></div>`;
      }).join('')}</div>
      ${viewRanking(R)}
      <details class="card"><summary>Letzte Runde (${esc(R.letter)})</summary><div style="margin-top:12px">${viewTable(R)}</div></details>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    syncPending(R);
    const body = { letter: viewLetter, write: viewWrite, check: viewCheck, scores: viewScores, final: viewFinal }[R.phase];
    return `<div>${body(R)}</div>`;
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'letter' || R.phase === 'write') return '<button class="btn pink" data-action="slfEndWrite">⏭ Runde beenden</button>';
    if (R.phase === 'check') {
      const last = R.checkIndex + 1 >= R.categories.length;
      return `${R.checkIndex > 0 ? '<button class="btn" data-action="slfCheckPrev">◀︎</button>' : ''}
        <button class="btn primary" data-action="slfCheckNext">${last ? 'Punkte zeigen ▶︎' : 'Nächste Kategorie ▶︎'}</button>`;
    }
    const last = R.round >= R.totalRounds;
    return `<button class="btn primary" data-action="slfNext">${last ? '🏆 Zum Ergebnis' : 'Nächste Runde ▶︎'}</button>`;
  }

  gameViews.stadtlandfluss = { settings: viewSettings, view, hostbar };

  // ---------- Eingaben ----------

  function setGame(patch) {
    sendHost('settings', { game: patch });
  }

  function addCategory(name) {
    const text = String(name || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const cats = S.settings.game.categories;
    if (cats.some((c) => c.toLowerCase() === text.toLowerCase())) return toast('Diese Kategorie gibt es schon.');
    if (cats.length >= S.game.maxCategories) return toast(`Höchstens ${S.game.maxCategories} Kategorien.`);
    setGame({ categories: [...cats, text] });
  }

  Object.assign(actions, {
    slfTeamMode: (el) => setGame({ teamMode: el.dataset.value === '1' }),
    slfStopEnabled: (el) => setGame({ stopEnabled: el.dataset.value === '1' }),
    slfAddCat: (el) => addCategory(el.dataset.cat),
    slfRemoveCat: (el) => setGame({ categories: S.settings.game.categories.filter((_, i) => i !== Number(el.dataset.i)) }),
    slfToggleLetter: (el) => {
      const letters = new Set(S.settings.game.letters);
      if (letters.has(el.dataset.letter)) letters.delete(el.dataset.letter);
      else letters.add(el.dataset.letter);
      setGame({ letters: [...letters] });
    },
    slfLetters: (el) => setGame({ letters: el.dataset.set === 'all' ? S.game.allLetters : S.game.allLetters.filter((l) => !'QXY'.includes(l)) }),
    slfStop: () => {
      const R = S.round;
      for (const i of Object.keys(sendTimers)) { clearTimeout(sendTimers[i]); delete sendTimers[i]; }
      act('stop', { answers: R.categories.map((_, i) => answerValue(R, i)) });
    },
    slfChallenge: (el) => act('challenge', { category: S.round.checkIndex, sheet: el.dataset.sheet }),
    slfOverride: (el) => act('override', { category: S.round.checkIndex, sheet: el.dataset.sheet, valid: el.dataset.value === '1' }),
    slfEndWrite: () => { if (confirm('Runde jetzt beenden? Alle Antworten werden so übernommen, wie sie gerade sind.')) act('endWrite'); },
    slfCheckNext: () => act('checkNext'),
    slfCheckPrev: () => act('checkPrev'),
    slfNext: () => act('next'),
  });

  app.addEventListener('input', (e) => {
    if (S?.game.id !== 'stadtlandfluss') return;
    if (e.target.id === 'slf-new-cat') {
      newCategory = e.target.value;
      return;
    }
    if (!e.target.id?.startsWith('slf-a-') || S.round?.phase !== 'write') return;
    const i = Number(e.target.dataset.i);
    pending[i] = e.target.value;
    e.target.classList.toggle('slf-wrong', Boolean(e.target.value.trim()) && !startsWith(e.target.value, S.round.letter));
    clearTimeout(sendTimers[i]);
    sendTimers[i] = setTimeout(() => sendAnswer(i), SEND_DELAY_MS);
    // Stopp-Knopf sofort freischalten, ohne auf den Server zu warten
    const stopBtn = app.querySelector('[data-action="slfStop"]');
    if (stopBtn) stopBtn.disabled = !S.round.categories.every((_, k) => answerValue(S.round, k).trim());
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'stadtlandfluss') return;
    if (e.target.id?.startsWith('slf-a-')) sendAnswer(Number(e.target.dataset.i));
    else if (e.target.id === 'slf-rounds') setGame({ rounds: Number(e.target.value) });
    else if (e.target.id === 'slf-time') setGame({ timeLimit: Number(e.target.value) });
    else if (e.target.id === 'slf-grace') setGame({ stopGrace: Number(e.target.value) });
  });

  // Enter springt zum nächsten Feld
  app.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.id?.startsWith('slf-a-')) return;
    e.preventDefault();
    const next = document.getElementById(`slf-a-${Number(e.target.dataset.i) + 1}`);
    if (next) next.focus();
    else e.target.blur();
  });

  app.addEventListener('submit', (e) => {
    if (e.target.id === 'slf-cat-form') {
      addCategory(newCategory);
      newCategory = '';
      const input = document.getElementById('slf-new-cat');
      if (input) input.value = '';
    }
  });

  // Rollende Buchstaben, solange gezogen wird
  setInterval(() => {
    const el = document.getElementById('slf-roll');
    if (!el) return;
    const letters = S?.settings.game.letters?.length ? S.settings.game.letters : ['A', 'B', 'C'];
    el.textContent = letters[Math.floor(Math.random() * letters.length)];
  }, 90);
})();
