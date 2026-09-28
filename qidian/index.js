const SITE_BASE = 'https://m.qidian.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const LOCKED_CHAPTER_TEXT =
  '本章为订阅（VIP）章节，暂无法在此阅读完整内容，请前往起点中文网或起点读书App订阅解锁。\n\nThis chapter is a Qidian VIP (paid) chapter and cannot be unlocked here. Read it on qidian.com or in the official Qidian Reader app.';

const GENRE_LABELS = {
  catid21: 'Xuanhuan (Eastern Fantasy)',
  catid1: 'Fantasy',
  catid2: 'Wuxia',
  catid22: 'Xianxia',
  catid4: 'Urban',
  catid15: 'Realistic Fiction',
  catid6: 'Military',
  catid5: 'Historical',
  catid7: 'Games',
  catid8: 'Sports',
  catid9: 'Sci-Fi',
  catid10: 'Mystery/Supernatural',
  catid20109: 'Infinite Worlds',
  catid12: 'Light Novel',
  catid20076: 'Short Stories',
};

const FEED_PATHS = {
  bestsell: 'bestsell',
  newbook: 'newbook',
  free: 'free',
  finish: 'finish',
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absoluteImage(src) {
  if (!src) return '';
  const trimmed = String(src).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.indexOf('//') === 0) return `https:${trimmed}`;
  return trimmed;
}

function coverUrl(bookId) {
  if (!bookId) return '';
  return `https://bookcover.yuewen.com/qdbimg/349573/${encodeURIComponent(String(bookId))}/300`;
}

function extractBookId(href) {
  if (!href) return '';
  const path = String(href).split('?')[0].split('#')[0];
  const m = path.match(/\/(?:book|chapter)\/(\d+)/);
  return m ? m[1] : '';
}

function plainText(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function contentToText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  const paragraphs = [];
  $('p').each((_, el) => {
    const raw = $(el).text();
    const t = raw.replace(/^[\s　]+/, '').replace(/[\s　]+$/, '');
    if (t) paragraphs.push(t);
  });
  if (paragraphs.length > 0) return paragraphs.join('\n\n');
  return plainText(html);
}

function parseBeijingTimestamp(str) {
  const m = String(str || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  return Date.UTC(y, mo - 1, d, h, mi, s) - 8 * 60 * 60 * 1000;
}

function extractPageData(html) {
  const marker = '"vite-plugin-ssr_pageContext"';
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const tagEnd = html.indexOf('>', markerIdx);
  if (tagEnd === -1) return null;
  const scriptEnd = html.indexOf('</script>', tagEnd);
  if (scriptEnd === -1) return null;
  const raw = html.slice(tagEnd + 1, scriptEnd);
  try {
    const parsed = JSON.parse(raw);
    return (parsed && parsed.pageContext && parsed.pageContext.pageProps && parsed.pageContext.pageProps.pageData) || null;
  } catch (e) {
    console.error('Qidian: failed to parse embedded pageData JSON', e);
    return null;
  }
}

function parseBookCards($) {
  const results = [];
  const seen = {};
  $('a[data-bid]').each((_, el) => {
    const $a = $(el);
    const bookId = String($a.attr('data-bid') || '').trim() || extractBookId($a.attr('href'));
    if (!bookId || seen[bookId]) return;
    seen[bookId] = true;

    const $img = $a.find('img').first();
    const image = absoluteImage($img.attr('data-src') || $img.attr('src'));

    let $title = $a.find('h2').first();
    if (!$title.length) $title = $a.siblings('figcaption').find('h2').first();
    if (!$title.length) $title = $a.closest('li').find('h2').first();
    const title = cleanText($title.text()) || bookId;

    let author = cleanText($a.find('p[class*="Author" i]').first().text());
    if (!author) author = cleanText($a.find('p[class*="bookTip" i]').first().text());
    if (!author) author = cleanText($a.siblings('p').first().text());
    if (!author) {
      const subtitle = cleanText($a.find('p[class*="subTitle" i]').first().text());
      if (subtitle) author = subtitle.split('·')[0].trim();
    }

    let summary = cleanText($a.find('p[class*="Desc" i]').first().text());
    if (!summary && $a.find('p[class*="bookTip" i]').length) {
      summary = cleanText($a.find('p[class*="subTitle" i]').first().text());
    }

    const manga = {
      mangaId: bookId,
      title,
      image,
      webURL: `${SITE_BASE}/book/${bookId}/`,
      medium: 'novel',
    };
    if (author) manga.author = author;
    if (summary) manga.summary = summary;
    results.push(manga);
  });
  return results;
}

function mapSearchRecord(raw) {
  const bookId = String((raw && raw.bid) || '');
  if (!bookId) return null;
  const manga = {
    mangaId: bookId,
    title: cleanText(raw.bName) || bookId,
    image: absoluteImage(raw.imgUrl) || coverUrl(bookId),
    webURL: `${SITE_BASE}/book/${bookId}/`,
    medium: 'novel',
  };
  if (raw.bAuth) manga.author = cleanText(raw.bAuth);
  const summary = plainText(raw.desc);
  if (summary) manga.summary = summary;
  if (raw.cat) manga.tags = [cleanText(raw.cat)];
  if (typeof raw.state === 'string') manga.completed = raw.state.indexOf('完') !== -1;
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'bestsell', name: 'Bestsellers' },
      { id: 'newbook', name: 'New Releases' },
      { id: 'free', name: 'Free' },
      { id: 'finish', name: 'Completed' },
      { id: 'catid21', name: 'Xuanhuan (Eastern Fantasy)' },
      { id: 'catid2', name: 'Wuxia' },
      { id: 'catid22', name: 'Xianxia' },
      { id: 'catid4', name: 'Urban' },
      { id: 'catid9', name: 'Sci-Fi' },
      { id: 'catid10', name: 'Mystery/Supernatural' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/category/`);
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('a[href*="/category/catid"]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const m = href.match(/catid(\d+)/);
        if (!m) return;
        const id = `catid${m[1]}`;
        if (seen[id]) return;
        const nativeLabel = cleanText($a.find('h3 span').first().text());
        if (!nativeLabel) return;
        seen[id] = true;
        tags.push({ id, label: GENRE_LABELS[id] || nativeLabel });
      });
      return tags;
    } catch (e) {
      console.error('Qidian getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;

    try {
      if (query) {
        const base = `${SITE_BASE}/soushu/${encodeURIComponent(query)}.html`;
        const url = page > 1 ? `${base}?${qs({ pageNum: page })}` : base;
        const html = await this.requestHTML(url);
        const pageData = extractPageData(html);
        const bi = pageData && pageData.bookInfo;
        const records = bi && Array.isArray(bi.records) ? bi.records : [];
        const results = records.map(mapSearchRecord).filter(Boolean);
        return {
          results,
          metadata: results.length > 0 ? { page: page + 1 } : undefined,
        };
      }

      const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      const feed = (request && request.feed) || 'bestsell';
      const effectiveId = tagId || feed;
      const path = FEED_PATHS[effectiveId] || (/^catid\d+$/.test(effectiveId) ? `category/${effectiveId}` : 'bestsell');
      const html = await this.requestHTML(`${SITE_BASE}/${path}/`);
      const $ = cheerio.load(html);
      return { results: parseBookCards($), metadata: undefined };
    } catch (e) {
      console.error('Qidian getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const pageData = extractPageData(html);
    const info = pageData && pageData.bookInfo;
    if (!info) {
      throw new Error('Qidian: book data not found (page structure may have changed)');
    }
    const bookId = String(info.bookId || mangaId);

    const tags = [];
    if (info.chanName) tags.push(cleanText(info.chanName));
    if (info.subCateName) {
      const t = cleanText(info.subCateName);
      if (t && tags.indexOf(t) === -1) tags.push(t);
    }
    if (info.bookTag && info.bookTag.tagName) {
      const t = cleanText(info.bookTag.tagName);
      if (t && tags.indexOf(t) === -1) tags.push(t);
    }

    const status = info.bookStatus === '完本' ? 'COMPLETED' : info.bookStatus ? 'ONGOING' : 'UNKNOWN';

    const mangaInfo = {
      mangaId: bookId,
      title: cleanText(info.bookName) || mangaId,
      image: coverUrl(bookId),
      desc: plainText(info.desc),
      status,
      tags,
      webURL: url,
      medium: 'novel',
    };
    mangaInfo.completed = status === 'COMPLETED';
    if (info.authorName) mangaInfo.author = cleanText(info.authorName);
    if (typeof info.vipClickAll === 'number' && info.vipClickAll > 0) {
      mangaInfo.views = info.vipClickAll;
    }

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/catalog/`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const chapters = [];
      let order = 0;
      $('a[class*="chapterItem"]').each((_, el) => {
        const $a = $(el);
        const chapterId = String($a.attr('data-cid') || '').trim();
        if (!chapterId) return;
        order += 1;
        const name = cleanText($a.find('h2').first().text()) || `Chapter ${order}`;
        const chapter = { id: chapterId, chapterId, name, number: order };
        const altText = $a.attr('alt') || '';
        const timeMatch = altText.match(/首发时间[:：]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        const time = timeMatch ? parseBeijingTimestamp(timeMatch[1]) : undefined;
        if (time !== undefined) chapter.time = time;
        chapters.push(chapter);
      });
      return chapters;
    } catch (e) {
      console.error('Qidian getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/chapter/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
      const html = await this.requestHTML(url);
      const pageData = extractPageData(html);
      const info = pageData && pageData.chapterInfo;
      if (!info) {
        throw new Error('Qidian: chapter data not found (page structure may have changed)');
      }

      const isLocked = typeof info.vipStatus === 'number' && info.vipStatus !== 0 && info.isBuy !== 1;
      const text = isLocked ? LOCKED_CHAPTER_TEXT : contentToText(info.content);
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('Qidian getChapterDetails failed:', e);
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
      throw new Error(`Qidian HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
