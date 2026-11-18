const SITE = 'https://anilight.live';
const API = 'https://api.anilight.live/api';
const MEDIA = 'https://media.satella.buzz';
const PAGE_SIZE = 24;
const SERVER = 'AniLight';
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
const STREAM_LIMIT_MS = 25000;

const FEEDS = [
  { id: 'popular', name: 'Popular', query: 'sort=POPULARITY_DESC' },
  { id: 'airing', name: 'Airing Now', query: 'sort=POPULARITY_DESC&status=RELEASING' },
  { id: 'new', name: 'Newest', query: 'sort=START_DATE_DESC' },
  { id: 'score', name: 'Top Rated', query: 'sort=SCORE_DESC' },
  { id: 'favourites', name: 'Most Favorited', query: 'sort=FAVOURITES_DESC' },
  { id: 'movies', name: 'Movies', query: 'sort=POPULARITY_DESC&format=MOVIE' },
  { id: 'az', name: 'A to Z', query: 'sort=TITLE_ROMAJI' },
];

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Kids', 'Magic', 'Mahou Shoujo', 'Martial Arts', 'Mecha', 'Military', 'Music',
  'Mystery', 'Parody', 'Psychological', 'Romance', 'School', 'Sci-Fi', 'Seinen', 'Shoujo', 'Shounen', 'Slice of Life', 'Space', 'Sports', 'Super Power', 'Supernatural', 'Thriller', 'Vampire',
];

const CAPTION_NAMES = {
  ar: 'Arabic', cs: 'Czech', de: 'German', el: 'Greek', en: 'English', es: 'Spanish', fr: 'French', he: 'Hebrew', hi: 'Hindi', id: 'Indonesian', it: 'Italian', ja: 'Japanese', ko: 'Korean',
  ms: 'Malay', nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sv: 'Swedish', th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', zh: 'Chinese',
};

function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&(quot|apos|lt|gt|nbsp|amp);/gi, (m, n) => ({ quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', amp: '&' })[n.toLowerCase()]);
}

function clean(text) {
  return decodeEntities(String(text === undefined || text === null ? '' : text)).replace(/\s+/g, ' ').trim();
}

function plain(text) {
  return decodeEntities(
    String(text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleOf(item) {
  const t = (item && item.title) || {};
  return clean(t.english) || clean(t.romaji) || clean(t.native) || clean(item && item.slug);
}

function genresOf(item) {
  return (Array.isArray(item && item.genres) ? item.genres : []).filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim());
}

function ageOf(item) {
  const genres = genresOf(item).map((g) => g.toLowerCase());
  const word = clean(item && item.ageRating).toUpperCase();
  if (item && item.isAdult === true) return 18;
  if (genres.indexOf('hentai') >= 0 || genres.indexOf('erotica') >= 0) return 18;
  if (/^RX\b/.test(word)) return 18;
  if (/^R\+/.test(word) || /^R\b/.test(word)) return 16;
  if (genres.indexOf('ecchi') >= 0) return 16;
  if (!word || word === 'N/A' || /^(G|PG|PG-13)\b/.test(word)) return 0;
  return 16;
}

function statusOf(value) {
  const s = clean(value).toUpperCase();
  if (s === 'RELEASING') return 'ONGOING';
  if (s === 'FINISHED') return 'COMPLETED';
  if (s === 'HIATUS') return 'HIATUS';
  if (s === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

function thumbOf(url) {
  let u = clean(url);
  if (!/^https?:\/\//.test(u)) return undefined;
  const proxied = /^https?:\/\/raw\.anilight\.live\/([^/]+\.[^/]+\/.*)$/.exec(u);
  if (proxied) u = `https://${proxied[1]}`;
  u = u.replace(/^(https?:\/\/image\.tmdb\.org\/t\/p\/)original\//, '$1w300/');
  return u;
}

function backdropOf(url) {
  const u = clean(url);
  if (!/^https?:\/\//.test(u)) return undefined;
  return u.replace(/^(https?:\/\/image\.tmdb\.org\/t\/p\/)original\//, '$1w780/');
}

function codeOf(track) {
  const lang = clean(track && track.lang).toLowerCase();
  const label = clean(track && track.label).toLowerCase();
  if (/^[a-z]{2}(-[a-z0-9]+)?$/.test(lang)) return lang;
  const text = `${lang} ${label}`;
  const codes = Object.keys(CAPTION_NAMES);
  for (let i = 0; i < codes.length; i++) {
    if (text.indexOf(CAPTION_NAMES[codes[i]].toLowerCase()) >= 0) return codes[i];
  }
  if (text.indexOf('saudi') >= 0) return 'ar';
  return '';
}

function captionLabel(track, code) {
  const base = code.split('-')[0];
  const lang = clean(track.lang).toLowerCase();
  const label = clean(track.label);
  const name = CAPTION_NAMES[base] || clean(label.split(' - ')[0]) || clean(track.lang) || 'Subtitles';
  if (/sdh/.test(lang) || /^sdh$/i.test(label)) return `${name} (SDH)`;
  if (/signs|forced/.test(lang) || /^forced$/i.test(label)) return `${name} (Signs)`;
  const bracket = /\(([^)]+)\)/.exec(label);
  const extra = bracket ? clean(bracket[1].replace(/_/g, ' ')) : '';
  if (extra && extra.toLowerCase() !== name.toLowerCase() && !/^(full|forced|sdh)$/i.test(extra) && extra.length <= 24) return `${name} (${extra})`;
  return name;
}

function captionsOf(tracks) {
  const rows = [];
  const urls = new Set();
  const labels = new Set();
  for (const t of Array.isArray(tracks) ? tracks : []) {
    if (!t || !t.url || (t.kind !== 'captions' && t.kind !== 'subtitles')) continue;
    const url = /^https?:\/\//.test(String(t.url)) ? String(t.url) : `${API}/proxy/captions?token=${encodeURIComponent(String(t.url))}`;
    if (urls.has(url)) continue;
    urls.add(url);
    const code = codeOf(t);
    let label = captionLabel(t, code || 'und');
    let n = 2;
    const base = label;
    while (labels.has(label.toLowerCase())) label = `${base} ${n++}`;
    labels.add(label.toLowerCase());
    const language = code ? code.split('-')[0] : clean(label.split('(')[0]).toLowerCase();
    rows.push({ url, label, language, english: language === 'en', signs: /\(signs\)/i.test(label) });
  }
  const english = rows.filter((r) => r.english && !r.signs).concat(rows.filter((r) => r.english && r.signs));
  const rest = rows.filter((r) => !r.english);
  return english.concat(rest).map((r) => ({ url: r.url, label: r.label, language: r.language }));
}

function limited(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(message));
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
    );
  });
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
    this.requests = App.createRequestManager({});
    this.limited = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
    this.flags = new Map();
    this.ids = new Map();
    this.ages = new Map();
    this.token = '';
    this.tokenUntil = 0;
    this.tokenPending = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  card(item) {
    const slug = clean(item && item.slug);
    if (!slug || !titleOf(item)) return null;
    if (item.id) this.ids.set(slug, Number(item.id));
    const age = ageOf(item);
    this.ages.set(slug, age);
    const sub = Number(item.subEpisodes) || 0;
    const dub = Number(item.dubEpisodes) || 0;
    const cover = item.coverImage || {};
    const parts = [];
    if (item.format) parts.push(clean(item.format).replace(/_/g, ' '));
    if (item.seasonYear) parts.push(String(item.seasonYear));
    if (sub || dub) parts.push(`${Math.max(sub, dub)} ${Math.max(sub, dub) === 1 ? 'episode' : 'episodes'}`);
    const out = {
      mangaId: slug,
      title: titleOf(item),
      image: clean(cover.large || cover.extraLarge),
      medium: 'anime',
      ageRating: age,
      tags: genresOf(item),
      webURL: `${SITE}/anime/${slug}`,
    };
    if (parts.length) out.summary = parts.join(' · ');
    return { card: out, playable: sub > 0 || dub > 0 };
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const tags = (Array.isArray(request && request.includedTags) ? request.includedTags : []).map((t) => clean(t && (t.id || t.label))).filter(Boolean);
    const feed = FEEDS.filter((f) => f.id === (request && request.feed))[0] || FEEDS[0];
    let page = (metadata && Number(metadata.page)) || 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      let url = `${API}/filter?page=${page}&perPage=${PAGE_SIZE}&hideAdult=false`;
      url += query ? '&sort=POPULARITY_DESC' : `&${feed.query}`;
      if (query) url += `&search=${encodeURIComponent(query)}`;
      if (tags.length) url += `&genres=${encodeURIComponent(tags.join(','))}`;
      const data = await this.json(url);
      const results = [];
      const seen = new Set();
      for (const item of Array.isArray(data && data.media) ? data.media : []) {
        const made = this.card(item);
        if (!made || seen.has(made.card.mangaId)) continue;
        if (!query && !made.playable) continue;
        seen.add(made.card.mangaId);
        results.push(made.card);
      }
      const more = !!(data && data.pageInfo && data.pageInfo.hasNextPage);
      if (results.length || !more) return { results, metadata: more && results.length ? { page: page + 1 } : undefined };
      page += 1;
    }
    return { results: [], metadata: undefined };
  }

  async detailsOf(slug) {
    const data = await this.json(`${API}/anime/${encodeURIComponent(slug)}`);
    if (!data || !data.id) throw new Error('AniLight: title not found');
    this.ids.set(slug, Number(data.id));
    return data;
  }

  async getMangaDetails(mangaId) {
    const a = await this.detailsOf(mangaId);
    const genres = genresOf(a);
    const studios = (a.studios && Array.isArray(a.studios.nodes) ? a.studios.nodes : []).map((s) => clean(s && s.name)).filter((n, i, all) => n && all.indexOf(n) === i);
    const cover = a.coverImage || {};
    const tmdb = a.tmdb || {};
    const age = ageOf(a);
    this.ages.set(mangaId, age);
    const names = a.title || {};
    const info = {
      title: titleOf(a),
      image: clean(cover.extraLarge || cover.large),
      banner: backdropOf(a.bannerImage) || backdropOf(tmdb.backdrop),
      desc: plain(a.description) || undefined,
      author: studios.join(', ') || undefined,
      status: statusOf(a.status),
      tags: genres,
      webURL: `${SITE}/anime/${mangaId}`,
      medium: 'anime',
      ageRating: age,
    };
    const alt = [names.romaji, names.native].map(clean).filter((n) => n && n !== info.title);
    if (alt.length) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Also known as: ${alt.join(' | ')}`;
    const when = [clean(a.season).toLowerCase(), a.seasonYear].filter(Boolean).join(' ');
    if (when) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Season: ${when}`;
    return { mangaInfo: info };
  }

  async titleId(mangaId) {
    if (this.ids.has(mangaId)) return this.ids.get(mangaId);
    const data = await this.detailsOf(mangaId);
    return Number(data.id);
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
    const data = await this.json(`${API}/watch/${encodeURIComponent(mangaId)}`);
    if (data && data.id) this.ids.set(mangaId, Number(data.id));
    const rows = [];
    const seen = new Set();
    for (const e of Array.isArray(data && data.episodes) ? data.episodes : []) {
      const number = Number(e && e.number);
      if (!e || !Number.isFinite(number) || number <= 0 || !(e.sub || e.dub)) continue;
      const id = String(number);
      if (seen.has(id)) continue;
      seen.add(id);
      this.flags.set(`${mangaId}#${id}`, { sub: !!e.sub, dub: !!e.dub });
      const title = clean(e.title);
      const row = { id, chapterId: id, name: title ? `Episode ${number}: ${title}` : `Episode ${number}`, number };
      if (title) row.title = title;
      const at = Date.parse(clean(e.airedAt || e.subAiredAt || e.dubAiredAt));
      if (Number.isFinite(at)) row.time = at;
      const thumb = thumbOf(e.img);
      if (thumb) row.thumbnail = thumb;
      const summary = plain(e.description);
      if (summary) row.summary = summary;
      rows.push(row);
    }
    if (!rows.length) throw new Error('AniLight has no episodes for this title yet');
    rows.sort((x, y) => y.number - x.number);
    return rows;
  }

  async sessionToken(force) {
    if (!force && this.token && this.tokenUntil > Date.now() + TOKEN_MARGIN_MS) return this.token;
    if (!this.tokenPending) {
      this.tokenPending = (async () => {
        const response = await this.limited.schedule(
          App.createRequest({ url: `${API}/sources/session`, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' }),
        );
        if (response.status < 200 || response.status >= 300) throw new Error(`AniLight: the stream session was refused (HTTP ${response.status})`);
        let data;
        try {
          data = JSON.parse(response.data);
        } catch (e) {
          throw new Error('AniLight: the stream session answer is not data');
        }
        if (!data || !data.sessionToken) throw new Error('AniLight: the stream session answer has no token');
        this.token = String(data.sessionToken);
        const until = Number(data.expiresAt);
        this.tokenUntil = Number.isFinite(until) && until > Date.now() ? until : Date.now() + 60 * 60 * 1000;
        return this.token;
      })();
      const clear = () => {
        this.tokenPending = null;
      };
      this.tokenPending.then(clear, clear);
    }
    return this.tokenPending;
  }

  async stream(titleId, episode, language) {
    let tries = 0;
    let renewed = false;
    for (;;) {
      tries += 1;
      const token = await this.sessionToken(false);
      const url = `${API}/sources?id=${titleId}&episode=${episode}&language=${language}${tries > 1 ? `&r=${tries}` : ''}`;
      const response = await this.limited.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json', 'x-source-session': token } }));
      if (response.status === 403 && !renewed) {
        renewed = true;
        await this.sessionToken(true);
        continue;
      }
      if (response.status === 404) return { missing: true };
      if (response.status >= 500 && tries < 3) continue;
      if (response.status === 429) return { error: 'HTTP 429, the site asks for a pause of about 10 seconds' };
      if (response.status < 200 || response.status >= 300) return { error: `HTTP ${response.status}` };
      let data;
      try {
        data = JSON.parse(response.data);
      } catch (e) {
        return { error: 'the answer is not data' };
      }
      const first = data && Array.isArray(data.sources) ? data.sources[0] : null;
      const raw = first ? (Array.isArray(first.url) ? first.url[0] : first.url) : '';
      if (!raw) return { missing: true };
      const type = clean(first.type).toLowerCase() === 'hls' ? 'hls' : 'mp4';
      const url2 = /^https?:\/\//.test(String(raw)) ? String(raw) : `${MEDIA}/e/${raw}`;
      const quality = clean(first.quality);
      const subtitles = captionsOf(data.tracks);
      const word = language === 'dub' ? 'Dub' : subtitles.some((s) => s.language === 'en') ? 'Softsub' : subtitles.length ? 'Sub' : 'Sub, no captions';
      const entry = {
        url: url2,
        quality: `${quality && quality.toLowerCase() !== 'auto' ? quality : 'Auto'} ${word}`,
        type,
        server: SERVER,
        headers: { Referer: `${SITE}/` },
      };
      if (subtitles.length) entry.subtitles = subtitles;
      return { entry };
    }
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const titleId = await this.titleId(mangaId);
    const episode = Number(chapterId);
    if (!Number.isFinite(episode) || episode <= 0) throw new Error('AniLight: unknown episode');
    const ask = (language) => limited(this.stream(titleId, episode, language), STREAM_LIMIT_MS, 'AniLight did not answer in time').catch((e) => ({ error: clean(e && e.message) || 'failed' }));
    const known = this.flags.get(`${mangaId}#${episode}`);
    const none = { missing: true };
    const [sub, dub] = await Promise.all([known && !known.sub ? none : ask('sub'), known && !known.dub ? none : ask('dub')]);
    const videos = [];
    if (sub.entry) videos.push(sub.entry);
    if (dub.entry) videos.push(dub.entry);
    if (videos.length) return videos;
    if (sub.missing && dub.missing) throw new Error(`AniLight has no stream for episode ${episode} yet (the site lists it, but neither the sub nor the dub is there)`);
    throw new Error(`AniLight could not give a stream for episode ${episode} (sub: ${sub.error || 'not there'}, dub: ${dub.error || 'not there'})`);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
    if (response.status === 404) throw new Error('AniLight: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AniLight: HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('AniLight returned a page that is not data');
    }
  }
}

module.exports = { Source };
