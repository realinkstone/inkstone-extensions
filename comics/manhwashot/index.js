const SITE_BASE = 'https://manhwashot.lat';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', path: '/ultimas-actualizaciones/' },
  { id: 'explore', name: 'Explore', path: '/explorar/' },
  { id: 'ranking', name: 'Popular', path: '/ranking/' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn|sin censura|contenido sexual)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('finaliz') || s.includes('complet') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('pausa') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonad')) return 'CANCELLED';
  if (s.includes('emisi') || s.includes('en curso') || s.includes('publicand') || s.includes('publicánd') || s.includes('ongoing')) return 'ONGOING';
  return 'UNKNOWN';
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('a.s-card-imglink, a[href^="/manga/"]').each((_, el) => {
    const a = $(el);
    const href = (a.attr('href') || '').trim();
    const m = /^\/manga\/([^/]+)\/?$/.exec(href);
    if (!m) return;
    const mangaId = m[1];
    if (!mangaId || seen.has(mangaId)) return;
    const img = a.find('img').first();
    if (!img.length) return;
    const rawAlt = cleanText(img.attr('alt'));
    const title = rawAlt.replace(/\s+portada$/i, '').trim() || cleanText(a.attr('title')) || cleanText(a.closest('article, .s-card, li, div').find('h2, h3, .s-card-title').first().text());
    if (!title) return;
    const image = absolute(img.attr('src') || img.attr('data-src') || '');
    if (!image || /^data:/.test(image)) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($, page) {
  let found = false;
  $('a[href*="page="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = /[?&]page=(\d+)/.exec(href);
    if (m && parseInt(m[1], 10) > page) found = true;
  });
  return found;
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/genero/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('a[href^="/genero/"]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        const m = /^\/genero\/([^/]+)\/?$/.exec(href);
        if (!m || seen.has(m[1])) return;
        const label = cleanText($(el).text()).replace(/\s*\(\d+\)\s*$/, '').replace(/\s+\d+$/, '').trim();
        if (!label) return;
        seen.add(m[1]);
        tags.push({ id: m[1], label });
      });
      return tags;
    } catch (e) {
      console.error('ManhwaShot getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}/explorar/?q=${encodeURIComponent(query)}&page=${page}`;
    } else if (tags.length > 0) {
      url = `${SITE_BASE}/genero/${encodeURIComponent(tags[0].id)}/?page=${page}`;
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      url = `${SITE_BASE}${feed.path}?page=${page}`;
    }

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1 || query) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parseCards($);
    return { results, metadata: results.length > 0 && hasNextPage($, page) ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.titleHtml(mangaId);
    const $ = cheerio.load(html);
    const title = cleanText($('h1').first().text()) || mangaId;

    let image = '';
    $('img').each((_, el) => {
      if (image) return;
      const src = ($(el).attr('src') || '').trim();
      const alt = ($(el).attr('alt') || '').toLowerCase();
      if (src && !/^data:/.test(src) && src.indexOf('favicon') < 0 && src.indexOf('logo') < 0 && (alt.indexOf('portada') >= 0 || src.indexOf('/img/') >= 0)) {
        image = absolute(src);
      }
    });
    if (!image) image = absolute($('meta[property="og:image"]').attr('content') || '');

    const metaDesc = cleanText($('meta[name="description"]').attr('content') || '');
    let desc = '';
    $('p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t.length > desc.length && t.length > 40 && t.indexOf('cookies') < 0) desc = t;
    });
    if (!desc) desc = metaDesc;

    const tags = [];
    $('a[href^="/genero/"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const status = mapStatus(metaDesc + ' ' + cleanText($('body').text().slice(0, 1200)));
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const html = await this.titleHtml(mangaId);
    const $ = cheerio.load(html);
    const prefix = `/manga/${mangaId}/`;
    const rows = [];
    const seen = new Set();
    $(`a[href^="${prefix}"]`).each((_, el) => {
      const a = $(el);
      const href = (a.attr('href') || '').trim();
      const rest = href.slice(prefix.length).replace(/\/+$/, '');
      if (!rest || rest.indexOf('/') >= 0 || /^(wiki|resenas|reseñas|comentarios)$/i.test(rest)) return;
      const rawText = cleanText(a.text());
      if (/^(leer desde el inicio|último capítulo|ultimo capitulo|reseñas|resenas)$/i.test(rawText)) return;
      if (seen.has(rest)) return;
      seen.add(rest);
      const numM = /(?:capitulo|cap|chapter|ch)[-_ ]*(\d+(?:[._-]\d+)?)/i.exec(rest) || /(\d+(?:\.\d+)?)/.exec(rawText);
      const num = numM ? parseFloat(numM[1].replace(/[_-]/g, '.')) : 0;
      const name = numM ? `Capítulo ${numM[1].replace(/[_-]/g, '.')}` : `Capítulo ${rest}`;
      rows.push({ id: rest, chapterId: rest, name, number: Number.isFinite(num) ? num : 0 });
    });
    rows.sort((a, b) => a.number - b.number);
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      return { id: r.id, chapterId: r.id, name: r.name, number };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const pages = [];
    const seen = new Set();
    $('img').each((_, el) => {
      const img = $(el);
      const src = (img.attr('src') || img.attr('data-src') || '').trim();
      const alt = (img.attr('alt') || '').toLowerCase();
      if (!src || /^data:/.test(src)) return;
      if (alt.indexOf('página') >= 0 || alt.indexOf('pagina') >= 0 || src.indexOf('WP-manga/data') >= 0) {
        const full = absolute(src);
        if (!seen.has(full)) {
          seen.add(full);
          pages.push(full);
        }
      }
    });
    if (pages.length === 0) throw new Error('ManhwaShot returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`ManhwaShot HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
