const SITE_BASE = 'https://www.webnovel.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const LOCKED_CHAPTER_TEXT =
  'This chapter is a Webnovel members-only (VIP) chapter and cannot be unlocked here. Read it on webnovel.com or in the official Webnovel app.';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function titleCase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function coverUrl(bookId, cacheId) {
  if (!bookId) return '';
  const suffix = cacheId ? `&imageId=${encodeURIComponent(String(cacheId))}` : '';
  return `https://book-pic.webnovel.com/bookcover/${encodeURIComponent(String(bookId))}?imageMogr2/thumbnail/300x${suffix}`;
}

function absoluteImage(src) {
  if (!src) return '';
  const trimmed = String(src).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.indexOf('//') === 0) return `https:${trimmed}`;
  return trimmed;
}

function extractBookId(href) {
  if (!href) return '';
  const path = String(href).split('?')[0].split('#')[0];
  let m = path.match(/_(\d+)\/?$/);
  if (m) return m[1];
  m = path.match(/\/book\/(\d+)\/?$/);
  return m ? m[1] : '';
}

function mapActionStatus(actionStatus) {
  if (actionStatus === 30) return 'ONGOING';
  if (actionStatus === 40) return 'COMPLETED';
  return 'UNKNOWN';
}

function plainText(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
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

function sanitizeLooseJson(raw) {
  const validEscapes = '"\\/bfnrt';
  let out = '';
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString && ch === '\\') {
      const next = raw[i + 1];
      if (next !== undefined && validEscapes.indexOf(next) !== -1) {
        out += ch + next;
        i += 1;
        continue;
      }
      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
        out += raw.slice(i, i + 6);
        i += 5;
        continue;
      }
      if (next !== undefined) {
        out += next;
        i += 1;
      }
      continue;
    }
    if (ch === '"') inString = !inString;
    out += ch;
  }
  return out;
}

function parseEmbeddedObject(html, anchor) {
  const anchorIdx = html.indexOf(anchor);
  if (anchorIdx === -1) return null;
  const raw = findBalancedObject(html, anchorIdx + anchor.length);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    try {
      return JSON.parse(sanitizeLooseJson(raw));
    } catch (e2) {
      console.error('Webnovel: failed to parse embedded object for', anchor, e2);
      return null;
    }
  }
}

function parseStoriesListing(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.j_category_wrapper li').each((_, li) => {
    const $li = $(li);
    const $link = $li.find('h3 a[href^="/book/"]').first();
    const href = $link.attr('href') || '';
    const bookId = extractBookId(href);
    if (!bookId) return;
    const title = cleanText($link.text()) || bookId;
    const $img = $li.find('img').first();
    const image = absoluteImage($img.attr('data-original') || $img.attr('src'));

    const tags = [];
    $li.find('p.mb4 a[href^="/tags/"]').each((__, a) => {
      const label = cleanText($(a).attr('title')).replace(/\s+Stories$/i, '');
      if (label) tags.push(label);
    });

    const $descP = $li.find('p').filter((__, p) => !$(p).hasClass('mb4'));
    const summary = plainText($descP.first().text());

    const manga = {
      mangaId: bookId,
      title,
      image,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    if (tags.length) manga.tags = tags;
    if (summary) manga.summary = summary;
    results.push(manga);
  });
  return results;
}

function parseTagListing(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.j_bookList .g_book_item').each((_, el) => {
    const $el = $(el);
    const $link = $el.find('a[href^="/book/"]').first();
    const bookId = String($el.attr('data-report-did') || '').trim() || extractBookId($link.attr('href'));
    if (!bookId) return;
    const title = cleanText($link.attr('title')) || cleanText($el.find('h3').first().text()) || bookId;
    const $img = $el.find('img').first();
    const image = absoluteImage($img.attr('data-original') || $img.attr('src'));

    const tags = [];
    $el.find('.g_tags a[href^="/tags/"]').each((__, a) => {
      const label = cleanText($(a).attr('title')).replace(/\s+Stories$/i, '') || cleanText($(a).text());
      if (label) tags.push(label);
    });

    const manga = {
      mangaId: bookId,
      title,
      image,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    if (tags.length) manga.tags = tags;
    results.push(manga);
  });
  return results;
}

function mapSearchItem(raw) {
  const bookId = String((raw && raw.bookId) || '');
  if (!bookId) return null;
  const manga = {
    mangaId: bookId,
    title: cleanText(raw.bookName) || bookId,
    image: coverUrl(bookId),
    webURL: `${SITE_BASE}/book/${bookId}`,
    medium: 'novel',
  };
  const tags = [];
  if (raw.categoryName) tags.push(cleanText(raw.categoryName));
  if (Array.isArray(raw.tagInfo)) {
    for (const t of raw.tagInfo) {
      const label = titleCase(t && t.tagName);
      if (label && tags.indexOf(label) === -1) tags.push(label);
    }
  }
  if (tags.length) manga.tags = tags;
  if (typeof raw.totalScore === 'number' && raw.totalScore > 0) manga.rating = raw.totalScore;
  const summary = plainText(raw.description);
  if (summary) manga.summary = summary;
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'novel', name: 'All Novels' },
      { id: 'novel-fantasy-male', name: 'Fantasy' },
      { id: 'novel-eastern-male', name: 'Eastern' },
      { id: 'novel-urban-male', name: 'Urban' },
      { id: 'novel-action-male', name: 'Action' },
      { id: 'novel-history-male', name: 'History' },
      { id: 'novel-games-male', name: 'Games' },
      { id: 'novel-scifi-male', name: 'Sci-fi' },
      { id: 'novel-fantasy-female', name: 'Fantasy (Female Lead)' },
      { id: 'novel-urban-female', name: 'Urban (Female Lead)' },
      { id: 'novel-teen-female', name: 'Teen (Female Lead)' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/stories/novel`);
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('a[href^="/tags/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/^\/tags\/([a-z0-9-]+-novel)(?:$|[/?#])/i);
        if (!m || seen[m[1]]) return;
        seen[m[1]] = true;
        const label = cleanText($(el).attr('title') || $(el).text()).replace(/\s+Stories$/i, '');
        if (label) tags.push({ id: m[1], label });
      });
      return tags;
    } catch (e) {
      console.error('Webnovel getSearchTags failed:', e);
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
        const url = `${SITE_BASE}/go/pcm/search/result?${qs({ keywords: query, type: 'novel', pageIndex: page })}`;
        const json = await this.requestJSON(url);
        if (!json || +json.code !== 0 || !json.data || !json.data.bookInfo) {
          return { results: [] };
        }
        const results = (json.data.bookInfo.bookItems || []).map(mapSearchItem).filter(Boolean);
        const isLast = !!json.data.bookInfo.isLast;
        return {
          results,
          metadata: !isLast && results.length > 0 ? { page: page + 1 } : undefined,
        };
      }

      const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      if (tagId) {
        const html = await this.requestHTML(`${SITE_BASE}/tags/${encodeURIComponent(tagId)}`);
        return { results: parseTagListing(html), metadata: undefined };
      }

      const feed = (request && request.feed) || 'novel';
      const html = await this.requestHTML(`${SITE_BASE}/stories/${encodeURIComponent(feed)}`);
      return { results: parseStoriesListing(html), metadata: undefined };
    } catch (e) {
      console.error('Webnovel getSearchResults failed:', e);
      throw e;
    }
  }

  async fetchBookData(mangaId) {
    const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const data = parseEmbeddedObject(html, 'g_data.book=');
    if (!data || !data.bookInfo) {
      throw new Error('Webnovel: book data not found (page structure may have changed)');
    }
    return data;
  }

  async getMangaDetails(mangaId) {
    const data = await this.fetchBookData(mangaId);
    const info = data.bookInfo || {};
    const bookId = String(info.bookId || mangaId);

    const authorName =
      cleanText(info.authorName) ||
      cleanText((Array.isArray(info.authorItems) && info.authorItems[0] && info.authorItems[0].name) || '');

    const tags = [];
    if (info.categoryName) tags.push(cleanText(info.categoryName));
    if (Array.isArray(info.tagInfos)) {
      for (const t of info.tagInfos) {
        const label = titleCase(t && t.tagName);
        if (label && tags.indexOf(label) === -1) tags.push(label);
      }
    }

    const mangaInfo = {
      mangaId: bookId,
      title: cleanText(info.bookName) || mangaId,
      image: coverUrl(bookId, info.coverUpdateTime),
      desc: plainText(info.description),
      status: mapActionStatus(info.actionStatus),
      tags,
      webURL: `${SITE_BASE}/book/${bookId}`,
      medium: 'novel',
    };
    mangaInfo.completed = mangaInfo.status === 'COMPLETED';
    if (authorName) mangaInfo.author = authorName;
    if (typeof info.totalScore === 'number' && info.totalScore > 0) mangaInfo.rating = info.totalScore;
    if (typeof info.pvNum === 'number' && info.pvNum > 0) mangaInfo.views = info.pvNum;
    if (typeof info.totalChapterNum === 'number' && info.totalChapterNum > 0) {
      mangaInfo.chapters = info.totalChapterNum;
    }

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const data = await this.fetchBookData(mangaId);
      const volumes = Array.isArray(data.volumeItems) ? data.volumeItems : [];
      const chapters = [];
      let order = 0;
      for (const vol of volumes) {
        const items = Array.isArray(vol.chapterItems) ? vol.chapterItems : [];
        for (const c of items) {
          const chapterId = String((c && c.chapterId) || '');
          if (!chapterId) continue;
          order += 1;
          const chapter = {
            id: chapterId,
            chapterId,
            name: cleanText(c.chapterName) || `Chapter ${order}`,
            number: order,
          };
          if (typeof c.publishTime === 'number' && c.publishTime > 0) chapter.time = c.publishTime;
          chapters.push(chapter);
        }
      }
      return chapters;
    } catch (e) {
      console.error('Webnovel getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const data = parseEmbeddedObject(html, 'chapInfo=');
      const info = data && data.chapterInfo;
      if (!info) {
        throw new Error('Webnovel: chapter data not found (page structure may have changed)');
      }

      const contents = Array.isArray(info.contents) ? info.contents : [];
      const rawText = contents
        .map((p) => (p && typeof p.content === 'string' ? p.content : ''))
        .filter(Boolean)
        .join('\n\n');

      const isLocked =
        (typeof info.encryptType === 'number' && info.encryptType !== 0) ||
        info.vipStatus === 1 ||
        !rawText.trim();

      const text = isLocked ? LOCKED_CHAPTER_TEXT : plainText(rawText);
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('Webnovel getChapterDetails failed:', e);
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
      throw new Error(`Webnovel API HTTP ${response.status}`);
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
      throw new Error(`Webnovel HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
