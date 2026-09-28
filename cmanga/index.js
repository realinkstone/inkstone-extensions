const SITE_BASE = 'https://cmangavn.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('hoàn thành') || s === 'full') return 'COMPLETED';
  if (s.includes('tiến hành') || s.includes('đang')) return 'ONGOING';
  if (s.includes('tạm ngưng') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('ngừng') || s.includes('drop') || s.includes('hủy')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseVNDate(text) {
  const m = (text || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  return Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

function extractMangaId(href) {
  const m = (href || '').match(/\/truyen-tranh\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractGenreId(href) {
  const m = (href || '').match(/\/the-loai\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractChapterId(href, mangaId) {
  const prefix = `/${mangaId}-chap-`;
  const idx = (href || '').indexOf(prefix);
  if (idx === -1) return '';
  return 'chap-' + href.slice(idx + prefix.length).split(/[/?#]/)[0];
}

function chapterSlugToNumber(chapterId) {
  const m = (chapterId || '').match(/^chap-(\d+)(?:-(\d+))?$/);
  if (!m) return 0;
  return m[2] !== undefined ? parseFloat(`${m[1]}.${m[2]}`) : parseFloat(m[1]);
}

function parseMangaList($) {
  const results = [];
  $('.comic-card').each((_, el) => {
    const card = $(el);
    const titleLink = card.find('.comic-card-title a').first();
    const href = titleLink.attr('href') || card.find('.comic-card-thumb').first().attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(titleLink.text()) || mangaId;
    const image = (card.find('.comic-card-thumb img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/truyen-tranh/${mangaId}`,
      medium: 'comics',
    };

    card.find('.card-overlay .chapter-count').each((_, span) => {
      const $span = $(span);
      if ($span.find('.fa-eye').length === 0) return;
      const n = parseInt(cleanText($span.text()).replace(/[.,]/g, ''), 10);
      if (!Number.isNaN(n)) manga.views = n;
    });

    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  return $('.pagination i.fa-chevron-right').length > 0;
}

const FEED_CONFIG = {
  latest: { path: '/danh-sach-truyen', sort: '' },
  newest: { path: '/danh-sach-truyen', sort: 'newest' },
  mostViewed: { path: '/danh-sach-truyen', sort: 'views' },
  topDay: { path: '/danh-sach-truyen', sort: 'views_day' },
  topMonth: { path: '/danh-sach-truyen', sort: 'views_month' },
  nameAZ: { path: '/danh-sach-truyen', sort: 'name' },
  completed: { path: '/tron-bo', sort: '' },
};

function buildListingURL({ basePath, query, sort, page }) {
  const params = [];
  if (query) params.push(`q=${encodeURIComponent(query)}`);
  if (sort) params.push(`sort=${encodeURIComponent(sort)}`);
  if (page && page > 1) params.push(`page=${page}`);
  return params.length > 0 ? `${SITE_BASE}${basePath}?${params.join('&')}` : `${SITE_BASE}${basePath}`;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updated' },
      { id: 'newest', name: 'Newly Added' },
      { id: 'mostViewed', name: 'Most Viewed' },
      { id: 'topDay', name: 'Top Today' },
      { id: 'topMonth', name: 'Top This Month' },
      { id: 'nameAZ', name: 'Name A-Z' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('.genre-grid a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const id = extractGenreId(href);
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('CManga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];

    let basePath;
    let sort;
    if (query) {
      basePath = '/tim-kiem';
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      basePath = `/the-loai/${encodeURIComponent(includedTags[0].id)}`;
      sort = (FEED_CONFIG[feed] || FEED_CONFIG.latest).sort;
    } else {
      const cfg = FEED_CONFIG[feed] || FEED_CONFIG.latest;
      basePath = cfg.path;
      sort = cfg.sort;
    }

    const url = buildListingURL({ basePath, query, sort, page });
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);
    const hasNext = results.length > 0 && hasNextPage($);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.comic-title').first().text()) || mangaId;
    const image = ($('.comic-detail-cover img').first().attr('src') || '').trim();

    let statusText = '';
    $('.comic-meta-grid .meta-item').each((_, el) => {
      const $el = $(el);
      const label = cleanText($el.find('.meta-label').first().text());
      if (/trạng thái/i.test(label)) {
        statusText = cleanText($el.find('.meta-value').first().text());
      }
    });
    const status = mapStatus(statusText);

    const tags = [];
    $('.comic-genres-list a.genre-tag').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const desc = cleanText($('meta[name="description"]').attr('content') || '');

    return {
      mangaInfo: {
        title,
        image,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapterList a.chapter-item').each((_, el) => {
      const item = $(el);
      const href = item.attr('href') || '';
      const chapterId = extractChapterId(href, mangaId);
      if (!chapterId) return;

      const name = cleanText(item.find('.chap-name').first().text());
      const dateText = cleanText(item.find('.chap-date').first().text());
      const time = parseVNDate(dateText);

      raw.push({ chapterId, name, time, number: chapterSlugToNumber(chapterId) });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}-${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('#readerContent .reader-page img.reader-img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (src) pages.push(src);
    });

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
