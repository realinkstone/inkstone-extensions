function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

const BASE = 'https://m.comic.naver.com';
const SITE_BASE = 'https://comic.naver.com';
const IMAGE_REFERER = 'https://m.comic.naver.com/';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const WEEKDAYS = [
  { id: 'mon', name: 'Monday' },
  { id: 'tue', name: 'Tuesday' },
  { id: 'wed', name: 'Wednesday' },
  { id: 'thu', name: 'Thursday' },
  { id: 'fri', name: 'Friday' },
  { id: 'sat', name: 'Saturday' },
  { id: 'sun', name: 'Sunday' },
  { id: 'dailyPlus', name: 'Daily+' },
];
const WEEKDAY_IDS = WEEKDAYS.map((d) => d.id);

const GENRES = [
  { id: 'EPISODE', label: '에피소드' },
  { id: 'OMNIBUS', label: '옴니버스' },
  { id: 'STORY', label: '스토리' },
  { id: 'DAILY', label: '일상' },
  { id: 'COMIC', label: '개그' },
  { id: 'FANTASY', label: '판타지' },
  { id: 'ACTION', label: '액션' },
  { id: 'DRAMA', label: '드라마' },
  { id: 'PURE', label: '로맨스' },
  { id: 'SENSIBILITY', label: '감성' },
  { id: 'THRILL', label: '스릴러' },
  { id: 'HISTORICAL', label: '무협/사극' },
  { id: 'SPORTS', label: '스포츠' },
];

function normalizeWhitespace(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function parseKoreanCount(text) {
  const t = (text || '').replace(/,/g, '').replace(/\+$/, '').trim();
  const m = t.match(/^([\d.]+)(천|만)?$/);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  if (m[2] === '천') n *= 1000;
  else if (m[2] === '만') n *= 10000;
  return Math.round(n);
}

function parseAgeRating(text) {
  const t = (text || '').trim();
  if (!t) return undefined;
  if (t.includes('전체')) return 0;
  const m = t.match(/(\d+)\s*세/);
  return m ? parseInt(m[1], 10) : undefined;
}

function parseListDate(text) {
  const m = (text || '').match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return undefined;
  const year = 2000 + parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const ms = Date.UTC(year, month, day);
  return Number.isNaN(ms) ? undefined : ms;
}

function hasAdultBadge($, root) {
  let adult = false;
  root.find('.area_badge .badge').each((_, el) => {
    const cls = $(el).attr('class') || '';
    if (/\badult/.test(cls)) adult = true;
  });
  return adult;
}

function hasNextPage($) {
  const btn = $('.paging_type2 .btn_next').first();
  if (btn.length === 0) return false;
  const cls = (btn.attr('class') || '').split(/\s+/);
  return !cls.includes('disabled');
}

function parseToonLstItem($, li) {
  const $li = $(li);
  const a = $li.find('a').first();
  const href = a.attr('href') || '';
  const m = href.match(/titleId=(\d+)/);
  if (!m) return null;
  if (hasAdultBadge($, a)) return null;

  const titleId = m[1];
  const title = normalizeWhitespace(a.find('.toon_info .toon_name').first().text());
  if (!title) return null;
  const image = (a.find('img').first().attr('src') || '').trim();
  const author = normalizeWhitespace(a.find('.toon_info p.sub_info').first().text());
  const scoreText = normalizeWhitespace(a.find('.toon_info div.sub_info .txt_score').first().text());
  const rating = scoreText ? parseFloat(scoreText) : undefined;

  return {
    mangaId: titleId,
    title,
    image,
    referer: IMAGE_REFERER,
    author: author || undefined,
    rating: rating !== undefined && !Number.isNaN(rating) ? rating : undefined,
    webURL: `${SITE_BASE}/webtoon/list?titleId=${titleId}`,
    medium: 'comics',
  };
}

function parseListToonItem($, li) {
  const $li = $(li);
  const a = $li.find('a.link').first();
  const href = a.attr('href') || '';
  const m = href.match(/titleId=(\d+)/);
  if (!m) return null;
  if (hasAdultBadge($, a)) return null;

  const titleId = m[1];
  const title = normalizeWhitespace(a.find('.info .title_box .title_text').first().text());
  if (!title) return null;
  const image = (a.find('img').first().attr('src') || '').trim();
  const author = normalizeWhitespace(a.find('.info .author').first().text());
  const favText = normalizeWhitespace(a.find('.info .favcount .count_num').first().text());
  const views = parseKoreanCount(favText);

  return {
    mangaId: titleId,
    title,
    image,
    referer: IMAGE_REFERER,
    author: author || undefined,
    views,
    webURL: `${SITE_BASE}/webtoon/list?titleId=${titleId}`,
    medium: 'comics',
  };
}

function parseEpisodeListPage($, byNo) {
  $('.section_episode_list li[data-no]').each((_, el) => {
    const $el = $(el);
    const no = $el.attr('data-no');
    if (!no || byNo.has(no)) return;

    const nameText = normalizeWhitespace($el.find('.info .title .name').first().text());
    const locked = ($el.attr('class') || '').split(/\s+/).includes('lock');
    const numMatch = nameText.match(/^(\d+(?:\.\d+)?)\s*화/);
    const number = numMatch ? parseFloat(numMatch[1]) : parseInt(no, 10);
    const dateText = normalizeWhitespace($el.find('.info .detail .date').first().text());
    const time = parseListDate(dateText);

    const chapter = {
      id: no,
      chapterId: no,
      name: (nameText || `Ep. ${no}`) + (locked ? ' (Locked, Paid)' : ''),
      number,
    };
    if (time !== undefined) chapter.time = time;
    byNo.set(no, chapter);
  });
}

class Source {
  getSourceFeeds() {
    return [...WEEKDAYS, { id: 'finish', name: 'Completed' }];
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';

    if (query) {
      const url = `${BASE}/search/result?${qs({ keyword: query, searchType: 'WEBTOON', page })}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = [];
      $('article.result_lst ul.toon_lst li').each((_, el) => {
        const item = parseToonLstItem($, el);
        if (item) results.push(item);
      });
      const hasNext = hasNextPage($);
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const includedTags = (request && request.includedTags) || [];
    if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const genreId = includedTags[0].id;
      const url = `${BASE}/webtoon/genre?${qs({ genre: genreId, sort: 'NEW', page })}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = [];
      $('ul.toon_lst.lst_genre li').each((_, el) => {
        const item = parseToonLstItem($, el);
        if (item) results.push(item);
      });
      const hasNext = hasNextPage($);
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const feedId = (request && request.feed) || 'mon';

    if (feedId === 'finish') {
      const url = `${BASE}/webtoon/finish?${qs({ page, sort: 'UPDATE' })}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = [];
      $('ul.list_toon li.item').each((_, el) => {
        const item = parseListToonItem($, el);
        if (item) results.push(item);
      });
      const hasNext = hasNextPage($);
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const week = WEEKDAY_IDS.includes(feedId) ? feedId : 'mon';
    const url = `${BASE}/webtoon/weekday?${qs({ week })}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = [];
    $('ul.list_toon li.item').each((_, el) => {
      const item = parseListToonItem($, el);
      if (item) results.push(item);
    });
    return { results };
  }

  async getMangaDetails(mangaId) {
    const titleId = mangaId;
    const url = `${BASE}/webtoon/list?${qs({ titleId })}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const infoArea = $('.area_info').first();
    const infoBack = $('.info_back').first();
    if (infoArea.length === 0 || infoBack.length === 0) {
      throw new Error(
        'Naver Webtoon: could not load this title (it may not exist, or it may be a 19+ title that requires a logged-in, age-verified Naver account, which this extension cannot access).',
      );
    }

    const title = normalizeWhitespace(infoArea.find('.title').first().text()) || titleId;
    const author = normalizeWhitespace(infoArea.find('.author').first().text());
    const scoreText = normalizeWhitespace(infoArea.find('.detail .score').first().text());
    const rating = scoreText ? parseFloat(scoreText) : undefined;
    const image = ($('meta[property="og:image"]').attr('content') || '').trim();

    const tags = [];
    infoBack
      .find('.genre .length')
      .each((_, el) => {
        const t = normalizeWhitespace($(el).text());
        if (t) tags.push(t);
      });
    infoBack.find('.genre .property.list_detail li').each((_, el) => {
      const t = normalizeWhitespace($(el).text());
      if (t) tags.push(t);
    });

    const ageText = normalizeWhitespace(infoBack.find('.week_day .property.list_detail.age').first().text());
    const ageRating = parseAgeRating(ageText);

    const descLong = normalizeWhitespace(infoBack.find('.summary p').first().text());
    const descShort = normalizeWhitespace(infoArea.find('.summary').first().text());
    const desc = descLong || descShort;

    const finishedMatch = html.match(/finished:\s*(true|false)/);
    const status = finishedMatch ? (finishedMatch[1] === 'true' ? 'COMPLETED' : 'ONGOING') : 'UNKNOWN';

    const mangaInfo = {
      title,
      image,
      referer: IMAGE_REFERER,
      author: author || undefined,
      desc,
      status,
      tags,
      rating: rating !== undefined && !Number.isNaN(rating) ? rating : undefined,
      webURL: `${SITE_BASE}/webtoon/list?titleId=${titleId}`,
      medium: 'comics',
    };
    if (ageRating !== undefined) mangaInfo.ageRating = ageRating;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const titleId = mangaId;

    const firstHtml = await this.requestHTML(`${BASE}/webtoon/list?${qs({ titleId })}`);
    let $ = cheerio.load(firstHtml);
    const totalText = normalizeWhitespace($('.section_episode_count h3.title_count .count_num').first().text());
    const total = parseInt(totalText, 10) || 0;

    const byNo = new Map();
    parseEpisodeListPage($, byNo);

    if (total === 0 && byNo.size === 0) {
      throw new Error(
        'Naver Webtoon: could not load this title\'s episode list (it may not exist, or it may be a 19+ title that requires a logged-in, age-verified Naver account, which this extension cannot access).',
      );
    }

    let noNewPages = 0;
    for (let page = 2; byNo.size < total && page <= 300; page++) {
      const sizeBefore = byNo.size;
      const html = await this.requestHTML(`${BASE}/webtoon/list?${qs({ titleId, page })}`);
      $ = cheerio.load(html);
      parseEpisodeListPage($, byNo);
      if (byNo.size === sizeBefore) {
        noNewPages += 1;
        if (noNewPages >= 2) break;
      } else {
        noNewPages = 0;
      }
    }

    const chapters = Array.from(byNo.values());
    chapters.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const titleId = mangaId;
    const no = chapterId;
    const url = `${BASE}/webtoon/detail?${qs({ titleId, no })}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.toon_image').each((_, el) => {
      const src = ($(el).attr('data-src') || '').trim();
      if (src && src.includes('/mobilewebimg/')) pages.push(src);
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
