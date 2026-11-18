const SITE = 'https://www.novelcool.com';
const MAX_PAGE = 250;
const GROUP = 3;
const POOL = 6;
const INDEX_MS = 2 * 60 * 60 * 1000;
const COMPLETE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;
const NOVEL_MS = 60 * 1000;
const STATE_KEY = 'ratings';
const DEAD_KEY = 'dead';
const DEAD_MAX = 800;
const SEED_DEAD = [
  'Almighty-Sword-Domain', 'Infinite-Mage', 'Lord-of-the-Mysteries', 'My-Accidental-Husband-is-a-Billionaire', 'Nine-Star-Hegemon-Body-Arts',
  'ONS-Pregnant-With-CEO-s-Baby', 'Second-Life-Ranker', 'Super-God-Gene',
];
const HOME_TITLE = /^Novel Cool - Best online light novel reading website\s*$/i;

const FEEDS = [
  { id: 'popular', name: 'Popular', path: 'popular', single: true },
  { id: 'rating', name: 'Top Rated', path: 'index' },
  { id: 'ongoing', name: 'Ongoing', path: 'updated' },
  { id: 'completed', name: 'Completed', path: 'completed' },
];

const RATE_18 = ['Adult', 'Smut'];
const RATE_16 = ['Mature', 'Ecchi'];
const NAMES_18 = ['adult', 'smut', 'hentai', 'erotica', 'pornographic', 'fetish', 'milf', 'netorare/ntr'];
const NAMES_16 = ['mature', 'ecchi', 'violence', 'gore'];

const HIDDEN_GENRES = [
  '4 koma', '4-koma', 'adaptation', 'anthology', 'artbook', 'comics', 'comic', 'completed', 'doujinshi', 'fan colored', 'full color', 'long strip', 'manga',
  'manhua', 'manhwa', 'official colored', 'one shot', 'oneshot', 'teaser', 'toomics', 'uncategorized', 'user created', 'web comic', 'webtoon', 'webtoons',
];

const FALLBACK_GENRES = [
  ['Action', 'Action'], ['Adult', 'Adult'], ['Adventure', 'Adventure'], ['Comedy', 'Comedy'], ['Cultivation', 'Cultivation'], ['Drama', 'Drama'],
  ['Ecchi', 'Ecchi'], ['Fantasy', 'Fantasy'], ['Fantasy+Romance', 'Fantasy Romance'], ['Harem', 'Harem'], ['Historical', 'Historical'], ['Horror', 'Horror'],
  ['Isekai', 'Isekai'], ['Magic', 'Magic'], ['Martial+Arts', 'Martial Arts'], ['Mature', 'Mature'], ['Mecha', 'Mecha'], ['Mystery', 'Mystery'],
  ['Psychological', 'Psychological'], ['Rebirth', 'Rebirth'], ['Reincarnation', 'Reincarnation'], ['Romance', 'Romance'], ['School+Life', 'School Life'],
  ['Sci-fi', 'Sci-Fi'], ['Slice+of+Life', 'Slice Of Life'], ['Smut', 'Smut'], ['Sports', 'Sports'], ['Supernatural', 'Supernatural'], ['System', 'System'],
  ['Tragedy', 'Tragedy'], ['Web+Novel', 'Web Novel'], ['Wuxia', 'Wuxia'], ['Xianxia', 'Xianxia'], ['Xuanhuan', 'Xuanhuan'],
];

const JUNK_LINES = [
  /^\(?\s*end of (this )?chapter\s*\)?\.?$/i,
  /if you find any errors.*please let us know/i,
  /^if audio player doesn't work/i,
  /readel\.me|uukanshu\.com|novelcool\.\S{2,4}\s*\.?$/i,
  /^please continue reading on /i,
  /find authorized novels in webnovel/i,
  /free read\.https?:\/\/$/i,
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e.charAt(0) === '#') {
      const code = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] !== undefined ? ENTITIES[e.toLowerCase()] : m;
  });
}

function oneLine(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function pool(items, limit, fn) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await fn(items[i], i);
    }
  };
  const workers = [];
  for (let w = 0; w < Math.min(limit, items.length); w += 1) workers.push(run());
  await Promise.all(workers);
}

function between(html, from, to) {
  const a = from ? html.indexOf(from) : 0;
  if (a < 0) return '';
  if (!to) return html.slice(a);
  const b = html.indexOf(to, a + from.length);
  return b < 0 ? html.slice(a) : html.slice(a, b);
}

function slugOf(href) {
  const m = /\/novel\/([^\/?#]+?)\.html/.exec(String(href || ''));
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
    text = String(piece);
  }
  return encodeURIComponent(text);
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  return 'UNKNOWN';
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const UNITS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };

function parseDate(text) {
  const t = oneLine(text);
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/.exec(t);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) return Date.UTC(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  const r = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i.exec(t);
  return r ? Date.now() - Number(r[1]) * UNITS[r[2].toLowerCase()] : undefined;
}

function ageOfNames(names) {
  const have = names.map((n) => oneLine(n).toLowerCase());
  if (have.some((n) => NAMES_18.indexOf(n) !== -1)) return 18;
  if (have.some((n) => NAMES_16.indexOf(n) !== -1)) return 16;
  return 0;
}

function parseCards(html) {
  const $ = cheerio.load(`<div>${between(html, 'category-book-list') || html}</div>`);
  const seen = new Set();
  const cards = [];
  let raw = 0;
  $('.book-item').each((i, el) => {
    const $c = $(el);
    raw += 1;
    const type = oneLine($c.find('.book-type').first().text());
    if (/^manga$/i.test(type)) return;
    const href = $c.find('a').first().attr('href') || '';
    const slug = slugOf(href);
    if (!slug || seen.has(slug)) return;
    const title = oneLine($c.find('.book-name').first().text());
    if (!title) return;
    seen.add(slug);
    const $img = $c.find('img').first();
    let image = oneLine($img.attr('lazy_url') || $img.attr('src'));
    if (image.indexOf('//') === 0) image = `https:${image}`;
    if (image.charAt(0) === '/') image = `${SITE}${image}`;
    cards.push({
      slug,
      title,
      image: /^https?:\/\//.test(image) ? image : undefined,
      tags: $c
        .find('.book-tag')
        .map((j, t) => oneLine($(t).text()))
        .get()
        .filter(Boolean),
    });
  });
  return { cards, raw };
}

function parsePager(html) {
  const m = /page-nav-center-num[^>]*>\s*(\d+)\s*\/\s*(\d+)\s*</.exec(html);
  return m ? { page: Number(m[1]), total: Math.min(Number(m[2]), MAX_PAGE) } : null;
}

function listPath(feedPath, n) {
  if (feedPath === 'index') return `/category/index_${n}.html`;
  return n <= 1 ? `/category/${feedPath}.html` : `/category/${feedPath}_${n}.html`;
}

function toCard(card, rated, alive) {
  const manga = { mangaId: card.slug, title: card.title, medium: 'novel', webURL: `${SITE}/novel/${card.slug}.html` };
  if (card.image) manga.image = card.image;
  if (card.tags.length) manga.tags = card.tags;
  let age = ageOfNames(card.tags);
  if (age < 18 && rated.a18 && rated.a18.has(card.slug)) age = 18;
  else if (age < 16 && rated.a16 && rated.a16.has(card.slug)) age = 16;
  if (age > 0 || rated.complete) manga.ageRating = age;
  return manga;
}

function chapterName(title, novelTitle) {
  let name = oneLine(decodeEntities(title));
  const t = oneLine(novelTitle);
  if (t && name.toLowerCase().indexOf(t.toLowerCase()) === 0) name = name.slice(t.length).replace(/^[\s:\-\u2013\u2014.]+/, '');
  return name;
}

function chapterNumber(name) {
  const m = /(?:^|[^a-z])(?:chapter|chap|ch|c)\.?\s*(\d+(?:\.\d+)?)/i.exec(name);
  if (m) return Number(m[1]);
  const lead = /^(\d+(?:\.\d+)?)\b/.exec(name);
  return lead ? Number(lead[1]) : undefined;
}

function scanChapters(html) {
  const start = html.indexOf('chapter-item-list');
  if (start < 0) return [];
  const rows = [];
  let at = html.indexOf('class="chp-item"', start);
  while (at >= 0) {
    const next = html.indexOf('class="chp-item"', at + 16);
    const block = html.slice(at, next < 0 ? Math.min(html.length, at + 4000) : next);
    const href = /href="([^"]+)"/.exec(block);
    const title = /title="([^"]*)"/.exec(block);
    const time = /chapter-item-time">([^<]*)</.exec(block);
    if (href) rows.push({ href: href[1], title: title ? title[1] : '', time: time ? time[1] : '' });
    at = next;
  }
  return rows;
}

function chapterParagraphs(html) {
  const mark = html.indexOf('class="chapter-title');
  if (mark < 0) return null;
  const from = html.lastIndexOf('<h2', mark);
  let end = html.indexOf('chapter-end-mark', mark);
  end = end < 0 ? Math.min(html.length, mark + 600000) : html.lastIndexOf('<', end);
  const $ = cheerio.load(`<div id="root">${html.slice(from < 0 ? mark : from, end)}</div>`);
  const h2 = $('h2.chapter-title').first();
  const heading = oneLine(h2.text());
  const paras = [];
  let cur = [];
  let breaks = 0;
  const flush = () => {
    const text = cur.join('\n').trim();
    if (text) paras.push(text);
    cur = [];
  };
  let started = false;
  h2.parent()
    .contents()
    .each((i, node) => {
      if (!started) {
        if (node.type === 'tag' && /chapter-start-mark/.test($(node).attr('class') || '')) started = true;
        return;
      }
      if (node.type === 'text') {
        const text = oneLine($(node).text());
        if (!text) return;
        if (breaks >= 2) flush();
        cur.push(text);
        breaks = 0;
        return;
      }
      if (node.type !== 'tag') return;
      if (node.name === 'br') {
        breaks += 1;
      } else if (node.name === 'p') {
        flush();
        const text = oneLine($(node).text());
        if (text) paras.push(text);
        breaks = 0;
      }
    });
  flush();
  const squash = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (paras.length > 1 && squash(paras[0]) && squash(heading) && squash(heading).indexOf(squash(paras[0])) !== -1) paras.shift();
  return paras
    .map((p) =>
      p
        .split('\n')
        .filter((line) => !JUNK_LINES.some((rx) => rx.test(oneLine(line))))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.state = App.createSourceStateManager();
    this._novels = new Map();
    this._tags = null;
    this._restored = null;
    this._dead = SEED_DEAD.slice();
    this._a18 = null;
    this._a18At = 0;
    this._load18 = null;
    this._a16 = null;
    this._a16At = 0;
    this._load16 = null;
    this._failedAt = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this._tags) return this._tags;
    let tags = [];
    try {
      const html = await this.page('/category.html');
      const $ = cheerio.load(`<div>${between(html, 'cate_genres', 'cate_year') || ''}</div>`);
      $('.category-list a').each((i, a) => {
        const href = $(a).attr('href') || '';
        const m = /\/category\/([^\/]+)\.html/.exec(href);
        const label = oneLine($(a).attr('title') || $(a).text());
        if (m && label && !/^all$/i.test(label) && HIDDEN_GENRES.indexOf(label.toLowerCase()) === -1) tags.push({ id: m[1], label });
      });
    } catch (e) {
      console.error('NovelCool getSearchTags failed: ' + (e && e.message));
    }
    if (tags.length < 20) return FALLBACK_GENRES.map((g) => ({ id: g[0], label: g[1] }));
    this._tags = tags;
    return tags;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const first = Math.max(1, Number(metadata && metadata.page) || 1);
    const query = oneLine(request && request.title);
    const genre = ((request && request.includedTags) || [])
      .map((t) => oneLine(t && (t.id !== undefined ? t.id : t)))
      .find((t) => /^[^\/?#\\]+$/.test(t));
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const urlOf = (n) => {
      if (query) return `/search/?name=${encodeURIComponent(query)}${n > 1 ? `&page=${n}` : ''}`;
      if (genre) return listPath(genre, n);
      return listPath(feed.path, n);
    };
    const single = !query && !genre && feed.single;
    let next = first;
    let end = false;
    const cards = [];
    const seen = new Set();
    for (let round = 0; round < 3 && !end; round += 1) {
      if (round > 0 && cards.length >= 12) break;
      const wanted = [];
      for (let n = next; n < next + GROUP && n <= MAX_PAGE && !(single && n > 1); n += 1) wanted.push(n);
      if (!wanted.length) {
        end = true;
        break;
      }
      const pages = new Array(wanted.length);
      await pool(wanted, POOL, async (n, i) => {
        pages[i] = await this.listPage(urlOf(n), n);
      });
      let total = 0;
      let empty = false;
      pages.forEach((p) => {
        if (p.pager) total = Math.max(total, p.pager.total);
        if (!p.raw) empty = true;
        p.cards.forEach((c) => {
          if (!seen.has(c.slug)) {
            seen.add(c.slug);
            cards.push(c);
          }
        });
      });
      next += wanted.length;
      if (empty || single || next > MAX_PAGE || (total && next > total)) end = true;
    }
    const rated = await this.ratings();
    const known = new Set(this._dead);
    return { results: cards.filter((c) => !known.has(c.slug)).map((c) => toCard(c, rated)), metadata: end ? undefined : { page: next } };
  }

  async getMangaDetails(mangaId) {
    const { info } = await this._novel(mangaId);
    const rated = await this.ratings(true);
    const mangaInfo = Object.assign({}, info);
    if (rated.a18 && rated.a18.has(mangaInfo.mangaId)) mangaInfo.ageRating = 18;
    else if (mangaInfo.ageRating < 16 && rated.a16 && rated.a16.has(mangaInfo.mangaId)) mangaInfo.ageRating = 16;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const { rows, title } = await this._novel(mangaId);
    if (!rows.length) return [];
    const local = rows.filter((r) => /^https?:\/\/(www\.)?novelcool\.com\/chapter\//.test(r.href));
    if (!local.length) {
      throw new Error('NovelCool lists this title\u2019s chapters only as links to other sites (its app), so it cannot be read here.');
    }
    const seen = new Set();
    const items = [];
    local.forEach((r, i) => {
      const m = /\/chapter\/[^\/]*\/(\d+)/.exec(r.href);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const name = chapterName(r.title, title) || `Chapter ${local.length - i}`;
      items.push({ id: m[1], name, parsed: chapterNumber(name), position: local.length - i, time: parseDate(r.time) });
    });
    const printed = items.map((c) => c.parsed);
    const unique = printed.every((n, i) => n !== undefined && (i === 0 || n < printed[i - 1]));
    return items.map((c) => {
      const entry = { id: c.id, chapterId: c.id, name: c.name, number: unique ? c.parsed : c.position };
      if (c.time !== undefined) entry.time = c.time;
      return entry;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = String(chapterId).trim();
    if (!/^\d{3,12}$/.test(id)) throw new Error(`NovelCool: ${chapterId} is not a chapter id`);
    const html = await this.page(`/chapter/c/${id}/`);
    const paras = chapterParagraphs(html);
    if (!paras) {
      if (html.indexOf('mangaread-manga-pic') !== -1) throw new Error('NovelCool: this chapter is a set of comic pages (images on another host), not text, so it cannot be read here.');
      throw new Error('NovelCool: the chapter page no longer carries its text');
    }
    const text = paras.join('\n\n');
    if (text.length < 30) {
      return {
        id,
        mangaId,
        pages: [],
        text: `NovelCool has no text for this chapter (the page is empty), so there is nothing to retry. The next chapter reads normally.\n\n${SITE}/chapter/c/${id}/`,
      };
    }
    return { id, mangaId, pages: [], text };
  }

  async load(path) {
    let failure = new Error('NovelCool: no answer');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = attempt === 0 ? `${SITE}${path}` : `${SITE}${path}${path.indexOf('?') === -1 ? '?' : '&'}r=${attempt}`;
      try {
        const res = await this.requests.schedule(App.createRequest({ url: target, method: 'GET', headers: { Accept: 'text/html' } }));
        if (res.status >= 500 && attempt === 0) {
          failure = new Error(`NovelCool: HTTP ${res.status}`);
          continue;
        }
        return res;
      } catch (e) {
        failure = e;
      }
    }
    throw failure;
  }

  async page(path) {
    const res = await this.load(path);
    if (res.status >= 300 && res.status < 400) throw new Error('NovelCool: the site sends this page to its home page (the title or chapter is not available)');
    if (res.status !== 200) throw new Error(`NovelCool: HTTP ${res.status}`);
    return String(res.data || '');
  }

  async listPage(path, n) {
    const res = await this.load(path);
    if (res.status === 404 || (res.status >= 300 && res.status < 400)) return { cards: [], raw: 0, pager: null };
    if (res.status !== 200) throw new Error(`NovelCool: HTTP ${res.status}`);
    const html = String(res.data || '');
    const pager = parsePager(html);
    if (n > 1) {
      const title = /<title>([^<]*)/.exec(html);
      const named = title && new RegExp(`\\bPage ${n}\\b`).test(title[1]);
      if (!named && !(pager && pager.page === n)) return { cards: [], raw: 0, pager: null };
    }
    const parsed = parseCards(html);
    return { cards: parsed.cards, raw: parsed.raw, pager };
  }

  _novel(mangaId) {
    const key = String(mangaId);
    const hit = this._novels.get(key);
    if (hit && Date.now() - hit.at < NOVEL_MS) return hit.promise;
    const promise = this.page(`/novel/${seg(key)}.html`).then((html) => {
      const head = between(html, 'class="bookinfo-module"', 'chapter-item-list') || html.slice(0, 60000);
      const $ = cheerio.load(`<div>${head.length > 200000 ? head.slice(0, 200000) : head}</div>`);
      const type = oneLine($('.bookinfo-pic .book-type').first().text());
      if (/^manga$/i.test(type)) throw new Error('NovelCool shows its manga chapters only through links to other sites, so this title cannot be read here.');
      const title = oneLine($('h1.bookinfo-title').first().text());
      if (!title) {
        const page = /<title>([^<]*)/.exec(html);
        if (page && HOME_TITLE.test(oneLine(page[1]))) {
          this.markDead(key).catch(() => {});
          throw new Error('NovelCool: this title is not available (the site answers with its home page)');
        }
        throw new Error('NovelCool: the title page no longer carries its data');
      }
      const genres = [];
      let status = 'UNKNOWN';
      $('.bk-cate-item').each((i, el) => {
        const $a = $(el).find('a').first();
        const href = $a.attr('href') || '';
        const label = oneLine($a.attr('title') || $a.text());
        if (/\/category\/(updated|completed)\.html/.test(href)) status = mapStatus(label);
        else if (/\/category\//.test(href) && label && genres.indexOf(label) === -1) genres.push(label);
      });
      const rows = scanChapters(html);
      const info = {
        mangaId: key,
        title,
        status,
        completed: status === 'COMPLETED',
        medium: 'novel',
        webURL: `${SITE}/novel/${key}.html`,
        ageRating: ageOfNames(genres),
      };
      const image = oneLine($('.bookinfo-pic-img').first().attr('src'));
      if (/^https?:\/\//.test(image)) info.image = image;
      const author = oneLine($('.bookinfo-author').first().text().replace(/^\s*Author:/i, ''));
      if (author) info.author = author;
      if (genres.length) info.tags = genres;
      const summary = oneLine($('.bk-summary-txt').first().text());
      info.desc = summary && !/^n\/a$/i.test(summary) ? summary : 'NovelCool has no summary for this title.';
      if (rows.length) info.chapters = rows.length;
      return { info, rows, title };
    });
    this._novels.set(key, { at: Date.now(), promise });
    promise.catch(() => this._novels.delete(key));
    return promise;
  }

  async titlesOf(names) {
    const slugs = new Set();
    for (let i = 0; i < names.length; i += 1) {
      const first = await this.listPage(`/category/${names[i]}.html`, 1);
      first.cards.forEach((c) => slugs.add(c.slug));
      const total = first.pager ? first.pager.total : 1;
      const rest = [];
      for (let n = 2; n <= total; n += 1) rest.push(n);
      await pool(rest, POOL, async (n) => {
        const page = await this.listPage(`/category/${names[i]}_${n}.html`, n);
        page.cards.forEach((c) => slugs.add(c.slug));
      });
    }
    return slugs;
  }

  async restore() {
    if (!this._restored) {
      this._restored = (async () => {
        try {
          const raw = await this.state.retrieve(STATE_KEY);
          const data = typeof raw === 'string' ? parseJson(raw) : raw;
          const gone = await this.state.retrieve(DEAD_KEY);
          const dead = typeof gone === 'string' ? parseJson(gone) : gone;
          if (dead && dead.v === 1 && typeof dead.d === 'string') dead.d.split('\n').forEach((d) => d && this._dead.indexOf(d) === -1 && this._dead.push(d));
          if (data && data.v === 1) {
            if (typeof data.a18 === 'string' && Number(data.at18) > 0) {
              this._a18 = new Set(data.a18.split('\n').filter(Boolean));
              this._a18At = Number(data.at18);
            }
            if (typeof data.a16 === 'string' && Number(data.at16) > 0) {
              this._a16 = new Set(data.a16.split('\n').filter(Boolean));
              this._a16At = Number(data.at16);
            }
          }
        } catch (e) {
        }
      })();
    }
    return this._restored;
  }

  async persist() {
    try {
      const data = { v: 1 };
      if (this._a18) {
        data.at18 = this._a18At;
        data.a18 = Array.from(this._a18).join('\n');
      }
      if (this._a16) {
        data.at16 = this._a16At;
        data.a16 = Array.from(this._a16).join('\n');
      }
      await this.state.store(STATE_KEY, JSON.stringify(data));
    } catch (e) {
    }
  }

  async markDead(slug) {
    await this.restore();
    if (this._dead.indexOf(slug) !== -1) return;
    this._dead.push(slug);
    if (this._dead.length > DEAD_MAX) this._dead.splice(0, this._dead.length - DEAD_MAX);
    try {
      await this.state.store(DEAD_KEY, JSON.stringify({ v: 1, d: this._dead.join('\n') }));
    } catch (e) {
    }
  }

  async loadIndex(names, which) {
    const set = await this.titlesOf(names);
    this[`_${which}`] = set;
    this[`_${which}At`] = Date.now();
    await this.persist();
  }

  refresh() {
    const fresh = (at) => at && Date.now() - at < INDEX_MS;
    if (Date.now() - this._failedAt < RETRY_MS) return;
    const failed = (e) => {
      this._failedAt = Date.now();
      console.error('NovelCool rating index failed: ' + (e && e.message));
    };
    if (!this._load18 && !fresh(this._a18At)) {
      this._load18 = this.loadIndex(RATE_18, 'a18')
        .catch(failed)
        .then(() => {
          this._load18 = null;
        });
    }
    if (!this._load16 && !fresh(this._a16At)) {
      const after = this._load18 || Promise.resolve();
      this._load16 = after
        .then(() => (Date.now() - this._failedAt < RETRY_MS ? null : this.loadIndex(RATE_16, 'a16')))
        .catch(failed)
        .then(() => {
          this._load16 = null;
        });
    }
  }

  async ratings(all) {
    await this.restore();
    this.refresh();
    if (!this._a18 && this._load18) await this._load18;
    if (all && !this._a16 && this._load16) await this._load16;
    const oldest = Math.min(this._a18At || 0, this._a16At || 0);
    return { a18: this._a18, a16: this._a16, complete: !!(this._a18 && this._a16 && Date.now() - oldest < COMPLETE_MS) };
  }
}

module.exports = { Source };
