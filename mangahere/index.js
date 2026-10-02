const SITE_BASE = 'https://www.mangahere.cc';
const IMAGE_REFERER = SITE_BASE;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const AGE_HEADERS = { Cookie: 'isAdult=1' };

const ASHX_TRIES = 3;

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absolutize(url) {
  if (!url) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  return url;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const key = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
  const mon = MONTHS[key];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return Date.UTC(year, mon, day);
}

function parseChapterNumber(label) {
  const m = (label || '').match(/Ch\.?\s*([\d]+(?:\.[\d]+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

function extractChapterId(href) {
  const m = (href || '').match(/^\/manga\/[^/]+\/(.+)\/[^/]+\.html$/);
  return m ? m[1] : '';
}

function unpackPacked(source) {
  const startMarker = 'eval(function(p,a,c,k,e,';
  const start = source.indexOf(startMarker);
  if (start === -1) return null;
  const bodyEndMarker = 'return p;}(';
  const bodyEndIdx = source.indexOf(bodyEndMarker, start);
  if (bodyEndIdx === -1) return null;

  let i = bodyEndIdx + bodyEndMarker.length;

  function parseJsString(s, pos) {
    const quote = s[pos];
    pos++;
    let out = '';
    while (pos < s.length && s[pos] !== quote) {
      if (s[pos] === '\\') {
        const next = s[pos + 1];
        if (next === 'n') out += '\n';
        else if (next === 't') out += '\t';
        else if (next === 'r') out += '\r';
        else out += next;
        pos += 2;
      } else {
        out += s[pos];
        pos += 1;
      }
    }
    pos += 1;
    return [out, pos];
  }

  const [p, i1] = parseJsString(source, i);
  i = i1;
  while (source[i] === ',' || source[i] === ' ') i++;

  let numStr = '';
  while (i < source.length && /[0-9]/.test(source[i])) { numStr += source[i]; i++; }
  const a = parseInt(numStr, 10);
  while (source[i] === ',' || source[i] === ' ') i++;

  numStr = '';
  while (i < source.length && /[0-9]/.test(source[i])) { numStr += source[i]; i++; }
  const c = parseInt(numStr, 10);
  while (source[i] === ',' || source[i] === ' ') i++;

  const [kRaw] = parseJsString(source, i);
  const k = kRaw.split('|');

  function digitChar(n) {
    return n > 35 ? String.fromCharCode(n + 29) : n.toString(36);
  }
  function toBase(num) {
    return num < a ? digitChar(num) : toBase(Math.floor(num / a)) + digitChar(num % a);
  }

  let result = p;
  for (let cc = c - 1; cc >= 0; cc--) {
    if (k[cc]) {
      const token = toBase(cc);
      const re = new RegExp('\\b' + token + '\\b', 'g');
      result = result.replace(re, k[cc]);
    }
  }
  return result;
}

function extractNewImgs(unpackedJs) {
  const m = unpackedJs.match(/newImgs\s*=\s*\[([^\]]*)\]/);
  if (!m) return [];
  const urls = [];
  const re = /'([^']*)'/g;
  let mm;
  while ((mm = re.exec(m[1])) !== null) {
    urls.push(absolutize(mm[1]));
  }
  return urls;
}

function extractGuidKey(unpackedJs) {
  const idx = unpackedJs.indexOf('guidkey');
  if (idx === -1) return '';
  const semiIdx = unpackedJs.indexOf(';', idx);
  const expr = semiIdx === -1 ? unpackedJs.slice(idx) : unpackedJs.slice(idx, semiIdx);
  const parts = expr.match(/'([^']*)'/g) || [];
  return parts.map((s) => s.slice(1, -1)).join('');
}

function extractAshxPageImage(unpackedJs) {
  const pixMatch = unpackedJs.match(/var\s+pix\s*=\s*"([^"]*)"/);
  const pvalueMatch = unpackedJs.match(/var\s+pvalue\s*=\s*\[([^\]]*)\]/);
  if (!pixMatch || !pvalueMatch) return null;
  const firstSuffix = pvalueMatch[1].match(/"([^"]*)"/);
  if (!firstSuffix) return null;
  return absolutize(pixMatch[1] + firstSuffix[1]);
}

function parseListingPage($) {
  const results = [];
  $('.manga-list-1-list > li, .manga-list-4-list > li').each((_, li) => {
    const $li = $(li);
    const link = $li.find('a[href*="/manga/"]').first();
    const href = link.attr('href') || '';
    const idMatch = href.match(/\/manga\/([^/]+)\/?$/);
    if (!idMatch) return;
    const mangaId = idMatch[1];

    const titleLink = $li.find('.manga-list-1-item-title a, .manga-list-4-item-title a').first();
    const title = cleanText(link.attr('title') || titleLink.text() || link.text());
    const image = ($li.find('img').first().attr('src') || '').trim();
    if (!title || !image) return;

    const manga = {
      mangaId,
      title,
      image: absolutize(image),
      referer: IMAGE_REFERER,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    };

    let author = '';
    $li.find('.manga-list-4-item-tip').each((_, tip) => {
      if (author) return;
      const t = cleanText($(tip).text());
      const m = t.match(/^Author:(.*)$/);
      if (m) author = m[1].trim();
    });
    if (author) manga.author = author;

    const statusText = cleanText($li.find('.manga-list-4-show-tag-list-2').text());
    if (statusText.toLowerCase() === 'completed') manga.completed = true;

    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  let hasNext = false;
  $('.pager-list-left a').each((_, a) => {
    const $a = $(a);
    if ($a.text().trim() === '>') {
      const href = $a.attr('href') || '';
      hasNext = href.length > 0 && href.indexOf('javascript:') !== 0;
    }
  });
  return hasNext;
}

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'hot', name: 'Hot Manga Releases' },
  { id: 'trending', name: 'Trending Manga' },
  { id: 'ranking', name: 'Popular Manga Ranking' },
  { id: 'new', name: 'New Manga Release' },
  { id: 'completed', name: 'Completed' },
  { id: 'ongoing', name: 'Ongoing' },
];

function feedUrl(feedId, page) {
  switch (feedId) {
    case 'hot':
      return `${SITE_BASE}/hot/`;
    case 'trending':
      return `${SITE_BASE}/trending/`;
    case 'ranking':
      return `${SITE_BASE}/ranking/`;
    case 'new':
      return page > 1 ? `${SITE_BASE}/directory/${page}.htm?news` : `${SITE_BASE}/directory/?news`;
    case 'completed':
      return page > 1 ? `${SITE_BASE}/completed/${page}.htm` : `${SITE_BASE}/completed/`;
    case 'ongoing':
      return page > 1 ? `${SITE_BASE}/on_going/${page}.htm` : `${SITE_BASE}/on_going/`;
    case 'latest':
    default:
      return page > 1 ? `${SITE_BASE}/latest/${page}/` : `${SITE_BASE}/latest/`;
  }
}

function genreUrl(genreId, page) {
  return page > 1 ? `${SITE_BASE}/directory/${genreId}/${page}.htm` : `${SITE_BASE}/directory/${genreId}/`;
}

function searchUrl(query, page) {
  const q = encodeURIComponent(query);
  return page > 1 ? `${SITE_BASE}/search?page=${page}&title=${q}` : `${SITE_BASE}/search?title=${q}`;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/directory/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.update-bar-filter-list a[title]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/^\/([^/]+)\/?$/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).attr('title'));
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MangaHere getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = searchUrl(query, page);
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      url = genreUrl(includedTags[0].id, page);
    } else {
      url = feedUrl(feed, page);
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseListingPage($);
    const hasNext = results.length > 0 && hasNextPage($);

    return {
      results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url, AGE_HEADERS);
    const $ = cheerio.load(html);

    const title = cleanText($('.detail-info-right-title-font').first().text()) || mangaId;

    const ogImage = $('meta[name="og:image"]').attr('content');
    const coverImage = $('.detail-info-cover-img').first().attr('src');
    const image = absolutize((ogImage || coverImage || '').trim());

    const authorLinks = $('.detail-info-right-say a');
    let author = '';
    if (authorLinks.length > 0) {
      const parts = [];
      authorLinks.each((_, a) => {
        const t = cleanText($(a).text());
        if (t) parts.push(t);
      });
      author = parts.join(', ');
    } else {
      author = cleanText($('.detail-info-right-say').text()).replace(/^Author:\s*/i, '');
    }

    const status = mapStatus($('.detail-info-right-title-tip').first().text());

    const tags = [];
    $('.detail-info-right-tag-list a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    let desc = cleanText($('.fullcontent').first().text());
    if (!desc) {
      const contentClone = $('.detail-info-right-content').first().clone();
      contentClone.find('a').remove();
      desc = cleanText(contentClone.text());
    }

    return {
      mangaInfo: {
        title,
        image,
        referer: IMAGE_REFERER,
        author,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url, AGE_HEADERS);
    const $ = cheerio.load(html);

    if ($('#checkAdult').length > 0) {
      throw new Error('MangaHere getChapters: the 18+ warning is blocking ' + url);
    }

    const raw = [];
    $('.detail-main-list > li').each((_, li) => {
      const $li = $(li);
      const link = $li.find('a').first();
      const href = link.attr('href') || '';
      const chapterId = extractChapterId(href);
      if (!chapterId) return;

      const label = cleanText($li.find('.title3').first().text()) || cleanText(link.attr('title'));
      const dateText = cleanText($li.find('.title2').first().text());
      const time = dateText ? parseReleaseDate(dateText) : undefined;

      raw.push({ chapterId, name: label, number: parseChapterNumber(label), time });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = r.number;
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const readerUrl = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${chapterId}/1.html`;
    const html = await this.requestHTML(readerUrl);

    const isBarChapterMatch = html.match(/var\s+isbarchpater\s*=\s*(true|false)/);
    const isBarChapter = isBarChapterMatch ? isBarChapterMatch[1] === 'true' : false;

    const unpacked = unpackPacked(html);
    if (!unpacked) {
      throw new Error('MangaHere getChapterDetails: no packed reader script found on ' + readerUrl);
    }

    let pages;
    if (isBarChapter) {
      pages = extractNewImgs(unpacked);
      if (pages.length === 0) {
        throw new Error('MangaHere getChapterDetails: isbarchpater=true but no newImgs found on ' + readerUrl);
      }
    } else {
      const chapterIdMatch = html.match(/var\s+chapterid\s*=\s*(\d+)/);
      const imageCountMatch = html.match(/var\s+imagecount\s*=\s*(\d+)/);
      if (!chapterIdMatch || !imageCountMatch) {
        throw new Error('MangaHere getChapterDetails: missing chapterid/imagecount on ' + readerUrl);
      }
      const cid = chapterIdMatch[1];
      const imageCount = parseInt(imageCountMatch[1], 10);
      const key = extractGuidKey(unpacked);

      pages = [];
      for (let page = 1; page <= imageCount; page++) {
        const ashxUrl = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${chapterId}/chapterfun.ashx?cid=${cid}&page=${page}&key=${encodeURIComponent(key)}`;
        const pageImage = await this.fetchPageImage(ashxUrl, readerUrl);
        if (!pageImage) {
          throw new Error(`MangaHere getChapterDetails: failed to parse page ${page} of ${readerUrl}`);
        }
        pages.push(pageImage);
      }
    }

    return { id: chapterId, mangaId, pages, referer: IMAGE_REFERER };
  }

  async fetchPageImage(ashxUrl, readerUrl) {
    let body = '';
    for (let attempt = 1; attempt <= ASHX_TRIES; attempt++) {
      body = await this.requestHTML(ashxUrl, { Referer: readerUrl });
      if (body.trim() !== '') break;
    }
    const unpacked = unpackPacked(body);
    return unpacked ? extractAshxPageImage(unpacked) : null;
  }

  async requestHTML(url, extraHeaders) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: Object.assign({ 'User-Agent': UA }, extraHeaders),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
