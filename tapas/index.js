const WEB_BASE = 'https://tapas.io';
const APP_BASE = 'https://m.tapas.io';
const COSMOS_BASE = 'https://story-api.tapas.io';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 25;

const WEEKDAYS = [
  { id: 'mon', name: 'Monday', code: 'MON' },
  { id: 'tue', name: 'Tuesday', code: 'TUE' },
  { id: 'wed', name: 'Wednesday', code: 'WED' },
  { id: 'thu', name: 'Thursday', code: 'THU' },
  { id: 'fri', name: 'Friday', code: 'FRI' },
  { id: 'sat', name: 'Saturday', code: 'SAT' },
  { id: 'sun', name: 'Sunday', code: 'SUN' },
];
const WEEKDAY_BY_ID = {};
WEEKDAYS.forEach((d) => {
  WEEKDAY_BY_ID[d.id] = d.code;
});

const SORT_IDS = ['POPULAR', 'NEWEST_EPISODE', 'NEWEST_SERIES'];

const MONTHS_ABBR = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function normalizeWhitespace(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function parseListDate(text) {
  const m = normalizeWhitespace(text).match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const month = MONTHS_ABBR[m[1].toLowerCase()];
  if (month === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), month, parseInt(m[2], 10));
}

function parseDigits(text) {
  const m = (text || '').match(/[\d,]+/);
  if (!m) return undefined;
  const n = parseInt(m[0].replace(/,/g, ''), 10);
  return Number.isNaN(n) ? undefined : n;
}

function coverFromAsset(assetProperty) {
  const asset = assetProperty || {};
  const path =
    (asset.thumbnailImage && asset.thumbnailImage.path) || (asset.bookCoverImage && asset.bookCoverImage.path);
  return path ? `${path}.jpg` : '';
}

function mapIssueStatus(value) {
  const s = (value || '').toUpperCase();
  if (s === 'ON_GOING') return 'ONGOING';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'HIATUS') return 'HIATUS';
  return 'UNKNOWN';
}

function mapScheduleText(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('completed')) return 'COMPLETED';
  if (t.includes('hiatus')) return 'HIATUS';
  if (t.includes('update')) return 'ONGOING';
  return 'UNKNOWN';
}

function toPartialManga(item) {
  const tags = (item.genreList || []).map((g) => g.value).filter(Boolean);
  const authorList = (item.authorList || []).filter(Boolean);
  const manga = {
    mangaId: String(item.seriesId),
    title: (item.title || '').trim(),
    image: coverFromAsset(item.assetProperty),
    webURL: `${WEB_BASE}/series/${item.seriesId}`,
    medium: 'comics',
  };
  if (authorList.length) manga.author = authorList.join(', ');
  if (item.description) manga.summary = item.description;
  if (tags.length) manga.tags = tags;
  if (item.publisher) manga.publisher = item.publisher;
  if (item.serviceProperty && typeof item.serviceProperty.viewCount === 'number') {
    manga.views = item.serviceProperty.viewCount;
  }
  if (mapIssueStatus(item.issueStatus) === 'COMPLETED') manga.completed = true;
  return manga;
}

function extractLandingItems(data, isDayGrouped) {
  if (!isDayGrouped) return (data && data.items) || [];
  const groups = (data && data.items) || [];
  const items = [];
  groups.forEach((g) => {
    (g.items || []).forEach((it) => items.push(it));
  });
  return items;
}

class Source {
  getSourceFeeds() {
    return [
      ...WEEKDAYS.map((d) => ({ id: d.id, name: d.name })),
      { id: 'popular', name: 'Popular' },
      { id: 'new', name: 'New' },
      { id: 'completed', name: 'Completed' },
      { id: 'all', name: 'All Genres' },
    ];
  }

  async getSearchTags() {
    try {
      const json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/genre?${qs({ category_type: 'COMIC', subtab_id: 17, page: 0, size: 1 })}`,
      );
      const list = (json.data && json.data.genreList) || [];
      return list
        .filter((g) => g.key)
        .map((g) => ({ id: g.key, label: g.value }));
    } catch (e) {
      console.error('Tapas getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSortOptions() {
    return [
      { id: 'POPULAR', label: 'Popular' },
      { id: 'NEWEST_EPISODE', label: 'Newest episode' },
      { id: 'NEWEST_SERIES', label: 'Newest series' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = ((request && request.title) || '').trim();

    if (query) {
      if (metadata) return { results: [] };
      const html = await this.requestHTML(
        `${APP_BASE}/search?${qs({ q: query, t: 'COMICS' })}`,
      );
      const $ = cheerio.load(html);
      const results = [];
      $('li.v-link').each((_, el) => {
        const card = $(el);
        const mangaId = (card.attr('data-series-id') || '').trim();
        const title = normalizeWhitespace(card.find('.desc-wrap .title').first().text());
        if (!mangaId || !title) return;
        const image = (card.find('img.thumb').first().attr('src') || '').trim();
        const author = normalizeWhitespace(card.find('.desc-wrap .sub-title a').first().text());
        const href = (card.attr('data-href') || '').trim();
        const manga = { mangaId, title, image, medium: 'comics' };
        if (author) manga.author = author;
        if (href) manga.webURL = `${WEB_BASE}${href}`;
        results.push(manga);
      });
      return { results };
    }

    const page = (metadata && metadata.page) || 0;
    const includedTags = (request && request.includedTags) || [];
    const genreTag = includedTags[0] && includedTags[0].id;
    const sortId = SORT_IDS.includes(request && request.sortId) ? request.sortId : undefined;
    const feedId = (request && request.feed) || 'popular';

    let json;
    let dayGrouped = false;
    if (genreTag) {
      json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/genre?${qs({
          category_type: 'COMIC',
          genre_type: genreTag,
          subtab_id: 17,
          sort_option: sortId,
          page,
          size: PAGE_SIZE,
        })}`,
      );
    } else if (WEEKDAY_BY_ID[feedId]) {
      json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/daily?${qs({
          category_type: 'COMIC',
          daily_type: WEEKDAY_BY_ID[feedId],
          subtab_id: 7,
          page,
          size: PAGE_SIZE,
        })}`,
      );
    } else if (feedId === 'new') {
      dayGrouped = true;
      json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/new?${qs({ category_type: 'COMIC', subtab_id: 4, page, size: PAGE_SIZE })}`,
      );
    } else if (feedId === 'completed') {
      json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/completed?${qs({
          category_type: 'COMIC',
          subtab_id: 6,
          sort_option: sortId,
          page,
          size: PAGE_SIZE,
        })}`,
      );
    } else if (feedId === 'all') {
      json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/genre?${qs({
          category_type: 'COMIC',
          subtab_id: 17,
          sort_option: sortId,
          page,
          size: PAGE_SIZE,
        })}`,
      );
    } else {
      json = await this.requestCosmosJSON(
        `/cosmos/api/v1/landing/ranking?${qs({ category_type: 'COMIC', subtab_id: 3, page, size: PAGE_SIZE })}`,
      );
    }

    const items = extractLandingItems(json.data, dayGrouped);
    const results = items.filter((it) => it && it.seriesId != null).map(toPartialManga);
    const pagination = json.meta && json.meta.pagination;
    const hasNext = pagination ? pagination.last === false : false;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${APP_BASE}/series/${encodeURIComponent(mangaId)}/info`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = normalizeWhitespace($('.title-wrapper a.title').first().text()) || String(mangaId);
    const image = ($('.thumb-wrapper .thumb.js-thumbnail img').first().attr('src') || '').trim();

    const authors = [];
    $('.creator-item .creator-info__top .name').each((_, el) => {
      const name = normalizeWhitespace($(el).text());
      if (name) authors.push(name);
    });

    const desc = normalizeWhitespace($('.description.js-series-description .description__body').first().text());

    const tags = [];
    $('.detail-row__body--genre .genre-btn').each((_, el) => {
      const t = normalizeWhitespace($(el).text());
      if (t) tags.push(t);
    });

    const scheduleText = normalizeWhitespace($('.schedule .schedule-label').first().text());
    const status = mapScheduleText(scheduleText);

    const viewsText = $('.stats .stats__row').first().attr('data-title') || '';
    const views = parseDigits(viewsText);

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (authors.length) mangaInfo.author = authors.join(', ');
    if (views !== undefined) mangaInfo.views = views;
    if (status === 'COMPLETED') mangaInfo.completed = true;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const chapters = [];
    let page = 1;
    for (let i = 0; i < 200; i++) {
      const url = `${APP_BASE}/series/${encodeURIComponent(mangaId)}/episodes?${qs({
        page,
        sort: 'OLDEST',
        large: true,
      })}`;
      const text = await this.requestHTML(url);
      const json = JSON.parse(text);
      if (!json || json.code !== 200 || !json.data) {
        throw new Error(
          `Tapas: episodes page ${page} of ${mangaId} returned an unreadable envelope ` +
            `(code ${json && json.code}); refusing to return a partial chapter list`
        );
      }

      const $ = cheerio.load(json.data.body || '');
      $('a.episode-item').each((_, el) => {
        const a = $(el);
        const id = (a.attr('data-id') || '').trim();
        if (!id) return;
        const numberRaw = a.attr('data-scene-number');
        const number = numberRaw !== undefined ? parseFloat(numberRaw) : chapters.length + 1;
        const classAttr = a.attr('class') || '';
        const locked = classAttr.split(/\s+/).includes('js-have-to-sign');
        const titleText = normalizeWhitespace(a.find('.info .title .title__body').first().text());
        const baseName = titleText || `Episode ${Number.isNaN(number) ? '' : number}`;
        const dateText = normalizeWhitespace(a.find('.info .additional span').first().text());
        const time = parseListDate(dateText);

        const chapter = {
          id,
          chapterId: id,
          name: locked ? `${baseName} (Locked, WUF)` : baseName,
          number: Number.isNaN(number) ? chapters.length + 1 : number,
        };
        if (time !== undefined) chapter.time = time;
        chapters.push(chapter);
      });

      const pagination = json.data.pagination || {};
      if (!pagination.has_next) break;
      page += 1;
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${APP_BASE}/episode/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.viewer__body img.content__img').each((_, el) => {
      const src = ($(el).attr('data-src') || '').trim();
      if (src && !src.startsWith('data:')) pages.push(src);
    });

    return { id: chapterId, mangaId, pages };
  }

  async requestCosmosJSON(path) {
    const text = await this.requestRaw(`${COSMOS_BASE}${path}`);
    return JSON.parse(text);
  }

  async requestHTML(url) {
    return this.requestRaw(url);
  }

  async requestRaw(url) {
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
