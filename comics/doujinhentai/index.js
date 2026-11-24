const SITE_BASE = 'https://doujinhentai.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'last', name: 'Latest Updates' },
  { id: 'views', name: 'Popular' },
];

const MONTHS_EN = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

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

function parseList($) {
  const results = [];
  const seen = new Set();
  $('div.group.bg-white.rounded-2xl a.block').each((_, el) => {
    const a = $(el);
    const mangaId = relPath(a.attr('href'));
    const title = cleanText(a.find('h3.font-bold').first().text());
    const img = a.find('img').first();
    const image = absolute(img.attr('src') || img.attr('data-src'));
    if (!mangaId || !title || !image || seen.has(mangaId)) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      webURL: absolute(mangaId),
      medium: 'comics',
      ageRating: 18,
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
    try {
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/lista-manga-hentai`));
      const tags = [];
      const seen = new Set();
      $('a[href*="/lista-manga-hentai/category/"]').each((_, el) => {
        const a = $(el);
        const m = /\/lista-manga-hentai\/category\/([^/?#]+)/.exec(a.attr('href') || '');
        const label = cleanText(a.text());
        if (!m || !label || seen.has(m[1])) return;
        seen.add(m[1]);
        tags.push({ id: m[1], label });
      });
      return tags;
    } catch (e) {
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}/lista-manga-hentai?search=${encodeURIComponent(query)}&page=${page}`;
    } else if (tags.length > 0) {
      url = `${SITE_BASE}/lista-manga-hentai/category/${encodeURIComponent(tags[0].id)}?page=${page}`;
    } else {
      url = `${SITE_BASE}/lista-manga-hentai?orderby=${encodeURIComponent(feed.id)}&page=${page}`;
    }
    const $ = cheerio.load(await this.requestHTML(url));
    const results = parseList($);
    const hasNext = $('a[rel="next"]').length > 0 && results.length > 0;
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
    const main = $('main#main-content').first().length ? $('main#main-content').first() : $('body');
    const title = cleanText(main.find('h1').first().text()) || mangaId;
    const image = absolute(main.find('figure img').first().attr('src') || main.find('img').first().attr('src'));

    const people = [];
    main.find('a[rel="author"], a[href*="/artist/"]').each((_, el) => {
      const p = cleanText($(el).text());
      if (p && people.indexOf(p) === -1) people.push(p);
    });

    const tags = [];
    main.find('a[rel="tag"][href*="/category/"], a[rel="tag"][href*="/tag/"]').each((_, el) => {
      const g = cleanText($(el).text()).replace(/^#/, '');
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });

    const desc = cleanText(main.find('div.prose').first().text()) || title;
    const stText = cleanText(main.find('span[aria-label^="Estado"]').first().text()).toLowerCase();
    let status = 'UNKNOWN';
    if (stText.includes('ongoing') || stText.includes('en curso')) status = 'ONGOING';
    else if (stText.includes('complet')) status = 'COMPLETED';

    return {
      mangaInfo: {
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
        ageRating: 18,
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $('div.flex.items-center.gap-4.p-3.mb-2.border.rounded-lg').each((_, el) => {
      const box = $(el);
      const a = box.find('div.flex-1 > a.font-bold').first().length
        ? box.find('div.flex-1 > a.font-bold').first()
        : box.find('div.flex-1 a').first();
      const cid = relPath(a.attr('href'));
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      const baseName = cleanText(a.text()).replace(/^Leer\s+/i, '');
      const sub = cleanText(box.find('div.flex-1 div.text-sm.font-medium').first().text());
      const name = (sub && sub !== baseName ? `${baseName}: ${sub}` : baseName) || cid;
      const numM = /(\d+(?:\.\d+)?)/.exec(name);
      const number = numM ? parseFloat(numM[1]) : 0;
      const group = cleanText(box.find('div.text-sm.text-right a[href*="/user/"]').first().text()) || undefined;
      const dateText = cleanText(box.find('div.text-sm.text-right span.font-medium').last().text());
      const time = parseDateEn(dateText);
      rows.push({ id: cid, chapterId: cid, name, number, time, group });
    });
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      if (r.group) ch.group = r.group;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.requestHTML(absolute(chapterId));
    let pages = [];
    const m = /pageUrls\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html);
    if (m) {
      try {
        const obj = JSON.parse(m[1]);
        pages = Object.keys(obj)
          .map((k) => ({ idx: parseInt(k, 10) || 0, url: absolute(obj[k]) }))
          .sort((a, b) => a.idx - b.idx)
          .map((p) => p.url)
          .filter(Boolean);
      } catch (e) {}
    }
    if (pages.length === 0) {
      const $ = cheerio.load(html);
      $('div#vertical-pages-container div[data-page] img').each((_, el) => {
        const src = cleanText($(el).attr('src') || $(el).attr('data-src'));
        if (src) pages.push(absolute(src));
      });
    }
    if (pages.length === 0) throw new Error('DoujinHentai returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`DoujinHentai HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
