const SITE_BASE = 'https://mangaplaza.com';
const READER_BASE = 'https://reader.mangaplaza.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const FEED_SORTS = { popular: 'rank', new: 'new', rated: 'review_point' };
const DEFAULT_FEED = 'popular';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const t = (text || '').toLowerCase();
  if (t.indexOf('ongoing') !== -1) return 'ONGOING';
  if (t.indexOf('complete') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function parseChapterRange(text) {
  const m = (text || '').match(/#\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return { start: undefined, end: undefined };
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  return { start, end };
}

function buildContentId(titleId, chapterNumber) {
  return `1${titleId}${String(chapterNumber).padStart(4, '0')}`;
}

function extractTitleId(href) {
  const m = (href || '').match(/\/title\/(\d+)/);
  return m ? m[1] : undefined;
}

function randomToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildCookieHeader(rawSetCookie) {
  if (!rawSetCookie) return undefined;
  const pairs = [];
  rawSetCookie.split(/,\s*(?=[A-Za-z0-9_-]+=)/).forEach((line) => {
    const nameValue = line.split(';')[0].trim();
    if (nameValue) pairs.push(nameValue);
  });
  return pairs.length > 0 ? pairs.join('; ') : undefined;
}

function parseListingItem($, li) {
  const $li = $(li);
  const titleAnchor = $li.find('.titleName a').first();
  const mangaId = extractTitleId(titleAnchor.attr('href'));
  if (!mangaId) return null;

  const title = cleanText(titleAnchor.text());
  const image = ($li.find('.thumBlock img').first().attr('src') || '').trim();
  const statusText = cleanText($li.find('.label .number').first().text());
  const range = parseChapterRange(statusText);

  const authors = [];
  $li.find('.informationBlock .authorName a').each((_, a) => {
    const t = cleanText($(a).text());
    if (t) authors.push(t);
  });

  const tags = [];
  $li.find('.informationBlock .genreBlock a').each((_, a) => {
    const t = cleanText($(a).text());
    if (t) tags.push(t);
  });

  const ratingText = cleanText($li.find('.StarRatingBlock .count').first().text());
  const ratingMatch = ratingText.match(/^([\d.]+)/);

  const manga = {
    mangaId,
    title: title || mangaId,
    image,
    webURL: `${SITE_BASE}/title/${mangaId}/`,
    medium: 'comics',
  };
  if (authors.length) manga.author = authors.join(' / ');
  if (tags.length) manga.tags = tags;
  if (ratingMatch) manga.rating = parseFloat(ratingMatch[1]);
  if (range.end) manga.chapters = range.end;
  if (mapStatus(statusText) === 'COMPLETED') manga.completed = true;
  return manga;
}

function extractPageUrls(ttx, contentsServer, contentDate) {
  const cut = (ttx || '').indexOf('<t-nocase');
  const scope = cut === -1 ? ttx || '' : ttx.slice(0, cut);

  const filenames = [];
  const pageRe = /pages\/([^"]+\.jpg)/g;
  let m = pageRe.exec(scope);
  while (m) {
    filenames.push(m[1]);
    m = pageRe.exec(scope);
  }

  const server = contentsServer.endsWith('/') ? contentsServer : `${contentsServer}/`;
  const pageQuery = qs({ dmytime: contentDate || Date.now(), u0: 0, u1: `${SITE_BASE}/` });
  return filenames.map((f) => `${server}img/pages/${f}?${pageQuery}`);
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'new', name: 'Newest' },
      { id: 'rated', name: 'Top Rated' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/genre/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.allGenresList details').each((_, det) => {
        const a = $(det).find('ul > li').first().find('a').first();
        const m = (a.attr('href') || '').match(/\/genre\/(\d+)\/?$/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        const label = cleanText(a.text())
          .replace(/^All\s+/i, '')
          .replace(/\(\d[\d,]*\)\s*$/, '')
          .trim();
        if (!label) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MangaPlaza getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const includedTags = (request && request.includedTags) || [];
    const segments = ['searchresult'];
    includedTags.forEach((t) => {
      if (t && t.id) segments.push('genre', String(t.id));
    });

    const feedId = (request && request.feed) || DEFAULT_FEED;
    const sort = FEED_SORTS[feedId] || FEED_SORTS[DEFAULT_FEED];
    const query = (request && request.title) || '';
    const params = qs({ fre: query || undefined, sort, page: page > 1 ? page : undefined });
    const url = `${SITE_BASE}/${segments.join('/')}/${params ? `?${params}` : ''}`;

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const results = [];
    $('ul.listBox > li').each((_, li) => {
      const manga = parseListingItem($, li);
      if (manga) results.push(manga);
    });

    const noteText = cleanText($('.resultNote').first().text());
    const rangeMatch = noteText.match(/([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)/);
    let hasNext;
    if (rangeMatch) {
      const end = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
      const total = parseInt(rangeMatch[3].replace(/,/g, ''), 10);
      hasNext = end < total;
    } else {
      hasNext = results.length > 0;
    }

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/title/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.detailBlock .informationBlock .titleName h1').first().text());
    const image = ($('.detailBlock .thumBlock img').first().attr('src') || '').trim();
    const desc = cleanText($('.storytext').first().text());
    const statusText = cleanText($('.detailTopBlock .label .number').first().text());
    const status = mapStatus(statusText);
    const range = parseChapterRange(statusText);

    const authors = [];
    $('.detailBlock .authorNameBlock a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) authors.push(t);
    });

    const tags = [];
    $('.detailBlock .genreBlock a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const ratingText = cleanText($('.StarRatingBlock .count').first().text());
    const ratingMatch = ratingText.match(/^([\d.]+)/);

    let publisher;
    let releaseDate;
    $('.infoList > li').each((_, li) => {
      const $li = $(li);
      const label = cleanText($li.find('.itemName').first().text());
      const value = cleanText($li.find('.item').first().text());
      if (!value) return;
      if (/publisher/i.test(label)) publisher = value;
      if (/release date/i.test(label)) releaseDate = value;
    });

    const mangaInfo = {
      title: title || mangaId,
      image,
      desc,
      status,
      webURL: url,
      medium: 'comics',
    };
    if (authors.length) mangaInfo.author = authors.join(' / ');
    if (tags.length) mangaInfo.tags = tags;
    if (ratingMatch) mangaInfo.rating = parseFloat(ratingMatch[1]);
    if (range.end) mangaInfo.chapters = range.end;
    if (publisher) mangaInfo.publisher = publisher;
    if (releaseDate) mangaInfo.releaseDate = releaseDate;
    if (status === 'COMPLETED') mangaInfo.completed = true;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/title/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const statusText = cleanText($('.detailTopBlock .label .number').first().text());
    const range = parseChapterRange(statusText);
    const total = range.end || 0;
    if (!total) {
      const message =
        `MangaPlaza: could not read the chapter count for ${mangaId} from ` +
        `.detailTopBlock .label .number (got "${statusText}"); the markup has ` +
        'likely changed';
      console.error(message);
      throw new Error(message);
    }

    const freeText = cleanText($('.detailTopBlock .label .free').first().text());
    const freeMatch = freeText.match(/(\d+)/);
    const freeCount = freeMatch ? parseInt(freeMatch[1], 10) : 0;

    const chapters = [];
    for (let n = 1; n <= total; n += 1) {
      const locked = n > freeCount;
      const id = buildContentId(mangaId, n);
      chapters.push({
        id,
        chapterId: id,
        name: locked ? `Chapter ${n} (Locked)` : `Chapter ${n}`,
        number: n,
      });
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const infoUrl = `${READER_BASE}/sws/apis/bibGetCntntInfo.php?${qs({
      cid: chapterId,
      dmytime: Date.now(),
      k: randomToken(),
      u0: 0,
      u1: `${SITE_BASE}/`,
    })}`;

    let infoResponse;
    try {
      infoResponse = await this.requestRaw(infoUrl);
    } catch (e) {
      console.error(`MangaPlaza: bibGetCntntInfo failed for ${chapterId}:`, e);
      throw e;
    }
    let info;
    try {
      info = JSON.parse(infoResponse.data);
    } catch (e) {
      console.error(`MangaPlaza: bibGetCntntInfo returned non-JSON for ${chapterId}:`, e);
      throw e;
    }

    const item = info && info.result === 1 && info.items && info.items[0];
    if (!item) {
      return { id: chapterId, mangaId, pages: [] };
    }
    if (!item.ContentsServer) {
      const message = `MangaPlaza: bibGetCntntInfo returned an item with no ContentsServer for ${chapterId}`;
      console.error(message);
      throw new Error(message);
    }

    const contentUrl = `${item.ContentsServer}${item.ContentsServer.endsWith('/') ? '' : '/'}content?${qs({
      dmytime: item.ContentDate,
      u0: 0,
      u1: `${SITE_BASE}/`,
    })}`;

    const cookieHeader = buildCookieHeader(infoResponse.headers && infoResponse.headers['set-cookie']);
    let content;
    try {
      content = await this.requestJSON(contentUrl, cookieHeader ? { Cookie: cookieHeader } : undefined);
    } catch (e) {
      const message =
        `MangaPlaza: content manifest fetch for ${chapterId} failed, likely because the ` +
        `CloudFront-signed session cookies from bibGetCntntInfo.php were not accepted ` +
        `(cookieHeader ${cookieHeader ? 'was' : 'was NOT'} forwarded): ${e && e.message}`;
      console.error(message);
      throw new Error(message);
    }
    if (!content || content.result !== 1 || !content.ttx) {
      const message =
        `MangaPlaza: content manifest for ${chapterId} carried no page list ` +
        `(result ${content ? content.result : 'none'})`;
      console.error(message);
      throw new Error(message);
    }

    const pages = extractPageUrls(content.ttx, item.ContentsServer, item.ContentDate);
    return { id: chapterId, mangaId, pages };
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
      throw new Error(`MangaPlaza HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestRaw(url, extraHeaders) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, extraHeaders || {}),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MangaPlaza HTTP ${response.status}`);
    }
    return response;
  }

  async requestJSON(url, extraHeaders) {
    const response = await this.requestRaw(url, extraHeaders);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
