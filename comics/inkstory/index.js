const SITE_BASE = 'https://inkstory.net';
const PAGE_SIZE = 40;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'viewsCount,desc', name: 'Популярное' },
  { id: 'latestChapterAt,desc', name: 'Обновления' },
  { id: 'createdAt,desc', name: 'Новинки' },
  { id: 'averageRating,desc', name: 'Топ рейтинг' },
];

const SORT_FIELDS = [
  'likesCount',
  'viewsCount',
  'viewsDayCount',
  'viewsWeekCount',
  'viewsMonthCount',
  'chaptersCount',
  'bookmarksCount',
  'averageRating',
  'createdAt',
  'latestChapterAt',
];
const SORT_ALIASES = { updatedAt: 'latestChapterAt' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABEL_IDS = {};

function qs(params) {
  const parts = [];
  Object.keys(params).forEach((key) => {
    const val = params[key];
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val)) {
      val.forEach((v) => {
        if (v === undefined || v === null || v === '') return;
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
      });
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  });
  return parts.join('&');
}

function buildURL(base, params) {
  const query = qs(params);
  return query ? `${base}?${query}` : base;
}

function parseTsrState(html) {
  const marker = html.indexOf('$tsr-stream-barrier');
  if (marker === -1) return null;
  const open = html.indexOf('>', marker);
  if (open === -1) return null;
  let close = html.indexOf('</script>', open);
  if (close === -1) close = html.length;
  const s = html.slice(open + 1, close);
  const start = s.indexOf('$R[0]=');
  if (start === -1) return null;

  const defs = {};
  const KEY_RE = /[A-Za-z0-9_$]+/y;
  const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;
  const NUM_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let p = start;

  function ws() {
    while (p < s.length && s.charCodeAt(p) <= 32) p++;
  }

  function skipExpr() {
    let depth = 0;
    while (p < s.length) {
      const c = s[p];
      if (c === '"' || c === "'" || c === '`') {
        p++;
        while (p < s.length && s[p] !== c) {
          if (s[p] === '\\') p++;
          p++;
        }
        p++;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) return undefined;
        depth--;
      } else if (c === ',' && depth === 0) return undefined;
      p++;
    }
    return undefined;
  }

  function str() {
    const a = p;
    p++;
    while (p < s.length && s[p] !== '"') {
      if (s[p] === '\\') p++;
      p++;
    }
    p++;
    const raw = s.slice(a, p);
    if (raw.indexOf('\\') === -1) return raw.slice(1, -1);
    const json = raw.replace(/\\(\\|x([0-9a-fA-F]{2}))/g, (m, a2, hex) => (hex ? '\\u00' + hex : m));
    try {
      return JSON.parse(json);
    } catch (e) {
      return raw.slice(1, -1);
    }
  }

  function read(re) {
    re.lastIndex = p;
    const m = re.exec(s);
    if (!m) return null;
    p += m[0].length;
    return m[0];
  }

  function val() {
    ws();
    const c = s[p];
    if (c === '"') return str();
    if (c === '{') {
      p++;
      const o = {};
      for (;;) {
        ws();
        if (s[p] === '}') {
          p++;
          break;
        }
        const k = s[p] === '"' ? str() : read(KEY_RE);
        if (k === null) {
          skipExpr();
          break;
        }
        ws();
        if (s[p] === ':') p++;
        o[k] = val();
        ws();
        if (s[p] === ',') p++;
        else if (s[p] === '}') {
          p++;
          break;
        } else break;
      }
      return o;
    }
    if (c === '[') {
      p++;
      const a = [];
      for (;;) {
        ws();
        if (s[p] === ']') {
          p++;
          break;
        }
        a.push(val());
        ws();
        if (s[p] === ',') p++;
        else if (s[p] === ']') {
          p++;
          break;
        } else break;
      }
      return a;
    }
    if (c === '!') {
      const v = s[p + 1] === '0';
      p += 2;
      return v;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const n = read(NUM_RE);
      if (n !== null) return Number(n);
    }
    if (c === '$' && s.substr(p, 3) === '$R[') {
      const e = s.indexOf(']', p);
      const n = s.slice(p + 3, e);
      p = e + 1;
      if (s[p] === '=' && s[p + 1] !== '=') {
        p++;
        const v = val();
        defs[n] = v;
        return v;
      }
      return defs[n];
    }
    const a = p;
    const id = read(IDENT_RE);
    if (id === 'null') return null;
    if (id === 'true') return true;
    if (id === 'false') return false;
    if (id === 'NaN') return NaN;
    if (id === 'Infinity') return Infinity;
    if (id === 'undefined') return undefined;
    if (id === 'void') {
      ws();
      p++;
      return undefined;
    }
    p = a;
    return skipExpr();
  }

  const root = val();
  return root && typeof root === 'object' ? { root } : null;
}

function queryData(state, name) {
  const root = state && state.root;
  const dehydrated = root && root.dehydratedData && root.dehydratedData.dehydratedQueryClient;
  const queries = dehydrated && dehydrated.queries;
  if (!Array.isArray(queries)) return undefined;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (q && Array.isArray(q.queryKey) && q.queryKey[0] === name && q.state) return q.state.data;
  }
  return undefined;
}

function loaderData(state, field) {
  const matches = state && state.root && state.root.matches;
  if (!Array.isArray(matches)) return undefined;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m && m.l && typeof m.l === 'object' && m.l[field] !== undefined) return m.l[field];
  }
  return undefined;
}

function pickTitle(name) {
  if (!name) return '';
  return name.ru || name.en || name.original || '';
}

function uniq(list) {
  const seen = {};
  const out = [];
  list.forEach((v) => {
    if (!v || seen[v]) return;
    seen[v] = true;
    out.push(v);
  });
  return out;
}

function mapStatus(status) {
  switch ((status || '').toUpperCase()) {
    case 'ONGOING':
      return 'ONGOING';
    case 'DONE':
      return 'COMPLETED';
    case 'HIATUS':
    case 'FROZEN':
      return 'HIATUS';
    case 'CANCELLED':
    case 'CANCELED':
    case 'DROPPED':
    case 'ABANDONED':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

function ratingOf(contentStatus) {
  switch (String(contentStatus || '').toUpperCase()) {
    case 'SAFE':
      return 0;
    case 'EROTIC':
    case 'PORNOGRAPHIC':
      return 18;
    default:
      return 16;
  }
}

function isReadable(book) {
  return !book || !book.readingRestriction || book.readingRestriction === 'NONE';
}

function thumb(url, width) {
  if (typeof url !== 'string' || url.indexOf('static.inuko.me/book/') === -1 || url.indexOf('?') !== -1) return url;
  return `${url}?width=${width}&type=jpeg`;
}

function bookToPartialManga(book) {
  if (!book || !book.slug) return null;
  const title = pickTitle(book.name);
  if (!title) return null;
  if (!book.poster) return null;

  const manga = {
    mangaId: book.slug,
    title,
    image: thumb(book.poster, 320),
    webURL: `${SITE_BASE}/content/${book.slug}`,
    medium: 'comics',
    ageRating: ratingOf(book.contentStatus),
  };
  if (typeof book.averageRating === 'number' && book.averageRating > 0) {
    manga.rating = book.averageRating;
  }
  if (typeof book.chaptersCount === 'number') manga.chapters = book.chaptersCount;
  if (typeof book.viewsCount === 'number') manga.views = book.viewsCount;
  if (book.status === 'DONE') manga.completed = true;
  if (typeof book.year === 'number') manga.releaseDate = String(book.year);
  return manga;
}

const INUKO_UUID_VERSION_FIX = /([0-9a-f]{8}-[0-9a-f]{4}-)x([0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function repairPageURL(url) {
  if (typeof url !== 'string' || url.indexOf('static.inuko.me') === -1) return url;
  return url.replace(INUKO_UUID_VERSION_FIX, '$1' + '4' + '$2');
}

function searchParam(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  try {
    if (typeof JSON.parse(t) !== 'string') return JSON.stringify(t);
    return JSON.stringify(t);
  } catch (e) {
    return t;
  }
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async loadLabels() {
    const html = await this.requestHTML(`${SITE_BASE}/content`);
    return this.rememberLabels(queryData(parseTsrState(html), 'labels'));
  }

  rememberLabels(labels) {
    const list = (Array.isArray(labels) ? labels : []).filter((l) => l && l.id && l.slug && l.name);
    list.forEach((l) => {
      LABEL_IDS[l.slug] = l.id;
    });
    return list
      .filter((l) => l.kind === 'GENRE')
      .concat(list.filter((l) => l.kind !== 'GENRE'));
  }

  async getSearchTags() {
    try {
      const labels = await this.loadLabels();
      return labels.map((l) => ({ id: l.slug, label: l.name }));
    } catch (e) {
      console.error('InkStory getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async labelUUIDs(tags) {
    if (tags.length === 0) return [];
    if (tags.some((t) => !UUID_RE.test(t) && !LABEL_IDS[t])) await this.loadLabels();
    return tags.map((t) => (UUID_RE.test(t) ? t : LABEL_IDS[t])).filter(Boolean);
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feed = ((request && request.feed) || FEEDS[0].id).split(',');
    const sortRaw = SORT_ALIASES[feed[0]] || feed[0];
    const sort = SORT_FIELDS.indexOf(sortRaw) === -1 ? 'viewsCount' : sortRaw;
    const order = feed[1] === 'asc' ? 'asc' : 'desc';
    const includedTags = ((request && request.includedTags) || [])
      .map((t) => t && t.id)
      .filter(Boolean);
    const excludedTags = ((request && request.excludedTags) || [])
      .map((t) => t && t.id)
      .filter(Boolean);
    const page = (metadata && metadata.page) || 0;

    const include = await this.labelUUIDs(includedTags);
    if (include.length < includedTags.length) return { results: [] };
    const exclude = await this.labelUUIDs(excludedTags);

    const url = buildURL(`${SITE_BASE}/content`, {
      search: searchParam(query),
      sort: sort === 'viewsCount' ? '' : sort,
      orderBy: order === 'desc' ? '' : order,
      page: page > 0 ? page : '',
      labelsInclude: include.length ? JSON.stringify(include) : '',
      labelsExclude: exclude.length ? JSON.stringify(exclude) : '',
    });

    const html = await this.requestHTML(url);
    const state = parseTsrState(html);
    const catalog = queryData(state, 'book-catalog') || {};
    const books = Array.isArray(catalog.books) ? catalog.books : [];
    const totalHits = typeof catalog.total === 'number' ? catalog.total : 0;
    this.rememberLabels(queryData(state, 'labels'));

    if (!state || !catalog.books) {
      throw new Error('InkStory: the catalog page has no book list');
    }

    const results = books
      .filter(isReadable)
      .map(bookToPartialManga)
      .filter(Boolean);
    const hasNext = books.length > 0 && (page + 1) * PAGE_SIZE < totalHits;

    return {
      results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/content/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const state = parseTsrState(html);
    const book = queryData(state, 'book') || loaderData(state, 'book');
    if (!book) throw new Error(`InkStory: book missing for ${mangaId}`);

    const title = pickTitle(book.name) || mangaId;
    const tags = (book.labels || []).map((l) => l && l.name).filter(Boolean);

    const relations = book.relations || [];
    const authorNames = uniq(
      relations
        .filter((r) => r && (r.type === 'AUTHOR' || r.type === 'ARTIST'))
        .map((r) => r.publisher && r.publisher.name)
        .filter(Boolean)
    );
    const publisherNames = uniq(
      relations
        .filter((r) => r && r.type === 'PUBLISHER')
        .map((r) => r.publisher && r.publisher.name)
        .filter(Boolean)
    );

    const mangaInfo = {
      title,
      image: thumb(book.poster, 400) || '',
      desc: book.description || '',
      status: mapStatus(book.status),
      tags,
      webURL: url,
      medium: 'comics',
      ageRating: ratingOf(book.contentStatus),
    };
    if (authorNames.length > 0) mangaInfo.author = authorNames.join(', ');
    if (publisherNames.length > 0) mangaInfo.publisher = publisherNames[0];
    if (typeof book.averageRating === 'number' && book.averageRating > 0) {
      mangaInfo.rating = book.averageRating;
    }
    if (typeof book.viewsCount === 'number') mangaInfo.views = book.viewsCount;
    if (typeof book.chaptersCount === 'number') mangaInfo.chapters = book.chaptersCount;
    if (typeof book.year === 'number') mangaInfo.releaseDate = String(book.year);
    if (book.status === 'DONE') mangaInfo.completed = true;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/content/${encodeURIComponent(mangaId)}/chapters`;
    const html = await this.requestHTML(url);
    const state = parseTsrState(html);
    const chapters = loaderData(state, 'chapters') || [];
    const branches = loaderData(state, 'branches') || [];
    if (loaderData(state, 'canRead') === false) {
      throw new Error('InkStory: this title can only be read by a signed in account on the site');
    }
    if (chapters.length === 0) return [];

    let primaryBranchId = null;
    if (branches.length > 0) {
      let best = null;
      branches.forEach((b) => {
        if (!b || !b.id) return;
        if (!best || (b.chaptersCount || 0) > (best.chaptersCount || 0)) best = b;
      });
      primaryBranchId = best && best.id;
    }
    if (!primaryBranchId) {
      const counts = {};
      chapters.forEach((c) => {
        if (!c || !c.branchId) return;
        counts[c.branchId] = (counts[c.branchId] || 0) + 1;
      });
      let bestId = null;
      let bestCount = -1;
      Object.keys(counts).forEach((id) => {
        if (counts[id] > bestCount) {
          bestCount = counts[id];
          bestId = id;
        }
      });
      primaryBranchId = bestId;
    }

    const filtered = primaryBranchId
      ? chapters.filter((c) => c && c.branchId === primaryBranchId)
      : chapters;

    let groupName = '';
    const branchMeta = branches.filter((b) => b && b.id === primaryBranchId)[0];
    if (branchMeta && Array.isArray(branchMeta.publishers) && branchMeta.publishers.length > 0) {
      groupName = branchMeta.publishers
        .map((p) => p && p.name)
        .filter(Boolean)
        .join(', ');
    }

    const ordered = filtered.slice().reverse();

    let lastNumber = -Infinity;
    return ordered.map((c) => {
      let number = typeof c.number === 'number' ? c.number : parseFloat(c.number) || 0;
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = {
        id: c.id,
        chapterId: c.id,
        name: c.title || c.name || `Глава ${c.number}`,
        number,
      };
      if (groupName) chapter.group = groupName;
      const time = c.createdAt ? Date.parse(c.createdAt) : NaN;
      if (!isNaN(time)) chapter.time = time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/content/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const state = parseTsrState(html);
    const chapter = queryData(state, 'chapter') || loaderData(state, 'chapter');
    if (!chapter) throw new Error(`InkStory: chapter missing for ${chapterId}`);

    const rawPages = Array.isArray(chapter.pages) ? chapter.pages.slice() : [];
    rawPages.sort((a, b) => (a && a.index ? a.index : 0) - (b && b.index ? b.index : 0));
    const pages = rawPages.map((p) => p && p.image).filter(Boolean).map(repairPageURL);

    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
