const SITES = ['https://anicine.sbs'];
let SITE = SITES[0];
const BOLTS = ['https://vidbolt.xyz', 'https://vidbolt.pro'];
const MEGAPLAY = 'https://megaplay.buzz';
const IMG = 'https://image.tmdb.org/t/p';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ENC_KEY = 'i?LMTAx0Q6,:}50U';
const ENC_IV = "W0;27ToaUpl_P%'c";

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', path: '/movie/popular' },
  { id: 'movies-top', name: 'Movies: Top rated', kind: 'movie', path: '/movie/top_rated' },
  { id: 'movies-new', name: 'Movies: In theaters', kind: 'movie', path: '/movie/now_playing' },
  { id: 'series-popular', name: 'Series: Popular', kind: 'tv', path: '/tv/popular' },
  { id: 'series-top', name: 'Series: Top rated', kind: 'tv', path: '/tv/top_rated' },
  { id: 'series-air', name: 'Series: On the air', kind: 'tv', path: '/tv/on_the_air' },
  { id: 'anime-trending', name: 'Anime: Trending', kind: 'anime', mode: 'trending' },
  { id: 'anime-popular', name: 'Anime: Popular', kind: 'anime', mode: 'popular' },
  { id: 'anime-top', name: 'Anime: Top rated', kind: 'anime', mode: 'top' },
  { id: 'anime-airing', name: 'Anime: Airing now', kind: 'anime', mode: 'airing' },
];

const ORIGINAL_LANGUAGE = {
  ko: /^korean/i, ja: /^japanese/i, zh: /^(mandarin|chinese|cantonese)/i, cn: /^(mandarin|chinese|cantonese)/i, hi: /^hindi/i, es: /spanish/i, fr: /^french/i, de: /^german/i,
  it: /^italian/i, pt: /^(portuguese|brazilian)/i, ru: /^russian/i, tr: /^turkish/i, th: /^thai/i, id: /^indonesian/i, ta: /^tamil/i, te: /^telugu/i, ar: /^arabic/i,
  tl: /^(tagalog|filipino)/i, ml: /^malayalam/i, bn: /^bengali/i, pl: /^polish/i, nl: /^dutch/i, sv: /^swedish/i, vi: /^vietnamese/i,
};

const ANIME_STATUS = { RELEASING: 'ONGOING', FINISHED: 'COMPLETED', CANCELLED: 'CANCELLED', HIATUS: 'HIATUS', NOT_YET_RELEASED: 'UNKNOWN' };

function clean(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseId(id) {
  const m = /^([mta])(\d+)$/.exec(String(id || ''));
  if (!m) throw new Error('AniCine: unknown title id ' + id);
  return { kind: m[1] === 'm' ? 'movie' : m[1] === 't' ? 'tv' : 'anime', num: m[2] };
}

function idOf(kind, num) {
  return (kind === 'movie' ? 'm' : kind === 'tv' ? 't' : 'a') + num;
}

function img(path, size) {
  return path ? `${IMG}/${size}${path}` : undefined;
}

function dateMs(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : undefined;
}

function today() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function certAge(cert) {
  const c = String(cert || '').trim().toUpperCase();
  if (!c) return undefined;
  if (c === 'NC-17' || c === 'X' || c === 'XXX') return 18;
  if (c === 'R' || c === 'TV-MA') return 16;
  return 0;
}

function animeAge(genres) {
  const g = (Array.isArray(genres) ? genres : []).map((x) => String(x).toLowerCase());
  if (g.indexOf('hentai') >= 0) return 18;
  if (g.indexOf('ecchi') >= 0) return 16;
  return 0;
}

function otherAge(certs) {
  let best;
  certs.forEach((raw) => {
    const c = String(raw || '').trim().toUpperCase();
    if (!c) return;
    let age = 0;
    if (c === 'NC-17' || c === 'X' || c === 'XXX') age = 18;
    else if (/^(TV-MA|R)$/.test(c)) age = 16;
    else {
      const m = /(\d{2})/.exec(c);
      if (m && Number(m[1]) >= 16 && Number(m[1]) <= 21) age = 16;
    }
    if (best === undefined || age > best) best = age;
  });
  return best;
}

function movieCert(details) {
  const results = (details && details.release_dates && details.release_dates.results) || [];
  const us = results.find((r) => r.iso_3166_1 === 'US');
  if (!us) return undefined;
  const certs = (us.release_dates || []).map((d) => String(d.certification || '').trim()).filter(Boolean);
  let best;
  certs.forEach((c) => {
    const age = certAge(c);
    if (age !== undefined && (best === undefined || age > best.age)) best = { age, c };
  });
  return best ? best.c : undefined;
}

function allCerts(kind, details) {
  const out = [];
  if (kind === 'movie') {
    ((details && details.release_dates && details.release_dates.results) || []).forEach((r) => (r.release_dates || []).forEach((d) => out.push(d.certification)));
  } else {
    ((details && details.content_ratings && details.content_ratings.results) || []).forEach((r) => out.push(r.rating));
  }
  return out;
}

function ageOf(kind, details) {
  if (details.adult === true || details.softcore === true) return 18;
  let age = certAge(kind === 'movie' ? movieCert(details) : tvCert(details));
  if (age === undefined) age = otherAge(allCerts(kind, details));
  return age === undefined ? 0 : age;
}

function tvCert(details) {
  const results = (details && details.content_ratings && details.content_ratings.results) || [];
  const us = results.find((r) => r.iso_3166_1 === 'US');
  return us ? String(us.rating || '').trim() || undefined : undefined;
}

function b64UrlToB64(text) {
  let s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}

function decryptEnc(enc) {
  const key = CryptoJS.enc.Utf8.parse(ENC_KEY + '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0');
  const iv = CryptoJS.enc.Utf8.parse(ENC_IV);
  const ciphertext = CryptoJS.enc.Base64.parse(b64UrlToB64(enc));
  const plain = CryptoJS.AES.decrypt({ ciphertext }, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
  return JSON.parse(plain.toString(CryptoJS.enc.Utf8));
}

function plainError(message) {
  return new Error(message);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pending = new Map();
    this.ages = new Map();
    this.genreMaps = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async raw(url, headers) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: Object.assign({ 'User-Agent': UA }, headers || {}) }));
    return response;
  }

  async site(path, label) {
    let last = null;
    const start = Math.max(0, SITES.indexOf(SITE));
    for (let i = 0; i < SITES.length; i++) {
      const base = SITES[(start + i) % SITES.length];
      try {
        const response = await this.raw(base + path, { Accept: 'application/json,text/html,*/*' });
        if (response.status === 403 || response.status === 429 || response.status === 451 || response.status >= 500) {
          last = { status: response.status, data: response.data };
          if (response.status === 502 && SITES.length === 1) return response;
          continue;
        }
        SITE = base;
        return response;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = { error: e };
      }
    }
    if (last && last.status) return { status: last.status, data: last.data || '' };
    throw plainError(`AniCine: ${label || path} did not answer (${(last && last.error && last.error.message) || 'network error'})`);
  }

  async tmdb(path, query) {
    const q = Object.keys(query || {})
      .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== '')
      .map((k) => `&${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`)
      .join('');
    const response = await this.site(`/api/tmdb?path=${encodeURIComponent(path)}${q}`, 'TMDB proxy');
    if (response.status === 400 || response.status === 404 || response.status === 422) return null;
    if (response.status < 200 || response.status >= 300) throw plainError(`AniCine: TMDB proxy HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw plainError('AniCine: the TMDB proxy answer was not JSON');
    }
  }

  async anilist(action, query) {
    const q = Object.keys(query || {})
      .filter((k) => query[k] !== undefined && query[k] !== null && query[k] !== '')
      .map((k) => `&${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`)
      .join('');
    const response = await this.site(`/api/anilist?action=${encodeURIComponent(action)}${q}`, 'AniList proxy');
    if (response.status === 502 || response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw plainError(`AniCine: AniList proxy HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw plainError('AniCine: the AniList proxy answer was not JSON');
    }
  }

  async genres() {
    if (this.genreMaps) return this.genreMaps;
    const [m, t] = await Promise.all([this.tmdb('/genre/movie/list'), this.tmdb('/genre/tv/list')]);
    const movie = {};
    const tv = {};
    ((m && m.genres) || []).forEach((g) => {
      movie[g.name] = g.id;
    });
    ((t && t.genres) || []).forEach((g) => {
      tv[g.name] = g.id;
    });
    if (!Object.keys(movie).length && !Object.keys(tv).length) throw plainError('AniCine: the genre list did not load');
    this.genreMaps = { movie, tv };
    return this.genreMaps;
  }

  async getSearchTags() {
    const maps = await this.genres();
    const names = Array.from(new Set(Object.keys(maps.movie).concat(Object.keys(maps.tv)))).sort();
    return names.map((n) => ({ id: n, label: n }));
  }

  async rate(items, kind) {
    const todo = items.filter((it) => !this.ages.has(idOf(kind, it.id)));
    for (let i = 0; i < todo.length; i += 10) {
      await Promise.all(
        todo.slice(i, i + 10).map(async (it) => {
          try {
            const d =
              kind === 'movie'
                ? await this.tmdb(`/movie/${it.id}`, { append_to_response: 'release_dates' })
                : await this.tmdb(`/tv/${it.id}`, { append_to_response: 'content_ratings' });
            if (!d) return;
            this.ages.set(idOf(kind, it.id), ageOf(kind, d));
          } catch (e) {
            if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
          }
        }),
      );
    }
  }

  tmdbCard(it, kind) {
    const id = idOf(kind, it.id);
    const title = clean(it.title || it.name) || 'Untitled';
    const card = { mangaId: id, title, image: img(it.poster_path, 'w342') || img(it.backdrop_path, 'w500') || `${SITE}/icons/icon-512.png`, medium: 'anime' };
    const date = String(it.release_date || it.first_air_date || '');
    if (/^\d{4}/.test(date)) card.releaseDate = dateMs(date);
    if (typeof it.vote_average === 'number' && it.vote_average > 0) card.rating = Math.round(it.vote_average * 10) / 10;
    if (clean(it.overview)) card.summary = clean(it.overview);
    card.tags = [kind === 'movie' ? 'Movie' : 'Series'];
    let age = this.ages.get(id);
    if (it.adult === true || it.softcore === true) age = 18;
    if (age !== undefined) card.ageRating = age;
    return card;
  }

  animeCard(it) {
    const t = it.title || {};
    const card = {
      mangaId: idOf('anime', it.id),
      title: clean(t.english || t.romaji || t.native) || 'Untitled',
      image: (it.coverImage && (it.coverImage.large || it.coverImage.extraLarge || it.coverImage.medium)) || '',
      medium: 'anime',
      ageRating: animeAge(it.genres),
      tags: ['Anime'].concat((it.genres || []).map(String)),
    };
    if (clean(it.description)) card.summary = clean(it.description);
    if (typeof it.averageScore === 'number' && it.averageScore > 0) card.rating = Math.round(it.averageScore) / 10;
    if (it.seasonYear) card.releaseDate = Date.UTC(it.seasonYear, 0, 1);
    return card;
  }

  async getSearchResults(request, metadata) {
    const req = request || {};
    const page = metadata && metadata.page ? Math.max(1, Number(metadata.page) || 1) : 1;
    const title = String(req.title || '').trim();
    const tags = (req.includedTags || []).map((t) => String((t && (t.id || t.label)) || '')).filter(Boolean);

    if (title) {
      const [multi, anime] = await Promise.all([
        this.tmdb('/search/multi', { query: title, page }),
        this.anilist('search', { q: title, page, limit: 12 }),
      ]);
      const items = ((multi && multi.results) || []).filter((r) => r && (r.media_type === 'movie' || r.media_type === 'tv') && (r.poster_path || r.backdrop_path));
      await Promise.all([this.rate(items.filter((r) => r.media_type === 'movie'), 'movie'), this.rate(items.filter((r) => r.media_type === 'tv'), 'tv')]);
      const results = items.map((r) => this.tmdbCard(r, r.media_type));
      ((anime && anime.results) || []).forEach((r) => {
        if (r && r.id) results.push(this.animeCard(r));
      });
      const more = (multi && multi.page < Math.min(multi.total_pages || 0, 500)) || (anime && anime.has_next);
      return { results, metadata: more ? { page: page + 1 } : undefined };
    }

    if (tags.length) {
      const maps = await this.genres();
      const movieIds = tags.map((t) => maps.movie[t]).filter(Boolean).join(',');
      const tvIds = tags.map((t) => maps.tv[t]).filter(Boolean).join(',');
      const [m, t] = await Promise.all([
        movieIds ? this.tmdb('/discover/movie', { with_genres: movieIds, sort_by: 'popularity.desc', page }) : null,
        tvIds ? this.tmdb('/discover/tv', { with_genres: tvIds, sort_by: 'popularity.desc', page }) : null,
      ]);
      const mi = ((m && m.results) || []).filter((r) => r.poster_path || r.backdrop_path);
      const ti = ((t && t.results) || []).filter((r) => r.poster_path || r.backdrop_path);
      await Promise.all([this.rate(mi, 'movie'), this.rate(ti, 'tv')]);
      const results = [];
      for (let i = 0; i < Math.max(mi.length, ti.length); i++) {
        if (mi[i]) results.push(this.tmdbCard(mi[i], 'movie'));
        if (ti[i]) results.push(this.tmdbCard(ti[i], 'tv'));
      }
      const more = (m && m.page < Math.min(m.total_pages || 0, 500)) || (t && t.page < Math.min(t.total_pages || 0, 500));
      return { results, metadata: more ? { page: page + 1 } : undefined };
    }

    const feed = FEEDS.find((f) => f.id === req.feed) || FEEDS[0];
    if (feed.kind === 'anime') {
      const data = await this.anilist('catalog', { mode: feed.mode, page, limit: 20 });
      const results = ((data && data.results) || []).filter((r) => r && r.id).map((r) => this.animeCard(r));
      return { results, metadata: data && data.has_next && results.length ? { page: page + 1 } : undefined };
    }
    const data = await this.tmdb(feed.path, { page });
    const items = ((data && data.results) || []).filter((r) => r.poster_path || r.backdrop_path);
    await this.rate(items, feed.kind);
    const results = items.map((r) => this.tmdbCard(r, feed.kind));
    return { results, metadata: data && data.page < Math.min(data.total_pages || 0, 500) && results.length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { kind, num } = parseId(mangaId);
    if (kind === 'anime') {
      const d = await this.anilist('details', { id: num });
      if (!d || !d.id) throw plainError('AniCine: this anime was not found');
      const card = this.animeCard(d);
      const out = Object.assign({}, card, { desc: clean(d.description), status: ANIME_STATUS[d.status] || 'UNKNOWN' });
      if (d.bannerImage) out.banner = d.bannerImage;
      if (d.coverImage && d.coverImage.extraLarge) out.image = d.coverImage.extraLarge;
      const studio = ((d.studios && d.studios.nodes) || []).find((s) => s.isAnimationStudio);
      out.author = studio ? String(studio.name) : '';
      const cast = ((d.characters && d.characters.edges) || [])
        .filter((e) => e && e.node && e.node.name && e.node.name.full)
        .slice(0, 20)
        .map((e) => {
          const c = { name: String(e.node.name.full) };
          if (e.node.image && e.node.image.large) c.image = String(e.node.image.large);
          if (e.role) c.role = String(e.role);
          return c;
        });
      if (cast.length) out.cast = cast;
      return { mangaInfo: out };
    }
    const d =
      kind === 'movie'
        ? await this.tmdb(`/movie/${num}`, { append_to_response: 'release_dates,credits' })
        : await this.tmdb(`/tv/${num}`, { append_to_response: 'content_ratings,credits' });
    if (!d || !d.id) throw plainError('AniCine: this title was not found');
    const id = idOf(kind, num);
    const age = ageOf(kind, d);
    this.ages.set(id, age);
    const card = this.tmdbCard(d, kind);
    const tvStatus = { 'Returning Series': 'ONGOING', Ended: 'COMPLETED', Canceled: 'CANCELLED', 'In Production': 'ONGOING', Planned: 'UNKNOWN' };
    const out = Object.assign({}, card, {
      desc: clean(d.overview),
      status: kind === 'movie' ? (d.status === 'Released' ? 'COMPLETED' : 'UNKNOWN') : tvStatus[d.status] || 'UNKNOWN',
      tags: [kind === 'movie' ? 'Movie' : 'Series'].concat((d.genres || []).map((g) => String(g.name))),
      author: kind === 'tv' ? ((d.networks || [])[0] || {}).name || '' : ((d.production_companies || [])[0] || {}).name || '',
    });
    if (!out.author) out.author = '';
    out.author = String(out.author);
    if (d.backdrop_path) out.banner = img(d.backdrop_path, 'w1280');
    if (d.poster_path) out.image = img(d.poster_path, 'w500');
    if (!out.image) out.image = `${SITE}/icons/icon-512.png`;
    const cast = ((d.credits && d.credits.cast) || [])
      .slice(0, 20)
      .filter((c) => c && c.name)
      .map((c) => {
        const x = { name: String(c.name) };
        if (c.profile_path) x.image = img(c.profile_path, 'w185');
        if (c.character) x.role = String(c.character);
        return x;
      });
    if (cast.length) out.cast = cast;
    out.ageRating = age;
    return { mangaInfo: out };
  }

  async getChapters(mangaId) {
    const { kind, num } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    if (kind === 'anime') {
      const d = await this.anilist('details', { id: num });
      if (!d || !d.id) throw plainError('AniCine: this anime was not found');
      let count = Number(d.episodes) || Number(d.airedEpisodes) || 0;
      if (!count && d.nextAiringEpisode && Number(d.nextAiringEpisode.episode) > 1) count = Number(d.nextAiringEpisode.episode) - 1;
      if (!count && d.format === 'MOVIE') count = 1;
      if (!count) throw plainError('AniCine has no aired episodes for this anime yet');
      const rows = [];
      const minutes = Number(d.duration) || 0;
      for (let n = count; n >= 1; n--) {
        const row = { id: `e${n}`, chapterId: `e${n}`, name: count === 1 && d.format === 'MOVIE' ? 'Full movie' : `Episode ${n}`, number: n };
        if (minutes > 0) row.duration = minutes * 60;
        rows.push(row);
      }
      return rows;
    }
    const show = await this.tmdb(`/tv/${num}`);
    if (!show || !show.id) throw plainError('AniCine: this series was not found');
    const seasons = (show.seasons || []).map((s) => Number(s.season_number)).filter((n) => Number.isFinite(n) && n >= 1);
    if (!seasons.length) throw plainError('AniCine has no episodes for this series yet');
    const loaded = {};
    for (let i = 0; i < seasons.length; i += 3) {
      const batch = seasons.slice(i, i + 3);
      const answers = await Promise.all(batch.map((n) => this.season(num, n)));
      batch.forEach((n, at) => {
        loaded[n] = answers[at];
      });
    }
    const now = today();
    const rows = [];
    seasons.forEach((season) => {
      ((loaded[season] && loaded[season].episodes) || []).forEach((ep) => {
        const air = String(ep.air_date || '');
        if (air && air > now) return;
        const number = Number(ep.episode_number);
        if (!Number.isFinite(number)) return;
        const name = clean(ep.name);
        const row = { id: `s${season}e${number}`, name: name ? `Episode ${number}: ${name}` : `Episode ${number}`, number, season };
        if (name) row.title = name;
        if (ep.still_path) row.thumbnail = img(ep.still_path, 'w300');
        if (clean(ep.overview)) row.summary = clean(ep.overview);
        if (Number(ep.runtime) > 0) row.duration = Number(ep.runtime) * 60;
        const t = dateMs(air);
        if (t !== undefined) row.time = t;
        rows.push(row);
      });
    });
    if (!rows.length) throw plainError('AniCine has no aired episodes for this series yet');
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: r.name, number: r.number };
      ['time', 'title', 'thumbnail', 'summary', 'duration'].forEach((k) => {
        if (r[k] !== undefined) out[k] = r[k];
      });
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async season(num, n) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await this.tmdb(`/tv/${num}/season/${n}`, attempt ? { r: Date.now().toString(36) + attempt } : {});
        if (data && Array.isArray(data.episodes)) return data;
        last = new Error('empty answer');
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw plainError(`AniCine: season ${n} did not load (${last && last.message}), try again`);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: String(chapterId), mangaId: String(mangaId), pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    const { kind, num } = parseId(mangaId);
    if (kind === 'anime') return this.animeVideos(num, chapterId);
    let query = `type=${kind}&id=${num}`;
    let referer = `${BOLTS[0]}/embed/movie/${num}`;
    if (kind === 'tv') {
      const m = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!m) throw plainError('AniCine: unknown episode id ' + chapterId);
      query += `&season=${m[1]}&episode=${m[2]}`;
      referer = `${BOLTS[0]}/embed/tv/${num}/${m[1]}/${m[2]}`;
    }
    const answers = await Promise.all(
      ['orion', 'callisto'].map((p) =>
        this.bolt(query + `&prefer=${p}`, referer).then(
          (stream) => ({ stream }),
          (error) => ({ error }),
        ),
      ),
    );
    const found = {};
    let failure = null;
    answers.forEach((a) => {
      if (a.stream && a.stream.server && !found[a.stream.server]) found[a.stream.server] = a.stream;
      if (a.error) failure = a.error;
    });
    const names = ['orion', 'callisto'].filter((n) => found[n]);
    const lists = await Promise.all(names.map((n) => this.boltEntries(n, found[n], { kind, num })));
    const out = [].concat(...lists);
    if (!out.length) {
      if (failure && failure.kind === 'challenge') throw failure;
      if (failure && !/no stream/i.test(failure.message || '')) throw failure;
      if (names.length) throw plainError('VidBolt has no stream in English or in the title\'s own language for this episode (only hardsubbed copies in other languages, or masters that do not answer)');
      throw plainError('VidBolt has no stream for this title yet');
    }
    return out;
  }

  async bolt(query, referer) {
    let last = null;
    for (let i = 0; i < BOLTS.length; i++) {
      const base = BOLTS[i];
      const ref = referer.replace(BOLTS[0], base);
      try {
        const response = await this.raw(`${base}/api/resolve?${query}`, { Accept: 'application/json', Referer: ref });
        if (response.status === 429) throw plainError('VidBolt asked to slow down (HTTP 429), try again in a few seconds');
        if (response.status === 403 || response.status >= 500) {
          last = plainError(`VidBolt: HTTP ${response.status}`);
          continue;
        }
        if (response.status !== 200) throw plainError(`VidBolt: HTTP ${response.status}`);
        let json = null;
        try {
          json = JSON.parse(response.data);
        } catch (e) {
          last = plainError('VidBolt: the answer was not JSON');
          continue;
        }
        const stream = json && json.stream;
        return stream && Array.isArray(stream.sources) && stream.sources.length ? stream : null;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last || plainError('VidBolt did not answer');
  }

  async alive(url, headers) {
    try {
      const response = await withTimeout(this.raw(url, Object.assign({ Accept: '*/*' }, headers || {})), 7000, 'master did not answer');
      return response.status === 200 && /^\s*#EXTM3U/.test(String(response.data));
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return false;
    }
  }

  async boltEntries(serverName, stream, ctx) {
    const subs = boltSubtitles(stream.subtitles);
    const usable = stream.sources.filter((x) => x && /^https:\/\//.test(String(x.url || '')) && x.kind === 'hls');
    if (!usable.length) return [];
    const name = `VidBolt ${serverName.charAt(0).toUpperCase()}${serverName.slice(1)}`;
    if (serverName === 'orion') {
      const src = usable[0];
      const info = describeMaster(src.master);
      const parts = [`${clean(src.quality) || '1080p'} Auto`];
      if (info.audio.length) parts.push(`Audio: ${info.audio.slice(0, 3).join(', ')}${info.audio.length > 3 ? ` and ${info.audio.length - 3} more` : ''}`);
      parts.push(info.subs.length ? `Softsub: ${info.subs.slice(0, 3).join(', ')}${info.subs.length > 3 ? ` and ${info.subs.length - 3} more` : ''}` : 'Sub');
      return [{ url: String(src.url), quality: parts.join(', '), type: 'hls', server: name, headers: { Referer: `${BOLTS[0]}/` } }];
    }
    const byHeight = (a, b) => height(b.quality) - height(a.quality);
    const dubs = usable.filter((x) => /^english$/i.test(clean(x.language))).sort(byHeight);
    const hards = usable.filter((x) => /^english sub$/i.test(clean(x.language))).sort(byHeight);
    const pick = async (list) => {
      for (let i = 0; i < Math.min(list.length, 3); i++) {
        if (await this.alive(list[i].url)) return list[i];
      }
      return null;
    };
    const [dub, hard] = await Promise.all([pick(dubs), pick(hards)]);
    const out = [];
    [[dub, 'English audio'], [hard, 'English hardsub, original audio']].forEach(([x, label]) => {
      if (!x) return;
      const entry = {
        url: String(x.url),
        quality: `${clean(x.quality) || '720p'}, ${label}, HEVC${label === 'English audio' ? ', ' + (subs.length ? subtitlesNote(subs) : 'Sub') : ''}`,
        type: 'hls',
        server: name,
      };
      if (subs.length && label === 'English audio') entry.subtitles = subs;
      out.push(entry);
    });
    if (!out.length && ctx) {
      const wanted = await this.originalLanguage(ctx);
      const originals = wanted ? usable.filter((x) => !/\bsub$/i.test(clean(x.language)) && wanted.test(clean(x.language))).sort(byHeight) : [];
      const orig = await pick(originals);
      if (orig) {
        const entry = {
          url: String(orig.url),
          quality: `${clean(orig.quality) || '720p'}, ${clean(orig.language)} audio, HEVC, ${subs.length ? subtitlesNote(subs) : 'Sub'}`,
          type: 'hls',
          server: name,
        };
        if (subs.length) entry.subtitles = subs;
        out.push(entry);
      }
    }
    return out;
  }

  async originalLanguage(ctx) {
    try {
      const d = await this.tmdb(`/${ctx.kind}/${ctx.num}`);
      return (d && ORIGINAL_LANGUAGE[String(d.original_language || '').toLowerCase()]) || null;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return null;
    }
  }

  async animeVideos(mal, chapterId) {
    const m = /^e(\d+)$/.exec(String(chapterId || ''));
    if (!m) throw plainError('AniCine: unknown episode id ' + chapterId);
    const answers = await Promise.all(
      ['sub', 'dub'].map((lang) =>
        this.megaplay(mal, m[1], lang).then(
          (video) => ({ video }),
          (error) => ({ error }),
        ),
      ),
    );
    const out = answers.filter((a) => a.video).map((a) => a.video);
    if (out.length) return out;
    const challenge = answers.find((a) => a.error && a.error.kind === 'challenge');
    if (challenge) throw challenge.error;
    const real = answers.find((a) => a.error && !/has no/i.test(a.error.message || ''));
    if (real) throw real.error;
    throw plainError('MegaPlay has no stream for this episode yet');
  }

  async megaplay(mal, episode, lang) {
    const page = `${MEGAPLAY}/stream/mal/${mal}/${episode}/${lang}`;
    const response = await this.raw(page, { Accept: 'text/html,*/*', Referer: `${SITE}/` });
    if (response.status === 404) throw plainError(`MegaPlay has no ${lang} for this episode`);
    if (response.status !== 200) throw plainError(`MegaPlay: HTTP ${response.status}`);
    const html = String(response.data);
    const idm = /id="megaplay-player"[^>]*data-id="(\d+)"/.exec(html) || /data-id="(\d+)"/.exec(html);
    if (!idm) throw plainError(`MegaPlay has no ${lang} for this episode`);
    const gs = await this.raw(`${MEGAPLAY}/stream/getSources?id=${idm[1]}`, { Accept: 'application/json', Referer: page, 'X-Requested-With': 'XMLHttpRequest' });
    if (gs.status !== 200) throw plainError(`MegaPlay: sources HTTP ${gs.status}`);
    let data = null;
    try {
      data = JSON.parse(gs.data);
    } catch (e) {
      throw plainError('MegaPlay: the sources answer was not JSON');
    }
    let file = '';
    try {
      const o = data.enc ? decryptEnc(data.enc) : data.sources;
      file = typeof o === 'string' ? o : (o && o.file) || '';
    } catch (e) {
      throw plainError('MegaPlay: the sources could not be read');
    }
    if (!/^https?:\/\//.test(file)) throw plainError(`MegaPlay has no ${lang} for this episode`);
    const tracks = (Array.isArray(data.tracks) ? data.tracks : []).filter((t) => t && t.file && t.kind !== 'thumbnails' && /^https?:\/\//.test(String(t.file)));
    const seen = new Set();
    let subtitles = tracks
      .map((t) => ({ url: String(t.file), label: clean(t.label) || 'Subtitles', language: languageCode(clean(t.label)) }))
      .filter((t) => {
        if (seen.has(t.url)) return false;
        seen.add(t.url);
        return true;
      });
    subtitles = subtitles.filter((t) => t.language === 'en').concat(subtitles.filter((t) => t.language !== 'en')).slice(0, 20);
    const video = {
      url: file,
      quality: lang === 'dub' ? 'Auto Dub' : subtitles.length ? 'Auto Sub, Softsub: ' + subtitles.slice(0, 3).map((s) => s.label).join(', ') : 'Auto Sub',
      type: 'hls',
      server: 'MegaPlay',
      headers: { Referer: `${MEGAPLAY}/`, Origin: MEGAPLAY },
    };
    if (subtitles.length) video.subtitles = subtitles;
    const range = (r) => {
      const s = Number(r && r.start);
      const e = Number(r && r.end);
      return Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e > s ? { start: Math.round(s * 1000), end: Math.round(e * 1000) } : undefined;
    };
    const intro = range(data.intro);
    const outro = range(data.outro);
    if (intro) video.intro = intro;
    if (outro) video.outro = outro;
    return video;
  }
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(message));
    }, ms);
    promise.then(
      (v) => {
        if (done) return;
        done = true;
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        reject(e);
      },
    );
  });
}

function languageCode(label) {
  const first = String(label || '').toLowerCase().split(/[^a-z\u00c0-\u024f]+/).filter(Boolean)[0] || '';
  return LANGUAGE_CODES[first] || 'und';
}

function height(q) {
  const m = /(\d{3,4})p/i.exec(String(q || ''));
  return m ? Number(m[1]) : 0;
}

function subtitlesNote(list) {
  const names = list.map((s) => s.label);
  return `Softsub: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

function describeMaster(master) {
  const audio = [];
  const subs = [];
  String(master || '')
    .split('\n')
    .forEach((line) => {
      if (line.indexOf('#EXT-X-MEDIA:') !== 0) return;
      const name = (/NAME="([^"]*)"/.exec(line) || [])[1];
      if (!name) return;
      const label = name.replace(/^\d+\.\s*/, '').replace(/\s*\[CC\]\s*$/i, '');
      if (/TYPE=AUDIO/.test(line)) {
        if (audio.indexOf(label) < 0) audio.push(label);
      } else if (/TYPE=SUBTITLES/.test(line)) {
        if (subs.indexOf(label) < 0) subs.push(label);
      }
    });
  const eng = audio.indexOf('English');
  if (eng > 0) {
    audio.splice(eng, 1);
    audio.unshift('English');
  }
  return { audio, subs };
}

const LANGUAGE_CODES = {
  english: 'en', arabic: 'ar', spanish: 'es', french: 'fr', indonesian: 'id', malay: 'ms', portuguese: 'pt', russian: 'ru', hindi: 'hi', korean: 'ko', japanese: 'ja',
  chinese: 'zh', mandarin: 'zh', cantonese: 'zh', polish: 'pl', dutch: 'nl', swedish: 'sv', romanian: 'ro', greek: 'el', czech: 'cs', hungarian: 'hu', ukrainian: 'uk', persian: 'fa', thai: 'th', vietnamese: 'vi', turkish: 'tr', german: 'de', italian: 'it', hebrew: 'he', urdu: 'ur', bengali: 'bn', filipino: 'fil', tagalog: 'tl',
};

function boltSubtitles(list) {
  const out = [];
  const used = new Set();
  (Array.isArray(list) ? list : []).forEach((s) => {
    if (!s || !/^https?:\/\//.test(String(s.url || ''))) return;
    const raw = clean(s.label) || clean(s.lang) || 'Subtitles';
    const lang = clean(s.lang).toLowerCase();
    const bare = /^[a-z]{2,3}(-[a-z]+)?$/i.test(raw);
    const code = LANGUAGE_CODES[raw.toLowerCase()] || (bare ? raw.toLowerCase() : /^[a-z]{2,3}(-[a-z]+)?$/.test(lang) ? lang : 'und');
    const key = raw.toLowerCase();
    if (used.has(key)) return;
    used.add(key);
    const url = String(s.url);
    out.push({ url, label: raw, language: code, format: /\.srt(\?|$)/i.test(url) ? 'srt' : 'vtt' });
  });
  const english = out.filter((x) => x.language === 'en');
  const rest = out.filter((x) => x.language !== 'en');
  return english.concat(rest).slice(0, 6);
}

module.exports = { Source };
