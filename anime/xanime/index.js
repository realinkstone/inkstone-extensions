const SITE = 'https://xanime.me';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 120;

const FEEDS = [
  { id: 'updated', name: 'Latest Updates', query: 'sortby=field_update' },
  { id: 'new', name: 'Newly Added', query: 'sortby=field_create' },
  { id: 'airing', name: 'Airing Now', query: 'sortby=field_update&status=currently_airing' },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['horror', 'Horror'],
  ['mahou_shoujo', 'Mahou Shoujo'], ['mecha', 'Mecha'], ['music', 'Music'], ['mystery', 'Mystery'], ['psychological', 'Psychological'], ['romance', 'Romance'],
  ['sci_fi', 'Sci-Fi'], ['slice_of_life', 'Slice of Life'], ['sports', 'Sports'], ['supernatural', 'Supernatural'], ['thriller', 'Thriller'],
];

function gridImage(url) {
  return String(url || '').replace('/cover/large/', '/cover/medium/');
}

function coverOf(url) {
  const u = clean(url);
  return u.charAt(0) === '/' ? `${SITE}${u}` : gridImage(u);
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function plain(html) {
  return clean(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

function ms(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
}

function span(range) {
  const start = ms(range && range.start);
  const end = ms(range && range.end);
  if (end === undefined) return undefined;
  return start === undefined ? { start: 0, end } : end > start ? { start, end } : undefined;
}

function qwik(raw) {
  const objs = raw && raw._objs;
  if (!Array.isArray(objs) || raw._entry === undefined) throw new Error('Xanime answered something that is not page data');
  const memo = new Map();
  const at = (i) => {
    if (memo.has(i)) return memo.get(i);
    const v = objs[i];
    if (Array.isArray(v)) {
      const out = [];
      memo.set(i, out);
      for (const x of v) out.push(typeof x === 'string' ? at(parseInt(x, 36)) : x);
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {};
      memo.set(i, out);
      for (const k of Object.keys(v)) {
        const x = v[k];
        out[k] = typeof x === 'string' ? at(parseInt(x, 36)) : x;
      }
      return out;
    }
    memo.set(i, v);
    return v;
  };
  return at(parseInt(raw._entry, 36));
}

function find(node, keys, depth) {
  const d = depth || 0;
  if (!node || typeof node !== 'object' || d > 9) return null;
  if (!Array.isArray(node) && keys.every((k) => k in node)) return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const hit = find(v, keys, d + 1);
    if (hit) return hit;
  }
  return null;
}

function idOf(path) {
  const m = /\/title\/(\d+(?:-[A-Za-z0-9_-]+)?)/.exec(String(path || ''));
  return m ? m[1] : '';
}

function numberOf(mangaId) {
  return String(mangaId).split('-')[0];
}

function ageOf(rating, genres) {
  const r = clean(rating).toUpperCase();
  const g = (Array.isArray(genres) ? genres : []).map((x) => String(x).toLowerCase());
  if (r === 'RX' || g.indexOf('hentai') >= 0) return 18;
  if (r === 'R+' || g.indexOf('erotica') >= 0 || g.indexOf('ecchi') >= 0) return 16;
  return undefined;
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
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  async data(path) {
    const response = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
    if (response.status === 404) throw new Error('Xanime: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Xanime: HTTP ${response.status}`);
    let raw;
    try {
      raw = JSON.parse(response.data);
    } catch (e) {
      throw new Error('Xanime returned a page that is not data');
    }
    return qwik(raw);
  }

  card(item) {
    const a = item && item.data;
    const id = a && idOf(a.aniPath);
    const title = a && clean(a.info_title);
    if (!id || !title) return null;
    const out = { mangaId: id, title, image: coverOf(a.urlCover600 || a.urlCoverOri), medium: 'anime' };
    const count = Number(a.ep_total);
    if (Number.isFinite(count) && count > 0) out.summary = `${count} ${count === 1 ? 'episode' : 'episodes'}`;
    const age = ageOf(a.info_meta_rating_short, a.info_meta_genre);
    if (age !== undefined) out.ageRating = age;
    return out;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;
    let path = `/search/q-data.json?page=${page}&${feed.query}`;
    if (query) path += `&word=${encodeURIComponent(query)}`;
    const genres = included.map((g) => g && g.id).filter(Boolean);
    if (genres.length) path += `&genres=${encodeURIComponent(genres.join(','))}`;
    const tree = await this.data(path);
    const list = find(tree, ['paging', 'items']);
    if (!list) return { results: [] };
    const results = [];
    const seen = new Set();
    for (const item of Array.isArray(list.items) ? list.items : []) {
      const card = this.card(item);
      if (!card || seen.has(card.mangaId)) continue;
      seen.add(card.mangaId);
      results.push(card);
    }
    const next = Number(list.paging && list.paging.next);
    return { results, metadata: next > page ? { page: next } : undefined };
  }

  async getMangaDetails(mangaId) {
    const tree = await this.data(`/title/${encodeURIComponent(mangaId)}/q-data.json`);
    const node = find(tree, ['animesNode']);
    const a = node && node.animesNode && node.animesNode.data;
    if (!a || !a.ani_id) throw new Error('Xanime: title not found');
    const genres = (Array.isArray(a.info_meta_genre) ? a.info_meta_genre : []).map((g) => clean(String(g).replace(/_/g, ' '))).filter(Boolean);
    const state = String(a.info_meta_status || '').toLowerCase();
    const studios = Array.isArray(a.info_meta_studios) ? a.info_meta_studios.map((s) => clean(typeof s === 'string' ? s : s && (s.name || s.title))).filter(Boolean) : [];
    const season = clean([a.info_meta_season, a.info_meta_year].filter(Boolean).join(' '));
    const info = {
      title: clean(a.info_title),
      image: /^\//.test(clean(a.urlCover600 || a.urlCoverOri)) ? `${SITE}${clean(a.urlCover600 || a.urlCoverOri)}` : clean(a.urlCover600 || a.urlCoverOri),
      banner: /^https?:\/\//.test(String(a.bgimg_url || '')) ? a.bgimg_url : undefined,
      desc: plain(a.info_filmdesc) || undefined,
      author: studios.length ? studios.join(', ') : season || undefined,
      status: /finished/.test(state) ? 'COMPLETED' : /currently|airing/.test(state) ? 'ONGOING' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/title/${mangaId}`,
      medium: 'anime',
    };
    const alt = Array.isArray(a.info_alternative_titles) ? a.info_alternative_titles.map(clean).filter((t) => t && t !== info.title).slice(0, 3) : [];
    if (alt.length) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Also known as: ${alt.join(' | ')}`;
    const age = ageOf(a.info_meta_rating_short, a.info_meta_genre);
    if (age !== undefined) info.ageRating = age;
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
    const aniId = numberOf(mangaId);
    const query = 'query($select: AnimesEpisodesList_Select){ get_q01(select:$select){ paging{total pages page size next} items{ id data{ ani_id ep_id ep_index ep_sub_index ep_title epPath is_new date_create date_update } } } }';
    const rows = [];
    const seen = new Set();
    for (let page = 1, guard = 0; page && guard < 40; guard++) {
      const response = await this.requests.schedule(
        App.createRequest({
          url: `${SITE}/z2/`,
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', Origin: SITE, Referer: `${SITE}/` },
          body: JSON.stringify({ query, variables: { select: { ani_id: aniId, page, size: PAGE_SIZE } } }),
        })
      );
      if (response.status < 200 || response.status >= 300) throw new Error(`Xanime: HTTP ${response.status}`);
      let body;
      try {
        body = JSON.parse(response.data);
      } catch (e) {
        throw new Error('Xanime returned a page that is not data');
      }
      const list = body && body.data && body.data.get_q01;
      if (!list) throw new Error(`Xanime: ${clean(body && body.errors && body.errors[0] && body.errors[0].message) || 'no episode list'}`);
      for (const item of Array.isArray(list.items) ? list.items : []) {
        const e = item && item.data;
        if (!e || !e.ep_id || seen.has(String(e.ep_id))) continue;
        seen.add(String(e.ep_id));
        const index = Number(e.ep_index);
        const sub = Number(e.ep_sub_index);
        const number = Number.isFinite(index) ? index + (Number.isFinite(sub) && sub > 0 ? sub / 10 : 0) : undefined;
        const title = clean(e.ep_title);
        const row = { id: String(e.ep_id), chapterId: String(e.ep_id), name: title || (number !== undefined ? `Episode ${number}` : 'Episode') };
        if (number !== undefined) row.number = number;
        const t = Number(e.date_create);
        if (Number.isFinite(t) && t > 1e11) row.time = t;
        rows.push(row);
      }
      const next = Number(list.paging && list.paging.next);
      page = next > page ? next : 0;
    }
    if (!rows.length) throw new Error('Xanime has no episodes for this title yet');
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const tree = await this.data(`/title/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/q-data.json`);
    const node = find(tree, ['episodesNode']);
    const list = (node && node.episodesNode && node.episodesNode.data && node.episodesNode.data.sourcesNode_list) || [];
    const videos = [];
    const taken = new Set();
    const order = { sub: 0, dub: 1, uncs: 2, raw: 3 };
    const sources = (Array.isArray(list) ? list : []).map((s) => s && s.data).filter((s) => s && /^https?:\/\//.test(String(s.souPath || '')));
    sources.sort((a, b) => (order[a.src_type] === undefined ? 9 : order[a.src_type]) - (order[b.src_type] === undefined ? 9 : order[b.src_type]));
    for (const s of sources) {
      if (taken.has(s.souPath)) continue;
      taken.add(s.souPath);
      const subtitles = [];
      const used = new Set();
      for (const t of Array.isArray(s.track) ? s.track : []) {
        const url = clean(t && t.trackPath);
        if (!/^https?:\/\//.test(url) || (t.kind && String(t.kind) !== 'captions' && String(t.kind) !== 'subtitles')) continue;
        const base = clean(t.label) || 'Subtitles';
        let label = base;
        for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
        used.add(label.toLowerCase());
        subtitles.push({ url, label, language: /^english/i.test(base) ? 'en' : base, format: /\.srt(?:[?#]|$)/i.test(url) ? 'srt' : 'vtt' });
      }
      const english = subtitles.filter((t) => t.language === 'en');
      const ordered = english.concat(subtitles.filter((t) => t.language !== 'en'));
      const kind = String(s.src_type || 'sub');
      let quality;
      if (kind === 'dub') quality = 'Auto, Dub';
      else if (kind === 'raw') quality = 'Auto, Raw (no subtitles)';
      else if (kind === 'uncs') quality = `Auto, Uncensored Sub${ordered.length ? `: ${ordered.slice(0, 2).map((t) => t.label).join(', ')}` : ''}`;
      else quality = ordered.length ? `Auto, Softsub: ${ordered.slice(0, 3).map((t) => t.label).join(', ')}${ordered.length > 3 ? ` and ${ordered.length - 3} more` : ''}` : 'Auto, Sub';
      const video = { url: s.souPath, quality, type: 'hls', server: 'Xanime' };
      if (ordered.length) video.subtitles = ordered;
      const jump = s.jump || {};
      const intro = span(jump.intro);
      const outro = span(jump.outro);
      if (intro) video.intro = intro;
      if (outro) video.outro = outro;
      videos.push(video);
    }
    if (!videos.length) throw new Error('Xanime has no stream for this episode yet. A new episode can take a few hours, try again later.');
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
