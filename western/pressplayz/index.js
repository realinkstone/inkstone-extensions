const SITE = 'https://pressplayz.top';
const SPARK = 'https://vidspark.to';
const SPARK_KEY = '3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13';
const IMG = 'https://image.tmdb.org/t/p';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CODE_ALPHABET = 'q8n3k7m2p9r4s6t1u5v0wbxdyfzhjaclegio';
const CODE_MODULUS = 36 * 36 * 36 * 36 * 36;
const SUBTITLE_CODES = {
  eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', dan: 'da', fin: 'fi', nor: 'no', swe: 'sv',
  dut: 'nl', nld: 'nl', pol: 'pl', rus: 'ru', tur: 'tr', ara: 'ar', heb: 'he', hin: 'hi', ind: 'id', jpn: 'ja', kor: 'ko', chi: 'zh',
  zho: 'zh', tha: 'th', vie: 'vi', gre: 'el', ell: 'el', hun: 'hu', cze: 'cs', ces: 'cs', rum: 'ro', ron: 'ro', ukr: 'uk', bul: 'bg',
};

const FEEDS = [
  { id: 'movies-trending', name: 'Movies: Trending', kind: 'movie', action: 'catalogueTrending' },
  { id: 'series-trending', name: 'Series: Trending', kind: 'tv', action: 'catalogueTrending' },
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', action: 'discoverByGenre' },
  { id: 'series-popular', name: 'Series: Popular', kind: 'tv', action: 'discoverByGenre' },
  { id: 'movies-latest', name: 'Movies: Latest', kind: 'movie', action: 'catalogueLatest' },
  { id: 'series-latest', name: 'Series: Latest', kind: 'tv', action: 'catalogueLatest' },
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
const MOVIE_GENRE_NAMES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy',
  36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western',
};

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function devalueParse(text) {
  const values = JSON.parse(text);
  const done = {};
  function hydrate(i) {
    if (i === -1 || i === -2) return undefined;
    if (i < -2) return NaN;
    if (Object.prototype.hasOwnProperty.call(done, i)) return done[i];
    const v = values[i];
    if (v === null || typeof v !== 'object') {
      done[i] = v;
      return v;
    }
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        done[i] = v[1];
        return v[1];
      }
      const list = [];
      done[i] = list;
      v.forEach((j) => list.push(hydrate(j)));
      return list;
    }
    const obj = {};
    done[i] = obj;
    Object.keys(v).forEach((k) => {
      obj[k] = hydrate(v[k]);
    });
    return obj;
  }
  return hydrate(0);
}

function astroValue(v) {
  if (!Array.isArray(v)) return v;
  const type = v[0];
  const x = v[1];
  if (type === 0) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const out = {};
      Object.keys(x).forEach((k) => {
        out[k] = astroValue(x[k]);
      });
      return out;
    }
    return x;
  }
  if (type === 1) return (x || []).map(astroValue);
  return x;
}

function astroProps(attr) {
  const text = String(attr || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const raw = JSON.parse(text);
  const out = {};
  Object.keys(raw).forEach((k) => {
    out[k] = astroValue(raw[k]);
  });
  return out;
}

function watchCode(id) {
  let rest = (id * 1000033) % CODE_MODULUS;
  let code = '';
  for (let n = 0; n < 5; n++) {
    code = CODE_ALPHABET.charAt(rest % 36) + code;
    rest = Math.floor(rest / 36);
  }
  return code;
}

function slugOf(title) {
  const words = String(title || '').toLowerCase().match(/[a-z0-9]+/g);
  return words && words.length ? words.join('-') : 'x';
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('PressPlayZ: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: parseInt(m[2], 10) };
}

function posterOf(path, size) {
  return path ? `${IMG}/${size}${path}` : '';
}

function ageRatingOf(item) {
  return item && (item.adult === true || item.softcore === true) ? 18 : undefined;
}

function yearOf(text) {
  const m = /\d{4}/.exec(String(text || ''));
  return m ? m[0] : undefined;
}

function statusOfShow(text) {
  const t = String(text || '').toLowerCase();
  if (/returning|in production|planned|pilot/.test(t)) return 'ONGOING';
  if (/ended|cancel/.test(t)) return 'COMPLETED';
  return 'UNKNOWN';
}

function today() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.serversCache = null;
    this.showCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRES).map((id) => ({ id, label: GENRES[id].label }));
  }

  mapItem(item, kind) {
    const type = item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : kind;
    const title = cleanText(item.title || item.name);
    if (!type || !item.id || !title) return null;
    return {
      mangaId: `${type}~${item.id}`,
      title,
      image: posterOf(item.poster_path, 'w342'),
      ageRating: ageRatingOf(item),
      webURL: `${SITE}/watch/${type}-${slugOf(title)}-${watchCode(item.id)}`,
      medium: 'anime',
    };
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    if (query) {
      if (page > 1) return { results: [] };
      const found = await this.action('search', { query });
      const results = (Array.isArray(found) ? found : []).filter((x) => x && x.media_type !== 'person').map((x) => this.mapItem(x, null)).filter(Boolean);
      return { results };
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';
    let name = feed.action;
    let body;
    if (tag) {
      const genre = GENRES[tag] && GENRES[tag][feed.kind];
      if (!genre) return { results: [] };
      name = 'discoverByGenre';
      body = { mediaType: feed.kind, genres: String(genre), sortBy: 'popularity.desc', page };
    } else if (name === 'catalogueTrending') body = { mediaType: feed.kind, period: 'day', page };
    else if (name === 'catalogueLatest') body = { mediaType: feed.kind, page };
    else body = { mediaType: feed.kind, genres: '', sortBy: 'popularity.desc', page };
    let data = await this.action(name, body);
    for (let again = 0; again < 2 && page === 1 && !(data && Array.isArray(data.results) && data.results.length); again++) {
      data = await this.action(name, body);
    }
    const list = data && Array.isArray(data.results) ? data.results : [];
    const results = list.map((x) => this.mapItem(x, feed.kind)).filter(Boolean);
    const total = Math.min(Number((data && (data.totalPages || data.total_pages)) || 1), 500);
    return results.length > 0 && page < total ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const html = await this.watchPage(kind, tmdb);
    const $ = cheerio.load(html);
    if (kind === 'tv') {
      const show = this.showOf(tmdb, $);
      const info = {
        title: cleanText(show.name) || cleanText($('h1').first().text()),
        image: posterOf(show.poster_path, 'w500') || cleanText($('meta[property="og:image"]').attr('content')),
        desc: cleanText(show.overview),
        status: statusOfShow(show.status),
        tags: (show.genres || []).map((g) => cleanText(g.name)).filter(Boolean),
        webURL: `${SITE}/watch/tv-${slugOf(show.name)}-${watchCode(tmdb)}`,
        medium: 'anime',
      };
      info.completed = info.status === 'COMPLETED';
      const creators = (show.created_by || []).map((c) => cleanText(c.name)).filter(Boolean);
      if (creators.length) info.author = creators.join(', ');
      const year = yearOf(show.first_air_date);
      if (year) info.releaseDate = year;
      const age = ageRatingOf(show);
      if (age !== undefined) info.ageRating = age;
      return { mangaInfo: info };
    }
    const title = cleanText($('h1').first().text());
    if (!title) throw new Error('PressPlayZ: title page not found');
    const info = {
      title,
      image: cleanText($('meta[property="og:image"]').attr('content')),
      desc: cleanText(($('meta[name="description"]').attr('content') || '').replace(/^Watch .*? online free in HD on PressPlayZ\.\s*/i, '')),
      status: 'COMPLETED',
      completed: true,
      tags: [],
      webURL: `${SITE}/watch/movie-${slugOf(title)}-${watchCode(tmdb)}`,
      medium: 'anime',
    };
    const yearInTitle = /\((\d{4})\)/.exec(cleanText($('title').first().text()));
    if (yearInTitle) info.releaseDate = yearInTitle[1];
    try {
      const found = await this.action('search', { query: title });
      const hit = (Array.isArray(found) ? found : []).filter((x) => x && x.id === tmdb && x.media_type === 'movie')[0];
      if (hit) {
        if (cleanText(hit.overview)) info.desc = cleanText(hit.overview);
        info.tags = (hit.genre_ids || []).map((id) => MOVIE_GENRE_NAMES[id]).filter(Boolean);
        if (hit.poster_path) info.image = posterOf(hit.poster_path, 'w500');
        const y = yearOf(hit.release_date);
        if (y) info.releaseDate = y;
        const age = ageRatingOf(hit);
        if (age !== undefined) info.ageRating = age;
      }
    } catch (e) {
      console.error('PressPlayZ search lookup failed: ' + (e && e.message));
    }
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    let show = this.showCache.get(tmdb);
    if (!show) {
      const $ = cheerio.load(await this.watchPage('tv', tmdb));
      show = this.showOf(tmdb, $);
    }
    const seasons = (show.seasons || []).map((s) => s.season_number).filter((n) => Number.isFinite(n) && n >= 1);
    if (!seasons.length) throw new Error('PressPlayZ has no episodes for this series yet');
    const rows = [];
    const now = today();
    for (let i = 0; i < seasons.length; i += 5) {
      const batch = seasons.slice(i, i + 5);
      const loaded = await Promise.all(batch.map((n) => this.season(tmdb, n)));
      loaded.forEach((season, at) => {
        ((season && season.episodes) || []).forEach((ep) => {
          const air = String(ep.air_date || '');
          if (air && air > now) return;
          const number = Number(ep.episode_number);
          if (!Number.isFinite(number)) return;
          const name = cleanText(ep.name);
          const row = { id: `s${batch[at]}e${number}`, name: name ? `Episode ${number}: ${name}` : `Episode ${number}`, number, season: batch[at] };
          if (name) row.title = name;
          if (ep.still_path) row.thumbnail = posterOf(ep.still_path, 'w300');
          if (cleanText(ep.overview)) row.summary = cleanText(ep.overview);
          if (Number(ep.runtime) > 0) row.duration = Math.round(Number(ep.runtime) * 60);
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(air);
          if (m) row.time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
          rows.push(row);
        });
      });
    }
    if (!rows.length) throw new Error('PressPlayZ has no aired episodes for this series yet');
    rows.sort((x, y) => y.season - x.season || y.number - x.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: r.name, number: r.number };
      if (r.time !== undefined) out.time = r.time;
      ['title', 'thumbnail', 'summary', 'duration'].forEach((k) => {
        if (r[k] !== undefined) out[k] = r[k];
      });
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const { kind, tmdb } = parseId(mangaId);
    let path;
    if (kind === 'movie') path = `movie/${tmdb}`;
    else {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('PressPlayZ: unknown episode id ' + chapterId);
      path = `tv/${tmdb}/${ep[1]}/${ep[2]}`;
    }
    const servers = await this.playerServers();
    const listed = servers.some((s) => s && s.active !== false && /moviesapi\.to|vidspark\.to/i.test(`${s.id} ${s.movieUrl} ${s.tvUrl}`));
    if (!listed) throw new Error('PressPlayZ lists no server this app can play for this title (it reads only the VidSpark server)');
    return [await this.vidSpark(path)];
  }

  async playerServers() {
    if (this.serversCache) return this.serversCache;
    const text = await this.text(`${SITE}/api/player-servers`, { Accept: 'application/json' });
    let list = [];
    try {
      list = JSON.parse(text);
    } catch (e) {
      list = [];
    }
    this.serversCache = Array.isArray(list) ? list : [];
    return this.serversCache;
  }

  async vidSpark(path) {
    const api = await this.send({
        url: `${SPARK}/api/vidora/v1/${path}`,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'x-player-key': SPARK_KEY, Referer: `${SPARK}/${path}` },
      });
    let data = null;
    try {
      data = JSON.parse(api.data);
    } catch (e) {
      data = null;
    }
    if (api.status === 404) throw new Error('VidSpark: ' + ((data && data.message) || 'no stream for this title yet'));
    if (api.status >= 500) throw new Error(`VidSpark is not answering for this title (HTTP ${api.status})`);
    if (api.status < 200 || api.status >= 300 || !data) throw new Error(`VidSpark: HTTP ${api.status}`);
    const source = data.sources && data.sources[0];
    if (!data.result || !source || !source.url) throw new Error('VidSpark gave no stream for this title');
    const subtitles = [];
    (source.tracks || []).forEach((track) => {
      if (!track || !track.file) return;
      const code = (/_([a-z]{3})(?:_[a-z]+)?\.vtt/i.exec(track.file) || [])[1];
      subtitles.push({ url: track.file, label: cleanText(track.label) || 'Subtitles', language: SUBTITLE_CODES[String(code || '').toLowerCase()] || String(code || '').toLowerCase() });
    });
    const english = subtitles.some((t) => t.language === 'en');
    const parts = ['VidSpark', 'Auto'];
    if (subtitles.length) parts.push(subtitles.length <= 3 ? 'Softsub: ' + subtitles.map((t) => t.label).join(', ') : english ? `Softsub: English and ${subtitles.length - 1} more` : `Softsub: ${subtitles.length} languages`);
    const video = { url: source.url, quality: parts.join(', '), type: 'hls', server: 'VidSpark', headers: { Referer: `${SPARK}/` } };
    if (subtitles.length) video.subtitles = subtitles;
    return video;
  }

  showOf(tmdb, $) {
    const island = $('astro-island').filter((_, el) => /TVShowPlayer/.test($(el).attr('component-url') || '')).first();
    if (!island.length) throw new Error('PressPlayZ: series page has no show data');
    const props = astroProps(island.attr('props'));
    const show = props.result;
    if (!show || !show.name) throw new Error('PressPlayZ: series page has no show data');
    this.showCache.set(tmdb, show);
    return show;
  }

  async season(tmdb, number) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await this.text(`${SITE}/api/tmdb/season/${tmdb}/${number}`, { Accept: 'application/json' });
        return JSON.parse(text);
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw new Error(`PressPlayZ: season ${number} did not load (${last && last.message}), try again`);
  }

  async watchPage(kind, tmdb) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.text(`${SITE}/watch/${kind}-x-${watchCode(tmdb)}`);
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last || new Error('PressPlayZ: title page not found');
  }

  async action(name, body) {
    const response = await this.send({
        url: `${SITE}/_actions/${name}/`,
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    if (response.status < 200 || response.status >= 300) throw new Error(`PressPlayZ: ${name} answered HTTP ${response.status}`);
    return devalueParse(String(response.data || '[]'));
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
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last;
  }

  async text(url, extraHeaders) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, extraHeaders || {}) });
    if (response.status === 404) throw new Error('PressPlayZ: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`PressPlayZ: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
