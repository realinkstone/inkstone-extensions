const API = 'https://api.kaizoku.site/api';
const SITE = 'https://itasha.live';
const PAGE = 20;
const CALL_LIMIT_MS = 25000;
const GRACE_MS = 4000;

const FEEDS = [
  { id: 'trending', name: 'Trending', path: '/catalog/trending', extra: 'window=day' },
  { id: 'airing', name: 'Airing Now', path: '/catalog/airing' },
  { id: 'popular', name: 'Popular', discover: 'sort=POPULARITY_DESC' },
  { id: 'season', name: 'Popular This Season', path: '/catalog/popular-this-season' },
  { id: 'finished', name: 'Completed Series', discover: 'sort=POPULARITY_DESC&status=FINISHED' },
  { id: 'movies', name: 'Movies', discover: 'sort=POPULARITY_DESC&format=MOVIE' },
];

const GENRES = [
  'Action', 'Adventure', 'Boys Love', 'Comedy', 'Drama', 'Ecchi', 'Erotica', 'Fantasy', 'Girls Love', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Suspense', 'Thriller',
];

const PROVIDERS = [
  { alias: 'manu', server: 'Megaplay', dub: true },
  { alias: 'uwu', server: null, dub: false },
  { alias: 'nami', server: 'MMani', dub: false },
  { alias: 'para', server: 'AnimeParadise', dub: false },
];

const STATUS = { RELEASING: 'ONGOING', FINISHED: 'COMPLETED', NOT_YET_RELEASED: 'UNKNOWN', CANCELLED: 'CANCELLED', HIATUS: 'HIATUS' };
const FORMAT = { TV: 'TV', TV_SHORT: 'Short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
const LANG = {
  english: 'en', japanese: 'ja', indonesian: 'id', thai: 'th', portuguese: 'pt', spanish: 'es', arabic: 'ar', french: 'fr', german: 'de', italian: 'it', russian: 'ru', chinese: 'zh',
  korean: 'ko', vietnamese: 'vi', turkish: 'tr', malay: 'ms', polish: 'pl', dutch: 'nl', hindi: 'hi',
};
const EXPLICIT_TAGS = ['group sex', 'public sex', 'anal sex', 'sex toys', 'ahegao', 'cunnilingus', 'fellatio', 'paizuri', 'masturbation', 'rimjob', 'gangbang'];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function titleOf(row) {
  const t = row.title || {};
  return clean(t.primary || t.english || t.romaji || t.native);
}

function ratingOf(row) {
  const genres = (row.genres || []).map((g) => String(g).toLowerCase());
  let age = 0;
  if (genres.indexOf('ecchi') >= 0) age = 16;
  if (row.isAdult === true || genres.indexOf('hentai') >= 0 || genres.indexOf('erotica') >= 0) age = 18;
  const tags = (row.tags || []).map((t) => String(t).toLowerCase());
  if (tags.some((t) => EXPLICIT_TAGS.indexOf(t) >= 0)) age = 18;
  return age;
}

function coverOf(url, large) {
  const u = String(url || '');
  if (!/^https?:\/\//.test(u)) return undefined;
  if (/s4\.anilist\.co\/.*\/cover\/(?:medium|large)\//.test(u)) return u.replace(/\/cover\/(?:medium|large)\//, large && /\.jpe?g$/i.test(u) ? '/cover/large/' : '/cover/medium/');
  return large ? u : u.replace(/(cdn\.myanimelist\.net\/images\/[^?]*\d)l(\.(?:jpg|webp|png))$/, '$1$2');
}

function languageCode(label) {
  const first = clean(label).toLowerCase().split(/[^a-z]+/)[0];
  return LANG[first] || undefined;
}

function streamHeaders(data, source) {
  const out = {};
  const put = (h) => {
    if (!h || typeof h !== 'object') return;
    Object.keys(h).forEach((k) => {
      const key = k.toLowerCase();
      if (key === 'user-agent' || key === 'cookie') return;
      if (typeof h[k] === 'string' && h[k]) out[k] = h[k];
    });
  };
  put(data && data.headers);
  try {
    const part = String((source && source.proxiedUrl) || '').split('/').pop().replace(/\.(m3u8|mp4)$/, '').split('.')[0];
    if (part) {
      const payload = JSON.parse(App.base64Decode(part.replace(/-/g, '+').replace(/_/g, '/')));
      put(payload && payload.headers);
    }
  } catch (e) {
  }
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.details = new Map();
    this.episodes = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async api(path, params) {
    const query = params ? `?${qs(params)}` : '';
    const response = await this.requests.schedule(App.createRequest({ url: `${API}${path}${query}`, method: 'GET', headers: { Accept: 'application/json' } }));
    let body = null;
    try {
      body = JSON.parse(response.data);
    } catch (e) {
      body = null;
    }
    if (response.status === 429) throw new Error('Itasha is rate limiting requests, try again in a minute');
    if (response.status < 200 || response.status >= 300 || !body || body.success === false) {
      const reason = body && body.error ? (typeof body.error === 'string' ? body.error : body.error.message || body.error.name) : '';
      throw new Error(`Itasha: HTTP ${response.status}${reason ? ` (${clean(reason).slice(0, 120)})` : ''}`);
    }
    return body.data;
  }

  card(row) {
    const format = FORMAT[row.format] || '';
    const card = {
      mangaId: String(row.id),
      title: titleOf(row),
      image: coverOf(row.posterUrl, false),
      medium: 'anime',
      webURL: `${SITE}/anime/${row.slug || row.id}`,
      tags: Array.isArray(row.genres) ? row.genres.map(String) : [],
      summary: [format, row.year ? String(row.year) : '', row.episodeCount ? `${row.episodeCount} ep` : ''].filter(Boolean).join(', ') || undefined,
      ageRating: ratingOf(row),
    };
    return card;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && Number(metadata.page)) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tagId = included.length ? String(included[0].id || included[0]) : '';
    const genre = GENRES.find((g) => g === tagId || g.toLowerCase() === tagId.toLowerCase());
    if (tagId && !genre) return { results: [], metadata: undefined };
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];

    let data;
    if (query) {
      data = await this.api('/catalog/search', { kind: 'anime', q: query, page: String(page) });
    } else if (genre) {
      data = await this.api('/catalog/discover', { kind: 'anime', page: String(page), sort: 'POPULARITY_DESC', genres: genre });
    } else if (feed.discover) {
      data = await this.api('/catalog/discover', Object.assign({ kind: 'anime', page: String(page) }, parseQuery(feed.discover)));
    } else {
      data = await this.api(feed.path, Object.assign({ kind: 'anime', page: String(page), perPage: String(PAGE) }, parseQuery(feed.extra || '')));
    }
    let rows = data && Array.isArray(data.results) ? data.results : [];
    if (query && genre) rows = rows.filter((r) => (r.genres || []).indexOf(genre) >= 0);
    const seen = new Set();
    const results = [];
    rows.forEach((row) => {
      const card = this.card(row);
      if (!row.id || !card.title || seen.has(card.mangaId)) return;
      seen.add(card.mangaId);
      results.push(card);
    });
    return { results, metadata: data && data.hasNextPage && rows.length ? { page: page + 1 } : undefined };
  }

  cached(map, key, load) {
    const hit = map.get(key);
    if (hit && Date.now() - hit.at < 300000) return hit.promise;
    const promise = load();
    map.set(key, { at: Date.now(), promise });
    promise.catch(() => map.delete(key));
    return promise;
  }

  detail(id) {
    return this.cached(this.details, String(id), () => this.api(`/catalog/anime/${encodeURIComponent(String(id))}`));
  }

  episodeList(id) {
    return this.cached(this.episodes, String(id), async () => {
      const list = await this.api(`/catalog/anime/${encodeURIComponent(String(id))}/episodes`);
      return Array.isArray(list) ? list : [];
    });
  }

  async getMangaDetails(mangaId) {
    const d = await this.detail(mangaId);
    const studios = (d.studios || []).map((s) => clean(s && s.name)).filter(Boolean);
    const alt = [clean(d.title && d.title.english), clean(d.title && d.title.romaji), clean(d.title && d.title.native)].filter((t) => t && t !== titleOf(d));
    const info = {
      title: titleOf(d),
      image: coverOf(d.posterUrl, true),
      desc: [String(d.overview || '').replace(/\r\n?/g, '\n').trim(), alt.length ? `Also known as: ${alt.filter((t, i) => alt.indexOf(t) === i).join(' / ')}` : ''].filter(Boolean).join('\n\n') || undefined,
      author: studios.length ? studios.slice(0, 3).join(', ') : undefined,
      tags: (d.genres || []).map(String),
      status: STATUS[d.status] || 'UNKNOWN',
      completed: d.status === 'FINISHED',
      webURL: `${SITE}/anime/${d.slug || d.id}`,
      medium: 'anime',
      ageRating: ratingOf(d),
    };
    if (/^https?:\/\//.test(String(d.backdropUrl || ''))) info.banner = d.backdropUrl;
    const cast = [];
    (d.cast || []).forEach((c) => {
      const person = c && c.person;
      if (!person || !clean(person.name) || cast.length >= 24) return;
      const entry = { name: clean(person.name) };
      if (/^https?:\/\//.test(String(person.imageUrl || ''))) entry.image = person.imageUrl;
      const role = clean(c.character && c.character.name);
      if (role) entry.role = role;
      cast.push(entry);
    });
    if (cast.length) info.cast = cast;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const list = await this.episodeList(mangaId);
    const detail = await this.detail(mangaId).catch(() => null);
    const soon = Date.now() + 36 * 3600 * 1000;
    let lastDated = -1;
    list.forEach((e, i) => {
      if (e.airDate && Number.isFinite(Date.parse(e.airDate)) && Date.parse(e.airDate) <= soon) lastDated = i;
    });
    const trim = detail && detail.status === 'RELEASING' && lastDated >= 0;
    const chapters = [];
    const seen = new Set();
    list.forEach((e, i) => {
      const id = String(e.id || '');
      const number = Number(e.number);
      if (!id || !Number.isFinite(number) || seen.has(id)) return;
      if (trim && i > lastDated && !e.airDate) return;
      const aired = e.airDate ? Date.parse(e.airDate) : NaN;
      if (Number.isFinite(aired) && aired > soon) return;
      seen.add(id);
      const title = clean(e.title);
      const chapter = { id, chapterId: id, name: title ? `Episode ${number}: ${title}` : `Episode ${number}`, number };
      if (Number.isFinite(aired)) chapter.time = aired;
      if (title) chapter.title = title;
      if (/^https?:\/\//.test(String(e.imageUrl || ''))) chapter.thumbnail = e.imageUrl;
      const minutes = Number(e.runtimeMinutes);
      if (Number.isFinite(minutes) && minutes > 0) chapter.duration = Math.round(minutes * 60);
      const summary = clean(e.overview);
      if (summary) chapter.summary = summary;
      chapters.push(chapter);
    });
    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  }

  alive(url, headers) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      setTimeout(() => finish(true), 5000);
      this.requests.schedule(App.createRequest({ url, method: 'GET', headers: Object.assign({ Accept: '*/*' }, headers || {}) })).then(
        (response) => finish(!(response.status >= 400)),
        () => finish(true),
      );
    });
  }

  async fromProvider(provider, category, episodeId, number, malId) {
    const params = { episodeId, category, episodeNumber: String(number) };
    if (malId) params.malId = String(malId);
    const data = await this.api(`/streams/anime/sources/${provider.alias}`, params);
    const sources = data && Array.isArray(data.sources) ? data.sources : [];
    const subtitles = [];
    if (category === 'sub') {
      (data.subtitles || []).forEach((t) => {
        if (!t || !/^https?:\/\//.test(String(t.url || ''))) return;
        const label = clean(t.lang) || 'Subtitles';
        const track = { url: t.url, label };
        const code = languageCode(label);
        if (code) track.language = code;
        subtitles.push(track);
      });
      subtitles.sort((a, b) => (b.language === 'en' ? 1 : 0) - (a.language === 'en' ? 1 : 0));
    }
    const word = category === 'dub' ? 'Dub' : 'Softsub';
    const entries = [];
    sources.forEach((s) => {
      if (!s || !/^https?:\/\//.test(String(s.url || ''))) return;
      const hls = s.isM3U8 === true || /\.m3u8(\?|$)/i.test(s.url) || s.type === 'hls';
      const mp4 = !hls && (s.type === 'mp4' || /\.mp4(\?|$)/i.test(s.url));
      if (!hls && !mp4) return;
      let height = /(\d{3,4})p/.exec(String(s.quality || ''));
      if (!height && provider.alias === 'nami') {
        try {
          const piece = String(s.url).split('/').slice(-2)[0];
          height = /(2160|1440|1080|720|480|360)p/.exec(App.base64Decode(piece));
        } catch (e) {
          height = null;
        }
      }
      const name = provider.server || clean(s.quality) || provider.alias;
      const video = {
        url: s.url,
        quality: `${height ? `${height[1]}p` : hls ? 'Auto' : 'Default'} ${word}`,
        server: name,
        type: hls ? 'hls' : 'mp4',
      };
      const headers = streamHeaders(data, s);
      if (Object.keys(headers).length) video.headers = headers;
      if (subtitles.length) video.subtitles = subtitles.slice(0, 12);
      entries.push(video);
    });
    const checked = await Promise.all(entries.map((v) => (v.type === 'hls' ? this.alive(v.url, v.headers) : true)));
    const out = entries.filter((v, i) => checked[i]);
    return out;
  }

  async getVideos(mangaId, chapterId) {
    const id = String(chapterId);
    const number = Number(id.split(':').pop());
    const list = await this.episodeList(mangaId).catch(() => []);
    const ep = list.find((e) => String(e.id) === id);
    const detail = await this.detail(mangaId).catch(() => null);
    const malId = detail && detail.malId;
    const categories = ['sub'];
    if (ep && ep.hasDub) categories.push('dub');
    const jobs = [];
    categories.forEach((category, ci) => {
      PROVIDERS.forEach((provider, pi) => {
        if (category === 'dub' && !provider.dub) return;
        const order = ci * PROVIDERS.length + pi;
        jobs.push(
          this.fromProvider(provider, category, id, Number.isFinite(number) ? number : ep && ep.number, malId).then(
            (videos) => ({ videos, order }),
            (error) => ({ error, videos: [], order }),
          ),
        );
      });
    });
    const answers = [];
    await new Promise((resolve) => {
      let finished = false;
      let started = false;
      let pending = jobs.length;
      const end = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      setTimeout(end, CALL_LIMIT_MS);
      jobs.forEach((job) => {
        job.then((answer) => {
          if (finished) return;
          answers.push(answer);
          pending -= 1;
          if (answer.videos.length && !started) {
            started = true;
            setTimeout(end, GRACE_MS);
          }
          if (pending <= 0) end();
        });
      });
    });
    const videos = [];
    answers.sort((a, b) => a.order - b.order).forEach((a) => a.videos.forEach((v) => videos.push(v)));
    if (!videos.length) {
      const limited = answers.some((a) => a.error && /rate limit/i.test(String(a.error.message)));
      if (limited) throw new Error('Itasha is rate limiting requests, try this episode again in a minute');
      throw new Error('Itasha has no stream for this episode yet: none of its providers listed one');
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

function parseQuery(text) {
  const out = {};
  String(text || '')
    .split('&')
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf('=');
      out[pair.slice(0, i)] = pair.slice(i + 1);
    });
  return out;
}

module.exports = { Source };
