const SITE_BASE = 'https://lite.wuxiaworld.com';
const CANONICAL_BASE = 'https://www.wuxiaworld.com';

const CHAPTER_PAGE_LIMIT = 80;
const CHAPTER_BATCH = 5;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function normalizeForCompare(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockText($, $el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  clone.find('script, style').remove();
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

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function novelSlugFromHref(href) {
  const m = (href || '').match(/^\/novel\/([^/?#]+)/);
  return m ? m[1] : '';
}

function chapterSlugFromHref(href) {
  const m = (href || '').match(/^\/novel\/[^/]+\/([^/?#]+)/);
  return m ? m[1] : '';
}

function parseListingTag(tagText) {
  const parts = (tagText || '').split('·').map((p) => cleanText(p));
  const status = parts[0] || '';
  const genres = parts[1]
    ? parts[1]
        .split(',')
        .map((g) => cleanText(g))
        .filter(Boolean)
    : [];
  return { status, genres };
}

function parseDetailMeta(mutedText) {
  const parts = (mutedText || '').split('·').map((p) => cleanText(p)).filter(Boolean);
  const result = { status: parts[0] || '', author: undefined, chapters: undefined };
  parts.forEach((part, i) => {
    if (i === 0) return;
    const authorMatch = part.match(/^Author:\s*(.+)$/i);
    if (authorMatch) {
      result.author = cleanText(authorMatch[1]);
      return;
    }
    const chapMatch = part.match(/^([\d,]+)\s*chapters?$/i);
    if (chapMatch) {
      result.chapters = parseInt(chapMatch[1].replace(/,/g, ''), 10);
    }
  });
  return result;
}

function parseNovelGrid($) {
  const results = [];
  $('table.novel-grid td.novel-cell').each((_, el) => {
    const $el = $(el);
    const href = $el.find('p.title a').first().attr('href') || $el.find('a.cover').first().attr('href') || '';
    const mangaId = novelSlugFromHref(href);
    if (!mangaId) return;

    const title = cleanText($el.find('p.title a').first().text()) || mangaId;
    const image = ($el.find('a.cover img').first().attr('src') || '').trim();
    const { status, genres } = parseListingTag(cleanText($el.find('p.tag').first().text()));
    const summary = cleanText($el.find('p.syn').first().text());

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${CANONICAL_BASE}/novel/${mangaId}`,
      medium: 'novel',
    };
    if (summary) manga.summary = summary;
    if (genres.length) manga.tags = genres;
    if (/completed/i.test(status)) manga.completed = true;
    results.push(manga);
  });
  return results;
}

function nextAfterCursor($) {
  const href = $('.pager a.next').first().attr('href') || '';
  const m = href.match(/[?&]after=([^&]+)/);
  return m ? m[1] : undefined;
}

function totalTocPages($) {
  const text = cleanText($('.pager .small.muted').first().text());
  const m = text.match(/Page\s+\d+\s+of\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 1;
}

function withToc(url, page) {
  if (!page || page <= 1) return url;
  return `${url}?toc=${page}`;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'new', name: 'Newest' },
      { id: 'chapters', name: 'Most Chapters' },
      { id: 'name', name: 'Name' },
      { id: 'rating', name: 'Rating' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'popular';
    const after = metadata && metadata.after;

    const url = `${SITE_BASE}/novels?${qs({ q: query || undefined, sort: feed, after })}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const results = parseNovelGrid($);
    const nextAfter = nextAfterCursor($);

    const madeProgress = nextAfter !== undefined && nextAfter !== after;
    const nextMetadata = results.length > 0 && madeProgress ? { after: nextAfter } : undefined;

    return { results, metadata: nextMetadata };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.novel-head h1').first().text()) || mangaId;
    const image = ($('.novel-head .cover img').first().attr('src') || '').trim();
    const meta = parseDetailMeta(cleanText($('.novel-head .muted.small').first().text()));
    const desc = blockText($, $('.chapter-body').first());

    const mangaInfo = {
      mangaId,
      title,
      image,
      desc,
      status: mapStatus(meta.status),
      webURL: `${CANONICAL_BASE}/novel/${mangaId}`,
      medium: 'novel',
    };
    if (meta.author) mangaInfo.author = meta.author;
    if (meta.chapters && isFinite(meta.chapters)) mangaInfo.chapters = meta.chapters;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const baseUrl = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}`;
    const first = await this.requestHTML(baseUrl);
    const $first = cheerio.load(first);
    const lastPage = Math.min(totalTocPages($first), CHAPTER_PAGE_LIMIT);

    const htmlByPage = { 1: first };
    let pending = [];
    for (let page = 2; page <= lastPage; page += 1) pending.push(page);

    for (let round = 0; round < 3 && pending.length; round += 1) {
      const width = round === 0 ? CHAPTER_BATCH : 1;
      const failed = [];
      for (let i = 0; i < pending.length; i += width) {
        await Promise.all(
          pending.slice(i, i + width).map((page) =>
            this.requestHTML(withToc(baseUrl, page))
              .then((html) => {
                htmlByPage[page] = html;
              })
              .catch((e) => {
                console.error(`Wuxiaworld chapters page ${page} failed:`, e);
                failed.push(page);
              })
          )
        );
      }
      pending = failed.sort((a, b) => a - b);
    }
    if (pending.length) {
      throw new Error(
        `Wuxiaworld: ${pending.length} of ${lastPage} chapter-list pages for ${mangaId} ` +
          `still unavailable after retries (pages ${pending.join(', ')}); refusing to return a partial chapter list`
      );
    }

    const pageSize = $first('ul.toc a').length || 100;
    const chapters = [];
    const seen = {};
    for (let page = 1; page <= lastPage; page += 1) {
      const html = htmlByPage[page];
      if (!html) continue;
      const $$ = cheerio.load(html);
      const base = (page - 1) * pageSize;
      $$('ul.toc a').each((index, el) => {
        const $a = $$(el);
        const href = $a.attr('href') || '';
        const chapterId = chapterSlugFromHref(href);
        if (!chapterId || seen[chapterId]) return;
        seen[chapterId] = true;

        const name = cleanText($a.text()) || chapterId;
        chapters.push({ id: chapterId, chapterId, name, number: base + index });
      });
    }

    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);

      const $body = $('#chapter-body').first();
      if ($body.length === 0) {
        const notice = cleanText($('.notice').first().text());
        return {
          id: chapterId,
          mangaId,
          pages: [],
          text: notice || 'This chapter requires a Wuxiaworld account. Sign in on the full website to continue reading.',
        };
      }

      const title = cleanText($('#chapter-title').first().text());
      const normalizedTitle = normalizeForCompare(title);
      if (normalizedTitle) {
        const $firstPara = $body.children('p').first();
        if ($firstPara.length && normalizeForCompare($firstPara.text()) === normalizedTitle) {
          $firstPara.remove();
        }
      }

      const text = blockText($, $body);
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('Wuxiaworld getChapterDetails failed:', e);
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
      throw new Error(`Wuxiaworld HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
