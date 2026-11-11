const SITE = 'https://nekomiru.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://megaplay.buzz/';

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'new', name: 'Newest' },
  { id: 'airing', name: 'Airing Now' },
  { id: 'movies', name: 'Movies' },
];

const LANGUAGES = { english: 'en', arabic: 'ar', chinese: 'zh', danish: 'da', dutch: 'nl', finnish: 'fi', french: 'fr', german: 'de', hebrew: 'he', hindi: 'hi', indonesian: 'id', italian: 'it', japanese: 'ja', korean: 'ko', malay: 'ms', norwegian: 'no', polish: 'pl', portuguese: 'pt', russian: 'ru', spanish: 'es', swedish: 'sv', thai: 'th', turkish: 'tr', ukrainian: 'uk', vietnamese: 'vi', greek: 'el', czech: 'cs', romanian: 'ro', hungarian: 'hu' };

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function titleOf(t) {
  return clean((t && (t.romaji || t.english || t.native)) || '');
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
    this.episodes = new Map();
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
    const out = { mangaId: String(item.id), title, image: clean(item.coverImage && item.coverImage.large), medium: 'anime' };
    const count = Number(item.episodes);
    const bits = [];
    if (Number.isFinite(count) && count > 0) bits.push(`${count} ${count === 1 ? 'episode' : 'episodes'}`);
    if (item.seasonYear) bits.push(String(item.seasonYear));
    if (bits.length) out.summary = bits.join(', ');
    return out;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;
    let url = `${SITE}/api/anime/search?page=${page}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    else if (feed === 'new') url += '&sort=START_DATE_DESC';
    else if (feed === 'airing') url += '&status=RELEASING&sort=POPULARITY_DESC';
    else if (feed === 'movies') url += '&format=MOVIE&sort=POPULARITY_DESC';
    else url += '&sort=POPULARITY_DESC';
    for (const g of included) if (g && g.id) url += `&genre=${encodeURIComponent(String(g.id))}`;
    const data = await this.json(url);
    const results = [];
    const seen = new Set();
    for (const item of Array.isArray(data.results) ? data.results : []) {
      const card = this.card(item);
      if (!card || seen.has(card.mangaId)) continue;
      seen.add(card.mangaId);
      results.push(card);
    }
    return { results, metadata: data.hasNextPage ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const data = await this.json(`${SITE}/api/anime/info?id=${encodeURIComponent(mangaId)}`);
    const a = data && data.data && data.data.anime;
    if (!a || !a.id) throw new Error('Nekomiru: title not found');
    const genres = (Array.isArray(a.genres) ? a.genres : []).filter((g) => typeof g === 'string' && g.trim());
    const status = String(a.status || '').toUpperCase();
    const info = {
      title: titleOf(a.title),
      image: clean(a.coverImage && a.coverImage.large),
      banner: /^https?:\/\//.test(String(a.bannerImage || '')) ? a.bannerImage : undefined,
      desc: plain(a.description) || undefined,
      author: [a.season ? `${String(a.season).charAt(0)}${String(a.season).slice(1).toLowerCase()}` : '', a.seasonYear || ''].filter(Boolean).join(' ') || undefined,
      status: status === 'FINISHED' ? 'COMPLETED' : status === 'RELEASING' ? 'ONGOING' : status === 'CANCELLED' ? 'CANCELLED' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/anime/${a.id}`,
      medium: 'anime',
    };
    const english = a.title && a.title.english ? clean(a.title.english) : '';
    if (english && english !== info.title) info.desc = `${info.desc || ''}${info.desc ? '\n\n' : ''}Also known as: ${english}`;
    if (genres.some((g) => /^ecchi$/i.test(g))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async episodesOf(mangaId) {
    const hit = this.episodes.get(mangaId);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit;
    let data = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      data = await this.json(`${SITE}/api/anivexa/episodes/anikoto/${encodeURIComponent(mangaId)}?map=false${attempt ? `&r=${attempt}` : ''}`);
      if (!(data && data.anikoto && data.anikoto.error)) break;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 600));
    }
    if (data && data.anikoto && data.anikoto.error) throw new Error(`Nekomiru: ${clean(String(data.anikoto.error)).slice(0, 120)}`);
    const lists = (data && data.anikoto && data.anikoto.episodes) || {};
    const sub = Array.isArray(lists.sub) ? lists.sub : [];
    const dub = Array.isArray(lists.dub) ? lists.dub : [];
    const entry = { at: Date.now(), sub, dub, dubNumbers: new Set(dub.map((e) => String(e.number))) };
    this.episodes.set(mangaId, entry);
    return entry;
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
    const { sub, dub } = await this.episodesOf(mangaId);
    const list = sub.length ? sub : dub;
    const rows = [];
    const seen = new Set();
    for (const e of list) {
      const number = Number(e && e.number);
      if (!Number.isFinite(number) || seen.has(number)) continue;
      seen.add(number);
      const title = clean(e.title);
      const row = { id: String(number), chapterId: String(number), name: title ? `Episode ${number}: ${title}` : `Episode ${number}`, number };
      if (title) row.title = title;
      if (/^https?:\/\//.test(String(e.image || ''))) row.thumbnail = String(e.image);
      if (clean(e.description)) row.summary = clean(e.description);
      const t = Date.parse(String(e.airDate || ''));
      if (Number.isFinite(t)) row.time = t;
      rows.push(row);
    }
    if (!rows.length) throw new Error('Nekomiru has no episodes for this title yet');
    rows.sort((a, b) => b.number - a.number);
    return rows;
  }

  async audio(mangaId, number, kind) {
    try {
      return await this.json(`${SITE}/api/anivexa/watch/anikoto/${encodeURIComponent(mangaId)}/${kind}/anikoto-${encodeURIComponent(number)}`);
    } catch (e) {
      if (kind === 'sub') throw e;
      return null;
    }
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const number = String(chapterId);
    let dubKnown = true;
    try {
      dubKnown = (await this.episodesOf(mangaId)).dubNumbers.has(number);
    } catch (e) {
      dubKnown = true;
    }
    const [sub, dub] = await Promise.all([this.audio(mangaId, number, 'sub').catch((e) => ({ __error: e })), dubKnown ? this.audio(mangaId, number, 'dub') : Promise.resolve(null)]);
    const videos = [];
    const taken = new Set();
    const add = (data, kind) => {
      if (!data || data.__error || !Array.isArray(data.streams)) return;
      const subs = this.subtitlesOf(data);
      for (const s of data.streams) {
        if (!s || s.type !== 'hls' || !/^https?:\/\//.test(String(s.url || '')) || taken.has(s.url)) continue;
        taken.add(s.url);
        const shown = subs.slice(0, 3).map((t) => t.label);
        const label = kind === 'dub' ? 'Auto, English Dub' : `Auto, Softsub${shown.length ? `: ${shown.join(', ')}${subs.length > 3 ? ` and ${subs.length - 3} more` : ''}` : ''}`;
        const video = { url: s.url, quality: label, type: 'hls', server: clean(s.server) || 'Nekomiru', headers: { Referer: clean(s.referer) || REFERER } };
        if (subs.length) video.subtitles = subs;
        const intro = span(s.intro);
        const outro = span(s.outro);
        if (intro) video.intro = intro;
        if (outro) video.outro = outro;
        videos.push(video);
      }
    };
    add(sub, 'sub');
    add(dub, 'dub');
    if (!videos.length) {
      if (sub && sub.__error) throw sub.__error;
      throw new Error('Nekomiru has no stream for this episode yet');
    }
    return videos;
  }

  subtitlesOf(data) {
    const list = (Array.isArray(data.subtitles) ? data.subtitles : []).filter((t) => t && /^https?:\/\//.test(clean(t.proxyUrl || t.url)));
    const server = list.length ? list[0].source : '';
    const out = [];
    const seen = new Set();
    for (const t of list) {
      if (t.source !== server) continue;
      const raw = clean(t.label) || 'Subtitles';
      const base = clean(raw.split(' (')[0].replace(/^[-\s]+/, '')) || raw;
      const qualifier = (/(Brazilian|Castilian|Latin American|European|Simplified|Traditional|SDH|Crunchyroll)/i.exec(raw) || [])[1];
      const named = qualifier && qualifier.toLowerCase() !== base.toLowerCase() ? `${base} (${qualifier})` : base;
      let label = named;
      for (let n = 2; seen.has(label.toLowerCase()); n++) label = `${named} ${n}`;
      seen.add(label.toLowerCase());
      out.push({ url: clean(t.proxyUrl || t.url), label, language: LANGUAGES[base.toLowerCase()] || base, format: 'vtt' });
    }
    return out.filter((t) => t.language === 'en').concat(out.filter((t) => t.language !== 'en'));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
    if (response.status === 404) throw new Error('Nekomiru: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Nekomiru: HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('Nekomiru returned a page that is not data');
    }
  }
}

module.exports = { Source };
