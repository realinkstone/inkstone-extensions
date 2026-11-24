const SITE = 'https://www.komiwa.net';
const APIS = ['https://b78sk.komiwa.net', 'https://fallback.komiwa.net'];
const IMAGE_REFERER = 'https://www.komiwa.net/';
const PAGE_SIZE = 30;
const EXPLICIT_GENRES = ['hentai', 'smut', 'adulto', 'rape', 'ahegao', 'blowjob', 'footjob', 'public-sex', 'incesto'];
const EXPLICIT_TTL = 12 * 60 * 60 * 1000;

const FEEDS = [
  { id: 'popular', name: 'Most Viewed', sortBy: 'views', sortOrder: 'desc' },
  { id: 'latest', name: 'Latest Updates', sortBy: 'updatedAt', sortOrder: 'desc' },
  { id: 'new', name: 'New Titles', sortBy: 'createdAt', sortOrder: 'desc' },
  { id: 'top', name: 'Top Rated', sortBy: 'rating', sortOrder: 'desc' },
];

const HOOK = `(function () {
  var cap = window.__kwCap = { p: null, s: null };
  function take(v) {
    try {
      if (!v || typeof v !== 'object' || !Array.isArray(v.p) || !v.p.length || Object.keys(v).length > 3) return;
      for (var i = 0; i < v.p.length; i++) if (typeof v.p[i] !== 'string' || v.p[i].indexOf('http') !== 0) return;
      cap.p = v.p;
      cap.s = v.s && typeof v.s === 'object' ? v.s : null;
    } catch (e) {}
  }
  var decode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function () {
    var text = decode.apply(this, arguments);
    try { if (text && text.charAt(0) === '{' && text.indexOf('"p":[') > 0 && text.length > 100) take(JSON.parse(text)); } catch (e) {}
    return text;
  };
  var parse = JSON.parse;
  JSON.parse = function () { var v = parse.apply(this, arguments); take(v); return v; };
  var json = Response.prototype.json;
  Response.prototype.json = function () { return json.apply(this, arguments).then(function (v) { take(v); return v; }); };
})();`;

function pageScript(waitMs) {
  return `(async function () {
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
    return !!document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-form');
  }
  function b64url(text) {
    return btoa(unescape(encodeURIComponent(text))).split('+').join('-').split('/').join('_').replace(/=+$/, '');
  }
  function collect(p) {
    var index = {};
    var srcs = Array.prototype.slice.call(document.querySelectorAll('img')).map(function (img) {
      var src = img.currentSrc || img.src || '';
      index[src] = true;
      return src;
    });
    var found = 0;
    var pages = p.map(function (orig) {
      var href = orig;
      try { href = new URL(orig).href; } catch (e) {}
      if (index[href]) { found++; return orig; }
      var key = '/v/' + b64url(orig);
      for (var i = 0; i < srcs.length; i++) {
        var at = srcs[i].indexOf(key);
        if (at > 0 && (srcs[i].length === at + key.length || srcs[i].charAt(at + key.length) === '?')) { found++; return srcs[i]; }
      }
      return orig;
    });
    return { pages: pages, found: found };
  }
  try {
    while (Date.now() < limit) {
      var cap = window.__kwCap;
      if (cap && cap.p) {
        var until = Date.now() + 1500;
        var got = collect(cap.p);
        while (got.found < cap.p.length && Date.now() < until) { await sleep(150); got = collect(cap.p); }
        return __reportResult({ pages: got.pages, total: cap.p.length, found: got.found });
      }
      if (checkShowing()) return __reportResult({ check: true });
      await sleep(150);
    }
    __reportResult({ timeout: true });
  } catch (e) {
    __reportError(String(e && e.message || e));
  }
})();`;
}

function norm(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function prettyGenre(name) {
  let text = String(name || '').replace(/\s+/g, ' ').trim();
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(text)) text = text.split('-').join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function thumbOf(cover) {
  if (!cover) return undefined;
  const match = /^(https:\/\/[^/]+\/(?:[^/]+\/)*covers\/[0-9a-f]{16})\.webp$/.exec(cover);
  return match ? `${match[1]}-thumb.webp` : cover;
}

function statusOf(slug) {
  const s = String(slug || '').toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled') return 'CANCELLED';
  return 'UNKNOWN';
}

function ageOfGenres(flag, genres) {
  const slugs = (genres || []).map((g) => String((g && g.slug) || '').toLowerCase());
  if (flag === 'EROTIC' || slugs.some((s) => EXPLICIT_GENRES.includes(s))) return 18;
  if (slugs.includes('ecchi')) return 16;
  return 0;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.details = new Map();
    this.shown = new Map();
    this.explicit = null;
    this.explicitLoading = null;
    this.filterOptions = null;
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async api(path, method, body) {
    let last = null;
    for (const base of APIS) {
      let response;
      try {
        response = await this.requests.schedule(App.createRequest({
          url: base + path,
          method: method || 'GET',
          headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        }));
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
        continue;
      }
      if (response.status === 404) {
        let message = 'not found';
        try { message = JSON.parse(response.data).message || message; } catch (e) {}
        throw new Error(`Komiwa: ${message}`);
      }
      if (response.status < 200 || response.status >= 300) {
        last = new Error(`HTTP ${response.status}`);
        continue;
      }
      let json;
      try { json = JSON.parse(response.data); } catch (e) { last = new Error('the answer was not JSON'); continue; }
      if (!json || json.success === false || json.data === undefined) { last = new Error((json && json.message) || 'the answer had no data'); continue; }
      return json.data;
    }
    throw new Error(`Komiwa: the API could not be reached (${last && last.message})`);
  }

  async filters() {
    if (this.filterOptions) return this.filterOptions;
    const data = await this.api('/manga/filters');
    const bySlug = new Map();
    const byName = new Map();
    const list = [];
    for (const genre of data.genres || []) {
      const slug = String(genre.slug || '').trim();
      const label = prettyGenre(genre.name);
      if (!slug || !label || /prueba/i.test(slug)) continue;
      if (bySlug.has(slug)) continue;
      bySlug.set(slug, label);
      byName.set(norm(label), slug);
      list.push({ id: slug, label });
    }
    this.filterOptions = { list, bySlug, byName };
    return this.filterOptions;
  }

  async getSearchTags() {
    const options = await this.filters();
    return options.list.map((tag) => ({ id: tag.id, label: tag.label }));
  }

  async explicitIds() {
    if (this.explicit) return this.explicit;
    if (this.explicitLoading) return this.explicitLoading;
    this.explicitLoading = (async () => {
      let state = null;
      try { state = typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null; } catch (e) { state = null; }
      try {
        const kept = state ? await state.retrieve('explicitIds') : null;
        if (kept && Array.isArray(kept.ids) && kept.at && Date.now() - kept.at < EXPLICIT_TTL) {
          this.explicit = new Set(kept.ids);
          return this.explicit;
        }
      } catch (e) {}
      const ids = new Set();
      let complete = true;
      await Promise.all(EXPLICIT_GENRES.map(async (slug) => {
        try {
          for (let page = 1; page <= 12; page++) {
            const data = await this.api('/manga/catalog', 'POST', { genres: [slug], ageRating: 'SAFE', sortBy: 'views', sortOrder: 'desc', page, limit: 60 });
            for (const item of data.items || []) ids.add(item.id);
            if (!data.hasMore || !(data.items || []).length) break;
          }
        } catch (e) {
          complete = false;
        }
      }));
      this.explicit = ids;
      if (complete) {
        try { if (state) await state.store('explicitIds', { at: Date.now(), ids: Array.from(ids) }); } catch (e) {}
      } else {
        setTimeout(() => { this.explicit = null; }, 60000);
      }
      return ids;
    })();
    try {
      return await this.explicitLoading;
    } finally {
      this.explicitLoading = null;
    }
  }

  async getSearchResults(request, metadata) {
    const query = String((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const options = await this.filters();
    const genres = [];
    for (const tag of Array.isArray(request && request.includedTags) ? request.includedTags : []) {
      const value = String(tag && typeof tag === 'object' ? tag.id || tag.label : tag || '').trim();
      const slug = options.bySlug.has(value) ? value : options.byName.get(norm(value));
      if (slug && !genres.includes(slug)) genres.push(slug);
    }
    const sort = query ? FEEDS[0] : feed;
    const body = { sortBy: sort.sortBy, sortOrder: sort.sortOrder, page, limit: PAGE_SIZE, chapterMin: 1 };
    if (query) body.q = query;
    if (genres.length) body.genres = genres;
    const [data, explicit] = await Promise.all([this.api('/manga/catalog', 'POST', body), this.explicitIds()]);
    const key = JSON.stringify([query, query ? '' : feed.id, genres]);
    if (page === 1 || !this.shown.has(key)) this.shown.set(key, new Set());
    const shown = this.shown.get(key);
    if (this.shown.size > 20) this.shown.delete(this.shown.keys().next().value);
    const items = (data && data.items) || [];
    const results = [];
    for (const item of items) {
      if (!item || !item.id || !item.title || shown.has(item.id)) continue;
      if (item.numChapters === 0) continue;
      shown.add(item.id);
      results.push({
        mangaId: item.id,
        title: String(item.title).replace(/\s+/g, ' ').trim(),
        image: thumbOf(item.cover),
        ageRating: item.ageRating === 'EROTIC' || explicit.has(item.id) ? 18 : 0,
        medium: 'comics',
      });
    }
    return { results, metadata: data && data.hasMore && items.length ? { page: page + 1 } : undefined };
  }

  async manga(mangaId) {
    const kept = this.details.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.value;
    const data = await this.api(`/manga/${encodeURIComponent(mangaId)}`);
    if (!data || !data.id) throw new Error('Komiwa: this title was not found');
    this.details.set(mangaId, { at: Date.now(), value: data });
    if (this.details.size > 30) this.details.delete(this.details.keys().next().value);
    return data;
  }

  async getMangaDetails(mangaId) {
    const manga = await this.manga(mangaId);
    const tags = (manga.genres || []).map((g) => prettyGenre(g && g.name)).filter(Boolean);
    const authors = (manga.authors || []).map((a) => String((a && a.name) || '').trim()).filter(Boolean);
    return {
      mangaInfo: {
        title: String(manga.title || mangaId).replace(/\s+/g, ' ').trim(),
        image: manga.cover || undefined,
        ageRating: ageOfGenres(manga.ageRating, manga.genres),
        desc: String(manga.synopsis || '').trim(),
        author: authors.slice(0, 3).join(', ') || undefined,
        status: statusOf(manga.status && manga.status.slug),
        tags,
        webURL: `${SITE}/manga/${manga.slug || mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const manga = await this.manga(mangaId);
    const block = manga.chapters || {};
    let rows = Array.isArray(block.chapters) ? block.chapters.slice() : [];
    const total = typeof block.total === 'number' ? block.total : rows.length;
    if (rows.length < total) {
      rows = [];
      for (let page = 1; page <= 20; page++) {
        const data = await this.api(`/manga/${encodeURIComponent(manga.id)}/chapters?page=${page}&limit=1000&sort=asc`);
        rows = rows.concat((data && data.chapters) || []);
        if (!data || !data.hasMore || !(data.chapters || []).length) break;
      }
    }
    const names = new Set([norm(manga.title)].concat((manga.altTitles || []).map(norm)));
    const seen = new Set();
    const chapters = [];
    for (const row of rows) {
      if (!row || !row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      const number = parseFloat(row.number);
      const shownNumber = String(row.number || '').trim();
      const title = String(row.title || '').replace(/\s+/g, ' ').trim();
      const generic = !title || norm(title).startsWith('capitulo') || names.has(norm(title));
      const stamp = Date.parse(row.publishedAt || row.createdAt || '');
      const chapter = {
        id: row.id,
        chapterId: row.id,
        name: generic ? `Capítulo ${shownNumber}` : `Capítulo ${shownNumber}: ${title}`,
        number: Number.isNaN(number) ? undefined : number,
      };
      if (row.group && row.group.name) chapter.group = String(row.group.name);
      if (!Number.isNaN(stamp)) chapter.time = stamp;
      chapters.push(chapter);
    }
    return chapters.sort((a, b) => (b.number || 0) - (a.number || 0));
  }

  async getChapterDetails(mangaId, chapterId) {
    const chapterUrl = `${SITE}/chapter/${encodeURIComponent(chapterId)}`;
    const load = await this.requests.schedule(App.createRequest({ url: chapterUrl, method: 'GET', headers: { Accept: 'text/html' } }));
    if (load.status === 404) throw new Error('Komiwa: this chapter was not found');
    if (load.status < 200 || load.status >= 300) throw new Error(`Komiwa: HTTP ${load.status} from the chapter page`);
    const html = String(load.data);
    const hooked = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => `${tag}<script>${HOOK}</script>`) : `<script>${HOOK}</script>${html}`;

    const run = async () => App.executeInWebView({ html: hooked, baseUrl: chapterUrl, script: pageScript(25000), timeoutMs: 35000 });
    let result = await run();
    if (result && result.value && result.value.check) {
      await App.requestBrowserVerification({ url: chapterUrl });
      result = await run();
    }
    if (!result || result.error) throw new Error(`Komiwa: ${(result && result.error) || 'the chapter page did not answer'}`);
    const value = result.value || {};
    if (value.check) throw new Error('Komiwa wants a security check before it shows this chapter. Open the chapter in the verification page, pass the check, and try again.');
    if (value.timeout || !Array.isArray(value.pages) || !value.pages.length) throw new Error('Komiwa: the chapter page showed no images (the chapter may be empty)');
    return { id: chapterId, mangaId, pages: value.pages, referer: IMAGE_REFERER };
  }
}

module.exports = { Source };
