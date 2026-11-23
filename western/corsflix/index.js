const SITES = ['https://watch.corsflix.net', 'https://watch.corsflix.dpdns.org'];
const BACKENDS = [
  { base: SITES[0], route: (path) => path },
  { base: SITES[1], route: (path) => path },
  { base: 'https://db.hls.lol', route: (path) => path.replace(/^\/api\//, '/3/') },
];
const CALL_LIMIT_MS = 10000;
const BAD_FOR_MS = 300000;
const SCRAPER = 'https://scrapper.rivestream.app';
const IMG = 'https://image.tmdb.org/t/p/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const XPASS = { Referer: 'https://play.xpass.top/', Origin: 'https://play.xpass.top' };

const WINDOW_MS = 10000;
const WINDOW_MAX = 22;
const MIN_GAP_MS = 80;
const MAX_PROBES_FEED = 8;
const MAX_PROBES_SEARCH = 20;
const HARD_MS = 13000;
const SOFT_MS = 3000;
const RATE_BUDGET_BROWSE_MS = 2000;
const VOTES_KNOWN = 400;
const RATE_BUDGET_SEARCH_MS = 4500;

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', path: '/api/movie/popular' },
  { id: 'series-popular', name: 'Series: Popular', kind: 'tv', path: '/api/tv/popular' },
  { id: 'movies-rated', name: 'Movies: Top rated', kind: 'movie', path: '/api/movie/top_rated' },
  { id: 'series-rated', name: 'Series: Top rated', kind: 'tv', path: '/api/tv/top_rated' },
  { id: 'movies-new', name: 'Movies: In cinemas', kind: 'movie', path: '/api/movie/now_playing' },
  { id: 'series-new', name: 'Series: Airing today', kind: 'tv', path: '/api/tv/airing_today' },
  { id: 'trending', name: 'Trending today', kind: 'all', path: '/api/trending/all/day' },
];

const LANGUAGE_CODES = {
  english: 'en', arabic: 'ar', hebrew: 'he', japanese: 'ja', korean: 'ko', romanian: 'ro', thai: 'th', croatian: 'hr', czech: 'cs', dansk: 'da', danish: 'da',
  deutsch: 'de', german: 'de', french: 'fr', greek: 'el', hungarian: 'hu', icelandic: 'is', indonesian: 'id', italiano: 'it', italian: 'it', malay: 'ms',
  nederlands: 'nl', dutch: 'nl', polish: 'pl', russian: 'ru', spanish: 'es', turkish: 'tr', ukrainian: 'uk', hindi: 'hi', tamil: 'ta', telugu: 'te',
  kannada: 'kn', malayalam: 'ml', bengali: 'bn', chinese: 'zh', vietnamese: 'vi', albanian: 'sq', persian: 'fa', urdu: 'ur', swedish: 'sv', finnish: 'fi',
};

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function within(ms, promise) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('timed out'));
      }
    }, ms);
    promise.then(
      (value) => {
        if (!done) {
          done = true;
          resolve(value);
        }
      },
      (error) => {
        if (!done) {
          done = true;
          reject(error);
        }
      }
    );
  });
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await fn(items[at], at);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('CorsFlix: unknown title id ' + mangaId);
  return { kind: m[1], id: parseInt(m[2], 10) };
}

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|7|10)$/.test(c)) return 0;
  return 16;
}

const EXPLICIT_KEYWORDS = /^(softcore|hardcore|pornograph\w*|porn|erotic movie|erotica|sexploitation|pink film|cumshot|blowjob|gangbang|pussy licking|orgy|bukkake|unsimulated sex|explicit sex|anal sex|oral sex|group sex|lesbian sex|hentai)$/i;
const SUGGESTIVE_KEYWORDS = /^(erotic|eroticism|erotic thriller|erotic drama|nudity|female nudity|male nudity|full frontal nudity|sexual arousal|sexual fantasy|sex scene|sexy|seduction|striptease|stripper)$/i;

function ageOfKeywords(keywords) {
  let age;
  for (const k of Array.isArray(keywords) ? keywords : []) {
    const name = clean(k && k.name ? k.name : k);
    if (EXPLICIT_KEYWORDS.test(name)) return 18;
    if (SUGGESTIVE_KEYWORDS.test(name)) age = 16;
  }
  return age;
}

const EXPLICIT_TITLE = /\b(porn\w*|hentai|softcore|erotica|gangbang|bukkake|sexploitation|orgy)\b/i;
const SUGGESTIVE_TITLE = /\b(erotic|emmanuelle|nudes?|naked|sexy|sex|seduction|seduce\w*|striptease|stripper|playboy|playgirl)\b/i;

const EXPLICIT_TEXT = /\b(porn\w*|hentai|softcore|erotica|gangbang|bukkake|sexploitation|orgy|orgies)\b/i;
const SUGGESTIVE_TEXT = /\b(erotic\w*|nude|nudity|naked|striptease|stripper|sexy)\b/i;

function ageOfText(text) {
  const t = String(text || '');
  if (EXPLICIT_TEXT.test(t)) return 18;
  if (SUGGESTIVE_TEXT.test(t)) return 16;
  return undefined;
}

function ageOfTitle(title) {
  const t = String(title || '');
  if (/\bnaked gun\b/i.test(t)) return undefined;
  if (EXPLICIT_TITLE.test(t)) return 18;
  if (SUGGESTIVE_TITLE.test(t)) return 16;
  return undefined;
}

function higher(a, b) {
  return a === undefined ? b : b === undefined ? a : Math.max(a, b);
}

function certificateOf(d, kind) {
  if (kind === 'movie') {
    const us = ((d && d.release_dates && d.release_dates.results) || []).find((r) => r && r.iso_3166_1 === 'US');
    const list = (us && us.release_dates) || [];
    const hit = list.find((r) => r && clean(r.certification));
    return hit ? clean(hit.certification) : '';
  }
  const us = ((d && d.content_ratings && d.content_ratings.results) || []).find((r) => r && r.iso_3166_1 === 'US');
  return us ? clean(us.rating) : '';
}

function keywordsOf(d, kind) {
  const k = d && d.keywords;
  if (!k) return [];
  return (kind === 'movie' ? k.keywords : k.results) || [];
}

function ageOfDetails(d, kind) {
  return higher(ageOfCertificate(certificateOf(d, kind)), ageOfKeywords(keywordsOf(d, kind)));
}

function languageCode(name) {
  const key = clean(name).toLowerCase().replace(/\s*\(.*\)\s*$/, '').replace(/\s+bokm.l$/, '');
  if (LANGUAGE_CODES[key]) return LANGUAGE_CODES[key];
  if (key === 'norwegian') return 'no';
  if (key.indexOf('portugu') === 0) return 'pt';
  return key.slice(0, 2) || 'und';
}

function posterOf(path, size) {
  return path ? `${IMG}${size}${path}` : '';
}

function yearOf(date) {
  const m = /^(\d{4})/.exec(String(date || ''));
  return m ? m[1] : '';
}

function statusOfShow(text) {
  const t = String(text || '').toLowerCase();
  if (/returning|in production|planned|pilot/.test(t)) return 'ONGOING';
  if (/ended|cancel/.test(t)) return 'COMPLETED';
  return 'UNKNOWN';
}

function citadelParts(quality) {
  const parts = String(quality || '').split('|');
  const height = parseInt(parts[0], 10) || 0;
  const language = clean(parts[1]);
  return { height, language };
}

function captionName(file) {
  let name = String(file || '').split('?')[0].split('/').pop() || '';
  try {
    name = decodeURIComponent(name);
  } catch (e) {
  }
  return clean(name.replace(/\.(vtt|srt)$/i, ''));
}

function subtitlesOf(captions) {
  const out = [];
  const seen = {};
  (Array.isArray(captions) ? captions : []).forEach((c) => {
    if (!c || !/^https?:\/\//.test(String(c.file || ''))) return;
    const name = captionName(c.file);
    if (!name || seen[name.toLowerCase()]) return;
    seen[name.toLowerCase()] = true;
    let url = String(c.file);
    try {
      url = encodeURI(decodeURI(url));
    } catch (e) {
    }
    out.push({ url, label: name.replace(/^Deutsch$/, 'German').replace(/^Dansk$/, 'Danish').replace(/^Italiano$/, 'Italian').replace(/^Nederlands$/, 'Dutch'), language: languageCode(name), format: 'vtt' });
  });
  out.sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1) || a.label.localeCompare(b.label));
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.mirror = 0;
    this.badUntil = [0, 0, 0];
    this.stamps = [];
    this.lastAt = 0;
    this.ages = new Map();
    this.genreNames = null;
  }

  async pace() {
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => t > now - WINDOW_MS);
    let at = now;
    if (this.stamps.length >= WINDOW_MAX) at = Math.max(at, this.stamps[this.stamps.length - WINDOW_MAX] + WINDOW_MS + 20);
    at = Math.max(at, this.lastAt + MIN_GAP_MS);
    this.lastAt = at;
    this.stamps.push(at);
    if (at > now) await pause(at - now);
  }

  async api(path) {
    let last = null;
    const now = Date.now();
    const all = BACKENDS.map((b, k) => (this.mirror + k) % BACKENDS.length);
    const healthy = all.filter((i) => !(this.badUntil[i] > now));
    const order = healthy.concat(all.filter((i) => healthy.indexOf(i) === -1));
    for (const index of order) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.pace();
        const url = BACKENDS[index].base + BACKENDS[index].route(path) + (attempt ? `${path.indexOf('?') >= 0 ? '&' : '?'}_r=${attempt}` : '');
        let response;
        try {
          response = await within(CALL_LIMIT_MS, this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } })));
        } catch (e) {
          if (e && e.kind === 'challenge') throw e;
          last = e;
          this.badUntil[index] = Date.now() + BAD_FOR_MS;
          break;
        }
        if (response.status === 429) {
          last = new Error('CorsFlix: HTTP 429, the site asked for fewer requests');
          await pause(1500 * (attempt + 1));
          continue;
        }
        if (response.status === 404 || response.status === 400) return null;
        if (response.status >= 500 || response.status === 451 || response.status === 403 || response.status < 200 || response.status >= 300) {
          last = new Error(`CorsFlix: HTTP ${response.status} from ${BACKENDS[index].base}`);
          this.badUntil[index] = Date.now() + BAD_FOR_MS;
          break;
        }
        let json = null;
        try {
          json = JSON.parse(String(response.data || ''));
        } catch (e) {
          json = null;
        }
        if (json === null || typeof json !== 'object') {
          last = new Error(`CorsFlix: ${BACKENDS[index].base} did not answer with JSON`);
          this.badUntil[index] = Date.now() + BAD_FOR_MS;
          break;
        }
        this.mirror = index;
        this.badUntil[index] = 0;
        return json;
      }
    }
    throw last || new Error('CorsFlix is not reachable');
  }

  async genres() {
    if (this.genreNames) return this.genreNames;
    const names = {};
    const [movie, tv] = await Promise.all([this.api('/api/genre/movie/list'), this.api('/api/genre/tv/list')]);
    [movie, tv].forEach((d) => ((d && d.genres) || []).forEach((g) => (names[g.id] = clean(g.name))));
    this.genreNames = names;
    return names;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    const [movie, tv] = await Promise.all([this.api('/api/genre/movie/list'), this.api('/api/genre/tv/list')]);
    const tags = [];
    const seen = {};
    ((movie && movie.genres) || []).forEach((g) => {
      seen[clean(g.name).toLowerCase()] = true;
      tags.push({ id: `m${g.id}`, label: clean(g.name) });
    });
    ((tv && tv.genres) || []).forEach((g) => {
      if (!seen[clean(g.name).toLowerCase()]) tags.push({ id: `t${g.id}`, label: clean(g.name) });
    });
    return tags.sort((a, b) => a.label.localeCompare(b.label));
  }

  card(item, kind, names) {
    const type = kind === 'all' ? item && item.media_type : kind;
    if (!item || (type !== 'movie' && type !== 'tv') || !item.id) return null;
    const title = clean(type === 'tv' ? item.name || item.title : item.title || item.name);
    if (!title) return null;
    const mangaId = `${type}~${item.id}`;
    const out = { mangaId, title, medium: 'anime' };
    const poster = posterOf(item.poster_path, 'w342');
    if (poster) out.image = poster;
    const year = yearOf(type === 'tv' ? item.first_air_date : item.release_date);
    out.summary = [type === 'tv' ? 'Series' : 'Movie', year].filter(Boolean).join(', ');
    if (year) out.releaseDate = year;
    if (Array.isArray(item.genre_ids) && names) {
      const tags = item.genre_ids.map((id) => names[id]).filter(Boolean);
      if (tags.length) out.tags = tags;
    }
    if (item.vote_average > 0) out.rating = Math.round(item.vote_average * 10) / 10;
    let age = higher(higher(item.adult === true ? 18 : undefined, ageOfTitle(title)), ageOfText(item.overview));
    const known = this.ages.get(mangaId);
    if (known !== undefined && known >= 0) age = higher(age, known);
    if (age !== undefined) out.ageRating = age;
    return out;
  }

  async ageOf(mangaId) {
    if (this.ages.has(mangaId)) return this.ages.get(mangaId);
    const { kind, id } = parseId(mangaId);
    try {
      const d = await this.api(`/api/${kind}/${id}?append_to_response=${kind === 'movie' ? 'release_dates' : 'content_ratings'},keywords`);
      if (!d) return undefined;
      const age = d.adult === true ? 18 : higher(higher(ageOfDetails(d, kind), ageOfTitle(d.title || d.name)), ageOfText(d.overview));
      this.ages.set(mangaId, age === undefined ? -1 : age);
      return age;
    } catch (e) {
      console.error('CorsFlix rating lookup failed for ' + mangaId + ': ' + (e && e.message));
      return undefined;
    }
  }

  async rate(cards, ids, votes, budgetMs, maxProbes) {
    const todo = cards
      .filter((c) => ids.has(c.mangaId) && c.ageRating !== 18 && !this.ages.has(c.mangaId))
      .sort((a, b) => (votes.get(a.mangaId) || 0) - (votes.get(b.mangaId) || 0))
      .slice(0, maxProbes);
    if (todo.length) {
      const work = pool(todo, 3, (c) => this.ageOf(c.mangaId));
      try {
        await within(budgetMs, work);
      } catch (e) {
      }
    }
    cards.forEach((c) => {
      const age = this.ages.get(c.mangaId);
      if (age !== undefined && age >= 0) c.ageRating = higher(c.ageRating, age);
    });
    return cards;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const names = await this.genres().catch(() => null);
    let data;
    let kind = 'all';
    let budget = RATE_BUDGET_BROWSE_MS;
    if (query) {
      data = await this.api(`/api/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
      budget = RATE_BUDGET_SEARCH_MS;
    } else if (included.length) {
      const tag = String(included[0].id || included[0]);
      const m = /^([mt])(\d+)$/.exec(tag);
      if (!m) return { results: [] };
      kind = m[1] === 'm' ? 'movie' : 'tv';
      data = await this.api(`/api/discover/${kind}?with_genres=${m[2]}&sort_by=popularity.desc&page=${page}`);
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      kind = feed.kind;
      data = await this.api(`${feed.path}${feed.path.indexOf('?') >= 0 ? '&' : '?'}page=${page}`);
      if (data && Array.isArray(data.results) && !data.results.length && page === 1) data = await this.api(`${feed.path}?page=1&_r=1`);
    }
    if (!data || !Array.isArray(data.results)) return { results: [] };
    const cards = [];
    const seen = new Set();
    const probe = new Set();
    const votes = new Map();
    data.results.forEach((item) => {
      const c = this.card(item, query ? 'all' : kind, names);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        cards.push(c);
        votes.set(c.mangaId, Number(item.vote_count) || 0);
        if (query || !(item.vote_count >= VOTES_KNOWN)) probe.add(c.mangaId);
      }
    });
    await this.rate(cards, probe, votes, budget, query ? MAX_PROBES_SEARCH : MAX_PROBES_FEED);
    const total = Number(data.total_pages) || 0;
    return page < Math.min(total, 500) && cards.length ? { results: cards, metadata: { page: page + 1 } } : { results: cards };
  }

  async getMangaDetails(mangaId) {
    const { kind, id } = parseId(mangaId);
    const extra = kind === 'movie' ? 'release_dates,keywords,credits' : 'content_ratings,keywords,credits,external_ids';
    const d = await this.api(`/api/${kind}/${id}?append_to_response=${extra}`);
    if (!d || !(d.title || d.name)) throw new Error('CorsFlix: title not found');
    const title = clean(kind === 'tv' ? d.name || d.title : d.title || d.name);
    const info = {
      title,
      desc: clean(d.overview),
      status: kind === 'movie' ? 'COMPLETED' : statusOfShow(d.status),
      tags: (d.genres || []).map((g) => clean(g.name)).filter(Boolean),
      webURL: `${SITES[Math.min(this.mirror, SITES.length - 1)]}/${kind === 'movie' ? 'movies' : 'tv'}/${id}`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    if (d.poster_path) info.image = posterOf(d.poster_path, 'w500');
    if (d.backdrop_path) info.banner = posterOf(d.backdrop_path, 'w780');
    const year = yearOf(kind === 'tv' ? d.first_air_date : d.release_date);
    if (year) info.releaseDate = year;
    if (d.vote_average > 0) info.rating = Math.round(d.vote_average * 10) / 10;
    const crew = (d.credits && d.credits.crew) || [];
    const makers = kind === 'movie' ? crew.filter((p) => p && p.job === 'Director').map((p) => clean(p.name)) : (d.created_by || []).map((p) => clean(p.name));
    if (makers.filter(Boolean).length) info.author = makers.filter(Boolean).join(', ');
    const cast = ((d.credits && d.credits.cast) || [])
      .slice(0, 30)
      .filter((p) => p && p.name)
      .map((p) => {
        const person = { name: clean(p.name) };
        if (p.profile_path) person.image = posterOf(p.profile_path, 'w185');
        if (clean(p.character)) person.role = clean(p.character);
        return person;
      });
    if (cast.length) info.cast = cast;
    const age = d.adult === true ? 18 : higher(higher(ageOfDetails(d, kind), ageOfTitle(title)), ageOfText(d.overview));
    if (age !== undefined) {
      info.ageRating = age;
      this.ages.set(mangaId, age);
    }
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, id } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const show = await this.api(`/api/tv/${id}`);
    if (!show) throw new Error('CorsFlix: series not found');
    const seasons = (show.seasons || []).filter((s) => s && s.season_number >= 1 && s.episode_count > 0);
    if (!seasons.length) throw new Error('CorsFlix has no episodes for this series yet');
    const today = Date.now() + 36 * 3600 * 1000;
    const lists = await pool(seasons, 3, async (s) => {
      let d = await this.api(`/api/tv/${id}/season/${s.season_number}`);
      if (!d) d = await this.api(`/api/tv/${id}/season/${s.season_number}?_r=retry`);
      if (!d || !Array.isArray(d.episodes)) throw new Error(`CorsFlix: season ${s.season_number} could not be read`);
      return { season: s.season_number, episodes: d.episodes };
    });
    const rows = [];
    lists.forEach((l) => {
      l.episodes.forEach((e) => {
        if (!e || !(e.episode_number >= 0)) return;
        const time = e.air_date ? Date.parse(e.air_date + 'T00:00:00Z') : NaN;
        if (Number.isFinite(time) && time > today) return;
        const label = clean(e.name);
        const row = {
          id: `s${l.season}e${e.episode_number}`,
          chapterId: `s${l.season}e${e.episode_number}`,
          name: label && !/^Episode \d+$/i.test(label) ? `Episode ${e.episode_number}: ${label}` : `Episode ${e.episode_number}`,
          number: e.episode_number,
          season: String(l.season),
          seasonName: `Season ${l.season}`,
        };
        if (Number.isFinite(time)) row.time = time;
        if (label && !/^Episode \d+$/i.test(label)) row.title = label;
        if (e.still_path) row.thumbnail = posterOf(e.still_path, 'w300');
        if (e.runtime > 0) row.duration = Math.round(e.runtime * 60);
        if (clean(e.overview)) row.summary = clean(e.overview);
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('CorsFlix has no aired episodes for this series yet');
    rows.sort((x, y) => Number(y.season) - Number(x.season) || y.number - x.number);
    if (new Set(rows.map((r) => r.season)).size < 2) {
      rows.forEach((r) => {
        delete r.season;
        delete r.seasonName;
      });
    }
    return rows;
  }

  async provider(name, query) {
    const url = `${SCRAPER}/api/provider?provider=${name}&${query}${name === 'citadel' ? `&cb=${Math.floor(Date.now() / 3000000)}` : ''}`;
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
    if (response.status !== 200) throw new Error(`Rive ${name}: HTTP ${response.status}`);
    let json;
    try {
      json = JSON.parse(String(response.data || ''));
    } catch (e) {
      throw new Error(`Rive ${name}: not JSON`);
    }
    if (json && json.error) throw new Error(`Rive ${name}: ${json.error}`);
    const data = json && json.data;
    const sources = data && Array.isArray(data.sources) ? data.sources.filter((s) => s && /^https?:\/\//.test(String(s.url || ''))) : [];
    if (!sources.length) throw new Error(`Rive ${name}: no stream`);
    return { sources, captions: data.captions };
  }

  citadelVideos(answer) {
    const subtitles = subtitlesOf(answer.captions);
    const picked = [];
    const seen = {};
    answer.sources.forEach((s) => {
      const { height, language } = citadelParts(s.quality);
      const key = `${language.toLowerCase()}|${height}`;
      if (seen[key]) return;
      seen[key] = true;
      picked.push({ s, height, language });
    });
    const english = picked.filter((p) => /^english$/i.test(p.language)).sort((a, b) => b.height - a.height);
    const others = [];
    const seenLanguage = {};
    picked
      .filter((p) => !/^english$/i.test(p.language))
      .sort((a, b) => b.height - a.height)
      .forEach((p) => {
        if (seenLanguage[p.language.toLowerCase()]) return;
        seenLanguage[p.language.toLowerCase()] = true;
        others.push(p);
      });
    const make = (p) => {
      const parts = [];
      if (p.height) parts.push(`${p.height}p`);
      if (p.language) parts.push(/^english$/i.test(p.language) ? 'English audio' : `${p.language} audio Dub`);
      const video = { url: p.s.url, quality: parts.join(', ') || 'Auto', type: 'hls', server: 'Citadel' };
      if (subtitles.length) {
        video.subtitles = subtitles;
        video.quality += subtitles.some((t) => t.language === 'en') ? `, Softsub: English and ${subtitles.length - 1} more` : `, Softsub: ${subtitles.length} languages`;
      }
      return video;
    };
    return { english: english.map(make), others: others.map(make) };
  }

  unwrap(url) {
    const m = /^https:\/\/cors\.corsflix\.net\/m3u8\?url=([^&]+)/.exec(String(url));
    if (!m) return String(url);
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return String(url);
    }
  }

  async getVideos(mangaId, chapterId) {
    const { kind, id } = parseId(mangaId);
    let query = `id=${id}`;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('CorsFlix: unknown episode id ' + chapterId);
      query += `&season=${ep[1]}&episode=${ep[2]}`;
    }
    const names = ['citadel', 'pulse', 'lumen'];
    const started = Date.now();
    const settled = [];
    let finished = false;
    let armed = false;
    await new Promise((resolve) => {
      const finish = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };
      let pending = names.length;
      names.forEach((name) => {
        within(HARD_MS, this.provider(name, query)).then(
          (answer) => ({ name, answer }),
          (error) => ({ name, error })
        ).then((r) => {
          if (finished) return;
          settled.push(r);
          pending--;
          if (!pending) finish();
          else if (!armed && settled.some((x) => x.name === 'pulse' && x.answer) && settled.filter((x) => x.answer).length >= 2) {
            armed = true;
            setTimeout(finish, SOFT_MS);
          }
        });
      });
      setTimeout(finish, HARD_MS);
    });
    const by = {};
    settled.forEach((r) => (by[r.name] = r));
    const videos = [];
    let citadel = { english: [], others: [] };
    if (by.citadel && by.citadel.answer) citadel = this.citadelVideos(by.citadel.answer);
    citadel.english.forEach((v) => videos.push(v));
    if (by.pulse && by.pulse.answer) {
      const answer = by.pulse.answer;
      videos.push({ url: this.unwrap(answer.sources[0].url), quality: 'Auto', type: 'hls', server: 'Pulse', headers: XPASS });
    }
    if (by.lumen && by.lumen.answer) {
      videos.push({ url: this.unwrap(by.lumen.answer.sources[0].url), quality: 'Auto', type: 'hls', server: 'Lumen' });
    }
    citadel.others.forEach((v) => videos.push(v));
    if (!videos.length) {
      const challenged = settled.find((r) => r.error && r.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      const waited = Math.round((Date.now() - started) / 1000);
      if (kind === 'tv') throw new Error(`CorsFlix has no stream for this episode yet (Rive's three servers answered nothing in ${waited} s). A new episode usually appears a few hours after it airs, so try again later.`);
      throw new Error(`CorsFlix has no stream for this title yet (Rive's three servers answered nothing in ${waited} s).`);
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
