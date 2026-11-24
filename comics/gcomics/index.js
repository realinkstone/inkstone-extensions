const SITE_BASE = 'https://gcomics.online';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'all', name: 'All Series' },
  { id: 'webtoons', name: 'Webtoons' },
  { id: 'comics', name: 'Comics' },
];

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.indexOf('http://') === 0) return 'https://' + u.slice(7);
  if (/^https:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function relPath(href) {
  const p = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '');
  return p ? p + '/' : '';
}

function titleFromPath(path) {
  const slug = path.replace(/^\/+|\/+$/g, '').split('/').pop() || '';
  const spaced = slug.replace(/-/g, ' ');
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : slug;
}

class Source {
  constructor() {
    this.catalogCache = null;
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async loadCatalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 300000) return this.catalogCache;
    const [homeHtml, comicsHtml] = await Promise.all([
      this.requestHTML(SITE_BASE),
      this.requestHTML(`${SITE_BASE}/comics/`),
    ]);
    const parse = (html, selector, kind) => {
      const $ = cheerio.load(html);
      const out = [];
      const seen = new Set();
      $(selector).each((_, el) => {
        const a = $(el);
        const mangaId = relPath(a.attr('href'));
        const image = absolute(a.find('img').first().attr('src') || a.find('img').first().attr('data-src'));
        if (!mangaId || !image || seen.has(mangaId)) return;
        seen.add(mangaId);
        out.push({
          mangaId,
          title: titleFromPath(mangaId),
          image,
          referer: SITE_BASE + '/',
          webURL: absolute(mangaId),
          medium: 'comics',
          _kind: kind,
        });
      });
      return out;
    };
    const webtoons = parse(homeHtml, '.biblio a[href*="/serie/"]', 'webtoons');
    const comics = parse(comicsHtml, 'main .wp-caption a:has(img)', 'comics');
    this.catalogCache = { at: Date.now(), webtoons, comics };
    return this.catalogCache;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const page = (metadata && metadata.page) || 1;
    if (page > 1) return { results: [], metadata: undefined };
    const query = cleanText(request && request.title).toLowerCase();
    const feed = (request && request.feed) || 'all';
    const { webtoons, comics } = await this.loadCatalog();
    const list = feed === 'webtoons' ? webtoons : (feed === 'comics' ? comics : webtoons.concat(comics));
    const results = list
      .filter((it) => !query || it.title.toLowerCase().includes(query))
      .map(({ _kind, ...rest }) => rest);
    return { results, metadata: undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(absolute(mangaId));
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const html = await this.titleHtml(mangaId);
    const $ = cheerio.load(html);
    if (mangaId.indexOf('/serie/') === 0) {
      const title = cleanText($('main h2').first().text()) || titleFromPath(mangaId);
      const authors = [];
      $('main a[href*="/autor/"]').each((_, el) => {
        const a = cleanText($(el).text());
        if (a && authors.indexOf(a) === -1) authors.push(a);
      });
      const desc = cleanText($('main .taxo-description').first().text()) || title;
      const image = absolute($('main img.taxo-banner, main img').first().attr('src'));
      return {
        mangaInfo: {
          title,
          image,
          referer: SITE_BASE + '/',
          author: authors.join(', '),
          desc,
          status: 'UNKNOWN',
          tags: [],
          webURL: absolute(mangaId),
          medium: 'comics',
        },
      };
    }
    const pageTitle = cleanText($('title').first().text()).replace(/\s*-\s*Gcomics\s*$/i, '') || titleFromPath(mangaId);
    const image = absolute($('main img').first().attr('src'));
    return {
      mangaInfo: {
        title: pageTitle,
        image,
        referer: SITE_BASE + '/',
        author: '',
        desc: pageTitle,
        status: 'COMPLETED',
        completed: true,
        tags: [],
        webURL: absolute(mangaId),
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    if (mangaId.indexOf('/serie/') === 0) {
      const rows = [];
      const seen = new Set();
      $('main a.ep-container').each((_, el) => {
        const a = $(el);
        const cid = relPath(a.attr('href'));
        if (!cid || seen.has(cid)) return;
        seen.add(cid);
        const name = cleanText(a.find('.texto').first().text()) || cleanText(a.text()) || cid;
        const numM = /(\d+(?:\.\d+)?)/.exec(name);
        rows.push({ id: cid, chapterId: cid, name, number: numM ? parseFloat(numM[1]) : 0 });
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
    const pageTitle = cleanText($('title').first().text()).replace(/\s*-\s*Gcomics\s*$/i, '') || titleFromPath(mangaId);
    return [{ id: mangaId, chapterId: mangaId, name: pageTitle, number: 1 }];
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.requestHTML(absolute(chapterId)));
    const sel = chapterId.indexOf('/webtoon/') === 0 ? 'main img.webtoon-item' : 'main img';
    const pages = [];
    $(sel).each((_, el) => {
      const src = cleanText($(el).attr('src') || $(el).attr('data-src'));
      if (src) pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error('Gcomics returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Gcomics HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
