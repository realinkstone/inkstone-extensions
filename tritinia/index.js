const SITE_BASE = 'https://tritinia.org';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 12;

const MONTHS_FULL = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
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
  const mon = MONTHS_FULL[m[1].toLowerCase()];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return Date.UTC(year, mon, day);
}

function parseChapterNumber(name) {
  const match = (name || '').match(/(?:ch(?:apter)?\.?\s*)?([\d.]+)/i);
  return match ? parseFloat(match[1]) : 0;
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractChapterId(href, mangaId) {
  const marker = `/manga/${mangaId}/`;
  const idx = (href || '').indexOf(marker);
  if (idx === -1) return '';
  return href.slice(idx + marker.length).replace(/\/+$/, '');
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

function parseMangaListPage($) {
  const results = [];
  $('.page-item-detail.manga').each((_, el) => {
    const card = $(el);
    const link = card.find('.item-thumb a').first();
    const href = link.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const titleLink = card.find('.post-title a').first();
    const title = cleanText(titleLink.text()) || cleanText(link.attr('title'));
    if (!title) return;

    const img = link.find('img').first();
    const image = (img.attr('data-src') || img.attr('src') || '').trim();
    if (!image) return;

    const badgeText = cleanText(card.find('.post-title .manga-title-badges').first().text());

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    };
    if (badgeText.toLowerCase() === 'completed') manga.completed = true;
    results.push(manga);
  });
  return results;
}

function parseSearchResultsPage($) {
  const results = [];
  $('.c-tabs-item__content').each((_, el) => {
    const card = $(el);
    const link = card.find('.tab-thumb a').first();
    const href = link.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const titleLink = card.find('.post-title a').first();
    const title = cleanText(titleLink.text());
    if (!title) return;

    const img = link.find('img').first();
    const image = (img.attr('data-src') || img.attr('src') || '').trim();
    if (!image) return;

    const author = cleanText(card.find('.post-content_item.mg_author .summary-content').first().text());

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    };
    if (author) manga.author = author;
    results.push(manga);
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
      const html = await this.requestHTML(`${SITE_BASE}/?s=&post_type=wp-manga`);
      const $ = cheerio.load(html);
      const tags = [];
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        if (!id) return;
        const label = cleanText($(`label[for="${id}"]`).first().text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Tritinia getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;

    let url;
    let parse;
    if (query || includedTags.length > 0) {
      const path = page > 1 ? `/page/${page}/` : '/';
      let qs = `s=${encodeURIComponent(query)}&post_type=wp-manga`;
      for (const tag of includedTags) {
        if (tag && tag.id) qs += `&genre[]=${encodeURIComponent(tag.id)}`;
      }
      url = `${SITE_BASE}${path}?${qs}`;
      parse = parseSearchResultsPage;
    } else {
      const path = page > 1 ? `/manga/page/${page}/` : '/manga/';
      url = `${SITE_BASE}${path}?m_orderby=${encodeURIComponent(feed)}`;
      parse = parseMangaListPage;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parse($);
    const hasNext = results.length >= PAGE_SIZE;

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.post-title h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const summaryImg = $('.summary_image img').first();
    const image = (ogImage || summaryImg.attr('data-src') || summaryImg.attr('src') || '').trim();

    const author = fieldText($, 'Author(s)');
    const artist = fieldText($, 'Artist(s)');
    const authorCombined = [author, artist].filter(Boolean).join(', ');

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
        author: authorCombined,
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
      const chapterId = extractChapterId(href, mangaId);
      if (!chapterId) return;

      const name = cleanText(link.text());
      const dateText = $el.find('.chapter-release-date i').first().text().trim();
      const time = dateText ? parseReleaseDate(dateText) : undefined;

      raw.push({ chapterId, name, time, number: parseChapterNumber(name) });
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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${chapterId}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.reading-content img').each((_, el) => {
      const src = ($(el).attr('src') || $(el).attr('data-src') || '').trim();
      if (/^https:\/\/tritinia\.org\/wp-content\/uploads\//.test(src)) pages.push(src);
    });

    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url, method = 'GET') {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method,
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
