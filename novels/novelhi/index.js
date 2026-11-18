const SITE = 'https://novelhi.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 30;
const CATALOG_PAGE = 3000;
const KNOWN_FONT = 'novelhi-chapter-obf.woff2?v=1';

const GENRES = [
  ['1', 'action', 'Action'], ['3', 'adventure', 'Adventure'], ['4', 'comedy', 'Comedy'], ['7', 'light-novel', 'Light Novel'], ['41', 'fanfiction', 'Fanfiction'],
  ['9', 'fantasy', 'Fantasy'], ['10', 'game', 'Game'], ['11', 'gender-bender', 'Gender Bender'], ['12', 'harem', 'Harem'], ['13', 'historical', 'Historical'],
  ['14', 'horror', 'Horror'], ['16', 'martial-arts', 'Martial Arts'], ['17', 'mature', 'Mature'], ['18', 'mecha', 'Mecha'], ['19', 'military', 'Military'],
  ['20', 'mystery', 'Mystery'], ['22', 'romance', 'Romance'], ['23', 'school-life', 'School Life'], ['24', 'sci-fi', 'Sci-fi'], ['30', 'slice-of-life', 'Slice of Life'],
  ['32', 'sports', 'Sports'], ['33', 'supernatural', 'Supernatural'], ['34', 'tragedy', 'Tragedy'], ['35', 'urban-life', 'Urban Life'], ['36', 'wuxia', 'Wuxia'],
  ['37', 'xianxia', 'Xianxia'], ['38', 'xuanhuan', 'Xuanhuan'], ['39', 'yaoi', 'Yaoi'], ['40', 'yuri', 'Yuri'],
];
const GENRE_SLUG = {};
GENRES.forEach((g) => {
  GENRE_SLUG[g[0]] = g[1];
});
const RATE_16 = ['Mature', 'Yaoi', 'Yuri'];

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Most Read' },
  { id: 'ongoing', name: 'Ongoing' },
  { id: 'completed', name: 'Completed' },
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };
const COMMON = new Set([
  'the', 'and', 'of', 'to', 'a', 'in', 'was', 'he', 'she', 'that', 'it', 'his', 'her', 'with', 'had', 'for', 'as', 'you', 'on', 'at', 'i', 'is', 'be', 'not', 'but', 'they', 'this', 'said',
]);

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enc(text) {
  return encodeURIComponent(String(text));
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}

function oneLine(text) {
  return decodeEntities(String(text || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function pathOf(book) {
  return `${GENRE_SLUG[String(book.primaryGenreId)] || 'other'}/${normalizeSlug(book.novelSlug || book.bookName)}`;
}

function checkId(mangaId) {
  const id = String(mangaId || '').trim();
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) throw new Error(`NovelHi: "${id}" is not a title id of this source`);
  return id;
}

function ageOf(names) {
  return names.some((n) => RATE_16.indexOf(n) >= 0) ? 16 : 0;
}

function authorOf(name) {
  const text = oneLine(name);
  return text && !/^(0|1|-|default|null|unknown)$/i.test(text) ? text : '';
}

function mapStatus(value) {
  const s = String(value || '').toLowerCase();
  if (s === '1' || s.indexOf('complete') >= 0) return 'COMPLETED';
  if (s === '0' || s.indexOf('ongoing') >= 0) return 'ONGOING';
  return 'UNKNOWN';
}

function genreNames(book) {
  const names = [];
  (Array.isArray(book.genres) ? book.genres : []).forEach((g) => {
    const name = oneLine(g && (g.genreName || g.name));
    if (name && names.indexOf(name) < 0) names.push(name);
  });
  return names;
}

function cardOf(book) {
  const path = pathOf(book);
  const names = genreNames(book);
  const card = {
    mangaId: path,
    title: oneLine(book.bookName),
    image: String(book.picUrl || ''),
    referer: `${SITE}/`,
    medium: 'novel',
    webURL: `${SITE}/novel/${path}`,
    tags: names,
    ageRating: ageOf(names),
    completed: String(book.bookStatus) === '1',
  };
  const author = authorOf(book.authorName);
  if (author) card.author = author;
  const views = Number(book.visitCount);
  if (Number.isFinite(views)) card.views = views;
  return card;
}

function unscramble(text) {
  return String(text).replace(/[A-Za-z0-9]/g, (c) => {
    const k = c.charCodeAt(0);
    if (k >= 48 && k <= 57) return String.fromCharCode(48 + ((k - 48 + 5) % 10));
    const base = k >= 97 ? 97 : 65;
    return String.fromCharCode(base + ((k - base + 13) % 26));
  });
}

function englishShare(text) {
  const words = String(text).toLowerCase().match(/[a-z']+/g) || [];
  if (words.length < 30) return -1;
  let hit = 0;
  words.forEach((w) => {
    if (COMMON.has(w)) hit++;
  });
  return hit / words.length;
}

function paragraphsOf(html) {
  return String(html || '')
    .split(/(?:<br\s*\/?>\s*)+/i)
    .map((part) =>
      part
        .replace(/<\/?sent\b[^>]*>/gi, ' ')
        .replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, '')
        .replace(/[\u00a0\u200b]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

function chapterText(data) {
  const content = typeof data === 'string' ? data : data && data.content;
  if (typeof content !== 'string' || !content.trim()) return '';
  const scrambled = typeof data === 'object' && data && data.fontObfuscation === true;
  const paragraphs = paragraphsOf(content).map((p) => decodeEntities(p));
  const plain = paragraphs.join('\n\n');
  if (!scrambled) return plain;
  const decoded = decodeEntities(unscramble(plain));
  const share = englishShare(decoded);
  const known = String((data && data.fontFaceCss) || '').indexOf(KNOWN_FONT) >= 0;
  if (share >= 0.1 || (share < 0 && known)) return decoded;
  if (englishShare(plain) >= 0.1) return plain;
  const font = (String((data && data.fontFaceCss) || '').match(/url\('?([^')]+)/) || [])[1] || 'unknown';
  throw new Error(`NovelHi: the chapter text does not read as English after undoing the site's letter substitution (font ${font}), so the site probably changed its scrambling and this source needs an update`);
}

function hidden(html, id) {
  const m = String(html).match(new RegExp(`id="${id}"\\s+value="([^"]*)"`));
  return m ? decodeEntities(m[1]) : '';
}

function isGone(response) {
  if (!response) return true;
  if (response.status === 404) return true;
  return /<title>\s*Page Not Found/i.test(String(response.data || '').slice(0, 800));
}

class Source {
  constructor() {
    this.pages = App.createRequestManager({});
    this.reading = App.createRequestManager({ rateLimit: { requestsPerSecond: 0.3 } });
    this.coolUntil = 0;
    this.allowed = undefined;
    this.byName = null;
    this.catalogPromise = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[2] }));
  }

  async get(url, accept, manager) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await (manager || this.pages).schedule(
        App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: accept || 'text/html' } }),
      );
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
      last = response;
      await pause(800);
    }
    return last;
  }

  async listApi(params) {
    const parts = [`curr=${params.curr}`, `limit=${params.limit}`];
    if (params.keyword) parts.push(`keyword=${enc(params.keyword)}`);
    (params.genres || []).forEach((id) => parts.push(`bookGenres%5B%5D=${enc(id)}`));
    if (params.status !== undefined) parts.push(`bookStatus=${params.status}`);
    const url = `${SITE}/book/searchBookListWithShelfState?${parts.join('&')}`;
    let body = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.get(url, 'application/json');
      if (response.status < 200 || response.status >= 300) throw new Error(`NovelHi: the novel list answered HTTP ${response.status}`);
      try {
        body = JSON.parse(response.data);
      } catch (e) {
        throw new Error('NovelHi: the novel list is not JSON');
      }
      if (body && String(body.code) === '200' && body.data) return body.data;
      if (!/too fast|try again later/i.test(String((body && body.msg) || ''))) break;
      await pause(1500 * (attempt + 1));
    }
    throw new Error(`NovelHi: the novel list says "${(body && body.msg) || 'no data'}"`);
  }

  async allowedSet() {
    if (this.allowed !== undefined) return this.allowed;
    try {
      const response = await this.get(`${SITE}/sitemap-book-detail.xml`, 'application/xml');
      if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
      const set = new Set();
      const bySlug = new Map();
      const re = /<loc>https:\/\/novelhi\.com\/novel\/([^<\s]+)<\/loc>/g;
      let m;
      while ((m = re.exec(response.data))) {
        set.add(m[1]);
        const slug = m[1].split('/')[1];
        if (slug && !bySlug.has(slug)) bySlug.set(slug, m[1]);
      }
      if (set.size < 100) throw new Error('the sitemap holds too few titles');
      this.allowed = set;
      this.byName = bySlug;
    } catch (e) {
      console.error('NovelHi sitemap not read, removed titles are not filtered: ' + (e && e.message));
      this.allowed = null;
    }
    return this.allowed;
  }

  async visible(books) {
    const allowed = await this.allowedSet();
    if (!allowed) return books;
    return books.filter((b) => allowed.has(pathOf(b)));
  }

  async catalog() {
    if (!this.catalogPromise) {
      this.catalogPromise = this.loadCatalog().catch((e) => {
        this.catalogPromise = null;
        throw e;
      });
    }
    return this.catalogPromise;
  }

  async loadCatalog() {
    const first = await this.listApi({ curr: 1, limit: CATALOG_PAGE });
    const total = Number(first.total) || 0;
    const lists = [first.list || []];
    for (let p = 2; p <= Math.ceil(total / CATALOG_PAGE) && p <= 10; p++) lists.push((await this.listApi({ curr: p, limit: CATALOG_PAGE })).list || []);
    const seen = new Set();
    const rows = [];
    lists.forEach((list) => {
      list.forEach((b) => {
        if (!b || seen.has(b.id)) return;
        seen.add(b.id);
        rows.push({
          id: b.id,
          bookName: b.bookName,
          authorName: b.authorName,
          picUrl: b.picUrl,
          novelSlug: b.novelSlug,
          primaryGenreId: b.primaryGenreId,
          bookStatus: b.bookStatus,
          visitCount: b.visitCount,
          genres: Array.isArray(b.genres) ? b.genres.map((g) => ({ genreId: g.genreId, genreName: g.genreName })) : [],
        });
      });
    });
    const visible = await this.visible(rows);
    visible.sort((a, b) => (Number(b.visitCount) || 0) - (Number(a.visitCount) || 0));
    return visible;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = oneLine(request && request.title)
      .replace(/[%_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const typed = oneLine(request && request.title);
    if (typed && !query) return { results: [] };
    const page = Math.max(1, Number(metadata && metadata.page) || 1);
    const feed = (request && request.feed) || 'latest';
    const genres = (Array.isArray(request && request.includedTags) ? request.includedTags : [])
      .map((t) => String((t && t.id) || t || ''))
      .filter((id) => GENRE_SLUG[id] !== undefined);

    if (!query && feed === 'popular') {
      const all = await this.catalog();
      const wanted = genres.length ? all.filter((b) => genres.every((id) => b.genres.some((g) => String(g.genreId) === id))) : all;
      const slice = wanted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return { results: slice.map(cardOf), metadata: page * PAGE_SIZE < wanted.length ? { page: page + 1 } : undefined };
    }

    const params = { curr: page, limit: PAGE_SIZE, keyword: query, genres };
    if (!query && feed === 'ongoing') params.status = 0;
    if (!query && feed === 'completed') params.status = 1;
    const data = await this.listApi(params);
    const list = Array.isArray(data.list) ? data.list : [];
    const books = await this.visible(list);
    const more = list.length > 0 && page * PAGE_SIZE < (Number(data.total) || 0);
    return { results: books.map(cardOf), metadata: more ? { page: page + 1 } : undefined };
  }

  async titlePage(mangaId, suffix) {
    let path = checkId(mangaId);
    let response = await this.get(`${SITE}/novel/${path}${suffix || ''}`, 'text/html');
    if (isGone(response)) {
      const allowed = await this.allowedSet();
      if (allowed && allowed.has(path)) {
        await pause(1500);
        response = await this.get(`${SITE}/novel/${path}${suffix || ''}`, 'text/html');
        if (!isGone(response)) return { path, response };
      }
      const slug = path.split('/')[1];
      const moved = this.byName ? this.byName.get(slug) : null;
      if (moved && moved !== path) {
        path = moved;
        response = await this.get(`${SITE}/novel/${path}${suffix || ''}`, 'text/html');
      }
    }
    return { path, response };
  }

  removedError() {
    return new Error('NovelHi removed this novel after a copyright (DMCA) notice, so it has no chapters here');
  }

  async getMangaDetails(mangaId) {
    const { path, response } = await this.titlePage(mangaId, '');
    if (isGone(response)) throw new Error('NovelHi: this title was not found (it may have been removed)');
    if (response.status < 200 || response.status >= 300) throw new Error(`NovelHi: the title page answered HTTP ${response.status}`);
    const html = String(response.data || '');
    if (hidden(html, 'copyrightProtectedFlag') === 'true') throw this.removedError();
    const $ = cheerio.load(html);
    const title = oneLine(hidden(html, 'bookNamedHidden') || $('b.layui-icon').first().text());
    if (!title) throw new Error('NovelHi: the title page has no name (the layout changed?)');
    const bookId = hidden(html, 'bookId');
    let names = [];
    if (bookId) {
      try {
        const g = await this.get(`${SITE}/book/queryBookGenre?bookId=${enc(bookId)}`, 'application/json');
        if (g.status >= 200 && g.status < 300) names = genreNames({ genres: (JSON.parse(g.data) || {}).data || [] });
      } catch (e) {
        console.error('NovelHi genres not read: ' + (e && e.message));
      }
    }
    const descNode = $('.mobile-detail-desc').first();
    descNode.find('br').replaceWith('\n');
    const desc = String(descNode.text() || '')
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
    const statusMatch = html.match(/Status[:\uff1a]\s*(?:<[^>]*>\s*)*([A-Za-z]+)/);
    const status = mapStatus(statusMatch ? statusMatch[1] : '');
    const image = String($('img.decorate-img').first().attr('src') || hidden(html, 'pictureHidden') || '').trim();
    const info = {
      title,
      image,
      referer: `${SITE}/`,
      status,
      tags: names,
      webURL: `${SITE}/novel/${path}`,
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: ageOf(names),
    };
    if (desc) info.desc = desc;
    const author = authorOf(hidden(html, 'authorName'));
    if (author) info.author = author;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { response } = await this.titlePage(mangaId, '/chapters');
    if (isGone(response)) throw new Error('NovelHi: this title was not found (it may have been removed)');
    if (response.status === 301 || response.status === 302) throw this.removedError();
    if (response.status < 200 || response.status >= 300) throw new Error(`NovelHi: the chapter list answered HTTP ${response.status}`);
    const html = String(response.data || '');
    const chapters = [];
    const seen = new Set();
    const re = /<a\b[^>]*\bid="chapter-(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      const id = String(Number(m[1]));
      if (seen.has(id)) continue;
      seen.add(id);
      const label = (m[2].match(/<span[^>]*class="[^"]*mobile-chapter-item__name[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
      chapters.push({ id, chapterId: id, name: oneLine(label) || `Chapter ${id}`, number: Number(id) });
    }
    if (!chapters.length) {
      if (hidden(html, 'copyrightProtectedFlag') === 'true' || /permanently removed/i.test(html)) throw this.removedError();
      throw new Error('NovelHi: the chapter list has no chapters (the layout changed, or the title is empty)');
    }
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async readContent(pageUrl, contentPath, token) {
    const url = `${SITE}${contentPath}${contentPath.indexOf('?') >= 0 ? '&' : '?'}token=${enc(token)}`;
    let response = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const wait = this.coolUntil - Date.now();
      if (wait > 0) await pause(wait);
      response = await this.reading.schedule(
        App.createRequest({
          url,
          method: 'GET',
          headers: {
            'User-Agent': UA,
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: pageUrl,
          },
        }),
      );
      if (response.status !== 429) return response;
      this.coolUntil = Math.max(this.coolUntil, Date.now() + 4000 * (attempt + 1));
    }
    return response;
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = String(chapterId || '').trim();
    if (!/^\d+$/.test(id)) throw new Error(`NovelHi: "${id}" is not a chapter id of this source`);
    let status = 0;
    for (let round = 0; round < 3; round++) {
      const { path, response } = await this.titlePage(mangaId, `/${id}${round ? `?r=${Date.now()}` : ''}`);
      if (isGone(response)) throw new Error('NovelHi: this chapter was not found');
      if (response.status === 301 || response.status === 302) throw this.removedError();
      const html = String(response.data || '');
      const token = hidden(html, 'chapterContentToken');
      const contentPath = hidden(html, 'chapterContentPath');
      if (!token || !contentPath) {
        if (hidden(html, 'copyrightProtectedFlag') === 'true' || /permanently removed/i.test(html)) throw this.removedError();
        throw new Error(`NovelHi: the chapter page has no text address (HTTP ${response.status}, the layout changed?)`);
      }
      const pageUrl = `${SITE}/novel/${path}/${id}`;
      const answer = await this.readContent(pageUrl, contentPath, token);
      status = answer.status;
      if (status === 403 || status === 404) continue;
      if (status === 429) throw new Error('NovelHi is limiting how fast chapters can be read (HTTP 429), try again in a minute');
      if (status < 200 || status >= 300) throw new Error(`NovelHi: the chapter text answered HTTP ${status}`);
      let body;
      try {
        body = JSON.parse(answer.data);
      } catch (e) {
        throw new Error('NovelHi: the chapter text is not JSON');
      }
      if (!body || String(body.code) !== '200' || !body.data) throw new Error(`NovelHi: the chapter text says "${(body && body.msg) || 'no data'}" (a reading limit, or a login is wanted)`);
      const text = chapterText(body.data);
      if (!text) throw new Error('NovelHi has no text for this chapter');
      return { id: chapterId, mangaId, pages: [], text };
    }
    throw new Error(`NovelHi: the chapter text was refused (HTTP ${status}) even with a fresh page`);
  }
}

module.exports = { Source };
