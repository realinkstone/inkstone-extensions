const SITE_BASE = 'https://manhwahq.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEED_SORT = {
  latest: undefined,
  popular: 'popular',
  rating: 'rating',
  az: 'alphabetical',
};

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

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

function parseReleaseDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS[m[1]];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return Date.UTC(year, mon, day);
}

function chapterIdToNumber(chapterId) {
  const m = (chapterId || '').match(/chapter-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function mangaIdFromHref(href) {
  const m = (href || '').match(/^\/title\/([^/?#]+)\/?(?:[?#]|$)/);
  return m ? m[1] : '';
}

function encodePiece(piece) {
  let raw = piece || '';
  try {
    raw = decodeURIComponent(raw);
  } catch (e) {
  }
  return encodeURIComponent(raw);
}

function isPlainNumberBasename(url) {
  const base = (url.split('/').pop() || '').replace(/\.[a-zA-Z0-9]+$/, '');
  return /^\d+$/.test(base);
}

function stripTrailingCreditImage(pages) {
  if (pages.length < 2) return pages;
  const allButLast = pages.slice(0, -1);
  if (allButLast.every(isPlainNumberBasename) && !isPlainNumberBasename(pages[pages.length - 1])) {
    return allButLast;
  }
  return pages;
}

function parseCards($) {
  const results = [];
  const seen = new Set();

  $('a[href^="/title/"]').each((_, el) => {
    const $el = $(el);
    const mangaId = mangaIdFromHref($el.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;

    const h3 = $el.find('h3').first();
    if (h3.length === 0) return;
    const title = cleanText(h3.text());
    if (!title) return;

    const image = ($el.find('img').first().attr('src') || '').trim();
    if (!image) return;

    seen.add(mangaId);

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/title/${mangaId}`,
      medium: 'comics',
    };

    if ($el.text().indexOf('18+ Adult') !== -1) manga.ageRating = 18;

    const typeText = cleanText(
      $el.find('span.font-medium.tracking-wide.leading-none').first().text()
    );
    if (typeText) manga.tags = [typeText];

    $el.find('span').each((__, span) => {
      const chapMatch = cleanText($(span).text()).match(/^Ch\.?\s*(\d+(?:\.\d+)?)$/);
      if (!chapMatch) return;
      manga.chapters = parseFloat(chapMatch[1]);
      return false;
    });

    results.push(manga);
  });

  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
      { id: 'popular', name: 'Most Popular' },
      { id: 'rating', name: 'Top Rated' },
      { id: 'az', name: 'A-Z' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/browse`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('a[href^="/browse?genre="]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/genre=([^&]+)/);
        if (!m) return;
        const id = decodeURIComponent(m[1]);
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text()) || id;
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('ManhwaHQ getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feedId = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    const params = { page };
    if (query) params.search = query;
    const sortParam = FEED_SORT[feedId];
    if (sortParam) params.sort = sortParam;
    if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      params.genre = includedTags[0].id;
    }

    const url = `${SITE_BASE}/browse?${qs(params)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseCards($);

    return { results, metadata: results.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/title/${encodePiece(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1').first().text()) || mangaId;
    const image = ($('meta[property="og:image"]').attr('content') || '').trim();

    const desc = this.extractDescription($);
    const author = this.fieldValue($, 'Author');
    const status = mapStatus(this.fieldValue($, 'Status'));

    const tags = [];
    const seenTags = new Set();
    $('a[href^="/browse?genre="][title^="Filter by "]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && !seenTags.has(t)) {
        seenTags.add(t);
        tags.push(t);
      }
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

    if (tags.indexOf('Adult') !== -1) mangaInfo.ageRating = 18;
    else if (tags.indexOf('Mature') !== -1) mangaInfo.ageRating = 16;

    return { mangaInfo };
  }

  extractDescription($) {
    const raw = $('script[type="application/ld+json"]').first().html();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const comic = list.find((x) => x && x['@type'] === 'ComicSeries');
        if (comic && comic.description) {
          return cleanText(String(comic.description).split(/\s-{3}\s/)[0]);
        }
      } catch (e) {
      }
    }
    return cleanText($('meta[name="description"]').attr('content') || '');
  }

  fieldValue($, label) {
    let value = '';
    $('span').each((_, el) => {
      const t = cleanText($(el).text());
      if (t === label) {
        const next = $(el).next('span');
        value = cleanText(next.attr('title') || next.text());
        return false;
      }
    });
    return value;
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/title/${encodePiece(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    const seen = new Set();
    $('a.py-4.group').each((_, el) => {
      const $el = $(el);
      const m = ($el.attr('href') || '').match(/^\/title\/[^/?#]+\/([^/?#]+)/);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const chapterId = m[1];

      const name = cleanText($el.find('span.text-zinc-100').first().text());
      const dateText = cleanText($el.find('span.whitespace-nowrap').first().text());
      raw.push({ chapterId, name, dateText });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = {
        id: r.chapterId,
        chapterId: r.chapterId,
        name: r.name || r.chapterId,
        number: chapterIdToNumber(r.chapterId),
      };
      const time = parseReleaseDate(r.dateText);
      if (time !== undefined) chapter.time = time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/title/${encodePiece(mangaId)}/${encodePiece(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const found = [];
    $('img[id^="page-"]').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) found.push(src);
    });
    const pages = stripTrailingCreditImage(found);
    if (pages.length === 0) throw new Error('ManhwaHQ: no pages found in this chapter');

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
