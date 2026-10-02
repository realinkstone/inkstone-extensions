const REQUESTED_SITE = 'https://hivetoon.com';
const SITE_BASE = 'https://hivetoons.org';
const API_BASE = 'https://api.hivetoons.org/api';
const API_QUERY_URL = `${API_BASE}/query`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PER_PAGE = 50;

const COMIC_SERIES_TYPES = 'MANHWA,MANHUA,MANGA';

const BLOCKED_GENRES = new Set(['shotacon', 'shota', 'lolicon', 'loli']);
const BLOCKED_IDS_TTL_MS = 10 * 60 * 1000;

function blockedKey(value) {
  return String(value === undefined || value === null ? '' : value)
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

function isBlockedGenre(genre) {
  if (typeof genre === 'string') return BLOCKED_GENRES.has(blockedKey(genre));
  return !!genre && (BLOCKED_GENRES.has(blockedKey(genre.name)) || BLOCKED_GENRES.has(blockedKey(genre.slug)));
}

function hasBlockedGenre(list) {
  return Array.isArray(list) && list.some(isBlockedGenre);
}

function isBlockedTag(tag, blockedIds) {
  if (!tag) return false;
  return (
    blockedIds.has(String(tag.id)) ||
    isBlockedGenre(String(tag.id)) ||
    isBlockedGenre(tag.label) ||
    isBlockedGenre(tag.name)
  );
}

const FEED_SORTS = {
  latest_chapters: { orderBy: 'lastChapterAddedAt', orderDirection: 'desc' },
  recently_updated: { orderBy: 'updatedAt', orderDirection: 'desc' },
  popular: { orderBy: 'totalViews', orderDirection: 'desc' },
  newest: { orderBy: 'createdAt', orderDirection: 'desc' },
  oldest: { orderBy: 'createdAt', orderDirection: 'asc' },
  alphabetical: { orderBy: 'postTitle', orderDirection: 'asc' },
};
const DEFAULT_FEED = 'latest_chapters';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function creditName(value) {
  const text = cleanText(value);
  return /^-+$/.test(text) ? '' : text;
}

function descriptionText(raw) {
  if (!raw) return '';
  const frag = cheerio.load(`<div id="hvtn-root">${raw}</div>`);
  frag('br').replaceWith('\n');
  const root = frag('#hvtn-root');
  const paragraphs = root.find('> p');
  let text;
  if (paragraphs.length > 0) {
    const parts = [];
    paragraphs.each((_, el) => {
      const t = frag(el).text().replace(/[ \t]+/g, ' ').trim();
      if (t) parts.push(t);
    });
    text = parts.join('\n\n');
  } else {
    text = root.text();
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function mapStatus(seriesStatus) {
  const s = (seriesStatus || '').toUpperCase();
  if (s === 'ONGOING') return 'ONGOING';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'HIATUS') return 'HIATUS';
  if (s === 'DROPPED' || s === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

function parsePost(p) {
  const tags = (p.genres || []).map((g) => cleanText(g && g.name)).filter(Boolean);
  const manga = {
    mangaId: p.slug,
    title: p.postTitle || p.slug,
    image: p.featuredImage || '',
    tags,
    webURL: `${SITE_BASE}/series/${p.slug}`,
    medium: 'comics',
  };
  if (typeof p.averageRating === 'number') manga.rating = p.averageRating;
  if (mapStatus(p.seriesStatus) === 'COMPLETED') manga.completed = true;
  return manga;
}

function chapterDisplayName(ch) {
  const title = cleanText(ch.title);
  const base = title || `Chapter ${ch.number}`;
  return ch.isLocked ? `${base} (Locked, Early Access)` : base;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest_chapters', name: 'Latest Chapters' },
      { id: 'recently_updated', name: 'Recently Updated' },
      { id: 'popular', name: 'Most Popular' },
      { id: 'newest', name: 'Newest Added' },
      { id: 'oldest', name: 'Oldest First' },
      { id: 'alphabetical', name: 'A-Z' },
    ];
  }

  async getSearchTags() {
    try {
      const genres = await this.requestJSON(`${API_BASE}/genres`);
      const seen = new Set();
      const tags = [];
      (Array.isArray(genres) ? genres : []).forEach((g) => {
        if (!g || g.id === undefined || g.id === null) return;
        if (isBlockedGenre(g)) return;
        const id = String(g.id);
        if (seen.has(id)) return;
        const label = cleanText(g.name);
        if (!label) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('HiveToons getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const blockedIds = await this.blockedGenreIds();

    const page = (metadata && metadata.page) || 1;
    const params = [`page=${page}`, `perPage=${PER_PAGE}`, 'view=archive', `seriesType=${COMIC_SERIES_TYPES}`];

    const query = (request && request.title) || '';
    if (query) params.push(`searchTerm=${encodeURIComponent(query)}`);

    const includedTags = (request && request.includedTags) || [];
    if (includedTags.some((t) => isBlockedTag(t, blockedIds))) {
      return { results: [], metadata: undefined };
    }
    const genreIds = includedTags.map((t) => t && t.id).filter(Boolean);
    if (genreIds.length > 0) params.push(`genreIds=${encodeURIComponent(genreIds.join(','))}`);

    const excludedTags = (request && request.excludedTags) || [];
    const excludedGenreIds = excludedTags.map((t) => t && t.id).filter(Boolean).map(String);
    blockedIds.forEach((id) => {
      if (excludedGenreIds.indexOf(id) === -1) excludedGenreIds.push(id);
    });
    if (excludedGenreIds.length > 0) {
      params.push(`excludedGenreIds=${encodeURIComponent(excludedGenreIds.join(','))}`);
    }

    const feedId = (request && request.feed) || DEFAULT_FEED;
    const sort = FEED_SORTS[feedId] || FEED_SORTS[DEFAULT_FEED];
    params.push(`orderBy=${sort.orderBy}`, `orderDirection=${sort.orderDirection}`);

    const url = `${API_QUERY_URL}?${params.join('&')}`;
    const json = await this.requestJSON(url);
    const posts = (json && json.posts) || [];
    const totalCount = (json && json.totalCount) || 0;

    const results = posts.filter((p) => p && !hasBlockedGenre(p.genres)).map(parsePost);
    const hasNext = page * PER_PAGE < totalCount;

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const post = await this.requestPost(mangaId);

    const tags = (post.genres || []).map((g) => cleanText(g && g.name)).filter(Boolean);
    const credits = [];
    [post.author, post.artist].forEach((value) => {
      const name = creditName(value);
      if (name && credits.indexOf(name) === -1) credits.push(name);
    });
    const author = credits.join(' / ');
    const status = mapStatus(post.seriesStatus);

    const mangaInfo = {
      title: post.postTitle || mangaId,
      image: post.featuredImage || '',
      desc: descriptionText(post.postContent),
      status,
      tags,
      webURL: `${SITE_BASE}/series/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (author) mangaInfo.author = author;
    if (status === 'COMPLETED') mangaInfo.completed = true;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const post = await this.requestPost(mangaId);
    const data = await this.requestJSON(`${API_BASE}/chapters?postId=${encodeURIComponent(post.id)}&take=all`);
    const raw = data && data.post && data.post.chapters;
    if (!Array.isArray(raw)) {
      throw new Error(`No chapter list in the response for ${mangaId}`);
    }

    const chapters = raw
      .filter((ch) => ch && ch.slug)
      .map((ch) => {
        const chapter = {
          id: ch.slug,
          chapterId: ch.slug,
          name: chapterDisplayName(ch),
          number: typeof ch.number === 'number' ? ch.number : parseFloat(ch.number) || 0,
        };
        const time = Date.parse(ch.createdAt);
        if (!Number.isNaN(time)) chapter.time = time;
        return chapter;
      });

    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    await this.requestPost(mangaId);

    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const found = [];
    $('img[data-reader-page-image]').each((_, el) => {
      const $el = $(el);
      const src = ($el.attr('src') || '').trim();
      if (!/^https?:\/\//.test(src)) return;
      const idxAttr = $el.attr('data-reader-index');
      const idx = idxAttr !== undefined ? parseInt(idxAttr, 10) : found.length;
      found.push({ idx: Number.isNaN(idx) ? found.length : idx, src });
    });
    found.sort((a, b) => a.idx - b.idx);
    const pages = found.map((p) => p.src);

    return { id: chapterId, mangaId, pages };
  }

  async requestPost(mangaId) {
    const data = await this.requestJSON(`${API_BASE}/post?postSlug=${encodeURIComponent(mangaId)}`);
    const post = data && data.post;
    if (!post || post.id === undefined || post.id === null) {
      throw new Error(`Could not find series data for ${mangaId}`);
    }
    if (hasBlockedGenre(post.genres) || hasBlockedGenre(post.tags)) {
      throw new Error('title not available');
    }
    return post;
  }

  async blockedGenreIds() {
    const now = Date.now();
    if (this.blockedIds && now - this.blockedIdsAt < BLOCKED_IDS_TTL_MS) return this.blockedIds;
    const genres = await this.requestJSON(`${API_BASE}/genres`);
    if (!Array.isArray(genres)) throw new Error('Could not load the genre list');
    const ids = new Set();
    genres.forEach((g) => {
      if (g && g.id !== undefined && g.id !== null && isBlockedGenre(g)) ids.add(String(g.id));
    });
    this.blockedIds = ids;
    this.blockedIdsAt = now;
    return ids;
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
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.data;
  }

  async requestJSON(url) {
    const text = await this.requestHTML(url);
    return JSON.parse(text);
  }
}

module.exports = { Source };
