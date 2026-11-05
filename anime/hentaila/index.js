const SITE = 'https://hentaila.com';
const CDN = 'https://cdn.hentaila.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'YourUpload', 'Mp4Upload', 'VIP'];

const STATUS = { 0: 'COMPLETED', 2: 'ONGOING' };

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function voeSource(payload) {
  const clean = VOE_MARKERS.reduce((text, marker) => text.split(marker).join(''), rot13(payload));
  const shifted = App.base64Decode(clean).split('').map((ch) => String.fromCharCode(ch.charCodeAt(0) - 3)).join('');
  return JSON.parse(App.base64Decode(shifted.split('').reverse().join(''))).source;
}

function resolve(data, index, seen) {
  if (seen.has(index)) return seen.get(index);
  const value = data[index];
  if (!value || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  seen.set(index, out);
  for (const key of Object.keys(value)) out[key] = typeof value[key] === 'number' ? resolve(data, value[key], seen) : value[key];
  return out;
}

function payload(json, key) {
  for (const node of json.nodes || []) {
    const data = node && node.data;
    const index = data ? data.findIndex((item) => item && typeof item === 'object' && !Array.isArray(item) && key in item) : -1;
    if (index >= 0) return resolve(data, index, new Map());
  }
  throw new Error(`HentaiLA: the page data has no ${key}`);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest_released', name: 'Latest Updates' },
      { id: 'emision', name: 'Airing' },
    ];
  }

  async getSearchTags() {
    const catalog = payload(await this.json(`${SITE}/catalogo/__data.json`), 'genresIdsMap');
    return Object.values(catalog.genresIdsMap).map((genre) => ({ id: genre.slug, label: genre.name }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = request && request.feed;
    const page = (metadata && metadata.page) || 1;
    const params = [`page=${page}`];
    if (query) params.push(`search=${encodeURIComponent(query)}`);
    tags.forEach((tag) => params.push(`genre=${encodeURIComponent(tag.id)}`));
    if (!query && !tags.length) params.push(feed === 'emision' ? 'status=emision' : `order=${feed === 'latest_released' ? 'latest_released' : 'popular'}`);
    const list = payload(await this.json(`${SITE}/catalogo/__data.json?${params.join('&')}`), 'results');
    const results = list.results
      .filter((item) => item && item.slug && item.title)
      .map((item) => ({ mangaId: item.slug, title: item.title.trim(), image: `${CDN}/covers/${item.id}.jpg`, medium: 'anime', ageRating: 18 }));
    const pages = list.pagination || {};
    return { results, metadata: results.length && pages.currentPage < pages.totalPages ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const media = await this.media(mangaId);
    return {
      mangaInfo: {
        title: (media.title || mangaId).trim(),
        image: `${CDN}/covers/${media.id}.jpg`,
        desc: media.synopsis || '',
        status: STATUS[media.status] || 'UNKNOWN',
        tags: (media.genres || []).map((genre) => genre && genre.name).filter(Boolean),
        webURL: `${SITE}/media/${mangaId}`,
        medium: 'anime',
        ageRating: 18,
      },
    };
  }

  async getChapters(mangaId) {
    const media = await this.media(mangaId);
    return (media.episodes || [])
      .filter((episode) => episode && episode.number != null)
      .map((episode) => {
        const id = String(episode.number);
        return { id, chapterId: id, name: `Episodio ${episode.number}`, number: Number(episode.number) };
      })
      .sort((a, b) => b.number - a.number);
  }

  async getVideos(mangaId, chapterId) {
    const episode = payload(await this.json(`${SITE}/media/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/__data.json`), 'embeds');
    const players = ((episode.embeds && episode.embeds.SUB) || []).filter((player) => player && player.url);
    const found = await Promise.all(players.map((player) => this.extract(player).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`HentaiLA: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract(player) {
    const url = player.url;
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (String(player.server).toUpperCase() === 'VIP') return { url: url.replace('/play/', '/m3u8/'), quality: 'VIP' };
    if (!/(^|\.)(voe\.sx|yourupload\.com|mp4upload\.com)$/.test(host)) return null;
    let html = await this.get(url);
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async media(mangaId) {
    return payload(await this.json(`${SITE}/media/${encodeURIComponent(mangaId)}/__data.json`), 'episodes');
  }

  async json(url) {
    return JSON.parse(await this.get(url, 'application/json'));
  }

  async get(url, accept) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: accept || 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`HentaiLA: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
