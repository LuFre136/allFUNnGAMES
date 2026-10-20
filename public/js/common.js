// Gemeinsame Helfer für alle Seiten

const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* privater Modus */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* privater Modus */ }
  },
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(message, ok = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res || {})));
}
