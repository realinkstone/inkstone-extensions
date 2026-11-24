const SITE_BASE = 'https://hentaimode.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
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

function relPath(href) {
  return String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
}

function parseList($) {
  const results = [];
  const seen = new Set();
  $('div.row div[class*="book-list"] > a').each((_, el) => {
    const a = $(el);
    const mangaId = relPath(a.attr('href'));
    const title = cleanText(a.find('.book-description > p').first().text());
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
      ageRating: 18,
    });
  });
  return results;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const page = (metadata && metadata.page) || 1;
    if (page > 1) return { results: [], metadata: undefined };
    const query = cleanText(request && request.title);
    if (query) {
      if (query.length < 3) return { results: [], metadata: undefined };
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/buscar?s=${encodeURIComponent(query)}`));
      return { results: parseList($), metadata: undefined };
    }
    const $ = cheerio.load(await this.requestHTML(SITE_BASE));
    return { results: parseList($), metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const url = absolute(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const infoEl = $('div#info-block > div#info').first();
    const title = cleanText(infoEl.find('h1').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('div#cover img').first().attr('src') || $('img').first().attr('src'));

    const getInfo = (label) => {
      const vals = [];
      infoEl.find('div.tag-container').each((_, el) => {
        const node = $(el);
        const clone = node.clone();
        clone.children().remove();
        if (cleanText(clone.text()).toLowerCase().includes(label.toLowerCase())) {
          node.find('a.tag').each((__, a) => {
            const t = cleanText($(a).text());
            if (t && vals.indexOf(t) === -1) vals.push(t);
          });
        }
      });
      return vals;
    };

    const tags = getInfo('Categorías');
    const people = getInfo('Grupo').concat(getInfo('Artista')).filter((p, i, a) => p && a.indexOf(p) === i);
    const descLines = [];
    ['Serie', 'Tipo', 'Personajes', 'Idioma'].forEach((k) => {
      const v = getInfo(k);
      if (v.length > 0) descLines.push(`${k}: ${v.join(', ')}`);
    });

    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE + '/',
        author: people.join(', '),
        desc: descLines.join('\n') || title,
        status: 'COMPLETED',
        completed: true,
        tags,
        webURL: url,
        medium: 'comics',
        ageRating: 18,
      },
    };
  }

  async getChapters(mangaId) {
    const cid = String(mangaId).replace(/^\/?g\//, '/leer/');
    return [{ id: cid, chapterId: cid, name: 'Capítulo 1', number: 1 }];
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.requestHTML(absolute(chapterId));
    const idx = html.indexOf('pages = [');
    const pages = [];
    if (idx >= 0) {
      const end = html.indexOf(']', idx);
      if (end > idx) {
        const chunk = html.slice(idx + 9, end);
        const re = /"([^"]+)"/g;
        let m;
        while ((m = re.exec(chunk)) !== null) {
          const u = absolute(m[1].replace(/\\\//g, '/'));
          if (u && /\.(jpe?g|png|webp|gif)/i.test(u)) pages.push(u);
        }
      }
    }
    if (pages.length === 0) throw new Error('HentaiMode returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`HentaiMode HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
