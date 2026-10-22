// 30-Sekunden-Vorschauen über die öffentliche Deezer-API (ohne Zugangsdaten).
// Ersatz für Songs ohne Spotify-ID. Die Vorschau-Adressen laufen nach einiger Zeit ab,
// deshalb merken wir uns nur die Deezer-Track-ID und holen die Adresse bei jedem Abspielen neu.

const API = 'https://api.deezer.com';
const ids = new Map(); // "interpret - titel" -> Deezer-Track-ID

function key(song) {
  return `${song.artist} - ${song.title}`.toLowerCase();
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Deezer antwortet mit ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Deezer: ${data.error.message || data.error.type}`);
  return data;
}

// Suche nach Hauptinterpret und Titel ohne Klammerzusatz, notfalls als freie Suche
async function search(song) {
  const artist = song.artist.split(/\s+(?:feat\.?|ft\.?|&|x)\s+|,\s*/i)[0];
  const title = song.title.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() || song.title;
  for (const q of [`artist:"${artist}" track:"${title}"`, `${artist} ${title}`]) {
    const data = await getJson(`${API}/search?limit=5&q=${encodeURIComponent(q)}`);
    const hit = (data.data || []).find((t) => t.preview);
    if (hit) return hit;
  }
  return null;
}

async function previewUrl(song) {
  const id = ids.get(key(song));
  if (id) {
    const track = await getJson(`${API}/track/${id}`).catch(() => null);
    if (track?.preview) return track.preview;
  }
  const hit = await search(song);
  if (!hit) return null;
  ids.set(key(song), hit.id);
  return hit.preview;
}

module.exports = { previewUrl };
