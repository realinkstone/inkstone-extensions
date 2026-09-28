const SITE_BASE = 'https://toongod.org';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const GENRES = [
  { id: 'action', label: 'Action' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'bl', label: 'BL' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'drama', label: 'Drama' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'gl', label: 'GL' },
  { id: 'harem', label: 'Harem' },
  { id: 'historical', label: 'Historical' },
  { id: 'horror', label: 'Horror' },
  { id: 'josei', label: 'Josei' },
  { id: 'martial-arts', label: 'Martial Arts' },
  { id: 'mature', label: 'Mature' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'psychological', label: 'Psychological' },
  { id: 'romance', label: 'Romance' },
  { id: 'school-life', label: 'School Life' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'shoujo', label: 'Shoujo' },
  { id: 'shounen', label: 'Shounen' },
  { id: 'slice-of-life', label: 'Slice of Life' },
  { id: 'smut', label: 'Smut' },
  { id: 'sport', label: 'Sport' },
  { id: 'supernatural', label: 'Supernatural' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'uncensored', label: 'Uncensored' },
];

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  if (s.indexOf('cancel') !== -1) return 'CANCELLED';
  if (s.indexOf('hold') !== -1 || s.indexOf('hiatus') !== -1) return 'HIATUS';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})$/);
  if (!m) return undefined;
  const key = m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase();
  const mon = MONTHS[key];
  if (mon === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
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

function imgSrc($img) {
  const dataSrc = ($img.attr('data-src') || '').trim();
  if (dataSrc) return dataSrc;
  const src = ($img.attr('src') || '').trim();
  if (src.indexOf('dflazy') !== -1) return '';
  return src;
}

function extractMangaId(href) {
  const m = (href || '').match(/\/webtoon\/([^/?#]+)\/?/);
  return m ? m[1] : '';
}

function findFieldContent($, label) {
  let found = null;
  $('.post-content_item').each((_, el) => {
    const heading = cleanText($(el).find('.summary-heading h5').first().text());
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

function extractDescription($) {
  const p = $('.summary__content p').first();
  if (p.length > 0) {
    const t = cleanText(p.text());
    if (t) return t;
  }
  return cleanText($('.summary__content').text());
}

function parseBrowseCards($) {
  const results = [];
  $('.page-item-detail.manga').each((_, el) => {
    const $el = $(el);
    const thumbLink = $el.find('.item-thumb a').first();
    const mangaId = extractMangaId(thumbLink.attr('href'));
    if (!mangaId) return;

    const title =
      cleanText($el.find('.item-summary .post-title a').first().text()) ||
      (thumbLink.attr('title') || '').trim() ||
      mangaId;
    const image = imgSrc(thumbLink.find('img').first());
    const isEnd = thumbLink.find('.manga-title-badges.custom.end').length > 0;
    const isAdult = thumbLink.find('.manga-title-badges.custom.adult').length > 0;

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/webtoon/${mangaId}/`,
      medium: 'comics',
    };
    if (isEnd) manga.completed = true;
    if (isAdult) manga.ageRating = 18;
    results.push(manga);
  });
  return results;
}

function parseSearchCards($) {
  const results = [];
  $('.c-tabs-item__content').each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find('.tab-summary .post-title a').first();
    const mangaId = extractMangaId(titleLink.attr('href'));
    if (!mangaId) return;

    const title = cleanText(titleLink.text()) || mangaId;
    const image = imgSrc($el.find('.tab-thumb img').first());
    const statusText = cleanText(
      $el.find('.post-content_item.mg_status .summary-content').first().text()
    );

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/webtoon/${mangaId}/`,
      medium: 'comics',
    };
    if (statusText.toLowerCase().indexOf('complet') !== -1) manga.completed = true;
    results.push(manga);
  });
  return results;
}

function buildListingUrl(basePath, params, page) {
  const path = page > 1 ? `${basePath}/page/${page}/` : `${basePath}/`;
  const parts = [];
  Object.keys(params).forEach((key) => {
    const val = params[key];
    if (Array.isArray(val)) {
      val.forEach((v) => {
        if (v) parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(v)}`);
      });
    } else if (val !== undefined && val !== null) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  });
  const qs = parts.join('&');
  return `${SITE_BASE}${path}${qs ? '?' + qs : ''}`;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'trending', name: 'Trending' },
      { id: 'new-manga', name: 'New' },
      { id: 'views', name: 'Most Views' },
      { id: 'rating', name: 'Rating' },
      { id: 'alphabet', name: 'A-Z' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    return GENRES;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const feed = (request && request.feed) || 'latest';
    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];
    const tagIds = includedTags.map((t) => t && t.id).filter(Boolean);

    const usingSearch = query.length > 0 || tagIds.length > 0;

    let url;
    let usesSearchTemplate;
    if (usingSearch) {
      const params = { s: query, post_type: 'wp-manga' };
      if (tagIds.length > 0) params.genre = tagIds;
      if (feed && feed !== 'completed') params.m_orderby = feed;
      url = buildListingUrl('', params, page);
      usesSearchTemplate = true;
    } else if (feed === 'completed') {
      url = buildListingUrl('/completed-webtoons', {}, page);
      usesSearchTemplate = false;
    } else {
      url = buildListingUrl('/webtoons', { m_orderby: feed }, page);
      usesSearchTemplate = false;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = usesSearchTemplate ? parseSearchCards($) : parseBrowseCards($);
    const hasNext = $('a.nextpostslink').length > 0;

    return {
      results,
      metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/webtoon/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.post-title h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const image = (ogImage || imgSrc($('.summary_image img').first())).trim();

    const writer = fieldText($, 'Author(s)');
    const artist = fieldText($, 'Artist(s)');
    const author = [writer, artist].filter(Boolean).join(', ');

    const status = mapStatus(fieldText($, 'Status'));
    const desc = extractDescription($);
    const isAdult = $('.tab-summary .manga-title-badges.custom.adult').length > 0;

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
      referer: SITE_BASE,
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
    const url = `${SITE_BASE}/webtoon/${encodeURIComponent(mangaId)}/`;
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
    const url = `${SITE_BASE}/webtoon/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.wp-manga-chapter-img').each((_, el) => {
      const src = imgSrc($(el));
      if (src) pages.push(src);
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
