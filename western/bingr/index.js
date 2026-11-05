const SITE = 'https://bingr.one';
const API = 'https://api.bingr.one';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SEAL_KEY = 'vY7#qL2!mZ9@wK4$';

const FEEDS = [
  { id: 'trending', name: 'Trending', path: '/api/trending/all' },
  { id: 'movies', name: 'Movies', path: '/api/discover/movie', kind: 'movie' },
  { id: 'series', name: 'Series', path: '/api/discover/tv', kind: 'tv' },
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

const AUDIO_NAMES = { Ptbr: 'Portuguese (Brazil)', Esla: 'Spanish (Latin America)', Ukr: 'Ukrainian' };
const SUBTITLE_CODES = {
  English: 'en', 'Français': 'fr', 'Português': 'pt', 'Русский': 'ru', 'हिन्दी': 'hi',
  Indonesian: 'id', Malay: 'ms', Filipino: 'fil', Kiswahili: 'sw', '中文': 'zh', 'Українська': 'uk',
  'বাংলা': 'bn', 'ਪੰਜਾਬੀ': 'pa', Spanish: 'es', 'Español': 'es', Deutsch: 'de', Italiano: 'it',
};

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Bingr: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: parseInt(m[2], 10) };
}

function ageRatingOfCertificate(raw, mature) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A') return mature === true ? 16 : undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|7|10)$/.test(c)) return 0;
  return 16;
}

function today() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function base64urlBytes(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = [];
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < text.length; i++) {
    let v = alphabet.indexOf(text.charAt(i));
    if (v < 0) {
      const c = text.charAt(i);
      if (c === '+') v = 62;
      else if (c === '/') v = 63;
      else continue;
    }
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return bytes;
}

function utf8Text(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp;
    if (b < 128) cp = b;
    else if (b < 224) cp = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 240) {
      cp = ((b & 15) << 12) | ((bytes[i] & 63) << 6) | (bytes[i + 1] & 63);
      i += 2;
    } else {
      cp = ((b & 7) << 18) | ((bytes[i] & 63) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      i += 3;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else out += String.fromCharCode(cp);
  }
  return out;
}

function unseal(sealed) {
  if (String(sealed).indexOf('v1.') !== 0) throw new Error('Bingr: the stream list is not in the format this source knows');
  const all = base64urlBytes(String(sealed).slice(3));
  const nonce = all.slice(0, 12);
  const body = all.slice(12);
  const seeds = [];
  for (let n = 0; n < 4; n++) {
    let h = (0x811c9dc5 ^ Math.imul(0x9e3779b9, n)) >>> 0;
    for (let i = 0; i < SEAL_KEY.length; i++) h = Math.imul(h ^ SEAL_KEY.charCodeAt(i), 0x1000193) >>> 0;
    for (let i = 0; i < nonce.length; i++) h = Math.imul(h ^ nonce[i], 0x1000193) >>> 0;
    seeds.push(h);
  }
  let a = seeds[0];
  let b = seeds[1];
  let c = seeds[2];
  let d = seeds[3];
  let word = 0;
  for (let t = 0; t < body.length; t++) {
    if ((t & 3) === 0) {
      c >>>= 0;
      d >>>= 0;
      a >>>= 0;
      b >>>= 0;
      let x = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (((c << 21) | (c >>> 11)) + (x = (x + (d = (d + 1) | 0)) | 0)) | 0;
      word = x >>> 0;
    }
    body[t] ^= (word >>> ((t & 3) * 8)) & 255;
  }
  return JSON.parse(utf8Text(body));
}

function flightOf(html) {
  const pieces = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      pieces.push(JSON.parse('"' + m[1] + '"'));
    } catch (e) {
    }
  }
  return pieces.join('');
}

function sealedOf(all) {
  const ref = /"sealed":"\$([0-9a-f]+)"/.exec(all);
  if (!ref) return null;
  const chunk = new RegExp('(?:^|\\n)' + ref[1] + ':T([0-9a-f]+),').exec(all);
  if (!chunk) return null;
  const start = chunk.index + chunk[0].length;
  return all.substr(start, parseInt(chunk[1], 16));
}

function tokenOf(all) {
  const m = /"token":"([^"]+)"/.exec(all);
  return m ? m[1] : '';
}

const ALTERNATES = {
  singularity: { label: 'Edge', headers: true },
  citadel: { label: 'Citadel' },
  flux: { label: 'Flux' },
  evion: { label: 'Evion', headers: true },
};

function subtitleFormat(url) {
  const m = /\.(srt|vtt)(?:[?#]|$)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRES).map((id) => ({ id, label: GENRES[id].label }));
  }

  mapItem(item) {
    if (!item || (item.type !== 'movie' && item.type !== 'tv') || !item.id) return null;
    const title = cleanText(item.title);
    if (!title) return null;
    return {
      mangaId: `${item.type}~${item.id}`,
      title,
      image: cleanText(item.poster),
      ageRating: item.adult === true ? 18 : this.ages.get(`${item.type}~${item.id}`),
      webURL: `${SITE}/${item.type}/${item.id}`,
      medium: 'anime',
    };
  }

  async ageOf(mangaId) {
    if (this.ages.has(mangaId)) return this.ages.get(mangaId);
    try {
      const { kind, tmdb } = parseId(mangaId);
      const d = await this.json(`${API}/api/details/${kind}/${tmdb}?v=1`);
      const age = d.adult === true ? 18 : ageRatingOfCertificate(d.certification, d.mature);
      this.ages.set(mangaId, age);
      return age;
    } catch (e) {
      console.error('Bingr certificate lookup failed for ' + mangaId + ': ' + (e && e.message));
      return undefined;
    }
  }

  async rate(results) {
    for (let i = 0; i < results.length; i += 5) {
      const batch = results.slice(i, i + 5);
      const ages = await Promise.all(batch.map((r) => (r.ageRating === 18 ? 18 : this.ageOf(r.mangaId))));
      batch.forEach((r, at) => {
        if (ages[at] !== undefined) r.ageRating = ages[at];
      });
    }
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) url = `${API}/api/search?q=${encodeURIComponent(query)}&type=multi&page=${page}`;
    else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
      const tag = included.length ? String(included[0].id || included[0]) : '';
      url = `${API}${feed.path}?page=${page}`;
      if (tag && feed.kind) {
        const genre = GENRES[tag] && GENRES[tag][feed.kind];
        if (!genre) return { results: [] };
        url += `&with_genres=${genre}`;
      }
    }
    const data = await this.json(url);
    const list = data && Array.isArray(data.results) ? data.results : [];
    let results = list.map((x) => this.mapItem(x)).filter(Boolean);
    if (query) results = await this.rate(results);
    const total = Math.min(Number((data && data.total_pages) || 1), 500);
    return results.length > 0 && page < total ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const d = await this.json(`${API}/api/details/${kind}/${tmdb}?v=1`);
    const title = cleanText(d.title);
    if (!title) throw new Error('Bingr: title not found');
    const status = kind === 'movie' ? 'COMPLETED' : /returning|production|planned|pilot/i.test(String(d.status || '')) ? 'ONGOING' : /ended|cancel/i.test(String(d.status || '')) ? 'COMPLETED' : 'UNKNOWN';
    const info = {
      title,
      image: cleanText(d.poster),
      desc: cleanText(d.overview),
      status,
      completed: status === 'COMPLETED',
      tags: (Array.isArray(d.genres) ? d.genres : []).map((g) => cleanText(g && g.name ? g.name : g)).filter(Boolean),
      webURL: `${SITE}/${kind}/${tmdb}`,
      medium: 'anime',
    };
    const people = (Array.isArray(d.directors) ? d.directors : []).map((p) => cleanText(p && p.name ? p.name : p)).filter(Boolean);
    if (people.length) info.author = people.join(', ');
    const year = /\d{4}/.exec(String(d.year || ''));
    if (year) info.releaseDate = year[0];
    const age = d.adult === true ? 18 : ageRatingOfCertificate(d.certification, d.mature);
    if (age !== undefined) {
      info.ageRating = age;
      this.ages.set(mangaId, age);
    }
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const first = await this.json(`${SITE}/api/episodes?kind=tv&tmdb=${tmdb}&s=1`);
    const seasons = (Array.isArray(first.seasons) ? first.seasons : []).map((s) => s.id).filter((n) => Number.isFinite(n) && n >= 1);
    if (!seasons.length) throw new Error('Bingr has no episodes for this series yet');
    const loaded = { 1: first };
    const rest = seasons.filter((n) => n !== 1);
    for (let i = 0; i < rest.length; i += 3) {
      const batch = rest.slice(i, i + 3);
      const answers = await Promise.all(
        batch.map((n) =>
          this.season(tmdb, n)
        )
      );
      batch.forEach((n, at) => {
        loaded[n] = answers[at];
      });
    }
    const rows = [];
    const now = today();
    seasons.forEach((season) => {
      const answer = loaded[season];
      ((answer && answer.episodes) || []).forEach((ep) => {
        const air = String(ep.airDate || '');
        if (air && air > now) return;
        const number = Number(ep.n);
        if (!Number.isFinite(number)) return;
        const name = cleanText(ep.title);
        const row = { id: `s${season}e${number}`, name: name ? `Episode ${number}: ${name}` : `Episode ${number}`, number, season };
        if (name) row.title = name;
        if (/^https?:\/\//.test(String(ep.still || ''))) row.thumbnail = String(ep.still);
        if (cleanText(ep.overview)) row.summary = cleanText(ep.overview);
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(air);
        if (m) row.time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('Bingr has no aired episodes for this series yet');
    rows.sort((x, y) => y.season - x.season || y.number - x.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: r.name, number: r.number };
      if (r.time !== undefined) out.time = r.time;
      ['title', 'thumbnail', 'summary'].forEach((k) => {
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
        return await this.json(`${SITE}/api/episodes?kind=tv&tmdb=${tmdb}&s=${n}`);
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw new Error(`Bingr: season ${n} did not load (${last && last.message}), try again`);
  }

  async getVideos(mangaId, chapterId) {
    const { kind, tmdb } = parseId(mangaId);
    let path;
    if (kind === 'movie') path = `/watch/movie/${tmdb}`;
    else {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('Bingr: unknown episode id ' + chapterId);
      path = `/watch/tv/${tmdb}/${ep[1]}/${ep[2]}`;
    }
    let payload = null;
    let token = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await this.text(`${SITE}${path}${attempt ? `?r=${attempt}` : ''}`);
      const flight = flightOf(page);
      const sealed = sealedOf(flight);
      let found = null;
      if (sealed) {
        try {
          found = unseal(sealed);
        } catch (e) {
          found = null;
        }
      }
      if (found) {
        payload = found;
        token = tokenOf(flight);
        if (Array.isArray(found.streams) && found.streams.length) break;
      }
    }
    if (!payload) throw new Error('Bingr: the title page held no stream list');
    const usable = (list) => (Array.isArray(list) ? list.filter((s) => s && /^https?:\/\//.test(String(s.url || ''))) : []);

    const main = usable(payload.streams);
    const rank = (s) => (/^english$/i.test(s.language) ? 0 : /^original$/i.test(s.language) ? 1 : 2);
    const height = (s) => parseInt(String(s.quality || '').replace(/\D/g, ''), 10) || 0;
    main.sort((x, y) => rank(x) - rank(y) || String(x.language).localeCompare(String(y.language)) || height(y) - height(x));
    const videos = main.map((s) => this.videoOf(s));

    const ids = (Array.isArray(payload.servers) ? payload.servers : []).map((x) => x && x.id).filter((id) => ALTERNATES[id]);
    const answers = token
      ? await Promise.all(
          ids.map((id) =>
            this.alternate(kind, tmdb, id, token, chapterId).then(
              (list) => ({ id, list }),
              (error) => ({ id, error })
            )
          )
        )
      : [];
    answers.forEach((a) => {
      (a.list || []).forEach((s) => videos.push(this.videoOf(s, ALTERNATES[a.id])));
    });
    if (!videos.length) {
      const challenged = answers.find((a) => a.error && a.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      throw new Error(`Bingr: ${cleanText(payload.error) || 'no stream for this title yet'}`);
    }
    return videos;
  }

  async alternate(kind, tmdb, provider, token, chapterId) {
    let url = `${SITE}/api/sources?kind=${kind}&t=${encodeURIComponent(token)}&provider=${provider}&tmdb=${tmdb}`;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) return [];
      url += `&s=${ep[1]}&e=${ep[2]}`;
    }
    const text = (await this.text(url, { Accept: 'text/plain,*/*' })).trim();
    const body = unseal(text);
    return Array.isArray(body.streams) ? body.streams.filter((s) => s && /^https?:\/\//.test(String(s.url || ''))) : [];
  }

  videoOf(stream, server) {
    const lang = cleanText(stream.language);
    const parts = [];
    if (server) parts.push(server.label);
    if (lang) {
      const hard = /^(.*?)\s+sub$/i.exec(lang);
      const name = AUDIO_NAMES[lang] || lang;
      if (hard) parts.push(`Original audio, Hardsub ${AUDIO_NAMES[hard[1]] || hard[1]}`);
      else if (/^original$/i.test(lang)) parts.push('Original audio');
      else if (/^english$/i.test(lang)) parts.push('English audio');
      else parts.push(`${name} audio Dub`);
    }
    const quality = cleanText(stream.quality);
    if (quality) parts.push(quality);
    const subtitles = [];
    (Array.isArray(stream.subtitles) ? stream.subtitles : []).forEach((t) => {
      if (!t || !/^https?:\/\//.test(String(t.url || ''))) return;
      const label = cleanText(t.label || t.lang) || 'Subtitles';
      const entry = { url: t.url, label, language: SUBTITLE_CODES[label] || SUBTITLE_CODES[cleanText(t.lang)] || label };
      const format = subtitleFormat(t.url);
      if (format) entry.format = format;
      subtitles.push(entry);
    });
    if (subtitles.length) {
      const english = subtitles.some((t) => t.language === 'en');
      parts.push(subtitles.length <= 3 ? 'Softsub: ' + subtitles.map((t) => t.label).join(', ') : english ? `Softsub: English and ${subtitles.length - 1} more` : `Softsub: ${subtitles.length} languages`);
    }
    const video = { url: stream.url, quality: parts.join(', ') || 'Auto', type: 'hls', server: server && server.label ? server.label : 'Bingr' };
    if (subtitles.length) video.subtitles = subtitles;
    if (server && server.headers) video.headers = { Referer: `${SITE}/`, Origin: SITE };
    return video;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url) {
    const text = await this.text(url, { Accept: 'application/json' });
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Bingr returned a page that is not data');
    }
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
    if (response.status === 404) throw new Error('Bingr: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Bingr: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
