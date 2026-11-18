const SITE = 'https://wuxia.click';
const CDN = 'https://cdn.wuxiaworld.eu';
const NO_COVER = `${SITE}/icons/maskable-wuxiaclick-192.png`;
const PAGE_SIZE = 24;
const BUILD_MS = 10 * 60 * 1000;
const NOVEL_MS = 60 * 1000;
const INDEX_MS = 2 * 60 * 60 * 1000;
const COMPLETE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;
const STATE_KEY = 'ratings';
const POOL = 12;

const RATE_18 = ['adult', 'smut'];
const RATE_16 = ['mature', 'ecchi'];

const FEEDS = [
  { id: 'popular', name: 'Popular', sort: 'popular' },
  { id: 'latest', name: 'Latest Updates', sort: 'latest' },
  { id: 'new', name: 'New Novels', sort: 'new' },
  { id: 'trending', name: 'Trending', sort: 'trending' },
  { id: 'monthly', name: 'Popular This Month', sort: 'monthly' },
  { id: 'rating', name: 'Top Rated', sort: 'rating' },
  { id: 'views', name: 'Most Viewed', sort: 'views' },
  { id: 'completed', name: 'Completed', sort: 'popular', status: 'COMPLETED' },
];

const FALLBACK_GENRES = [
  ['action', 'Action'], ['adult', 'Adult'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['drama', 'Drama'], ['ecchi', 'Ecchi'],
  ['fantasy', 'Fantasy'], ['gender-bender', 'Gender Bender'], ['harem', 'Harem'], ['historical', 'Historical'], ['horror', 'Horror'],
  ['josei', 'Josei'], ['martial-arts', 'Martial Arts'], ['mature', 'Mature'], ['mecha', 'Mecha'], ['mystery', 'Mystery'],
  ['psychological', 'Psychological'], ['romance', 'Romance'], ['school-life', 'School Life'], ['sci-fi', 'Sci-fi'], ['seinen', 'Seinen'],
  ['shoujo', 'Shoujo'], ['shoujo-ai', 'Shoujo Ai'], ['shounen', 'Shounen'], ['shounen-ai', 'Shounen Ai'], ['slice-of-life', 'Slice of Life'],
  ['smut', 'Smut'], ['sports', 'Sports'], ['supernatural', 'Supernatural'], ['tragedy', 'Tragedy'], ['wuxia', 'Wuxia'], ['xianxia', 'Xianxia'],
  ['xuanhuan', 'Xuanhuan'], ['yaoi', 'Yaoi'], ['yuri', 'Yuri'], ['mtl', 'MTL'],
];

const JUNK_LINES = [
  /^advertising$/i,
  /^<\/?body[^>]*>$/i,
  /reading url:?\s*$/i,
  /please collect it:\s*\(\)/i,
  /^this book is originally from, for the latest content, please visit!?$/i,
];
const PLACEHOLDER = /^parsed with an automated reader\.?\s*the content accuracy is not gu[a]?ranteed\.?$/i;

function oneLine(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
    text = String(piece);
  }
  return encodeURIComponent(text);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function nextData(html) {
  const text = String(html || '');
  const mark = text.indexOf('id="__NEXT_DATA__"');
  if (mark < 0) return null;
  const open = text.indexOf('>', mark);
  const close = text.indexOf('</script>', open);
  if (open < 0 || close < 0) return null;
  const data = parseJson(text.slice(open + 1, close));
  return data && data.props ? { page: data.page, pageProps: data.props.pageProps || {} } : null;
}

async function pool(items, limit, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await fn(items[i], i);
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, items.length); w += 1) workers.push(run());
  await Promise.all(workers);
}

function packIds(set) {
  return Array.from(set)
    .map((n) => Number(n).toString(36))
    .join(',');
}

function unpackIds(text) {
  const ids = new Set();
  String(text || '')
    .split(',')
    .forEach((t) => {
      const n = parseInt(t, 36);
      if (t && Number.isFinite(n)) ids.add(n);
    });
  return ids;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancel') !== -1 || s.indexOf('drop') !== -1 || s.indexOf('discontinued') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function coverUrl(novel, size) {
  const key = oneLine(novel && novel.coverKey);
  if (key) return `${CDN}/${key.replace(/^\/+/, '').split('/').map(seg).join('/')}-${size}.webp`;
  const original = oneLine(novel && novel.coverOriginal);
  if (!original) return NO_COVER;
  if (/^https?:\/\//i.test(original)) return original;
  const path = original.charAt(0) === '/' ? original.slice(1) : original;
  return `${CDN}/${(path.indexOf('original/') === 0 ? path : `original/${path}`).split('/').map(seg).join('/')}`;
}

function ageFromGenres(slugs, isAdult) {
  if (slugs.some((s) => RATE_18.indexOf(s) !== -1)) return 18;
  if (isAdult || slugs.some((s) => RATE_16.indexOf(s) !== -1)) return 16;
  return 0;
}

function cardAge(id, rated) {
  if (rated.a18 && rated.a18.has(id)) return 18;
  if (rated.a16 && rated.a16.has(id)) return 16;
  if (rated.complete) return 0;
  return undefined;
}

function toCard(item, rated) {
  const slug = oneLine(item.slug);
  const status = mapStatus(item.status);
  const card = {
    mangaId: slug,
    title: oneLine(item.title) || slug,
    status,
    completed: status === 'COMPLETED',
    medium: 'novel',
    webURL: `${SITE}/novel/${slug}`,
  };
  card.image = coverUrl(item, 240);
  const author = oneLine(item.authorName);
  if (author) card.author = author;
  if (Number(item.chapterCount) > 0) card.chapters = Number(item.chapterCount);
  if (typeof item.ratingAvg === 'number' && item.ratingAvg > 0) card.rating = item.ratingAvg;
  if (item.isMtl) card.tags = ['MTL'];
  const age = cardAge(item.id, rated);
  if (age !== undefined) card.ageRating = age;
  return card;
}

function chapterName(item) {
  const title = oneLine(item && item.title);
  const number = Number(item && item.number);
  if (!title) return `Chapter ${number}`;
  const short = title.match(/^CH\s*(\d+)$/i);
  return short ? `Chapter ${short[1]}` : title;
}

function chapterText(paragraphs) {
  const lines = paragraphs
    .map((p) => String(p === undefined || p === null ? '' : p).replace(/\r/g, '').trim())
    .filter((p) => p && !JUNK_LINES.some((rx) => rx.test(p)));
  return lines.join('\n\n');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this._build = null;
    this._buildAt = 0;
    this._buildPromise = null;
    this._novels = new Map();
    this._tags = null;
    this.state = App.createSourceStateManager();
    this._restored = null;
    this._a18 = null;
    this._a18At = 0;
    this._load18 = null;
    this._a16 = null;
    this._a16At = 0;
    this._load16 = null;
    this._failedAt = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this._tags) return this._tags;
    let tags = null;
    try {
      const pp = await this.props('/browse', '');
      const genres = pp && Array.isArray(pp.genres) ? pp.genres : [];
      tags = genres
        .filter((g) => g && /^[a-z0-9-]+$/.test(String(g.slug || '')) && oneLine(g.name))
        .map((g) => ({ id: String(g.slug), label: oneLine(g.name) }));
    } catch (e) {
      console.error('WuxiaClick getSearchTags failed: ' + (e && e.message));
    }
    if (!tags || tags.length < 10) return FALLBACK_GENRES.map((g) => ({ id: g[0], label: g[1] }));
    this._tags = tags;
    return tags;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const page = Math.max(1, Number(metadata && metadata.page) || 1);
    const query = oneLine(request && request.title).replace(/[\/?#\\]/g, ' ');
    let listing;
    if (query) {
      if (Array.from(query).length < 2) return { results: [] };
      const pp = await this.props(`/search/${seg(query)}`, page > 1 ? `page=${page}` : '');
      listing = pp && pp.result;
    } else {
      const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
      const genres = ((request && request.includedTags) || [])
        .map((t) => oneLine(t && (t.id !== undefined ? t.id : t)).toLowerCase())
        .filter((t) => /^[a-z0-9-]+$/.test(t));
      const parts = [`sort=${feed.sort}`];
      if (feed.status) parts.push(`status=${feed.status}`);
      if (genres.length) parts.push(`genre=${genres.join(',')}`);
      if (page > 1) parts.push(`page=${page}`);
      const pp = await this.props('/browse', parts.join('&'));
      listing = pp && pp.listing;
    }
    if (!listing || !Array.isArray(listing.items)) return { results: [] };
    const rated = await this.ratings();
    const results = listing.items.filter((it) => it && it.slug).map((it) => toCard(it, rated));
    const totalPages = Number(listing.totalPages) || 1;
    return { results, metadata: results.length && page < totalPages ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { novel } = await this._novel(mangaId);
    const genres = (novel.genres || []).map((g) => ({ slug: String(g && g.slug), name: oneLine(g && g.name) })).filter((g) => g.name);
    const tags = genres.map((g) => g.name);
    if (novel.isMtl) tags.push('MTL');
    const info = {
      mangaId: String(novel.slug || mangaId),
      title: oneLine(novel.title) || String(mangaId),
      status: mapStatus(novel.status),
      completed: mapStatus(novel.status) === 'COMPLETED',
      medium: 'novel',
      webURL: `${SITE}/novel/${novel.slug || mangaId}`,
      ageRating: ageFromGenres(genres.map((g) => g.slug), !!novel.isAdult),
    };
    info.image = coverUrl(novel, 480);
    const author = oneLine(novel.author && novel.author.name);
    if (author) info.author = author;
    if (tags.length) info.tags = tags;
    const desc = String(novel.description || '').replace(/\r\n?/g, '\n').trim();
    if (desc) info.desc = desc;
    if (Number(novel.chapterCount) > 0) info.chapters = Number(novel.chapterCount);
    if (typeof novel.ratingAvg === 'number' && novel.ratingAvg > 0) info.rating = novel.ratingAvg;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { novel, toc } = await this._novel(mangaId);
    const slug = String(novel.slug || mangaId);
    const ranges = Array.isArray(toc.ranges) ? toc.ranges : [];
    const have = toc.range && Number(toc.range.page);
    const want = ranges.map((r) => Number(r.page)).filter((p) => p > 0 && p !== have);
    const parts = [Array.isArray(toc.items) ? toc.items : []];
    const fetched = new Array(want.length);
    await pool(want, POOL, async (page, i) => {
      fetched[i] = await this.tocPage(novel.id, slug, page);
    });
    fetched.forEach((items) => parts.push(items));
    const seen = new Set();
    const chapters = [];
    parts.forEach((items) =>
      items.forEach((c) => {
        const number = Number(c && c.number);
        if (!Number.isFinite(number) || seen.has(number)) return;
        seen.add(number);
        const entry = { id: String(number), chapterId: String(number), name: chapterName(c), number };
        const time = Date.parse(c.createdAt);
        if (Number.isFinite(time)) entry.time = time;
        chapters.push(entry);
      }),
    );
    if (!chapters.length && Number(novel.chapterCount) > 0) throw new Error('WuxiaClick: the chapter list came back empty');
    if (chapters.length < Number(novel.chapterCount || 0)) {
      throw new Error(`WuxiaClick: read ${chapters.length} of ${novel.chapterCount} chapters, try again`);
    }
    return chapters.sort((a, b) => b.number - a.number);
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = String(chapterId).trim();
    if (!/^[1-9]\d{0,8}$/.test(id)) throw new Error(`WuxiaClick: ${chapterId} is not a chapter number`);
    const pp = await this.props(`/chapter/${seg(`${mangaId}-${id}`)}`, '');
    if (!pp || pp.notFound || pp.redirect) throw new Error(`WuxiaClick: chapter ${id} of ${mangaId} is not on the site`);
    const chapter = pp.data && pp.data.chapter;
    if (!chapter || !Array.isArray(chapter.paragraphs)) throw new Error('WuxiaClick: the chapter page no longer carries its paragraphs');
    if (Number(chapter.number) !== Number(id)) throw new Error(`WuxiaClick: asked for chapter ${id} and the site sent ${chapter.number}`);
    const text = chapterText(chapter.paragraphs);
    if (!text || PLACEHOLDER.test(text.replace(/\n\n/g, ' ').trim())) {
      return {
        id,
        mangaId,
        pages: [],
        text:
          'WuxiaClick lists this chapter but holds no text for it (the site only has a placeholder line there), so it is missing on the site itself ' +
          `and there is nothing to retry. The next chapter reads normally.\n\n${SITE}/chapter/${mangaId}-${id}`,
      };
    }
    return { id, mangaId, pages: [], text };
  }

  async get(url, accept) {
    let failure = new Error('WuxiaClick: no answer');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = attempt === 0 ? url : `${url}${url.indexOf('?') === -1 ? '?' : '&'}r=${attempt}`;
      try {
        const res = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { Accept: accept } }));
        if (res.status >= 500 && attempt === 0) {
          failure = new Error(`WuxiaClick: HTTP ${res.status}`);
          continue;
        }
        return res;
      } catch (e) {
        failure = e;
      }
    }
    throw failure;
  }

  buildId(force) {
    if (!force && this._build && Date.now() - this._buildAt < BUILD_MS) return Promise.resolve(this._build);
    if (this._buildPromise) return this._buildPromise;
    this._buildPromise = this.get(`${SITE}/api/version`, 'application/json')
      .then((res) => {
        const body = res.status === 200 ? parseJson(res.data) : null;
        if (body && typeof body.build === 'string' && /^[\w.-]{6,80}$/.test(body.build)) {
          this._build = body.build;
          this._buildAt = Date.now();
          return this._build;
        }
        return force ? null : this._build;
      })
      .catch(() => (force ? null : this._build))
      .then((build) => {
        this._buildPromise = null;
        return build;
      });
    return this._buildPromise;
  }

  async props(path, query) {
    const suffix = query ? `?${query}` : '';
    let build = await this.buildId(false);
    for (let round = 0; build && round < 2; round += 1) {
      let res;
      try {
        res = await this.get(`${SITE}/_next/data/${build}${path}.json${suffix}`, 'application/json');
      } catch (e) {
        break;
      }
      if (res.status === 200) {
        const body = parseJson(res.data);
        if (body && body.pageProps) {
          if (body.pageProps.__N_REDIRECT) return { redirect: String(body.pageProps.__N_REDIRECT) };
          return body.pageProps;
        }
        break;
      }
      if (res.status === 404) {
        const body = parseJson(res.data);
        if (body && body.notFound) return { notFound: true };
        if (round === 0) {
          const fresh = await this.buildId(true);
          if (fresh && fresh !== build) {
            build = fresh;
            continue;
          }
        }
      }
      break;
    }
    const res = await this.get(`${SITE}${path}${suffix}`, 'text/html');
    const next = nextData(res.data);
    if (res.status === 404 || (next && next.page === '/404')) return { notFound: true };
    if (res.status !== 200 || !next) throw new Error(`WuxiaClick: HTTP ${res.status} and no page data for ${path}`);
    return next.pageProps;
  }

  _novel(mangaId) {
    const key = String(mangaId);
    const hit = this._novels.get(key);
    if (hit && Date.now() - hit.at < NOVEL_MS) return hit.promise;
    const promise = this.props(`/novel/${seg(key)}`, '').then((pp) => {
      if (!pp || pp.notFound || pp.redirect) throw new Error('WuxiaClick: no such novel');
      if (!pp.novel || !pp.novel.id || !pp.toc) throw new Error('WuxiaClick: the title page no longer carries its data');
      return { novel: pp.novel, toc: pp.toc };
    });
    this._novels.set(key, { at: Date.now(), promise });
    promise.catch(() => this._novels.delete(key));
    return promise;
  }

  async tocPage(novelId, slug, page) {
    try {
      const input = encodeURIComponent(JSON.stringify({ json: { novelId, page } }));
      const res = await this.get(`${SITE}/api/trpc/novel.toc?input=${input}`, 'application/json');
      if (res.status === 200) {
        const body = parseJson(res.data);
        const json = body && body.result && body.result.data && body.result.data.json;
        if (json && Array.isArray(json.items) && Number(json.page) === page) return json.items;
      }
    } catch (e) {
    }
    const pp = await this.props(`/novel/${seg(slug)}`, `page=${page}`);
    if (pp && pp.toc && Array.isArray(pp.toc.items) && pp.toc.range && Number(pp.toc.range.page) === page) return pp.toc.items;
    throw new Error(`WuxiaClick: could not read page ${page} of the chapter list`);
  }

  async indexPage(genres, page) {
    let failure = new Error('WuxiaClick: index page failed');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const pp = await this.props('/browse', `genre=${genres}&match=any&page=${page}`);
        const listing = pp && pp.listing;
        if (listing && Array.isArray(listing.items)) return listing;
        if (pp && pp.notFound) return { items: [], totalPages: 0, total: 0 };
      } catch (e) {
        failure = e;
      }
    }
    throw failure;
  }

  async titlesOf(genres) {
    const first = await this.indexPage(genres, 1);
    const ids = new Set(first.items.map((it) => it.id));
    const pages = [];
    for (let p = 2; p <= Number(first.totalPages || 1); p += 1) pages.push(p);
    await pool(pages, POOL, async (p) => {
      const listing = await this.indexPage(genres, p);
      listing.items.forEach((it) => ids.add(it.id));
    });
    if (ids.size < Number(first.total || 0) * 0.95) throw new Error(`WuxiaClick: index of ${genres} read ${ids.size} of ${first.total}`);
    return ids;
  }

  async restore() {
    if (!this._restored) {
      this._restored = (async () => {
        try {
          const raw = await this.state.retrieve(STATE_KEY);
          const data = typeof raw === 'string' ? parseJson(raw) : raw;
          if (data && data.v === 1) {
            if (typeof data.a18 === 'string' && Number(data.at18) > 0) {
              this._a18 = unpackIds(data.a18);
              this._a18At = Number(data.at18);
            }
            if (typeof data.a16 === 'string' && Number(data.at16) > 0) {
              this._a16 = unpackIds(data.a16);
              this._a16At = Number(data.at16);
            }
          }
        } catch (e) {
        }
      })();
    }
    return this._restored;
  }

  async persist() {
    try {
      const data = { v: 1 };
      if (this._a18) {
        data.at18 = this._a18At;
        data.a18 = packIds(this._a18);
      }
      if (this._a16) {
        data.at16 = this._a16At;
        data.a16 = packIds(this._a16);
      }
      await this.state.store(STATE_KEY, JSON.stringify(data));
    } catch (e) {
    }
  }

  async loadIndex(genres, which) {
    const set = await this.titlesOf(genres.join(','));
    this[`_${which}`] = set;
    this[`_${which}At`] = Date.now();
    await this.persist();
  }

  refresh() {
    const fresh = (at) => at && Date.now() - at < INDEX_MS;
    if (Date.now() - this._failedAt < RETRY_MS) return;
    const failed = (e) => {
      this._failedAt = Date.now();
      console.error('WuxiaClick rating index failed: ' + (e && e.message));
    };
    if (!this._load18 && !fresh(this._a18At)) {
      this._load18 = this.loadIndex(RATE_18, 'a18')
        .catch(failed)
        .then(() => {
          this._load18 = null;
        });
    }
    if (!this._load16 && !fresh(this._a16At)) {
      const after = this._load18 || Promise.resolve();
      this._load16 = after
        .then(() => (Date.now() - this._failedAt < RETRY_MS ? null : this.loadIndex(RATE_16, 'a16')))
        .catch(failed)
        .then(() => {
          this._load16 = null;
        });
    }
  }

  async ratings() {
    await this.restore();
    this.refresh();
    if (!this._a18 && this._load18) await this._load18;
    const oldest = Math.min(this._a18At || 0, this._a16At || 0);
    return { a18: this._a18, a16: this._a16, complete: !!(this._a18 && this._a16 && Date.now() - oldest < COMPLETE_MS) };
  }
}

module.exports = { Source };
