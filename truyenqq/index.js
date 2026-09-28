const SITE_BASE = 'https://truyenqqko.com';
const IMAGE_REFERER = `${SITE_BASE}/`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEED_PATHS = {
  latest: '/truyen-moi-cap-nhat',
  new: '/truyen-tranh-moi',
  completed: '/truyen-hoan-thanh',
  topDay: '/top-ngay',
  topWeek: '/top-tuan',
  topMonth: '/top-thang',
  favorites: '/truyen-yeu-thich',
  random: '/truyen-ngau-nhien',
};

const FEED_PAGE_QUERY = {
  completed: '?status=2',
};

const GENRE_LABEL_TRANSLATIONS = {
  'Chuyển Sinh': 'Reincarnation',
  'Cổ Đại': 'Ancient',
  'Huyền Huyễn': 'Xianxia',
  'Ngôn Tình': 'Romance Novel',
  'Trọng Sinh': 'Rebirth',
  'Truyện Màu': 'Full Color',
  'Xuyên Không': 'Time Travel',
  'Đam Mỹ': "Boys' Love",
};

function translateGenreLabel(label) {
  return GENRE_LABEL_TRANSLATIONS[label] || label;
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('hoàn thành') || s.includes('full')) return 'COMPLETED';
  if (s.includes('đang')) return 'ONGOING';
  if (s.includes('tạm ngưng') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('ngừng') || s.includes('drop') || s.includes('hủy')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseAgeRating(text) {
  const m = (text || '').match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseVNDate(text) {
  const m = (text || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  return Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

function extractMangaId(href) {
  const m = (href || '').match(/\/truyen-tranh\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractGenreId(href) {
  const m = (href || '').match(/\/the-loai\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractChapterId(href, mangaId) {
  const prefix = `/truyen-tranh/${mangaId}-chap-`;
  const idx = (href || '').indexOf(prefix);
  if (idx === -1) return '';
  return 'chap-' + href.slice(idx + prefix.length).split(/[/?#]/)[0];
}

function parseChapterNumber(chapterId) {
  const m = (chapterId || '').match(/^chap-(\d+)(?:-(\d+))?$/);
  if (!m) return 0;
  return m[2] !== undefined ? parseFloat(`${m[1]}.${m[2]}`) : parseFloat(m[1]);
}

function extractJsonLd($, type) {
  let result = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    const text = $(el).html() || $(el).text() || '';
    try {
      const data = JSON.parse(text);
      if (data && data['@type'] === type) result = data;
    } catch (e) {
    }
  });
  return result;
}

function parseMangaList($) {
  const results = [];
  $('ul.list_grid.grid > li').each((_, el) => {
    const card = $(el);
    const link = card.find('.book_avatar a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;

    const title = cleanText(card.find('.book_name a').first().text()) || mangaId;
    const image = (card.find('.book_avatar img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      referer: IMAGE_REFERER,
      webURL: `${SITE_BASE}/truyen-tranh/${mangaId}`,
      medium: 'comics',
    };

    const tags = [];
    card.find('.list-tags p').each((_, p) => {
      const t = cleanText($(p).text());
      if (t) tags.push(translateGenreLabel(t));
    });
    if (tags.length > 0) manga.tags = tags;

    let statusText = '';
    card.find('.more-info p.info').each((_, p) => {
      const t = cleanText($(p).text());
      const m = t.match(/^Tình trạng:\s*(.*)$/);
      if (m) statusText = m[1];
    });
    if (mapStatus(statusText) === 'COMPLETED') manga.completed = true;

    results.push(manga);
  });
  return results;
}

function hasNextPage($, currentPage) {
  const target = new RegExp(`/trang-${currentPage + 1}(?:[/?]|$)`);
  let found = false;
  $('.page_redirect a').each((_, a) => {
    if (found) return;
    if (target.test($(a).attr('href') || '')) found = true;
  });
  return found;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'new', name: 'New' },
      { id: 'completed', name: 'Completed' },
      { id: 'topDay', name: 'Top Day' },
      { id: 'topWeek', name: 'Top Week' },
      { id: 'topMonth', name: 'Top Month' },
      { id: 'favorites', name: 'Most Favorited' },
      { id: 'random', name: 'Random' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('.book_tags_content a[title]').each((_, el) => {
        const id = extractGenreId($(el).attr('href'));
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).attr('title'));
        if (label) tags.push({ id, label: translateGenreLabel(label) });
      });
      return tags;
    } catch (e) {
      console.error('TruyenQQ getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];

    let basePath;
    let extraQuery = '';
    if (query) {
      basePath = '/tim-kiem';
      extraQuery = `q=${encodeURIComponent(query)}`;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      basePath = `/the-loai/${encodeURIComponent(includedTags[0].id)}`;
    } else {
      basePath = FEED_PATHS[feed] || FEED_PATHS.latest;
      if (FEED_PAGE_QUERY[feed]) extraQuery = FEED_PAGE_QUERY[feed].replace(/^\?/, '');
    }

    const path = page > 1 ? `${basePath}/trang-${page}` : basePath;
    const url = extraQuery ? `${SITE_BASE}${path}?${extraQuery}` : `${SITE_BASE}${path}`;

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);
    const hasNext = basePath !== FEED_PATHS.random && results.length > 0 && hasNextPage($, page);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const ld = extractJsonLd($, 'ComicSeries');

    const title = cleanText((ld && ld.name) || $('h1[itemprop="name"]').first().text()) || mangaId;

    const image = (
      (ld && ld.image) ||
      $('.book_avatar[itemtype="https://schema.org/ImageObject"] img').first().attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      ''
    ).trim();

    const author = ld && ld.author && ld.author.name ? cleanText(ld.author.name) : undefined;

    let tags = [];
    if (ld && Array.isArray(ld.genre)) {
      tags = ld.genre.map((g) => translateGenreLabel(cleanText(g))).filter(Boolean);
    } else {
      $('ul.list01 a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(translateGenreLabel(t));
      });
    }

    const status = mapStatus((ld && ld.creativeWorkStatus) || $('li.status .col-xs-9').first().text());
    const ageRatingText = (ld && ld.typicalAgeRange) || $('.fa-child').closest('li').find('.col-xs-9').first().text();
    const ageRating = parseAgeRating(ageRatingText);

    const descBlock = $('.story-detail-info.detail-content').first();
    const descClone = descBlock.clone();
    descClone.find('br').replaceWith(' ');
    const desc = cleanText(descClone.text());

    const mangaInfo = {
      title,
      image,
      referer: IMAGE_REFERER,
      author,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (ageRating !== undefined) mangaInfo.ageRating = ageRating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('.works-chapter-item').each((_, el) => {
      const item = $(el);
      const link = item.find('.name-chap a').first();
      const href = link.attr('href') || '';
      const chapterId = extractChapterId(href, mangaId);
      if (!chapterId) return;

      const name = cleanText(link.text());
      const dateText = cleanText(item.find('.time-chap').first().text());
      const time = parseVNDate(dateText);

      raw.push({ chapterId, name, time, number: parseChapterNumber(chapterId) });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/truyen-tranh/${encodeURIComponent(mangaId)}-${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.page-chapter img').each((_, el) => {
      const $el = $(el);
      const src = ($el.attr('data-original') || $el.attr('src') || '').trim();
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
}

module.exports = { Source };
