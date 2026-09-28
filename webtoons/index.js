const SITE_BASE = 'https://www.webtoons.com';
const MOBILE_BASE = 'https://m.webtoons.com';
const IMAGE_DOMAIN = 'https://webtoon-phinf.pstatic.net';
const IMAGE_REFERER = 'https://www.webtoons.com/';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const GENRES = [
  { code: 'DRAMA', id: 'drama', seo: 'drama', label: 'Drama' },
  { code: 'FANTASY', id: 'fantasy', seo: 'fantasy', label: 'Fantasy' },
  { code: 'COMEDY', id: 'comedy', seo: 'comedy', label: 'Comedy' },
  { code: 'ACTION', id: 'action', seo: 'action', label: 'Action' },
  { code: 'SLICE_OF_LIFE', id: 'slice_of_life', seo: 'slice-of-life', label: 'Slice of life' },
  { code: 'ROMANCE', id: 'romance', seo: 'romance', label: 'Romance' },
  { code: 'SUPER_HERO', id: 'super_hero', seo: 'super-hero', label: 'Superhero' },
  { code: 'SF', id: 'sf', seo: 'sf', label: 'Sci-fi' },
  { code: 'THRILLER', id: 'thriller', seo: 'thriller', label: 'Thriller' },
  { code: 'SUPERNATURAL', id: 'supernatural', seo: 'supernatural', label: 'Supernatural' },
  { code: 'MYSTERY', id: 'mystery', seo: 'mystery', label: 'Mystery' },
  { code: 'SPORTS', id: 'sports', seo: 'sports', label: 'Sports' },
  { code: 'HISTORICAL', id: 'historical', seo: 'historical', label: 'Historical' },
  { code: 'HEARTWARMING', id: 'heartwarming', seo: 'heartwarming', label: 'Heart-warming' },
  { code: 'HORROR', id: 'horror', seo: 'horror', label: 'Horror' },
  { code: 'GRAPHIC_NOVEL', id: 'graphic_novel', seo: 'graphic-novel', label: 'Graphic Novel' },
  { code: 'TIPTOON', id: 'tiptoon', seo: 'tiptoon', label: 'Informative' },
];

const GENRE_CODE_TO_SEO = {};
GENRES.forEach((g) => {
  GENRE_CODE_TO_SEO[g.code] = g.seo;
});

const WEEKDAYS = [
  { id: 'monday', key: 'MONDAY', name: 'Monday' },
  { id: 'tuesday', key: 'TUESDAY', name: 'Tuesday' },
  { id: 'wednesday', key: 'WEDNESDAY', name: 'Wednesday' },
  { id: 'thursday', key: 'THURSDAY', name: 'Thursday' },
  { id: 'friday', key: 'FRIDAY', name: 'Friday' },
  { id: 'saturday', key: 'SATURDAY', name: 'Saturday' },
  { id: 'sunday', key: 'SUNDAY', name: 'Sunday' },
  { id: 'complete', key: 'COMPLETE', name: 'Complete' },
];

function normalizeWhitespace(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function buildMangaId(genreSeo, titleSlug, titleNo) {
  return `${genreSeo}/${titleSlug}/${titleNo}`;
}

function parseMangaId(mangaId) {
  const parts = (mangaId || '').split('/');
  return { genreSeo: parts[0] || '', titleSlug: parts[1] || '', titleNo: parts[2] || '' };
}

function buildChapterId(episodeNo, episodeSlug) {
  return `${episodeNo}:${episodeSlug}`;
}

function parseChapterId(chapterId) {
  const idx = (chapterId || '').indexOf(':');
  if (idx === -1) return { episodeNo: chapterId, episodeSlug: '' };
  return { episodeNo: chapterId.slice(0, idx), episodeSlug: chapterId.slice(idx + 1) };
}

function parseHrefParts(href) {
  const m = (href || '').match(/\/en\/([a-z0-9-]+)\/([a-z0-9-]+)\/list\?title_no=(\d+)/);
  if (!m) return null;
  return { genreSeo: m[1], titleSlug: m[2], titleNo: m[3] };
}

function absoluteImage(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${IMAGE_DOMAIN}${path}?type=q70`;
}

function parseAbbreviatedCount(text) {
  const t = (text || '').trim().replace(/,/g, '');
  const m = t.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(n * mult);
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  return 'ONGOING';
}

function extractAgeRating(text) {
  const m = (text || '').match(/\((\d+)\+\)/);
  return m ? parseInt(m[1], 10) : undefined;
}

function findLabeledDD($, label) {
  let found = null;
  $('.details_area dt').each((_, dt) => {
    if (found) return;
    if (normalizeWhitespace($(dt).text()) === label) {
      found = $(dt).next('dd');
    }
  });
  return found;
}

function parseGenreListItem(item) {
  const genreSeo = item.representGenreSeoCode || 'drama';
  const titleSlug = item.titleGroupName || '';
  const titleNo = String(item.titleNo);
  return {
    mangaId: buildMangaId(genreSeo, titleSlug, titleNo),
    title: item.title || '',
    image: absoluteImage(item.posterThumbnail),
    referer: IMAGE_REFERER,
    author: item.twoAuthorNames || undefined,
    summary: item.synopsis || undefined,
    webURL: `${SITE_BASE}/en/${genreSeo}/${titleSlug}/list?title_no=${titleNo}`,
    medium: 'comics',
  };
}

function parseSearchItem(item) {
  const genreSeo = GENRE_CODE_TO_SEO[item.representGenre] || 'drama';
  const titleSlug = item.titleGroupName || '';
  const titleNo = String(item.titleNo);
  const authors = [item.writingAuthorName, item.pictureAuthorName].filter(Boolean);
  const uniqueAuthors = authors.filter((a, i) => authors.indexOf(a) === i);
  return {
    mangaId: buildMangaId(genreSeo, titleSlug, titleNo),
    title: item.title || '',
    image: absoluteImage(item.thumbnailMobile),
    referer: IMAGE_REFERER,
    author: uniqueAuthors.join(', ') || undefined,
    views: typeof item.readCount === 'number' ? item.readCount : undefined,
    webURL: `${SITE_BASE}/en/${genreSeo}/${titleSlug}/list?title_no=${titleNo}`,
    medium: 'comics',
  };
}

function parseOriginalsList($, dayKey, markCompleted) {
  const results = [];
  $(`.originals_${dayKey}_list .link._titleItem`).each((_, el) => {
    const $el = $(el);
    const parts = parseHrefParts($el.attr('href'));
    if (!parts) return;

    const title = normalizeWhitespace($el.find('.info_text .title').text());
    const image = ($el.find('img').attr('src') || '').trim();
    if (!title || !image) return;

    const manga = {
      mangaId: buildMangaId(parts.genreSeo, parts.titleSlug, parts.titleNo),
      title,
      image,
      referer: IMAGE_REFERER,
      views: parseAbbreviatedCount($el.find('.info_text .view_count').text()),
      tags: [normalizeWhitespace($el.find('.info_text .genre').text())].filter(Boolean),
      webURL: `${SITE_BASE}/en/${parts.genreSeo}/${parts.titleSlug}/list?title_no=${parts.titleNo}`,
      medium: 'comics',
    };
    if (markCompleted) manga.completed = true;
    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return WEEKDAYS.map((d) => ({ id: d.id, name: d.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSortOptions() {
    return [
      { id: 'MANA', label: 'Popularity' },
      { id: 'LIKEIT', label: 'Likes' },
      { id: 'UPDATE', label: 'Date' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const start = (page - 1) * 20 + 1;
      const url = `${MOBILE_BASE}/en/search/result?keyword=${encodeURIComponent(query)}&searchType=WEBTOON&start=${start}`;
      const json = await this.requestMobileJSON(url);
      const webtoonResult = (json && json.result && json.result.webtoonResult) || { titleList: [], totalCount: 0 };
      const titleList = webtoonResult.titleList || [];
      const results = titleList.map(parseSearchItem);
      const hasNext = start - 1 + titleList.length < (webtoonResult.totalCount || 0);
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const includedTags = (request && request.includedTags) || [];
    if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const sortId = ['MANA', 'LIKEIT', 'UPDATE'].includes(request && request.sortId) ? request.sortId : 'MANA';
      const url = `${MOBILE_BASE}/en/genres/${encodeURIComponent(includedTags[0].id)}/title?sortOrder=${sortId}&page=${page}`;
      const json = await this.requestMobileJSON(url);
      const items = Array.isArray(json) ? json : [];
      const results = items.map(parseGenreListItem);
      const hasNext = items.length >= 12;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const feedId = (request && request.feed) || 'monday';
    const day = WEEKDAYS.find((d) => d.id === feedId) || WEEKDAYS[0];
    const html = await this.requestMobileHTML(`${MOBILE_BASE}/en/originals/${day.id}`);
    const $ = cheerio.load(html);
    const results = parseOriginalsList($, day.key, day.id === 'complete');
    return { results };
  }

  async getMangaDetails(mangaId) {
    const { genreSeo, titleSlug, titleNo } = parseMangaId(mangaId);
    const url = `${MOBILE_BASE}/en/${genreSeo}/${titleSlug}/list?title_no=${titleNo}`;
    const html = await this.requestMobileHTML(url);
    const $ = cheerio.load(html);

    const scope = $('.detail_info_wrap');
    const title = normalizeWhitespace(scope.find('.info_area .subject').first().text()) || titleSlug;
    const image = (scope.find('.img_area img').first().attr('src') || '').trim();
    const author = normalizeWhitespace(scope.find('.info_area .author').first().text()) || undefined;
    const desc = normalizeWhitespace(scope.find('.summary._summary').first().text());

    const tags = [];
    scope.find('.tag_box .tag').each((_, el) => {
      const t = normalizeWhitespace($(el).text());
      if (t) tags.push(t);
    });

    const statusDD = findLabeledDD($, 'Status');
    const status = mapStatus(statusDD ? statusDD.text() : '');

    const ratingDD = findLabeledDD($, 'Content Rating');
    const ageRating = ratingDD ? extractAgeRating(ratingDD.text()) : undefined;

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
    const { titleNo } = parseMangaId(mangaId);
    const chapters = [];
    let cursor;
    for (let i = 0; i < 20; i++) {
      let url = `${MOBILE_BASE}/api/v1/webtoon/${encodeURIComponent(titleNo)}/episodes?pageSize=500&readingLanguageCode=en`;
      if (cursor !== undefined) url += `&cursor=${encodeURIComponent(cursor)}`;
      const json = await this.requestMobileJSON(url);
      const result = (json && json.result) || {};
      const episodeList = result.episodeList || [];

      episodeList.forEach((ep) => {
        const hrefParts = (ep.viewerLink || '').split('/').filter(Boolean);
        const episodeSlug = hrefParts[hrefParts.length - 2] || `ep-${ep.episodeNo}`;
        const chapterId = buildChapterId(ep.episodeNo, episodeSlug);
        const chapter = {
          id: chapterId,
          chapterId,
          name: ep.episodeTitle || `Ep. ${ep.episodeNo}`,
          number: ep.episodeNo,
        };
        if (typeof ep.exposureDateMillis === 'number') chapter.time = ep.exposureDateMillis;
        chapters.push(chapter);
      });

      const nextCursor = result.nextCursor;
      if (!episodeList.length || !nextCursor) break;
      cursor = nextCursor;
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const { genreSeo, titleSlug, titleNo } = parseMangaId(mangaId);
    const { episodeNo, episodeSlug } = parseChapterId(chapterId);
    const url = `${SITE_BASE}/en/${genreSeo}/${titleSlug}/${episodeSlug}/viewer?title_no=${titleNo}&episode_no=${episodeNo}`;
    const html = await this.requestDesktopHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('#_imageList img._images').each((_, el) => {
      const src = ($(el).attr('data-url') || '').trim();
      if (src) pages.push(src);
    });

    return { id: chapterId, mangaId, pages, referer: IMAGE_REFERER };
  }

  async requestMobileHTML(url) {
    return this.requestRaw(url, MOBILE_UA);
  }

  async requestDesktopHTML(url) {
    return this.requestRaw(url, DESKTOP_UA);
  }

  async requestMobileJSON(url) {
    const text = await this.requestRaw(url, MOBILE_UA);
    return JSON.parse(text);
  }

  async requestRaw(url, userAgent) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': userAgent },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
