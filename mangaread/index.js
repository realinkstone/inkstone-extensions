const SITE_BASE = 'https://www.mangaread.org';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 12;

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
  const t = text.trim();

  const abs = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (abs) {
    const day = parseInt(abs[1], 10);
    const month = parseInt(abs[2], 10) - 1;
    const year = parseInt(abs[3], 10);
    return Date.UTC(year, month, day);
  }

  const rel = t.toLowerCase().match(/^(\d+)\s*([a-z]+)\s+ago$/);
  if (rel) {
    const unitMs = RELATIVE_UNIT_MS[rel[2]];
    if (unitMs !== undefined) {
      return Date.now() - parseInt(rel[1], 10) * unitMs;
    }
  }

  return undefined;
}

const RELATIVE_UNIT_MS = {
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
};

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
  const m = (href || '').match(/\/manga\/([^/]+)\/?/);
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

    const image = (link.find('img').first().attr('src') || '').trim();
    if (!image) return;

    const badgeText = cleanText(card.find('.manga-title-badges').first().text());

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

    const image = (link.find('img').first().attr('src') || '').trim();
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
      { id: 'alphabet', name: 'A-Z' },
      { id: 'rating', name: 'Rating' },
      { id: 'views', name: 'Most Views' },
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
      console.error('MangaRead getSearchTags failed: ' + (e && e.message));
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

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1) return { results: [], metadata: undefined };
      throw e;
    }

    const $ = cheerio.load(html);
    const results = parse($);
    const hasNext = results.length >= PAGE_SIZE;

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleBlock = $('.post-title').first().clone();
    titleBlock.find('.manga-title-badges').remove();
    const title = cleanText(titleBlock.find('h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const summaryImage = $('.summary_image img').first().attr('src');
    const image = (ogImage || summaryImage || '').trim();

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
      if (src.indexOf('/wp-content/uploads/WP-manga/') !== -1) pages.push(src);
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
