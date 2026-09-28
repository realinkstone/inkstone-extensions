const SITE_BASE = 'https://weebcentral.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest-updates', name: 'Latest Updates', sort: 'Latest Updates', order: 'Descending' },
  { id: 'recently-added', name: 'Recently Added', sort: 'Recently Added', order: 'Descending' },
  { id: 'popularity', name: 'Popularity', sort: 'Popularity', order: 'Descending' },
  { id: 'subscribers', name: 'Subscribers', sort: 'Subscribers', order: 'Descending' },
  { id: 'alphabet', name: 'Alphabet', sort: 'Alphabet', order: 'Ascending' },
];
const FEED_BY_ID = {};
FEEDS.forEach((f) => { FEED_BY_ID[f.id] = f; });

const PAGE_SIZE = 32;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseChapterNumber(name) {
  const match = (name || '').match(/(?:ch(?:apter)?\.?\s*)?([\d.]+)/i);
  return match ? parseFloat(match[1]) : 0;
}

function extractSeriesId(href) {
  const m = (href || '').match(/\/series\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractChapterId(href) {
  const m = (href || '').match(/\/chapters\/([^/?#]+)/);
  return m ? m[1] : '';
}

function findLI($, label) {
  let found = null;
  $('li').each((_, li) => {
    const strongText = cleanText($(li).children('strong').first().text()).replace(/:$/, '');
    if (strongText === label) {
      found = $(li);
      return false;
    }
  });
  return found;
}

function parseSearchResultsPage($) {
  const results = [];
  $('article.bg-base-300').each((_, el) => {
    const article = $(el);
    const titleLink = article.find('a.line-clamp-1').first();
    const href = titleLink.attr('href') || '';
    const mangaId = extractSeriesId(href);
    const title = cleanText(titleLink.text());
    if (!mangaId || !title) return;

    const image = (article.find('picture img').first().attr('src') || '').trim();

    let author = '';
    let tags = [];
    let status = '';
    article.find('strong').each((_, strongEl) => {
      const $strong = $(strongEl);
      const label = cleanText($strong.text()).replace(/:$/, '');
      const container = $strong.parent();
      if (label === 'Author(s)') {
        author = container
          .find('a')
          .map((_i, a) => cleanText($(a).text()))
          .get()
          .filter(Boolean)
          .join(', ');
      } else if (label === 'Tag(s)') {
        tags = container
          .find('span')
          .map((_i, s) => cleanText($(s).text()).replace(/,$/, ''))
          .get()
          .filter(Boolean);
      } else if (label === 'Status') {
        status = cleanText(container.find('span').first().text());
      }
    });

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/series/${mangaId}`,
      medium: 'comics',
    };
    if (author) manga.author = author;
    if (tags.length > 0) manga.tags = tags;
    if (mapStatus(status) === 'COMPLETED') manga.completed = true;
    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/search`);
      const $ = cheerio.load(html);
      const tags = [];
      $('input[id^="tag-"][id$="-value"]').each((_, el) => {
        const label = cleanText($(el).attr('value'));
        if (label) tags.push({ id: label, label });
      });
      return tags;
    } catch (e) {
      console.error('WeebCentral getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feedId = (request && request.feed) || 'latest-updates';
    const feed = FEED_BY_ID[feedId] || FEED_BY_ID['latest-updates'];
    const includedTags = (request && request.includedTags) || [];
    const excludedTags = (request && request.excludedTags) || [];
    const offset = (metadata && metadata.offset) || 0;

    const params = [`limit=${PAGE_SIZE}`, `offset=${offset}`, 'display_mode=Full+Display'];
    if (query) {
      params.push(`text=${encodeURIComponent(query)}`);
      params.push('sort=Best+Match');
      params.push('order=Descending');
    } else {
      params.push(`sort=${encodeURIComponent(feed.sort)}`);
      params.push(`order=${encodeURIComponent(feed.order)}`);
    }
    includedTags.forEach((t) => {
      if (t && t.id) params.push(`included_tag=${encodeURIComponent(t.id)}`);
    });
    excludedTags.forEach((t) => {
      if (t && t.id) params.push(`excluded_tag=${encodeURIComponent(t.id)}`);
    });

    const url = `${SITE_BASE}/search/data?${params.join('&')}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseSearchResultsPage($);
    const hasNext = $('button[hx-get*="/search/data"]').length > 0;

    return {
      results,
      metadata: results.length > 0 && hasNext ? { offset: offset + PAGE_SIZE } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const pictureImage = $('picture img').first().attr('src');
    const image = (ogImage || pictureImage || '').trim();

    const authorLI = findLI($, 'Author(s)');
    const author = authorLI
      ? authorLI
          .find('a')
          .map((_i, a) => cleanText($(a).text()))
          .get()
          .filter(Boolean)
          .join(', ')
      : '';

    const tagsLI = findLI($, 'Tags(s)');
    const tags = tagsLI
      ? tagsLI
          .find('a')
          .map((_i, a) => cleanText($(a).text()))
          .get()
          .filter(Boolean)
      : [];

    const statusLI = findLI($, 'Status');
    const status = mapStatus(statusLI ? statusLI.find('a').first().text() : '');

    const descLI = findLI($, 'Description');
    const desc = descLI ? cleanText(descLI.find('p').first().text()) : '';

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
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/full-chapter-list`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('a[href^="/chapters/"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href') || '';
      const chapterId = extractChapterId(href);
      if (!chapterId) return;

      const nameSpan = $a.find('span.grow').first().children('span').first();
      const name = cleanText(nameSpan.text());
      const dateText = $a.find('time').first().attr('datetime');
      const time = dateText ? Date.parse(dateText) : undefined;

      raw.push({ chapterId, name, time });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = parseChapterNumber(r.name);
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number };
      if (r.time !== undefined && !Number.isNaN(r.time)) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/chapters/${encodeURIComponent(chapterId)}/images`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img').each((_, img) => {
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
