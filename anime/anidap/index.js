const SITE = 'https://anidap.lol';
const GRAPHQL = 'https://graphql.anidap.lol/graphql';
const RECENT = 'https://graphql.anidap.lol/api/recent';
const CHAD = 'https://chad.anidap.lol/rest/api';
const GRAPHQL_HOSTS = ['https://graphql.anidap.lol', 'https://graphql.animex.one'];
const CHAD_HOSTS = ['https://chad.anidap.lol', 'https://api.anistream.one'];
const liveHost = { graphql: 0, chad: 0 };
const PAGE_SIZE = 30;
const CACHE_MS = 5 * 60 * 1000;
const EPISODE_CACHE_MS = 10 * 60 * 1000;
const CHECK_BUDGET_MS = 3000;
const MAX_WINDOW_WAIT_MS = 45000;
const SERVER_TIMEOUT_MS = 30000;
const TRACK_HOSTS = { yuki: 'mysubsplay.com', zuna: 'dramahot.top', sora: 'krussdomi.com' };
const KRUSS_HEADERS = { Referer: 'https://krussdomi.com/', Origin: 'https://krussdomi.com' };

const FEEDS = [
  { id: 'trending', name: 'Trending', sort: 'TRENDING' },
  { id: 'popular', name: 'Popular', sort: 'POPULARITY' },
  { id: 'latest', name: 'Latest Episodes' },
  { id: 'updated', name: 'Recently Updated', sort: 'UPDATED_AT' },
  { id: 'top', name: 'Top Rated', sort: 'AVERAGE_SCORE' },
  { id: 'movies', name: 'Movies', sort: 'POPULARITY', formats: ['MOVIE'] },
  { id: 'az', name: 'A to Z', sort: 'TITLE_ENGLISH', dir: 'ASC' },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

const SEXUAL_TAGS = new Set([
  'Rape', 'Ahegao', 'Anal Sex', 'Boobjob', 'Cunnilingus', 'Defloration', 'Facial', 'Fellatio', 'Group Sex', 'Handjob', 'Masturbation', 'Nakadashi', 'Threesome',
  'Public Sex', 'Netorare', 'Sex Toys', 'Exhibitionism', 'Futanari', 'Tentacles', 'Voyeur', 'Hypersexuality', 'Lactation', 'Femdom', 'Bondage',
]);

const LANGUAGE_CODES = {
  english: 'en', spanish: 'es', portuguese: 'pt', french: 'fr', german: 'de', italian: 'it', arabic: 'ar', indonesian: 'id', thai: 'th', russian: 'ru', turkish: 'tr',
  vietnamese: 'vi', chinese: 'zh', japanese: 'ja', korean: 'ko', hindi: 'hi', polish: 'pl', dutch: 'nl', malay: 'ms', greek: 'el', hebrew: 'he',
};

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function enc(value) {
  return encodeURIComponent(String(value));
}

function headerOf(response, name) {
  const headers = (response && response.headers) || {};
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return Array.isArray(headers[key]) ? headers[key][0] : headers[key];
  }
  return undefined;
}

function ageOf(item) {
  if (!item) return undefined;
  if (item.isAdult === true) return 18;
  const genres = Array.isArray(item.genres) ? item.genres : [];
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (genres.some((g) => /^hentai$/i.test(String(g)))) return 18;
  if (genres.some((g) => /^ecchi$/i.test(String(g))) || tags.some((t) => SEXUAL_TAGS.has(t))) return 16;
  return 0;
}

function titleOf(item) {
  const names = (item && item.titles) || {};
  return clean(item && item.titleEnglish) || clean(item && item.titleRomaji) || clean(names.en) || clean(names['x-jat']) || clean(names.ja);
}

function coverOf(cover, size) {
  const c = cover && typeof cover === 'object' ? cover : {};
  const pick = size === 'big' ? [c.extraLarge, c.large, c.medium] : [c.large, c.medium, c.extraLarge];
  for (const url of pick) if (/^https?:\/\//.test(String(url || ''))) return String(url);
  return '';
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(`${label} took too long`));
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

function streamHeaders(url, given) {
  const m = /^https?:\/\/([^\/:?#]+)/i.exec(String(url));
  const host = m ? m[1].toLowerCase() : '';
  if (host === 'krussdomi.com' || host.endsWith('.krussdomi.com')) return Object.assign({}, KRUSS_HEADERS);
  const out = {};
  for (const key of Object.keys(given || {})) {
    if (/^(user-agent|cookie)$/i.test(key)) continue;
    if (typeof given[key] === 'string' && given[key]) out[key] = given[key];
  }
  return out;
}

function languageCode(label, code) {
  const known = LANGUAGE_CODES[clean(label).toLowerCase().split(/[ (]/)[0]];
  if (known) return known;
  const c = clean(code).toLowerCase();
  return c || clean(label).toLowerCase();
}

function subtitleTracks(tracks) {
  const out = [];
  const seen = new Set();
  for (const t of Array.isArray(tracks) ? tracks : []) {
    if (!t || !/^https?:\/\//.test(String(t.url || ''))) continue;
    const kind = clean(t.kind).toLowerCase();
    const label = clean(t.label) || clean(t.lang);
    if (kind === 'thumbnails' || /^thumbnails?$/i.test(label)) continue;
    const url = String(t.url);
    const m = /\.(vtt|srt|ass|ssa)(?:[?#]|$)/i.exec(url);
    if (!m || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, label: label || 'Subtitles', language: languageCode(label, t.lang), format: m[1].toLowerCase() });
  }
  const english = out.filter((s) => s.language === 'en');
  return english.concat(out.filter((s) => s.language !== 'en'));
}

function ownTrack(provider, track) {
  const family = TRACK_HOSTS[clean(provider).toLowerCase()];
  if (!family) return false;
  const m = /^https?:\/\/([^\/:?#]+)/i.exec(track.url);
  const host = m ? m[1].toLowerCase() : '';
  return host === family || host.endsWith(`.${family}`);
}

function subtitleSummary(tracks) {
  const names = tracks.map((s) => s.label);
  if (!names.length) return '';
  return names.length <= 3 ? names.join(', ') : `${names[0]} and ${names.length - 1} more`;
}

function seconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : undefined;
}

function skipSpans(chapters) {
  const out = {};
  for (const c of Array.isArray(chapters) ? chapters : []) {
    const title = clean(c && c.title);
    const start = seconds(c && c.start);
    const end = seconds(c && c.end);
    if (start === undefined || end === undefined || end <= start) continue;
    if (/intro|opening|^op\b/i.test(title) && !out.intro) out.intro = { start, end };
    else if (/outro|ending|credits|^ed\b/i.test(title) && !out.outro) out.outro = { start, end };
  }
  return out;
}

function serverName(id) {
  const text = clean(id);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Server';
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

const CARD_FIELDS = 'id titleEnglish titleRomaji coverImage genres tags isAdult format status subCount episodeCount';
const LIST_QUERY = `query($f:AnimeCatalogFilterInput,$s:[AnimeSortInput!],$l:Int,$o:Int){catalogAnime(filter:$f,sort:$s,limit:$l,offset:$o){hasNextPage totalCount items{${CARD_FIELDS}}}}`;
const DETAIL_QUERY =
  'query($id:String){anime(id:$id){id titleRomaji titleEnglish titles synonyms coverImage bannerImage description episodeCount status isAdult duration genres tags format season seasonYear studios subCount dubCount}}';

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.cache = new Map();
    this.pending = new Map();
    this.holdUntil = 0;
    this.ages = new Map();
    this.episodeCache = new Map();
    this.episodePending = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async limited(url, method, body) {
    const key = `${method} ${url} ${body || ''}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const run = this.limitedSend(url, method, body).then(
      (value) => {
        this.pending.delete(key);
        this.cache.set(key, { at: Date.now(), value });
        if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
        return value;
      },
      (error) => {
        this.pending.delete(key);
        throw error;
      }
    );
    this.pending.set(key, run);
    return run;
  }

  async limitedSend(url, method, body) {
    const wait = this.holdUntil - Date.now();
    if (wait > 0) {
      if (wait > MAX_WINDOW_WAIT_MS || typeof setTimeout !== 'function') {
        throw new Error(`Anidap lets a reader make 30 catalog requests a minute and this minute is used up, try again in ${Math.ceil(wait / 1000)} seconds`);
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    const headers = { Accept: 'application/json' };
    const options = { url, method, headers };
    if (body) {
      headers['Content-Type'] = 'application/json';
      options.body = body;
    }
    const response = await this.mirrored('graphql', GRAPHQL_HOSTS, options);
    const left = Number(headerOf(response, 'x-ratelimit-remaining'));
    const reset = Number(headerOf(response, 'x-ratelimit-reset'));
    if (Number.isFinite(left) && Number.isFinite(reset) && left <= 1) this.holdUntil = Date.now() + (reset + 1) * 1000;
    if (response.status === 429) {
      let retry = Number(headerOf(response, 'retry-after'));
      if (!Number.isFinite(retry)) {
        try {
          retry = Number(JSON.parse(response.data).retry_after);
        } catch (e) {
          retry = NaN;
        }
      }
      if (!Number.isFinite(retry) || retry <= 0) retry = 60;
      this.holdUntil = Date.now() + retry * 1000;
      throw new Error(`Anidap's catalog is rate limited (30 requests a minute), it asked to wait ${retry} seconds`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Anidap: HTTP ${response.status}`);
    let data;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      throw new Error('Anidap returned a page that is not data');
    }
    return data;
  }

  async gql(query, variables) {
    const data = await this.limited(GRAPHQL, 'POST', JSON.stringify({ query, variables }));
    if (data && Array.isArray(data.errors) && data.errors.length) throw new Error(`Anidap: ${clean(data.errors[0] && data.errors[0].message) || 'query failed'}`);
    return (data && data.data) || {};
  }

  async mirrored(kind, hosts, options) {
    let first = null;
    let challenge = null;
    let notJson = null;
    for (let i = 0; i < hosts.length; i++) {
      const index = (liveHost[kind] + i) % hosts.length;
      let response;
      try {
        response = await this.requests.schedule(App.createRequest(Object.assign({}, options, { url: hosts[index] + String(options.url).slice(hosts[0].length) })));
      } catch (e) {
        if (e && (e.kind === 'blocked' || /allowed hosts/i.test(String(e.message)))) throw e;
        if (e && e.kind === 'challenge') challenge = challenge || e;
        else first = first || e;
        continue;
      }
      let json = true;
      try {
        JSON.parse(response.data);
      } catch (e) {
        json = false;
      }
      if (!json) {
        notJson = notJson || response;
        continue;
      }
      liveHost[kind] = index;
      return response;
    }
    if (notJson) return notJson;
    throw challenge || first;
  }

  async chad(path) {
    let failure;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.mirrored('chad', CHAD_HOSTS, { url: `${CHAD}/${path}${attempt ? '&r=1' : ''}`, method: 'GET', headers: { Accept: 'application/json' } });
        let data = null;
        try {
          data = JSON.parse(response.data);
        } catch (e) {
          data = null;
        }
        return { status: response.status, data };
      } catch (error) {
        if (error && (error.kind === 'challenge' || error.kind === 'blocked')) throw error;
        failure = error;
      }
    }
    throw failure;
  }

  async episodesFor(id) {
    const hit = this.episodeCache.get(id);
    if (hit && Date.now() - hit.at < (hit.answer.data.length ? EPISODE_CACHE_MS : 3 * 60 * 1000)) return hit.answer;
    if (this.episodePending.has(id)) return this.episodePending.get(id);
    const run = this.chad(`episodes?id=${enc(id)}`).then(
      (answer) => {
        this.episodePending.delete(id);
        if (answer.status === 200 && Array.isArray(answer.data)) {
          this.episodeCache.set(id, { at: Date.now(), answer });
          if (this.episodeCache.size > 400) this.episodeCache.delete(this.episodeCache.keys().next().value);
        }
        return answer;
      },
      (error) => {
        this.episodePending.delete(id);
        throw error;
      }
    );
    this.episodePending.set(id, run);
    return run;
  }

  async checkEpisodes(ids) {
    const found = new Map();
    const jobs = ids.map(async (id) => {
      try {
        const answer = await this.episodesFor(id);
        if (answer.status === 200 && Array.isArray(answer.data)) found.set(id, answer.data.length > 0);
        else if (answer.status === 404) found.set(id, false);
      } catch (e) {
      }
    });
    const all = Promise.all(jobs);
    if (typeof setTimeout === 'function') await Promise.race([all, new Promise((resolve) => setTimeout(resolve, CHECK_BUDGET_MS))]);
    else await all;
    return found;
  }

  card(item) {
    const id = clean(item && item.id);
    const title = titleOf(item);
    if (!id || !title) return null;
    const age = ageOf(item);
    if (age !== undefined) this.ages.set(id, age);
    const out = { mangaId: id, title, image: coverOf(item.coverImage, 'card'), medium: 'anime', ageRating: age === undefined ? 0 : age };
    const count = Number(item.subCount) || Number(item.episodeCount);
    if (String(item.format) === 'MOVIE') out.summary = 'Movie';
    else if (Number.isFinite(count) && count > 0) out.summary = `${count} ${count === 1 ? 'episode' : 'episodes'}`;
    return out;
  }

  async latestPage(page) {
    const recent = await this.limited(`${RECENT}?page=${page}`, 'GET', '');
    const rows = (Array.isArray(recent && recent.results) ? recent.results : []).filter((r) => r && r.id && r.isAdult !== true);
    const results = [];
    if (rows.length) {
      let full = new Map();
      try {
        const data = await this.gql(LIST_QUERY, { f: { ids: rows.map((r) => String(r.id)) }, l: PAGE_SIZE, o: 0 });
        for (const item of (data.catalogAnime && data.catalogAnime.items) || []) full.set(String(item.id), item);
      } catch (e) {
        full = new Map();
      }
      const seen = new Set();
      for (const row of rows) {
        const id = String(row.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const card = this.card(full.get(id) || { id, titleEnglish: row.titleEnglish, titleRomaji: row.titleRomaji, coverImage: row.coverImage, genres: row.genres, isAdult: row.isAdult });
        if (!card) continue;
        if (row.episode) card.summary = `Episode ${clean(row.episode)}`;
        results.push(card);
      }
    }
    return { results, metadata: recent && recent.hasNextPage ? { page: page + 1 } : undefined };
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const genres = included.map((t) => clean(t && (t.id || t.label))).filter((g) => GENRES.indexOf(g) >= 0);
    const feed = (request && request.feed) || FEEDS[0].id;
    const page = Math.max(1, Number(metadata && metadata.page) || 1);
    if (!query && !genres.length && feed === 'latest') return this.latestPage(page);
    const def = FEEDS.filter((f) => f.id === feed && f.sort)[0] || FEEDS[0];
    const filter = { subDubFilter: 'SUB', isAdult: false };
    if (query) filter.query = query;
    if (genres.length) filter.genres = genres;
    if (!query && def.formats) filter.formatIn = def.formats;
    const results = [];
    const seen = new Set();
    let current = page;
    let more = true;
    for (let round = 0; round < 3 && more; round++) {
      const offset = (current - 1) * PAGE_SIZE;
      if (offset > 25000) {
        more = false;
        break;
      }
      const variables = { f: filter, l: PAGE_SIZE, o: offset };
      if (!query) variables.s = [{ field: def.sort, direction: def.dir || 'DESC' }];
      const data = await this.gql(LIST_QUERY, variables);
      const list = data.catalogAnime || {};
      const cards = [];
      for (const item of Array.isArray(list.items) ? list.items : []) {
        const card = this.card(item);
        if (!card || seen.has(card.mangaId)) continue;
        seen.add(card.mangaId);
        cards.push(card);
      }
      more = Boolean(list.hasNextPage) && cards.length > 0;
      current += 1;
      const checked = await this.checkEpisodes(cards.map((c) => c.mangaId));
      for (const card of cards) {
        if (checked.get(card.mangaId) === false) {
          if (!query) continue;
          card.summary = 'No episodes yet';
        }
        results.push(card);
      }
      if (query || results.length >= 8) break;
    }
    return { results, metadata: more ? { page: current } : undefined };
  }

  async getMangaDetails(mangaId) {
    const data = await this.gql(DETAIL_QUERY, { id: String(mangaId) });
    const a = data.anime;
    if (!a || !a.id) throw new Error('Anidap does not know this title');
    const title = titleOf(a);
    const genres = (Array.isArray(a.genres) ? a.genres : []).filter((g) => typeof g === 'string' && g.trim());
    const studios = (Array.isArray(a.studios) ? a.studios : []).map(clean).filter(Boolean);
    const season = a.seasonYear ? `${clean(a.season).charAt(0)}${clean(a.season).slice(1).toLowerCase()} ${a.seasonYear}`.trim() : '';
    const status = clean(a.status).toUpperCase();
    const names = a.titles && typeof a.titles === 'object' ? a.titles : {};
    const alt = [a.titleRomaji, names.ja]
      .concat(Array.isArray(a.synonyms) ? a.synonyms.slice(0, 2) : [])
      .map(clean)
      .filter((n, i, all) => n && n !== title && all.indexOf(n) === i);
    const text = clean(String(a.description || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
    const info = {
      title,
      image: coverOf(a.coverImage, 'big'),
      desc: `${text}${alt.length ? `${text ? '\n\n' : ''}Also known as: ${alt.join(' | ')}` : ''}` || undefined,
      author: studios.length ? studios.slice(0, 3).join(', ') : season || undefined,
      status: status === 'FINISHED' ? 'COMPLETED' : status === 'RELEASING' ? 'ONGOING' : status === 'CANCELLED' ? 'CANCELLED' : status === 'HIATUS' ? 'HIATUS' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/watch?id=${enc(a.id)}`,
      medium: 'anime',
      ageRating: ageOf(a),
    };
    if (/^https?:\/\//.test(String(a.bannerImage || ''))) info.banner = String(a.bannerImage);
    this.ages.set(String(a.id), info.ageRating);
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
    const answer = await this.episodesFor(mangaId);
    if (answer.status === 404) throw new Error('Anidap does not know this title');
    this.tooMany(answer);
    if (answer.status !== 200 || !Array.isArray(answer.data)) throw new Error(`Anidap: HTTP ${answer.status} for the episode list`);
    const rows = [];
    const seen = new Set();
    for (const e of answer.data) {
      const number = Number(e && e.number);
      if (!Number.isFinite(number) || seen.has(number)) continue;
      seen.add(number);
      const names = (e.titles && typeof e.titles === 'object' ? e.titles : {}) || {};
      let title = clean(names.en) || clean(names['x-jat']) || clean(names.ja);
      if (/^(episode|ep\.?)\s*\d+$/i.test(title)) title = '';
      const row = { id: String(number), chapterId: String(number), name: title ? `Episode ${number}: ${title}` : `Episode ${number}`, number };
      if (title) row.title = title;
      const aired = Date.parse(String(e.airDateUtc || ''));
      if (Number.isFinite(aired) && aired > 1e11) row.time = aired;
      if (/^https?:\/\//.test(String(e.img || ''))) row.thumbnail = String(e.img);
      const length = Number(e.length);
      if (Number.isFinite(length) && length > 0) row.duration = Math.round(length * 60);
      const summary = clean(e.description);
      if (summary) row.summary = summary;
      rows.push(row);
    }
    if (!rows.length) throw new Error('Anidap has no episodes for this title yet');
    rows.sort((a, b) => b.number - a.number);
    return rows;
  }

  tooMany(answer) {
    if (answer.status !== 429) return;
    const retry = Number(answer.data && answer.data.retry_after);
    throw new Error(`Anidap is busy (too many requests), try again in ${Number.isFinite(retry) && retry > 0 ? retry : 30} seconds`);
  }

  async sourcesOf(mangaId, number, type, provider) {
    const answer = await this.chad(`sources?id=${enc(mangaId)}&epNum=${enc(number)}&type=${type}&providerId=${enc(provider.id)}`);
    const payload = answer.data && typeof answer.data === 'object' ? (answer.data.data && !Array.isArray(answer.data.data) ? answer.data.data : answer.data) : null;
    if (answer.status === 429) {
      const wait = payload && payload.retry_after ? ` (try again in ${payload.retry_after} seconds)` : '';
      throw new Error(`${serverName(provider.id)} is rate limited${wait}`);
    }
    if (answer.status !== 200 || !payload || !Array.isArray(payload.sources) || !payload.sources.length) {
      const reason = clean(payload && payload.error);
      throw new Error(`${serverName(provider.id)} gave no stream (HTTP ${answer.status}${reason ? `, ${reason.slice(0, 80)}` : ''})`);
    }
    const name = serverName(provider.id);
    const tracks = subtitleTracks(payload.tracks).filter((t) => ownTrack(provider.id, t));
    const skips = skipSpans(payload.chapters);
    const kind = type === 'dub' ? 'Dub' : tracks.length ? `Softsub: ${subtitleSummary(tracks)}` : 'Hardsub';
    const out = [];
    for (const source of payload.sources) {
      const url = clean(source && source.url);
      if (!/^https?:\/\//.test(url)) continue;
      const entry = { url, type: /\.mp4(?:[?#]|$)/i.test(url) ? 'mp4' : 'hls', quality: `${name} ${kind}`, server: name, headers: streamHeaders(url, payload.headers) };
      if (tracks.length) entry.subtitles = tracks;
      if (skips.intro) entry.intro = skips.intro;
      if (skips.outro) entry.outro = skips.outro;
      out.push(entry);
      break;
    }
    return out;
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const number = clean(chapterId);
    const servers = await this.chad(`servers?id=${enc(mangaId)}&epNum=${enc(number)}`);
    if (servers.status === 404) throw new Error('Anidap has no such episode for this title yet');
    this.tooMany(servers);
    const lists = servers.data && typeof servers.data === 'object' ? servers.data : null;
    if (servers.status !== 200 || !lists) throw new Error(`Anidap: HTTP ${servers.status} for the server list`);
    const jobs = [];
    for (const p of Array.isArray(lists.subProviders) ? lists.subProviders : []) if (p && p.id) jobs.push({ type: 'sub', provider: p });
    for (const p of Array.isArray(lists.dubProviders) ? lists.dubProviders : []) if (p && p.id) jobs.push({ type: 'dub', provider: p });
    if (!jobs.length) throw new Error('Anidap lists no server for this episode yet, so the site has no stream for it');
    let challenge = null;
    const failures = [];
    const answers = await Promise.all(
      jobs.map(async (job) => {
        try {
          return await withTimeout(this.sourcesOf(mangaId, number, job.type, job.provider), SERVER_TIMEOUT_MS, serverName(job.provider.id));
        } catch (error) {
          if (error && error.kind === 'challenge') challenge = error;
          failures.push(clean(error && error.message));
          return [];
        }
      })
    );
    const videos = [];
    const seen = new Set();
    for (const list of answers) {
      for (const video of list) {
        if (seen.has(video.url)) continue;
        seen.add(video.url);
        videos.push(video);
      }
    }
    if (!videos.length) {
      if (challenge) throw challenge;
      throw new Error(`Anidap has no working stream for this episode: ${failures.slice(0, 3).join('; ') || 'no server answered'}`);
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
