const SITE = 'https://www.animegg.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 25;
const RELEASE_PAGE_SIZE = 10;

const FEEDS = [
  { id: 'popular', name: 'Popular', query: 'sortBy=hits&sortDirection=DESC' },
  { id: 'ongoing', name: 'Ongoing', query: 'ongoing=true&sortBy=hits&sortDirection=DESC' },
  { id: 'completed', name: 'Completed', query: 'ongoing=false&sortBy=hits&sortDirection=DESC' },
  { id: 'new', name: 'New', query: 'sortBy=createdAt&sortDirection=DESC' },
  { id: 'az', name: 'A-Z', query: 'sortBy=sortLetter&sortDirection=ASC' },
  { id: 'releases', name: 'Latest episodes' },
];

const GENRES = [
  'action', 'adventure', 'comedy', 'demons', 'drama', 'ecchi', 'fantasy', 'game', 'harem', 'historical', 'horror', 'josei',
  'kids', 'magic', 'martial arts', 'mecha', 'military', 'music', 'mystery', 'parody', 'police', 'psychological', 'romance',
  'samurai', 'school life', 'scifi', 'seinen', 'shoujo', 'shoujo ai', 'shounen', 'shounen ai', 'slice of life', 'space',
  'sports', 'super power', 'supernatural', 'thriller', 'vampire', 'yaoi', 'yuri',
];
const ADULT_GENRES = ['hentai', 'erotica'];

function absolute(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  return SITE + (raw.startsWith('/') ? '' : '/') + raw;
}

function slugOf(href) {
  const match = /\/series\/([^/?#]+)/i.exec(String(href || ''));
  return match ? decodeURIComponent(match[1]) : '';
}

function ageRatingOf(genres) {
  const names = (genres || []).map((g) => String(g).toLowerCase().trim());
  if (names.some((g) => ADULT_GENRES.indexOf(g) !== -1)) return 18;
  if (names.indexOf('ecchi') !== -1) return 16;
  return 0;
}

function statusOf(text) {
  const t = String(text || '').toLowerCase();
  if (t.indexOf('ongoing') !== -1) return 'ONGOING';
  if (t.indexOf('complete') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
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
    this.adultSlugs = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g.replace(/\b\w/g, (c) => c.toUpperCase()) }));
  }

  async adultSet() {
    if (this.adultSlugs) return this.adultSlugs;
    const set = new Set();
    for (const genre of ADULT_GENRES) {
      try {
        const html = await this.text(`${SITE}/genre/${encodeURIComponent(genre)}`);
        const $ = cheerio.load(html);
        $('a[href^="/series/"]').each((_, a) => {
          const slug = slugOf($(a).attr('href'));
          if (slug) set.add(slug);
        });
      } catch (e) {
        console.error('AnimeGG adult genre list failed:', e && e.message);
      }
    }
    this.adultSlugs = set;
    return set;
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;
    const adult = await this.adultSet();

    if (query) {
      const html = await this.text(`${SITE}/search/?q=${encodeURIComponent(query)}`);
      const $ = cheerio.load(html);
      const results = [];
      const seen = new Set();
      $('a.mse').each((_, a) => {
        const mangaId = slugOf($(a).attr('href'));
        if (!mangaId || seen.has(mangaId)) return;
        seen.add(mangaId);
        results.push({
          mangaId,
          title: $(a).find('h2').first().text().trim() || mangaId,
          image: absolute($(a).find('img').first().attr('src')),
          ageRating: adult.has(mangaId) ? 18 : undefined,
          webURL: `${SITE}/series/${mangaId}`,
          medium: 'anime',
        });
      });
      return { results };
    }

    let url;
    let step = PAGE_SIZE;
    if (included.length > 0 && included[0] && included[0].id) {
      url = `${SITE}/genre/${encodeURIComponent(String(included[0].id))}?start=${(page - 1) * PAGE_SIZE}`;
    } else {
      const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
      if (feed.id === 'releases') {
        url = `${SITE}/releases?start=${(page - 1) * RELEASE_PAGE_SIZE}`;
        step = RELEASE_PAGE_SIZE;
      } else {
        url = `${SITE}/popular-series?${feed.query}&start=${(page - 1) * 10}`;
      }
    }

    const html = await this.text(url);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('li.fea').each((_, li) => {
      const el = $(li);
      const link = el.find('.rightpop a[href^="/series/"], a.releaseLink').first();
      const mangaId = slugOf(link.attr('href'));
      if (!mangaId || seen.has(mangaId)) return;
      seen.add(mangaId);
      const genres = el.find('a[href^="/genre/"]').map((__, g) => $(g).text().trim()).get();
      const rating = adult.has(mangaId) ? 18 : ageRatingOf(genres);
      results.push({
        mangaId,
        title: link.text().trim() || mangaId,
        image: absolute(el.find('.img img, .releaseImg img').first().attr('src')),
        summary: el.find('.desfea').first().text().trim() || undefined,
        tags: genres.length ? genres : undefined,
        ageRating: rating || undefined,
        webURL: `${SITE}/series/${mangaId}`,
        medium: 'anime',
      });
    });
    return {
      results,
      metadata: results.length >= step ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const html = await this.text(`${SITE}/series/${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(html);
    const title = $('.media-body .first h1').first().text().trim() || $('h1').last().text().trim() || mangaId;
    const image = absolute($('.media .media-object').first().attr('src'));
    const desc = $('p.ptext').first().text().trim();
    const tags = $('.tagscat a').map((_, a) => $(a).text().trim()).get().filter(Boolean);
    const infoText = $('.infoami').text();
    const alt = /Alternate Titles:\s*([^\n]+?)(?:Status:|$)/i.exec($('.infoami').map((_, p) => $(p).text()).get().join('\n'));
    const adult = await this.adultSet();
    const ageRating = adult.has(mangaId) ? 18 : ageRatingOf(tags);
    return {
      mangaInfo: {
        title,
        image,
        desc: desc || undefined,
        status: statusOf(infoText),
        tags,
        ageRating,
        altTitles: alt ? alt[1].split(';').map((s) => s.trim()).filter(Boolean) : undefined,
        webURL: `${SITE}/series/${mangaId}`,
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
    const html = await this.text(`${SITE}/series/${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(html);
    const episodes = [];
    const seen = new Set();
    $('ul.newmanga li').each((idx, li) => {
      const el = $(li);
      const href = String(el.find('a.anm_det_pop').first().attr('href') || '').replace(/#.*$/, '');
      const chapterId = href.replace(/^\/+/, '');
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);
      const label = el.find('.anititle').first().text().trim();
      const numMatch = /(\d+(?:\.\d+)?)\s*$/.exec(label) || /-episode-(\d+(?:\.\d+)?)$/i.exec(chapterId);
      const number = numMatch ? parseFloat(numMatch[1]) : undefined;
      const versions = [];
      if (el.find('.btn-subbed').length) versions.push('Sub');
      if (el.find('.btn-dubbed').length) versions.push('Dub');
      episodes.push({
        id: chapterId,
        chapterId,
        name: label || `Episode ${number !== undefined ? number : idx + 1}`,
        number: number !== undefined ? number : undefined,
        group: versions.join(', ') || undefined,
      });
    });
    if (!episodes.length) throw new Error('AnimeGG has no episodes for this title yet');
    return episodes;
  }

  async getVideos(mangaId, chapterId) {
    const slug = String(chapterId || '').replace(/^\/+/, '');
    const epUrl = `${SITE}/${slug}`;
    const html = await this.text(epUrl);
    const $ = cheerio.load(html);

    const tabs = [];
    $('#videos li a[data-id]').each((_, a) => {
      const id = String($(a).attr('data-id') || '').trim();
      const version = String($(a).attr('data-version') || '').toLowerCase();
      if (id) tabs.push({ id, version });
    });
    if (!tabs.length) throw new Error('AnimeGG has no video for this episode yet');

    const videos = [];
    for (const tab of tabs) {
      let embed;
      try {
        embed = await this.text(`${SITE}/embed/${tab.id}`, { Referer: epUrl });
      } catch (e) {
        console.error('AnimeGG embed failed:', e && e.message);
        continue;
      }
      const list = /var\s+videoSources\s*=\s*(\[[\s\S]*?\])\s*;/.exec(embed);
      if (!list) continue;
      const found = [];
      for (const m of list[1].matchAll(/file:\s*"([^"]+)"\s*,\s*label:\s*"([^"]*)"/g)) {
        found.push({ file: m[1], label: m[2] });
      }
      found.sort((a, b) => (parseInt(b.label, 10) || 0) - (parseInt(a.label, 10) || 0));
      const kind = tab.version === 'dubbed' ? 'Dub' : 'Hardsub';
      for (const f of found) {
        videos.push({
          url: absolute(f.file),
          quality: `${f.label} ${kind}`.trim(),
          type: 'mp4',
          server: 'AnimeGG',
          headers: { Referer: `${SITE}/` },
        });
      }
    }
    if (!videos.length) throw new Error('AnimeGG listed no playable video for this episode');
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url, extraHeaders) {
    const response = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, extraHeaders || {}),
      })
    );
    if (response.status === 404) throw new Error('AnimeGG: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeGG: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
