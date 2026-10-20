// YouTube-Hilfen für Karaoke: Suche (nur mit YOUTUBE_API_KEY) und Videotitel über oEmbed (ohne Schlüssel)

const TIMEOUT_MS = 6000;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Die Such-API liefert Titel mit HTML-Entitäten (z. B. &amp;)
function decode(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function enabled() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

// Sucht einbettbare Videos, „Karaoke“ wird angehängt, falls es nicht schon in der Suche steht
async function search(query) {
  const q = /karaoke/i.test(query) ? query : `${query} karaoke`;
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '8',
    q,
    key: process.env.YOUTUBE_API_KEY,
  });
  const data = await getJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
  return (data.items || []).map((item) => ({
    videoId: item.id.videoId,
    title: decode(item.snippet.title),
    channel: decode(item.snippet.channelTitle),
  }));
}

async function videoTitle(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const data = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  return { title: data.title, channel: data.author_name };
}

module.exports = { enabled, search, videoTitle };
