const SITE_BASE = 'https://lelscans.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function coverUrlFor(mangaId) {
  return `${SITE_BASE}/mangas/${mangaId}/thumb_cover.jpg`;
}

function seriesUrlFor(mangaId) {
  return `${SITE_BASE}/lecture-en-ligne-${encodeURIComponent(mangaId)}`;
}

function chapterUrlFor(mangaId, chapterId, page) {
  return `${SITE_BASE}/scan-${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/${page}`;
}

function absoluteImageUrl(src) {
  const trimmed = (src || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith('/') ? `${SITE_BASE}${trimmed}` : `${SITE_BASE}/${trimmed}`;
}

function classifyOptionHref(href) {
  const value = (href || '').trim();
  if (!value) return null;
  const path = value.replace(/^https?:\/\/[^/]+/i, '');

  let m = path.match(/^\/lecture-(?:en-)?ligne-([a-z0-9-]+?)(?:\.php)?$/i);
  if (m) return { type: 'series', mangaId: m[1] };

  m = path.match(/^\/scan-([a-z0-9-]+)\/(\d+(?:\.\d+)?)\/(\d+)$/i);
  if (m) return { type: 'page', mangaId: m[1], chapterId: m[2], page: parseInt(m[3], 10) };

  m = path.match(/^\/scan-([a-z0-9-]+)\/(\d+(?:\.\d+)?)$/i);
  if (m) return { type: 'chapter', mangaId: m[1], chapterId: m[2] };

  return null;
}

function parseCatalog($) {
  const results = [];
  const seen = new Set();
  $('option').each((_, el) => {
    const info = classifyOptionHref($(el).attr('value'));
    if (!info || info.type !== 'series') return;
    if (seen.has(info.mangaId)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seen.add(info.mangaId);
    results.push({ mangaId: info.mangaId, title });
  });
  return results;
}

function toPartialManga(entry) {
  return {
    mangaId: entry.mangaId,
    title: entry.title,
    image: coverUrlFor(entry.mangaId),
    webURL: seriesUrlFor(entry.mangaId),
    medium: 'comics',
  };
}

function slugToTitle(mangaId) {
  return (mangaId || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractPageImage($) {
  return absoluteImageUrl($('#image img').first().attr('src'));
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'catalog', name: 'Catalog (A-Z)' },
      { id: 'latest', name: 'Latest Chapters' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = ((request && request.title) || '').trim();
    const catalog = await this.getCatalog();

    if (query) {
      const q = query.toLowerCase();
      const results = catalog
        .filter((entry) => entry.title.toLowerCase().includes(q))
        .map(toPartialManga);
      return { results };
    }

    const feed = (request && request.feed) || 'catalog';

    if (feed === 'latest') {
      const results = await this.getLatestList();
      return { results };
    }

    return { results: catalog.map(toPartialManga) };
  }

  async getCatalog() {
    const html = await this.requestHTML(SITE_BASE);
    const $ = cheerio.load(html);
    return parseCatalog($);
  }

  async getLatestList() {
    const html = await this.requestHTML(SITE_BASE);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('#main_hot_ul li').each((_, li) => {
      const $li = $(li);
      const chapterInfo = classifyOptionHref($li.find('h3 a').first().attr('href'));
      if (!chapterInfo || chapterInfo.type !== 'chapter') return;
      const mangaId = chapterInfo.mangaId;
      if (seen.has(mangaId)) return;

      const title = cleanText($li.find('.hot_manga_img img').first().attr('alt'));
      if (!title) return;
      seen.add(mangaId);

      results.push(toPartialManga({ mangaId, title }));
    });
    return results;
  }

  async getMangaDetails(mangaId) {
    const url = seriesUrlFor(mangaId);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const catalog = parseCatalog($);
    const own = catalog.find((entry) => entry.mangaId === mangaId);
    const title = (own && own.title) || slugToTitle(mangaId) || mangaId;

    return {
      mangaInfo: {
        title,
        image: coverUrlFor(mangaId),
        desc: '',
        status: 'UNKNOWN',
        tags: [],
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.requestHTML(seriesUrlFor(mangaId));
    const $ = cheerio.load(html);

    const raw = [];
    const seen = new Set();
    $('option').each((_, el) => {
      const info = classifyOptionHref($(el).attr('value'));
      if (!info || info.type !== 'chapter' || info.mangaId !== mangaId) return;
      if (seen.has(info.chapterId)) return;
      seen.add(info.chapterId);
      raw.push(info.chapterId);
    });
    raw.reverse();

    return raw.map((chapterId) => ({
      id: chapterId,
      chapterId,
      name: `Chapitre ${chapterId}`,
      number: parseFloat(chapterId),
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const firstPageHtml = await this.requestHTML(chapterUrlFor(mangaId, chapterId, 1));
    const $first = cheerio.load(firstPageHtml);

    let pageCount = 0;
    $first('option').each((_, el) => {
      const info = classifyOptionHref($first(el).attr('value'));
      if (info && info.type === 'page' && info.mangaId === mangaId && info.chapterId === chapterId) {
        if (info.page > pageCount) pageCount = info.page;
      }
    });
    if (pageCount < 1) pageCount = 1;

    const pages = new Array(pageCount).fill('');
    pages[0] = extractPageImage($first);

    const PAGE_BATCH = 6;
    let pending = [];
    for (let p = 2; p <= pageCount; p++) pending.push(p);

    for (let round = 0; round < 2 && pending.length; round += 1) {
      const width = round === 0 ? PAGE_BATCH : 1;
      const failed = [];
      for (let i = 0; i < pending.length; i += width) {
        await Promise.all(
          pending.slice(i, i + width).map(async (p) => {
            try {
              const html = await this.requestHTML(chapterUrlFor(mangaId, chapterId, p));
              const $page = cheerio.load(html);
              const src = extractPageImage($page);
              if (!src) throw new Error('no page image found');
              pages[p - 1] = src;
            } catch (e) {
              console.error(`Lelscans getChapterDetails page ${p} failed: ` + (e && e.message));
              failed.push(p);
            }
          }),
        );
      }
      pending = failed.sort((a, b) => a - b);
    }

    const missing = [];
    for (let p = 1; p <= pageCount; p++) if (!pages[p - 1]) missing.push(p);
    if (missing.length) {
      throw new Error(
        `Lelscans getChapterDetails: ${missing.length} of ${pageCount} pages of ` +
          `${mangaId}/${chapterId} could not be loaded after a retry (pages ${missing.join(', ')})`,
      );
    }

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
