// Bilder für „Wer ist das?“-Fragen
//
// Der Server holt das Hauptbild des Wikipedia-Artikels und liefert es unter einer
// neutralen Adresse aus. So verrät weder der Dateiname die Lösung, noch blockiert
// Wikimedia das Bild, weil der Browser es direkt einbindet.

const USER_AGENT = 'allFunnGames/1.0 (https://github.com/LuFre136/allFUNnGAMES)';
// Wikimedia liefert Vorschaubilder nur in festen Breiten zuverlässig aus
const STANDARD_WIDTH = 960;

const cache = new Map(); // wiki-Seite -> Promise<{ type, body }>

async function fetchOk(url, accept) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept } });
  if (!res.ok) throw new Error(`${res.status} für ${url}`);
  return res;
}

function candidates(summary) {
  const urls = [];
  const thumb = summary.thumbnail?.source;
  const original = summary.originalimage;
  if (thumb && /\/\d+px-/.test(thumb) && original?.width > STANDARD_WIDTH) {
    urls.push(thumb.replace(/\/\d+px-/, `/${STANDARD_WIDTH}px-`));
  }
  if (original?.source && !/\.svg$/i.test(original.source)) urls.push(original.source);
  if (thumb) urls.push(thumb);
  return [...new Set(urls)];
}

async function load(page) {
  const summary = await (await fetchOk(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`, 'application/json')).json();
  let lastError = new Error('Kein Bild im Artikel');
  for (const url of candidates(summary)) {
    try {
      const res = await fetchOk(url, 'image/*');
      return { type: res.headers.get('content-type') || 'image/jpeg', body: Buffer.from(await res.arrayBuffer()) };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function wikiImage(page) {
  if (!cache.has(page)) {
    const promise = load(page);
    cache.set(page, promise);
    // Fehlschläge nicht dauerhaft merken, damit ein neuer Versuch möglich ist
    promise.catch(() => cache.delete(page));
  }
  return cache.get(page);
}

// Länderflaggen von flagcdn.com (gemeinfrei), z. B. „de“ für Deutschland
function flagImage(code) {
  const key = `flag:${code}`;
  if (!cache.has(key)) {
    const promise = fetchOk(`https://flagcdn.com/w640/${encodeURIComponent(code)}.png`, 'image/*')
      .then(async (res) => ({ type: 'image/png', body: Buffer.from(await res.arrayBuffer()) }));
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

module.exports = { wikiImage, flagImage };
