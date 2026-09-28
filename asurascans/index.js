const API_BASE = 'https://api.asurascans.com/api';
const SITE_BASE = 'https://asurascans.com';
const PAGE_SIZE = 20;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'trending', name: 'Trending' },
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'title', name: 'A–Z' },
    ];
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${API_BASE}/genres`);
      return (json.data || [])
        .map((g) => ({ id: g.slug, label: g.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('AsuraScans getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || null;
    const tagIds = ((request && request.includedTags) || [])
      .map((t) => t.id)
      .filter(Boolean);
    const page = (metadata && metadata.page) || 1;

    const offset = (page - 1) * PAGE_SIZE;
    const params = { limit: PAGE_SIZE, offset };
    if (tagIds.length) params.genres = tagIds.join(',');

    let url;
    if (query) {
      params.q = query;
      url = `${API_BASE}/search?${qs(params)}`;
    } else {
      params.sort = feed || 'trending';
      url = `${API_BASE}/series?${qs(params)}`;
    }

    const json = await this.requestJSON(url);
    const data = json.data || [];
    const results = data.map((s) => this.toPartialManga(s));
    const total = json.meta && typeof json.meta.total === 'number' ? json.meta.total : 0;
    const hasMore = data.length > 0 && offset + data.length < total;
    return { results, metadata: hasMore ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const json = await this.requestJSON(`${API_BASE}/series/${encodeURIComponent(mangaId)}`);
    const series = json.series || (json.data && json.data.series);
    if (!series) throw new Error('series not found');
    return this.toMangaInfo(series);
  }

  async getChapters(mangaId) {
    try {
      const json = await this.requestJSON(
        `${API_BASE}/series/${encodeURIComponent(mangaId)}/chapters`
      );
      return (json.data || []).map((c) => {
        const baseName = c.title || `Chapter ${c.number}`;
        const unlockAt = c.early_access_until ? Date.parse(c.early_access_until) : NaN;
        const locked = c.is_premium === true && Number.isFinite(unlockAt) && unlockAt > Date.now();
        return {
          id: String(c.number),
          chapterId: String(c.number),
          name: locked ? `${baseName} (Locked, unlocks in ${formatUnlockIn(unlockAt)})` : baseName,
          number: Number(c.number),
          time: c.published_at ? Date.parse(c.published_at) : undefined,
        };
      });
    } catch (e) {
      console.error('AsuraScans getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this.requestJSON(
      `${API_BASE}/series/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`
    );
    const chapter = json.data && json.data.chapter;
    const pages = (chapter && chapter.pages) || [];
    return {
      id: chapterId,
      mangaId,
      pages: pages.map((p) => (typeof p === 'string' ? p : p.url)).filter(Boolean),
    };
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
      throw new Error(`AsuraScans API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }

  toPartialManga(s) {
    return {
      mangaId: s.slug,
      title: s.title,
      image: s.cover,
      author: [s.author, s.artist].filter(Boolean).join(' / ') || undefined,
      summary: htmlToText(s.description),
      tags: (s.genres || []).map((g) => g.name),
      webURL: s.public_url ? `${SITE_BASE}${s.public_url}` : undefined,
      medium: 'comics',
      rating: typeof s.rating === 'number' ? s.rating : undefined,
      chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
      completed: isCompletedStatus(s.status),
      releaseDate: s.release_year ? String(s.release_year) : undefined,
    };
  }

  toMangaInfo(s) {
    return {
      mangaInfo: {
        title: s.title,
        image: s.cover,
        author: [s.author, s.artist].filter(Boolean).join(' / ') || undefined,
        desc: htmlToText(s.description),
        status: mapStatus(s.status),
        tags: (s.genres || []).map((g) => g.name),
        webURL: s.public_url ? `${SITE_BASE}${s.public_url}` : undefined,
        medium: 'comics',
        rating: typeof s.rating === 'number' ? s.rating : undefined,
        chapters: typeof s.chapter_count === 'number' ? s.chapter_count : undefined,
        completed: isCompletedStatus(s.status),
        releaseDate: s.release_year ? String(s.release_year) : undefined,
      },
    };
  }
}

function mapStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'ongoing':
      return 'ONGOING';
    case 'completed':
    case 'ended':
      return 'COMPLETED';
    case 'hiatus':
      return 'HIATUS';
    case 'cancelled':
    case 'dropped':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

function isCompletedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'ended';
}

function formatUnlockIn(unlockAtMs) {
  const totalMinutes = Math.ceil((unlockAtMs - Date.now()) / 60000);
  if (totalMinutes <= 0) return 'moments';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

const KNOWN_TAG_RE =
  /^<\/?(p|br|strong|em|b|i|u|s|span|div|li|ul|ol|a|h[1-6]|blockquote|sup|sub|hr|img)(?:[\s/>]|$)/i;

function escapeStrayAngleBrackets(html) {
  let out = '';
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<' && !KNOWN_TAG_RE.test(html.slice(i))) {
      out += '&lt;';
    } else {
      out += html[i];
    }
  }
  return out;
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(escapeStrayAngleBrackets(String(html)));
  $('br').each((_, el) => {
    $(el).replaceWith('\n');
  });
  $('p, div, li').each((_, el) => {
    const isParagraph = el.tagName && el.tagName.toLowerCase() === 'p';
    $(el).append(isParagraph ? '\n\n' : '\n');
  });
  return $.root()
    .text()
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { Source };
