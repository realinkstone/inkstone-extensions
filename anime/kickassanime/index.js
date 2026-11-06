const SITE = 'https://kaa.lt';
const PLAYER_REFERER = 'https://krussdomi.com/';

function imageOf(picture, kind) {
  if (!picture || !picture.hq) return undefined;
  const format = Array.isArray(picture.formats) && picture.formats.indexOf('webp') !== -1 ? 'webp' : 'jpg';
  return `${SITE}/image/${kind}/${picture.hq}.${format}`;
}

function statusOf(status) {
  const s = String(status || '').toLowerCase();
  if (s.indexOf('airing') !== -1 || s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('finished') !== -1 || s.indexOf('complete') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function titleOf(show) {
  return show.title_en || show.title || show.title_original || show.slug;
}

function toTitle(show) {
  return {
    mangaId: show.slug,
    title: titleOf(show),
    image: imageOf(show.poster, 'poster'),
    status: statusOf(show.status),
    tags: Array.isArray(show.genres) ? show.genres : [],
    medium: 'anime',
  };
}

function absolute(url) {
  const text = String(url || '').trim();
  if (/^https?:\/\/\/+/i.test(text)) return text.replace(/^(https?:)\/\/\/+/i, '$1//');
  if (text.startsWith('//')) return 'https:' + text;
  return text;
}

function htmlDecode(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function revive(value) {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
    const inner = value[1];
    if (value[0] === 1 && Array.isArray(inner)) return inner.map(revive);
    return revive(inner);
  }
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = revive(value[key]);
    return out;
  }
  return value;
}

function playerProps(html) {
  const pattern = /props="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(html))) {
    const text = htmlDecode(match[1]);
    if (text.indexOf('"manifest"') === -1) continue;
    try {
      return revive(JSON.parse(text));
    } catch (e) {
    }
  }
  return null;
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
    return [{ id: 'latest', name: 'Latest' }];
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const json = query
      ? await this.json(`${SITE}/api/fsearch`, { method: 'POST', body: JSON.stringify({ query, page }) })
      : await this.json(`${SITE}/api/anime?page=${page}`);
    const shows = Array.isArray(json && json.result) ? json.result : [];
    const last = (json && json.maxPage) || page;
    return {
      results: shows.map(toTitle),
      metadata: page < last && shows.length ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const show = await this.json(`${SITE}/api/show/${encodeURIComponent(mangaId)}`);
    return {
      mangaInfo: {
        title: titleOf(show),
        image: imageOf(show.poster, 'poster'),
        banner: imageOf(show.banner, 'banner'),
        desc: String(show.synopsis || '').trim(),
        status: statusOf(show.status),
        tags: Array.isArray(show.genres) ? show.genres : [],
        webURL: `${SITE}/${mangaId}`,
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
    const base = `${SITE}/api/show/${encodeURIComponent(mangaId)}`;
    const languages = await this.json(`${base}/language`).catch(() => null);
    const list = languages && Array.isArray(languages.result) ? languages.result : [];
    const lang = list.indexOf('ja-JP') !== -1 ? 'ja-JP' : list[0] || 'ja-JP';
    const first = await this.json(`${base}/episodes?page=1&lang=${encodeURIComponent(lang)}`);
    const pageCount = Array.isArray(first.pages) ? first.pages.length : 1;
    const rest = [];
    for (let page = 2; page <= pageCount; page++) {
      rest.push(this.json(`${base}/episodes?page=${page}&lang=${encodeURIComponent(lang)}`));
    }
    const pages = [first].concat(await Promise.all(rest));
    const seen = new Set();
    const episodes = [];
    for (const page of pages) {
      for (const ep of Array.isArray(page.result) ? page.result : []) {
        const id = `ep-${ep.episode_string || ep.episode_number}-${ep.slug}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const number = Number(ep.episode_number);
        const label = ep.episode_string || ep.episode_number;
        episodes.push({
          id,
          chapterId: id,
          name: ep.title ? `Episode ${label}: ${ep.title}` : `Episode ${label}`,
          number: Number.isFinite(number) ? number : undefined,
          language: lang.slice(0, 2),
        });
      }
    }
    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const episode = await this.json(`${SITE}/api/show/${encodeURIComponent(mangaId)}/episode/${encodeURIComponent(chapterId)}`);
    const servers = Array.isArray(episode.servers) ? episode.servers : [];
    if (!servers.length) throw new Error('KickAssAnime lists this episode with no server, so the site has no stream for it');
    const videos = [];
    for (const server of servers) {
      if (!server || !server.src) continue;
      try {
        const page = await this.text(absolute(server.src), { Referer: `${SITE}/` });
        const props = playerProps(page);
        if (!props || !props.manifest) continue;
        const subtitles = (Array.isArray(props.subtitles) ? props.subtitles : [])
          .filter((s) => s && s.src)
          .map((s) => ({ url: absolute(s.src), label: s.name || s.language || 'Subtitles', language: s.language }));
        const manifest = absolute(props.manifest);
        const kind = /\.mpd(?:[?#]|$)/i.test(manifest) ? 'dash' : /\.m3u8(?:[?#]|$)/i.test(manifest) ? 'hls' : undefined;
        videos.push({
          url: manifest,
          ...(kind ? { type: kind } : {}),
          quality: server.name || 'Auto',
          server: server.name || 'KickAssAnime',
          headers: { Referer: PLAYER_REFERER, Origin: PLAYER_REFERER.replace(/\/$/, '') },
          subtitles,
        });
      } catch (e) {
      }
    }
    if (!videos.length) throw new Error(`KickAssAnime: none of this episode's ${servers.length} servers gave a video`);
    return videos.some((v) => v.type === 'hls') ? videos.filter((v) => v.type !== 'dash') : videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url, headers) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: headers || {} }));
    if (response.status < 200 || response.status >= 300) throw new Error(`KickAssAnime: HTTP ${response.status}`);
    return String(response.data);
  }

  async json(url, options) {
    const method = (options && options.method) || 'GET';
    const body = options && options.body;
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await this.requests.schedule(App.createRequest({ url, method, headers, body }));
    if (response.status < 200 || response.status >= 300) throw new Error(`KickAssAnime: HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
