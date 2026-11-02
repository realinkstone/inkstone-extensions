const MIRRORS = ['kagane.moe', 'kagane.cx', 'kagane.net'];
let mirrorIx = 0;

function siteBase() {
  return `https://${MIRRORS[mirrorIx]}`;
}

function parseJsonBody(text) {
  const body = String(text || '').trim();
  if (body.charAt(0) !== '<') return JSON.parse(body);
  const $ = cheerio.load(body);
  const pre = $('pre').first();
  return JSON.parse((pre.length ? pre.text() : $('body').text()).trim());
}

function mirrorFailed(error) {
  const status = /HTTP (\d{3})/.exec(String((error && error.message) || error));
  if (!status) return true;
  const code = Number(status[1]);
  return code >= 500 || code === 403 || (code >= 300 && code < 400);
}

const SERIES_TTL_MS = 5 * 60 * 1000;

function ageRatingFor(item) {
  const r = String((item && (item.age_rating || item.content_rating)) || '').toLowerCase();
  let age = 16;
  if (r === 'safe') age = 0;
  else if (r === 'fifteenplus' || r === 'suggestive') age = 16;
  else if (r === 'eighteenplus' || r === 'erotica' || r === 'pornographic') age = 18;
  if (item && item.is_pornographic) age = 18;
  else if (item && item.is_disturbing && age < 16) age = 16;
  return age;
}

function mapStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('abandon')) return 'CANCELLED';
  return 'UNKNOWN';
}

function coverUrl(id) {
  return id ? `${siteBase()}/api/v2/image/${id}/compressed` : undefined;
}

function mainCoverImageId(series) {
  const covers = Array.isArray(series.series_covers) ? series.series_covers : [];
  const main = covers.find((c) => c && c.is_main && c.image_id) || covers.find((c) => c && c.image_id);
  return main ? main.image_id : series.main_cover_id;
}

function names(list, pick) {
  return (Array.isArray(list) ? list : []).map(pick).filter((n) => typeof n === 'string' && n);
}

function searchResultToPartialManga(item) {
  return {
    mangaId: String(item.series_id),
    title: item.title,
    image: coverUrl(item.cover_image_id),
    status: mapStatus(item.publication_status),
    ageRating: ageRatingFor(item),
    tags: names(item.genre_list, (g) => g && g.name),
    chapters: typeof item.current_books === 'number' ? item.current_books : undefined,
    webURL: `${siteBase()}/series/${item.series_id}`,
    medium: 'comics',
  };
}

const FEED_SORTS = {
  latest: 'updated_at,desc',
  popular: 'avg_views_week,desc',
  added: 'created_at,desc',
};

const RATINGS = ['Safe', 'FifteenPlus', 'EighteenPlus'];

function wantedRatings() {
  const v = App.getSourceSetting('contentRating');
  if (v === 'safe') return ['Safe'];
  if (v === '15') return ['Safe', 'FifteenPlus'];
  return RATINGS;
}

function wantedLanguage() {
  const v = App.getSourceSetting('language');
  if (!v) return 'en';
  return v === 'any' ? null : v;
}

function tagIds(list) {
  return (Array.isArray(list) ? list : []).map((t) => t && t.id).filter(Boolean);
}

function readerScript(bookId) {
  return `
(function () {
  var BOOK = ${JSON.stringify(bookId)};
  var finished = false;
  var gateSeen = false;
  var gateClicked = false;
  function finish(fn) { if (finished) return; finished = true; fn(); }
  function onChallenge() {
    return /just a moment/i.test(document.title || '') || /__cf_chl/.test(location.href);
  }
  function pagesFrom(json) {
    var list = json && json.manifest && json.manifest.pages;
    if (!json || !json.access_token || !Array.isArray(list) || list.length === 0) return null;
    var base = String(json.cache_url || 'https://kstatic.to').replace(/\\/+$/, '');
    return list.slice().sort(function (a, b) { return a.page_no - b.page_no; }).map(function (p) {
      return base + '/api/v2/books/page/' + encodeURIComponent(BOOK) + '/' + p.page_id + '.' + (p.ext || 'jxl') + '?token=' + json.access_token;
    });
  }
  var realFetch = window.fetch;
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : ((input && input.url) || '');
    var result = realFetch.apply(this, arguments);
    try {
      if (url.indexOf('/api/v2/books/' + BOOK) !== -1 && url.indexOf('intent=Read') !== -1) {
        result.then(function (res) {
          if (!res.ok) return null;
          return res.clone().json().then(function (json) {
            var pages = pagesFrom(json);
            if (pages) finish(function () { __reportResult({ pages: pages, origin: location.origin }); });
          });
        }).catch(function () {});
      }
    } catch (e) {}
    return result;
  };
  function lookForPrompt() {
    if (finished || gateClicked) return;
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var label = (buttons[i].textContent || '').replace(/\\s+/g, ' ').trim();
      if (/^only this time$/i.test(label)) {
        gateSeen = true;
        gateClicked = true;
        buttons[i].click();
        return;
      }
    }
  }
  function watchPage() {
    if (!document.documentElement) { setTimeout(watchPage, 10); return; }
    lookForPrompt();
    try {
      new MutationObserver(lookForPrompt).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
  }
  watchPage();
  setInterval(lookForPrompt, 250);
  var since = Date.now();
  var clock = setInterval(function () {
    if (finished) { clearInterval(clock); return; }
    if (onChallenge()) { since = Date.now(); return; }
    if (Date.now() - since >= 45000) {
      clearInterval(clock);
      finish(function () {
        __reportError('the reader never answered with a page list within 45 s' + (gateSeen ? ' (after the 18+ prompt was accepted)' : ''));
      });
    }
  }, 500);
})();
`;
}

class Source {
  constructor() {
    this._series = new Map();
    this._genres = null;
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
      { id: 'popular', name: 'Popular This Week' },
      { id: 'added', name: 'Recently Added' },
    ];
  }

  async getSearchTags() {
    try {
      if (!this._genres) {
        const json = await this._get('/api/v2/genres/list');
        this._genres = (Array.isArray(json) ? json : []).map((g) => ({ id: g.id, label: g.genre_name }));
      }
      return this._genres;
    } catch (e) {
      console.error('Kagane getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page1Based = Math.max(1, (metadata && metadata.page) || 1);
    const sort = query ? '' : (FEED_SORTS[request && request.feed] || FEED_SORTS.latest);
    const size = query ? 20 : 30;
    const body = { age_rating: wantedRatings() };
    if (query) body.title = query;
    const language = wantedLanguage();
    if (language) body.content_lang = [language];
    const include = tagIds(request && request.includedTags);
    const exclude = tagIds(request && request.excludedTags);
    if (include.length || exclude.length) body.genres = { values: include, exclude };
    const path = `/api/v2/search/series?page=${page1Based - 1}&size=${size}` +
      (sort ? `&sort=${encodeURIComponent(sort)}` : '');
    const json = await this._post(path, body);
    const list = Array.isArray(json && json.content) ? json.content : [];
    const hasMore = json ? !json.last && list.length > 0 : false;
    return {
      results: list.map((item) => searchResultToPartialManga(item)),
      metadata: hasMore ? { page: page1Based + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const { series, index } = await this._seriesData(mangaId);
    const staff = Array.isArray(series.series_staff) ? series.series_staff : [];
    const writers = names(staff, (s) => (/author|story|writer/i.test(s.role || '') ? s.name : null));
    const tags = [
      ...names(series.genres, (g) => g && g.genre_name),
      ...names(series.tags, (t) => (t && !t.is_spoiler ? t.tag_name : null)),
    ];
    return {
      mangaInfo: {
        title: series.title,
        image: coverUrl(mainCoverImageId(series)),
        desc: series.description,
        status: mapStatus(series.publication_status),
        ageRating: ageRatingFor(series),
        tags,
        author: writers.length ? writers.join(', ') : undefined,
        chapters: index && typeof index.count === 'number' ? index.count : undefined,
        webURL: `${siteBase()}/series/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const { index } = await this._seriesData(mangaId);
    const columns = {};
    (Array.isArray(index.fields) ? index.fields : []).forEach((name, i) => { columns[name] = i; });
    const groups = Array.isArray(index.groups) ? index.groups : [];
    const books = Array.isArray(index.books) ? index.books : [];
    const get = (row, name) => (name in columns ? row[columns[name]] : undefined);
    const chapters = books.map((row) => {
      const chapterNo = get(row, 'chapter_no');
      const sortNo = get(row, 'sort_no');
      const number = parseFloat(chapterNo);
      const released = get(row, 'released_at');
      const volume = get(row, 'volume_no');
      const who = names(get(row, 'group_ix'), (ix) => (groups[ix] && groups[ix].title));
      const title = get(row, 'title');
      return {
        id: String(get(row, 'book_id')),
        name: title || `Ch. ${chapterNo}`,
        number: Number.isFinite(number) ? number : (Number(sortNo) || 0),
        volume: volume === null || volume === undefined || volume === '' ? undefined : String(volume),
        group: who.length ? who.join(' & ') : undefined,
        time: typeof released === 'number' ? released * 1000 : undefined,
        _sort: typeof sortNo === 'number' ? sortNo : 0,
      };
    });
    chapters.sort((a, b) => (a.number - b.number) || (a._sort - b._sort));
    return chapters.map((c) => {
      const { _sort, ...chapter } = c;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const result = await this._onMirror(async (base) => {
      const answer = await App.executeInWebView({
        url: `${base}/series/${encodeURIComponent(mangaId)}/reader/${encodeURIComponent(chapterId)}`,
        baseUrl: `${base}/`,
        script: readerScript(chapterId),
        timeoutMs: 170000,
        runBeforePageScripts: true,
      });
      if ('error' in answer) throw new Error('Kagane chapter fetch failed: ' + answer.error);
      return answer;
    }, 2);
    const value = result.value;
    const pages = Array.isArray(value) ? value : (value && Array.isArray(value.pages) ? value.pages : []);
    if (pages.length === 0) throw new Error('Kagane returned no pages for this chapter');
    const origin = (value && !Array.isArray(value) && value.origin) || siteBase();
    return { id: chapterId, mangaId, pages, headers: { Origin: origin, Referer: `${origin}/` } };
  }

  async _seriesData(mangaId) {
    const hit = this._series.get(mangaId);
    if (hit && Date.now() - hit.at < SERIES_TTL_MS) return hit.promise;
    const promise = this._loadSeries(mangaId).catch((e) => {
      this._series.delete(mangaId);
      throw e;
    });
    this._series.set(mangaId, { at: Date.now(), promise });
    return promise;
  }

  async _loadSeries(mangaId) {
    const id = encodeURIComponent(mangaId);
    const seriesPath = `/api/v2/series/${id}`;
    const indexPath = `/api/v2/series/${id}/books/index?fields=List`;
    try {
      const [series, index] = await Promise.all([this._plain(seriesPath), this._plain(indexPath)]);
      return { series, index };
    } catch (plainError) {
      const value = await this._inPage(`
        Promise.all([__fetchJSON(${JSON.stringify(seriesPath)}), __fetchJSON(${JSON.stringify(indexPath)})])
          .then(function (r) { __reportResult({ series: r[0], index: r[1] }); },
                function (e) { __reportError('series failed: ' + e.message); });
      `);
      if (!value || !value.series || !value.index) throw plainError;
      return value;
    }
  }

  async _get(path) {
    try {
      return await this._plain(path);
    } catch (plainError) {
      return this._inPage(`__fetchJSON(${JSON.stringify(path)}).then(__reportResult, function (e) { __reportError(e.message); });`);
    }
  }

  async _onMirror(run, tries) {
    const count = Math.min(tries || MIRRORS.length, MIRRORS.length);
    let lastError = null;
    for (let attempt = 0; attempt < count; attempt += 1) {
      const ix = (mirrorIx + attempt) % MIRRORS.length;
      try {
        const result = await run(`https://${MIRRORS[ix]}`);
        mirrorIx = ix;
        return result;
      } catch (e) {
        lastError = e;
        if (!mirrorFailed(e)) {
          mirrorIx = ix;
          throw e;
        }
        console.warn(`Kagane: ${MIRRORS[ix]} did not work (${e && e.message}), trying the next address`);
      }
    }
    throw lastError;
  }

  async _plain(path) {
    return this._onMirror(async (base) => {
      const manager = App.createRequestManager({});
      const request = App.createRequest({
        url: `${base}${path}`,
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const response = await manager.schedule(request);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}`);
      }
      return parseJsonBody(response.data);
    });
  }

  async _post(path, body) {
    try {
      return await this._onMirror(async (base) => {
        const manager = App.createRequestManager({});
        const request = App.createRequest({
          url: `${base}${path}`,
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Origin: base,
            Referer: `${base}/`,
          },
          body: JSON.stringify(body),
        });
        const response = await manager.schedule(request);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response.status}`);
        }
        return parseJsonBody(response.data);
      });
    } catch (plainError) {
      return this._inPage(`
        __fetchJSON(${JSON.stringify(path)}, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: ${JSON.stringify(JSON.stringify(body))},
        }).then(__reportResult, function (e) { __reportError('search failed: ' + e.message); });
      `);
    }
  }

  async _inPage(script) {
    return this._onMirror(async (base) => {
      const result = await App.executeInWebView({
        url: `${base}/version.json`,
        baseUrl: `${base}/`,
        script,
        timeoutMs: 170000,
        runBeforePageScripts: false,
      });
      if ('error' in result) throw new Error('Kagane request failed: ' + result.error);
      return result.value;
    }, 2);
  }
}

module.exports = { Source };
