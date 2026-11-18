const SITE = 'https://www.novelstime.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', query: 'sortby=popular' },
  { id: 'updated', name: 'Recently Updated', query: 'sortby=updated' },
  { id: 'ratings', name: 'Top Rated', query: 'sortby=ratings' },
  { id: 'collections', name: 'Most Bookmarked', query: 'sortby=collections' },
  { id: 'completed', name: 'Completed', query: 'status=completed&sortby=popular' },
];

const EXPLICIT_GENRES = ['adult', 'smut', 'hentai', 'erotica', 'sexual violence'];
const MATURE_GENRES = ['ecchi', 'mature'];
const BAD_GENRE_IDS = ['comedyslice-of-life', 'romanceadventure', 'easterni', 'lice-of-life'];

const SEARCH_PAGE_SIZE = 10;
const COVER_BASE = 'https://www.novels2.com/obs/novels-time/cover/';
const PLACEHOLDER_COVER = SITE + '/public/favicon.png';
const DETAIL_TTL = 5 * 60 * 1000;
const CHAPTER_PAGE_SIZE = 100;
const MAX_PARALLEL = 5;
const ATTEMPTS = 4;

function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function toInt(text) {
  const n = parseInt(String(text || '').replace(/[^\d]/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function coverUrl(src) {
  let url = clean(src);
  if (!url) return '';
  if (url.indexOf('//') === 0) url = 'https:' + url;
  else if (url.charAt(0) === '/') url = SITE + url;
  if (/\/cover\/?$/.test(url)) return PLACEHOLDER_COVER;
  return url.replace(/^https:\/\/novels2\.com\//, 'https://www.novels2.com/');
}

function mapStatus(text) {
  const s = clean(text).toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('completed') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('dropped') !== -1 || s.indexOf('cancel') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function ageRatingFor(genres) {
  let rating = 0;
  (genres || []).forEach((g) => {
    const id = clean(g).toLowerCase();
    if (EXPLICIT_GENRES.indexOf(id) !== -1) rating = 18;
    else if (MATURE_GENRES.indexOf(id) !== -1 && rating < 16) rating = 16;
  });
  return rating;
}

const STRONG_WORDS = /\b(erotic|erotica|porn|pornographic|smut|hentai|nsfw|r-?18|18\+|ntr|milf|incest|brothel|orgasm|bdsm|rape|raped)\b/i;
const SOFT_WORDS = /\b(lust|lustful|sex|sexual|seduce|seduction|naked|nude|harem|ecchi|lewd|pervert|pervy)\b/i;

function ageRatingFromText(text) {
  if (STRONG_WORDS.test(text)) return 18;
  if (SOFT_WORDS.test(text)) return 16;
  return 0;
}

function ageRatingForGenreId(id) {
  const g = clean(id).toLowerCase();
  if (EXPLICIT_GENRES.indexOf(g) !== -1) return 18;
  if (MATURE_GENRES.indexOf(g) !== -1) return 16;
  return undefined;
}

function novelId(mangaId) {
  const m = String(mangaId || '').match(/(\d+)$/);
  return m ? m[1] : '';
}

function novelIdFromHref(href) {
  const m = String(href || '').match(/\/novel\/([^/?#]+)/);
  return m ? novelId(m[1]) : '';
}

function chapterIdFromHref(href) {
  const last = String(href || '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
  const m = last.match(/(\d+)$/);
  return m ? m[1] : '';
}

function dateMs(text) {
  const m = clean(text).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  const t = Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return isFinite(t) ? t : undefined;
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
    .join('&');
}

function statByIcon($card, iconClass) {
  const icon = $card.find('i.' + iconClass).first();
  if (!icon.length) return undefined;
  return toInt(icon.parent().find('span').first().text());
}

function parseCards($) {
  const cards = [];
  $('h3 > a[href^="/novel/"]').each((_, a) => {
    const $a = $(a);
    const mangaId = novelIdFromHref($a.attr('href'));
    if (!mangaId) return;
    const $card = $a.closest('div.border-b');
    const title = clean($a.text());
    if (!title) return;
    const spans = $card.find('div.mt-2 > span');
    const author = spans.length > 1 ? clean(spans.eq(0).text()) : '';
    const status = mapStatus(spans.eq(spans.length - 1).text());
    cards.push({
      mangaId,
      title,
      image: coverUrl($card.find('img').first().attr('src')),
      author: author || undefined,
      chapters: statByIcon($card, 'icon-book-open-text'),
      views: statByIcon($card, 'icon-eye'),
      completed: status === 'COMPLETED',
    });
  });
  return cards;
}

function hasNextPage($, resultCount) {
  if (!resultCount) return false;
  let next = false;
  $('nav[aria-label="Page navigation"] a').each((_, a) => {
    if (clean($(a).text()) === 'Next') next = true;
  });
  return next;
}

function proseLines($, $prose) {
  const lines = [];
  const paragraphs = $prose.find('p');
  if (paragraphs.length) {
    paragraphs.each((_, p) => {
      const t = clean($(p).text());
      if (t) lines.push(t);
    });
  } else {
    $prose
      .text()
      .split(/\n+/)
      .forEach((line) => {
        const t = clean(line);
        if (t) lines.push(t);
      });
  }
  return lines;
}

class Source {
  constructor() {
    this.manager = App.createRequestManager({});
    this.pages = new Map();
    this.ratings = new Map();
    this.tagsCache = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this.tagsCache) return this.tagsCache;
    try {
      const html = await this.requestHTML(SITE + '/browse');
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('a[href^="/browse?genre="]').each((_, a) => {
        const m = String($(a).attr('href') || '').match(/genre=([^&]+)/);
        const id = m ? decodeURIComponent(m[1]) : '';
        const label = clean($(a).text());
        if (!id || !label || seen[id] || BAD_GENRE_IDS.indexOf(id) !== -1) return;
        seen[id] = true;
        tags.push({ id, label });
      });
      if (tags.length) this.tagsCache = tags;
      return tags;
    } catch (e) {
      console.error('NovelsTime getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const title = clean(request && request.title);
    const tagIds = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feedId = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;

    let cards;
    let hasNext;
    let filterRating;
    if (title) {
      const json = await this.searchApi(title, page);
      cards = json.cards;
      hasNext = cards.length > 0 && page * SEARCH_PAGE_SIZE < json.total;
    } else {
      let url;
      if (tagIds.length) {
        url = SITE + '/browse?' + qs({ genre: tagIds[0], sortby: 'popular', page });
        filterRating = ageRatingForGenreId(tagIds[0]);
      } else {
        const feed = FEEDS.filter((f) => f.id === feedId)[0] || FEEDS[0];
        url = SITE + '/browse?' + feed.query + '&page=' + page;
      }
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      if ($('.error-content').length) {
        throw new Error('NovelsTime failed to build this list page on its own server (it shows a 500 error page), try another page or sort');
      }
      cards = parseCards($);
      hasNext = hasNextPage($, cards.length);
    }

    const rated = await this.rateCards(cards, filterRating);
    let results = rated;
    if (title && tagIds.length) {
      results = rated.filter((r) => {
        const genres = (r.tags || []).map((g) => g.toLowerCase());
        return tagIds.every((id) => genres.indexOf(String(id).toLowerCase().replace(/-/g, ' ')) !== -1 || genres.indexOf(String(id).toLowerCase()) !== -1);
      });
    }
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async searchApi(keyword, page) {
    const body = await this.requestHTML(SITE + '/api/novel/search?' + qs({ keyword, page, pageSize: SEARCH_PAGE_SIZE }), true);
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      throw new Error('NovelsTime search answered something that is not JSON');
    }
    if (!json || !json.success || !Array.isArray(json.data) || !Array.isArray(json.data[0])) {
      throw new Error('NovelsTime search failed: ' + clean(json && json.message));
    }
    const total = parseInt(json.data[1], 10) || 0;
    const cards = [];
    json.data[0].forEach((item) => {
      if (!item || item.id === undefined || item.id === null) return;
      const mangaId = novelId(String(item.id));
      const title = clean(item.title);
      if (!mangaId || !title) return;
      cards.push({
        mangaId,
        title,
        image: item.cover ? COVER_BASE + encodeURIComponent(String(item.cover)) : PLACEHOLDER_COVER,
        author: clean(item.author && item.author.name) || undefined,
        chapters: typeof item.chaptersCount === 'number' ? item.chaptersCount : undefined,
        completed: item.status === 1,
      });
    });
    return { cards, total };
  }

  async rateCards(cards, filterRating) {
    const out = cards.map((c) => ({
      mangaId: c.mangaId,
      title: c.title,
      image: c.image,
      author: c.author,
      chapters: c.chapters,
      views: c.views,
      completed: c.completed,
      webURL: SITE + '/novel/' + c.mangaId,
      medium: 'novel',
    }));
    const todo = [];
    out.forEach((r) => {
      const known = this.ratings.get(r.mangaId);
      if (known) {
        r.ageRating = known.ageRating;
        r.tags = known.tags;
      } else {
        todo.push(r);
      }
    });
    let index = 0;
    const worker = async () => {
      while (index < todo.length) {
        const r = todo[index++];
        try {
          const info = await this.readInfo(r.mangaId);
          this.ratings.set(r.mangaId, { ageRating: info.ageRating, tags: info.tags });
          r.ageRating = info.ageRating;
          r.tags = info.tags;
        } catch (e) {
          r.ageRating = filterRating !== undefined ? filterRating : 16;
        }
      }
    };
    const workers = [];
    for (let i = 0; i < Math.min(MAX_PARALLEL, todo.length); i++) workers.push(worker());
    await Promise.all(workers);
    out.forEach((r) => {
      if (filterRating !== undefined && (r.ageRating === undefined || r.ageRating < filterRating)) r.ageRating = filterRating;
      if (r.ageRating === undefined) r.ageRating = 16;
    });
    return out;
  }

  readInfo(mangaId) {
    return this.titlePage(mangaId).then((html) => {
      const $ = cheerio.load(html);
      return this.parseInfo($, mangaId);
    });
  }

  titlePage(mangaId) {
    const hit = this.pages.get(mangaId);
    if (hit && Date.now() - hit.at < DETAIL_TTL) return hit.promise;
    const promise = this.requestHTML(SITE + '/novel/' + mangaId);
    this.pages.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => {
      const cur = this.pages.get(mangaId);
      if (cur && cur.promise === promise) this.pages.delete(mangaId);
    });
    if (this.pages.size > 60) {
      const oldest = this.pages.keys().next().value;
      this.pages.delete(oldest);
    }
    return promise;
  }

  parseInfo($, mangaId) {
    const title = clean($('h1').first().text());
    if (!title) throw new Error('NovelsTime has no title page for ' + mangaId);
    const label = (name) => {
      let value = '';
      $('span').each((_, s) => {
        if (!value && clean($(s).text()) === name) value = clean($(s).next('span').text());
      });
      return value;
    };
    const genres = [];
    $('a[href^="/browse?genre="]').each((_, a) => {
      if ($(a).closest('nav').length) return;
      const t = clean($(a).text());
      if (t && genres.indexOf(t) === -1) genres.push(t);
    });
    const rateEl = $('#j-detail-rating');
    const rating = rateEl.length ? parseFloat(rateEl.attr('data-rateit-value')) : NaN;
    const desc = $('.prose.whitespace-pre-wrap').first().text().trim();
    const chaptersTotal = parseInt($('.j-chapters-list').attr('data-chapters'), 10);
    const statByIconDetail = (cls) => {
      const icon = $('i.' + cls).first();
      return icon.length ? toInt(icon.parent().find('span').first().text()) : undefined;
    };
    return {
      title,
      image: coverUrl($('img[src*="/cover/"]').first().attr('src')),
      author: label('Author:'),
      status: mapStatus(label('Status:')),
      tags: genres,
      desc,
      rating: isFinite(rating) && rating > 0 ? rating : undefined,
      views: statByIconDetail('icon-eye'),
      chapters: isFinite(chaptersTotal) ? chaptersTotal : undefined,
      ageRating: genres.length ? ageRatingFor(genres) : ageRatingFromText(title + ' ' + desc),
    };
  }

  async getMangaDetails(mangaId) {
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    const info = this.parseInfo($, mangaId);
    this.ratings.set(mangaId, { ageRating: info.ageRating, tags: info.tags });
    return {
      mangaInfo: {
        title: info.title,
        image: info.image,
        author: info.author || undefined,
        desc: info.desc,
        status: info.status,
        tags: info.tags,
        rating: info.rating,
        views: info.views,
        chapters: info.chapters,
        completed: info.status === 'COMPLETED',
        ageRating: info.ageRating,
        webURL: SITE + '/novel/' + mangaId,
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const id = novelId(mangaId);
    if (!id) throw new Error('NovelsTime title id is missing in ' + mangaId);
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    if (!$('h1').length) throw new Error('NovelsTime has no title page for ' + mangaId);
    const total = parseInt($('.j-chapters-list').attr('data-chapters'), 10);
    if (!isFinite(total)) throw new Error('NovelsTime chapter count is missing for ' + mangaId);
    if (total === 0) return [];

    const pageCount = Math.ceil(total / CHAPTER_PAGE_SIZE);
    const pages = new Array(pageCount);
    let next = 0;
    const worker = async () => {
      while (next < pageCount) {
        const p = next++;
        pages[p] = await this.chapterPage(id, p + 1);
      }
    };
    const workers = [];
    for (let i = 0; i < Math.min(MAX_PARALLEL, pageCount); i++) workers.push(worker());
    await Promise.all(workers);

    const chapters = [];
    const seen = {};
    pages.forEach((rows) => {
      rows.forEach((row) => {
        if (seen[row.id]) return;
        seen[row.id] = true;
        const chapter = {
          id: row.id,
          name: row.name,
          number: chapters.length + 1,
        };
        if (row.time !== undefined) chapter.time = row.time;
        chapters.push(chapter);
      });
    });
    if (chapters.length < total) {
      throw new Error('NovelsTime returned ' + chapters.length + ' of ' + total + ' chapters for ' + mangaId);
    }
    return chapters;
  }

  async chapterPage(id, page) {
    const url = SITE + '/api/novel/' + id + '/chapters?' + qs({ page, pageSize: CHAPTER_PAGE_SIZE });
    const body = await this.requestHTML(url, true);
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      throw new Error('NovelsTime chapter list page ' + page + ' was not JSON');
    }
    if (!json || !json.success || typeof json.data !== 'string') {
      throw new Error('NovelsTime chapter list page ' + page + ' failed: ' + clean(json && json.message));
    }
    const $ = cheerio.load(json.data);
    const rows = [];
    $('a[href*="/novel/"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href') || '';
      const chapterId = chapterIdFromHref(href);
      if (!chapterId) return;
      const spans = $a.find('span');
      let name = clean(spans.eq(0).text());
      const paid = /\/paid-chapter/.test(href) || /^PAID\b/.test(name);
      name = name.replace(/^PAID\s+/, '');
      if (!name) name = 'Chapter ' + (rows.length + 1);
      if (paid) name += ' (Locked, Coupons)';
      rows.push({ id: chapterId, name, time: dateMs(spans.eq(1).text()) });
    });
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.requestHTML(SITE + '/novel/' + mangaId + '/' + encodeURIComponent(chapterId));
    const $ = cheerio.load(html);
    const $prose = $('#chapter-page .prose').first();
    if (!$prose.length) {
      throw new Error('NovelsTime has no chapter ' + chapterId + ' (the site answered its Page Not Found page)');
    }
    let lines = proseLines($, $prose).map((l) => l.replace(/@@novelbin@@/g, '').trim()).filter(Boolean);
    const joined = lines.join(' ');
    if (/this chapter is missing/i.test(joined) && lines.length < 4) {
      throw new Error('This chapter is missing on NovelsTime (the site says it will fix it)');
    }
    const lockAt = lines.findIndex((l) => /^you didn'?t buy this chapter/i.test(l));
    if (lockAt !== -1) {
      const preview = lines.slice(0, lockAt);
      const notice = 'Locked: this chapter is paid on NovelsTime (Buy Now with coupons on the site). Only the free preview is available here.';
      return { id: chapterId, mangaId, pages: [], text: preview.length ? notice + '\n\n' + preview.join('\n\n') : notice };
    }
    if (joined.length < 30) {
      throw new Error('NovelsTime has no text for this chapter');
    }
    return { id: chapterId, mangaId, pages: [], text: lines.join('\n\n') };
  }

  requestHTML(url, json) {
    return new Promise((resolve, reject) => {
      let done = false;
      let started = 0;
      let failed = 0;
      const launch = () => {
        if (done || started >= ATTEMPTS) return;
        started++;
        this.requestOnce(url, json).then(
          (data) => {
            if (!done) {
              done = true;
              resolve(data);
            }
          },
          (err) => {
            failed++;
            if (done) return;
            if (err && err.final) {
              done = true;
              reject(err);
            } else if (failed >= ATTEMPTS) {
              done = true;
              reject(err);
            } else if (failed >= started) {
              launch();
            }
          },
        );
        if (started < ATTEMPTS) setTimeout(launch, 3000);
      };
      launch();
    });
  }

  async requestOnce(url, json) {
    const response = await this.manager.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: json ? { 'User-Agent': UA, Accept: 'application/json' } : { 'User-Agent': UA },
      }),
    );
    if (response.status >= 200 && response.status < 300) return response.data;
    const error = new Error('HTTP ' + response.status + ' from NovelsTime');
    error.final = response.status < 500;
    throw error;
  }
}

module.exports = { Source };
