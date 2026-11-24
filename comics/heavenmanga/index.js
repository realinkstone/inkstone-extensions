const SITE_BASE = 'https://heavenmanga.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Popular' },
];

const GENRES = [
  ['accion', 'Acción'], ['adulto', 'Adulto'], ['artes-marciales', 'Artes Marciales'],
  ['aventura', 'Aventura'], ['comedia', 'Comedia'], ['drama', 'Drama'],
  ['ecchi', 'Ecchi'], ['fantasia', 'Fantasía'], ['gore', 'Gore'],
  ['harem', 'Harem'], ['hentai', 'Hentai'], ['historico', 'Histórico'],
  ['horror', 'Horror'], ['josei', 'Josei'], ['magia', 'Magia'],
  ['mecha', 'Mecha'], ['misterio', 'Misterio'], ['psicologico', 'Psicológico'],
  ['romance', 'Romance'], ['seinen', 'Seinen'], ['shojo', 'Shojo'],
  ['shonen', 'Shonen'], ['sobrenatural', 'Sobrenatural'], ['tragedia', 'Tragedia'],
  ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
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
  return String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '');
}

function parseGrid($) {
  const results = [];
  const seen = new Set();
  $('div.page-item-detail').each((_, el) => {
    const card = $(el);
    const a = card.find('a').first();
    const mangaId = relPath(a.attr('href'));
    const title = cleanText(card.find('div.manga-name').first().text()) || cleanText(a.attr('title'));
    const img = card.find('img').first();
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
  return results;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    if (query) {
      if (query.length < 2) return { results: [], metadata: undefined };
      const url = page > 1
        ? `${SITE_BASE}/buscar?query=${encodeURIComponent(query)}&pages=${page}`
        : `${SITE_BASE}/buscar?query=${encodeURIComponent(query)}`;
      const $ = cheerio.load(await this.requestHTML(url));
      const results = [];
      const seen = new Set();
      $('div.c-tabs-item__content').each((_, el) => {
        const card = $(el);
        const a = card.find('h4 a').first();
        const mangaId = relPath(a.attr('href'));
        const title = cleanText(a.text());
        const img = card.find('img').first();
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

    if (tags.length > 0) {
      const gUrl = page > 1
        ? `${SITE_BASE}/genero/${encodeURIComponent(tags[0].id)}.html?pages=${page}`
        : `${SITE_BASE}/genero/${encodeURIComponent(tags[0].id)}.html`;
      const $ = cheerio.load(await this.requestHTML(gUrl));
      const results = parseGrid($);
      const hasNext = $('ul.pagination a[rel="next"]').length > 0 && results.length > 0;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const order = feed.id === 'latest' ? 'latest' : 'views';
    const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/top?orderby=${order}&pages=${page}`));
    const results = parseGrid($);
    const hasNext = $('ul.pagination a[rel="next"]').length > 0 && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = absolute(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const ogTitle = cleanText($('meta[property="og:title"]').attr('content'))
      .replace(/\s+Espa[ñn]ol\s+Online.*$/i, '')
      .replace(/\s*\|.*$/, '')
      .trim();
    const h1Text = cleanText($('div.post-title h1, div.post-title h3, h1').first().text());
    const safeH1 = h1Text && !/verificaci[oó]n|verificando|edad\s+adulta/i.test(h1Text) ? h1Text : '';
    const title = ogTitle || safeH1 || mangaId.split('/').pop().replace(/-/g, ' ');
    const img = $('div.tab-summary div.summary_image img, div.summary_image img').first();
    const image = absolute(img.attr('data-src') || img.attr('src'));
    const tags = [];
    $('div.tab-summary div.genres-content a, div.genres-content a').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });
    const desc = cleanText($('div.description-summary p').text()) || title;
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: '',
      desc,
      status: 'UNKNOWN',
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const base = absolute(mangaId);
    const qs =
      'columns[0][data]=number&columns[0][orderable]=true' +
      '&columns[1][data]=created_at&columns[1][searchable]=true' +
      '&order[0][column]=1&order[0][dir]=desc&start=0&length=99999';
    const response = await this.requests.schedule(App.createRequest({
      url: `${base}?${qs}`,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: base, 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`HeavenManga HTTP ${response.status}`);
    const json = JSON.parse(response.data);
    const list = Array.isArray(json && json.data) ? json.data : [];
    const rows = [];
    const seen = new Set();
    list.forEach((c) => {
      if (!c || !c.id) return;
      const cid = String(c.id);
      if (seen.has(cid)) return;
      seen.add(cid);
      const slug = cleanText(c.slug || cid);
      const numM = /(\d+(?:\.\d+)?)/.exec(slug);
      const number = numM ? parseFloat(numM[1]) : 0;
      const time = c.created_at ? Date.parse(String(c.created_at).replace(' ', 'T') + 'Z') : undefined;
      rows.push({
        id: cid,
        chapterId: cid,
        name: `Capítulo ${slug}`,
        number,
        time: Number.isFinite(time) ? time : undefined,
      });
    });
    rows.sort((a, b) => a.number - b.number);
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
    const html = await this.requestHTML(`${SITE_BASE}/manga/ver/${encodeURIComponent(chapterId)}`);
    const m = /var\s+pUrl\s*=\s*(\[[\s\S]*?\])\s*;/.exec(html);
    let pages = [];
    if (m) {
      const cleaned = m[1].replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
      try {
        const arr = JSON.parse(cleaned);
        pages = arr.map((p) => absolute(p && p.imgURL)).filter(Boolean);
      } catch (e) {}
    }
    if (pages.length === 0) throw new Error('HeavenManga returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`HeavenManga HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
