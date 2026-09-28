const SITE_BASE = 'https://www.moboreader.com';
const API_BASE = 'https://overseas-r-en.cdreader.com';
const CHAPTER_LIST_PATH = '/api/BookV2/02ee90e71a144bb3cceb6f4738bfa5b1';
const CHAPTER_PAGE_SIZE = 500;
const CHAPTER_PAGE_LIMIT = 20;

const DEFAULT_CID = 20007;

const FEED_PARAMS = {
  popular: { rank: 1, status: 10 },
  mostread: { rank: 2, status: 10 },
  latest: { rank: 3, status: 10 },
  completed: { rank: 1, status: 1 },
};

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
      { id: 'mostread', name: 'Most Read' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const categories = await this.requestCategoryList();
      const nameCounts = {};
      categories.forEach((c) => {
        nameCounts[c.cName] = (nameCounts[c.cName] || 0) + 1;
      });
      return categories
        .map((c) => ({
          id: String(c.cid),
          label: nameCounts[c.cName] > 1 ? `${c.cName} (${c.sex === 1 ? 'Men' : 'Women'})` : c.cName,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('MoboReader getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = ((request && request.title) || '').trim();

    try {
      if (query) {
        return await this.searchBooks(query, page);
      }
      return await this.browseCategory(request, page);
    } catch (e) {
      console.error('MoboReader getSearchResults failed:', e);
      throw e;
    }
  }

  async searchBooks(query, page) {
    const json = await this.requestApiJSON(
      `${API_BASE}/api/Book/SearchBookV2`,
      'POST',
      { bookName: query, pageIndex: page, pageSize: 20 }
    );
    const mod = (json && json.data && json.data.module) || {};
    const bookList = mod.bookList || [];
    const results = bookList.map((b) => ({
      mangaId: String(b.bookId),
      title: b.name,
      image: b.cover ? absolute(b.cover) : undefined,
      author: b.author || undefined,
      summary: b.introduce || undefined,
      tags: (b.tags || []).map((t) => t.tagName).filter(Boolean),
      medium: 'novel',
      webURL: bookURL(b.bookId, b.name),
      rating: toFloat(b.score),
      views: parseCount(b.readNum),
      chapters: toInt(b.chapterNum),
      completed: String(b.status || '').toLowerCase() === 'completed',
    }));
    const pageCount = mod.pageCount || 0;
    return { results, metadata: page < pageCount ? { page: page + 1 } : undefined };
  }

  async browseCategory(request, page) {
    const tagIds = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
    const cid = tagIds.length ? parseInt(tagIds[0], 10) : DEFAULT_CID;
    const feedId = (request && request.feed) || 'popular';
    const { rank, status } = FEED_PARAMS[feedId] || FEED_PARAMS.popular;

    const json = await this.requestApiJSON(
      `${API_BASE}/api/Book/CategoryBookV2?${qs({ cid, rank, status, pageIndex: page, pageSize: 20 })}`,
      'GET'
    );
    const form = json && json.data && json.data[0] && json.data[0].formList && json.data[0].formList[0];
    const items = (form && form.dataItemList) || [];
    const recordCount = (form && form.recordCount) || 0;

    const results = items.map((it) => {
      const site = it.websiteData || {};
      return {
        mangaId: String(it.id),
        title: it.title,
        image: it.img ? absolute(it.img) : undefined,
        author: it.author || undefined,
        summary: it.introduce || undefined,
        tags: (site.tagList || []).map((t) => t.tagName).filter(Boolean),
        medium: 'novel',
        webURL: bookURL(it.id, it.title),
        rating: toFloat(it.star),
        views: parseCount(site.readNum),
        chapters: toInt(site.chapterNum),
        completed: feedId === 'completed' ? true : undefined,
      };
    });

    return { results, metadata: page * 20 < recordCount ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    try {
      const json = await this.requestApiJSON(
        `${API_BASE}/api/Book/BookDetail?${qs({ bookId: mangaId })}`,
        'GET'
      );
      const d = (json && json.data) || {};
      const completed = d.isFull === '已完本';
      return {
        mangaInfo: {
          title: d.bookName || 'Untitled',
          image: d.imgUrl ? absolute(d.imgUrl) : undefined,
          author: d.authorName || undefined,
          desc: d.introduce || '',
          status: completed ? 'COMPLETED' : 'ONGOING',
          tags: (d.tagList || []).map((t) => t.tag).filter(Boolean),
          webURL: bookURL(mangaId, d.bookName),
          medium: 'novel',
          rating: toFloat(d.bookStar),
          views: toInt(d.readerNum),
          chapters: toInt(d.chapterNum),
          completed,
        },
      };
    } catch (e) {
      console.error('MoboReader getMangaDetails failed:', e);
      throw e;
    }
  }

  async getChapters(mangaId) {
    try {
      const first = await this.requestChapterListPage(mangaId, 1);
      if (!first || !first.chapterList) {
        throw new Error(
          `MoboReader: chapter-list page 1 for book ${mangaId} returned no chapterList`
        );
      }

      const reportedPages = first.pageCount || 1;
      const lastPage = Math.min(reportedPages, CHAPTER_PAGE_LIMIT);
      if (reportedPages > CHAPTER_PAGE_LIMIT) {
        console.warn(
          `MoboReader: book ${mangaId} reports ${reportedPages} chapter-list pages, ` +
            `reading only the first ${CHAPTER_PAGE_LIMIT} (about ` +
            `${(reportedPages - CHAPTER_PAGE_LIMIT) * CHAPTER_PAGE_SIZE} newest chapters not listed)`
        );
      }

      const listByPage = { 1: first.chapterList };
      let pending = [];
      for (let page = 2; page <= lastPage; page += 1) pending.push(page);

      for (let round = 0; round < 3 && pending.length; round += 1) {
        const failed = [];
        for (const page of pending) {
          try {
            const data = await this.requestChapterListPage(mangaId, page);
            if (!data || !data.chapterList) {
              throw new Error(`page ${page} returned no chapterList`);
            }
            listByPage[page] = data.chapterList;
          } catch (e) {
            console.error(`MoboReader chapters page ${page} failed:`, e);
            failed.push(page);
          }
        }
        pending = failed;
      }

      if (pending.length) {
        throw new Error(
          `MoboReader: ${pending.length} of ${lastPage} chapter-list pages unavailable after ` +
            `retries (pages ${pending.join(', ')}), up to ` +
            `${pending.length * CHAPTER_PAGE_SIZE} chapters missing from this list`
        );
      }

      const chapters = [];
      const seen = {};
      for (let page = 1; page <= lastPage; page += 1) {
        const list = listByPage[page];
        if (!list) continue;
        for (const c of list) {
          const id = String(c.chapterId);
          if (seen[id]) continue;
          seen[id] = true;
          chapters.push({
            id,
            name: cleanChapterName(c.chapterName, c.serialNumber),
            number: c.serialNumber,
            time: c.updateTime ? Date.parse(`${c.updateTime}Z`) : undefined,
          });
        }
      }
      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('MoboReader getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/readBook/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/chapter`;
      const html = await this.requestText(url);
      const $ = cheerio.load(html);
      const text = deobfuscateChapter($);
      const locked = $('.lock-content, .lock-chapter').length > 0;
      const finalText = locked
        ? `${text}\n\n[This chapter is locked - continue reading in the MoboReader app.]`
        : text;
      return { id: chapterId, mangaId, pages: [], text: finalText };
    } catch (e) {
      console.error('MoboReader getChapterDetails failed:', e);
      throw e;
    }
  }

  async requestCategoryList() {
    const json = await this.requestApiJSON(`${API_BASE}/api/Book/CategoryList`, 'GET');
    return (json && json.data) || [];
  }

  async requestChapterListPage(mangaId, page) {
    const json = await this.requestApiJSON(
      `${API_BASE}${CHAPTER_LIST_PATH}?${qs({
        bookId: mangaId,
        pageIndex: page,
        pageSize: CHAPTER_PAGE_SIZE,
        time: Date.now(),
      })}`,
      'GET'
    );
    return json && json.data;
  }

  async requestApiJSON(url, method, body) {
    const manager = App.createRequestManager({});
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': UA,
      'x-core': '1',
      'x-device': '1',
      lang: 'en',
    };
    if (body) headers['Content-Type'] = 'application/json';
    const request = App.createRequest({
      url,
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MoboReader API HTTP ${response.status} for ${url}`);
    }
    return JSON.parse(response.data);
  }

  async requestText(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MoboReader HTTP ${response.status}`);
    }
    return response.data;
  }
}

function deobfuscateChapter($) {
  const styleText = $('style')
    .map((_, el) => $(el).html() || '')
    .get()
    .join('\n');

  const classMap = {};
  const rule = /p\.([\w-]+)::(before|after)\s*\{\s*content:\s*attr\(([\w-]+)\)\s*\}/g;
  let m;
  while ((m = rule.exec(styleText)) !== null) {
    const [, cls, pseudo, attr] = m;
    if (!classMap[cls]) classMap[cls] = {};
    classMap[cls][pseudo] = attr.toLowerCase();
  }

  const paragraphs = [];
  $('.chapter-content p').each((_, el) => {
    const $p = $(el);
    const classes = ($p.attr('class') || '').split(/\s+/).filter(Boolean);
    const rndClass = classes.find((c) => c !== 'p_sj');
    const attrs = (rndClass && classMap[rndClass]) || {};
    const before = attrs.before ? $p.attr(attrs.before) || '' : '';
    const after = attrs.after ? $p.attr(attrs.after) || '' : '';
    const full = `${before}${$p.text() || ''}${after}`.trim();
    if (full) paragraphs.push(full);
  });

  return paragraphs.join('\n\n');
}

function absolute(path) {
  return /^https?:\/\//i.test(path) ? path : `${SITE_BASE}${path.charAt(0) === '/' ? '' : '/'}${path}`;
}

function bookURL(bookId, title) {
  return `${SITE_BASE}/bookDetail/${bookId}/${slugify(title)}`;
}

function slugify(text) {
  const slug = String(text || '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'novel';
}

function cleanChapterName(name, serialNumber) {
  const cleaned = String(name || '')
    .replace(/^\d+\s+/, '')
    .trim();
  return cleaned || `Chapter ${serialNumber}`;
}

function toInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseInt(String(value).replace(/,/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function toFloat(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = parseFloat(value);
  return isFinite(n) ? n : undefined;
}

function parseCount(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const str = String(value).trim();
  const m = str.match(/^([\d.,]+)\s*([kKmMbB]?)$/);
  if (!m) return toInt(str);
  let num = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(num)) return undefined;
  const suffix = m[2].toLowerCase();
  if (suffix === 'k') num *= 1e3;
  else if (suffix === 'm') num *= 1e6;
  else if (suffix === 'b') num *= 1e9;
  return Math.round(num);
}

module.exports = { Source };
