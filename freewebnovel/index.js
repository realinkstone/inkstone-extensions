const SITE_BASE = 'https://freewebnovel.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CHAPTER_PAGE_SIZE = 200;
const MAX_CHAPTER_PAGES = 60;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absUrl(maybeRelative) {
  if (!maybeRelative) return undefined;
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  return `${SITE_BASE}${maybeRelative.indexOf('/') === 0 ? '' : '/'}${maybeRelative}`;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function blockText($, $el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  clone.find('script, style, h4').remove();
  clone.find('br').replaceWith('\n');

  let text = '';
  clone.contents().each((_, node) => {
    if (node.type === 'text') {
      text += node.data;
    } else {
      const inner = $(node).text();
      text += inner.trim() ? `${inner}\n\n` : '\n';
    }
  });

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasNextPage($) {
  let hasNext = false;
  $('.pages a').each((_, a) => {
    const $a = $(a);
    if (!hasNext && $a.text().trim() === '>>') {
      const href = $a.attr('href') || '';
      if (href.indexOf('javascript:') !== 0) hasNext = true;
    }
  });
  return hasNext;
}

function mapListRow($, el) {
  const $row = $(el);
  const linkEl = $row.find('.txt h3.tit a').first();
  const href = linkEl.attr('href') || '';
  const mangaId = href.replace(/^\/novel\//, '').replace(/\/$/, '');
  if (!mangaId) return null;

  const manga = {
    mangaId,
    title: cleanText(linkEl.text()) || cleanText(linkEl.attr('title')) || mangaId,
    image: absUrl($row.find('.pic img').first().attr('src')),
    webURL: absUrl(href),
    medium: 'novel',
  };

  const ratingText = $row.find('.core span').first().text().trim();
  const rating = parseFloat(ratingText);
  if (!isNaN(rating) && rating > 0) manga.rating = rating;

  $row.find('.desc .item').each((_, itemEl) => {
    const $item = $(itemEl);
    const iconClass = $item.find('span').first().attr('class') || '';
    if (iconClass.indexOf('glyphicon-th-list') !== -1) {
      const tags = [];
      $item.find('.right a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(t);
      });
      if (tags.length) manga.tags = tags;
    } else if (iconClass.indexOf('glyphicon-book') !== -1) {
      const chapterCount = parseInt($item.find('.right .s1').first().text(), 10);
      if (!isNaN(chapterCount)) manga.chapters = chapterCount;
    }
  });

  return manga;
}

function parseListing(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.li-row').each((_, el) => {
    const manga = mapListRow($, el);
    if (manga) results.push(manga);
  });
  return { $, results };
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest-novel', name: 'Latest Novels' },
      { id: 'latest-release', name: 'Latest Release' },
      { id: 'most-popular', name: 'Most Popular' },
      { id: 'completed-novel', name: 'Completed Novels' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/home`);
      const $ = cheerio.load(html);
      const seen = new Map();
      $('dl.d2 a').each((_, a) => {
        const $a = $(a);
        const href = $a.attr('href') || '';
        const m = href.match(/^\/genre\/(.+)$/);
        if (!m) return;
        const id = m[1];
        const label = cleanText($a.text());
        if (id && label && !seen.has(id)) seen.set(id, label);
      });
      return Array.from(seen, ([id, label]) => ({ id, label }));
    } catch (e) {
      console.error('FreeWebNovel getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';

    try {
      if (query) {
        const url =
          page > 1
            ? `${SITE_BASE}/search?keyword=${encodeURIComponent(query)}&page=${page}`
            : `${SITE_BASE}/search?keyword=${encodeURIComponent(query)}`;
        const html = await this.requestHTML(url);
        const { $, results } = parseListing(html);
        return { results, metadata: hasNextPage($) ? { page: page + 1 } : undefined };
      }

      const tagIds = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
      if (tagIds.length > 0) {
        const base = `/genre/${tagIds[0]}`;
        const url = page > 1 ? `${SITE_BASE}${base}/${page}` : `${SITE_BASE}${base}`;
        const html = await this.requestHTML(url);
        const { $, results } = parseListing(html);
        return { results, metadata: hasNextPage($) ? { page: page + 1 } : undefined };
      }

      const feed = (request && request.feed) || 'latest-release';
      const base = `/sort/${feed}`;
      const url = page > 1 ? `${SITE_BASE}${base}/${page}` : `${SITE_BASE}${base}`;
      const html = await this.requestHTML(url);
      const { $, results } = parseListing(html);
      return { results, metadata: hasNextPage($) ? { page: page + 1 } : undefined };
    } catch (e) {
      console.error('FreeWebNovel getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const meta = (prop) => $(`meta[property="og:novel:${prop}"]`).attr('content');
    const title = cleanText(meta('novel_name')) || cleanText($('h1.tit').first().text()) || mangaId;
    const status = mapStatus(meta('status'));

    const mangaInfo = {
      title,
      image: absUrl($('meta[property="og:image"]').attr('content')),
      desc: blockText($, $('.m-desc .txt .inner').first()) || cleanText($('meta[name="description"]').attr('content')),
      status,
      webURL: url,
      medium: 'novel',
      completed: status === 'COMPLETED',
    };

    const author = cleanText(meta('author'));
    if (author) mangaInfo.author = author;

    const genreStr = meta('genre');
    if (genreStr) {
      mangaInfo.tags = genreStr
        .split(',')
        .map((g) => cleanText(g))
        .filter(Boolean);
    }

    const latestName = meta('lastest_chapter_name') || '';
    const chapterMatch = latestName.match(/(\d+)/);
    if (chapterMatch) mangaInfo.chapters = parseInt(chapterMatch[1], 10);

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const chapters = [];
      let page = 1;
      let totalPage = 1;

      do {
        const json = await this.fetchChapterPage(mangaId, page);

        totalPage = parseInt(json.totalPage, 10) || 1;

        if (!json.html.trim()) break;

        const $ = cheerio.load(json.html);
        let added = 0;
        $('li').each((_, li) => {
          const a = $(li).find('a').first();
          const href = a.attr('href') || '';
          const chapterId = href.split('/').filter(Boolean).pop();
          if (!chapterId) return;
          const numMatch = chapterId.match(/chapter-(\d+(?:\.\d+)?)/i);
          const number = numMatch ? parseFloat(numMatch[1]) : 0;
          const name = cleanText(a.attr('title')) || cleanText(a.text()) || `Chapter ${number}`;
          chapters.push({ id: chapterId, chapterId, name, number });
          added += 1;
        });

        if (!added) {
          throw new Error(
            `FreeWebNovel: chapter page ${page} of ${mangaId} returned ${json.html.length} bytes ` +
              'of markup with no parseable chapter rows'
          );
        }

        page += 1;
      } while (page <= totalPage && page <= MAX_CHAPTER_PAGES);

      if (totalPage > MAX_CHAPTER_PAGES) {
        console.warn(
          `FreeWebNovel: ${mangaId} reports ${totalPage} chapter pages but the fetch is capped at ` +
            `${MAX_CHAPTER_PAGES}, about ${(totalPage - MAX_CHAPTER_PAGES) * CHAPTER_PAGE_SIZE} chapters not listed`
        );
      }

      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('FreeWebNovel getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const text = blockText($, $('#article').first());
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('FreeWebNovel getChapterDetails failed:', e);
      throw e;
    }
  }

  async fetchChapterPage(mangaId, page) {
    const url = `${SITE_BASE}/novel/${encodeURIComponent(
      mangaId
    )}?ajax=chapters&page=${page}&pageSize=${CHAPTER_PAGE_SIZE}`;
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let json = null;
      try {
        json = await this.requestJSON(url);
      } catch (e) {
        lastError = e;
        console.error(`FreeWebNovel chapter page ${page} request failed (attempt ${attempt}):`, e);
        continue;
      }
      if (json && json.code === 200 && typeof json.html === 'string') return json;
      lastError = new Error(
        `unexpected response envelope (code ${json && json.code}, html is ${typeof (json && json.html)})`
      );
      console.error(`FreeWebNovel chapter page ${page} unreadable (attempt ${attempt}):`, lastError);
    }

    throw new Error(
      `FreeWebNovel: chapter page ${page} of ${mangaId} still unreadable after 3 attempts: ${
        lastError && lastError.message
      }`
    );
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`FreeWebNovel HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`FreeWebNovel API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
