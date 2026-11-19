const SITE = 'https://moanatv.lfmx.app';
const API = 'https://stream.lfmx.app/api';
const IMG = 'https://image.tmdb.org/t/p/';
const SITE_HEADERS = { Origin: SITE, Referer: `${SITE}/` };
const GRACE_MS = 4000;
const QUICK_MS = 1500;
const SKIP_SERVERS = ['XbNlZQ', '2Ap3RH', 'Xhya9t', 'ufebLW', 'drgYQh', 'KNQkyN', '2RAHBL', 'i7My6U', '0ROiNP', 'wmbOJV', 'vyE84U', 'L2XXTD'];
const SKIP_FAMILIES = /^https:\/\/(anigato\.lol\/api\/stream\/proxy|relay\.lfmx\.app\/|stream\.lfmx\.app\/api\/v\/p\/)/;

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', path: '/movie/popular' },
  { id: 'movies-trending', name: 'Movies: Trending', kind: 'movie', path: '/trending/movie/week' },
  { id: 'movies-rated', name: 'Movies: Top rated', kind: 'movie', path: '/movie/top_rated' },
  { id: 'movies-now', name: 'Movies: Now playing', kind: 'movie', path: '/movie/now_playing' },
  { id: 'tv-popular', name: 'TV: Popular', kind: 'tv', path: '/tv/popular' },
  { id: 'tv-trending', name: 'TV: Trending', kind: 'tv', path: '/trending/tv/week' },
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

function ageOfCertificate(raw) {
  const rating = cleanText(raw).toUpperCase();
  if (!rating || rating === 'N/A' || rating === 'NR' || rating === 'UNRATED') return undefined;
  if (/^(NC-?17|X|XXX|AO|R18|18\+?)$/.test(rating)) return 18;
  if (/^(R|TV-?MA|MA|16\+?)$/.test(rating)) return 16;
  return 0;
}

function certificateOf(d, kind) {
  try {
    if (kind === 'movie') {
      const us = ((d.release_dates && d.release_dates.results) || []).find((r) => r.iso_3166_1 === 'US');
      const hit = us && (us.release_dates || []).find((r) => cleanText(r.certification));
      return hit ? ageOfCertificate(hit.certification) : undefined;
    }
    const us = ((d.content_ratings && d.content_ratings.results) || []).find((r) => r.iso_3166_1 === 'US');
    return us ? ageOfCertificate(us.rating) : undefined;
  } catch (e) {
    return undefined;
  }
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
  if (!m) throw new Error('moanatv: unknown title id ' + mangaId);
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

function familyOf(url) {
  const m = /^https?:\/\/([^\/?#:]+)/i.exec(String(url || ''));
  const host = m ? m[1].toLowerCase() : '';
  if (/(^|\.)lfmx\.app$/.test(host)) return 'Relay';
  if (/(^|\.)anigato\.lol$/.test(host)) return 'Anigato';
  if (/(^|\.)kaembed\.net$/.test(host)) return 'KaEmbed';
  if (/(^|\.)cookiebakers\d*blog\.xyz$/.test(host)) return 'Cookiebakers';
  return host || 'Unknown';
}

function softsubLabel(names) {
  if (!names.length) return '';
  if (names.length <= 2) return `Softsub: ${names.join(', ')}`;
  return names.some((n) => /^english/i.test(n)) ? `Softsub: English and ${names.length - 1} more` : `Softsub: ${names.length} tracks`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.meta = new Map();
    this.ages = new Map();
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
    if (page > 500) return { results: [] };
    let data;
    let kind = '';
    if (query) {
      data = await this.tmdb('/search/multi', { query, page, include_adult: 'false' });
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      kind = feed.kind;
      const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
      const tag = included.length ? GENRES.find((g) => g.id === String(included[0].id || included[0])) : null;
      if (tag) {
        const genre = tag[kind];
        if (!genre) return { results: [] };
        data = await this.tmdb(`/discover/${kind}`, { with_genres: genre, sort_by: 'popularity.desc', page });
      } else {
        data = await this.tmdb(feed.path, { page });
        if (!(data.results || []).length && page === 1) data = await this.tmdb(feed.path, { page, r: 1 });
      }
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
    if (query) await this.rate(results);
    const total = Math.min(Number(data.total_pages) || 1, 500);
    return page < total && (data.results || []).length ? { results, metadata: { page: page + 1 } } : { results };
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
      if (kind === 'movie') age = certificateOf({ release_dates: await this.tmdb(`/movie/${tmdb}/release_dates`) }, 'movie');
      else age = certificateOf({ content_ratings: await this.tmdb(`/tv/${tmdb}/content_ratings`) }, 'tv');
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      age = undefined;
    }
    this.ages.set(mangaId, age);
    return age;
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.details(kind, tmdb);
    const title = cleanText(d.title || d.name);
    if (!title) throw new Error('moanatv: title not found');
    const certificate = certificateOf(d, kind);
    const info = {
      title,
      image: posterOf(d.poster_path, 'w500'),
      desc: cleanText(d.overview),
      status: kind === 'movie' ? 'COMPLETED' : /ended|cancel/i.test(d.status || '') ? 'COMPLETED' : 'ONGOING',
      tags: (d.genres || []).map((g) => cleanText(g.name)).filter(Boolean),
      medium: 'anime',
      ageRating: Math.max(ageOf(d), certificate || 0),
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
    if (!seasons.length) throw new Error('moanatv has no episodes for this show yet');
    const now = Date.now();
    const rows = [];
    for (let i = 0; i < seasons.length; i += 3) {
      const group = seasons.slice(i, i + 3);
      const loaded = await Promise.all(group.map((n) => this.tmdb(`/tv/${tmdb}/season/${n}`).then((s) => ({ n, s }))));
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
    if (!rows.length) throw new Error('moanatv has no aired episodes for this show yet');
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
    const query = [`t=${kind}`, `i=${tmdb}`];
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('moanatv: unknown episode id ' + chapterId);
      query.push(`se=${Number(ep[1])}`, `ep=${Number(ep[2])}`);
    }
    query.push(`ti=${encodeURIComponent(cleanText(d.title || d.name))}`);
    const plan = await this.api(`${API}/v/l?${query.join('&')}`);
    const ids = (Array.isArray(plan.order) && plan.order.length ? plan.order : Object.keys(plan.servers || {})).filter((id) => plan.servers && plan.servers[id] && SKIP_SERVERS.indexOf(id) < 0);
    if (!ids.length) throw new Error('moanatv lists no server for this title');

    const videos = [];
    const problems = [];
    await new Promise((resolve) => {
      let pending = ids.length;
      let timer = null;
      let quick = false;
      const finish = () => {
        pending -= 1;
        if (pending === 0) {
          if (timer) clearTimeout(timer);
          resolve();
        }
      };
      ids.forEach((id) => {
        this.server(id, plan.servers[id]).then(
          (list) => {
            list.forEach((video) => videos.push({ order: ids.indexOf(id), video }));
            if (list.length) {
              if (!timer) timer = setTimeout(resolve, GRACE_MS);
              if (videos.length >= 3 && !quick) {
                quick = true;
                clearTimeout(timer);
                timer = setTimeout(resolve, QUICK_MS);
              }
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
      if (limited) throw new Error(`moanatv: ${limited.message}`);
      const messages = problems.map((e) => (e && e.message ? e.message : String(e))).filter((m, i, a) => a.indexOf(m) === i);
      throw new Error(`moanatv has no stream for this title yet (${messages.slice(0, 3).join('; ') || 'no server answered'})`);
    }
    videos.sort((a, b) => Number(b.video.english) - Number(a.video.english) || a.order - b.order);
    return videos.map((v) => {
      const out = Object.assign({}, v.video);
      delete out.english;
      return out;
    });
  }

  async server(id, blob) {
    let answer = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      answer = await this.resolve(`${API}/v/${blob}?pre=1${attempt ? '&r=1' : ''}`);
      if (answer.status < 500) break;
    }
    const data = answer.data;
    if (answer.status !== 200 || !data || !Array.isArray(data.sources) || !data.sources.length) {
      throw new Error(`${id}: ${answer.status === 404 ? 'no stream for this title' : answer.status === 410 ? 'the answer expired' : answer.status >= 500 ? 'the server failed' : `HTTP ${answer.status}`}`);
    }
    const subtitles = [];
    (data.subtitles || []).forEach((s) => {
      if (s && /^https?:\/\//i.test(s.url || '')) subtitles.push({ url: s.url, label: cleanText(s.language) || 'Subtitles', language: cleanText(s.lang) || 'en' });
    });
    const out = [];
    for (const s of data.sources) {
      if (!s || !/^https:\/\//.test(s.url || '') || SKIP_FAMILIES.test(s.url)) continue;
      const family = familyOf(s.url);
      let entry;
      if (family === 'KaEmbed') entry = await this.kaembed(s.url, subtitles);
      else entry = this.entry(family, s, subtitles, data);
      if (entry && family === 'Anigato' && !(await this.playlistWorks(entry.url, entry.headers))) continue;
      if (entry) out.push(entry);
    }
    if (!out.length) throw new Error(`${id}: no stream this file can read`);
    return out;
  }

  entry(family, s, subtitles, data) {
    const hls = (s.type || 'hls') !== 'mp4';
    const parts = [family];
    parts.push(hls ? 'Auto' : cleanText(s.quality) || 'MP4');
    let english = false;
    const dub = /\/dub\//.test(s.url);
    if (family === 'Cookiebakers') {
      parts.push('English audio', 'Softsub: English [CC]');
      english = true;
    } else if (family === 'Anigato') {
      parts.push(dub ? 'English dub' : 'Sub');
      if (/\/m3\//.test(s.url)) parts.push('Mirror 2');
      const soft = softsubLabel(subtitles.map((x) => x.label));
      if (soft && !dub) parts.push(soft);
      english = dub;
    } else {
      const soft = softsubLabel(subtitles.map((x) => x.label));
      if (soft) parts.push(soft);
    }
    const video = { url: s.url, quality: parts.join(', '), type: hls ? 'hls' : 'mp4', server: family };
    if (family === 'Anigato') video.headers = SITE_HEADERS;
    if (subtitles.length) video.subtitles = subtitles;
    const skip = data && data.skip;
    if (skip && skip.intro && Number(skip.intro.end) > Number(skip.intro.start)) video.intro = { start: Math.round(skip.intro.start * 1000), end: Math.round(skip.intro.end * 1000) };
    if (skip && skip.outro && Number(skip.outro.end) > Number(skip.outro.start)) video.outro = { start: Math.round(skip.outro.start * 1000), end: Math.round(skip.outro.end * 1000) };
    video.english = english;
    return video;
  }

  async kaembed(url, subtitles) {
    if (!/^https:\/\/kaembed\.net\/embed-[a-z0-9]+\.html/.test(url)) return null;
    const html = await this.text(url);
    const master = (/https:\/\/[A-Za-z0-9.\-]+\/hls2\/[A-Za-z0-9_,\-\/.]+\.urlset\/master\.m3u8[^'"\s<]*/.exec(html) || /https:\/\/[A-Za-z0-9.\-]+\/[A-Za-z0-9_,\-\/.]+\/master\.m3u8[^'"\s<]*/.exec(html) || [])[0];
    if (!master) throw new Error('KaEmbed: the player page holds no stream');
    const parts = ['KaEmbed', 'Auto'];
    const soft = softsubLabel(subtitles.map((x) => x.label));
    if (soft) parts.push(soft);
    const video = { url: master.replace(/&amp;/g, '&'), quality: parts.join(', '), type: 'hls', server: 'KaEmbed', english: false };
    if (subtitles.length) video.subtitles = subtitles;
    return video;
  }

  async details(kind, tmdb) {
    const key = `${kind}:${tmdb}`;
    if (this.meta.has(key)) return this.meta.get(key);
    const extra = kind === 'movie' ? 'credits,external_ids,release_dates' : 'credits,external_ids,content_ratings';
    const d = await this.tmdb(`/${kind}/${tmdb}`, { append_to_response: extra });
    if (!d || (!d.title && !d.name)) throw new Error('moanatv: title not found');
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

  async tmdb(path, params) {
    const query = [`path=${path}`, 'language=en-US'];
    Object.keys(params || {}).forEach((k) => query.push(`${k}=${encodeURIComponent(params[k])}`));
    return this.json(`${API}/tmdb?${query.join('&')}`);
  }

  async api(url) {
    return this.json(url, SITE_HEADERS);
  }

  async resolve(url) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ Accept: 'application/json' }, SITE_HEADERS) });
    let data = null;
    try {
      data = JSON.parse(String(response.data || ''));
    } catch (e) {
      data = null;
    }
    if (response.status === 429) {
      const error = new Error('the site allows 200 calls a minute and that is used up, try again in a minute');
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
    if (response.status === 429) {
      const error = new Error('moanatv: the site allows 200 calls a minute and that is used up, try again in a minute');
      error.limited = true;
      throw error;
    }
    if (response.status === 404) throw new Error('moanatv: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) {
      const message = data && typeof data.error === 'string' ? data.error : '';
      throw new Error(`moanatv: HTTP ${response.status}${message ? ' ' + message : ''}`);
    }
    if (data === null) throw new Error('moanatv: the API answered something that is not JSON');
    return data;
  }

  async playlistWorks(url, headers) {
    try {
      const master = await this.text(url, headers);
      const variant = (master.split('\n').map((l) => l.trim()).filter((l) => l && l.charAt(0) !== '#')[0]) || '';
      if (!variant) return /#EXTINF/.test(master);
      const base = url.replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
      const target = /^https?:/i.test(variant) ? variant : variant.charAt(0) === '/' ? url.replace(/^(https?:\/\/[^\/]+).*$/, '$1') + variant : base + variant;
      return /#EXTINF/.test(await this.text(target, headers));
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return false;
    }
  }

  async text(url, extraHeaders) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ Accept: 'text/html,*/*' }, extraHeaders || {}) });
    if (response.status < 200 || response.status >= 300) throw new Error(`moanatv: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
