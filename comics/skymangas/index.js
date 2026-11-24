const SITE_BASE = 'https://skymangas.com';
const API_BASE = 'https://api.skymangas.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', sort: '' },
  { id: 'latest', name: 'Latest Updates', sort: 'updated' },
];

const DEMOGRAPHICS = { 1: 'Shounen', 2: 'Shoujo', 3: 'Seinen', 4: 'Josei', 5: 'Kodomo' };
const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|gore)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function imageUrl(path) {
  const u = String(path || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return API_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function mapStatus(statusId) {
  if (statusId === 1) return 'ONGOING';
  if (statusId === 2) return 'COMPLETED';
  if (statusId === 3) return 'HIATUS';
  if (statusId === 4) return 'CANCELLED';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.detailCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1.5 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${API_BASE}/api/v1/manhuas/filters`);
      const genres = (json && json.data && json.data.genres) || (json && json.genres) || [];
      return genres
        .filter((g) => g && g.id && g.name)
        .map((g) => ({ id: String(g.id), label: cleanText(g.name) }));
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

    const params = [`page=${page}`];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    else if (feed.sort) params.push(`sort=${encodeURIComponent(feed.sort)}`);
    if (tags.length > 0) params.push(`genres=${tags.map((t) => encodeURIComponent(t.id)).join(',')}`);

    const json = await this.requestJSON(`${API_BASE}/api/v1/manhuas/search?${params.join('&')}`);
    const list = Array.isArray(json && json.data) ? json.data : [];
    const results = list
      .filter((it) => it && it.slug && it.title)
      .map((it) => ({
        mangaId: String(it.slug),
        title: cleanText(it.title),
        image: imageUrl(it.coverUrl),
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/manhua/${encodeURIComponent(it.slug)}`,
        medium: 'comics',
      }))
      .filter((r) => r.image);

    const meta = json && json.meta;
    const hasNext = meta && Number(meta.page) < Number(meta.totalPages) && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async loadDetail(slug) {
    const kept = this.detailCache.get(slug);
    if (kept && Date.now() - kept.at < 300000) return kept.data;
    const json = await this.requestJSON(`${API_BASE}/api/v1/manhuas/${encodeURIComponent(slug)}`);
    const data = (json && json.data) || json;
    if (!data || !data.id) throw new Error('SkyMangas: title not found');
    this.detailCache.set(slug, { at: Date.now(), data });
    return data;
  }

  async getMangaDetails(mangaId) {
    const d = await this.loadDetail(mangaId);
    const tags = [];
    if (d.originationName) tags.push(cleanText(d.originationName));
    if (DEMOGRAPHICS[d.demographicId]) tags.push(DEMOGRAPHICS[d.demographicId]);
    (Array.isArray(d.genres) ? d.genres : []).forEach((g) => {
      const c = cleanText(g && g.name);
      if (c && tags.indexOf(c) === -1) tags.push(c);
    });
    (Array.isArray(d.tags) ? d.tags : []).forEach((g) => {
      const c = cleanText(g && g.name);
      if (c && tags.indexOf(c) === -1) tags.push(c);
    });
    const people = [cleanText(d.author), cleanText(d.artist)].filter((p, i, a) => p && a.indexOf(p) === i);
    const status = mapStatus(d.statusId);
    const info = {
      title: cleanText(d.title) || mangaId,
      image: imageUrl(d.coverUrl),
      referer: SITE_BASE + '/',
      author: people.join(', '),
      desc: cleanText(d.synopsis) || cleanText(d.title) || mangaId,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/manhua/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (d.yearRelease) info.releaseDate = String(d.yearRelease);
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const d = await this.loadDetail(mangaId);
    const rows = [];
    const seen = new Set();
    for (let page = 1; page <= 20; page++) {
      const json = await this.requestJSON(`${API_BASE}/api/v1/chapters/manhua/${encodeURIComponent(d.id)}?page=${page}&limit=100`);
      const list = Array.isArray(json && json.data) ? json.data : [];
      list.forEach((c) => {
        if (!c || c.chapterNumber === undefined || c.chapterNumber === null) return;
        const numText = String(c.chapterNumber).replace(/\.0$/, '');
        const cid = `${mangaId}~${numText}`;
        if (seen.has(cid)) return;
        seen.add(cid);
        const title = cleanText(c.title);
        const name = title ? `Capítulo ${numText}: ${title}` : `Capítulo ${numText}`;
        const num = parseFloat(numText);
        const time = c.publishedAt ? Date.parse(c.publishedAt) : undefined;
        const group = cleanText(c.groupNames) || undefined;
        rows.push({
          id: cid,
          chapterId: cid,
          name,
          number: Number.isFinite(num) ? num : 0,
          time: Number.isFinite(time) ? time : undefined,
          group,
        });
      });
      const meta = json && json.meta;
      if (list.length === 0 || !meta || Number(meta.page) >= Number(meta.totalPages)) break;
    }
    rows.sort((a, b) => a.number - b.number);
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      if (r.group) ch.group = r.group;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const parts = String(chapterId).split('~');
    const slug = parts[0];
    const number = parts[1] || '1';
    const json = await this.requestJSON(`${API_BASE}/api/v1/chapters/${encodeURIComponent(slug)}/${encodeURIComponent(number)}`);
    const data = (json && json.data) || json;
    const list = Array.isArray(data && data.pages) ? data.pages : [];
    list.sort((a, b) => (Number(a.pageNumber) || 0) - (Number(b.pageNumber) || 0));
    const pages = list.map((p) => imageUrl(p && p.imageUrl)).filter(Boolean);
    if (pages.length === 0) throw new Error('SkyMangas returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`SkyMangas HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
