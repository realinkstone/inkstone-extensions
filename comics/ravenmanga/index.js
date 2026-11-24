const SITE_BASE = 'https://raventard.xyz';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'comics', name: 'All Series' },
  { id: 'popular', name: 'Popular' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').replace(/[\r\n\t]+/g, '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function relPath(href) {
  return String(href || '').replace(/^https?:\/\/[^/]+/i, '').trim();
}

function parseRelativeDate(text) {
  const s = cleanText(text).toLowerCase();
  const m = /(\d+)/.exec(s);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const now = Date.now();
  if (s.includes('segundo')) return now - n * 1000;
  if (s.includes('minuto')) return now - n * 60000;
  if (s.includes('hora')) return now - n * 3600000;
  if (s.includes('día') || s.includes('dia')) return now - n * 86400000;
  if (s.includes('semana')) return now - n * 7 * 86400000;
  if (s.includes('mes')) return now - n * 30 * 86400000;
  if (s.includes('año') || s.includes('ano')) return now - n * 365 * 86400000;
  return undefined;
}

function parseFigures($, selector) {
  const results = [];
  const seen = new Set();
  $(selector).each((_, el) => {
    const fig = $(el);
    const a = fig.find('a').first();
    const mangaId = relPath(a.attr('href'));
    const title = cleanText(fig.find('figcaption').first().text());
    const image = absolute(fig.find('img').first().attr('src') || fig.find('img').first().attr('data-src'));
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
  return results;
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    if (query) {
      if (page > 1) return { results: [], metadata: undefined };
      const html = await this.requestHTML(`${SITE_BASE}/comics`);
      const m = /proyectos\s*=\s*(\[[\s\S]+?\])\s*;/.exec(html);
      if (!m) return { results: [] };
      let list = [];
      try { list = JSON.parse(m[1]); } catch (e) { return { results: [] }; }
      const q = query.toLowerCase();
      const results = [];
      const seen = new Set();
      list.forEach((it) => {
        const title = cleanText(it && (it.title || it.nombre || it.name));
        if (!title || !title.toLowerCase().includes(q)) return;
        const slug = it.slug || it.url || '';
        const mangaId = slug.indexOf('/') === 0 ? slug : `/sr2/${slug}`;
        const img = absolute(it.portada || it.cover || it.imagen || it.image || it.thumbnail || '');
        if (!mangaId || !img || seen.has(mangaId)) return;
        seen.add(mangaId);
        results.push({
          mangaId,
          title,
          image: img,
          referer: SITE_BASE + '/',
          webURL: absolute(mangaId),
          medium: 'comics',
        });
      });
      return { results, metadata: undefined };
    }

    if (feed.id === 'popular') {
      if (page > 1) return { results: [], metadata: undefined };
      const $ = cheerio.load(await this.requestHTML(SITE_BASE));
      return { results: parseFigures($, 'div#div-diario figure, div#div-semanal figure, div#div-mensual figure'), metadata: undefined };
    }

    if (feed.id === 'latest') {
      if (page > 1) return { results: [], metadata: undefined };
      const $ = cheerio.load(await this.requestHTML(SITE_BASE));
      return { results: parseFigures($, 'section.flex > div.grid > figure'), metadata: undefined };
    }

    const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/comics?page=${page}`));
    const results = parseFigures($, 'section.flex > div.grid > figure');
    const hasNext = $('nav > ul.pagination > li > a[rel="next"]').length > 0 && results.length > 0;
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
    const title = cleanText($('main.wrap-project').first().attr('data-project')) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('#coverProject').first().attr('src') || $('img').first().attr('src'));
    const container = $('section#section-sinopsis').first();
    const desc = cleanText(container.find('p').text()) || title;
    const tags = [];
    container.find('a > span').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });

    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: '',
      desc,
      status: 'UNKNOWN',
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
    const rows = [];
    const seen = new Set();
    $('section#section-list-cap div.grid > a').each((_, el) => {
      const a = $(el);
      const cid = relPath(a.attr('href'));
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      const name = cleanText(a.find('div#name').first().text()) || cleanText(a.text()) || cid;
      const numM = /(\d+(?:\.\d+)?)/.exec(name);
      const number = numM ? parseFloat(numM[1]) : 0;
      const time = parseRelativeDate(a.find('time').first().text());
      rows.push({ id: cid, chapterId: cid, name, number, time });
    });
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
    const url = absolute(chapterId);
    let html = await this.requestHTML(url);
    let $ = cheerio.load(html);
    const form = $('form#redirectForm[method="post"]').first();
    if (form.length > 0) {
      const action = absolute(form.attr('action') || url);
      const parts = [];
      form.find('input').each((_, inp) => {
        const k = $(inp).attr('name');
        const v = $(inp).attr('value') || '';
        if (k) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      });
      const response = await this.requests.schedule(App.createRequest({
        url: action,
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
        body: parts.join('&'),
      }));
      if (response.status >= 200 && response.status < 300) {
        $ = cheerio.load(response.data);
      }
    }
    const pages = [];
    const seen = new Set();
    $('main.contenedor-imagen > section img[src], main > img[src]').each((_, el) => {
      const src = absolute($(el).attr('src'));
      if (!src || /brakeout\.png/i.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(src);
    });
    if (pages.length === 0) throw new Error('RavenManga returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`RavenManga HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
