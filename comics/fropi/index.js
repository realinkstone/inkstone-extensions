const SITE = 'https://fropi.net';
const API = 'https://fropi.net/api/v1';
const PAGE = 30;

const FEEDS = [
  { id: 'updated', name: 'Latest Updates' },
  { id: 'popularity', name: 'Popular' },
  { id: 'rating', name: 'Top Rated' },
  { id: 'latest', name: 'New Series' },
  { id: 'chapters', name: 'Most Chapters' },
];

const GENRES_18 = ['adult', 'smut', 'hentai', 'erotica', 'explicit sex', 'hardcore'];
const GENRES_16 = ['mature', 'ecchi'];
const TAGS_16 = /\brape\b|attempted rape|sexual assault|sexually active|born from incest|\br19\b/i;

function oneLine(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/\s+/g, ' ')
    .trim();
}

function ageOfSite(word) {
  const w = oneLine(word).toLowerCase();
  if (w === 'mature_18' || w === 'adult_21') return 18;
  if (w === 'teen_15' || w === 'teen_16') return 16;
  if (w === 'all_ages' || w === 'teen_13') return 0;
  return undefined;
}

function ageOfGenres(genres) {
  const names = (genres || []).map((g) => oneLine(g).toLowerCase());
  if (names.some((g) => GENRES_18.indexOf(g) >= 0)) return 18;
  if (names.some((g) => GENRES_16.indexOf(g) >= 0)) return 16;
  return 0;
}

function statusOf(word) {
  const w = oneLine(word).toLowerCase();
  if (w === 'ongoing') return 'ONGOING';
  if (w === 'completed') return 'COMPLETED';
  if (w === 'hiatus' || w === 'on_hold') return 'HIATUS';
  if (w === 'cancelled' || w === 'canceled' || w === 'dropped') return 'CANCELLED';
  return 'UNKNOWN';
}

function remaining(freeAt) {
  const ms = Date.parse(freeAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const minutes = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.series = new Map();
    this.genres = null;
    this.index = null;
    this.indexAt = 0;
    this.indexLoading = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async api(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${API}${path}` + (attempt === 0 ? '' : (path.indexOf('?') >= 0 ? '&' : '?') + 'r=1');
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
        if (response.status >= 502 && response.status <= 504 && attempt === 0) {
          last = new Error(`Fropi: HTTP ${response.status}`);
          continue;
        }
        let body = null;
        try {
          body = JSON.parse(response.data);
        } catch (e) {
          body = null;
        }
        if (response.status < 200 || response.status >= 300) {
          const problem = body && body.error ? `${oneLine(body.error.code)} ${oneLine(body.error.message)}` : '';
          throw new Error(`Fropi: HTTP ${response.status}${problem ? ' ' + problem : ''}`);
        }
        if (!body || typeof body !== 'object') throw new Error('Fropi answered something that is not JSON');
        return body;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (e && /^Fropi/.test(String(e.message)) && !/HTTP 50[234]/.test(String(e.message))) throw e;
        last = e;
      }
    }
    throw last || new Error('Fropi: request failed');
  }

  async ratingIndex() {
    if (this.index && Date.now() - this.indexAt < 1800000) return this.index;
    if (!this.indexLoading) {
      const read = async (query) => {
        const slugs = new Set();
        let cursor = '';
        for (let guard = 0; guard < 5; guard++) {
          const data = await this.api(`/series?limit=50&${query}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
          for (const it of Array.isArray(data.items) ? data.items : []) if (it && it.slug) slugs.add(String(it.slug));
          cursor = data.nextCursor || '';
          if (!cursor) break;
        }
        return slugs;
      };
      this.indexLoading = Promise.all([read('ageRating=mature_18&ageRating=adult_21'), read('ageRating=teen_15&ageRating=teen_16')])
        .then(
          ([adult, teen]) => {
            this.index = { adult, teen, ok: true };
            this.indexAt = Date.now();
            return this.index;
          },
          (e) => {
            console.error('Fropi rating index failed: ' + (e && e.message));
            return { adult: new Set(), teen: new Set(), ok: false };
          },
        )
        .then((index) => {
          this.indexLoading = null;
          return index;
        });
    }
    return this.indexLoading;
  }

  async getSearchTags() {
    if (!this.genres) {
      const counts = new Map();
      let cursor = '';
      for (let guard = 0; guard < 10; guard++) {
        const data = await this.api(`/series?limit=50${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
        for (const it of Array.isArray(data.items) ? data.items : []) {
          for (const g of Array.isArray(it && it.genres) ? it.genres : []) {
            const name = oneLine(g);
            if (name) counts.set(name, (counts.get(name) || 0) + 1);
          }
        }
        cursor = data.nextCursor || '';
        if (!cursor) break;
      }
      if (!counts.size) throw new Error('Fropi: no genres were found in the catalog');
      this.genres = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([name]) => ({ id: name, label: name }));
    }
    return this.genres;
  }

  card(item, index) {
    const slug = oneLine(item && item.slug);
    const title = oneLine(item && item.title);
    if (!slug || !title) return null;
    const genres = Array.isArray(item.genres) ? item.genres.map((g) => oneLine(g)).filter(Boolean) : [];
    const card = {
      mangaId: slug,
      title,
      image: /^https?:\/\//.test(String(item.cover && item.cover.url)) ? item.cover.url : '',
      referer: SITE + '/',
      tags: genres,
      medium: 'comics',
    };
    const fromGenres = ageOfGenres(genres);
    let age;
    if (index.adult.has(slug)) age = 18;
    else if (index.teen.has(slug)) age = 16;
    else if (index.ok) age = 0;
    if (age === undefined) {
      if (fromGenres > 0) age = fromGenres;
    } else {
      age = Math.max(age, fromGenres);
    }
    if (age !== undefined) card.ageRating = age;
    return card;
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const wanted = included.map((t) => oneLine(t && typeof t === 'object' ? t.id || t.label : t)).filter(Boolean);
    const feed = FEEDS.find((f) => f.id === String((request && request.feed) || '')) || FEEDS[0];
    let cursor = (metadata && metadata.cursor) || '';
    const results = [];
    const seen = new Set();
    const indexLoad = this.ratingIndex();
    let next = '';
    for (let guard = 0; guard < 6; guard++) {
      let path = `/series?limit=${PAGE}&sort=${feed.id}`;
      if (query) path += `&q=${encodeURIComponent(query)}`;
      if (wanted.length) path += `&genre=${encodeURIComponent(wanted[0])}`;
      if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
      const data = await this.api(path);
      const index = await indexLoad;
      for (const item of Array.isArray(data.items) ? data.items : []) {
        const card = this.card(item, index);
        if (!card || seen.has(card.mangaId)) continue;
        if (wanted.length && !wanted.every((g) => card.tags.indexOf(g) >= 0)) continue;
        seen.add(card.mangaId);
        results.push(card);
      }
      next = data.nextCursor || '';
      if (results.length || !next) break;
      cursor = next;
    }
    return { results, metadata: results.length && next ? { cursor: next } : undefined };
  }

  seriesOf(slug) {
    const key = String(slug);
    const kept = this.series.get(key);
    if (kept && Date.now() - kept.at < 180000) return kept.promise;
    const promise = this.api(`/series/${encodeURIComponent(key)}`);
    this.series.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      const now = this.series.get(key);
      if (now && now.promise === promise) this.series.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const d = await this.seriesOf(mangaId);
    const title = oneLine(d && d.title);
    if (!title) throw new Error('Fropi: title not found');
    const genres = Array.isArray(d.genres) ? d.genres.map((g) => oneLine(g)).filter(Boolean) : [];
    const tags = Array.isArray(d.tags) ? d.tags.map((t) => oneLine(t)).filter(Boolean) : [];
    const info = {
      title,
      image: /^https?:\/\//.test(String(d.cover && d.cover.url)) ? d.cover.url : '',
      referer: SITE + '/',
      status: statusOf(d.status),
      tags: genres.concat(tags.filter((t) => genres.indexOf(t) < 0)),
      webURL: `${SITE}/series/${encodeURIComponent(String(mangaId))}`,
      medium: 'comics',
    };
    const desc = String(d.description || '').trim();
    if (desc) info.desc = desc;
    const names = [];
    for (const n of (Array.isArray(d.authors) ? d.authors : []).concat(Array.isArray(d.artists) ? d.artists : [])) {
      const name = oneLine(n);
      if (name && names.indexOf(name) < 0) names.push(name);
    }
    if (names.length) info.author = names.join(', ');
    const publishers = (Array.isArray(d.publishers) ? d.publishers : []).map((p) => oneLine(p)).filter(Boolean);
    if (publishers.length) info.publisher = publishers.join(', ');
    let age = ageOfSite(d.ageRating);
    const rated = Math.max(age === undefined ? 0 : age, ageOfGenres(genres));
    age = tags.some((t) => TAGS_16.test(t)) ? Math.max(rated, 16) : rated;
    info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const slug = encodeURIComponent(String(mangaId));
    const [d, first] = await Promise.all([this.seriesOf(mangaId), this.api(`/series/${slug}/chapters?limit=100`)]);
    const items = Array.isArray(first.items) ? first.items.slice() : [];
    let cursor = first.nextCursor || '';
    for (let guard = 0; cursor && guard < 40; guard++) {
      const page = await this.api(`/series/${slug}/chapters?limit=100&cursor=${encodeURIComponent(cursor)}`);
      for (const it of Array.isArray(page.items) ? page.items : []) items.push(it);
      cursor = page.nextCursor || '';
    }
    if (cursor) throw new Error('Fropi: the chapter list did not end');
    const rows = [];
    const seen = new Set();
    for (const c of items) {
      const id = oneLine(c && c.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const number = Number(c.number);
      const label = Number.isFinite(number) ? String(number) : '';
      const heading = c.title ? `Chapter ${label} - ${oneLine(c.title)}` : `Chapter ${label}`;
      let name = heading.trim();
      const access = c.access || {};
      if (access.locked) {
        const left = access.freeAt ? remaining(access.freeAt) : '';
        name += left ? ` (Locked, unlocks in ${left})` : ` (Locked, ${Number(access.price) > 0 ? Number(access.price) + ' coins' : 'Coins'})`;
      }
      const row = { id, chapterId: id, name };
      if (Number.isFinite(number)) row.number = number;
      const translator = oneLine(c.translator);
      if (translator) row.group = translator;
      const time = Date.parse(c.publishedAt);
      if (Number.isFinite(time)) row.time = time;
      rows.push(row);
    }
    const declared = Number(d && d.chapterCount);
    if (Number.isFinite(declared) && rows.length < declared) throw new Error(`Fropi: read ${rows.length} of ${declared} chapters`);
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const data = await this.api(`/series/${encodeURIComponent(String(mangaId))}/chapters/${encodeURIComponent(String(chapterId))}`);
    const pages = (Array.isArray(data.pages) ? data.pages : [])
      .slice()
      .sort((a, b) => (Number(a && a.index) || 0) - (Number(b && b.index) || 0))
      .map((p) => oneLine(p && p.url))
      .filter((u) => /^https?:\/\//.test(u));
    if (!pages.length && !(data.access && data.access.locked)) throw new Error('Fropi has no pages for this chapter yet');
    return { id: String(chapterId), mangaId, pages, referer: SITE + '/' };
  }
}

module.exports = { Source };
