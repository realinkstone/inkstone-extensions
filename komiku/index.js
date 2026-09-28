const SITE_BASE = 'https://komiku.org';
const API_BASE = 'https://api.komiku.org';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 10;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function parseChapterNumber(name) {
  const m = (name || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseChapterDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  return Date.UTC(year, month, day);
}

function parseAgeRating(text) {
  const m = (text || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseViews(text) {
  const m = (text || '').match(/Total:\s*(\d+)/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? undefined : n;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseBgeCards($) {
  const results = [];
  $('.bge').each((_, el) => {
    const card = $(el);
    const link = card.find('.bgei a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;

    const title = cleanText(card.find('.kan h3').first().text());
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

function findTableValue($, label) {
  let found = null;
  $('.inftable tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 2) return;
    const key = cleanText($(tds[0]).text()).replace(/:$/, '');
    if (key === label) {
      found = $(tds[1]);
      return false;
    }
  });
  return found;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'new', name: 'New' },
      { id: 'popular', name: 'Popular' },
      { id: 'manga', name: 'Manga' },
      { id: 'manhwa', name: 'Manhwa' },
      { id: 'manhua', name: 'Manhua' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/pustaka/`);
      const $ = cheerio.load(html);
      const tags = [];
      $('select[name="genre"] option[value]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        if (!id) return;
        const label = cleanText($(el).text()).replace(/\s*\([\d.,]+\)\s*$/, '');
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Komiku getSearchTags failed: ' + (e && e.message));
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

    let basePath;
    let extraQuery;
    if (query) {
      basePath = '/';
      extraQuery = `post_type=manga&s=${encodeURIComponent(query)}`;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      basePath = `/genre/${encodeURIComponent(includedTags[0].id)}/`;
      extraQuery = undefined;
    } else if (feed === 'popular') {
      basePath = '/other/hot/';
      extraQuery = undefined;
    } else if (feed === 'new') {
      basePath = '/manga/';
      extraQuery = 'orderby=date';
    } else if (feed === 'manga' || feed === 'manhwa' || feed === 'manhua') {
      basePath = '/manga/';
      extraQuery = `tipe=${feed}`;
    } else {
      basePath = '/manga/';
      extraQuery = undefined;
    }

    const path = page > 1 ? `${basePath}page/${page}/` : basePath;
    const url = extraQuery ? `${API_BASE}${path}?${extraQuery}` : `${API_BASE}${path}`;

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseBgeCards($);

    return {
      results,
      metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleCell = findTableValue($, 'Judul');
    const title = (titleCell ? cleanText(titleCell.text()) : '') || mangaId;

    const image = ($('.ims img').first().attr('src') || '').trim();

    const authorCell = findTableValue($, 'Author');
    const author = authorCell ? cleanText(authorCell.text()) : undefined;

    const statusCell = findTableValue($, 'Status');
    const status = mapStatus(statusCell ? statusCell.text() : '');

    const ratingCell = findTableValue($, 'Rating');
    const ageRating = ratingCell ? parseAgeRating(ratingCell.text()) : undefined;

    const readersCell = findTableValue($, 'Pembaca');
    const views = readersCell ? parseViews(readersCell.text()) : undefined;

    const tags = [];
    const genreCell = findTableValue($, 'Genre');
    if (genreCell) {
      genreCell.find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(t);
      });
    }

    const desc = cleanText($('.desc[itemprop="description"]').first().text());

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
    if (ageRating !== undefined) mangaInfo.ageRating = ageRating;
    if (views !== undefined) mangaInfo.views = views;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#daftarChapter tr[itemprop="itemListElement"]').each((_, tr) => {
      const $tr = $(tr);
      const link = $tr.find('td.judulseries a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText(link.text());
      const dateText = $tr.find('td.tanggalseries').first().text();
      const time = parseChapterDate(dateText);

      raw.push({ chapterId, name, number: parseChapterNumber(name), time });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('#Baca_Komik img.ww').each((_, img) => {
      const src = ($(img).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
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
