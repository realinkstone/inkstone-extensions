const SITE_BASE = 'https://www.mangakakalot.gg';
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

function findIn($, scope, selector) {
  return scope && scope.length ? scope.find(selector) : $(selector);
}

function findLabeledLi($, scope, label) {
  const re = new RegExp('^' + label.replace(/[()]/g, '\\$&') + '\\s*:\\s*(.*)$');
  let value;
  findIn($, scope, 'li').each((_, li) => {
    if (value !== undefined) return;
    const text = normalizeWhitespace($(li).text());
    const m = text.match(re);
    if (m) value = m[1].trim();
  });
  return value;
}

function extractDesc(box) {
  if (!box || box.length === 0) return '';
  const clone = box.clone();
  clone.find('h2').remove();
  clone.find('br').replaceWith('\n');
  return normalizeWhitespace(clone.text());
}

function parseMangaListPage($) {
  const results = [];
  $('.list-comic-item-wrap').each((_, el) => {
    const card = $(el);
    const mangaId = extractMangaId(card.find('a[href*="/manga/"]').first().attr('href'));
    if (!mangaId) return;

    const title = normalizeWhitespace(card.find('h3 a').first().text());
    if (!title) return;

    const image = (card.find('img').first().attr('src') || '').trim();
    if (!image) return;

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

function parseSearchResultsPage($) {
  const results = [];
  $('.story_item').each((_, el) => {
    const card = $(el);
    const mangaId = extractMangaId(card.find('a[href*="/manga/"]').first().attr('href'));
    if (!mangaId) return;

    const title = normalizeWhitespace(card.find('h3.story_name a').first().text());
    if (!title) return;

    const image = (card.find('img').first().attr('src') || '').trim();
    if (!image) return;

    let author = '';
    card.find('span').each((_, span) => {
      if (author) return;
      const text = normalizeWhitespace($(span).text());
      const m = text.match(/^Author\(s\)\s*:\s*(.*)$/);
      if (m) author = m[1].trim();
    });

    results.push({
      mangaId,
      title,
      image,
      referer: IMAGE_REFERER,
      author: author || undefined,
      webURL: `${SITE_BASE}/manga/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function hasNextPage($, currentPage) {
  const lastEl = $('[class*="page_last"], [id*="page_last"]').first();
  if (lastEl.length) {
    const m = lastEl.text().match(/Last\((\d+)\)/);
    if (m) return currentPage < parseInt(m[1], 10);
  }
  let hasNext = false;
  $('a').each((_, a) => {
    const $a = $(a);
    if (!hasNext && $a.attr('href') && $a.text().trim() === 'Next') hasNext = true;
  });
  return hasNext;
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
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('.panel-category a[title]').each((_, el) => {
        const id = extractGenreId($(el).attr('href'));
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = normalizeWhitespace($(el).attr('title'));
        if (label) tags.push({ id, label });
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
    let parse;
    if (query) {
      const base = `${SITE_BASE}/search/story/${encodeURIComponent(query)}`;
      url = page > 1 ? `${base}?page=${page}` : base;
      parse = parseSearchResultsPage;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const base = `${SITE_BASE}/genre/${encodeURIComponent(includedTags[0].id)}`;
      url = page > 1 ? `${base}?page=${page}` : base;
      parse = parseMangaListPage;
    } else {
      const base = `${SITE_BASE}/manga-list/${FEED_SLUGS[feed] || FEED_SLUGS.latest}`;
      url = page > 1 ? `${base}?page=${page}` : base;
      parse = parseMangaListPage;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parse($);
    const hasNext = results.length > 0 && hasNextPage($, page);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const infoScope = $('.manga-info-top');

    const title = normalizeWhitespace(findIn($, infoScope, 'h1').first().text()) || mangaId;
    const image = (findIn($, infoScope, '.manga-info-pic img').first().attr('src') || '').trim();

    const author = findLabeledLi($, infoScope, 'Author(s)');
    const status = mapStatus(findLabeledLi($, infoScope, 'Status') || '');

    const tags = [];
    findIn($, infoScope, 'li.genres a').each((_, a) => {
      const t = normalizeWhitespace($(a).text());
      if (t) tags.push(t);
    });

    const desc = extractDesc($('#contentBox'));

    return {
      mangaInfo: {
        title,
        image,
        referer: IMAGE_REFERER,
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
    $('.container-chapter-reader img').each((_, img) => {
      const src = ($(img).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) images.push(src);
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
