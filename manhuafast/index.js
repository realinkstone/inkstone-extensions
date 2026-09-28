const SITE_BASE = 'https://manhuafast.net';
const IMAGE_REFERER = SITE_BASE;
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

function parseChapterDate(text) {
  if (!text) return undefined;
  const t = text.trim();

  const abs = t.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (abs) {
    const monKey = abs[1].slice(0, 1).toUpperCase() + abs[1].slice(1, 3).toLowerCase();
    const mon = MONTHS[monKey];
    if (mon !== undefined) {
      return Date.UTC(parseInt(abs[3], 10), mon, parseInt(abs[2], 10));
    }
    return undefined;
  }

  const rel = t.toLowerCase().match(/^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unitMs = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    }[rel[2]];
    return Date.now() - n * unitMs;
  }

  if (/^(just now|now)$/i.test(t)) return Date.now();
  if (/^yesterday$/i.test(t)) return Date.now() - 24 * 60 * 60 * 1000;

  return undefined;
}

function slugToChapterNumber(chapterSlug) {
  const base = (chapterSlug || '').replace(/^chapter-/, '').split('_')[0];
  const n = parseFloat(base);
  return Number.isFinite(n) ? n : 0;
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function imgUrl(img) {
  const dataSrc = (img.attr('data-src') || '').trim();
  if (dataSrc) return dataSrc;
  const src = (img.attr('src') || '').trim();
  if (src && src.indexOf('dflazy') === -1) return src;
  return '';
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

function parseMangaList($) {
  const results = [];

  $('.page-item-detail.manga').each((_, el) => {
    const card = $(el);
    const thumbLink = card.find('.item-thumb a').first();
    const href = thumbLink.attr('href') || '';
    const slugMatch = href.match(/\/manga\/([^/]+)\/?/);
    if (!slugMatch) return;
    const mangaId = slugMatch[1];

    const titleLink = card.find('.post-title a').first();
    const title = cleanText(titleLink.text()) || cleanText(thumbLink.attr('title')) || mangaId;

    const image = imgUrl(thumbLink.find('img').first());
    if (!image) return;

    results.push({
      mangaId,
      title,
      image,
      referer: IMAGE_REFERER,
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
      const html = await this.requestHTML(`${SITE_BASE}/manga/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('a[href*="/manga-genre/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/manga-genre\/([^/?#]+)\/?/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const clone = $(el).clone();
        clone.find('.count').remove();
        const label = cleanText(clone.text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('ManhuaFast getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      const qs = `s=${encodeURIComponent(query)}&post_type=wp-manga`;
      url = page > 1 ? `${SITE_BASE}/page/${page}/?${qs}` : `${SITE_BASE}/?${qs}`;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const base = `${SITE_BASE}/manga-genre/${encodeURIComponent(includedTags[0].id)}`;
      url = page > 1 ? `${base}/page/${page}/` : `${base}/`;
    } else {
      const qs = `m_orderby=${encodeURIComponent(feed)}`;
      url = page > 1 ? `${SITE_BASE}/manga/page/${page}/?${qs}` : `${SITE_BASE}/manga/?${qs}`;
    }

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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const h1 = $('.post-title h1').first().clone();
    h1.find('.manga-title-badges').remove();
    const title = cleanText(h1.text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const image = (ogImage || imgUrl($('.summary_image img').first())).trim();

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
        referer: IMAGE_REFERER,
        author: author || undefined,
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
    const html = await this.requestChaptersFragment(url);
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
      const time = dateText ? parseChapterDate(dateText) : undefined;

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
      const src = imgUrl($(el));
      if (src) pages.push(src);
    });

    return { id: chapterId, mangaId, pages, referer: IMAGE_REFERER };
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

  async requestChaptersFragment(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'POST',
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
