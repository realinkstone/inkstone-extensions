const SITE = 'https://ww7.myasiantv.rest';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'drama', name: 'Dramas', path: '/drama-10/' },
  { id: 'movies', name: 'Movies', path: '/movies-2/' },
  { id: 'shows', name: 'KShows', path: '/shows-3/' },
  { id: 'korean', name: 'Korean', path: '/country/korean/' },
  { id: 'japanese', name: 'Japanese', path: '/country/japanese/' },
  { id: 'chinese', name: 'Chinese', path: '/country/chinese/' },
  { id: 'thailand', name: 'Thai', path: '/country/thailand/' },
  { id: 'taiwanese', name: 'Taiwanese', path: '/country/taiwanese/' },
  { id: 'philippines', name: 'Filipino', path: '/country/philippines/' },
  { id: 'hong-kong', name: 'Hong Kong', path: '/country/hong-kong/' },
  { id: 'malaysia', name: 'Malaysian', path: '/country/malaysia/' },
  { id: 'singapore', name: 'Singaporean', path: '/country/singapore/' },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['business', 'Business'], ['comedy', 'Comedy'], ['crime', 'Crime'],
  ['documentary', 'Documentary'], ['drama', 'Drama'], ['family', 'Family'], ['fantasy', 'Fantasy'], ['food', 'Food'],
  ['historical', 'Historical'], ['horror', 'Horror'], ['law', 'Law'], ['life', 'Life'], ['martial-arts', 'Martial Arts'],
  ['mature', 'Mature'], ['medical', 'Medical'], ['melodrama', 'Melodrama'], ['military', 'Military'], ['music', 'Music'],
  ['mystery', 'Mystery'], ['political', 'Political'], ['psychological', 'Psychological'], ['romance', 'Romance'],
  ['school', 'School'], ['sci-fi', 'Sci-Fi'], ['sitcom', 'Sitcom'], ['sports', 'Sports'], ['supernatural', 'Supernatural'],
  ['thriller', 'Thriller'], ['war', 'War'], ['wuxia', 'Wuxia'], ['youth', 'Youth'],
];

const PLAYERS = [
  { name: 'Vidmoly', test: /(^|\.)vidmoly\.(org|biz|net|to|me)$/i },
  { name: 'Streamtape', test: /(^|\.)(streamtape\.(com|to|net|xyz)|streamta\.pe)$/i },
  { name: 'MixDrop', test: /(^|\.)(mixdrop\.[a-z]+|mxdrop\.[a-z]+)$/i },
];

function cleanText(text) {
  return String(text || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function slugOf(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function hostOf(url) {
  const m = /^(?:https?:)?\/\/([^/:?#]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
}

function detailUrlOf(mangaId) {
  return `${SITE}/series/${encodeURIComponent(mangaId)}/`;
}

function episodeUrlOf(chapterId) {
  return `${SITE}/${encodeURIComponent(chapterId)}/`;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('li').each((_, el) => {
    const card = $(el);
    const link = card.children('a[href*="/series/"]').first();
    if (!link.length || !link.find('img').length) return;
    const mangaId = slugOf(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('h2 a').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    results.push({ mangaId, title, image: absolute(link.find('img').first().attr('src') || link.find('img').first().attr('data-src')), medium: 'anime', webURL: detailUrlOf(mangaId) });
  });
  return results;
}

function hasNext($) {
  let next = false;
  $('a').each((_, a) => {
    if (/\/page\/\d+\//.test($(a).attr('href') || '') && /next|>/i.test(cleanText($(a).text()))) next = true;
  });
  return next;
}

function ageFromGenres(genres) {
  return (Array.isArray(genres) ? genres : []).some((g) => /^mature$/i.test(String(g).trim())) ? 18 : 0;
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
    this.matureIds = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async matureSet() {
    if (this.matureIds) return this.matureIds;
    const ids = new Set();
    try {
      for (let page = 1; page <= 8; page++) {
        const $ = cheerio.load(await this.requestHTML(`${SITE}/genre/mature/${page > 1 ? `page/${page}/` : ''}`));
        const cards = parseCards($);
        cards.forEach((c) => ids.add(c.mangaId));
        if (!cards.length || !hasNext($)) break;
      }
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      console.error('MyAsianTV could not read the Mature genre: ' + (e && e.message));
      return ids;
    }
    this.matureIds = ids;
    return ids;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    let results = [];
    let next = false;
    if (query) {
      const url = `${SITE}/wp-json/wp/v2/series?search=${encodeURIComponent(query)}&per_page=30&page=${page}&_fields=slug,link,title,yoast_head_json.og_image`;
      let list;
      try {
        list = await this.requestJSON(url);
      } catch (e) {
        if (page > 1 && !(e && e.kind === 'challenge')) return { results: [], metadata: undefined };
        throw e;
      }
      results = (Array.isArray(list) ? list : [])
        .filter((r) => r && r.slug && r.title)
        .map((r) => {
          const cover = r.yoast_head_json && Array.isArray(r.yoast_head_json.og_image) && r.yoast_head_json.og_image[0];
          return { mangaId: String(r.slug), title: cleanText(decodeEntities(r.title.rendered || r.title)), image: cover ? absolute(cover.url) : '', medium: 'anime', webURL: detailUrlOf(r.slug) };
        });
      next = results.length === 30;
    } else {
      let base;
      if (tags.length) base = `/genre/${encodeURIComponent(tags[0].id)}/`;
      else base = (FEEDS.find((f) => f.id === feedId) || FEEDS[0]).path;
      let html;
      try {
        html = await this.requestHTML(`${SITE}${base}${page > 1 ? `page/${page}/` : ''}`);
      } catch (e) {
        if (page > 1 && !(e && e.kind === 'challenge')) return { results: [], metadata: undefined };
        throw e;
      }
      const $ = cheerio.load(html);
      results = parseCards($);
      next = hasNext($);
    }
    const mature = await this.matureSet();
    const filteredMature = tags.some((t) => /^mature$/i.test(String(t.id)));
    results.forEach((r) => {
      if (mature.has(r.mangaId) || filteredMature) r.ageRating = 18;
    });
    return { results, metadata: results.length > 0 && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const labeled = (label) => {
      let value = '';
      $('p').each((_, p) => {
        const strong = $(p).children('strong').first();
        if (strong.length && cleanText(strong.text()).replace(/:$/, '').toLowerCase() === label.toLowerCase()) {
          value = cleanText($(p).clone().children('strong').remove().end().text());
          return false;
        }
      });
      return value;
    };
    const title = cleanText(decodeEntities($('h1').first().text())).replace(/\s*[-|]\s*Myasiantv.*$/i, '') || mangaId;
    const image = absolute($('meta[property="og:image"]').attr('content') || $('.cover img, .pic img').first().attr('src'));
    const genres = labeled('Genre').split(/\s*,\s*/).filter(Boolean);
    const country = labeled('Country');
    const tags = genres.slice();
    if (country && tags.indexOf(country) === -1) tags.push(country);

    let plot = '';
    $('.right .info p, .info p').each((_, p) => {
      const t = cleanText($(p).text());
      if (t.length > plot.length) plot = t;
    });
    const tail = /\s*(?:Native Title|Also Known As)\s*:/i.exec(plot);
    const alt = [];
    if (tail) {
      const rest = plot.slice(tail.index);
      plot = plot.slice(0, tail.index).trim();
      (/Native Title\s*:\s*(.+?)(?=\s*Also Known As\s*:|$)/i.exec(rest) || []).slice(1).forEach((v) => v && alt.push(cleanText(v)));
      (/Also Known As\s*:\s*(.+)$/i.exec(rest) || []).slice(1).forEach((v) => v && v.split(/\s*,\s*/).forEach((n) => n && alt.push(cleanText(n))));
    }

    const status = mapStatus(labeled('Status'));
    const info = { title, image, desc: plot, status, completed: status === 'COMPLETED', tags, webURL: url, medium: 'anime' };
    if (alt.length) info.altTitles = alt;
    const year = /(\d{4})/.exec(labeled('Release year'));
    if (year) info.releaseDate = year[1];
    const mature = await this.matureSet();
    if (mature.has(mangaId) || ageFromGenres(genres)) info.ageRating = 18;
    return { mangaInfo: info };
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
    const $ = cheerio.load(await this.requestHTML(detailUrlOf(mangaId)));
    const rows = [];
    const seen = new Set();
    $('ul.list-episode li').each((_, li) => {
      const link = $(li).find('h2 a, a').first();
      const id = slugOf(link.attr('href'));
      if (!id || seen.has(id)) return;
      seen.add(id);
      const full = cleanText(decodeEntities(link.attr('title') || link.text()));
      const number = /\bEp(?:isode)?\.?\s*(\d+(?:\.\d+)?)/i.exec(full) || /-ep-(\d+(?:\.\d+)?)/i.exec(id);
      const movie = /full[- ]?movie|movie/i.test(id) && !number;
      const row = { id, chapterId: id, name: number ? `Episode ${number[1]}` : movie ? 'Full movie' : full || id };
      if (number) row.number = parseFloat(number[1]);
      else if (movie) row.number = 1;
      rows.push(row);
    });
    if (!rows.length) throw new Error('MyAsianTV lists no episodes for this title yet');
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    const epUrl = episodeUrlOf(chapterId);
    const $ = cheerio.load(await this.requestHTML(epUrl));
    let frame = '';
    const TRACKERS = /(^|\.)(googletagmanager|google-analytics|doubleclick|facebook|googlesyndication)\.(com|net)$/i;
    $('iframe').each((_, f) => {
      const src = absolute($(f).attr('src') || $(f).attr('data-src') || '');
      if (!/^https?:\/\//.test(src) || TRACKERS.test(hostOf(src))) return;
      if (!frame || (/\/embed\//.test(src) && !/\/embed\//.test(frame))) frame = src;
    });
    if (!frame) throw new Error('MyAsianTV shows no player for this episode yet');

    const $f = cheerio.load(await this.requestHTML(frame, epUrl));
    const servers = [];
    const seen = new Set();
    $f('.server-item').each((_, el) => {
      const url = absolute($f(el).attr('data-video') || '');
      if (url && !seen.has(url)) {
        seen.add(url);
        servers.push(url);
      }
    });
    const dflt = absolute($f('#embedvideo').attr('data-src') || '');
    if (dflt && !seen.has(dflt)) servers.unshift(dflt);
    if (!servers.length) throw new Error('MyAsianTV lists no server for this episode yet');

    const videos = [];
    const embeds = [];
    let vidmolyDone = false;
    for (const url of servers) {
      const player = PLAYERS.find((p) => p.test.test(hostOf(url)));
      if (player && player.name === 'Vidmoly' && !vidmolyDone) {
        const video = await this.vidmoly(url, epUrl);
        if (video) {
          videos.push(video);
          vidmolyDone = true;
          continue;
        }
      }
      embeds.push({ url, type: 'embed', quality: player ? player.name : hostOf(url), server: player ? player.name : hostOf(url) });
    }
    if (!videos.length && !embeds.length) throw new Error('MyAsianTV: no usable server for this episode');
    return videos.concat(embeds);
  }

  async vidmoly(url, referer) {
    try {
      const html = await this.requestHTML(url.replace(/^http:/, 'https:'), referer);
      const master = (/sources:\s*\[\s*\{\s*file:\s*'([^']+)'/.exec(html) || [])[1];
      if (!master || !/^https?:\/\//.test(master)) return null;
      const subtitles = [];
      for (const m of html.matchAll(/\{\s*file:\s*'([^']+)'\s*,\s*label:\s*'([^']*)'\s*,\s*kind:\s*'captions'/g)) {
        subtitles.push({ url: absolute(m[1]), label: cleanText(m[2]) || 'Subtitles', language: cleanText(m[2]).slice(0, 2).toLowerCase() });
      }
      const video = { url: master, type: 'hls', quality: 'Auto' + (subtitles.length ? ', Softsub: ' + subtitles.map((s) => s.label).slice(0, 3).join(', ') : ''), server: 'Vidmoly' };
      if (subtitles.length) video.subtitles = subtitles;
      return video;
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      return null;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last;
  }

  async requestHTML(url, referer) {
    const headers = { 'User-Agent': UA };
    if (referer) headers.Referer = referer;
    const response = await this.send({ url, method: 'GET', headers });
    if (response.status < 200 || response.status >= 300) throw new Error(`MyAsianTV HTTP ${response.status}`);
    return String(response.data || '');
  }

  async requestJSON(url) {
    const response = await this.send({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (response.status < 200 || response.status >= 300) throw new Error(`MyAsianTV HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('MyAsianTV answered a page that is not data');
    }
  }
}

module.exports = { Source };
