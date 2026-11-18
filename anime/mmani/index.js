const SITE = 'https://mmani.com';

const GENRES = [
  ['21212', 'Action'], ['21216', 'Adventure'], ['21202', 'Comedy'], ['21284', 'Drama'], ['21203', 'Ecchi'], ['21247', 'Fantasy'], ['21621', 'Hentai'], ['21385', 'Horror'],
  ['21459', 'Mahou Shoujo'], ['21391', 'Mecha'], ['21457', 'Music'], ['21392', 'Mystery'], ['21393', 'Psychological'], ['21204', 'Romance'], ['21343', 'Sci-Fi'],
  ['21205', 'Slice of Life'], ['21445', 'Sports'], ['21213', 'Supernatural'], ['21394', 'Thriller'],
];

const FEEDS = [
  { id: 'recent', name: 'Latest', filter: '' },
  { id: 'airing', name: 'Airing', filter: '&postseasontypetagid=22827' },
  { id: 'week', name: 'Trending this week', top: 'week' },
  { id: 'all', name: 'Most viewed', top: 'all' },
  { id: 'movie', name: 'Movies', filter: '&anitypestagid=21341' },
  { id: 'bd', name: 'Blu-ray', filter: '&postseasontypetagid=22258' },
];

const PAGE = 24;
const TYPE_NAMES = { TV: 'TV', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special', TV_SHORT: 'Short' };
const EXPLICIT_TAGS = ['group sex', 'public sex', 'anal sex', 'sex toys'];
const SUGGESTIVE_TAGS = ['nudity', 'hypersexuality', 'incest', 'psychosexual', 'rape'];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function words(text) {
  return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function ratingOf(row) {
  const genres = words(row.postanigenres).map((s) => s.toLowerCase());
  const seasons = words(row.postseasontype).map((s) => s.toLowerCase());
  const tagged = typeof row.anitags === 'string';
  const tags = words(row.anitags).map((s) => s.toLowerCase());
  let age = 0;
  if (genres.indexOf('hentai') >= 0 || seasons.indexOf('hentai') >= 0) age = 18;
  if (/\buncensored\b/i.test(String(row.postname || ''))) age = 18;
  if (tags.some((t) => EXPLICIT_TAGS.indexOf(t) >= 0)) age = 18;
  if (age < 16 && (genres.indexOf('ecchi') >= 0 || seasons.indexOf('ani16+') >= 0 || tags.some((t) => SUGGESTIVE_TAGS.indexOf(t) >= 0))) age = 16;
  return { age, tagged };
}

function coverOf(row, big) {
  const found = [row.ani_cover_large, row.ani_cover_medium, row.postthum].map(clean).filter((u) => /^https?:\/\//.test(u));
  const large = found.find((u) => /^https?:\/\/[^/]*\.anilist\.co\//.test(u)) || found[0] || '';
  if (!large) return '';
  return big ? large : large.replace('/cover/large/', '/cover/medium/');
}

function episodeOf(entry, index) {
  const label = clean(entry.name || entry.slug);
  const lead = /^(\d+)/.exec(label);
  const special = /(SP|OVA|OV)(\d*)$/i.exec(label);
  if (special) {
    const kind = /^SP/i.test(special[1]) ? 'Special' : 'OVA';
    const n = special[2] ? ` ${Number(special[2])}` : '';
    return { name: kind + n, number: lead ? Number(lead[1]) : index + 1 };
  }
  if (lead && /^\d+$/.test(label)) return { name: `Episode ${Number(lead[1])}`, number: Number(lead[1]) };
  return { name: label || `Episode ${index + 1}`, number: lead ? Number(lead[1]) : index + 1 };
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
    this.rows = new Map();
    this.tops = new Map();
    this.pending = new Map();
    this.key = '';
    this.keyRead = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async send(url, headers, accept) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: Object.assign({ Accept: accept || '*/*' }, headers || {}) }));
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

  async pageKey(renew) {
    if (this.key && !renew) return this.key;
    if (!this.keyRead || renew) {
      this.keyRead = (async () => {
        const response = await this.send(`${SITE}/`, {}, 'text/html');
        if (response.status < 200 || response.status >= 300) throw new Error(`MMani: its home page answered HTTP ${response.status}`);
        const m = /X-KF-Req[\s\S]{0,900}?\(window\.fetch,\s*"([^"]{8,80})"\)/.exec(String(response.data || ''));
        if (!m) throw new Error('MMani: its page key was not found on the home page (the site changed)');
        this.key = m[1];
        return this.key;
      })();
      this.keyRead.catch(() => {
        this.keyRead = null;
      });
    }
    return this.keyRead;
  }

  async api(name, params) {
    const url = `${SITE}/ajax.php?${name}${params ? `&${params}` : ''}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const key = await this.pageKey(attempt > 0);
      const response = await this.send(url, { Referer: `${SITE}/`, 'X-KF-Req': key }, 'application/json');
      if (response.status === 403) {
        if (attempt === 0) continue;
        throw new Error('MMani refused the request (HTTP 403); its page key may have changed');
      }
      if (response.status === 404) throw new Error('MMani: not found (HTTP 404)');
      if (response.status < 200 || response.status >= 300) throw new Error(`MMani: HTTP ${response.status}`);
      try {
        return JSON.parse(response.data);
      } catch (e) {
        throw new Error('MMani: the site did not answer JSON (try again in a minute)');
      }
    }
    throw new Error('MMani: the request did not complete');
  }

  async row(id) {
    if (!/^\d+$/.test(String(id))) throw new Error('MMani: unknown title id ' + id);
    const hit = this.rows.get(id);
    if (hit && Date.now() - hit.at < 600000) return hit.row;
    const pending = this.pending.get(id);
    if (pending) return pending;
    const job = (async () => {
      const data = await this.api('single', `postid=${id}`);
      const row = data && data.status === 'success' ? data.data : null;
      if (!row || !row.postname) throw new Error('MMani: title not found');
      this.rows.set(id, { at: Date.now(), row });
      if (this.rows.size > 400) this.rows.delete(this.rows.keys().next().value);
      return row;
    })();
    this.pending.set(id, job);
    try {
      return await job;
    } finally {
      this.pending.delete(id);
    }
  }

  async complete(rows) {
    return Promise.all(
      rows.map(async (r) => {
        if (typeof r.anitags === 'string') return r;
        try {
          return Object.assign({}, r, await this.row(String(r.postid)));
        } catch (e) {
          return r;
        }
      })
    );
  }

  card(r) {
    const rating = ratingOf(r);
    const type = TYPE_NAMES[r.anitypes] || '';
    const note = clean(r.postnoti);
    const card = {
      mangaId: String(r.postid),
      title: clean(r.postname),
      image: coverOf(r, false),
      medium: 'anime',
      webURL: `${SITE}/up/${r.postid}`,
      summary: [type, clean(r.postyear), note ? `Ep ${note}` : ''].filter(Boolean).join(', ') || undefined,
    };
    if (rating.tagged || rating.age > 0) card.ageRating = rating.age;
    return card;
  }

  async cards(rows) {
    const full = await this.complete(rows);
    const seen = new Set();
    const out = [];
    for (const r of full) {
      const id = String(r.postid);
      if (!r.postname || seen.has(id)) continue;
      seen.add(id);
      out.push(this.card(r));
    }
    return out;
  }

  async top(type) {
    const hit = this.tops.get(type);
    if (hit && Date.now() - hit.at < 600000) return hit.rows;
    const data = await this.api('topview', `type=${type}&limit=100`);
    const rows = data && data.status === 'success' && Array.isArray(data.data) ? data.data : [];
    if (rows.length) this.tops.set(type, { at: Date.now(), rows });
    return rows;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tagId = included.length ? String(included[0].id || included[0]) : '';
    const genre = GENRES.find((g) => g[0] === tagId);
    if (tagId && !genre) return { results: [], metadata: undefined };
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];

    if (query) {
      const data = await this.api('search', `keyword=${encodeURIComponent(query)}&page=${page}&limit=20`);
      if (!data || data.status !== 'success') return { results: [], metadata: undefined };
      let rows = Array.isArray(data.data) ? data.data : [];
      const total = Number(data.pagination && data.pagination.total_pages) || 1;
      if (genre) rows = rows.filter((r) => words(r.postanigenres).indexOf(genre[1]) >= 0);
      const results = await this.cards(rows);
      return { results, metadata: page < total ? { page: page + 1 } : undefined };
    }

    if (!tagId && feed.top) {
      const all = await this.top(feed.top);
      const rows = all.slice((page - 1) * PAGE, page * PAGE);
      const results = await this.cards(rows);
      return { results, metadata: page * PAGE < all.length ? { page: page + 1 } : undefined };
    }

    const filter = tagId ? `&postanigenrestagid=${tagId}` : feed.filter || '';
    const data = await this.api('filter', `page=${page}&limit=${PAGE}${filter}`);
    if (!data || data.status !== 'success') return { results: [], metadata: undefined };
    const rows = Array.isArray(data.data) ? data.data : [];
    const total = Number(data.pagination && data.pagination.total_pages) || 1;
    const results = await this.cards(rows);
    return { results, metadata: rows.length && page < total ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const id = String(mangaId);
    const r = await this.row(id);
    const genres = words(r.postanigenres);
    const seasons = words(r.postseasontype).map((s) => s.toLowerCase());
    const rating = ratingOf(r);
    const status = seasons.indexOf('airing') >= 0 ? 'ONGOING' : r.anitypes === 'MOVIE' || seasons.indexOf('bd') >= 0 ? 'COMPLETED' : 'UNKNOWN';
    const studios = words(r.poststudios);
    const alt = [clean(r.english), clean(r.native)].filter((t) => t && t !== clean(r.postname));
    const desc = String(r.postcontent || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const info = {
      title: clean(r.postname),
      image: coverOf(r, true),
      desc: [desc, alt.length ? `Also known as: ${alt.join(' / ')}` : ''].filter(Boolean).join('\n\n') || undefined,
      author: studios.length ? studios.slice(0, 3).join(', ') : undefined,
      tags: genres,
      status,
      completed: status === 'COMPLETED',
      webURL: `${SITE}/up/${id}`,
      medium: 'anime',
      ageRating: rating.age,
    };
    const banner = clean(r.ani_banner);
    if (/^https?:\/\//.test(banner)) info.banner = banner;
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
    const r = await this.row(String(mangaId));
    const anilist = clean(r.anilist);
    if (!/^\d+$/.test(anilist)) throw new Error('MMani has no episode list for this title');
    const servers = await this.api('episodes', `epid=${anilist}`);
    if (!Array.isArray(servers)) throw new Error('MMani: the episode list did not load (try again in a minute)');
    let best = [];
    for (const s of servers) {
      if (s && Array.isArray(s.server_data) && s.server_data.length > best.length) best = s.server_data;
    }
    const movie = r.anitypes === 'MOVIE' && best.length === 1;
    const seen = new Set();
    const chapters = [];
    best.forEach((entry, index) => {
      const id = clean(entry && entry.link);
      if (!id || seen.has(id)) return;
      seen.add(id);
      const ep = episodeOf(entry, index);
      chapters.push({ id, chapterId: id, name: movie ? 'Movie' : ep.name, number: ep.number });
    });
    return chapters.reverse();
  }

  async player(link) {
    const response = await this.send(link, { Referer: `${SITE}/` }, 'text/html');
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    const m = /PLAYER_CONFIG\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(String(response.data || ''));
    if (!m) throw new Error('no player data');
    const config = JSON.parse(m[1]);
    const origin = (/^(https?:\/\/[^/]+)/.exec(link) || [])[1] || '';
    const video = clean(config.videoUrl);
    const url = /^https?:\/\//.test(video) ? video : video.charAt(0) === '/' ? origin + video : '';
    if (!url) throw new Error('no stream address');
    return { url, tracks: Array.isArray(config.tracks) ? config.tracks : [], origin };
  }

  async getVideos(mangaId, chapterId) {
    const link = clean(chapterId);
    if (!link) throw new Error('MMani: no episode id');
    const sources = await this.api('eplink', `data=${encodeURIComponent(link)}`);
    const list = Array.isArray(sources) ? sources.filter((s) => s && /^https?:\/\//.test(String(s.link || ''))) : [];
    if (!list.length) throw new Error('MMani lists no stream for this episode yet');

    const headers = { Referer: `${SITE}/` };
    const found = await Promise.all(
      list.map(async (s) => {
        try {
          const p = await this.player(s.link);
          const playlist = await this.send(p.url, headers, '*/*');
          const text = String(playlist.data || '');
          if (playlist.status < 200 || playlist.status >= 300 || text.indexOf('#EXTM3U') !== 0 || text.indexOf('#EXTINF') < 0) return null;
          const piece = /\/hls\/[^/]+\/([^/]+)\//.exec(p.url);
          const h = /^\d{14}(\d{3,4})p/.exec(decodeBase64(piece ? piece[1] : ''));
          const height = h ? Number(h[1]) : /^R-HD$/i.test(s.server) ? 1080 : /^SR$/i.test(s.server) ? 720 : 0;
          const subtitles = p.tracks
            .filter((t) => t && /^https?:\/\//.test(String(t.file || '')))
            .map((t) => ({ url: t.file, label: clean(t.label) || 'English', language: languageOf(t.label) }));
          const entry = { url: p.url, type: 'hls', quality: `${height ? `${height}p ` : ''}Softsub`, server: clean(s.server) || 'MMani', headers };
          if (subtitles.length) entry.subtitles = subtitles;
          return { entry, height };
        } catch (e) {
          if (e && (e.kind === 'blocked' || e.kind === 'challenge')) throw e;
          return null;
        }
      })
    );
    const ok = found.filter(Boolean).sort((a, b) => b.height - a.height);
    if (!ok.length) throw new Error('MMani lists this episode, but none of its streams is ready (try again later)');
    return ok.map((f) => f.entry);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

function decodeBase64(text) {
  try {
    return App.base64Decode(String(text || ''));
  } catch (e) {
    return '';
  }
}

function languageOf(label) {
  const l = clean(label).toLowerCase();
  const table = { english: 'en', indonesian: 'id', spanish: 'es', portuguese: 'pt', arabic: 'ar', french: 'fr', german: 'de', italian: 'it', russian: 'ru', thai: 'th', vietnamese: 'vi', chinese: 'zh', japanese: 'ja' };
  return table[l] || (l.length >= 2 ? l.slice(0, 2) : 'en');
}

module.exports = { Source };
