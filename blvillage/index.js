const SITE_BASE = 'https://blvillage.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 24;

const MAX_CATEGORY_MATCHES = 3;
const MAX_CATEGORY_DICT_MATCHES = 20;

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absolutize(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.indexOf('//') === 0) return `https:${trimmed}`;
  if (trimmed.indexOf('/') === 0) return `${SITE_BASE}${trimmed}`;
  return trimmed;
}

function mapStatus(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'COMPLETED';
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled' || s === 'dropped') return 'CANCELLED';
  return 'UNKNOWN';
}

function decodeIslandValue(node) {
  if (Array.isArray(node)) {
    if (node.length === 2 && typeof node[0] === 'number') {
      const tag = node[0];
      const payload = node[1];
      if (tag === 1 && Array.isArray(payload)) {
        return payload.map(decodeIslandValue);
      }
      return decodeIslandValue(payload);
    }
    return node.map(decodeIslandValue);
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) {
        out[key] = decodeIslandValue(node[key]);
      }
    }
    return out;
  }
  return node;
}

function formatEpisodePage(format, n) {
  return (format || '').replace(/%0(\d)d/, (_, width) => String(n).padStart(parseInt(width, 10), '0'));
}

function totalFromText(html, re) {
  const m = html.match(re);
  return m ? parseInt(m[1], 10) : null;
}

function parseWorksGrid($, root) {
  const results = [];
  if (!root || root.length === 0) return results;
  root.find('a[href^="/works/"]').each((_, a) => {
    const $a = $(a);
    const href = ($a.attr('href') || '').trim();
    const m = href.match(/^\/works\/([^/?#]+)/);
    if (!m) return;
    const mangaId = decodeURIComponent(m[1]);
    const article = $a.find('article').first();
    const img = $a.find('img').first();
    const image = absolutize(img.attr('src') || '');
    const wrap = article.children('div').first();

    let title = '';
    let chapterCount;
    wrap.children('div').each((__, d) => {
      const $d = $(d);
      const cls = $d.attr('class') || '';
      if (cls.indexOf('badge-row') !== -1 || cls.indexOf('created-date') !== -1) return;
      const t = cleanText($d.text());
      if (!t) return;
      const chMatch = t.match(/^(\d+)\s+chapters?$/i);
      if (chMatch) {
        chapterCount = parseInt(chMatch[1], 10);
        return;
      }
      if (!title) title = t;
    });
    if (!title) title = cleanText(img.attr('alt') || '') || mangaId;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/works/${mangaId}`,
      medium: 'comics',
    };
    if (typeof chapterCount === 'number') manga.chapters = chapterCount;
    results.push(manga);
  });
  return results;
}

function parsePopularStrip($) {
  const results = [];
  $('.popular-strip a.popular-card').each((_, a) => {
    const $a = $(a);
    const href = ($a.attr('href') || '').trim();
    const m = href.match(/^\/works\/([^/?#]+)/);
    if (!m) return;
    const mangaId = decodeURIComponent(m[1]);
    const image = absolutize($a.find('img').first().attr('src') || '');
    const title = cleanText($a.find('.popular-card-title').text()) || mangaId;
    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/works/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

const FEEDS = [
  { id: 'doujin', name: 'Doujin (All)' },
  { id: 'popular', name: 'Popular Doujin' },
  { id: 'original', name: 'Original' },
  { id: 'latest', name: 'Latest Updates' },
];
const DEFAULT_FEED = 'doujin';

class Source {
  getSourceFeeds() {
    return FEEDS;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const title = cleanText((request && request.title) || '');
    const page = (metadata && metadata.page) || 1;

    if (title) {
      return this.searchResults(title, page);
    }

    const requestedFeed = request && request.feed;
    const feedId = FEEDS.some((f) => f.id === requestedFeed) ? requestedFeed : DEFAULT_FEED;
    return this.browseFeed(feedId, page);
  }

  async browseFeed(feedId, page) {
    if (feedId === 'popular') {
      if (page > 1) return { results: [] };
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      return { results: parsePopularStrip($) };
    }

    if (feedId === 'original') {
      const html = await this.requestHTML(`${SITE_BASE}/original?${qs({ page })}`);
      const $ = cheerio.load(html);
      const results = parseWorksGrid($, $('.works-grid').first());
      const total = totalFromText(html, /Total works:\s*(\d+)/);
      const hasNext = total !== null && page * PAGE_SIZE < total;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    if (feedId === 'latest') {
      const html = await this.requestHTML(`${SITE_BASE}/latest?${qs({ page })}`);
      const $ = cheerio.load(html);
      const results = parseWorksGrid($, $('.works-grid').first());
      const total = totalFromText(html, /Showing:\s*(\d+)/);
      const hasNext = total !== null && page * PAGE_SIZE < total;
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    const url = page === 1 ? `${SITE_BASE}/` : `${SITE_BASE}/?${qs({ page })}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseWorksGrid($, $('.works-grid').first());
    const total = totalFromText(html, /Total works:\s*(\d+)/);
    const hasNext = total !== null && page * PAGE_SIZE < total;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async searchResults(title, page) {
    const html = await this.requestHTML(`${SITE_BASE}/original?${qs({ q: title, page })}`);
    const $ = cheerio.load(html);
    let results = parseWorksGrid($, $('.works-grid').first());
    const total = totalFromText(html, /Search results:\s*(\d+)/);
    const hasNext = total !== null && page * PAGE_SIZE < total;

    if (page === 1) {
      const bonus = await this.searchCategoryBonus(title);
      if (bonus.length > 0) results = bonus.concat(results);
    }

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async searchCategoryBonus(title) {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/search`);
      const $ = cheerio.load(html);
      const dictEl = $('#category-dict').first();
      if (dictEl.length === 0) return [];

      const dict = JSON.parse(dictEl.text() || '{}');
      const normalizeForMatch = (s) => (s || '').toLowerCase().replace(/[\s_-]+/g, '');
      const needle = normalizeForMatch(title);
      const matches = needle
        ? Object.keys(dict).filter(
            (key) => normalizeForMatch(key).indexOf(needle) !== -1 || normalizeForMatch(String(dict[key])).indexOf(needle) !== -1
          )
        : [];
      if (matches.length === 0 || matches.length > MAX_CATEGORY_DICT_MATCHES) return [];

      const out = [];
      const seen = new Set();
      for (const key of matches.slice(0, MAX_CATEGORY_MATCHES)) {
        const slug = dict[key];
        try {
          const catHtml = await this.requestHTML(`${SITE_BASE}/category/${encodeURIComponent(slug)}`);
          const $$ = cheerio.load(catHtml);
          parseWorksGrid($$, $$('.works-grid').first()).forEach((item) => {
            if (seen.has(item.mangaId)) return;
            seen.add(item.mangaId);
            out.push(item);
          });
        } catch (e) {
        }
      }
      return out;
    } catch (e) {
      console.warn('blvillage: category search bonus failed: ' + (e && e.message));
      return [];
    }
  }

  async getMangaDetails(mangaId) {
    if (mangaId.indexOf('series-') === 0) {
      return this.getSeriesMangaDetails(mangaId);
    }
    return this.getDoujinMangaDetails(mangaId);
  }

  async getSeriesMangaDetails(mangaId) {
    const url = `${SITE_BASE}/works/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.series-hero-meta h2').first().text()) || mangaId;
    const image = absolutize($('.series-hero-thumb').first().attr('src') || '');
    const paragraphs = $('.series-hero-meta p');
    const desc = paragraphs.length > 1 ? cleanText(paragraphs.eq(1).text()) : '';
    const tags = [];
    $('a[href^="/tag/"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const mangaInfo = {
      title,
      image,
      desc,
      status: 'UNKNOWN',
      tags,
      webURL: url,
      medium: 'comics',
    };
    return { mangaInfo };
  }

  async getDoujinMangaDetails(mangaId) {
    const { $, work } = await this.fetchDoujinWork(mangaId);
    const title = cleanText(work.title) || cleanText($('h2.reader-title').first().text()) || mangaId;
    const image = absolutize(work.imageUrl || work.thumbnailUrl || '');
    let desc = cleanText(work.description || '');
    if (!desc) desc = cleanText($('meta[name="description"]').attr('content') || '');

    const tags = [];
    const seenTags = new Set();
    const addTag = (raw) => {
      const t = cleanText(raw);
      if (t && !seenTags.has(t)) {
        seenTags.add(t);
        tags.push(t);
      }
    };
    (Array.isArray(work.tags) ? work.tags : []).forEach(addTag);
    (Array.isArray(work.pairing) ? work.pairing : []).forEach(addTag);

    const status = mapStatus(work.status);
    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: `${SITE_BASE}/works/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (status === 'COMPLETED') mangaInfo.completed = true;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    if (mangaId.indexOf('series-') === 0) {
      const { chapters } = await this.fetchSeriesWork(mangaId);
      return chapters
        .filter((c) => c && c.slug)
        .map((c) => {
          const numMatch = String(c.slug).match(/(\d+)/);
          const number = numMatch ? parseInt(numMatch[1], 10) : 0;
          return { id: c.slug, name: `Chapter ${number}`, number };
        });
    }

    const { $, work } = await this.fetchDoujinWork(mangaId);
    const episodes = Array.isArray(work.episodes) ? work.episodes : [];
    if (episodes.length > 0) {
      const time = Date.parse(work.createdAt || '');
      return episodes.map((ep, idx) => {
        const chapter = {
          id: `episode-${idx + 1}`,
          name: cleanText(ep && ep.title) || `Episode ${idx + 1}`,
          number: idx + 1,
        };
        if (!Number.isNaN(time)) chapter.time = time;
        return chapter;
      });
    }

    const rawPages = this.rawReaderPages($);
    if (rawPages.length === 0) return [];
    return [{ id: 'episode-1', name: 'Episode 1', number: 1 }];
  }

  async getChapterDetails(mangaId, chapterId) {
    if (mangaId.indexOf('series-') === 0) {
      const { chapters } = await this.fetchSeriesWork(mangaId);
      const chapter = chapters.find((c) => c && c.slug === chapterId);
      const pages = chapter && Array.isArray(chapter.pages) ? chapter.pages.map(absolutize) : [];
      return { id: chapterId, mangaId, pages };
    }

    const { $, work } = await this.fetchDoujinWork(mangaId);
    const episodes = Array.isArray(work.episodes) ? work.episodes : [];
    const numMatch = String(chapterId || '').match(/(\d+)/);
    const idx = numMatch ? parseInt(numMatch[1], 10) - 1 : 0;

    if (episodes.length > 0 && episodes[idx]) {
      const format = work.episodeFormat || '';
      let offset = 0;
      for (let i = 0; i < idx; i++) {
        offset += typeof episodes[i].pageCount === 'number' ? episodes[i].pageCount : 0;
      }
      const count = typeof episodes[idx].pageCount === 'number' ? episodes[idx].pageCount : 0;
      const pages = [];
      for (let p = 1; p <= count; p++) {
        pages.push(formatEpisodePage(format, offset + p));
      }
      return { id: chapterId, mangaId, pages };
    }

    return { id: chapterId, mangaId, pages: this.rawReaderPages($) };
  }

  rawReaderPages($) {
    const found = [];
    $('.reader-inline img, #vertical-reader img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) found.push(src);
    });
    return found;
  }

  async fetchSeriesWork(mangaId) {
    const url = `${SITE_BASE}/works/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const scriptEl = $('#chapter-data-json').first();
    let chapters = [];
    if (scriptEl.length > 0) {
      try {
        chapters = JSON.parse(scriptEl.text() || '[]');
      } catch (e) {
        console.error('BLVillage: #chapter-data-json failed to parse for', mangaId, e);
        throw new Error(`BLVillage: unreadable chapter payload for ${mangaId}`);
      }
      if (!Array.isArray(chapters)) {
        console.error('BLVillage: #chapter-data-json was not an array for', mangaId);
        throw new Error(`BLVillage: unexpected chapter payload shape for ${mangaId}`);
      }
    }
    return { $, chapters };
  }

  async fetchDoujinWork(mangaId) {
    const url = `${SITE_BASE}/works/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    let work = null;
    $('astro-island[props]').each((_, el) => {
      if (work) return false;
      const raw = $(el).attr('props');
      if (!raw || raw.indexOf('episodeFormat') === -1) return undefined;
      try {
        const decoded = decodeIslandValue(JSON.parse(raw));
        if (decoded && decoded.work) work = decoded.work;
      } catch (e) {
      }
      return undefined;
    });
    return { $, work: work || {} };
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
