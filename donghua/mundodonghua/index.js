const SITE = 'https://www.mundodonghua.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'VidHide', 'StreamWish'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  'Acción',
  'Artes Marciales',
  'Aventura',
  'Ciencia Ficción',
  'Comedia',
  'Comida',
  'Cultivación',
  'Demonios',
  'Deportes',
  'Drama',
  'Ecchi',
  'Escolar',
  'Fantasía',
  'Harem',
  'Harem Inverso',
  'Historico',
  'Idols',
  'Juegos',
  'Lucha',
  'Magia',
  'Mechas',
  'Militar',
  'Misterio',
  'Música',
  'Psicológico',
  'Reencarnación',
  'Romance',
  'Seinen',
  'Shojo',
  'Shonen',
  'Sobrenatural',
  'Sucesos de la Vida',
  'Superpoderes',
  'Suspenso',
  'Terror',
  'Vampiros',
  'Viaje a Otro Mundo',
  'Videojuegos',
  'Zombis',
];

function absUrl(href) {
  if (!href) return undefined;
  if (/^https?:\/\//.test(href)) return href;
  return `${SITE}/${String(href).replace(/^\/+/, '')}`;
}

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

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

function cardsOf($, kind) {
  return $('div.md-card-grid > div.md-card > a')
    .map((i, el) => {
      const card = $(el);
      const href = card.attr('href') || '';
      const mangaId = kind === 'ver' ? (/\/ver\/([^/?#]+)\//.exec(href) || [])[1] : (/\/donghua\/([^/?#]+)/.exec(href) || [])[1];
      if (!mangaId) return null;
      const rawTitle = card.find('.md-card-title').first().text().trim();
      const title = kind === 'ver' ? rawTitle.replace(/\s+Episodio\s+[\d.]+$/i, '').trim() : rawTitle;
      const image = absUrl(card.find('div.md-card-img img').first().attr('src'));
      return { mangaId, title, image, medium: 'anime' };
    })
    .get()
    .filter(Boolean);
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
      { id: 'airing', name: 'Airing' },
      { id: 'latest', name: 'Latest Episodes' },
    ];
  }

  async getSearchTags() {
    return GENRES.map((genre) => ({ id: genre, label: genre }));
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const $ = cheerio.load(await this.get(`${SITE}/busquedas/${encodeURIComponent(query)}`));
      return { results: cardsOf($, 'donghua') };
    }
    if (tags.length) {
      const $ = cheerio.load(await this.get(`${SITE}/genero/${encodeURIComponent(tags[0].id)}`));
      return { results: cardsOf($, 'donghua') };
    }
    if (request && request.feed === 'latest') {
      const $ = cheerio.load(await this.get(`${SITE}/lista-episodios/${page}`));
      const entries = cardsOf($, 'ver').map((item) => [item.mangaId, item]);
      const results = Array.from(new Map(entries).values());
      const next = $('nav.md-pagination > span.active').nextAll('a').length > 0;
      return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
    }
    const section = request && request.feed === 'airing' ? 'lista-donghuas-emision' : 'lista-donghuas';
    const $ = cheerio.load(await this.get(`${SITE}/${section}/${page}`));
    const results = cardsOf($, 'donghua');
    const next = $('nav.md-pagination > span.active').nextAll('a').length > 0;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE}/donghua/${encodeURIComponent(mangaId)}`;
    const $ = cheerio.load(await this.get(url));
    const badge = $('span.md-emision-badge').first().text();
    const status = /Finalizad/i.test(badge)
      ? 'COMPLETED'
      : /Emisi/i.test(badge)
        ? 'ONGOING'
        : /Cancelad/i.test(badge)
          ? 'CANCELLED'
          : /Pausad/i.test(badge)
            ? 'HIATUS'
            : 'UNKNOWN';
    const tags = $('a.md-genre-tag')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1.md-detail-title').first().text().trim() || mangaId,
        image: absUrl($('div.md-detail-poster img').first().attr('src')),
        desc: $('p.md-detail-synopsis').first().text().trim(),
        status,
        tags,
        webURL: url,
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
    const $ = cheerio.load(await this.get(`${SITE}/donghua/${encodeURIComponent(mangaId)}`));
    return $('ul.md-episode-list li.md-episode-item a.md-ep-link')
      .map((i, el) => {
        const href = ($(el).attr('href') || '').replace(/\/+$/, '');
        const chapterId = href.split('/').pop();
        if (!chapterId) return null;
        const number = Number.isFinite(+chapterId) ? +chapterId : i + 1;
        return {
          id: chapterId,
          chapterId,
          name: `Episodio ${chapterId.replace(/\.0$/, '')}`,
          number,
        };
      })
      .get()
      .filter(Boolean);
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const pageUrl = `${SITE}/ver/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.get(pageUrl);
    const chunks = html.split('eval(function(p,a,c,k,e').slice(1);
    const code = chunks.map((chunk) => unpack(chunk)).join('\n');
    const urls = [];
    for (const match of code.matchAll(/https?:\/\/[\w.-]+[\w.,@?^=%&:/~+#-]*/g)) {
      const candidate = match[0].replace(/\\+$/, '');
      if (/(voe\.sx|vidhide|embedwish|streamwish)/.test(candidate)) urls.push(candidate);
    }
    const found = await Promise.all(Array.from(new Set(urls)).map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...BROWSER, ...video.headers } }));

    const extras = [];
    for (const block of code.matchAll(/\$\("#(\w+)"\)\.click\(function\(e\)\{[\s\S]*?url:"([^"]+)",data:\{"slug":"([^"]+)"\}[\s\S]*?\.attr\("src","([^"]+)"\+json\[id\]\["url"\]\)/g)) {
      try {
        const answer = await this.get(`${SITE}${block[2]}?slug=${encodeURIComponent(block[3])}`, { Referer: pageUrl, 'X-Requested-With': 'XMLHttpRequest' });
        const list = JSON.parse(answer);
        const first = Array.isArray(list) ? list[0] : Object.values(list || {})[0];
        if (first && first.url) {
          const name = block[1].replace(/play$/, '');
          extras.push({ url: block[4] + first.url, type: 'embed', quality: name.charAt(0).toUpperCase() + name.slice(1), server: name.charAt(0).toUpperCase() + name.slice(1) });
        }
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
      }
    }
    const asura = /asura_player"\)[\s\S]{0,300}?file:"(https?:[^"]+)"/.exec(code);
    if (asura) extras.push({ url: asura[1], quality: 'Asura', server: 'Asura', headers: { ...BROWSER, Referer: `${SITE}/` } });
    const taken = new Set(found.filter(Boolean).map((v) => v.quality));
    for (const match of code.matchAll(/<iframe src=\\?'(https?:\/\/[^'\\]+)/g)) {
      const host = (/^https?:\/\/([^/]+)/.exec(match[1]) || [])[1] || '';
      const name = host.replace(/^www\./, '');
      if (extras.some((e) => e.url === match[1]) || videos.length && /(voe\.sx|vidhide|embedwish|streamwish)/.test(host) && taken.size) continue;
      extras.push({ url: match[1], type: 'embed', quality: name, server: name });
    }
    const all = videos.concat(extras);
    if (!all.length) throw new Error(`MundoDonghua: none of the ${urls.length} servers gave a playable video`);
    return all;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
    }
    if (/(vidhide|embedwish|streamwish)/.test(host)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      if (!hls) return null;
      const stream = hls[1].replace(/\\\//g, '/');
      return {
        url: stream.startsWith('/') ? `https://${host}${stream}` : stream,
        quality: /vidhide/.test(host) ? 'VidHide' : 'StreamWish',
        headers: { Referer: origin },
      };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, extraHeaders) {
    const response = await this.requests.schedule(
      App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER, ...extraHeaders } })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`MundoDonghua: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
