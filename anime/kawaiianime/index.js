const SITE = 'https://kawaiianime.cc';
const VIDEO_HOST = 'video.kawaii-anime.com';
const PAGE = 24;

const FIELDS = 'id idMal title { romaji english } coverImage { large extraLarge } bannerImage genres isAdult format status episodes seasonYear averageScore description(asHtml: false)';

const FEEDS = [
  { id: 'popular', name: 'Popular', sort: 'POPULARITY_DESC' },
  { id: 'trending', name: 'Trending', sort: 'TRENDING_DESC' },
  { id: 'airing', name: 'Airing now', sort: 'POPULARITY_DESC', extra: 'status: RELEASING' },
  { id: 'top', name: 'Top rated', sort: 'SCORE_DESC' },
  { id: 'new', name: 'New this season', sort: 'START_DATE_DESC', extra: 'status: RELEASING' },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

const LANGS = { english: 'en', arabic: 'ar', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', russian: 'ru', italian: 'it', indonesian: 'id', turkish: 'tr' };

function ageFrom(item) {
  const genres = (item.genres || []).map((g) => String(g).toLowerCase());
  if (item.isAdult === true || genres.indexOf('hentai') >= 0) return 18;
  if (genres.indexOf('ecchi') >= 0) return 16;
  return 0;
}

function nameOf(item) {
  const t = item.title || {};
  return String(t.english || t.romaji || `Anime ${item.id}`);
}

function statusOf(item) {
  const s = String(item.status || '').toUpperCase();
  if (s === 'RELEASING') return 'ONGOING';
  if (s === 'FINISHED') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'HIATUS') return 'HIATUS';
  return 'UNKNOWN';
}

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SEASON_ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const SEASON_NOISE = /\b(sub|subs|subtitulado|subtitulada|espanol|latino|castellano|dub|dublado|doblado|hd|tv|uncensored|sin censura)\b/g;
const SEASON_MAX_SIBLINGS = 14;
const SEASON_SEP = '@@';
function splitSeasonId(mangaId, chapterId) {
  const text = String(chapterId === undefined || chapterId === null ? '' : chapterId);
  const at = text.indexOf(SEASON_SEP);
  return at > 0 ? { mangaId: text.slice(0, at), chapterId: text.slice(at + SEASON_SEP.length) } : { mangaId, chapterId };
}

function parseFranchise(title) {
  const folded = String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ');
  let lang = '';
  if (/\blatino\b/.test(folded)) lang = 'latino';
  else if (/\bcastellano\b/.test(folded)) lang = 'castellano';
  else if (/\b(sub|subs|subtitulado|subtitulada)\b/.test(folded)) lang = 'sub';
  else if (/\b(dub|dublado|doblado)\b/.test(folded)) lang = 'dub';
  let t = folded
    .replace(SEASON_NOISE, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let kind = 'main';
  if (/\b(ova|oad|ona|original video animation)\b/.test(t)) kind = 'ova';
  if (/\b(special|specials|recap|recaps|extra|extras|summary)\b/.test(t)) kind = 'special';
  if (/\b(movie|movies|pelicula|peliculas|film|gekijouban)\b/.test(t)) kind = 'movie';
  let season = null;
  let final = false;
  const take = (re, read) => {
    const m = re.exec(t);
    if (!m) return false;
    season = read(m);
    t = t.replace(re, ' ');
    return true;
  };
  if (/\bfinal season\b/.test(t)) {
    final = true;
    t = t.replace(/\bfinal season\b/, ' ');
  } else if (
    !take(/\b(\d{1,2})(?:st|nd|rd|th) season\b/, (m) => Number(m[1])) &&
    !take(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) season\b/, (m) => SEASON_ORDINALS[m[1]]) &&
    !take(/\b(?:season|temporada|staffel|saison)s? (\d{1,2})\b/, (m) => Number(m[1])) &&
    !take(/\bs(\d{1,2})\b/, (m) => Number(m[1])) &&
    !take(/\s([2-9])$/, (m) => Number(m[1]))
  ) {
    take(/\s(ii|iii|iv)$/, (m) => ({ ii: 2, iii: 3, iv: 4 })[m[1]]);
  }
  t = t.replace(/\b(?:part|cour|parte) \d{1,2}\b/g, ' ').replace(/\b(ova|oad|ona|special|specials|recap|movie|pelicula|film)\b/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return { base: t, kind, season, final, lang };
}

async function findFranchise(source, mangaId, ownTitle) {
  const own = parseFranchise(ownTitle);
  if (!own.base || own.base.length < 3) return [];
  const words = own.base.split(' ');
  const queries = [own.base];
  if (words.length > 4) queries.push(words.slice(0, 4).join(' '));
  const spelled = String(ownTitle || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  if (spelled && queries.indexOf(spelled) < 0) queries.push(spelled);
  const found = new Map();
  const readQuery = async (query) => {
    const hits = [];
    const local = new Set();
    let metadata;
    for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
      let page;
      try {
        page = await source.getSearchResultsRaw({ title: query }, metadata);
      } catch (e) {
        break;
      }
      for (const r of (page && page.results) || []) {
        if (!r || !r.mangaId || local.has(r.mangaId)) continue;
        local.add(r.mangaId);
        const p = parseFranchise(r.title);
        const same = p.base === own.base || (p.kind !== 'main' && p.base.indexOf(own.base + ' ') === 0);
        if (same) hits.push({ mangaId: r.mangaId, title: r.title, image: r.image, kind: p.kind, season: p.season, final: p.final, base: p.base, lang: p.lang });
      }
      metadata = page && page.metadata;
      if (!metadata) break;
    }
    return hits;
  };
  const firstHits = await readQuery(queries[0]);
  for (const h of firstHits) if (!found.has(h.mangaId)) found.set(h.mangaId, h);
  if (found.size <= 1 && queries.length > 1) {
    const others = await Promise.all(queries.slice(1).map((q) => readQuery(q)));
    for (const hits of others) {
      for (const h of hits) if (!found.has(h.mangaId)) found.set(h.mangaId, h);
      if (found.size > 1) break;
    }
  }
  if (!found.has(mangaId)) found.set(mangaId, { mangaId, title: ownTitle, image: undefined, kind: own.kind, season: own.season, final: own.final, base: own.base, lang: own.lang });
  return found.size > 1 ? pickVariants(Array.from(found.values()), mangaId, own.lang) : [];
}

function pickVariants(members, mangaId, ownLang) {
  const keyOf = (m) => (m.kind === 'main' ? `main:${m.final ? 'final' : m.season || 1}` : `${m.kind}:${m.base}`);
  const score = (m) => (m.mangaId === mangaId ? 3 : m.lang && m.lang === ownLang ? 2 : !m.lang ? 1 : 0);
  const best = new Map();
  for (const m of members) {
    const key = keyOf(m);
    if (!best.has(key) || score(m) > score(best.get(key))) best.set(key, m);
  }
  const chosen = Array.from(best.values());
  const rank = (m) => (m.mangaId === mangaId ? 0 : m.kind === 'main' ? 1 : 2);
  return chosen
    .map((m, index) => ({ m, index }))
    .sort((a, b) => rank(a.m) - rank(b.m) || a.index - b.index)
    .slice(0, SEASON_MAX_SIBLINGS + 1)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.m);
}

function numberSeasons(members) {
  const seasons = members.filter((m) => m.kind === 'main');
  let highest = 1;
  for (const m of seasons) if (m.season) highest = Math.max(highest, m.season);
  for (const m of seasons) {
    if (m.final) m.number = highest + 1;
    else m.number = m.season || 1;
  }
  return seasons;
}

const SEASON_GROUP_NAMES = { ova: 'OVAs', movie: 'Movies', special: 'Specials' };

async function connectSeasons(source, mangaId, ownTitle, composite) {
  const ownRead = source.getChaptersOfTitle(mangaId);
  ownRead.catch(() => {});
  let members = [];
  try {
    members = await findFranchise(source, mangaId, ownTitle);
  } catch (e) {
    members = [];
  }
  const own = parseFranchise(ownTitle);
  if (members.length < 2 || (own.kind !== 'main')) return ownRead;
  const seasons = numberSeasons(members);
  if (seasons.length < 2 && members.filter((m) => m.kind !== 'main').length === 0) return ownRead;
  const lists = new Array(members.length);
  const ownAt = members.findIndex((m) => m.mangaId === mangaId);
  if (ownAt >= 0) lists[ownAt] = await ownRead;
  const todo = members.map((m, i) => i).filter((i) => i !== ownAt);
  const readSibling = async (i) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const list = await source.getChaptersOfTitle(members[i].mangaId);
        if (list && list.length) return list;
      } catch (e) {
      }
    }
    return [];
  };
  let cursor = 0;
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (cursor < todo.length) {
        const i = todo[cursor++];
        lists[i] = await readSibling(i);
      }
    })
  );
  const out = [];
  const seen = new Set();
  members.forEach((m, i) => {
    const group = m.kind === 'main' ? null : SEASON_GROUP_NAMES[m.kind];
    const name = m.final ? 'Final Season' : `Season ${m.number}`;
    for (const chapter of lists[i] || []) {
      if (!chapter) continue;
      const finalId = composite && m.mangaId !== mangaId ? m.mangaId + SEASON_SEP + chapter.id : chapter.id;
      if (seen.has(finalId)) continue;
      seen.add(finalId);
      const tagged = Object.assign({}, chapter);
      if (finalId !== chapter.id) {
        tagged.id = finalId;
        if (tagged.chapterId !== undefined) tagged.chapterId = finalId;
      }
      if (m.kind === 'main') {
        if (tagged.season === undefined || tagged.season === null) {
          tagged.season = String(m.number);
          tagged.seasonName = name;
        }
        if (m.image && !tagged.seasonCover) tagged.seasonCover = m.image;
      } else {
        delete tagged.season;
        tagged.seasonName = group;
      }
      out.push(tagged);
    }
  });
  const rank = (chapter) => {
    const s = chapter.season === undefined ? -1 : Number(chapter.season);
    return Number.isFinite(s) ? s : -1;
  };
  return out
    .map((chapter, index) => ({ chapter, index }))
    .sort((a, b) => rank(b.chapter) - rank(a.chapter) || a.index - b.index)
    .map((x) => x.chapter);
}

function collapseSeasons(page, request) {
  if (!page || !Array.isArray(page.results)) return page;
  const parsed = page.results.map((r) => parseFranchise(r.title));
  const groups = new Map();
  parsed.forEach((p, index) => {
    if (p.kind !== 'main' || !p.base) return;
    const rank = p.final ? 99 : p.season || 1;
    const list = groups.get(p.base) || [];
    list.push({ index, rank });
    groups.set(p.base, list);
  });
  const drop = new Set();
  const heads = new Map();
  for (const [base, list] of groups) {
    const lowest = list.reduce((a, b) => (b.rank < a.rank ? b : a));
    heads.set(base, lowest.index);
    if (list.length < 2 || lowest.rank !== 1) continue;
    for (const x of list) if (x.index !== lowest.index) drop.add(x.index);
  }
  const headOf = (p) => {
    let best = '';
    for (const base of heads.keys()) {
      const sameName = p.kind !== 'main' && p.base === base;
      if ((sameName || p.base.indexOf(base + ' ') === 0) && base.length > best.length) best = base;
    }
    return best ? heads.get(best) : -1;
  };
  const deferred = new Map();
  const rest = [];
  page.results.forEach((r, index) => {
    if (drop.has(index)) return;
    const head = headOf(parsed[index]);
    if (head > index) {
      const list = deferred.get(head) || [];
      list.push(r);
      deferred.set(head, list);
    } else rest.push({ r, index });
  });
  let results = page.results;
  if (drop.size || deferred.size) {
    results = [];
    for (const x of rest) {
      results.push(x.r);
      for (const d of deferred.get(x.index) || []) results.push(d);
    }
  }
  const typed = request && request.title ? parseFranchise(request.title) : null;
  if (typed && typed.base.length >= 3) {
    const exact = results.filter((r) => {
      const p = parseFranchise(r.title);
      return p.kind === 'main' && p.base === typed.base;
    });
    if (exact.length && results[0] !== exact[0]) results = exact.concat(results.filter((r) => exact.indexOf(r) < 0));
  }
  return results === page.results ? page : Object.assign({}, page, { results });
}

class Source {
  constructor() {
    this.manager = App.createRequestManager({});
    this.catalogManager = App.createRequestManager({ rateLimit: { requestsPerMinute: 30 } });
    this.listManager = App.createRequestManager({ rateLimit: { requestsPerSecond: 8 } });
    this.memo = new Map();
  }

  remember(key, ms, make) {
    const hit = this.memo.get(key);
    if (hit && hit.until > Date.now()) return hit.promise;
    const promise = make();
    this.memo.set(key, { until: Date.now() + ms, promise });
    promise.catch(() => this.memo.delete(key));
    if (this.memo.size > 300) this.memo.delete(this.memo.keys().next().value);
    return promise;
  }

  async send(request, manager) {
    let last;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await (manager || this.manager).schedule(App.createRequest(request));
        if (res.status === 429 || res.status >= 500) {
          last = new Error(`HTTP ${res.status} from ${SITE}`);
          continue;
        }
        return res;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last || new Error('request failed');
  }

  graphql(query, variables) {
    return this.remember(`gql:${query}:${JSON.stringify(variables)}`, 120000, async () => {
      const res = await this.send(
        {
          url: `${SITE}/api/anilist`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
        },
        this.catalogManager,
      );
      if (res.status === 404) return null;
      if (res.status < 200 || res.status >= 300) throw new Error(`Kawaii Anime catalog answered HTTP ${res.status}`);
      let data;
      try {
        data = JSON.parse(res.data);
      } catch (e) {
        throw new Error('Kawaii Anime catalog sent something that is not JSON');
      }
      if (data.errors && data.errors.length && !data.data) throw new Error(`Kawaii Anime catalog: ${String(data.errors[0].message || 'error').slice(0, 120)}`);
      return data.data;
    });
  }

  async getJSON(path, manager) {
    const res = await this.send({ url: `${SITE}${path}`, method: 'GET', headers: { Accept: 'application/json' } }, manager);
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw new Error(`Kawaii Anime answered HTTP ${res.status} for ${path.split('?')[0]}`);
    try {
      return JSON.parse(res.data);
    } catch (e) {
      throw new Error('Kawaii Anime sent something that is not JSON');
    }
  }

  episodes(id) {
    return this.remember(`eps:${id}`, 300000, async () => {
      const data = await this.getJSON(`/api/cached-episodes?anilistId=${encodeURIComponent(id)}`, this.listManager);
      const list = data && Array.isArray(data.eps) ? data.eps.map(Number).filter((n) => Number.isFinite(n)) : [];
      const seen = new Set();
      const out = [];
      for (const n of list) {
        if (seen.has(n)) continue;
        seen.add(n);
        out.push(n);
      }
      return out.sort((a, b) => a - b);
    });
  }

  async hosted(id) {
    try {
      return (await this.episodes(String(id))).length > 0;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return true;
    }
  }

  toTitle(item) {
    const score = Number(item.averageScore);
    const bits = [item.format ? String(item.format).replace(/_/g, ' ') : '', item.seasonYear ? String(item.seasonYear) : ''].filter(Boolean);
    const t = {
      mangaId: String(item.id),
      title: nameOf(item),
      image: (item.coverImage && (item.coverImage.large || item.coverImage.extraLarge)) || undefined,
      tags: item.genres || [],
      ageRating: ageFrom(item),
      medium: 'anime',
      completed: statusOf(item) === 'COMPLETED',
      webURL: `${SITE}/anime/${item.id}`,
    };
    if (bits.length) t.summary = bits.join(' · ');
    if (Number.isFinite(score) && score > 0) t.rating = Math.round(score) / 10;
    return t;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async getSearchResultsRaw(request, metadata) {
    request = request || {};
    const page = (metadata && Number(metadata.page)) || 1;
    const query = String(request.title || '').trim();
    const tags = request.includedTags || [];
    const first = tags.length ? String(tags[0].id || tags[0].label || '') : '';
    const genre = GENRES.find((g) => g.toLowerCase() === first.toLowerCase()) || '';
    const feed = FEEDS.find((f) => f.id === request.feed) || FEEDS[0];
    const args = ['type: ANIME'];
    const defs = ['$page: Int'];
    const vars = { page };
    if (query) {
      args.push('search: $search');
      defs.push('$search: String');
      vars.search = query;
    } else {
      args.push(`sort: ${feed.sort}`);
      if (feed.extra) args.push(feed.extra);
    }
    if (genre) {
      args.push('genre: $genre');
      defs.push('$genre: String');
      vars.genre = genre;
    }
    const text = `query(${defs.join(', ')}) { Page(page: $page, perPage: ${PAGE}) { pageInfo { hasNextPage } media(${args.join(', ')}) { ${FIELDS} } } }`;
    const data = await this.graphql(text, vars);
    const media = (data && data.Page && Array.isArray(data.Page.media) ? data.Page.media : []).filter((m) => m && m.id);
    const flags = await Promise.all(media.map((m) => this.hosted(m.id)));
    const results = media.filter((m, n) => flags[n]).map((m) => this.toTitle(m));
    const more = !!(data && data.Page && data.Page.pageInfo && data.Page.pageInfo.hasNextPage) && media.length > 0;
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const id = Number(mangaId);
    if (!Number.isFinite(id)) throw new Error(`Kawaii Anime has no title with id ${mangaId}`);
    const data = await this.graphql(`query($id: Int) { Media(id: $id, type: ANIME) { ${FIELDS} studios(isMain: true) { nodes { name } } } }`, { id });
    const item = data && data.Media;
    if (!item) throw new Error(`Kawaii Anime has no title with id ${mangaId}`);
    const info = this.toTitle(item);
    info.desc = plain(item.description);
    info.status = statusOf(item);
    if (item.bannerImage) info.banner = item.bannerImage;
    const studios = item.studios && Array.isArray(item.studios.nodes) ? item.studios.nodes.map((s) => s && s.name).filter(Boolean) : [];
    if (studios.length) info.author = studios.join(', ');
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    return connectSeasons(this, mangaId, await this.seasonTitleOf(mangaId), true);
  }

  async getSearchResults(request, metadata) {
    return collapseSeasons(await this.getSearchResultsRaw(request, metadata), request);
  }

  async seasonTitleOf(mangaId) {
    this.seasonTitles = this.seasonTitles || new Map();
    if (!this.seasonTitles.has(mangaId)) {
      let title = '';
      try {
        const details = await this.getMangaDetails(mangaId);
        title = String((details && details.mangaInfo && details.mangaInfo.title) || '');
      } catch (e) {
        title = '';
      }
      this.seasonTitles.set(mangaId, title || String(mangaId).split('/').pop().replace(/[-_]+/g, ' '));
    }
    return this.seasonTitles.get(mangaId);
  }

  async getChaptersOfTitle(mangaId) {
    const id = String(mangaId);
    const list = await this.episodes(id);
    if (!list.length) throw new Error('Kawaii Anime has no episodes hosted for this title yet');
    return list
      .slice()
      .sort((a, b) => b - a)
      .map((n) => ({ id: String(n), name: `Episode ${n}`, number: n }));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: String(chapterId), mangaId: String(mangaId), pages: [] };
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const id = String(mangaId);
    const ep = String(chapterId);
    const data = await this.getJSON(`/api/miruro?anilistId=${encodeURIComponent(id)}&ep=${encodeURIComponent(ep)}`);
    const body = data && data.data;
    const sources = body && Array.isArray(body.sources) ? body.sources.filter((s) => s && /^https?:\/\//.test(String(s.url || ''))) : [];
    if (!sources.length) throw new Error(`Kawaii Anime has no stream for episode ${ep} of this title yet`);
    const subs = [];
    const raw = Array.isArray(body.subtitles) ? body.subtitles : [];
    raw
      .filter((s) => s && String(s.url || '').indexOf(`https://${VIDEO_HOST}/`) === 0)
      .sort((a, b) => Number(/^english$/i.test(String(b.lang))) - Number(/^english$/i.test(String(a.lang))))
      .forEach((s) => {
        const label = String(s.lang || 'Subtitles');
        subs.push({ url: String(s.url), label, language: LANGS[label.toLowerCase()] || label.toLowerCase().slice(0, 3) });
      });
    const range = (r) => {
      if (!r || !Number.isFinite(Number(r.start)) || !Number.isFinite(Number(r.end))) return undefined;
      const start = Math.round(Number(r.start) * 1000);
      const end = Math.round(Number(r.end) * 1000);
      return end > start ? { start, end } : undefined;
    };
    const referer = body.headers && body.headers.Referer ? String(body.headers.Referer) : `${SITE}/`;
    return sources.map((s) => {
      const hls = s.isM3U8 === true || /\.m3u8(\?|$)/i.test(String(s.url));
      const entry = {
        url: String(s.url),
        quality: `${String(s.quality || '1080p')} Sub`,
        server: 'Kawaii Anime',
        headers: { Referer: referer },
      };
      if (!hls) entry.type = 'mp4';
      if (subs.length) entry.subtitles = subs;
      const intro = range(body.intro);
      const outro = range(body.outro);
      if (intro) entry.intro = intro;
      if (outro) entry.outro = outro;
      return entry;
    });
  }
}

module.exports = { Source };
