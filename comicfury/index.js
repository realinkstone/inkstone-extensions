const BASE = 'https://comicfury.com';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const SEARCH_PAGE_SIZE = 30;

const POPULAR_TAGS = [
  { id: 'comedy', label: 'Comedy' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'action', label: 'Action' },
  { id: 'gagaday', label: 'Gag-a-Day' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'sciencefiction', label: 'Science Fiction' },
  { id: 'drama', label: 'Drama' },
  { id: 'fanfiction', label: 'Fan Fiction' },
  { id: 'horror', label: 'Horror' },
  { id: 'animal', label: 'Animal' },
  { id: 'supernatural', label: 'Supernatural' },
  { id: 'romance', label: 'Romance' },
  { id: 'furryanthro', label: 'Furry/Anthro' },
  { id: 'surreal', label: 'Surreal' },
  { id: 'cats', label: 'Cats' },
  { id: 'reallife', label: 'Real Life' },
  { id: 'magic', label: 'Magic' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'lgbtq', label: 'LGBTQ+' },
  { id: 'pokemon', label: 'Pokémon' },
];

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

function absoluteURL(src) {
  const s = (src || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${BASE}${s}`;
  return `${BASE}/${s}`;
}

function parseArchiveDate(text) {
  const m = normalizeWhitespace(text).match(
    /^(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );
  if (!m) return undefined;
  const month = MONTHS_ABBR[m[2].toLowerCase()];
  if (month === undefined) return undefined;
  const day = parseInt(m[1], 10);
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10) % 12;
  if (m[6].toUpperCase() === 'PM') hour += 12;
  const minute = parseInt(m[5], 10);
  return Date.UTC(year, month, day, hour, minute);
}

function parseLeadingInt(text) {
  const m = (text || '').match(/[\d,]+/);
  if (!m) return undefined;
  const n = parseInt(m[0].replace(/,/g, ''), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseLeadingFloat(text) {
  const m = (text || '').match(/[\d.]+/);
  if (!m) return undefined;
  const n = parseFloat(m[0]);
  return Number.isNaN(n) ? undefined : n;
}

function mapActivityStatus(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('completed')) return 'COMPLETED';
  if (t.includes('hiatus')) return 'HIATUS';
  if (t.includes('active')) return 'ONGOING';
  return 'UNKNOWN';
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'recent', name: 'Recently Updated' },
      { id: 'popular', name: 'Popular' },
      { id: 'hot', name: 'Popular Now' },
      { id: 'rating', name: 'Highly Rated' },
      { id: 'random', name: 'Random' },
    ];
  }

  async getSearchTags() {
    return POPULAR_TAGS;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const title = ((request && request.title) || '').trim();
    const includedTags = (request && request.includedTags) || [];
    const tagId = includedTags[0] && includedTags[0].id;
    const feedId = (request && request.feed) || 'recent';

    if (!title && !tagId && (feedId === 'hot' || feedId === 'rating' || feedId === 'random')) {
      if (metadata) return { results: [] };
      const suffix = feedId === 'random' ? 'random' : feedId;
      const html = await this.requestHTML(`${BASE}/index.php?${suffix}`);
      const $ = cheerio.load(html);
      const results = [];
      $('.updatebox').each((_, box) => {
        const link = $(box).find('.mobile-webcomic-link a.fpcomictitle').first();
        const href = (link.attr('href') || '').trim();
        const slugMatch = href.match(/^\/read\/([^/]+)/);
        if (!slugMatch) return;
        const slug = slugMatch[1];
        const titleText = normalizeWhitespace(link.text()) || slug;
        const image = absoluteURL($(box).find('.mobile-webcomic-link .fpcomicavatar img').first().attr('src'));
        const comicsStatText = normalizeWhitespace($(box).find('.fpcomicstat').first().text());
        const chapters = parseLeadingInt(comicsStatText);
        const manga = { mangaId: slug, title: titleText, image, webURL: `${BASE}/read/${slug}`, medium: 'comics' };
        if (chapters !== undefined) manga.chapters = chapters;
        results.push(manga);
      });
      return { results, metadata: undefined };
    }

    const page = (metadata && metadata.page) || 1;
    const combinedquery = tagId ? `#${tagId}` : title;
    let sort = 0;
    if (!combinedquery) sort = feedId === 'popular' ? 1 : 2;

    const url =
      `${BASE}/search.php?vr=1&combinedquery=${encodeURIComponent(combinedquery)}&` +
      qs({ lastupdate: 0, completed: 1, fn: 2, fv: 2, fs: 2, fl: 2, sort, page });
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const results = [];
    $('.webcomic-result').each((_, el) => {
      const card = $(el);
      const href = (card.find('.webcomic-result-title a').first().attr('href') || '').trim();
      const slugMatch = href.match(/[?&]url=([^&]+)/);
      if (!slugMatch) return;
      const slug = decodeURIComponent(slugMatch[1]);
      const titleText = normalizeWhitespace(card.find('.webcomic-result-title a').first().text()) || slug;
      const image = absoluteURL(card.find('.webcomic-result-avatar img').first().attr('src'));
      const manga = { mangaId: slug, title: titleText, image, webURL: `${BASE}/read/${slug}`, medium: 'comics' };
      card.find('.result-stat').each((__, stat) => {
        const alt = (($(stat).find('img').first().attr('alt') || '')).toLowerCase();
        const value = parseLeadingInt($(stat).find('.stat-value').first().text());
        if (value === undefined) return;
        if (alt === 'comics') manga.chapters = value;
        else if (alt === 'subscriptions') manga.views = value;
      });
      results.push(manga);
    });

    const hasNext = $('.search-next-page').length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const slug = mangaId;
    let html;
    try {
      html = await this.requestHTML(`${BASE}/comicprofile.php?url=${encodeURIComponent(slug)}`);
      if (/That webcomic was not found/i.test(html)) throw new Error('not found');
    } catch (e) {
      const readerHTML = await this.fetchReaderHTML(`${BASE}/read/${encodeURIComponent(slug)}`);
      const $$ = cheerio.load(readerHTML);
      const title = normalizeWhitespace($$('h2.webcomic-title-content-inner').first().text()) || slug;
      return {
        mangaInfo: {
          title,
          image: '',
          desc: '',
          status: 'UNKNOWN',
          tags: [],
          webURL: `${BASE}/read/${encodeURIComponent(slug)}`,
          medium: 'comics',
        },
      };
    }

    const $ = cheerio.load(html);
    const title = normalizeWhitespace($('.username-and-title .authorname').first().text()) || slug;
    const image = absoluteURL($('.profile-avatar img').first().attr('src'));

    let desc = '';
    const tags = [];
    const authors = [];
    let status = 'UNKNOWN';
    let views;
    let rating;
    let chapters;

    $('.authorinfo').each((_, el) => {
      const label = normalizeWhitespace($(el).find('.infoname').first().text());
      const value = normalizeWhitespace($(el).find('.info').first().text());
      if (label === 'Activity status:') status = mapActivityStatus(value);
      else if (label === 'Number of comics:') chapters = parseLeadingInt(value);
      else if (label === 'Visitors:') views = parseLeadingInt(value);
      else if (label === 'Rating:') rating = parseLeadingFloat(value);
    });

    $('.profilecategory').each((_, el) => {
      const heading = normalizeWhitespace($(el).find('h2.pchead').first().text()).toLowerCase();
      if (heading.indexOf('description') !== -1) {
        const block = $(el).find('.pccontent').first().clone();
        block.find('.description-tags').remove();
        desc = normalizeWhitespace(block.text());
        $(el)
          .find('.description-tags a.webcomic-profile-tag')
          .each((__, a) => {
            const t = normalizeWhitespace($(a).text());
            if (t) tags.push(t);
          });
      } else if (heading.indexOf('author') !== -1) {
        $(el)
          .find('a.authorname')
          .each((__, a) => {
            const name = normalizeWhitespace($(a).text());
            if (name) authors.push(name);
          });
      }
    });

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: `${BASE}/read/${encodeURIComponent(slug)}`,
      medium: 'comics',
    };
    if (authors.length) mangaInfo.author = authors.join(', ');
    if (views !== undefined) mangaInfo.views = views;
    if (rating !== undefined) mangaInfo.rating = rating;
    if (chapters !== undefined) mangaInfo.chapters = chapters;
    if (status === 'COMPLETED') mangaInfo.completed = true;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const slug = mangaId;
    const html = await this.fetchReaderHTML(`${BASE}/read/${encodeURIComponent(slug)}/archive`);
    const $ = cheerio.load(html);

    const chapterLinks = [];
    $('div.archive-chapter').each((_, el) => {
      const name = normalizeWhitespace($(el).text());
      const href = ($(el).parent('a').attr('href') || '').trim();
      const m = href.match(/\/archive\/chapter\/(\d+)$/);
      if (m) chapterLinks.push({ id: m[1], name });
    });

    const tagged = [];

    if (chapterLinks.length) {
      for (let i = 0; i < chapterLinks.length; i++) {
        const group = chapterLinks[i];
        const entries = await this.collectArchiveEntries(slug, group.id, undefined);
        for (let j = 0; j < entries.length; j++) {
          tagged.push({ entry: entries[j], groupName: group.name, seq: tagged.length });
        }
      }
    } else {
      const entries = await this.collectArchiveEntries(slug, '0', $);
      for (let j = 0; j < entries.length; j++) {
        tagged.push({ entry: entries[j], groupName: 'Unchaptered', seq: tagged.length });
      }
    }

    tagged.sort((a, b) => {
      const at = a.entry.time;
      const bt = b.entry.time;
      if (at !== undefined && bt !== undefined) return at - bt;
      if (at !== undefined) return -1;
      if (bt !== undefined) return 1;
      return a.seq - b.seq;
    });

    return tagged.map((t, i) => this.toChapter(t.entry, i + 1, t.groupName));
  }

  async collectArchiveEntries(slug, chapterId, preloadedDollar) {
    const entries = [];
    let page = 1;
    let $page = preloadedDollar;
    for (let i = 0; i < 100; i++) {
      if (!$page) {
        const url =
          page === 1
            ? `${BASE}/read/${encodeURIComponent(slug)}/archive/chapter/${chapterId}`
            : `${BASE}/read/${encodeURIComponent(slug)}/archive/chapter/${chapterId}/page/${page}`;
        const html = await this.fetchReaderHTML(url);
        $page = cheerio.load(html);
      }

      $page('.archive-comics a').each((_, a) => {
        const href = ($page(a).attr('href') || '').trim();
        const idMatch = href.match(/\/comics\/(\d+)$/);
        if (!idMatch) return;
        const title = normalizeWhitespace($page(a).find('.archive-comic-title').first().text());
        const dateText = normalizeWhitespace($page(a).find('.archive-comic-date').first().text());
        entries.push({ id: idMatch[1], title, time: parseArchiveDate(dateText) });
      });

      const hasNext = $page(`a.vfpage[href$="/page/${page + 1}"]`).length > 0;
      if (!hasNext) break;
      page += 1;
      $page = undefined;
    }
    return entries;
  }

  toChapter(entry, position, groupName) {
    const chapter = {
      id: entry.id,
      chapterId: entry.id,
      name: entry.title || `Page ${position}`,
      number: position,
    };
    if (groupName) chapter.group = groupName;
    if (entry.time !== undefined) chapter.time = entry.time;
    return chapter;
  }

  async getChapterDetails(mangaId, chapterId) {
    const slug = mangaId;
    const html = await this.fetchReaderHTML(`${BASE}/read/${encodeURIComponent(slug)}/comics/${encodeURIComponent(chapterId)}`);
    const $ = cheerio.load(html);

    let scope = $(`.is--comic-page[data-comicid="${chapterId}"]`).first();
    if (!scope.length) scope = $('.is--comic-page').first();

    const pages = [];
    scope.find('.is--image-segment img').each((_, img) => {
      const src = ($(img).attr('src') || '').trim();
      if (src) pages.push(src);
    });

    return { id: chapterId, mangaId, pages };
  }

  async fetchReaderHTML(url) {
    const html = await this.requestHTML(url);
    if (html.indexOf('class="nhead">Content Warning<') === -1) return html;
    const tokenMatch = html.match(/name="token"\s+value="(\d+)"/);
    if (!tokenMatch) return html;
    const token = tokenMatch[1];
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `token=${token}`,
      },
      body: `token=${token}&proceed=${encodeURIComponent('View Webcomic')}`,
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
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
