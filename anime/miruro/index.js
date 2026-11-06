const SITE = 'https://miruro.cx';
const PROXY_BASE = 'https://s1.keeply.top/';
const PROXY_KEY_HEX = 'a54d389c18527d9fd3e7f0643e27edbe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 5 * 60 * 1000;

const FEEDS = [
  { id: 'popular', name: 'Most Popular' },
  { id: 'trending', name: 'Trending Now' },
  { id: '-updated_at', name: 'Recently Updated' },
  { id: '-score', name: 'Highest Rated' },
  { id: '-season_year', name: 'Newest' },
  { id: 'title', name: 'Title A-Z' },
];

const GENRE_TAGS = [
  { id: 'Action', label: 'Action' },
  { id: 'Adventure', label: 'Adventure' },
  { id: 'Comedy', label: 'Comedy' },
  { id: 'Drama', label: 'Drama' },
  { id: 'Ecchi', label: 'Ecchi' },
  { id: 'Fantasy', label: 'Fantasy' },
  { id: 'Horror', label: 'Horror' },
  { id: 'Mahou Shoujo', label: 'Mahou Shoujo' },
  { id: 'Mecha', label: 'Mecha' },
  { id: 'Music', label: 'Music' },
  { id: 'Mystery', label: 'Mystery' },
  { id: 'Psychological', label: 'Psychological' },
  { id: 'Romance', label: 'Romance' },
  { id: 'Sci-Fi', label: 'Sci-Fi' },
  { id: 'Slice of Life', label: 'Slice of Life' },
  { id: 'Sports', label: 'Sports' },
  { id: 'Supernatural', label: 'Supernatural' },
  { id: 'Thriller', label: 'Thriller' },
];

const PROVIDER_LABELS = {
  sun: 'Icarus',
  bee: 'Anikoto',
  hop: 'KickAssAnime',
  kiwi: 'AnimePahe',
  knob: 'EchoVideo',
  ally: 'AllAnime',
  moo: 'Moo',
};

const TRACK_LABELS = {
  sub: 'Sub',
  ssub: 'Softsub',
  dub: 'Dub',
};

function pickTitle(titleObj) {
  if (!titleObj) return '';
  if (typeof titleObj === 'string') return titleObj.trim();
  return String(titleObj.english || titleObj.romaji || titleObj.native || '').trim();
}

function stripHtml(text) {
  if (!text) return '';
  const $ = cheerio.load(`<div>${String(text)}</div>`);
  return $('div')
    .text()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function statusOf(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'FINISHED') return 'COMPLETED';
  if (s === 'RELEASING') return 'ONGOING';
  return 'UNKNOWN';
}

function skipRange(range) {
  if (!range || typeof range !== 'object') return undefined;
  const start = Number(range.start);
  const end = Number(range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return undefined;
  }
  return { start: Math.round(start * 1000), end: Math.round(end * 1000) };
}

function utf8Bytes(str) {
  const encoded = encodeURIComponent(String(str));
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return bytes;
}

function base64UrlEncodeBytes(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const hasB2 = i < bytes.length;
    const b2 = hasB2 ? bytes[i++] : 0;
    const hasB3 = i < bytes.length;
    const b3 = hasB3 ? bytes[i++] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    out += chars[(triplet >> 18) & 0x3f];
    out += chars[(triplet >> 12) & 0x3f];
    if (hasB2) out += chars[(triplet >> 6) & 0x3f];
    if (hasB3) out += chars[triplet & 0x3f];
  }
  return out;
}

function obfuscateForProxy(str) {
  const key = [];
  for (let i = 0; i < PROXY_KEY_HEX.length; i += 2) {
    key.push(parseInt(PROXY_KEY_HEX.slice(i, i + 2), 16));
  }
  const bytes = utf8Bytes(str);
  const xored = [];
  for (let i = 0; i < bytes.length; i++) {
    xored.push(bytes[i] ^ key[i % key.length]);
  }
  return base64UrlEncodeBytes(xored);
}

function buildProxiedM3u8Url(streamUrl, referer, rotate) {
  const obfUrl = obfuscateForProxy(streamUrl);
  const obfRef = referer ? obfuscateForProxy(referer) : '';
  const isRotate = Boolean(rotate);
  return `${PROXY_BASE}${obfUrl}${obfRef ? `~${obfRef}` : isRotate ? '~' : ''}${isRotate ? '~anon' : ''}/pl.m3u8`;
}

function parseSvelteKitPage(html) {
  const resolved = {};
  const kit = {
    base: '',
    env: {},
    defer: (id) => ({ __deferred_id: id }),
    resolve: (id, fn) => {
      try {
        const res = fn();
        resolved[id] = Array.isArray(res) ? res[0] : res;
      } catch (_) {
        resolved[id] = null;
      }
    },
  };

  let rootData = null;
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const scriptText = match[1];
    const startMatch = scriptText.match(/kit\.start\(app,\s*element,\s*(\{[\s\S]*\})\);\s*\}\);/);
    if (startMatch) {
      try {
        const varMatch = scriptText.match(/(__sveltekit_[a-z0-9]+)\s*=/);
        const varName = varMatch ? varMatch[1] : '__sveltekit';
        const fn = new Function(varName, 'location', `return (${startMatch[1]});`);
        rootData = fn(kit, { pathname: '/' });
      } catch (_) {}
    }
    const resMatch = scriptText.match(/__sveltekit_[a-z0-9]+\.resolve\((\d+),\s*(\(\)\s*=>[\s\S]+)\)\s*$/);
    if (resMatch) {
      try {
        const id = Number(resMatch[1]);
        const fn = new Function(`return (${resMatch[2]})()`);
        const res = fn();
        resolved[id] = Array.isArray(res) ? res[0] : res;
      } catch (_) {}
    }
  }

  function hydrate(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj.__deferred_id != null) return resolved[obj.__deferred_id];
    if (Array.isArray(obj)) return obj.map(hydrate);
    const out = {};
    for (const k of Object.keys(obj)) {
      out[k] = hydrate(obj[k]);
    }
    return out;
  }

  const hydrated = hydrate(rootData);
  const nodes = Array.isArray(hydrated && hydrated.data) ? hydrated.data : [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i] && nodes[i].data) return nodes[i].data;
  }
  return {};
}

function mapCardItem(item) {
  if (!item) return null;
  const mangaId = String(item.id || item.animeId || '').trim();
  const title = pickTitle(item.title);
  const image = String(
    item.cover_url ||
      item.coverUrl ||
      (item.coverImage && (item.coverImage.extraLarge || item.coverImage.large)) ||
      ''
  ).trim();
  if (!mangaId || !title || !image) return null;

  const tags = Array.isArray(item.genres)
    ? item.genres.map((g) => String(g || '').trim()).filter(Boolean)
    : [];

  return {
    mangaId,
    title,
    image,
    tags,
    webURL: `${SITE}/info/${mangaId}`,
    medium: 'anime',
  };
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
  for (const query of queries) {
    let metadata;
    for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
      let page;
      try {
        page = await source.getSearchResultsRaw({ title: query }, metadata);
      } catch (e) {
        break;
      }
      for (const r of (page && page.results) || []) {
        if (!r || !r.mangaId || found.has(r.mangaId)) continue;
        const p = parseFranchise(r.title);
        const same = p.base === own.base || (p.kind !== 'main' && p.base.indexOf(own.base + ' ') === 0);
        if (same) found.set(r.mangaId, { mangaId: r.mangaId, title: r.title, image: r.image, kind: p.kind, season: p.season, final: p.final, base: p.base, lang: p.lang });
      }
      metadata = page && page.metadata;
      if (!metadata) break;
    }
    if (found.size > 1) break;
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
  let members = [];
  try {
    members = await findFranchise(source, mangaId, ownTitle);
  } catch (e) {
    members = [];
  }
  const own = parseFranchise(ownTitle);
  if (members.length < 2 || (own.kind !== 'main')) return source.getChaptersOfTitle(mangaId);
  const seasons = numberSeasons(members);
  if (seasons.length < 2 && members.filter((m) => m.kind !== 'main').length === 0) return source.getChaptersOfTitle(mangaId);
  const lists = new Array(members.length);
  const ownAt = members.findIndex((m) => m.mangaId === mangaId);
  if (ownAt >= 0) lists[ownAt] = await source.getChaptersOfTitle(members[ownAt].mangaId);
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
    this.requests = App.createRequestManager({});
    this.infoCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRE_TAGS.map((t) => ({ id: t.id, label: t.label }));
  }

  async getSearchResultsRaw(request, metadata) {
    const query = String((request && request.title) || '').trim();
    const cursor = String((metadata && metadata.cursor) || '').trim();
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];

    if (!query && !included.length && feed.id === 'trending' && !cursor) {
      const html = await this.text(`${SITE}/trending`);
      const data = parseSvelteKitPage(html);
      const results = [];
      const seen = new Set();
      for (const raw of data.items || []) {
        const card = mapCardItem(raw);
        if (!card || seen.has(card.mangaId)) continue;
        seen.add(card.mangaId);
        results.push(card);
      }
      return {
        results,
        metadata: undefined,
      };
    }

    const genres = [];
    for (const tag of included) {
      const id = String((tag && tag.id) || '').trim();
      if (id) genres.push(id);
    }

    const parts = [];
    if (query) {
      parts.push(`q=${encodeURIComponent(query)}`);
    } else if (feed && feed.id && feed.id !== 'popular' && feed.id !== 'trending') {
      parts.push(`sort=${encodeURIComponent(feed.id)}`);
    }
    if (genres.length) {
      parts.push(`genres=${encodeURIComponent(genres.join(','))}`);
    }
    if (cursor) {
      parts.push(`cursor=${encodeURIComponent(cursor)}`);
    }

    const qs = parts.length ? `?${parts.join('&')}` : '';
    const html = await this.text(`${SITE}/search${qs}`);
    const data = parseSvelteKitPage(html);

    const results = [];
    const seen = new Set();
    for (const raw of data.items || []) {
      const card = mapCardItem(raw);
      if (!card || seen.has(card.mangaId)) continue;
      seen.add(card.mangaId);
      results.push(card);
    }

    const hasNext = Boolean(data.hasMore && data.nextCursor && results.length > 0);
    return {
      results,
      metadata: hasNext ? { cursor: String(data.nextCursor) } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const cleanId = String(mangaId || '').trim();
    const data = await this.fetchInfoData(cleanId);
    const detail = data && data.detail;
    if (!detail) {
      throw new Error(`Miruro: anime details not found for ${cleanId}`);
    }

    const title = pickTitle(detail.title) || cleanId;
    const image = String(detail.cover_url || detail.banner_url || '').trim();
    const banner = detail.banner_url ? String(detail.banner_url).trim() : undefined;
    const desc = stripHtml(detail.description);

    const studios = Array.isArray(detail.studios)
      ? detail.studios.map((s) => String((s && s.name) || s || '').trim()).filter(Boolean)
      : [];
    const author = studios.length ? studios.join(', ') : undefined;

    const tags = Array.isArray(detail.genres)
      ? detail.genres.map((g) => String(g || '').trim()).filter(Boolean)
      : [];

    const avgScore = Number(detail.average_score);
    const malScore = Number(detail.mal_score);
    const rating =
      Number.isFinite(malScore) && malScore > 0
        ? malScore
        : Number.isFinite(avgScore) && avgScore > 0
          ? Number((avgScore / 10).toFixed(1))
          : undefined;

    const ageRating = detail.is_adult ? 18 : undefined;

    return {
      mangaInfo: {
        title,
        image,
        banner,
        author,
        desc,
        status: statusOf(detail.status),
        tags,
        rating,
        ageRating,
        webURL: `${SITE}/info/${cleanId}`,
        medium: 'anime',
      },
    };
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
    const cleanId = String(mangaId || '').trim();
    const data = await this.fetchInfoData(cleanId);
    const rawEpisodes = Array.isArray(data && data.episodes) ? data.episodes : [];

    const chapters = [];
    const seen = new Set();

    for (let i = 0; i < rawEpisodes.length; i++) {
      const ep = rawEpisodes[i];
      const numRaw = Number(ep && (ep.episode_number ?? ep.number ?? i + 1));
      if (!Number.isFinite(numRaw) || numRaw <= 0) continue;
      const id = String(numRaw);
      if (seen.has(id)) continue;
      seen.add(id);

      const rawTitle = String((ep && ep.title) || '').trim();
      const named = rawTitle && !/^episode\s+[\d.]+$/i.test(rawTitle);
      const name = named ? `Episode ${numRaw}: ${rawTitle}` : `Episode ${numRaw}`;

      let time;
      if (ep && ep.aired_on) {
        const parsed = Date.parse(`${ep.aired_on}T00:00:00Z`);
        if (Number.isFinite(parsed) && parsed > 0) time = parsed;
      }

      chapters.push({
        id,
        chapterId: id,
        name,
        number: numRaw,
        time,
      });
    }

    if (!chapters.length && data && data.detail) {
      const counts = data.detail.episode_counts || {};
      const total = Number(counts.sub ?? counts.raw ?? counts.dub ?? data.detail.episode_count ?? 0);
      for (let num = 1; num <= total; num++) {
        const id = String(num);
        chapters.push({
          id,
          chapterId: id,
          name: `Episode ${num}`,
          number: num,
        });
      }
    }

    return chapters.reverse();
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const cleanMangaId = String(mangaId || '').trim();
    const rawChapter = String(chapterId || '1').trim();
    const slashIdx = rawChapter.lastIndexOf('/');
    const epPart = slashIdx !== -1 ? rawChapter.slice(slashIdx + 1) : rawChapter;
    const epNum = parseInt(epPart, 10) || 1;

    const html = await this.text(`${SITE}/watch/${encodeURIComponent(cleanMangaId)}?ep=${encodeURIComponent(String(epNum))}`);
    const data = parseSvelteKitPage(html);
    const sourcesData = data && data.sourcesData;
    if (!sourcesData || !Array.isArray(sourcesData.tracks)) {
      throw new Error(`Miruro: no video sources found for ${cleanMangaId} episode ${epNum}`);
    }

    const config = sourcesData.config || {};
    const videos = [];
    const seenUrls = new Set();

    const trackOrder = { ssub: 0, sub: 1, dub: 2 };
    const providerOrder = { hop: 0, sun: 1, bee: 2, kiwi: 3, knob: 4, ally: 5, moo: 6 };
    const sortedTracks = sourcesData.tracks.slice().sort((a, b) => {
      const oa = trackOrder[String((a && a.track) || '')] ?? 9;
      const ob = trackOrder[String((b && b.track) || '')] ?? 9;
      return oa - ob;
    });

    for (const trackObj of sortedTracks) {
      const trackCode = String((trackObj && trackObj.track) || 'sub');
      const trackLabel = TRACK_LABELS[trackCode] || trackCode.toUpperCase();
      const providers = (Array.isArray(trackObj && trackObj.providers) ? trackObj.providers : []).slice().sort((a, b) => {
        const pa = providerOrder[String((a && a.provider) || '')] ?? 9;
        const pb = providerOrder[String((b && b.provider) || '')] ?? 9;
        return pa - pb;
      });

      for (const prov of providers) {
        const provId = String((prov && prov.provider) || '');
        const provConfig = config[provId] || {};
        if (provConfig.player === 'iframe') continue;

        const provLabel = PROVIDER_LABELS[provId] || provId;
        const useProxy = Boolean(provConfig.proxy) && provId !== 'hop';
        const rotateProxy = Boolean(provConfig.proxy && provConfig.proxy.rotate);

        const subtitles = (Array.isArray(prov && prov.subtitles) ? prov.subtitles : [])
          .filter((s) => s && s.file && (s.format === 'vtt' || s.format === 'srt' || !s.format))
          .map((s) => ({
            url: String(s.file),
            label: String(s.label || s.language || 'English').trim(),
            language: String(s.language || 'en').trim(),
            ...(s.format ? { format: String(s.format).toLowerCase() } : {}),
          }))
          .filter((s) => /^https?:\/\//i.test(s.url));

        let intro;
        let outro;
        for (const sk of (prov && prov.skipTimes) || []) {
          if (sk && sk.kind === 'intro') intro = skipRange(sk);
          if (sk && sk.kind === 'outro') outro = skipRange(sk);
        }

        const servers = (Array.isArray(prov && prov.servers) ? prov.servers : []).slice().sort((a, b) => {
          const sa = /cloudflare/i.test(String((a && a.server) || '')) ? 0 : 1;
          const sb = /cloudflare/i.test(String((b && b.server) || '')) ? 0 : 1;
          return sa - sb;
        });

        for (const srv of servers) {
          const srvName = String((srv && srv.server) || 'Server');
          const rawHeaders = (srv && srv.headers) || {};
          const headers = {};
          let referer = '';
          for (const [hk, hv] of Object.entries(rawHeaders)) {
            if (!hv) continue;
            headers[hk] = String(hv);
            if (hk.toLowerCase() === 'referer') referer = String(hv);
          }

          for (const st of (srv && srv.streams) || []) {
            const rawUrl = String((st && st.url) || '').trim();
            if (!rawUrl) continue;

            const format = String((st && st.format) || 'hls').toLowerCase();
            const isHls = format === 'hls' || rawUrl.indexOf('.m3u8') !== -1;
            if (provId === 'bee' && /hd-1/i.test(srvName)) continue;

            const streamUrl = isHls && useProxy ? buildProxiedM3u8Url(rawUrl, referer, rotateProxy) : rawUrl;
            if (seenUrls.has(streamUrl)) continue;
            seenUrls.add(streamUrl);

            let reqHeaders =
              isHls && useProxy
                ? { Referer: `${SITE}/`, Origin: SITE }
                : Object.keys(headers).length
                  ? headers
                  : { Referer: `${SITE}/` };
            if (provId === 'hop' && reqHeaders.Referer && !reqHeaders.Origin) {
              reqHeaders = Object.assign({}, reqHeaders, { Origin: String(reqHeaders.Referer).replace(/\/+$/, '') });
            }

            const resLabel = st && st.quality ? ` ${st.quality}` : '';
            videos.push({
              url: streamUrl,
              quality: `${trackLabel} · ${provLabel} (${srvName})${resLabel}`,
              server: provLabel,
              headers: reqHeaders,
              subtitles: subtitles.length ? subtitles : undefined,
              intro,
              outro,
            });
          }
        }
      }
    }

    if (!videos.length) {
      throw new Error(`Miruro: no playable streams found for ${cleanMangaId} episode ${epNum}`);
    }

    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async fetchInfoData(mangaId) {
    const key = String(mangaId);
    const cached = this.infoCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return cached.promise;
    }
    const promise = this.text(`${SITE}/info/${encodeURIComponent(key)}`)
      .then((html) => parseSvelteKitPage(html))
      .catch((err) => {
        this.infoCache.delete(key);
        throw err;
      });
    this.infoCache.set(key, { time: Date.now(), promise });
    return promise;
  }

  async text(url, extraHeaders) {
    const headers = Object.assign(
      {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `${SITE}/`,
      },
      extraHeaders || {}
    );
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers }));
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Miruro: HTTP ${response.status} for ${url}`);
    }
    return String(response.data);
  }
}

module.exports = { Source };
