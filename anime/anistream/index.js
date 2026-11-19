const GRAPHQL_HOSTS = ['https://graphql.animex.one', 'https://graphql.anidap.lol'];
const API_HOSTS = ['https://api.anistream.one', 'https://chad.anidap.lol'];
const liveHost = { graphql: 0, rest: 0 };
const PAGE_SIZE = 30;

const CARD_FIELDS = 'id titleRomaji titleEnglish coverImage format status seasonYear episodeCount subCount dubCount isAdult genres';
const LIST_QUERY = `query($filter:AnimeCatalogFilterInput,$sort:[AnimeSortInput!],$limit:Int,$offset:Int){catalogAnime(filter:$filter,sort:$sort,limit:$limit,offset:$offset){items{${CARD_FIELDS}}totalCount hasNextPage}}`;
const DETAIL_QUERY = `query($id:String){anime(id:$id){${CARD_FIELDS} description bannerImage duration studios synonyms averageScore season}}`;

const BASE_FILTER = { includeAdult: true, subDubFilter: 'SUB' };

const FEEDS = [
  { id: 'trending', name: 'Trending', filter: {}, sort: [{ field: 'TRENDING', direction: 'DESC' }] },
  { id: 'popular', name: 'Popular', filter: {}, sort: [{ field: 'POPULARITY', direction: 'DESC' }] },
  { id: 'updated', name: 'Recently Updated', filter: { statusIn: ['RELEASING'] }, sort: [{ field: 'UPDATED_AT', direction: 'DESC' }] },
  { id: 'airing', name: 'Airing Now', filter: { statusIn: ['RELEASING'] }, sort: [{ field: 'POPULARITY', direction: 'DESC' }] },
  { id: 'score', name: 'Top Rated', filter: {}, sort: [{ field: 'AVERAGE_SCORE', direction: 'DESC' }] },
  { id: 'movies', name: 'Movies', filter: { formatIn: ['MOVIE'] }, sort: [{ field: 'POPULARITY', direction: 'DESC' }] },
  { id: 'dub', name: 'English Dub', filter: { subDubFilter: 'DUB' }, sort: [{ field: 'POPULARITY', direction: 'DESC' }] },
  { id: 'added', name: 'Recently Added', filter: {}, sort: [{ field: 'CREATED_AT', direction: 'DESC' }] },
  { id: 'az', name: 'A to Z', filter: {}, sort: [{ field: 'TITLE_ENGLISH', direction: 'ASC' }] },
];

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller',
];

const PROVIDER_ORDER = ['yuki', 'nero', 'zuna', 'sora', 'loli'];
const MAX_SUB = 3;
const MAX_DUB = 2;

const LANGS = {
  english: 'en', arabic: 'ar', german: 'de', spanish: 'es', french: 'fr', indonesian: 'id', italian: 'it', malay: 'ms', portuguese: 'pt', russian: 'ru', thai: 'th', vietnamese: 'vi',
  chinese: 'zh', japanese: 'ja', korean: 'ko', turkish: 'tr', polish: 'pl', hindi: 'hi', hebrew: 'he', dutch: 'nl', romanian: 'ro', bulgarian: 'bg',
};

function entities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function clean(text) {
  return entities(String(text || '')).replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function plainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ageOf(item) {
  const genres = Array.isArray(item && item.genres) ? item.genres : [];
  if (item && item.isAdult) return 18;
  if (genres.some((g) => /^hentai$/i.test(g))) return 18;
  if (genres.some((g) => /^ecchi$/i.test(g))) return 16;
  return 0;
}

function coverOf(value, big) {
  if (!value) return '';
  if (typeof value === 'string') return big ? value : value.replace('/anime/cover/large/', '/anime/cover/medium/');
  return (big ? value.extraLarge || value.large : value.large || value.extraLarge) || value.medium || '';
}

function statusOf(value) {
  const s = String(value || '').toUpperCase();
  if (s === 'RELEASING') return 'ONGOING';
  if (s === 'FINISHED') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'HIATUS') return 'HIATUS';
  return 'UNKNOWN';
}

function formatName(format) {
  const f = String(format || '');
  if (f === 'TV_SHORT') return 'TV Short';
  if (f === 'MOVIE') return 'Movie';
  return f ? f.toUpperCase() : '';
}

class Source {
  constructor() {
    this.catalog = App.createRequestManager({ rateLimit: { requestsPerMinute: 24 } });
    this.rest = App.createRequestManager({});
    this.memo = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async call(manager, request) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await manager.schedule(App.createRequest(request));
      let body = null;
      try {
        body = JSON.parse(String(response.data || ''));
      } catch (e) {
        body = null;
      }
      if (response.status === 429 || (body && (body.error === 'rate_limited' || body.error === 'too_many_requests'))) {
        const wait = Number((body && body.retry_after) || (response.headers && (response.headers['retry-after'] || response.headers['Retry-After']))) || 30;
        if (attempt === 0 && wait <= 8) {
          await pause(wait * 1000 + 300);
          continue;
        }
        throw Object.assign(new Error(`Anistream asked to slow down${body && body.reason ? ` (${body.reason})` : ''}, try again in about ${Math.ceil(wait)} seconds`), { slow: true });
      }
      return { status: response.status, body, text: String(response.data || '') };
    }
    throw Object.assign(new Error('Anistream asked to slow down'), { slow: true });
  }

  async mirrored(kind, hosts, manager, make) {
    let first = null;
    let challenge = null;
    let notJson = null;
    for (let i = 0; i < hosts.length; i++) {
      const index = (liveHost[kind] + i) % hosts.length;
      let r;
      try {
        r = await this.call(manager, make(hosts[index]));
      } catch (e) {
        if (e && (e.kind === 'blocked' || /allowed hosts/i.test(String(e.message)))) throw e;
        if (e && e.slow) throw e;
        if (e && e.kind === 'challenge') challenge = challenge || e;
        else first = first || e;
        continue;
      }
      if (r.body === null) {
        notJson = notJson || r;
        continue;
      }
      liveHost[kind] = index;
      return r;
    }
    if (notJson) return notJson;
    throw challenge || first;
  }

  async graphql(query, variables) {
    const key = JSON.stringify([query, variables]);
    const hit = this.memo.get(key);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.promise;
    const promise = (async () => {
      const r = await this.mirrored('graphql', GRAPHQL_HOSTS, this.catalog, (host) => ({
        url: `${host}/graphql`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      }));
      if (r.status < 200 || r.status >= 300 || !r.body) throw new Error(`Anistream: the catalog answered HTTP ${r.status}`);
      if (r.body.errors && r.body.errors.length) throw new Error(`Anistream: ${clean(r.body.errors[0].message)}`);
      if (!r.body.data) throw new Error('Anistream: the catalog gave no data');
      return r.body.data;
    })().catch((e) => {
      this.memo.delete(key);
      throw e;
    });
    this.memo.set(key, { at: Date.now(), promise });
    if (this.memo.size > 60) this.memo.delete(this.memo.keys().next().value);
    return promise;
  }

  async restJson(path) {
    const r = await this.mirrored('rest', API_HOSTS, this.rest, (host) => ({ url: `${host}/rest/api${path}`, method: 'GET', headers: { Accept: 'application/json' } }));
    return r;
  }

  card(item) {
    const title = clean(item.titleEnglish) || clean(item.titleRomaji);
    const out = { mangaId: String(item.id), title, image: coverOf(item.coverImage, false), medium: 'anime', ageRating: ageOf(item) };
    const bits = [formatName(item.format), item.seasonYear ? String(item.seasonYear) : '', item.episodeCount ? `${item.episodeCount} episodes` : '', item.dubCount > 0 ? 'Sub and Dub' : 'Sub'].filter(Boolean);
    out.summary = bits.join(' - ');
    return out;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tags = included.map((t) => String((t && (t.id || t.label)) || t)).filter((t) => GENRES.indexOf(t) >= 0);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const filter = Object.assign({}, BASE_FILTER, query || tags.length ? {} : feed.filter);
    let sort = feed.sort;
    if (query) {
      filter.query = query;
      sort = undefined;
    } else if (tags.length) sort = [{ field: 'POPULARITY', direction: 'DESC' }];
    if (tags.length) filter.genres = tags;
    const data = await this.graphql(LIST_QUERY, { filter, sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    const connection = data.catalogAnime || { items: [] };
    const results = (connection.items || []).filter((it) => it && it.id).map((it) => this.card(it));
    return { results, metadata: results.length && connection.hasNextPage ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const data = await this.graphql(DETAIL_QUERY, { id: String(mangaId) });
    const a = data.anime;
    if (!a) throw new Error('Anistream: title not found');
    const title = clean(a.titleEnglish) || clean(a.titleRomaji);
    const also = [a.titleRomaji && a.titleRomaji !== title ? a.titleRomaji : '', ...(Array.isArray(a.synonyms) ? a.synonyms.slice(0, 5) : [])].map(clean).filter(Boolean);
    const cover = coverOf(a.coverImage, true);
    const info = {
      title,
      image: cover,
      desc: [plainText(a.description), also.length ? `Also known as: ${also.join(', ')}` : ''].filter(Boolean).join('\n\n') || undefined,
      status: statusOf(a.status),
      tags: Array.isArray(a.genres) ? a.genres : [],
      webURL: `https://anistream.one/anime/${encodeURIComponent(String(mangaId))}`,
      medium: 'anime',
      ageRating: ageOf(a),
    };
    if (Array.isArray(a.studios) && a.studios.length) info.author = a.studios.slice(0, 3).map(clean).join(', ');
    if (a.bannerImage) info.banner = a.bannerImage;
    info.completed = info.status === 'COMPLETED';
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const r = await this.restJson(`/episodes?id=${encodeURIComponent(String(mangaId))}`);
    if (r.status === 404) throw new Error('Anistream: title not found');
    if (r.status < 200 || r.status >= 300 || !Array.isArray(r.body)) throw new Error(`Anistream: the episode list answered HTTP ${r.status}`);
    const seen = new Set();
    const chapters = [];
    for (const e of r.body) {
      const number = Number(e && e.number);
      if (!Number.isInteger(number) || number < 1 || seen.has(number)) continue;
      if (!(e.hasSub || e.hasDub)) continue;
      seen.add(number);
      const titles = e.titles && typeof e.titles === 'object' ? e.titles : {};
      const own = clean(titles.en || titles['x-jat'] || titles.ja);
      const chapter = { id: String(number), chapterId: String(number), name: own ? `Episode ${number}: ${own}` : `Episode ${number}`, number };
      if (own) chapter.title = own;
      const time = Date.parse(String(e.airDateUtc || ''));
      if (Number.isFinite(time) && time > 0) chapter.time = time;
      if (/^https?:\/\//i.test(String(e.img || ''))) chapter.thumbnail = String(e.img);
      const minutes = Number(e.length);
      if (minutes > 0) chapter.duration = Math.round(minutes * 60);
      const summary = clean(e.description);
      if (summary) chapter.summary = summary;
      chapters.push(chapter);
    }
    if (!chapters.length) throw new Error('Anistream has no episodes for this title yet');
    chapters.sort((a, b) => b.number - a.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  subtitles(tracks) {
    const out = [];
    const names = new Set();
    for (const t of Array.isArray(tracks) ? tracks : []) {
      const url = clean(t && t.url);
      const label = clean(t && (t.label || t.lang));
      const kind = clean(t && t.kind).toLowerCase();
      if (!/^https?:\/\//i.test(url) || !label || (kind && kind !== 'captions' && kind !== 'subtitles') || /thumbnail|storyboard|sprite|preview\//i.test(`${url} ${label}`)) continue;
      const key = label.toLowerCase();
      if (names.has(key)) continue;
      names.add(key);
      const base = key.replace(/\s*\(.*\)\s*$/, '');
      const language = LANGS[base] || (/^[a-z]{2}$/.test(key) ? key : '');
      const track = { url, label };
      if (language) track.language = language;
      out.push({ track, forced: /forced/i.test(label), english: language === 'en' });
    }
    out.sort((a, b) => (a.forced ? 1 : 0) - (b.forced ? 1 : 0) || (b.english ? 1 : 0) - (a.english ? 1 : 0));
    return out.map((o) => o.track);
  }

  streamHeaders(url, given) {
    if (/(^|\.)krussdomi\.com(\/|$)/i.test(String(url).replace(/^https?:\/\//i, ''))) return { Referer: 'https://krussdomi.com/', Origin: 'https://krussdomi.com' };
    const out = {};
    const source = given && typeof given === 'object' ? given : {};
    for (const key of Object.keys(source)) {
      if (/^user-agent$/i.test(key) || typeof source[key] !== 'string' || !source[key]) continue;
      out[key] = source[key];
    }
    return out;
  }

  async video(mangaId, epNum, type, provider) {
    const r = await this.restJson(`/sources?id=${encodeURIComponent(String(mangaId))}&epNum=${epNum}&type=${type}&providerId=${encodeURIComponent(provider)}`);
    if (r.status < 200 || r.status >= 300 || !r.body) throw new Error(`${provider} answered HTTP ${r.status}`);
    const sources = Array.isArray(r.body.sources) ? r.body.sources.filter((s) => s && /^https?:\/\//i.test(String(s.url || ''))) : [];
    if (!sources.length) throw new Error(`${provider} gave no stream`);
    const first = sources[0];
    const hls = /m3u8|mpegurl/i.test(`${first.url} ${first.type || ''}`);
    const subtitles = this.subtitles(r.body.tracks);
    const word = type === 'dub' ? 'Dub' : subtitles.length ? 'Softsub' : provider === 'nero' ? 'Hardsub' : 'Sub';
    const entry = {
      url: String(first.url),
      quality: hls ? `Auto ${word}` : `${clean(first.quality) || 'Default'} ${word}`,
      type: hls ? 'hls' : 'mp4',
      server: provider.charAt(0).toUpperCase() + provider.slice(1),
      headers: this.streamHeaders(first.url, r.body.headers),
    };
    if (subtitles.length) entry.subtitles = subtitles;
    for (const c of Array.isArray(r.body.chapters) ? r.body.chapters : []) {
      const start = Math.round(Number(c && c.start) * 1000);
      const end = Math.round(Number(c && c.end) * 1000);
      if (!(end > start) || start < 0) continue;
      if (/intro|opening|^op$/i.test(String(c.title || ''))) entry.intro = { start, end };
      else if (/outro|ending|credits|^ed$/i.test(String(c.title || ''))) entry.outro = { start, end };
    }
    return entry;
  }

  async getVideos(mangaId, chapterId) {
    const epNum = parseInt(String(chapterId), 10);
    if (!Number.isInteger(epNum) || epNum < 1) throw new Error('Anistream: unknown episode');
    const s = await this.restJson(`/servers?id=${encodeURIComponent(String(mangaId))}&epNum=${epNum}`);
    if (s.status === 404 || s.status === 400) throw new Error('Anistream has no such episode');
    if (s.status < 200 || s.status >= 300 || !s.body) throw new Error(`Anistream: the server list answered HTTP ${s.status}`);
    const pick = (list, max) => {
      const ids = (Array.isArray(list) ? list : []).map((p) => String(p && p.id)).filter(Boolean);
      const rank = (id) => (PROVIDER_ORDER.indexOf(id) >= 0 ? PROVIDER_ORDER.indexOf(id) : 50);
      ids.sort((a, b) => rank(a) - rank(b));
      return ids.slice(0, max);
    };
    const wanted = [];
    for (const id of pick(s.body.subProviders, MAX_SUB)) wanted.push({ type: 'sub', id });
    for (const id of pick(s.body.dubProviders, MAX_DUB)) wanted.push({ type: 'dub', id });
    if (!wanted.length) throw new Error('Anistream lists this episode with no server yet, so the site has no stream for it');
    let limited = null;
    const lastErrors = [];
    const results = await Promise.all(
      wanted.map(async (w) => {
        try {
          return await this.video(mangaId, epNum, w.type, w.id);
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
          if (/slow down/i.test(String((e && e.message) || ''))) limited = e;
          else lastErrors.push(String((e && e.message) || e));
          return null;
        }
      })
    );
    const videos = results.filter(Boolean);
    const place = (v) => (PROVIDER_ORDER.indexOf(v.server.toLowerCase()) >= 0 ? PROVIDER_ORDER.indexOf(v.server.toLowerCase()) : 50);
    const order = (v) => place(v) * 2 + (/Dub/.test(v.quality) ? 1 : 0);
    videos.sort((a, b) => order(a) - order(b));
    if (!videos.length) {
      if (limited) throw limited;
      throw new Error(`Anistream: none of this episode's servers gave a stream${lastErrors.length ? ` (${lastErrors[0]})` : ''}`);
    }
    return videos;
  }
}

module.exports = { Source };
