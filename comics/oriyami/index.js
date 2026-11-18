const SITE = 'https://oriyami.com';
const API = 'https://api.oriyami.com/api/mangas';
const CDN = 'https://cdn.oriyami.com';
const PAGE_SIZE = 30;

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', kind: 'browse', sort: 'latest_updates' },
  { id: 'popular', name: 'Popular', kind: 'browse', sort: 'popularity' },
  { id: 'trending', name: 'Trending', kind: 'browse', sort: 'trending' },
  { id: 'new', name: 'New Series', kind: 'new' },
  { id: 'manhwa', name: 'Manhwa', kind: 'browse', sort: 'popularity', type: 'Manhwa' },
  { id: 'manhua', name: 'Manhua', kind: 'browse', sort: 'popularity', type: 'Manhua' },
  { id: 'manga', name: 'Manga', kind: 'browse', sort: 'popularity', type: 'Manga' },
  { id: 'digital', name: 'Digital Comics', kind: 'browse', sort: 'popularity', type: 'Digital Comic' },
];

const GENRES = [
  'Drama', 'Fantasy', 'Action', 'Comedy', 'Adventure', 'Romance', 'Slice of Life', 'Supernatural', 'School Life', 'Isekai', 'Based on a Web Novel', 'Person in a Strange World', 'Magic',
  'Harem', 'Martial Arts', 'Based on a Light Novel', 'Mystery', 'Psychological', 'Ecchi', 'Reincarnation', 'Gore', 'Tragedy', 'Historical', 'Mature', 'Science-Fiction', 'Thriller',
  'Time Travel', 'Horror', 'Sports', 'Game Elements', 'Demons', 'Nobility', 'Non-Human Protagonists', 'Monsters', 'Overpowered Main Characters', 'Crime', 'Second Chance', 'Super Power',
  'Wuxia', 'Swordplay', 'Urban Fantasy', 'Revenge', 'Transported Into A Novel', 'Royalty', 'Gender Bender', 'Cheats', 'Military', 'Contemporary Fantasy', 'Fantasy World', '4-koma',
  'Delinquents', 'Philosophical', 'Dark Fantasy', 'Orphans', 'Survival', 'Dungeon', 'Summoned Into Another World', 'Modern Knowledge', 'Violence', 'Food And Beverage', 'Assassins',
  'Superhero', 'Based On A Doujinshi', 'Dragons', 'Weak to Strong', 'Medieval', 'Villainess', 'Cooking', 'Cultivation', 'Political', 'Post-Apocalyptic', 'Childcare', 'Parody',
  'Mature Romance', 'Gourmet', 'Iyashikei', 'Death Of A Loved One', 'Suspense', 'Mecha', 'War', 'Kingdom Building',
];

const RATE_18 = ['erotica', 'adult', 'smut', 'lolicon', 'shotacon', 'hentai', 'sexual violence'];
const RATE_16 = ['ecchi', 'mature', 'mature romance', 'loli', 'shota'];
const INDEX_GENRES = ['Erotica', 'Adult', 'Smut', 'Lolicon', 'Shotacon', 'Hentai', 'Sexual Violence', 'Ecchi', 'Mature', 'Mature Romance', 'Loli', 'Shota'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ascii(ch) {
  const map = { 8216: "'", 8217: "'", 8220: '"', 8221: '"', 8230: '...', 8211: '-', 8212: '-', 160: ' ' };
  const code = ch.charCodeAt(0);
  return map[code] !== undefined ? map[code] : ch;
}

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => ascii(String.fromCharCode(Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => ascii(String.fromCharCode(parseInt(n, 16))))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(text) {
  return plain(text).replace(/\s+/g, ' ').trim();
}

function ageOfGenres(genres) {
  const names = (Array.isArray(genres) ? genres : []).map((g) => String(g || '').trim().toLowerCase());
  if (names.some((n) => RATE_18.indexOf(n) >= 0)) return 18;
  if (names.some((n) => RATE_16.indexOf(n) >= 0)) return 16;
  return 0;
}

function thumbOf(url) {
  const text = String(url || '').trim();
  const m = /^https:\/\/cdn\.oriyami\.com\/covers\/([^/?#]+)$/.exec(text);
  if (!m) return /^https?:\/\//.test(text) ? text : '';
  let base = m[1];
  try {
    base = decodeURIComponent(base);
  } catch (e) {
    base = m[1];
  }
  return `${CDN}/covers/thumbs/240/${encodeURIComponent(base.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '.webp'))}`;
}

function fullCover(url) {
  const text = String(url || '').trim();
  return /^https?:\/\//.test(text) ? text : '';
}

function timeOf(text) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(Z|[+-]\d\d:?\d\d)?$/.exec(String(text || '').trim());
  if (!m) return undefined;
  let ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), m[7] ? Number(`${m[7]}00`.slice(0, 3)) : 0);
  if (m[8] && m[8] !== 'Z') {
    const sign = m[8].charAt(0) === '-' ? -1 : 1;
    const digits = m[8].replace(/[^0-9]/g, '');
    ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60000;
  }
  return Number.isFinite(ms) ? ms : undefined;
}

function statusOf(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED';
  return 'UNKNOWN';
}

function typeSlug(type) {
  return String(type || 'Manga').trim().toLowerCase().replace(/\s+/g, '-');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.titles = new Map();
    this.index = null;
    this.indexAt = 0;
    this.indexLoading = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((name) => ({ id: name, label: name }));
  }

  async api(path) {
    let last = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${API}${path}`, method: 'GET', headers: { Accept: 'application/json' } }));
        last = response.status;
        if (response.status === 404) return null;
        if (response.status >= 200 && response.status < 300) {
          let body;
          try {
            body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          } catch (e) {
            throw new Error('OriYami answered something that is not JSON');
          }
          if (!body || typeof body !== 'object') throw new Error('OriYami answered an empty body');
          return body;
        }
        if (response.status !== 429 && (response.status < 500 || response.status > 504)) throw new Error(`OriYami: HTTP ${response.status}`);
      } catch (e) {
        if (attempt === 2 || /OriYami/.test(String((e && e.message) || ''))) throw e;
      }
      await pause(600 * (attempt + 1));
    }
    throw new Error(`OriYami: HTTP ${last}`);
  }

  async loadIndex() {
    const filter = `genre=${encodeURIComponent(INDEX_GENRES.join(','))}&page_size=60`;
    const first = await this.api(`/browse/?${filter}&page=1`);
    if (!first || !Array.isArray(first.results)) throw new Error('OriYami rating index is empty');
    const rows = first.results.slice();
    const pages = Math.max(1, Math.ceil(Number(first.count || rows.length) / 60));
    if (pages > 1) {
      const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => this.api(`/browse/?${filter}&page=${i + 2}`)));
      for (const r of rest) {
        if (!r || !Array.isArray(r.results)) throw new Error('OriYami rating index is incomplete');
        rows.push(...r.results);
      }
    }
    const map = new Map();
    for (const it of rows) {
      const age = ageOfGenres(it && it.genres);
      if (it && it.id && age > 0) map.set(String(it.id), age);
    }
    return map;
  }

  async ratingIndex() {
    if (this.index && Date.now() - this.indexAt < 1800000) return this.index;
    if (!this.indexLoading) {
      this.indexLoading = (async () => {
        let map = null;
        try {
          map = await this.loadIndex();
        } catch (e) {
          await pause(500);
          try {
            map = await this.loadIndex();
          } catch (e2) {
            console.error('OriYami rating index failed: ' + (e2 && e2.message));
          }
        }
        if (map) {
          this.index = map;
          this.indexAt = Date.now();
        }
        this.indexLoading = null;
        return map;
      })();
    }
    return this.indexLoading;
  }

  card(it, age) {
    const slug = String(it.slug || '').trim();
    const title = oneLine(it.title);
    if (!slug || !title) return null;
    return { mangaId: slug, title, image: thumbOf(it.cover_url), medium: 'comics', ageRating: age };
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = Math.max(1, Number(metadata && metadata.page) || 1);
    if (query) {
      if (page > 1) return { results: [] };
      const [data, index] = await Promise.all([this.api(`/search/?q=${encodeURIComponent(query)}`), this.ratingIndex()]);
      const results = [];
      const seen = new Set();
      for (const it of Array.isArray(data && data.results) ? data.results : []) {
        if (!it || seen.has(it.slug)) continue;
        seen.add(it.slug);
        const age = index ? index.get(String(it.id)) || 0 : 16;
        const card = this.card(it, age);
        if (card) results.push(card);
      }
      return { results };
    }
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const raw = included.length ? String((included[0] && (included[0].id || included[0].label)) || included[0] || '').trim() : '';
    const genre = raw ? GENRES.find((g) => g.toLowerCase() === raw.toLowerCase()) || raw : '';
    let path;
    if (feed.kind === 'new' && !genre) {
      path = `/new/?page=${page}&page_size=${PAGE_SIZE}`;
    } else {
      path = `/browse/?page=${page}&page_size=${PAGE_SIZE}&sort=${feed.sort || 'latest_updates'}`;
      if (feed.type) path += `&type=${encodeURIComponent(feed.type)}`;
      if (genre) path += `&genre=${encodeURIComponent(genre)}`;
    }
    const data = await this.api(path);
    if (!data) return { results: [] };
    const results = [];
    for (const it of Array.isArray(data.results) ? data.results : []) {
      if (!it) continue;
      const card = this.card(it, ageOfGenres(it.genres));
      if (card) results.push(card);
    }
    const more = feed.kind === 'new' && !genre ? !!data.has_next : !!data.next;
    return { results, metadata: results.length && more ? { page: page + 1 } : undefined };
  }

  title(mangaId) {
    const key = String(mangaId || '').trim();
    if (!key) throw new Error('OriYami: no title id');
    const hit = this.titles.get(key);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.api(`/${encodeURIComponent(key)}/`).then((d) => {
      if (!d || !d.title) throw new Error('OriYami: title not found');
      return d;
    });
    this.titles.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.titles.get(key) && this.titles.get(key).promise === promise) this.titles.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const d = await this.title(mangaId);
    const genres = (Array.isArray(d.genres) ? d.genres : []).map((g) => oneLine(g)).filter(Boolean);
    const authors = (Array.isArray(d.mangakas) ? d.mangakas : []).map((a) => oneLine(typeof a === 'string' ? a : a && a.name)).filter(Boolean);
    const info = {
      title: oneLine(d.title),
      image: fullCover(d.cover_url),
      desc: plain(d.synopsis) || undefined,
      status: statusOf(d.status),
      tags: genres,
      webURL: `${SITE}/${typeSlug(d.type || d.manga_type)}/${encodeURIComponent(String(d.slug || mangaId))}`,
      medium: 'comics',
      ageRating: ageOfGenres(genres),
    };
    if (authors.length) info.author = authors.join(', ');
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const d = await this.title(mangaId);
    const scans = Array.isArray(d.scans) ? d.scans : [];
    const rows = [];
    const seen = new Set();
    for (const c of scans) {
      const id = String((c && c.number) === undefined || (c && c.number) === null ? '' : c.number).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const kind = oneLine(c.kind);
      const row = { id, chapterId: id, name: !kind || kind.toLowerCase() === 'chapter' ? `Chapter ${id}` : `${kind} ${id}` };
      const number = Number(id);
      if (Number.isFinite(number)) row.number = number;
      const time = timeOf(c.published_at) || timeOf(c.created_at);
      if (time !== undefined) row.time = time;
      rows.push(row);
    }
    if (!rows.length) {
      if (Number(d.chapters_count) > 0) throw new Error('OriYami listed chapters for this title but sent none');
      return [];
    }
    rows.sort((a, b) => (b.number || 0) - (a.number || 0) || (b.time || 0) - (a.time || 0));
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const slug = String(mangaId || '').trim();
    const number = String(chapterId === undefined || chapterId === null ? '' : chapterId).trim();
    if (!slug || !number) throw new Error('OriYami: no chapter id');
    const d = await this.api(`/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(number)}/`);
    if (!d) throw new Error('OriYami: chapter not found');
    if (d.number !== undefined && d.number !== null && String(d.number).trim() !== number) throw new Error(`OriYami answered chapter ${d.number} for chapter ${number}`);
    const list = (Array.isArray(d.pages) ? d.pages : []).slice().sort((a, b) => Number((a && a.index) || 0) - Number((b && b.index) || 0));
    const pages = list.map((p) => String((p && p.image_url) || '').trim()).filter((u) => /^https?:\/\//.test(u));
    if (!pages.length) throw new Error('OriYami has no pages for this chapter yet');
    return { id: number, mangaId: slug, pages };
  }
}

module.exports = { Source };
