const SITE_BASE = 'https://tmomanhwa.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', path: '/biblioteca/' },
  { id: 'adult', name: 'Manhwa +18', path: '/leer-manhwa-18/' },
];

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

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.includes('finaliz') || s.includes('complet') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('pausa') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonad')) return 'CANCELLED';
  if (s.includes('emisi') || s.includes('curso') || s.includes('public') || s.includes('ongoing')) return 'ONGOING';
  return 'UNKNOWN';
}

function parseList($) {
  const results = [];
  const seen = new Set();
  $('a[href*="/manhwa/"]').each((_, el) => {
    const a = $(el);
    const href = (a.attr('href') || '').trim();
    const m = /\/manhwa\/([^/?#]+)\/?$/.exec(href);
    if (!m) return;
    const mangaId = m[1];
    if (!mangaId || seen.has(mangaId)) return;
    const card = a.closest('article, .item, .card, li, div');
    const img = a.find('img').first().length ? a.find('img').first() : card.find('img').first();
    if (!img.length) return;
    const image = absolute(img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '');
    if (!image || /^data:/.test(image)) return;
    const title = cleanText(a.attr('title')) || cleanText(img.attr('alt')) || cleanText(card.find('h2, h3, h4, .title').first().text()) || cleanText(a.text());
    if (!title) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      ageRating: 18,
      webURL: `${SITE_BASE}/manhwa/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($, page) {
  let found = false;
  $('a[href*="page="], a[href*="/page/"], a.next, a[rel="next"]').each((_, el) => {
    const a = $(el);
    if (a.hasClass('next') || a.attr('rel') === 'next') {
      found = true;
      return;
    }
    const href = a.attr('href') || '';
    const m = /(?:[?&]page=|\/page\/)(\d+)/.exec(href);
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

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}/search/?s=${encodeURIComponent(query)}` + (page > 1 ? `&page=${page}` : '');
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      url = page > 1 ? `${SITE_BASE}${feed.path}page/${page}/` : `${SITE_BASE}${feed.path}`;
    }

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1 || query) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parseList($);
    return { results, metadata: results.length > 0 && hasNextPage($, page) ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/manhwa/${encodeURIComponent(mangaId)}/`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manhwa/${encodeURIComponent(mangaId)}/`;
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('h1').first().text()) || mangaId;
    let image = absolute($('meta[property="og:image"]').attr('content') || '');
    if (!image) {
      $('img').each((_, el) => {
        if (image) return;
        const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
        if (src && !/^data:/.test(src) && !/logo|icon|avatar/i.test(src)) image = absolute(src);
      });
    }
    let desc = '';
    $('p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t.length > desc.length && t.length > 35 && t.indexOf('cookies') < 0) desc = t;
    });
    if (!desc) desc = cleanText($('meta[name="description"]').attr('content') || '');
    const tags = [];
    $('a[href*="/genero/"], a[href*="/genre/"], .genres a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const status = mapStatus(cleanText($('body').text().slice(0, 1500)));
    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE + '/',
        desc,
        status,
        completed: status === 'COMPLETED',
        tags,
        ageRating: 18,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const escaped = mangaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`/manhwa/${escaped}/([^/?#]+)`);
    const rows = [];
    const seen = new Set();
    $('a[href*="/manhwa/"]').each((_, el) => {
      const a = $(el);
      const href = (a.attr('href') || '').trim();
      const m = re.exec(href);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const cid = m[1];
      const rawText = cleanText(a.text());
      const numM = /(\d+(?:\.\d+)?)/.exec(cid) || /(\d+(?:\.\d+)?)/.exec(rawText);
      const number = numM ? parseFloat(numM[1]) : 0;
      const name = rawText && rawText.length < 70 && !/^(leer|empezar|primero|último)/i.test(rawText) ? rawText : `Capítulo ${number || cid}`;
      rows.push({ id: cid, chapterId: cid, name, number });
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
    const url = `${SITE_BASE}/manhwa/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    const seen = new Set();
    $('img').each((_, el) => {
      const src = ($(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src') || '').trim();
      if (!src || /^data:/.test(src) || !/\.(?:webp|jpe?g|png)(?:\?|$)/i.test(src)) return;
      if (/logo|icon|avatar|banner|cover/i.test(src)) return;
      const full = absolute(src);
      if (!seen.has(full)) {
        seen.add(full);
        pages.push(full);
      }
    });
    if (pages.length === 0) throw new Error('TmoManhwa returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`TmoManhwa HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
