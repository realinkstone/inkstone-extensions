const SITE_BASE = 'https://manhwa18.cc';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
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

function parseChapterDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function extractMangaId(href) {
  const m = (href || '').match(/\/webtoon\/([^/?#]+)/);
  return m ? m[1] : '';
}

function parseMangaCards($, scope) {
  const results = [];
  scope.find('.bsx').each((_, el) => {
    const card = $(el);
    const a = card.find('.thumb a, h3 a').first();
    const mangaId = extractMangaId(a.attr('href'));
    if (!mangaId) return;

    const title = cleanText(a.attr('title') || card.find('h3').first().text());
    if (!title) return;

    const image = (card.find('.thumb img').first().attr('data-src')
      || card.find('.thumb img').first().attr('src') || '').trim();
    if (!image) return;

    const ratingText = card.find('.my-rating').first().attr('data-rating');
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/webtoon/${mangaId}`,
      medium: 'comics',
    };
    if (Number.isFinite(rating)) manga.rating = rating;
    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  return $('.pagination li.next a').length > 0;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'alphabet', name: 'A-Z' },
      { id: 'rating', name: 'Rating' },
      { id: 'trending', name: 'Trending' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/webtoons`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.sub-menu a').each((_, a) => {
        const href = $(a).attr('href') || '';
        const m = href.match(/\/webtoon-genre\/([^/?#]+)/);
        if (!m) return;
        const id = m[1];
        const label = cleanText($(a).attr('title') || $(a).text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Manhwa18 getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';

    if (query) {
      const url = `${SITE_BASE}/search?${qs({ q: query, page })}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = parseMangaCards($, $.root());
      return { results, metadata: results.length > 0 && hasNextPage($) ? { page: page + 1 } : undefined };
    }

    const includedTags = (request && request.includedTags) || [];
    if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const tagId = includedTags[0].id;
      const url = `${SITE_BASE}/webtoon-genre/${encodeURIComponent(tagId)}/${page}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = parseMangaCards($, $.root());
      return { results, metadata: results.length > 0 && hasNextPage($) ? { page: page + 1 } : undefined };
    }

    const feed = (request && request.feed) || 'latest';
    const url = `${SITE_BASE}/webtoons/${page}?${qs({ orderby: feed })}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaCards($, $.root());
    return {
      results,
      metadata: results.length > 0 && hasNextPage($) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/webtoon/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleEl = $('.post-title h1').first().clone();
    titleEl.find('span').remove();
    const title = cleanText(titleEl.text()) || mangaId;

    const image = ($('.summary_image img').first().attr('data-src')
      || $('.summary_image img').first().attr('src') || '').trim();

    const author = $('.author-content a').map((_, a) => cleanText($(a).text())).get().filter(Boolean);
    const artist = $('.artist-content a').map((_, a) => cleanText($(a).text())).get().filter(Boolean);
    const authorText = Array.from(new Set([...author, ...artist])).join(', ');

    const tags = $('.genres-content a').map((_, a) => cleanText($(a).text())).get().filter(Boolean);

    let releaseDate;
    $('.post-content_item').each((_, el) => {
      const $el = $(el);
      const label = cleanText($el.find('.summary-heading h5').first().text()).replace(/:$/, '');
      if (label === 'Release') {
        const value = cleanText($el.find('.summary-content').first().text());
        if (value) releaseDate = value;
      }
    });

    const descParts = $('.dsct p').map((_, p) => cleanText($(p).text())).get().filter(Boolean);
    const desc = descParts.length > 0 ? descParts.join(' ') : cleanText($('.dsct').first().text());

    const ratingText = $('.avgrate').first().text();
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    const mangaInfo = {
      title,
      image,
      author: authorText || undefined,
      desc,
      status: 'UNKNOWN',
      tags,
      releaseDate,
      webURL: url,
      medium: 'comics',
    };
    if (Number.isFinite(rating)) mangaInfo.rating = rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/webtoon/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapterlist .a-h').each((_, li) => {
      const $li = $(li);
      const a = $li.find('a.chapter-name').first();
      const chapterId = lastPathSegment(a.attr('href'));
      if (!chapterId) return;

      const name = cleanText(a.text());
      const numMatch = name.match(/[\d.]+/);
      const number = numMatch ? parseFloat(numMatch[0]) : 0;
      const dateText = cleanText($li.find('.chapter-time').first().text());
      const time = dateText ? parseChapterDate(dateText) : undefined;

      raw.push({ chapterId, name, number, time });
    });

    raw.reverse();
    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/webtoon/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.read-content img').each((_, img) => {
      const src = ($(img).attr('data-src') || $(img).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
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
