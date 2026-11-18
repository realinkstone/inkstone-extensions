const SITE = 'https://kissasia.cam';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 24;
const SERVER = 'KissAsia';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', params: { sort: 'last_update' } },
  { id: 'popular', name: 'Popular', params: { sort: 'popular' } },
  { id: 'new', name: 'New Releases', params: { sort: 'release_date' } },
  { id: 'ongoing', name: 'Ongoing', params: { type: 'tv', status: 'Ongoing', sort: 'last_update' } },
  { id: 'movies', name: 'Movies', params: { type: 'movie', sort: 'last_update' } },
  { id: 'south-korea', name: 'South Korea', params: { country: 'KR', sort: 'last_update' } },
  { id: 'china', name: 'China', params: { country: 'CN', sort: 'last_update' } },
  { id: 'thailand', name: 'Thailand', params: { country: 'TH', sort: 'last_update' } },
  { id: 'japan', name: 'Japan', params: { country: 'JP', sort: 'last_update' } },
  { id: 'taiwan', name: 'Taiwan', params: { country: 'TW', sort: 'last_update' } },
  { id: 'philippines', name: 'Philippines', params: { country: 'PH', sort: 'last_update' } },
];

const EXPLICIT_GENRES = ['vivamaxs', 'channel 18+', 'watch vivamax | asiaflix official site'];
const HIDDEN_GENRES = ['vivamaxs', 'watch vivamax | asiaflix official site', 'talk'];
const SUGGESTIVE_TITLE = /\b(sex|sexy|sexual|erotic|erotica|nympho|seduce|seducing|seduction|porn|xxx)\b/i;

const DEAD_STREAM_HOSTS = ['vidmmo.com'];
const DEAD_SUBTITLE_HOSTS = ['sub.wyzie.ru'];
const NEEDS_AGENT_HOSTS = ['zudrama.top', 'dramasub.top'];

const LANGUAGE_CODES = {
  english: 'en', khmer: 'km', arabic: 'ar', filipino: 'fil', tagalog: 'fil', french: 'fr', hindi: 'hi', malay: 'ms', indonesian: 'id', indonesia: 'id',
  german: 'de', spanish: 'es', portuguese: 'pt', vietnamese: 'vi', thai: 'th', korean: 'ko', chinese: 'zh', japanese: 'ja', turkish: 'tr',
  russian: 'ru', italian: 'it', burmese: 'my', bengali: 'bn', tamil: 'ta', telugu: 'te', urdu: 'ur', persian: 'fa', hebrew: 'he', dutch: 'nl',
  polish: 'pl', romanian: 'ro', greek: 'el', swedish: 'sv', czech: 'cs', hungarian: 'hu', nepali: 'ne', sinhala: 'si', mongolian: 'mn',
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanText(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function parseGenres(value) {
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (e) {
      list = [];
    }
  }
  return (Array.isArray(list) ? list : []).map((g) => cleanText(g)).filter(Boolean);
}

function ratingOf(title, genres) {
  for (const g of genres) {
    const lower = g.toLowerCase();
    if (EXPLICIT_GENRES.indexOf(lower) !== -1) return 18;
  }
  return SUGGESTIVE_TITLE.test(String(title || '')) ? 16 : 0;
}

function visibleGenres(genres) {
  return genres.filter((g) => HIDDEN_GENRES.indexOf(g.toLowerCase()) === -1);
}

function coverUrl(path, size) {
  const p = cleanText(path);
  if (!p) return undefined;
  const tmdb = /^https?:\/\/(?:image|media)\.themoviedb\.org\/t\/p\/[^/]+\/(.+)$/i.exec(p) || /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+\/(.+)$/i.exec(p);
  if (tmdb) return `https://image.tmdb.org/t/p/${size}/${tmdb[1]}`;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) === '/') return `https://image.tmdb.org/t/p/${size}${p}`;
  return undefined;
}

function pickCover(item, size) {
  const poster = coverUrl(item.posterPath, size);
  if (poster && !/^https?:\/\/(?:[^/]+\.)?dramasub\.top\//i.test(poster)) return poster;
  const backdrop = coverUrl(item.backdropPath, size === 'w342' ? 'w500' : size);
  if (backdrop && !/^https?:\/\/(?:[^/]+\.)?dramasub\.top\//i.test(backdrop) && backdrop.indexOf('wsrv.nl') === -1) return backdrop;
  return poster;
}

function makeId(type, id, slug) {
  return `${type === 'movie' ? 'movie' : 'tv'}-${id}-${slug}`;
}

function parseId(mangaId) {
  const m = /^(tv|movie)-(\d+)-(.+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('KissAsian does not know this title id: ' + mangaId);
  return { type: m[1], id: m[2], slug: m[3] };
}

function pageUrlOf(ref) {
  let slug = ref.slug;
  try {
    slug = decodeURIComponent(slug);
  } catch (e) {
  }
  return `${SITE}/${ref.type === 'movie' ? 'movies' : 'drama'}/${encodeURIComponent(slug)}`;
}

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed' || s === 'ended' || s === 'finished') return 'COMPLETED';
  return 'UNKNOWN';
}

function yearOf(text) {
  const m = /^(\d{4})/.exec(cleanText(text));
  return m ? m[1] : undefined;
}

function toResult(item) {
  const type = item.type === 'movie' ? 'movie' : 'tv';
  const genres = parseGenres(item.genres);
  const mangaId = makeId(type, item.id, item.slug);
  const result = {
    mangaId,
    title: cleanText(item.title),
    image: pickCover(item, 'w342'),
    tags: visibleGenres(genres),
    medium: 'anime',
    webURL: pageUrlOf({ type, slug: item.slug }),
    ageRating: ratingOf(item.title, genres),
  };
  const year = yearOf(item.releaseDate);
  if (year) result.releaseDate = year;
  const status = mapStatus(item.status);
  if (type === 'tv') {
    result.completed = status === 'COMPLETED';
    const episodes = Number(item._count && item._count.episodes);
    if (episodes > 0) result.chapters = episodes;
  }
  return result;
}

function languageOf(track) {
  const name = cleanText(track.language || track.label).toLowerCase();
  if (LANGUAGE_CODES[name]) return LANGUAGE_CODES[name];
  return /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(name) ? name : name.replace(/[^a-z]/g, '').slice(0, 3);
}

function languageLabel(track) {
  const raw = cleanText(track.label || track.language);
  if (!raw) return 'Subtitles';
  if (raw.length <= 3) {
    const known = Object.keys(LANGUAGE_CODES).filter((k) => LANGUAGE_CODES[k] === raw.toLowerCase())[0];
    if (known) return known.charAt(0).toUpperCase() + known.slice(1);
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
}

function hostIn(host, list) {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

function checkVideo(raw) {
  const url = cleanText(raw)
    .replace(/^(https?:\/\/[^/]*\.rumble\.cloud)a(?=\/)/i, '$1')
    .replace(/\.mp44(?=$|[?#])/i, '.mp4');
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return { error: 'KissAsian gave no usable video address for this episode' };
  const host = hostOf(url);
  if (!host || host.indexOf('..') !== -1) return { error: 'KissAsian gave a broken video address for this episode' };
  if (hostIn(host, DEAD_STREAM_HOSTS)) return { error: 'KissAsian plays this episode from ' + host + ', a host that no longer exists' };
  const path = url.split(/[?#]/)[0];
  if (/\.tar$/i.test(path)) return { error: 'KissAsian serves this episode as a chunk archive that no player opens' };
  return { url, host, isHls: /\.m3u8$/i.test(path) };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.genres = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this.genres) return this.genres;
    try {
      const data = await this.requestJSON(`${SITE}/api/genres`);
      const list = (data && Array.isArray(data.genres) ? data.genres : [])
        .map((g) => cleanText(g))
        .filter((g) => g && HIDDEN_GENRES.indexOf(g.toLowerCase()) === -1);
      this.genres = list.map((label) => ({ id: slugify(label), label }));
      return this.genres;
    } catch (e) {
      console.error('KissAsian getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    const params = { page, limit: PAGE_SIZE };
    if (query) {
      params.q = query;
    }
    if (tags.length) {
      params.genre = slugify(tags[0].id);
    }
    if (!query && !tags.length) {
      Object.assign(params, (FEEDS.find((f) => f.id === feedId) || FEEDS[0]).params);
    } else {
      params.sort = 'last_update';
    }

    let data;
    try {
      data = await this.requestJSON(`${SITE}/api/content?${qs(params)}`);
    } catch (e) {
      if (page > 1 && !(e && e.kind === 'challenge')) return { results: [], metadata: undefined };
      throw e;
    }
    const items = data && Array.isArray(data.items) ? data.items : [];
    const results = [];
    const seen = new Set();
    items.forEach((item) => {
      if (!item || !item.id || !item.slug || !item.title) return;
      const result = toResult(item);
      if (seen.has(result.mangaId)) return;
      seen.add(result.mangaId);
      results.push(result);
    });
    return { results, metadata: results.length > 0 && data.hasNextPage === true ? { page: page + 1 } : undefined };
  }

  async findItem(ref, title) {
    const text = cleanText(String(title || '').replace(/\s*\((?:19|20)\d{2}\)\s*$/, ''));
    if (!text) return null;
    try {
      const data = await this.requestJSON(`${SITE}/api/content?${qs({ q: text, type: ref.type, limit: 50, sort: 'popular' })}`);
      const items = data && Array.isArray(data.items) ? data.items : [];
      return items.filter((i) => i && String(i.id) === ref.id)[0] || null;
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      return null;
    }
  }

  async getMangaDetails(mangaId) {
    const ref = parseId(mangaId);
    const url = pageUrlOf(ref);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const heading = $('h1.detail-title').first();
    if (!heading.length) throw new Error('KissAsian has no page for this title');
    const title = cleanText(heading.text());

    let ld = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (ld) return;
      try {
        const data = JSON.parse($(el).contents().text());
        if (data && (data['@type'] === 'TVSeries' || data['@type'] === 'Movie')) ld = data;
      } catch (e) {
      }
    });
    const genres = parseGenres(ld && ld.genre);
    const metaLine = cleanText(heading.parent().find('p').eq(1).text());
    const statusWord = cleanText(metaLine.split('|').pop());
    const country = cleanText(metaLine.split('|')[0]);

    const item = await this.findItem(ref, title);
    const result = {
      title,
      desc: cleanText($('.detail-desc-body').first().text()),
      tags: visibleGenres(genres),
      webURL: url,
      medium: 'anime',
      ageRating: ratingOf(title, genres),
    };
    const status = ref.type === 'movie' ? 'COMPLETED' : mapStatus(statusWord);
    result.status = status;
    if (ref.type === 'tv') result.completed = status === 'COMPLETED';
    const poster = item ? pickCover(item, 'w500') : undefined;
    const backdrop = coverUrl(item ? item.backdropPath : ld && ld.image, 'w780');
    const image = poster || coverUrl(ld && ld.image, 'w500');
    if (image) result.image = image;
    if (backdrop) result.banner = backdrop;
    if (item && item.originalTitle && cleanText(item.originalTitle) !== title) result.altTitles = [cleanText(item.originalTitle)];
    const year = yearOf((ld && ld.datePublished) || cleanText($('p.detail-date').first().text()));
    if (year) result.releaseDate = year;
    if (country) result.tags = result.tags.concat([country]);
    return { mangaInfo: result };
  }

  async getChapters(mangaId) {
    const ref = parseId(mangaId);
    if (ref.type === 'movie') return [{ id: ref.id, name: 'Movie', number: 1 }];
    const list = await this.episodeList(ref.id);
    const episodes = Array.isArray(list) ? list.filter((e) => e && e.id !== undefined && e.id !== null) : [];
    if (!episodes.length) throw new Error('KissAsian lists no episodes for this title yet');
    const seasons = new Set(episodes.map((e) => Number(e.seasonNum) || 1));
    const rows = episodes.map((e) => {
      const season = Number(e.seasonNum) || 1;
      const number = Number(e.episodeNum);
      const own = cleanText(e.title);
      const generic = !own || /^episode\s*\d+(\.\d+)?$/i.test(own);
      const label = Number.isFinite(number) ? `Episode ${number}` : own || 'Episode';
      const row = { id: String(e.id), name: generic ? label : `${label}: ${own}`, season, number: Number.isFinite(number) ? number : undefined };
      if (!generic) row.title = own;
      const aired = e.airDate ? Date.parse(String(e.airDate)) : NaN;
      if (Number.isFinite(aired) && aired > 1e11) row.time = aired;
      const summary = cleanText(e.overview);
      if (summary) row.summary = summary;
      return row;
    });
    rows.sort((a, b) => b.season - a.season || (b.number || 0) - (a.number || 0));
    return rows.map((row) => {
      const season = row.season;
      delete row.season;
      if (row.number === undefined) delete row.number;
      if (seasons.size > 1) {
        row.season = String(season);
        row.seasonName = `Season ${season}`;
      }
      return row;
    });
  }

  episodeList(contentId) {
    this.episodeLists = this.episodeLists || new Map();
    const hit = this.episodeLists.get(contentId);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.requestJSON(`${SITE}/api/episodes?contentId=${encodeURIComponent(contentId)}`);
    this.episodeLists.set(contentId, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.episodeLists.get(contentId) && this.episodeLists.get(contentId).promise === promise) this.episodeLists.delete(contentId);
    });
    return promise;
  }

  async getVideos(mangaId, chapterId) {
    const ref = parseId(mangaId);
    const query = { contentId: ref.id };
    if (ref.type === 'tv') query.episodeId = String(chapterId);
    const [response, stored] = await Promise.all([
      this.send({ url: `${SITE}/api/get-media?${qs(query)}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }),
      ref.type === 'tv'
        ? this.episodeList(ref.id).then(
            (list) => {
              const row = (Array.isArray(list) ? list : []).filter((e) => e && String(e.id) === String(chapterId))[0];
              return row ? cleanText(row.videoUrl) : '';
            },
            (e) => {
              if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
              return '';
            }
          )
        : Promise.resolve(''),
    ]);
    let data = null;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      data = null;
    }
    const given = cleanText(data && data.videoUrl);
    if (!stored && (response.status === 404 || (data && data.error))) {
      throw new Error('KissAsian has no video for this episode yet' + (data && data.error ? ' (' + data.error + ')' : ''));
    }
    if (!stored && (response.status < 200 || response.status >= 300)) throw new Error(`KissAsian HTTP ${response.status}`);

    const candidates = [];
    const problems = [];
    const consider = (raw) => {
      if (!raw) return;
      const checked = checkVideo(raw);
      if (checked.error) problems.push(checked.error);
      else if (!candidates.some((c) => c.url === checked.url)) candidates.push(checked);
    };
    consider(stored);
    consider(given);
    candidates.slice().forEach((c) => {
      const m = /^https:\/\/hugh\.cdn\.rumble\.cloud(\/video\/v\d+\/[0-9a-f]{2}\/[^?#]+\/master\.m3u8)$/i.exec(c.url);
      if (!m) return;
      const swapped = checkVideo('https://video1-ap-japan.cloudokyo.cloud' + m[1]);
      if (swapped.error) return;
      const stored = candidates.filter((x) => x.url === swapped.url)[0];
      if (stored) candidates.splice(candidates.indexOf(c), 1);
      else candidates.splice(candidates.indexOf(c), 0, swapped);
    });
    if (!candidates.length) throw new Error(problems[0] || 'KissAsian gave no usable video address for this episode');

    const subtitles = [];
    const seen = new Set();
    ((data && data.subtitles) || []).forEach((t) => {
      if (!t || !/^https?:\/\//i.test(String(t.url || ''))) return;
      const url = String(t.url);
      if (seen.has(url) || hostIn(hostOf(url), DEAD_SUBTITLE_HOSTS)) return;
      seen.add(url);
      const entry = { url, label: languageLabel(t), language: languageOf(t) };
      const format = (/\.(vtt|srt|ass|ssa)(?:[?#]|$)/i.exec(url) || [])[1];
      if (format) entry.format = format.toLowerCase();
      entry.isDefault = t.isDefault === true;
      subtitles.push(entry);
    });
    subtitles.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || (b.language === 'en' ? 1 : 0) - (a.language === 'en' ? 1 : 0));
    subtitles.forEach((t) => {
      delete t.isDefault;
    });

    const names = subtitles.map((t) => t.label);
    const soft = names.length ? ' Softsub: ' + (names.length <= 3 ? names.join(', ') : `${names[0]} and ${names.length - 1} more`) : '';
    return candidates.slice(0, 3).map((c, i) => {
      const headers = { Referer: SITE + '/' };
      if (hostIn(c.host, NEEDS_AGENT_HOSTS)) headers['User-Agent'] = UA;
      const entry = { url: c.url, quality: (c.isHls ? 'Auto' : 'Direct') + soft, type: c.isHls ? 'hls' : 'mp4', server: i === 0 ? SERVER : `${SERVER} ${i + 1}`, headers };
      if (subtitles.length) entry.subtitles = subtitles;
      return entry;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const asked = attempt === 0 ? request : Object.assign({}, request, { url: request.url + (request.url.indexOf('?') === -1 ? '?' : '&') + '_r=1' });
        const response = await this.requests.schedule(App.createRequest(asked));
        if (response.status >= 500 && attempt === 0) {
          last = new Error(`KissAsian HTTP ${response.status}`);
          continue;
        }
        return response;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last;
  }

  async requestHTML(url) {
    const response = await this.send({ url, method: 'GET', headers: { 'User-Agent': UA } });
    if (response.status < 200 || response.status >= 300) throw new Error(`KissAsian HTTP ${response.status}`);
    return String(response.data || '');
  }

  async requestJSON(url) {
    const response = await this.send({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (response.status < 200 || response.status >= 300) throw new Error(`KissAsian HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('KissAsian answered a page that is not data');
    }
  }
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

module.exports = { Source };
