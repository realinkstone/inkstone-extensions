const SITE = 'https://katanime.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'Lulu', 'FileLions', 'Streamtape', 'Doodstream', 'Uqload', 'OK.ru', 'MixDrop', 'YourUpload', 'Mp4Upload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function absolute(url) {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${SITE}/${url.replace(/^\.?\/+/, '')}`;
}

function slugOf(href, kind) {
  const match = new RegExp(`/${kind}/([^/?#"]+)`).exec(href || '');
  return match ? match[1] : null;
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

function decryptLink(payload) {
  const data = JSON.parse(payload);
  const params = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(data.ct),
    salt: CryptoJS.enc.Hex.parse(data.s),
  });
  const raw = CryptoJS.AES.decrypt(params, 'hanabi').toString(CryptoJS.enc.Utf8);
  return JSON.parse(raw);
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
      { id: 'latest', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/animes`));
    return $('select[name="genero[]"] option')
      .map((i, el) => ({
        id: $(el).attr('value'),
        label: $(el).text().replace(/\s*\(\d+\)\s*$/, '').trim(),
      }))
      .get()
      .filter((tag) => tag.id && tag.label);
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = request && request.feed;
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/buscar?q=${encodeURIComponent(query)}&p=${page}`;
    } else if (tags.length) {
      const genres = tags.map((tag) => `genero=${encodeURIComponent(tag.id || tag)}`).join('&');
      url = `${SITE}/animes?${genres}&p=${page}`;
    } else if (feed === 'popular') {
      url = `${SITE}/populares`;
    } else if (feed === 'latest') {
      url = `${SITE}/animes?fecha=${new Date().getUTCFullYear()}&p=${page}`;
    } else {
      url = `${SITE}/animes?p=${page}`;
    }
    const $ = cheerio.load(await this.get(url));
    const results = $('#article-div .full')
      .map((i, el) => {
        const link = $(el).find('a[href*="/anime/"]').first();
        const mangaId = slugOf(link.attr('href'), 'anime');
        const img = $(el).find('img').first();
        const title = $(el).find('._2uHIS').text().trim() || img.attr('alt') || '';
        return mangaId && title ? { mangaId, title, image: absolute(img.attr('data-src') || img.attr('src')), medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    const next = !query && !tags.length && feed === 'popular' ? 0 : $('.pagination .active ~ li:not(.disabled) a').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/`));
    const img = $('img.lozad').first();
    const status = $('.badge-status, #estado, .detail-item').text();
    return {
      mangaInfo: {
        title: $('h1.anime-title, .comics-title').first().text().trim() || mangaId,
        image: absolute(img.attr('data-src') || img.attr('src')),
        desc: $('.anime-synopsis').first().text().trim(),
        status: /Finalizado/i.test(status) ? 'COMPLETED' : /Emisi/i.test(status) ? 'ONGOING' : 'UNKNOWN',
        tags: $('.genres-anime a, .anime-genres a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/anime/${mangaId}/`,
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
    const animeUrl = `${SITE}/anime/${encodeURIComponent(mangaId)}/`;
    const page = await this.sendRaw({ url: animeUrl, method: 'GET', headers: { Accept: 'text/html' } });
    const html = String(page.data);
    const token = (/name="csrf-token" content="([^"]+)"/.exec(html) || [])[1];
    const epsUrl = (/data-url="([^"]+\/eps)"/.exec(html) || [])[1] || `${animeUrl}eps`;
    const cookies = Object.entries(page.headers || {})
      .filter(([name]) => name.toLowerCase() === 'set-cookie')
      .map(([, value]) => String(value))
      .join(', ');
    const cookie = Array.from(cookies.matchAll(/(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g), (match) => `${match[1]}=${match[2]}`).join('; ');
    let total = +((/(\d+)\s*\/\s*[^\s<]+\s*Cap[íi]tulo/i.exec(html) || [])[1] || 0);
    const dates = new Map();
    if (token) {
      const reply = await this.sendRaw({
        url: epsUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
          Origin: SITE,
          Referer: animeUrl,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: `_token=${encodeURIComponent(token)}&pagina=1`,
      }).catch(() => null);
      if (reply && reply.status >= 200 && reply.status < 300) {
        const parsed = JSON.parse(String(reply.data));
        const ep = parsed.ep || parsed;
        if (ep && ep.total) total = +ep.total;
        for (const item of (ep && ep.data) || []) {
          const num = +item.numero;
          const time = item.created_at ? Date.parse(item.created_at.replace(' ', 'T') + 'Z') : NaN;
          if (Number.isFinite(num) && !Number.isNaN(time)) dates.set(num, time);
        }
      }
    }
    const episodes = [];
    for (let number = total; number >= 1; number--) {
      const id = `${mangaId}-${number}`;
      const time = dates.get(number);
      episodes.push({ id, chapterId: id, name: `Episodio ${number}`, number, time });
    }
    return episodes;
  }

  async getVideos(mangaId, chapterId) {
    const videos = await this.getVideosUnnamed(mangaId, chapterId);
    return videos.map((video) => (video.server ? video : Object.assign({}, video, { server: String(video.quality || 'Server').split(' ')[0] })));
  }

  async getVideosUnnamed(mangaId, chapterId) {
    const episodeUrl = `${SITE}/capitulo/${encodeURIComponent(chapterId)}/`;
    const $ = cheerio.load(await this.get(episodeUrl));
    const tokens = $('[data-player]')
      .filter((i, el) => /voe|lulu|filelions|streamtape|uqload|ok\.?ru|mixdrop|yourupload|mp4upload/i.test($(el).text()))
      .map((i, el) => $(el).attr('data-player'))
      .get()
      .filter(Boolean);
    if (!tokens.length) throw new Error('Katanime: the site lists no supported video servers for this episode');
    const resolved = await Promise.all(
      tokens.map(async (token) => {
        const html = await this.send({
          url: `${SITE}/reproductor?url=${encodeURIComponent(token)}`,
          method: 'GET',
          headers: { Accept: 'text/html', Referer: episodeUrl },
        }).catch(() => '');
        const match = /var\s+e\s*=\s*'([^']+)'/.exec(html);
        return match ? decryptLink(match[1]) : null;
      }),
    );
    const urls = Array.from(new Set(resolved.filter((url) => /^https?:\/\//.test(url))));
    const found = await Promise.all(urls.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`Katanime: none of the ${tokens.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|lulu|filelions\.|streamtape\.|uqload\.|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com)/.test(host)) return null;
    let html = await this.get(url.replace(/^http:/, 'https:'));
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
    }
    if (/(^|\.)lulu/.test(host)) {
      const file = /file:\s*"([^"]+)"/.exec(html) || /file:\s*"([^"]+)"/.exec(unpack(html));
      return { url: file[1], quality: 'Lulu', headers: { Referer: origin } };
    }
    if (/(^|\.)filelions\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /"hls\d"\s*:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked);
      return { url: file[1].replace(/^\/\//, 'https://'), quality: 'FileLions', headers: { Referer: origin } };
    }
    if (/(^|\.)streamtape\./.test(host)) {
      const link = /getElementById\('(?:no)?robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)/.exec(html);
      const query = link && link[1].split('?')[1];
      if (!query) return null;
      return { url: `https://${host}/get_video?${query}&stream=1`, quality: 'Streamtape', headers: { Referer: origin } };
    }
    if (/(^|\.)uqload\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /sources:\s*\[\s*"([^"]+\.mp4[^"]*)"/.exec(unpacked);
      return { url: file[1], quality: 'Uqload', headers: { Referer: 'https://uqload.vc/' } };
    }
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, quality: 'OK.ru' };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  sendRaw(request) {
    return this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
  }

  async send(request) {
    const response = await this.sendRaw(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`Katanime: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
