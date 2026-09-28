const SITE_BASE = 'https://www.viz.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const API_REFERER = `${SITE_BASE}/`;

const DEVICE_ID = 1;

const PAGE_INDEX_MAX = 99;
const PAGE_INDICES = Array.from({ length: PAGE_INDEX_MAX + 1 }, (_, i) => i).join(',');

const FEEDS = [
  { id: 'free-chapters', name: 'Latest Free Chapters', path: '/manga-books/shonenjump/section/free-chapters' },
  { id: 'trending-manga', name: "What's Hot This Week", path: '/manga-books/shonenjump/section/trending-manga' },
  { id: 'new-manga', name: 'New Series', path: '/manga-books/shonenjump/section/new-manga' },
  { id: 'fan-favorites', name: 'Fan Favorites', path: '/manga-books/shonenjump/section/fan-favorites' },
  { id: 'latest-manga', name: 'Latest Vault Chapters', path: '/manga-books/shonenjump/section/latest-manga' },
  { id: 'naruto-boruto', name: 'Naruto & Boruto', path: '/manga-books/shonenjump/section/naruto-boruto' },
  { id: 'dragon-ball', name: 'Dragon Ball', path: '/manga-books/shonenjump/section/dragon-ball' },
  { id: 'anime-manga', name: 'Anime Tie-Ins', path: '/manga-books/shonenjump/section/anime-manga' },
];

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
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

function parseDateMs(text) {
  const m = (text || '').match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), month, parseInt(m[2], 10));
}

function extractSeriesSlug(href) {
  const m = (href || '').match(/\/shonenjump\/chapters\/([^/?#]+)/);
  return m ? m[1] : '';
}

function parseSeriesTile($, wrapper) {
  const $wrapper = $(wrapper);
  const titleLink = $wrapper.find('a[href*="/shonenjump/chapters/"]').first();
  const href = titleLink.attr('href') || '';
  const slug = extractSeriesSlug(href);
  if (!slug) return null;

  const img = titleLink.find('img').first();
  const image = (img.attr('data-original') || img.attr('src') || '').trim();

  const titleDiv = titleLink.children('div').last();
  const title =
    normalizeWhitespace(titleDiv.text()) || normalizeWhitespace(titleLink.attr('rel') || '') || slug;

  const manga = {
    mangaId: slug,
    title,
    image,
    webURL: `${SITE_BASE}/shonenjump/chapters/${slug}`,
    medium: 'comics',
    publisher: 'VIZ Media',
  };

  const latestLink = $wrapper.find('a.o_inner-link').first();
  if (latestLink.length) {
    const latestText = normalizeWhitespace(latestLink.find('span').first().text());
    const m = latestText.match(/Chapter\s+([\d.]+)/i);
    if (m) manga.chapters = parseFloat(m[1]);
  }

  return manga;
}

function parseSeriesTiles($) {
  const results = [];
  $('.p-cs-tile').each((_, el) => {
    const manga = parseSeriesTile($, el);
    if (manga) results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    if (query) {
      const url = `${SITE_BASE}/search?${qs({ search: query, category: 'SjChapterSeries' })}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      return { results: parseSeriesTiles($) };
    }

    const feedId = (request && request.feed) || FEEDS[0].id;
    const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
    const html = await this.requestHTML(`${SITE_BASE}${feed.path}`);
    const $ = cheerio.load(html);
    return { results: parseSeriesTiles($) };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/shonenjump/chapters/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const intro = $('#series-intro');
    const titleEl = intro.find('h2').first();
    const title = normalizeWhitespace(titleEl.text()) || mangaId;
    const desc = normalizeWhitespace(titleEl.next('div').text()) || undefined;
    const author = normalizeWhitespace(intro.find('span.disp-bl--bm').first().text()) || undefined;
    const image = (($('#hero img.o_hero-media').attr('src') || '')).trim() || undefined;

    const mangaInfo = {
      title,
      image,
      desc,
      author,
      status: 'ONGOING',
      webURL: url,
      medium: 'comics',
      publisher: 'VIZ Media',
    };
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/shonenjump/chapters/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const chapters = [];
    const seenIds = new Set();

    const pushChapter = (mcId, numAttr, locked, dateText) => {
      if (!mcId || seenIds.has(mcId)) return;
      seenIds.add(mcId);
      const number = parseFloat(numAttr);
      const time = dateText ? parseDateMs(dateText) : undefined;
      const chapter = {
        id: mcId,
        chapterId: mcId,
        name: `Chapter ${numAttr}${locked ? ' (Join to Read)' : ''}`,
        number: Number.isNaN(number) ? undefined : number,
      };
      if (time !== undefined) chapter.time = time;
      chapters.push(chapter);
    };

    $('#chpt_rows a.o_chapter-container[name]').each((_, el) => {
      const $a = $(el);
      const mcId = $a.find('tr.o_chapter').attr('data-mc_id');
      if (!mcId) return;
      const numAttr = $a.attr('name') || '';
      const locked = $a.find('.icon-lock').length > 0;
      const dateText = normalizeWhitespace($a.find('td[align="right"]').first().text());
      pushChapter(mcId, numAttr, locked, dateText);
    });

    $('#chpt_rows tr.o_chapter[data-mc_id]').each((_, el) => {
      const $tr = $(el);
      const mcId = $tr.attr('data-mc_id');
      if (!mcId || seenIds.has(mcId)) return;
      const $numLink = $tr.find('a.o_chapter-container[name]').first();
      const numAttr = $numLink.attr('name') || '';
      const locked = $tr.find('.icon-lock').length > 0;
      pushChapter(mcId, numAttr, locked, '');
    });

    chapters.sort((a, b) => (a.number || 0) - (b.number || 0));
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/get_manga_url?${qs({
      device_id: DEVICE_ID,
      manga_id: chapterId,
      pages: PAGE_INDICES,
    })}`;
    const json = await this.requestJSON(url, { Referer: API_REFERER });

    const pages = [];
    if (json && json.ok === 1 && json.data) {
      const indices = Object.keys(json.data)
        .filter((k) => k !== '0')
        .map(Number)
        .sort((a, b) => a - b);
      indices.forEach((i) => {
        const pageUrl = json.data[String(i)];
        if (pageUrl) pages.push(pageUrl);
      });
    }
    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url, extraHeaders) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: Object.assign({ 'User-Agent': UA }, extraHeaders || {}),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestJSON(url, extraHeaders) {
    const text = await this.requestHTML(url, extraHeaders);
    return JSON.parse(text);
  }
}

module.exports = { Source };
