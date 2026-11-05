const SITE = 'https://www.mundodonghua.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'VidHide', 'StreamWish'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  'Acción',
  'Artes Marciales',
  'Aventura',
  'Ciencia Ficción',
  'Comedia',
  'Comida',
  'Cultivación',
  'Demonios',
  'Deportes',
  'Drama',
  'Ecchi',
  'Escolar',
  'Fantasía',
  'Harem',
  'Harem Inverso',
  'Historico',
  'Idols',
  'Juegos',
  'Lucha',
  'Magia',
  'Mechas',
  'Militar',
  'Misterio',
  'Música',
  'Psicológico',
  'Reencarnación',
  'Romance',
  'Seinen',
  'Shojo',
  'Shonen',
  'Sobrenatural',
  'Sucesos de la Vida',
  'Superpoderes',
  'Suspenso',
  'Terror',
  'Vampiros',
  'Viaje a Otro Mundo',
  'Videojuegos',
  'Zombis',
];

function absUrl(href) {
  if (!href) return undefined;
  if (/^https?:\/\//.test(href)) return href;
  return `${SITE}/${String(href).replace(/^\/+/, '')}`;
}

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

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

function cardsOf($, kind) {
  return $('div.md-card-grid > div.md-card > a')
    .map((i, el) => {
      const card = $(el);
      const href = card.attr('href') || '';
      const mangaId = kind === 'ver' ? (/\/ver\/([^/?#]+)\//.exec(href) || [])[1] : (/\/donghua\/([^/?#]+)/.exec(href) || [])[1];
      if (!mangaId) return null;
      const rawTitle = card.find('.md-card-title').first().text().trim();
      const title = kind === 'ver' ? rawTitle.replace(/\s+Episodio\s+[\d.]+$/i, '').trim() : rawTitle;
      const image = absUrl(card.find('div.md-card-img img').first().attr('src'));
      return { mangaId, title, image, medium: 'anime' };
    })
    .get()
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'airing', name: 'Airing' },
      { id: 'latest', name: 'Latest Episodes' },
    ];
  }

  async getSearchTags() {
    return GENRES.map((genre) => ({ id: genre, label: genre }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const $ = cheerio.load(await this.get(`${SITE}/busquedas/${encodeURIComponent(query)}`));
      return { results: cardsOf($, 'donghua') };
    }
    if (tags.length) {
      const $ = cheerio.load(await this.get(`${SITE}/genero/${encodeURIComponent(tags[0].id)}`));
      return { results: cardsOf($, 'donghua') };
    }
    if (request && request.feed === 'latest') {
      const $ = cheerio.load(await this.get(`${SITE}/lista-episodios/${page}`));
      const entries = cardsOf($, 'ver').map((item) => [item.mangaId, item]);
      const results = Array.from(new Map(entries).values());
      const next = $('nav.md-pagination > span.active').nextAll('a').length > 0;
      return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
    }
    const section = request && request.feed === 'airing' ? 'lista-donghuas-emision' : 'lista-donghuas';
    const $ = cheerio.load(await this.get(`${SITE}/${section}/${page}`));
    const results = cardsOf($, 'donghua');
    const next = $('nav.md-pagination > span.active').nextAll('a').length > 0;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE}/donghua/${encodeURIComponent(mangaId)}`;
    const $ = cheerio.load(await this.get(url));
    const badge = $('span.md-emision-badge').first().text();
    const status = /Finalizad/i.test(badge)
      ? 'COMPLETED'
      : /Emisi/i.test(badge)
        ? 'ONGOING'
        : /Cancelad/i.test(badge)
          ? 'CANCELLED'
          : /Pausad/i.test(badge)
            ? 'HIATUS'
            : 'UNKNOWN';
    const tags = $('a.md-genre-tag')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1.md-detail-title').first().text().trim() || mangaId,
        image: absUrl($('div.md-detail-poster img').first().attr('src')),
        desc: $('p.md-detail-synopsis').first().text().trim(),
        status,
        tags,
        webURL: url,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/donghua/${encodeURIComponent(mangaId)}`));
    return $('ul.md-episode-list li.md-episode-item a.md-ep-link')
      .map((i, el) => {
        const href = ($(el).attr('href') || '').replace(/\/+$/, '');
        const chapterId = href.split('/').pop();
        if (!chapterId) return null;
        const number = Number.isFinite(+chapterId) ? +chapterId : i + 1;
        return {
          id: chapterId,
          chapterId,
          name: `Episodio ${chapterId.replace(/\.0$/, '')}`,
          number,
        };
      })
      .get()
      .filter(Boolean);
  }

  async getVideos(mangaId, chapterId) {
    const html = await this.get(`${SITE}/ver/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`);
    const chunks = html.split('eval(function(p,a,c,k,e').slice(1);
    const urls = [];
    for (const chunk of chunks) {
      const code = unpack(chunk);
      for (const match of code.matchAll(/https?:\/\/[\w.-]+[\w.,@?^=%&:/~+#-]*/g)) {
        const candidate = match[0].replace(/\\+$/, '');
        if (/(voe\.sx|vidhide|embedwish|streamwish)/.test(candidate)) urls.push(candidate);
      }
    }
    const found = await Promise.all(Array.from(new Set(urls)).map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...BROWSER, ...video.headers } }));
    if (!videos.length) throw new Error(`MundoDonghua: none of the ${urls.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
    }
    if (/(vidhide|embedwish|streamwish)/.test(host)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      if (!hls) return null;
      const stream = hls[1].replace(/\\\//g, '/');
      return {
        url: stream.startsWith('/') ? `https://${host}${stream}` : stream,
        quality: /vidhide/.test(host) ? 'VidHide' : 'StreamWish',
        headers: { Referer: origin },
      };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, extraHeaders) {
    const response = await this.requests.schedule(
      App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER, ...extraHeaders } })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`MundoDonghua: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
