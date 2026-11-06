const SITE = 'https://anizone.to';

const FEEDS = [
  { id: 'added', name: 'Recently Added', sort: 'added-desc' },
  { id: 'release', name: 'Newest', sort: 'release-desc' },
  { id: 'az', name: 'A to Z', sort: 'title-asc' },
];

function htmlDecode(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function embeddedValues(html) {
  const out = [];
  const pattern = /JSON\.parse\('((?:[^'\\]|\\.)*)'\)/g;
  let match;
  while ((match = pattern.exec(html))) {
    try {
      out.push(JSON.parse(JSON.parse('"' + match[1].replace(/\\'/g, "'") + '"')));
    } catch (e) {
    }
  }
  return out;
}

function firstList(html, key) {
  return embeddedValues(html).find((value) => Array.isArray(value) && value.length && value[0] && value[0][key] !== undefined) || [];
}

function cursorOf(html) {
  const match = /nextCursor:\s*'([^']*)'/.exec(html);
  return match ? match[1] : null;
}

function snapshotOf(html, name) {
  const pattern = /wire:snapshot="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(html))) {
    const snapshot = htmlDecode(match[1]);
    if (snapshot.indexOf('"name":"' + name + '"') !== -1) return snapshot;
  }
  return null;
}

function cookiesOf(headers) {
  if (!headers) return '';
  let raw = headers['set-cookie'] || headers['Set-Cookie'] || '';
  if (Array.isArray(raw)) raw = raw.join(', ');
  return String(raw)
    .split(/,\s*(?=[A-Za-z0-9_.-]+=)/)
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function toTitle(item) {
  return {
    mangaId: item.slug,
    title: item.main_title || item.slug,
    image: item.cover,
    status: item.is_ongoing ? 'ONGOING' : 'COMPLETED',
    tags: [item.type].filter(Boolean),
    medium: 'anime',
  };
}

function episodeName(item) {
  const names = item.title_list && typeof item.title_list === 'object' ? item.title_list : {};
  return names['1'] || names['5'] || Object.keys(names).map((k) => names[k]).find(Boolean) || '';
}

function toEpisode(item) {
  const number = parseFloat(item.slug);
  const name = episodeName(item);
  const time = item.air_date ? Date.parse(item.air_date + 'T00:00:00Z') : NaN;
  return {
    id: String(item.slug),
    chapterId: String(item.slug),
    name: name ? `Episode ${item.slug}: ${name}` : `Episode ${item.slug}`,
    number: Number.isFinite(number) ? number : undefined,
    time: Number.isFinite(time) ? time : undefined,
  };
}

function cueTimes(vtt) {
  const cues = [];
  const pattern = /(\d+):(\d+):(\d+)\.(\d+)\s*-->\s*(\d+):(\d+):(\d+)\.(\d+)\s*\n([^\n]*)/g;
  const ms = (h, m, s, f) => ((+h * 60 + +m) * 60 + +s) * 1000 + Math.round(+('0.' + f) * 1000);
  let match;
  while ((match = pattern.exec(vtt))) {
    cues.push({
      start: ms(match[1], match[2], match[3], match[4]),
      end: ms(match[5], match[6], match[7], match[8]),
      name: match[9].trim().toLowerCase(),
    });
  }
  const find = (words) => cues.find((cue) => words.some((word) => cue.name.indexOf(word) !== -1));
  const intro = find(['intro', 'opening']);
  const outro = find(['credits', 'outro', 'ending']);
  return {
    intro: intro && intro.end > intro.start ? { start: intro.start, end: intro.end } : undefined,
    outro: outro && outro.end > outro.start ? { start: outro.start, end: outro.end } : undefined,
  };
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
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const sort = query ? null : feed.sort;
    const pageUrl = query ? `${SITE}/anime?search=${encodeURIComponent(query)}` : `${SITE}/anime`;
    const cursor = metadata && metadata.cursor;
    let loaded;
    if (!cursor && !sort) {
      const page = await this.get(pageUrl);
      loaded = { items: firstList(page.html, 'main_title'), nextCursor: cursorOf(page.html) };
    } else {
      loaded = await this.loadPage(pageUrl, 'pages.anime-index', cursor || null, sort ? { sort } : {});
    }
    return {
      results: loaded.items.map(toTitle),
      metadata: loaded.nextCursor ? { cursor: loaded.nextCursor } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const page = await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(page.html);
    const heading = $('h1').first();
    const facts = heading.next().find('span > span').map((i, el) => $(el).text().trim()).get();
    const synopsis = $('h3').filter((i, el) => $(el).text().trim() === 'Synopsis').first().next();
    synopsis.find('br').replaceWith('\n');
    const status = facts.find((f) => /^(ongoing|completed|finished|upcoming)$/i.test(f)) || '';
    const title = $('title').text().replace(/\s*[\u2014-]\s*AniZone\s*$/, '').trim();
    return {
      mangaInfo: {
        title: title || mangaId,
        image: $('img[src*="/images/anime/"]').first().attr('src'),
        desc: synopsis.text().replace(/\n{3,}/g, '\n\n').trim(),
        status: /ongoing/i.test(status) ? 'ONGOING' : /completed|finished/i.test(status) ? 'COMPLETED' : 'UNKNOWN',
        tags: $('a[href*="/tag/"]').map((i, el) => $(el).text().trim()).get().filter(Boolean),
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
    const pageUrl = `${SITE}/anime/${encodeURIComponent(mangaId)}`;
    const page = await this.get(pageUrl);
    const episodes = firstList(page.html, 'air_date').slice();
    let cursor = cursorOf(page.html);
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const next = await this.loadPage(pageUrl, 'pages.anime-detail', cursor, {}, page);
      episodes.push(...next.items);
      cursor = next.nextCursor;
    }
    const unique = new Map();
    for (const item of episodes) if (!unique.has(item.slug)) unique.set(item.slug, item);
    return Array.from(unique.values()).map(toEpisode).reverse();
  }

  async getVideos(mangaId, chapterId) {
    ({ mangaId, chapterId } = splitSeasonId(mangaId, chapterId));
    const page = await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`);
    const player = /vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)/.exec(page.html);
    if (!player) throw new Error('AniZone: the episode page has no player');
    const data = JSON.parse(JSON.parse('"' + player[1].replace(/\\'/g, "'") + '"'));
    if (!data.src) throw new Error('AniZone: the episode has no video yet');
    let skips = {};
    if (data.chapter) {
      try {
        const vtt = await this.requests.schedule(App.createRequest({ url: data.chapter, method: 'GET' }));
        if (vtt.status >= 200 && vtt.status < 300) skips = cueTimes(String(vtt.data).replace(/\r/g, ''));
      } catch (e) {
      }
    }
    return [
      {
        url: data.src,
        quality: 'Auto',
        server: 'AniZone',
        headers: { Referer: `${SITE}/` },
        subtitles: (Array.isArray(data.subtitles) ? data.subtitles : [])
          .filter((s) => s && s.file)
          .map((s) => {
            const entry = { url: s.file, label: s.title || s.language || 'Subtitles', language: s.language };
            const format = (/\.(ass|ssa|srt|vtt)(?:[?#]|$)/i.exec(String(s.file)) || [])[1];
            if (format) entry.format = format.toLowerCase();
            return entry;
          }),
        intro: skips.intro,
        outro: skips.outro,
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AniZone: HTTP ${response.status}`);
    return { html: String(response.data), cookie: cookiesOf(response.headers) };
  }

  async loadPage(pageUrl, component, cursor, updates, known) {
    const page = known || (await this.get(pageUrl));
    const csrf = /data-csrf="([^"]+)"/.exec(page.html);
    const snapshot = snapshotOf(page.html, component);
    if (!csrf || !snapshot) throw new Error('AniZone: the page changed and has no list to page through');
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Livewire': 'true',
      'X-CSRF-TOKEN': csrf[1],
      Referer: pageUrl,
      Origin: SITE,
    };
    if (page.cookie) headers.Cookie = page.cookie;
    const response = await this.requests.schedule(
      App.createRequest({
        url: `${SITE}/livewire/update`,
        method: 'POST',
        headers,
        body: JSON.stringify({ _token: csrf[1], components: [{ snapshot, updates, calls: [{ path: '', method: 'loadPage', params: [cursor] }] }] }),
      })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`AniZone: HTTP ${response.status} while paging`);
    const json = JSON.parse(response.data);
    const component0 = json && json.components && json.components[0];
    const dispatches = (component0 && component0.effects && component0.effects.dispatches) || [];
    const loaded = dispatches.find((d) => d.name === 'items-loaded');
    const params = (loaded && loaded.params) || {};
    return { items: Array.isArray(params.items) ? params.items : [], nextCursor: params.hasMore ? params.nextCursor : null };
  }
}

module.exports = { Source };
