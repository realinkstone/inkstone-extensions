const SITE_BASE = 'https://libread.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MAX_CHAPTER_LIST_PAGES = 200;

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
  const mangaId = href.replace(/^\/libread\//, '').replace(/\/$/, '');
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
  $('.li').each((_, el) => {
    const manga = mapListRow($, el);
    if (manga) results.push(manga);
  });
  return { $, results };
}

function extractChapterWindow($) {
  const chapters = [];
  $('#idData li').each((_, li) => {
    const a = $(li).find('a').first();
    const href = a.attr('href') || '';
    const chapterId = href.split('/').filter(Boolean).pop();
    if (!chapterId) return;
    const numMatch = chapterId.match(/chapter-0*(\d+(?:\.\d+)?)/i);
    const number = numMatch ? parseFloat(numMatch[1]) : 0;
    const name = cleanText(a.attr('title')) || cleanText(a.text()) || `Chapter ${number}`;
    chapters.push({ id: chapterId, chapterId, name, number });
  });
  return chapters;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest-novels', name: 'Latest Novels' },
      { id: 'latest-release', name: 'Latest Release' },
      { id: 'most-popular', name: 'Most Popular' },
      { id: 'completed-novels', name: 'Completed Novels' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(SITE_BASE);
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
      console.error('LibRead getSearchTags failed:', e);
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
            ? `${SITE_BASE}/search?searchkey=${encodeURIComponent(query)}&page=${page}`
            : `${SITE_BASE}/search?searchkey=${encodeURIComponent(query)}`;
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
      console.error('LibRead getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/libread/${encodeURIComponent(mangaId)}`;
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

    const voteText = $('.score .vote').first().text();
    const ratingMatch = voteText.match(/([\d.]+)\s*\/\s*5/);
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1]);
      if (!isNaN(rating)) mangaInfo.rating = rating;
    }

    const rangeTexts = $('#indexselect option')
      .map((_, opt) => $(opt).text())
      .get();
    if (rangeTexts.length) {
      const lastRange = rangeTexts[rangeTexts.length - 1];
      const rangeMatch = lastRange.match(/C\.\d+\s*-\s*C\.(\d+)/);
      if (rangeMatch) mangaInfo.chapters = parseInt(rangeMatch[1], 10);
    }

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const firstUrl = `${SITE_BASE}/libread/${encodeURIComponent(mangaId)}`;
      const firstHtml = await this.requestHTML(firstUrl);
      const $first = cheerio.load(firstHtml);

      const chapters = extractChapterWindow($first);

      const totalPages = Math.max(1, $first('#indexselect option').length);

      for (let page = 2; page <= totalPages && page <= MAX_CHAPTER_LIST_PAGES; page += 1) {
        const url = `${SITE_BASE}/libread/${encodeURIComponent(mangaId)}/${page}`;
        const html = await this.requestHTML(url);
        const $page = cheerio.load(html);
        chapters.push(...extractChapterWindow($page));
      }

      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('LibRead getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/libread/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const text = blockText($, $('#article').first());
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('LibRead getChapterDetails failed:', e);
      throw e;
    }
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
      throw new Error(`LibRead HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
