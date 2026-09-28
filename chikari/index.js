const SITE_BASE = 'https://chikari.moe';
const API_BASE = 'https://chikari.moe/api';
const PAGE_SIZE = 24;
const CHAPTER_BATCH = 500;
const CHAPTER_HARD_CAP = 5000;

const BLOCKED_GENRE_SLUG = 'shotacon';
const BLOCKED_SLUGS = new Set([
  'something-naughty-would-happen-if-they-knew-each-others-thoughts',
  'the-rise-of-the-unemployed-wise-man',
]);
const BLOCKED_LABELS = new Set(['shotacon', 'shota']);
function hasBlockedGenre(list) {
  return (list || []).some((g) => {
    const label = typeof g === 'string' ? g : g && (g.slug || g.name);
    return label && BLOCKED_LABELS.has(String(label).toLowerCase());
  });
}

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function qs(params) {
  const parts = [];
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === undefined || v === null || v === '') continue;
    for (const one of Array.isArray(v) ? v : [v]) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(one))}`);
    }
  }
  return parts.join('&');
}

const SORT_MAP = {
  popular: 'popular',
  trending: 'trending-week',
  latest: 'added',
  rating: 'top_rated',
};

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'trending', name: 'Trending' },
      { id: 'latest', name: 'Latest' },
      { id: 'rating', name: 'Top Rated' },
    ];
  }

  async getSearchTags() {
    try {
      const [novelGenres, comicGenres] = await Promise.all([
        this.requestJSON(`${API_BASE}/novels/genres`).catch(() => []),
        this.requestJSON(`${API_BASE}/genres`).catch(() => []),
      ]);
      const merged = new Map();
      for (const g of [...novelGenres, ...comicGenres]) {
        if (g && g.slug) merged.set(g.slug, g.name || g.slug);
      }
      return Array.from(merged, ([id, label]) => ({ id, label }))
        .filter((g) => g.id !== BLOCKED_GENRE_SLUG)
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('Chikari getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'popular';
    const medium = (request && request.medium) === 'novel' ? 'novel' : 'comics';
    const tagIds = ((request && request.includedTags) || [])
      .map((t) => t.id)
      .filter(Boolean);
    const sort = SORT_MAP[feed] || 'popular';

    if (tagIds[0] === BLOCKED_GENRE_SLUG) return { results: [], metadata: undefined };

    if (query) {
      if (medium === 'novel' || page > 1) return { results: [], metadata: undefined };
      const found = await this.requestJSON(`${API_BASE}/search?${qs({ q: query })}`);
      return {
        results: (Array.isArray(found) ? found : [])
          .filter((s) => !BLOCKED_SLUGS.has(s.slug))
          .map((s) => this.toPartialManga(s, 'comics')),
        metadata: undefined,
      };
    }

    const base = medium === 'novel' ? `${API_BASE}/novels` : `${API_BASE}/series`;
    const json = await this.requestJSON(
      `${base}?${qs({
        sort: sort === 'trending-week' ? 'trending-week' : sort,
        period: sort === 'trending-week' ? 'week' : undefined,
        type: medium === 'comics' ? ['manga', 'manhwa', 'manhua'] : undefined,
        genre: tagIds.length ? tagIds[0] : undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })}`
    );

    const rawItems = json.items || [];
    const items = rawItems.filter((s) => !BLOCKED_SLUGS.has(s.slug));
    const total = typeof json.total === 'number' ? json.total : 0;
    const seen = (typeof json.offset === 'number' ? json.offset : (page - 1) * PAGE_SIZE) + rawItems.length;
    return {
      results: items.map((s) => this.toPartialManga(s, medium)),
      metadata: rawItems.length && seen < total ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const { medium, slug } = splitId(mangaId);
    const base = medium === 'novel' ? `${API_BASE}/novels` : `${API_BASE}/series`;
    const s = await this.requestJSON(`${base}/${encodeURIComponent(slug)}`);
    if (!s || !s.slug) throw new Error('title not found');
    if (
      medium === 'comics' &&
      (BLOCKED_SLUGS.has(s.slug) || hasBlockedGenre(s.genres) || hasBlockedGenre(s.tags))
    ) {
      throw new Error('title not available');
    }

    const authors = (s.authors || []).filter((a) => a.role !== 'artist').map((a) => a.name);
    const artists = (s.authors || []).filter((a) => a.role === 'artist').map((a) => a.name);
    const credit = [authors.join(', '), artists.join(', ')].filter(Boolean).join(' / ');

    return {
      mangaInfo: {
        title: s.title,
        titles: [s.title].concat(s.alt_titles || []),
        image: s.cover_url,
        author: credit || undefined,
        desc: stripHtml(s.description),
        status: mapStatus(s.status),
        tags: (s.genres || []).map((g) => g.name).concat((s.tags || []).map((t) => t.name)),
        webURL: `${SITE_BASE}/${medium === 'novel' ? 'novels' : 'series'}/${s.slug}`,
        medium,
        rating: typeof s.rating === 'number' ? s.rating : undefined,
        views: typeof s.views === 'number' ? s.views : undefined,
        chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
        publishingStatus: s.status || undefined,
        completed: String(s.status || '').toLowerCase() === 'completed',
        releaseDate: s.year ? String(s.year) : undefined,
      },
    };
  }

  async getChapters(mangaId) {
    const { medium, slug } = splitId(mangaId);
    const base = `${API_BASE}/${medium === 'novel' ? 'novels' : 'series'}/${encodeURIComponent(slug)}/chapters`;
    try {
      const raw = [];
      let total = Infinity;
      while (raw.length < total && raw.length < CHAPTER_HARD_CAP) {
        const json = await this.requestJSON(`${base}?${qs({ limit: CHAPTER_BATCH, offset: raw.length })}`);
        const items = json.items || [];
        if (typeof json.total === 'number') {
          total = json.total;
        } else if (items.length < CHAPTER_BATCH) {
          total = raw.length + items.length;
        }
        if (!items.length) break;
        raw.push(...items);
      }

      return raw.map((c) => {
        const number = Number(c.number);
        const volume = c.volume ? `Vol. ${c.volume} ` : '';
        return {
          id: String(number),
          chapterId: String(number),
          name: c.title ? `${volume}${c.title}` : `${volume}Chapter ${number}`,
          number,
          time: c.created_at ? Date.parse(c.created_at) : undefined,
        };
      });
    } catch (e) {
      console.error('Chikari getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    const { medium, slug } = splitId(mangaId);
    if (medium === 'novel') {
      const json = await this.requestJSON(
        `${API_BASE}/novels/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(chapterId)}/read`
      );
      return { id: chapterId, mangaId, pages: [], text: json.body };
    }
    const json = await this.requestJSON(
      `${API_BASE}/series/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(chapterId)}`
    );
    const pages = (json.pages || [])
      .map((p) => (typeof p === 'string' ? p : p && p.url))
      .filter(Boolean);
    return { id: chapterId, mangaId, pages };
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
      throw new Error(`Chikari API HTTP ${response.status} for ${url}`);
    }
    return JSON.parse(response.data);
  }

  toPartialManga(s, medium) {
    return {
      mangaId: `${medium === 'novel' ? 'novel' : 'series'}:${s.slug}`,
      title: s.title,
      image: s.cover_url,
      tags: (s.genres || []).map((g) => (typeof g === 'string' ? g : g.name)),
      webURL: `${SITE_BASE}/${medium === 'novel' ? 'novels' : 'series'}/${s.slug}`,
      medium,
      rating: typeof s.rating === 'number' ? s.rating : undefined,
      views: typeof s.views === 'number' ? s.views : undefined,
      chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
      publishingStatus: s.status || undefined,
      completed: String(s.status || '').toLowerCase() === 'completed',
    };
  }
}

function splitId(mangaId) {
  const idx = mangaId.indexOf(':');
  if (idx === -1) return { medium: 'comics', slug: mangaId };
  const prefix = mangaId.slice(0, idx);
  return { medium: prefix === 'novel' ? 'novel' : 'comics', slug: mangaId.slice(idx + 1) };
}

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'releasing' || s === 'ongoing') return 'ONGOING';
  if (s === 'completed' || s === 'finished') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled' || s === 'dropped') return 'CANCELLED';
  return 'UNKNOWN';
}

function stripHtml(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('br').replaceWith('\n');
  $('p, div, li').each((_, el) => {
    $(el).append('\n\n');
  });
  return $.root()
    .text()
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { Source };
