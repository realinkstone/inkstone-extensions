const SITES = [
  'https://arrowtv.net',
  'https://arrowtv.st',
  'https://www.cinezo.st',
];
const PUNK = 'https://punkflix.net';
const BOLT = 'https://vidbolt.xyz';
const PLAYER_REFERER = 'https://player.cinezo.live/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const IMG = 'https://image.tmdb.org/t/p';

const PLATFORMS = [
  ['netflix', 'Netflix'],
  ['prime', 'Prime Video'],
  ['disney', 'Disney+'],
  ['apple', 'Apple TV+'],
  ['hulu', 'Hulu'],
  ['hbo', 'HBO Max'],
  ['paramount', 'Paramount+'],
  ['peacock', 'Peacock'],
  ['crunchyroll', 'Crunchyroll'],
  ['starz', 'Starz'],
  ['amc', 'AMC+'],
];

const FEEDS = [{ id: 'trending', name: 'Trending this week', kind: 'trending' }]
  .concat([
    { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie' },
    { id: 'series-popular', name: 'Series: Popular', kind: 'tv' },
  ])
  .concat(PLATFORMS.map((p) => ({ id: 'platform-' + p[0], name: p[1], kind: 'mixed', platform: p[0] })));

const GENRES = [
  ['action', 'Action', 28, 0],
  ['action-adventure', 'Action & Adventure', 0, 10759],
  ['adventure', 'Adventure', 12, 0],
  ['animation', 'Animation', 16, 16],
  ['comedy', 'Comedy', 35, 35],
  ['crime', 'Crime', 80, 80],
  ['documentary', 'Documentary', 99, 99],
  ['drama', 'Drama', 18, 18],
  ['family', 'Family', 10751, 10751],
  ['fantasy', 'Fantasy', 14, 0],
  ['history', 'History', 36, 0],
  ['horror', 'Horror', 27, 0],
  ['kids', 'Kids', 0, 10762],
  ['music', 'Music', 10402, 0],
  ['mystery', 'Mystery', 9648, 9648],
  ['news', 'News', 0, 10763],
  ['reality', 'Reality', 0, 10764],
  ['romance', 'Romance', 10749, 0],
  ['science-fiction', 'Science Fiction', 878, 0],
  ['sci-fi-fantasy', 'Sci-Fi & Fantasy', 0, 10765],
  ['soap', 'Soap', 0, 10766],
  ['talk', 'Talk', 0, 10767],
  ['thriller', 'Thriller', 53, 0],
  ['tv-movie', 'TV Movie', 10770, 0],
  ['war', 'War', 10752, 0],
  ['war-politics', 'War & Politics', 0, 10768],
  ['western', 'Western', 37, 37],
];

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function poster(path, size) {
  const p = String(path || '');
  return p && p.charAt(0) === '/' ? `${IMG}/${size || 'w342'}${p}` : '';
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('ArrowTV: unknown title id ' + mangaId);
  return { kind: m[1], id: m[2] };
}

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A' || c === '-') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|18PLUS|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|7|10)$/.test(c)) return 0;
  return 16;
}

const WORDS_18 = /\b(porn|porno|pornographic|pornstar|xxx|hentai|softcore|hardcore porn|erotica|adult film|adult video|orgy|orgies|gangbang|bdsm)\b/i;
const WORDS_16 = /\b(erotic|nude|nudity|nudist|naked|sexual|sexy|sex|seduces|seduction|stripper|strip club|escort|prostitute|brothel|fetish|nymphomaniac|lust|affair|mistress)\b/i;
function ageOfText(title, overview) {
  const t = cleanText(title);
  const o = cleanText(overview);
  if (WORDS_18.test(t) || WORDS_18.test(o)) return 18;
  if (WORDS_16.test(t) || WORDS_16.test(o)) return 16;
  return undefined;
}

function higher(a, b) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function flightText(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch (e) {
    }
  }
  return out;
}

function valueAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function readTitlePage(html) {
  const text = flightText(html);
  const at = text.indexOf('"t":{"id":');
  if (at < 0) return null;
  let t = null;
  try {
    t = JSON.parse(valueAt(text, at + 4));
  } catch (e) {
    return null;
  }
  let cast = [];
  const c = text.indexOf('"cast":[');
  if (c >= 0) {
    try {
      cast = JSON.parse(valueAt(text, c + 7));
    } catch (e) {
      cast = [];
    }
  }
  return { t, cast: Array.isArray(cast) ? cast : [] };
}

function rowValue(t, label) {
  const rows = Array.isArray(t && t.rows) ? t.rows : [];
  const row = rows.filter((r) => r && String(r.label).toLowerCase() === label)[0];
  return row ? cleanText(row.value) : '';
}

function statusOfShow(text) {
  const s = String(text || '').toLowerCase();
  if (/returning|in production|planned|pilot/.test(s)) return 'ONGOING';
  if (/ended|cancel/.test(s)) return 'COMPLETED';
  return 'UNKNOWN';
}

function heightOfResolution(res) {
  const m = /^(\d+)x(\d+)$/.exec(String(res || ''));
  if (!m) return 0;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (w >= 3600) return 2160;
  if (w >= 2500) return 1440;
  if (w >= 1800) return 1080;
  if (w >= 1200) return 720;
  return h || 480;
}

const LANGUAGES = {
  eng: 'English', en: 'English', hin: 'Hindi', fre: 'French', fra: 'French', spa: 'Spanish', ger: 'German', deu: 'German', ita: 'Italian',
  por: 'Portuguese', rus: 'Russian', jpn: 'Japanese', kor: 'Korean', chi: 'Chinese', zho: 'Chinese', ara: 'Arabic', ind: 'Indonesian',
  tam: 'Tamil', tel: 'Telugu', tha: 'Thai', tur: 'Turkish', vie: 'Vietnamese', pol: 'Polish', dut: 'Dutch', nld: 'Dutch', swe: 'Swedish',
};

function languageName(code) {
  const c = String(code || '').toLowerCase();
  if (!c || c === 'und') return '';
  return LANGUAGES[c] || '';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    this.site = 0;
    this.pages = new Map();
    this.ages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last;
  }

  async api(path, prefer) {
    const order = [];
    const first = typeof prefer === 'number' ? prefer : this.site;
    order.push(first);
    for (let i = 0; i < SITES.length; i++) if (i !== first) order.push(i);
    let failure = null;
    for (const index of order) {
      let response;
      try {
        response = await this.send({ url: SITES[index] + path, method: 'GET', headers: { Accept: 'application/json', 'User-Agent': UA } });
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        failure = e;
        continue;
      }
      const status = response.status;
      if (status === 404) throw new Error('ArrowTV: not found (HTTP 404)');
      if (status >= 500 || status === 403 || status === 451 || status === 429) {
        failure = new Error(`ArrowTV: HTTP ${status} from ${SITES[index]}`);
        continue;
      }
      if (status < 200 || status >= 300) {
        failure = new Error(`ArrowTV: HTTP ${status}`);
        continue;
      }
      let data = null;
      try {
        data = JSON.parse(String(response.data || ''));
      } catch (e) {
        failure = new Error(`ArrowTV: ${SITES[index]} did not answer JSON`);
        continue;
      }
      if (typeof prefer !== 'number') this.site = index;
      return data;
    }
    throw failure || new Error('ArrowTV: no address answered');
  }

  async titlePage(kind, id) {
    const key = kind + '~' + id;
    if (this.pages.has(key)) return this.pages.get(key);
    let thin = null;
    let failure = null;
    for (let i = 0; i < SITES.length; i++) {
      let response;
      try {
        response = await this.send({ url: `${SITES[i]}/${kind}/${id}`, method: 'GET', headers: { Accept: 'text/html', 'User-Agent': UA } });
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        failure = e;
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        failure = new Error(`ArrowTV: HTTP ${response.status}`);
        continue;
      }
      const page = readTitlePage(String(response.data || ''));
      if (!page) {
        failure = new Error('ArrowTV: title page not found');
        continue;
      }
      if (Array.isArray(page.t.genres)) {
        this.pages.set(key, page);
        return page;
      }
      if (!thin) thin = page;
    }
    if (thin) return thin;
    throw failure || new Error('ArrowTV: title page not found');
  }

  card(item, kind) {
    if (!item || !item.id) return null;
    const type = item.media_type === 'tv' || item.media_type === 'movie' ? item.media_type : kind;
    if (type !== 'movie' && type !== 'tv') return null;
    const title = cleanText(item.title || item.name);
    if (!title || !item.poster_path) return null;
    const mangaId = `${type}~${item.id}`;
    const out = { mangaId, title, image: poster(item.poster_path, 'w342'), webURL: `${SITES[0]}/${type}/${item.id}`, medium: 'anime' };
    let age = item.adult === true || item.softcore === true ? 18 : undefined;
    age = higher(age, ageOfText(title, item.overview));
    if (this.ages.has(mangaId)) age = higher(age, this.ages.get(mangaId));
    if (age !== undefined) out.ageRating = age;
    const year = /^(\d{4})/.exec(String(item.release_date || item.first_air_date || ''));
    if (year) out.subtitle = year[1];
    return out;
  }

  cards(items, kind) {
    const seen = new Set();
    const out = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const c = this.card(item, kind);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        out.push(c);
      }
    });
    return out;
  }

  genreIdOf(tag, kind) {
    const g = GENRES.filter((x) => x[0] === String(tag))[0];
    if (!g) return -1;
    return kind === 'movie' ? g[2] : g[3];
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = cleanText(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';

    if (query) {
      if (page > 1) return { results: [] };
      const asked = await Promise.all(
        ['movies', 'tv'].map((type) => this.api(`/api/search?${qs({ q: query, type })}`).then((data) => ({ data }), (error) => ({ error })))
      );
      if (asked[0].error && asked[1].error) throw asked[0].error;
      const a = this.cards(asked[0].data, 'movie');
      const b = this.cards(asked[1].data, 'tv');
      const mixed = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i]) mixed.push(a[i]);
        if (b[i]) mixed.push(b[i]);
      }
      return { results: mixed };
    }

    const feedId = String((request && request.feed) || '');
    if (feedId.indexOf('person:') === 0) {
      const personId = feedId.slice(7);
      if (!/^\d+$/.test(personId)) return { results: [] };
      if (page > 1) return { results: [] };
      const data = await this.api(`/api/person/${personId}`);
      const credits = (Array.isArray(data && data.cast) ? data.cast : []).slice().sort((x, y) => (y.popularity || 0) - (x.popularity || 0));
      return { results: this.cards(credits, 'movie') };
    }

    const feed = FEEDS.filter((f) => f.id === feedId)[0] || FEEDS[1];
    if (feed.kind === 'trending') {
      if (page > 1) return { results: [] };
      let items = await this.api('/api/trending?window=week');
      items = Array.isArray(items) ? items : [];
      if (tag) items = items.filter((it) => (it.genre_ids || []).indexOf(this.genreIdOf(tag, it.media_type === 'tv' ? 'tv' : 'movie')) !== -1);
      return { results: this.cards(items, 'movie') };
    }
    if (feed.kind === 'movie' || feed.kind === 'tv') {
      const genre = tag ? this.genreIdOf(tag, feed.kind) : '';
      if (tag && !(genre > 0)) return { results: [] };
      const data = await this.api(`/api/categories?type=${feed.kind}&page=${page}&genre=${genre}`);
      const results = this.cards(data && data.results, feed.kind);
      const more = results.length > 0 && page < Math.min(Number((data && data.total_pages) || 1), 500);
      return more ? { results, metadata: { page: page + 1 } } : { results };
    }
    const kinds = feed.platform === 'crunchyroll' ? ['tv'] : ['movie', 'tv'];
    const lists = await Promise.all(
      kinds.map((type) => this.api(`/api/platform?${qs({ platform: feed.platform, type, page })}`).then(
        (data) => ({ type, results: this.cards((data && data.results || []).filter((it) => !tag || (it.genre_ids || []).indexOf(this.genreIdOf(tag, type)) !== -1), type), pages: Number((data && data.total_pages) || 1) }),
        (e) => {
          if (e && e.kind === 'challenge') throw e;
          return { type, results: [], pages: 0 };
        }
      ))
    );
    const mixed = [];
    const longest = Math.max.apply(null, lists.map((l) => l.results.length).concat([0]));
    for (let i = 0; i < longest; i++) lists.forEach((l) => l.results[i] && mixed.push(l.results[i]));
    const asked = lists.reduce((n, l) => n + (l.pages > 0 ? 1 : 0), 0);
    return asked && mixed.length && page < 500 ? { results: mixed, metadata: { page: page + 1 } } : { results: mixed };
  }

  async getMangaDetails(mangaId) {
    const { kind, id } = parseId(mangaId);
    const page = await this.titlePage(kind, id);
    const t = page.t;
    const title = cleanText(t.title);
    if (!title) throw new Error('ArrowTV: title page not found');
    const info = {
      title,
      image: poster(t.poster || t.poster_path, 'w500'),
      desc: cleanText(t.overview),
      status: kind === 'movie' ? 'COMPLETED' : statusOfShow(rowValue(t, 'status')),
      tags: Array.isArray(t.genres) ? t.genres.map((g) => cleanText(g)).filter(Boolean) : [],
      webURL: `${SITES[0]}/${kind}/${id}`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    if (t.backdrop) info.banner = poster(t.backdrop, 'w1280');
    const names = t.credit && cleanText(t.credit.names);
    if (names) info.author = names;
    const year = /^(\d{4})/.exec(String(t.releaseDate || t.release_date || t.year || ''));
    if (year) info.releaseDate = year[1];
    const cast = [];
    page.cast.slice(0, 30).forEach((p) => {
      if (!p || !p.name) return;
      const person = { name: cleanText(p.name), feed: /^\d+$/.test(String(p.id)) ? `person:${p.id}` : undefined };
      if (p.profile_path) person.image = poster(p.profile_path, 'w185');
      if (p.character) person.role = cleanText(p.character);
      if (person.feed === undefined) delete person.feed;
      cast.push(person);
    });
    if (cast.length) info.cast = cast;
    const age = higher(ageOfCertificate(t.cert), ageOfText(title, t.overview));
    if (age !== undefined) {
      info.ageRating = age;
      this.ages.set(`${kind}~${id}`, age);
    }
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, id } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const page = await this.titlePage(kind, id);
    let seasons = (Array.isArray(page.t.seasons) ? page.t.seasons : [])
      .map((s) => ({ number: Number(s && s.season_number), count: Number(s && s.episode_count) }))
      .filter((s) => Number.isFinite(s.number) && s.number >= 1 && !(s.count === 0));
    if (!seasons.length && !Array.isArray(page.t.seasons)) {
      const n = Math.min(Math.max(Number(page.t.seasonsCount) || 1, 1), 40);
      seasons = [];
      for (let i = 1; i <= n; i++) seasons.push({ number: i, count: -1 });
    }
    if (!seasons.length) throw new Error('ArrowTV has no episodes for this show yet');
    const loaded = [];
    for (let i = 0; i < seasons.length; i += 3) {
      const batch = seasons.slice(i, i + 3);
      const got = await Promise.all(
        batch.map((s) => this.api(`/api/tv-episodes?${qs({ id, season: s.number })}`, SITES.length - 1).then(
          (data) => ({ season: s.number, episodes: Array.isArray(data && data.episodes) ? data.episodes : [] }),
          (e) => {
            if (e && e.kind === 'challenge') throw e;
            return { season: s.number, failed: true, episodes: [] };
          }
        ))
      );
      got.forEach((g) => loaded.push(g));
    }
    const failed = loaded.filter((l) => l.failed).map((l) => l.season);
    const rows = [];
    const seen = new Set();
    const horizon = Date.now() + 86400000;
    loaded.forEach((l) => {
      l.episodes.forEach((ep) => {
        const number = Number(ep && ep.episode_number);
        if (!Number.isFinite(number)) return;
        const due = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ep.air_date || ''));
        if (due && Date.UTC(+due[1], +due[2] - 1, +due[3]) > horizon) return;
        const key = `s${l.season}e${number}`;
        if (seen.has(key)) return;
        seen.add(key);
        const name = cleanText(ep.name);
        const row = { id: key, chapterId: key, name: name ? `Episode ${number}: ${name}` : `Episode ${number}`, number, season: l.season, ep };
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error(failed.length ? 'ArrowTV: the episode lists did not load, try again' : 'ArrowTV has no episodes for this show yet');
    if (failed.length) throw new Error(`ArrowTV: season ${failed.join(', ')} did not load, try again`);
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.chapterId, name: r.name, number: r.number };
      const ep = r.ep;
      const time = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ep.air_date || ''));
      if (time) {
        const ms = Date.UTC(+time[1], +time[2] - 1, +time[3]);
        if (Number.isFinite(ms)) out.time = ms;
      }
      if (cleanText(ep.name)) out.title = cleanText(ep.name);
      if (ep.still_path) out.thumbnail = poster(ep.still_path, 'w300');
      if (Number(ep.runtime) > 0) out.duration = Math.round(Number(ep.runtime) * 60);
      if (cleanText(ep.overview)) out.summary = cleanText(ep.overview);
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    const { kind, id } = parseId(mangaId);
    let season = '';
    let episode = '';
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('ArrowTV: unknown episode id ' + chapterId);
      season = ep[1];
      episode = ep[2];
    }
    const settle = (promise) => promise.then((videos) => ({ videos }), (error) => ({ error }));
    const jennifer = settle(this.jennifer(kind, id, season, episode));
    const callisto = settle(this.vidbolt(kind, id, season, episode, 'callisto'));
    const orion = kind === 'tv' ? settle(this.vidbolt(kind, id, season, episode, 'orion')) : null;
    const first = await jennifer;
    const wait = new Promise((resolve) => setTimeout(() => resolve({ error: new Error('VidBolt did not answer in time') }), first.videos ? 3500 : 14000));
    const second = await Promise.race([callisto, wait]);
    const third = orion ? await Promise.race([orion, wait]) : { videos: [] };
    let videos = [].concat(first.videos || [], second.videos || [], third.videos || []);
    if (!videos.length && kind === 'movie') {
      const last = await settle(this.vidbolt(kind, id, season, episode, 'orion'));
      third.error = last.error;
      videos = last.videos || [];
    }
    const answers = [first, second, third];
    if (!videos.length) {
      const challenged = answers.filter((a) => a.error && a.error.kind === 'challenge')[0];
      if (challenged) throw challenged.error;
      const problems = answers.filter((a) => a.error).map((a) => (a.error.message ? a.error.message : String(a.error)));
      throw new Error(`ArrowTV has no stream for this title yet (${problems.join('; ')})`);
    }
    return videos;
  }

  async jennifer(kind, id, season, episode) {
    const path = kind === 'movie' ? `/movie/${id}.json` : `/tv/${id}/${season}/${episode}.json`;
    const response = await this.send({
      url: PUNK + path,
      method: 'GET',
      headers: { Accept: 'application/json', Referer: PLAYER_REFERER, 'User-Agent': UA },
    });
    if (response.status === 404) throw new Error('Jennifer 4K does not have this title');
    if (response.status === 429) throw new Error('Jennifer 4K is rate limiting this address (HTTP 429), try again later');
    if (response.status < 200 || response.status >= 300) throw new Error(`Jennifer 4K: HTTP ${response.status}`);
    let data = null;
    try {
      data = JSON.parse(String(response.data || ''));
    } catch (e) {
      data = null;
    }
    const stream = data && data.stream;
    const url = stream && (stream.hls || stream.original);
    if (!url || !/^https:\/\/[^/]+\/.*\.m3u8/.test(url)) throw new Error('Jennifer 4K gave no stream for this title');
    const parts = ['Jennifer 4K'];
    const height = heightOfResolution(data.quality && data.quality.resolution);
    parts.push(height ? `Auto up to ${height}p` : 'Auto');
    const audio = Array.isArray(data.audio) ? data.audio : [];
    const main = audio.filter((a) => a && a.default)[0] || audio[0];
    const mainName = main ? languageName(main.language) : '';
    const hasEnglish = audio.some((a) => a && languageName(a.language) === 'English');
    if (mainName) parts.push(`${mainName} audio` + (mainName !== 'English' && hasEnglish ? ', English audio available' : ''));
    const subtitles = [];
    (Array.isArray(data.subtitles) ? data.subtitles : []).forEach((s) => {
      if (!s || !s.url || languageName(s.language) !== 'English' || /forced/i.test(String(s.title))) return;
      if (subtitles.length >= 3) return;
      subtitles.push({ url: s.url, label: cleanText(s.title) || 'English', language: 'en' });
    });
    if (subtitles.length) parts.push('Softsub: English');
    const video = { url, quality: parts.join(', '), type: 'hls', server: 'Jennifer 4K', headers: { Referer: PLAYER_REFERER } };
    if (subtitles.length) video.subtitles = subtitles;
    return [video];
  }

  async alive(url, headers, label) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ Accept: 'application/vnd.apple.mpegurl,*/*' }, headers || {}) });
    if (response.status < 200 || response.status >= 300 || String(response.data || '').indexOf('#EXTM3U') === -1) {
      throw new Error(`${label}: its stream is gone (HTTP ${response.status})`);
    }
  }

  async vidbolt(kind, id, season, episode, only) {
    const query = kind === 'movie' ? { type: 'movie', id, only } : { type: 'tv', id, season, episode, only };
    const response = await this.send({
      url: `${BOLT}/api/resolve?${qs(query)}`,
      method: 'GET',
      headers: { Accept: 'application/json', Referer: `${BOLT}/`, 'User-Agent': UA },
    });
    if (response.status === 404) throw new Error('VidBolt does not have this title');
    if (response.status < 200 || response.status >= 300) throw new Error(`VidBolt: HTTP ${response.status}`);
    let data = null;
    try {
      data = JSON.parse(String(response.data || ''));
    } catch (e) {
      data = null;
    }
    const stream = data && data.stream;
    if (!stream || !Array.isArray(stream.sources) || !stream.sources.length) throw new Error('VidBolt has no stream for this title');
    const out = [];
    if (stream.server === 'callisto') {
      const subtitles = (Array.isArray(stream.subtitles) ? stream.subtitles : [])
        .filter((s) => s && s.url && cleanText(s.label) === 'English')
        .slice(0, 2)
        .map((s, i) => ({ url: s.url, label: i ? `English ${i + 1}` : 'English', language: 'en' }));
      const height = (s) => parseInt(s.quality, 10) || 0;
      const english = stream.sources.filter((s) => s && s.url && cleanText(s.language) === 'English').sort((a, b) => height(b) - height(a));
      const hls = english.filter((s) => s.kind === 'hls')[0];
      const mp4 = english.filter((s) => s.kind === 'mp4')[0];
      const pick = hls || mp4;
      if (!pick) throw new Error('VidBolt has no English stream for this title');
      const label = ['VidBolt Callisto', hls ? (height(pick) ? `Auto up to ${height(pick)}p` : 'Auto') : cleanText(pick.quality), 'English audio'];
      if (subtitles.length) label.push('Softsub: English');
      if (hls) await this.alive(pick.url, undefined, 'VidBolt Callisto');
      const video = { url: pick.url, quality: label.join(', '), type: hls ? 'hls' : 'mp4', server: 'VidBolt Callisto' };
      if (subtitles.length) video.subtitles = subtitles;
      out.push(video);
    } else {
      const source = stream.sources.filter((s) => s && s.url && s.kind === 'hls')[0];
      if (!source) throw new Error('VidBolt gave no HLS stream for this title');
      const text = String(source.master || '');
      const heights = [];
      const audio = [];
      let hasSubs = false;
      text.split('\n').forEach((line) => {
        const h = /RESOLUTION=\d+x(\d+)/.exec(line);
        if (h) heights.push(parseInt(h[1], 10));
        if (line.indexOf('TYPE=AUDIO') !== -1) {
          const name = (/NAME="(?:\d+\.\s*)?([^"]+)"/.exec(line) || [])[1];
          if (name && audio.indexOf(name) === -1) audio.push(name);
        }
        if (line.indexOf('TYPE=SUBTITLES') !== -1 && /LANGUAGE="en/i.test(line)) hasSubs = true;
      });
      const top = heights.length ? Math.max.apply(null, heights) : parseInt(source.quality, 10) || 0;
      const label = ['VidBolt Orion', top ? `Auto up to ${top}p` : 'Auto'];
      if (audio.indexOf('English') !== -1) label.push(audio.length > 1 ? 'English audio, other audio languages inside' : 'English audio');
      else if (audio.length) label.push(`${audio[0]} audio only`);
      if (hasSubs) label.push('Softsub: English');
      await this.alive(source.url, { Referer: `${BOLT}/` }, 'VidBolt Orion');
      out.push({ url: source.url, quality: label.join(', '), type: 'hls', server: 'VidBolt Orion', headers: { Referer: `${BOLT}/` } });
    }
    return out;
  }
}

module.exports = { Source };
