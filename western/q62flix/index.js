const SITE = 'https://q62flix.ws';
const API = 'https://api.q62flix.ws';
const STREAM = 'https://proxy.7movie.ws';
const IMG = 'https://image.tmdb.org/t/p/';
const SERVER = 'Q62';
const PAGE_SIZE = 12;

const GENRES = [
  ['action', 'Action'], ['action-adventure', 'Action & Adventure'], ['adventure', 'Adventure'], ['animation', 'Animation'], ['comedy', 'Comedy'], ['crime', 'Crime'],
  ['documentary', 'Documentary'], ['drama', 'Drama'], ['family', 'Family'], ['fantasy', 'Fantasy'], ['history', 'History'], ['horror', 'Horror'], ['music', 'Music'],
  ['mystery', 'Mystery'], ['romance', 'Romance'], ['sci-fi-fantasy', 'Sci-Fi & Fantasy'], ['science-fiction', 'Science Fiction'], ['thriller', 'Thriller'], ['war', 'War'],
  ['war-politics', 'War & Politics'], ['western', 'Western'],
];
const FEEDS = [
  { id: 'movies', name: 'Movies' },
  { id: 'shows', name: 'TV Shows' },
];
const LANGUAGES = {
  ar: 'Arabic', be: 'Belarusian', bg: 'Bulgarian', cs: 'Czech', da: 'Danish', de: 'German', el: 'Greek', en: 'English', es: 'Spanish', fi: 'Finnish', fr: 'French', he: 'Hebrew',
  hi: 'Hindi', hu: 'Hungarian', id: 'Indonesian', it: 'Italian', ja: 'Japanese', ka: 'Georgian', ko: 'Korean', ml: 'Malayalam', nb: 'Norwegian', nl: 'Dutch', pl: 'Polish',
  pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sk: 'Slovak', sv: 'Swedish', ta: 'Tamil', te: 'Telugu', th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', zh: 'Chinese',
};

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function plain(text) {
  return String(text === undefined || text === null ? '' : text).replace(/[\r\t ]+\n/g, '\n').trim();
}

function localeChain(translations, original) {
  const chain = ['en-US', 'en', 'en-GB', 'en-AU'];
  if (original) chain.push(original);
  Object.keys(translations || {}).forEach((k) => chain.push(k));
  return chain.filter((k, i) => chain.indexOf(k) === i);
}

function field(item, name) {
  const translations = (item && item.translations) || {};
  const chain = localeChain(translations, item && item.originalLanguage);
  for (let i = 0; i < chain.length; i++) {
    const t = translations[chain[i]];
    const v = t && t[name];
    if (v !== undefined && v !== null && clean(v) !== '') return v;
  }
  return '';
}

function imageUrl(path, size) {
  const p = clean(path);
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return IMG + size + (p.charAt(0) === '/' ? '' : '/') + p;
}

function ageOf(item) {
  const keys = (Array.isArray(item && item.tags) ? item.tags : []).map((t) => (t && t.key) || t);
  return keys.some((k) => k === 'horror' || k === 'crime' || k === 'thriller' || k === 'war' || k === 'war-politics') ? 16 : 0;
}

function yearOf(text) {
  const m = /^(\d{4})/.exec(String(text || ''));
  return m ? m[1] : '';
}

function timeOf(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
  if (!m) return undefined;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(t) ? t : undefined;
}

function splitId(mangaId) {
  const m = /^([mt]):([0-9A-Za-z]{6,20})$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Q62: unknown title id ' + mangaId);
  return { kind: m[1] === 'm' ? 'movie' : 'tvshow', id: m[2] };
}

function languageName(code) {
  const base = String(code || '').toLowerCase().split('-')[0];
  return LANGUAGES[base] || String(code || '').toUpperCase();
}

function isEnglish(code) {
  return /^en(-|$)/i.test(String(code || ''));
}

function ripRank(rip) {
  const r = String(rip || '').toUpperCase();
  if (r === 'BR' || r === 'WEB') return 0;
  if (r === 'TELESYNC') return 1;
  return 2;
}

function heightOf(resolution) {
  const m = /(\d{3,4})P/i.exec(String(resolution || ''));
  return m ? parseInt(m[1], 10) : 0;
}

function releaseScore(release) {
  const locales = Array.isArray(release.audioLocales) ? release.audioLocales : [];
  const englishPosition = locales.findIndex(isEnglish);
  const englishOnly = locales.length > 0 && locales.every(isEnglish);
  return ripRank(release.ripType) * 1000 + (englishOnly ? 0 : englishPosition === 0 ? 100 : 200) - Math.min(heightOf(release.resolution), 2160) / 100 + locales.length / 100;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.structures = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  tagOf(request) {
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const id = included.length ? clean(included[0] && (included[0].id || included[0])) : '';
    return GENRES.some((g) => g[0] === id) ? id : '';
  }

  card(item, kind) {
    const title = clean(field(item, 'title'));
    if (!title || !item.id) return null;
    const result = {
      mangaId: (kind === 'movie' ? 'm:' : 't:') + item.id,
      title,
      image: imageUrl(field(item, 'posterPath'), 'w342'),
      webURL: `${SITE}/${kind}/${item.id}`,
      medium: 'anime',
      ageRating: ageOf(item),
    };
    const names = (Array.isArray(item.tags) ? item.tags : []).map((t) => clean(t && t.name)).filter(Boolean);
    if (names.length) result.tags = names;
    const year = yearOf(item.releaseDate || item.firstAirDate);
    if (year) result.releaseDate = year;
    return result;
  }

  async list(kind, page, query, tag) {
    const base = kind === 'movie' ? '/movie' : '/tvshow';
    const params = [`page=${page}`, `size=${PAGE_SIZE}`];
    if (kind === 'tvshow') params.push('isAnime=false');
    if (query) params.push('q=' + encodeURIComponent(query));
    if (kind === 'movie' && tag) params.push('tag=' + encodeURIComponent(tag));
    if (kind === 'tvshow' && tag) {
      if (page > 0) return { results: [], more: false };
      params[0] = 'page=0';
      params[1] = 'size=100';
    }
    const data = await this.json(`${API}${base}?${params.join('&')}`);
    let items = Array.isArray(data && data.content) ? data.content : [];
    if (kind === 'tvshow' && tag) items = items.filter((it) => (it.tags || []).some((t) => t && t.key === tag));
    const info = (data && data.page) || {};
    const more = !(kind === 'tvshow' && tag) && Number.isFinite(info.totalPages) && page + 1 < info.totalPages;
    return { results: items.map((it) => this.card(it, kind)).filter(Boolean), more };
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const tag = this.tagOf(request);
    const page = metadata && Number.isFinite(metadata.page) ? metadata.page : 0;
    const feed = clean(request && request.feed);
    const kinds = query || tag ? ['movie', 'tvshow'] : feed === 'shows' ? ['tvshow'] : ['movie'];
    const parts = await Promise.all(kinds.map((kind) => this.list(kind, page, query, tag)));
    const results = [];
    const seen = new Set();
    parts.forEach((p) => p.results.forEach((r) => {
      if (!seen.has(r.mangaId)) {
        seen.add(r.mangaId);
        results.push(r);
      }
    }));
    const more = parts.some((p) => p.more) && results.length > 0;
    return more ? { results, metadata: { page: page + 1 } } : { results };
  }

  structure(id) {
    const kept = this.structures.get(id);
    if (kept && Date.now() - kept.at < 300000) return kept.pending;
    const pending = this.loadStructure(id);
    this.structures.set(id, { at: Date.now(), pending });
    pending.catch(() => {
      if (this.structures.get(id) && this.structures.get(id).pending === pending) this.structures.delete(id);
    });
    return pending;
  }

  async loadStructure(id) {
    const seasons = await this.json(`${API}/tvshow/${encodeURIComponent(id)}/season`);
    if (!Array.isArray(seasons)) throw new Error('Q62: the season list is not readable');
    const pages = await Promise.all(
      seasons.map(async (s) => {
        const episodes = await this.json(`${API}/season/${encodeURIComponent(s.id)}/episode`);
        if (!Array.isArray(episodes)) throw new Error('Q62: the episode list of a season is not readable');
        return { season: s, episodes };
      })
    );
    return pages;
  }

  async getMangaDetails(mangaId) {
    const { kind, id } = splitId(mangaId);
    const item = await this.json(`${API}/${kind}/${encodeURIComponent(id)}`);
    const title = clean(field(item, 'title'));
    if (!item || !title) throw new Error('Q62: title not found');
    const info = {
      title,
      image: imageUrl(field(item, 'posterPath'), 'w500'),
      desc: plain(field(item, 'overview')),
      tags: (Array.isArray(item.tags) ? item.tags : []).map((t) => clean(t && t.name)).filter(Boolean),
      webURL: `${SITE}/${kind}/${id}`,
      medium: 'anime',
      ageRating: ageOf(item),
      status: 'UNKNOWN',
    };
    const banner = imageUrl(field(item, 'backdropPath'), 'w780');
    if (banner) info.banner = banner;
    const year = yearOf(item.releaseDate || item.firstAirDate);
    if (year) info.releaseDate = year;
    if (kind === 'movie') {
      info.status = 'COMPLETED';
    } else {
      try {
        const pages = await this.structure(id);
        if (pages.some((p) => (p.season && p.season.comingSoon) || p.episodes.some((e) => e && e.comingSoon))) info.status = 'ONGOING';
      } catch (e) {
        console.error('Q62 status lookup failed: ' + (e && e.message));
      }
    }
    info.completed = info.status === 'COMPLETED';
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, id } = splitId(mangaId);
    if (kind === 'movie') return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const pages = (await this.structure(id)).filter((p) => p.season && Number(p.season.seasonNumber) >= 1 && p.episodes.length > 0);
    const rows = [];
    const seen = new Set();
    pages.forEach((p) => {
      p.episodes.forEach((e) => {
        if (!e || !e.id || e.comingSoon) return;
        const number = Number(e.episodeNumber);
        if (!Number.isFinite(number)) return;
        const cid = `${p.season.id}:${e.id}`;
        if (seen.has(cid)) return;
        seen.add(cid);
        const heading = clean(field(e, 'title'));
        const row = {
          id: cid,
          chapterId: cid,
          name: heading && heading !== `Episode ${number}` ? `Episode ${number}: ${heading}` : `Episode ${number}`,
          number,
          season: Number(p.season.seasonNumber),
        };
        const time = timeOf(e.airDate);
        if (time !== undefined) row.time = time;
        if (heading) row.title = heading;
        const still = imageUrl(field(e, 'stillPath'), 'w300');
        if (still) row.thumbnail = still;
        const summary = plain(field(e, 'overview'));
        if (summary) row.summary = summary;
        if (Number(e.runtime) > 0) row.duration = Math.round(Number(e.runtime) * 60);
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('Q62 has no released episodes for this show yet');
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = Object.assign({}, r);
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      } else delete out.season;
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const { kind, id } = splitId(mangaId);
    let base;
    if (kind === 'movie') {
      base = `${API}/movie/${encodeURIComponent(id)}`;
    } else {
      const m = /^([0-9A-Za-z]{6,20}):([0-9A-Za-z]{6,20})$/.exec(String(chapterId || ''));
      if (!m) throw new Error('Q62: unknown episode id ' + chapterId);
      base = `${API}/season/${m[1]}/episode/${m[2]}`;
    }
    const releases = await this.json(`${base}/releases`);
    if (!Array.isArray(releases) || !releases.length) throw new Error('Q62 has no stream for this title yet');
    const english = releases.filter((r) => r && r.id && Array.isArray(r.audioLocales) && r.audioLocales.some(isEnglish));
    if (!english.length) {
      const languages = [];
      releases.forEach((r) => (r.audioLocales || []).forEach((l) => languages.indexOf(languageName(l)) === -1 && languages.push(languageName(l))));
      throw new Error('Q62 has no English audio for this title (its releases are in ' + (languages.join(', ') || 'another language') + ')');
    }
    english.sort((a, b) => releaseScore(a) - releaseScore(b));
    const chosen = english.slice(0, 3);
    const answers = await Promise.all(
      chosen.map((r) => this.json(`${base}/release?releaseId=${encodeURIComponent(r.id)}`).then((release) => ({ summary: r, release }), (error) => ({ error })))
    );
    const videos = [];
    answers.forEach((a) => {
      if (!a.release || !a.release.m3u8Url) return;
      videos.push({ url: STREAM + a.release.m3u8Url, quality: this.describe(a.summary, a.release), type: 'hls', server: SERVER });
    });
    if (!videos.length) {
      const failed = answers.find((a) => a.error);
      throw new Error('Q62 gave no stream for this title' + (failed && failed.error && failed.error.message ? ' (' + failed.error.message + ')' : ''));
    }
    return videos;
  }

  describe(summary, release) {
    const height = heightOf(summary.resolution) || 1080;
    const audio = [];
    (Array.isArray(summary.audioLocales) ? summary.audioLocales : []).forEach((l) => {
      const name = languageName(l);
      if (audio.indexOf(name) === -1) audio.push(name);
    });
    const english = audio.indexOf('English');
    if (english > 0) {
      audio.splice(english, 1);
      audio.unshift('English');
    }
    const parts = [`Auto up to ${height}p ${clean(summary.ripType)}`.trim()];
    parts.push(audio.length <= 3 ? audio.join(' and ') + ' audio' : `${audio[0]} and ${audio.length - 1} more audio`);
    const subs = [];
    (Array.isArray(release.subtitles) ? release.subtitles : []).forEach((s) => {
      if (!s || String(s.type || '').toUpperCase() === 'FORCED') return;
      const name = languageName(s.language);
      if (subs.indexOf(name) === -1) subs.push(name);
    });
    if (subs.length) {
      const hasEnglish = subs.indexOf('English') !== -1;
      parts.push(subs.length <= 3 ? 'Softsub: ' + subs.join(', ') : hasEnglish ? `Softsub: English and ${subs.length - 1} more` : `Softsub: ${subs.length} languages`);
    }
    return parts.join(', ');
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

  async json(url) {
    const response = await this.send({ url, method: 'GET', headers: { Accept: 'application/json' } });
    if (response.status === 404) throw new Error('Q62: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Q62: HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('Q62: the answer is not JSON');
    }
  }
}

module.exports = { Source };
