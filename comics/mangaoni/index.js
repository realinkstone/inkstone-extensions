const SITE_BASE = 'https://manga-oni.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'latest', name: 'Latest Updates' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|gore)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

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

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s.includes('finaliz') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('desarrollo') || s.includes('emisi') || s.includes('curso') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('paus') || s.includes('hiatus')) return 'HIATUS';
  return 'UNKNOWN';
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
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/directorio`));
      const tags = [];
      const seen = new Set();
      $('select[name="genero"] option').each((_, el) => {
        const id = cleanText($(el).attr('value'));
        const label = cleanText($(el).text());
        if (!id || id === 'false' || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
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

    if (query) {
      const url = `${SITE_BASE}/buscar?q=${encodeURIComponent(query)}&p=${page}`;
      const $ = cheerio.load(await this.requestHTML(url));
      const results = [];
      const seen = new Set();
      $('#article-div > div').each((_, el) => {
        const box = $(el);
        let title = '';
        let href = '';
        box.find('a').each((__, a) => {
          const t = cleanText($(a).text());
          if (!href) href = $(a).attr('href') || '';
          if (t && !title) {
            title = t;
            href = $(a).attr('href') || href;
          }
        });
        const mangaId = relPath(href);
        const img = box.find('img').first();
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
        });
      });
      const hasNext = $('ul.pagination a[rel="next"]').length > 0 && results.length > 0;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    if (feed.id === 'latest' && tags.length === 0) {
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/recientes?p=${page}`));
      const results = [];
      const seen = new Set();
      $('div._1bJU3').each((_, el) => {
        const box = $(el);
        const a = box.find('a[data-test="latest-update-name"]').first();
        const mangaId = relPath(a.attr('href'));
        const title = cleanText(a.text());
        const img = box.find('img').first();
        const image = absolute(img.attr('data-src') || img.attr('src'));
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
      const hasNext = $('ul.pagination a[rel="next"]').length > 0 && results.length > 0;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const genreParam = tags.length > 0 ? encodeURIComponent(tags[0].id) : 'false';
    const url = `${SITE_BASE}/directorio?genero=${genreParam}&estado=false&filtro=visitas&tipo=false&adulto=false&orden=desc&p=${page}`;
    const $ = cheerio.load(await this.requestHTML(url));
    const results = [];
    const seen = new Set();
    $('#article-div a').each((_, el) => {
      const a = $(el);
      const mangaId = relPath(a.attr('href'));
      const divs = a.find('div');
      const title = cleanText(divs.eq(1).text()) || cleanText(a.attr('title')) || cleanText(a.text());
      const img = a.find('img').first();
      const image = absolute(img.attr('data-src') || img.attr('src'));
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
    const hasNext = $('ul.pagination a[rel="next"]').length > 0 && results.length > 0;
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
    const title = cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('img[src*="cover"]').first().attr('src') || $('img').first().attr('src'));
    const sinopsis = $('div#sinopsis');
    const desc = cleanText(sinopsis.last().text()) || title;
    const infoText = cleanText($('div#info-i').text());
    let author = '';
    const am = /Autor\s*:\s*([^:]+?)(?:\s+Fecha\s*:|$)/i.exec(infoText);
    if (am) author = cleanText(am[1]);
    const tags = [];
    $('div#categ a').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });
    let status = 'UNKNOWN';
    $('strong').each((_, el) => {
      if (cleanText($(el).text()).toLowerCase().includes('estado')) {
        const nextText = cleanText($(el).next('span').text());
        if (nextText) status = mapStatus(nextText);
      }
    });
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author,
      desc,
      status,
      completed: status === 'COMPLETED',
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
    $('div#c_list a').each((_, el) => {
      const a = $(el);
      const cid = relPath(a.attr('href'));
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      const name = cleanText(a.text()) || cid;
      const sp = a.find('span').first();
      const dataNum = parseFloat(sp.attr('data-num'));
      const numM = /(\d+(?:\.\d+)?)/.exec(name);
      const number = Number.isFinite(dataNum) ? dataNum : (numM ? parseFloat(numM[1]) : 0);
      const dt = cleanText(sp.attr('datetime'));
      const time = dt ? Date.parse(dt.replace(' ', 'T') + 'Z') : undefined;
      rows.push({
        id: cid,
        chapterId: cid,
        name,
        number,
        time: Number.isFinite(time) ? time : undefined,
      });
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
    const html = await this.requestHTML(absolute(chapterId));
    const m = /unicap\s*=\s*'([^']+)'/.exec(html) || /unicap\s*=\s*"([^"]+)"/.exec(html);
    if (!m) throw new Error('MangaOni: unicap payload not found');
    const raw = m[1];
    const drop = raw.length % 4;
    const trimmed = drop > 0 ? raw.slice(0, raw.length - drop) : raw;
    const decoded = App.base64Decode(trimmed);
    const sep = decoded.indexOf('||');
    const path = sep >= 0 ? decoded.slice(0, sep) : '';
    const lb = decoded.indexOf('[');
    const rb = decoded.indexOf(']', lb + 1);
    if (lb < 0 || rb < 0) throw new Error('MangaOni: pages array not found');
    const listStr = decoded.slice(lb + 1, rb);
    const pages = listStr
      .split(',')
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
      .map((file) => absolute(path + file));
    if (pages.length === 0) throw new Error('MangaOni returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`MangaOni HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
