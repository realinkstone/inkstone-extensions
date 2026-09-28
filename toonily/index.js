const SITE_BASE = 'https://toonily.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
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
  const m = text.trim().match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{2,4})$/);
  if (!m) return undefined;
  const key = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
  const mon = MONTHS[key];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  return Date.UTC(year, mon, day);
}

function slugToChapterNumber(chapterSlug) {
  const base = chapterSlug.replace(/^chapter-/, '').split('_')[0];
  const parts = base.split('-');
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return parseFloat(parts[0] + '.' + parts[1]);
  }
  return parseFloat(parts[0]) || 0;
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

function parseRelatedManga($) {
  const related = [];

  $('.toonily-related-manga .related-item').each((_, el) => {
    const link = $(el);
    const href = link.attr('href') || '';
    const slugMatch = href.match(/\/serie\/([^/]+)\/?/);
    if (!slugMatch) return;

    const mangaId = slugMatch[1];
    const title = cleanText(link.attr('title') || link.find('.related-title').text());
    const image = (link.find('img').attr('src') || '').trim();

    related.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/serie/${mangaId}/`,
      medium: 'comics',
    });
  });

  return related;
}

function parseMangaList($) {
  const results = [];

  $('.page-item-detail.manga').each((_, el) => {
    const link = $(el).find('.item-thumb a').first();
    const href = link.attr('href') || '';
    const slugMatch = href.match(/\/serie\/([^/]+)\/?/);
    if (!slugMatch) return;

    const mangaId = slugMatch[1];
    const title = (link.attr('title') || '').trim();
    const image = (link.find('img').attr('src') || '').trim();
    const badge = link.find('.manga-title-badges').first().text().trim();

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/serie/${mangaId}/`,
      medium: 'comics',
    };
    if (badge === 'END') manga.completed = true;
    results.push(manga);
  });

  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'new-manga', name: 'Latest' },
      { id: 'trending', name: 'Trending' },
      { id: 'views', name: 'Most Viewed' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'alphabet', name: 'A-Z' },
    ];
  }

  async getSearchTags() {
    return [];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;
    const feed = (request && request.feed) || 'new-manga';

    const url = query
      ? `${SITE_BASE}/?s=${encodeURIComponent(query)}&post_type=wp-manga&paged=${page}`
      : `${SITE_BASE}/webtoons/?m_orderby=${encodeURIComponent(feed)}&paged=${page}`;

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);
    const hasNext = $('a.nextpostslink').length > 0;

    return {
      results,
      metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/serie/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const h1 = $('.post-title h1').first().clone();
    h1.find('.manga-title-badges').remove();
    const title = cleanText(h1.text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const summaryImage = $('.summary_image img').first().attr('src');
    const image = (ogImage || summaryImage || '').trim();

    const writer = fieldText($, 'Writer(s)');
    const artist = fieldText($, 'Artist(s)');
    const author = [writer, artist].filter(Boolean).join(', ');

    const status = mapStatus(fieldText($, 'Status'));

    const descParts = [];
    $('.summary__content p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0 ? descParts.join(' ') : cleanText($('.summary__content').text());

    const tags = [];
    const genreContent = findFieldContent($, 'Genre(s)');
    if (genreContent) {
      genreContent.find('a').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) tags.push(t);
      });
    }

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
      relatedManga: parseRelatedManga($),
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/serie/${encodeURIComponent(mangaId)}/`;
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
      const dateText = $el.find('.chapter-release-date i').first().text().trim();
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
    const url = `${SITE_BASE}/serie/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.wp-manga-chapter-img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (src.includes('/chapters/')) pages.push(src);
    });

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
