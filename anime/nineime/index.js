const SITE = 'https://9ime.live';
const ROUTE = `${SITE}/api/cdn/route?u=`;

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

const FEEDS = [
  { id: 'popular', name: 'Popular', query: { sort: 'popular' } },
  { id: 'newest', name: 'New Releases', query: { sort: 'newest' } },
  { id: 'airing', name: 'Airing', query: { status: 'ongoing', sort: 'newest' } },
  { id: 'movies', name: 'Movies', query: { type: 'Movie', sort: 'popular' } },
  { id: 'title', name: 'A to Z', query: { sort: 'title' } },
];

const LANGS = {
  arabic: 'ar', english: 'en', french: 'fr', german: 'de', spanish: 'es', portuguese: 'pt', italian: 'it', russian: 'ru', indonesian: 'id', japanese: 'ja', chinese: 'zh', thai: 'th',
  vietnamese: 'vi', turkish: 'tr', hindi: 'hi', korean: 'ko', polish: 'pl', dutch: 'nl', swedish: 'sv', malay: 'ms', hebrew: 'he', greek: 'el', romanian: 'ro', czech: 'cs',
  hungarian: 'hu', bulgarian: 'bg', croatian: 'hr', danish: 'da', finnish: 'fi', norwegian: 'no', ukrainian: 'uk', filipino: 'fil', persian: 'fa', tamil: 'ta', telugu: 'te',
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limited(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(message));
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

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function usable(item) {
  return !!(item && item.slug && !/[^\x00-\x7f]/.test(String(item.slug)));
}

function parseSlug(mangaId) {
  let slug = String(mangaId || '');
  if (slug.indexOf('%') >= 0) {
    try {
      slug = decodeURIComponent(slug);
    } catch (e) {
    }
  }
  if (!slug || /[\s/\\?#&=]/.test(slug) || slug.length > 200) throw new Error('9ime: unknown title id ' + mangaId);
  return slug;
}

function cardCover(url) {
  const u = clean(url);
  return u.indexOf('/cover/large/') >= 0 ? u.replace('/cover/large/', '/cover/medium/') : u;
}

function statusOf(word) {
  const w = String(word || '').toLowerCase();
  if (w === 'ongoing') return 'ONGOING';
  if (w === 'completed') return 'COMPLETED';
  return 'UNKNOWN';
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

function arrayAt(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function parseDuration(text) {
  const m = /(\d+)\s*min/i.exec(String(text || ''));
  return m ? Number(m[1]) * 60 : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.malIds = new Map();
    this.watches = new Map();
    this.index = null;
    this.indexAt = 0;
    this.indexPending = null;
    this.ratingIndex().catch(() => {});
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
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
    if (response.status < 200 || response.status >= 300) throw new Error(`9ime: HTTP ${response.status}`);
    let data;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      throw new Error('9ime: its api answered something that is not JSON (try again in a minute)');
    }
    return data;
  }

  async html(url) {
    const response = await this.send(url, { accept: 'text/html' });
    if (response.status === 404) throw new Error('9ime: not found (HTTP 404; the site has no page for this title)');
    if (response.status < 200 || response.status >= 300) throw new Error(`9ime: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async titlePage(slug) {
    const hit = this.pages.get(slug);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this.html(`${SITE}/anime/${encodeURIComponent(slug)}`);
    this.pages.set(slug, { at: Date.now(), promise });
    promise.catch(() => this.pages.delete(slug));
    if (this.pages.size > 24) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  async watchFlight(slug, episode) {
    const hit = this.watches.get(slug);
    if (hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = this.html(`${SITE}/watch/${encodeURIComponent(slug)}?${qs({ ep: episode })}`).then(flightOf);
    this.watches.set(slug, { at: Date.now(), promise });
    promise.catch(() => this.watches.delete(slug));
    if (this.watches.size > 8) this.watches.delete(this.watches.keys().next().value);
    return promise;
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
    const set = new Set();
    let cursor = '';
    for (let page = 0; page < 40; page++) {
      const data = await this.json(`${SITE}/api/browse?${qs({ genre: 'Ecchi', sort: 'popular', cursor })}`);
      if (!data || data.ok !== true || !Array.isArray(data.items)) throw new Error('9ime: could not read which titles are rated 16, try again in a minute');
      for (const item of data.items) if (item && item.slug) set.add(String(item.slug));
      cursor = data.nextCursor || '';
      if (!cursor) return set;
    }
    throw new Error('9ime: the Ecchi list did not end, try again in a minute');
  }

  card(item, ecchi, allExplicit) {
    const slug = String(item.slug);
    const type = clean(item.type);
    const count = Number(item.totalEpisodes);
    const out = {
      mangaId: slug,
      title: clean(item.title) || slug,
      image: cardCover(item.thumbnail),
      medium: 'anime',
      ageRating: allExplicit || ecchi.has(slug) ? 16 : 0,
      webURL: `${SITE}/anime/${slug}`,
    };
    const parts = [];
    if (type) parts.push(type);
    if (count > 0) parts.push(`${count} ${count === 1 ? 'episode' : 'episodes'}`);
    const status = String(item.status || '').toLowerCase();
    if (status === 'upcoming') parts.push('Upcoming');
    else if (status === 'ongoing') parts.push('Airing');
    if (parts.length) out.summary = parts.join(', ');
    return out;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const tags = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const rated = this.ratingIndex();
    rated.catch(() => {});
    if (query) {
      if (metadata && (metadata.cursor || metadata.page > 1)) return { results: [], metadata: undefined };
      const html = await this.html(`${SITE}/search?${qs({ q: query })}`);
      const flight = flightOf(html);
      const results = [];
      const seen = new Set();
      const ecchi = await rated;
      const re = /"anime":(\{[^{}]*\})/g;
      let m;
      while ((m = re.exec(flight))) {
        let item;
        try {
          item = JSON.parse(m[1]);
        } catch (e) {
          continue;
        }
        if (!usable(item) || seen.has(item.slug)) continue;
        seen.add(item.slug);
        results.push(this.card(item, ecchi));
      }
      return { results, metadata: undefined };
    }
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const params = Object.assign({}, feed.query);
    let genre = '';
    if (tags.length) {
      const wanted = String(tags[0].id || tags[0]).toLowerCase();
      genre = GENRES.find((g) => g.toLowerCase() === wanted) || '';
      if (!genre) return { results: [], metadata: undefined };
      params.genre = genre;
    }
    let cursor = (metadata && metadata.cursor) || '';
    const ecchi = await rated;
    const results = [];
    let next = '';
    for (let round = 0; round < 3; round++) {
      params.cursor = cursor;
      const data = await this.json(`${SITE}/api/browse?${qs(params)}`);
      if (!data || data.ok !== true || !Array.isArray(data.items)) throw new Error('9ime: the list did not load, try again in a minute');
      for (const item of data.items) {
        if (!usable(item) || String(item.status).toLowerCase() === 'upcoming' || !(Number(item.totalEpisodes) > 0)) continue;
        results.push(this.card(item, ecchi, genre === 'Ecchi'));
      }
      next = data.nextCursor && data.items.length ? String(data.nextCursor) : '';
      if (results.length || !next) break;
      cursor = next;
    }
    return { results, metadata: next ? { cursor: next } : undefined };
  }

  async getMangaDetails(mangaId) {
    const slug = parseSlug(mangaId);
    const html = await this.titlePage(slug);
    const $ = cheerio.load(html);
    const title = clean($('h1').first().text());
    if (!title) throw new Error('9ime: title not found');
    const native = clean($('.anime-hero-inner .mono').first().text());
    const poster = clean($('.anime-hero-inner img').first().attr('src'));
    const backdrop = clean($('.anime-hero img').first().attr('src'));
    const genres = $('a.pill[href^="/genre/"]')
      .map((i, a) => clean($(a).text()))
      .get()
      .filter(Boolean);
    const synopsis = clean(
      $('.eyebrow')
        .filter((i, e) => /^Synopsis$/i.test(clean($(e).text())))
        .first()
        .next()
        .text()
    );
    const rows = {};
    $('aside table tr').each((i, tr) => {
      const cells = $(tr).children();
      if (cells.length >= 2) rows[clean($(cells[0]).text()).toLowerCase()] = clean($(cells[1]).text());
    });
    const info = {
      title,
      image: poster,
      desc: [synopsis, native && native !== title ? `Native title: ${native}` : ''].filter(Boolean).join('\n\n') || undefined,
      status: statusOf(rows.status),
      tags: genres,
      webURL: `${SITE}/anime/${slug}`,
      medium: 'anime',
      ageRating: genres.some((g) => /^ecchi$/i.test(g)) ? 16 : 0,
    };
    if (rows.studio) info.author = rows.studio;
    if (rows.aired && rows.aired !== '-') info.releaseDate = rows.aired;
    info.completed = info.status === 'COMPLETED';
    if (/^https?:\/\//.test(backdrop)) info.banner = backdrop.replace('/t/p/original/', '/t/p/w1280/');
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const slug = parseSlug(mangaId);
    const html = await this.titlePage(slug);
    const flight = flightOf(html);
    let rows = this.jsonArray(flight, '"episodes":', '9ime: the episode list of this page could not be read');
    const declared = Number((/"episodeCount":(\d+)/.exec(flight) || [])[1]) || 0;
    if (declared > rows.length) {
      const first = rows.length ? Number(rows[0].number) : 1;
      const whole = this.jsonArray(await this.watchFlight(slug, Number.isFinite(first) ? first : 1), '"allEpisodes":', '9ime: the full episode list could not be read');
      const known = new Map(rows.map((r) => [String(r && r.number), r]));
      rows = whole.map((r) => Object.assign({}, r, known.get(String(r && r.number)) || {}));
      if (rows.length < declared) throw new Error(`9ime: its episode list has ${rows.length} of ${declared} episodes, try again in a minute`);
    }
    if (!rows.length) {
      throw new Error(/upcoming/i.test(clean(cheerio.load(html)('aside table').text())) ? '9ime: this title has no episodes yet (upcoming)' : '9ime has no episodes for this title yet');
    }
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const n = Number(row && row.number);
      if (!Number.isFinite(n)) continue;
      const id = String(n);
      if (seen.has(id)) continue;
      seen.add(id);
      const own = clean(row.title && String(row.title).charAt(0) !== '$' ? row.title : '');
      const plain = `Episode ${id}`;
      const chapter = { id, chapterId: id, name: own && own !== plain ? `${plain}: ${own}` : plain, number: n };
      if (own && own !== plain) chapter.title = own;
      const thumb = clean(row.thumbnail);
      if (/^https?:\/\//.test(thumb)) chapter.thumbnail = thumb;
      const seconds = parseDuration(row.duration);
      if (seconds) chapter.duration = seconds;
      const summary = clean(row.description && String(row.description).charAt(0) !== '$' ? row.description : '');
      if (summary) chapter.summary = summary;
      out.push(chapter);
    }
    if (!out.length) throw new Error('9ime has no episodes for this title yet');
    out.sort((a, b) => b.number - a.number);
    return out;
  }

  jsonArray(flight, key, failure) {
    const at = flight.indexOf(key + '[');
    if (at < 0) return [];
    try {
      const rows = JSON.parse(arrayAt(flight, at + key.length));
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      throw new Error(failure);
    }
  }

  async serverAsk(server, slug, episode, type) {
    const response = await this.send(`${SITE}/api/watch/${server}?${qs({ slug, ep: episode, type })}`, { accept: 'application/json' });
    let data = null;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      return null;
    }
    if (!data || data.ok !== true || !Array.isArray(data.sources) || !data.sources.length) return null;
    return data;
  }

  async streamsOf(slug, episode, type) {
    const found = [];
    const known = new Set();
    const take = (data) => {
      if (!data) return;
      for (const source of data.sources) {
        const url = clean(source && source.url);
        const m = /^https:\/\/([a-z0-9.-]+)(\/[^?#\s]*\.m3u8)(\?[^\s]*)?$/i.exec(url);
        if (!m) continue;
        const key = m[1] + m[2];
        if (known.has(key)) continue;
        known.add(key);
        found.push({ url, host: m[1], path: m[2], tracks: Array.isArray(data.subtitleTracks) ? data.subtitleTracks : [] });
      }
    };
    take(await limited(this.serverAsk('zoro', slug, episode, type), 20000, '9ime: its zoro server did not answer').catch(() => null));
    if (!found.length) {
      const others = await Promise.all(['yuta', 'eren'].map((s) => limited(this.serverAsk(s, slug, episode, type), 20000, '9ime: its ' + s + ' server did not answer').catch(() => null)));
      others.forEach(take);
    }
    return found;
  }

  absolute(ref, base) {
    if (/^https?:\/\//i.test(ref)) return ref;
    const origin = (/^(https?:\/\/[^/]+)/i.exec(base) || [])[1] || '';
    if (ref.charAt(0) === '/') return origin + ref;
    return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + ref;
  }

  async proofOf(masterUrl) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const master = await this.send(masterUrl, { accept: '*/*' });
        const text = String(master.data || '');
        if (master.status !== 200 || text.indexOf('#EXTM3U') !== 0) continue;
        const lines = text.split('\n').map((l) => l.trim());
        const at = lines.findIndex((l) => l.indexOf('#EXT-X-STREAM-INF') === 0);
        let mediaUrl = masterUrl;
        let mediaText = text;
        if (at >= 0 && lines[at + 1]) {
          mediaUrl = this.absolute(lines[at + 1], masterUrl);
          const variant = await this.send(mediaUrl, { accept: '*/*' });
          if (variant.status !== 200) continue;
          mediaText = String(variant.data || '');
          if (mediaText.indexOf('#EXTM3U') !== 0) continue;
        }
        const segment = mediaText.split('\n').map((l) => l.trim()).find((l) => l && l.charAt(0) !== '#');
        if (!segment) continue;
        const got = await this.send(this.absolute(segment, mediaUrl), { accept: '*/*', headers: { Range: 'bytes=0-1023' } });
        if (got.status >= 200 && got.status < 300) return { text };
      } catch (e) {
        if (e && (e.kind === 'blocked' || e.kind === 'challenge' || /allowed hosts/i.test(String(e.message)))) throw e;
      }
      await pause(500);
    }
    return null;
  }

  subtitlesOf(tracks, onlyEnglish) {
    const out = [];
    const seen = new Set();
    for (const t of tracks) {
      const url = clean(t && t.url);
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
      const raw = clean(t.language);
      const name = clean(raw.replace(/\s*\(.*$/, '')) || 'Subtitles';
      const code = LANGS[name.toLowerCase()] || '';
      if (onlyEnglish && code !== 'en') continue;
      seen.add(url);
      const track = { url: ROUTE + encodeURIComponent(url), label: name };
      if (code) track.language = code;
      out.push(track);
    }
    out.sort((a, b) => (b.language === 'en' ? 1 : 0) - (a.language === 'en' ? 1 : 0));
    return out.slice(0, 30);
  }

  async skipTimes(slug, episode) {
    try {
      let mal = this.malIds.get(slug);
      if (mal === undefined) {
        const flight = await limited(this.watchFlight(slug, episode), 9000, 'skip');
        const m = /"malId":(\d+)/.exec(flight);
        mal = m ? Number(m[1]) : 0;
        this.malIds.set(slug, mal);
      }
      if (!mal) return {};
      const data = await limited(this.json(`${SITE}/api/skip-times?${qs({ malId: mal, ep: episode })}`), 6000, 'skip');
      const out = {};
      for (const kind of ['intro', 'outro']) {
        const r = data && data[kind];
        if (r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start) out[kind] = { start: Math.round(r.start * 1000), end: Math.round(r.end * 1000) };
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  async getVideos(mangaId, chapterId) {
    const slug = parseSlug(mangaId);
    const episode = clean(chapterId);
    if (!/^\d+(\.\d+)?$/.test(episode)) throw new Error('9ime: unknown episode ' + chapterId);
    const [subs, dubs, skip] = await Promise.all([this.streamsOf(slug, episode, 'sub'), this.streamsOf(slug, episode, 'dub'), this.skipTimes(slug, episode)]);
    const subPaths = new Set(subs.map((s) => s.host + s.path));
    const dubsOnly = dubs.filter((d) => !subPaths.has(d.host + d.path));
    const candidates = subs.map((s) => ({ kind: 'sub', s })).concat(dubsOnly.map((s) => ({ kind: 'dub', s })));
    if (!candidates.length) throw new Error('9ime has no stream for this episode yet');
    const proofs = await Promise.all(candidates.map((c) => limited(this.proofOf(ROUTE + encodeURIComponent(c.s.url)), 30000, '9ime: a stream did not answer').catch((e) => {
      if (e && (e.kind === 'blocked' || e.kind === 'challenge' || /allowed hosts/i.test(String(e.message)))) throw e;
      return null;
    })));
    const entries = [];
    candidates.forEach((c, i) => {
      const proof = proofs[i];
      if (!proof) return;
      let top = 0;
      let variants = 0;
      for (const line of proof.text.split('\n')) {
        if (line.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        variants++;
        const h = /RESOLUTION=\d+x(\d+)/.exec(line);
        if (h) top = Math.max(top, Number(h[1]));
      }
      const subtitles = this.subtitlesOf(c.s.tracks, c.kind === 'dub');
      let word = 'Dub';
      if (c.kind === 'sub') word = subtitles.some((t) => t.language === 'en') ? 'Softsub' : subtitles.length ? 'Sub' : 'Sub (no subtitle file)';
      const entry = {
        url: ROUTE + encodeURIComponent(c.s.url),
        type: 'hls',
        server: c.s.host.split('.').slice(-2, -1)[0].replace(/^./, (x) => x.toUpperCase()),
        quality: `${variants > 1 ? 'Auto' : top ? `${top}p` : 'Auto'} ${word}`,
      };
      if (subtitles.length) entry.subtitles = subtitles;
      if (skip.intro) entry.intro = skip.intro;
      if (skip.outro) entry.outro = skip.outro;
      entries.push({ entry, kind: c.kind, variants });
    });
    entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'sub' ? -1 : 1) || b.variants - a.variants || (a.entry.server < b.entry.server ? -1 : a.entry.server > b.entry.server ? 1 : 0));
    if (!entries.length) throw new Error('9ime: its streams for this episode did not answer (the stream hosts may be down), try again in a minute');
    return entries.map((e) => e.entry);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
