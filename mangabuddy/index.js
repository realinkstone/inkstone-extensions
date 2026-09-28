const SITE_BASE = 'https://mangabuddy1.co.uk';
const PAGE_SIZE = 18;

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
      { id: 'latest', name: 'Latest' },
      { id: 'ongoing', name: 'Ongoing' },
      { id: 'completed', name: 'Completed' },
      { id: 'manhwa', name: 'Manhwa' },
      { id: 'manga', name: 'Manga' },
      { id: 'manhua', name: 'Manhua' },
    ];
  }

  async getSearchTags() {
    return [];
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;

    const params = { page };
    let url;
    if (query) {
      params.search = query;
      url = `${SITE_BASE}/api/search?${qs(params)}`;
    } else {
      switch (feed) {
        case 'ongoing':
          params.status = 'ongoing';
          break;
        case 'completed':
          params.status = 'completed';
          break;
        case 'manhwa':
        case 'manga':
        case 'manhua':
          params.type = feed;
          break;
        default:
          break;
      }
      url = `${SITE_BASE}/api/series?${qs(params)}`;
    }

    try {
      const json = await this.requestJSON(url);
      const comics = json.comics || [];
      const results = comics.map((c) => this.toPartialManga(c));
      return {
        results,
        metadata: hasMorePages(json, page, comics.length) ? { page: page + 1 } : undefined,
      };
    } catch (e) {
      console.error('MangaBuddy getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const [seriesJson, html] = await Promise.all([
      this.requestJSON(`${SITE_BASE}/api/series/${encodeURIComponent(mangaId)}`),
      this.requestText(`${SITE_BASE}/series/${encodeURIComponent(mangaId)}`).catch((e) => {
        console.error('MangaBuddy detail HTML fetch failed:', e);
        return '';
      }),
    ]);

    const comic = seriesJson.comic || {};
    const { desc, tags } = parseDetailHtml(html);
    const chapters = Array.isArray(seriesJson.chapters) ? seriesJson.chapters : [];

    return {
      mangaInfo: {
        title: comic.title || mangaId,
        image: comic.cover || undefined,
        author: comic.author && comic.author !== 'Unknown' ? comic.author : undefined,
        desc,
        status: mapStatus(comic.status),
        tags,
        webURL: `${SITE_BASE}/series/${mangaId}`,
        medium: 'comics',
        rating: typeof comic.rating_value === 'number' && comic.rating_value > 0
          ? comic.rating_value
          : undefined,
        chapters: chapters.length || undefined,
        completed: isCompletedStatus(comic.status),
        releaseDate: comic.release_year ? String(comic.release_year) : undefined,
      },
    };
  }

  async getChapters(mangaId) {
    try {
      const json = await this.requestJSON(
        `${SITE_BASE}/api/series/${encodeURIComponent(mangaId)}`
      );
      const chapters = (json.chapters || []).map((c) => {
        const id = chapterIdFromUrl(c.url) || `chapter-${c.number}`;
        return {
          id,
          chapterId: id,
          name: c.name || `Chapter ${c.number}`,
          number: Number(c.number),
        };
      });
      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('MangaBuddy getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestText(url);
      const pages = parseChapterImages(html);
      return { id: chapterId, mangaId, pages };
    } catch (e) {
      console.error('MangaBuddy getChapterDetails failed:', e);
      throw e;
    }
  }

  toPartialManga(c) {
    return {
      mangaId: c.slug,
      title: c.title,
      image: c.image,
      medium: 'comics',
      rating: typeof c.score === 'number' && c.score > 0 ? c.score : undefined,
      completed: isCompletedStatus(c.status),
      webURL: `${SITE_BASE}/series/${c.slug}`,
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
      throw new Error(`MangaBuddy API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }

  async requestText(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MangaBuddy HTTP ${response.status}`);
    }
    return response.data;
  }
}

function hasMorePages(json, requestedPage, resultCount) {
  if (resultCount < PAGE_SIZE) return false;
  const reportedPage = (json.pagination && json.pagination.current_page) || requestedPage;
  if (reportedPage !== requestedPage) return false;
  const totalPages = json.pagination && json.pagination.total_pages;
  if (typeof totalPages === 'number' && reportedPage >= totalPages) return false;
  return true;
}

function chapterIdFromUrl(url) {
  if (!url) return '';
  const parts = String(url).split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function parseChapterImages(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const pages = [];
  $('img.image-thumb').each((_, el) => {
    const img = $(el);
    const url = img.attr('data-src') || img.attr('src');
    if (!url) return;
    const num = parseInt(img.attr('data-number'), 10);
    pages.push({ num: Number.isNaN(num) ? pages.length : num, url });
  });
  return pages.sort((a, b) => a.num - b.num).map((p) => p.url);
}

function parseDetailHtml(html) {
  if (!html) return { desc: '', tags: [] };
  const $ = cheerio.load(html);

  const descEl = $('[itemprop="description"]').first();
  const desc = descEl.length ? extractParagraphs($, descEl) : '';

  const tags = [];
  const seen = {};
  $('a[itemprop="genre"][href^="/genre/"]').each((_, el) => {
    const tag = $(el).text().trim();
    if (tag && !seen[tag]) {
      seen[tag] = true;
      tags.push(tag);
    }
  });

  return { desc, tags };
}

function extractParagraphs($, el) {
  el.find('br').replaceWith('\n');
  el.find('p, div, li').each((_, node) => {
    $(node).append('\n');
  });
  return el
    .text()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

function isCompletedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s.indexOf('completed') !== -1 || s.indexOf('ended') !== -1 || s.indexOf('finished') !== -1;
}

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (isCompletedStatus(status)) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancelled') !== -1 || s.indexOf('canceled') !== -1 || s.indexOf('dropped') !== -1)
    return 'CANCELLED';
  if (s.indexOf('ongoing') !== -1 || s.indexOf('releasing') !== -1) return 'ONGOING';
  return 'UNKNOWN';
}

module.exports = { Source };
