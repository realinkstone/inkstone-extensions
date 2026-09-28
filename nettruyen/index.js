const SITE_BASE = 'https://nettruyenvia.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('hoàn thành')) return 'COMPLETED';
  if (s.includes('tiến hành') || s.includes('cập nhật')) return 'ONGOING';
  return 'UNKNOWN';
}

function cleanAuthor(text) {
  const t = cleanText(text);
  if (!t || t.toLowerCase() === 'đang cập nhật') return undefined;
  return t;
}

function parseRelativeTimeVi(text) {
  const m = (text || '').trim().toLowerCase().match(/^(\d+)\s*(phút|giờ|ngày|tháng|năm)/);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unitMs = {
    phút: 60 * 1000,
    giờ: 60 * 60 * 1000,
    ngày: 24 * 60 * 60 * 1000,
    tháng: 30 * 24 * 60 * 60 * 1000,
    năm: 365 * 24 * 60 * 60 * 1000,
  };
  const ms = unitMs[m[2]];
  if (ms === undefined) return undefined;
  return Date.now() - n * ms;
}

function extractMangaId(href) {
  const m = (href || '').match(/\/truyen-tranh\/([^/?#]+)/);
  return m ? m[1] : '';
}

function lastPathSegment(href) {
  const clean = (href || '').split('?')[0].split('#')[0];
  const parts = clean.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function chapterSlugToNumber(chapterId) {
  const m = (chapterId || '').match(/^chuong-([\d.]+)$/);
  return m ? parseFloat(m[1]) || 0 : 0;
}

function readInfoRows($) {
  const rows = {};
  $('.list-info > li').each((_, el) => {
    const $el = $(el);
    const label = cleanText($el.find('.name').first().text());
    const value = $el.find('.col-xs-8').first();
    if (label && value.length > 0) rows[label] = value;
  });
  return rows;
}

function rowText(rows, label) {
  return rows[label] ? cleanText(rows[label].text()) : '';
}

function extractDescription($) {
  let desc = '';
  $('.shortened > div').each((_, el) => {
    const t = cleanText($(el).text());
    if (/^tóm tắt nội dung/i.test(t)) {
      desc = cleanText($(el).next().text());
      return false;
    }
  });
  if (!desc) desc = cleanText($('.shortened').first().text());
  return desc;
}

function parseMangaList($) {
  const results = [];
  $('.items .row > .item').each((_, el) => {
    const item = $(el);
    const titleLink = item.find('figcaption h3 a').first();
    const href = titleLink.attr('href') || item.find('.image a').first().attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(titleLink.text()) || mangaId;
    const img = item.find('.image img').first();
    const image = (img.attr('data-original') || img.attr('src') || '').trim();

    results.push({
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/truyen-tranh/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($) {
  return $('.pagination-outter a[rel="next"]').length > 0;
}

function buildListingURL({ genreId, query, feed, page }) {
  let path = `${SITE_BASE}/tim-truyen`;
  if (genreId) path += `/${encodeURIComponent(genreId)}`;

  const params = [];
  if (query) params.push(`keyword=${encodeURIComponent(query)}`);
  if (feed) params.push(`sort=${encodeURIComponent(feed)}`);
  if (page && page > 1) params.push(`page=${page}`);

  return params.length > 0 ? `${path}?${params.join('&')}` : path;
}

class Source {
  getSourceFeeds() {
    return [
      { id: '', name: 'Latest Updated' },
      { id: '15', name: 'New Manga' },
      { id: '13', name: 'Top Today' },
      { id: '12', name: 'Top This Week' },
      { id: '11', name: 'Top This Month' },
      { id: '10', name: 'Most Viewed' },
      { id: '20', name: 'Most Followed' },
      { id: '30', name: 'Most Chapters' },
    ];
  }

  async getSearchTags() {
    return [
      { id: 'action-95', label: 'Action' },
      { id: 'adventure', label: 'Adventure' },
      { id: 'anime', label: 'Anime' },
      { id: 'chuyen-sinh-2130', label: 'Chuyển Sinh' },
      { id: 'comedy-99', label: 'Comedy' },
      { id: 'comic', label: 'Comic' },
      { id: 'cooking', label: 'Cooking' },
      { id: 'co-dai-207', label: 'Cổ Đại' },
      { id: 'doujinshi', label: 'Doujinshi' },
      { id: 'drama-103', label: 'Drama' },
      { id: 'dam-my', label: 'Đam Mỹ' },
      { id: 'fantasy-105', label: 'Fantasy' },
      { id: 'gender-bender', label: 'Gender Bender' },
      { id: 'historical', label: 'Historical' },
      { id: 'horror', label: 'Horror' },
      { id: 'live-action', label: 'Live action' },
      { id: 'manga-112', label: 'Manga' },
      { id: 'manhua', label: 'Manhua' },
      { id: 'manhwa-11400', label: 'Manhwa' },
      { id: 'martial-arts', label: 'Martial Arts' },
      { id: 'mecha-117', label: 'Mecha' },
      { id: 'mystery', label: 'Mystery' },
      { id: 'ngon-tinh', label: 'Ngôn Tình' },
      { id: 'psychological', label: 'Psychological' },
      { id: 'romance-121', label: 'Romance' },
      { id: 'school-life', label: 'School Life' },
      { id: 'sci-fi', label: 'Sci-fi' },
      { id: 'shoujo', label: 'Shoujo' },
      { id: 'shoujo-ai-126', label: 'Shoujo Ai' },
      { id: 'shounen-127', label: 'Shounen' },
      { id: 'shounen-ai', label: 'Shounen Ai' },
      { id: 'slice-of-life', label: 'Slice of Life' },
      { id: 'sports', label: 'Sports' },
      { id: 'supernatural', label: 'Supernatural' },
      { id: 'thieu-nhi', label: 'Thiếu Nhi' },
      { id: 'tragedy-136', label: 'Tragedy' },
      { id: 'trinh-tham', label: 'Trinh Thám' },
      { id: 'truyen-scan', label: 'Truyện scan' },
      { id: 'truyen-mau', label: 'Truyện Màu' },
      { id: 'webtoon', label: 'Webtoon' },
      { id: 'xuyen-khong-205', label: 'Xuyên Không' },
      { id: 'tu-tien', label: 'Tu Tiên' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || '';
    const includedTags = (request && request.includedTags) || [];
    const genreId = includedTags.length > 0 && includedTags[0] ? includedTags[0].id : '';

    const url = buildListingURL({ genreId, query, feed, page });
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);
    const hasNext = results.length > 0 && hasNextPage($);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.title-detail').first().text()) || mangaId;

    const coverImg = $('.detail-info .col-image img').first();
    const image = (coverImg.attr('src') || coverImg.attr('data-src') || coverImg.attr('data-retries') || '').trim();

    const rows = readInfoRows($);
    const author = cleanAuthor(rowText(rows, 'Tác giả'));

    const tags = [];
    if (rows['Thể loại']) {
      rows['Thể loại'].find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(t);
      });
    }

    const status = mapStatus(rowText(rows, 'Tình trạng'));
    const desc = extractDescription($);

    const releaseYear = rowText(rows, 'Năm phát hành');
    const releaseDate = /^\d{4}$/.test(releaseYear) ? releaseYear : undefined;

    const ageText = rowText(rows, 'Độ tuổi');
    const ageMatch = ageText.match(/^(\d+)/);
    const ageRating = ageMatch ? parseInt(ageMatch[1], 10) : undefined;

    const viewsText = rowText(rows, 'Lượt xem').replace(/\./g, '');
    const views = /^\d+$/.test(viewsText) ? parseInt(viewsText, 10) : undefined;

    const ratingText = cleanText($('[itemprop="ratingValue"]').first().text());
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE,
        author,
        desc,
        status,
        tags,
        releaseDate,
        ageRating,
        views,
        rating,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const rows = readInfoRows($);
    const group = rowText(rows, 'Chuyển ngữ') || undefined;

    const raw = [];
    $('#chapter_list > li.row').each((_, el) => {
      const item = $(el);
      const link = item.find('.chapter a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText(link.text());
      const dateText = cleanText(item.children().eq(1).text());
      const time = parseRelativeTimeVi(dateText);

      raw.push({ chapterId, name, time, number: chapterSlugToNumber(chapterId) });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) chapter.time = r.time;
      if (group) chapter.group = group;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.reading-detail .page-chapter img.lozad').each((_, el) => {
      const src = ($(el).attr('data-src') || '').trim();
      if (src.includes('kcgsbok.com')) pages.push(src);
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
