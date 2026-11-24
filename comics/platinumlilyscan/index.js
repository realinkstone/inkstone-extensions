const SITE_BASE = 'https://platinumlilyscan.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 24;
const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'title', name: 'A-Z' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi)$/i;

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
  const s = String(text || '').toLowerCase();
  if (s.includes('complet') || s.includes('finaliz') || s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('pausa')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  if (s.includes('ongoing') || s.includes('curso') || s.includes('emisi') || s.includes('public')) return 'ONGOING';
  return 'UNKNOWN';
}

function genreNames(genres) {
  if (!Array.isArray(genres)) return [];
  return genres.map((g) => cleanText(g && (g.name || (g.genre && g.genre.name)))).filter(Boolean);
}

function ageOf(cr, tags) {
  const c = String(cr || '').toLowerCase();
  if (c === 'pornographic' || c === 'erotica' || c === 'adult' || tags.some((t) => ADULT_GENRE.test(t))) return 18;
  if (c === 'suggestive' || c === 'mature' || tags.some((t) => SUGGESTIVE_GENRE.test(t))) return 16;
  return undefined;
}

class Source {
  constructor() {
    this.catalogCache = null;
    this.detailCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async loadCatalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 300000) return this.catalogCache.items;
    const arr = await this.requestJSON(`${SITE_BASE}/api/series`);
    const items = (Array.isArray(arr) ? arr : []).filter((s) => s && s.slug && s.title && s.visible !== false);
    this.catalogCache = { at: Date.now(), items };
    return items;
  }

  async getSearchTags() {
    try {
      const items = await this.loadCatalog();
      const map = new Map();
      items.forEach((s) => {
        genreNames(s.genres).forEach((name) => {
          const key = name.toLowerCase();
          if (!map.has(key)) map.set(key, { id: key, label: name });
        });
      });
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('PlatinumLilyScan getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title).toLowerCase();
    const tags = ((request && request.includedTags) || []).map((t) => cleanText(t && (t.id || t.label)).toLowerCase()).filter(Boolean);
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;

    let list = (await this.loadCatalog()).slice();
    if (query) {
      list = list.filter((s) => `${s.title || ''} ${s.altTitles || ''} ${s.slug || ''}`.toLowerCase().indexOf(query) >= 0);
    }
    if (tags.length > 0) {
      list = list.filter((s) => {
        const g = genreNames(s.genres).map((x) => x.toLowerCase());
        return tags.every((t) => g.indexOf(t) >= 0);
      });
    }
    if (feed === 'title') list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    else list.sort((a, b) => (Date.parse(b.updatedAt || b.createdAt || '') || 0) - (Date.parse(a.updatedAt || a.createdAt || '') || 0));

    const start = (page - 1) * PAGE_SIZE;
    const results = list.slice(start, start + PAGE_SIZE).map((s) => {
      const g = genreNames(s.genres);
      const age = ageOf(s.contentRating, g);
      const card = {
        mangaId: s.slug,
        title: cleanText(s.title),
        image: absolute(s.coverUrl),
        referer: SITE_BASE + '/',
        tags: g,
        summary: cleanText(s.description) || undefined,
        webURL: `${SITE_BASE}/series/${encodeURIComponent(s.slug)}`,
        medium: 'comics',
      };
      if (age !== undefined) card.ageRating = age;
      return card;
    }).filter((r) => r.mangaId && r.title && r.image);
    return { results, metadata: start + PAGE_SIZE < list.length ? { page: page + 1 } : undefined };
  }

  async loadSeries(mangaId) {
    const kept = this.detailCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.data;
    const data = await this.requestJSON(`${SITE_BASE}/api/series/${encodeURIComponent(mangaId)}`);
    if (!data || !data.id) throw new Error('PlatinumLilyScan: title not found');
    this.detailCache.set(mangaId, { at: Date.now(), data });
    return data;
  }

  async getMangaDetails(mangaId) {
    const data = await this.loadSeries(mangaId);
    const tags = genreNames(data.genres);
    const status = mapStatus(data.status);
    const people = [cleanText(data.author), cleanText(data.artist)].filter((p, i, a) => p && a.indexOf(p) === i);
    const age = ageOf(data.contentRating, tags);
    const info = {
      title: cleanText(data.title) || mangaId,
      image: absolute(data.coverUrl),
      referer: SITE_BASE + '/',
      author: people.join(', '),
      desc: cleanText(data.description) || cleanText(data.title),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/series/${encodeURIComponent(data.slug || mangaId)}`,
      medium: 'comics',
    };
    if (data.year) info.releaseDate = String(data.year);
    if (age !== undefined) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const data = await this.loadSeries(mangaId);
    const raw = Array.isArray(data.chapters) ? data.chapters : [];
    const rows = [];
    const seen = new Set();
    raw.forEach((c) => {
      if (!c || !c.id || seen.has(c.id)) return;
      seen.add(c.id);
      const num = typeof c.number === 'number' ? c.number : parseFloat(String(c.number || 0));
      const name = c.title ? `Capítulo ${num} - ${cleanText(c.title)}` : `Capítulo ${num}`;
      const time = Date.parse(c.publishedAt || c.createdAt || '');
      const ch = {
        id: c.id,
        chapterId: c.id,
        name,
        number: Number.isFinite(num) ? num : 0,
      };
      if (c.volume !== null && c.volume !== undefined && String(c.volume).trim()) ch.volume = String(c.volume);
      if (Number.isFinite(time)) ch.time = time;
      rows.push(ch);
    });
    rows.sort((a, b) => a.number - b.number);
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.volume !== undefined) ch.volume = r.volume;
      if (r.time !== undefined) ch.time = r.time;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const data = await this.loadSeries(mangaId);
    const ch = (data.chapters || []).find((c) => c && c.id === chapterId);
    if (!ch || !Array.isArray(ch.pages)) throw new Error('PlatinumLilyScan: chapter pages not found');
    const pages = ch.pages
      .slice()
      .sort((a, b) => (Number(a.pageNum) || 0) - (Number(b.pageNum) || 0))
      .map((p) => absolute(p && p.imageUrl))
      .filter(Boolean);
    if (pages.length === 0) throw new Error('PlatinumLilyScan returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`PlatinumLilyScan HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
