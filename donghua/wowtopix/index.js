const SITE = 'https://wowtopix.com';
const API = SITE + '/wp-json/wp/v2/anime';
const PAGE_SIZE = 20;
const LIST_FIELDS = 'id,slug,title,class_list,date,modified,featured_media,_links,_embedded';

const FEEDS = [
  { id: 'update', name: 'Latest Updates', orderby: 'modified', order: 'desc' },
  { id: 'new', name: 'Newly Added', orderby: 'date', order: 'desc' },
  { id: 'az', name: 'A-Z', orderby: 'title', order: 'asc' },
];

const GENRES = [
  ['action', 'Action'], ['fantasy', 'Fantasy'], ['adventure', 'Adventure'], ['martial-arts', 'Martial Arts'], ['historical', 'Historical'], ['romance', 'Romance'],
  ['sci-fi', 'Sci-Fi'], ['comedy', 'Comedy'], ['mythology', 'Mythology'], ['drama', 'Drama'], ['reincarnation', 'Reincarnation'], ['supernatural', 'Supernatural'],
  ['isekai', 'Isekai'], ['mystery', 'Mystery'], ['suspense', 'Suspense'], ['psychological', 'Psychological'], ['school', 'School'], ['cultivation', 'Cultivation'],
  ['full-cgi', 'Full CGI'], ['military', 'Military'], ['video-game', 'Video Game'], ['horror', 'Horror'], ['revenge', 'Revenge'],
];

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function plainText(html) {
  return clean(cheerio.load('<p>' + String(html || '') + '</p>')('p').text());
}

function absolute(url) {
  const u = clean(url);
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return u.charAt(0) === '/' ? SITE + u : SITE + '/' + u;
}

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
  }
  return encodeURIComponent(text);
}

function coverOf(url, width) {
  const u = absolute(url);
  const m = /^https:\/\/wowtopix\.com(\/wp-content\/uploads\/[^?#]+\.png)$/i.exec(u);
  return m ? 'https://i0.wp.com/wowtopix.com' + m[1] + '?w=' + width + '&quality=70&format=jpeg' : u;
}

function slugOfHref(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return '';
  try {
    return decodeURIComponent(parts[parts.length - 1]);
  } catch (e) {
    return parts[parts.length - 1];
  }
}

function labelOfGenre(slug) {
  const hit = GENRES.find((g) => g[0] === slug);
  if (hit) return hit[1];
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function genreSlugs(classList) {
  const out = [];
  (classList || []).forEach((c) => {
    if (String(c).indexOf('genres-') !== 0) return;
    let slug = String(c).slice(7);
    const half = slug.length / 2;
    if (slug.length % 2 === 0 && slug.slice(0, half) === slug.slice(half)) slug = slug.slice(0, half);
    if (slug && out.indexOf(slug) < 0) out.push(slug);
  });
  return out;
}

function ratingOf(labels) {
  let age = 0;
  (labels || []).forEach((l) => {
    const t = clean(l).toLowerCase();
    if (/^(hentai|erotica|pornographic|smut|explicit|sexual violence|adult)$/.test(t)) age = Math.max(age, 18);
    else if (/^(ecchi|mature|harem|gore)$/.test(t)) age = Math.max(age, 16);
  });
  return age;
}

function parseDate(text) {
  const m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})/.exec(String(text || ''));
  if (!m) return undefined;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return undefined;
  return Date.UTC(Number(m[3]), month, Number(m[2]));
}

function header(headers, name) {
  const h = headers || {};
  const key = Object.keys(h).find((k) => k.toLowerCase() === name);
  return key ? String(h[key]) : '';
}

function embedSrc(html) {
  const text = String(html || '');
  const m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(text) || /(?:src|file)\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/i.exec(text);
  const src = m ? m[1] : /^(?:https?:)?\/\/\S+$/.test(text.trim()) ? text.trim() : '';
  return src.indexOf('//') === 0 ? 'https:' + src : src;
}

function dailymotionId(url) {
  const u = String(url || '');
  if (!/(?:^|\/\/|\.)(?:geo\.|www\.)?dailymotion\.com|dai\.ly/i.test(u)) return '';
  const q = /[?&]video=([A-Za-z0-9]+)/.exec(u);
  if (q) return q[1];
  const p = /(?:\/embed)?\/video\/([A-Za-z0-9]+)/.exec(u) || /dai\.ly\/([A-Za-z0-9]+)/.exec(u);
  return p ? p[1] : '';
}

function okruId(url) {
  const m = /^https?:\/\/(?:www\.)?ok\.ru\/videoembed\/(\d{6,})/i.exec(String(url || ''));
  return m ? m[1] : '';
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
    this.catalogCache = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async send(url, extra) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: Object.assign({ Accept: '*/*' }, extra || {}) }));
        if (response.status < 502 || response.status > 504) return response;
        last = response;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt === 1) throw e;
      }
    }
    return last;
  }

  async html(url, referer) {
    const response = await this.send(url, referer ? { Accept: 'text/html,application/xhtml+xml', Referer: referer } : { Accept: 'text/html,application/xhtml+xml' });
    if (response.status === 404) throw new Error('WowTopix: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error('WowTopix: HTTP ' + response.status);
    return String(response.data || '');
  }

  async rest(params) {
    const query = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== '')
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
      .join('&');
    const response = await this.send(API + '?' + query, { Accept: 'application/json' });
    if (response.status === 400 && /rest_post_invalid_page_number/.test(String(response.data || ''))) return { items: [], totalPages: 0 };
    if (response.status < 200 || response.status >= 300) throw new Error('WowTopix: the list answered HTTP ' + response.status);
    let items;
    try {
      items = JSON.parse(response.data);
    } catch (e) {
      throw new Error('WowTopix: the list did not answer JSON');
    }
    if (!Array.isArray(items)) throw new Error('WowTopix: the list answered something other than a list');
    await this.fillCovers(items);
    return { items, totalPages: Number(header(response.headers, 'x-wp-totalpages')) || 0 };
  }

  async fillCovers(items) {
    const hasEmbedded = (i) => i._embedded && i._embedded['wp:featuredmedia'] && i._embedded['wp:featuredmedia'][0] && i._embedded['wp:featuredmedia'][0].source_url;
    const need = items.filter((i) => i && i.featured_media && !hasEmbedded(i));
    if (!need.length) return;
    try {
      const ids = need.map((i) => i.featured_media).join(',');
      const response = await this.send(SITE + '/wp-json/wp/v2/media?per_page=100&_fields=id,source_url&include=' + ids, { Accept: 'application/json' });
      if (response.status < 200 || response.status >= 300) return;
      const byId = {};
      JSON.parse(response.data).forEach((m) => {
        if (m && m.id && m.source_url) byId[m.id] = m.source_url;
      });
      need.forEach((i) => {
        if (byId[i.featured_media]) i.coverUrl = byId[i.featured_media];
      });
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    }
  }

  card(item) {
    const slug = clean(item && item.slug);
    const title = plainText(item && item.title && item.title.rendered);
    if (!slug || !title) return null;
    const media = item._embedded && item._embedded['wp:featuredmedia'] && item._embedded['wp:featuredmedia'][0];
    const labels = genreSlugs(item.class_list).map(labelOfGenre);
    const card = { mangaId: slug, title, medium: 'anime', webURL: SITE + '/anime/' + seg(slug) + '/', ageRating: ratingOf(labels) };
    const source = (media && media.source_url) || item.coverUrl || '';
    const image = source ? coverOf(source, 300) : '';
    if (image) card.image = image;
    if (labels.length) card.tags = labels;
    return card;
  }

  async catalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 600000) return this.catalogCache.cards;
    const base = { per_page: 100, orderby: 'modified', order: 'desc', _embed: 'wp:featuredmedia', _fields: LIST_FIELDS };
    const first = await this.rest(Object.assign({ page: 1 }, base));
    const rest = [];
    for (let p = 2; p <= Math.min(first.totalPages, 10); p++) rest.push(this.rest(Object.assign({ page: p }, base)));
    const more = await Promise.all(rest);
    const cards = [];
    [first].concat(more).forEach((r) => r.items.forEach((item) => {
      const c = this.card(item);
      if (c) cards.push({ card: c, date: String(item.date || ''), modified: String(item.modified || '') });
    }));
    if (!cards.length) throw new Error('WowTopix: the catalog came back empty');
    this.catalogCache = { at: Date.now(), cards };
    return cards;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const chosen = (Array.isArray(request && request.includedTags) ? request.includedTags : [])
      .map((t) => String((t && (t.id || t.label)) || t).trim().toLowerCase())
      .map((t) => {
        const hit = GENRES.find((g) => g[0] === t || g[1].toLowerCase() === t);
        return hit ? hit[0] : t;
      })
      .filter(Boolean);
    if (chosen.length) {
      const all = await this.catalog();
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      let list = all.filter((entry) => {
        const c = entry.card;
        const have = (c.tags || []).map((t) => t.toLowerCase());
        const slugs = (c.tags || []).map((t) => (GENRES.find((g) => g[1] === t) || [t.toLowerCase().replace(/\s+/g, '-')])[0]);
        const okGenres = chosen.every((g) => slugs.indexOf(g) >= 0 || have.indexOf(g) >= 0);
        const name = c.title.toLowerCase();
        return okGenres && words.every((w) => name.indexOf(w) >= 0);
      });
      if (feed.id === 'new') list = list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      else if (feed.id === 'az') list = list.slice().sort((a, b) => a.card.title.toLowerCase().localeCompare(b.card.title.toLowerCase()));
      list = list.map((entry) => entry.card);
      const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return { results: slice, metadata: page * PAGE_SIZE < list.length ? { page: page + 1 } : undefined };
    }
    const params = { per_page: PAGE_SIZE, page, _embed: 'wp:featuredmedia', _fields: LIST_FIELDS };
    if (query) {
      params.search = query;
      params.search_columns = 'post_title';
    } else {
      params.orderby = feed.orderby;
      params.order = feed.order;
    }
    const { items, totalPages } = await this.rest(params);
    const results = items.map((i) => this.card(i)).filter(Boolean);
    const more = totalPages ? page < totalPages : results.length >= PAGE_SIZE;
    return { results, metadata: more && results.length ? { page: page + 1 } : undefined };
  }

  titlePage(slug) {
    const hit = this.pages.get(slug);
    if (hit && Date.now() - hit.at < 300000) return hit.promise;
    const promise = this.html(SITE + '/anime/' + seg(slug) + '/');
    this.pages.set(slug, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(slug) && this.pages.get(slug).promise === promise) this.pages.delete(slug);
    });
    if (this.pages.size > 12) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  async getMangaDetails(mangaId) {
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    const title = clean($('#anime-single h1').first().text()) || clean($('h1').first().text());
    if (!title) throw new Error('WowTopix: title not found');
    const meta = {};
    $('.anime-meta-list li').each((i, li) => {
      const key = clean($(li).find('strong').first().text()).replace(/:$/, '').toLowerCase();
      meta[key] = clean($(li).clone().children('strong').remove().end().text());
    });
    const genres = [];
    $('#anime-single .badge').each((i, b) => {
      if ($(b).hasClass('badge-studio')) return;
      let t = clean($(b).text());
      const half = t.length / 2;
      if (t.length % 2 === 0 && t.slice(0, half) === t.slice(half)) t = t.slice(0, half);
      if (t && genres.indexOf(t) < 0) genres.push(t);
    });
    const studios = [];
    $('#anime-single .badge-studio').each((i, b) => {
      const t = clean($(b).text());
      if (t && studios.indexOf(t) < 0) studios.push(t);
    });
    const paragraphs = [];
    $('.synopsis-content p').each((i, p) => {
      const t = clean($(p).text());
      if (t) paragraphs.push(t);
    });
    let synopsis = paragraphs.length ? paragraphs.join('\n\n') : clean($('.synopsis-content').first().text());
    if (!synopsis) {
      const facts = [meta.type, meta.year, meta.duration, meta.episodes ? meta.episodes + ' episodes' : '', meta.schedule && !/^(unknown|auto|n\/a|-)$/i.test(meta.schedule) ? 'airs ' + meta.schedule : ''].filter(Boolean);
      synopsis = 'No synopsis on the site.' + (facts.length ? ' ' + facts.join(', ') + '.' : '');
    }
    const alt = clean($('#anime-single p.italic').first().text());
    const state = clean($('.series-header span i').first().text()) || meta.status || '';
    let status = 'UNKNOWN';
    if (/^completed$/i.test(state)) status = 'COMPLETED';
    else if (/^ongoing$/i.test(state)) status = 'ONGOING';
    const info = {
      title,
      image: coverOf($('.img-single img').first().attr('src'), 450) || undefined,
      desc: [synopsis, alt ? 'Also known as: ' + alt : ''].filter(Boolean).join('\n\n') || undefined,
      status,
      completed: status === 'COMPLETED',
      tags: genres,
      webURL: SITE + '/anime/' + seg(mangaId) + '/',
      medium: 'anime',
      ageRating: ratingOf(genres),
    };
    if (studios.length) info.publisher = studios.join(', ');
    const year = /(\d{4})/.exec(meta.year || '');
    if (year) info.releaseDate = year[1];
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    return connectSeasons(this, mangaId, await this.seasonTitleOf(mangaId));
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
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    const rows = [];
    const seen = new Set();
    $('a.episode-card').each((i, a) => {
      const href = $(a).attr('href') || '';
      const id = slugOfHref(href);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const label = clean($(a).attr('data-ep'));
      const heading = clean($(a).find('h4').first().text());
      const when = parseDate($(a).find('p').first().text());
      let number;
      let name;
      const batch = /^0*(\d+)\s*(?:to|-)\s*0*(\d+)$/i.exec(label);
      if (batch) {
        number = Number(batch[2]);
        name = 'Episodes ' + Number(batch[1]) + ' to ' + Number(batch[2]);
      } else if (/^\d+(?:\.\d+)?$/.test(label)) {
        number = Number(label);
        name = 'Episode ' + number;
      } else {
        const m = /episode\s+(\d+(?:\.\d+)?)/i.exec(heading);
        if (m) {
          number = Number(m[1]);
          name = 'Episode ' + number;
        } else name = heading || 'Episode';
      }
      const row = { id, chapterId: id, name };
      if (number !== undefined && Number.isFinite(number)) row.number = number;
      if (when !== undefined) row.time = when;
      rows.push(row);
    });
    if (!rows.length) throw new Error('WowTopix has no episodes for this title yet');
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    const epUrl = SITE + '/' + seg(chapterId) + '/';
    let html;
    try {
      html = await this.html(epUrl);
    } catch (e) {
      if (/HTTP 404|not found/i.test(String(e && e.message))) throw new Error('WowTopix has no such episode');
      throw e;
    }
    const $ = cheerio.load(html);
    const players = [];
    $('.server-item .btn, .ps__-list .btn').each((i, b) => {
      const raw = $(b).attr('data-embed') || '';
      let decoded = '';
      try {
        decoded = App.base64Decode(raw);
      } catch (e) {
        try {
          decoded = typeof atob === 'function' ? atob(raw) : '';
        } catch (e2) {
          decoded = '';
        }
      }
      const src = embedSrc(decoded) || embedSrc(raw);
      if (src) players.push({ label: clean($(b).attr('data-server') || $(b).text()), src });
    });
    if (!players.length) throw new Error('WowTopix lists no player for this episode yet');

    const dailymotion = [];
    const seenDm = new Set();
    const okru = [];
    const seenOk = new Set();
    players.forEach((p) => {
      const dm = dailymotionId(p.src);
      if (dm && !seenDm.has(dm)) {
        seenDm.add(dm);
        dailymotion.push({ id: dm, label: p.label });
        return;
      }
      const ok = okruId(p.src);
      if (ok && !seenOk.has(ok)) {
        seenOk.add(ok);
        okru.push({ id: ok, label: p.label });
      }
    });

    const removed = [];
    const looked = await Promise.all(dailymotion.map((d) => this.dailymotion(d, epUrl, removed)));
    const videos = [];
    looked.forEach((v) => {
      if (v) videos.push(v);
    });
    if (videos.length > 1) videos.forEach((v, i) => (v.quality = v.quality + (i ? ' ' + (i + 1) : '')));
    okru.slice(0, 2).forEach((o) => videos.push({ url: 'https://ok.ru/videoembed/' + o.id, type: 'embed', quality: 'OK.ru', server: 'OK.ru' }));
    if (!videos.length) {
      if (removed.length) throw new Error('WowTopix: Dailymotion no longer has the video of this episode ("' + removed[0] + '") and the site lists no other player this app can open');
      throw new Error('WowTopix has no stream for this episode yet (only a countdown or players this app cannot open)');
    }
    return videos;
  }

  async dailymotion(d, epUrl, removed) {
    try {
      const response = await this.send('https://www.dailymotion.com/player/metadata/video/' + encodeURIComponent(d.id), { Accept: 'application/json', Referer: epUrl });
      if (response.status < 200 || response.status >= 300) return null;
      const meta = JSON.parse(response.data);
      const master = meta && meta.qualities && meta.qualities.auto && meta.qualities.auto[0] && meta.qualities.auto[0].url;
      if (!master) {
        const reason = meta && meta.error && clean(meta.error.message);
        if (reason && removed.indexOf(reason) < 0) removed.push(reason);
        return null;
      }
      const subtitles = [];
      const data = (meta.subtitles && meta.subtitles.data) || {};
      Object.keys(data).forEach((code) => {
        if (/-auto$/i.test(code)) return;
        const entry = data[code] || {};
        const file = entry.urls && entry.urls[0];
        if (file) subtitles.push({ url: file, label: clean(entry.label) || code, language: String(code).slice(0, 2).toLowerCase() });
      });
      const video = {
        url: master,
        quality: 'Dailymotion',
        type: 'hls',
        server: 'Dailymotion',
        headers: { Referer: 'https://www.dailymotion.com/', Origin: 'https://www.dailymotion.com' },
      };
      if (subtitles.length) video.subtitles = subtitles;
      return video;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      console.error('WowTopix Dailymotion lookup failed: ' + (e && e.message));
      return null;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
