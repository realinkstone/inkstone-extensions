const SITE_BASE = 'https://mangafire.to';
const ALL_CONTENT_RATINGS = 'safe,suggestive,erotica,pornographic';
const ORACLE_TIMEOUT_MS = 170000;

function ageRatingFor(rating) {
  if (!rating) return undefined;
  const r = rating.toLowerCase();
  if (r === 'safe') return 0;
  if (r === 'suggestive') return 16;
  if (r === 'erotica' || r === 'pornographic') return 18;
  return 16;
}

function mapStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('releas') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finish')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('drop')) return 'CANCELLED';
  return 'UNKNOWN';
}

function hidOf(mangaId) {
  return (mangaId || '').split('-')[0];
}

function stripHtml(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
}

function toPartialManga(item) {
  return {
    mangaId: `${item.hid}-${item.slug}`,
    title: item.title,
    image: item.poster && (item.poster.large || item.poster.medium),
    status: mapStatus(item.status),
    ageRating: ageRatingFor(item.contentRating),
    tags: [item.type].filter(Boolean),
    chapters: item.latestChapter,
    webURL: `${SITE_BASE}${item.url || '/title/' + item.hid + '-' + item.slug}`,
    medium: 'comics',
  };
}

class Source {
  constructor() {
    this._chaptersUrlCache = new Map();
  }

  getSourceFeeds() {
    return [{ id: 'trending', name: 'Trending' }];
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;

    if (!query) {
      const json = await this.requestJSON(
        `${SITE_BASE}/api/top-titles?type=trending&days=7&limit=30`
      );
      const items = Array.isArray(json && json.items) ? json.items : [];
      return { results: items.map((item) => toPartialManga(item)) };
    }

    const script = `
      __watchFetch('/api/titles?keyword=', 1200, 15000)
        .then(function (urls) { return __fetchJSON(urls[urls.length - 1]); })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/browse?keyword=${encodeURIComponent(query)}&sort=relevance:desc&page=${page}&content_rating=${ALL_CONTENT_RATINGS}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire search failed: ' + result.error);

    const json = result.value;
    const items = Array.isArray(json && json.items) ? json.items : [];
    const hasNext = !!(json && json.meta && json.meta.hasNext);
    return {
      results: items.map((item) => toPartialManga(item)),
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const hid = hidOf(mangaId);
    const script = `
      __watchFetch('/api/titles/${hid}', 1200, 15000)
        .then(function (urls) {
          var detailsUrl = urls.filter(function (u) { return u.indexOf('/chapters') === -1; })[0];
          var chaptersUrl = urls.filter(function (u) { return u.indexOf('/chapters') !== -1; })[0];
          if (!detailsUrl) { __reportError('no details request observed'); return; }
          __reportResult({ detailsUrl: detailsUrl, chaptersUrl: chaptersUrl || null });
        }, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/title/${encodeURIComponent(mangaId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire details failed: ' + result.error);

    const { detailsUrl, chaptersUrl } = result.value;
    if (chaptersUrl) {
      this._chaptersUrlCache.set(mangaId, { url: chaptersUrl, at: Date.now() });
    }

    const json = await this.requestJSON(detailsUrl);
    const series = json.data;
    return {
      mangaInfo: {
        title: series.title,
        image: series.poster && (series.poster.large || series.poster.medium),
        desc: stripHtml(series.synopsisHtml),
        status: mapStatus(series.status),
        ageRating: ageRatingFor(series.contentRating),
        tags: [
          ...(series.genres || []).map((g) => g.title),
          ...(series.themes || []).map((t) => t.title),
          ...(series.demographics || []).map((d) => d.title),
        ].filter(Boolean),
        author: (series.authors || []).map((a) => a.title).join(', ') || undefined,
        communityRating: typeof series.rating === 'number' ? series.rating : undefined,
        webURL: `${SITE_BASE}${series.url || '/title/' + mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const hid = hidOf(mangaId);
    const cached = this._chaptersUrlCache.get(mangaId);
    const cacheFresh = cached && Date.now() - cached.at < 120000;

    if (cacheFresh) {
      try {
        const firstPage = await this.requestJSON(cached.url);
        if (!(firstPage.meta && firstPage.meta.hasNext)) {
          return this._toChapterList(firstPage.items || []);
        }
      } catch (e) {
      }
    }

    const items = await this._fetchAllChapterPages(mangaId, hid);
    return this._toChapterList(items);
  }

  _toChapterList(items) {
    return items.map((c) => ({
      id: `${c.id}`,
      chapterId: `${c.id}`,
      name: c.name || `Chapter ${c.number}`,
      number: c.number,
      time: c.createdAt ? c.createdAt * 1000 : undefined,
    }));
  }

  async _fetchAllChapterPages(mangaId, hid) {
    const script = `
      (function () {
        var urls = [];
        var seen = new Set();
        var origFetch = window.fetch;
        window.fetch = function (input, init) {
          var url = typeof input === 'string' ? input : (input && input.url);
          var result = origFetch.apply(this, arguments);
          try {
            if (url && url.indexOf('/chapters?') !== -1 && !seen.has(url)) {
              seen.add(url);
              urls.push(url);
            }
          } catch (e) {}
          return result;
        };
        function clickNextPage() {
          var active = document.querySelector('.npager__num.is-active');
          if (!active) return false;
          var next = active.nextElementSibling;
          if (next && next.classList && next.classList.contains('npager__num')) {
            next.click();
            return true;
          }
          return false;
        }
        function advance(previousCount, stepsLeft) {
          setTimeout(function () {
            if (urls.length === previousCount || stepsLeft <= 0) { finish(); return; }
            if (clickNextPage()) advance(urls.length, stepsLeft - 1);
            else finish();
          }, 900);
        }
        function finish() {
          window.fetch = origFetch;
          if (urls.length > 0) __reportResult(urls);
          else __reportError('no chapters request observed');
        }
        setTimeout(function () { advance(0, 40); }, 1200);
      })();
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/title/${encodeURIComponent(mangaId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) {
      throw new Error('MangaFire chapters failed: ' + result.error);
    }

    const pageUrls = result.value;
    const pages = await Promise.all(pageUrls.map((u) => this.requestJSON(u)));
    const items = [];
    for (const page of pages) {
      if (Array.isArray(page.items)) items.push(...page.items);
    }
    return items;
  }

  async getChapterDetails(mangaId, chapterId) {
    const script = `
      __watchFetch('/api/chapters/${chapterId}', 1200, 15000)
        .then(function (urls) { return __fetchJSON(urls[urls.length - 1]); })
        .then(__reportResult, function (e) { __reportError(e.message || String(e)); });
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/title/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: ORACLE_TIMEOUT_MS,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('MangaFire chapter fetch failed: ' + result.error);

    const data = result.value.data;
    const pages = (Array.isArray(data.pages) ? data.pages : []).map((p) => p.url);
    return {
      id: chapterId,
      mangaId,
      pages,
      referer: `${SITE_BASE}/`,
    };
  }

  async requestJSON(url, options) {
    const method = (options && options.method) || 'GET';
    const body = options && options.body;
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method,
      headers: body
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body,
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
