const CINEMETA = 'https://v3-cinemeta.strem.io';
const PLAYER = 'https://vaplayer.ru';
const SERVER = 'VaPlayer';
const POSTER = 'https://images.metahub.space/poster/';
const BACKGROUND = 'https://images.metahub.space/background/small/';

const FEEDS = [
  { id: 'movies', name: 'Popular Movies', type: 'movie', catalog: 'top' },
  { id: 'series', name: 'Popular Series', type: 'series', catalog: 'top' },
  { id: 'featuredmovies', name: 'Featured Movies', type: 'movie', catalog: 'imdbRating' },
  { id: 'featuredseries', name: 'Featured Series', type: 'series', catalog: 'imdbRating' },
  { id: 'newmovies', name: 'New Movies', type: 'movie', catalog: 'year' },
  { id: 'newseries', name: 'New Series', type: 'series', catalog: 'year' },
];

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance',
  'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western', 'Reality-TV', 'Talk-Show', 'Game-Show',
];

const PAGE = 50;

const EXPLICIT = /\b(porn\w*|hentai|erotic\w*|softcore|orgy|orgies|nympho\w*|fetish\w*|bdsm|incest\w*|nudity|sex(?:ual)? (?:scenes?|tape|slave|videos?)|sexually explicit|adult film)\b/i;
const EXPLICIT_TITLE = /\b(emmanuelle|playboy|penthouse|milf|hotwife|cuckold|gangbang|threesome)\b/i;
const SUGGESTIVE = /\b(sex|sexual\w*|sexy|seduc\w*|stripper\w*|strip club|prostitut\w*|lust\w*|mistress\w*|affair|rape\w*|kinky|nude|naked|ecchi|lewd|pervert\w*|x-rated)\b/i;

function cleanText(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function ageOf(item) {
  if (!item) return 0;
  const name = cleanText(item.name);
  const text = `${name} ${cleanText(item.description)}`;
  if (EXPLICIT.test(text) || EXPLICIT_TITLE.test(name)) return 18;
  if (SUGGESTIVE.test(text)) return 16;
  if (Array.isArray(item.genres) && item.genres.indexOf('Horror') !== -1) return 16;
  return 0;
}

function parseId(mangaId) {
  const m = /^(movie|series):(tt\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('MeowTV: unknown title id ' + mangaId);
  return { type: m[1], imdb: m[2] };
}

function posterOf(imdb, size) {
  return `${POSTER}${size}/${imdb}/img`;
}

function releaseTime(text) {
  const t = Date.parse(String(text || ''));
  return Number.isFinite(t) ? t : undefined;
}

function chapterTime(when) {
  return when !== undefined && when > 1e11 ? when : undefined;
}

function yearOf(item) {
  const m = /(\d{4})/.exec(String(item.year || item.releaseInfo || item.released || ''));
  return m ? m[1] : '';
}

function card(item, type) {
  if (!item || !/^tt\d+$/.test(String(item.id || ''))) return null;
  const title = cleanText(item.name);
  if (!title) return null;
  const when = releaseTime(item.released);
  if (when !== undefined && when > Date.now()) return null;
  const out = {
    mangaId: `${type}:${item.id}`,
    title,
    image: posterOf(item.id, 'small'),
    webURL: `https://www.imdb.com/title/${item.id}/`,
    medium: 'anime',
    ageRating: ageOf(item),
  };
  const year = yearOf(item);
  if (year) out.releaseDate = year;
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.metas = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last;
  }

  async json(url) {
    let status = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.send({ url: attempt ? `${url}?r=${attempt}` : url, method: 'GET', headers: { Accept: 'application/json' } });
      status = response.status;
      if (status >= 200 && status < 300) {
        try {
          const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          if (data && typeof data === 'object') return data;
        } catch (e) {
        }
        status = 0;
      } else if (status < 500) {
        break;
      }
    }
    if (!status) throw new Error('MeowTV: Cinemeta did not answer JSON');
    throw new Error('MeowTV: Cinemeta answered HTTP ' + status);
  }

  meta(type, imdb) {
    const key = `${type}:${imdb}`;
    const kept = this.metas.get(key);
    if (kept && Date.now() - kept.at < 600000) return kept.pending;
    const pending = this.json(`${CINEMETA}/meta/${type}/${imdb}.json`).then((data) => {
      if (!data.meta || !data.meta.id) throw new Error('MeowTV: Cinemeta has no page for ' + imdb);
      return data.meta;
    });
    this.metas.set(key, { at: Date.now(), pending });
    pending.catch(() => {
      const now = this.metas.get(key);
      if (now && now.pending === pending) this.metas.delete(key);
    });
    return pending;
  }

  async list(path, type) {
    const data = await this.json(`${CINEMETA}/catalog/${type}/${path}.json`);
    return Array.isArray(data.metas) ? data.metas : [];
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const skip = metadata && Number.isFinite(metadata.skip) && metadata.skip > 0 ? metadata.skip : 0;
    if (query) {
      if (skip > 0) return { results: [] };
      return { results: await this.search(query) };
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? cleanText(included[0] && (included[0].id || included[0])) : '';
    const extras = [];
    let catalog = feed.catalog;
    if (tag) {
      if (GENRES.indexOf(tag) === -1) return { results: [] };
      if (catalog === 'year') catalog = 'top';
      extras.push('genre=' + encodeURIComponent(tag));
    } else if (catalog === 'year') {
      extras.push('genre=' + new Date().getFullYear());
    }
    if (skip > 0) extras.push('skip=' + skip);
    let metas = await this.list(`${catalog}${extras.length ? '/' + extras.join('&') : ''}`, feed.type);
    if (!metas.length && !tag && feed.catalog === 'year' && skip === 0) {
      metas = await this.list(`year/genre=${new Date().getFullYear() - 1}`, feed.type);
    }
    const results = [];
    const seen = new Set();
    metas.forEach((item) => {
      const c = card(item, feed.type);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        results.push(c);
      }
    });
    return metas.length >= 40 ? { results, metadata: { skip: skip + PAGE } } : { results };
  }

  async search(query) {
    const text = encodeURIComponent(query);
    const answers = await Promise.all(
      ['movie', 'series'].map((type) =>
        this.list(`top/search=${text}`, type).then(
          (metas) => metas.map((m) => ({ item: m, type })),
          (e) => {
            if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
            return null;
          }
        )
      )
    );
    if (answers.every((a) => a === null)) throw new Error('MeowTV: the search failed');
    const merged = [];
    const lists = answers.map((a) => a || []);
    for (let i = 0; i < Math.max(lists[0].length, lists[1].length); i++) {
      lists.forEach((l) => {
        if (i < l.length) merged.push(l[i]);
      });
    }
    const rated = [];
    let next = 0;
    const worker = async () => {
      while (next < merged.length) {
        const row = merged[next++];
        let item = row.item;
        try {
          item = await this.meta(row.type, row.item.id);
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        }
        rated.push({ row, item });
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, merged.length) }, worker));
    const order = new Map(merged.map((row, i) => [row, i]));
    rated.sort((a, b) => order.get(a.row) - order.get(b.row));
    const results = [];
    const seen = new Set();
    rated.forEach(({ row, item }) => {
      const c = card(Object.assign({}, row.item, item, { id: row.item.id }), row.type);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        results.push(c);
      }
    });
    return results;
  }

  async getMangaDetails(mangaId) {
    const { type, imdb } = parseId(mangaId);
    const m = await this.meta(type, imdb);
    const title = cleanText(m.name);
    if (!title) throw new Error('MeowTV: title not found');
    const notes = [];
    if (cleanText(m.imdbRating)) notes.push(`IMDb ${cleanText(m.imdbRating)}`);
    if (cleanText(m.runtime)) notes.push(cleanText(m.runtime));
    if (cleanText(m.country)) notes.push(cleanText(m.country));
    const desc = [cleanText(m.description), notes.join(', ')].filter(Boolean).join('\n\n');
    const status = type === 'movie' ? 'COMPLETED' : /ended|cancel/i.test(cleanText(m.status)) ? 'COMPLETED' : 'ONGOING';
    const info = {
      title,
      image: posterOf(imdb, 'medium'),
      banner: `${BACKGROUND}${imdb}/img`,
      desc,
      status,
      completed: status === 'COMPLETED',
      tags: (Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : []).map(cleanText).filter(Boolean),
      webURL: `https://www.imdb.com/title/${imdb}/`,
      medium: 'anime',
      ageRating: ageOf(m),
    };
    const year = yearOf(m);
    if (year) info.releaseDate = year;
    const people = (Array.isArray(m.director) && m.director.length ? m.director : Array.isArray(m.writer) ? m.writer : []).map(cleanText).filter(Boolean);
    if (people.length) info.author = people.slice(0, 3).join(', ');
    const cast = (Array.isArray(m.cast) ? m.cast : []).map(cleanText).filter(Boolean).slice(0, 20).map((name) => ({ name }));
    if (cast.length) info.cast = cast;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { type, imdb } = parseId(mangaId);
    const m = await this.meta(type, imdb);
    if (type === 'movie') {
      const row = { id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 };
      const minutes = parseInt(cleanText(m.runtime), 10);
      if (minutes > 0) row.duration = minutes * 60;
      const when = chapterTime(releaseTime(m.released));
      if (when !== undefined) row.time = when;
      return [row];
    }
    const now = Date.now();
    const rows = [];
    const seen = new Set();
    (Array.isArray(m.videos) ? m.videos : []).forEach((v) => {
      const season = Number(v && v.season);
      const number = Number(v && (v.episode !== undefined && v.episode !== null ? v.episode : v.number));
      if (!Number.isFinite(season) || !Number.isFinite(number) || season < 1 || number < 1) return;
      const when = releaseTime(v.released || v.firstAired);
      if (when !== undefined && when > now) return;
      const id = `s${season}e${number}`;
      if (seen.has(id)) return;
      seen.add(id);
      rows.push({ id, season, number, when, name: cleanText(v.name || v.title), still: cleanText(v.thumbnail), summary: cleanText(v.overview || v.description) });
    });
    if (!rows.length) throw new Error('MeowTV has no aired episodes for this show yet');
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: r.name ? `Episode ${r.number}: ${r.name}` : `Episode ${r.number}`, number: r.number };
      const when = chapterTime(r.when);
      if (when !== undefined) out.time = when;
      if (r.name) out.title = r.name;
      if (/^https:\/\//.test(r.still)) out.thumbnail = r.still;
      if (r.summary) out.summary = r.summary;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const { type, imdb } = parseId(mangaId);
    const m = await this.meta(type, imdb);
    const tmdb = Number(m.moviedb_id) > 0 ? String(Number(m.moviedb_id)) : '';
    if (type === 'movie') {
      const when = releaseTime(m.released);
      if (when !== undefined && when > Date.now()) throw new Error(`${cleanText(m.name)} comes out on ${new Date(when).toISOString().slice(0, 10)}, so it has no stream yet`);
      return [{ type: 'embed', url: `${PLAYER}/embed/movie/${tmdb || imdb}`, quality: 'Auto', server: SERVER }];
    }
    const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
    if (!ep) throw new Error('MeowTV: unknown episode id ' + chapterId);
    return [{ type: 'embed', url: `${PLAYER}/embed/tv/${tmdb || imdb}/${Number(ep[1])}/${Number(ep[2])}`, quality: 'Auto', server: SERVER }];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
