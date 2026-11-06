const SITE = 'https://tvanime.tv';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'MP4Upload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function voeSource(payload) {
  const clean = VOE_MARKERS.reduce((text, marker) => text.split(marker).join(''), rot13(payload));
  const shifted = App.base64Decode(clean).split('').map((ch) => String.fromCharCode(ch.charCodeAt(0) - 3)).join('');
  return JSON.parse(App.base64Decode(shifted.split('').reverse().join(''))).source;
}

function slugOf(href) {
  return (/\/anime\/([^/?#"]+)/.exec(href || '') || [])[1];
}

function episodesOf($) {
  return $('a.episode-card')
    .map((i, el) => {
      const card = $(el);
      const chapterId = (/\/episodio\/([^/?#"]+)/.exec(card.attr('href') || '') || [])[1];
      if (!chapterId) return null;
      const number = +((/([0-9.]+)$/.exec(chapterId) || [])[1] || i + 1);
      const name = card.find('.episode-card-body strong').first().text().trim() || `Episodio ${number}`;
      return { id: chapterId, chapterId, name, number };
    })
    .get()
    .filter(Boolean);
}

function ageFromTags(tags) {
  const list = (Array.isArray(tags) ? tags : []).map((t) => String(t || '')).filter((t) => !/adult cast|elenco adulto/i.test(t));
  if (list.some((t) => /hentai|er[o\u00f3]tic|smut|porn|\+\s?18|18\s?\+|xxx/i.test(t))) return 18;
  if (list.some((t) => /ecchi|adulto|adult|mature|maduro/i.test(t))) return 16;
  return 0;
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
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 8 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'latest', name: 'Latest Episodes' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/directorio`));
    return $('#catalog-genre option')
      .map((i, el) => ({ id: ($(el).attr('value') || '').trim(), label: $(el).text().trim() }))
      .get()
      .filter((tag) => tag.id && tag.label);
  }

  async getSearchResultsRaw(request, metadata) {
    const page = await this.getSearchResultsUnrated(request, metadata);
    const asked = (request && request.includedTags) || [];
    if (asked.length && page && Array.isArray(page.results)) {
      const names = await this.tagNames();
      const age = ageFromTags(asked.map((t) => names[String(t && t.id)] || (t && (t.label || t.id)) || ''));
      if (age) page.results.forEach((r) => (r.ageRating = Math.max(r.ageRating || 0, age)));
    }
    return page;
  }

  async tagNames() {
    if (this.tagNameMap) return this.tagNameMap;
    const map = {};
    try {
      ((await this.getSearchTags()) || []).forEach((t) => {
        if (t && t.id !== undefined) map[String(t.id)] = String(t.label || t.name || t.id);
      });
      this.tagNameMap = map;
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
    }
    return map;
  }

  async getSearchResultsUnrated(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'latest') {
      const $ = cheerio.load(await this.get(SITE));
      const entries = $('a.home-episode-card')
        .map((i, el) => {
          const card = $(el);
          const mangaId = slugOf(card.attr('href'));
          if (!mangaId) return null;
          const img = card.find('img').first();
          const fallback = (/https?:\/\/[^'"]+\/covers\/[^'"]+/.exec(img.attr('onerror') || '') || [])[0];
          const title = card.find('.home-episode-anime').first().text().trim();
          return [[mangaId, { mangaId, title, image: fallback || img.attr('src'), medium: 'anime' }]];
        })
        .get()
        .filter(Boolean);
      return { results: Array.from(new Map(entries).values()) };
    }
    const params = [`page=${page}`];
    if (query) params.unshift(`q=${encodeURIComponent(query)}`);
    else if (tags.length) params.unshift(`genre=${encodeURIComponent(tags[0].id)}`);
    const $ = cheerio.load(await this.get(`${SITE}/directorio?${params.join('&')}`));
    const results = $('article.anime-card')
      .map((i, el) => {
        const card = $(el);
        const mangaId = slugOf(card.find('a').first().attr('href'));
        if (!mangaId) return null;
        return {
          mangaId,
          title: card.find('.anime-card-title').first().text().trim(),
          image: card.find('.anime-card-image img').first().attr('src'),
          medium: 'anime',
        };
      })
      .get()
      .filter(Boolean);
    const next = $('.pagination-current').nextAll('a').length > 0;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const result = await this.getMangaDetailsUnrated(mangaId);
    const info = result && result.mangaInfo;
    if (info && info.ageRating === undefined) {
      const age = ageFromTags(info.tags);
      if (age) info.ageRating = age;
    }
    return result;
  }

  async getMangaDetailsUnrated(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const state = $('.anime-status').first().text();
    const tags = $('.anime-info a[href*="/genero/"]')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1.anime-title').first().text().trim() || mangaId,
        image: $('.anime-poster img').first().attr('src'),
        banner: $('.anime-hero-backdrop').first().attr('src'),
        desc: $('.anime-synopsis').first().text().trim(),
        status: /Finalizado/i.test(state) ? 'COMPLETED' : /emisi/i.test(state) ? 'ONGOING' : 'UNKNOWN',
        tags: Array.from(new Set(tags)),
        webURL: `${SITE}/anime/${mangaId}`,
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
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const pages = $('#episode-range-select option')
      .map((i, el) => +($(el).attr('value') || 0))
      .get()
      .filter((page) => page > 1);
    const rest = await Promise.all(
      pages.map(async (page) => episodesOf(cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/episodes/${page}`))))
    );
    return episodesOf($).concat(...rest).reverse();
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/episodio/${encodeURIComponent(chapterId)}`));
    const servers = $('.watch-server[data-server-url]')
      .map((i, el) => ({
        url: $(el).attr('data-server-url'),
        language: $(el).attr('data-server-language') === 'DUB' ? 'Dub' : 'Sub',
      }))
      .get();
    const found = await Promise.all(servers.map((entry) => this.extract(entry).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, language, ...video }) => ({ ...video, quality: `${server} ${language}`, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`AnimeMovil: none of the ${servers.length} servers gave a playable video`);
    return videos;
  }

  async extract({ url, language }) {
    const host = (/^https?:\/\/([^/]+)/.exec(url || '') || [])[1] || '';
    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', language };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(await this.get(url));
      return { url: src[1], server: 'MP4Upload', language, headers: { Referer: 'https://www.mp4upload.com/' } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeMovil: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
