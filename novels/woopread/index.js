const SITE = 'https://woopread.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 20;
const SEARCH_PAGE_SIZE = 10;
const DETAIL_TTL = 5 * 60 * 1000;

const FEEDS = [
  { id: 'popular', name: 'Popular', sortBy: 'Popular', status: 'Any' },
  { id: 'new', name: 'Recently Added', sortBy: 'New', status: 'Any' },
  { id: 'rating', name: 'Highest Rated', sortBy: 'Rating', status: 'Any' },
  { id: 'chapters', name: 'Most Chapters', sortBy: 'Chapters', status: 'Any' },
  { id: 'ongoing', name: 'Ongoing', sortBy: 'Popular', status: 'Ongoing' },
  { id: 'completed', name: 'Completed', sortBy: 'Popular', status: 'Completed' },
  { id: 'name', name: 'A to Z', sortBy: 'Name', status: 'Any' },
];

const FALLBACK_GENRES = [
  'Action', 'Adult', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Gender Bender', 'Harem', 'Historical', 'Horror', 'Josei',
  'Martial Arts', 'Mature', 'Mecha', 'Mystery', 'Psychological', 'Romance', 'School Life', 'Sci-fi', 'Seinen', 'Shoujo', 'Shoujo Ai',
  'Shounen', 'Shounen Ai', 'Slice of Life', 'Smut', 'Sports', 'Supernatural', 'Tragedy', 'Wuxia', 'Xianxia', 'Xuanhuan', 'Yaoi', 'Yuri',
];

const EXPLICIT_GENRES = ['adult', 'smut', 'hentai', 'erotica', 'sexual violence'];
const MATURE_GENRES = ['ecchi', 'mature'];

function clean(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
    .join('&');
}

function resizedCover(cover, width) {
  const url = clean(cover);
  if (!url) return undefined;
  if (url.indexOf('/_next/image') !== -1) return url;
  return SITE + '/_next/image?' + qs({ url, w: width, q: 75 });
}

function coverFromNextImage(src) {
  const m = String(src || '').match(/[?&]url=([^&]+)/);
  if (!m) return clean(src) || undefined;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return undefined;
  }
}

function mapStatus(text) {
  const s = clean(text).toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'dropped' || s === 'cancelled') return 'CANCELLED';
  return 'UNKNOWN';
}

function ageRatingFor(title, genres) {
  let rating = /^\s*[\[(]\s*18\s*\+/.test(String(title || '')) ? 18 : 0;
  (genres || []).forEach((g) => {
    const id = clean(g).toLowerCase();
    if (EXPLICIT_GENRES.indexOf(id) !== -1) rating = 18;
    else if (MATURE_GENRES.indexOf(id) !== -1 && rating < 16) rating = 16;
  });
  return rating;
}

function htmlToText(html) {
  const $ = cheerio.load('<div id="r">' + String(html || '') + '</div>');
  const parts = [];
  $('#r p').each((_, p) => {
    const t = clean($(p).text());
    if (t) parts.push(t);
  });
  if (parts.length) return parts.join('\n\n');
  return clean($('#r').text());
}

function decodeFlight(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch (e) {
      throw new Error('WoopRead page data could not be decoded');
    }
  }
  return out;
}

function arrayAfter(data, key) {
  const start = data.indexOf(key);
  if (start === -1) return null;
  let i = start + key.length - 1;
  const first = i;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < data.length; i++) {
    const c = data.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('WoopRead page data is cut short after ' + key);
  return JSON.parse(data.slice(first, i + 1));
}

function labelValue($, name) {
  let value = '';
  $('span').each((_, s) => {
    if (value) return;
    if (clean($(s).text()) === name) value = clean($(s).parent().text().replace(name, ''));
  });
  return value;
}

class Source {
  constructor() {
    this.manager = App.createRequestManager({});
    this.pages = new Map();
    this.genresCache = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this.genresCache) return this.genresCache;
    let names = FALLBACK_GENRES;
    try {
      const html = await this.request(SITE + '/browse');
      const list = arrayAfter(decodeFlight(html), '"allGenres":[');
      if (list && list.length && list.every((g) => typeof g === 'string')) names = list;
    } catch (e) {
      console.error('WoopRead getSearchTags used the saved genre list: ' + (e && e.message));
    }
    const tags = names.map((g) => ({ id: g, label: g }));
    this.genresCache = tags;
    return tags;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const title = clean(request && request.title);
    const tagIds = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feedId = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;

    if (title) {
      const json = await this.requestJSON(SITE + '/api/search?' + qs({ q: title, page }));
      let novels = Array.isArray(json.novels) ? json.novels : [];
      let results = novels.map((n) => this.fromSearch(n));
      if (tagIds.length) results = results.filter((r) => this.hasAllTags(r, tagIds));
      const total = parseInt(json.totalCount, 10) || 0;
      const more = novels.length > 0 && page * SEARCH_PAGE_SIZE < total;
      return { results, metadata: more ? { page: page + 1 } : undefined };
    }

    const feed = FEEDS.filter((f) => f.id === feedId)[0] || FEEDS[0];
    if (tagIds.length > 1) {
      const all = [];
      let p = 1;
      let total = 0;
      do {
        const json = await this.requestJSON(this.browseUrl(feed, [tagIds[0]], p));
        const novels = Array.isArray(json.novels) ? json.novels : [];
        total = parseInt(json.totalCount, 10) || 0;
        novels.forEach((n) => all.push(this.fromBrowse(n)));
        if (!novels.length) break;
        p++;
      } while ((p - 1) * PAGE_SIZE < total);
      return { results: all.filter((r) => this.hasAllTags(r, tagIds)), metadata: undefined };
    }

    const json = await this.requestJSON(this.browseUrl(feed, tagIds, page));
    const novels = Array.isArray(json.novels) ? json.novels : [];
    const total = parseInt(json.totalCount, 10) || 0;
    const more = novels.length > 0 && page * PAGE_SIZE < total;
    return { results: novels.map((n) => this.fromBrowse(n)), metadata: more ? { page: page + 1 } : undefined };
  }

  browseUrl(feed, genres, page) {
    return (
      SITE +
      '/api/novels?' +
      qs({ language: 'Any', status: feed.status, sortBy: feed.sortBy, genres: genres.join(','), chapters: 'Any', page })
    );
  }

  hasAllTags(result, tagIds) {
    const have = (result.tags || []).map((g) => clean(g).toLowerCase());
    return tagIds.every((id) => have.indexOf(clean(id).toLowerCase()) !== -1);
  }

  fromBrowse(n) {
    const rating = parseFloat(n.rating);
    const genres = Array.isArray(n.genres) ? n.genres.filter((g) => typeof g === 'string') : [];
    const out = {
      mangaId: String(n.slug),
      title: String(n.title || n.slug),
      image: resizedCover(n.cover, 256),
      author: n.author ? String(n.author) : undefined,
      tags: genres,
      chapters: typeof n.chapters === 'number' ? n.chapters : undefined,
      views: typeof n.views === 'number' ? n.views : undefined,
      completed: n.status === 'Completed',
      ageRating: ageRatingFor(n.title, genres),
      webURL: SITE + '/series/' + n.slug,
      medium: 'novel',
    };
    if (isFinite(rating) && rating > 0) out.rating = rating;
    return out;
  }

  fromSearch(n) {
    const genres = Array.isArray(n.tags) ? n.tags.filter((g) => typeof g === 'string') : [];
    const out = {
      mangaId: String(n.slug),
      title: String(n.title || n.slug),
      image: resizedCover(n.cover, 256),
      summary: htmlToText(n.description),
      tags: genres,
      ageRating: ageRatingFor(n.title, genres),
      webURL: SITE + '/series/' + n.slug,
      medium: 'novel',
    };
    const rating = parseFloat(n.rating);
    if (isFinite(rating) && rating > 0) out.rating = rating;
    return out;
  }

  seriesPage(mangaId) {
    const hit = this.pages.get(mangaId);
    if (hit && Date.now() - hit.at < DETAIL_TTL) return hit.promise;
    const promise = this.request(SITE + '/series/' + encodeURIComponent(mangaId)).then((html) => this.parseSeries(html, mangaId));
    this.pages.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => {
      const cur = this.pages.get(mangaId);
      if (cur && cur.promise === promise) this.pages.delete(mangaId);
    });
    if (this.pages.size > 40) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  parseSeries(html, mangaId) {
    const $ = cheerio.load(html);
    const title = clean($('h1').first().text());
    if (!title) throw new Error('WoopRead has no title page for ' + mangaId);

    const genres = [];
    $('a[href^="/browse?genres="]').each((_, a) => {
      const t = clean($(a).text());
      if (t && genres.indexOf(t) === -1) genres.push(t);
    });
    const tags = [];
    $('a[href^="/browse?tags="]').each((_, a) => {
      const t = clean($(a).text());
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });

    let desc = '';
    $('h2').each((_, h) => {
      if (desc || clean($(h).text()) !== 'Description') return;
      const paragraphs = [];
      $(h)
        .next()
        .find('p')
        .each((__, p) => {
          const t = clean($(p).text());
          if (t) paragraphs.push(t);
        });
      desc = paragraphs.length ? paragraphs.join('\n\n') : clean($(h).next().text());
    });

    const alternate = clean($('h1').first().next('p').text());
    const statsText = clean($('h1').first().nextAll('div').first().find('span').first().text());
    const rating = parseFloat(statsText);

    const data = decodeFlight(html);
    let rows = arrayAfter(data, '"chapters":[');
    if (rows === null) throw new Error('WoopRead page has no chapter data for ' + mangaId);
    if (!Array.isArray(rows)) rows = [];
    let groups = [];
    try {
      const g = arrayAfter(data, '"groups":[');
      if (Array.isArray(g)) groups = g;
    } catch (e) {
      groups = [];
    }
    const groupById = {};
    groups.forEach((g) => {
      if (g && g.id) groupById[g.id] = g;
    });

    let shownCount = NaN;
    $('div.rounded-full').each((_, d) => {
      const m = clean($(d).text()).match(/^(\d+) chapters?$/);
      if (m && !isFinite(shownCount)) shownCount = parseInt(m[1], 10);
    });
    if (isFinite(shownCount) && shownCount !== rows.length) {
      throw new Error('WoopRead lists ' + shownCount + ' chapters but its page data holds ' + rows.length + ' for ' + mangaId);
    }

    const chapters = [];
    const seen = {};
    rows.forEach((row) => {
      if (!row || typeof row.slug !== 'string' || !row.slug || seen[row.slug]) return;
      seen[row.slug] = true;
      let name = clean(row.title);
      const group = row.groupId ? groupById[row.groupId] : null;
      if (group && typeof row.groupNumber === 'number') {
        const label = clean(group.itemLabel) || 'Chapter';
        name = label + ' ' + row.groupNumber + (name ? ' - ' + name : '');
      }
      if (!name) name = 'Chapter ' + row.number;
      const chapter = { id: row.slug, name, number: typeof row.number === 'number' ? row.number : chapters.length + 1 };
      const time = Date.parse(row.publishDate);
      if (isFinite(time)) chapter.time = time;
      chapters.push(chapter);
    });

    const statusText = labelValue($, 'Status:');
    const info = {
      title,
      alternate,
      image: resizedCover(coverFromNextImage($('img[alt]').not('header img').first().attr('src')), 384),
      author: labelValue($, 'Author:'),
      translator: labelValue($, 'Translator:'),
      status: mapStatus(statusText),
      tags: genres.concat(tags.filter((t) => genres.indexOf(t) === -1)),
      genres,
      desc,
      rating: isFinite(rating) && rating > 0 ? rating : undefined,
      ageRating: ageRatingFor(title, genres),
    };
    return { info, chapters };
  }

  async getMangaDetails(mangaId) {
    const page = await this.seriesPage(mangaId);
    const i = page.info;
    const desc = i.alternate ? 'Also known as: ' + i.alternate + '\n\n' + i.desc : i.desc;
    return {
      mangaInfo: {
        title: i.title,
        image: i.image,
        author: i.author || undefined,
        desc: desc.trim(),
        status: i.status,
        tags: i.tags,
        rating: i.rating,
        chapters: page.chapters.length,
        completed: i.status === 'COMPLETED',
        ageRating: i.ageRating,
        webURL: SITE + '/series/' + mangaId,
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const page = await this.seriesPage(mangaId);
    return page.chapters.map((c) => Object.assign({}, c));
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.request(SITE + '/series/' + encodeURIComponent(mangaId) + '/' + encodeURIComponent(chapterId));
    const $ = cheerio.load(html);
    const lines = [];
    $('[class*="group/paragraph"]').each((_, box) => {
      const p = $(box).find('p').first();
      const t = clean(p.length ? p.text() : $(box).text());
      if (t) lines.push(t);
    });
    if (!lines.length) {
      throw new Error('WoopRead chapter ' + chapterId + ' has no text on its page');
    }
    return { id: chapterId, mangaId, pages: [], text: lines.join('\n\n') };
  }

  async request(url) {
    const response = await this.manager.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) {
      throw new Error('HTTP ' + response.status + ' from WoopRead');
    }
    return response.data;
  }

  async requestJSON(url) {
    const response = await this.manager.schedule(
      App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }),
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error('HTTP ' + response.status + ' from WoopRead');
    }
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('WoopRead answered something that is not JSON');
    }
  }
}

module.exports = { Source };
