const SITE_BASE = 'https://comix.to';
const PAGE_SIZE = 24;

const LAZY_PAGE_SENTINEL = 'boundless-lazy-page';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';

const MAX_CHAPTER_PAGES = 120;

const CHAPTER_WALK_BUDGET_MS = 45000;

const CHAPTER_PAGES_TTL_MS = 30 * 60 * 1000;

function extractInitialData(html) {
  const match = /<script[^>]*id="initial-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('Comix: no initial-data in page');
  return JSON.parse(match[1]);
}

function findQueryValue(initialData, ...needles) {
  const queries = (initialData && initialData.queries) || {};
  const key = Object.keys(queries).find((k) => needles.every((n) => k.includes(n)));
  return key ? queries[key] : undefined;
}

function itemsOf(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.items)) return value.items;
  return [];
}

const ORACLE_PREAMBLE = `
  function __findQueryClient() {
    var el = document.getElementById('app-root') || document.body && document.body.firstElementChild;
    if (!el) return null;
    var key = null, keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactContainer$') === 0 || keys[i].indexOf('__reactFiber$') === 0) { key = keys[i]; break; }
    }
    if (!key) return null;
    var node = el[key], steps = 0;
    while (node && steps < 40000) {
      steps++;
      var props = node.memoizedProps;
      if (props && typeof props === 'object') {
        var pk = Object.keys(props);
        for (var j = 0; j < pk.length; j++) {
          var v = props[pk[j]];
          if (v && typeof v === 'object' && typeof v.getQueryCache === 'function') return v;
        }
      }
      var st = node.memoizedState;
      if (st && st.memoizedState && typeof st.memoizedState.getQueryCache === 'function') return st.memoizedState;
      if (node.child) { node = node.child; continue; }
      while (node && !node.sibling) node = node.return;
      node = node ? node.sibling : null;
    }
    return null;
  }

  function __matchingEntries(needles) {
    var qc = __findQueryClient();
    if (!qc) return [];
    return qc.getQueryCache().getAll().filter(function (q) {
      var key = JSON.stringify(q.queryKey);
      for (var i = 0; i < needles.length; i++) if (key.indexOf(needles[i]) === -1) return false;
      return q.state && q.state.data;
    }).map(function (q) { return { key: q.queryKey, data: q.state.data }; });
  }

  function __pollFor(needles, timeoutMs, pick) {
    var deadline = Date.now() + timeoutMs;
    var done = false;
    var unsubscribe = null;
    var subscribed = false;
    var timer = null;

    function stop() {
      done = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (e) {}
        unsubscribe = null;
      }
    }

    function arm(delay) {
      if (done || timer !== null) return;
      timer = setTimeout(attempt, delay);
    }

    function attempt() {
      timer = null;
      if (done) return;
      var result;
      try {
        result = pick(__matchingEntries(needles));
      } catch (e) {
        stop();
        return __reportError('oracle failed: ' + (e && e.message ? e.message : String(e)));
      }
      if (result !== undefined && result !== null) {
        stop();
        return __reportResult(result);
      }
      if (Date.now() > deadline) {
        stop();
        return __reportError('oracle timed out waiting for ' + needles.join('+'));
      }
      if (!subscribed) {
        try {
          var cache = __findQueryClient();
          cache = cache && cache.getQueryCache();
          if (cache && typeof cache.subscribe === 'function') {
            subscribed = true;
            unsubscribe = cache.subscribe(wake);
          }
        } catch (e) {}
      }
      arm(200);
    }

    function wake() {
      if (done || timer === null) return;
      clearTimeout(timer);
      timer = null;
      arm(0);
    }

    attempt();
  }
`;

function mapStatus(status) {
  switch (status) {
    case 'releasing':
      return 'ONGOING';
    case 'on_hiatus':
      return 'HIATUS';
    case 'finished':
      return 'COMPLETED';
    case 'discontinued':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
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

function termsToNames(terms) {
  return (terms || []).map((t) => t.title).filter(Boolean);
}

class Source {
  constructor() {
    this._chapterPages = new Map();
    this._chapterPagesAt = new Map();
    this._chapterUrls = new Map();
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'popular', name: 'Most Followed' },
      { id: 'rating', name: 'Trending' },
    ];
  }

  _manager() {
    return App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  async _fetchHtml(path) {
    const response = await this._manager().schedule(
      App.createRequest({ url: `${SITE_BASE}${path}`, method: 'GET', headers: { 'User-Agent': UA } }),
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Comix HTTP ${response.status} for ${path}`);
    }
    return response.data;
  }

  async _runOracle(path, script, timeoutMs) {
    const startedAt = Date.now();
    const html = await this._fetchHtml(path);
    const fetchedAt = Date.now();
    const result = await App.executeInWebView({
      html,
      baseUrl: `${SITE_BASE}${path}`,
      script: ORACLE_PREAMBLE + script,
      timeoutMs: timeoutMs || 45000,
      runBeforePageScripts: true,
    });
    console.warn(
      `[comix] oracle ${path} took ${Date.now() - startedAt}ms ` +
        `(fetch ${fetchedAt - startedAt}ms, webview ${Date.now() - fetchedAt}ms)`,
    );
    if ('error' in result) throw new Error(`Comix oracle failed for ${path}: ${result.error}`);
    return result.value;
  }

  toPartialManga(manga) {
    const authors = manga.authors || manga.author;
    const artists = manga.artists || manga.artist;
    const genres = manga.genres || manga.genre;
    const demographics = manga.demographics || manga.demographic;
    const tags = [...termsToNames(genres), ...termsToNames(demographics)];
    return {
      mangaId: manga.hid,
      title: manga.title,
      image: manga.poster ? manga.poster.large || manga.poster.medium || manga.poster.small : undefined,
      author: [...termsToNames(authors), ...termsToNames(artists)].join(' / ') || undefined,
      summary: manga.synopsis || undefined,
      tags,
      medium: 'comics',
      ageRating: ageRatingFor(manga.contentRating),
      completed: manga.status === 'finished',
      releaseDate: manga.year ? String(manga.year) : undefined,
      rating: typeof manga.ratedAvg === 'number' && manga.ratedAvg > 0 ? manga.ratedAvg : undefined,
      webURL: `${SITE_BASE}/title/${manga.hid}`,
    };
  }

  toMangaInfo(manga) {
    return {
      mangaInfo: {
        ...this.toPartialManga(manga),
        desc: manga.synopsis || undefined,
        status: mapStatus(manga.status),
      },
    };
  }

  toChapter(chapter) {
    const num = typeof chapter.number === 'number' ? chapter.number : Number(chapter.number) || 0;
    return {
      id: String(chapter.id),
      chapterId: String(chapter.id),
      name: chapter.name && chapter.name.length ? chapter.name : `Chapter ${num}`,
      number: num,
      group: chapter.group ? chapter.group.name : chapter.isOfficial ? 'Official' : undefined,
    };
  }

  async getSearchResults(request, metadata) {
    const title = (request && request.title) || '';
    const feed = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;

    if (title) {
      const path = `/browse?keyword=${encodeURIComponent(title)}&page=${page}`;
      const value = await this._runOracle(
        path,
        `__pollFor(['"manga"', '"list"'], 30000, function (entries) {
           for (var i = 0; i < entries.length; i++) {
             var d = entries[i].data;
             if (d && d.items) return { items: d.items, meta: d.meta || null };
           }
           return null;
         });`,
      );
      const results = itemsOf(value).map((m) => this.toPartialManga(m));
      const meta = value && value.meta;
      const hasMore = meta ? !!meta.hasNext : results.length >= PAGE_SIZE;
      return { results, metadata: hasMore ? { page: page + 1 } : undefined };
    }

    const data = extractInitialData(await this._fetchHtml('/'));
    const value =
      feed === 'latest'
        ? findQueryValue(data, '"manga"', '"list"', '"created_at"') ||
          findQueryValue(data, '"manga"', '"list"', '"chapter_updated_at"')
        : feed === 'rating'
          ? findQueryValue(data, '"manga"', '"top"', '"trending"')
          : findQueryValue(data, '"manga"', '"top"', '"follows"');

    const results = itemsOf(value).map((m) => this.toPartialManga(m));
    return { results, metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const data = extractInitialData(await this._fetchHtml(`/title/${encodeURIComponent(mangaId)}`));
    const manga = findQueryValue(data, '"manga"', '"detail"');
    if (!manga) throw new Error('manga not found');
    return this.toMangaInfo(manga);
  }

  async getChapters(mangaId) {
    const base = `/title/${encodeURIComponent(mangaId)}`;
    const value = await this._runOracle(
      `${base}?tab=chapters&page=1`,
      `var collected = [];
       var seen = {};
       var wanted = 1;
       var maxPages = ${MAX_CHAPTER_PAGES};
       var walkDeadline = Date.now() + ${CHAPTER_WALK_BUDGET_MS};
       var basePath = ${JSON.stringify(base)};
       __pollFor(['"manga"', '"chapters"'], 60000, function (entries) {
         var entry = null;
         for (var i = 0; i < entries.length; i++) {
           var params = entries[i].key[3];
           if (params && params.page === wanted) { entry = entries[i]; break; }
         }
         if (!entry || !entry.data || !entry.data.items) return null;
         if (!seen[wanted]) {
           seen[wanted] = true;
           collected = collected.concat(entry.data.items);
           var meta = entry.data.meta || {};
           var outOfBudget = Date.now() > walkDeadline;
           if (meta.hasNext && wanted < maxPages && !outOfBudget) {
             wanted++;
             history.pushState({}, '', basePath + '?tab=chapters&page=' + wanted);
             window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
             return null;
           }
           return {
             items: collected,
             truncated: !!meta.hasNext,
             stoppedOnBudget: outOfBudget,
             pagesWalked: wanted,
             expectedTotal: typeof meta.total === 'number' ? meta.total : null,
           };
         }
         return null;
       });`,
      60000,
    );

    const chapters = [];
    itemsOf(value).forEach((raw) => {
      const chapter = this.toChapter(raw);
      if (raw.url) this._chapterUrls.set(chapter.id, raw.url);
      chapters.push(chapter);
    });

    if (value && value.truncated) {
      console.warn(
        `[comix] chapter list for ${mangaId} is incomplete: walked ${value.pagesWalked} page(s) ` +
          `and collected ${chapters.length}` +
          (value.expectedTotal ? ` of ${value.expectedTotal}` : '') +
          `. Stopped on ${value.stoppedOnBudget ? 'the time budget' : `the ${MAX_CHAPTER_PAGES}-page ceiling`}. ` +
          'The oldest chapters are the ones missing.',
      );
    }

    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const key = String(chapterId);
    const cached = this._chapterPages.get(key);
    const cachedAt = this._chapterPagesAt.get(key);
    if (cached && cached.length && cachedAt !== undefined && Date.now() - cachedAt < CHAPTER_PAGES_TTL_MS) {
      return { id: chapterId, mangaId, pages: cached.map(() => LAZY_PAGE_SENTINEL) };
    }

    const readerPath =
      this._chapterUrls.get(String(chapterId)) ||
      `/title/${encodeURIComponent(mangaId)}-x/${encodeURIComponent(chapterId)}-chapter-1`;

    const value = await this._runOracle(
      readerPath,
      `__pollFor(['"chapters"', '"detail"'], 40000, function (entries) {
         for (var i = 0; i < entries.length; i++) {
           var d = entries[i].data;
           if (!d || !d.pages) continue;
           var pages = [];
           var raw = d.pages;
           if (raw && !Array.isArray(raw) && raw.items) {
             var prefix = raw.baseUrl || '';
             for (var j = 0; j < raw.items.length; j++) {
               var it = raw.items[j];
               pages.push({ url: prefix + it.url, scramble: it.s === 1 || it.scramble === true });
             }
           } else {
             var arr = Array.prototype.slice.call(raw);
             for (var k = 0; k < arr.length; k++) {
               if (!arr[k] || !arr[k].url) continue;
               pages.push({ url: arr[k].url, scramble: arr[k].s === 1 || arr[k].scramble === true });
             }
           }
           if (pages.length) return { pages: pages };
         }
         return null;
       });`,
    );

    const pages = (value && value.pages) || [];
    this._chapterPages.set(key, pages);
    this._chapterPagesAt.set(key, Date.now());
    return { id: chapterId, mangaId, pages: pages.map(() => LAZY_PAGE_SENTINEL) };
  }

  async getPageData(mangaId, chapterId, pageIndex) {
    const pages = this._chapterPages.get(String(chapterId));
    const page = pages && pages[pageIndex];
    if (!page || !page.url) {
      return { error: `no cached page ${pageIndex} for chapter ${chapterId}` };
    }

    if (!page.scramble) return { uri: page.url, referer: `${SITE_BASE}/` };

    let response;
    try {
      response = await this._manager().schedule(
        App.createRequest({
          url: page.url,
          method: 'GET',
          headers: { 'User-Agent': UA, Referer: `${SITE_BASE}/` },
        }),
      );
    } catch (e) {
      return { error: `page ${pageIndex} fetch failed: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (response.status < 200 || response.status >= 300) return { uri: page.url, referer: `${SITE_BASE}/` };

    const headers = response.headers || {};
    const hasScrambleHeaders = Object.keys(headers).some((h) => /^x-(enc|scramble)-/i.test(h));
    if (!hasScrambleHeaders) return { uri: page.url, referer: `${SITE_BASE}/` };

    const result = await App.descrambleImage({ base64: response.data, headers });
    if ('error' in result) {
      return { uri: page.url, referer: `${SITE_BASE}/` };
    }
    return { base64: result.base64, mimeType: 'image/jpeg' };
  }
}

module.exports = { Source };
