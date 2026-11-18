const SITE_BASE = 'https://www.katamanga.com';
const IMAGE_REFERER = `${SITE_BASE}/`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEED_SLUGS = {
  latest: 'latest-manga',
  new: 'new-manga',
  hot: 'hot-manga',
  completed: 'completed-manga',
};

function normalizeWhitespace(str) {
  return (str || '').replace(/[ \t]+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractGenreId(href) {
  const m = (href || '').match(/\/genre\/([^/?#]+)/);
  return m ? m[1] : '';
}

function parseChapterNumber(name) {
  const match = (name || '').match(/(?:ch(?:apter)?\.?\s*)?([\d.]+)/i);
  return match ? parseFloat(match[1]) : 0;
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('completed') || s.includes('ended') || s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}


const NOT_A_GENRE = { all: true };

function genreLabel(text) {
  return normalizeWhitespace((text || '').replace(/_/g, ' '));
}

function cardOf($, a) {
  const block = $(a).closest('.group');
  return block.length ? block : $(a).parent().parent();
}

function parseMangaListPage($) {
  const results = [];
  const seen = {};
  $('h3 a[href*="/manga/"]').each((_, el) => {
    const mangaId = extractMangaId($(el).attr('href'));
    if (!mangaId || seen[mangaId]) return;

    const title = normalizeWhitespace($(el).attr('title') || $(el).text());
    if (!title) return;

    const image = (cardOf($, el).find('img').first().attr('src') || '').trim();
    if (!image) return;

    seen[mangaId] = true;
    results.push({
      mangaId,
      title,
      image,
      referer: IMAGE_REFERER,
      webURL: `${SITE_BASE}/manga/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($, currentPage) {
  const nav = $('nav[aria-label="Pagination"]');
  const links = nav.length ? nav.find('a[href]') : $('a[href*="page="]');
  let next = false;
  links.each((_, a) => {
    const m = ($(a).attr('href') || '').match(/[?&]page=(\d+)/);
    if (m && parseInt(m[1], 10) > currentPage) next = true;
  });
  return next;
}

function readBookLd($) {
  let book = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (book) return;
    try {
      const data = JSON.parse($(el).contents().text() || $(el).html() || '');
      if (data && data['@type'] === 'Book') book = data;
    } catch (e) {
    }
  });
  return book;
}

function panelValue($, label) {
  let value;
  $('span').each((_, span) => {
    if (value !== undefined) return;
    if (normalizeWhitespace($(span).text()) !== label) return;
    const next = $(span).next();
    if (next.length) value = normalizeWhitespace(next.text());
  });
  return value;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'new', name: 'New Manga' },
      { id: 'hot', name: 'Hot Manga' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/genre/action`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('a[href^="/genre/"]').each((_, el) => {
        const id = extractGenreId($(el).attr('href'));
        if (!id || NOT_A_GENRE[id] || seen.has(id)) return;
        const label = genreLabel($(el).text());
        if (!label) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Mangakakalot getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      const base = `${SITE_BASE}/search?q=${encodeURIComponent(query)}`;
      url = page > 1 ? `${base}&page=${page}` : base;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const base = `${SITE_BASE}/genre/${encodeURIComponent(includedTags[0].id)}`;
      url = page > 1 ? `${base}?page=${page}` : base;
    } else {
      const base = `${SITE_BASE}/manga-list/${FEED_SLUGS[feed] || FEED_SLUGS.latest}`;
      url = page > 1 ? `${base}?page=${page}` : base;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaListPage($);
    const hasNext = results.length > 0 && hasNextPage($, page);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const book = readBookLd($) || {};

    const title = normalizeWhitespace(book.name || $('h1').first().text()) || mangaId;
    const image = (book.image || $('h1').first().closest('div').parent().find('img').first().attr('src') || $('img').first().attr('src') || '').trim();

    let author = '';
    if (Array.isArray(book.author)) {
      author = book.author.map((a) => a && a.name).filter(Boolean).join(', ');
    } else if (book.author && book.author.name) {
      author = String(book.author.name);
    }
    if (!author) author = panelValue($, 'Authors') || panelValue($, 'Author(s)') || '';
    const status = mapStatus(panelValue($, 'Status') || '');

    let tags = Array.isArray(book.genre) ? book.genre.map((g) => genreLabel(g)).filter(Boolean) : [];
    if (tags.length === 0) {
      $('a[href^="/genre/"]').each((_, a) => {
        const id = extractGenreId($(a).attr('href'));
        const t = genreLabel($(a).text());
        if (id && !NOT_A_GENRE[id] && t && tags.indexOf(t) === -1) tags.push(t);
      });
    }

    let desc = typeof book.description === 'string' ? book.description.trim() : '';
    if (!desc) {
      const first = $('a[href^="/genre/"]').not('[href="/genre/all"]').first();
      desc = normalizeWhitespace(first.parent().prev().text());
    }

    return {
      mangaInfo: {
        title,
        image,
        referer: IMAGE_REFERER,
        author: author || undefined,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const chapters = [];
    let offset = 0;
    for (let i = 0; i < 200; i++) {
      const url = `${SITE_BASE}/api/manga/${encodeURIComponent(mangaId)}/chapters?offset=${offset}`;
      const json = await this.requestJSON(url);
      const data = json && typeof json === 'object' ? json.data : null;
      const page = data && Array.isArray(data.chapters) ? data.chapters : null;
      if (!page) {
        throw new Error(
          `Mangakakalot: unreadable chapter list response for ${mangaId} at offset ${offset}`
        );
      }
      for (const c of page) {
        if (!c.chapter_slug) continue;
        const time = Date.parse(c.updated_at);
        const chapter = {
          id: c.chapter_slug,
          chapterId: c.chapter_slug,
          name: c.chapter_name,
          number: typeof c.chapter_num === 'number' ? c.chapter_num : parseChapterNumber(c.chapter_name),
        };
        if (!Number.isNaN(time)) chapter.time = time;
        chapters.push(chapter);
      }
      const hasMore = json && json.data && json.data.pagination
        ? json.data.pagination.has_more === true
        : page.length >= 50;
      if (!hasMore) break;
      offset += 50;
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const pages = this.extractPageImages(html);
    return { id: chapterId, mangaId, pages, referer: IMAGE_REFERER };
  }

  extractPageImages(html) {
    const $ = cheerio.load(html);
    const images = [];
    $('img').each((_, img) => {
      const alt = $(img).attr('alt') || '';
      const src = ($(img).attr('src') || '').trim();
      if (/\bpage \d+\b/i.test(alt) && /^https?:\/\//.test(src)) images.push(src);
    });
    return images;
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

  async requestJSON(url) {
    const text = await this.requestHTML(url);
    return JSON.parse(text);
  }
}

module.exports = { Source };
