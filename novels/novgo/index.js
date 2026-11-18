const SITE = 'https://novgo.net';
const CHAPTER_PAGE_SIZE = 100;
const CHAPTER_CONCURRENCY = 3;
const INDEX_CONCURRENCY = 3;
const INDEX_CONCURRENCY_BACKGROUND = 2;
const INDEX_LIFETIME = 30 * 60 * 1000;

const FEEDS = [
  { id: 'latest-release-novel', name: 'Latest Release' },
  { id: 'new-novel', name: 'Newly Added' },
  { id: 'hot-novel', name: 'Hot' },
  { id: 'most-popular', name: 'Most Popular' },
  { id: 'completed-novel', name: 'Completed' },
];

const FALLBACK_GENRES = [
  'Action', 'Adult', 'Adventure', 'Comedy', 'Drama', 'Eastern', 'Ecchi', 'Fan-fiction', 'Fantasy', 'Game', 'Gender Bender', 'General', 'Harem', 'Hentai', 'Historical',
  'Horror', 'Isekai', 'Josei', 'LGBT+', 'Magic', 'Magical', 'Magical Realism', 'Manhua', 'Martial', 'Martial Arts', 'Mature', 'Mecha', 'Military', 'Mystery', 'Other',
  'Psychological', 'Reincarnation', 'Romance', 'School', 'School Life', 'Sci-fi', 'Seinen', 'Shoujo', 'Shounen', 'Shounen Ai', 'Slice of Life', 'Smut', 'Sports', 'System',
  'Supernatural', 'Tragedy', 'Traged', 'Urban', 'Video games', 'War', 'Wuxia', 'Xianxia', 'Xuanhuan', 'Yaoi', 'Yuri',
];

const GENRES_18 = ['adult', 'smut', 'hentai'];
const GENRES_16 = ['mature', 'ecchi'];
const TITLE_18 = /\b(hentai|porn|porno|nsfw|xxx|r-?18)\b/i;
const TITLE_16 = /\b(sex|sexy|sexual|erotic|erotica|milf|milfs|lewd|seduce|seduction)\b/i;

function cleanText(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&quot;|&#0*34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function absUrl(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.indexOf('//') === 0) return 'https:' + s;
  return SITE + (s.charAt(0) === '/' ? '' : '/') + s;
}

function coverOf($img) {
  const srcset = String($img.attr('srcset') || '').trim();
  if (srcset) {
    const parts = srcset.split(',').map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
    if (parts.length) return absUrl(parts[parts.length - 1]);
  }
  return absUrl($img.attr('src'));
}

function slugOfHref(href) {
  const m = String(href || '').match(/^(?:https?:\/\/[^/]+)?\/([^/?#]+)\.html(?:[?#].*)?$/);
  return m ? m[1] : '';
}

function pathPiece(piece) {
  let p = String(piece || '');
  try {
    p = decodeURIComponent(p);
  } catch (e) {
  }
  return encodeURIComponent(p);
}

function ratingOfGenres(genres) {
  let age = 0;
  (genres || []).forEach((g) => {
    const key = String(g || '').toLowerCase().trim();
    if (GENRES_18.indexOf(key) !== -1) age = 18;
    else if (GENRES_16.indexOf(key) !== -1 && age < 16) age = 16;
  });
  return age;
}

function ratingOfTitle(title) {
  const t = String(title || '');
  if (TITLE_18.test(t)) return 18;
  if (TITLE_16.test(t)) return 16;
  return 0;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('complete') !== -1) return 'COMPLETED';
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('drop') !== -1 || s.indexOf('cancel') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function blockText($, $el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  clone.find('script, style, ins, iframe, noscript, subtxt, .fwn-slot-host').remove();
  clone.find('[style*="-9999"], [style*="display:none"], [style*="display: none"], [hidden]').remove();
  clone.find('br').replaceWith('\n');
  let text = '';
  clone.contents().each((_, node) => {
    if (node.type === 'text') {
      text += node.data;
    } else {
      const inner = $(node).text();
      text += inner.trim() ? inner + '\n\n' : '\n';
    }
  });
  return text
    .replace(/&#0*39;|&#x0*27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = [];
  for (let w = 0; w < Math.min(size, items.length); w++) {
    workers.push(
      (async () => {
        while (next < items.length) {
          const i = next++;
          results[i] = await fn(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

let ratedIndex = null;
let ratedLoading = null;

class Source {
  constructor() {
    this._details = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    let labels = [];
    try {
      const html = await this.requestText(SITE + '/');
      const $ = cheerio.load(html);
      const seen = {};
      $('a[href^="/genre/"]').each((_, a) => {
        const label = cleanText($(a).text());
        if (label && !seen[label.toLowerCase()]) {
          seen[label.toLowerCase()] = true;
          labels.push(label);
        }
      });
    } catch (e) {
      console.error('Novgo getSearchTags failed: ' + (e && e.message));
    }
    if (labels.length < 20) labels = FALLBACK_GENRES;
    return labels.map((l) => ({ id: l, label: l }));
  }

  genreSlug(tag) {
    let raw = String((tag && (tag.label || tag.id)) || '');
    try {
      raw = decodeURIComponent(raw);
    } catch (e) {
    }
    const key = (s) => cleanText(String(s).replace(/\+(?=[^\s+])/g, ' ')).toLowerCase();
    const hit = FALLBACK_GENRES.filter((g) => key(g) === key(raw))[0];
    return encodeURIComponent(hit || cleanText(raw));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = (request && request.includedTags) || [];
    const page = Math.max(1, parseInt(metadata && metadata.page, 10) || 1);
    let path;
    let explicitGenre = false;
    if (query) {
      path = '/search?keyword=' + encodeURIComponent(query) + (page > 1 ? '&page=' + page : '');
    } else if (tags.length) {
      const slug = this.genreSlug(tags[0]);
      explicitGenre = GENRES_18.indexOf(decodeURIComponent(slug).toLowerCase()) !== -1;
      path = '/genre/' + slug + (page > 1 ? '?page=' + page : '');
    } else {
      const feed = FEEDS.filter((f) => f.id === (request && request.feed))[0] || FEEDS[0];
      path = '/' + feed.id + (page > 1 ? '?page=' + page : '');
    }
    let html;
    try {
      html = await this.requestText(SITE + path);
    } catch (e) {
      if (String(e && e.message).indexOf('HTTP 404') === 0) return { results: [] };
      throw e;
    }
    const $ = cheerio.load(html);
    const pager = this.readPager($);
    if (page > 1 && pager.current !== page) return { results: [] };
    const cards = this.parseCards($);
    if (!cards.length) return { results: [] };
    let index = null;
    try {
      index = await this.getRatedIndex();
    } catch (e) {
      console.error('Novgo rating index failed: ' + (e && e.message));
    }
    const results = cards.map((c) => {
      let age = Math.max(ratingOfGenres(c.tags), ratingOfTitle(c.title));
      if (index) {
        const fromIndex = index.map[c.mangaId];
        if (fromIndex && fromIndex > age) age = fromIndex;
      } else if (age < 16) {
        age = 16;
      }
      if (explicitGenre) age = 18;
      c.ageRating = age;
      return c;
    });
    return { results, metadata: pager.hasNext ? { page: page + 1 } : undefined };
  }

  readPager($) {
    const nav = $('nav.fwn-arch-pages').first();
    const cur = parseInt(nav.find('strong[aria-current="page"]').first().text(), 10);
    const hasNext = nav.find('a[rel="next"]').length > 0;
    return { current: isNaN(cur) ? 1 : cur, hasNext };
  }

  parseCards($) {
    const out = [];
    const seen = {};
    $('.col-truyen-main .con').each((_, el) => {
      const $c = $(el);
      const a = $c.find('h3.tit a').first();
      const mangaId = slugOfHref(a.attr('href'));
      if (!mangaId || seen[mangaId]) return;
      const title = cleanText(a.attr('title') || a.text());
      if (!title) return;
      seen[mangaId] = true;
      const tags = [];
      $c.find('.desc a[href^="/genre/"]').each((__, g) => {
        const t = cleanText($(g).text());
        if (t) tags.push(t);
      });
      const chapters = parseInt(String($c.find('a.chapter').attr('title') || '').replace(/[^\d]/g, ''), 10);
      const rating = parseFloat($c.find('.core span').first().text());
      const card = {
        mangaId,
        title,
        image: coverOf($c.find('.pic img').first()),
        tags,
        webURL: SITE + '/' + mangaId + '.html',
        medium: 'novel',
      };
      if (!isNaN(chapters)) card.chapters = chapters;
      if (!isNaN(rating)) card.rating = rating;
      out.push(card);
    });
    return out;
  }

  async getRatedIndex() {
    const now = Date.now();
    if (ratedIndex && now - ratedIndex.at > INDEX_LIFETIME) ratedIndex = null;
    if (ratedIndex) return ratedIndex;
    if (!ratedLoading) {
      ratedLoading = this.buildRatedIndex().then(
        (idx) => {
          ratedIndex = idx;
          ratedLoading = null;
          return idx;
        },
        (e) => {
          ratedLoading = null;
          throw e;
        },
      );
    }
    return ratedLoading;
  }

  async buildRatedIndex() {
    const idx = { at: Date.now(), map: {} };
    await this.readGenrePages(
      [
        ['Adult', 18],
        ['Smut', 18],
        ['Hentai', 18],
      ],
      idx.map,
      INDEX_CONCURRENCY,
    );
    this.readGenrePages(
      [
        ['Mature', 16],
        ['Ecchi', 16],
      ],
      idx.map,
      INDEX_CONCURRENCY_BACKGROUND,
    ).catch((e) => {
      console.error('Novgo mature index failed: ' + (e && e.message));
      idx.at = Date.now() - INDEX_LIFETIME + 2 * 60 * 1000;
    });
    return idx;
  }

  async readGenrePages(genres, map, concurrency) {
    const firsts = await Promise.all(genres.map((g) => this.readGenrePage(g[0], 1)));
    const tasks = [];
    genres.forEach((g, i) => {
      firsts[i].slugs.forEach((s) => this.mark(map, s, g[1]));
      for (let p = 2; p <= firsts[i].last; p++) tasks.push({ genre: g[0], rating: g[1], page: p });
    });
    await pool(tasks, concurrency, async (t) => {
      const r = await this.readGenrePage(t.genre, t.page);
      r.slugs.forEach((s) => this.mark(map, s, t.rating));
    });
  }

  mark(map, slug, rating) {
    if (!map[slug] || map[slug] < rating) map[slug] = rating;
  }

  async readGenrePage(genre, page) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const html = await this.requestText(SITE + '/genre/' + encodeURIComponent(genre) + (page > 1 ? '?page=' + page : ''));
        const $ = cheerio.load(html);
        const slugs = [];
        $('.col-truyen-main .con h3.tit a').each((_, a) => {
          const s = slugOfHref($(a).attr('href'));
          if (s) slugs.push(s);
        });
        const lastHref = $('nav.fwn-arch-pages a[title="Last page"]').first().attr('href') || '';
        const m = lastHref.match(/[?&]page=(\d+)/);
        return { slugs, last: m ? parseInt(m[1], 10) : 1 };
      } catch (e) {
        lastError = e;
        if (/HTTP (429|503)/.test(String(e && e.message))) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  detailPage(mangaId) {
    const hit = this._details.get(mangaId);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.promise;
    const promise = this.requestText(SITE + '/' + pathPiece(mangaId) + '.html').then((html) => cheerio.load(html));
    this._details.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this._details.delete(mangaId));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.detailPage(mangaId);
    const title = cleanText($('h1.tit').first().text());
    if (!title) throw new Error('Novgo: title page of ' + mangaId + ' has no title');
    const facts = {};
    $('.m-imgtxt .txt .item').each((_, el) => {
      const key = cleanText($(el).find('span').first().attr('title'));
      if (key) facts[key] = $(el).find('.right');
    });
    const genres = [];
    if (facts['Genre']) {
      facts['Genre'].find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) genres.push(t);
      });
    }
    const authors = [];
    if (facts['Author']) {
      facts['Author'].find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) authors.push(t);
      });
    }
    const status = mapStatus(facts['Status'] ? facts['Status'].text() : '');
    const desc = blockText($, $('.m-desc .txt .inner').first());
    const total = parseInt($('#truyen').attr('data-total-chapters'), 10);
    const avg = parseFloat($('#novel-score').attr('data-avg'));
    let age = Math.max(ratingOfGenres(genres), ratingOfTitle(title));
    if (ratedIndex && ratedIndex.map[mangaId] && ratedIndex.map[mangaId] > age) age = ratedIndex.map[mangaId];
    const info = {
      title,
      image: absUrl($('.m-imgtxt .pic img').first().attr('src')) || absUrl($('meta[property="og:image"]').attr('content')),
      author: authors.length ? authors.join(', ') : undefined,
      desc,
      status,
      tags: genres,
      webURL: SITE + '/' + mangaId + '.html',
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: age,
    };
    if (!isNaN(total)) info.chapters = total;
    if (!isNaN(avg)) info.rating = avg;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.detailPage(mangaId);
    const novelId = String($('#novel-score').attr('data-novel-id') || $('#novel-library-actions').attr('data-novel-id') || '').trim();
    const total = parseInt($('#truyen').attr('data-total-chapters'), 10);
    if (!novelId) throw new Error('Novgo: no novel id on the page of ' + mangaId);
    if (isNaN(total)) throw new Error('Novgo: no chapter count on the page of ' + mangaId);
    if (total === 0) return [];
    const pages = Math.ceil(total / CHAPTER_PAGE_SIZE);
    const numbers = [];
    for (let p = 1; p <= pages; p++) numbers.push(p);
    const lists = await pool(numbers, CHAPTER_CONCURRENCY, (p) => this.chapterPage(novelId, p, pages));
    let rowCount = 0;
    const chapters = [];
    const seen = {};
    lists.forEach((rows) => {
      rows.forEach((row) => {
        rowCount++;
        if (seen[row.id]) return;
        seen[row.id] = true;
        chapters.push({ id: row.id, chapterId: row.id, name: row.name, number: chapters.length + 1 });
      });
    });
    if (rowCount !== total) {
      throw new Error('Novgo: chapter list of ' + mangaId + ' has ' + rowCount + ' rows, the site says ' + total);
    }
    return chapters;
  }

  async chapterPage(novelId, page, pages) {
    const url = SITE + '/ajax-chapter-list?novelId=' + encodeURIComponent(novelId) + '&page=' + page + '&pageSize=' + CHAPTER_PAGE_SIZE;
    const text = await this.requestText(url, { 'X-Requested-With': 'XMLHttpRequest' });
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('Novgo: chapter list page ' + page + ' is not JSON');
    }
    if (!data || data.code !== 200 || typeof data.html !== 'string') throw new Error('Novgo: chapter list page ' + page + ' failed');
    if (parseInt(data.page, 10) !== page) throw new Error('Novgo: chapter list page ' + page + ' came back as page ' + data.page + ' of ' + pages);
    const $ = cheerio.load(data.html);
    const rows = [];
    $('li a.con').each((_, a) => {
      const href = $(a).attr('href') || '';
      const m = href.match(/^\/[^/]+\/([^/?#]+)\.html/);
      if (!m) return;
      const name = cleanText($(a).attr('title') || $(a).text()) || 'Chapter';
      rows.push({ id: m[1], name });
    });
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = SITE + '/' + pathPiece(mangaId) + '/' + pathPiece(chapterId) + '.html';
    const html = await this.requestText(url);
    const $ = cheerio.load(html);
    const text = blockText($, $('#chapter-content').first());
    if (text.length < 100) throw new Error('Novgo: chapter ' + chapterId + ' of ' + mangaId + ' has no text');
    return { id: chapterId, mangaId, pages: [], text };
  }

  async requestText(url, headers) {
    const manager = App.createRequestManager({});
    const response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: headers || {} }));
    if (response.status < 200 || response.status >= 300) throw new Error('HTTP ' + response.status + ' for ' + url);
    return response.data;
  }
}

module.exports = { Source };
