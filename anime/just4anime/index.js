const API = 'https://api.just4anime.online/api';
const EPISODES = 'https://just4anime.online/api/episodes';
const SITE = 'https://just4anime.online';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 24;
const SERVER_LIMIT_MS = 12000;

const FEEDS = [
  { id: 'popular', name: 'Popular', path: 'popular' },
  { id: 'trending', name: 'Trending', path: 'trending' },
  { id: 'airing', name: 'Airing Now', path: 'top-airing' },
  { id: 'rated', name: 'Top Rated', path: 'top-rated' },
  { id: 'recent', name: 'Latest Episodes', path: 'recent' },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

const SERVERS = [
  { code: 'jin', name: 'Megaplay' },
  { code: 'meg', name: 'Megavid' },
  { code: 'rin', name: 'Zoko' },
  { code: 'levi', name: 'Krussdomi' },
  { code: 'xan', name: 'Xan' },
];

function gridImage(url) {
  return String(url || '').replace('/cover/large/', '/cover/medium/');
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function plain(html) {
  return clean(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

function titleOf(t) {
  return clean((t && (t.romaji || t.english || t.userPreferred || t.native)) || '');
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

function within(limit, promise) {
  return new Promise((resolve, reject) => {
    let done = false;
    setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error('timed out'));
      }
    }, limit);
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
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  card(item) {
    if (!item || !item.id) return null;
    const title = titleOf(item.title);
    if (!title) return null;
    const image = gridImage(clean(item.image || (item.coverImage && (item.coverImage.large || item.coverImage.extraLarge))));
    const out = { mangaId: String(item.id), title, image, medium: 'anime' };
    const count = Number(item.totalEpisodes || item.currentEpisodeCount);
    const bits = [];
    if (Number.isFinite(count) && count > 0) bits.push(`${count} ${count === 1 ? 'episode' : 'episodes'}`);
    if (item.releaseDate) bits.push(String(item.releaseDate));
    if (bits.length) out.summary = bits.join(', ');
    if (Array.isArray(item.genres) && item.genres.some((g) => /^ecchi$/i.test(g))) out.ageRating = 16;
    return out;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;
    const genres = included.map((g) => g && g.id).filter(Boolean);
    let url;
    if (query && !genres.length) url = `${API}/v1/meta/anilist/search?query=${encodeURIComponent(query)}&page=${page}&perPage=${PAGE_SIZE}`;
    else if (query || genres.length) {
      url = `${API}/v1/meta/anilist/advanced-search?type=ANIME&page=${page}&perPage=${PAGE_SIZE}&query=${encodeURIComponent(query)}`;
      if (genres.length) url += `&genres=${encodeURIComponent(JSON.stringify(genres))}`;
    } else if (feed === 'recent') url = `${API}/v1/meta/anilist/recent?page=${page}&perPage=${PAGE_SIZE}&sort=TIME_DESC`;
    else url = `${API}/v1/meta/anilist/${(FEEDS.find((f) => f.id === feed) || FEEDS[0]).path}?page=${page}&perPage=${PAGE_SIZE}`;
    const data = (await this.json(url)).data || {};
    const results = [];
    const seen = new Set();
    const push = (card, extra) => {
      if (!card || seen.has(card.mangaId)) return;
      seen.add(card.mangaId);
      if (extra) card.summary = extra;
      results.push(card);
    };
    if (Array.isArray(data.schedules)) {
      for (const s of data.schedules) {
        const media = s && s.media;
        if (!media || !media.id) continue;
        push(this.card({ id: media.id, title: media.title, coverImage: media.coverImage }), s.episode ? `Episode ${s.episode}` : undefined);
      }
      const p = data.pagination || {};
      return { results, metadata: p.hasMore || p.hasNextPage ? { page: page + 1 } : undefined };
    }
    for (const item of Array.isArray(data.results) ? data.results : []) push(this.card(item));
    return { results, metadata: data.hasNextPage ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const data = (await this.json(`${API}/v1/meta/anilist/info/${encodeURIComponent(mangaId)}`)).data || {};
    const a = data.anilist;
    if (!a || !a.id) throw new Error('Just4Anime: title not found');
    const genres = (Array.isArray(a.genres) ? a.genres : []).filter((g) => typeof g === 'string' && g.trim());
    const status = String(a.status || '').toLowerCase();
    const info = {
      title: titleOf(a.title),
      image: clean(a.image),
      banner: /^https?:\/\//.test(String(a.cover || '')) ? a.cover : undefined,
      desc: plain(a.description) || undefined,
      author: clean([a.season, a.releaseDate || a.year].filter(Boolean).join(' ')) || undefined,
      status: /finish|complete/.test(status) ? 'COMPLETED' : /ongoing|releas|airing/.test(status) ? 'ONGOING' : /cancel/.test(status) ? 'CANCELLED' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/anime/${a.id}`,
      medium: 'anime',
    };
    const english = a.title && a.title.english ? clean(a.title.english) : '';
    if (english && english !== info.title) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Also known as: ${english}`;
    if (a.isAdult === true) info.ageRating = 18;
    else if (genres.some((g) => /^ecchi$/i.test(g))) info.ageRating = 16;
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
    const data = await this.json(`${EPISODES}/${encodeURIComponent(mangaId)}`);
    const list = (data && data.data && data.data.episodes) || [];
    const rows = [];
    const seen = new Set();
    for (const e of Array.isArray(list) ? list : []) {
      const number = Number(e && e.number);
      if (!Number.isFinite(number) || seen.has(number) || e.hasAired === false) continue;
      seen.add(number);
      const title = clean(e.title);
      const row = { id: String(number), chapterId: String(number), name: title ? `Episode ${number}: ${title}` : `Episode ${number}`, number };
      if (title) row.title = title;
      if (/^https?:\/\//.test(String(e.image || ''))) row.thumbnail = String(e.image);
      if (clean(e.description)) row.summary = clean(e.description);
      const t = Date.parse(String(e.airDate || ''));
      if (Number.isFinite(t)) row.time = t;
      const minutes = Number(e.duration);
      if (Number.isFinite(minutes) && minutes > 0) row.duration = Math.round(minutes * 60);
      rows.push(row);
    }
    if (!rows.length) throw new Error('Just4Anime has no episodes for this title yet');
    rows.sort((a, b) => b.number - a.number);
    return rows;
  }

  async stream(mangaId, number, server, kind) {
    const url = `${API}/v1/meta/sources/${encodeURIComponent(mangaId)}?provider=${server.code}&num=${encodeURIComponent(number)}&type=${kind}`;
    const data = (await this.json(url)).data || {};
    const source = (Array.isArray(data.sources) ? data.sources : []).find((s) => s && /^https?:\/\//.test(String(s.url || '')));
    if (!source) throw new Error('no stream');
    const subtitles = [];
    const used = new Set();
    for (const t of Array.isArray(data.subtitles) ? data.subtitles : []) {
      if (!t || !/^https?:\/\//.test(String(t.url || ''))) continue;
      const name = clean(t.language || t.lang) || 'Subtitles';
      const base = name.replace(/\s*\(.*$/, '') || name;
      let label = base;
      for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
      used.add(label.toLowerCase());
      const code = clean(t.lang);
      subtitles.push({ url: t.url, label, language: /^[a-z]{2,3}$/i.test(code) ? code.toLowerCase() : name, format: 'vtt' });
    }
    const ordered = subtitles.filter((s) => s.language === 'en').concat(subtitles.filter((s) => s.language !== 'en'));
    return { source, subtitles: ordered, intro: span(data.intro), outro: span(data.outro) };
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const number = String(chapterId);
    const jobs = [];
    for (const server of SERVERS) {
      for (const kind of ['sub', 'dub']) {
        if (server.code === 'levi' && kind === 'dub') continue;
        jobs.push(within(SERVER_LIMIT_MS, this.stream(mangaId, number, server, kind)).then((r) => ({ server, kind, r }), (error) => ({ server, kind, error })));
      }
    }
    const answers = await Promise.all(jobs);
    const videos = [];
    const taken = new Set();
    for (const a of answers) {
      if (!a.r || taken.has(a.r.source.url)) continue;
      taken.add(a.r.source.url);
      const { source, subtitles, intro, outro } = a.r;
      const shown = subtitles.slice(0, 3).map((t) => t.label);
      const quality = a.kind === 'dub' ? 'Auto, English Dub' : subtitles.length ? `Auto, Softsub: ${shown.join(', ')}${subtitles.length > 3 ? ` and ${subtitles.length - 3} more` : ''}` : 'Auto, Sub';
      const video = { url: source.url, quality, type: 'hls', server: a.server.name };
      if (subtitles.length) video.subtitles = subtitles;
      if (intro) video.intro = intro;
      if (outro) video.outro = outro;
      videos.push(video);
    }
    if (!videos.length) throw new Error('Just4Anime has no stream for this episode yet. A new episode can take a few hours, try again later.');
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
    if (response.status === 404) throw new Error('Just4Anime: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Just4Anime: HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('Just4Anime returned a page that is not data');
    }
  }
}

module.exports = { Source };
