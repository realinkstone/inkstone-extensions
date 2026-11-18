const SITE = 'https://animedub.app';
const PLAYER = 'https://ravok.buzz';

const FEEDS = [
  { id: 'popular', name: 'Popular', path: '/api/anime/most-popular/' },
  { id: 'recent', name: 'Recently Updated', path: '/api/anime/recently-added/' },
  { id: 'ongoing', name: 'Ongoing', path: '/api/anime/ongoing-anime/' },
  { id: 'tv', name: 'TV Series', path: '/api/anime/tv-anime/' },
  { id: 'movies', name: 'Movies', path: '/api/anime/anime-movies/' },
  { id: 'atoz', name: 'A to Z', path: '/api/anime/atoz/' },
];

const GENRES = [
  ['Action', 1], ['Comedy', 2], ['Adventure', 3], ['Drama', 4], ['Fantasy', 5], ['Supernatural', 6], ['Romance', 7], ['Thriller', 8], ['Psychological', 9], ['Mystery', 10],
  ['Sports', 11], ['Ecchi', 12], ['Hindi', 13], ['Tamil', 14], ['Telugu', 15], ['Malayalam', 16], ['Bengali', 17], ['Kannada', 18], ['Slice of Life', 19], ['Sci-Fi', 20],
  ['Animation', 21], ['Sci-Fi & Fantasy', 22], ['Action & Adventure', 23], ['Horror', 25],
];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function parseId(mangaId) {
  const id = String(mangaId || '');
  if (!/^\d{1,6}$/.test(id)) throw new Error('AnimeDUB: unknown title id ' + mangaId);
  return id;
}

function flightOf(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = '';
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse(m[1]);
    } catch (e) {
    }
  }
  return out;
}

function valueAt(text, start) {
  const open = text.charAt(start);
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function jsonAfter(flight, key) {
  const at = flight.indexOf(key);
  if (at < 0) return null;
  const text = valueAt(flight, at + key.length);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function describe(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function statusOf(word) {
  const w = String(word || '').toUpperCase();
  if (w === 'RELEASING') return 'ONGOING';
  if (w === 'FINISHED') return 'COMPLETED';
  if (w === 'CANCELLED') return 'CANCELLED';
  if (w === 'HIATUS') return 'HIATUS';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.genres = null;
    this.index = null;
    this.indexAt = 0;
    this.indexPending = null;
    this.ratingIndex().catch(() => {});
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    const list = await this.genreList();
    return list.map((g) => ({ id: g.name, label: g.name }));
  }

  async send(url, options) {
    const o = options || {};
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const target = attempt === 0 || o.method === 'POST' ? url : url + (url.indexOf('?') >= 0 ? '&' : '?') + 'r=' + attempt;
        const response = await this.requests.schedule(
          App.createRequest({ url: target, method: o.method || 'GET', headers: Object.assign({ Accept: o.accept || '*/*' }, o.headers || {}), body: o.body })
        );
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
        last = response;
      } catch (e) {
        if (e && (e.kind === 'blocked' || e.kind === 'challenge' || /allowed hosts/i.test(String(e.message)))) throw e;
        if (attempt === 1) throw e;
      }
      await pause(600);
    }
    return last;
  }

  async json(url) {
    const response = await this.send(url, { accept: 'application/json' });
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeDUB: HTTP ${response.status}`);
    let data;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      throw new Error('AnimeDUB: its api answered something that is not JSON (try again in a minute)');
    }
    return data;
  }

  async genreList() {
    if (this.genres) return this.genres;
    try {
      const data = await this.json(`${SITE}/api/genres/list/`);
      const list = (data && Array.isArray(data.data) ? data.data : []).filter((g) => g && g.id && clean(g.name)).map((g) => ({ id: Number(g.id), name: clean(g.name) }));
      if (list.length) {
        list.sort((a, b) => a.id - b.id);
        this.genres = list;
        return list;
      }
    } catch (e) {
    }
    return GENRES.map(([name, id]) => ({ id, name }));
  }

  async seriesPage(id, episode) {
    const key = `${id}/${episode}`;
    const hit = this.pages.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this.page(id, episode);
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => this.pages.delete(key));
    if (this.pages.size > 16) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  async page(id, episode) {
    const response = await this.send(`${SITE}/series/${id}/x/${encodeURIComponent(String(episode))}`, { accept: 'text/html' });
    if (response.status === 500 || response.status === 404) throw new Error(`AnimeDUB: no such title or episode (HTTP ${response.status})`);
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeDUB: HTTP ${response.status}`);
    return flightOf(String(response.data || ''));
  }

  ratingIndex() {
    if (this.index && Date.now() - this.indexAt < 1800000) return Promise.resolve(this.index);
    if (!this.indexPending) {
      this.indexPending = this.readIndex().then(
        (set) => {
          this.index = set;
          this.indexAt = Date.now();
          this.indexPending = null;
          return set;
        },
        (error) => {
          this.indexPending = null;
          throw error;
        }
      );
    }
    return this.indexPending;
  }

  async readIndex() {
    const list = await this.genreList();
    const ecchi = list.find((g) => /^ecchi$/i.test(g.name));
    const set = new Set();
    if (!ecchi) return set;
    for (let page = 1; page <= 20; page++) {
      const data = await this.json(`${SITE}/api/anime/genre/?${qs({ id: ecchi.id, page })}`);
      if (!data || data.status !== 200 || !Array.isArray(data.data)) throw new Error('AnimeDUB: could not read which titles are rated 16, try again in a minute');
      for (const item of data.data) if (item && item.id !== undefined) set.add(String(item.id));
      if (!(Number(data.currentPage) < Number(data.totalPages))) return set;
    }
    throw new Error('AnimeDUB: the Ecchi list did not end, try again in a minute');
  }

  card(item, ecchi, allEcchi) {
    const id = String(item.id);
    const count = Number(item.totalEpisodes);
    const out = {
      mangaId: id,
      title: clean(item.title) || id,
      image: clean(item.imageUrl),
      medium: 'anime',
      ageRating: allEcchi || ecchi.has(id) ? 16 : 0,
    };
    const parts = [];
    const format = clean(item.format);
    if (format) parts.push(format === 'MOVIE' ? 'Movie' : format);
    if (count > 0) parts.push(`${count} ${count === 1 ? 'episode' : 'episodes'}`);
    if (parts.length) out.summary = parts.join(', ');
    return out;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const tags = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const page = (metadata && metadata.page) || 1;
    const rated = this.ratingIndex();
    rated.catch(() => {});
    let data;
    let genre = null;
    if (query) {
      data = await this.json(`${SITE}/api/search/anime?${qs({ query, page })}`);
    } else if (tags.length) {
      const wanted = String(tags[0].id || tags[0]).toLowerCase();
      genre = (await this.genreList()).find((g) => g.name.toLowerCase() === wanted);
      if (!genre) return { results: [], metadata: undefined };
      data = await this.json(`${SITE}/api/anime/genre/?${qs({ id: genre.id, page })}`);
    } else {
      const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
      data = await this.json(`${SITE}${feed.path}?${qs({ page, limit: 30 })}`);
    }
    if (!data || (data.status !== undefined && data.status !== 200)) throw new Error('AnimeDUB: the list did not load, try again in a minute');
    const items = Array.isArray(data.data) ? data.data : data.data && Array.isArray(data.data.animes) ? data.data.animes : null;
    if (!items) throw new Error('AnimeDUB: the list did not load, try again in a minute');
    const paging = data.pagination || data;
    const ecchi = await rated;
    const seen = new Set();
    const results = [];
    for (const item of items) {
      if (!item || item.id === undefined || seen.has(item.id)) continue;
      seen.add(item.id);
      results.push(this.card(item, ecchi, genre && /^ecchi$/i.test(genre.name)));
    }
    const more = Number(paging.currentPage) < Number(paging.totalPages) && items.length > 0;
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const id = parseId(mangaId);
    const flight = await this.seriesPage(id, 1);
    const anime = jsonAfter(flight, '"animeData":');
    if (!anime || !clean(anime.title)) throw new Error('AnimeDUB: title not found');
    const genres = (Array.isArray(anime.genres) ? anime.genres : []).map((g) => clean(g && g.name)).filter(Boolean);
    const studios = (Array.isArray(anime.studios) ? anime.studios : []).map((s) => clean(s && s.name)).filter(Boolean);
    const cover = clean(anime.imageUrl).replace('/cover/medium/', '/cover/large/');
    const info = {
      title: clean(anime.title),
      image: cover,
      desc: describe(anime.description) || undefined,
      status: statusOf(anime.status),
      tags: genres,
      webURL: `${SITE}/series/${id}/x/1`,
      medium: 'anime',
      ageRating: genres.some((g) => /^ecchi$/i.test(g)) ? 16 : 0,
    };
    if (studios.length) info.author = studios.join(', ');
    if (anime.year) info.releaseDate = String(anime.year);
    info.completed = info.status === 'COMPLETED';
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const id = parseId(mangaId);
    const flight = await this.seriesPage(id, 1);
    const rows = jsonAfter(flight, '"episodesDetails":');
    if (!Array.isArray(rows)) throw new Error('AnimeDUB: the episode list of this title could not be read');
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const n = Number(row && row.number);
      if (!Number.isFinite(n) || n <= 0) continue;
      const key = String(n);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: key, chapterId: key, name: `Episode ${key}`, number: n });
    }
    if (!out.length) throw new Error('AnimeDUB has no episodes for this title yet');
    out.sort((a, b) => b.number - a.number);
    return out;
  }

  absolute(ref, base) {
    if (/^https?:\/\//i.test(ref)) return ref;
    const origin = (/^(https?:\/\/[^/]+)/i.exec(base) || [])[1] || '';
    if (ref.charAt(0) === '/') return origin + ref;
    return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + ref;
  }

  async playable(master, text) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const lines = text.split('\n').map((l) => l.trim());
        const at = lines.findIndex((l) => l.indexOf('#EXT-X-STREAM-INF') === 0);
        if (at < 0 || !lines[at + 1]) return false;
        const variant = this.absolute(lines[at + 1], master);
        const plain = await this.send(variant, { accept: '*/*' });
        if (plain.status < 200 || plain.status >= 300) return false;
        const seg = String(plain.data || '').split('\n').map((l) => l.trim()).find((l) => l && l.charAt(0) !== '#');
        if (!seg) return false;
        const got = await this.send(this.absolute(seg, variant), { accept: '*/*', headers: { Range: 'bytes=0-1023' } });
        return got.status >= 200 && got.status < 400;
      } catch (e) {
        if (e && (e.kind === 'blocked' || e.kind === 'challenge' || /allowed hosts/i.test(String(e.message)))) throw e;
      }
      await pause(500);
    }
    return false;
  }

  async getVideos(mangaId, chapterId) {
    const id = parseId(mangaId);
    const episode = clean(chapterId);
    if (!/^\d+(\.\d+)?$/.test(episode)) throw new Error('AnimeDUB: unknown episode ' + chapterId);
    const flight = await this.seriesPage(id, episode);
    const data = jsonAfter(flight, '"episodeData":');
    const servers = data && Array.isArray(data.servers) ? data.servers : [];
    if (!servers.length) throw new Error('AnimeDUB lists no server for this episode yet');
    let player = null;
    for (const s of servers) {
      const m = /^https:\/\/ravok\.buzz\/video\/([0-9a-f]{32})/.exec(clean(s && s.url));
      if (m) {
        player = m[1];
        break;
      }
    }
    if (!player) throw new Error('AnimeDUB has this episode only on ' + servers.map((s) => clean(s && s.name)).filter(Boolean).join(' and ') + ', players this extension does not open');
    const response = await this.send(`${PLAYER}/player/index.php?data=${player}&do=getVideo`, {
      method: 'POST',
      accept: '*/*',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: `${PLAYER}/video/${player}`, Origin: PLAYER },
      body: `hash=${player}&r=${encodeURIComponent(`${SITE}/series/${id}/x/${episode}`)}`,
    });
    let answer = null;
    try {
      answer = JSON.parse(String(response.data || ''));
    } catch (e) {
      throw new Error('AnimeDUB: its player no longer has this video (the player page says it was not found)');
    }
    const master = clean(answer && (answer.securedLink || (/\.m3u8/.test(String(answer.videoSource || '')) ? answer.videoSource : '')));
    if (!/^https?:\/\//.test(master)) throw new Error('AnimeDUB: its player gave no stream for this episode');
    const playlist = await this.send(master, { accept: '*/*' });
    const text = String(playlist.data || '');
    if (playlist.status !== 200 || text.indexOf('#EXTM3U') !== 0) throw new Error('AnimeDUB: its stream is not ready yet (try again in a minute)');
    if (!(await this.playable(master, text))) throw new Error('AnimeDUB: its stream host refused the first segment (HTTP 403 or no answer), so it cannot play right now');
    let top = 0;
    for (const h of text.match(/RESOLUTION=\d+x(\d+)/g) || []) top = Math.max(top, Number(h.split('x')[1]) || 0);
    const audio = [];
    for (const line of text.split('\n')) {
      if (line.indexOf('#EXT-X-MEDIA') !== 0 || !/TYPE=AUDIO/.test(line)) continue;
      const name = clean((/NAME="([^"]+)"/.exec(line) || [])[1]);
      if (name && audio.indexOf(name) < 0) audio.push(name);
    }
    const rank = (n) => (n === 'English' ? 0 : n === 'Japanese' ? 1 : 2);
    audio.sort((a, b) => rank(a) - rank(b));
    const shown = audio.slice(0, 3).join(', ') + (audio.length > 3 ? ` +${audio.length - 3}` : '');
    return [
      {
        url: master,
        quality: `${top ? `Auto up to ${top}p` : 'Auto'} Dub${audio.length ? ` (${shown})` : ''}`,
        type: 'hls',
        server: 'Multi',
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
