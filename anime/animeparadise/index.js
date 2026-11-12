const API = 'https://api.animeparadise.moe';
const STREAM = 'https://stream.animeparadise.moe';
const SITE = 'https://www.animeparadise.moe';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'latest', name: 'Latest Episodes' },
  { id: 'new', name: 'Newest Releases' },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function imageOf(poster) {
  if (!poster) return '';
  return poster.large || poster.medium || poster.original || poster.small || '';
}

function gridImageOf(poster) {
  if (!poster) return '';
  return poster.medium || imageOf(poster);
}

function ageOf(item) {
  const genres = Array.isArray(item && item.genres) ? item.genres : [];
  if (genres.some((g) => /^ecchi$/i.test(g))) return 16;
  const rating = clean(item && item.ageRating).toUpperCase();
  if (rating === 'R') return 16;
  if (rating === 'G' || rating === 'PG') return 0;
  return undefined;
}

function secondsToMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
}

function span(range) {
  const start = secondsToMs(range && range.start);
  const end = secondsToMs(range && range.end);
  return start !== undefined && end !== undefined && end > start ? { start, end } : start === undefined && end !== undefined && end > 0 ? { start: 0, end } : undefined;
}

function tallest(master) {
  let best = 0;
  for (const m of String(master || '').matchAll(/RESOLUTION=\d+x(\d+)/g)) best = Math.max(best, parseInt(m[1], 10));
  return best;
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
    this.ages = new Map();
    this.ids = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  card(item) {
    const link = clean(item && item.link);
    if (!link || !item.title) return null;
    if (item._id) this.ids.set(link, item._id);
    const age = ageOf(item);
    if (age !== undefined) this.ages.set(link, age);
    const count = Number(item.episodeCount || item.episodes);
    const out = {
      mangaId: link,
      title: clean(item.title),
      image: gridImageOf(item.posterImage),
      medium: 'anime',
    };
    if (age !== undefined) out.ageRating = age;
    if (Number.isFinite(count) && count > 0) out.summary = `${count} ${count === 1 ? 'episode' : 'episodes'}`;
    return out;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    if (!query && !included.length && feed === 'latest') {
      const data = await this.json(`${API}/ep/recently-added?limit=${PAGE_SIZE}&page=${page}`);
      const results = [];
      const seen = new Set();
      for (const ep of Array.isArray(data.data) ? data.data : []) {
        const origin = ep && ep.origin;
        if (!origin || !origin.link || seen.has(origin.link)) continue;
        seen.add(origin.link);
        if (origin._id) this.ids.set(origin.link, origin._id);
        const known = this.ages.get(origin.link);
        const card = { mangaId: origin.link, title: clean(origin.title), image: gridImageOf(origin.posterImage), medium: 'anime', summary: ep.number ? `Episode ${clean(ep.number)}` : undefined };
        if (known !== undefined) card.ageRating = known;
        results.push(card);
      }
      return { results, metadata: data.pagination && data.pagination.hasNext ? { page: page + 1 } : undefined };
    }

    let url = `${API}/search?limit=${PAGE_SIZE}&page=${page}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    else if (feed === 'new') url += '&sort=RELEASE_DATE';
    else url += '&sort=POPULARITY';
    const genre = included.length && included[0] && included[0].id ? String(included[0].id) : '';
    if (genre) url += `&genres=${encodeURIComponent(genre)}`;
    const data = await this.json(url);
    const results = [];
    const seen = new Set();
    for (const item of Array.isArray(data.data) ? data.data : []) {
      const card = this.card(item);
      if (!card || seen.has(card.mangaId)) continue;
      seen.add(card.mangaId);
      results.push(card);
    }
    return { results, metadata: data.pagination && data.pagination.hasNext ? { page: page + 1 } : undefined };
  }

  async detailsOf(link) {
    const data = await this.json(`${API}/anime/${encodeURIComponent(link)}`);
    const a = data && data.data;
    if (!a || !a._id) throw new Error('AnimeParadise: title not found');
    this.ids.set(link, a._id);
    return a;
  }

  async getMangaDetails(mangaId) {
    const a = await this.detailsOf(mangaId);
    const names = a.alternativeTitle || {};
    const genres = (Array.isArray(a.genres) ? a.genres : []).filter((g) => typeof g === 'string' && g.trim());
    const season = a.animeSeason && a.animeSeason.year ? `${a.animeSeason.season || ''} ${a.animeSeason.year}`.trim() : '';
    const status = String(a.status || '').toLowerCase();
    const info = {
      title: clean(a.title),
      image: imageOf(a.posterImage),
      banner: a.coverImage && /^https?:\/\//.test(String(a.coverImage.large || a.coverImage.original || '')) ? a.coverImage.large || a.coverImage.original : undefined,
      desc: clean(String(a.synopsys || '').replace(/<[^>]+>/g, ' ')) || undefined,
      author: season || undefined,
      status: /finished|completed/.test(status) ? 'COMPLETED' : /releasing|airing|ongoing/.test(status) ? 'ONGOING' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/anime/${a.link || mangaId}`,
      medium: 'anime',
    };
    const alt = [names.english, names.romaji].map(clean).filter((n) => n && n !== info.title);
    if (alt.length) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Also known as: ${alt.join(' | ')}`;
    const age = genres.some((g) => /^ecchi$/i.test(g)) ? 16 : this.ages.get(mangaId);
    if (age !== undefined) info.ageRating = age;
    return { mangaInfo: info };
  }

  async originOf(mangaId) {
    return this.ids.get(mangaId) || (await this.detailsOf(mangaId))._id;
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
    const origin = await this.originOf(mangaId);
    const data = await this.json(`${API}/anime/${encodeURIComponent(origin)}/episode`);
    const rows = [];
    for (const e of Array.isArray(data.data) ? data.data : []) {
      if (!e || !e.uid) continue;
      const number = Number(e.number);
      const title = clean(e.title);
      const row = {
        id: String(e.uid),
        chapterId: String(e.uid),
        name: Number.isFinite(number) ? (title ? `Episode ${number}: ${title}` : `Episode ${number}`) : title || 'Episode',
      };
      if (Number.isFinite(number)) row.number = number;
      if (title) row.title = title;
      if (/^https?:\/\//.test(String(e.image || ''))) row.thumbnail = String(e.image);
      rows.push(row);
    }
    if (!rows.length) throw new Error('AnimeParadise has no episodes for this title yet');
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const origin = await this.originOf(mangaId);
    const data = await this.json(`${API}/ep/${encodeURIComponent(chapterId)}?origin=${encodeURIComponent(origin)}`);
    const ep = data && data.data && data.data.episode;
    if (!ep || !ep.streamLink) throw new Error('AnimeParadise has no stream for this episode yet');
    const master = `${STREAM}/m3u8?url=${encodeURIComponent(ep.streamLink)}`;

    const text = await this.text(master);
    if (text.indexOf('#EXTM3U') < 0) throw new Error('AnimeParadise answered something that is not a playlist');
    const variant = text.split('\n').map((l) => l.trim()).find((l) => l && l.charAt(0) !== '#');
    if (variant) {
      const target = /^https?:\/\//.test(variant) ? variant : `${STREAM}${variant.charAt(0) === '/' ? '' : '/'}${variant}`;
      const response = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*' } }));
      if (response.status === 404) throw new Error('AnimeParadise has the playlist but not the video of this episode yet (a new episode can take hours), try again later');
    }

    const height = tallest(text);
    const byLanguage = new Map();
    for (const s of Array.isArray(ep.subData) ? ep.subData : []) {
      if (!s || !s.src) continue;
      const isAss = String(s.type).toLowerCase() === 'ass';
      const src = String(s.src);
      const url = isAss ? `${API}/stream/file/${encodeURIComponent(src)}` : /^https?:\/\//.test(src) ? src : '';
      if (!url) continue;
      const label = clean(s.label) || 'Subtitles';
      const key = label.toLowerCase();
      const entry = { url, label, language: key === 'english' ? 'en' : label, format: isAss ? 'ass' : 'vtt' };
      if (!byLanguage.has(key) || (isAss && byLanguage.get(key).format !== 'ass')) byLanguage.set(key, entry);
    }
    const subtitles = [...byLanguage.values()];
    const ordered = subtitles.filter((s) => s.language === 'en').concat(subtitles.filter((s) => s.language !== 'en'));
    const skip = ep.skipData || {};
    const video = { url: master, quality: `Auto${height ? ` up to ${height}p` : ''}, Softsub${ordered.length ? `: ${ordered.map((s) => s.label).join(', ')}` : ''}`, type: 'hls', server: 'AnimeParadise' };
    if (ordered.length) video.subtitles = ordered;
    const intro = span(skip.intro);
    const outro = span(skip.outro);
    if (intro) video.intro = intro;
    if (outro) video.outro = outro;
    return [video];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: '*/*' } }));
    if (response.status === 404) throw new Error('AnimeParadise: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeParadise: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async json(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
    if (response.status === 404) throw new Error('AnimeParadise: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeParadise: HTTP ${response.status}`);
    let data;
    try {
      data = JSON.parse(response.data);
    } catch (e) {
      throw new Error('AnimeParadise returned a page that is not data');
    }
    if (data && data.error === true) throw new Error(`AnimeParadise: ${clean(data.message) || 'error'}`);
    return data;
  }
}

module.exports = { Source };
