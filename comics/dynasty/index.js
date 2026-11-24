const SITE_BASE = 'https://manhuako.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', sort: 'updated' },
  { id: 'views', name: 'Popular', sort: 'views' },
  { id: 'rating', name: 'Top Rated', sort: 'rating' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn)$/i;
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
  const s = String(text || '').toLowerCase();
  if (s.includes('complet') || s.includes('finaliz') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('pausa') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonad') || s.includes('dropped')) return 'CANCELLED';
  if (s.includes('curso') || s.includes('emisi') || s.includes('ongoing') || s.includes('activo')) return 'ONGOING';
  return 'UNKNOWN';
}

function genreNames(genres) {
  if (!Array.isArray(genres)) return [];
  return genres.map((g) => cleanText(g && (g.name || g))).filter(Boolean);
}

class Source {
  constructor() {
    this.detailCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const list = await this.requestJSON(`${SITE_BASE}/api/genres`);
      return (Array.isArray(list) ? list : [])
        .filter((g) => g && g.slug && g.name)
        .map((g) => ({ id: g.slug, label: cleanText(g.name) }));
    } catch (e) {
      console.error('Dynasty getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    const params = [`page=${page}`, 'limit=24'];
    if (query) params.push(`search=${encodeURIComponent(query)}`);
    else params.push(`sort=${encodeURIComponent(feed.sort)}`);
    if (tags.length > 0) params.push(`genre=${encodeURIComponent(tags[0].id)}`);

    const json = await this.requestJSON(`${SITE_BASE}/api/mangas?${params.join('&')}`);
    const arr = Array.isArray(json && json.data) ? json.data : [];
    const results = arr.filter((it) => it && it.type !== 'novela').map((it) => ({
      mangaId: String(it.slug || it.id),
      title: cleanText(it.title),
      image: absolute(it.cover_image),
      referer: SITE_BASE + '/',
      author: cleanText(it.author) || undefined,
      summary: cleanText(it.description) || undefined,
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(it.slug || it.id)}`,
      medium: 'comics',
    })).filter((r) => r.mangaId && r.title && r.image);
    const totalPages = Number(json && json.totalPages) || 1;
    return { results, metadata: page < totalPages && arr.length > 0 ? { page: page + 1 } : undefined };
  }

  async loadDetail(mangaId) {
    const kept = this.detailCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.data;
    const data = await this.requestJSON(`${SITE_BASE}/api/mangas/${encodeURIComponent(mangaId)}`);
    if (!data || !data.id) throw new Error('Dynasty: title not found');
    this.detailCache.set(mangaId, { at: Date.now(), data });
    return data;
  }

  async getMangaDetails(mangaId) {
    const data = await this.loadDetail(mangaId);
    const tags = genreNames(data.genres);
    const status = mapStatus(data.status);
    const people = [cleanText(data.author), cleanText(data.artist)].filter((p, i, a) => p && a.indexOf(p) === i);
    const info = {
      title: cleanText(data.title) || mangaId,
      image: absolute(data.cover_image),
      referer: SITE_BASE + '/',
      author: people.join(', '),
      desc: cleanText(data.description) || cleanText(data.title),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(data.slug || mangaId)}`,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const data = await this.loadDetail(mangaId);
    const rows = [];
    const seen = new Set();
    for (let page = 1; page <= 20; page++) {
      const res = await this.requestJSON(`${SITE_BASE}/api/chapters/paginated?manga_id=${encodeURIComponent(data.id)}&page=${page}&limit=100&sort=desc`);
      const list = Array.isArray(res && res.chapters) ? res.chapters : (Array.isArray(res && res.data) ? res.data : (Array.isArray(res) ? res : []));
      list.forEach((c) => {
        if (!c || !c.id) return;
        const id = String(c.id);
        if (seen.has(id)) return;
        seen.add(id);
        const num = typeof c.number === 'number' ? c.number : parseFloat(String(c.number || 0));
        const baseName = c.title ? `Capítulo ${num} - ${cleanText(c.title)}` : `Capítulo ${num}`;
        const locked = (Number(c.coin_price) || 0) > 0;
        const name = locked ? `${baseName} (Locked, ${c.coin_price} coins)` : baseName;
        const time = c.created_at ? Date.parse(c.created_at) : undefined;
        rows.push({
          id,
          chapterId: id,
          name,
          number: Number.isFinite(num) ? num : 0,
          time: Number.isFinite(time) ? time : undefined,
        });
      });
      const totalPages = Number(res && (res.totalPages || (res.pagination && res.pagination.totalPages))) || 1;
      if (list.length === 0 || page >= totalPages) break;
    }
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
    const arr = await this.requestJSON(`${SITE_BASE}/api/chapter-pages?chapter_id=${encodeURIComponent(chapterId)}`);
    const list = Array.isArray(arr) ? arr : (Array.isArray(arr && arr.data) ? arr.data : []);
    list.sort((a, b) => (Number(a.page_number) || 0) - (Number(b.page_number) || 0));
    const pages = list.map((p) => absolute(p && p.image_url)).filter(Boolean);
    if (pages.length === 0) throw new Error('Dynasty returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Dynasty HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
