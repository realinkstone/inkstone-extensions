const SITE_BASE = 'https://sereinscan.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 10;

const MONTHS_TR = {
  ocak: 0, subat: 1, mart: 2, nisan: 3, mayis: 4, haziran: 5,
  temmuz: 6, agustos: 7, eylul: 8, ekim: 9, kasim: 10, aralik: 11,
};

function foldTurkish(text) {
  return (text || '')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .toLowerCase();
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = foldTurkish(text);
  if (s.includes('ongoing') || s.includes('devam')) return 'ONGOING';
  if (s.includes('complet') || s.includes('tamamlan')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('ara verildi')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('birakildi')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2})\s+([A-Za-zÇĞİıÖŞÜçğiöşü]+)\s+(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS_TR[foldTurkish(m[2])];
  if (mon === undefined) return undefined;
  const day = parseInt(m[1], 10);
  const year = parseInt(m[3], 10);
  return Date.UTC(year, mon, day);
}

function slugToChapterNumber(chapterSlug) {
  const base = (chapterSlug || '').replace(/^bolum-/, '');
  const parts = base.split('-');
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    return parseFloat(parts[0] + '.' + parts[1]);
  }
  return parseFloat(parts[0]) || 0;
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
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

function parseMangaListPage($) {
  const results = [];
  $('.page-item-detail.manga').each((_, el) => {
    const card = $(el);
    const link = card.find('.item-thumb a').first();
    const href = link.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(link.attr('title')) || cleanText(card.find('.post-title a').first().text());
    if (!title) return;

    const image = (link.find('img').first().attr('src') || '').trim();
    if (!image) return;

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

function parseSearchResultsPage($) {
  const results = [];
  $('.row.c-tabs-item__content').each((_, el) => {
    const card = $(el);
    const link = card.find('.tab-thumb a').first();
    const href = link.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(card.find('.post-title a').first().text()) || cleanText(link.attr('title'));
    if (!title) return;

    const image = (link.find('img').first().attr('src') || '').trim();
    if (!image) return;

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
      { id: 'new-manga', name: 'Latest' },
      { id: 'trending', name: 'Trending' },
      { id: 'views', name: 'Most Viewed' },
      { id: 'rating', name: 'Top Rated' },
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
      console.error('Serein Scan getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'new-manga';
    const page = (metadata && metadata.page) || 1;

    let url;
    let parse;
    if (query || includedTags.length > 0) {
      let qs = `s=${encodeURIComponent(query)}&post_type=wp-manga&paged=${page}`;
      for (const tag of includedTags) {
        if (tag && tag.id) qs += `&genre[]=${encodeURIComponent(tag.id)}`;
      }
      url = `${SITE_BASE}/?${qs}`;
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
    const summaryImage = $('.summary_image img').first().attr('src');
    const image = (ogImage || summaryImage || '').trim();

    const writer = fieldText($, 'Author(s)') || fieldText($, 'Yazar(lar)');
    const artist = fieldText($, 'Artist(s)') || fieldText($, 'Çizer(ler)');
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

    const ratingText = cleanText($('#averagerate').first().text());
    const rating = parseFloat(ratingText);

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (author) mangaInfo.author = author;
    if (!Number.isNaN(rating) && rating > 0) mangaInfo.rating = rating;

    return { mangaInfo };
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
      if (src) pages.push(src);
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
