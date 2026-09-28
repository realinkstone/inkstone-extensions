const SITE_BASE = 'https://mangadistrict.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
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
  const m = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS[m[1]];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return Date.UTC(year, mon, day);
}

function slugToChapterNumber(chapterSlug) {
  const base = (chapterSlug || '').replace(/^chapter-/, '');
  const m = base.match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function findFieldContent($, label) {
  let found = null;
  $('.post-content_item').each((_, el) => {
    const heading = $(el).find('.summary-heading h5').first().text().trim();
    if (heading === label) {
      found = $(el).find('.summary-content').first();
      return false;
    }
  });
  return found;
}

function fieldText($, label) {
  const el = findFieldContent($, label);
  if (!el) return '';

  const anchors = el.find('a');
  if (anchors.length > 0) {
    const parts = [];
    anchors.each((_, a) => {
      const t = cleanText($(a).text());
      if (t) parts.push(t);
    });
    if (parts.length > 0) return parts.join(', ');
  }

  return cleanText(el.text());
}

function extractDesc($, container, title) {
  if (!container || container.length === 0) return '';
  const clone = container.clone();
  const paragraphs = clone.find('p');
  if (paragraphs.length > 0) {
    const first = cleanText(paragraphs.first().text());
    if (first && title && first.toLowerCase() === title.toLowerCase()) {
      paragraphs.first().remove();
    }
  }
  const parts = [];
  clone.find('p').each((_, el) => {
    const t = cleanText($(el).text());
    if (t) parts.push(t);
  });
  return parts.length > 0 ? parts.join(' ') : cleanText(clone.text());
}

function hasNextPage($, currentPage) {
  const nextTitle = 'Page ' + (currentPage + 1);
  let found = false;
  $('.wp-pagenavi a').each((_, a) => {
    if (found) return;
    if (($(a).attr('title') || '').trim() === nextTitle) found = true;
  });
  return found;
}

function parseMangaList($) {
  const results = [];

  $('.page-item-detail.manga').each((_, el) => {
    const $el = $(el);
    const link = $el.find('.item-thumb a').first();
    const href = link.attr('href') || '';
    const slugMatch = href.match(/\/series\/([^/]+)\/?/);
    if (!slugMatch) return;

    const mangaId = slugMatch[1];
    const title = (link.attr('title') || '').trim() || cleanText($el.find('.post-title a').first().text());
    if (!title) return;

    const image = (link.find('img').attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/series/${mangaId}/`,
      medium: 'comics',
    };
    if ($el.find('.manga-title-badges.adult').length > 0) manga.ageRating = 18;
    if ($el.find('.manga-title-badges.end').length > 0) manga.completed = true;
    results.push(manga);
  });

  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'modified', name: 'Latest' },
      { id: 'new-manga', name: 'New' },
      { id: 'trending', name: 'Trending' },
      { id: 'views', name: 'Most Views' },
      { id: 'rating', name: 'Rating' },
      { id: 'alphabet', name: 'A-Z' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/?s=&post_type=wp-manga`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('#search-advanced input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).closest('.checkbox').find('label').first().text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MangaDistrict getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'modified';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      const base = page > 1 ? `${SITE_BASE}/page/${page}/` : `${SITE_BASE}/`;
      const params = [`s=${encodeURIComponent(query)}`, 'post_type=wp-manga'];
      includedTags.forEach((t) => {
        if (t && t.id) params.push(`genre%5B%5D=${encodeURIComponent(t.id)}`);
      });
      url = `${base}?${params.join('&')}`;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const genreBase = `${SITE_BASE}/publication-genre/${encodeURIComponent(includedTags[0].id)}/`;
      const base = page > 1 ? `${genreBase}page/${page}/` : genreBase;
      url = `${base}?m_orderby=${encodeURIComponent(feed)}`;
    } else {
      const base = page > 1 ? `${SITE_BASE}/series/page/${page}/` : `${SITE_BASE}/series/`;
      url = `${base}?m_orderby=${encodeURIComponent(feed)}`;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);
    const hasNext = results.length > 0 && hasNextPage($, page);

    return {
      results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleBlock = $('.profile-manga .post-title').first();
    const title = cleanText(titleBlock.find('h1').first().text()) || mangaId;
    const isAdult = titleBlock.find('.manga-title-badges.adult').length > 0;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const summaryImage = $('.summary_image img').first().attr('src');
    const image = (ogImage || summaryImage || '').trim();

    const writer = fieldText($, 'Author(s)');
    const artist = fieldText($, 'Artist(s)');
    const author = [writer, artist].filter(Boolean).join(', ');

    const status = mapStatus(fieldText($, 'Status'));

    const descContainer = $('.description-summary .summary__content').first();
    const desc = extractDesc($, descContainer, title);

    const tags = [];
    const genreContent = findFieldContent($, 'Genre(s)');
    if (genreContent) {
      genreContent.find('a').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) tags.push(t);
      });
    }

    const mangaInfo = {
      title,
      image,
      author,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (isAdult) mangaInfo.ageRating = 18;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('li.wp-manga-chapter').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText(link.text());

      let dateText = cleanText($el.find('.chapter-release-date .timediff i').first().text());
      if (!dateText) {
        dateText = ($el.find('.chapter-release-date .timediff a').first().attr('title') || '').trim();
      }
      const time = dateText ? parseReleaseDate(dateText) : undefined;

      raw.push({ chapterId, name, time });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = slugToChapterNumber(r.chapterId);
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
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.reading-content img.wp-manga-chapter-img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (src.includes('/publication/manga_')) pages.push(src);
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
