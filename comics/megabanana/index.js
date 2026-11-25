const SITE_BASE = 'https://megabanana.mx';
const API_BASE = `${SITE_BASE}/wp-json/megabanana/v1`;
const WP_API = `${SITE_BASE}/wp-json/wp/v2`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', category: 'comics' },
  { id: 'marvel', name: 'Marvel', category: 'marvel' },
  { id: 'dc', name: 'DC', category: 'dc' },
  { id: 'independientes', name: 'Independientes', category: 'independientes' },
  { id: 'random', name: 'Aleatorio', category: 'comics', random: true },
];

const GENRES = [
  { id: 'marvel', label: 'Marvel' },
  { id: 'dc', label: 'DC' },
  { id: 'dark-horse', label: 'Dark Horse' },
  { id: 'image', label: 'Image' },
  { id: 'idw', label: 'IDW' },
  { id: 'dynamite', label: 'Dynamite' },
  { id: 'vertigo', label: 'Vertigo' },
  { id: 'independientes', label: 'Independientes' },
  { id: 'manga', label: 'Manga' },
];

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function stripHtml(html) {
  if (!html) return '';
  return cleanText(cheerio.load(String(html)).text());
}

function extractDescription(html) {
  if (!html) return '';
  const $ = cheerio.load(String(html));
  $('script, style, ins, noscript, iframe, .megab-entity-placement').remove();
  const paras = [];
  $('p').each((_, el) => {
    const t = cleanText($(el).text());
    if (t) paras.push(t);
  });
  if (paras.length > 0) return paras.join('\n\n');
  return cleanText($.root().text());
}

function cleanComicTitle(raw) {
  let t = stripHtml(raw);
  t = t.replace(/^Leer\s+/i, '');
  t = t.replace(/\s*(?:C[óo]mics?\s+)?Online\s+en\s+Espa[ñn]ol\s*$/i, '');
  t = t.replace(/\s*C[óo]mic\s+en\s+Espa[ñn]ol\s*$/i, '');
  return cleanText(t) || stripHtml(raw);
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

class Source {
  constructor() {
    this.readerCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const tags = ((request && request.includedTags) || []).map((t) => cleanText(t && (t.id || t.label)).toLowerCase()).filter(Boolean);
    const page = (metadata && metadata.page) || 1;
    const perPage = 30;

    const category = tags.length > 0 ? tags[0] : (query ? 'comics' : feed.category);
    const params = [`page=${page}`, `per_page=${perPage}`, `category=${encodeURIComponent(category)}`];
    if (query) params.push(`search=${encodeURIComponent(query)}`);
    else if (feed.random && tags.length === 0) params.push('random=true');

    const json = await this.requestJSON(`${API_BASE}/catalog?${params.join('&')}`);
    const items = Array.isArray(json && json.items) ? json.items : [];
    const results = [];
    const seen = new Set();

    items.forEach((it) => {
      if (!it || !it.id || it.readerReady === false) return;
      const mangaId = String(it.id);
      if (seen.has(mangaId)) return;
      const title = cleanComicTitle(it.title);
      const image = absolute(it.thumbnail);
      if (!title || !image) return;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        summary: cleanText(it.excerpt) || undefined,
        webURL: absolute(it.url || `/?p=${mangaId}`),
        medium: 'comics',
      });
    });

    const totalPages = Number(json && json.pages) || 1;
    const hasNext = page < totalPages && results.length > 0 && !feed.random;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async loadReader(mangaId, chapterNum) {
    const key = `${mangaId}:${chapterNum || 'default'}`;
    const kept = this.readerCache.get(key);
    if (kept && Date.now() - kept.at < 300000) return kept.data;
    const qs = chapterNum ? `?chapter=${encodeURIComponent(chapterNum)}` : '';
    const data = await this.requestJSON(`${API_BASE}/reader/${encodeURIComponent(mangaId)}${qs}`);
    this.readerCache.set(key, { at: Date.now(), data });
    if (!chapterNum && data && data.currentChapter !== undefined) {
      this.readerCache.set(`${mangaId}:${data.currentChapter}`, { at: Date.now(), data });
    }
    return data;
  }

  async getMangaDetails(mangaId) {
    const post = await this.requestJSON(`${WP_API}/posts/${encodeURIComponent(mangaId)}?_embed`);
    const title = cleanComicTitle(post && post.title && post.title.rendered) || mangaId;
    const media = post && post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
    const image = absolute(media && media.source_url);
    const desc = extractDescription(post && post.content && post.content.rendered) || stripHtml(post && post.excerpt && post.excerpt.rendered) || title;
    const tags = [];
    const termGroups = (post && post._embedded && post._embedded['wp:term']) || [];
    termGroups.forEach((group) => {
      if (!Array.isArray(group)) return;
      group.forEach((t) => {
        const name = cleanText(t && t.name);
        if (name && name.toLowerCase() !== 'comics' && tags.indexOf(name) < 0) tags.push(name);
      });
    });
    const status = /\(fin\)|completa|completo/i.test(title) ? 'COMPLETED' : 'ONGOING';
    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE + '/',
        desc,
        status,
        completed: status === 'COMPLETED',
        tags,
        webURL: absolute((post && post.link) || `/?p=${mangaId}`),
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const data = await this.loadReader(mangaId);
    const raw = Array.isArray(data && data.chapters) ? data.chapters : [];
    const rows = [];
    const seen = new Set();
    raw.forEach((c, idx) => {
      if (!c) return;
      const cid = String(c.number !== undefined && c.number !== null ? c.number : idx + 1);
      if (seen.has(cid)) return;
      seen.add(cid);
      const num = parseFloat(cid);
      const name = cleanText(c.title) || `Capítulo ${cid}`;
      rows.push({
        id: cid,
        chapterId: cid,
        name,
        number: Number.isFinite(num) ? num : idx + 1,
      });
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
    const data = await this.loadReader(mangaId, chapterId);
    const list = Array.isArray(data && data.pages) ? data.pages : [];
    const pages = list.map((u) => absolute(u)).filter(Boolean);
    if (pages.length === 0) throw new Error('MegaBanana returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`MegaBanana HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
