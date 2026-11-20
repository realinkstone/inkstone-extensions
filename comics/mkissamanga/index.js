const SITE = 'https://mkissa.to';
const APIS = ['https://api.mkissa.net/api', 'https://api.allanime.day/api'];
const COVER_HOST = 'https://aln.youtube-anime.com/';
const IMAGE_HEADERS = { Referer: 'https://mkissa.to/' };
const HEAD_MIRRORS = { 'aln.youtube-anime.com': 'ytimgf.youtube-anime.com' };
const PAGE_SIZE = 50;
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const GENRES = ['Action', 'Adventure', 'Comedy', 'Cooking', 'Drama', 'Ecchi', 'Fantasy', 'Gender Bender', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei', 'Magic',
  'Manhua', 'Manhwa', 'Martial Arts', 'Mecha', 'Medical', 'Military', 'Music', 'Mystery', 'Psychological', 'Reincarnation', 'Romance', 'Sci-Fi', 'Seinen',
  'Shoujo', 'Shounen', 'Slice of Life', 'Sports', 'Super Power', 'Supernatural', 'Thriller', 'Tragedy', 'Webtoons', 'Yaoi', 'Yuri'];

const FEEDS = [
  { id: 'trending', name: 'Trending', sortBy: 'Trending' },
  { id: 'latest', name: 'Latest Updates', sortBy: 'Recent' },
  { id: 'popular', name: 'Popular', sortBy: 'Popular' },
  { id: 'top', name: 'Top Rated', sortBy: 'Top' },
];

const LIST_FIELDS = '_id name englishName thumbnail availableChapters genres isAdult countryOfOrigin';
const SEARCH_QUERY = `query($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeMangaEnumType, $countryOrigin: VaildCountryOriginEnumType) { mangas(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) { edges { ${LIST_FIELDS} } } }`;
const DETAIL_QUERY = 'query($_id: String!) { manga(_id: $_id) { _id name englishName nativeName thumbnail description authors genres tags status altNames availableChaptersDetail isAdult countryOfOrigin } }';

const HOOK = `(function () {
  var cap = window.__mkCap = { full: null, seen: 0 };
  function find(v, depth) {
    if (!v || typeof v !== 'object' || depth > 4) return null;
    if (v.chapterPages && typeof v.chapterPages === 'object') return v.chapterPages;
    var keys = Object.keys(v);
    for (var i = 0; i < keys.length && i < 12; i++) { var r = find(v[keys[i]], depth + 1); if (r) return r; }
    return null;
  }
  function grab(v) { try { var f = find(v, 0); if (f && f.edges) cap.full = f; } catch (e) {} }
  var decode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function () {
    var text = decode.apply(this, arguments);
    try { if (text && text.length > 200 && text.indexOf('"chapterPages"') >= 0) { cap.seen++; grab(JSON.parse(text)); } } catch (e) {}
    return text;
  };
  var parse = JSON.parse;
  JSON.parse = function () { var v = parse.apply(this, arguments); grab(v); return v; };
  var json = Response.prototype.json;
  Response.prototype.json = function () { return json.apply(this, arguments).then(function (v) { grab(v); return v; }); };
})();`;

function pageScript(chapterPath, waitMs) {
  return `(async function () {
  var target = ${JSON.stringify(chapterPath)};
  var limit = Date.now() + ${waitMs};
  function sleep(ms) {
    return new Promise(function (resolve) {
      var end = Date.now() + ms, done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      setTimeout(finish, ms);
      var ch = new MessageChannel();
      ch.port1.onmessage = function () { if (Date.now() >= end) finish(); else if (!done) ch.port2.postMessage(0); };
      ch.port2.postMessage(0);
    });
  }
  function checkShowing() {
    if (/just a moment|attention required|verify you are human/i.test(document.title || '')) return true;
    var d = document.querySelector('.captcha-overlay');
    if (d && !d.hasAttribute('inert') && d.getAttribute('aria-hidden') !== 'true' && getComputedStyle(d).visibility !== 'hidden') return true;
    return !!document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-form, .cf-turnstile');
  }
  try {
    while (Date.now() < limit && !(document.body && document.body.innerText.length > 300 && document.querySelector('.tab-nav'))) {
      if (checkShowing()) return __reportResult({ check: true });
      await sleep(200);
    }
    var a = document.createElement('a');
    a.href = target;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    while (Date.now() < limit) {
      var cap = window.__mkCap;
      if (cap && cap.full) {
        var edges = (cap.full.edges || []).map(function (e) {
          return { sourceName: e.sourceName, streamerId: e.streamerId, head: e.pictureUrlHead || null, pictures: (e.pictureUrls || []).map(function (p) { return [p.num, p.url]; }) };
        });
        return __reportResult({ edges: edges });
      }
      if (checkShowing()) return __reportResult({ check: true });
      await sleep(250);
    }
    __reportResult({ timeout: true });
  } catch (e) {
    __reportError(String(e && e.message || e));
  }
})();`;
}

function plain(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

function ageOf(genres, isAdult) {
  const names = (genres || []).map((g) => String(g).toLowerCase());
  if (isAdult || names.some((n) => /^(hentai|adult|smut|erotica|pornographic)$/.test(n))) return 18;
  if (names.some((n) => /^(ecchi|mature)$/.test(n))) return 16;
  return undefined;
}

function coverOf(path) {
  if (!path) return undefined;
  return /^https?:/.test(path) ? path : COVER_HOST + String(path).replace(/^\//, '');
}

function statusOf(text) {
  const s = String(text || '').toLowerCase();
  if (/releas|ongoing/.test(s)) return 'ONGOING';
  if (/finish|complet/.test(s)) return 'COMPLETED';
  if (/hiatus/.test(s)) return 'HIATUS';
  if (/cancel|discontinu/.test(s)) return 'CANCELLED';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
    this.details = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchTags() {
    return GENRES.map((name) => ({ id: name, label: name }));
  }

  async graphql(query, variables) {
    let last = null;
    for (const api of APIS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let json;
        try {
          const response = await this.requests.schedule(App.createRequest({
            url: api,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: SITE, Referer: `${SITE}/`, 'User-Agent': BROWSER_UA },
            body: JSON.stringify({ query, variables }),
          }));
          if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
          json = JSON.parse(response.data);
        } catch (e) {
          last = e;
          break;
        }
        const message = json.errors && json.errors[0] && String(json.errors[0].message);
        const wait = message && /too many requests/i.test(message) ? parseInt((/(\d+)\s*second/i.exec(message) || [])[1], 10) : NaN;
        if (!Number.isNaN(wait) && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 10) * 1000 + 300));
          continue;
        }
        if (message) throw new Error(`MKissa: ${message}`);
        return json.data;
      }
    }
    throw new Error(`MKissa: the API could not be reached (${last && last.message})`);
  }

  async getSearchResults(request, metadata) {
    const query = String((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const genres = (Array.isArray(request && request.includedTags) ? request.includedTags : [])
      .map((tag) => String(tag && typeof tag === 'object' ? tag.id || tag.label : tag).trim())
      .filter((name) => GENRES.includes(name));
    const search = { allowAdult: false, allowUnknown: false, sortBy: query ? 'Popular' : feed.sortBy };
    if (query) search.query = query;
    if (genres.length) search.genres = genres;
    const data = await this.graphql(SEARCH_QUERY, { search, limit: PAGE_SIZE, page, translationType: 'sub', countryOrigin: 'ALL' });
    const edges = (data && data.mangas && data.mangas.edges) || [];
    const results = edges.map((item) => ({
      mangaId: item._id,
      title: item.englishName || item.name,
      image: coverOf(item.thumbnail),
      headers: IMAGE_HEADERS,
      ageRating: ageOf(item.genres, item.isAdult),
      medium: 'comics',
    })).filter((item) => item.mangaId && item.title);
    return { results, metadata: edges.length >= PAGE_SIZE && page < 100 ? { page: page + 1 } : undefined };
  }

  async manga(mangaId) {
    const kept = this.details.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.value;
    const data = await this.graphql(DETAIL_QUERY, { _id: mangaId });
    if (!data || !data.manga) throw new Error('MKissa: this title was not found');
    this.details.set(mangaId, { at: Date.now(), value: data.manga });
    return data.manga;
  }

  async getMangaDetails(mangaId) {
    const manga = await this.manga(mangaId);
    const tags = (manga.genres || []).filter(Boolean);
    return {
      mangaInfo: {
        title: manga.englishName || manga.name || mangaId,
        image: coverOf(manga.thumbnail),
        headers: IMAGE_HEADERS,
        ageRating: ageOf(tags, manga.isAdult),
        desc: plain(manga.description),
        author: (manga.authors || []).filter(Boolean).slice(0, 3).join(', ') || undefined,
        status: statusOf(manga.status),
        tags,
        webURL: `${SITE}/manga/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const manga = await this.manga(mangaId);
    const detail = manga.availableChaptersDetail || {};
    const rows = [];
    for (const [translation, group] of [['sub', 'English'], ['raw', 'Raw']]) {
      for (const chapter of detail[translation] || []) {
        const number = parseFloat(chapter);
        const id = `${translation}-${chapter}`;
        rows.push({ id, chapterId: id, name: `Chapter ${chapter}`, number: Number.isNaN(number) ? undefined : number, group });
      }
    }
    return rows.sort((a, b) => (b.number || 0) - (a.number || 0) || (a.group === 'English' ? -1 : 1));
  }

  async getChapterDetails(mangaId, chapterId) {
    const split = String(chapterId).indexOf('-');
    const translation = split > 0 ? String(chapterId).slice(0, split) : 'sub';
    const chapter = split > 0 ? String(chapterId).slice(split + 1) : String(chapterId);
    const chapterPath = `/manga/${mangaId}/chapter-${chapter}-${translation}`;
    const titlePage = await this.requests.schedule(App.createRequest({ url: `${SITE}/manga/${mangaId}`, method: 'GET', headers: { Accept: 'text/html', 'User-Agent': BROWSER_UA } }));
    if (titlePage.status < 200 || titlePage.status >= 300) throw new Error(`MKissa: HTTP ${titlePage.status} from the title page`);
    const html = String(titlePage.data);
    const at = html.search(/<head[^>]*>/i);
    const hooked = at >= 0 ? html.replace(/<head[^>]*>/i, (tag) => `${tag}<script>${HOOK}</script>`) : `<script>${HOOK}</script>${html}`;

    const run = async () => App.executeInWebView({ html: hooked, baseUrl: `${SITE}/manga/${mangaId}`, script: pageScript(chapterPath, 38000), timeoutMs: 50000 });
    let result = await run();
    if (result && result.value && result.value.check) {
      await App.requestBrowserVerification({ url: `${SITE}${chapterPath}` });
      result = await run();
    }
    if (!result || result.error) throw new Error(`MKissa: ${(result && result.error) || 'the chapter page did not answer'}`);
    const value = result.value || {};
    if (value.check) throw new Error('MKissa wants a security check before it shows this chapter. Open the chapter in the verification page, pass the check, and try again.');
    if (!value.edges || !value.edges.length) throw new Error('MKissa: the page gave no chapter images (it may not have this chapter)');

    const best = value.edges.slice().sort((a, b) => b.pictures.length - a.pictures.length)[0];
    let head = best.head || COVER_HOST;
    if (!/^https?:/.test(head)) head = `https://${head}`;
    head = head.replace(/^(https?:\/\/)([^/]+)/, (all, scheme, host) => scheme + (HEAD_MIRRORS[host] || host));
    if (!head.endsWith('/')) head += '/';
    const pages = best.pictures
      .filter((picture) => picture && picture[1])
      .sort((a, b) => a[0] - b[0])
      .map((picture) => (/^https?:/.test(picture[1]) ? picture[1] : head + String(picture[1]).replace(/^\//, '')));
    if (!pages.length) throw new Error('MKissa: the page gave no chapter images');
    return { id: chapterId, mangaId, pages, headers: IMAGE_HEADERS };
  }
}

module.exports = { Source };
