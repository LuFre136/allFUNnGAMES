// Songtexte für Karaoke mit Spotify aus LRCLIB (https://lrclib.net), frei und ohne Schlüssel.
// Zeitgestempelte Texte (LRC) laufen auf der Bühne mit, reine Texte scrollen nur.

const BASE = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'all-fun-n-games (https://github.com/LuFre136/allFUNnGAMES)' };
const cache = new Map();

// „[01:02.35] Text“ → { ms: 62350, text: 'Text' }; eine Zeile kann mehrere Zeitstempel haben
function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc ?? '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) lines.push({ ms: Math.round((Number(m[1]) * 60 + Number(m[2].replace(':', '.'))) * 1000), text });
  }
  return lines.sort((a, b) => a.ms - b.ms);
}

// Karaoke-Versionen heißen oft „Song (Karaoke Version) [Originally Performed By X]“
function originalOf(name, artist) {
  const performer = String(name).match(/(?:originally performed by|in the style of|made famous by|as made famous by)\s+([^)\]]+)/i);
  const isCover = /karaoke|instrumental/i.test(name) || /karaoke|sing king/i.test(artist || '');
  const track = String(name)
    .replace(/[([][^)\]]*(?:karaoke|instrumental|originally|in the style|made famous|version|remaster)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:karaoke|instrumental|remaster).*$/i, '')
    .trim();
  return { track, artist: performer ? performer[1].trim() : isCover ? null : artist, isCover };
}

// „ABBA – Mamma Mia (Karaoke)“ → Suchtext ohne Zusätze
function cleanQuery(text) {
  return String(text ?? '').replace(/[([][^)\]]*[)\]]/g, ' ').replace(/[–—-]/g, ' ').replace(/\b(karaoke|instrumental|lyrics?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB antwortet mit ${res.status}`);
  return res.json();
}

function toLyrics(hit) {
  if (!hit || hit.instrumental) return null;
  const synced = parseLrc(hit.syncedLyrics);
  if (synced.length) return { kind: 'synced', lines: synced };
  if (hit.plainLyrics?.trim()) return { kind: 'plain', text: hit.plainLyrics.trim() };
  return null;
}

// Bester Treffer: mit Zeitstempeln vor ohne, bei bekannter Länge der nächstliegende
function best(hits, durationMs) {
  const usable = (hits || []).filter((h) => !h.instrumental && (h.syncedLyrics || h.plainLyrics));
  const dist = (h) => (durationMs ? Math.abs(h.duration * 1000 - durationMs) : 0);
  usable.sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)) || dist(a) - dist(b));
  return usable[0] || null;
}

// info: { title } aus der Warteschlange, dazu optional { name, artist, durationMs } von Spotify
async function find(info) {
  const meta = info.name ? originalOf(info.name, info.artist) : null;
  const key = JSON.stringify([info.title, meta?.track, meta?.artist]);
  if (cache.has(key)) return cache.get(key);
  // Bei Karaoke-Versionen passt die Länge nicht zum Original
  const durationMs = meta && !meta.isCover ? info.durationMs : null;
  let result = null;
  if (meta?.artist && meta.track) {
    const params = new URLSearchParams({ artist_name: meta.artist, track_name: meta.track });
    if (durationMs) params.set('duration', String(Math.round(durationMs / 1000)));
    result = toLyrics(await getJson(`${BASE}/get?${params}`));
  }
  for (const q of [meta?.artist && meta.track ? `${meta.artist} ${meta.track}` : null, cleanQuery(info.title), meta?.track].filter(Boolean)) {
    if (result?.kind === 'synced') break;
    const hit = toLyrics(best(await getJson(`${BASE}/search?q=${encodeURIComponent(q)}`), durationMs));
    if (hit && (!result || hit.kind === 'synced')) result = hit;
  }
  cache.set(key, result);
  return result;
}

module.exports = { find, parseLrc, originalOf, cleanQuery };
