const SITE_BASE = 'https://www.webfic.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CHAPTERS_PER_CATALOG_PAGE = 18;
const MAX_CATALOG_PAGES = 900;

const LOCKED_CHAPTER_TEXT =
  'This chapter could not be unlocked here. Read it on webfic.com or in the official Webfic app.';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function plainText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapStatus(writeStatus) {
  const s = String(writeStatus || '').toUpperCase();
  if (s === 'ONGOING') return 'ONGOING';
  if (s === 'COMPLETE' || s === 'COMPLETED') return 'COMPLETED';
  if (s === 'HIATUS') return 'HIATUS';
  if (s === 'CANCELLED' || s === 'DROPPED') return 'CANCELLED';
  return 'UNKNOWN';
}

function parseCompactNumber(text) {
  const s = String(text || '').trim();
  const m = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return undefined;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[String(m[2] || '').toUpperCase()] || 1;
  return Math.round(n * mult);
}

function parseSiteDate(text) {
  const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

function coverUrl(raw) {
  if (!raw) return '';
  const base = String(raw).split('@')[0].trim();
  if (!base) return '';
  return `${base}@w=600`;
}

function bookInfoUrl(bookId) {
  return `${SITE_BASE}/book_info/${encodeURIComponent(String(bookId))}/all/${encodeURIComponent(String(bookId))}`;
}

function chapterUrl(bookId, chapterId) {
  return `${SITE_BASE}/book/x_${encodeURIComponent(String(bookId))}/x_${encodeURIComponent(String(chapterId))}`;
}

function mapListItem(raw) {
  if (!raw || !raw.bookId) return null;
  const bookId = String(raw.bookId);
  const manga = {
    mangaId: bookId,
    title: cleanText(raw.bookName) || bookId,
    image: coverUrl(raw.cover),
    webURL: bookInfoUrl(bookId),
    medium: 'novel',
  };
  const author = cleanText(raw.author || raw.pseudonym);
  if (author) manga.author = author;
  const summary = cleanText(raw.introduction);
  if (summary) manga.summary = summary;

  const tags = [];
  const seen = {};
  const addTag = (label) => {
    const clean = cleanText(label);
    const key = clean.toLowerCase();
    if (clean && !seen[key]) {
      seen[key] = true;
      tags.push(clean);
    }
  };
  (Array.isArray(raw.typeTwoNames) ? raw.typeTwoNames : []).forEach(addTag);
  (Array.isArray(raw.tags) ? raw.tags : []).forEach(addTag);
  if (tags.length) manga.tags = tags;

  if (typeof raw.ratings === 'number' && raw.ratings > 0) manga.rating = raw.ratings;
  const views = parseCompactNumber(raw.viewCountDisplay);
  if (typeof views === 'number') manga.views = views;
  if (typeof raw.chapterCount === 'number' && raw.chapterCount > 0) manga.chapters = raw.chapterCount;
  const status = mapStatus(raw.writeStatus);
  if (status !== 'UNKNOWN') manga.completed = status === 'COMPLETED';

  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: '0', name: 'All' },
      { id: '11', name: 'Urban Romance' },
      { id: '1', name: 'Urban' },
      { id: '53', name: 'YA/Teen' },
      { id: '24', name: 'ChickLit' },
      { id: '20', name: 'Drama' },
      { id: '12', name: 'Fantasy' },
      { id: '36', name: 'Werewolf' },
      { id: '13', name: 'Romance' },
      { id: '2', name: 'Eastern' },
      { id: '34', name: 'Paranormal' },
      { id: '22', name: 'LGBTQ+' },
    ];
  }

  async getSearchTags() {
    try {
      const pageProps = await this.fetchPageProps(`${SITE_BASE}/browse/0/all`);
      const types = pageProps && Array.isArray(pageProps.types) ? pageProps.types : [];
      const tags = types
        .map((t) => ({ id: String(t.id), label: cleanText(t.name) }))
        .filter((t) => t.id && t.label);
      return tags.length ? tags : this.getSourceFeeds();
    } catch (e) {
      console.error('Webfic getSearchTags failed:', e);
      return this.getSourceFeeds();
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
        const url = `${SITE_BASE}/search?${qs({ searchValue: query, page })}`;
        const pageProps = await this.fetchPageProps(url);
        const bookList = (pageProps && pageProps.bookList) || [];
        const results = bookList.map(mapListItem).filter(Boolean);
        const current = (pageProps && pageProps.current) || page;
        const totalPages = (pageProps && pageProps.pages) || 1;
        return {
          results,
          metadata: current < totalPages && results.length > 0 ? { page: current + 1 } : undefined,
        };
      }

      const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      const feedId = request && request.feed;
      const typeId = tagId || feedId || '0';

      const url = `${SITE_BASE}/browse/${encodeURIComponent(String(typeId))}/x?${qs({ page })}`;
      const pageProps = await this.fetchPageProps(url);
      const bookList = (pageProps && pageProps.bookList) || [];
      const results = bookList.map(mapListItem).filter(Boolean);
      const pageNo = (pageProps && pageProps.pageNo) || page;
      const totalPages = (pageProps && pageProps.pages) || 1;
      return {
        results,
        metadata: pageNo < totalPages && results.length > 0 ? { page: pageNo + 1 } : undefined,
      };
    } catch (e) {
      console.error('Webfic getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const pageProps = await this.fetchPageProps(bookInfoUrl(mangaId));
    const info = pageProps && pageProps.bookInfo;
    if (!info) {
      throw new Error('Webfic: book data not found (page structure may have changed)');
    }

    const bookId = String(info.bookId || mangaId);
    const status = mapStatus(info.writeStatus);

    const mangaInfo = {
      mangaId: bookId,
      title: cleanText(info.bookName) || mangaId,
      image: coverUrl(info.cover),
      desc: cleanText(info.introduction),
      status,
      completed: status === 'COMPLETED',
      webURL: bookInfoUrl(bookId),
      medium: 'novel',
    };

    const author = cleanText(info.author || info.pseudonym);
    if (author) mangaInfo.author = author;

    const tags = [];
    const seen = {};
    const addTag = (label) => {
      const clean = cleanText(label);
      const key = clean.toLowerCase();
      if (clean && !seen[key]) {
        seen[key] = true;
        tags.push(clean);
      }
    };
    (Array.isArray(info.typeTwoNames) ? info.typeTwoNames : []).forEach(addTag);
    (Array.isArray(info.tags) ? info.tags : []).forEach(addTag);
    if (tags.length) mangaInfo.tags = tags;

    if (typeof info.ratings === 'number' && info.ratings > 0) mangaInfo.rating = info.ratings;
    const views = parseCompactNumber(info.viewCountDisplay);
    if (typeof views === 'number') mangaInfo.views = views;
    if (typeof info.chapterCount === 'number' && info.chapterCount > 0) mangaInfo.chapters = info.chapterCount;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const chapters = [];
    try {
      let page = 1;
      let totalPage = 1;
      do {
        const pageProps = await this.fetchPageProps(`${SITE_BASE}/catalog/${encodeURIComponent(String(mangaId))}/${page}`);
        const list = (pageProps && Array.isArray(pageProps.chapterList) && pageProps.chapterList) || [];
        if (!list.length) {
          if (page > 1 && page <= totalPage) {
            throw new Error(
              `Webfic: catalog page ${page} of ${totalPage} for ${mangaId} returned no chapters; ` +
                `refusing to return a partial chapter list`
            );
          }
          break;
        }
        totalPage = (pageProps && pageProps.totalPage) || totalPage;
        for (const c of list) {
          if (!c || (c.id === undefined || c.id === null)) continue;
          const chapterId = String(c.id);
          const number = typeof c.index === 'number' ? c.index + 1 : chapters.length + 1;
          chapters.push({
            id: chapterId,
            chapterId,
            name: cleanText(c.chapterName) || `Chapter ${number}`,
            number,
          });
        }
        page += 1;
      } while (page <= totalPage && page <= MAX_CATALOG_PAGES);
      return chapters;
    } catch (e) {
      console.error('Webfic getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const pageProps = await this.fetchPageProps(chapterUrl(mangaId, chapterId));
      const info = pageProps && pageProps.chapterInfo;
      if (!info) {
        throw new Error('Webfic: chapter data not found (page structure may have changed)');
      }

      const rawText = typeof info.content === 'string' ? info.content : '';
      const isLocked = info.unlock === false || !rawText.trim();

      const text = isLocked ? LOCKED_CHAPTER_TEXT : plainText(rawText);
      return { id: String(chapterId), mangaId, pages: [], text };
    } catch (e) {
      console.error('Webfic getChapterDetails failed:', e);
      throw e;
    }
  }

  async fetchPageProps(url) {
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const raw = $('#__NEXT_DATA__').first().text();
    if (!raw) {
      throw new Error(`Webfic: no __NEXT_DATA__ payload in response for ${url}`);
    }
    try {
      const data = JSON.parse(raw);
      return (data && data.props && data.props.pageProps) || null;
    } catch (e) {
      console.error('Webfic: failed to parse __NEXT_DATA__ for', url, e);
      throw e;
    }
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
      throw new Error(`Webfic HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
