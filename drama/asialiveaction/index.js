const SITE = 'https://asialiveaction.com';
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

const GENRES = [
  ['accion', 'Acción'],
  ['adulto', 'Adulto'],
  ['animacion', 'Animación'],
  ['aventura', 'Aventura'],
  ['ciencia-ficcion', 'Ciencia Ficción'],
  ['comedia', 'Comedia'],
  ['documental', 'Documental'],
  ['drama', 'Drama'],
  ['fantasia', 'Fantasía'],
  ['misterio', 'Misterio'],
  ['romance', 'Romance'],
  ['suspenso', 'Suspenso'],
  ['terror', 'Terror'],
  ['tokusatsu', 'Tokusatsu'],
];

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
    this.requests = App.createRequestManager({
      rateLimit: { requestsPerSecond: 4 },
    });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Todos' },
      { id: 'series', name: 'Series' },
      { id: 'peliculas', name: 'Películas' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResultsRaw(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'popular';

    const tag = tags[0] && (typeof tags[0] === 'string' ? tags[0] : tags[0].id);

    let url = '';
    if (query) {
      url = `${SITE}/search/${encodeURIComponent(query)}/${page > 1 ? `?pagina=${page}` : ''}`;
    } else if (tag) {
      url = `${SITE}/navegacion/?genero%5B%5D=${encodeURIComponent(tag)}&pagina=${page}`;
    } else if (feed === 'series') {
      url = `${SITE}/navegacion/?tipo%5B%5D=series&pagina=${page}`;
    } else if (feed === 'peliculas') {
      url = `${SITE}/navegacion/?tipo%5B%5D=peliculas&pagina=${page}`;
    } else {
      url = `${SITE}/navegacion/?pagina=${page}`;
    }

    const html = await this.get(url).catch(() => '');
    if (!html) return { results: [] };

    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    $('ul.navegacion-grid li').each((_, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href');
      if (!href) return;
      const title = $(el).find('.carousel-title').first().text().trim();
      const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';
      const match = href.match(/asialiveaction\.com\/(tv\/[^/]+|pelicula\/[^/]+)/);
      const mangaId = match ? match[1] : href.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
      if (mangaId && title && !seen.has(mangaId)) {
        seen.add(mangaId);
        results.push({
          mangaId,
          title,
          image: img,
        });
      }
    });

    const hasNext = Boolean($('div.paginado a[href*="pagina="]').length);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE}/${mangaId.replace(/^\//, '')}/`;
    const html = await this.get(url);
    const $ = cheerio.load(html);

    const title = $('h2.Title').first().text().trim() || $('title').text().replace(/– Asia Live Action.*/, '').trim();
    const image = $('meta[property="og:image"]').attr('content') || $('article img').first().attr('src') || '';
    const desc = $('article p').first().text().trim() || $('meta[name="description"]').attr('content') || undefined;

    const genres = [];
    $('footer a.genero, footer a.tag').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    let status = 'ONGOING';
    const infoText = $('.categorias').text();
    if (/Finalizado/i.test(infoText) || /Pel[ií]cula/i.test(infoText)) {
      status = 'COMPLETED';
    }

    return {
      mangaInfo: {
        title,
        image,
        desc,
        summary: desc,
        genres: genres.length ? genres : undefined,
        status,
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
    const url = `${SITE}/${mangaId.replace(/^\//, '')}/`;
    const html = await this.get(url);
    const $ = cheerio.load(html);

    const chapters = [];
    const seen = new Set();

    $('div.lista-episodios a[href*="/e/"], div.lista-episodios a[href*="/f/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const match = href.match(/asialiveaction\.com\/([ef]\/[^/]+\/[^/]+(?:\/[^/]+)?)/);
      const chapterId = match ? match[1] : href.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      let name = $(el).find('.numero-episodio').text().trim() || $(el).text().trim() || `Episodio ${i + 1}`;
      const numMatch = name.match(/(\d+(?:\.\d+)?)/);
      const number = numMatch ? parseFloat(numMatch[1]) : i + 1;

      chapters.push({
        id: chapterId,
        chapterId,
        name,
        number,
      });
    });

    if (!chapters.length) {
      chapters.push({
        id: `${mangaId}/single`,
        chapterId: `${mangaId}/single`,
        name: 'Película',
        number: 1,
      });
    }

    return chapters;
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const pageUrl = (chapterId && chapterId.endsWith('/single'))
      ? `${SITE}/${mangaId.replace(/^\//, '')}/`
      : /^https?:\/\//.test(chapterId)
      ? chapterId
      : `${SITE}/${(chapterId || '').replace(/^\//, '')}/`;

    const html = await this.get(pageUrl);

    const match = /var\s+allVideos\s*=\s*(\{[\s\S]*?\});/.exec(html);
    const serverEntries = [];

    if (match) {
      try {
        const allVideos = JSON.parse(match[1]);
        for (const key of Object.keys(allVideos)) {
          const list = allVideos[key];
          if (Array.isArray(list)) {
            for (const item of list) {
              if (Array.isArray(item) && item[1]) {
                const sUrl = String(item[1]).replace(/\\\//g, '/');
                serverEntries.push({ label: item[0] || 'Server', url: sUrl });
              }
            }
          }
        }
      } catch (err) {}
    }

    const resolved = await Promise.all(
      serverEntries.map(async (entry) => {
        try {
          return await this.extract(entry.url);
        } catch {
          return null;
        }
      })
    );

    const videos = resolved.filter((v) => v && v.url).map((v) => Object.assign({}, v, { server: v.server || v.quality }));
    const seen = new Set();
    const embeds = serverEntries
      .filter((entry, i) => !(resolved[i] && resolved[i].url) && /^https?:\/\//.test(entry.url) && !seen.has(entry.url) && seen.add(entry.url))
      .map((entry) => ({ url: entry.url, type: 'embed', quality: entry.label, server: String(entry.label).trim() || 'Server' }));
    if (!videos.length && !embeds.length) {
      throw new Error(`AsiaLiveAction: none of the ${serverEntries.length} servers gave a playable video`);
    }

    return videos.concat(embeds);
  }

  async extract(rawUrl) {
    const url = rawUrl.replace(/^http:/, 'https:');
    if (/vidmoly\.(org|to|net|me)/.test(url)) {
      const page = await this.get(url, { Referer: `${SITE}/` });
      const m3u8Match = /sources:\s*\[\{\s*file:\s*['"]([^'"]+)['"]/.exec(page) ||
                        /file:\s*['"](https:\/\/[^'"]+\.m3u8[^'"]*)['"]/.exec(page);
      if (m3u8Match) {
        return {
          url: m3u8Match[1],
          originalUrl: m3u8Match[1],
          quality: 'Vidmoly',
          headers: { ...BROWSER, Referer: 'https://vidmoly.org/' },
        };
      }
    }

    if (/ok\.ru/.test(url)) {
      const page = await this.get(url, { Referer: `${SITE}/` });
      const match = /data-options="([^"]+)"/.exec(page);
      if (match) {
        const unescaped = match[1].replace(/&quot;/g, '"');
        const data = JSON.parse(unescaped);
        const raw = data.flashvars ? data.flashvars.metadata : null;
        const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const streamUrl = meta ? (meta.hlsManifestUrl || meta.ondemandHls || (meta.videos && meta.videos[0] && meta.videos[0].url)) : null;
        if (streamUrl) {
          return {
            url: streamUrl,
            originalUrl: streamUrl,
            quality: 'OK.ru',
            headers: { ...BROWSER, Referer: 'https://ok.ru/' },
          };
        }
      }
    }

    if (/streamtape\.com/.test(url)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const tape = /getElementById\('robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/.exec(html);
      if (tape) {
        const finalUrl = `https://streamtape.com/${tape[1].slice(+tape[2] + (+tape[3] || 0))}&stream=1`;
        return {
          url: finalUrl,
          originalUrl: finalUrl,
          quality: 'Streamtape',
          headers: { ...BROWSER, Referer: 'https://streamtape.com/' },
        };
      }
    }

    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers = {}) {
    const res = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: { ...BROWSER, Accept: 'text/html', ...headers },
      })
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AsiaLiveAction: HTTP ${res.status} from ${url}`);
    }
    return String(res.data);
  }
}

module.exports = { Source };
