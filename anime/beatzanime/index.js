const SITE = 'https://www.beatz-anime.net';
const FILES = 'https://bz.beatz-anime.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const TAGS = [
  ['fuente:bdrip', 'BDRip'],
  ['fuente:webrip', 'WEBRip'],
  ['tipo:serie', 'Serie'],
  ['tipo:pelicula', 'Película'],
  ['estado:finalizado', 'Finalizado'],
  ['estado:en emision', 'En emisión'],
];

const SPECIAL_RE = /\b(?:oad|ova|especiales|especial|peliculas?|películas?|ncopv|ncop|nced)\b/i;

function clean(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function absUrl(href) {
  if (!href) return undefined;
  if (/^https?:\/\//.test(href)) return href;
  return `${SITE}/${String(href).replace(/^\/+/, '')}`;
}

function idOf(href) {
  return String(href || '')
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/+/, '');
}

function posterOf(mangaId) {
  const slug = mangaId.split('/').pop().replace(/\.html$/, '');
  return `${SITE}/img/img-anime/${slug}/${slug}-port.jpg`;
}

function parseEpisodeNumber(name, fallback) {
  const sxx = /[Ss]\d+[Ee](\d+(?:\.\d+)?)/.exec(name);
  if (sxx) return +sxx[1];
  const exx = /\b[Ee](\d+(?:\.\d+)?)\b/.exec(name);
  if (exx) return +exx[1];
  const tail = /(\d+(?:\.\d+)?)\s*$/.exec(name);
  if (tail) return +tail[1];
  return fallback;
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
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    return TAGS.map(([id, label]) => ({ id, label }));
  }

  async getSearchResultsRaw(request, metadata) {
    const query = clean(request && request.title);
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'popular') {
      const $ = cheerio.load(await this.get(`${SITE}/`));
      const seen = new Map();
      $('article.top-views-card').each((i, el) => {
        const card = $(el);
        const anchor = card.find('a.top-views-poster').first();
        const mangaId = idOf(anchor.attr('href'));
        const title = card.find('h3.top-views-title').first().text().trim();
        if (mangaId && title && !seen.has(mangaId)) {
          seen.set(mangaId, {
            mangaId,
            title,
            image: absUrl(anchor.find('img').first().attr('src')) || posterOf(mangaId),
            medium: 'anime',
          });
        }
      });
      return { results: Array.from(seen.values()) };
    }
    if (!query && !tags.length && request && request.feed === 'latest') {
      const url = page > 1 ? `${SITE}/index.php?pagina=${page}` : `${SITE}/`;
      const $ = cheerio.load(await this.get(url));
      const results = $('a.titulo-largo')
        .map((i, el) => {
          const anchor = $(el);
          const mangaId = idOf(anchor.attr('href'));
          const title = anchor.text().trim();
          return mangaId && title ? { mangaId, title, image: posterOf(mangaId), medium: 'anime' } : null;
        })
        .get()
        .filter(Boolean);
      const next = $('ul.pagination > li.active + li:not(.disabled)').length > 0;
      return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
    }
    const $ = cheerio.load(await this.get(`${SITE}/lista-animes/`));
    const all = $('div.anime-card')
      .map((i, el) => {
        const card = $(el);
        const nameAttr = clean(card.attr('data-name'));
        if (query && !nameAttr.includes(query)) return null;
        for (const tag of tags) {
          const [key, val] = String(tag.id || '').split(':');
          if (key && val && clean(card.attr(`data-${key}`)) !== val) return null;
        }
        const anchor = card.find('a.anime-poster-link').first();
        const mangaId = idOf(anchor.attr('href'));
        const title = card.find('span.overlay-title-link').first().text().trim() || (anchor.attr('title') || '').trim();
        if (!mangaId || !title) return null;
        return {
          mangaId,
          title,
          image: absUrl(anchor.find('img.anime-poster').first().attr('src')) || posterOf(mangaId),
          medium: 'anime',
        };
      })
      .get()
      .filter(Boolean);
    const results = all.slice((page - 1) * 24, page * 24);
    return { results, metadata: page * 24 < all.length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE}/${mangaId.replace(/^\/+/, '')}`;
    const $ = cheerio.load(await this.get(url));
    const post = $('p.post-text').first();
    const paragraphs = post
      .contents()
      .toArray()
      .filter((node) => node.type === 'text')
      .map((node) => $(node).text().trim())
      .filter(Boolean);
    let genresText = '';
    post.find('span').each((i, el) => {
      const span = $(el);
      const label = span.find('b').first().text();
      if (/Generos/i.test(label)) genresText = span.clone().children('b').remove().end().text();
      if (/Sin[oó]nimos/i.test(label)) {
        const syn = span.clone().children('b').remove().end().text().trim();
        if (syn) paragraphs.push(`Sinónimos: ${syn}`);
      }
    });
    let stateText = '';
    $('.stat-item').each((i, el) => {
      if (/Estado/i.test($(el).find('h5').text())) stateText = $(el).find('a').text().trim();
    });
    const status = /finalizado/i.test(stateText) ? 'COMPLETED' : /emisi|emsi/i.test(stateText) ? 'ONGOING' : 'UNKNOWN';
    const tags = genresText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: absUrl($('div.poster-card img').first().attr('src')) || posterOf(mangaId),
        desc: paragraphs.join('\n\n') || post.text().trim(),
        status,
        tags,
        webURL: url,
        medium: 'anime',
      },
    };
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
    const url = `${SITE}/${mangaId.replace(/^\/+/, '')}`;
    const $ = cheerio.load(await this.get(url));
    const regular = [];
    const specials = [];
    $('#collapseExampled tbody tr').each((index, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const format = cells.eq(1).text().trim().toLowerCase();
      const kind = cells.eq(2).text().trim().toLowerCase();
      if (kind !== 'video' && format !== 'mkv' && format !== 'mp4') return;
      const href = cells.eq(4).find('a.btn-descarga-premium').attr('href');
      if (!href) return;
      const chapterId = href.replace(/^https?:\/\/[^/]+\/+/, '');
      const rawName = cells.eq(0).text().replace(/\s+/g, ' ').trim() || `Episodio ${index + 1}`;
      const size = cells.eq(3).text().replace(/\s+/g, ' ').trim();
      const num = parseEpisodeNumber(rawName, index + 1);
      const entry = {
        id: chapterId,
        chapterId,
        name: rawName,
        number: num,
        group: size || undefined,
      };
      if (SPECIAL_RE.test(rawName)) specials.push({ ...entry, number: 0 });
      else regular.push(entry);
    });
    regular.sort((a, b) => a.number - b.number);
    specials.sort((a, b) => a.name.localeCompare(b.name));
    return specials.concat(regular).reverse();
  }

  async getVideos(mangaId, chapterId) {
    const videos = await this.getVideosUnnamed(mangaId, chapterId);
    return videos.map((video) => (video.server ? video : Object.assign({}, video, { server: 'Direct' })));
  }

  async getVideosUnnamed(mangaId, chapterId) {
    const url = /^https?:\/\//.test(chapterId) ? chapterId : `${FILES}/${chapterId.replace(/^\/+/, '')}`;
    const res = (/\b(\d{3,4}p)\b/i.exec(decodeURIComponent(url)) || [])[1] || '1080p';
    return [
      {
        url,
        quality: `Direct ${res}`,
        headers: { ...BROWSER, Referer: `${SITE}/` },
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`BeatzAnime: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
