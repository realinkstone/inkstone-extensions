const SITE_BASE = 'https://manhwatop.com';
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
  const s = text.trim();

  const rel = s.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unitMs = {
      second: 1000, minute: 60000, hour: 3600000, day: 86400000,
      week: 604800000, month: 2592000000, year: 31536000000,
    }[rel[2].toLowerCase()];
    return Date.now() - n * unitMs;
  }

  const abs = s.match(/^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{2,4})$/);
  if (abs) {
    const key = abs[1][0].toUpperCase() + abs[1].slice(1, 3).toLowerCase();
    const mon = MONTHS[key];
    if (mon === undefined) return undefined;
    const day = parseInt(abs[2], 10);
    let year = parseInt(abs[3], 10);
    if (year < 100) year += 2000;
    return Date.UTC(year, mon, day);
  }

  return undefined;
}

function slugToChapterNumber(chapterSlug) {
  const base = chapterSlug.replace(/^chapter-/, '');
  if (/^\d+\.\d+$/.test(base)) return parseFloat(base);
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

function realImageSrc($el) {
  return ($el.attr('data-src') || $el.attr('src') || '').trim();
}

function findFieldContent($, label) {
  let found = null;
  $('.post-content_item').each((_, el) => {
    const heading = cleanText($(el).find('.summary-heading .h5').first().text());
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

function parseArchiveCards($) {
  const results = [];
  $('.page-item-detail').each((_, el) => {
    const link = $(el).find('.item-thumb a').first();
    const href = link.attr('href') || '';
    const slugMatch = href.match(/\/manga\/([^/]+)\/?/);
    if (!slugMatch) return;

    const mangaId = slugMatch[1];
    const title = (link.attr('title') || '').trim();
    const image = realImageSrc(link.find('img').first());
    if (!title || !image) return;

    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    });
  });
  return results;
}

function parseSearchCards($) {
  const results = [];
  $('.c-tabs-item__content').each((_, el) => {
    const card = $(el);
    const thumbLink = card.find('.tab-thumb a').first();
    const href = thumbLink.attr('href') || '';
    const slugMatch = href.match(/\/manga\/([^/]+)\/?/);
    if (!slugMatch) return;

    const mangaId = slugMatch[1];
    const title = cleanText(card.find('.post-title a').first().text()) || (thumbLink.attr('title') || '').trim();
    const image = realImageSrc(thumbLink.find('img').first());
    if (!title || !image) return;

    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    });
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'new-manga', name: 'New' },
      { id: 'trending', name: 'Trending' },
      { id: 'views', name: 'Most Views' },
      { id: 'rating', name: 'Rating' },
      { id: 'alphabet', name: 'A-Z' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('ul.sub-menu a[href*="/manga-genre/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/manga-genre\/([^/?#]+)\/?/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('ManhwaTop getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];

    let url;
    let parse;
    if (query) {
      url = `${SITE_BASE}/?s=${encodeURIComponent(query)}&post_type=wp-manga&paged=${page}`;
      parse = parseSearchCards;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      url = `${SITE_BASE}/manga-genre/${encodeURIComponent(includedTags[0].id)}/?paged=${page}`;
      parse = parseArchiveCards;
    } else {
      url = `${SITE_BASE}/manga/?m_orderby=${encodeURIComponent(feed)}&paged=${page}`;
      parse = parseArchiveCards;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parse($);

    return {
      results,
      metadata: results.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.post-title h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const summaryImg = $('.summary_image img').first();
    const image = (ogImage || realImageSrc(summaryImg) || '').trim();

    const writer = fieldText($, 'Author(s)');
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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/ajax/chapters/`;
    const html = await this.requestHTML(url, 'POST');
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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.wp-manga-chapter-img').each((_, el) => {
      const src = realImageSrc($(el));
      if (src) pages.push(src);
    });

    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url, method) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: method || 'GET',
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
