const SITE = 'https://monoschinos.st';

const PAGE_CACHE_MS = 5 * 60 * 1000;

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['Lulu', 'MixDrop', 'VOE', 'OK.ru', 'YourUpload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function slugOf(href, kind) {
  const match = new RegExp('/' + kind + '/([^/?#]+)').exec(href || '');
  return match ? match[1] : null;
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
  return $('a.card-wrap')
    .map((i, el) => {
      const card = $(el);
      const slug = slugOf(card.attr('href'), kind);
      if (!slug) return null;
      const img = card.find('img').first();
      return { slug, title: card.find('h3').first().text().trim(), image: img.attr('data-src') || img.attr('src') };
    })
    .get()
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.genres = null;
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'latest', name: 'Latest Episodes' },
    ];
  }

  async getSearchTags() {
    if (!this.genres) {
      this.genres = (async () => {
        const $ = cheerio.load(await this.get(`${SITE}/animes`));
        return $('input[name="genero[]"]')
          .map((i, el) => ({ id: $(el).attr('value'), label: $(el).parent().find('span').last().text().trim() }))
          .get()
          .filter((tag) => tag.id && tag.label);
      })();
      this.genres.catch(() => {
        this.genres = null;
      });
    }
    return this.genres;
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'latest') {
      const $ = cheerio.load(await this.get(SITE));
      const titles = cardsOf($, 'ver').map((card) => {
        const mangaId = card.slug.replace(/-episodio-[^-]+$/, '') + '-sub-espanol';
        return [mangaId, { mangaId, title: card.title, image: card.image, medium: 'anime' }];
      });
      return { results: Array.from(new Map(titles).values()) };
    }
    const filters = tags.map((tag) => `genero[]=${encodeURIComponent(tag.id)}&`).join('');
    const url = query
      ? `${SITE}/buscar?q=${encodeURIComponent(query)}&p=${page}`
      : `${SITE}/animes?${filters}p=${page}`;
    const $ = cheerio.load(await this.get(url));
    return {
      results: cardsOf($, 'anime').map((card) => ({ mangaId: card.slug, title: card.title, image: card.image, medium: 'anime' })),
      metadata: $('a[rel="next"]').length ? { page: page + 1 } : undefined,
    };
  }

  titlePage(mangaId) {
    const cached = this.pages.get(mangaId);
    if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return cached.promise;
    const promise = this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`);
    this.pages.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this.pages.delete(mangaId));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.titlePage(mangaId));
    const heading = $('h1').first();
    const text = $('body').text();
    const tags = $('a[href*="/genero/"]').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    return {
      mangaInfo: {
        title: heading.text().trim() || mangaId,
        image: $('img.lazy').first().attr('data-src'),
        desc: heading.nextAll('p').first().text().trim(),
        status: /Finalizado/.test(text) ? 'COMPLETED' : /En emisi[oó]n/.test(text) ? 'ONGOING' : 'UNKNOWN',
        tags: Array.from(new Set(tags)),
        ageRating: tags.some((tag) => /^ecchi$/i.test(tag)) ? 16 : 0,
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titlePage(mangaId));
    const ajax = $('section.caplist').attr('data-ajax');
    if (!ajax) throw new Error('MonosChinos: the anime page has no episode list');
    const list = JSON.parse(await this.post(ajax, ''));
    const pages = Math.ceil((list.eps || []).length / list.perpage);
    const answers = await Promise.all(
      Array.from({ length: pages }, (_, i) => this.post(list.paginate_url, `p=${i + 1}`))
    );
    const caps = answers.flatMap((answer) => JSON.parse(answer).caps || []);
    const unique = new Map(caps.map((cap) => [slugOf(cap.url, 'ver'), cap]));
    unique.delete(null);
    return Array.from(unique.entries())
      .map(([id, cap]) => ({ id, chapterId: id, name: `Episodio ${cap.episodio}`, number: Number.isFinite(+cap.episodio) ? +cap.episodio : undefined }))
      .reverse();
  }

  async getVideos(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/ver/${encodeURIComponent(chapterId)}`));
    const players = $('button.play-video[data-player]')
      .map((i, el) => App.base64Decode($(el).attr('data-player')))
      .get();
    let challenge = null;
    const found = await Promise.all(
      players.map((url) =>
        this.extract(url).catch((e) => {
          if (e && e.kind === 'challenge') challenge = e;
          return null;
        })
      )
    );
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) {
      if (challenge) throw challenge;
      throw new Error(`MonosChinos: none of the ${players.length} servers gave a playable video`);
    }
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|lulu|mi?xdrop\.|ok\.ru|yourupload\.com)/.test(host)) return null;
    let html = await this.get(url.replace(/^http:/, 'https:'));
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE', server: 'VOE' };
    }
    if (/(^|\.)lulu/.test(host)) {
      const file = /file:\s*"([^"]+)"/.exec(html) || /file:\s*"([^"]+)"/.exec(unpack(html));
      return { url: file[1], quality: 'Lulu', server: 'Lulu', headers: { Referer: origin } };
    }
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', server: 'MixDrop', headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, quality: 'OK.ru', server: 'OK.ru' };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', server: 'YourUpload', headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  post(url, body) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' };
    return this.send({ url, method: 'POST', headers, body });
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`MonosChinos: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
