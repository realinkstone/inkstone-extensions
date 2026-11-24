const SITE_BASE = 'https://mangamukai.com';
const API_BASE = `${SITE_BASE}/wp-json/mangamukai/v1`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'views', name: 'Popular' },
  { id: 'updated', name: 'Latest Updates' },
  { id: 'newest', name: 'Newly Added' },
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

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s === 'ongoing' || s.includes('emisi') || s.includes('curso')) return 'ONGOING';
  if (s === 'completed' || s.includes('complet') || s.includes('finaliz')) return 'COMPLETED';
  if (s === 'hiatus' || s.includes('paus')) return 'HIATUS';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.catalogCache = null;
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async loadCatalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 300000) return this.catalogCache.mangas;
    const json = await this.requestJSON(`${API_BASE}/catalog`);
    const mangas = Array.isArray(json && json.mangas) ? json.mangas : [];
    this.catalogCache = { at: Date.now(), mangas };
    return mangas;
  }

  async getSearchTags() {
    try {
      const mangas = await this.loadCatalog();
      const set = new Set();
      mangas.forEach((m) => {
        if (Array.isArray(m && m.genres)) m.genres.forEach((g) => { const c = cleanText(g); if (c) set.add(c); });
      });
      return [...set].sort().map((g) => ({ id: g, label: g }));
    } catch (e) {
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title).toLowerCase();
    const tags = ((request && request.includedTags) || []).map((t) => cleanText(t && t.id).toLowerCase()).filter(Boolean);
    const feed = (request && request.feed) || 'views';
    const page = (metadata && metadata.page) || 1;
    const pageSize = 24;

    const all = await this.loadCatalog();
    const filtered = all.filter((m) => {
      if (!m || !m.id || !m.titulo) return false;
      if (query && !String(m.titulo).toLowerCase().includes(query)) return false;
      if (tags.length > 0) {
        const mg = Array.isArray(m.genres) ? m.genres.map((g) => cleanText(g).toLowerCase()) : [];
        if (!tags.every((t) => mg.indexOf(t) !== -1)) return false;
      }
      return true;
    });

    const sorted = filtered.slice().sort((a, b) => {
      if (feed === 'updated') return (Date.parse(b.latest_update_at || '') || 0) - (Date.parse(a.latest_update_at || '') || 0);
      if (feed === 'newest') return (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0);
      return (Number(b.totalViews) || 0) - (Number(a.totalViews) || 0);
    });

    const start = (page - 1) * pageSize;
    const slice = sorted.slice(start, start + pageSize);
    const results = slice.map((m) => ({
      mangaId: String(m.id),
      title: cleanText(m.titulo),
      image: absolute(m.portada),
      referer: SITE_BASE + '/',
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(m.id)}`,
      medium: 'comics',
    })).filter((r) => r.image);

    const hasNext = start + pageSize < sorted.length;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const d = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}`);
    const title = cleanText(d && d.titulo) || mangaId;
    const tags = [];
    if (d && d.tipo) tags.push(cleanText(d.tipo));
    if (Array.isArray(d && d.genres)) {
      d.genres.forEach((g) => {
        const c = cleanText(g);
        if (c && tags.indexOf(c) === -1) tags.push(c);
      });
    }
    let desc = cleanText(d && d.descripcion);
    if (desc.indexOf(title) === 0) desc = cleanText(desc.slice(title.length));
    if (!desc) desc = title;
    const status = mapStatus(d && d.status);
    const info = {
      title,
      image: absolute(d && d.portada),
      referer: SITE_BASE + '/',
      author: '',
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const json = await this.requestJSON(`${API_BASE}/series/${encodeURIComponent(mangaId)}/chapters`);
    const list = Array.isArray(json && json.chapters) ? json.chapters : [];
    const rows = [];
    const seen = new Set();
    list.forEach((c) => {
      if (!c || !c.id || c.is_paid) return;
      const cid = String(c.id);
      if (seen.has(cid)) return;
      seen.add(cid);
      const num = typeof c.chapter_number === 'number' ? c.chapter_number : parseFloat(String(c.chapter_number || 0));
      const numStr = Number.isFinite(num) ? String(num).replace(/\.0$/, '') : '';
      const rawTitle = cleanText(c.title);
      const capM = /(cap[íi]tulo\s*[\d.]+(?:\s*[-–:]\s*[^|]+)?)/i.exec(rawTitle);
      const name = numStr ? `Capítulo ${numStr}` : (capM ? cleanText(capM[1]) : rawTitle || `Capítulo ${cid}`);
      const time = c.created_at ? Date.parse(c.created_at) : undefined;
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
    const json = await this.requestJSON(`${API_BASE}/chapters/content?id=${encodeURIComponent(chapterId)}`);
    const pages = (Array.isArray(json && json.images) ? json.images : []).map((u) => absolute(u)).filter(Boolean);
    if (pages.length === 0) throw new Error('MangaMukai returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`MangaMukai HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
