// Durak: Spielansicht für Host und Handys (nutzt die Helfer aus lobby.js)

(() => {
  const DECKS = [36, 52];
  const PARTIEN = [1, 3, 5, 10];
  const TIMES = [0, 20, 30, 60];
  const SUIT = { C: '♣', S: '♠', H: '♥', D: '♦' };
  const SUIT_NAME = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };
  const RANK = { 11: 'B', 12: 'D', 13: 'K', 14: 'A' };
  const dk = {
    selected: null, // angetippte Handkarte
    peek: false, // Host-Gerät: Karten erst zeigen, wenn nur der Host hinschaut
    seen: new Set(), // Karten, die schon auf dem Tisch lagen (neue fliegen herein)
    fresh: new Set(),
  };

  function act(type, data = {}) {
    socket.emit('game:action', { type, ...data }, (res) => {
      if (res?.error) toast(res.error);
    });
  }

  function playerName(id) {
    return playerById(id)?.name || 'Jemand';
  }

  const suitOf = (c) => c[0];
  const rankOf = (c) => Number(c.slice(1));
  const cardName = (c) => `${SUIT[suitOf(c)]}${RANK[rankOf(c)] || rankOf(c)}`;

  function cardHtml(card, { cls = '', attrs = '' } = {}) {
    const s = suitOf(card);
    const label = RANK[rankOf(card)] || rankOf(card);
    const red = s === 'H' || s === 'D';
    const tag = attrs.includes('data-action') ? 'button' : 'span';
    return `<${tag} class="dk-card ${red ? 'red' : ''} ${S.round.trump === s ? 'trump' : ''} ${cls}" ${attrs}>
      <span class="dk-corner">${label}<i>${SUIT[s]}</i></span><span class="dk-mid">${SUIT[s]}</span><span class="dk-corner bottom">${label}<i>${SUIT[s]}</i></span></${tag}>`;
  }

  function backHtml(cls = '') {
    return `<span class="dk-card back ${cls}"></span>`;
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
        <label class="field"><span>Kartenspiel</span>
          <select id="dk-deck">${DECKS.map((n) => `<option value="${n}" ${n === g.deckSize ? 'selected' : ''}>${n} Karten (${n === 36 ? '6 bis Ass, bis 6 Spieler' : '2 bis Ass, bis 8 Spieler'})</option>`).join('')}</select>
        </label>
        <label class="field"><span>Partien</span>
          <select id="dk-partien">${PARTIEN.map((n) => `<option value="${n}" ${n === g.partien ? 'selected' : ''}>${n === 1 ? 'Eine Partie' : `${n} Partien`}</option>`).join('')}</select>
        </label>
        <label class="field"><span>Zeit pro Zug</span>
          <select id="dk-time">${TIMES.map((t) => `<option value="${t}" ${t === g.timeLimit ? 'selected' : ''}>${t ? `${t} Sekunden` : 'Kein Zeitlimit'}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="small muted" style="font-weight:700;margin-bottom:6px">Weiterschieben</div>
        <div class="segmented">
          <button data-action="dkSetting" data-key="transfer" data-value="0" class="${!g.transfer ? 'on' : ''}">Klassisch</button>
          <button data-action="dkSetting" data-key="transfer" data-value="1" class="${g.transfer ? 'on' : ''}">↪️ Mit Weiterschieben</button>
        </div>
      </div>
      <div class="small muted">So geht's: Jeder bekommt sechs Karten, die nächste Karte wird aufgedeckt und ist Trumpf. Der Angreifer spielt eine Karte aus, sein linker Nachbar verteidigt: Er schlägt jede Karte mit einer höheren derselben Farbe oder mit Trumpf. Alle anderen dürfen Karten nachlegen, deren Wert schon auf dem Tisch liegt, höchstens sechs (im ersten Angriff fünf) und nie mehr, als der Verteidiger Karten hat. Ist alles geschlagen, kommen die Karten weg und der Verteidiger greift als Nächster an. Kann oder will er nicht schlagen, nimmt er alles auf und ist übersprungen. Danach ziehen alle auf sechs Karten nach. Ist der Stapel leer, ist raus, wer keine Karten mehr hat. Wer als Letzter Karten hält, ist der Durak.${g.transfer ? ' Weiterschieben: Solange noch nichts geschlagen ist, darf der Verteidiger eine Karte mit demselben Wert dazulegen und den Angriff an seinen linken Nachbarn weitergeben.' : ''} In der nächsten Partie muss der Durak zuerst verteidigen. Wer am Ende am seltensten Durak war, gewinnt.${g.timeLimit ? ' Läuft die Zeit ab, spielt das Spiel die billigste Karte aus, der Verteidiger nimmt auf bzw. wer nachlegen könnte, ist fertig.' : ''}</div>
    </div>`;
  }

  // ---------- Spiel ----------

  function viewPile(R) {
    const talon = R.talon
      ? `<div class="dk-talon">${R.trumpCard ? cardHtml(R.trumpCard, { cls: 'dk-trumpcard' }) : ''}${backHtml('dk-stack')}<b>${R.talon}</b></div>`
      : `<div class="dk-talon empty"><span class="dk-suit ${R.trump === 'H' || R.trump === 'D' ? 'red' : ''}">${SUIT[R.trump]}</span><small>Stapel leer</small></div>`;
    return `<div class="dk-pile">
      <div class="dk-pilebox">${talon}<small>Trumpf: ${SUIT_NAME[R.trump]} ${SUIT[R.trump]}</small></div>
      <div class="dk-pilebox">${R.discard ? `<div class="dk-discard">${backHtml()}<b>${R.discard}</b></div>` : '<div class="dk-discard none"></div>'}<small>Abgelegt</small></div>
    </div>`;
  }

  function myMove(R) {
    return R.moves.find((m) => m.card === dk.selected) || null;
  }

  function viewTable(R) {
    const move = myMove(R);
    const targets = new Set(move ? move.defend : []);
    const pairs = R.table.map((p, i) => {
      const fresh = (c) => (dk.fresh.has(c) ? 'fresh' : '');
      const target = targets.has(i);
      const attrs = target ? `data-action="dkBeat" data-index="${i}"` : '';
      return `<div class="dk-pair ${p.d ? 'beaten' : ''}">
        ${cardHtml(p.a, { cls: `${fresh(p.a)} ${target ? 'target' : ''}`, attrs })}
        ${p.d ? cardHtml(p.d, { cls: `dk-def ${fresh(p.d)}` }) : ''}
      </div>`;
    }).join('');
    const empty = `<div class="dk-empty">${R.table.length ? '' : `${esc(playerName(R.attackerId))} spielt aus …`}</div>`;
    return `<div class="dk-felt">
      ${viewPile(R)}
      <div class="dk-table">${pairs || empty}</div>
      <div class="dk-count small">${R.table.length}/${R.cap} Karten</div>
    </div>`;
  }

  function viewStatus(R) {
    const att = `${avatarHtml(playerById(R.attackerId), 'sm')} <b>${esc(playerName(R.attackerId))}</b>`;
    const def = `${avatarHtml(playerById(R.defenderId), 'sm')} <b>${esc(playerName(R.defenderId))}</b>`;
    const undefended = R.table.filter((p) => !p.d).length;
    let text;
    if (!R.table.length) text = `${att} greift ${def} an`;
    else if (R.taking) text = `${def} nimmt auf. Wer will, legt noch nach.`;
    else if (undefended) text = `${def} muss schlagen (${undefended} offen)`;
    else text = `${def} hat alles geschlagen. Noch nachlegen?`;
    const meDef = R.mine && S.me.id === R.defenderId;
    return `<div class="dk-status ${meDef && !R.taking && undefended ? 'mine' : ''}">⚔️ ${text}</div>`;
  }

  function viewActions(R) {
    if (!R.mine) return '';
    const me = S.me.id;
    const move = myMove(R);
    const buttons = [];
    if (move?.attack) buttons.push(`<button class="btn primary big" data-action="dkAttack">▶︎ ${cardName(move.card)} ${R.table.length ? 'nachlegen' : 'ausspielen'}</button>`);
    if (move?.defend.length === 1) {
      buttons.push(`<button class="btn primary big" data-action="dkBeat" data-index="${move.defend[0]}">🛡️ ${cardName(move.card)} auf ${cardName(R.table[move.defend[0]].a)}</button>`);
    }
    if (move?.transfer) buttons.push(`<button class="btn big" data-action="dkTransfer">↪️ Weiterschieben an ${esc(playerName(nextAfter(R, me)))}</button>`);
    if (R.canTake) buttons.push('<button class="btn pink big" data-action="dkTake">🙈 Aufnehmen</button>');
    if (R.canPass) buttons.push(`<button class="btn big" data-action="dkPass">✋ ${R.taking ? 'Nichts mehr dazu' : 'Fertig, nichts mehr'}</button>`);

    let hint = '';
    if (move?.defend.length > 1) hint = 'Tippe auf die Karte auf dem Tisch, die du schlagen willst.';
    else if (!R.table.length && me === R.attackerId) hint = 'Du greifst an: tippe eine Karte und spiel sie aus.';
    else if (me === R.defenderId && R.canTake) hint = R.moves.some((m) => m.defend.length || m.transfer) ? 'Tippe eine Karte zum Schlagen oder nimm alles auf.' : 'Du kannst nicht schlagen. Nimm alles auf.';
    else if (me === R.defenderId && R.taking) hint = 'Du nimmst auf. Die anderen dürfen noch nachlegen.';
    else if (me === R.defenderId) hint = 'Alles geschlagen! Warte, ob noch jemand nachlegt.';
    else if (R.passed.includes(me)) hint = 'Du bist fertig. Kommt eine neue Karte auf den Tisch, darfst du wieder nachlegen.';
    else if (R.table.length && !R.moves.some((m) => m.attack)) hint = 'Du hast nichts zum Nachlegen.';
    else if (R.table.length) hint = 'Du darfst Karten mit Werten vom Tisch nachlegen.';
    else hint = `${esc(playerName(R.attackerId))} spielt aus.`;
    return `<div class="dk-actions">${buttons.join('')}<div class="small muted center">${hint}</div></div>`;
  }

  function nextAfter(R, id) {
    const seats = R.players.filter((p) => !p.out || p.id === id);
    const i = seats.findIndex((p) => p.id === id);
    return seats[(i + 1) % seats.length]?.id;
  }

  function viewHand(R) {
    if (!R.inGame) return S.me.isHost && !S.settings.hostPlays ? '' : '<div class="muted center small">Du spielst ab der nächsten Partie mit.</div>';
    const me = R.players.find((p) => p.id === S.me.id);
    if (me?.out) return `<div class="dk-done">🎉 Du hast keine Karten mehr${me.place ? ` (Platz ${me.place})` : ''}. Schau zu, wer der Durak wird!</div>`;
    if (!R.moves.length) return '';
    // Auf dem Fernseher bleiben die Karten verdeckt, bis der Host allein hinschaut
    const covered = S.me.isHost && !dk.peek;
    const cards = covered
      ? R.moves.map(() => backHtml()).join('')
      : R.moves.map((m) => {
        const legal = m.attack || m.defend.length || m.transfer;
        const cls = [legal ? 'ok' : 'dim', m.card === dk.selected ? 'on' : ''].join(' ');
        return cardHtml(m.card, { cls, attrs: `data-action="dkPick" data-card="${m.card}"` });
      }).join('');
    return `<div class="dk-handbox">
      <div class="dk-hand ${covered ? 'covered' : ''}">${cards}</div>
      ${S.me.isHost ? `<button class="btn small dk-peek" data-action="dkPeek">${dk.peek ? '🙈 Karten verdecken' : '👀 Meine Karten ansehen'}</button>` : ''}
    </div>`;
  }

  function viewPlayers(R) {
    return `<div class="dk-players">${R.players.map((p) => {
      const player = playerById(p.id);
      const role = p.id === R.attackerId ? '⚔️' : p.id === R.defenderId ? '🛡️' : '';
      const cls = [
        p.id === R.defenderId ? 'def' : '', p.id === R.attackerId ? 'att' : '', p.out ? 'out' : '',
        p.id === S.me.id ? 'me' : '', player?.connected === false ? 'offline' : '', R.waiting.includes(p.id) ? 'waiting' : '',
      ].join(' ');
      const fan = Array.from({ length: Math.min(p.cards, 8) }, () => '<span></span>').join('');
      return `<div class="dk-player ${cls}">${avatarHtml(player, 'sm')}<div class="dk-pname">${role} ${esc(player?.name || '?')}</div>
        <div class="dk-mini">${p.out ? `🎉 Platz ${p.place}` : `<span class="dk-fan">${fan}</span> ${p.cards}`}${R.passed.includes(p.id) ? ' ✋' : ''}</div></div>`;
    }).join('')}</div>`;
  }

  function viewLog(R) {
    if (!R.log.length) return '';
    return `<div class="dk-log">${[...R.log].reverse().slice(0, 4).map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
  }

  function viewPlaying(R) {
    return `<div class="stack dk ${S.me.isHost ? 'dk-tv' : ''}">
      <div class="q-head">
        <div class="small muted"><b>Durak</b> · Partie ${R.partieNo}${R.partien > 1 ? ` von ${R.partien}` : ''}${R.transferRule ? ' · mit Weiterschieben' : ''}</div>
        ${R.deadline ? '<span class="timer" id="timer"></span>' : ''}
      </div>
      ${viewStatus(R)}
      ${viewTable(R)}
      ${viewActions(R)}
      ${viewHand(R)}
      ${viewPlayers(R)}
      ${viewLog(R)}
    </div>`;
  }

  function viewScoreboard(R) {
    const best = R.scoreboard.length ? R.scoreboard[0].durak : 0;
    return `<div class="card stack">
      <h3 style="margin:0">Wie oft Durak</h3>
      ${R.scoreboard.map((s, i) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${s.durak === best ? '👑' : `${i + 1}.`}</span>${avatarHtml(playerById(s.id), 'sm')}
        <span class="name">${esc(playerName(s.id))}</span><span class="small muted">${s.durak ? '🤡'.repeat(Math.min(s.durak, 5)) + (s.durak > 5 ? ` ${s.durak}×` : '') : 'nie'}</span></div>`).join('')}
    </div>`;
  }

  function viewDurak(R) {
    if (!R.durakId) return '<div class="center"><div style="font-size:3rem">🤝</div><h1>Unentschieden!</h1><div class="muted">Die letzten Karten gingen gleichzeitig weg, diesmal gibt es keinen Durak.</div></div>';
    return `<div class="center stack dk-fool">
      <div>${avatarHtml(playerById(R.durakId))}</div>
      <h1>🤡 ${esc(playerName(R.durakId))} ist der Durak!</h1>
      ${R.durakHand?.length ? `<div class="dk-hand small">${R.durakHand.map((c) => cardHtml(c)).join('')}</div>` : ''}
    </div>`;
  }

  function viewOver(R, final = false) {
    const ranking = R.ranking.filter((id) => id !== R.durakId);
    return `<div class="stack">
      ${viewDurak(R)}
      ${ranking.length ? `<div class="card stack">
        <h3 style="margin:0">Partie ${R.partieNo}${R.partien > 1 ? ` von ${R.partien}` : ''}</h3>
        ${ranking.map((id, i) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${i + 1}.</span>${avatarHtml(playerById(id), 'sm')}
          <span class="name">${esc(playerName(id))}</span></div>`).join('')}
      </div>` : ''}
      ${R.partien > 1 ? viewScoreboard(R) : ''}
      ${S.me.isHost ? '' : `<div class="muted center">${final ? 'Der Host kann eine neue Runde starten.' : 'Gleich startet der Host die nächste Partie.'}</div>`}
    </div>`;
  }

  function viewFinal(R) {
    if (R.partien === 1) {
      return viewOver(R, true);
    }
    const best = R.scoreboard[0].durak;
    const winners = R.scoreboard.filter((s) => s.durak === best).map((s) => esc(playerName(s.id)));
    return `<div class="stack">
      <div class="center"><div style="font-size:3rem">🏆</div><h1>${winners.join(' und ')} ${winners.length > 1 ? 'gewinnen' : 'gewinnt'}!</h1>
        <div class="muted">${best ? `Nur ${best}× Durak gewesen.` : 'Kein einziges Mal Durak gewesen.'}</div></div>
      ${viewDurak(R)}
      ${viewScoreboard(R)}
      <div class="card stack">
        <h3 style="margin:0">Alle Partien</h3>
        ${R.results.map((r) => `<div class="score-row" style="--team:var(--accent)"><span class="rank">${r.partie}.</span>
          <span class="name">${r.durakId ? `🤡 ${esc(playerName(r.durakId))}` : '🤝 Unentschieden'}</span></div>`).join('')}
      </div>
      ${S.me.isHost ? '' : '<div class="muted center">Der Host kann eine neue Runde starten.</div>'}
    </div>`;
  }

  function view() {
    const R = S.round;
    // Neue Karten auf dem Tisch fliegen einmal herein
    const onTable = R.table.flatMap((p) => (p.d ? [p.a, p.d] : [p.a]));
    dk.fresh = new Set(onTable.filter((c) => !dk.seen.has(c)));
    dk.seen = new Set(onTable);
    if (dk.selected && !R.moves.some((m) => m.card === dk.selected && (m.attack || m.defend.length || m.transfer))) dk.selected = null;
    if (R.phase === 'final') return viewFinal(R);
    if (R.phase === 'over') return viewOver(R);
    return viewPlaying(R);
  }

  function hostbar() {
    const R = S.round;
    if (R.phase === 'final') return '<button class="btn primary" data-action="toLobby">Neue Runde (zur Lobby)</button>';
    if (R.phase === 'over') return '<button class="btn primary" data-action="dkNext">▶︎ Nächste Partie</button>';
    return '<button class="btn" data-action="dkForce">⏩ Weiter</button>';
  }

  gameViews.durak = { settings: viewSettings, view, hostbar };

  function playSelected(type, data = {}) {
    const card = dk.selected;
    dk.selected = null;
    act(type, { card, ...data });
  }

  Object.assign(actions, {
    dkSetting: (el) => sendHost('settings', { game: { [el.dataset.key]: el.dataset.value === '1' } }),
    dkPick: (el) => {
      const card = el.dataset.card;
      const move = S.round.moves.find((m) => m.card === card);
      if (!move || !(move.attack || move.defend.length || move.transfer)) {
        dk.selected = null;
        render();
        return;
      }
      // Zweimal tippen spielt die Karte, wenn es nur einen Zug damit gibt
      if (dk.selected === card) {
        const options = (move.attack ? 1 : 0) + move.defend.length + (move.transfer ? 1 : 0);
        if (options === 1) {
          if (move.attack) return playSelected('attack');
          if (move.defend.length) return playSelected('defend', { index: move.defend[0] });
          return playSelected('transfer');
        }
      }
      dk.selected = dk.selected === card ? null : card;
      render();
    },
    dkAttack: () => playSelected('attack'),
    dkBeat: (el) => playSelected('defend', { index: Number(el.dataset.index) }),
    dkTransfer: () => playSelected('transfer'),
    dkTake: () => { dk.selected = null; act('take'); },
    dkPass: () => { dk.selected = null; act('pass'); },
    dkPeek: () => { dk.peek = !dk.peek; dk.selected = null; render(); },
    dkNext: () => act('nextPartie'),
    dkForce: () => {
      const R = S.round;
      const undefended = R.table.filter((p) => !p.d).length;
      const what = !R.table.length
        ? `Für ${playerName(R.attackerId)} die billigste Karte ausspielen?`
        : !R.taking && undefended ? `${playerName(R.defenderId)} nimmt auf?` : 'Keiner legt mehr nach, weiter?';
      if (confirm(what)) act('force');
    },
  });

  app.addEventListener('change', (e) => {
    if (S?.game.id !== 'durak') return;
    if (e.target.id === 'dk-deck') sendHost('settings', { game: { deckSize: Number(e.target.value) } });
    else if (e.target.id === 'dk-partien') sendHost('settings', { game: { partien: Number(e.target.value) } });
    else if (e.target.id === 'dk-time') sendHost('settings', { game: { timeLimit: Number(e.target.value) } });
  });
})();
