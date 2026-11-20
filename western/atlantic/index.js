const IMG = 'https://image.tmdb.org/t/p/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ASTRA_KEY = 'cc668a8304b57864709efdfc0051a619e146c0c8b486f190a06d1c1cf96af698';

const BACKENDS = [
  { site: 'https://atlantic.bz', db: 'https://db.hls.lol/3', stream: 'https://stream.hls.lol', it: 'https://it.hls.lol', pal: 'https://pal.hls.lol', full: true },
  { site: 'https://fprime.at', db: 'https://db.insidethisplaceiswarm.cc/3', stream: 'https://serverone.insidethisplaceiswarm.cc', full: false },
];

const FEEDS = [
  { id: 'trending', name: 'Trending', path: 'trending/all/week', kind: 'all' },
  { id: 'movies-popular', name: 'Movies: Popular', path: 'movie/popular', kind: 'movie' },
  { id: 'movies-top', name: 'Movies: Top rated', path: 'movie/top_rated', kind: 'movie' },
  { id: 'movies-new', name: 'Movies: In theaters', path: 'movie/now_playing', kind: 'movie' },
  { id: 'series-popular', name: 'Series: Popular', path: 'tv/popular', kind: 'tv' },
  { id: 'series-top', name: 'Series: Top rated', path: 'tv/top_rated', kind: 'tv' },
  { id: 'series-new', name: 'Series: On the air', path: 'tv/on_the_air', kind: 'tv' },
];

const GENRES = {
  action: { label: 'Action', movie: 28, tv: 10759 },
  adventure: { label: 'Adventure', movie: 12, tv: 10759 },
  animation: { label: 'Animation', movie: 16, tv: 16 },
  comedy: { label: 'Comedy', movie: 35, tv: 35 },
  crime: { label: 'Crime', movie: 80, tv: 80 },
  documentary: { label: 'Documentary', movie: 99, tv: 99 },
  drama: { label: 'Drama', movie: 18, tv: 18 },
  family: { label: 'Family', movie: 10751, tv: 10751 },
  fantasy: { label: 'Fantasy', movie: 14, tv: 10765 },
  history: { label: 'History', movie: 36 },
  horror: { label: 'Horror', movie: 27 },
  kids: { label: 'Kids', tv: 10762 },
  music: { label: 'Music', movie: 10402 },
  mystery: { label: 'Mystery', movie: 9648, tv: 9648 },
  reality: { label: 'Reality', tv: 10764 },
  romance: { label: 'Romance', movie: 10749 },
  'sci-fi': { label: 'Sci-Fi', movie: 878, tv: 10765 },
  thriller: { label: 'Thriller', movie: 53 },
  war: { label: 'War', movie: 10752, tv: 10768 },
  western: { label: 'Western', movie: 37, tv: 37 },
};

const LANGUAGE_CODES = {
  arabic: 'ar', bulgarian: 'bg', catalan: 'ca', czech: 'cs', danish: 'da', german: 'de', greek: 'el', english: 'en', spanish: 'es', estonian: 'et', finnish: 'fi',
  french: 'fr', hebrew: 'he', croatian: 'hr', hungarian: 'hu', indonesian: 'id', icelandic: 'is', italian: 'it', japanese: 'ja', korean: 'ko', lithuanian: 'lt',
  latvian: 'lv', macedonian: 'mk', malay: 'ms', dutch: 'nl', norwegian: 'no', polish: 'pl', portuguese: 'pt', romanian: 'ro', russian: 'ru', slovak: 'sk',
  slovenian: 'sl', serbian: 'sr', swedish: 'sv', thai: 'th', turkish: 'tr', ukrainian: 'uk', chinese: 'zh', vietnamese: 'vi', hindi: 'hi',
};

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function within(ms, promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Atlantic: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: parseInt(m[2], 10) };
}

function today() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A' || c === '-') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|R18\+?|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|M|14A)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|0|6|7|10|13\+?)$/.test(c)) return 0;
  const n = parseInt(c.replace(/\D/g, ''), 10);
  if (Number.isFinite(n) && n > 0) return n >= 18 ? 18 : n >= 15 ? 16 : 0;
  return 16;
}

function certificateOf(rows, pick) {
  const list = Array.isArray(rows) ? rows : [];
  for (const country of ['US', 'GB', '']) {
    for (const row of list) {
      if (country && row.iso_3166_1 !== country) continue;
      const found = pick(row);
      if (found && ageOfCertificate(found) !== undefined) return found;
    }
  }
  return '';
}

function movieCertificate(releaseDates) {
  return certificateOf(releaseDates && releaseDates.results, (row) => {
    const dates = Array.isArray(row.release_dates) ? row.release_dates : [];
    const hit = dates.find((x) => x && x.certification);
    return hit ? hit.certification : '';
  });
}

function tvCertificate(contentRatings) {
  return certificateOf(contentRatings && contentRatings.results, (row) => row.rating);
}

function ageOf(item, certificate) {
  if (item && item.adult === true) return 18;
  const age = ageOfCertificate(certificate);
  return age === undefined ? 0 : age;
}

function openAstra(value) {
  const hex = String(value || '').replace(/^as_/, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 24 + 32 + 2) throw new Error('Astra payload too short');
  const iv = CryptoJS.enc.Hex.parse(hex.slice(0, 24) + '00000002');
  const body = CryptoJS.enc.Hex.parse(hex.slice(24, hex.length - 32));
  const out = CryptoJS.AES.decrypt({ ciphertext: body }, CryptoJS.enc.Hex.parse(ASTRA_KEY), { iv, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding });
  let text = '';
  try {
    text = out.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    text = '';
  }
  if (!/^https?:\/\//.test(text)) throw new Error('Astra payload did not decrypt');
  return text;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.good = 0;
    this.seasons = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRES).map((id) => ({ id, label: GENRES[id].label }));
  }

  mapItem(item, forcedKind) {
    if (!item || !item.id) return null;
    const kind = forcedKind || item.media_type;
    if (kind !== 'movie' && kind !== 'tv') return null;
    const title = cleanText(item.title || item.name);
    if (!title) return null;
    const id = `${kind}~${item.id}`;
    const out = { mangaId: id, title, medium: 'anime', webURL: `${this.site()}/title/${kind}/${item.id}` };
    if (item.poster_path) out.image = `${IMG}w342${item.poster_path}`;
    const age = item.adult === true ? 18 : this.ages.get(id);
    if (age !== undefined) out.ageRating = age;
    const date = String(item.release_date || item.first_air_date || '');
    if (/^\d{4}/.test(date)) out.releaseDate = date.slice(0, 4);
    return out;
  }

  site() {
    return BACKENDS[this.good].site;
  }

  async rate(results) {
    const todo = results.filter((r) => r.ageRating === undefined);
    for (let i = 0; i < todo.length; i += 10) {
      await Promise.all(
        todo.slice(i, i + 10).map(async (r) => {
          const { kind, tmdb } = parseId(r.mangaId);
          try {
            const cert = await this.tmdb(kind === 'movie' ? `movie/${tmdb}/release_dates` : `tv/${tmdb}/content_ratings`);
            const age = ageOf(null, kind === 'movie' ? movieCertificate(cert) : tvCertificate(cert));
            this.ages.set(r.mangaId, age);
            r.ageRating = age;
          } catch (e) {
            console.error('Atlantic certificate lookup failed for ' + r.mangaId + ': ' + (e && e.message));
          }
        })
      );
    }
    results.forEach((r) => {
      if (r.ageRating === 18) this.ages.set(r.mangaId, 18);
    });
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    if (page > 500) return { results: [] };
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';
    let data;
    let results = [];
    let total = 1;
    if (query) {
      data = await this.tmdb(`search/multi?query=${encodeURIComponent(query)}&include_adult=false&page=${page}`);
      results = (data.results || []).map((x) => this.mapItem(x)).filter(Boolean);
      total = Number(data.total_pages || 1);
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || null;
      if (tag) {
        const g = GENRES[tag];
        if (!g) return { results: [] };
        const kinds = feed && feed.kind !== 'all' ? [feed.kind] : ['movie', 'tv'];
        const lists = await Promise.all(
          kinds.filter((k) => g[k]).map(async (k) => {
            const d = await this.tmdb(`discover/${k}?with_genres=${g[k]}&sort_by=popularity.desc&include_adult=false&page=${page}`);
            total = Math.max(total, Number(d.total_pages || 1));
            return (d.results || []).map((x) => this.mapItem(x, k)).filter(Boolean);
          })
        );
        const n = Math.max(0, ...lists.map((l) => l.length));
        for (let i = 0; i < n; i++) lists.forEach((l) => (l[i] ? results.push(l[i]) : null));
      } else {
        const f = feed || FEEDS[0];
        data = await this.tmdb(`${f.path}?page=${page}`);
        results = (data.results || []).map((x) => this.mapItem(x, f.kind === 'all' ? undefined : f.kind)).filter(Boolean);
        total = Number(data.total_pages || 1);
      }
    }
    results = await this.rate(results);
    total = Math.min(total, 500);
    return results.length > 0 && page < total ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.tmdb(kind === 'movie' ? `movie/${tmdb}?append_to_response=credits,release_dates` : `tv/${tmdb}?append_to_response=credits,content_ratings`);
    const title = cleanText(d.title || d.name);
    if (!title) throw new Error('Atlantic: title not found');
    const status = kind === 'movie' ? 'COMPLETED' : /returning|production|planned|pilot/i.test(String(d.status || '')) ? 'ONGOING' : /ended|cancel/i.test(String(d.status || '')) ? 'COMPLETED' : 'UNKNOWN';
    const info = {
      title,
      desc: cleanText(d.overview),
      status,
      completed: status === 'COMPLETED',
      tags: (Array.isArray(d.genres) ? d.genres : []).map((g) => cleanText(g && g.name)).filter(Boolean),
      webURL: `${this.site()}/title/${kind}/${tmdb}`,
      medium: 'anime',
    };
    if (d.poster_path) info.image = `${IMG}w342${d.poster_path}`;
    if (d.backdrop_path) info.banner = `${IMG}w780${d.backdrop_path}`;
    const crew = d.credits && Array.isArray(d.credits.crew) ? d.credits.crew : [];
    let people = kind === 'movie' ? crew.filter((p) => p.job === 'Director').map((p) => cleanText(p.name)) : (Array.isArray(d.created_by) ? d.created_by : []).map((p) => cleanText(p.name));
    people = people.filter(Boolean);
    if (people.length) info.author = people.slice(0, 3).join(', ');
    const date = String(d.release_date || d.first_air_date || '');
    if (/^\d{4}/.test(date)) info.releaseDate = date.slice(0, 4);
    const cast = d.credits && Array.isArray(d.credits.cast) ? d.credits.cast.slice(0, 30) : [];
    const list = cast
      .filter((p) => p && cleanText(p.name))
      .map((p) => {
        const row = { name: cleanText(p.name) };
        if (p.profile_path) row.image = `${IMG}w185${p.profile_path}`;
        if (cleanText(p.character)) row.role = cleanText(p.character);
        return row;
      });
    if (list.length) info.cast = list;
    const age = ageOf(d, kind === 'movie' ? movieCertificate(d.release_dates) : tvCertificate(d.content_ratings));
    info.ageRating = age;
    this.ages.set(mangaId, age);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') {
      const d = await this.tmdb(`movie/${tmdb}`);
      const row = { id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 };
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d.release_date || ''));
      if (m) row.time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
      return [row];
    }
    const show = await this.tmdb(`tv/${tmdb}`);
    const seasons = (Array.isArray(show.seasons) ? show.seasons : []).map((s) => s.season_number).filter((n) => Number.isFinite(n) && n >= 1);
    if (!seasons.length) throw new Error('Atlantic has no episodes for this series yet');
    const loaded = {};
    for (let i = 0; i < seasons.length; i += 4) {
      const batch = seasons.slice(i, i + 4);
      const answers = await Promise.all(batch.map((n) => this.season(tmdb, n)));
      batch.forEach((n, at) => {
        loaded[n] = answers[at];
      });
    }
    const ended = /ended|cancel/i.test(String(show.status || ''));
    const now = today();
    const rows = [];
    seasons.forEach((season) => {
      ((loaded[season] && loaded[season].episodes) || []).forEach((ep) => {
        const air = String(ep.air_date || '');
        if (air ? air > now : !ended) return;
        const number = Number(ep.episode_number);
        if (!Number.isFinite(number)) return;
        const name = cleanText(ep.name);
        const row = { id: `s${season}e${number}`, name: name && !/^Episode \d+$/i.test(name) ? `Episode ${number}: ${name}` : `Episode ${number}`, number, season };
        if (name && !/^Episode \d+$/i.test(name)) row.title = name;
        if (ep.still_path) row.thumbnail = `${IMG}w300${ep.still_path}`;
        if (cleanText(ep.overview)) row.summary = cleanText(ep.overview);
        if (Number(ep.runtime) > 0) row.duration = Number(ep.runtime) * 60;
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(air);
        if (m) row.time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('Atlantic has no aired episodes for this series yet');
    rows.sort((x, y) => y.season - x.season || y.number - x.number);
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

  async season(tmdb, n) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.tmdb(`tv/${tmdb}/season/${n}`);
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
        await pause(300 * (attempt + 1));
      }
    }
    throw new Error(`Atlantic: season ${n} did not load (${last && last.message}), try again`);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    const { kind, tmdb } = parseId(mangaId);
    let season = 0;
    let episode = 0;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('Atlantic: unknown episode id ' + chapterId);
      season = parseInt(ep[1], 10);
      episode = parseInt(ep[2], 10);
    }
    const q = kind === 'tv' ? `tmdbId=${tmdb}&type=tv&seasonId=${season}&episodeId=${episode}` : `tmdbId=${tmdb}&type=movie`;
    const tasks = [
      ['Astra', () => this.astra(q)],
      ['Bolo', () => this.bolo(kind, tmdb, season, episode)],
      ['Vidbox', () => this.vidbox(q)],
      ['Vixsrc', () => this.vixsrc(q)],
    ];
    const skips = this.skipTimes(kind, tmdb, season, episode).catch(() => ({}));
    const answers = await Promise.all(tasks.map(([name, run]) => within(14000, run()).then((video) => ({ name, video }), (error) => ({ name, error }))));
    const found = answers.filter((a) => a.video).map((a) => a.video);
    if (!found.length) {
      const challenged = answers.find((a) => a.error && a.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      const why = answers.map((a) => `${a.name}: ${a.error && a.error.message ? a.error.message : 'no stream'}`).join('; ');
      console.error('Atlantic no stream ' + mangaId + ' ' + chapterId + ' ' + why);
      if (kind === 'tv') throw new Error('Atlantic has no stream for this episode yet. A new episode usually appears a few hours after it airs, so try again later. (' + why + ')');
      throw new Error('Atlantic has no stream for this title yet. (' + why + ')');
    }
    const skip = await skips;
    if (skip.intro || skip.outro) {
      found.forEach((v) => {
        if (skip.intro) v.intro = skip.intro;
        if (skip.outro) v.outro = skip.outro;
      });
    }
    return found;
  }

  streamHeaders(b) {
    return { Referer: `${b.site}/`, Origin: b.site };
  }

  async eachBackend(read, onlyFull) {
    let last = null;
    for (let step = 0; step < BACKENDS.length; step++) {
      const at = (this.good + step) % BACKENDS.length;
      const b = BACKENDS[at];
      if (onlyFull && !b.full) continue;
      try {
        const value = await read(b);
        if (value) {
          this.good = at;
          return value;
        }
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last || new Error('no backend answered');
  }

  async astra(q) {
    return this.eachBackend(async (b) => {
      const data = await this.jsonAt(`${b.stream}/astra?${q}`, b);
      const source = data && data.sources && (data.sources.Astra || Object.values(data.sources)[0]);
      if (!source || !source.url) throw new Error('Astra has no stream');
      const url = /^as_/.test(source.url) ? openAstra(source.url) : source.url;
      return { url, quality: 'Astra, Auto', type: 'hls', server: 'Astra', headers: this.streamHeaders(b) };
    });
  }

  async vidbox(q) {
    return this.eachBackend(async (b) => {
      const data = await this.jsonAt(`${b.stream}/vidbox?${q}`, b);
      const source = data && data.sources && (data.sources.Vidbox || Object.values(data.sources)[0]);
      if (!source || !/^https?:\/\//.test(String(source.url || ''))) throw new Error('Vidbox has no stream');
      return { url: source.url, quality: 'Vidbox, Auto', type: 'hls', server: 'Vidbox', headers: this.streamHeaders(b) };
    }, true);
  }

  async vixsrc(q) {
    return this.eachBackend(async (b) => {
      const data = await this.jsonAt(`${b.it}/resolve?${q}`, b);
      const source = data && data.found !== false && data.sources && (data.sources.Vixsrc || Object.values(data.sources)[0]);
      if (!source || !/^https?:\/\//.test(String(source.url || ''))) throw new Error('Vixsrc has no stream');
      return { url: source.url, quality: `Vixsrc, ${source.quality || 'Auto'}`, type: 'hls', server: 'Vixsrc', headers: this.streamHeaders(b) };
    }, true);
  }

  async bolo(kind, tmdb, season, episode) {
    return this.eachBackend(async (b) => {
      const data = await this.jsonAt(`${b.pal}/bandit/streams?type=${kind}&tmdb=${tmdb}${kind === 'tv' ? `&season=${season}&episode=${episode}` : ''}`, b);
      const server = (data && Array.isArray(data.servers) ? data.servers : []).find((s) => s && s.name === 'Bolo');
      const stream = server && Array.isArray(server.streams) ? server.streams.find((s) => s && /^https?:\/\//.test(String(s.url || ''))) : null;
      if (!stream) throw new Error('Bolo has no stream');
      const subtitles = [];
      (Array.isArray(stream.subtitles) ? stream.subtitles : []).forEach((t) => {
        if (!t || !/^https?:\/\//.test(String(t.url || ''))) return;
        const label = cleanText(t.label || t.lang) || 'Subtitles';
        const language = LANGUAGE_CODES[cleanText(t.lang || t.label).toLowerCase().split(' ')[0]] || label;
        subtitles.push({ url: t.url, label, language });
      });
      subtitles.sort((x, y) => (x.language === 'en' ? 0 : 1) - (y.language === 'en' ? 0 : 1));
      const english = subtitles.filter((t) => t.language === 'en').length;
      const parts = ['Bolo', 'Auto'];
      if (subtitles.length) parts.push(english ? `Softsub: English and ${subtitles.length - english} more` : `Softsub: ${subtitles.length} languages`);
      const video = { url: stream.url, quality: parts.join(', '), type: 'hls', server: 'Bolo' };
      if (subtitles.length) video.subtitles = subtitles;
      return video;
    }, true);
  }

  async skipTimes(kind, tmdb, season, episode) {
    const url = `https://api.theintrodb.org/v4/media?tmdb_id=${tmdb}${kind === 'tv' ? `&season=${season}&episode=${episode}` : ''}`;
    const data = await within(3000, this.json(url, {}));
    const range = (list) => {
      const x = (Array.isArray(list) ? list : []).find((r) => r && Number.isFinite(r.start_ms) && Number.isFinite(r.end_ms) && r.end_ms > r.start_ms);
      return x ? { start: Math.round(x.start_ms), end: Math.round(x.end_ms) } : undefined;
    };
    return { intro: range(data.intro), outro: range(data.credits) };
  }

  async tmdb(path) {
    return this.eachBackend(async (b) => {
      const data = await this.json(`${b.db}/${path}`, {});
      if (!data || typeof data !== 'object' || data.success === false) throw new Error(`TMDB route ${path} answered ${data && data.status_message}`);
      return data;
    });
  }

  async jsonAt(url, b) {
    return this.json(url, { Origin: b.site, Referer: `${b.site}/` });
  }

  async json(url, extraHeaders) {
    const text = await this.text(url, Object.assign({ Accept: 'application/json' }, extraHeaders || {}));
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Atlantic returned a page that is not data (an ISP block page, perhaps)');
    }
  }

  async text(url, extraHeaders) {
    let response = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = attempt ? `${url}${url.indexOf('?') >= 0 ? '&' : '?'}r=${attempt}` : url;
      try {
        response = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: Object.assign({ 'User-Agent': UA }, extraHeaders || {}) }));
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        if (attempt === 2) throw e;
        await pause(400);
        continue;
      }
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) break;
      if (attempt < 2) await pause(700 * (attempt + 1));
    }
    if (response.status === 404) throw new Error('Atlantic: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Atlantic: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
