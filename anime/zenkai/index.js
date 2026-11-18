const SITE = 'https://zenkai.to';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const OBF_KEY = 'otaku-embed-v1';

const FEEDS = [
  { id: 'updated', name: 'Latest Updated', path: '/recently-updated' },
  { id: 'popular', name: 'Most Popular', path: '/most-popular' },
  { id: 'added', name: 'Newly Added', path: '/recently-added' },
  { id: 'score', name: 'Top Score', path: '/filter', sort: 'score' },
  { id: 'dubbed', name: 'English Dubbed', path: '/dubbed-anime' },
  { id: 'completed', name: 'Completed', path: '/completed' },
  { id: 'movies', name: 'Movies', path: '/type/movie' },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['avant-garde', 'Avant Garde'], ['boys-love', 'Boys Love'], ['cars', 'Cars'], ['comedy', 'Comedy'], ['dementia', 'Dementia'],
  ['demons', 'Demons'], ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['girls-love', 'Girls Love'], ['gourmet', 'Gourmet'], ['game', 'Game'], ['harem', 'Harem'],
  ['historical', 'Historical'], ['horror', 'Horror'], ['Isekai', 'Isekai'], ['iyashikei', 'Iyashikei'], ['josei', 'Josei'], ['Kids', 'Kids'], ['magic', 'Magic'],
  ['mahou-shoujo', 'Mahou Shoujo'], ['martial-arts', 'Martial Arts'], ['mecha', 'Mecha'], ['military', 'Military'], ['music', 'Music'], ['mystery', 'Mystery'], ['parody', 'Parody'],
  ['police', 'Police'], ['psychological', 'Psychological'], ['reverse-harem', 'Reverse Harem'], ['romance', 'Romance'], ['samurai', 'Samurai'], ['school', 'School'], ['sci-fi', 'Sci-Fi'],
  ['seinen', 'Seinen'], ['shoujo', 'Shoujo'], ['shoujo-ai', 'Shoujo Ai'], ['shounen', 'Shounen'], ['shounen-ai', 'Shounen Ai'], ['slice-of-life', 'Slice of Life'], ['space', 'Space'],
  ['sports', 'Sports'], ['super-power', 'Super Power'], ['supernatural', 'Supernatural'], ['suspence', 'Suspence'], ['thriller', 'Thriller'], ['vampire', 'Vampire'],
];

const SUBTITLE_CODES = {
  arabic: 'ar', english: 'en', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt', russian: 'ru', spanish: 'es', japanese: 'ja', chinese: 'zh', korean: 'ko', indonesian: 'id',
  turkish: 'tr', vietnamese: 'vi', thai: 'th', polish: 'pl', dutch: 'nl', swedish: 'sv', danish: 'da', finnish: 'fi', norwegian: 'no', czech: 'cs', greek: 'el', hebrew: 'he',
  hindi: 'hi', hungarian: 'hu', romanian: 'ro', ukrainian: 'uk', filipino: 'fil', malay: 'ms', bengali: 'bn', tamil: 'ta', telugu: 'te', persian: 'fa', bulgarian: 'bg', croatian: 'hr',
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ageOf(genres, badge) {
  const names = (genres || []).map((g) => String(g).toLowerCase());
  if (names.indexOf('hentai') >= 0 || names.indexOf('erotica') >= 0) return 18;
  let age = names.indexOf('ecchi') >= 0 ? 16 : 0;
  const b = clean(badge).toLowerCase();
  if (b) {
    if (/^(18\+|rx)/.test(b)) age = 18;
    else if (/^(r\+|r$|r\s*-|r\s)/.test(b)) age = Math.max(age, 16);
    else if (!/^(g|pg|pg-13|pg 13)$/.test(b)) age = Math.max(age, 16);
  }
  return age;
}

function cardImage(src) {
  const s = clean(src);
  return s.replace('/anime/cover/large/', '/anime/cover/medium/');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Binary(text) {
  const s = String(text || '').replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    acc = (acc << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 255);
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

function utf8(binary) {
  let out = '';
  for (let i = 0; i < binary.length; ) {
    const c = binary.charCodeAt(i);
    if (c < 128) {
      out += binary.charAt(i);
      i += 1;
    } else if (c >= 192 && c < 224 && i + 1 < binary.length) {
      out += String.fromCharCode(((c & 31) << 6) | (binary.charCodeAt(i + 1) & 63));
      i += 2;
    } else if (c >= 224 && c < 240 && i + 2 < binary.length) {
      out += String.fromCharCode(((c & 15) << 12) | ((binary.charCodeAt(i + 1) & 63) << 6) | (binary.charCodeAt(i + 2) & 63));
      i += 3;
    } else if (c >= 240 && i + 3 < binary.length) {
      const cp = ((c & 7) << 18) | ((binary.charCodeAt(i + 1) & 63) << 12) | ((binary.charCodeAt(i + 2) & 63) << 6) | (binary.charCodeAt(i + 3) & 63);
      const v = cp - 65536;
      out += String.fromCharCode(55296 + (v >> 10), 56320 + (v & 1023));
      i += 4;
    } else {
      out += '?';
      i += 1;
    }
  }
  return out;
}

function decodePlayerBlob(blob) {
  const raw = base64Binary(blob);
  let x = '';
  for (let i = 0; i < raw.length; i++) x += String.fromCharCode(raw.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length));
  return JSON.parse(utf8(x));
}

function languageCode(label) {
  const first = clean(label).split(/[\s(]/)[0].toLowerCase();
  return SUBTITLE_CODES[first] || first;
}

function subtitleLabel(label) {
  const t = clean(label);
  const m = /^([^(]+?)\s*\((.*)\)\s*$/.exec(t);
  if (!m) return t;
  const lang = clean(m[1]);
  const rest = clean(m[2].split(lang).join(' ').replace(/\[Full\]/gi, ' ').replace(/[-()\[\]]/g, ' '));
  return rest ? `${lang} (${rest})` : lang;
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
    this.pages = new Map();
    this.lists = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async send(url, options) {
    const o = options || {};
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(
          App.createRequest({ url, method: o.method || 'GET', headers: Object.assign({ 'User-Agent': UA, Accept: o.accept || 'text/html,application/xhtml+xml,*/*' }, o.headers || {}) })
        );
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
        last = response;
      } catch (e) {
        if (e && (e.kind === 'blocked' || e.kind === 'challenge')) throw e;
        if (attempt === 1) throw e;
      }
      await pause(600);
    }
    return last;
  }

  async text(url, options) {
    const response = await this.send(url, options);
    if (response.status === 404) throw new Error('Zenkai: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Zenkai: HTTP ${response.status}`);
    const body = String(response.data || '');
    if (/<title>\s*Just a moment/i.test(body)) throw new Error('Zenkai answered a Cloudflare check; open the site in the web view and try again');
    return body;
  }

  async ajax(path, referer) {
    const body = await this.text(`${SITE}${path}`, { accept: 'application/json, text/javascript, */*; q=0.01', headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: referer || `${SITE}/` } });
    let json = null;
    try {
      json = JSON.parse(body);
    } catch (e) {
      throw new Error('Zenkai: an answer was not JSON (try again in a minute)');
    }
    if (!json || Number(json.status) !== 200) throw new Error(`Zenkai: ${clean(json && json.message) || 'the site refused the request'}`);
    return json.result;
  }

  async page(url) {
    const hit = this.pages.get(url);
    if (hit && Date.now() - hit.at < 60000) return hit.html;
    const html = await this.text(url);
    this.pages.set(url, { at: Date.now(), html });
    if (this.pages.size > 24) this.pages.delete(this.pages.keys().next().value);
    return html;
  }

  cards($) {
    const results = [];
    const seen = new Set();
    $('#list-items .item').each((i, el) => {
      const node = $(el);
      const link = node.find('a.name').first();
      const m = /^\/watch\/([^/?#]+)/.exec(link.attr('href') || '');
      const title = clean(link.text());
      if (!m || !title || seen.has(m[1])) return;
      seen.add(m[1]);
      const genres = node.find('.genre a').map((j, a) => clean($(a).text())).get().filter(Boolean);
      const counts = node.find('.re-badge .re-num').map((j, n) => Number(clean($(n).text())) || 0).get();
      const type = clean(node.find('.re-meta-sub .type').first().text());
      const card = { mangaId: m[1], title, image: cardImage(node.find('.poster img').first().attr('src')), medium: 'anime', ageRating: ageOf(genres) };
      if (genres.length) card.tags = genres;
      const total = counts[2] || 0;
      card.summary = [type, total ? `${total} episode${total === 1 ? '' : 's'}` : '', counts[1] > 0 ? 'Sub and Dub' : 'Sub'].filter(Boolean).join(', ');
      results.push(card);
    });
    return results;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tags = [];
    for (const t of included) {
      const id = String((t && t.id) || t || '');
      const known = GENRES.find((g) => g[0] === id || g[1].toLowerCase() === id.toLowerCase());
      if (!known) return { results: [], metadata: undefined };
      if (tags.indexOf(known[0]) < 0) tags.push(known[0]);
    }
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const parts = [];
    let path = feed.path;
    if (query || tags.length) {
      path = '/filter';
      if (query) parts.push(`keyword=${encodeURIComponent(query)}`);
      for (const t of tags) parts.push(`genre%5B%5D=${encodeURIComponent(t)}`);
    } else if (feed.sort) parts.push(`sort=${feed.sort}`);
    if (page > 1) parts.push(`page=${page}`);
    const url = `${SITE}${path}${parts.length ? `?${parts.join('&')}` : ''}`;
    let html;
    try {
      html = await this.text(url);
    } catch (e) {
      if (/HTTP 404/.test(String(e.message))) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = this.cards($);
    let more = false;
    $('.pagination a[href]').each((i, a) => {
      const m = /[?&]page=(\d+)/.exec($(a).attr('href') || '');
      if (m && Number(m[1]) > page) more = true;
    });
    return { results, metadata: results.length && more ? { page: page + 1 } : undefined };
  }

  metaRows($) {
    const rows = {};
    $('#w-info .bmeta .meta > div').each((i, d) => {
      const node = $(d);
      const label = clean(node.clone().children().remove().end().text()).replace(/:$/, '');
      if (!label) return;
      rows[label.toLowerCase()] = { text: clean(node.find('span').first().text()), links: node.find('a').map((j, a) => clean($(a).text())).get().filter(Boolean) };
    });
    return rows;
  }

  async getMangaDetails(mangaId) {
    const slug = this.slug(mangaId);
    let html;
    try {
      html = await this.page(`${SITE}/${slug}`);
    } catch (e) {
      if (/HTTP 404/.test(String(e.message))) throw new Error('Zenkai: title not found');
      throw e;
    }
    const $ = cheerio.load(html);
    const title = clean($('#w-info a.title').first().text());
    if (!title) throw new Error('Zenkai: title not found');
    const rows = this.metaRows($);
    const genres = (rows.genres && rows.genres.links) || [];
    const statusText = clean((rows.status && rows.status.text) || '').toLowerCase();
    const status = statusText === 'completed' ? 'COMPLETED' : statusText === 'releasing' ? 'ONGOING' : 'UNKNOWN';
    const alt = clean($('#w-info .names').first().text());
    const lines = [clean($('#w-info .synopsis .content').first().text())];
    if (alt && alt.toLowerCase() !== title.toLowerCase()) lines.push(`Also known as: ${alt}`);
    const facts = [];
    for (const [key, name] of [['type', 'Type'], ['premiered', 'Premiered'], ['aired', 'Aired']]) {
      if (rows[key] && rows[key].text && rows[key].text !== '?') facts.push(`${name}: ${rows[key].text}`);
    }
    if (facts.length) lines.push(facts.join(' | '));
    const info = {
      title,
      image: clean($('#w-info .binfo .poster img').first().attr('src')),
      desc: lines.filter(Boolean).join('\n\n') || undefined,
      status,
      tags: genres,
      webURL: `${SITE}/watch/${slug}`,
      medium: 'anime',
      ageRating: ageOf(genres, $('#w-info .meta.icons .rating').first().text()),
    };
    const studios = (rows.studios && rows.studios.links) || [];
    if (studios.length) info.author = studios.join(', ');
    info.completed = status === 'COMPLETED';
    return { mangaInfo: info };
  }

  slug(mangaId) {
    const s = String(mangaId || '');
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(s)) throw new Error('Zenkai: unknown title id ' + s);
    return s;
  }

  animeId($) {
    return clean($('#w-rating').attr('data-id') || $('#watch-main').attr('data-id') || $('.favourite[data-id]').attr('data-id'));
  }

  async episodes(animeId, fresh) {
    const hit = this.lists.get(animeId);
    if (!fresh && hit && Date.now() - hit.at < 300000) return hit.rows;
    const html = await this.ajax(`/ajax/episode/list/${encodeURIComponent(animeId)}`);
    const $ = cheerio.load(`<div>${html}</div>`);
    const rows = [];
    const seen = new Set();
    $('a[data-num]').each((i, a) => {
      const node = $(a);
      const slug = clean(node.attr('data-slug') || node.attr('data-num'));
      const num = parseFloat(node.attr('data-num'));
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      rows.push({
        slug,
        number: Number.isFinite(num) ? num : undefined,
        title: clean(node.find('.d-title').first().text()),
        ids: clean(node.attr('data-ids')),
        sub: node.attr('data-sub') === '1',
        dub: node.attr('data-dub') === '1',
      });
    });
    this.lists.set(animeId, { at: Date.now(), rows });
    if (this.lists.size > 24) this.lists.delete(this.lists.keys().next().value);
    return rows;
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
    const slug = this.slug(mangaId);
    const html = await this.page(`${SITE}/${slug}`);
    const id = this.animeId(cheerio.load(html));
    if (!id) throw new Error('Zenkai: could not read this title\'s id from its page');
    const rows = await this.episodes(id, true);
    if (!rows.length) throw new Error('Zenkai has no episodes for this title yet');
    const type = this.metaRows(cheerio.load(html)).type;
    const movie = rows.length === 1 && type && /^movie$/i.test(type.text);
    const out = rows.map((r) => {
      const label = movie ? 'Movie' : r.number !== undefined ? `Episode ${r.number}` : r.title || `Episode ${r.slug}`;
      const named = r.title && r.title.toLowerCase() !== label.toLowerCase() && !/^episode\s*[\d.]+$/i.test(r.title);
      const chapter = { id: `${id}/${r.slug}`, chapterId: `${id}/${r.slug}`, name: named ? `${label}: ${r.title}` : label };
      if (r.number !== undefined) chapter.number = r.number;
      return chapter;
    });
    out.sort((a, b) => (b.number || 0) - (a.number || 0));
    return out;
  }

  async playerData(linkId, referer) {
    const result = await this.ajax(`/ajax/server?get=${encodeURIComponent(linkId)}`, referer);
    const embed = clean(result && result.url);
    if (!/^https?:\/\//.test(embed)) throw new Error('Zenkai: a server gave no player address');
    let page;
    try {
      page = await this.text(embed, { headers: { Referer: `${SITE}/` } });
    } catch (e) {
      if (/HTTP 404/.test(String(e.message))) throw new Error('Zenkai: its player has no file for this episode yet');
      throw e;
    }
    const m = /window\.__P\s*=\s*"([^"]+)"/.exec(page);
    if (!m) throw new Error('Zenkai: its player page has no stream data (the player may have changed)');
    let data = null;
    try {
      data = decodePlayerBlob(m[1]);
    } catch (e) {
      throw new Error('Zenkai: could not read its player data (the player may have changed)');
    }
    if (!data || !/^https?:\/\//.test(String(data.src || ''))) throw new Error('Zenkai: its player gave no stream for this one');
    return data;
  }

  entryFor(kind, name, data, top) {
    const subs = [];
    for (const s of Array.isArray(data.subtitles) ? data.subtitles : []) {
      const url = clean(s && s.src);
      const label = clean(s && s.label);
      if (!/^https?:\/\//.test(url) || !label) continue;
      subs.push({ url, label: subtitleLabel(label), language: languageCode(label), english: /^english/i.test(label) });
    }
    subs.sort((a, b) => (b.english ? 1 : 0) - (a.english ? 1 : 0) || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    const entry = {
      url: clean(data.src),
      quality: `${top ? `Auto up to ${top}p` : 'Auto'} ${kind === 'dub' ? 'Dub' : 'Softsub'}`,
      type: 'hls',
      server: name,
    };
    if (subs.length) entry.subtitles = subs.map((s) => ({ url: s.url, label: s.label, language: s.language }));
    const skip = data.skip || data.skip_data || {};
    for (const key of ['intro', 'outro']) {
      const part = skip[key];
      const start = part && Number(part.start);
      const end = part && Number(part.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) entry[key] = { start: Math.round(start * 1000), end: Math.round(end * 1000) };
    }
    return entry;
  }

  async checkMaster(url) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.send(url, { accept: '*/*' });
        if (response.status === 404) return { ok: false, missing: true };
        if (response.status < 200 || response.status >= 300) return { ok: false, status: response.status };
        const text = String(response.data || '');
        if (text.indexOf('#EXTM3U') !== 0) return { ok: false };
        let top = 0;
        for (const h of text.match(/RESOLUTION=\d+x(\d+)/g) || []) top = Math.max(top, Number(h.split('x')[1]) || 0);
        return { ok: true, top };
      } catch (e) {
        if (e && (e.kind === 'blocked' || e.kind === 'challenge')) throw e;
      }
    }
    return { ok: false };
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const m = /^(\d+)\/([^/]+)$/.exec(String(chapterId || ''));
    if (!m) throw new Error('Zenkai: unknown episode id ' + chapterId);
    const animeId = m[1];
    const watch = `${SITE}/watch/${this.slug(mangaId)}/ep-${encodeURIComponent(m[2])}`;
    let ep = (await this.episodes(animeId)).find((r) => r.slug === m[2]);
    if (!ep) ep = (await this.episodes(animeId, true)).find((r) => r.slug === m[2]);
    if (!ep || !ep.ids) throw new Error('Zenkai no longer lists this episode');
    const html = await this.ajax(`/ajax/server/list?servers=${encodeURIComponent(ep.ids)}`, watch);
    const $ = cheerio.load(`<div>${html}</div>`);
    const found = [];
    $('.servers .type').each((i, t) => {
      const kind = clean($(t).attr('data-type')).toLowerCase() === 'dub' ? 'dub' : 'sub';
      $(t)
        .find('li[data-link-id]')
        .each((j, li) => {
          found.push({ kind, name: clean($(li).text()) || `Server ${j + 1}`, linkId: clean($(li).attr('data-link-id')) });
        });
    });
    if (!found.length) throw new Error('Zenkai lists this episode but has no server for it yet');
    const kinds = ['sub', 'dub'].filter((k) => found.some((f) => f.kind === k));
    const asked = await Promise.all(
      kinds.map(async (kind) => {
        let error = null;
        for (const f of found.filter((x) => x.kind === kind)) {
          try {
            const data = await this.playerData(f.linkId, watch);
            const master = await this.checkMaster(clean(data.src));
            if (master.ok) return { kind, f, data, master };
            error = new Error(master.missing ? 'its stream is not ready yet' : master.status ? `its stream host answered HTTP ${master.status}` : 'its stream did not answer');
          } catch (e) {
            if (e && (e.kind === 'blocked' || e.kind === 'challenge')) throw e;
            error = e;
          }
        }
        return { kind, error };
      })
    );
    const entries = [];
    for (const r of asked) {
      if (r.error) continue;
      entries.push({ kind: r.kind, entry: this.entryFor(r.kind, r.f.name, r.data, r.master.top) });
    }
    if (!entries.length) {
      const why = asked.map((r) => (r.error ? clean(r.error.message).replace(/^Zenkai:?\s*/, '') : '')).filter(Boolean)[0];
      throw new Error(`Zenkai has no working stream for this episode${why ? ` (${why})` : ''}`);
    }
    entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'sub' ? -1 : 1));
    return entries.map((e) => e.entry);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
