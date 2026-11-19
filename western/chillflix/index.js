const CATALOGS = ['https://www.chillflix.lol', 'https://toflix.co', 'https://vuflix.co'];
const PLAYER = 'https://www.chillflix.pw';
const VIX = 'https://vixsrc.to';
const SCRAPER = 'https://scrapper.rivestream.app';
const IMG = 'https://image.tmdb.org/t/p/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const XPASS = { Referer: 'https://play.xpass.top/', Origin: 'https://play.xpass.top' };

const HARD_MS = 13000;
const SOFT_MS = 3000;
const VIX_GRACE_MS = 2500;
const RATE_BUDGET_MS = 2500;

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', sort: 'popularity.desc' },
  { id: 'series-popular', name: 'Series: Popular', kind: 'tv', sort: 'popularity.desc' },
  { id: 'movies-top', name: 'Movies: Most voted', kind: 'movie', sort: 'vote_count.desc' },
  { id: 'series-top', name: 'Series: Most voted', kind: 'tv', sort: 'vote_count.desc' },
  { id: 'movies-gross', name: 'Movies: Top grossing', kind: 'movie', sort: 'revenue.desc' },
  { id: 'movies-new', name: 'Movies: Newest', kind: 'movie', sort: 'primary_release_date.desc' },
  { id: 'series-new', name: 'Series: Newest', kind: 'tv', sort: 'first_air_date.desc' },
];

const MOVIE_GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
const TV_GENRES = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery',
  10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

const LANGUAGE_CODES = {
  english: 'en', arabic: 'ar', hebrew: 'he', japanese: 'ja', korean: 'ko', romanian: 'ro', thai: 'th', croatian: 'hr', czech: 'cs', dansk: 'da', danish: 'da',
  deutsch: 'de', german: 'de', french: 'fr', greek: 'el', hungarian: 'hu', icelandic: 'is', indonesian: 'id', italiano: 'it', italian: 'it', malay: 'ms',
  nederlands: 'nl', dutch: 'nl', polish: 'pl', russian: 'ru', spanish: 'es', turkish: 'tr', ukrainian: 'uk', hindi: 'hi', tamil: 'ta', telugu: 'te',
  kannada: 'kn', malayalam: 'ml', bengali: 'bn', chinese: 'zh', vietnamese: 'vi', albanian: 'sq', persian: 'fa', urdu: 'ur', swedish: 'sv', finnish: 'fi',
};

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
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

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await fn(items[at], at);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Chillflix: unknown title id ' + mangaId);
  return { kind: m[1], id: parseInt(m[2], 10) };
}

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A' || c === '-') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|7|10)$/.test(c)) return 0;
  return 16;
}

const EXPLICIT_TITLE = /\b(porn\w*|hentai|softcore|erotica|gangbang|bukkake|sexploitation|orgy)\b/i;
const SUGGESTIVE_TITLE = /\b(erotic|emmanuelle|nudes?|naked|sexy|sex|seduction|seduce\w*|striptease|stripper|playboy|playgirl)\b/i;

const EXPLICIT_TEXT = /\b(porn\w*|hentai|softcore|erotica|gangbang|bukkake|sexploitation|orgy|orgies)\b/i;
const SUGGESTIVE_TEXT = /\b(erotic\w*|nude|nudity|naked|striptease|stripper|sexy)\b/i;

function ageOfText(text) {
  const t = String(text || '');
  if (EXPLICIT_TEXT.test(t)) return 18;
  if (SUGGESTIVE_TEXT.test(t)) return 16;
  return undefined;
}

function ageOfTitle(title) {
  const t = String(title || '');
  if (/\bnaked gun\b/i.test(t)) return undefined;
  if (EXPLICIT_TITLE.test(t)) return 18;
  if (SUGGESTIVE_TITLE.test(t)) return 16;
  return undefined;
}

function higher(a, b) {
  return a === undefined ? b : b === undefined ? a : Math.max(a, b);
}

function ageOfFlags(d) {
  return d && (d.adult === true || d.softcore === true) ? 18 : undefined;
}

function languageCode(name) {
  const key = clean(name).toLowerCase().replace(/\s*\(.*\)\s*$/, '').replace(/\s+bokm.l$/, '');
  if (LANGUAGE_CODES[key]) return LANGUAGE_CODES[key];
  if (key === 'norwegian') return 'no';
  if (key.indexOf('portugu') === 0) return 'pt';
  return key.slice(0, 2) || 'und';
}

function plainImage(url) {
  const raw = String(url || '');
  const m = /^https:\/\/wsrv\.nl\/\?(?:[^#]*&)?url=([^&]+)/.exec(raw);
  if (!m) return raw;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return raw;
  }
}

function posterOf(path, size) {
  return path ? `${IMG}${size}${path}` : '';
}

function yearOf(date) {
  const m = /^(\d{4})/.exec(String(date || ''));
  return m ? m[1] : '';
}

function statusOfShow(text) {
  const t = String(text || '').toLowerCase();
  if (/returning|in production|planned|pilot/.test(t)) return 'ONGOING';
  if (/ended|cancel/.test(t)) return 'COMPLETED';
  return 'UNKNOWN';
}

function citadelParts(quality) {
  const parts = String(quality || '').split('|');
  return { height: parseInt(parts[0], 10) || 0, language: clean(parts[1]) };
}

function captionName(file) {
  let name = String(file || '').split('?')[0].split('/').pop() || '';
  try {
    name = decodeURIComponent(name);
  } catch (e) {
  }
  return clean(name.replace(/\.(vtt|srt)$/i, ''));
}

function subtitlesOf(captions) {
  const out = [];
  const seen = {};
  (Array.isArray(captions) ? captions : []).forEach((c) => {
    if (!c || !/^https?:\/\//.test(String(c.file || ''))) return;
    const name = captionName(c.file);
    if (!name || seen[name.toLowerCase()]) return;
    seen[name.toLowerCase()] = true;
    let url = String(c.file);
    try {
      url = encodeURI(decodeURI(url));
    } catch (e) {
    }
    const label = name.replace(/^Deutsch$/, 'German').replace(/^Dansk$/, 'Danish').replace(/^Italiano$/, 'Italian').replace(/^Nederlands$/, 'Dutch');
    out.push({ url, label, language: languageCode(name), format: 'vtt' });
  });
  out.sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1) || a.label.localeCompare(b.label));
  return out;
}

function describeMaster(text) {
  const heights = [];
  const subs = [];
  let audio = '';
  String(text || '')
    .split('\n')
    .forEach((line) => {
      const h = /RESOLUTION=\d+x(\d+)/.exec(line);
      if (h) heights.push(parseInt(h[1], 10));
      if (line.indexOf('TYPE=AUDIO') !== -1 && /DEFAULT=YES/.test(line)) audio = (/NAME="([^"]+)"/.exec(line) || [])[1] || audio;
      if (line.indexOf('TYPE=SUBTITLES') !== -1) {
        const name = (/NAME="([^"]+)"/.exec(line) || [])[1];
        if (name && !/forced/i.test(name) && subs.indexOf(name) === -1) subs.push(name);
      }
    });
  const top = heights.length ? Math.max.apply(null, heights) : 0;
  const parts = [top ? `Auto up to ${top}p` : 'Auto'];
  if (audio) parts.push(`${audio} audio`);
  if (subs.length) {
    const names = subs.map((s) => s.replace(/\s*\[CC\]/i, ''));
    const english = names.indexOf('English') !== -1;
    if (names.length <= 3) parts.push('Softsub: ' + names.join(', '));
    else parts.push(english ? `Softsub: English and ${names.length - 1} more` : `Softsub: ${names.length} languages`);
  }
  return parts.join(', ');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.mirror = 0;
    this.ages = new Map();
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

  async catalog(path) {
    let last = null;
    for (let k = 0; k < CATALOGS.length; k++) {
      const index = (this.mirror + k) % CATALOGS.length;
      let response;
      try {
        response = await this.send({ url: CATALOGS[index] + path, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } });
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
        continue;
      }
      if (response.status >= 200 && response.status < 300) {
        let json = null;
        try {
          json = JSON.parse(String(response.data || ''));
        } catch (e) {
          json = null;
        }
        if (json && Array.isArray(json.results)) {
          this.mirror = index;
          return json;
        }
        last = new Error(`Chillflix: ${CATALOGS[index]} did not answer with a list`);
        continue;
      }
      last = new Error(`Chillflix: HTTP ${response.status} from ${CATALOGS[index]}`);
    }
    throw last || new Error('Chillflix is not reachable');
  }

  async detail(path) {
    let response = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await this.send({ url: PLAYER + path + (attempt ? `${path.indexOf('?') >= 0 ? '&' : '?'}_r=${attempt}` : ''), method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) break;
      if (attempt < 2) await pause(700 * (attempt + 1));
    }
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`Chillflix: HTTP ${response.status}`);
    try {
      return JSON.parse(String(response.data || ''));
    } catch (e) {
      throw new Error('Chillflix: the player host did not answer with JSON');
    }
  }

  async page(path) {
    const response = await this.send({ url: CATALOGS[this.mirror] + path, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Chillflix: HTTP ${response.status}`);
    return String(response.data || '');
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    const tags = [];
    const seen = {};
    Object.keys(MOVIE_GENRES).forEach((id) => {
      seen[MOVIE_GENRES[id].toLowerCase()] = true;
      tags.push({ id: `m${id}`, label: MOVIE_GENRES[id] });
    });
    Object.keys(TV_GENRES).forEach((id) => {
      if (!seen[TV_GENRES[id].toLowerCase()]) tags.push({ id: `t${id}`, label: TV_GENRES[id] });
    });
    return tags.sort((a, b) => a.label.localeCompare(b.label));
  }

  card(item) {
    const type = item && item.type;
    if (!item || (type !== 'movie' && type !== 'tv') || !item.id) return null;
    const title = clean(item.title);
    if (!title) return null;
    const mangaId = `${type}~${item.id}`;
    const out = { mangaId, title, medium: 'anime' };
    const poster = plainImage(item.poster);
    if (/^https?:\/\//.test(poster)) out.image = poster;
    const year = clean(item.year) || yearOf(item.date);
    out.summary = [type === 'tv' ? 'Series' : 'Movie', year].filter(Boolean).join(', ');
    if (year) out.releaseDate = year;
    const names = type === 'tv' ? TV_GENRES : MOVIE_GENRES;
    const tags = (Array.isArray(item.genre_ids) ? item.genre_ids : []).map((id) => names[id]).filter(Boolean);
    if (tags.length) out.tags = tags;
    const rating = parseFloat(item.rating);
    if (rating > 0) out.rating = Math.round(rating * 10) / 10;
    let age = higher(ageOfTitle(title), ageOfText(item.overview));
    const known = this.ages.get(mangaId);
    if (known !== undefined && known >= 0) age = higher(age, known);
    if (age !== undefined) out.ageRating = age;
    return out;
  }

  async ageOf(mangaId) {
    if (this.ages.has(mangaId)) return this.ages.get(mangaId);
    const { kind, id } = parseId(mangaId);
    try {
      const d = await this.detail(`/api/${kind}/${id}`);
      if (!d) return undefined;
      const age = ageOfFlags(d);
      this.ages.set(mangaId, age === undefined ? -1 : age);
      return age;
    } catch (e) {
      console.error('Chillflix flag lookup failed for ' + mangaId + ': ' + (e && e.message));
      return undefined;
    }
  }

  async rate(cards) {
    const todo = cards.filter((c) => !this.ages.has(c.mangaId));
    if (todo.length) {
      try {
        await within(RATE_BUDGET_MS, pool(todo, 6, (c) => this.ageOf(c.mangaId)));
      } catch (e) {
      }
    }
    cards.forEach((c) => {
      const age = this.ages.get(c.mangaId);
      if (age !== undefined && age >= 0) c.ageRating = higher(c.ageRating, age);
    });
    return cards;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    let data;
    let paged = false;
    if (query) {
      data = await this.catalog(`/api/search?q=${encodeURIComponent(query)}&page=${page}`);
    } else {
      let kind;
      let sort;
      let genre = '';
      if (included.length) {
        const m = /^([mt])(\d+)$/.exec(String(included[0].id || included[0]));
        if (!m) return { results: [] };
        kind = m[1] === 'm' ? 'movie' : 'tv';
        sort = 'popularity.desc';
        genre = m[2];
      } else {
        const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
        kind = feed.kind;
        sort = feed.sort;
      }
      data = await this.catalog(`/api/browse?type=${kind}&page=${page}&sort=${sort}&genre=${genre}`);
      if (!data.results.length && page === 1) data = await this.catalog(`/api/browse?type=${kind}&page=1&sort=${sort}&genre=${genre}&_r=1`);
      paged = true;
    }
    const today = new Date().toISOString().slice(0, 10);
    const cards = [];
    const seen = new Set();
    data.results.forEach((item) => {
      if (!query && item && item.date && String(item.date) > today) return;
      const c = this.card(item);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        cards.push(c);
      }
    });
    await this.rate(cards);
    const total = Number(data.total_pages) || 0;
    const more = paged ? page < Math.min(total, 500) && data.results.length > 0 : data.results.length >= 20 && page < 25;
    return more ? { results: cards, metadata: { page: page + 1 } } : { results: cards };
  }

  facts(html) {
    const out = { people: '', certificate: '', cast: [] };
    try {
      const $ = cheerio.load(html);
      $('.about-facts-grid > div').each((_, row) => {
        const label = clean($(row).find('dt').first().text()).toLowerCase();
        const value = clean($(row).find('dd').first().text());
        if (label === 'classification') out.certificate = value;
        else if ((label === 'directors' || label === 'director' || label === 'creators' || label === 'creator') && value) out.people = value;
      });
      $('a[class*="__actor"]').each((_, a) => {
        if (out.cast.length >= 30) return;
        const name = clean($(a).find('strong').first().text());
        if (!name) return;
        const person = { name };
        const role = clean($(a).find('span[class*="__role"]').first().text());
        if (role) person.role = role;
        const photo = plainImage($(a).find('img').first().attr('src'));
        if (/^https?:\/\//.test(photo)) person.image = photo;
        out.cast.push(person);
      });
    } catch (e) {
      console.error('Chillflix title page not read: ' + (e && e.message));
    }
    return out;
  }

  async getMangaDetails(mangaId) {
    const { kind, id } = parseId(mangaId);
    const [d, html] = await Promise.all([this.detail(`/api/${kind}/${id}`), this.page(`/${kind}/${id}`).catch((e) => {
      if (e && e.kind === 'challenge') throw e;
      return '';
    })]);
    if (!d || !(d.title || d.name)) throw new Error('Chillflix: title not found');
    const facts = this.facts(html);
    const title = clean(kind === 'tv' ? d.name || d.title : d.title || d.name);
    const info = {
      title,
      desc: clean(d.overview),
      status: kind === 'movie' ? 'COMPLETED' : statusOfShow(d.status),
      tags: (d.genres || []).map((g) => clean(g.name)).filter(Boolean),
      webURL: `${CATALOGS[this.mirror]}/${kind}/${id}`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    if (d.poster_path) info.image = posterOf(d.poster_path, 'w500');
    if (d.backdrop_path) info.banner = posterOf(d.backdrop_path, 'w780');
    const year = yearOf(kind === 'tv' ? d.first_air_date : d.release_date);
    if (year) info.releaseDate = year;
    if (d.vote_average > 0) info.rating = Math.round(d.vote_average * 10) / 10;
    if (facts.people) info.author = facts.people;
    else if (kind === 'tv' && Array.isArray(d.created_by) && d.created_by.length) info.author = d.created_by.map((p) => clean(p.name)).filter(Boolean).join(', ');
    if (facts.cast.length) info.cast = facts.cast;
    const age = higher(higher(higher(ageOfFlags(d), ageOfCertificate(facts.certificate)), ageOfTitle(title)), ageOfText(d.overview));
    if (age !== undefined) {
      info.ageRating = age;
      this.ages.set(mangaId, age);
    }
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, id } = parseId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const show = await this.detail(`/api/tv/${id}`);
    if (!show) throw new Error('Chillflix: series not found');
    const seasons = (show.seasons || []).filter((s) => s && s.season_number >= 1 && s.episode_count > 0);
    if (!seasons.length) throw new Error('Chillflix has no episodes for this series yet');
    const today = Date.now() + 36 * 3600 * 1000;
    const lists = await pool(seasons, 4, async (s) => {
      let d = await this.detail(`/api/tv/${id}/season/${s.season_number}`);
      if (!d) d = await this.detail(`/api/tv/${id}/season/${s.season_number}?_r=retry`);
      if (!d || !Array.isArray(d.episodes)) throw new Error(`Chillflix: season ${s.season_number} could not be read`);
      return { season: s.season_number, episodes: d.episodes };
    });
    const rows = [];
    lists.forEach((l) => {
      l.episodes.forEach((e) => {
        if (!e || !(e.episode_number >= 0)) return;
        const time = e.air_date ? Date.parse(e.air_date + 'T00:00:00Z') : NaN;
        if (Number.isFinite(time) && time > today) return;
        const label = clean(e.name);
        const named = label && !/^Episode \d+$/i.test(label);
        const row = {
          id: `s${l.season}e${e.episode_number}`,
          chapterId: `s${l.season}e${e.episode_number}`,
          name: named ? `Episode ${e.episode_number}: ${label}` : `Episode ${e.episode_number}`,
          number: e.episode_number,
          season: String(l.season),
          seasonName: `Season ${l.season}`,
        };
        if (Number.isFinite(time)) row.time = time;
        if (named) row.title = label;
        if (e.still_path) row.thumbnail = posterOf(e.still_path, 'w300');
        if (e.runtime > 0) row.duration = Math.round(e.runtime * 60);
        if (clean(e.overview)) row.summary = clean(e.overview);
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('Chillflix has no aired episodes for this series yet');
    rows.sort((x, y) => Number(y.season) - Number(x.season) || y.number - x.number);
    if (new Set(rows.map((r) => r.season)).size < 2) {
      rows.forEach((r) => {
        delete r.season;
        delete r.seasonName;
      });
    }
    return rows;
  }

  async vixSrc(path) {
    const api = await this.send({ url: `${VIX}/api/${path}`, method: 'GET', headers: { Accept: 'application/json', Referer: `${VIX}/${path}` } });
    if (api.status === 404) throw new Error('VixSrc has no stream for this title yet');
    if (api.status < 200 || api.status >= 300) throw new Error(`VixSrc: HTTP ${api.status}`);
    let src = '';
    try {
      src = JSON.parse(api.data).src;
    } catch (e) {
      src = '';
    }
    if (!src) throw new Error('VixSrc gave no embed page for this title');
    const embed = await this.send({ url: `${VIX}${src}`, method: 'GET', headers: { Accept: 'text/html,*/*', Referer: `${VIX}/${path}` } });
    if (embed.status < 200 || embed.status >= 300) throw new Error(`VixSrc: embed page HTTP ${embed.status}`);
    const html = String(embed.data || '');
    const token = (/'token':\s*'([^']+)'/.exec(html) || [])[1];
    const expires = (/'expires':\s*'([^']+)'/.exec(html) || [])[1];
    const base = (/\burl:\s*'(https:\/\/vixsrc\.to\/playlist\/\d+)'/.exec(html) || [])[1];
    if (!token || !expires || !base) throw new Error('VixSrc: the embed page holds no playlist');
    const fhd = /canPlayFHD\s*=\s*true/.test(html);
    const master = `${base}?token=${token}&expires=${expires}${fhd ? '&h=1' : ''}&lang=en`;
    const m = await this.send({ url: master, method: 'GET', headers: { Accept: 'application/vnd.apple.mpegurl,*/*' } });
    if (m.status < 200 || m.status >= 300) throw new Error(`VixSrc: playlist HTTP ${m.status}`);
    return { url: master, quality: 'VixSrc, ' + describeMaster(String(m.data || '')), type: 'hls', server: 'VixSrc' };
  }

  async provider(name, query) {
    const url = `${SCRAPER}/api/provider?provider=${name}&${query}${name === 'citadel' ? `&cb=${Math.floor(Date.now() / 3000000)}` : ''}`;
    const response = await this.send({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (response.status !== 200) throw new Error(`Rive ${name}: HTTP ${response.status}`);
    let json;
    try {
      json = JSON.parse(String(response.data || ''));
    } catch (e) {
      throw new Error(`Rive ${name}: not JSON`);
    }
    if (json && json.error) throw new Error(`Rive ${name}: ${json.error}`);
    const data = json && json.data;
    const sources = data && Array.isArray(data.sources) ? data.sources.filter((s) => s && /^https?:\/\//.test(String(s.url || ''))) : [];
    if (!sources.length) throw new Error(`Rive ${name}: no stream`);
    return { sources, captions: data.captions };
  }

  citadelVideos(answer) {
    const subtitles = subtitlesOf(answer.captions);
    const picked = [];
    const seen = {};
    answer.sources.forEach((s) => {
      const { height, language } = citadelParts(s.quality);
      const key = `${language.toLowerCase()}|${height}`;
      if (seen[key]) return;
      seen[key] = true;
      picked.push({ s, height, language });
    });
    const english = picked.filter((p) => /^english$/i.test(p.language)).sort((a, b) => b.height - a.height);
    const others = [];
    const seenLanguage = {};
    picked
      .filter((p) => !/^english$/i.test(p.language))
      .sort((a, b) => b.height - a.height)
      .forEach((p) => {
        if (seenLanguage[p.language.toLowerCase()]) return;
        seenLanguage[p.language.toLowerCase()] = true;
        others.push(p);
      });
    const make = (p) => {
      const parts = [];
      if (p.height) parts.push(`${p.height}p`);
      if (p.language) parts.push(/^english$/i.test(p.language) ? 'English audio' : `${p.language} audio Dub`);
      const video = { url: p.s.url, quality: parts.join(', ') || 'Auto', type: 'hls', server: 'Citadel' };
      if (subtitles.length) {
        video.subtitles = subtitles;
        video.quality += subtitles.some((t) => t.language === 'en') ? `, Softsub: English and ${subtitles.length - 1} more` : `, Softsub: ${subtitles.length} languages`;
      }
      return video;
    };
    return { english: english.map(make), others: others.map(make) };
  }

  unwrap(url) {
    const m = /^https:\/\/cors\.corsflix\.net\/m3u8\?url=([^&]+)/.exec(String(url));
    if (!m) return String(url);
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return String(url);
    }
  }

  async getVideos(mangaId, chapterId) {
    const { kind, id } = parseId(mangaId);
    let query = `id=${id}`;
    let vixPath = `movie/${id}`;
    if (kind === 'tv') {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('Chillflix: unknown episode id ' + chapterId);
      query += `&season=${ep[1]}&episode=${ep[2]}`;
      vixPath = `tv/${id}/${ep[1]}/${ep[2]}`;
    }
    const jobs = [
      ['vix', () => this.vixSrc(vixPath)],
      ['citadel', () => this.provider('citadel', query)],
      ['pulse', () => this.provider('pulse', query)],
      ['lumen', () => this.provider('lumen', query)],
    ];
    const started = Date.now();
    const settled = [];
    let finished = false;
    let armed = false;
    await new Promise((resolve) => {
      const finish = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };
      let pending = jobs.length;
      jobs.forEach(([name, run]) => {
        within(HARD_MS, run()).then(
          (answer) => ({ name, answer }),
          (error) => ({ name, error })
        ).then((r) => {
          if (finished) return;
          settled.push(r);
          pending--;
          if (!pending) {
            finish();
            return;
          }
          const has = (n) => settled.some((x) => x.name === n && x.answer);
          if (armed) return;
          if (has('vix')) {
            armed = true;
            setTimeout(finish, VIX_GRACE_MS);
          } else if (has('pulse') && settled.filter((x) => x.answer).length >= 2) {
            armed = true;
            setTimeout(finish, SOFT_MS);
          }
        });
      });
      setTimeout(finish, HARD_MS);
    });
    const by = {};
    settled.forEach((r) => (by[r.name] = r));
    const videos = [];
    if (by.vix && by.vix.answer) videos.push(by.vix.answer);
    let citadel = { english: [], others: [] };
    if (by.citadel && by.citadel.answer) citadel = this.citadelVideos(by.citadel.answer);
    citadel.english.forEach((v) => videos.push(v));
    if (by.pulse && by.pulse.answer) videos.push({ url: this.unwrap(by.pulse.answer.sources[0].url), quality: 'Auto', type: 'hls', server: 'Pulse', headers: XPASS });
    if (by.lumen && by.lumen.answer) videos.push({ url: this.unwrap(by.lumen.answer.sources[0].url), quality: 'Auto', type: 'hls', server: 'Lumen' });
    citadel.others.forEach((v) => videos.push(v));
    if (!videos.length) {
      const challenged = settled.find((r) => r.error && r.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      const waited = Math.round((Date.now() - started) / 1000);
      const vixNote = by.vix && by.vix.error && by.vix.error.message ? ` VixSrc: ${by.vix.error.message}.` : '';
      if (kind === 'tv') throw new Error(`Chillflix has no stream for this episode yet (VixSrc and Rive's three servers answered nothing in ${waited} s).${vixNote} A new episode usually appears a few hours after it airs, so try again later.`);
      throw new Error(`Chillflix has no stream for this title yet (VixSrc and Rive's three servers answered nothing in ${waited} s).${vixNote}`);
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
