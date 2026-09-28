const SITE_BASE = 'https://novelfull.net';
const CHAPTER_PAGE_LIMIT = 160;
const CHAPTER_BATCH = 5;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function absolute(path) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : `${SITE_BASE}${path.charAt(0) === '/' ? '' : '/'}${path}`;
}

function withPage(url, page) {
  if (!page || page <= 1) return url;
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}page=${page}`;
}

function slugFromHref(href) {
  const path = (href || '').split('?')[0].split('#')[0];
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return last.replace(/\.html$/i, '');
}

function chapterNumberFromId(id) {
  const m = String(id || '').match(/^chapter-(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseMangaList($) {
  const results = [];
  $('.col-truyen-main .list-truyen .row').each((_, el) => {
    const $el = $(el);
    const link = $el.find('h3.truyen-title a').first();
    const href = link.attr('href') || '';
    const mangaId = slugFromHref(href);
    if (!mangaId) return;

    const title = cleanText(link.attr('title') || link.text()) || mangaId;
    const image = absolute(($el.find('img.cover').first().attr('src') || '').trim());
    const author = cleanText($el.find('.author').first().text());
    const completed = $el.find('.label-title.label-full').length > 0;

    const infoText = cleanText($el.find('.col-xs-2').first().text());
    const chapMatch = infoText.match(/(\d[\d,]*)\s*Chapters?|Chapter\s+([\d,]+)/i);
    const chapters = chapMatch ? parseInt((chapMatch[1] || chapMatch[2]).replace(/,/g, ''), 10) : undefined;

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: `${SITE_BASE}/${mangaId}.html`,
      medium: 'novel',
    };
    if (author) manga.author = author;
    if (completed) manga.completed = true;
    if (chapters && isFinite(chapters)) manga.chapters = chapters;
    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  const $next = $('.pagination-container .pagination li.next').first();
  return $next.length > 0 && !$next.hasClass('disabled');
}

function blockText($, $el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  clone.find('script, style, iframe, ins, .ads, .ads-holder').remove();
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

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest-release-novel', name: 'Latest Release' },
      { id: 'hot-novel', name: 'Hot Novel' },
      { id: 'completed-novel', name: 'Completed Novel' },
      { id: 'most-popular', name: 'Most Popular' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(SITE_BASE + '/');
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('a[href^="/genre/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/^\/genre\/([^/?#]+)/);
        if (!m || seen[m[1]]) return;
        seen[m[1]] = true;
        const label = cleanText($(el).attr('title') || $(el).text());
        if (label) tags.push({ id: m[1], label });
      });
      return tags;
    } catch (e) {
      console.error('NovelFull getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;
    const tagId =
      request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
    const feed = (request && request.feed) || 'latest-release-novel';

    let url;
    if (query) {
      url = withPage(`${SITE_BASE}/search?${qs({ keyword: query })}`, page);
    } else if (tagId) {
      url = withPage(`${SITE_BASE}/genre/${tagId}`, page);
    } else {
      url = withPage(`${SITE_BASE}/${feed}`, page);
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);

    return {
      results,
      metadata: results.length > 0 && hasNextPage($) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}.html`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h3.title').first().text()) || mangaId;
    const image = absolute(($('.info-holder .book img').first().attr('src') || '').trim());
    const author = cleanText($('.info-holder .info a[href^="/author/"]').first().text());

    const tags = [];
    $('.info-holder .info a[href^="/genre/"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const status = mapStatus(cleanText($('.info-holder .info a[href^="/status/"]').first().text()));

    const ratingAttr = $('#rateVal').attr('value');
    const rating = ratingAttr ? parseFloat(ratingAttr) : undefined;

    const desc = blockText($, $('.desc-text').first());

    const mangaInfo = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'novel',
    };
    if (author) mangaInfo.author = author;
    if (rating && isFinite(rating)) mangaInfo.rating = rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const baseUrl = `${SITE_BASE}/${encodeURIComponent(mangaId)}.html`;
    const first = await this.requestHTML(baseUrl);
    const $first = cheerio.load(first);

    let lastPage = 1;
    $first('#list-chapter .pagination a[href*="page="]').each((_, el) => {
      const href = $first(el).attr('href') || '';
      const m = href.match(/[?&]page=(\d+)/);
      if (m) lastPage = Math.max(lastPage, parseInt(m[1], 10));
    });
    lastPage = Math.min(lastPage, CHAPTER_PAGE_LIMIT);

    const htmlByPage = { 1: first };
    let pending = [];
    for (let page = 2; page <= lastPage; page += 1) pending.push(page);

    for (let round = 0; round < 3 && pending.length; round += 1) {
      const width = round === 0 ? CHAPTER_BATCH : 1;
      const failed = [];
      for (let i = 0; i < pending.length; i += width) {
        await Promise.all(
          pending.slice(i, i + width).map((page) =>
            this.requestHTML(withPage(baseUrl, page))
              .then((html) => {
                htmlByPage[page] = html;
              })
              .catch((e) => {
                console.error(`NovelFull chapters page ${page} failed:`, e);
                failed.push(page);
              })
          )
        );
      }
      pending = failed.sort((a, b) => a - b);
    }
    if (pending.length) {
      throw new Error(
        `NovelFull: ${pending.length} of ${lastPage} chapter pages unavailable for ${mangaId} ` +
          `after retries (pages ${pending.join(', ')}), about ${pending.length * 50} chapters missing`
      );
    }

    const chapters = [];
    const seen = {};
    for (let page = 1; page <= lastPage; page += 1) {
      const html = htmlByPage[page];
      if (!html) continue;
      const $$ = cheerio.load(html);
      $$('#list-chapter ul.list-chapter a').each((_, el) => {
        const $a = $$(el);
        const href = $a.attr('href') || '';
        const chapterId = slugFromHref(href);
        if (!chapterId || seen[chapterId]) return;
        seen[chapterId] = true;

        const name =
          cleanText($a.find('.chapter-text').text()) || cleanText($a.attr('title')) || chapterId;
        chapters.push({
          id: chapterId,
          chapterId,
          name,
          number: chapterNumberFromId(chapterId),
        });
      });
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}.html`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const text = blockText($, $('#chapter-content').first());
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('NovelFull getChapterDetails failed:', e);
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
      throw new Error(`NovelFull HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
