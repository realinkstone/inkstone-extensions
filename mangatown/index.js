const SITE_BASE = 'https://www.mangatown.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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

function extractChapterPath(href) {
  const m = (href || '').match(/^\/manga\/[^/]+\/(.+?)\/?$/);
  return m ? m[1] : '';
}

function chapterPathToNumber(chapterPath) {
  const parts = chapterPath.split('/');
  const last = parts[parts.length - 1] || '';
  const m = last.match(/^c([\d.]+)$/i);
  return m ? parseFloat(m[1]) : 0;
}

function pagedUrl(basePath, page, query) {
  const q = query || '';
  if (page > 1) return `${SITE_BASE}${basePath}${page}.htm${q}`;
  return `${SITE_BASE}${basePath}${q}`;
}

function feedUrl(feedId, page) {
  switch (feedId) {
    case 'rating':
      return pagedUrl('/directory/', page, '?rating.za');
    case 'az':
      return pagedUrl('/directory/', page, '?name.az');
    case 'completed':
      return pagedUrl('/completed/', page, '');
    case 'views':
      return pagedUrl('/directory/', page, '');
    case 'latest':
    default:
      return pagedUrl('/latest/', page, '');
  }
}

function genreUrl(slug, page) {
  return pagedUrl(`/directory/0-${encodeURIComponent(slug)}-0-0-0-0/`, page, '');
}

function searchUrl(query, page) {
  const base = `${SITE_BASE}/search?name=${encodeURIComponent(query)}&name_method=cw`;
  return page > 1 ? `${base}&page=${page}` : base;
}

function viewField($, scope, label) {
  let value;
  scope.find('p.view').each((_, p) => {
    if (value !== undefined) return;
    const text = cleanText($(p).text());
    const m = text.match(new RegExp('^' + label + ':\\s*(.*)$', 'i'));
    if (m) value = m[1].trim();
  });
  return value;
}

function parseMangaList($) {
  const results = [];
  $('.manga_pic_list > li').each((_, li) => {
    const $li = $(li);
    const link = $li.find('a.manga_cover').first();
    const href = link.attr('href') || '';
    const idMatch = href.match(/\/manga\/([^/]+)\/?$/);
    if (!idMatch) return;
    const mangaId = idMatch[1];

    const title = cleanText(link.attr('title')) || cleanText($li.find('P.title a, p.title a').first().text());
    if (!title) return;

    const image = absolutize(($li.find('img').first().attr('src') || '').trim());
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    };

    const scoreText = cleanText($li.find('p.score b').first().text());
    const score = parseFloat(scoreText);
    if (!Number.isNaN(score)) manga.rating = score;

    const tags = [];
    $li.find('p.keyWord a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });
    if (tags.length > 0) manga.tags = tags;

    const author = viewField($, $li, 'Author');
    if (author) manga.author = author;

    const statusText = viewField($, $li, 'Status');
    if (statusText && statusText.toLowerCase() === 'completed') manga.completed = true;

    const viewsText = viewField($, $li, 'Views');
    if (viewsText) {
      const n = parseInt(viewsText.replace(/[^\d]/g, ''), 10);
      if (!Number.isNaN(n)) manga.views = n;
    }

    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  const href = $('.next-page a.next').first().attr('href') || '';
  return href.length > 0 && href.indexOf('javascript:') !== 0;
}

function findDetailLi($, label) {
  let found = null;
  $('.detail_info > ul > li').each((_, li) => {
    if (found) return;
    const $li = $(li);
    if (cleanText($li.find('b').first().text()) === label) found = $li;
  });
  return found;
}

function detailFieldText($, label) {
  const li = findDetailLi($, label);
  if (!li) return '';
  const clone = li.clone();
  clone.find('b').remove();
  return cleanText(clone.text());
}

function detailFieldAnchors($, label) {
  const li = findDetailLi($, label);
  if (!li) return [];
  const out = [];
  li.find('a').each((_, a) => {
    const t = cleanText($(a).text());
    if (t) out.push(t);
  });
  return out;
}

function extractDescription($) {
  const clone = ($('#show').first().length ? $('#show').first() : $('#hide').first()).clone();
  clone.find('a.more').remove();
  return cleanText(clone.text());
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Releases' },
      { id: 'views', name: 'Most Viewed' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'az', name: 'A-Z' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/directory/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.aside_content').each((_, section) => {
        const $section = $(section);
        if (cleanText($section.find('.two_title').first().text()) !== 'Genres') return;
        $section.find('.order_cate a').each((_, a) => {
          const href = $(a).attr('href') || '';
          const m = href.match(/^\/directory\/0-([a-z0-9_]+)-0-0-0-0\/?$/i);
          if (!m) return;
          const id = m[1];
          if (seen.has(id)) return;
          seen.add(id);
          const label = cleanText($(a).text());
          if (label) tags.push({ id, label });
        });
      });
      return tags;
    } catch (e) {
      console.error('MangaTown getSearchTags failed: ' + (e && e.message));
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
    const results = parseMangaList($);
    const hasNext = results.length > 0 && hasNextPage($);

    return {
      results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.title-top').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const infoImage = $('.detail_info img').first().attr('src');
    const image = absolutize((ogImage || infoImage || '').trim());

    const writer = detailFieldAnchors($, 'Author(s):').join(', ');
    const artist = detailFieldAnchors($, 'Artist(s):').join(', ');
    const author = [writer, artist].filter(Boolean).join(', ');

    const status = mapStatus(detailFieldText($, 'Status(s):'));
    const tags = detailFieldAnchors($, 'Genre(s):');
    const desc = extractDescription($);

    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE,
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
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('.chapter_list li').each((_, li) => {
      const $li = $(li);
      const link = $li.find('a').first();
      const href = link.attr('href') || '';
      const chapterPath = extractChapterPath(href);
      if (!chapterPath) return;

      const name = cleanText(link.text());
      const dateText = cleanText($li.find('span.time').first().text());
      const time = dateText ? parseReleaseDate(dateText) : undefined;

      raw.push({ chapterPath, name, time });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = chapterPathToNumber(r.chapterPath);
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = { id: r.chapterPath, chapterId: r.chapterPath, name: r.name, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const baseUrl = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${chapterId}/`;

    const firstHtml = await this.requestHTML(baseUrl);
    const $first = cheerio.load(firstHtml);

    const longStripPages = [];
    $first('#viewer img.image').each((_, img) => {
      const src = absolutize(($first(img).attr('src') || '').trim());
      if (src) longStripPages.push(src);
    });
    if (longStripPages.length > 0) {
      return { id: chapterId, mangaId, pages: longStripPages, referer: SITE_BASE };
    }

    const firstImage = absolutize(($first('#image').attr('src') || '').trim());
    if (!firstImage) {
      throw new Error('MangaTown getChapterDetails: no #viewer img.image or #image found on ' + baseUrl);
    }

    let totalPages = 1;
    $first('.page_select select option').each((_, o) => {
      const label = cleanText($first(o).text());
      if (/^\d+$/.test(label)) {
        const n = parseInt(label, 10);
        if (n > totalPages) totalPages = n;
      }
    });

    const pages = [firstImage];
    for (let page = 2; page <= totalPages; page++) {
      const pageUrl = `${baseUrl}${page}.html`;
      const html = await this.requestHTML(pageUrl);
      const $page = cheerio.load(html);
      const src = absolutize(($page('#image').attr('src') || '').trim());
      if (!src) {
        const message = `MangaTown getChapterDetails: no #image found on ${pageUrl} (page ${page} of ${totalPages})`;
        console.error(message);
        throw new Error(message);
      }
      pages.push(src);
    }

    return { id: chapterId, mangaId, pages, referer: SITE_BASE };
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
