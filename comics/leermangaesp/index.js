const SITE_BASE = 'https://mangalect.org';
const IMG_BASE = 'https://images.mangalect.org/file/leermangaesp';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Popular' },
  { id: 'all', name: 'All Series' },
];

const GENRES = [
  'Acción', 'Apocalíptico', 'Artes marciales', 'Aventura', 'Boys Love',
  'Ciencia Ficción', 'Comedia', 'Crimen', 'Demonios', 'Deportes', 'Doujinshi',
  'Drama', 'Ecchi', 'Fantasía', 'Girls Love', 'Gore', 'Harem', 'Histórico',
  'Horror', 'Isekai', 'Josei', 'Magia', 'Mecha', 'Misterio', 'Psicológico',
  'Recuentos de la vida', 'Romance', 'Seinen', 'Shojo', 'Shonen',
  'Sobrenatural', 'Tragedia',
];

const MONTHS_EN = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|gore)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function coverUrl(portada) {
  const p = String(portada || '').trim().replace(/^\/+/, '');
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return `${IMG_BASE}/${p}`;
}

function normalizeSlug(slug) {
  return String(slug || '').trim().replace(/^\/?info\//, '').replace(/^\/+|\/+$/g, '').split('/')[0] || '';
}

function parseDateEn(text) {
  const m = /([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(cleanText(text));
  if (!m) return undefined;
  const mon = MONTHS_EN[m[1].toLowerCase()];
  if (mon === undefined) return undefined;
  const t = Date.UTC(parseInt(m[3], 10), mon, parseInt(m[2], 10));
  return Number.isFinite(t) ? t : undefined;
}

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s.includes('finaliz') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('curso') || s.includes('emisi') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('paus') || s.includes('hiatus')) return 'HIATUS';
  return 'UNKNOWN';
}

function mapDtoList(list) {
  const results = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((it) => {
    if (!it || !it.slug || !it.titulo) return;
    const mangaId = normalizeSlug(it.slug);
    const title = cleanText(it.titulo);
    const image = coverUrl(it.portada);
    if (!mangaId || !title || !image || seen.has(mangaId)) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      webURL: `${SITE_BASE}/info/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    });
  });
  return results;
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    if (query || tags.length > 0 || feed.id === 'all') {
      const params = [`page=${page}`, 'page_size=24'];
      if (query) params.push(`query=${encodeURIComponent(query)}`);
      if (tags.length > 0) params.push(`generos=${encodeURIComponent(tags.map((t) => t.id).join(','))}`);
      const json = await this.requestJSON(`${SITE_BASE}/api/buscar_mangas?${params.join('&')}`);
      const results = mapDtoList(json && json.resultados);
      const totalPages = Number(json && json.total_pages) || 1;
      return { results, metadata: page < totalPages && results.length > 0 ? { page: page + 1 } : undefined };
    }

    if (feed.id === 'popular') {
      if (page > 1) return { results: [], metadata: undefined };
      const html = await this.requestHTML(SITE_BASE);
      const $ = cheerio.load(html);
      const raw = $('script#ssr-trends-data').first().text();
      let list = [];
      try { list = JSON.parse(raw); } catch (e) {}
      return { results: mapDtoList(list), metadata: undefined };
    }

    if (page > 1) return { results: [], metadata: undefined };
    const list = await this.requestJSON(`${SITE_BASE}/api/latest_chapters_with_dates`);
    const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) =>
      String(b && b.fecha_publicacion || '').localeCompare(String(a && a.fecha_publicacion || ''))
    );
    return { results: mapDtoList(sorted), metadata: undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/info/${encodeURIComponent(mangaId)}/`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('.manga-title, h1').first().text()) || mangaId;
    const image = absolute($('img.manga-cover').first().attr('src') || $('img').first().attr('src'));
    const desc = cleanText($('#synopsis-text').first().text()) || title;
    const status = mapStatus($('#info-block .info-value').first().text());
    const tags = [];
    $('.info-generos .genero-item').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: '',
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/info/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    let html = await this.titleHtml(mangaId);
    const rows = [];
    const seen = new Set();
    for (let guard = 0; guard < 15; guard++) {
      const $ = cheerio.load(html);
      $('#chapter-list a.chapter-link').each((_, el) => {
        const a = $(el);
        const href = String(a.attr('href') || '').trim();
        const rel = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
        if (!rel || seen.has(rel)) return;
        seen.add(rel);
        const name = cleanText(a.find('.chapter-title').first().text()) || cleanText(a.text()) || rel;
        const numM = /(\d+(?:\.\d+)?)/.exec(name);
        const number = numM ? parseFloat(numM[1]) : 0;
        const time = parseDateEn(a.find('.chapter-date').first().text());
        rows.push({ id: rel, chapterId: rel, name, number, time });
      });
      const nextHref = cleanText($('#more-link').first().attr('href'));
      if (!nextHref) break;
      const nextUrl = nextHref.charAt(0) === '?' ? `${SITE_BASE}/info/${encodeURIComponent(mangaId)}/${nextHref}` : absolute(nextHref);
      html = await this.requestHTML(nextUrl);
    }
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.requestHTML(absolute(chapterId)));
    const pages = [];
    $('#cascade-view img.manga-image').each((_, el) => {
      const src = cleanText($(el).attr('src') || $(el).attr('data-src'));
      if (src) pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error('LeerMangaEsp returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`LeerMangaEsp HTTP ${response.status}`);
    return response.data;
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`LeerMangaEsp HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
