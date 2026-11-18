const SITE = 'https://hianimes.se';
const API = 'https://animehot.cc/api';
const PLAYER = 'https://zokoanime.video';
const PLAYER_KEY = 'otaku-embed-v1';
const PLAYER_HEADERS = { Referer: PLAYER + '/', Origin: PLAYER };
const PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 50;
const RANGE = 100;
const CACHE_MS = 5 * 60 * 1000;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const FEEDS = [
  { id: 'latest', name: 'Latest Episodes' },
  { id: 'popular', name: 'Most Popular' },
  { id: 'trending', name: 'Trending' },
  { id: 'airing', name: 'Airing Now' },
  { id: 'top', name: 'Top Rated' },
  { id: 'movies', name: 'Movies' },
  { id: 'added', name: 'Recently Added' },
];

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Girls Love', 'Gourmet', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Suspense', 'Thriller',
];

function clean(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
}

function plain(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pathPiece(value) {
  let text = String(value);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
    text = String(value);
  }
  return encodeURIComponent(text);
}

function slugOf(item) {
  if (!item) return '';
  if (item.slug) return String(item.slug);
  const list = Array.isArray(item.slugs) ? item.slugs : [];
  if (list[10]) return String(list[10]);
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]) return String(list[i]);
  }
  return '';
}

function ageOf(item) {
  const genres = (Array.isArray(item.genres) ? item.genres : []).map((g) => clean(g).toLowerCase());
  const rating = clean(item.Rating).toLowerCase();
  if (genres.indexOf('hentai') >= 0 || genres.indexOf('erotica') >= 0 || /^rx\b/.test(rating)) return 18;
  if (genres.indexOf('ecchi') >= 0 || /^r\+/.test(rating)) return 16;
  return 0;
}

function titleOf(item) {
  return clean(item.title) || clean(item.English) || clean(item.alternateTitle) || clean(item.Japanese) || slugOf(item);
}

function statusOf(item) {
  const text = clean(item.Status).toLowerCase();
  if (text === 'currently airing' || text === 'releasing') return 'ONGOING';
  if (text === 'finished airing' || text === 'finished' || text === 'finsihed') return 'COMPLETED';
  return 'UNKNOWN';
}

function isUpcoming(item) {
  const text = clean(item.Status).toLowerCase();
  return text === 'not yet aired' || text === 'not_yet_released';
}

function card(item) {
  const slug = slugOf(item);
  const out = {
    mangaId: slug,
    title: titleOf(item),
    image: clean(item.image),
    tags: Array.isArray(item.genres) ? item.genres.map(clean).filter(Boolean) : [],
    ageRating: ageOf(item),
    medium: 'anime',
    webURL: `${SITE}/details/${slug}`,
  };
  return out;
}

function rankByTitle(rows, query) {
  const wanted = plain(query);
  const score = (row) => {
    const name = plain(titleOf(row));
    if (name === wanted) return 0;
    if (name.indexOf(wanted) === 0) return 1;
    if ((' ' + name + ' ').indexOf(' ' + wanted + ' ') >= 0) return 2;
    return 3;
  };
  return rows
    .map((row, index) => ({ row, index, rank: score(row) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.row);
}

function base64Bytes(text) {
  const input = String(text).replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < input.length; i++) {
    acc = (acc << 6) | B64.indexOf(input.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

function readPlayerData(blob) {
  const bytes = base64Bytes(blob);
  let percent = '';
  for (let i = 0; i < bytes.length; i++) {
    const value = bytes[i] ^ PLAYER_KEY.charCodeAt(i % PLAYER_KEY.length);
    percent += '%' + (value < 16 ? '0' : '') + value.toString(16);
  }
  return JSON.parse(decodeURIComponent(percent));
}

function pickPlayerLink(list) {
  const links = Array.isArray(list) ? list : [];
  for (let i = 0; i < links.length; i++) {
    if (typeof links[i] === 'string' && links[i].indexOf(PLAYER + '/') === 0) return links[i];
  }
  return '';
}

function toMillis(range) {
  if (!range) return undefined;
  const start = Number(range.start);
  const end = Number(range.end);
  if (!isFinite(start) || !isFinite(end) || end <= start || start < 0) return undefined;
  return { start: Math.round(start * 1000), end: Math.round(end * 1000) };
}

class Source {
  constructor() {
    this.manager = App.createRequestManager({});
    this.details = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchTags() {
    return GENRES.map((name) => ({ id: name, label: name }));
  }

  async send(url, method, body, accept) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      let target = url;
      if (attempt > 0 && method === 'GET') target = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'r=1';
      try {
        const headers = { Accept: accept || 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await this.manager.schedule(App.createRequest({ url: target, method, headers, body }));
        if (response.status >= 500 && attempt === 0) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        return response;
      } catch (error) {
        if (error && (error.kind === 'blocked' || error.kind === 'challenge' || /allowed hosts/i.test(String(error.message)))) throw error;
        lastError = error;
      }
    }
    throw lastError || new Error('HiAnimes did not answer');
  }

  async json(url, method, body) {
    const response = await this.send(url, method || 'GET', body === undefined ? undefined : JSON.stringify(body));
    if (response.status === 404) return { notFound: true };
    if (response.status < 200 || response.status >= 300) throw new Error(`HiAnimes answered HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (error) {
      throw new Error('HiAnimes answered something other than JSON');
    }
  }

  async filterPage(options, page, limit) {
    const body = { page, limit: limit || PAGE_SIZE };
    Object.keys(options).forEach((key) => {
      const value = options[key];
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return;
      body[key] = value;
    });
    const data = await this.json(`${API}/filter`, 'POST', body);
    const rows = Array.isArray(data.results) ? data.results : [];
    return { rows, hasNext: page < (Number(data.totalPages) || 0) };
  }

  async feedPage(feed, page) {
    if (feed === 'popular') {
      const data = await this.json(`${API}/anime/popular?page=${page}&limit=${PAGE_SIZE}`);
      const meta = data.meta || {};
      return { rows: Array.isArray(data.animes) ? data.animes : [], hasNext: page < (Number(meta.totalPages) || 0) };
    }
    if (feed === 'trending') {
      const data = await this.json(`${API}/anime/trending?page=${page}&limit=${PAGE_SIZE}`);
      const rows = Array.isArray(data.animes) ? data.animes : [];
      return { rows, hasNext: rows.length >= PAGE_SIZE && page < 10 };
    }
    if (feed === 'latest') {
      const data = await this.json(`${API}/latest/episode?page=${page}&limit=${PAGE_SIZE}`);
      const rows = [];
      const seen = {};
      (Array.isArray(data.episodes) ? data.episodes : []).forEach((episode) => {
        const info = episode && episode.anime_info;
        const slug = slugOf(info);
        if (!slug || seen[slug]) return;
        seen[slug] = true;
        rows.push(info);
      });
      return { rows, hasNext: page < (Number(data.totalPages) || 0) };
    }
    if (feed === 'airing') return this.filterPage({ status: 'Airing' }, page);
    if (feed === 'top') return this.filterPage({ sort: 'Score' }, page);
    if (feed === 'movies') return this.filterPage({ type: 'Movie' }, page);
    return this.filterPage({}, page);
  }

  async searchPage(title, genres, page) {
    const first = await this.filterPage({ keyword: title, genre: genres }, page, SEARCH_PAGE_SIZE);
    if (title) first.rows = rankByTitle(first.rows, title);
    if (first.rows.length || page > 1 || !title) return first;
    const words = plain(title).split(' ').filter((word) => word.length >= 2);
    if (words.length < 2) return first;
    const longest = words.slice().sort((a, b) => b.length - a.length)[0];
    const loose = await this.filterPage({ keyword: longest, genre: genres }, 1, SEARCH_PAGE_SIZE);
    const rows = loose.rows.filter((row) => {
      const name = ' ' + plain(titleOf(row)) + ' ' + plain(row.English) + ' ' + plain(row.alternateTitle) + ' ';
      return words.every((word) => name.indexOf(word) >= 0);
    });
    return { rows, hasNext: false };
  }

  async getSearchResults(request, metadata) {
    const req = request || {};
    const page = (metadata && Number(metadata.page)) || 1;
    const title = clean(req.title);
    const known = {};
    GENRES.forEach((name) => {
      known[name.toLowerCase()] = name;
    });
    const genres = [];
    (req.includedTags || []).forEach((tag) => {
      const raw = clean(tag && (tag.id || tag.label));
      const name = known[raw.toLowerCase()];
      if (name && genres.indexOf(name) < 0) genres.push(name);
    });
    let result;
    if (title || genres.length) result = await this.searchPage(title, genres, page);
    else result = await this.feedPage(req.feed || 'latest', page);
    const results = [];
    result.rows.forEach((row) => {
      if (!slugOf(row)) return;
      if (!title && isUpcoming(row)) return;
      results.push(card(row));
    });
    return { results, metadata: result.hasNext ? { page: page + 1 } : undefined };
  }

  loadDetails(mangaId) {
    const key = String(mangaId);
    const cached = this.details.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
    const promise = (async () => {
      const data = await this.json(`${API}/anime/${pathPiece(mangaId)}`);
      if (data.notFound || !data.anime || !data.anime._id) throw new Error('HiAnimes has no title with this address');
      return data.anime;
    })();
    this.details.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.details.get(key) && this.details.get(key).promise === promise) this.details.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const anime = await this.loadDetails(mangaId);
    const info = card(anime);
    info.mangaId = String(mangaId);
    info.desc = clean(anime.synopsis);
    info.status = statusOf(anime);
    if (anime.landScapeImage && /^https?:\/\//.test(anime.landScapeImage)) info.banner = anime.landScapeImage;
    return { mangaInfo: info };
  }

  async episodeRange(animeId, start, end) {
    const data = await this.json(`${API}/episodes/${pathPiece(animeId)}?start=${start}&end=${end}`);
    if (data.notFound) return { total: 0, episodes: [] };
    return { total: Number(data.total) || 0, episodes: Array.isArray(data.episodes) ? data.episodes : [] };
  }

  async getChapters(mangaId) {
    const anime = await this.loadDetails(mangaId);
    const first = await this.episodeRange(anime._id, 1, RANGE);
    let episodes = first.episodes.map((episode, index) => ({ episode, position: index + 1 }));
    const ranges = [];
    for (let start = RANGE + 1; start <= first.total; start += RANGE) ranges.push(start);
    if (ranges.length) {
      const rest = await Promise.all(ranges.map((start) => this.episodeRange(anime._id, start, start + RANGE - 1)));
      rest.forEach((part, index) => {
        episodes = episodes.concat(part.episodes.map((episode, at) => ({ episode, position: ranges[index] + at })));
      });
    }
    const movie = clean(anime.Type).toLowerCase() === 'movie';
    const seen = {};
    const chapters = [];
    episodes.forEach((item) => {
      const number = Number(item.episode.episodeNumber);
      if (!isFinite(number)) return;
      const id = `${anime._id}~${number}~${item.position}`;
      if (seen[id]) return;
      seen[id] = true;
      chapters.push({ id, name: movie && first.total === 1 ? 'Movie' : `Episode ${number}`, number });
    });
    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  }

  async findEpisode(animeId, number, position) {
    const near = await this.episodeRange(animeId, position, position);
    for (let i = 0; i < near.episodes.length; i++) {
      if (Number(near.episodes[i].episodeNumber) === number) return near.episodes[i];
    }
    const total = near.total;
    for (let start = 1; start <= total; start += RANGE) {
      const part = await this.episodeRange(animeId, start, start + RANGE - 1);
      for (let i = 0; i < part.episodes.length; i++) {
        if (Number(part.episodes[i].episodeNumber) === number) return part.episodes[i];
      }
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async playerEntry(link, kind) {
    const response = await this.send(link, 'GET', undefined, 'text/html,application/xhtml+xml');
    if (response.status < 200 || response.status >= 300) throw new Error(`ZokoAnime answered HTTP ${response.status}`);
    const match = /window\.__P\s*=\s*"([^"]+)"/.exec(String(response.data));
    if (!match) throw new Error('ZokoAnime has no stream for this episode');
    let data;
    try {
      data = readPlayerData(match[1]);
    } catch (error) {
      throw new Error('ZokoAnime changed its player data, the stream could not be read');
    }
    if (!data || typeof data.src !== 'string' || !/^https?:\/\//.test(data.src)) throw new Error('ZokoAnime gave no stream address');
    const subtitles = [];
    (Array.isArray(data.subtitles) ? data.subtitles : []).forEach((track) => {
      if (!track || typeof track.src !== 'string' || !/^https?:\/\//.test(track.src)) return;
      const language = clean(track.lang).toLowerCase();
      const item = { url: track.src, label: clean(track.label) || language || 'Subtitles', language };
      if (language === 'en') subtitles.unshift(item);
      else subtitles.push(item);
    });
    const entry = {
      url: data.src,
      quality: kind === 'dub' ? 'Auto Dub' : subtitles.length ? 'Auto Softsub' : 'Auto Sub',
      server: 'ZokoAnime',
      headers: { Referer: PLAYER_HEADERS.Referer, Origin: PLAYER_HEADERS.Origin },
    };
    if (subtitles.length) entry.subtitles = subtitles.slice(0, 30);
    const skip = data.skip || {};
    const intro = toMillis(skip.intro);
    const outro = toMillis(skip.outro);
    if (intro) entry.intro = intro;
    if (outro) entry.outro = outro;
    return entry;
  }

  async getVideos(mangaId, chapterId) {
    const parts = String(chapterId).split('~');
    const animeId = parts[0];
    const number = Number(parts[1]);
    const position = Number(parts[2]);
    if (!animeId || parts.length !== 3 || !isFinite(number) || !(position >= 1)) throw new Error('This episode address is not one HiAnimes gave out');
    const episode = await this.findEpisode(animeId, number, position);
    if (!episode) throw new Error('HiAnimes does not list this episode any more');
    const link = episode.link || {};
    const jobs = [];
    ['sub', 'dub'].forEach((kind) => {
      const address = pickPlayerLink(link[kind]);
      if (address) jobs.push({ kind, run: this.playerEntry(address, kind).then((entry) => ({ entry }), (error) => ({ error })) });
    });
    if (!jobs.length) throw new Error('This episode has no stream yet: HiAnimes lists no ZokoAnime link for it');
    const done = await Promise.all(jobs.map((job) => job.run));
    const entries = [];
    let failure = null;
    done.forEach((item) => {
      if (item.entry) entries.push(item.entry);
      else if (!failure || (item.error && (item.error.kind === 'challenge' || item.error.kind === 'blocked'))) failure = item.error;
    });
    if (!entries.length) {
      if (failure && (failure.kind === 'challenge' || failure.kind === 'blocked' || /allowed hosts/i.test(String(failure.message)))) throw failure;
      throw new Error(`This episode has no stream yet: ${failure && failure.message ? failure.message : 'ZokoAnime gave nothing'}`);
    }
    return entries;
  }
}

module.exports = { Source };
