const SITE_BASE = 'https://novelbuddy.me';
const API_BASE = 'https://api.novelbuddy.me';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const KNOWN_TAG_RE =
  /^<\/?(p|br|strong|em|b|i|u|s|span|div|li|ul|ol|a|h[1-6]|blockquote|sup|sub|hr|img)(?:[\s/>]|$)/i;

function escapeStrayAngleBrackets(html) {
  let out = '';
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<' && !KNOWN_TAG_RE.test(html.slice(i))) {
      out += '&lt;';
    } else {
      out += ch;
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

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function statCount(stats, camelKey, snakeKey) {
  if (!stats) return undefined;
  const v = stats[camelKey] !== undefined ? stats[camelKey] : stats[snakeKey];
  return typeof v === 'number' ? v : undefined;
}

function mapListItem(raw) {
  const manga = {
    mangaId: raw.id,
    title: cleanText(raw.name) || raw.slug || raw.id,
    image: raw.cover || undefined,
    webURL: raw.url ? `${SITE_BASE}${raw.url}` : undefined,
    medium: 'novel',
  };
  const summary = htmlToText(raw.summary);
  if (summary) manga.summary = summary;
  if (raw.status) {
    manga.status = mapStatus(raw.status);
    manga.completed = manga.status === 'COMPLETED';
  }
  if (Array.isArray(raw.genres) && raw.genres.length) {
    manga.tags = raw.genres.map((g) => g.name).filter(Boolean);
  }
  if (typeof raw.rating === 'number' && raw.rating > 0) manga.rating = raw.rating;
  const views = statCount(raw.stats, 'views', 'views');
  if (views !== undefined) manga.views = views;
  const chapters = statCount(raw.stats, 'chaptersCount', 'chapters_count');
  if (chapters !== undefined) manga.chapters = chapters;
  return manga;
}

function parseNextData(html) {
  const $ = cheerio.load(html);
  const raw = $('#__NEXT_DATA__').first().html();
  if (!raw) throw new Error('__NEXT_DATA__ not found on page');
  return JSON.parse(raw);
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'ranking-day', name: 'Top Day' },
      { id: 'ranking-week', name: 'Top Week' },
      { id: 'ranking-month', name: 'Top Month' },
    ];
  }

  async getSortOptions() {
    return [
      { id: 'latest', label: 'Latest' },
      { id: 'popular', label: 'Popular' },
      { id: 'rating', label: 'Rating' },
      { id: 'views', label: 'Views' },
    ];
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${API_BASE}/genres`);
      if (!json.success || !json.data || !Array.isArray(json.data.items)) return [];
      return json.data.items
        .map((g) => ({ id: g.slug, label: g.name }))
        .filter((t) => t.id && t.label);
    } catch (e) {
      console.error('NovelBuddy getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';

    try {
      if (query) {
        const url = `${API_BASE}/titles/search?q=${encodeURIComponent(query)}&page=${page}`;
        const json = await this.requestJSON(url);
        if (!json.success || !json.data) return { results: [] };
        const results = (json.data.items || []).map(mapListItem);
        const pagination = json.data.pagination;
        return {
          results,
          metadata: pagination && pagination.has_next ? { page: page + 1 } : undefined,
        };
      }

      const tagIds = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
      if (tagIds.length > 0) {
        const sort = (request && request.sortId) || 'latest';
        const url = `${SITE_BASE}/genres/${encodeURIComponent(tagIds[0])}?sort=${encodeURIComponent(
          sort
        )}&page=${page}`;
        const html = await this.requestHTML(url);
        const pageProps = parseNextData(html).props.pageProps;
        const results = (pageProps.items || []).map(mapListItem);
        const pagination = pageProps.pagination;
        return {
          results,
          metadata: pagination && pagination.has_next ? { page: page + 1 } : undefined,
        };
      }

      const feed = (request && request.feed) || 'latest';
      let url;
      if (feed.indexOf('ranking-') === 0) {
        const tab = `top-${feed.slice('ranking-'.length)}`;
        url = `${SITE_BASE}/ranking?tab=${encodeURIComponent(tab)}&page=${page}`;
      } else {
        url = `${SITE_BASE}/latest?page=${page}`;
      }
      const html = await this.requestHTML(url);
      const pageProps = parseNextData(html).props.pageProps;
      const items = pageProps.items || pageProps.initialItems || [];
      const pagination = pageProps.pagination || pageProps.initialPagination;
      const results = items.map(mapListItem);
      return {
        results,
        metadata: pagination && pagination.has_next ? { page: page + 1 } : undefined,
      };
    } catch (e) {
      console.error('NovelBuddy getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const json = await this.requestJSON(`${API_BASE}/titles/${encodeURIComponent(mangaId)}`);
    if (!json.success || !json.data || !json.data.title) {
      throw new Error('NovelBuddy: manga not found');
    }
    const t = json.data.title;

    const author = (t.authors || []).map((a) => a.name).filter(Boolean).join(', ');
    const status = mapStatus(t.status);

    const mangaInfo = {
      title: cleanText(t.name) || mangaId,
      image: t.cover || undefined,
      desc: htmlToText(t.summary),
      status,
      tags: (t.genres || []).map((g) => g.name).filter(Boolean),
      webURL: t.url ? `${SITE_BASE}${t.url}` : `${SITE_BASE}/`,
      medium: 'novel',
      completed: status === 'COMPLETED',
    };
    if (author) mangaInfo.author = author;
    const views = statCount(t.stats, 'views', 'views');
    if (views !== undefined) mangaInfo.views = views;
    const chapters = statCount(t.stats, 'chaptersCount', 'chapters_count');
    if (chapters !== undefined) mangaInfo.chapters = chapters;
    if (typeof t.rating === 'number' && t.rating > 0) mangaInfo.rating = t.rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const json = await this.requestJSON(`${API_BASE}/titles/${encodeURIComponent(mangaId)}/chapters`);
      if (!json.success || !json.data || !Array.isArray(json.data.chapters)) return [];

      const chapters = json.data.chapters.map((c) => {
        let number = typeof c.number === 'number' ? c.number : undefined;
        if (number === undefined) {
          const m = String(c.slug || '').match(/chapter-([0-9.]+)/i);
          number = m ? parseFloat(m[1]) : 0;
        }
        const chapter = {
          id: c.id,
          chapterId: c.id,
          name: c.name || `Chapter ${number}`,
          number,
        };
        if (c.updated_at) chapter.time = Date.parse(c.updated_at);
        return chapter;
      });

      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('NovelBuddy getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${API_BASE}/titles/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`;
      const json = await this.requestJSON(url);
      if (!json.success || !json.data || !json.data.chapter) {
        throw new Error('NovelBuddy: chapter not found');
      }
      const text = htmlToText(json.data.chapter.content);
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('NovelBuddy getChapterDetails failed:', e);
      throw e;
    }
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
      throw new Error(`NovelBuddy API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`NovelBuddy HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
