const SITE_BASE = 'https://www.anzmanga25.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'views', name: 'Popular', sortBy: 'views', asc: 'false' },
  { id: 'name', name: 'A-Z', sortBy: 'name', asc: 'true' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi)$/i;

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
  const s = (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('ongoing') || s.includes('en curso') || s.includes('emisi') || s.includes('publicand') || s.includes('activo')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finaliz') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('pausa')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonad')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseDate(text) {
  const t = cleanText(text);
  if (!t) return undefined;
  const m = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(t);
  if (m) {
    const months = { jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, oct: 9, nov: 10, dec: 11, dic: 11 };
    const mo = months[m[2].toLowerCase().slice(0, 3)];
    if (mo !== undefined) return Date.UTC(+m[3], mo, +m[1]);
  }
  const iso = Date.parse(t);
  return Number.isNaN(iso) ? undefined : iso;
}

function slugFromHref(href) {
  const m = /\/manga\/([^/?#]+)/.exec(href || '');
  return m ? m[1] : '';
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
      const html = await this.requestHTML(`${SITE_BASE}/manga-list`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('a.category, a[href*="cat="]').each((_, el) => {
        const a = $(el);
        const href = a.attr('href') || '';
        const m = /[?&]cat=(\d+)/.exec(href) || /filterList\('(\d+)'/.exec(a.attr('onclick') || '');
        const id = m ? m[1] : '';
        const label = cleanText(a.text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('AnzManga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const page = (metadata && metadata.page) || 1;

    if (query) {
      if (page > 1) return { results: [], metadata: undefined };
      const text = await this.requestHTML(`${SITE_BASE}/search?query=${encodeURIComponent(query)}`);
      let json;
      try { json = JSON.parse(text); } catch (e) { return { results: [] }; }
      const list = (json && json.suggestions) || [];
      const results = list.map((it) => ({
        mangaId: it.data,
        title: cleanText(it.value),
        image: `${SITE_BASE}/uploads/manga/${encodeURIComponent(it.data)}/cover/cover_250x350.jpg`,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/manga/${encodeURIComponent(it.data)}`,
        medium: 'comics',
      })).filter((r) => r.mangaId && r.title);
      return { results, metadata: undefined };
    }

    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    let url = `${SITE_BASE}/filterList?page=${page}&sortBy=${feed.sortBy}&asc=${feed.asc}`;
    if (tags.length > 0) url += `&cat=${encodeURIComponent(tags[0].id)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('.media').each((_, el) => {
      const card = $(el);
      const link = card.find('a.chart-title').first();
      const mangaId = slugFromHref(link.attr('href'));
      if (!mangaId || seen.has(mangaId)) return;
      const title = cleanText(link.text());
      if (!title) return;
      seen.add(mangaId);
      const img = card.find('img').first();
      const image = absolute(img.attr('src') || img.attr('data-src') || `${SITE_BASE}/uploads/manga/${mangaId}/cover/cover_250x350.jpg`);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`,
        medium: 'comics',
      });
    });
    return { results, metadata: results.length >= 20 ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('h2.widget-title').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('.boxed img').first().attr('src') || `${SITE_BASE}/uploads/manga/${mangaId}/cover/cover_250x350.jpg`);

    let statusText = '';
    let author = '';
    const tags = [];
    $('dl.dl-horizontal dt').each((_, el) => {
      const label = cleanText($(el).text()).toLowerCase();
      const dd = $(el).next('dd');
      if (label.indexOf('estado') >= 0 || label.indexOf('status') >= 0) statusText = cleanText(dd.text());
      else if (label.indexOf('autor') >= 0 || label.indexOf('author') >= 0) author = cleanText(dd.text());
      else if (label.indexOf('categor') >= 0 || label.indexOf('géner') >= 0 || label.indexOf('gener') >= 0) {
        dd.find('a').each((__, a) => {
          const t = cleanText($(a).text());
          if (t && tags.indexOf(t) < 0) tags.push(t);
        });
      }
    });

    const desc = cleanText($('.well p').first().text()) || cleanText($('.well').first().text());
    const status = mapStatus(statusText);
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author,
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
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $('ul.chapters li').each((_, el) => {
      const li = $(el);
      const a = li.find('h5 a, a').first();
      const href = (a.attr('href') || '').trim();
      const m = new RegExp(`/manga/${mangaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/?#]+)`).exec(href);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const cid = m[1];
      const titleText = cleanText(a.text());
      const subText = cleanText(li.find('h5 em').first().text());
      const name = subText ? `${titleText}: ${subText}` : titleText || `Capítulo ${cid}`;
      const numM = /(\d+(?:\.\d+)?)/.exec(cid) || /(\d+(?:\.\d+)?)/.exec(titleText);
      const number = numM ? parseFloat(numM[1]) : 0;
      const time = parseDate(li.find('.date-chapter-title-rtl').first().text());
      rows.push({ id: cid, name, number, time });
    });
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      return { id: r.id, chapterId: r.id, name: r.name, number };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    const seen = new Set();
    $('#all img.img-responsive, #all img').each((_, el) => {
      const img = $(el);
      const src = (img.attr('data-src') || img.attr('src') || '').trim();
      if (!src || /^data:/.test(src)) return;
      const full = absolute(src);
      if (!seen.has(full)) {
        seen.add(full);
        pages.push(full);
      }
    });
    if (pages.length === 0) throw new Error('AnzManga returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnzManga HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
