const SITE_BASE = 'https://mangatoon.mobi';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 18;
const FEED_SORT = { hottest: 0, updated: 1, completed: 2 };

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function normalizeWhitespace(text) {
  return (text || '').replace(/[ \t]+/g, ' ').trim();
}

function parseAbbreviatedCount(text) {
  const m = (text || '').match(/([\d,.]+)\s*([KMB])?/i);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(n)) return undefined;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(n * mult);
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('drop')) return 'CANCELLED';
  if (s.includes('going') || s.includes('ongoing')) return 'ONGOING';
  return 'UNKNOWN';
}

function undoAddslashes(str) {
  return str.replace(/\\(.)/g, (_, c) => (c === '0' ? ' ' : c));
}

function extractEpisodes(html) {
  const m = /data\s*=\s*JSON\.parse\('([\s\S]*?)'\);/.exec(html);
  if (!m) {
    if (/contributor-app-read/.test(html)) {
      console.warn(
        'Mangatoon: this title is Contributor-only content with no web-readable episode list (app-only); returning an empty chapter list'
      );
      return [];
    }
    const message = 'Mangatoon: the embedded `data = JSON.parse(...)` episode block is missing from this page';
    console.error(message);
    throw new Error(message);
  }
  let arr;
  try {
    arr = JSON.parse(undoAddslashes(m[1]));
  } catch (e) {
    console.error('Mangatoon: embedded episode JSON failed to parse after undoing addslashes:', e);
    throw e;
  }
  if (!Array.isArray(arr)) {
    const message = `Mangatoon: embedded episode data parsed to ${typeof arr}, not an array`;
    console.error(message);
    throw new Error(message);
  }
  return arr;
}

function parseOpenAt(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return undefined;
  return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function chapterDisplayName(ep) {
  const base = (ep.title && cleanText(ep.title)) || `Episode ${ep.weight}`;
  return ep.is_fee ? `${base} (Locked, Coins)` : base;
}

function extractContentId(href) {
  const m = /content_id=(\d+)/.exec(href || '');
  return m ? m[1] : undefined;
}

function parseGridItem($, el, opts) {
  const $a = $(el).is('a') ? $(el) : $(el).find('a').first();
  const href = $a.attr('href') || '';
  const mangaId = extractContentId(href);
  if (!mangaId) return null;

  const image = ($(el).find('.comics-image img, .content-image img').first().attr('data-src') || '').trim();
  const titleFromNode = cleanText($(el).find(opts.titleSel).first().text());
  const title = titleFromNode || cleanText($(el).find('img').first().attr('alt')) || undefined;

  const tagsText = cleanText($(el).find(opts.tagsSel).first().text());
  const tags = tagsText ? tagsText.split('/').map((t) => t.trim()).filter(Boolean) : [];

  const manga = { mangaId, title, image, tags, webURL: href, medium: 'comics' };

  const chaptersText = cleanText($(el).find('.open-episode-count').first().text());
  const chapMatch = /(\d+)/.exec(chaptersText);
  if (chapMatch) manga.chapters = parseInt(chapMatch[1], 10);

  const viewsText = cleanText($(el).find('.watch-count').first().text());
  const views = parseAbbreviatedCount(viewsText);
  if (views !== undefined) manga.views = views;

  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'hottest', name: 'Hottest' },
      { id: 'updated', name: 'Updated' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    const html = await this.requestHTML(`${SITE_BASE}/en/genre/comic`);
    const $ = cheerio.load(html);
    const tags = [];
    const seen = new Set();
    $('a.channel-a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = /^\/en\/genre\/category\/(\d+)\/0$/.exec(href);
      if (!m) return;
      const id = m[1];
      if (id === '0' || seen.has(id)) return;
      const label = cleanText($(el).find('span').first().text());
      if (!label) return;
      seen.add(id);
      tags.push({ id, label });
    });
    return tags;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const title = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;

    if (title) {
      if (page > 1) return { results: [] };

      const url = `${SITE_BASE}/en/search?word=${encodeURIComponent(title)}`;
      const html = await this.requestHTML(url, { allow404: true });
      if (!html) return { results: [] };

      const $ = cheerio.load(html);
      const results = [];
      $('.comics-result .recommend-item').each((_, el) => {
        const item = parseGridItem($, el, {
          titleSel: '.recommend-comics-title span',
          tagsSel: '.comics-type span',
        });
        if (item) results.push(item);
      });
      return { results };
    }

    const includedTags = (request && request.includedTags) || [];
    const tagId = includedTags[0] && includedTags[0].id ? String(includedTags[0].id) : '0';
    const feedId = (request && request.feed) || 'hottest';
    const sort = FEED_SORT[feedId] !== undefined ? FEED_SORT[feedId] : 0;

    const url = `${SITE_BASE}/en/genre/category/${encodeURIComponent(tagId)}/${sort}?page=${page}`;
    const html = await this.requestHTML(url, { allow404: true });
    if (!html) return { results: [] };

    const $ = cheerio.load(html);
    const results = [];
    $('.genre-content .items > a').each((_, el) => {
      const item = parseGridItem($, el, {
        titleSel: '.content-info .content-title-2 span',
        tagsSel: '.content-info .tags span',
      });
      if (item) results.push(item);
    });

    const hasNext = results.length >= PAGE_SIZE;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/en/x?content_id=${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.detail-title').first().text());

    const detailImg = ($('.detail-img img').first().attr('src') || '').trim();
    const ogImage = ($('meta[property="og:image"]').attr('content') || '').trim();
    const image = detailImg || ogImage;

    const status = mapStatus($('.detail-status').first().text());

    const tags = [];
    $('.detail-tags-info a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const authorRaw = cleanText($('.detail-author-name').first().text());
    const author = authorRaw.replace(/^Author Name:\s*/i, '').trim() || undefined;

    const $descEl = $('.detail-description-short').first().clone();
    $descEl.find('br').replaceWith('\n');
    const desc = normalizeWhitespace($descEl.text());

    const views = parseAbbreviatedCount($('.view-count').first().text());
    const ratingText = cleanText($('.detail-score-points').first().text());
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    const ogUrl = ($('meta[property="og:url"]').attr('content') || '').trim();

    const mangaInfo = {
      mangaId,
      title: title || mangaId,
      image,
      author,
      desc,
      status,
      tags,
      webURL: ogUrl || url,
      medium: 'comics',
    };
    if (views !== undefined) mangaInfo.views = views;
    if (rating !== undefined && !Number.isNaN(rating)) mangaInfo.rating = rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/en/x?content_id=${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const episodes = extractEpisodes(html);

    return episodes.map((ep) => {
      const chapter = {
        id: String(ep.id),
        name: chapterDisplayName(ep),
        number: ep.weight,
      };
      const time = parseOpenAt(ep.open_at);
      if (time !== undefined) chapter.time = time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/en/watch/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.pictures .lazyload_img_box img.lazyload_img').each((_, el) => {
      const src = ($(el).attr('data-src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
    });

    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url, opts) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA },
    });
    const response = await manager.schedule(request);
    if (opts && opts.allow404 && response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
