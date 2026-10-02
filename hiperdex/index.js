const SITE_BASE = 'https://hiperdex.tv';
const SITE_REFERER = `${SITE_BASE}/`;
const API_BASE = `${SITE_BASE}/api/trpc`;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const COOKIE_PAGES = ['/site.webmanifest', '/'];
const TOKEN_TTL_MS = 30 * 60 * 1000;

const PAGE_SIZE = 30;
const MAX_FILL_ROUNDS = 5;
const MAX_CHAPTERS_PER_LOOKUP = 40;
const READER_TIMEOUT_MS = 45000;

const FEEDS = [
  { id: 'latest', name: 'Latest Chapters', sort: 'recent' },
  { id: 'popular', name: 'Most Popular', sort: 'popular' },
  { id: 'score', name: 'Top Rated', sort: 'score' },
  { id: 'newest', name: 'Newest Added', sort: 'newest' },
  { id: 'alphabetical', name: 'A-Z', sort: 'alphabetical' },
];
const DEFAULT_FEED = 'latest';

const BLOCKED_GENRES = new Set(['shotacon', 'shota', 'lolicon', 'loli']);

const LANGUAGE_NAMES = {
  'pt-br': 'Portuguese (Brazil)',
  pt: 'Portuguese',
  es: 'Spanish',
  fr: 'French',
  id: 'Indonesian',
  tr: 'Turkish',
  ru: 'Russian',
  it: 'Italian',
  de: 'German',
  ar: 'Arabic',
};

function blockedKey(value) {
  return String(value === undefined || value === null ? '' : value)
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

function isBlockedGenre(name) {
  return BLOCKED_GENRES.has(blockedKey(name));
}

function hasBlockedGenre(list) {
  return Array.isArray(list) && list.some(isBlockedGenre);
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function descriptionText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ageRatingFor(contentRating) {
  switch (contentRating) {
    case 'safe':
      return 0;
    case 'suggestive':
      return 16;
    case 'erotica':
    case 'pornographic':
      return 18;
    default:
      return undefined;
  }
}

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'ongoing' || s === 'releasing') return 'ONGOING';
  if (s === 'completed' || s === 'finished') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled' || s === 'canceled' || s === 'dropped') return 'CANCELLED';
  return 'UNKNOWN';
}

function absoluteUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${SITE_BASE}${value}`;
  return '';
}

function creditNames(item) {
  const names = [];
  [].concat(item.authors || [], item.artists || []).forEach((name) => {
    const clean = cleanText(name);
    if (clean && names.indexOf(clean) === -1) names.push(clean);
  });
  return names;
}

function genreNames(item) {
  const names = [];
  (Array.isArray(item.genres) ? item.genres : []).forEach((g) => {
    const clean = cleanText(typeof g === 'string' ? g : g && g.name);
    if (clean && names.indexOf(clean) === -1) names.push(clean);
  });
  return names;
}

function isBlockedTitle(item) {
  return hasBlockedGenre(item.genres) || hasBlockedGenre(item.tags);
}

function toPartialManga(item) {
  const manga = {
    mangaId: item.slug,
    title: cleanText(item.title) || item.slug,
    image: absoluteUrl(item.coverUrl),
    referer: SITE_REFERER,
    tags: genreNames(item),
    webURL: `${SITE_BASE}/manga/${encodeURIComponent(item.slug)}`,
    medium: 'comics',
  };
  const credits = creditNames(item);
  if (credits.length > 0) manga.author = credits.join(' / ');
  const summary = descriptionText(item.synopsis);
  if (summary) manga.summary = summary;
  const age = ageRatingFor(item.contentRating);
  if (age !== undefined) manga.ageRating = age;
  if (mapStatus(item.status) === 'COMPLETED') manga.completed = true;
  if (item.year) manga.releaseDate = String(item.year);
  return manga;
}

function chapterName(chapter) {
  const title = cleanText(chapter.title);
  const base = `Chapter ${chapter.number}`;
  return title ? `${base}: ${title}` : base;
}

function readerScript(slug, number, timeoutMs) {
  return `
(function () {
  if (window.top !== window) return;
  var WANT_SLUG = ${JSON.stringify(slug)};
  var WANT_NUMBER = ${JSON.stringify(number)};
  var PROCEDURE = 'reader.chapterPages';
  var finished = false;
  var deadline = Date.now() + ${timeoutMs - 5000};

  function done(pages) {
    if (finished) return;
    finished = true;
    __reportResult(pages);
  }
  function fail(message) {
    if (finished) return;
    finished = true;
    __reportError(message);
  }

  function asked(url, index) {
    try {
      var query = url.split('?')[1] || '';
      var match = /(?:^|&)input=([^&]*)/.exec(query);
      if (!match) return null;
      var input = JSON.parse(decodeURIComponent(match[1]));
      var call = input[String(index)] || input;
      return call && call.json ? call.json : null;
    } catch (e) {
      return null;
    }
  }

  function handle(url, text) {
    if (finished) return;
    var path = decodeURIComponent((url.split('?')[0].split('/api/trpc/')[1]) || '');
    var index = path.split(',').indexOf(PROCEDURE);
    if (index === -1) return;
    var wanted = asked(url, index);
    if (wanted && (wanted.seriesSlug !== WANT_SLUG || Number(wanted.chapterNumber) !== WANT_NUMBER)) return;
    var body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return fail('Hiperdex sent a reader answer that is not JSON');
    }
    var entry = Array.isArray(body) ? body[index] : body;
    if (!entry) return fail('Hiperdex sent no reader answer');
    if (entry.error) {
      var detail = entry.error.json || entry.error;
      return fail('Hiperdex reader error: ' + (detail && detail.message ? detail.message : 'unknown'));
    }
    var rows = entry.result && entry.result.data && entry.result.data.json;
    if (!Array.isArray(rows) || rows.length === 0) return fail('Hiperdex returned no pages for this chapter');
    rows = rows.slice().sort(function (a, b) { return (a.pageOrder || 0) - (b.pageOrder || 0); });
    var pages = [];
    for (var i = 0; i < rows.length; i++) {
      var src = rows[i].webpUrl || rows[i].avifUrl;
      if (src) pages.push(src);
    }
    if (pages.length === 0) return fail('Hiperdex returned pages without image URLs');
    done(pages);
  }

  var realFetch = window.fetch;
  window.fetch = function (input) {
    var promise = realFetch.apply(this, arguments);
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf(PROCEDURE) !== -1) {
        promise
          .then(function (res) { return res.clone().text(); })
          .then(function (text) { handle(url, text); })
          .catch(function () {});
      }
    } catch (e) {}
    return promise;
  };

  (function wait() {
    if (finished) return;
    if (Date.now() > deadline) return fail('Hiperdex did not load the chapter pages in time');
    setTimeout(wait, 500);
  })();
})();
`;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchTags() {
    try {
      const genres = await this.trpc('search.genres');
      const seen = new Set();
      const tags = [];
      (Array.isArray(genres) ? genres : []).forEach((g) => {
        const label = cleanText(g && g.name);
        if (!label || isBlockedGenre(label) || seen.has(label)) return;
        seen.add(label);
        tags.push({ id: label, label });
      });
      return tags;
    } catch (e) {
      console.error('HiperDEX getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = cleanText(request && request.title);
    const includedTags = (request && request.includedTags) || [];
    const excludedTags = (request && request.excludedTags) || [];
    const genres = includedTags.map((t) => t && (t.id || t.label)).filter(Boolean).map(String);
    if (genres.some(isBlockedGenre)) {
      return { results: [], metadata: undefined };
    }

    const feedId = (request && request.feed) || DEFAULT_FEED;
    const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
    const useLatest = !query && genres.length === 0 && feed.id === 'latest';

    const excluded = new Set(excludedTags.map((t) => cleanText(t && (t.label || t.id)).toLowerCase()).filter(Boolean));
    const keep = (item) =>
      item &&
      item.slug &&
      !isBlockedTitle(item) &&
      (excluded.size === 0 || !genreNames(item).some((g) => excluded.has(g.toLowerCase())));

    const rounds = excluded.size > 0 ? MAX_FILL_ROUNDS : 1;
    const seen = new Set();
    const results = [];
    let cursor = metadata;
    let next;
    for (let round = 0; round < rounds; round++) {
      const page = useLatest
        ? await this.latestPage(cursor)
        : await this.searchPage(cursor, query, genres, query ? 'relevance' : feed.sort);
      page.items.forEach((item) => {
        if (keep(item) && !seen.has(item.slug)) {
          seen.add(item.slug);
          results.push(item);
        }
      });
      next = page.next;
      cursor = next;
      if (!next || results.length >= PAGE_SIZE / 2) break;
    }

    return { results: results.map(toPartialManga), metadata: next };
  }

  async getMangaDetails(mangaId) {
    const series = await this.requestSeries(mangaId);
    const status = mapStatus(series.status);
    const mangaInfo = Object.assign(toPartialManga(series), {
      desc: descriptionText(series.synopsis),
      status,
    });
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const series = await this.requestSeries(mangaId);
    const list = await this.trpc('series.chapters', { seriesId: series.id });
    if (!Array.isArray(list)) throw new Error(`No chapter list in the response for ${mangaId}`);

    const ordered = list
      .filter((c) => c && c.status === 'published' && !c.isDeleted && c.pagesCount !== 0)
      .filter((c) => typeof c.number === 'number' && isFinite(c.number))
      .sort((a, b) => (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1));
    const seen = new Set();
    const chapters = [];
    ordered.forEach((c) => {
      const id = String(c.number);
      if (seen.has(id)) return;
      seen.add(id);
      const chapter = { id, chapterId: id, name: chapterName(c), number: c.number };
      const language = String(c.language || '').toLowerCase();
      if (language && language !== 'en') chapter.group = LANGUAGE_NAMES[language] || language.toUpperCase();
      const time = Date.parse(c.releaseAt || c.createdAt);
      if (!Number.isNaN(time)) chapter.time = time;
      chapters.push(chapter);
    });

    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    await this.requestSeries(mangaId);

    const number = Number(chapterId);
    if (!isFinite(number)) throw new Error(`Not a chapter number: ${chapterId}`);
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;

    const startedAt = Date.now();
    const result = await App.executeInWebView({
      url,
      baseUrl: SITE_REFERER,
      script: readerScript(mangaId, number, READER_TIMEOUT_MS),
      timeoutMs: READER_TIMEOUT_MS,
      runBeforePageScripts: true,
    });
    if (result && result.error) throw new Error(`HiperDEX reader failed for ${url}: ${result.error}`);
    const pages = result && Array.isArray(result.value) ? result.value.map(absoluteUrl).filter(Boolean) : [];
    if (pages.length === 0) throw new Error(`HiperDEX reader returned no pages for ${url}`);
    console.warn(`[hiperdex] reader view for ${chapterId} took ${Date.now() - startedAt}ms`);

    return { id: chapterId, mangaId, pages, referer: SITE_REFERER };
  }

  async searchPage(cursor, query, genres, sort) {
    const offset = (cursor && cursor.offset) || 0;
    const filters = {};
    if (genres.length > 0) filters.genres = genres;
    const found = await this.trpc('search.query', {
      q: query,
      sort,
      filters,
      limit: PAGE_SIZE,
      offset,
      maxRating: 'pornographic',
    });
    const hits = (found && found.hits) || [];
    const nextOffset = offset + hits.length;
    const more = hits.length > 0 && nextOffset < ((found && found.totalHits) || 0);
    return { items: hits, next: more ? { offset: nextOffset } : undefined };
  }

  async latestPage(cursor) {
    const page = (cursor && cursor.page) || 1;
    const latest = await this.latestChapters(page);
    return { items: latest.items, next: latest.hasMore ? { page: page + 1 } : undefined };
  }

  async latestChapters(page) {
    const rows = await this.trpc('recommendations.latestChapters', {
      limit: PAGE_SIZE,
      page,
      maxRating: 'pornographic',
      seriesType: 'all',
      hasSponsoredSlot: false,
    });
    const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.seriesSlug);
    const items = [];
    for (let start = 0; start < list.length; start += MAX_CHAPTERS_PER_LOOKUP) {
      const slice = list.slice(start, start + MAX_CHAPTERS_PER_LOOKUP);
      const answers = await this.trpcBatch(
        slice.map((r) => ({ proc: 'series.bySlugWithGenres', input: { slug: r.seriesSlug } })),
      );
      answers.forEach((answer) => {
        if (answer.ok && answer.data && answer.data.slug) items.push(answer.data);
      });
    }
    return { items, hasMore: Array.isArray(rows) && rows.length >= PAGE_SIZE };
  }

  async requestSeries(mangaId) {
    const series = await this.trpc('series.bySlugWithGenres', { slug: mangaId });
    if (!series || series.id === undefined || series.id === null || !series.slug) {
      throw new Error(`Could not find series data for ${mangaId}`);
    }
    if (isBlockedTitle(series)) throw new Error('title not available');
    return series;
  }

  async trpc(procedure, input) {
    const [answer] = await this.trpcBatch([{ proc: procedure, input }]);
    if (!answer.ok) throw new Error(`HiperDEX ${procedure} failed: ${answer.message}`);
    return answer.data;
  }

  async trpcBatch(calls) {
    const names = calls.map((c) => c.proc).join(',');
    const inputs = {};
    calls.forEach((c, i) => {
      inputs[i] = c.input === undefined ? { json: null, meta: { values: ['undefined'] } } : { json: c.input };
    });
    const url = `${API_BASE}/${names}?batch=1&input=${encodeURIComponent(JSON.stringify(inputs))}`;

    let response = await this.send(url, await this.sessionToken(false));
    if (response.status === 401) {
      response = await this.send(url, await this.sessionToken(true));
    }
    let body;
    try {
      body = JSON.parse(response.data);
    } catch (e) {
      throw new Error(`HiperDEX answered HTTP ${response.status} with something that is not JSON`);
    }
    const entries = Array.isArray(body) ? body : [body];
    if (entries.length !== calls.length) {
      throw new Error(`HiperDEX answered HTTP ${response.status} with ${entries.length} results for ${calls.length} calls`);
    }
    return entries.map((entry) => {
      if (entry && entry.result && entry.result.data) return { ok: true, data: entry.result.data.json };
      const error = entry && entry.error && (entry.error.json || entry.error);
      const message = error && error.message ? String(error.message) : `HTTP ${response.status}`;
      return { ok: false, message };
    });
  }

  async sessionToken(force) {
    const now = Date.now();
    if (!force && this.token && now - this.tokenAt < TOKEN_TTL_MS) return this.token;
    for (let i = 0; i < COOKIE_PAGES.length; i++) {
      const response = await this.send(`${SITE_BASE}${COOKIE_PAGES[i]}`, null);
      const token = tokenFromHeaders(response.headers);
      if (token) {
        this.token = token;
        this.tokenAt = now;
        return token;
      }
    }
    throw new Error('HiperDEX did not hand out a session cookie');
  }

  manager() {
    if (!this.requests) this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
    return this.requests;
  }

  async send(url, token) {
    const headers = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' };
    if (token) headers.Cookie = `__st=${token}`;
    const request = App.createRequest({ url, method: 'GET', headers });
    return this.manager().schedule(request);
  }
}

function tokenFromHeaders(headers) {
  if (!headers) return '';
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'set-cookie');
  if (!key) return '';
  const raw = Array.isArray(headers[key]) ? headers[key].join(', ') : String(headers[key]);
  const match = /(?:^|[,;\s])__st=([^;,\s]+)/.exec(raw);
  return match ? match[1] : '';
}

module.exports = { Source };
