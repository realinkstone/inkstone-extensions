const API = 'https://be.aryplus.tv';
const IMAGES = 'https://images.aryplus.tv/';
const CLIENT_KEY = 'ak_37515186786306625012043079404171';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const COUNTRY = 'PK';
const PAGE_SIZE = 20;
const CACHE_MS = 5 * 60 * 1000;

const FEEDS = [
  { id: 'dramas', name: 'Dramas' },
  { id: 'telefilms', name: 'Telefilms' },
];

const GENRES = [
  { id: 'romance', label: 'Romance' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'suspense', label: 'Suspense' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'crime', label: 'Crime' },
  { id: 'horror', label: 'Horror' },
  { id: 'tragedy', label: 'Tragedy' },
  { id: 'social', label: 'Social' },
  { id: 'religious', label: 'Religious' },
  { id: 'sports', label: 'Sports' },
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'bingeworthy', label: 'Bingeworthy' },
  { id: 'gems', label: 'Gems' },
];

function imageUrl(path) {
  const p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return IMAGES + p.replace(/^\/+/, '');
}

function ageOf(text) {
  const n = parseInt(String(text || '').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n)) return 0;
  if (n >= 18) return 18;
  if (n >= 16) return 16;
  return 0;
}

function playable(s) {
  return s && s._id && s.drmEnabled !== true && s.isLive !== true;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.episodeCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  card(s) {
    const age = ageOf(s.ageRating);
    this.ages.set(s._id, age);
    const tags = Array.isArray(s.genreId) ? s.genreId.map((g) => (g && g.title) || g).filter((g) => typeof g === 'string') : [];
    return {
      mangaId: s._id,
      title: String(s.title || s._id),
      image: imageUrl(s.imagePoster || s.imageCoverBig),
      tags: tags.length ? tags : undefined,
      ageRating: age || undefined,
      webURL: `https://aryplus.tv/series/${s._id}`,
      medium: 'anime',
    };
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const data = await this.json(`${API}/api/v2/search`, { method: 'POST', body: { query } });
      const list = Array.isArray(data && data.series) ? data.series : [];
      const results = [];
      const seen = new Set();
      for (const s of list) {
        if (!playable(s) || seen.has(s._id)) continue;
        seen.add(s._id);
        results.push(this.card(s));
      }
      return { results };
    }

    const category = included.length > 0 && included[0] && included[0].id ? String(included[0].id) : (FEEDS.find((f) => f.id === feedId) || FEEDS[0]).id;
    const data = await this.json(`${API}/api/series/byCatID/status/pg/${encodeURIComponent(category)}/${COUNTRY}?limit=${PAGE_SIZE}&page=${page}`);
    const results = [];
    const seen = new Set();
    for (const s of (data && data.series) || []) {
      if (!playable(s) || seen.has(s._id)) continue;
      seen.add(s._id);
      results.push(this.card(s));
    }
    const more = data && data.pagination && data.pagination.hasNextPage === true;
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async seriesOf(mangaId) {
    return this.json(`${API}/api/series/${encodeURIComponent(mangaId)}`);
  }

  async getMangaDetails(mangaId) {
    const s = await this.seriesOf(mangaId);
    const tags = (Array.isArray(s.genreId) ? s.genreId : []).map((g) => (g && g.title) || g).filter((g) => typeof g === 'string');
    const cast = (Array.isArray(s.cast) ? s.cast : []).filter((n) => typeof n === 'string' && n.trim());
    const age = s.ageRating !== undefined ? ageOf(s.ageRating) : this.ages.get(mangaId) || 0;
    return {
      mangaInfo: {
        title: String(s.title || mangaId),
        image: imageUrl(s.imagePoster || s.imageCoverBig),
        banner: imageUrl(s.imageCoverDesktop) || undefined,
        author: cast.join(', ') || undefined,
        desc: String(s.description || '').trim() || undefined,
        status: 'UNKNOWN',
        tags,
        ageRating: age,
        webURL: `https://aryplus.tv/series/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async episodesOf(mangaId) {
    const hit = this.episodeCache.get(mangaId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
    const data = await this.json(`${API}/api/cdn/${encodeURIComponent(mangaId)}`);
    const list = Array.isArray(data && data.episode) ? data.episode : [];
    this.episodeCache.set(mangaId, { at: Date.now(), list });
    return list;
  }

  async getChapters(mangaId) {
    const s = await this.seriesOf(mangaId);
    if (s.seriesType === 'singleVideo') {
      if (s.drmEnabled === true) throw new Error('ARY Plus: this title is copy protected (DRM) and cannot be played here');
      return [{ id: 'main', chapterId: 'main', name: String(s.title || 'Full video'), number: 1 }];
    }
    const list = await this.episodesOf(mangaId);
    const rows = [];
    for (const e of list) {
      if (!e || !e._id || e.drmEnabled === true || !e.videoSource) continue;
      const number = Number(e.videoEpNumber);
      const created = Date.parse(e.createdAd || '');
      rows.push({
        id: String(e._id),
        chapterId: String(e._id),
        name: String(e.title || (Number.isFinite(number) ? `Episode ${number}` : 'Episode')),
        number: Number.isFinite(number) ? number : undefined,
        time: Number.isFinite(created) ? created : undefined,
      });
    }
    if (!rows.length) throw new Error('ARY Plus has no playable episodes for this title yet');
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    let url = '';
    if (chapterId === 'main') {
      const s = await this.seriesOf(mangaId);
      if (s.drmEnabled === true) throw new Error('ARY Plus: this title is copy protected (DRM) and cannot be played here');
      url = String(s.seiresCDN || '');
    } else {
      const list = await this.episodesOf(mangaId);
      const e = list.find((x) => x && String(x._id) === String(chapterId));
      if (e && e.drmEnabled === true) throw new Error('ARY Plus: this episode is copy protected (DRM) and cannot be played here');
      url = e ? String(e.videoSource || '') : '';
    }
    if (!/^https?:\/\//i.test(url)) throw new Error('ARY Plus has no video for this episode yet');

    let soft = false;
    try {
      const master = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
      soft = master.status === 200 && /#EXT-X-MEDIA:TYPE=SUBTITLES/i.test(String(master.data || ''));
    } catch (e) {
      soft = false;
    }
    return [{ url, quality: soft ? 'Auto Softsub' : 'Auto', type: 'hls' }];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url, opts) {
    const headers = { 'User-Agent': UA, Accept: 'application/json', 'x-api-key': CLIENT_KEY };
    const req = { url, method: (opts && opts.method) || 'GET', headers };
    if (opts && opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      req.body = JSON.stringify(opts.body);
    }
    const response = await this.requests.schedule(App.createRequest(req));
    if (response.status === 404) throw new Error('ARY Plus: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`ARY Plus: HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('ARY Plus returned a page that is not data');
    }
  }
}

module.exports = { Source };
