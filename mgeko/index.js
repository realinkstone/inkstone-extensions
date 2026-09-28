const SITE_BASE = 'https://www.mgeko.cc';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const SORT_FEEDS = [
  { id: 'latest', name: 'Latest Update' },
  { id: 'recently_added', name: 'Recently Added' },
  { id: 'popular_daily', name: 'Popular Daily' },
  { id: 'popular_weekly', name: 'Popular Weekly' },
  { id: 'popular_monthly', name: 'Popular Monthly' },
  { id: 'popular_all_time', name: 'Popular All Time' },
  { id: 'rating', name: 'Top Rated' },
  { id: 'az', name: 'Title A-Z' },
  { id: 'za', name: 'Title Z-A' },
];

const MONTHS_AP = {
  jan: 0, feb: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, aug: 7, sept: 8, sep: 8, oct: 9, nov: 10, dec: 11,
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
  const m = text
    .trim()
    .match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.)$/i);
  if (!m) return undefined;
  const month = MONTHS_AP[m[1].toLowerCase()];
  if (month === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  const ampm = m[6].toLowerCase();
  if (ampm === 'p.m.' && hour !== 12) hour += 12;
  if (ampm === 'a.m.' && hour === 12) hour = 0;
  return Date.UTC(year, month, day, hour, minute);
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function parseComicCards($) {
  const results = [];
  $('.comic-card').each((_, el) => {
    const card = $(el);
    const href = card.find('.comic-card__cover a').first().attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(card.find('.comic-card__title a').first().text());
    if (!title) return;

    const image = (card.find('.comic-card__cover img').first().attr('src') || '').trim();
    if (!image) return;

    const badge = cleanText(card.find('.comic-card__badge').first().text());
    const ratingText = card.find('.comic-card__stat--rating').first().text();
    const ratingMatch = ratingText.match(/[\d.]+/);

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    };
    if (badge.toLowerCase() === 'completed') manga.completed = true;
    if (ratingMatch) manga.rating = parseFloat(ratingMatch[0]);
    results.push(manga);
  });
  return results;
}

function extractDesc($) {
  const box = $('p.description').first();
  if (!box.length) return '';
  const clone = box.clone();
  clone.find('br').replaceWith('\n');
  const raw = clone.text();
  const marker = raw.search(/the summary is\s*/i);
  const body = marker >= 0 ? raw.slice(marker).replace(/the summary is\s*/i, '') : raw;
  return body.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function findStatusText($) {
  let text = '';
  $('.header-stats span').each((_, el) => {
    const label = cleanText($(el).find('small').text()).toLowerCase();
    if (label === 'status') {
      text = cleanText($(el).find('strong').first().text());
    }
  });
  return text;
}

class Source {
  getSourceFeeds() {
    return SORT_FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/browse-comics/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('.chip[data-group="include_genres"]').each((_, el) => {
        const id = ($(el).attr('data-value') || '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MGeko getSearchTags failed: ' + (e && e.message));
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
    const excludedTags = (request && request.excludedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url = `${SITE_BASE}/browse-comics/data/?sort=${encodeURIComponent(feed)}&page=${page}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (includedTags.length > 0) {
      const ids = includedTags.map((t) => t && t.id).filter(Boolean);
      if (ids.length > 0) url += `&include_genres=${encodeURIComponent(ids.join(','))}`;
    }
    if (excludedTags.length > 0) {
      const ids = excludedTags.map((t) => t && t.id).filter(Boolean);
      if (ids.length > 0) url += `&exclude_genres=${encodeURIComponent(ids.join(','))}`;
    }

    const json = await this.requestJSON(url);
    const $ = cheerio.load(json.results_html || '');
    const results = parseComicCards($);
    const currentPage = typeof json.page === 'number' ? json.page : page;
    const numPages = typeof json.num_pages === 'number' ? json.num_pages : currentPage;
    const hasNext = results.length > 0 && currentPage < numPages;

    return {
      results,
      metadata: hasNext ? { page: currentPage + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1.novel-title').first().text()) || mangaId;

    const coverImg = $('.fixed-img img').first();
    const image = (coverImg.attr('data-src') || coverImg.attr('src') || '').trim();

    const authorRaw = cleanText($('.author .property-item span[itemprop="author"]').first().text());
    const author = authorRaw
      ? authorRaw.split(';').map((s) => s.trim()).filter(Boolean).join(', ')
      : '';

    const status = mapStatus(findStatusText($));
    const desc = extractDesc($);

    const tags = [];
    $('.categories ul li a.property-item').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/all-chapters/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('ul.chapter-list li').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText($el.find('.chapter-title').first().text());
      const dateText = $el.find('.chapter-update').first().attr('datetime') || '';
      const time = parseChapterDate(dateText);

      raw.push({ chapterId, name, time });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = parseFloat(r.name) || 0;
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
    const url = `${SITE_BASE}/reader/en/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('#chapter-reader img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (!/^https?:\/\//.test(src)) return;
      if (src.includes('credits-mgeko')) return;
      pages.push(src);
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

  async requestJSON(url) {
    const text = await this.requestHTML(url);
    return JSON.parse(text);
  }
}

module.exports = { Source };
