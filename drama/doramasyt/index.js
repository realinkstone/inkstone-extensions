const SITE = 'https://www.doramasyt.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'Lulu', 'OK.ru', 'Mp4Upload', 'Streamtape', 'YourUpload', 'MixDrop'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['policial', 'Policial'], ['romance', 'Romance'], ['comedia', 'Comedia'], ['escolar', 'Escolar'],
  ['accion', 'Acción'], ['thriller', 'Thriller'], ['drama', 'Drama'], ['misterio', 'Misterio'],
  ['fantasia', 'Fantasía'], ['historico', 'Histórico'], ['belico', 'Bélico'], ['militar', 'Militar'],
  ['medico', 'Médico'], ['ciencia-ficcion', 'Ciencia Ficción'], ['sobrenatural', 'Sobrenatural'], ['horror', 'Horror'],
  ['politica', 'Política'], ['familiar', 'Familiar'], ['melodrama', 'Melodrama'], ['deporte', 'Deporte'],
  ['comida', 'Comida'], ['supervivencia', 'Supervivencia'], ['aventuras', 'Aventuras'], ['artes-marciales', 'Artes marciales'],
  ['recuentos-de-la-vida', 'Recuentos de la vida'], ['amistad', 'Amistad'], ['psicologico', 'Psicológico'], ['yuri', 'Yuri'],
  ['k-drama', 'K-Drama'], ['j-drama', 'J-Drama'], ['c-drama', 'C-Drama'], ['hk-drama', 'HK-Drama'],
  ['tw-drama', 'TW-Drama'], ['thai-drama', 'Thai-Drama'], ['idols', 'Idols'], ['suspenso', 'Suspenso'],
  ['negocios', 'Negocios'], ['time-travel', 'Time Travel'], ['crimen', 'Crimen'], ['yaoi', 'Yaoi'],
  ['legal', 'Legal'], ['juvenil', 'Juvenil'], ['musical', 'Musical'], ['reality-show', 'Reality Show'],
  ['documental', 'Documental'], ['turcas', 'Turcas'],
];

function slugOf(href, kind) {
  const match = new RegExp('/' + kind + '/([^/?#]+)').exec(href || '');
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

function cardsOf($) {
  return $('.ficha_efecto a')
    .map((i, el) => {
      const card = $(el);
      const mangaId = slugOf(card.attr('href'), 'dorama');
      if (!mangaId) return null;
      const img = card.find('img').first();
      return {
        mangaId,
        title: card.find('.title_cap, h3').first().text().trim(),
        image: img.attr('data-src') || img.attr('src'),
        medium: 'anime',
      };
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
      { id: 'latest', name: 'Airing' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    let url = `${SITE}/${request && request.feed === 'latest' ? 'emision' : 'doramas'}?p=${page}`;
    if (tags.length) url = `${SITE}/doramas?genero=${encodeURIComponent(tags[0].id)}&p=${page}`;
    if (query) url = `${SITE}/buscar?q=${encodeURIComponent(query)}&p=${page}`;
    const $ = cheerio.load(await this.get(url));
    const results = cardsOf($);
    return {
      results,
      metadata: results.length && $('.pagination [rel="next"]').length ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const webURL = `${SITE}/dorama/${encodeURIComponent(mangaId)}`;
    const $ = cheerio.load(await this.get(webURL));
    const text = $('.lh-sm').text() || $('body').text();
    const img = $('.gap-3 img, img.lazy').first();
    const tags = $('a[href*="/genero/"], .lh-lg span').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: img.attr('data-src') || img.attr('src'),
        desc: $('.mb-3 p').first().text().trim(),
        status: /Finalizado/.test(text) ? 'COMPLETED' : /Estreno|En emisi[oó]n/.test(text) ? 'ONGOING' : 'UNKNOWN',
        tags: Array.from(new Set(tags)),
        webURL,
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
    const referer = `${SITE}/dorama/${encodeURIComponent(mangaId)}`;
    const page = await this.raw({ url: referer, method: 'GET', headers: { Accept: 'text/html' } });
    const html = String(page.data);
    const $ = cheerio.load(html);
    const token = $('meta[name="csrf-token"]').attr('content');
    const ajax = $('.caplist').attr('data-ajax');
    const cookies = Object.entries(page.headers || {})
      .filter(([name]) => name.toLowerCase() === 'set-cookie')
      .map(([, value]) => (Array.isArray(value) ? value.join(', ') : String(value)))
      .join(', ');
    const cookie = Array.from(cookies.matchAll(/(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g), (match) => `${match[1]}=${match[2]}`).join('; ');
    if (token && ajax) {
      const first = await this.post(ajax, `_token=${encodeURIComponent(token)}`, cookie, referer).catch(() => null);
      if (first) {
        const list = JSON.parse(first);
        const pages = Math.ceil((list.eps || []).length / (list.perpage || 50));
        const answers = await Promise.all(
          Array.from({ length: pages }, (_, i) => this.post(list.paginate_url, `_token=${encodeURIComponent(token)}&p=${i + 1}`, cookie, referer))
        );
        const caps = answers.flatMap((answer) => JSON.parse(answer).caps || []);
        const unique = new Map(caps.map((cap) => [slugOf(cap.url, 'ver'), cap]));
        unique.delete(null);
        return Array.from(unique.entries())
          .map(([id, cap]) => ({ id, chapterId: id, name: `Episodio ${cap.episodio}`, number: Number.isFinite(+cap.episodio) ? +cap.episodio : undefined }))
          .reverse();
      }
    }
    const firstSlug = slugOf($('a[href*="/ver/"]').first().attr('href'), 'ver') || `${mangaId.replace(/-sub-espanol$/, '')}-episodio-1`;
    const prefix = firstSlug.replace(/-episodio-\d+$/, '');
    if (/<dd>\s*Pel[ií]cula\s*<\/dd>/i.test(html)) {
      return [{ id: firstSlug, chapterId: firstSlug, name: 'Episodio 1', number: 1 }];
    }
    const hasEpisode = async (n) => {
      const res = await this.requests.schedule(App.createRequest({ url: `${SITE}/ver/${prefix}-episodio-${n}`, method: 'HEAD', headers: BROWSER }));
      return res.status >= 200 && res.status < 300;
    };
    let low = 1;
    let high = 16;
    while (high <= 128 && (await hasEpisode(high))) {
      low = high;
      high *= 2;
    }
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (await hasEpisode(mid)) low = mid;
      else high = mid;
    }
    return Array.from({ length: low }, (_, i) => {
      const number = low - i;
      const id = `${prefix}-episodio-${number}`;
      return { id, chapterId: id, name: `Episodio ${number}`, number };
    });
  }

  async getVideos(mangaId, chapterId) {
    const videos = await this.getVideosUnnamed(mangaId, chapterId);
    return videos.map((video) => (video.server ? video : Object.assign({}, video, { server: String(video.quality || 'Server').split(' ')[0] })));
  }

  async getVideosUnnamed(mangaId, chapterId) {
    const episodeUrl = `${SITE}/ver/${encodeURIComponent(chapterId)}`;
    const html = await this.get(episodeUrl);
    const $ = cheerio.load(html);
    const key = $('.player').attr('data-key') || `${SITE}/reproductor?video=`;
    const token = (/resource_token\s*=\s*['"]([^'"]+)['"]/.exec(html) || [])[1] || '';
    const entries = $('button.play-video[data-player]')
      .map((i, el) => ({
        name: $(el).text().trim(),
        raw: $(el).attr('data-player'),
        api: $(el).attr('data-usa-api') === '1',
      }))
      .get()
      .filter((item) => item.raw && (!item.api || /^(voe|lulu.*|m.?xdrop|ok.*|yourupload|mp4upload|streamtape)$/i.test(item.name)));
    const players = await Promise.all(
      entries.map(async (item) => {
        if (!item.api) return /^https?:\/\//.test(item.raw) ? item.raw : App.base64Decode(item.raw);
        const url = `${key}${item.raw}&player=${encodeURIComponent(item.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
        const rep = await this.get(url, { Referer: episodeUrl }).catch(() => '');
        return cheerio.load(rep)('iframe[src]').first().attr('src') || null;
      })
    );
    const found = await Promise.all(players.filter(Boolean).map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`DoramasYT: none of the ${entries.length} servers gave a playable video`);
    return videos;
  }

  async extract(rawUrl) {
    const url = rawUrl.replace(/^http:/, 'https:').replace(/^https:\/\/mi?xdrop\.[^/]+\//, 'https://mixdrop.top/');
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|lulu|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com|streamtape\.com)/.test(host)) return null;
    let html = await this.get(url);
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
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', headers: { Referer: 'https://mixdrop.top/' } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl || metadata.ondemandHls, quality: 'OK.ru', headers: { Referer: origin } };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
    if (/(^|\.)streamtape\.com$/.test(host)) {
      const tape = /getElementById\('robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/.exec(html);
      return { url: `https://streamtape.com/${tape[1].slice(+tape[2] + (+tape[3] || 0))}&stream=1`, quality: 'Streamtape', headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url, headers = {}) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html', ...headers } });
  }

  post(url, body, cookie, referer) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      Origin: SITE,
      Referer: referer,
      Cookie: cookie,
    };
    return this.send({ url, method: 'POST', headers, body });
  }

  async send(request) {
    return String((await this.raw(request)).data);
  }

  async raw(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...BROWSER, ...request.headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`DoramasYT: HTTP ${response.status} from ${request.url}`);
    return response;
  }
}

module.exports = { Source };
