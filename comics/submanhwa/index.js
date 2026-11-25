const SITE_BASE = 'https://submanhwa.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'latest', name: 'Latest Updates' },
];

const GENRES = [
  { id: 'cat:22', label: 'Seinen' },
  { id: 'romance', label: 'Romance' },
  { id: 'drama', label: 'Drama' },
  { id: 'comedia', label: 'Comedia' },
  { id: 'harem', label: 'Harem' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'fetiches', label: 'Fetiches' },
  { id: 'milf', label: 'Milf' },
  { id: 'maduras', label: 'Maduras' },
  { id: 'mujer-madura', label: 'Mujer madura' },
  { id: 'mujer-casada', label: 'Mujer casada' },
  { id: 'relacion-secreta', label: 'Relación secreta' },
  { id: 'dominacion', label: 'Dominación' },
  { id: 'vida-escolar', label: 'Vida Escolar' },
  { id: 'universidad', label: 'Universidad' },
  { id: 'convivencia', label: 'Convivencia' },
  { id: 'cohabitacion', label: 'Cohabitación' },
  { id: 'venganza', label: 'Venganza' },
  { id: 'corrupcion', label: 'Corrupción' },
  { id: 'masoquismo', label: 'Masoquismo' },
  { id: 'pareja-sexual', label: 'Pareja Sexual' },
  { id: 'ninfomanas', label: 'Ninfómanas' },
  { id: 'infidelidad', label: 'Infidelidad' },
  { id: 'netori', label: 'Netori' },
  { id: 'netorare', label: 'Netorare' },
  { id: 'netorase', label: 'Netorase' },
  { id: 'ntr', label: 'NTR' },
];

const MONTHS_EN = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
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

function relPath(href) {
  return String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
}

function parseDateEn(text) {
  const m = /(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/i.exec(cleanText(text));
  if (!m) return undefined;
  const mon = MONTHS_EN[m[2].slice(0, 3).toLowerCase()];
  if (mon === undefined) return undefined;
  const t = Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
  return Number.isFinite(t) ? t : undefined;
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const tags = ((request && request.includedTags) || []).map((t) => cleanText(t && (t.id || t.label)).toLowerCase()).filter(Boolean);
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/biblioteca?search=${encodeURIComponent(query)}&page=${page}`));
      const results = [];
      const seen = new Set();
      $('a.lib-card').each((_, el) => {
        const a = $(el);
        const mangaId = relPath(a.attr('href'));
        const title = cleanText(a.find('.lib-title').first().text());
        const image = absolute(a.find('img').first().attr('src') || a.find('img').first().attr('data-src'));
        if (!mangaId || !title || !image || seen.has(mangaId)) return;
        seen.add(mangaId);
        results.push({
          mangaId,
          title,
          image,
          referer: SITE_BASE + '/',
          webURL: absolute(mangaId),
          medium: 'comics',
        });
      });
      const hasNext = $('.lib-pages a[aria-label="Siguiente"]').length > 0 && results.length > 0;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    if (feed.id === 'latest' && tags.length === 0) {
      if (page > 1) return { results: [], metadata: undefined };
      const $ = cheerio.load(await this.requestHTML(SITE_BASE));
      const results = [];
      const seen = new Set();
      $('article.up-card').each((_, el) => {
        const card = $(el);
        const a = card.find('a').first();
        const mangaId = relPath(a.attr('href'));
        const title = cleanText(card.find('a.up-title').first().text()) || cleanText(a.text());
        const image = absolute(card.find('img').first().attr('src') || card.find('img').first().attr('data-src'));
        if (!mangaId || !title || !image || seen.has(mangaId)) return;
        seen.add(mangaId);
        results.push({
          mangaId,
          title,
          image,
          referer: SITE_BASE + '/',
          webURL: absolute(mangaId),
          medium: 'comics',
        });
      });
      return { results, metadata: undefined };
    }

    let filterQs = `page=${page}&sortBy=views&asc=false`;
    if (tags.length > 0) {
      const first = tags[0];
      if (first.indexOf('cat:') === 0) filterQs += `&cat=${encodeURIComponent(first.slice(4))}`;
      else filterQs += `&tag=${encodeURIComponent(first)}`;
    }
    const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/filterList?${filterQs}`));
    const results = [];
    const seen = new Set();
    $('.series-card').each((_, el) => {
      const card = $(el);
      const a = card.find('a').first();
      const mangaId = relPath(a.attr('href'));
      const title = cleanText(card.find('.series-title').first().text());
      const image = absolute(card.find('img').first().attr('src') || card.find('img').first().attr('data-src'));
      if (!mangaId || !title || !image || seen.has(mangaId)) return;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: absolute(mangaId),
        medium: 'comics',
      });
    });
    const hasNext = $('li a[rel="next"]').length > 0 && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(absolute(mangaId));
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const infoEl = $('.sr-info').first();
    const title = cleanText(infoEl.find('h1').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('img.sr-cover').first().attr('src') || $('img').first().attr('src'));
    const desc = cleanText($('.sr-summary > p').text()) || title;
    const tags = [];
    infoEl.find('.sr-badge.type, .sr-cat, .sr-tag').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });
    const people = [];
    $('.sr-meta dt').each((_, el) => {
      const label = cleanText($(el).text()).toLowerCase();
      if (label.includes('autor') || label.includes('artist')) {
        $(el).next('dd').find('a').each((__, a) => {
          const p = cleanText($(a).text());
          if (p && people.indexOf(p) === -1) people.push(p);
        });
      }
    });
    let status = 'UNKNOWN';
    if (infoEl.find('.ongoing').length > 0) status = 'ONGOING';
    else if (infoEl.find('.ended').length > 0) status = 'COMPLETED';

    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: people.join(', '),
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: absolute(mangaId),
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const itemId = cleanText($('#item-rating').first().attr('data-item'));
    if (!itemId) throw new Error('SubManhwa: series ID not found');
    const rows = [];
    const seen = new Set();
    const limit = 50;
    for (let page = 0; page < 20; page++) {
      const url = `${SITE_BASE}/lista-capitulos/serie/${encodeURIComponent(itemId)}?orden=desc&offset=${page * limit}&limit=${limit}`;
      const response = await this.requests.schedule(App.createRequest({
        url,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: absolute(mangaId) },
      }));
      if (response.status < 200 || response.status >= 300) break;
      const dto = JSON.parse(response.data);
      const $frag = cheerio.load(dto.html || '');
      let count = 0;
      $frag('[id^="chapter-card"]').each((_, el) => {
        const card = $frag(el);
        const a = card.find('a.lc-t').first();
        const cid = relPath(a.attr('href'));
        if (!cid || seen.has(cid)) return;
        seen.add(cid);
        count++;
        const name = cleanText(a.text()) || cid;
        const numM = /(\d+(?:\.\d+)?)/.exec(name);
        const number = numM ? parseFloat(numM[1]) : 0;
        const rawDate = cleanText(card.find('.lc-d').first().text()).replace(/^[^\d]+/, '');
        const time = parseDateEn(rawDate);
        rows.push({ id: cid, chapterId: cid, name, number, time });
      });
      if (count === 0 || !dto.mas) break;
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
    $('#all img').each((_, el) => {
      const img = $(el);
      const src = cleanText(img.attr('data-src') || img.attr('src'));
      if (src) pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error('SubManhwa returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`SubManhwa HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
