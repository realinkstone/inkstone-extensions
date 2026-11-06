const SITE = 'https://kissasian.com.gr';
const PLAYER = 'https://catalog.dramavibe.cfd';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', path: '/most-popular-drama/' },
  { id: 'ongoing', name: 'Ongoing', path: '/popular-ongoing-series/' },
  { id: 'south-korea', name: 'South Korea', path: '/country/south-korea/' },
  { id: 'china', name: 'China', path: '/country/china/' },
  { id: 'japan', name: 'Japan', path: '/country/japan/' },
  { id: 'thailand', name: 'Thailand', path: '/country/thailand/' },
  { id: 'taiwan', name: 'Taiwan', path: '/country/taiwan/' },
  { id: 'hong-kong', name: 'Hong Kong', path: '/country/hong-kong/' },
  { id: 'philippines', name: 'Philippines', path: '/country/philippines/' },
];

const LANGUAGE_NAMES = {
  en: 'English', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese', zh: 'Chinese', ko: 'Korean', ja: 'Japanese',
  ar: 'Arabic', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', tr: 'Turkish', ru: 'Russian', hi: 'Hindi',
};

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

function detailUrlOf(mangaId) {
  return `${SITE}/series/${encodeURIComponent(mangaId)}/`;
}

function episodeUrlOf(chapterId) {
  return `${SITE}/${encodeURIComponent(chapterId)}/`;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function coverOf(img) {
  if (!img || img.length === 0) return '';
  const url = img.attr('data-original') || img.attr('data-src') || img.attr('src') || '';
  return /^data:/.test(url) ? '' : absolute(url);
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('ul.list-episode-item li').each((_, el) => {
    const card = $(el);
    const link = card.find('a.img').first();
    const mangaId = slugOf(link.attr('href'));
    if (!mangaId || seen.has(mangaId) || !/\/series\//.test(link.attr('href') || '')) return;
    const title = cleanText(card.find('h3.title').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    results.push({ mangaId, title, image: coverOf(card.find('img').first()), medium: 'anime', webURL: detailUrlOf(mangaId) });
  });
  return results;
}

function hasNext($) {
  let next = false;
  $('.pagination a, ul.pagination li a, a.next').each((_, a) => {
    if (/next/i.test($(a).text())) next = true;
  });
  return next;
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
    try {
      const $ = cheerio.load(await this.requestHTML(`${SITE}/genres/`));
      const tags = [];
      const seen = new Set();
      $('a.img[href*="/genres/"]').each((_, a) => {
        const id = slugOf($(a).attr('href'));
        const label = cleanText($(a).find('h3.title').text()) || cleanText($(a).attr('title'));
        if (id && label && !seen.has(id)) {
          seen.add(id);
          tags.push({ id, label });
        }
      });
      return tags;
    } catch (e) {
      console.error('KissAsian getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async matureSet() {
    if (this.matureIds) return this.matureIds;
    const ids = new Set();
    try {
      for (let page = 1; page <= 5; page++) {
        const $ = cheerio.load(await this.requestHTML(`${SITE}/genres/mature/${page > 1 ? `page/${page}/` : ''}`));
        const cards = parseCards($);
        cards.forEach((c) => ids.add(c.mangaId));
        if (!cards.length || !hasNext($)) break;
      }
    } catch (e) {
      if (e && e.kind === 'challenge') throw e;
      console.error('KissAsian could not read the Mature genre: ' + (e && e.message));
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

    let url;
    if (query) {
      url = page > 1 ? `${SITE}/page/${page}/?s=${encodeURIComponent(query)}&type=movies` : `${SITE}/?s=${encodeURIComponent(query)}&type=movies`;
    } else if (tags.length) {
      url = `${SITE}/genres/${encodeURIComponent(tags[0].id)}/${page > 1 ? `page/${page}/` : ''}`;
    } else {
      const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
      url = `${SITE}${feed.path}${page > 1 ? `page/${page}/` : ''}`;
    }

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1 && !(e && e.kind === 'challenge')) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parseCards($);
    const mature = await this.matureSet();
    results.forEach((r) => {
      if (mature.has(r.mangaId)) r.ageRating = 18;
    });
    return { results, metadata: results.length > 0 && hasNext($) ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const info = $('.details .info').first();
    const title = cleanText(info.find('h1').first().text()) || mangaId;
    const image = coverOf($('.details .img img').first()) || absolute($('meta[property="og:image"]').attr('content'));

    const field = (label) => {
      let found = null;
      info.find('p').each((_, p) => {
        const node = $(p);
        const name = cleanText(node.find('span').first().text()).replace(/:$/, '');
        if (name.toLowerCase() === label.toLowerCase()) {
          found = node;
          return false;
        }
      });
      return found;
    };
    const textOf = (label) => {
      const node = field(label);
      if (!node) return '';
      const clone = node.clone();
      clone.find('span').first().remove();
      return cleanText(clone.text());
    };

    const tags = [];
    const genres = field('Genre');
    if (genres) {
      genres.find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
    }
    const country = textOf('Country');
    if (country && tags.indexOf(country) === -1) tags.push(country);

    const status = mapStatus(textOf('Status'));
    const result = {
      title,
      image,
      desc: '',
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'anime',
    };
    const other = textOf('Other name');
    if (other) result.altTitles = other.split(/\s*,\s*/).filter(Boolean);
    const network = textOf('Original Network');
    if (network) result.author = network;
    const year = /\((\d{4})\)/.exec(title);
    if (year) result.releaseDate = year[1];
    const mature = await this.matureSet();
    if (mature.has(mangaId) || tags.indexOf('Mature') !== -1) result.ageRating = 18;
    return { mangaInfo: result };
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
    const seriesTitle = cleanText($('.details .info h1').first().text());
    const rows = [];
    const seen = new Set();
    $('ul.list-episode-item-2.all-episode li').each((_, el) => {
      const link = $(el).find('a').first();
      const id = slugOf(link.attr('href'));
      if (!id || seen.has(id)) return;
      seen.add(id);
      const full = cleanText($(el).find('h3.title').first().text());
      let name = full;
      if (seriesTitle && full.toLowerCase().indexOf(seriesTitle.toLowerCase()) === 0) name = cleanText(full.slice(seriesTitle.length));
      const tail = /\b(episode\s*\d.*)$/i.exec(name || full);
      if (tail) name = cleanText(tail[1]);
      const number = /episode[\s-]*(\d+(?:\.\d+)?)/i.exec(id) || /episode\s*(\d+(?:\.\d+)?)/i.exec(full);
      const row = { id, chapterId: id, name: name || full || id };
      if (number) row.number = parseFloat(number[1]);
      rows.push(row);
    });
    if (!rows.length) throw new Error('KissAsian lists no episodes for this title yet');
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    const epUrl = episodeUrlOf(chapterId);
    const $ = cheerio.load(await this.requestHTML(epUrl));
    let embed = '';
    $('iframe').each((_, f) => {
      const src = absolute($(f).attr('src') || $(f).attr('data-src') || '');
      if (!embed && src) embed = src;
    });
    if (!embed) throw new Error('KissAsian shows no player for this episode yet');
    if (embed.indexOf(PLAYER + '/player_embed.php') !== 0) {
      throw new Error('KissAsian plays this episode on ' + (/^https?:\/\/([^/]+)/i.exec(embed) || [])[1] + ', a player this extension does not read');
    }
    const episodeId = (/[?&]episode=(\d+)/.exec(embed) || [])[1];
    if (!episodeId) throw new Error('KissAsian gave no episode number for the player');

    const playerHtml = await this.requestHTML(embed, epUrl);
    const subApi = (/var\s+subApi\s*=\s*"([^"]+)"/.exec(playerHtml) || [])[1];
    const source = await this.requestJSON(`${PLAYER}/player_source.php?episode=${episodeId}`, { Referer: embed });
    const list = [];
    [source && source.src].concat((source && source.list) || []).forEach((u) => {
      if (typeof u === 'string' && /^https?:\/\//.test(u) && list.indexOf(u) === -1) list.push(u);
    });
    if (!source || source.ok !== true || !list.length) throw new Error('KissAsian has no stream for this episode yet');

    const subtitles = [];
    if (subApi) {
      try {
        const tracks = await this.requestJSON(subApi.replace(/\\\//g, '/'), { Referer: PLAYER + '/' });
        (Array.isArray(tracks) ? tracks : []).forEach((t) => {
          const file = t && (t.url || (Array.isArray(t.urls) && t.urls[0]));
          if (!file) return;
          const code = String(t.lang || '').toLowerCase().slice(0, 2);
          const entry = { url: file, label: LANGUAGE_NAMES[code] || String(t.lang || 'Subtitles'), language: code || String(t.lang || '') };
          const format = String(t.format || '').toLowerCase();
          if (format === 'srt' || format === 'vtt' || format === 'ass' || format === 'ssa') entry.format = format;
          subtitles.push(entry);
        });
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        console.error('KissAsian subtitle list failed: ' + (e && e.message));
      }
    }

    const names = subtitles.map((t) => t.label);
    const soft = names.length ? ', Softsub: ' + (names.length <= 3 ? names.join(', ') : `${names[0]} and ${names.length - 1} more`) : '';
    return list.map((url, i) => {
      const video = { url, quality: 'Auto' + soft, type: 'hls', server: i === 0 ? 'DramaVibe' : `DramaVibe ${i + 1}`, headers: { Referer: PLAYER + '/' } };
      if (subtitles.length) video.subtitles = subtitles;
      return video;
    });
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
    if (response.status < 200 || response.status >= 300) throw new Error(`KissAsian HTTP ${response.status}`);
    return String(response.data || '');
  }

  async requestJSON(url, extraHeaders) {
    const headers = Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, extraHeaders || {});
    const response = await this.send({ url, method: 'GET', headers });
    if (response.status < 200 || response.status >= 300) throw new Error(`KissAsian HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('KissAsian answered a page that is not data');
    }
  }
}

module.exports = { Source };
