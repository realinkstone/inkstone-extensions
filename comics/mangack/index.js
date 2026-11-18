const SITE = 'https://mangack.com';
const API = SITE + '/wp-json/wp/v2';
const PER_PAGE = 24;
const MAIN_IMAGE_HOST = 'cdn.black-clover.org';

const FEEDS = [
  { id: 'updates', name: 'Latest Updates' },
  { id: 'newest', name: 'Newest', orderby: 'date', order: 'desc' },
  { id: 'az', name: 'A to Z', orderby: 'title', order: 'asc' },
];

const GENRES = [
  [21, 'action', 'Action', 634], [559, 'adult', 'Adult', 10], [22, 'adventure', 'Adventure', 335], [24, 'comedy', 'Comedy', 203], [29, 'drama', 'Drama', 389], [378, 'ecchi', 'Ecchi', 42], [23, 'fantasy', 'Fantasy', 589],
  [650, 'gender-bender', 'Gender Bender', 3], [64, 'harem', 'Harem', 74], [105, 'historical', 'Historical', 59], [249, 'horror', 'Horror', 24], [353, 'isekai', 'Isekai', 6], [401, 'josei', 'Josei', 15],
  [27, 'martial-arts', 'Martial Arts', 166], [92, 'mature', 'Mature', 35], [783, 'mecha', 'Mecha', 3], [93, 'mystery', 'Mystery', 36], [152, 'psychological', 'Psychological', 35], [28, 'romance', 'Romance', 122],
  [125, 'school-life', 'School Life', 73], [86, 'sci-fi', 'Sci-fi', 46], [94, 'seinen', 'Seinen', 108], [506, 'shoujo', 'Shoujo', 15], [404, 'shoujo-ai', 'Shoujo Ai', 2], [25, 'shounen', 'Shounen', 444],
  [163, 'slice-of-life', 'Slice of Life', 47], [60, 'sport', 'Sport', 5], [2483, 'sports', 'Sports', 1], [26, 'supernatural', 'Supernatural', 122], [355, 'tragedy', 'Tragedy', 20],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function ascii(ch) {
  const map = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u2013': '-', '\u2014': '-', '\u00a0': ' ' };
  return map[ch] !== undefined ? map[ch] : ch;
}

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => ascii(String.fromCharCode(Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => ascii(String.fromCharCode(parseInt(n, 16))))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/[\u2018\u2019\u201c\u201d\u2026\u2013\u2014\u00a0]/g, ascii)
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(text) {
  return plain(text).replace(/\s+/g, ' ').trim();
}

function headerOf(response, name) {
  const headers = (response && response.headers) || {};
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) return String(headers[key]);
  }
  return '';
}

function relativeTime(text) {
  const s = String(text || '').trim().toLowerCase();
  if (/^(just now|moments? ago|now)$/.test(s)) return Math.floor(Date.now() / 3600000) * 3600000;
  const m = /^(an?|one|\d+)\s*(second|sec|minute|min|hour|hr|day|week|month|year)s?\s*ago$/.exec(s);
  if (!m) return undefined;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
  const unit = { second: 1000, sec: 1000, minute: 60000, min: 60000, hour: 3600000, hr: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 }[m[2]];
  return Math.floor((Date.now() - n * unit) / 3600000) * 3600000;
}

function statusOf(text) {
  const s = String(text || '').trim().toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed' || s === 'complete') return 'COMPLETED';
  if (s === 'hiatus' || s === 'on hold') return 'HIATUS';
  if (s === 'cancelled' || s === 'canceled' || s === 'dropped') return 'CANCELLED';
  return 'UNKNOWN';
}

function ageOf(slugs) {
  if (slugs.indexOf('adult') >= 0) return 18;
  if (slugs.indexOf('mature') >= 0 || slugs.indexOf('ecchi') >= 0) return 16;
  return 0;
}

function safeUrl(url) {
  return String(url || '').trim().replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
}

function slugOf(url) {
  const path = String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
  return path.slice(path.lastIndexOf('/') + 1);
}

function titleCase(slug) {
  return String(slug).replace(/-/g, ' ').replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.cats = null;
    this.catsAt = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async get(url, accept) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: accept } }));
        if (response.status >= 502 && response.status <= 504) {
          last = response;
          continue;
        }
        return response;
      } catch (e) {
        if (attempt === 1 || (e && (e.kind === 'blocked' || e.kind === 'challenge'))) throw e;
      }
    }
    throw new Error(`MangaCK: HTTP ${last ? last.status : 0}`);
  }

  async api(path) {
    return this.get(`${API}${path}`, 'application/json');
  }

  json(response, what) {
    if (response.status === 404) throw new Error(`MangaCK: ${what} not found (HTTP 404)`);
    if (response.status < 200 || response.status >= 300) throw new Error(`MangaCK: ${what} answered HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error(`MangaCK: ${what} did not answer JSON`);
    }
  }

  async categories() {
    if (this.cats && Date.now() - this.catsAt < 1800000) return this.cats;
    let list = null;
    try {
      const rows = this.json(await this.api('/Genres?per_page=100&_fields=id,name,slug,count'), 'the genre list');
      list = rows.filter((c) => c && c.slug && c.name && c.slug !== 'updating' && Number(c.count) > 0).map((c) => ({ id: Number(c.id), slug: String(c.slug), name: oneLine(c.name), count: Number(c.count) }));
      if (!list.length) list = null;
    } catch (e) {
      console.error('MangaCK genre list: ' + (e && e.message));
    }
    if (!list) list = GENRES.map(([id, slug, name, count]) => ({ id, slug, name, count }));
    this.cats = list;
    this.catsAt = Date.now();
    return list;
  }

  async getSearchTags() {
    const cats = await this.categories();
    return cats.map((c) => ({ id: c.slug, label: c.name }));
  }

  genresOf(classList, cats) {
    const slugs = [];
    const names = [];
    for (const cls of Array.isArray(classList) ? classList : []) {
      const m = /^Genres-(.+)$/.exec(String(cls));
      if (!m || m[1] === 'updating') continue;
      slugs.push(m[1]);
      const hit = cats.find((c) => c.slug === m[1]);
      names.push(hit ? hit.name : titleCase(m[1]));
    }
    return { slugs, names, age: ageOf(slugs) };
  }

  coverOf(post) {
    const media = post && post._embedded && post._embedded['wp:featuredmedia'];
    const item = Array.isArray(media) ? media[0] : null;
    if (!item) return '';
    const sizes = (item.media_details && item.media_details.sizes) || {};
    const pick = sizes['medium-thumbnail'] || sizes.full;
    return String((pick && pick.source_url) || item.source_url || '');
  }

  async updates(page) {
    const response = await this.get(page > 1 ? `${SITE}/updates/page/${page}/` : `${SITE}/updates/`, 'text/html');
    if (response.status < 200 || response.status >= 300) throw new Error(`MangaCK: the updates page answered HTTP ${response.status}`);
    const $ = cheerio.load(response.data);
    const cards = [];
    $('.Latest_chapter_update').each((i, el) => {
      const href = $(el).find('a[href*="/manga/"]').first().attr('href') || '';
      const slug = slugOf(href);
      const title = oneLine($(el).find('.latest-title h4').first().text()) || oneLine($(el).find('a[title]').first().attr('title'));
      if (!slug || !title || cards.some((c) => c.slug === slug)) return;
      const img = $(el).find('img').first();
      const small = /(\S+)\s+200w/.exec(String(img.attr('srcset') || ''));
      cards.push({ slug, title, image: String((small && small[1]) || img.attr('src') || '') });
    });
    const hasNext = $('a.next.page-numbers').length > 0;
    if (!cards.length) return { results: [], metadata: undefined };
    const cats = await this.categories();
    const rows = this.json(await this.api(`/manga?slug=${cards.map((c) => encodeURIComponent(c.slug)).join(',')}&per_page=100&_fields=slug,class_list`), 'the title lookup');
    const bySlug = new Map();
    for (const row of Array.isArray(rows) ? rows : []) bySlug.set(String(row.slug), row);
    const results = [];
    for (const card of cards) {
      const row = bySlug.get(card.slug);
      if (!row) continue;
      const genres = this.genresOf(row.class_list, cats);
      results.push({ mangaId: card.slug, title: card.title, image: card.image, tags: genres.names, ageRating: genres.age, medium: 'comics', webURL: `${SITE}/manga/${card.slug}/` });
    }
    if (!results.length) throw new Error('MangaCK: none of the titles on the updates page could be rated');
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const cats = await this.categories();
    const wanted = [];
    for (const t of included) {
      const key = String((t && t.id) || t || '').trim().toLowerCase();
      const hit = cats.find((c) => c.slug === key || c.name.toLowerCase() === key || String((t && t.label) || '').toLowerCase() === c.name.toLowerCase());
      if (!hit) return { results: [] };
      if (wanted.indexOf(hit) < 0) wanted.push(hit);
    }
    if (!query && !wanted.length && feed.id === 'updates') return this.updates(page);
    const several = wanted.length > 1;
    if (several) wanted.sort((a, b) => a.count - b.count);
    let base = `/manga?per_page=${several ? 100 : PER_PAGE}&_embed=wp:featuredmedia&_fields=id,slug,link,title,class_list,date,_links,_embedded`;
    if (query) base += `&search=${encodeURIComponent(query)}`;
    else base += `&orderby=${feed.orderby || 'date'}&order=${feed.order || 'desc'}`;
    if (wanted.length) base += `&Genres=${wanted[0].id}`;
    let rows = [];
    let totalPages = 1;
    for (let at = several ? 1 : page; ; at++) {
      const response = await this.api(`${base}&page=${at}`);
      if (response.status === 400) {
        let body = null;
        try {
          body = JSON.parse(response.data);
        } catch (e) {
          body = null;
        }
        if (body && body.code === 'rest_post_invalid_page_number') break;
      }
      const part = this.json(response, 'the title list');
      if (!Array.isArray(part)) throw new Error('MangaCK: the title list is not a list');
      rows = rows.concat(part);
      totalPages = Number(headerOf(response, 'x-wp-totalpages')) || (part.length === PER_PAGE ? at + 1 : at);
      if (!several || at >= totalPages || at >= 8) break;
    }
    const results = [];
    for (const post of rows) {
      const title = oneLine(post && post.title && post.title.rendered);
      const slug = String((post && post.slug) || '');
      if (!title || !slug) continue;
      const genres = this.genresOf(post.class_list, cats);
      if (several && !wanted.every((w) => genres.slugs.indexOf(w.slug) >= 0)) continue;
      results.push({ mangaId: slug, title, image: this.coverOf(post), tags: genres.names, ageRating: genres.age, medium: 'comics', webURL: String(post.link || `${SITE}/manga/${slug}/`) });
    }
    return { results, metadata: !several && results.length && page < totalPages ? { page: page + 1 } : undefined };
  }

  titlePage(slug) {
    const hit = this.pages.get(slug);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = (async () => {
      const response = await this.get(`${SITE}/manga/${encodeURIComponent(slug)}/`, 'text/html');
      if (response.status === 404) throw new Error('MangaCK: title not found');
      if (response.status < 200 || response.status >= 300) throw new Error(`MangaCK: the title page answered HTTP ${response.status}`);
      const $ = cheerio.load(response.data);
      if (!$('table.infobox').length && !$('ul.chapterslist').length) throw new Error('MangaCK: the title page has a shape this source does not read');
      return $;
    })();
    this.pages.set(slug, { promise, at: Date.now() });
    promise.catch(() => {
      if (this.pages.get(slug) && this.pages.get(slug).promise === promise) this.pages.delete(slug);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.titlePage(String(mangaId));
    const cell = {};
    $('table.infobox tr').each((i, tr) => {
      const tds = $(tr).find('td');
      const key = oneLine(tds.first().text()).toLowerCase();
      if (key && tds.length > 1) cell[key] = tds.eq(1);
    });
    const links = (key) =>
      cell[key]
        ? String(cell[key].html() || '')
            .split(/<a\b[^>]*>/i)
            .slice(1)
            .map((s) => oneLine(s))
            .filter((s) => s && !/^updating$/i.test(s) && !/^warning:/i.test(s))
        : [];
    const genres = links('genres');
    const slugs = genres.map((g) => g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const synopsis = [];
    $('#hidden p').each((i, p) => {
      if ($(p).closest('.code-block').length) return;
      const text = plain($(p).html() || '');
      if (text) synopsis.push(text);
    });
    const title = oneLine($('h1.entry-title').first().text()) || String(mangaId);
    const alt = oneLine(cell.alternative ? cell.alternative.text() : '');
    const cover = $('.ifenzi-cover img').first().attr('src') || $('.manga-cover img').first().attr('src') || '';
    const info = {
      title,
      image: /^https?:\/\//.test(cover) ? cover : '',
      desc: [synopsis.join('\n\n'), alt && !/^updating$/i.test(alt) ? `Also known as: ${alt}` : ''].filter(Boolean).join('\n\n') || undefined,
      status: statusOf(links('status')[0]),
      tags: genres,
      ageRating: ageOf(slugs),
      medium: 'comics',
      webURL: `${SITE}/manga/${mangaId}/`,
    };
    const author = links('author').join(', ');
    if (author) info.author = author;
    const count = $('ul.chapterslist li').length;
    if (count) info.chapters = count;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.titlePage(String(mangaId));
    const out = [];
    const seen = new Set();
    $('ul.chapterslist li').each((i, li) => {
      const a = $(li).find('a.title').first();
      const id = slugOf(a.attr('href'));
      if (!id || seen.has(id)) return;
      seen.add(id);
      const label = oneLine(a.clone().children().remove().end().text());
      const m = /(\d+(?:\.\d+)?)/.exec(label) || /-chapter-(\d+(?:-\d+)?)$/.exec(id);
      const number = m ? Number(m[1].replace('-', '.')) : NaN;
      const pure = /^chapter\s+\d+(?:\.\d+)?\.?$/i.test(label) && Number.isFinite(number);
      const name = pure ? `Chapter ${number}` : label.replace(/^chapter\b/i, 'Chapter').replace(/[.\s]+$/, '');
      const chapter = { id, chapterId: id, name: name || `Chapter ${Number.isFinite(number) ? number : id}` };
      if (Number.isFinite(number)) chapter.number = number;
      const time = relativeTime($(li).find('.entry-date').first().text());
      if (time !== undefined) chapter.time = time;
      out.push(chapter);
    });
    out.sort((a, b) => (b.number || 0) - (a.number || 0));
    return out;
  }

  async pageUrls(chapterId) {
    let html = '';
    const response = await this.api(`/chapter?slug=${encodeURIComponent(chapterId)}&_fields=id,slug,content`);
    const rows = this.json(response, 'the chapter');
    if (Array.isArray(rows) && rows[0] && rows[0].content && rows[0].content.rendered) html = rows[0].content.rendered;
    else {
      const page = await this.get(`${SITE}/chapter/${encodeURIComponent(chapterId)}/`, 'text/html');
      if (page.status === 404) throw new Error('MangaCK: chapter not found');
      if (page.status < 200 || page.status >= 300) throw new Error(`MangaCK: the chapter page answered HTTP ${page.status}`);
      const $page = cheerio.load(page.data);
      html = $page('.entry-content .separator').toArray().map((el) => $page.html(el)).join('\n');
    }
    const $ = cheerio.load(html);
    const pages = [];
    $('img').each((i, el) => {
      const src = safeUrl($(el).attr('src') || $(el).attr('data-src') || '');
      if (/^https?:\/\//.test(src) && pages.indexOf(src) < 0) pages.push(src);
    });
    return pages;
  }

  async getChapterDetails(mangaId, chapterId) {
    const pages = await this.pageUrls(String(chapterId));
    if (!pages.length) throw new Error('MangaCK: this chapter has no pages yet');
    const middle = pages[Math.floor(pages.length / 2)];
    const host = (/^https?:\/\/([^\/:?#]+)/.exec(middle) || [])[1] || '';
    if (host && host !== MAIN_IMAGE_HOST) {
      let status = 0;
      try {
        const probe = await this.requests.schedule(App.createRequest({ url: middle, method: 'GET', headers: { Range: 'bytes=0-1023' } }));
        status = probe.status;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        throw new Error(`MangaCK: the images of this chapter are on ${host}, which could not be reached`);
      }
      if (status === 404 || status === 403 || status === 410) throw new Error(`MangaCK: the images of this chapter are no longer on ${host} (HTTP ${status})`);
    }
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
