// Startseite: Spieleübersicht und Lobby erstellen

const socket = io();
let selectedGame = null;

async function loadGames() {
  const games = await fetch('/api/games').then((r) => r.json());
  document.getElementById('games').innerHTML = games.map((g) => `
    <button class="card game-card ${g.available ? '' : 'disabled'}" data-game="${esc(g.id)}" ${g.available ? '' : 'disabled'}>
      <div class="row spread">
        <div class="icon">${esc(g.icon)}</div>
        ${g.available ? '<span class="badge live">Spielbar</span>' : '<span class="badge">Bald verfügbar</span>'}
      </div>
      <h3 style="margin-top:8px">${esc(g.name)}</h3>
      <p class="muted" style="margin:0 0 8px">${esc(g.description)}</p>
      ${g.players ? `<div class="small muted">${esc(g.players)}${g.totalQuestions ? ` · ${g.totalQuestions} Fragen` : ''}</div>` : ''}
    </button>`).join('');
  document.querySelectorAll('[data-game]').forEach((el) => {
    el.addEventListener('click', () => openCreate(games.find((g) => g.id === el.dataset.game)));
  });
}

function openCreate(game) {
  if (!game?.available) return;
  selectedGame = game;
  document.getElementById('modal-title').textContent = `${game.icon} ${game.name}: Lobby erstellen`;
  const nameInput = document.getElementById('host-name');
  nameInput.value = store.get('afng:name') || '';
  document.getElementById('modal').classList.remove('hidden');
  nameInput.focus();
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const hostName = document.getElementById('host-name').value.trim();
  if (!hostName) return;
  store.set('afng:name', hostName);
  const res = await emitAck(socket, 'lobby:create', { gameId: selectedGame.id, hostName });
  if (res.error) return toast(res.error);
  store.set(`afng:token:${res.code}`, res.token);
  location.href = `/lobby/${res.code}`;
});

document.getElementById('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code) location.href = `/join/${encodeURIComponent(code)}`;
});

loadGames();
