const SITE = 'https://linkmanga.com';
const AJAX = SITE + '/wp-admin/admin-ajax.php';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 30;
const IMAGE_HEADERS = { 'User-Agent': UA };
const NO_COVER = SITE + '/wp-content/logo192.png';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', vars: { 'vars[meta_key]': '_latest_update', 'vars[orderby]': 'meta_value', 'vars[order]': 'desc' } },
  { id: 'views', name: 'Most Viewed', vars: { 'vars[meta_key]': '_wp_manga_views', 'vars[orderby]': 'meta_value_num', 'vars[order]': 'desc' } },
  { id: 'trending', name: 'Trending', vars: { 'vars[meta_key]': '_wp_manga_week_views_value', 'vars[orderby]': 'meta_value_num', 'vars[order]': 'desc' } },
  { id: 'new', name: 'New Titles', vars: { 'vars[orderby]': 'date', 'vars[order]': 'desc' } },
  { id: 'alphabet', name: 'A to Z', vars: { 'vars[orderby]': 'title', 'vars[order]': 'asc' } },
];

const GENRES = [
  ['action', 'Action'], ['adult', 'Adult'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['doujinshi', 'Doujinshi'], ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'],
  ['gender-bender', 'Gender Bender'], ['harem', 'Harem'], ['historical', 'Historical'], ['horror', 'Horror'], ['josei', 'Josei'], ['martial-arts', 'Martial Arts'], ['mature', 'Mature'],
  ['mecha', 'Mecha'], ['mystery', 'Mystery'], ['one-shot', 'One Shot'], ['psychological', 'Psychological'], ['romance', 'Romance'], ['school-life', 'School Life'], ['sci-fi', 'Sci-fi'],
  ['seinen', 'Seinen'], ['shotacon', 'Shotacon'], ['shoujo', 'Shoujo'], ['shoujo-ai', 'Shoujo Ai'], ['shounen', 'Shounen'], ['shounen-ai', 'Shounen Ai'], ['slice-of-life', 'Slice of Life'],
  ['smut', 'Smut'], ['sports', 'Sports'], ['supernatural', 'Supernatural'], ['tragedy', 'Tragedy'], ['webtoons', 'Webtoons'], ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
];

const RATE_18 = ['adult', 'smut', 'shotacon', 'hentai', 'erotica', 'lolicon', 'sexual violence'];
const RATE_16 = ['ecchi', 'mature'];

const BANNER_BYTES = '206523';

const SOFT_HYPHEN = new RegExp(String.fromCharCode(173), 'g');
const MOJIBAKE = new RegExp('[' + String.fromCharCode(194) + '-' + String.fromCharCode(244) + '][' + String.fromCharCode(128) + '-' + String.fromCharCode(191) + ']');
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

function cleanText(text) {
  return String(text || '').replace(SOFT_HYPHEN, '').replace(/\s+/g, ' ').trim();
}

function fixMojibake(text) {
  if (typeof text !== 'string' || !MOJIBAKE.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}

function ageOfGenres(genres) {
  const names = (genres || []).map((g) => cleanText(g).toLowerCase());
  if (names.some((n) => RATE_18.indexOf(n) >= 0)) return 18;
  if (names.some((n) => RATE_16.indexOf(n) >= 0)) return 16;
  return 0;
}

function undouble(text) {
  const s = String(text || '');
  const runs = s.match(/e+|E+|i+|I+/g) || [];
  if (runs.length < 6 || runs.some((r) => r.length % 2 !== 0)) return s;
  return s.replace(/e+|E+|i+|I+/g, (r) => r.slice(0, r.length / 2));
}

function parseTime(text) {
  const t = cleanText(text).toLowerCase().replace(/,/g, '');
  if (!t) return undefined;
  let m = /^([a-z]+) (\d{1,2}) (\d{4})$/.exec(t);
  if (m && MONTHS[m[1]] !== undefined) return Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2]));
  m = /^(\d+) (second|minute|hour|day|week|month|year)s? ago$/.exec(t);
  if (m) {
    const unit = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 }[m[2]];
    return Date.now() - Number(m[1]) * unit;
  }
  return undefined;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('complet') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0 || s.indexOf('dropped') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
  }
  return encodeURIComponent(text);
}

function slugOfHref(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const m = /^\/manga\/([^/]+)\/?$/.exec(path);
  return m ? m[1] : '';
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function coverFrom($img) {
  if (!$img || $img.length === 0) return '';
  const srcset = $img.attr('data-srcset') || $img.attr('srcset') || '';
  let best = null;
  srcset.split(',').forEach((part) => {
    const m = /^\s*(\S+)\s+(\d+)w\s*$/.exec(part);
    if (m && Number(m[2]) <= 400 && (!best || Number(m[2]) > best.width)) best = { url: m[1], width: Number(m[2]) };
  });
  const direct = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
  const pick = (best ? best.url : direct).trim();
  return /^data:/.test(pick) ? '' : absolute(pick);
}

function chapterNumberOf(slug, name) {
  const fromSlug = /(?:^|[-_/])(?:chapter|ch|episode|ep)[-_ ]?(\d+)(?:[-_.](\d+))?(?:$|[-_/])/i.exec(slug);
  if (fromSlug) return parseFloat(fromSlug[1] + (fromSlug[2] ? '.' + fromSlug[2] : ''));
  const fromName = /(\d+(?:\.\d+)?)/.exec(name || '');
  if (fromName) return parseFloat(fromName[1]);
  return 0;
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.titles = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async html(url, method, body, referer) {
    const headers = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };
    if (method === 'POST') {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      headers.Referer = referer || SITE + '/';
    }
    let last = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.requests.schedule(App.createRequest({ url, method: method || 'GET', headers, body }));
      last = response.status;
      if (response.status >= 200 && response.status < 300) return fixMojibake(response.data);
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) break;
    }
    throw new Error(`Mangalink HTTP ${last}`);
  }

  genreSlug(tag) {
    const raw = String((tag && (tag.id || tag.label)) || tag || '').trim().toLowerCase();
    const hit = GENRES.find(([id, label]) => id === raw || label.toLowerCase() === raw);
    return hit ? hit[0] : raw.replace(/\s+/g, '-');
  }

  cards(html) {
    const $ = cheerio.load(html);
    const out = [];
    const seen = new Set();
    let raw = 0;
    $('.c-tabs-item__content').each((_, el) => {
      raw++;
      const card = $(el);
      const link = card.find('.post-title a').first();
      const slug = slugOfHref(link.attr('href'));
      const title = cleanText(link.text());
      if (!slug || !title || seen.has(slug)) return;
      seen.add(slug);
      if (card.find('.latest-chap a').length === 0) return;
      const genres = card.find('.mg_genres .summary-content a').map((_, g) => cleanText($(g).text())).get().filter(Boolean);
      const author = card.find('.mg_author .summary-content a').map((_, a) => cleanText($(a).text())).get().filter(Boolean).join(', ');
      const manga = { mangaId: slug, title, image: coverFrom(card.find('.tab-thumb img').first()) || NO_COVER, headers: IMAGE_HEADERS, medium: 'comics', ageRating: ageOfGenres(genres) };
      if (genres.length) manga.tags = genres;
      if (author) manga.author = author;
      if (/complet/i.test(card.find('.mg_status .summary-content').text())) manga.completed = true;
      manga.webURL = `${SITE}/manga/${seg(slug)}/`;
      out.push(manga);
    });
    return { cards: out, raw };
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = Math.max(1, Number(metadata && metadata.page) || 1);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const tags = (Array.isArray(request && request.includedTags) ? request.includedTags : []).map((t) => this.genreSlug(t)).filter(Boolean);
    const params = {
      action: 'madara_load_more',
      page: page - 1,
      template: 'madara-core/content/content-search',
      'vars[paged]': 1,
      'vars[template]': 'search',
      'vars[post_type]': 'wp-manga',
      'vars[post_status]': 'publish',
      'vars[s]': query,
      'vars[posts_per_page]': PAGE_SIZE,
    };
    if (!query) Object.assign(params, feed.vars);
    tags.forEach((slug, i) => {
      params[`vars[tax_query][${i}][taxonomy]`] = 'wp-manga-genre';
      params[`vars[tax_query][${i}][field]`] = 'slug';
      params[`vars[tax_query][${i}][terms]`] = slug;
    });
    if (tags.length > 1) params['vars[tax_query][relation]'] = 'AND';
    const html = await this.html(AJAX, 'POST', qs(params), SITE + '/manga/');
    if (!html || !html.trim()) return { results: [] };
    const { cards, raw } = this.cards(html);
    return { results: cards, metadata: raw >= PAGE_SIZE ? { page: page + 1 } : undefined };
  }

  titlePage(mangaId) {
    const slug = String(mangaId || '').trim();
    if (!slug) throw new Error('Mangalink: no title id');
    const hit = this.titles.get(slug);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.html(`${SITE}/manga/${seg(slug)}/`).then((html) => {
      const $ = cheerio.load(html);
      if ($('.post-title h1').length === 0) throw new Error('Mangalink: title not found');
      return $;
    });
    this.titles.set(slug, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.titles.get(slug) && this.titles.get(slug).promise === promise) this.titles.delete(slug);
    });
    return promise;
  }

  field($, label) {
    let found = null;
    $('.post-content_item').each((_, el) => {
      const heading = cleanText($(el).find('.summary-heading h5, .summary-heading').first().text()).replace(/[:]$/, '');
      if (heading.toLowerCase() === label.toLowerCase()) {
        found = $(el).find('.summary-content').first();
        return false;
      }
    });
    return found;
  }

  coverOf($) {
    const og = absolute($('meta[property="og:image"]').attr('content'));
    if (/\/uploads\/images\/cover-/.test(og)) return og;
    return coverFrom($('.summary_image img').first()) || NO_COVER;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.titlePage(mangaId);
    const slug = String(mangaId).trim();
    const heading = $('.post-title h1').first().clone();
    heading.find('.manga-title-badges, span').remove();
    const title = cleanText(heading.text()) || slug;
    const links = (el) => (el ? el.find('a').map((_, a) => cleanText($(a).text())).get().filter(Boolean) : []);
    const people = [];
    links(this.field($, 'Author(s)') || this.field($, 'Author'))
      .concat(links(this.field($, 'Artist(s)') || this.field($, 'Artist')))
      .forEach((name) => {
        if (!/^(updating|n\/a|unknown|none|-|\?)$/i.test(name) && people.indexOf(name) < 0) people.push(name);
      });
    const genres = links(this.field($, 'Genre(s)') || this.field($, 'Genres'));
    const paragraphs = [];
    $('.summary__content p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) paragraphs.push(t);
    });
    const desc = undouble(paragraphs.length ? paragraphs.join('\n\n') : cleanText($('.summary__content').first().text()));
    const status = mapStatus(cleanText((this.field($, 'Status') || $('')).text()));
    const info = {
      title,
      image: this.coverOf($),
      headers: IMAGE_HEADERS,
      desc,
      status,
      completed: status === 'COMPLETED',
      tags: genres,
      webURL: `${SITE}/manga/${seg(slug)}/`,
      medium: 'comics',
      ageRating: ageOfGenres(genres),
    };
    if (people.length) info.author = people.join(', ');
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.titlePage(mangaId);
    const slug = String(mangaId).trim();
    const prefix = `/manga/${seg(slug)}/`;
    const rows = [];
    const seen = new Set();
    $('li.wp-manga-chapter').each((_, el) => {
      const row = $(el);
      const href = (row.find('a').first().attr('href') || '').trim();
      if (!href || href === '#') return;
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
      let decoded = path;
      try {
        decoded = decodeURI(path);
      } catch (e) {
        decoded = path;
      }
      const own = prefix;
      let rest;
      if (path.indexOf(own) === 0) rest = path.slice(own.length);
      else if (decoded.indexOf(`/manga/${slug}/`) === 0) rest = decoded.slice(`/manga/${slug}/`.length);
      else return;
      rest = rest.replace(/\/+$/, '');
      if (!rest || seen.has(rest)) return;
      seen.add(rest);
      const label = cleanText(row.find('a').first().text()) || rest;
      const dateText = cleanText(row.find('.chapter-release-date').first().text()) || cleanText(row.find('.chapter-release-date a[title]').first().attr('title'));
      rows.push({ id: rest.replace(/\//g, '~'), slug: rest, label, time: parseTime(dateText) });
    });
    if (!rows.length) return [];
    const used = new Set();
    const chapters = rows
      .slice()
      .reverse()
      .map((r, order) => {
        let number = chapterNumberOf(r.slug, r.label);
        while (used.has(number)) number = Math.round((number + 0.0001) * 10000) / 10000;
        used.add(number);
        const chapter = { id: r.id, chapterId: r.id, name: r.label.charAt(0).toUpperCase() + r.label.slice(1), number, order };
        const vol = /(?:^|\/)vol(?:ume)?-(\d+)(?:-(\d+))?(?:\/|$)/i.exec(r.slug);
        if (vol) chapter.volume = String(parseFloat(vol[1] + (vol[2] ? '.' + vol[2] : '')));
        if (r.time !== undefined) chapter.time = r.time;
        return chapter;
      });
    chapters.sort((a, b) => b.number - a.number || b.order - a.order);
    chapters.forEach((c) => delete c.order);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const path = String(chapterId || '').split('~').filter(Boolean).map(seg).join('/');
    if (!path) throw new Error('Mangalink: no chapter id');
    const html = await this.html(`${SITE}/manga/${seg(mangaId)}/${path}/`);
    const $ = cheerio.load(html);
    const pages = [];
    const seen = new Set();
    $('img.wp-manga-chapter-img, .reading-content img, .page-break img').each((_, el) => {
      const e = $(el);
      const src = (e.attr('data-src') || e.attr('data-lazy-src') || e.attr('data-cfsrc') || e.attr('src') || '').trim();
      if (!src || /^data:/.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(absolute(src));
    });
    if (!pages.length) throw new Error('Mangalink returned no pages for this chapter');
    const kept = await this.withoutBanner(pages);
    return { id: chapterId, mangaId, pages: kept, headers: IMAGE_HEADERS };
  }

  async isBanner(url) {
    try {
      const probe = this.requests.schedule(App.createRequest({ url, method: 'HEAD', headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' } })).then((response) => {
        const headers = response.headers || {};
        const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-length');
        return response.status === 200 && key !== undefined && String(headers[key]).trim() === BANNER_BYTES;
      });
      const guard = new Promise((resolve) => setTimeout(() => resolve(false), 4000));
      return await Promise.race([probe, guard]);
    } catch (e) {
      return false;
    }
  }

  async withoutBanner(pages) {
    if (pages.length < 2) return pages;
    const at = new Set([0, 1, pages.length - 2, pages.length - 1]);
    const names = pages.map((u) => u.split('/').pop().toLowerCase());
    let extra = 0;
    for (let i = 2; i < pages.length - 2 && extra < 4; i++) {
      const stem = names[i - 1].replace(/\.[a-z0-9]+$/, '');
      if ((names[i] > names[i + 1] && names[i] > names[i - 1]) || names[i].indexOf(stem + '_') === 0 || names[i].indexOf(stem + '-') === 0) {
        at.add(i);
        extra++;
      }
    }
    return this.dropBanners(pages, Array.from(at));
  }

  async dropBanners(pages, at) {
    const flags = await Promise.all(at.map((i) => this.isBanner(pages[i])));
    const drop = new Set(at.filter((i, k) => flags[k]));
    const kept = pages.filter((u, i) => !drop.has(i));
    return kept.length ? kept : pages;
  }
}

module.exports = { Source };
