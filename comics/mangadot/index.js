const SITE = 'https://mangadot.net';
const API = 'https://mangadot.net/api';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', sortBy: 'latest', sortOrder: 'desc' },
  { id: 'popular', name: 'Most Viewed', sortBy: 'views', sortOrder: 'desc' },
  { id: 'tracked', name: 'Most Tracked', sortBy: 'tracked', sortOrder: 'desc' },
  { id: 'top', name: 'Top Rated', sortBy: 'rating', sortOrder: 'desc' },
  { id: 'chapters', name: 'Most Chapters', sortBy: 'chapters', sortOrder: 'desc' },
  { id: 'az', name: 'A to Z', sortBy: 'alphabetical', sortOrder: 'asc' },
];

const GENRES_FALLBACK = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller', 'Isekai', 'Martial Arts',
  'Psychological', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Mecha', 'Historical', 'School Life', 'Harem', 'Ecchi', 'Music', 'Cooking', 'Medical', 'Crime', 'Tragedy', 'Reincarnation',
  'Regression', 'System', 'Villainess', 'Webtoon', 'Manhwa', 'Manhua', 'Manga', 'Yuri', 'Gender Bender', 'Mature', 'Gore', 'Loli', 'Shota', 'Femdom',
];

const EXPLICIT_GENRES = ['hentai', 'erotica', 'smut', 'adult', 'uncensored', 'sexual violence', 'lolicon', 'shotacon', 'futanari'];
const SUGGESTIVE_GENRES = ['ecchi', 'mature', 'loli', 'shota', 'gore', 'doujinshi', 'femdom', 'incest'];

const STATUS = { ongoing: 'ONGOING', completed: 'COMPLETED', hiatus: 'HIATUS', cancelled: 'CANCELLED', canceled: 'CANCELLED' };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oneLine(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function ageOf(x) {
  const word = String((x && x.content_rating) || '').toLowerCase();
  const genres = (Array.isArray(x && x.genres) ? x.genres : []).map((g) => String(g).toLowerCase());
  const has = (list) => genres.some((g) => list.indexOf(g) >= 0);
  if (word === 'pornographic' || word === 'erotica' || (x && x.is_blurworthy) || has(EXPLICIT_GENRES)) return 18;
  if (word === 'suggestive' || (x && x.is_adult) || has(SUGGESTIVE_GENRES)) return 16;
  return 0;
}

function coverOf(photo, width) {
  const p = oneLine(photo);
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const m = /^\/uploads\/([^?#]+)$/.exec(p);
  if (m) return `${SITE}/uploads/thumbs/${width}/${m[1]}.webp`;
  return p.charAt(0) === '/' ? SITE + p : '';
}

function pageUrl(u) {
  const s = oneLine(u);
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return s.charAt(0) === '/' ? SITE + s : `${SITE}/${s}`;
}

function authorsOf(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch (e) {
      list = raw ? [raw] : [];
    }
  }
  return (Array.isArray(list) ? list : []).map((a) => oneLine(a)).filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pending = new Map();
    this.genres = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (!this.genres) {
      let names = null;
      try {
        const data = await this.api('/manga/genres');
        if (Array.isArray(data) && data.length) names = data.map((g) => oneLine(g)).filter(Boolean);
      } catch (e) {
        console.error('MangaDot genre list failed: ' + (e && e.message));
      }
      this.genres = names || GENRES_FALLBACK;
    }
    return this.genres.map((name) => ({ id: name, label: name }));
  }

  async api(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${API}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) {
          if (response.status === 404) throw new Error('MangaDot: not found (HTTP 404)');
          if (response.status < 200 || response.status >= 300) throw new Error(`MangaDot: HTTP ${response.status}`);
          try {
            return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          } catch (e) {
            throw new Error('MangaDot answered something that is not JSON');
          }
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || /MangaDot/.test(String(e.message))) throw e;
      }
      await pause(700);
    }
    throw new Error(`MangaDot: HTTP ${last ? last.status : 0}`);
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const names = included.map((t) => oneLine(t && typeof t === 'object' ? t.id || t.label : t)).filter(Boolean);
    const page = (metadata && Number(metadata.page)) || 1;
    const cursor = metadata && typeof metadata.cursor === 'string' ? metadata.cursor : '';
    const sortBy = query ? 'relevance' : feed.sortBy;
    const sortOrder = query ? 'desc' : feed.sortOrder;
    let path = `/search?sortBy=${sortBy}&sortOrder=${sortOrder}`;
    if (query) path += `&search=${encodeURIComponent(query)}`;
    if (names.length) path += `&genres=${encodeURIComponent(names.join(','))}`;
    path += cursor ? `&cursor=${encodeURIComponent(cursor)}` : `&page=${page}`;
    const data = await this.api(path);
    const list = Array.isArray(data && data.manga_list) ? data.manga_list : [];
    const results = [];
    for (const it of list) {
      const title = oneLine(it && it.title);
      if (!it || !it.id || !title) continue;
      const card = { mangaId: String(it.id), title, image: coverOf(it.photo, 320), medium: 'comics', ageRating: ageOf(it) };
      results.push(card);
    }
    const pagination = (data && data.pagination) || {};
    const next = oneLine(pagination.next_cursor);
    const totalPages = Number(pagination.total_pages) || 0;
    let nextMeta;
    if (list.length) {
      if (next) nextMeta = { page: page + 1, cursor: next };
      else if (!cursor && page < totalPages) nextMeta = { page: page + 1 };
    }
    return { results, metadata: nextMeta };
  }

  once(key, make) {
    const hit = this.pending.get(key);
    if (hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = make();
    this.pending.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pending.get(key) && this.pending.get(key).promise === promise) this.pending.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const d = await this.once(`d:${mangaId}`, () => this.api(`/manga/${encodeURIComponent(mangaId)}`));
    const m = d && d.manga;
    const title = oneLine(m && m.title);
    if (!m || !title) throw new Error('MangaDot: title not found');
    const genres = (Array.isArray(m.genres) ? m.genres : []).map((g) => oneLine(g)).filter(Boolean);
    const authors = authorsOf(m.authors);
    const artists = authorsOf(m.artists).filter((a) => authors.indexOf(a) < 0);
    const info = {
      title,
      image: coverOf(m.photo, 640),
      desc: oneLine(m.description) ? String(m.description).replace(/\r/g, '').trim() : undefined,
      status: STATUS[oneLine(m.status).toLowerCase()] || 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/manga/${m.id}`,
      medium: 'comics',
      ageRating: ageOf(m),
    };
    if (authors.length || artists.length) info.author = authors.concat(artists).join(', ');
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    let rows = await this.once(`c:${mangaId}:en`, () => this.api(`/manga/${encodeURIComponent(mangaId)}/chapters/list?lang=en`));
    let label = '';
    if (!Array.isArray(rows)) throw new Error('MangaDot answered a chapter list in a form this extension does not know');
    if (!rows.length) {
      const all = await this.once(`c:${mangaId}:all`, () => this.api(`/manga/${encodeURIComponent(mangaId)}/chapters/list`));
      if (!Array.isArray(all)) throw new Error('MangaDot answered a chapter list in a form this extension does not know');
      const count = {};
      for (const r of all) count[r.language] = (count[r.language] || 0) + 1;
      const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      rows = best ? all.filter((r) => r.language === best) : [];
      label = best ? String(best).toUpperCase() : '';
    }
    const byNumber = new Map();
    for (const r of rows) {
      if (!r || !r.id) continue;
      const number = Number(r.chapter_number);
      if (!Number.isFinite(number)) continue;
      if (!byNumber.has(number)) byNumber.set(number, []);
      byNumber.get(number).push(r);
    }
    const chapters = [];
    for (const [number, versions] of byNumber) {
      const most = Math.max.apply(null, versions.map((v) => Number(v.page_count) || 0));
      if (most <= 0) continue;
      const keep = versions.filter((v) => (Number(v.page_count) || 0) >= most * 0.6).sort((a, b) => Number(a.id) - Number(b.id))[0];
      const id = `${keep.source === 'scraper' ? 's' : 'u'}${keep.id}`;
      const rawTitle = oneLine(keep.chapter_title);
      const plainNumber = !rawTitle || /^[\d.+\s]+$/.test(rawTitle) || /^(chapter|ch\.?)\s*[\d.]+$/i.test(rawTitle);
      let name = plainNumber ? `Chapter ${number}` : /^(chapter|ch\.?|episode|ep\.?)\s*[\d.]+/i.test(rawTitle) ? rawTitle : `Chapter ${number} - ${rawTitle}`;
      if (label) name = `[${label}] ${name}`;
      const row = { id, chapterId: id, name, number };
      const group = oneLine(keep.group_name || keep.scanlator_name);
      if (group) row.group = group;
      const volume = Number(keep.volume_number);
      if (keep.volume_number !== null && keep.volume_number !== undefined && Number.isFinite(volume) && volume > 0) row.volume = String(volume);
      const time = Date.parse(`${String(keep.date_added || '').replace(' ', 'T').replace(/\+00$/, 'Z')}`);
      if (Number.isFinite(time)) row.time = time;
      chapters.push(row);
    }
    if (!chapters.length) throw new Error('MangaDot has no chapters for this title yet');
    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const raw = String(chapterId);
    const m = /^([su])(\d+)$/.exec(raw);
    if (!m) throw new Error('MangaDot: unknown chapter id ' + raw);
    const first = m[1] === 's' ? 'chapters' : 'uploads';
    const second = first === 'chapters' ? 'uploads' : 'chapters';
    let d = null;
    try {
      d = await this.api(`/${first}/${m[2]}/images`);
    } catch (e) {
      if (!/not found/.test(String(e.message))) throw e;
      d = await this.api(`/${second}/${m[2]}/images`);
    }
    const pages = (Array.isArray(d && d.images) ? d.images : []).map((x) => pageUrl(x && x.url)).filter(Boolean);
    if (!pages.length) throw new Error('MangaDot has no pages for this chapter yet');
    return { id: raw, mangaId, pages };
  }
}

module.exports = { Source };
