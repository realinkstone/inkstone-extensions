const SITES = [
  'https://ghostflix.st',
  'https://redflix.st',
  'https://redflix.ac',
  'https://redflix.club',
];
const SITE_ICON = 'https://ghostflix.st/brand/ghostflix-g-192.png';
const BOLT = 'https://vidbolt.st';
const BOLT_HEADERS = { Referer: 'https://vidbolt.st/', Origin: 'https://vidbolt.st' };
const IMG = 'https://image.tmdb.org/t/p/';
const SERVER_LIMIT_MS = 15000;
const PROBE_MS = 4000;

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', path: '/discover/movie', query: 'sort_by=popularity.desc&vote_count.gte=100', kind: 'movie' },
  { id: 'series-popular', name: 'Series: Popular', path: '/discover/tv', query: 'sort_by=popularity.desc&vote_count.gte=100', kind: 'tv' },
  { id: 'movies-theaters', name: 'Movies: In theaters', path: '/movie/now_playing', query: '', kind: 'movie' },
  { id: 'trending', name: 'Trending', path: '/trending/all/day', kind: '' },
  { id: 'series-rated', name: 'Series: Top rated', path: '/tv/top_rated', query: '', kind: 'tv' },
  { id: 'movies-rated', name: 'Movies: Top rated', path: '/movie/top_rated', query: '', kind: 'movie' },
  { id: 'series-airing', name: 'Series: On the air', path: '/tv/on_the_air', query: '', kind: 'tv' },
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
  music: { label: 'Music', movie: 10402 },
  mystery: { label: 'Mystery', movie: 9648, tv: 9648 },
  romance: { label: 'Romance', movie: 10749 },
  'sci-fi': { label: 'Sci-Fi', movie: 878, tv: 10765 },
  thriller: { label: 'Thriller', movie: 53 },
  war: { label: 'War', movie: 10752, tv: 10768 },
  western: { label: 'Western', movie: 37, tv: 37 },
};

const SUBTITLE_CODES = {
  English: 'en', 'Français': 'fr', 'Português': 'pt', 'Русский': 'ru', 'हिन्दी': 'hi', Indonesian: 'id', Malay: 'ms', Filipino: 'fil', Kiswahili: 'sw', '中文': 'zh',
  'Українська': 'uk', 'বাংলা': 'bn', 'ਪੰਜਾਬੀ': 'pa', Spanish: 'es', 'Español': 'es', Deutsch: 'de', Italiano: 'it', 'اَلْعَرَبِيَّةُ': 'ar', 'اُردُو': 'ur',
};
const AUDIO_NAMES = { Ukr: 'Ukrainian', Ptbr: 'Portuguese (Brazil)', Esla: 'Spanish (Latin America)' };
const LANGUAGE_NAMES = {
  en: 'English', ko: 'Korean', ja: 'Japanese', hi: 'Hindi', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese',
  cn: 'Chinese', ar: 'Arabic', tr: 'Turkish', th: 'Thai', id: 'Indonesian', pl: 'Polish', nl: 'Dutch', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish',
  uk: 'Ukrainian', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', bn: 'Bengali', fa: 'Persian', he: 'Hebrew', el: 'Greek', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian',
  vi: 'Vietnamese', tl: 'Filipino', ms: 'Malay', ur: 'Urdu', pa: 'Punjabi', mr: 'Marathi', kn: 'Kannada',
};

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Ghostflix: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: parseInt(m[2], 10) };
}

function today() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
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

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c) return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18\+?|18\+?|18A|ADULT|19\+?)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|M)$/.test(c)) return 16;
  if (/^(NR|UNRATED|NOTRATED|N\/A|NOT RATED)$/.test(c)) return undefined;
  const n = parseInt(c.replace(/[^0-9]/g, ''), 10);
  if (Number.isFinite(n) && /^\d/.test(c)) return n >= 18 ? 18 : n >= 15 ? 16 : 0;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|14A)$/.test(c)) return 0;
  return undefined;
}

function certificateAge(kind, block) {
  const rows = block && Array.isArray(block.results) ? block.results : [];
  const read = (row) => {
    if (!row) return undefined;
    if (kind === 'movie') {
      const dates = Array.isArray(row.release_dates) ? row.release_dates : [];
      for (let i = 0; i < dates.length; i++) {
        const age = ageOfCertificate(dates[i] && dates[i].certification);
        if (age !== undefined) return age;
      }
      return undefined;
    }
    return ageOfCertificate(row.rating);
  };
  const order = ['US', 'GB', 'DE'];
  for (let i = 0; i < order.length; i++) {
    const age = read(rows.find((r) => r && r.iso_3166_1 === order[i]));
    if (age !== undefined) return age;
  }
  let high;
  for (let i = 0; i < rows.length; i++) {
    const age = read(rows[i]);
    if (age !== undefined && (high === undefined || age > high)) high = age;
  }
  return high;
}

function imageUrl(path, size) {
  const p = cleanText(path);
  return p ? `${IMG}${size}${p.charAt(0) === '/' ? '' : '/'}${p}` : '';
}

function coverUrl(item, size) {
  return imageUrl(item && item.poster_path, size) || imageUrl(item && item.backdrop_path, 'w500') || SITE_ICON;
}

function subtitleFormat(url) {
  const m = /\.(srt|vtt)(?:[?#]|$)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : undefined;
}

function describeMaster(master) {
  const text = String(master || '');
  let audio = '';
  let subs = 0;
  text.split('\n').forEach((line) => {
    if (line.indexOf('#EXT-X-MEDIA:') !== 0) return;
    if (/TYPE=AUDIO/.test(line) && /DEFAULT=YES/.test(line) && !audio) {
      const n = /NAME="([^"]*)"/.exec(line);
      audio = n ? cleanText(n[1]).replace(/^(\[\d+\]|\d+\.)\s*/, '') : '';
    } else if (/TYPE=SUBTITLES/.test(line)) subs++;
  });
  return { audio, subs };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.site = 0;
    this.ages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRES).map((id) => ({ id, label: GENRES[id].label }));
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

  async tmdb(path) {
    const glue = path.indexOf('?') >= 0 ? '&' : '?';
    let last = null;
    for (let n = 0; n < SITES.length; n++) {
      const at = (this.site + n) % SITES.length;
      const url = `${SITES[at]}/api/tmdb${path}${glue}api_key=&language=en-US`;
      let response = null;
      try {
        response = await this.send({ url, method: 'GET', headers: { Accept: 'application/json' } });
        if (response.status === 429) {
          await pause(800);
          response = await this.send({ url: `${url}&r=1`, method: 'GET', headers: { Accept: 'application/json' } });
        }
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
        continue;
      }
      let data = null;
      try {
        data = JSON.parse(String(response.data || ''));
      } catch (e) {
        data = null;
      }
      if (response.status >= 200 && response.status < 300 && data && typeof data === 'object') {
        this.site = at;
        return data;
      }
      if ((response.status === 404 || response.status === 400) && data && typeof data === 'object') {
        this.site = at;
        return { __status: response.status, __body: data };
      }
      last = new Error(`HTTP ${response.status} from ${SITES[at].replace('https://', '')}`);
    }
    throw new Error(`Ghostflix: no mirror answered (${last && last.message})`);
  }

  mapItem(item, kind) {
    if (!item || !item.id) return null;
    const type = item.media_type || kind;
    if (type !== 'movie' && type !== 'tv') return null;
    const title = cleanText(type === 'tv' ? item.name || item.title : item.title || item.name);
    if (!title) return null;
    const date = String(type === 'tv' ? item.first_air_date : item.release_date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > today()) return null;
    const id = `${type}~${item.id}`;
    const out = { mangaId: id, title, image: coverUrl(item, 'w342'), webURL: `${SITES[0]}/${type}/${item.id}`, medium: 'anime' };
    if (item.adult === true || item.softcore === true) out.ageRating = 18;
    else if (this.ages.has(id)) out.ageRating = this.ages.get(id);
    if (typeof item.vote_average === 'number' && item.vote_average > 0) out.rating = Math.round(item.vote_average * 10) / 10;
    if (/^\d{4}/.test(date)) out.releaseDate = date.slice(0, 4);
    return out;
  }

  async ageOf(id) {
    if (this.ages.has(id)) return this.ages.get(id);
    try {
      const { kind, tmdb } = parseId(id);
      const d = await this.tmdb(kind === 'movie' ? `/movie/${tmdb}/release_dates` : `/tv/${tmdb}/content_ratings`);
      if (d.__status) return undefined;
      const age = certificateAge(kind, d);
      const final = age === undefined ? 0 : age;
      this.ages.set(id, final);
      return final;
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      console.error('Ghostflix certificate lookup failed for ' + id + ': ' + (e && e.message));
      return undefined;
    }
  }

  async rate(results) {
    const todo = results.filter((r) => r.ageRating === undefined);
    for (let i = 0; i < todo.length; i += 10) {
      const batch = todo.slice(i, i + 10);
      const ages = await Promise.all(batch.map((r) => this.ageOf(r.mangaId)));
      batch.forEach((r, at) => {
        if (ages[at] !== undefined) r.ageRating = ages[at];
      });
    }
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';
    let lists = [];
    if (query) {
      const d = await this.tmdb(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false&page=${page}`);
      lists.push({ data: d, kind: '' });
    } else if (tag) {
      const genre = GENRES[tag];
      if (!genre) return { results: [] };
      const kinds = ['movie', 'tv'].filter((k) => genre[k]);
      const answers = await Promise.all(kinds.map((k) => this.tmdb(`/discover/${k}?with_genres=${genre[k]}&sort_by=popularity.desc&vote_count.gte=50&include_adult=false&page=${page}`)));
      kinds.forEach((k, at) => lists.push({ data: answers[at], kind: k }));
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      const d = await this.tmdb(`${feed.path}?${feed.query ? feed.query + '&' : ''}include_adult=false&page=${page}`);
      lists.push({ data: d, kind: feed.kind });
    }
    let results = [];
    const mapped = lists.map((l) => ((l.data && !l.data.__status && Array.isArray(l.data.results) ? l.data.results : []).map((x) => this.mapItem(x, l.kind)).filter(Boolean)));
    for (let i = 0; mapped.some((m) => i < m.length); i++) mapped.forEach((m) => i < m.length && results.push(m[i]));
    results = await this.rate(results);
    const total = lists.reduce((max, l) => Math.max(max, Number(l.data && l.data.total_pages) || 1), 1);
    const last = Math.min(total, 500);
    return results.length > 0 && page < last ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.tmdb(kind === 'movie' ? `/movie/${tmdb}?append_to_response=release_dates,credits` : `/tv/${tmdb}?append_to_response=content_ratings,credits`);
    if (d.__status) throw new Error('Ghostflix: title not found');
    const title = cleanText(kind === 'tv' ? d.name || d.title : d.title || d.name);
    if (!title) throw new Error('Ghostflix: title not found');
    const status = kind === 'movie' ? 'COMPLETED' : /returning|production|planned|pilot/i.test(String(d.status || '')) ? 'ONGOING' : /ended|cancel/i.test(String(d.status || '')) ? 'COMPLETED' : 'UNKNOWN';
    const info = {
      title,
      image: coverUrl(d, 'w500'),
      desc: cleanText(d.overview),
      status,
      completed: status === 'COMPLETED',
      tags: (Array.isArray(d.genres) ? d.genres : []).map((g) => cleanText(g && g.name)).filter(Boolean),
      webURL: `${SITES[0]}/${kind}/${tmdb}`,
      medium: 'anime',
    };
    const banner = imageUrl(d.backdrop_path, 'w780');
    if (banner) info.banner = banner;
    const credits = d.credits || {};
    const people =
      kind === 'tv'
        ? (Array.isArray(d.created_by) ? d.created_by : []).map((p) => cleanText(p && p.name)).filter(Boolean)
        : (Array.isArray(credits.crew) ? credits.crew : []).filter((p) => p && p.job === 'Director').map((p) => cleanText(p.name)).filter(Boolean);
    if (people.length) info.author = people.slice(0, 3).join(', ');
    const cast = (Array.isArray(credits.cast) ? credits.cast : [])
      .slice(0, 30)
      .map((p) => {
        const person = { name: cleanText(p && p.name) };
        const photo = imageUrl(p && p.profile_path, 'w185');
        if (photo) person.image = photo;
        if (cleanText(p && p.character)) person.role = cleanText(p.character);
        return person;
      })
      .filter((p) => p.name);
    if (cast.length) info.cast = cast;
    const date = String(kind === 'tv' ? d.first_air_date : d.release_date || '');
    if (/^\d{4}/.test(date)) info.releaseDate = date.slice(0, 4);
    if (typeof d.vote_average === 'number' && d.vote_average > 0) info.rating = Math.round(d.vote_average * 10) / 10;
    const age = d.adult === true || d.softcore === true ? 18 : certificateAge(kind, kind === 'movie' ? d.release_dates : d.content_ratings);
    const final = age === undefined ? 0 : age;
    info.ageRating = final;
    this.ages.set(mangaId, final);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const show = await this.tmdb(`/tv/${tmdb}`);
    if (show.__status) throw new Error('Ghostflix: series not found');
    const seasons = (Array.isArray(show.seasons) ? show.seasons : []).map((s) => s && s.season_number).filter((n) => Number.isFinite(n) && n >= 1);
    if (!seasons.length) throw new Error('Ghostflix has no episodes for this series yet');
    const loaded = {};
    for (let i = 0; i < seasons.length; i += 3) {
      const batch = seasons.slice(i, i + 3);
      const answers = await Promise.all(batch.map((n) => this.season(tmdb, n)));
      batch.forEach((n, at) => {
        loaded[n] = answers[at];
      });
    }
    const rows = [];
    const now = today();
    seasons.forEach((season) => {
      const episodes = (loaded[season] && Array.isArray(loaded[season].episodes) ? loaded[season].episodes : []);
      episodes.forEach((ep) => {
        const air = String(ep.air_date || '');
        if (air && air > now) return;
        const number = Number(ep.episode_number);
        if (!Number.isFinite(number)) return;
        const name = cleanText(ep.name);
        const row = { id: `s${season}e${number}`, name: name ? `Episode ${number}: ${name}` : `Episode ${number}`, number, season };
        if (name) row.title = name;
        const still = imageUrl(ep.still_path, 'w300');
        if (still) row.thumbnail = still;
        if (cleanText(ep.overview)) row.summary = cleanText(ep.overview);
        if (Number(ep.runtime) > 0) row.duration = Math.round(Number(ep.runtime) * 60);
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(air);
        if (m) row.time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('Ghostflix has no aired episodes for this series yet');
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
        const d = await this.tmdb(`/tv/${tmdb}/season/${n}${attempt ? `?r=${attempt}` : ''}`);
        if (d.__status) return { episodes: [] };
        return d;
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw new Error(`Ghostflix: season ${n} did not load (${last && last.message}), try again`);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    const { kind, tmdb } = parseId(mangaId);
    let query = `type=${kind}&id=${tmdb}`;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('Ghostflix: unknown episode id ' + chapterId);
      query += `&season=${ep[1]}&episode=${ep[2]}`;
    }
    const names = ['orion', 'callisto', 'luna'];
    const original = this.tmdb(kind === 'movie' ? `/movie/${tmdb}` : `/tv/${tmdb}`).then(
      (d) => (d && !d.__status && d.original_language ? String(d.original_language).toLowerCase() : ''),
      () => ''
    );
    const tasks = names.map((name) =>
      within(SERVER_LIMIT_MS, this.resolve(query, name))
        .then(async (stream) => {
          let list = [];
          if (stream && name === 'orion') list = stream.sources.map((s) => ({ video: this.orionVideo(s), probe: this.orionProbe(s), rank: 0 }));
          else if (stream && name === 'callisto') {
            const originalName = LANGUAGE_NAMES[await original] || '';
            list = this.callistoVideos(stream, originalName).map((c) => ({ video: c.video, probe: { url: c.video.url }, rank: c.rank }));
          } else if (stream) list = stream.sources.map((s) => ({ video: this.lunaVideo(s), probe: null, rank: 0 }));
          await Promise.all(
            list.map(async (e) => {
              e.alive = e.probe ? await this.alive(e.probe.url, e.probe.headers) : true;
            })
          );
          return { name, list };
        })
        .catch((error) => ({ name, error, list: [] }))
    );
    const answers = await Promise.all(tasks);
    const byName = {};
    answers.forEach((a) => {
      byName[a.name] = a.list;
    });
    const build = (ok) => {
      const keep = (list) => list.filter((e) => !ok || e.alive);
      const out = [];
      keep(byName.orion).forEach((e) => out.push(e.video));
      keep(byName.callisto).filter((e) => e.rank === 0).forEach((e) => out.push(e.video));
      keep(byName.luna).forEach((e) => out.push(e.video));
      keep(byName.callisto).filter((e) => e.rank !== 0).forEach((e) => out.push(e.video));
      return out;
    };
    let videos = build(true);
    if (!videos.length) videos = build(false);
    if (!videos.length) {
      const challenged = answers.find((a) => a.error && a.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      if (kind === 'tv') throw new Error('Ghostflix has no stream for this episode. A brand new episode can take a few hours to appear, so try again later.');
      throw new Error('Ghostflix has no stream for this title yet');
    }
    return videos;
  }

  async resolve(query, server) {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await this.send({ url: `${BOLT}/api/resolve?${query}&only=${server}${attempt ? `&r=${attempt}` : ''}`, method: 'GET', headers: { Accept: 'application/json' } });
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) break;
      await pause(600);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`vidbolt HTTP ${response.status}`);
    let data = null;
    try {
      data = JSON.parse(String(response.data || ''));
    } catch (e) {
      throw new Error('vidbolt answered something that is not data');
    }
    const stream = data && data.stream;
    if (!stream || !Array.isArray(stream.sources)) return null;
    const sources = stream.sources.filter((s) => s && /^https?:\/\//.test(String(s.url || '')));
    return sources.length ? { sources, subtitles: stream.subtitles } : null;
  }

  subtitlesOf(list) {
    const out = [];
    const seen = {};
    (Array.isArray(list) ? list : []).forEach((t) => {
      if (!t || !/^https?:\/\//.test(String(t.url || ''))) return;
      const label = cleanText(t.label || t.lang) || 'Subtitles';
      if (seen[label]) return;
      seen[label] = true;
      const entry = { url: t.url, label, language: SUBTITLE_CODES[label] || SUBTITLE_CODES[cleanText(t.lang)] || label };
      const format = subtitleFormat(t.url);
      if (format) entry.format = format;
      out.push(entry);
    });
    return out;
  }

  subtitleNote(subtitles) {
    if (!subtitles.length) return '';
    const english = subtitles.some((t) => t.language === 'en');
    return subtitles.length <= 3 ? 'Softsub: ' + subtitles.map((t) => t.label).join(', ') : english ? `Softsub: English and ${subtitles.length - 1} more` : `Softsub: ${subtitles.length} languages`;
  }

  async alive(url, headers) {
    try {
      const response = await within(PROBE_MS, this.send({ url, method: 'GET', headers: Object.assign({ Accept: '*/*' }, headers || {}) }));
      return response.status >= 200 && response.status < 300 && /^\s*#EXTM3U/.test(String(response.data || '').slice(0, 64));
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      return false;
    }
  }

  orionProbe(source) {
    const lines = String(source.master || '').split('\n');
    const audio = lines.filter((l) => l.indexOf('#EXT-X-MEDIA:') === 0 && /TYPE=AUDIO/.test(l) && /URI="/.test(l));
    const line = audio.find((l) => /DEFAULT=YES/.test(l)) || audio[0];
    if (!line) return null;
    const uri = /URI="([^"]+)"/.exec(line)[1];
    const url = /^https?:\/\//.test(uri) ? uri : source.url.split('?')[0].replace(/[^/]*$/, '') + uri;
    return { url, headers: Object.assign({}, BOLT_HEADERS) };
  }

  orionVideo(source) {
    const info = describeMaster(source.master);
    const parts = [];
    parts.push(info.audio ? `${info.audio} audio` : 'English audio');
    parts.push('Auto');
    if (info.subs) parts.push(info.subs <= 3 ? `${info.subs} subtitle tracks` : `Softsub: ${info.subs} languages`);
    return { url: source.url, quality: parts.join(', '), type: 'hls', server: 'Orion', headers: Object.assign({}, BOLT_HEADERS) };
  }

  lunaVideo(source) {
    const info = describeMaster(source.master);
    return { url: source.url, quality: [info.audio ? `${info.audio} audio` : 'English audio', cleanText(source.quality) || 'Auto'].join(', '), type: 'hls', server: 'Luna' };
  }

  callistoVideos(stream, originalName) {
    const subtitles = this.subtitlesOf(stream.subtitles);
    const height = (s) => parseInt(String(s.quality || '').replace(/\D/g, ''), 10) || 0;
    const kept = [];
    const counts = {};
    const caps = [4, 2, 1, 1];
    stream.sources
      .slice()
      .sort((x, y) => height(y) - height(x))
      .forEach((source) => {
        const info = this.callistoKind(source, originalName);
        if (!info) return;
        const key = info.rank + ':' + info.name;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > caps[info.rank]) return;
        kept.push({ rank: info.rank, video: this.callistoVideo(source, info.label, subtitles) });
      });
    return kept.sort((a, b) => a.rank - b.rank);
  }

  callistoKind(source, originalName) {
    const lang = cleanText(source.language);
    const hard = /^(.*?)\s+sub$/i.exec(lang);
    const plain = hard ? AUDIO_NAMES[hard[1]] || hard[1] : AUDIO_NAMES[lang] || lang;
    if (hard) {
      if (!/^english$/i.test(plain)) return null;
      return { rank: 2, name: plain, label: 'Original audio, Hardsub English' };
    }
    if (!lang || /^english$/i.test(lang)) return { rank: 0, name: 'English', label: 'English audio' };
    if (/^original$/i.test(lang)) return { rank: 1, name: 'Original', label: originalName ? `Original audio (${originalName})` : 'Original audio' };
    if (originalName && plain.toLowerCase() === originalName.toLowerCase()) return { rank: 1, name: 'Original', label: `Original audio (${plain})` };
    return { rank: 3, name: plain, label: `${plain} audio Dub` };
  }

  callistoVideo(source, label, subtitles) {
    const parts = [label];
    if (cleanText(source.quality)) parts.push(cleanText(source.quality));
    const note = this.subtitleNote(subtitles);
    if (note) parts.push(note);
    const video = { url: source.url, quality: parts.join(', '), type: 'hls', server: 'Callisto' };
    if (subtitles.length) video.subtitles = subtitles;
    return video;
  }
}

module.exports = { Source };
