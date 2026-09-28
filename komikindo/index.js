const SITE_BASE = 'https://komikindo.ch';
const BROWSE_URL = `${SITE_BASE}/daftar-manga/`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/komik\/([^/?#]+)\/?$/);
  return m ? m[1] : '';
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function parseChapterNumber(text) {
  const cleaned = (text || '').replace(/end/i, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const ID_UNIT_MS = {
  detik: 1000,
  menit: 60000,
  jam: 3600000,
  hari: 86400000,
  minggu: 604800000,
  bulan: 2592000000,
  tahun: 31536000000,
};
function parseRelativeDate(text) {
  if (!text) return undefined;
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(\d+)\s+(detik|menit|jam|hari|minggu|bulan|tahun)(?:\s+yang)?\s+lalu$/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unitMs = ID_UNIT_MS[m[2]];
  if (!unitMs) return undefined;
  return Date.now() - n * unitMs;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('berjalan') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('tamat') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('batal') || s.includes('cancel') || s.includes('drop')) return 'CANCELLED';
  return 'UNKNOWN';
}

function fieldText($, label) {
  let result = '';
  $('.infox .spe > span').each((_, el) => {
    const b = $(el).find('b').first();
    const bLabel = cleanText(b.text()).replace(/:\s*$/, '');
    if (bLabel === label) {
      const clone = $(el).clone();
      clone.find('b').remove();
      result = cleanText(clone.text());
      return false;
    }
  });
  return result;
}

function parseListingCards($) {
  const results = [];
  $('.animepost').each((_, el) => {
    const card = $(el);
    const titleLink = card.find('.bigors .tt h3 a').first();
    const href = titleLink.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(titleLink.text()) || mangaId;
    const image = (card.find('.animposx .limit img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/komik/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    };

    const ratingText = cleanText(card.find('.rating i').first().text());
    const rating = parseFloat(ratingText);
    if (Number.isFinite(rating)) manga.rating = rating;

    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'update', name: 'Latest Update' },
      { id: 'latest', name: 'Latest Added' },
      { id: 'popular', name: 'Popular' },
      { id: 'title', name: 'A-Z' },
      { id: 'titlereverse', name: 'Z-A' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(BROWSE_URL);
      const $ = cheerio.load(html);

      const genre = [];
      $('input[name="genre[]"]').each((_, el) => {
        const value = ($(el).attr('value') || '').trim();
        const label = cleanText($(el).next('label').text());
        if (value && label) genre.push({ id: `genre:${value}`, label });
      });

      const tema = [];
      $('input[name="tema[]"]').each((_, el) => {
        const value = ($(el).attr('value') || '').trim();
        const label = cleanText($(el).next('label').text());
        if (value && label) tema.push({ id: `tema:${value}`, label });
      });

      const groups = [];
      if (genre.length > 0) groups.push({ id: 'genre', title: 'Genre', tags: genre });
      if (tema.length > 0) groups.push({ id: 'tema', title: 'Tema', tags: tema });
      return groups;
    } catch (e) {
      console.error('Komikindo getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const feed = (request && request.feed) || 'update';
    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];

    const params = [`order=${encodeURIComponent(feed)}`];
    if (query) params.push(`title=${encodeURIComponent(query)}`);

    includedTags.forEach((t) => {
      const id = t && t.id;
      if (typeof id !== 'string') return;
      if (id.indexOf('genre:') === 0) {
        params.push(`genre[]=${encodeURIComponent(id.slice(6))}`);
      } else if (id.indexOf('tema:') === 0) {
        params.push(`tema[]=${encodeURIComponent(id.slice(5))}`);
      }
    });

    const path = page > 1 ? `${BROWSE_URL}page/${page}/` : BROWSE_URL;
    const url = `${path}?${params.join('&')}`;

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseListingCards($);
    const hasNext = $('a.next.page-numbers').length > 0;

    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/komik/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const rawTitle = cleanText($('h1.entry-title').first().text());
    const title = rawTitle.replace(/^Komik\s+/, '') || rawTitle || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const thumbImage = $('.thumb img').first().attr('src');
    const image = (ogImage || thumbImage || '').trim();

    const writer = fieldText($, 'Pengarang');
    const artist = fieldText($, 'Ilustrator');
    const author = [writer, artist].filter(Boolean).join(', ');

    const status = mapStatus(fieldText($, 'Status'));

    const descParts = [];
    $('.entry-content-single p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0 ? descParts.join(' ') : cleanText($('.entry-content-single').text());

    const tags = [];
    $('.genre-info a[rel="tag"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

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

    const ratingText = cleanText($('.ratingmanga [itemprop="ratingValue"]').first().text());
    const rating = parseFloat(ratingText);
    if (Number.isFinite(rating)) mangaInfo.rating = rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/komik/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapter_list ul li').each((_, el) => {
      const item = $(el);
      const link = item.find('.lchx a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const numText = link.find('chapter').text().trim();
      const number = parseChapterNumber(numText);
      const name = cleanText(link.text()) || `Chapter ${number}`;
      const dateText = cleanText(item.find('.dt a').first().text());
      const time = parseRelativeDate(dateText);

      raw.push({ chapterId, name, number, time });
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
    $('#Baca_Komik img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (src && /\/data\/\d+\/[^/]+\//.test(src)) pages.push(src);
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
