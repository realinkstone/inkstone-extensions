const SITE_BASE = 'https://inkstory.net';
const PAGE_SIZE = 30;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'viewsCount,desc', name: 'Популярное' },
  { id: 'updatedAt,desc', name: 'Обновления' },
  { id: 'createdAt,desc', name: 'Новинки' },
  { id: 'averageRating,desc', name: 'Топ рейтинг' },
];

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

function unescapeHtmlAttr(s) {
  return (s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function unwrapIslandValue(node) {
  if (Array.isArray(node) && node.length === 2 && typeof node[0] === 'number') {
    const tag = node[0];
    const val = node[1];
    if (tag === 1) {
      return Array.isArray(val) ? val.map(unwrapIslandValue) : val;
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const out = {};
      Object.keys(val).forEach((k) => {
        out[k] = unwrapIslandValue(val[k]);
      });
      return out;
    }
    return val;
  }
  return node;
}

function getIslandProps(html, componentExport) {
  const marker = `component-export="${componentExport}"`;
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const propsAttr = 'props="';
  const propsIdx = html.indexOf(propsAttr, markerIdx);
  if (propsIdx === -1) return null;
  const valueStart = propsIdx + propsAttr.length;
  const valueEnd = html.indexOf('"', valueStart);
  if (valueEnd === -1) return null;
  const raw = html.slice(valueStart, valueEnd);
  let json;
  try {
    json = JSON.parse(unescapeHtmlAttr(raw));
  } catch (e) {
    return null;
  }
  const out = {};
  Object.keys(json).forEach((k) => {
    out[k] = unwrapIslandValue(json[k]);
  });
  return out;
}

function unflattenDevalue(values) {
  const UNDEFINED = -1;
  const NAN_VALUE = -2;
  const POSITIVE_INFINITY = -3;
  const NEGATIVE_INFINITY = -4;
  const NEGATIVE_ZERO = -5;

  const hydrated = new Map();

  function hydrate(index) {
    if (index === UNDEFINED) return undefined;
    if (index === NAN_VALUE) return NaN;
    if (index === POSITIVE_INFINITY) return Infinity;
    if (index === NEGATIVE_INFINITY) return -Infinity;
    if (index === NEGATIVE_ZERO) return -0;
    if (hydrated.has(index)) return hydrated.get(index);

    const value = values[index];

    if (value === null || typeof value !== 'object') {
      hydrated.set(index, value);
      return value;
    }

    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'string') {
        const tag = value[0];
        if (tag === 'Set') {
          const set = [];
          hydrated.set(index, set);
          for (let i = 1; i < value.length; i++) set.push(hydrate(value[i]));
          return set;
        }
        if (tag === 'Map') {
          const map = {};
          hydrated.set(index, map);
          for (let i = 1; i < value.length; i += 2) {
            map[String(hydrate(value[i]))] = hydrate(value[i + 1]);
          }
          return map;
        }
        const generic = { __tag: tag, __args: value.slice(1).map(hydrate) };
        hydrated.set(index, generic);
        return generic;
      }
      const arr = new Array(value.length);
      hydrated.set(index, arr);
      for (let i = 0; i < value.length; i++) arr[i] = hydrate(value[i]);
      return arr;
    }

    const obj = {};
    hydrated.set(index, obj);
    Object.keys(value).forEach((k) => {
      obj[k] = hydrate(value[k]);
    });
    return obj;
  }

  return hydrate(0);
}

function extractNanostores(html) {
  const idAttr = 'id="it-astro-state"';
  const idIdx = html.indexOf(idAttr);
  if (idIdx === -1) return null;
  const tagEnd = html.indexOf('>', idIdx);
  if (tagEnd === -1) return null;
  const scriptEnd = html.indexOf('</script>', tagEnd);
  if (scriptEnd === -1) return null;
  const jsonText = html.slice(tagEnd + 1, scriptEnd);

  let values;
  try {
    values = JSON.parse(jsonText);
  } catch (e) {
    return null;
  }
  if (!Array.isArray(values) || values.length === 0) return null;

  const root = unflattenDevalue(values);
  return (root && root['@inox-tools/request-nanostores']) || null;
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

function bookToPartialManga(book) {
  if (!book || !book.slug) return null;
  const title = pickTitle(book.name);
  if (!title) return null;
  if (!book.poster) return null;

  const manga = {
    mangaId: book.slug,
    title,
    image: book.poster,
    webURL: `${SITE_BASE}/content/${book.slug}`,
    medium: 'comics',
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

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/content`);
      const props = getIslandProps(html, 'BookCatalogGridWithFilters');
      const labels = (props && props.labels) || [];
      return labels
        .filter((l) => l && l.slug && l.name)
        .map((l) => ({ id: l.slug, label: l.name }));
    } catch (e) {
      console.error('InkStory getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || FEEDS[0].id;
    const includedTags = ((request && request.includedTags) || [])
      .map((t) => t && t.id)
      .filter(Boolean);
    const excludedTags = ((request && request.excludedTags) || [])
      .map((t) => t && t.id)
      .filter(Boolean);
    const page = (metadata && metadata.page) || 0;

    const url = buildURL(`${SITE_BASE}/content`, {
      search: query,
      sort: feed,
      page,
      labelsInclude: includedTags,
      labelsExclude: excludedTags,
    });

    const html = await this.requestHTML(url);
    const props = getIslandProps(html, 'BookCatalogGridWithFilters');
    const books = (props && props.initialBooks) || [];
    const totalHits = (props && props.initialTotalHits) || 0;

    const results = books.map(bookToPartialManga).filter(Boolean);
    const hasNext = results.length > 0 && (page + 1) * PAGE_SIZE < totalHits;

    return {
      results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/content/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const state = extractNanostores(html);
    const book = state && state['current-book'];
    if (!book) throw new Error(`InkStory: current-book missing for ${mangaId}`);

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
      image: book.poster || '',
      desc: book.description || '',
      status: mapStatus(book.status),
      tags,
      webURL: url,
      medium: 'comics',
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
    const url = `${SITE_BASE}/content/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const state = extractNanostores(html);
    const chapters = (state && state['current-book-chapters']) || [];
    const branches = (state && state['current-book-branches']) || [];
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
        name: c.name || `Глава ${c.number}`,
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
    const state = extractNanostores(html);
    const chapter = state && state['reader-current-chapter'];
    if (!chapter) throw new Error(`InkStory: reader-current-chapter missing for ${chapterId}`);

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
