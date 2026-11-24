const CONFIG = {
  "name": "Seinagi",
  "origin": "https://online.seinagi.org.es",
  "adult": false
};
const SITE_BASE = CONFIG.origin;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'directory', name: 'Directory', path: '/directory/' },
  { id: 'latest', name: 'Latest Updates', path: '/latest/' },
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

function slugFromSeries(href) {
  const m = /\/series\/([^/?#]+)/.exec(href || '');
  return m ? m[1] : '';
}

function parseList($) {
  const results = [];
  const seen = new Set();
  $('.list .group').each((_, el) => {
    const g = $(el);
    const titleLink = g.find('.title a[href*="/series/"]').first();
    const link = titleLink.length ? titleLink : g.find('a[href*="/series/"]').first();
    const mangaId = slugFromSeries(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(link.text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    const img = g.find('img.preview').first();
    const src = img.attr('src') || img.attr('data-src') || '';
    const image = src && !/glyphish|facebook|feed-icon|bird_/i.test(src) ? absolute(src) : '';
    const item = {
      mangaId,
      title,
      image,
      referer: SITE_BASE + '/',
      webURL: `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    };
    if (CONFIG.adult) item.ageRating = 18;
    results.push(item);
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

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;

    let html;
    if (query) {
      if (page > 1) return { results: [], metadata: undefined };
      const response = await this.requests.schedule(App.createRequest({
        url: `${SITE_BASE}/search/`,
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: SITE_BASE + '/' },
        body: `search=${encodeURIComponent(query)}`,
      }));
      if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
      html = response.data;
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      const url = page > 1 ? `${SITE_BASE}${feed.path}${page}/` : `${SITE_BASE}${feed.path}`;
      try {
        html = await this.requestHTML(url);
      } catch (e) {
        if (page > 1) return { results: [], metadata: undefined };
        throw e;
      }
    }
    const $ = cheerio.load(html);
    const listed = parseList($);
    const results = (await Promise.all(listed.map(async (item) => {
      if (item.image) return item;
      try {
        const page = cheerio.load(await this.titleHtml(item.mangaId));
        return { ...item, image: absolute(page('.thumbnail img, .comic img, img.preview').first().attr('src') || '') };
      } catch (e) {
        return item;
      }
    }))).filter((item) => item.image || query);
    const hasNext = !query && $('.next a, a.gbutton.fright').length > 0 && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/series/${encodeURIComponent(mangaId)}/`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/`;
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('h1.title').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const imgSrc = $('.thumbnail img, .comic img, img.preview').first().attr('src') || '';
    const image = absolute(imgSrc);
    const infoText = cleanText($('.info').first().text());
    const authM = /(?:Autor|Author)\s*:\s*([^:]+?)(?:\s+(?:Artista|Artist|Sinopsis|Synopsis|Descripción)|$)/i.exec(infoText);
    const descM = /(?:Sinopsis|Synopsis|Descripción)\s*:\s*(.+)$/i.exec(infoText);
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: authM ? cleanText(authM[1]) : '',
      desc: descM ? cleanText(descM[1]) : infoText || title,
      status: 'UNKNOWN',
      tags: [],
      webURL: url,
      medium: 'comics',
    };
    if (CONFIG.adult) info.ageRating = 18;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $('.list .element').each((_, el) => {
      const box = $(el);
      const a = box.find('.title a[href*="/read/"]').first();
      const href = (a.attr('href') || '').trim();
      const m = /\/read\/(.+?)\/?$/.exec(href);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const cid = m[1].replace(/\//g, '~');
      const name = cleanText(a.text()) || m[1];
      const numM = /(\d+(?:\.\d+)?)/.exec(name) || /\/(\d+)(?:\/(\d+))?$/.exec(m[1]);
      const number = numM ? parseFloat(numM[2] ? `${numM[1]}.${numM[2]}` : numM[1]) : 0;
      rows.push({ id: cid, chapterId: cid, name, number });
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
    const path = String(chapterId).split('~').map(encodeURIComponent).join('/');
    const url = `${SITE_BASE}/read/${path}/`;
    const html = await this.requestHTML(url);
    let pages = [];
    const m = /var\s+pages\s*=\s*(\[[\s\S]*?\])\s*;/.exec(html);
    if (m) {
      try {
        const arr = JSON.parse(m[1]);
        pages = arr.map((p) => absolute(p && (p.url || p))).filter(Boolean);
      } catch (e) {}
    }
    if (pages.length === 0) {
      const b64m = /atob\(["']([^"']+)["']\)/.exec(html);
      if (b64m) {
        try {
          const arr = JSON.parse(App.base64Decode(b64m[1]));
          pages = arr.map((p) => absolute(p && (p.url || p))).filter(Boolean);
        } catch (e) {}
      }
    }
    if (pages.length === 0) throw new Error(CONFIG.name + ' returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
