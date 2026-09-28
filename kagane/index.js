const SITE_BASE = 'https://kagane.to';

function mapContentRating(rating) {
  const r = (rating || '').toLowerCase();
  if (r === 'safe') return 'safe';
  if (r === 'suggestive' || r === 'erotica') return 'mature';
  if (r === 'pornographic') return 'adult';
  return 'mature';
}

function mapStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function coverUrl(series) {
  const covers = Array.isArray(series.series_covers) ? series.series_covers : [];
  const id = covers.length > 0 ? (covers[0].cover_id || covers[0].id) : null;
  return id ? `${SITE_BASE}/api/v2/image/${id}/compressed` : undefined;
}

function tagList(series) {
  const flat = (arr) => (Array.isArray(arr) ? arr : []).map((t) =>
    typeof t === 'string' ? t : (t && (t.genre_name || t.name || t.title))
  ).filter(Boolean);
  return [...flat(series.genres), ...flat(series.tags)];
}

function toPartialManga(series) {
  return {
    mangaId: series.series_id,
    title: series.title,
    image: coverUrl(series),
    status: mapStatus(series.publication_status),
    contentRating: mapContentRating(series.content_rating),
    tags: tagList(series),
    chapters: Array.isArray(series.series_books) ? series.series_books.length : undefined,
    webURL: `${SITE_BASE}/series/${series.series_id}`,
    medium: 'comics',
  };
}

function searchResultToPartialManga(item) {
  return {
    mangaId: item.series_id,
    title: item.title,
    image: item.cover_image_id
      ? `${SITE_BASE}/api/v2/image/${item.cover_image_id}/compressed`
      : undefined,
    status: mapStatus(item.publication_status),
    contentRating: mapContentRating(item.content_rating),
    tags: [],
    chapters: item.current_books,
    webURL: `${SITE_BASE}/series/${item.series_id}`,
    medium: 'comics',
  };
}

class Source {
  getSourceFeeds() {
    return [{ id: 'search', name: 'Search' }];
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${SITE_BASE}/api/v2/genres/list`);
      return (Array.isArray(json) ? json : []).map((g) => ({ id: g.id, label: g.genre_name }));
    } catch (e) {
      console.error('Kagane getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const page1Based = (metadata && metadata.page) || 1;
    if (!query) return { results: [] };

    const page0Based = page1Based - 1;
    const script = `
      __fetchJSON('/api/v2/search/series?page=${page0Based}&size=20', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ${JSON.stringify(query)},
          contentRating: ['Safe', 'Suggestive', 'Erotica', 'Pornographic'],
        }),
      }).then(__reportResult, (e) => __reportError('search failed: ' + e.message));
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: 170000,
      runBeforePageScripts: false,
    });
    if ('error' in result) throw new Error('Kagane search failed: ' + result.error);

    const json = result.value;
    const list = Array.isArray(json && json.content) ? json.content : [];
    const hasMore = json ? !json.last : false;
    return {
      results: list.map((item) => searchResultToPartialManga(item)),
      metadata: hasMore ? { page: page1Based + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const series = await this.requestJSON(`${SITE_BASE}/api/v2/series/${encodeURIComponent(mangaId)}`);
    return {
      mangaInfo: {
        title: series.title,
        image: coverUrl(series),
        desc: series.description,
        status: mapStatus(series.publication_status),
        contentRating: mapContentRating(series.content_rating),
        tags: tagList(series),
        webURL: `${SITE_BASE}/series/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const series = await this.requestJSON(`${SITE_BASE}/api/v2/series/${encodeURIComponent(mangaId)}`);
    const books = Array.isArray(series.series_books) ? series.series_books : [];
    const sorted = [...books].sort((a, b) => parseFloat(a.chapter_no) - parseFloat(b.chapter_no));
    return sorted.map((b) => ({
      id: b.book_id,
      chapterId: b.book_id,
      name: b.title || `Ch. ${b.chapter_no}`,
      number: parseFloat(b.chapter_no) || 0,
      time: b.created_at ? Date.parse(b.created_at) : undefined,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const script = `
      __watchFetch('/api/v2/books/page/', 1500, 15000)
        .then(__reportResult, (e) => __reportError(e.message));
    `;
    const result = await App.executeInWebView({
      url: `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/reader/${encodeURIComponent(chapterId)}`,
      baseUrl: `${SITE_BASE}/`,
      script,
      timeoutMs: 170000,
      runBeforePageScripts: true,
    });
    if ('error' in result) throw new Error('Kagane chapter fetch failed: ' + result.error);

    const pages = Array.isArray(result.value) ? result.value : [];
    return { id: chapterId, mangaId, pages };
  }

  async requestJSON(url, options) {
    const method = (options && options.method) || 'GET';
    const body = options && options.body;
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method,
      headers: body
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body,
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
