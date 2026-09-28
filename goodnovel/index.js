const SITE_BASE = 'https://www.goodnovel.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SEARCH_PAGE_SIZE = 20;

const LOCKED_CHAPTER_TEXT =
  "This chapter is locked behind GoodNovel's in-app coins and cannot be shown here in full. Read it in the official GoodNovel app or at goodnovel.com after unlocking it there.";
const EMPTY_CHAPTER_TEXT = "This chapter's text could not be loaded from GoodNovel right now.";

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function titleCase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function absoluteImage(src) {
  if (!src) return '';
  const trimmed = String(src).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.indexOf('//') === 0) return `https:${trimmed}`;
  return trimmed;
}

function parseCompactNumber(text) {
  if (text === undefined || text === null) return undefined;
  const m = String(text)
    .trim()
    .match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return undefined;
  const suffix = (m[2] || '').toUpperCase();
  const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  return Math.round(n * mult);
}

function mapStatus(writeStatus) {
  const s = String(writeStatus || '').toUpperCase();
  if (s === 'ONGOING') return 'ONGOING';
  if (s === 'COMPLETE' || s === 'COMPLETED') return 'COMPLETED';
  return 'UNKNOWN';
}

function richTextToPlain(raw) {
  const text = String(raw || '');
  if (!text.trim()) return '';

  if (/<\/?[a-z][^>]*>/i.test(text)) {
    const $ = cheerio.load(`<div id="gn-root">${text}</div>`);
    const root = $('#gn-root');
    const paragraphs = root.find('> p');
    let out;
    if (paragraphs.length > 0) {
      const parts = [];
      paragraphs.each((_, el) => {
        const t = $(el).text().replace(/[ \t]+/g, ' ').trim();
        if (t) parts.push(t);
      });
      out = parts.join('\n\n');
    } else {
      root.find('br').replaceWith('\n');
      out = root.text();
    }
    return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findBalancedObject(text, fromIndex) {
  const openIdx = text.indexOf('{', fromIndex);
  if (openIdx === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return null;
}

function parseInitialState(html) {
  const anchor = 'window.__INITIAL_STATE__=';
  const idx = html.indexOf(anchor);
  if (idx === -1) return null;
  const raw = findBalancedObject(html, idx + anchor.length);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('GoodNovel: failed to parse __INITIAL_STATE__', e);
    return null;
  }
}

function mapBookRecord(raw) {
  if (!raw) return null;
  const bookId = String(raw.bookId || '').trim();
  if (!bookId) return null;

  const tags = [];
  if (Array.isArray(raw.genreNames)) {
    for (const g of raw.genreNames) {
      const label = cleanText(g);
      if (label && tags.indexOf(label) === -1) tags.push(label);
    }
  }
  if (Array.isArray(raw.newTagsNames)) {
    for (const t of raw.newTagsNames) {
      const label = cleanText(t);
      if (label && tags.indexOf(label) === -1) tags.push(label);
    }
  }

  const status = mapStatus(raw.writeStatus);
  const manga = {
    mangaId: bookId,
    title: cleanText(raw.bookName) || bookId,
    image: absoluteImage(raw.cover),
    webURL: raw.bookResourceUrl ? `${SITE_BASE}/book/${raw.bookResourceUrl}` : `${SITE_BASE}/book/${bookId}`,
    medium: 'novel',
    completed: status === 'COMPLETED',
  };
  if (tags.length) manga.tags = tags;

  const author = cleanText(raw.pseudonym);
  if (author) manga.author = author;
  const summary = richTextToPlain(raw.introduction);
  if (summary) manga.summary = summary;
  if (typeof raw.ratings === 'number' && raw.ratings > 0) manga.rating = raw.ratings;
  if (typeof raw.chapterCount === 'number' && raw.chapterCount > 0) manga.chapters = raw.chapterCount;
  const views = parseCompactNumber(raw.viewCountDisplay);
  if (views) manga.views = views;

  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'novels', name: 'All' },
      { id: 'Romance-novels', name: 'Romance' },
      { id: 'Werewolf-novels', name: 'Werewolf' },
      { id: 'Mafia-novels', name: 'Mafia' },
      { id: 'System-novels', name: 'System' },
      { id: 'Fantasy-novels', name: 'Fantasy' },
      { id: 'Urban-novels', name: 'Urban' },
      { id: 'LGBTQ-novels', name: 'LGBTQ+' },
      { id: 'YA-TEEN-novels', name: 'YA/TEEN' },
      { id: 'Paranormal-novels', name: 'Paranormal' },
      { id: 'Mystery-Thriller-novels', name: 'Mystery/Thriller' },
      { id: 'Eastern-novels', name: 'Eastern' },
      { id: 'Games-novels', name: 'Games' },
      { id: 'History-novels', name: 'History' },
      { id: 'MM-Romance-novels', name: 'MM Romance' },
      { id: 'Sci-Fi-novels', name: 'Sci-Fi' },
      { id: 'War-novels', name: 'War' },
      { id: 'Other-novels', name: 'Other' },
    ];
  }

  async getSearchTags() {
    const sampleGenres = ['novels', 'Romance-novels', 'Werewolf-novels'];
    try {
      const htmls = await Promise.all(
        sampleGenres.map((g) => this.requestHTML(`${SITE_BASE}/stories/${encodeURIComponent(g)}`).catch(() => '')),
      );
      const seen = {};
      const tags = [];
      for (const html of htmls) {
        if (!html) continue;
        const state = parseInitialState(html);
        const list = (state && state.Browse && state.Browse.tagList) || [];
        for (const t of list) {
          const id = t && t.keywordFormatFill;
          if (!id || seen[id]) continue;
          seen[id] = true;
          const label = titleCase(t.keyword);
          if (label) tags.push({ id, label });
        }
      }
      return tags;
    } catch (e) {
      console.error('GoodNovel getSearchTags failed:', e);
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
        const data = await this.postJSON(`${SITE_BASE}/hwyc/book/search/seo`, {
          language: 'ENGLISH',
          keyword: query,
          seoKeywordFormat: query,
          pageNo: page,
          pageSize: SEARCH_PAGE_SIZE,
          type: 'DEFAULT',
          position: 1,
        });
        const pageData = (data && data.page) || {};
        const records = Array.isArray(pageData.records) ? pageData.records : [];
        const results = records.map(mapBookRecord).filter(Boolean);
        const totalPages = typeof pageData.pages === 'number' ? pageData.pages : 0;
        return {
          results,
          metadata: results.length > 0 && page < totalPages ? { page: page + 1 } : undefined,
        };
      }

      const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      if (tagId) {
        const html = await this.requestHTML(`${SITE_BASE}/tag/${encodeURIComponent(tagId)}?page=${page}`);
        const state = parseInitialState(html);
        const tagBook = (state && state.tagBook) || {};
        const results = (Array.isArray(tagBook.bookList) ? tagBook.bookList : []).map(mapBookRecord).filter(Boolean);
        const totalPages = typeof tagBook.totalPage === 'number' ? tagBook.totalPage : 0;
        return {
          results,
          metadata: results.length > 0 && page < totalPages ? { page: page + 1 } : undefined,
        };
      }

      const feed = (request && request.feed) || 'novels';
      const html = await this.requestHTML(`${SITE_BASE}/stories/${encodeURIComponent(feed)}?page=${page}`);
      const state = parseInitialState(html);
      const browse = (state && state.Browse) || {};
      const results = (Array.isArray(browse.bookList) ? browse.bookList : []).map(mapBookRecord).filter(Boolean);
      const totalPages = typeof browse.totalPage === 'number' ? browse.totalPage : 0;
      return {
        results,
        metadata: results.length > 0 && page < totalPages ? { page: page + 1 } : undefined,
      };
    } catch (e) {
      console.error('GoodNovel getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const data = await this.postJSON(`${SITE_BASE}/hwyc/book/detail`, { bookId: mangaId });
    const book = data && data.book;
    if (!book) {
      throw new Error('GoodNovel: book data not found (page structure may have changed)');
    }

    const bookId = String(book.bookId || mangaId);
    const status = mapStatus(book.writeStatus);

    const tags = [];
    if (Array.isArray(book.genreNames)) {
      for (const g of book.genreNames) {
        const label = cleanText(g);
        if (label && tags.indexOf(label) === -1) tags.push(label);
      }
    }
    if (Array.isArray(book.newTagsNames)) {
      for (const t of book.newTagsNames) {
        const label = cleanText(t);
        if (label && tags.indexOf(label) === -1) tags.push(label);
      }
    }

    const mangaInfo = {
      mangaId: bookId,
      title: cleanText(book.bookName) || mangaId,
      image: absoluteImage(book.cover),
      desc: richTextToPlain(book.introduction),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: book.bookResourceUrl ? `${SITE_BASE}/book/${book.bookResourceUrl}` : `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    const author = cleanText(book.pseudonym);
    if (author) mangaInfo.author = author;
    if (typeof book.ratings === 'number' && book.ratings > 0) mangaInfo.rating = book.ratings;
    if (typeof book.chapterCount === 'number' && book.chapterCount > 0) mangaInfo.chapters = book.chapterCount;
    const views = parseCompactNumber(book.viewCountDisplay);
    if (views) mangaInfo.views = views;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const data = await this.postJSON(`${SITE_BASE}/hwyc/chapter/list`, { bookId: mangaId });
      const volumes = Array.isArray(data) ? data : [];
      const chapters = [];
      let order = 0;
      for (const vol of volumes) {
        const items = Array.isArray(vol && vol.chapters) ? vol.chapters : [];
        for (const c of items) {
          const chapterId = String((c && c.id) || '');
          if (!chapterId) continue;
          order += 1;
          chapters.push({
            id: chapterId,
            chapterId,
            name: cleanText(c.chapterName) || `Chapter ${order}`,
            number: order,
          });
        }
      }
      return chapters;
    } catch (e) {
      console.error('GoodNovel getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const data = await this.postJSON(`${SITE_BASE}/hwyc/chapter/detail`, { bookId: mangaId, chapterId });
      if (!data) {
        throw new Error('GoodNovel: chapter data not found (page structure may have changed)');
      }

      const charged = !!data.charge;
      let text = charged ? '' : richTextToPlain(data.content);

      if (!text) {
        if (charged) {
          const preview = richTextToPlain(data.previewContent);
          text = preview ? `${preview}\n\n${LOCKED_CHAPTER_TEXT}` : LOCKED_CHAPTER_TEXT;
        } else {
          text = EMPTY_CHAPTER_TEXT;
        }
      }

      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('GoodNovel getChapterDetails failed:', e);
      throw e;
    }
  }

  async postJSON(url, payload) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GoodNovel API HTTP ${response.status}`);
    }
    const json = JSON.parse(response.data);
    if (!json || json.success === false) {
      throw new Error(`GoodNovel API error: ${(json && json.message) || 'unknown'}`);
    }
    return json.data;
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
      throw new Error(`GoodNovel HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
