const SITE_BASE = 'https://keikomik.net';
const LIST_API = `${SITE_BASE}/api/list`;
const SEARCH_API = `${SITE_BASE}/api/search`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_LIMIT = 30;

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

const FEED_SORT = {
  update: { sort: 'UpdateAt', direction: 'desc' },
  new: { sort: 'CreateAt', direction: 'desc' },
  popular: { sort: 'views', direction: 'desc' },
  rating: { sort: 'rate', direction: 'desc' },
  az: { sort: 'name', direction: 'asc' },
  za: { sort: 'name', direction: 'desc' },
};

function extractNextData(html) {
  const m = (html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return null;
  }
}

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return undefined;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function mangaWebURL(mangaId) {
  return `${SITE_BASE}/komik/${encodeURIComponent(mangaId)}`;
}

function toPartialManga(x) {
  if (!x || !x.slug || !x.name || !x.image) return null;
  const manga = {
    mangaId: x.slug,
    title: x.name,
    image: x.image,
    webURL: mangaWebURL(x.slug),
    medium: 'comics',
  };
  if (Number.isFinite(x.largestKey)) {
    manga.chapters = x.largestKey;
  } else if (x.Komik && typeof x.Komik === 'object') {
    const n = Object.keys(x.Komik).length;
    if (n > 0) manga.chapters = n;
  }
  if (Array.isArray(x.genre) && x.genre.length > 0) manga.tags = x.genre.slice();
  if (typeof x.description === 'string' && x.description) manga.summary = x.description;
  if (typeof x.rate === 'number' && Number.isFinite(x.rate)) manga.rating = x.rate;
  if (typeof x.views === 'number' && Number.isFinite(x.views)) manga.views = x.views;
  if (typeof x.status === 'string' && x.status) manga.completed = mapStatus(x.status) === 'COMPLETED';
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'update', name: 'Latest Update' },
      { id: 'new', name: 'New' },
      { id: 'popular', name: 'Popular' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'az', name: 'A-Z' },
      { id: 'za', name: 'Z-A' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/list`);
      const tags = [];
      const re = /<option value="([^"]*)">([^<]*)<\/option>/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const id = cleanText(m[1]);
        const label = cleanText(m[2]);
        if (id && label) tags.push({ id, label });
      }
      return tags;
    } catch (e) {
      console.error('Keikomik getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';

    if (query) {
      const url = `${SEARCH_API}?${qs({ q: query })}`;
      const json = await this.requestJSON(url);
      const raw = Array.isArray(json) ? json : [];
      const results = raw.map(toPartialManga).filter(Boolean);
      return { results, metadata: undefined };
    }

    const page = (metadata && metadata.page) || 1;
    const feedId = (request && request.feed) || 'update';
    const feed = FEED_SORT[feedId] || FEED_SORT.update;
    const includedTags = (request && request.includedTags) || [];
    const genre = includedTags.length > 0 && includedTags[0] && typeof includedTags[0].id === 'string'
      ? includedTags[0].id
      : undefined;

    const url = `${LIST_API}?${qs({ page, limit: PAGE_LIMIT, sort: feed.sort, direction: feed.direction, genre })}`;
    const json = await this.requestJSON(url);
    const data = json && Array.isArray(json.data) ? json.data : [];
    const results = data.map(toPartialManga).filter(Boolean);
    const hasNext = !!(json && json.hasNextPage);

    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = mangaWebURL(mangaId);
    const html = await this.requestHTML(url);
    const next = extractNextData(html);
    const item = next && next.props && next.props.pageProps && next.props.pageProps.item;
    if (!item) {
      throw new Error(`Keikomik: no manga data found for "${mangaId}"`);
    }

    const tags = Array.isArray(item.genre) ? item.genre.slice() : [];
    if (Array.isArray(item.themes)) {
      item.themes.forEach((t) => {
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
    }

    const author = [item.author, item.artist]
      .filter((v, i, arr) => typeof v === 'string' && v && arr.indexOf(v) === i)
      .join(', ');

    const mangaInfo = {
      title: item.name || mangaId,
      image: item.image || '',
      desc: item.description || '',
      status: mapStatus(item.status),
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (author) mangaInfo.author = author;
    if (typeof item.rate === 'number' && Number.isFinite(item.rate)) mangaInfo.rating = item.rate;
    if (typeof item.views === 'number' && Number.isFinite(item.views)) mangaInfo.views = item.views;
    if (item.rilis) mangaInfo.releaseDate = String(item.rilis);
    mangaInfo.completed = mangaInfo.status === 'COMPLETED';

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = mangaWebURL(mangaId);
    const html = await this.requestHTML(url);
    const next = extractNextData(html);
    const item = next && next.props && next.props.pageProps && next.props.pageProps.item;
    const komik = (item && item.Komik) || {};

    const numbers = Object.keys(komik)
      .map((k) => parseFloat(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    return numbers.map((n) => {
      const key = String(n);
      const entry = komik[key] || {};
      const chapterId = `${mangaId}-chapter-${key}`;
      const chapter = {
        id: chapterId,
        chapterId,
        name: `Chapter ${key}`,
        number: n,
      };
      const time = toEpochMs(entry.UpdateAt !== undefined ? entry.UpdateAt : entry.CreateAt);
      if (time !== undefined) chapter.time = time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/chapter/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const next = extractNextData(html);
    const pageProps = next && next.props && next.props.pageProps;
    const subItem = pageProps && pageProps.subItem;
    const pages = subItem && Array.isArray(subItem.img)
      ? subItem.img.filter((p) => typeof p === 'string' && p)
      : [];

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

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
