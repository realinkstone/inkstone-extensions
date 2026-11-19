const SITE = 'https://spacedom.live';
const API = 'https://api.spacedom.fun/api';
const IMG = 'https://image.tmdb.org/t/p/';

const SERVERS = [
  { id: 'robin', name: 'Robin', language: 'English' },
  { id: 'condor', name: 'Condor' },
  { id: 'kite', name: 'Kite' },
  { id: 'finch', name: 'Finch' },
  { id: 'swift', name: 'Swift' },
  { id: 'shrike', name: 'Shrike' },
];
const GRACE_MS = 5000;

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', path: '/movies/popular' },
  { id: 'movies-trending', name: 'Movies: Trending', kind: 'movie', path: '/movies/trending' },
  { id: 'movies-rated', name: 'Movies: Top rated', kind: 'movie', path: '/movies/top_rated' },
  { id: 'movies-now', name: 'Movies: Now playing', kind: 'movie', path: '/movies/now_playing' },
  { id: 'tv-popular', name: 'TV: Popular', kind: 'tv', path: '/tv/popular' },
  { id: 'tv-trending', name: 'TV: Trending', kind: 'tv', path: '/tv/trending' },
  { id: 'tv-rated', name: 'TV: Top rated', kind: 'tv', path: '/tv/top_rated' },
  { id: 'tv-air', name: 'TV: On the air', kind: 'tv', path: '/tv/on_the_air' },
  { id: 'tv-today', name: 'TV: Airing today', kind: 'tv', path: '/tv/airing_today' },
];

const GENRES = [
  { id: 'action', label: 'Action', movie: 28, tv: 10759 },
  { id: 'adventure', label: 'Adventure', movie: 12, tv: 10759 },
  { id: 'animation', label: 'Animation', movie: 16, tv: 16 },
  { id: 'comedy', label: 'Comedy', movie: 35, tv: 35 },
  { id: 'crime', label: 'Crime', movie: 80, tv: 80 },
  { id: 'documentary', label: 'Documentary', movie: 99, tv: 99 },
  { id: 'drama', label: 'Drama', movie: 18, tv: 18 },
  { id: 'family', label: 'Family', movie: 10751, tv: 10751 },
  { id: 'fantasy', label: 'Fantasy', movie: 14, tv: 10765 },
  { id: 'history', label: 'History', movie: 36 },
  { id: 'horror', label: 'Horror', movie: 27 },
  { id: 'kids', label: 'Kids', tv: 10762 },
  { id: 'music', label: 'Music', movie: 10402 },
  { id: 'mystery', label: 'Mystery', movie: 9648, tv: 9648 },
  { id: 'reality', label: 'Reality', tv: 10764 },
  { id: 'romance', label: 'Romance', movie: 10749 },
  { id: 'scifi', label: 'Sci-Fi', movie: 878, tv: 10765 },
  { id: 'thriller', label: 'Thriller', movie: 53 },
  { id: 'war', label: 'War', movie: 10752, tv: 10768 },
  { id: 'western', label: 'Western', movie: 37, tv: 37 },
];

const EXPLICIT = /\b(porn\w*|hentai|erotic\w*|softcore|orgy|orgies|nympho\w*|fetish\w*|bdsm|incest\w*|nudity|sex(?:ual)? (?:scenes?|tape|slave|videos?)|sexually explicit|adult film)\b/i;
const EXPLICIT_TITLE = /\b(emmanuelle|playboy|penthouse|milf|hotwife|cuckold|gangbang|threesome)\b/i;
const SUGGESTIVE = /\b(sex|sexual\w*|sexy|seduc\w*|stripper\w*|strip club|prostitut\w*|lust\w*|mistress\w*|affair|rape\w*|kinky)\b/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function ageOf(item) {
  if (!item) return 0;
  if (item.adult === true || item.softcore === true) return 18;
  const text = `${item.title || item.name || ''} ${item.overview || ''}`;
  if (EXPLICIT.test(text) || EXPLICIT_TITLE.test(item.title || item.name || '')) return 18;
  if (SUGGESTIVE.test(text)) return 16;
  return 0;
}

function posterOf(path, size) {
  return path ? `${IMG}${size || 'w500'}${path}` : '';
}

function yearOf(date) {
  const m = /^(\d{4})/.exec(String(date || ''));
  return m ? m[1] : '';
}

function idOf(kind, tmdb) {
  return `${kind}:${tmdb}`;
}

function parseId(mangaId) {
  const m = /^(movie|tv):(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Spacedom: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: m[2] };
}

function card(item, forcedKind) {
  const kind = forcedKind || item.media_type;
  if ((kind !== 'movie' && kind !== 'tv') || !item || !item.id) return null;
  const title = cleanText(item.title || item.name || item.original_title || item.original_name);
  if (!title) return null;
  return {
    mangaId: idOf(kind, item.id),
    title,
    image: posterOf(item.poster_path, 'w500'),
    medium: 'anime',
    ageRating: ageOf(item),
  };
}

function languageOf(answer, fallback) {
  const list = Array.isArray(answer.languages) ? answer.languages.filter(Boolean) : [];
  const one = cleanText(answer.language) || list[0] || fallback || '';
  return { one, list };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.meta = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    let data;
    let kind = '';
    if (query) {
      data = await this.json(`${API}/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      kind = feed.kind;
      const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
      const tag = included.length ? GENRES.find((g) => g.id === String(included[0].id || included[0])) : null;
      let path = feed.path;
      if (tag) {
        const genre = tag[kind];
        if (!genre) return { results: [] };
        path = `/${kind === 'movie' ? 'movies' : 'tv'}/genre/${genre}`;
      }
      if (page > 500) return { results: [] };
      data = await this.json(`${API}${path}?page=${page}`);
    }
    const results = [];
    const seen = new Set();
    (data.results || []).forEach((item) => {
      const c = card(item, kind || undefined);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        results.push(c);
      }
    });
    const total = Math.min(Number(data.total_pages) || 1, 500);
    return page < total && (data.results || []).length ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.details(kind, tmdb);
    const title = cleanText(d.title || d.name);
    if (!title) throw new Error('Spacedom: title not found');
    const info = {
      title,
      image: posterOf(d.poster_path, 'w500'),
      desc: cleanText(d.overview),
      status: kind === 'movie' ? 'COMPLETED' : /ended|cancel/i.test(d.status || '') ? 'COMPLETED' : 'ONGOING',
      tags: (d.genres || []).map((g) => cleanText(g.name)).filter(Boolean),
      medium: 'anime',
      ageRating: ageOf(d),
    };
    info.completed = info.status === 'COMPLETED';
    if (d.backdrop_path) info.banner = posterOf(d.backdrop_path, 'w1280');
    const release = yearOf(d.release_date || d.first_air_date);
    if (release) info.releaseDate = release;
    let people = [];
    if (kind === 'movie') people = ((d.credits && d.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => c.name);
    else people = (d.created_by || []).map((c) => c.name);
    people = people.filter(Boolean).filter((n, i, a) => a.indexOf(n) === i);
    if (people.length) info.author = people.join(', ');
    const cast = ((d.credits && d.credits.cast) || []).slice(0, 20).map((c) => {
      const person = { name: cleanText(c.name) };
      if (c.profile_path) person.image = posterOf(c.profile_path, 'w185');
      if (c.character) person.role = cleanText(c.character);
      return person;
    }).filter((p) => p.name);
    if (cast.length) info.cast = cast;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const d = await this.details('tv', tmdb);
    const seasons = (d.seasons || []).filter((s) => s.season_number > 0).map((s) => s.season_number);
    if (!seasons.length) throw new Error('Spacedom has no episodes for this show yet');
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < seasons.length; i += 3) {
      const group = seasons.slice(i, i + 3);
      const loaded = await Promise.all(group.map((n) => this.json(`${API}/tv/${tmdb}/season/${n}`).then((s) => ({ n, s }))));
      loaded.forEach(({ n, s }) => {
        (s.episodes || []).forEach((e) => {
          const air = e.air_date ? Date.parse(e.air_date + 'T00:00:00Z') : NaN;
          if (Number.isFinite(air) && air > now + 86400000) return;
          const num = Number(e.episode_number);
          if (!Number.isFinite(num)) return;
          const row = { season: n, number: num, name: cleanText(e.name), time: Number.isFinite(air) ? air : undefined, still: e.still_path, runtime: e.runtime, summary: cleanText(e.overview) };
          rows.push(row);
        });
      });
    }
    if (!rows.length) throw new Error('Spacedom has no aired episodes for this show yet');
    rows.sort((x, y) => y.season - x.season || y.number - x.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const id = `s${r.season}e${r.number}`;
      const out = { id, chapterId: id, name: r.name ? `Episode ${r.number}: ${r.name}` : `Episode ${r.number}`, number: r.number };
      if (r.time !== undefined) out.time = r.time;
      if (r.name) out.title = r.name;
      if (r.still) out.thumbnail = posterOf(r.still, 'w300');
      if (r.runtime > 0) out.duration = r.runtime * 60;
      if (r.summary) out.summary = r.summary;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.details(kind, tmdb);
    let season = 0;
    let episode = 0;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+(?:\.\d+)?)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('Spacedom: unknown episode id ' + chapterId);
      season = Number(ep[1]);
      episode = Number(ep[2]);
    }
    const imdb = kind === 'movie' ? d.imdb_id : d.external_ids && d.external_ids.imdb_id;
    const query = [
      `title=${encodeURIComponent(cleanText(d.title || d.name))}`,
      `year=${encodeURIComponent(yearOf(d.release_date || d.first_air_date))}`,
      `imdbId=${encodeURIComponent(imdb || '')}`,
      `originalLanguage=${encodeURIComponent(d.original_language || 'en')}`,
    ];
    if (kind === 'tv') query.push(`season=${season}`, `episode=${episode}`);
    const tail = `/${kind}/${tmdb}?${query.join('&')}`;

    const videos = [];
    const problems = [];
    await new Promise((resolve) => {
      let pending = SERVERS.length;
      let timer = null;
      const finish = () => {
        pending -= 1;
        if (pending === 0) {
          if (timer) clearTimeout(timer);
          resolve();
        }
      };
      SERVERS.forEach((server) => {
        this.server(server, tail).then(
          (video) => {
            videos.push({ order: SERVERS.indexOf(server), video });
            if (!timer) timer = setTimeout(resolve, GRACE_MS);
            finish();
          },
          (error) => {
            problems.push(error);
            finish();
          }
        );
      });
    });
    if (!videos.length) {
      const challenged = problems.find((e) => e && e.kind === 'challenge');
      if (challenged) throw challenged;
      const messages = problems.map((e) => (e && e.message ? e.message : String(e))).filter((m, i, a) => a.indexOf(m) === i);
      throw new Error(`Spacedom has no stream for this title yet (${messages.slice(0, 3).join('; ') || 'no server answered'})`);
    }
    videos.sort((a, b) => Number(b.video.english) - Number(a.video.english) || a.order - b.order);
    return videos.map((v) => {
      const out = Object.assign({}, v.video);
      delete out.english;
      return out;
    });
  }

  async server(server, tail) {
    let answer = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      answer = await this.json(`${API}/direct/${server.id}${tail}`);
      if (!(answer && answer.status === 'unavailable' && answer.retryable)) break;
    }
    if (!answer) throw new Error(`${server.name}: no answer`);
    if (answer.status === 'unavailable') throw new Error(`${server.name}: ${answer.message || 'unavailable'}`);
    if (server.id === 'shrike') return this.shrike(server, answer);
    if (answer.status !== 'ready' || !answer.url) throw new Error(`${server.name}: ${answer.status || 'no stream'}`);
    const { one, list } = languageOf(answer, server.language);
    const subtitles = [];
    (answer.subtitles || []).forEach((s) => {
      if (!s || !s.path) return;
      subtitles.push({ url: /^https?:/i.test(s.path) ? s.path : API + s.path, label: cleanText(s.label) || 'Subtitles', language: cleanText(s.language) || 'en' });
    });
    const multi = /master\.m3u8/.test(answer.url);
    const parts = [server.name];
    parts.push(multi ? 'Auto' : answer.quality ? `${answer.quality}p` : 'Auto');
    if (one) parts.push(`${one} audio`);
    const others = list.filter((l) => l !== one);
    if (others.length) parts.push(others.length <= 2 ? `also ${others.join(', ')}` : `also ${others.slice(0, 2).join(', ')} and ${others.length - 2} more`);
    if (server.id === 'robin') parts.push('Softsub: English');
    const video = { url: answer.url, quality: parts.join(', '), type: 'hls', server: server.name };
    if (answer.playbackHeaders && Object.keys(answer.playbackHeaders).length) video.headers = answer.playbackHeaders;
    if (subtitles.length) video.subtitles = subtitles;
    const lower = (one || '').toLowerCase();
    video.english = !lower || lower === 'english' || lower === 'original';
    return video;
  }

  async shrike(server, answer) {
    const resolve = answer.clientResolve || {};
    if (answer.status !== 'client' || !/^https:\/\/kaembed\.net\/embed-[a-z0-9]+\.html/.test(resolve.embedUrl || '')) throw new Error(`${server.name}: no stream`);
    const html = await this.text(resolve.embedUrl);
    const master = (/https:\/\/[A-Za-z0-9.\-]+\/hls2\/[A-Za-z0-9_,\-\/.]+\.urlset\/master\.m3u8[^'"\s<]*/.exec(html) || /https:\/\/[A-Za-z0-9.\-]+\/[A-Za-z0-9_,\-\/.]+\/master\.m3u8[^'"\s<]*/.exec(html) || [])[0];
    if (!master) throw new Error(`${server.name}: the player page holds no stream`);
    const subtitles = [];
    if (/^https:\/\/qqqcdn\.cloud\//.test(resolve.subtitlesUrl || '')) {
      try {
        const files = await this.json(resolve.subtitlesUrl);
        (Array.isArray(files) ? files : []).forEach((f) => {
          if (f && /^https:\/\//.test(f.file || '')) subtitles.push({ url: f.file, label: cleanText(f.label) || 'English', language: /english/i.test(f.label || '') ? 'en' : cleanText(f.label).toLowerCase().slice(0, 2) });
        });
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      }
    }
    const names = subtitles.map((s) => s.label);
    const english = names.some((n) => /^english/i.test(n));
    const softsub = !names.length ? '' : names.length <= 2 ? `Softsub: ${names.join(', ')}` : english ? `Softsub: English and ${names.length - 1} more` : `Softsub: ${names.length} tracks`;
    const video = { url: master.replace(/&amp;/g, '&'), quality: `${server.name}, Auto` + (softsub ? `, ${softsub}` : ''), type: 'hls', server: server.name };
    if (subtitles.length) video.subtitles = subtitles;
    video.english = true;
    return video;
  }

  async details(kind, tmdb) {
    const key = `${kind}:${tmdb}`;
    if (this.meta.has(key)) return this.meta.get(key);
    const d = await this.json(`${API}/${kind === 'movie' ? 'movies' : 'tv'}/${tmdb}`);
    if (!d || (!d.title && !d.name)) throw new Error('Spacedom: title not found');
    this.meta.set(key, d);
    return d;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
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

  async json(url, extraHeaders) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ Accept: 'application/json' }, extraHeaders || {}) });
    const raw = String(response.data || '');
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      data = null;
    }
    if (response.status === 404) throw new Error('Spacedom: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) {
      const message = data && data.error && data.error.message ? data.error.message : '';
      throw new Error(`Spacedom: HTTP ${response.status}${message ? ' ' + message : ''}`);
    }
    if (data === null) throw new Error('Spacedom: the API answered something that is not JSON');
    return data;
  }

  async text(url, extraHeaders) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ Accept: 'text/html,*/*' }, extraHeaders || {}) });
    if (response.status < 200 || response.status >= 300) throw new Error(`Spacedom: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
