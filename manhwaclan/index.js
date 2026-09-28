const SITE_BASE = 'https://manhwaclan.com';
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

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
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

function parseArchiveCards($) {
  const results = [];
  $('.page-item-detail.manga').each((_, el) => {
    const card = $(el);
    const link = card.find('.item-thumb a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;

    const image = (link.find('img').first().attr('src') || '').trim();
    if (!image) return;

    const title =
      cleanText(card.find('.item-summary .post-title a').first().text()) ||
      (link.attr('title') || '').trim();
    if (!title) return;

    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    });
  });
  return results;
}

function parseSearchTabCards($) {
  const results = [];
  $('.tab-content-wrap .row.c-tabs-item__content').each((_, el) => {
    const card = $(el);
    const thumbLink = card.find('.tab-thumb a').first();
    const mangaId = extractMangaId(thumbLink.attr('href'));
    if (!mangaId) return;

    const image = (card.find('.tab-thumb img').first().attr('src') || '').trim();
    if (!image) return;

    const title =
      cleanText(card.find('.tab-summary .post-title a').first().text()) ||
      (thumbLink.attr('title') || '').trim();
    if (!title) return;

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    };

    const statusText = cleanText(
      card.find('.post-content_item.mg_status .summary-content').first().text()
    );
    if (statusText.toLowerCase().includes('complet')) manga.completed = true;

    const author = cleanText(
      card.find('.post-content_item.mg_author .summary-content a').first().text()
    );
    if (author) manga.author = author;

    const tags = [];
    card.find('.post-content_item.mg_genres .summary-content a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });
    if (tags.length > 0) manga.tags = tags;

    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  return $('a.nextpostslink').length > 0;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'alphabet', name: 'A-Z' },
      { id: 'rating', name: 'Rating' },
      { id: 'trending', name: 'Trending' },
      { id: 'views', name: 'Most Views' },
      { id: 'new-manga', name: 'New' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('.sub-nav_list a[href*="/manga-genre/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/manga-genre\/([^/?#]+)/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('ManhwaClan getSearchTags failed: ' + (e && e.message));
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
    const pagePrefix = page > 1 ? `page/${page}/` : '';

    let url;
    let parse;
    if (query) {
      url = `${SITE_BASE}/${pagePrefix}?s=${encodeURIComponent(query)}&post_type=wp-manga&m_orderby=${encodeURIComponent(feed)}`;
      parse = parseSearchTabCards;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      url = `${SITE_BASE}/manga-genre/${encodeURIComponent(includedTags[0].id)}/${pagePrefix}`;
      parse = parseArchiveCards;
    } else {
      url = `${SITE_BASE}/manga/${pagePrefix}?m_orderby=${encodeURIComponent(feed)}`;
      parse = parseArchiveCards;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parse($);
    const hasNext = results.length > 0 && hasNextPage($);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.post-title h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const summaryImage = $('.summary_image img').first().attr('src');
    const image = (ogImage || summaryImage || '').trim();

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
      const src = ($(el).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
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
