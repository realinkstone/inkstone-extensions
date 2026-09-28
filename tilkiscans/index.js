const SITE_BASE = 'https://www.tilkiscans.com';
const IMAGE_REFERER = SITE_BASE + '/';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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
  const s = (text || '').toLowerCase();
  if (s.includes('devam')) return 'ONGOING';
  if (s.includes('tamamla')) return 'COMPLETED';
  if (s.includes('beklemede') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('ptal')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseChapterDate(text) {
  const t = (text || '').trim();

  const abs = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (abs) {
    const day = parseInt(abs[1], 10);
    const month = parseInt(abs[2], 10);
    const year = parseInt(abs[3], 10);
    return Date.UTC(year, month - 1, day);
  }

  const rel = t.toLowerCase().match(/^(\d+)\s*(saniye|dakika|saat|gün|hafta|ay|yıl)\s+önce$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unitMs = {
      saniye: 1000,
      dakika: 60 * 1000,
      saat: 60 * 60 * 1000,
      gün: 24 * 60 * 60 * 1000,
      hafta: 7 * 24 * 60 * 60 * 1000,
      ay: 30 * 24 * 60 * 60 * 1000,
      yıl: 365 * 24 * 60 * 60 * 1000,
    }[rel[2]];
    return Date.now() - n * unitMs;
  }

  return undefined;
}

function slugToChapterNumber(chapterSlug) {
  const m = (chapterSlug || '').match(/bolum-([\d.]+)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function imgUrl(img) {
  const dataSrc = (img.attr('data-src') || '').trim();
  if (dataSrc) return dataSrc;
  return (img.attr('src') || '').trim();
}

function cardFact($, label) {
  let value = '';
  $('.mgcr-modern-card__fact').each((_, el) => {
    const span = cleanText($(el).find('span').first().text());
    if (span === label) {
      value = cleanText($(el).find('strong').first().text());
      return false;
    }
  });
  return value;
}

function chapterTextLink($, li) {
  const anchors = $(li).find('a');
  let link = null;
  anchors.each((_, a) => {
    const $a = $(a);
    if (!$a.hasClass('chapter-thumbnail')) {
      link = $a;
      return false;
    }
  });
  if (!link && anchors.length > 0) link = anchors.last();
  return link;
}

function parseArchiveCards($) {
  const results = [];

  $('.mgcr-archive-card').each((_, el) => {
    const card = $(el);
    const coverLink = card.find('.mgcr-archive-card__cover').first();
    const href = coverLink.attr('href') || '';
    const slugMatch = href.match(/\/seri\/([^/?#]+)\/?/);
    if (!slugMatch) return;
    const mangaId = slugMatch[1];

    const titleLink = card.find('.mgcr-archive-card__body h3 a').first();
    const title = cleanText(titleLink.text()) || cleanText(coverLink.attr('aria-label')) || mangaId;

    const image = imgUrl(coverLink.find('img').first());
    if (!image) return;

    results.push({
      mangaId,
      title,
      image,
      referer: IMAGE_REFERER,
      webURL: `${SITE_BASE}/seri/${mangaId}/`,
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
      $('#mgcr-modern-header-categories a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/seri-turleri\/([^/?#]+)\/?/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('TilkiScans getSearchTags failed: ' + (e && e.message));
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
      const params = qs({ s: query, post_type: 'wp-manga' });
      url = page > 1 ? `${SITE_BASE}/page/${page}/?${params}` : `${SITE_BASE}/?${params}`;
    } else {
      const params = qs({
        m_orderby: feed,
        'mgcr_genre[]': includedTags[0] && includedTags[0].id,
      });
      url = page > 1 ? `${SITE_BASE}/manga/page/${page}/?${params}` : `${SITE_BASE}/manga/?${params}`;
    }

    const html = await this.requestArchiveHTML(url);
    const $ = cheerio.load(html);
    const results = parseArchiveCards($);

    return {
      results,
      metadata: results.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/seri/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('#mgcr-series-title').first().text()) || mangaId;

    const ogImage = (($('meta[property="og:image"]').attr('content') || '')).trim();
    const image = imgUrl($('.mgcr-modern-card__cover img').first()) || ogImage;

    const status = mapStatus(cardFact($, 'Durum'));

    const descParts = [];
    $('.summary__content p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0 ? descParts.join(' ') : cleanText($('.summary__content').first().text());

    const tags = [];
    $('.mgcr-modern-card__genres a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    return {
      mangaInfo: {
        title,
        image,
        referer: IMAGE_REFERER,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/seri/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('li.wp-manga-chapter').each((_, el) => {
      const link = chapterTextLink($, el);
      if (!link) return;

      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText(link.text());
      const dateSpan = $(el).find('.chapter-release-date').first();
      let dateText = dateSpan.find('i').first().text();
      if (!cleanText(dateText)) {
        dateText = dateSpan.find('[title]').first().attr('title') || '';
      }
      const time = parseChapterDate(dateText);

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
    const url = `${SITE_BASE}/seri/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.wp-manga-chapter-img').each((_, el) => {
      const $img = $(el);
      const src = imgUrl($img);
      if (!src) return;

      const w = parseInt($img.attr('width') || '', 10);
      const h = parseInt($img.attr('height') || '', 10);
      if (Number.isFinite(w) && Number.isFinite(h) && w >= h) return;

      pages.push(src);
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

  async requestArchiveHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA },
    });
    const response = await manager.schedule(request);
    return response.data;
  }
}

module.exports = { Source };
