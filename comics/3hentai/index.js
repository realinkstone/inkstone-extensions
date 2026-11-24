const SITE_BASE = 'https://es.3hentai.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', path: '/' },
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

function parseList($) {
  const results = [];
  const seen = new Set();
  $('.doujin-col .doujin, a[href*="/d/"]').each((_, el) => {
    const box = $(el);
    const a = box.is('a') ? box : box.find('a[href*="/d/"]').first();
    const href = (a.attr('href') || '').trim();
    const m = /\/d\/(\d+)\/?$/.exec(href);
    if (!m || seen.has(m[1])) return;
    const mangaId = m[1];
    const img = box.find('img').first();
    if (!img.length) return;
    const image = absolute(img.attr('data-src') || img.attr('src') || '');
    if (!image || /^data:/.test(image)) return;
    const title = cleanText(box.find('.title').first().text()) || cleanText(a.attr('title')) || cleanText(img.attr('alt')) || mangaId;
    if (!title) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      ageRating: 18,
      webURL: `${SITE_BASE}/d/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($, page) {
  let found = false;
  $('a.page-link, a[rel="next"]').each((_, el) => {
    const a = $(el);
    if (a.attr('rel') === 'next') {
      found = true;
      return;
    }
    const href = a.attr('href') || '';
    const m = /[?&]page=(\d+)/.exec(href) || /\/(\d+)\/?$/.exec(href);
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
      url = `${SITE_BASE}/search?q=${encodeURIComponent(query)}` + (page > 1 ? `&page=${page}` : '');
    } else {
      url = page > 1 ? `${SITE_BASE}/${page}` : `${SITE_BASE}/`;
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
    const html = await this.requestHTML(`${SITE_BASE}/d/${encodeURIComponent(mangaId)}`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/d/${encodeURIComponent(mangaId)}`;
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('h1').first().text()) || mangaId;
    const coverEl = $('img[data-src*="cover."], img[src*="cover."]').first();
    const image = absolute(coverEl.attr('data-src') || coverEl.attr('src') || $('meta[property="og:image"]').attr('content') || '');
    const tags = [];
    $('.tag-container a.name, a[href*="/tags/"]').each((_, el) => {
      const t = cleanText($(el).text()).replace(/\s*\(\d+\)\s*$/, '').trim();
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const artists = [];
    $('a[href*="/artists/"]').each((_, el) => {
      const t = cleanText($(el).text()).replace(/\s*\(\d+\)\s*$/, '').trim();
      if (t && artists.indexOf(t) < 0) artists.push(t);
    });
    const pageCount = $('#main-content .single-thumb, .listing-container .single-thumb').length;
    const desc = tags.length ? `Tags: ${tags.slice(0, 12).join(', ')}` + (pageCount ? ` (${pageCount} páginas)` : '') : title;
    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE + '/',
        author: artists.join(', '),
        desc,
        status: 'COMPLETED',
        completed: true,
        tags,
        ageRating: 18,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const count = $('.single-thumb img').length;
    const name = count ? `Capítulo 1 (${count} páginas)` : 'Capítulo 1';
    return [{ id: '1', chapterId: '1', name, number: 1 }];
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const pages = [];
    const seen = new Set();
    $('.single-thumb img').each((_, el) => {
      const raw = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
      if (!raw || /^data:/.test(raw) || /cover\./i.test(raw)) return;
      const full = absolute(raw.replace(/(\d+)t(\.[a-z0-9]+)(?:\?.*)?$/i, '$1$2'));
      if (!seen.has(full)) {
        seen.add(full);
        pages.push(full);
      }
    });
    if (pages.length === 0) throw new Error('3Hentai returned no pages for this gallery');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`3Hentai HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
