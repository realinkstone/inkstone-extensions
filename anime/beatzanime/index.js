const SITE = 'https://www.beatz-anime.net';
const FILES = 'https://bz.beatz-anime.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const TAGS = [
  ['fuente:bdrip', 'BDRip'],
  ['fuente:webrip', 'WEBRip'],
  ['tipo:serie', 'Serie'],
  ['tipo:pelicula', 'Película'],
  ['estado:finalizado', 'Finalizado'],
  ['estado:en emision', 'En emisión'],
];

const SPECIAL_RE = /\b(?:oad|ova|especiales|especial|peliculas?|películas?|ncopv|ncop|nced)\b/i;

function clean(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function absUrl(href) {
  if (!href) return undefined;
  if (/^https?:\/\//.test(href)) return href;
  return `${SITE}/${String(href).replace(/^\/+/, '')}`;
}

function idOf(href) {
  return String(href || '')
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/+/, '');
}

function posterOf(mangaId) {
  const slug = mangaId.split('/').pop().replace(/\.html$/, '');
  return `${SITE}/img/img-anime/${slug}/${slug}-port.jpg`;
}

function parseEpisodeNumber(name, fallback) {
  const sxx = /[Ss]\d+[Ee](\d+(?:\.\d+)?)/.exec(name);
  if (sxx) return +sxx[1];
  const exx = /\b[Ee](\d+(?:\.\d+)?)\b/.exec(name);
  if (exx) return +exx[1];
  const tail = /(\d+(?:\.\d+)?)\s*$/.exec(name);
  if (tail) return +tail[1];
  return fallback;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    return TAGS.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'popular') {
      const $ = cheerio.load(await this.get(`${SITE}/`));
      const seen = new Map();
      $('article.top-views-card').each((i, el) => {
        const card = $(el);
        const anchor = card.find('a.top-views-poster').first();
        const mangaId = idOf(anchor.attr('href'));
        const title = card.find('h3.top-views-title').first().text().trim();
        if (mangaId && title && !seen.has(mangaId)) {
          seen.set(mangaId, {
            mangaId,
            title,
            image: absUrl(anchor.find('img').first().attr('src')) || posterOf(mangaId),
            medium: 'anime',
          });
        }
      });
      return { results: Array.from(seen.values()) };
    }
    if (!query && !tags.length && request && request.feed === 'latest') {
      const url = page > 1 ? `${SITE}/index.php?pagina=${page}` : `${SITE}/`;
      const $ = cheerio.load(await this.get(url));
      const results = $('a.titulo-largo')
        .map((i, el) => {
          const anchor = $(el);
          const mangaId = idOf(anchor.attr('href'));
          const title = anchor.text().trim();
          return mangaId && title ? { mangaId, title, image: posterOf(mangaId), medium: 'anime' } : null;
        })
        .get()
        .filter(Boolean);
      const next = $('ul.pagination > li.active + li:not(.disabled)').length > 0;
      return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
    }
    const $ = cheerio.load(await this.get(`${SITE}/lista-animes/`));
    const all = $('div.anime-card')
      .map((i, el) => {
        const card = $(el);
        const nameAttr = clean(card.attr('data-name'));
        if (query && !nameAttr.includes(query)) return null;
        for (const tag of tags) {
          const [key, val] = String(tag.id || '').split(':');
          if (key && val && clean(card.attr(`data-${key}`)) !== val) return null;
        }
        const anchor = card.find('a.anime-poster-link').first();
        const mangaId = idOf(anchor.attr('href'));
        const title = card.find('span.overlay-title-link').first().text().trim() || (anchor.attr('title') || '').trim();
        if (!mangaId || !title) return null;
        return {
          mangaId,
          title,
          image: absUrl(anchor.find('img.anime-poster').first().attr('src')) || posterOf(mangaId),
          medium: 'anime',
        };
      })
      .get()
      .filter(Boolean);
    const results = all.slice((page - 1) * 24, page * 24);
    return { results, metadata: page * 24 < all.length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE}/${mangaId.replace(/^\/+/, '')}`;
    const $ = cheerio.load(await this.get(url));
    const post = $('p.post-text').first();
    const paragraphs = post
      .contents()
      .toArray()
      .filter((node) => node.type === 'text')
      .map((node) => $(node).text().trim())
      .filter(Boolean);
    let genresText = '';
    post.find('span').each((i, el) => {
      const span = $(el);
      const label = span.find('b').first().text();
      if (/Generos/i.test(label)) genresText = span.clone().children('b').remove().end().text();
      if (/Sin[oó]nimos/i.test(label)) {
        const syn = span.clone().children('b').remove().end().text().trim();
        if (syn) paragraphs.push(`Sinónimos: ${syn}`);
      }
    });
    let stateText = '';
    $('.stat-item').each((i, el) => {
      if (/Estado/i.test($(el).find('h5').text())) stateText = $(el).find('a').text().trim();
    });
    const status = /finalizado/i.test(stateText) ? 'COMPLETED' : /emisi|emsi/i.test(stateText) ? 'ONGOING' : 'UNKNOWN';
    const tags = genresText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: absUrl($('div.poster-card img').first().attr('src')) || posterOf(mangaId),
        desc: paragraphs.join('\n\n') || post.text().trim(),
        status,
        tags,
        webURL: url,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE}/${mangaId.replace(/^\/+/, '')}`;
    const $ = cheerio.load(await this.get(url));
    const regular = [];
    const specials = [];
    $('#collapseExampled tbody tr').each((index, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const format = cells.eq(1).text().trim().toLowerCase();
      const kind = cells.eq(2).text().trim().toLowerCase();
      if (kind !== 'video' && format !== 'mkv' && format !== 'mp4') return;
      const href = cells.eq(4).find('a.btn-descarga-premium').attr('href');
      if (!href) return;
      const chapterId = href.replace(/^https?:\/\/[^/]+\/+/, '');
      const rawName = cells.eq(0).text().replace(/\s+/g, ' ').trim() || `Episodio ${index + 1}`;
      const size = cells.eq(3).text().replace(/\s+/g, ' ').trim();
      const num = parseEpisodeNumber(rawName, index + 1);
      const entry = {
        id: chapterId,
        chapterId,
        name: rawName,
        number: num,
        group: size || undefined,
      };
      if (SPECIAL_RE.test(rawName)) specials.push({ ...entry, number: 0 });
      else regular.push(entry);
    });
    regular.sort((a, b) => a.number - b.number);
    specials.sort((a, b) => a.name.localeCompare(b.name));
    return specials.concat(regular).reverse();
  }

  async getVideos(mangaId, chapterId) {
    const url = /^https?:\/\//.test(chapterId) ? chapterId : `${FILES}/${chapterId.replace(/^\/+/, '')}`;
    const res = (/\b(\d{3,4}p)\b/i.exec(decodeURIComponent(url)) || [])[1] || '1080p';
    return [
      {
        url,
        quality: `Direct ${res}`,
        headers: { ...BROWSER, Referer: `${SITE}/` },
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`BeatzAnime: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
