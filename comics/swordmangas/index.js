const SITE_BASE = 'https://swordmangas.com';
const LANG_PATH = 'esp';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'latest', name: 'Latest Updates' },
];

const GENRES = [
  ['accion', 'Acción'], ['apocaliptico', 'Apocalíptico'], ['artes marciales', 'Artes Marciales'],
  ['aventura', 'Aventura'], ['batalla', 'Batalla'], ['comedia', 'Comedia'],
  ['deportes', 'Deportes'], ['drama', 'Drama'], ['fantasia', 'Fantasía'],
  ['guerra', 'Guerra'], ['medicina', 'Medicina'], ['murim', 'Murim'],
  ['ocultismo', 'Ocultismo'], ['reencarnacion', 'Reencarnación'], ['romance', 'Romance'],
  ['sistema', 'Sistema'], ['superheroe', 'Superhéroe'], ['venganza', 'Venganza'],
  ['vida escolar', 'Vida Escolar'],
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+)$/i;
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

function unwrapNextImage(src) {
  const s = String(src || '');
  const m = /[?&]url=([^&]+)/.exec(s);
  if (m) {
    try { return absolute(decodeURIComponent(m[1])); } catch (e) {}
  }
  return absolute(s);
}

function extractNextF(html) {
  const parts = [];
  const re = /self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try { parts.push(JSON.parse('"' + m[1] + '"')); } catch (e) {}
  }
  return parts.join('');
}

function extractBalanced(str, startIdx, openChar, closeChar) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str.charAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  return '';
}

function extractJsonField(rsc, keyName, openChar, closeChar) {
  const needle = '"' + keyName + '":' + openChar;
  const idx = rsc.indexOf(needle);
  if (idx === -1) return null;
  const start = idx + keyName.length + 3;
  const slice = extractBalanced(rsc, start, openChar, closeChar);
  if (!slice) return null;
  try { return JSON.parse(slice); } catch (e) { return null; }
}

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s.includes('emisi') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('final') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('paus') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel')) return 'CANCELLED';
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
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async fetchLibraryPage(page, genre) {
    const gqs = genre ? `&genre=${encodeURIComponent(genre)}` : '';
    const html = await this.requestHTML(`${SITE_BASE}/${LANG_PATH}/library?sort=popular&page=${page}${gqs}`);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('a[href*="/series/"]').each((_, el) => {
      const a = $(el);
      const img = a.find('img[alt]').first();
      if (img.length === 0) return;
      const href = String(a.attr('href') || '');
      const m = /\/series\/([^/?#]+)/.exec(href);
      if (!m || seen.has(m[1])) return;
      const title = cleanText(img.attr('alt'));
      const image = unwrapNextImage(img.attr('src'));
      if (!title || !image) return;
      seen.add(m[1]);
      results.push({
        mangaId: m[1],
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/${LANG_PATH}/series/${encodeURIComponent(m[1])}`,
        medium: 'comics',
      });
    });
    const hasNext = $(`a[href*="page=${page + 1}"]`).length > 0 && results.length > 0;
    return { results, hasNext };
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title).toLowerCase();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const genre = tags.length > 0 ? tags[0].id : '';
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    if (query) {
      if (page > 1) return { results: [], metadata: undefined };
      const all = [];
      const seen = new Set();
      for (let p = 1; p <= 8; p++) {
        const res = await this.fetchLibraryPage(p, genre);
        res.results.forEach((it) => {
          if (!seen.has(it.mangaId)) {
            seen.add(it.mangaId);
            all.push(it);
          }
        });
        if (!res.hasNext) break;
      }
      return { results: all.filter((it) => it.title.toLowerCase().includes(query)), metadata: undefined };
    }

    if (feed.id === 'latest' && !genre) {
      const html = await this.requestHTML(`${SITE_BASE}/${LANG_PATH}?page=${page}`);
      const rsc = extractNextF(html);
      const items = extractJsonField(rsc, 'items', '[', ']') || [];
      const results = [];
      const seen = new Set();
      items.forEach((it) => {
        if (!it || !it.slug || !it.title || seen.has(it.slug)) return;
        const image = absolute(it.cover);
        if (!image) return;
        seen.add(it.slug);
        results.push({
          mangaId: String(it.slug),
          title: cleanText(it.title),
          image,
          referer: SITE_BASE + '/',
          webURL: `${SITE_BASE}/${LANG_PATH}/series/${encodeURIComponent(it.slug)}`,
          medium: 'comics',
        });
      });
      const cm = /"currentPage":(\d+),"totalPages":(\d+)/.exec(rsc);
      const hasNext = cm ? parseInt(cm[1], 10) < parseInt(cm[2], 10) : false;
      return { results, metadata: hasNext && results.length > 0 ? { page: page + 1 } : undefined };
    }

    const res = await this.fetchLibraryPage(page, genre);
    return { results: res.results, metadata: res.hasNext ? { page: page + 1 } : undefined };
  }

  async loadSeriesRsc(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.rsc;
    const html = await this.requestHTML(`${SITE_BASE}/${LANG_PATH}/series/${encodeURIComponent(mangaId)}`);
    const rsc = extractNextF(html);
    this.pageCache.set(mangaId, { at: Date.now(), rsc });
    return rsc;
  }

  async getMangaDetails(mangaId) {
    const rsc = await this.loadSeriesRsc(mangaId);
    const serie = extractJsonField(rsc, 'serie', '{', '}');
    if (!serie) throw new Error('SwordMangas: series data not found');
    const tags = [];
    if (serie.type) tags.push(cleanText(serie.type));
    if (Array.isArray(serie.genres)) {
      serie.genres.forEach((g) => {
        const c = cleanText(g);
        if (c && tags.indexOf(c) === -1) tags.push(c);
      });
    }
    const status = mapStatus(serie.status);
    const info = {
      title: cleanText(serie.title) || mangaId,
      image: absolute(serie.cover),
      referer: SITE_BASE + '/',
      author: '',
      desc: cleanText(serie.synopsis) || cleanText(serie.title) || mangaId,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/${LANG_PATH}/series/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const rsc = await this.loadSeriesRsc(mangaId);
    const list = extractJsonField(rsc, 'sortedChapters', '[', ']') || [];
    const rows = [];
    const seen = new Set();
    list.forEach((c) => {
      if (!c || c.number === undefined || c.number === null) return;
      if (c.is_paid_chapter && c.can_read === false) return;
      const numText = String(c.number).replace(/\.0$/, '');
      const cid = `${mangaId}/${numText}`;
      if (seen.has(cid)) return;
      seen.add(cid);
      const name = cleanText(c.title) || `Capítulo ${numText}`;
      const num = parseFloat(numText);
      const time = c.date ? Date.parse(c.date) : undefined;
      rows.push({
        id: cid,
        chapterId: cid,
        name,
        number: Number.isFinite(num) ? num : 0,
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
    const html = await this.requestHTML(`${SITE_BASE}/${LANG_PATH}/read/${chapterId}`);
    const rsc = extractNextF(html);
    const data = extractJsonField(rsc, 'initialChapterData', '{', '}');
    const pages = [];
    if (data && typeof data === 'object') {
      const vals = Object.values(data);
      for (let i = 0; i < vals.length; i++) {
        if (Array.isArray(vals[i]) && vals[i].length > 0) {
          vals[i].forEach((u) => {
            const abs = absolute(u);
            if (abs) pages.push(abs);
          });
          break;
        }
      }
    }
    if (pages.length === 0) throw new Error('SwordMangas returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`SwordMangas HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
