const SITE = 'https://tvanime.tv';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'MP4Upload'];

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

function slugOf(href) {
  return (/\/anime\/([^/?#"]+)/.exec(href || '') || [])[1];
}

function episodesOf($) {
  return $('a.episode-card')
    .map((i, el) => {
      const card = $(el);
      const chapterId = (/\/episodio\/([^/?#"]+)/.exec(card.attr('href') || '') || [])[1];
      if (!chapterId) return null;
      const number = +((/([0-9.]+)$/.exec(chapterId) || [])[1] || i + 1);
      const name = card.find('.episode-card-body strong').first().text().trim() || `Episodio ${number}`;
      return { id: chapterId, chapterId, name, number };
    })
    .get()
    .filter(Boolean);
}

function ageFromTags(tags) {
  const list = (Array.isArray(tags) ? tags : []).map((t) => String(t || '')).filter((t) => !/adult cast|elenco adulto/i.test(t));
  if (list.some((t) => /hentai|er[o\u00f3]tic|smut|porn|\+\s?18|18\s?\+|xxx/i.test(t))) return 18;
  if (list.some((t) => /ecchi|adulto|adult|mature|maduro/i.test(t))) return 16;
  return 0;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 8 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'latest', name: 'Latest Episodes' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/directorio`));
    return $('#catalog-genre option')
      .map((i, el) => ({ id: ($(el).attr('value') || '').trim(), label: $(el).text().trim() }))
      .get()
      .filter((tag) => tag.id && tag.label);
  }

  async getSearchResults(request, metadata) {
    const page = await this.getSearchResultsUnrated(request, metadata);
    const asked = (request && request.includedTags) || [];
    if (asked.length && page && Array.isArray(page.results)) {
      const names = await this.tagNames();
      const age = ageFromTags(asked.map((t) => names[String(t && t.id)] || (t && (t.label || t.id)) || ''));
      if (age) page.results.forEach((r) => (r.ageRating = Math.max(r.ageRating || 0, age)));
    }
    return page;
  }

  async tagNames() {
    if (this.tagNameMap) return this.tagNameMap;
    const map = {};
    try {
      ((await this.getSearchTags()) || []).forEach((t) => {
        if (t && t.id !== undefined) map[String(t.id)] = String(t.label || t.name || t.id);
      });
      this.tagNameMap = map;
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
    }
    return map;
  }

  async getSearchResultsUnrated(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'latest') {
      const $ = cheerio.load(await this.get(SITE));
      const entries = $('a.home-episode-card')
        .map((i, el) => {
          const card = $(el);
          const mangaId = slugOf(card.attr('href'));
          if (!mangaId) return null;
          const img = card.find('img').first();
          const fallback = (/https?:\/\/[^'"]+\/covers\/[^'"]+/.exec(img.attr('onerror') || '') || [])[0];
          const title = card.find('.home-episode-anime').first().text().trim();
          return [[mangaId, { mangaId, title, image: fallback || img.attr('src'), medium: 'anime' }]];
        })
        .get()
        .filter(Boolean);
      return { results: Array.from(new Map(entries).values()) };
    }
    const params = [`page=${page}`];
    if (query) params.unshift(`q=${encodeURIComponent(query)}`);
    else if (tags.length) params.unshift(`genre=${encodeURIComponent(tags[0].id)}`);
    const $ = cheerio.load(await this.get(`${SITE}/directorio?${params.join('&')}`));
    const results = $('article.anime-card')
      .map((i, el) => {
        const card = $(el);
        const mangaId = slugOf(card.find('a').first().attr('href'));
        if (!mangaId) return null;
        return {
          mangaId,
          title: card.find('.anime-card-title').first().text().trim(),
          image: card.find('.anime-card-image img').first().attr('src'),
          medium: 'anime',
        };
      })
      .get()
      .filter(Boolean);
    const next = $('.pagination-current').nextAll('a').length > 0;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const result = await this.getMangaDetailsUnrated(mangaId);
    const info = result && result.mangaInfo;
    if (info && info.ageRating === undefined) {
      const age = ageFromTags(info.tags);
      if (age) info.ageRating = age;
    }
    return result;
  }

  async getMangaDetailsUnrated(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const state = $('.anime-status').first().text();
    const tags = $('.anime-info a[href*="/genero/"]')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1.anime-title').first().text().trim() || mangaId,
        image: $('.anime-poster img').first().attr('src'),
        banner: $('.anime-hero-backdrop').first().attr('src'),
        desc: $('.anime-synopsis').first().text().trim(),
        status: /Finalizado/i.test(state) ? 'COMPLETED' : /emisi/i.test(state) ? 'ONGOING' : 'UNKNOWN',
        tags: Array.from(new Set(tags)),
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const pages = $('#episode-range-select option')
      .map((i, el) => +($(el).attr('value') || 0))
      .get()
      .filter((page) => page > 1);
    const rest = await Promise.all(
      pages.map(async (page) => episodesOf(cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/episodes/${page}`))))
    );
    return episodesOf($).concat(...rest).reverse();
  }

  async getVideos(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/episodio/${encodeURIComponent(chapterId)}`));
    const servers = $('.watch-server[data-server-url]')
      .map((i, el) => ({
        url: $(el).attr('data-server-url'),
        language: $(el).attr('data-server-language') === 'DUB' ? 'Dub' : 'Sub',
      }))
      .get();
    const found = await Promise.all(servers.map((entry) => this.extract(entry).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, language, ...video }) => ({ ...video, quality: `${server} ${language}`, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`AnimeMovil: none of the ${servers.length} servers gave a playable video`);
    return videos;
  }

  async extract({ url, language }) {
    const host = (/^https?:\/\/([^/]+)/.exec(url || '') || [])[1] || '';
    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', language };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(await this.get(url));
      return { url: src[1], server: 'MP4Upload', language, headers: { Referer: 'https://www.mp4upload.com/' } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeMovil: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
