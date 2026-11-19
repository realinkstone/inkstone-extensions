const SITE = 'https://beta.way2movies.live';
const API = 'https://api.way2movies.fun';
const SCRAPER = 'https://scraper.way2movies.fun';
const IMG = 'https://image.tmdb.org/t/p/';
const SITE_HEADERS = { Origin: SITE, Referer: `${SITE}/` };
const SEARCH_APIS = [
  (query, page) => `https://stream.lfmx.app/api/tmdb?path=/search/multi&language=en-US&include_adult=false&query=${encodeURIComponent(query)}&page=${page}`,
  (query, page) => `https://api.spacedom.fun/api/search/multi?query=${encodeURIComponent(query)}&page=${page}`,
];

const SERVERS = [
  { id: 74, name: 'Hearth', language: 'English' },
  { id: 42, name: 'Bastion' },
  { id: 39, name: 'Mira' },
  { id: 54, name: 'Wren' },
  { id: 38, name: 'Ferry', multiAudio: true, headers: { Referer: 'https://embed.vidrift.in/' } },
  { id: 31, name: 'Aster', type: 'mp4', headers: { Referer: 'https://netfilm.world/' } },
];
const GRACE_MS = 6000;
const QUICK_MS = 1500;

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', path: '/movie/discover' },
  { id: 'movies-trending', name: 'Movies: Trending', kind: 'movie', path: '/movie/trending' },
  { id: 'tv-popular', name: 'TV: Popular', kind: 'tv', path: '/series/discover' },
  { id: 'tv-trending', name: 'TV: Trending', kind: 'tv', path: '/series/trending' },
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

function ageOfCertificate(raw) {
  const rating = cleanText(raw).toUpperCase();
  if (!rating || rating === 'N/A' || rating === 'NR' || rating === 'UNRATED') return undefined;
  if (/^(NC-?17|X|XXX|AO|R18|18\+?)$/.test(rating)) return 18;
  if (/^(R|TV-?MA|MA|16\+?)$/.test(rating)) return 16;
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
  if (!m) throw new Error('Way2Movies: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: m[2] };
}

function pathKind(kind) {
  return kind === 'movie' ? 'movie' : 'series';
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
  const list = Array.isArray(answer.languages) ? answer.languages.filter(Boolean).map(cleanText) : [];
  const one = cleanText(answer.language) || list[0] || fallback || '';
  return { one, list };
}

function scraperMessage(status, data) {
  const code = data && data.error_code ? data.error_code : '';
  if (status === 429) return 'its stream server allows 300 calls per 15 minutes and that is used up, try again in a few minutes';
  if (status === 403) return 'its stream server refused the request (HTTP 403)';
  if (code === 'NO_MEDIA_FOUND' || status === 404) return 'no stream for this title on this server';
  if (code === 'CLIENT_RESOLVE_REQUIRED') return 'this server only works inside the website';
  if (code === 'SERVER_NOT_FOUND') return 'this server is no longer listed';
  if (status >= 500) return `the server failed (HTTP ${status})`;
  const text = data && typeof data.error === 'string' ? data.error : '';
  return text ? `${text} (HTTP ${status})` : `HTTP ${status}`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.meta = new Map();
    this.ages = new Map();
    this.blocked = null;
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
    this.blocklist();
    if (query) {
      data = await this.search(query, page);
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      kind = feed.kind;
      const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
      const tag = included.length ? GENRES.find((g) => g.id === String(included[0].id || included[0])) : null;
      if (tag) {
        const genre = tag[kind];
        if (!genre || page > 1) return { results: [] };
        data = await this.list(`${API}/${pathKind(kind)}/genre/${genre}`);
        return { results: await this.cards(data, kind) };
      }
      if (page > 500) return { results: [] };
      data = await this.list(`${API}${feed.path}?page=${page}`);
    }
    const results = await this.cards(data, kind);
    const total = Math.min(Number(data.total_pages) || 1, 500);
    return page < total && (data.results || []).length ? { results, metadata: { page: page + 1 } } : { results };
  }

  async cards(data, kind) {
    const blocked = await this.blocklist();
    const results = [];
    const seen = new Set();
    (data.results || []).forEach((item) => {
      const c = card(item, kind || undefined);
      if (!c || seen.has(c.mangaId)) return;
      const t = parseId(c.mangaId);
      if (blocked[t.kind] && blocked[t.kind].has(Number(t.tmdb))) return;
      seen.add(c.mangaId);
      results.push(c);
    });
    await this.rate(results);
    return results;
  }

  async rate(results) {
    for (let i = 0; i < results.length; i += 10) {
      const batch = results.slice(i, i + 10);
      const ages = await Promise.all(batch.map((r) => this.certificate(r.mangaId)));
      batch.forEach((r, at) => {
        if (ages[at] !== undefined && ages[at] > r.ageRating) r.ageRating = ages[at];
      });
    }
  }

  async certificate(mangaId) {
    if (this.ages.has(mangaId)) return this.ages.get(mangaId);
    const { kind, tmdb } = parseId(mangaId);
    let age;
    try {
      const data = await this.json(`${API}/${pathKind(kind)}/${tmdb}/certification`);
      age = ageOfCertificate(data && data.rating);
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      age = undefined;
    }
    this.ages.set(mangaId, age);
    return age;
  }

  blocklist() {
    if (!this.blocked) {
      this.blocked = this.json(`${API}/blocklist`).then(
        (data) => ({ movie: new Set((data.movie || []).map(Number)), tv: new Set((data.tv || []).map(Number)) }),
        (e) => {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
          return { movie: new Set(), tv: new Set() };
        }
      );
    }
    return this.blocked;
  }

  async search(query, page) {
    let last = null;
    for (const build of SEARCH_APIS) {
      try {
        const data = await this.json(build(query, page));
        if (data && Array.isArray(data.results)) return data;
        last = new Error('Way2Movies: the search proxy answered something that is not a TMDB list');
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw new Error(`Way2Movies: search is not available right now (${last && last.message ? last.message : 'no answer'})`);
  }

  async list(url) {
    let data = await this.json(url);
    if (!(data.results || []).length && !/[?&]page=([2-9]|\d\d)/.test(url)) data = await this.json(url + (url.includes('?') ? '&' : '?') + 'r=1');
    return data;
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.details(kind, tmdb);
    const title = cleanText(d.title || d.name);
    if (!title) throw new Error('Way2Movies: title not found');
    const info = {
      title,
      image: posterOf(d.poster_path, 'w500'),
      desc: cleanText(d.overview),
      status: kind === 'movie' ? 'COMPLETED' : /ended|cancel/i.test(d.status || '') ? 'COMPLETED' : 'ONGOING',
      tags: (d.genres || []).map((g) => cleanText(g.name)).filter(Boolean),
      medium: 'anime',
      ageRating: Math.max(ageOf(d), (await this.certificate(mangaId)) || 0),
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
    if (!seasons.length) throw new Error('Way2Movies has no episodes for this show yet');
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < seasons.length; i += 3) {
      const group = seasons.slice(i, i + 3);
      const loaded = await Promise.all(group.map((n) => this.json(`${API}/series/${tmdb}/season/${n}`).then((s) => ({ n, s }))));
      loaded.forEach(({ n, s }) => {
        (s.episodes || []).forEach((e) => {
          const air = e.air_date ? Date.parse(e.air_date + 'T00:00:00Z') : NaN;
          if (Number.isFinite(air) && air > now + 86400000) return;
          const num = Number(e.episode_number);
          if (!Number.isFinite(num)) return;
          rows.push({ season: n, number: num, name: cleanText(e.name), time: Number.isFinite(air) ? air : undefined, still: e.still_path, runtime: e.runtime, summary: cleanText(e.overview) });
        });
      });
    }
    if (!rows.length) throw new Error('Way2Movies has no aired episodes for this show yet');
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
    let tail = `/${kind}/${tmdb}`;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('Way2Movies: unknown episode id ' + chapterId);
      tail += `/${Number(ep[1])}/${Number(ep[2])}`;
    }

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
            if (videos.length === 3) {
              clearTimeout(timer);
              timer = setTimeout(resolve, QUICK_MS);
            }
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
      const limited = problems.find((e) => e && e.limited);
      if (limited) throw new Error(`Way2Movies: ${limited.message}`);
      const messages = problems.map((e) => (e && e.message ? e.message : String(e))).filter((m, i, a) => a.indexOf(m) === i);
      throw new Error(`Way2Movies has no stream for this title yet (${messages.slice(0, 3).join('; ') || 'no server answered'})`);
    }
    videos.sort((a, b) => Number(b.video.english) - Number(a.video.english) || a.order - b.order);
    return videos.map((v) => {
      const out = Object.assign({}, v.video);
      delete out.english;
      return out;
    });
  }

  async server(server, tail) {
    const url = `${SCRAPER}/server/${server.id}${tail}`;
    let answer = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        answer = await this.scrape(attempt ? `${url}?r=1` : url);
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt === 0 && !(e && e.limited)) continue;
        throw e;
      }
      if (answer.status < 500) break;
    }
    const data = answer.data;
    if (answer.status !== 200 || !data || !Array.isArray(data.media_urls) || !data.media_urls.length) {
      const error = new Error(`${server.name}: ${scraperMessage(answer.status, data)}`);
      if (answer.status === 429) error.limited = true;
      throw error;
    }
    const { one, list } = languageOf(data, server.language);
    if (server.type === 'mp4' && !/^original audio$/i.test(cleanText(data.language))) throw new Error(`${server.name}: no original audio file for this title`);
    const subtitles = [];
    (data.subtitles || []).forEach((s) => {
      if (s && /^https?:\/\//i.test(s.url || '')) subtitles.push({ url: s.url, label: cleanText(s.label).replace(/\s*[·|]\s*\w+$/, '') || 'Subtitles', language: cleanText(s.language) || 'en' });
    });
    const stream = String(data.media_urls[0]);
    const height = /\/(\d{3,4})\/index/.exec(stream);
    const parts = [server.name];
    parts.push(server.type === 'mp4' ? 'MP4' : /master\.m3u8/.test(stream) || !height ? 'Auto' : `${height[1]}p`);
    if (one) parts.push(/^original audio$/i.test(one) ? 'Original audio' : `${one} audio`);
    const others = server.multiAudio ? list.filter((l) => l !== one) : [];
    if (others.length) parts.push(others.length <= 2 ? `also ${others.join(', ')}` : `also ${others.slice(0, 2).join(', ')} and ${others.length - 2} more`);
    if (subtitles.length) {
      const names = subtitles.map((x) => x.label);
      parts.push(names.length <= 2 ? `Softsub: ${names.join(', ')}` : names.some((n) => /^english/i.test(n)) ? `Softsub: English and ${names.length - 1} more` : `Softsub: ${names.length} tracks`);
    }
    const video = { url: stream, quality: parts.join(', '), type: server.type || 'hls', server: server.name };
    if (server.headers) video.headers = server.headers;
    if (subtitles.length) video.subtitles = subtitles;
    const lower = (one || '').toLowerCase();
    video.english = !lower || lower === 'english' || lower === 'original' || lower === 'original audio';
    return video;
  }

  async details(kind, tmdb) {
    const key = `${kind}:${tmdb}`;
    if (this.meta.has(key)) return this.meta.get(key);
    const d = await this.json(`${API}/${pathKind(kind)}/${tmdb}/details`);
    if (!d || (!d.title && !d.name)) throw new Error('Way2Movies: title not found');
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

  async scrape(url) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ Accept: 'application/json' }, SITE_HEADERS) });
    let data = null;
    try {
      data = JSON.parse(String(response.data || ''));
    } catch (e) {
      data = null;
    }
    if (response.status === 429) {
      const error = new Error(scraperMessage(429, data));
      error.limited = true;
      throw error;
    }
    return { status: response.status, data };
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
    if (response.status === 404) throw new Error('Way2Movies: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) {
      const message = data && typeof data.error === 'string' ? data.error : data && data.message ? data.message : '';
      throw new Error(`Way2Movies: HTTP ${response.status}${message ? ' ' + message : ''}`);
    }
    if (data === null) throw new Error('Way2Movies: the API answered something that is not JSON');
    return data;
  }
}

module.exports = { Source };
