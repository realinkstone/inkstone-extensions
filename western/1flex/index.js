const NAME = '1Flex';
const META = 'https://v3-cinemeta.strem.io';
const POSTER = 'https://images.metahub.space/poster/small/';
const BACKGROUND = 'https://images.metahub.space/background/small/';
const PAGE = 50;
const SEARCH_BUDGET_MS = 2500;

const SERVERS = [
  {
    name: 'VidFast',
    movie: (id) => `https://vidfast.vc/movie/${id}`,
    tv: (id, season, episode) => `https://vidfast.vc/tv/${id}/${season}/${episode}`,
  },
  {
    name: 'VidZee',
    movie: (id) => `https://player.vidzee.wtf/embed/movie/${id}`,
    tv: (id, season, episode) => `https://player.vidzee.wtf/embed/tv/${id}/${season}/${episode}`,
  },
  {
    name: 'Vidy',
    movie: (id) => `https://vidy.st/movie/${id}`,
    tv: (id, season, episode) => `https://vidy.st/tv/${id}/${season}/${episode}`,
  },
  {
    name: 'Viduki',
    movie: (id) => `https://www.viduki.net/1/movie/${id}`,
    tv: (id, season, episode) => `https://www.viduki.net/1/tv/${id}/${season}/${episode}`,
  },
];

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', type: 'movie', catalog: 'top' },
  { id: 'movies-new', name: 'Movies: Newest', type: 'movie', catalog: 'year' },
  { id: 'movies-rated', name: 'Movies: Top rated', type: 'movie', catalog: 'imdbRating' },
  { id: 'series-popular', name: 'TV: Popular', type: 'series', catalog: 'top' },
  { id: 'series-new', name: 'TV: Newest', type: 'series', catalog: 'year' },
  { id: 'series-rated', name: 'TV: Top rated', type: 'series', catalog: 'imdbRating' },
];

const MOVIE_GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];
const SERIES_GENRES = MOVIE_GENRES.concat(['Reality-TV', 'Talk-Show', 'Game-Show']);

const EXPLICIT = /\b(porn\w*|hentai|erotic\w*|softcore|orgy|orgies|nympho\w*|fetish\w*|bdsm|incest\w*|nudity|sex(?:ual)? (?:scenes?|tape|slave|videos?)|sexually explicit|adult film)\b/i;
const EXPLICIT_TITLE = /\b(emmanuelle|playboy|penthouse|milf|hotwife|cuckold|gangbang|threesome)\b/i;
const SUGGESTIVE = /\b(sex|sexual\w*|sexy|seduc\w*|stripper\w*|strip club|prostitut\w*|lust\w*|mistress\w*|affair|rape\w*|kinky)\b/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function ageOf(item) {
  if (!item) return 0;
  const name = cleanText(item.name);
  const genres = Array.isArray(item.genres) ? item.genres : Array.isArray(item.genre) ? item.genre : [];
  if (genres.some((g) => /^adult$/i.test(String(g)))) return 18;
  const text = `${name} ${cleanText(item.description)}`;
  if (EXPLICIT.test(text) || EXPLICIT_TITLE.test(name)) return 18;
  if (SUGGESTIVE.test(text)) return 16;
  return 0;
}

function posterOf(imdb) {
  return `${POSTER}${imdb}/img`;
}

function idOf(type, imdb) {
  return `${type}:${imdb}`;
}

function parseId(mangaId) {
  const m = /^(movie|series):(tt\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error(`${NAME}: unknown title id ${mangaId}`);
  return { type: m[1], imdb: m[2] };
}

function yearOf(item) {
  const m = /^(\d{4})/.exec(String(item.releaseInfo || item.year || ''));
  return m ? m[1] : '';
}

function card(item, type) {
  if (!item || !/^tt\d+$/.test(String(item.id || ''))) return null;
  const title = cleanText(item.name);
  if (!title) return null;
  return {
    mangaId: idOf(type, item.id),
    title,
    image: item.poster ? String(item.poster) : posterOf(item.id),
    medium: 'anime',
    ageRating: ageOf(item),
  };
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
    return SERIES_GENRES.map((g) => ({ id: g, label: g }));
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const skip = (page - 1) * PAGE;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const genre = included.length ? SERIES_GENRES.find((g) => g.toLowerCase() === String(included[0].id || included[0].label || included[0]).toLowerCase()) : '';
    const feed = FEEDS.find((f) => f.id === (request && request.feed));

    const asks = [];
    if (query) {
      if (page > 1) return { results: [] };
      ['movie', 'series'].forEach((type) => asks.push({ type, path: `/catalog/${type}/top/search=${encodeURIComponent(query)}.json` }));
    } else if (genre) {
      const kinds = feed ? [feed.type] : ['movie', 'series'];
      kinds.forEach((type) => {
        if (type === 'movie' && MOVIE_GENRES.indexOf(genre) < 0) return;
        const catalog = feed && feed.catalog === 'imdbRating' ? 'imdbRating' : 'top';
        asks.push({ type, path: `/catalog/${type}/${catalog}/genre=${encodeURIComponent(genre)}${skip ? `&skip=${skip}` : ''}.json` });
      });
    } else {
      const f = feed || FEEDS[0];
      asks.push({ type: f.type, path: `/catalog/${f.type}/${f.catalog}${skip ? `/skip=${skip}` : ''}.json` });
    }
    if (!asks.length) return { results: [] };

    const lists = await Promise.all(
      asks.map((ask) =>
        this.json(META + ask.path).then(
          (data) => ({ type: ask.type, metas: Array.isArray(data && data.metas) ? data.metas : [] }),
          (error) => {
            if (error && (error.kind === 'challenge' || error.kind === 'blocked')) throw error;
            return { type: ask.type, metas: null, error };
          }
        )
      )
    );
    if (lists.every((l) => l.metas === null)) throw lists[0].error || new Error(`${NAME}: the catalog did not answer`);

    const cards = [];
    const seen = new Set();
    const longest = Math.max(...lists.map((l) => (l.metas || []).length));
    for (let i = 0; i < longest; i++) {
      lists.forEach((l) => {
        const c = l.metas && l.metas[i] ? card(l.metas[i], l.type) : null;
        if (c && !seen.has(c.mangaId)) {
          seen.add(c.mangaId);
          cards.push(c);
        }
      });
    }
    if (query) await this.rateSearch(cards);
    const more = !query && lists.some((l) => (l.metas || []).length > 0);
    return more ? { results: cards, metadata: { page: page + 1 } } : { results: cards };
  }

  async rateSearch(cards) {
    let next = 0;
    const worker = async () => {
      while (next < cards.length) {
        const c = cards[next++];
        try {
          const { type, imdb } = parseId(c.mangaId);
          const m = await this.meta(type, imdb);
          c.ageRating = Math.max(c.ageRating, ageOf(m));
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        }
      }
    };
    const work = Promise.all(Array.from({ length: 8 }, worker));
    await Promise.race([work, new Promise((resolve) => setTimeout(resolve, SEARCH_BUDGET_MS))]);
  }

  async getMangaDetails(mangaId) {
    const { type, imdb } = parseId(mangaId);
    const d = await this.meta(type, imdb);
    const title = cleanText(d.name);
    if (!title) throw new Error(`${NAME}: title not found`);
    const status = type === 'movie' ? 'COMPLETED' : /ended|cancel/i.test(d.status || '') ? 'COMPLETED' : 'ONGOING';
    const info = {
      title,
      image: d.poster ? String(d.poster) : posterOf(imdb),
      banner: `${BACKGROUND}${imdb}/img`,
      desc: cleanText(d.description),
      status,
      completed: status === 'COMPLETED',
      tags: (Array.isArray(d.genres) ? d.genres : Array.isArray(d.genre) ? d.genre : []).map(cleanText).filter(Boolean),
      medium: 'anime',
      ageRating: ageOf(d),
    };
    const year = yearOf(d);
    if (year) info.releaseDate = year;
    const people = (Array.isArray(d.director) ? d.director : []).concat(type === 'series' && !(d.director && d.director.length) ? d.writer || [] : []);
    const names = people.map(cleanText).filter(Boolean).filter((n, i, a) => a.indexOf(n) === i);
    if (names.length) info.author = names.join(', ');
    const cast = (Array.isArray(d.cast) ? d.cast : []).slice(0, 20).map((n) => ({ name: cleanText(n) })).filter((p) => p.name);
    if (cast.length) info.cast = cast;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { type, imdb } = parseId(mangaId);
    if (type === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const d = await this.meta(type, imdb);
    const now = Date.now();
    const rows = [];
    const seen = new Set();
    (Array.isArray(d.videos) ? d.videos : []).forEach((v) => {
      const season = Number(v.season);
      const number = Number(v.episode !== undefined && v.episode !== null ? v.episode : v.number);
      if (!Number.isFinite(season) || season < 1 || !Number.isFinite(number)) return;
      const key = `${season}:${number}`;
      if (seen.has(key)) return;
      const air = v.released || v.firstAired ? Date.parse(v.released || v.firstAired) : NaN;
      if (Number.isFinite(air) && air > now + 86400000) return;
      seen.add(key);
      rows.push({ season, number, name: cleanText(v.name || v.title), time: Number.isFinite(air) ? air : undefined, still: v.thumbnail, summary: cleanText(v.overview || v.description) });
    });
    if (!rows.length) throw new Error(`${NAME} has no aired episodes listed for this show yet`);
    rows.sort((x, y) => y.season - x.season || y.number - x.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const id = `s${r.season}e${r.number}`;
      const out = { id, chapterId: id, name: r.name ? `Episode ${r.number}: ${r.name}` : `Episode ${r.number}`, number: r.number };
      if (r.time !== undefined) out.time = r.time;
      if (r.name) out.title = r.name;
      if (/^https:\/\//.test(String(r.still || ''))) out.thumbnail = r.still;
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
    const d = await this.meta(type, imdb);
    const tmdb = Number(d.moviedb_id);
    if (!Number.isFinite(tmdb) || tmdb <= 0) throw new Error(`${NAME} has no TMDB id for this title in its catalog, so no player can be opened for it`);
    let season = 0;
    let episode = 0;
    if (type === 'series') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error(`${NAME}: unknown episode id ${chapterId}`);
      season = Number(ep[1]);
      episode = Number(ep[2]);
    }
    return SERVERS.map((server) => ({
      url: type === 'movie' ? server.movie(tmdb) : server.tv(tmdb, season, episode),
      type: 'embed',
      quality: server.name,
      server: server.name,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  meta(type, imdb) {
    const key = `${type}:${imdb}`;
    if (!this.metas.has(key)) {
      const pending = this.json(`${META}/meta/${type}/${imdb}.json`).then((data) => {
        if (!data || !data.meta || !data.meta.name) throw new Error(`${NAME}: title not found`);
        return data.meta;
      });
      pending.catch(() => this.metas.delete(key));
      this.metas.set(key, pending);
    }
    return this.metas.get(key);
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
    const response = await this.send({ url, method: 'GET', headers: { Accept: 'application/json' } });
    if (response.status === 404) throw new Error(`${NAME}: not found (HTTP 404)`);
    if (response.status < 200 || response.status >= 300) throw new Error(`${NAME}: HTTP ${response.status}`);
    try {
      return JSON.parse(String(response.data || ''));
    } catch (e) {
      throw new Error(`${NAME}: the catalog answered something that is not JSON`);
    }
  }
}

module.exports = { Source };
