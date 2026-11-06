const SITE = 'https://www.anime-jl.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'OK.ru', 'VidHide', 'StreamWish', 'MixDrop', 'StreamTape', 'Uqload', 'YourUpload', 'Mp4Upload', 'Sendvid'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['1', 'Acción'], ['2', 'Artes Marciales'], ['3', 'Aventuras'], ['33', 'Ciencia Ficción'],
  ['9', 'Comedia'], ['71', 'Cultivación'], ['40', 'Demencia'], ['42', 'Demonios'],
  ['27', 'Deportes'], ['50', 'Donghua'], ['10', 'Drama'], ['25', 'Ecchi'],
  ['22', 'Escolares'], ['48', 'Espacial'], ['6', 'Fantasia'], ['67', 'Gore'],
  ['32', 'Harem'], ['31', 'Hentai'], ['43', 'Historico'], ['39', 'Horror'],
  ['45', 'Isekai'], ['70', 'Josei'], ['11', 'Juegos'], ['46', 'Latino / Castellano'],
  ['38', 'Magia'], ['41', 'Mecha'], ['44', 'Militar'], ['26', 'Misterio'],
  ['73', 'Mitología'], ['28', 'Musica'], ['13', 'Parodia'], ['51', 'Policía'],
  ['29', 'Psicologico'], ['23', 'Recuentos de la vida'], ['72', 'Reencarnación'], ['12', 'Romance'],
  ['69', 'Samurai'], ['24', 'Seinen'], ['36', 'Shoujo'], ['4', 'Shounen'],
  ['68', 'Sin Censura'], ['7', 'Sobrenatural'], ['5', 'Superpoderes'], ['21', 'Suspenso'],
  ['20', 'Terror'], ['49', 'Vampiros'], ['74', 'Venganza'], ['78', 'Video Games'],
  ['75', 'Wuxia'], ['76', 'Xianxia'], ['77', 'Xuanhuan'], ['53', 'Yaoi'], ['52', 'Yuri'],
];

function absolute(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${SITE}${url.startsWith('/') ? '' : '/'}${url}`;
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

function hostLabel(url) {
  const host = ((/^https?:\/\/([^/]+)/.exec(String(url)) || [])[1] || '').replace(/^www\./, '');
  const parts = host.split('.');
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  const known = { ok: 'OK.ru', yourupload: 'YourUpload', mixdroop: 'MixDrop', mixdrop: 'MixDrop', voe: 'VOE', vgfplay: 'VGFPlay', mp4upload: 'Mp4Upload', streamtape: 'Streamtape', mail: 'Mail.ru' };
  if (known[name]) return known[name];
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Server';
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
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/animes?q=${encodeURIComponent(query)}&page=${page}`;
    } else if (tags.length) {
      const filters = tags.map((tag) => `genre[]=${encodeURIComponent(tag.id)}&`).join('');
      url = `${SITE}/animes?${filters}order=created&page=${page}`;
    } else {
      const order = request && request.feed === 'latest' ? 'updated' : 'rating';
      url = `${SITE}/animes?order=${order}&page=${page}`;
    }
    const { results, next } = this.parseList(cheerio.load(await this.get(url)));
    const hentai = await this.hentaiSet();
    results.forEach((r) => {
      if (hentai.has(r.mangaId)) r.ageRating = 18;
    });
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  parseList($) {
    const results = $('ul.ListAnimes li article')
      .map((i, el) => {
        const card = $(el);
        const href = card.find('a').first().attr('href') || card.find('div.Description a.Button').attr('href');
        const mangaId = (/\/anime\/(\d+\/[^/?#]+)/.exec(href || '') || [])[1];
        const title = card.find('h3.Title').first().text().trim();
        const image = absolute(card.find('figure img').first().attr('src'));
        return mangaId && title ? { mangaId, title, image, medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    return { results, next: $('ul.pagination a[rel="next"]').length > 0 };
  }

  async hentaiSet() {
    if (this.hentaiIds) return this.hentaiIds;
    const ids = new Set();
    try {
      for (let page = 1; page <= 8; page++) {
        const { results, next } = this.parseList(cheerio.load(await this.get(`${SITE}/animes?genre[]=31&order=created&page=${page}`)));
        results.forEach((r) => ids.add(r.mangaId));
        if (!results.length || !next) break;
      }
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      console.error('AnimeJL could not read the Hentai genre: ' + (e && e.message));
      return ids;
    }
    this.hentaiIds = ids;
    return ids;
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${mangaId}`));
    const status = $('span.fa-tv').text();
    const tags = $('nav.Nvgnrs a').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    const hentai = tags.indexOf('Hentai') !== -1 || (await this.hentaiSet()).has(mangaId);
    return {
      mangaInfo: {
        ...(hentai ? { ageRating: 18 } : {}),
        title: $('div.Ficha div.Container .Title').first().text().trim() || mangaId,
        image: absolute($('div.AnimeCover div.Image figure img').first().attr('src')),
        desc: $('div.Description').first().text().trim().replace(/^"|"$/g, ''),
        status: /Finalizado/i.test(status) ? 'COMPLETED' : /En emisi/i.test(status) ? 'ONGOING' : 'UNKNOWN',
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
    const html = await this.get(`${SITE}/anime/${mangaId}`);
    const list = /var\s+episodes\s*=\s*(\[[\s\S]*?\]);/.exec(html);
    if (!list) throw new Error('AnimeJL: the anime page has no episode list');
    const episodes = new Map();
    for (const [, numText, slug] of list[1].matchAll(/\[(\d+(?:\.\d+)?)\s*,\s*"([^"]+)"/g)) {
      const number = parseFloat(numText);
      const id = slug || `episodio-${numText}`;
      if (!episodes.has(id)) {
        episodes.set(id, {
          id,
          chapterId: id,
          name: `Episodio ${numText}`,
          number: Number.isNaN(number) ? undefined : number,
        });
      }
    }
    return Array.from(episodes.values()).sort((a, b) => (b.number || 0) - (a.number || 0));
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const videos = await this.getVideosUnnamed(mangaId, chapterId);
    return videos.map((video) => (video.server ? video : Object.assign({}, video, { server: String(video.quality || 'Server').split(' ')[0] })));
  }

  async getVideosUnnamed(mangaId, chapterId) {
    const html = await this.get(`${SITE}/anime/${mangaId}/${encodeURIComponent(chapterId)}`);
    const players = Array.from(html.matchAll(/video\[\d+\]\s*=\s*'<iframe[^>]+src="([^"]+)"/g), (match) => match[1]);
    const found = await Promise.all(players.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    const NEVER_PLAYS = /(^|\.)(netu\.ac|netu\.tv|hqq\.to|hqq\.tv|waaw\.tv|embedsb\.com|sbface\.com|sbfull\.com|sbplay\.org|mega\.nz)$/i;
    const seenPlayers = new Set();
    const embeds = players
      .map((url) => String(url || '').trim().replace(/^\/\//, 'https://').replace(/^http:/, 'https:'))
      .filter((url, i) => !(found[i] && /^https?:\/\//.test(found[i].url)) && /^https?:\/\/\S+$/.test(url) && !NEVER_PLAYS.test((/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '') && !seenPlayers.has(url) && seenPlayers.add(url))
      .map((url) => ({ url, type: 'embed', quality: hostLabel(url), server: hostLabel(url) }));
    if (videos.length) return videos;
    if (!embeds.length) throw new Error(`AnimeJL: none of the ${players.length} servers gave a playable video`);
    return embeds;
  }

  async extract(url) {
    const cleanUrl = url.replace(/^http:/, 'https:');
    const host = (/^https?:\/\/([^/]+)/.exec(cleanUrl) || [])[1] || '';
    const origin = `https://${host}/`;
    const isVidHide = /(^|\.)(vidhide\w*\.com|morencius\.com|minochinos\.com|dhtpre\.com|peytonepre\.com|smoothpre\.com|earnvids\.com|ryderjet\.com|bingezove\.com)$/.test(host);
    const isStreamWish = /(^|\.)(streamwish\.\w+|playerwish\.com|wishonly\.site|swhoi\.com|swdyu\.com|strwish\.com|wishembed\.pro)$/.test(host);
    if (!isVidHide && !isStreamWish && !/(^|\.)(voe\.sx|ok\.ru|mi?xdrop\.\w+|streamtape\.com|shavetape\.cash|uqload\.\w+|yourupload\.com|mp4upload\.com|sendvid\.com)$/.test(host)) {
      return null;
    }
    let html = await this.get(cleanUrl, { Referer: `${SITE}/` });
    if (isVidHide || isStreamWish) {
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      const stream = hls[1].replace(/\\\//g, '/');
      return { url: stream.startsWith('/') ? `https://${host}${stream}` : stream, quality: isVidHide ? 'VidHide' : 'StreamWish', headers: { Referer: origin } };
    }
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1], { Referer: origin });
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE', headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, quality: 'OK.ru' };
    }
    if (/(^|\.)mi?xdrop\.\w+$/.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', headers: { Referer: origin } };
    }
    if (/(^|\.)(streamtape\.com|shavetape\.cash)$/.test(host)) {
      const part = /document\.getElementById\('(?:norobot|robot)link'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/.exec(html);
      return { url: `https:${part[1]}${part[2].substring(+part[3])}`, quality: 'StreamTape', headers: { Referer: origin } };
    }
    if (/(^|\.)uqload\.\w+$/.test(host)) {
      const code = unpack(html) || html;
      const src = /sources\s*:\s*\[\s*(?:\{\s*file\s*:\s*)?"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/.exec(code);
      return { url: src[1], quality: 'Uqload', headers: { Referer: origin } };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
    if (/(^|\.)sendvid\.com$/.test(host)) {
      const src = /<source[^>]+src="([^"]+\.mp4[^"]*)"/.exec(html);
      return { url: src[1], quality: 'Sendvid', headers: { Referer: origin } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers = {}) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER, ...headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeJL: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
