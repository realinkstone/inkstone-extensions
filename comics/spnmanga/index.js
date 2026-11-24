const SITE_BASE = 'https://www.spnmanga.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', sort: 'latest' },
  { id: 'popular', name: 'Popular', sort: 'popular' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi)$/i;

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
  if (s.includes('complet') || s.includes('finaliz') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('pausa') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonad')) return 'CANCELLED';
  if (s.includes('curso') || s.includes('emisi') || s.includes('ongoing') || s.includes('public')) return 'ONGOING';
  return 'UNKNOWN';
}

function parseBrowse($) {
  const results = [];
  const seen = new Set();
  $('a[href^="/leer/"]').each((_, el) => {
    const a = $(el);
    const href = (a.attr('href') || '').trim();
    const m = /^\/leer\/([^/]+)\/([^/]+)\/?$/.exec(href);
    if (!m) return;
    const mangaId = `${m[1]}~${m[2]}`;
    if (seen.has(mangaId)) return;
    const card = a.closest('article, .manga-card, .card, li, div');
    const img = a.find('img').first().length ? a.find('img').first() : card.find('img').first();
    if (!img.length) return;
    const image = absolute(img.attr('data-src') || img.attr('src') || '');
    if (!image || /^data:/.test(image)) return;
    const title = (cleanText(a.attr('title')) || cleanText(img.attr('alt')) || cleanText(card.find('h2, h3, h4, .title').first().text()) || cleanText(a.text())).replace(/\s+(?:cover|portada)$/i, '').trim();
    if (!title) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      webURL: `${SITE_BASE}/leer/${m[1]}/${m[2]}/`,
      medium: 'comics',
    });
  });
  return results;
}

function detailUrlOf(mangaId) {
  const parts = String(mangaId).split('~');
  return `${SITE_BASE}/leer/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1] || '')}/`;
}

function hasNextPage($, page) {
  let found = false;
  $('a[href*="page="]').each((_, el) => {
    const m = /[?&]page=(\d+)/.exec($(el).attr('href') || '');
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
      const html = await this.requestHTML(`${SITE_BASE}/browse/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('a[href*="/browse/?genre="], option[value]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        const m = /[?&]genre=([^&]+)/.exec(href);
        if (!m) return;
        const id = decodeURIComponent(m[1]).trim();
        const label = cleanText($(el).text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('SpnManga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    const params = [`page=${page}`];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    else if (feed.sort === 'popular') params.push('sort=popular');
    if (tags.length > 0) params.push(`genre=${encodeURIComponent(tags[0].id)}`);

    let html;
    try {
      html = await this.requestHTML(`${SITE_BASE}/browse/?${params.join('&')}`);
    } catch (e) {
      if (page > 1 || query) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parseBrowse($);
    return { results, metadata: results.length > 0 && hasNextPage($, page) ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(detailUrlOf(mangaId));
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('h1').first().text()) || mangaId;
    let image = absolute($('meta[property="og:image"]').attr('content') || '');
    if (!image) {
      $('img').each((_, el) => {
        if (image) return;
        const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
        if (src && !/^data:/.test(src) && src.indexOf('logo') < 0 && src.indexOf('icon') < 0) image = absolute(src);
      });
    }
    const tags = [];
    $('a[href*="/browse/?genre="]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    let desc = '';
    $('p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t.length > desc.length && t.length > 40 && t.indexOf('cookies') < 0) desc = t;
    });
    if (!desc) desc = cleanText($('meta[name="description"]').attr('content') || '');
    const status = mapStatus(cleanText($('body').text().slice(0, 1500)));
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
    const parts = String(mangaId).split('~');
    const prefix = `/leer/${parts[0]}/${parts[1] || ''}/`;
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $(`a[href^="${prefix}"]`).each((_, el) => {
      const a = $(el);
      const href = (a.attr('href') || '').trim();
      const rest = href.slice(prefix.length).replace(/\/+$/, '').split(/[?#]/)[0];
      if (!rest || seen.has(rest)) return;
      const rawText = cleanText(a.text());
      if (/^(start with|latest\b|leer desde|último cap|ultimo cap)/i.test(rawText)) return;
      seen.add(rest);
      const numM = /(\d+(?:\.\d+)?)/.exec(rest) || /(\d+(?:\.\d+)?)/.exec(rawText);
      const num = numM ? parseFloat(numM[1]) : 0;
      const name = numM ? `Capítulo ${numM[1]}` : (rawText && rawText.length < 50 ? rawText : `Capítulo ${rest}`);
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
    const url = `${detailUrlOf(mangaId)}${encodeURIComponent(chapterId)}/`;
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    const seen = new Set();
    $('img').each((_, el) => {
      const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
      if (!src || /^data:/.test(src) || !/\.(?:webp|jpe?g|png)(?:\?|$)/i.test(src)) return;
      if (/logo|icon|avatar|banner|cover/i.test(src)) return;
      const full = absolute(src);
      if (!seen.has(full)) {
        seen.add(full);
        pages.push(full);
      }
    });
    if (pages.length === 0) throw new Error('SpnManga returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`SpnManga HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
