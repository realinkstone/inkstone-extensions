const SITE = 'https://kissbae.com';
const VIDOZEN = 'https://vidozen.xyz';
const VIDBOLT = 'https://vidbolt.pro';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const VIDBOLT_SERVERS = ['orion', 'vega', 'luna', 'callisto'];

const FEEDS = [
  { id: 'updated', name: 'Recently Updated', q: 'sort=updated' },
  { id: 'latest', name: 'Newest Release', q: 'sort=latest' },
  { id: 'popular', name: 'Most Popular', q: 'sort=popular' },
  { id: 'views', name: 'Most Viewed', q: 'sort=views' },
  { id: 'imdb', name: 'IMDb Score', q: 'sort=imdb' },
  { id: 'dramas', name: 'Dramas', q: 'type=TV_SHOW&sort=updated' },
  { id: 'movies', name: 'Movies', q: 'type=MOVIE&sort=updated' },
  { id: 'variety', name: 'Variety and Reality', q: 'type=REALITY_SHOW&sort=updated' },
  { id: 'airing', name: 'Airing Now', q: 'status=ONGOING&sort=updated' },
  { id: 'korea', name: 'South Korea', q: 'country=KR&sort=updated' },
  { id: 'china', name: 'China', q: 'country=CN&sort=updated' },
  { id: 'japan', name: 'Japan', q: 'country=JP&sort=updated' },
  { id: 'thailand', name: 'Thailand', q: 'country=TH&sort=updated' },
  { id: 'taiwan', name: 'Taiwan', q: 'country=TW&sort=updated' },
];

const EXPLICIT_KEYWORDS = [
  ['erotic-movie', 18], ['erotic', 18], ['sex', 18], ['pornography', 18], ['bdsm', 18], ['hentai', 18], ['sexual-content', 18], ['sexual-violence', 18],
  ['nudity', 16], ['rape', 16], ['incest', 16], ['prostitute', 16], ['sex-worker', 16],
];

const FALLBACK_GENRES = [
  ['action', 'Action'], ['action-adventure', 'Action & Adventure'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['crime', 'Crime'], ['documentary', 'Documentary'],
  ['drama', 'Drama'], ['family', 'Family'], ['fantasy', 'Fantasy'], ['history', 'History'], ['horror', 'Horror'], ['kids', 'Kids'], ['music', 'Music'],
  ['mystery', 'Mystery'], ['reality', 'Reality'], ['romance', 'Romance'], ['science-fiction', 'Science Fiction'], ['sci-fi-fantasy', 'Sci-Fi & Fantasy'],
  ['thriller', 'Thriller'], ['war', 'War'], ['war-politics', 'War & Politics'],
];

const ORIGINAL_LANGUAGE = {
  KR: /^korean/i,
  KP: /^korean/i,
  JP: /^japanese/i,
  CN: /^(mandarin|chinese)/i,
  TW: /^(mandarin|chinese)/i,
  HK: /^(cantonese|chinese|mandarin)/i,
  TH: /^thai/i,
  ID: /^indonesian/i,
  PH: /^(tagalog|filipino)/i,
  MY: /^malay/i,
  VN: /^vietnamese/i,
  IN: /^hindi/i,
};

const LANGUAGE_CODES = {
  english: 'en', arabic: 'ar', 'اَلْعَرَبِيَّةُ': 'ar', español: 'es', spanish: 'es', français: 'fr', french: 'fr', indonesian: 'id', indonesia: 'id', malay: 'ms',
  português: 'pt', portuguese: 'pt', русский: 'ru', russian: 'ru', filipino: 'fil', tagalog: 'tl', 'हिन्दी': 'hi', hindi: 'hi', 'اُردُو': 'ur', urdu: 'ur', 'বাংলা': 'bn',
  bengali: 'bn', korean: 'ko', japanese: 'ja', chinese: 'zh', thai: 'th', vietnamese: 'vi', khmer: 'km', turkish: 'tr', german: 'de', italian: 'it', hebrew: 'he',
};
const LANGUAGE_NAMES = {
  en: 'English', ar: 'Arabic', iw: 'Hebrew', he: 'Hebrew', es: 'Spanish', fr: 'French', id: 'Indonesian', ms: 'Malay', pt: 'Portuguese', ru: 'Russian', hi: 'Hindi',
  ur: 'Urdu', bn: 'Bengali', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', th: 'Thai', vi: 'Vietnamese', km: 'Khmer', tr: 'Turkish', de: 'German', it: 'Italian',
  fil: 'Filipino', tl: 'Tagalog', pt_br: 'Portuguese (Brazil)', nl: 'Dutch', pl: 'Polish', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian', el: 'Greek', sv: 'Swedish',
};

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = clean(url);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function thumbOf(url) {
  return clean(url).replace('/t/p/w1280/', '/t/p/w300/').replace('/t/p/original/', '/t/p/w300/');
}

function flightOf(html) {
  const marker = 'self.__next_f.push([1,"';
  let out = '';
  let from = 0;
  for (;;) {
    const at = html.indexOf(marker, from);
    if (at < 0) break;
    const begin = at + marker.length;
    let i = begin;
    for (;;) {
      const q = html.indexOf('"', i);
      if (q < 0) {
        i = html.length;
        break;
      }
      let back = 0;
      while (html.charCodeAt(q - 1 - back) === 92) back++;
      if (back % 2 === 0) {
        i = q;
        break;
      }
      i = q + 1;
    }
    const raw = html.slice(begin, i);
    try {
      out += JSON.parse('"' + raw + '"');
    } catch (e) {
      out += raw;
    }
    from = i + 1;
  }
  return out;
}

function balanced(s, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (inStr) {
      if (c === 92) i++;
      else if (c === 34) inStr = false;
      continue;
    }
    if (c === 34) inStr = true;
    else if (c === 123 || c === 91) depth++;
    else if (c === 125 || c === 93) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function objectAfter(flight, key) {
  const at = flight.indexOf(key);
  if (at < 0) return null;
  const start = at + key.length - 1;
  const text = balanced(flight, start);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function typeLabel(type) {
  return type === 'MOVIE' ? 'Movie' : type === 'REALITY_SHOW' ? 'Reality Show' : 'TV Series';
}

function mapStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ONGOING') return 'ONGOING';
  if (s === 'COMPLETED') return 'COMPLETED';
  return 'UNKNOWN';
}

function certAge(rating) {
  const t = clean(rating).toUpperCase();
  if (!t) return undefined;
  if (/^(NR|NOT RATED|UNRATED|N\/A)$/.test(t)) return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18\+?|R-?21\+?)$/.test(t)) return 18;
  if (/^(R|TV-?MA|MA)$/.test(t)) return 16;
  const n = /(?:^|[^0-9])(\d{1,2})(?:[^0-9]|$)/.exec(t);
  if (n) {
    return Number(n[1]) >= 16 ? 16 : 0;
  }
  if (/^(G|PG|TV-?G|TV-?PG|ALL|L|U|UA|P|D)$/.test(t)) return 0;
  return undefined;
}

function titleAge(title) {
  const t = clean(title);
  if (/\b(raped?|porn\w*|hentai|erotic\w*|xxx)\b/i.test(t)) return 18;
  if (/\b(sex|sexy|sexual|nude|naked|seduc\w*|bondage|lust|incest)\b/i.test(t)) return 16;
  return 0;
}

function plainError(message) {
  return new Error(message);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.bolt = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    this.titles = new Map();
    this.explicit = null;
    this.genres = null;
  }

  async text(url, headers, label, manager) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await (manager || this.requests).schedule(App.createRequest({ url, method: 'GET', headers: headers || { Accept: 'text/html,application/xhtml+xml' } }));
        if (response.status >= 500 && attempt === 0) {
          lastError = plainError(`${label || 'KissBae'}: HTTP ${response.status}`);
          continue;
        }
        return { status: response.status, text: String(response.data || '') };
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        lastError = e;
      }
    }
    throw lastError || plainError(`${label || 'KissBae'}: no answer`);
  }

  async page(path) {
    const r = await this.text(SITE + path, undefined, 'KissBae');
    if (r.status === 404) throw plainError('KissBae: not found (HTTP 404)');
    if (r.status < 200 || r.status >= 300) throw plainError(`KissBae: HTTP ${r.status}`);
    return flightOf(r.text);
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this.genres) return this.genres;
    try {
      const flight = await this.page('/browse');
      const seen = new Set();
      const list = [];
      const re = /\{"id":\d+,"name":"([^"]+)","slug":"([^"]+)","type":"genre","movieCount":(\d+)\}/g;
      let m;
      while ((m = re.exec(flight))) {
        if (seen.has(m[2]) || Number(m[3]) <= 0) continue;
        seen.add(m[2]);
        list.push({ id: m[2], label: m[1] });
      }
      if (list.length) {
        this.genres = list;
        return list;
      }
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    }
    return FALLBACK_GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  async explicitSets() {
    if (!this.explicit) {
      const run = (async () => {
        const map = new Map();
        const readKeyword = async (slug, age) => {
          const first = this.catalogOf(await this.page(`/browse?keyword=${encodeURIComponent(slug)}`));
          const pages = Math.min(first.totalPages || 1, 5);
          const all = first.items.slice();
          const rest = [];
          for (let p = 2; p <= pages; p++) rest.push(this.page(`/browse?keyword=${encodeURIComponent(slug)}&page=${p}`).then((f) => this.catalogOf(f).items));
          for (const items of await Promise.all(rest)) all.push(...items);
          for (const it of all) {
            if (it && it.slug && (map.get(it.slug) || 0) < age) map.set(it.slug, age);
          }
        };
        await Promise.all(EXPLICIT_KEYWORDS.map((k) => readKeyword(k[0], k[1])));
        return map;
      })();
      this.explicit = run;
      run.catch(() => {
        if (this.explicit === run) this.explicit = null;
      });
    }
    return this.explicit;
  }

  catalogOf(flight) {
    const catalog = objectAfter(flight, '"catalog":{');
    if (!catalog || !Array.isArray(catalog.items)) throw plainError('KissBae: the list data was not found in the page (the site changed its page format)');
    return { items: catalog.items, total: Number(catalog.total) || 0, page: Number(catalog.page) || 1, totalPages: Number(catalog.totalPages) || 1 };
  }

  cardOf(it, sets) {
    const card = {
      mangaId: String(it.slug),
      title: clean(it.title) || String(it.slug),
      image: absolute(it.posterUrl),
      summary: [it.year, typeLabel(it.type)].filter(Boolean).join(' '),
      tags: Array.isArray(it.genres) ? it.genres.map((g) => clean(g.name)).filter(Boolean) : [],
      medium: 'anime',
      webURL: `${SITE}/movie/${it.slug}`,
    };
    const cert = certAge(it.rating);
    const keyword = sets ? sets.get(String(it.slug)) : undefined;
    const byTitle = titleAge(it.title);
    if (sets) card.ageRating = Math.max(cert || 0, keyword || 0, byTitle);
    else if (cert !== undefined || byTitle > 0) card.ageRating = Math.max(cert || 0, byTitle);
    return card;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    let page = (metadata && Number(metadata.page)) || 1;
    if (page < 1) page = 1;
    let sets = null;
    try {
      sets = await this.explicitSets();
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    }

    const genre = included.length && included[0] && included[0].id ? String(included[0].id) : '';
    const base = query ? `q=${encodeURIComponent(query)}` : feed.q;
    const results = [];
    const seen = new Set();
    let next;
    for (let tries = 0; tries < (query ? 3 : 1); tries++) {
      const catalog = this.catalogOf(await this.page(`/browse?${base}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}${page > 1 ? `&page=${page}` : ''}`));
      let playable = 0;
      for (const it of catalog.items) {
        if (!it || !it.slug || !(Number(it.actualEpisodesCount) > 0)) continue;
        playable++;
        if (seen.has(it.slug)) continue;
        seen.add(it.slug);
        results.push(this.cardOf(it, sets));
      }
      const more = catalog.page < catalog.totalPages && (query ? true : playable === catalog.items.length && playable > 0);
      next = more ? { page: catalog.page + 1 } : undefined;
      if (results.length || !next) break;
      page = catalog.page + 1;
    }
    return { results, metadata: next };
  }

  title(slug) {
    const id = String(slug);
    const hit = this.titles.get(id);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = (async () => {
      const flight = await this.page(`/movie/${encodeURIComponent(id)}`);
      const movie = objectAfter(flight, '"movie":{');
      if (!movie || !movie.slug) throw plainError('KissBae: the title data was not found in the page (the site changed its page format)');
      return movie;
    })();
    this.titles.set(id, { at: Date.now(), promise });
    promise.catch(() => {
      const cur = this.titles.get(id);
      if (cur && cur.promise === promise) this.titles.delete(id);
    });
    return promise;
  }

  ageOfTitle(movie) {
    let age = Math.max(certAge(movie.rating) || 0, titleAge(movie.title));
    for (const k of Array.isArray(movie.keywords) ? movie.keywords : []) {
      const slug = k && k.slug;
      for (const e of EXPLICIT_KEYWORDS) {
        if (e[0] === slug && e[1] > age) age = e[1];
      }
    }
    return age;
  }

  async getMangaDetails(mangaId) {
    const m = await this.title(mangaId);
    const info = {
      title: clean(m.title) || String(m.slug),
      image: absolute(m.posterUrl),
      desc: clean(m.synopsis) || undefined,
      status: mapStatus(m.status),
      tags: Array.isArray(m.genres) ? m.genres.map((g) => clean(g.name)).filter(Boolean) : [],
      webURL: `${SITE}/movie/${m.slug}`,
      medium: 'anime',
      ageRating: this.ageOfTitle(m),
    };
    const banner = absolute(m.backdropUrl);
    if (banner) info.banner = banner;
    const directors = (Array.isArray(m.directors) ? m.directors : []).map((d) => clean(d && d.name)).filter(Boolean);
    if (directors.length) info.author = directors.slice(0, 3).join(', ');
    const cast = (Array.isArray(m.casts) ? m.casts : [])
      .slice(0, 30)
      .map((c) => {
        const person = { name: clean(c && c.name) };
        if (c && c.profileUrl) person.image = String(c.profileUrl);
        if (c && c.characterName) person.role = clean(c.characterName);
        return person;
      })
      .filter((c) => c.name);
    if (cast.length) info.cast = cast;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const m = await this.title(mangaId);
    const episodes = Array.isArray(m.episodes) ? m.episodes : [];
    if (!episodes.length) return [];
    const seasons = new Set(episodes.map((e) => Number(e.seasonNumber) || 1));
    const many = seasons.size > 1;
    const isMovie = m.type === 'MOVIE';
    const rows = episodes.map((e) => {
      const season = Number(e.seasonNumber) || 1;
      const number = Number(e.episodeNumber) || 0;
      const own = clean(e.title);
      const generic = !own || /^episode\s+\d+$/i.test(own) || /^full movie$/i.test(own);
      const row = {
        id: `${season}:${number}`,
        chapterId: `${season}:${number}`,
        name: isMovie ? 'Full Movie' : generic ? `Episode ${number}` : `Episode ${number}: ${own}`,
        number: number || 1,
      };
      if (!isMovie && !generic) row.title = own;
      const thumb = thumbOf(e.thumbnailUrl);
      if (thumb) row.thumbnail = thumb;
      const t = e.airDate ? Date.parse(String(e.airDate)) : NaN;
      if (Number.isFinite(t)) row.time = t;
      if (many) {
        row.season = String(season);
        row.seasonName = `Season ${season}`;
      }
      return row;
    });
    rows.sort((a, b) => (Number(b.season || 1) - Number(a.season || 1)) || b.number - a.number);
    const seen = new Set();
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    const m = await this.title(mangaId);
    const match = /^(\d+):(\d+)$/.exec(String(chapterId));
    if (!match) throw plainError(`KissBae: unknown episode id ${chapterId}`);
    const episode = (Array.isArray(m.episodes) ? m.episodes : []).find((e) => (Number(e.seasonNumber) || 1) === Number(match[1]) && Number(e.episodeNumber) === Number(match[2]));
    if (!episode) throw plainError('KissBae: this episode is not in the title any more');
    const servers = Array.isArray(episode.servers) ? episode.servers : [];
    if (!servers.length) throw plainError('KissBae lists no server for this episode yet. A new episode can take a few hours, try again later.');

    const vz = servers.find((s) => s && s.serverCode === 'VIDOZEN' && /^https:\/\/vidozen\.xyz\//.test(String(s.embedUrl || '')));
    const vb = servers.find((s) => s && s.serverCode === 'VIDBOLDPRO' && /^https:\/\/vidbolt\.pro\/embed\//.test(String(s.embedUrl || '')));
    const asks = [];
    if (vz) asks.push(this.fromVidoZen(String(vz.embedUrl)));
    if (vb) {
      const country = Array.isArray(m.originCountry) && m.originCountry.length ? String(m.originCountry[0]) : '';
      asks.push(this.fromVidBolt(String(vb.embedUrl), country));
    }
    const settled = await Promise.all(asks.map((p) => p.then((value) => ({ value }), (error) => ({ error }))));
    const videos = [];
    const problems = [];
    let challenge = null;
    const seenUrls = new Set();
    for (const s of settled) {
      if (s.error) {
        if (s.error.kind === 'challenge') challenge = s.error;
        problems.push(clean(s.error.message || s.error));
        continue;
      }
      for (const v of s.value) {
        if (!v || !v.url || seenUrls.has(v.url)) continue;
        seenUrls.add(v.url);
        videos.push(v);
      }
    }
    if (!videos.length) {
      if (challenge) throw challenge;
      const others = servers.filter((s) => s && s.serverCode !== 'VIDOZEN' && s.serverCode !== 'VIDBOLDPRO').map((s) => s.serverCode);
      const say = problems.filter((p, i) => p && problems.indexOf(p) === i).slice(0, 2).join('; ');
      throw plainError(`KissBae has no stream this app can read for this episode${say ? ` (${say})` : ''}${others.length ? `. The site also lists ${others.join(', ')}, which this source does not read` : ''}.`);
    }
    return videos;
  }

  async fromVidoZen(embedUrl) {
    const r = await this.text(embedUrl, { Accept: 'text/html,application/xhtml+xml', 'User-Agent': UA }, 'VidoZen');
    if (r.status !== 200) throw plainError(`VidoZen: HTTP ${r.status}`);
    const at = r.text.indexOf('window.VZ=');
    if (at < 0) throw plainError('VidoZen: no player data in the page');
    const start = r.text.indexOf('{', at);
    const body = start >= 0 ? balanced(r.text, start) : null;
    let vz = null;
    try {
      vz = body ? JSON.parse(body) : null;
    } catch (e) {
      vz = null;
    }
    if (!vz || !/^https?:\/\//.test(String(vz.src || ''))) throw plainError('VidoZen: no stream in the player data');
    const subtitles = [];
    const used = new Set();
    for (const s of Array.isArray(vz.subs) ? vz.subs : []) {
      if (!s || !/^https?:\/\//.test(String(s.src || ''))) continue;
      const base = clean(s.label) || clean(s.lang) || 'Subtitles';
      let label = base;
      for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
      used.add(label.toLowerCase());
      subtitles.push({ url: String(s.src), label, language: clean(s.lang) || LANGUAGE_CODES[base.toLowerCase()] || 'und', format: 'vtt' });
    }
    const ordered = subtitles.filter((s) => s.language === 'en').concat(subtitles.filter((s) => s.language !== 'en'));
    const video = {
      url: String(vz.src),
      quality: `Auto, ${subtitlesNote(ordered)}`,
      type: 'hls',
      server: 'VidoZen',
    };
    if (ordered.length) video.subtitles = ordered;
    return [video];
  }

  async boltCall(embedUrl, prefer, ms) {
    const m = /^https:\/\/vidbolt\.pro\/embed\/(tv|movie)\/(\d+)(?:\/(\d+)\/(\d+))?/.exec(embedUrl);
    if (!m) throw plainError('VidBolt: unknown embed address');
    let query = `type=${m[1]}&id=${m[2]}`;
    if (m[1] === 'tv') query += `&season=${m[3] || 1}&episode=${m[4] || 1}`;
    if (prefer) query += `&prefer=${prefer}`;
    const response = await withTimeout(
      this.text(`${VIDBOLT}/api/resolve?${query}`, { Accept: 'application/json', Referer: embedUrl.split('?')[0], 'User-Agent': UA }, 'VidBolt', this.bolt),
      ms,
      'VidBolt did not answer in time',
    );
    if (response.status === 429) throw plainError('VidBolt asked to slow down (HTTP 429), try again in a few seconds');
    if (response.status !== 200) throw plainError(`VidBolt: HTTP ${response.status}`);
    let json = null;
    try {
      json = JSON.parse(response.text);
    } catch (e) {
      throw plainError('VidBolt: the answer was not JSON');
    }
    const stream = json && json.stream;
    return stream && Array.isArray(stream.sources) && stream.sources.length ? stream : null;
  }

  async fromVidBolt(embedUrl, country) {
    const first = await this.boltCall(embedUrl, '', 25000);
    if (!first) throw plainError('VidBolt has no stream for this title');
    const found = {};
    found[first.server] = first;
    const others = VIDBOLT_SERVERS.filter((n) => n !== first.server);
    const answers = await Promise.all(others.map((n) => this.boltCall(embedUrl, n, 7000).then((st) => st, () => null)));
    others.forEach((n, i) => {
      if (answers[i] && answers[i].server === n) found[n] = answers[i];
    });
    const out = [];
    for (const n of VIDBOLT_SERVERS) {
      if (found[n]) out.push(...this.boltEntries(n, found[n], country));
    }
    for (const n of Object.keys(found)) {
      if (VIDBOLT_SERVERS.indexOf(n) < 0) out.push(...this.boltEntries(n, found[n], country));
    }
    if (!out.length) throw plainError('VidBolt has no stream this app can read for this title');
    return out;
  }

  boltEntries(serverName, stream, country) {
    const subs = vidBoltSubtitles(stream.subtitles);
    const usable = stream.sources.filter((x) => x && /^https:\/\//.test(String(x.url || '')) && (x.kind === 'hls' || x.kind === 'mp4'));
    if (!usable.length) return [];
    const name = `VidBolt ${serverName.charAt(0).toUpperCase()}${serverName.slice(1)}`;
    const make = (x, label) => {
      const mp4 = x.kind === 'mp4';
      const q = clean(x.quality) || '720p';
      const entry = { url: String(x.url), quality: label(q, mp4), type: mp4 ? 'mp4' : 'hls', server: name };
      if (subs.length) entry.subtitles = subs;
      return entry;
    };
    if (serverName === 'orion') {
      const src = usable[0];
      const info = describeMaster(src.master);
      const parts = [`${clean(src.quality) || '1080p'} Auto`];
      if (info.audio.length) parts.push(`Audio: ${info.audio.slice(0, 3).join(', ')}${info.audio.length > 3 ? ` and ${info.audio.length - 3} more` : ''}`);
      parts.push(info.subs.length ? `Softsub: ${info.subs.slice(0, 3).join(', ')}${info.subs.length > 3 ? ` and ${info.subs.length - 3} more` : ''}` : 'Sub');
      return [{ url: String(src.url), quality: parts.join(', '), type: 'hls', server: name }];
    }
    if (serverName === 'luna') return [make(usable[0], (q) => `${q} Auto, ${subtitlesNote(subs)}`)];
    const dubs = usable.filter((x) => !/\bsub$/i.test(clean(x.language)));
    const original = ORIGINAL_LANGUAGE[country] ? dubs.find((x) => ORIGINAL_LANGUAGE[country].test(clean(x.language))) : undefined;
    const english = dubs.find((x) => /^english/i.test(clean(x.language)));
    const wanted = [];
    if (original) wanted.push(original);
    if (english && english !== original) wanted.push(english);
    if (!wanted.length) wanted.push(usable[0]);
    const hevc = serverName === 'callisto' ? ', HEVC' : '';
    return wanted.map((x) => make(x, (q, mp4) => `${q}${mp4 ? '' : ' Auto'}, ${clean(x.language) ? clean(x.language) + ' audio' : 'Original audio'}${hevc}, ${subtitlesNote(subs)}`));
  }
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(message));
    }, ms);
    promise.then(
      (v) => {
        if (done) return;
        done = true;
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        reject(e);
      },
    );
  });
}

function subtitlesNote(list) {
  if (!list || !list.length) return 'Sub';
  const names = list.map((s) => s.label);
  return `Softsub: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

function describeMaster(master) {
  const audio = [];
  const subs = [];
  for (const line of String(master || '').split('\n')) {
    if (line.indexOf('#EXT-X-MEDIA:') !== 0) continue;
    const name = (/NAME="([^"]*)"/.exec(line) || [])[1];
    if (!name) continue;
    const label = name.replace(/^\d+\.\s*/, '').replace(/\s*\[CC\]\s*$/i, '');
    if (/TYPE=AUDIO/.test(line)) {
      if (audio.indexOf(label) < 0) audio.push(label);
    } else if (/TYPE=SUBTITLES/.test(line)) {
      if (subs.indexOf(label) < 0) subs.push(label);
    }
  }
  const eng = audio.indexOf('English');
  if (eng > 0) {
    audio.splice(eng, 1);
    audio.unshift('English');
  }
  return { audio, subs };
}

function vidBoltSubtitles(list) {
  const out = [];
  const used = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !/^https?:\/\//.test(String(s.url || ''))) continue;
    const raw = clean(s.label) || clean(s.lang) || 'Subtitles';
    const lang = clean(s.lang);
    const bare = /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(raw);
    let code = LANGUAGE_CODES[raw.toLowerCase()] || LANGUAGE_CODES[raw] || (bare ? raw : /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(lang) ? lang : 'und');
    if (code === 'iw') code = 'he';
    const label = LANGUAGE_NAMES[code.toLowerCase().replace('-', '_')] || raw;
    const key = label.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    const url = String(s.url);
    out.push({ url, label, language: code, format: /\.srt(\?|$)/i.test(url) ? 'srt' : 'vtt' });
  }
  const english = out.filter((x) => x.language === 'en');
  const rest = out.filter((x) => x.language !== 'en');
  return english.concat(rest).slice(0, 6);
}

module.exports = { Source };
