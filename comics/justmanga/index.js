const SITE = 'https://justmanga.cc';
const API = 'https://core.justmanga.cc/api';

const FEEDS = [
  { id: 'popular', name: 'Popular', sort: 'popular' },
  { id: 'trending', name: 'Trending', sort: 'trending' },
  { id: 'rating', name: 'Top Rated', sort: 'rating' },
  { id: 'updated', name: 'Recently Updated', sort: 'updated' },
  { id: 'favourites', name: 'Most Favourited', sort: 'favourites' },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];
const TYPES = [
  { id: 'type:MANGA', api: 'MANGA', label: 'Manga' },
  { id: 'type:MANHWA', api: 'MANHWA', label: 'Manhwa' },
  { id: 'type:MANHUA', api: 'MANHUA', label: 'Manhua' },
  { id: 'type:ONE_SHOT', api: 'ONE_SHOT', label: 'One-shot' },
];

const LANGUAGES = {
  en: 'English', es: 'Spanish', 'es-419': 'Spanish (Latin America)', 'pt-br': 'Portuguese (Brazil)', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', ru: 'Russian',
  pl: 'Polish', tr: 'Turkish', ar: 'Arabic', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai', zh: 'Chinese', ko: 'Korean', cs: 'Czech', el: 'Greek', hi: 'Hindi', sv: 'Swedish',
  tl: 'Filipino', ro: 'Romanian', fa: 'Persian',
};

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oneLine(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function typeLabel(type) {
  const found = TYPES.find((t) => t.api === type);
  return found ? found.label : '';
}

function statusOf(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'ONGOING' || s === 'HIATUS' || s === 'CANCELLED') return s;
  return 'UNKNOWN';
}

function coverOf(url, size) {
  const u = String(url || '');
  if (!/^https?:\/\//.test(u)) return '';
  return u.replace(/\/cover\/(large|medium|extraLarge)\//, `/cover/${size}/`);
}

function ageOf(genres) {
  const list = Array.isArray(genres) ? genres : [];
  if (!list.length) return 16;
  return list.some((g) => /^(ecchi|hentai|erotica|adult|smut|mature)$/i.test(oneLine(g))) ? 16 : 0;
}

function wantedLanguage() {
  const raw = oneLine(App.getSourceSetting('language')).toLowerCase();
  return /^[a-z]{2}(-[a-z0-9]{2,3})?$/.test(raw) ? raw : 'en';
}

function langName(code) {
  return LANGUAGES[code] || String(code || '').toUpperCase();
}

function chapterName(c, fallbackNumber) {
  const n = Number(c && c.number);
  const title = oneLine(c && c.title);
  const base = Number.isFinite(n) ? `Chapter ${n}` : oneLine(c && c.label) || `Chapter ${fallbackNumber}`;
  return title && title.toLowerCase() !== base.toLowerCase() ? `${base} - ${title}` : base;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g })).concat(TYPES.map((t) => ({ id: t.id, label: t.label })));
  }

  async get(path) {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${API}${path}${attempt ? `${path.indexOf('?') >= 0 ? '&' : '?'}_r=${Date.now()}` : ''}`;
      try {
        response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
      } catch (e) {
        if (attempt === 1) throw e;
        await pause(700);
        continue;
      }
      if (response.status !== 429 && response.status !== 503 && response.status !== 504) return response;
      if (attempt === 0) await pause(1200);
    }
    return response;
  }

  async json(path) {
    const response = await this.get(path);
    if (response.status < 200 || response.status >= 300) throw new Error(`JustManga: HTTP ${response.status}`);
    try {
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('JustManga answered something that is not JSON');
    }
  }

  cardOf(t) {
    const genres = Array.isArray(t.genres) ? t.genres.map(oneLine).filter(Boolean) : [];
    const tags = genres.slice();
    const type = typeLabel(t.type);
    if (type) tags.push(type);
    const card = {
      mangaId: String(t.id),
      title: oneLine(t.title),
      image: coverOf(t.cover, 'medium'),
      medium: 'comics',
      tags,
      ageRating: ageOf(genres),
    };
    const slug = oneLine(t.slug);
    if (slug) card.webURL = `${SITE}/manga/${t.id}/${slug}`;
    const author = Array.isArray(t.authors) ? t.authors.map(oneLine).filter(Boolean).join(', ') : '';
    if (author) card.author = author;
    return card;
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = Math.max(1, Number((metadata && metadata.page) || 1));
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = (Array.isArray(request && request.includedTags) ? request.includedTags : []).map((t) => String((t && t.id) || t || ''));
    const type = TYPES.find((t) => included.indexOf(t.id) >= 0);
    const genre = GENRES.find((g) => included.indexOf(g) >= 0);
    let path = query ? `/search?q=${encodeURIComponent(query)}&page=${page}` : `/browse?page=${page}&sort=${feed.sort}`;
    if (query && request && request.feed && request.feed !== 'recent') path += `&sort=${feed.sort}`;
    if (genre) path += `&genre=${encodeURIComponent(genre)}`;
    if (type) path += `&type=${type.api}`;
    const response = await this.get(path);
    if (response.status === 502 && query) {
      const alive = await this.get('/genres');
      if (alive.status === 200) return { results: [] };
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`JustManga: HTTP ${response.status}`);
    let body;
    try {
      body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('JustManga answered something that is not JSON');
    }
    const list = Array.isArray(body && body.results) ? body.results : [];
    const seen = new Set();
    const results = [];
    for (const t of list) {
      if (!t || t.id === undefined || t.id === null || !oneLine(t.title) || seen.has(String(t.id))) continue;
      seen.add(String(t.id));
      results.push(this.cardOf(t));
    }
    const more = !!(body && body.pagination && body.pagination.hasNextPage) && list.length > 0;
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const response = await this.get(`/manga/${encodeURIComponent(mangaId)}`);
    if (response.status === 404) throw new Error('JustManga: title not found');
    if (response.status < 200 || response.status >= 300) throw new Error(`JustManga: HTTP ${response.status}`);
    let t;
    try {
      t = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('JustManga answered something that is not JSON');
    }
    if (!t || !oneLine(t.title)) throw new Error('JustManga: title not found');
    const card = this.cardOf(t);
    const people = [];
    for (const name of [].concat(Array.isArray(t.authors) ? t.authors : [], Array.isArray(t.artists) ? t.artists : [])) {
      const n = oneLine(name);
      if (n && people.indexOf(n) < 0) people.push(n);
    }
    const info = {
      title: card.title,
      image: coverOf(t.cover, 'large'),
      desc: String(t.description || '').trim() || undefined,
      status: statusOf(t.status),
      tags: card.tags,
      author: people.join(', ') || undefined,
      webURL: card.webURL || SITE,
      medium: 'comics',
      ageRating: card.ageRating,
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const wanted = wantedLanguage();
    const response = await this.get(`/manga/${encodeURIComponent(mangaId)}/chapters?lang=${encodeURIComponent(wanted)}`);
    if (response.status === 404) {
      if (/no chapters/i.test(String(response.data || ''))) return [];
      throw new Error('JustManga: title not found');
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`JustManga: HTTP ${response.status}`);
    let d;
    try {
      d = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('JustManga answered something that is not JSON');
    }
    const list = Array.isArray(d && d.chapters) ? d.chapters : [];
    const source = oneLine(d && d.source) || 'auto';
    const lang = oneLine(d && d.lang).toLowerCase() || wanted;
    const fallback = lang !== wanted;
    const rows = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const key = oneLine(c && c.key);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const id = `${source}~${lang}~${key}`;
      const row = { id, chapterId: id, name: chapterName(c, i + 1) + (fallback ? ` (${langName(lang)})` : '') };
      const number = Number(c.number);
      if (c.number !== null && c.number !== undefined && Number.isFinite(number)) row.number = number;
      if (c.volume !== null && c.volume !== undefined && oneLine(c.volume)) row.volume = String(c.volume);
      const group = oneLine(c.group);
      if (group) row.group = group;
      const time = Date.parse(String(c.releasedAt || ''));
      if (Number.isFinite(time)) row.time = time;
      rows.push(row);
    }
    rows.sort((a, b) => (b.number === undefined ? -1 : b.number) - (a.number === undefined ? -1 : a.number) || (b.time || 0) - (a.time || 0));
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const parts = String(chapterId).split('~');
    const hasShape = parts.length >= 3;
    const source = hasShape ? parts[0] : '';
    const lang = hasShape ? parts[1] : wantedLanguage();
    const key = hasShape ? parts.slice(2).join('~') : String(chapterId);
    let path = `/manga/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(key)}/pages?lang=${encodeURIComponent(lang)}`;
    if (source && source !== 'auto') path += `&source=${encodeURIComponent(source)}`;
    const response = await this.get(path);
    if (response.status === 404) throw new Error('JustManga: chapter not found');
    if (response.status < 200 || response.status >= 300) throw new Error(`JustManga: HTTP ${response.status}`);
    let d;
    try {
      d = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('JustManga answered something that is not JSON');
    }
    const rows = (Array.isArray(d && d.pages) ? d.pages : []).slice().sort((a, b) => Number(a.index) - Number(b.index));
    const pages = [];
    for (const p of rows) {
      const u = p && p.proxy ? `${API}/image?${p.proxy}` : oneLine(p && p.url);
      if (/^https?:\/\//.test(u)) pages.push(u);
    }
    if (!pages.length) throw new Error('JustManga has no pages for this chapter yet');
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
