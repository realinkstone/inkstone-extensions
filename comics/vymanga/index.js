const SITE = 'https://mangavyvy.com';

const FEEDS = [
  { id: 'updated', name: 'Latest Update', sort: 'updated_at' },
  { id: 'viewed', name: 'Most Viewed', sort: 'viewed' },
  { id: 'new', name: 'Newest', sort: 'created_at' },
  { id: 'scored', name: 'Top Rated', sort: 'scored' },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['drama', 'Drama'], ['fantasy', 'Fantasy'], ['romance', 'Romance'], ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
  ['isekai', 'Isekai'], ['webtoons', 'Webtoons'], ['manhwa', 'Manhwa'], ['manhua', 'Manhua'], ['manga', 'Manga'], ['shounen', 'Shounen'], ['shoujo', 'Shoujo'], ['seinen', 'Seinen'],
  ['josei', 'Josei'], ['school-life', 'School Life'], ['slice-of-life', 'Slice of Life'], ['supernatural', 'Supernatural'], ['mystery', 'Mystery'], ['horror', 'Horror'],
  ['psychological', 'Psychological'], ['historical', 'Historical'], ['martial-arts', 'Martial Arts'], ['sports', 'Sports'], ['scifi', 'Sci-fi'], ['harem', 'Harem'],
  ['reverse-harem', 'Reverse Harem'], ['reincarnation', 'Reincarnation'], ['villainess', 'Villainess'], ['omegaverse', 'Omegaverse'], ['boys-love', 'Boys Love'],
  ['girls-love', 'Girls Love'], ['shounen-ai', 'Shounen Ai'], ['shoujo-ai', 'Shoujo Ai'], ['tragedy', 'Tragedy'], ['thriller', 'Thriller'], ['crime', 'Crime'], ['mecha', 'Mecha'],
  ['cooking', 'Cooking'], ['music', 'Music'], ['medical', 'Medical'], ['magic', 'Magic'], ['monsters', 'Monsters'], ['murim', 'Murim'], ['cultivation', 'Cultivation'],
  ['dungeons', 'Dungeons'], ['game', 'Game'], ['gender-bender', 'Gender Bender'], ['office', 'Office'], ['full-color', 'Full Color'], ['long-strip', 'Long Strip'],
  ['one-shot', 'One Shot'], ['4-koma', '4-koma'], ['official-colored', 'Official Colored'], ['time-travel', 'Time Travel'], ['survival', 'Survival'], ['vampires', 'Vampires'],
  ['zombies', 'Zombies'], ['wuxia', 'Wuxia'], ['xianxia', 'Xianxia'], ['mature', 'Mature'], ['ecchi', 'Ecchi'], ['smut', 'Smut'], ['adult', 'Adult'], ['erotica', 'Erotica'],
  ['doujinshi', 'Doujinshi'],
];

const RATE_18 = ['adult', 'smut', 'erotica', 'pornographic', 'sexual-violence', 'r18', 'incest', 'uncensored', 'netorarentr', 'hentai'];
const RATE_16 = ['mature', 'ecchi', 'suggestive', 'fetish', 'smbdsmsubdom', 'domsub-verse', 'loli', 'shotacon', 'doujinshi'];

const PAGE_WIDTH = 1200;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(text) {
  return String(text || '')
    .replace(/&#0*39;|&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function seg(piece) {
  let raw = String(piece || '');
  try {
    raw = decodeURIComponent(raw);
  } catch (e) {
  }
  return encodeURIComponent(raw).replace(/%2B/g, '+');
}

function ageOf(slugs) {
  if (slugs.some((s) => RATE_18.indexOf(s) >= 0)) return 18;
  if (slugs.some((s) => RATE_16.indexOf(s) >= 0)) return 16;
  return 0;
}

function parseDate(text) {
  const m = /([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(String(text || ''));
  if (!m || MONTHS[m[1].toLowerCase()] === undefined) return undefined;
  return Date.UTC(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
}

function chapterNumber(rowId, name) {
  const a = /^chapter-(\d+(?:\.\d+)?)$/.exec(rowId);
  if (a) return Number(a[1]);
  const b = /(?:chapter|ch\.?|episode|ep\.?)\s*(\d+(?:\.\d+)?)/i.exec(name);
  return b ? Number(b[1]) : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.quotaLeft = null;
    this.quotaUntil = 0;
    this.pageCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async get(url, headers) {
    let last = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: headers || {} }));
        last = response.status;
        if (response.status === 404) return { status: 404, body: '' };
        if (response.status >= 200 && response.status < 300) return { status: response.status, body: typeof response.data === 'string' ? response.data : String(response.data || '') };
        if (response.status !== 429 && (response.status < 500 || response.status > 504)) throw new Error(`VyManga: HTTP ${response.status}`);
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt === 2 || /VyManga/.test(String(e && e.message))) throw e;
      }
      await pause(600 * (attempt + 1));
    }
    throw new Error(`VyManga: HTTP ${last}`);
  }

  async ageOfId(id) {
    if (this.ages.has(id)) return this.ages.get(id);
    if (this.quotaLeft !== null && this.quotaLeft <= 12 && Date.now() < this.quotaUntil) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${SITE}/api/manga/${encodeURIComponent(id)}`, method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } }));
        const headers = response.headers || {};
        const key = Object.keys(headers).find((k) => k.toLowerCase() === 'x-ratelimit-remaining');
        const left = key !== undefined ? Number(headers[key]) : NaN;
        if (Number.isFinite(left)) {
          this.quotaLeft = left;
          if (left <= 12) this.quotaUntil = Date.now() + 60000;
        }
        if (response.status === 429) {
          this.quotaLeft = 0;
          this.quotaUntil = Date.now() + 60000;
          return null;
        }
        if (response.status === 200) {
          const body = typeof response.data === 'string' ? response.data : '';
          const $ = cheerio.load(body);
          const age = ageOf(
            $('a[href*="/genre/"]')
              .map((i, el) => String($(el).attr('href') || '').split('/genre/')[1])
              .get()
          );
          this.ages.set(id, age);
          return age;
        }
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      }
      await pause(500);
    }
    return null;
  }

  async parseGrid(html) {
    const $ = cheerio.load(html);
    const cards = [];
    $('div.comic-item').each((i, el) => {
      const a = $(el).find('a[href*="/manga/"]').first();
      const href = String(a.attr('href') || '');
      const slug = href.split('/manga/')[1];
      const title = clean($(el).find('.comic-title').text());
      if (!slug || !title) return;
      let cover = String($(el).find('img.image').attr('data-src') || $(el).find('img').first().attr('data-src') || '');
      if (cover.indexOf('//') === 0) cover = 'https:' + cover;
      const idMatch = /previewManga\(event,\s*'(\d+)'\)/.exec($.html(el)) || /\/cover\/(\d+)\//.exec(cover);
      cards.push({ slug: decodeSlug(slug), title, cover: /^https?:\/\//.test(cover) ? cover : '', id: idMatch ? idMatch[1] : '' });
    });
    return cards;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tagId = included.length ? String((included[0] && included[0].id) || included[0]) : '';
    const tag = GENRES.find((g) => g[0] === tagId);

    let url;
    if (query) url = `${SITE}/search?q=${encodeURIComponent(query)}&page=${page}`;
    else if (tag) url = `${SITE}/genre/${tag[0]}?page=${page}`;
    else url = `${SITE}/search?sort=${feed.sort}&sort_type=desc&page=${page}`;

    const r = await this.get(url);
    const cards = r.status === 200 ? await this.parseGrid(r.body) : [];
    if (!cards.length) return { results: [] };

    const floor = !query && tag ? ageOf([tag[0]]) : 0;
    const ages = new Array(cards.length).fill(null);
    if (floor < 18) {
      for (let i = 0; i < cards.length; i += 12) {
        await Promise.all(
          cards.slice(i, i + 12).map(async (c, k) => {
            ages[i + k] = c.id ? await this.ageOfId(c.id) : null;
          })
        );
      }
    }
    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const age = Math.max(floor, ages[i] === null ? 16 : ages[i]);
      results.push({ mangaId: c.slug, title: c.title, image: c.cover, medium: 'comics', ageRating: floor >= 18 ? 18 : age });
    }
    return { results, metadata: { page: page + 1 } };
  }

  async titlePage(slug) {
    const cached = this.pageCache.get(slug);
    if (cached && Date.now() - cached.at < 180000) return cached.html;
    const r = await this.get(`${SITE}/manga/${seg(slug)}`);
    if (r.status === 404) throw new Error('VyManga: title not found (HTTP 404)');
    this.pageCache.set(slug, { at: Date.now(), html: r.body });
    if (this.pageCache.size > 8) this.pageCache.delete(this.pageCache.keys().next().value);
    return r.body;
  }

  async getMangaDetails(mangaId) {
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    const title = clean($('h1.title').first().text());
    if (!title) throw new Error('VyManga: title not found');
    const genres = $('a.label-badge[href*="/genre/"]');
    const slugs = genres.map((i, el) => String($(el).attr('href') || '').split('/genre/')[1]).get();
    const statusText = clean($('.pre-title:contains("Status")').parent().text()).toLowerCase();
    let cover = String($('.img-manga img').first().attr('src') || '');
    if (cover.indexOf('//') === 0) cover = 'https:' + cover;
    const authors = $('.pre-title:contains("Authors")')
      .parent()
      .find('a')
      .map((i, el) => clean($(el).text()))
      .get()
      .filter(Boolean);
    const summary = clean($('.summary .content').first().text()).replace(/\s*\+$/, '');
    const info = {
      title,
      image: /^https?:\/\//.test(cover) ? cover : '',
      desc: summary || undefined,
      status: /complete/.test(statusText) ? 'COMPLETED' : /ongoing/.test(statusText) ? 'ONGOING' : 'UNKNOWN',
      tags: genres.map((i, el) => clean($(el).text())).get().filter(Boolean),
      webURL: `${SITE}/manga/${seg(mangaId)}`,
      medium: 'comics',
      ageRating: ageOf(slugs),
    };
    if (authors.length) info.author = authors.join(', ');
    return { mangaInfo: info };
  }

  rowsOf(html) {
    const $ = cheerio.load(html);
    const seen = {};
    const rows = [];
    $('a.list-chapter').each((i, el) => {
      const base = String($(el).attr('id') || '').trim();
      if (!base) return;
      seen[base] = (seen[base] || 0) + 1;
      const id = seen[base] > 1 ? `${base}~${seen[base]}` : base;
      const name = clean($(el).find('span').first().text());
      rows.push({ id, base, name, href: String($(el).attr('href') || ''), time: parseDate($(el).find('p').first().text()) });
    });
    return rows;
  }

  async getChapters(mangaId) {
    const rows = this.rowsOf(await this.titlePage(mangaId));
    if (!rows.length) throw new Error('VyManga has no chapters for this title yet');
    return rows.map((r) => {
      const row = { id: r.id, chapterId: r.id, name: r.name || r.base.replace(/^chapter-/, 'Chapter ') };
      const number = chapterNumber(r.base, r.name);
      if (number !== undefined && Number.isFinite(number)) row.number = number;
      if (r.time !== undefined) row.time = r.time;
      return row;
    });
  }

  async readerPages(href) {
    let r = await this.get(href);
    for (let hop = 0; hop < 3; hop++) {
      const m = /http-equiv="refresh"\s+content="0;\s*url='?([^'"]+)'?"/i.exec(r.body);
      if (!m || r.body.length > 6000 || /class="[^"]*lozad/.test(r.body)) break;
      r = await this.get(m[1].replace(/&amp;/g, '&'));
    }
    if (r.status === 404) return [];
    const $ = cheerio.load(r.body);
    const pages = [];
    let imgs = $('#carousel .carousel-item img[data-src], .vview img[data-src]');
    if (!imgs.length) imgs = $('img.lozad');
    imgs.each((i, el) => {
      let src = String($(el).attr('data-src') || '').trim();
      if (src.indexOf('//') === 0) src = 'https:' + src;
      if (!/^https?:\/\//.test(src) || /\/(web\/cover|web\/img|storage\/collections)\//.test(src)) return;
      pages.push(src.replace(/=w\d+$/, `=w${PAGE_WIDTH}`));
    });
    return pages;
  }

  async getChapterDetails(mangaId, chapterId) {
    let failure = null;
    for (let fresh = 0; fresh < 3; fresh++) {
      if (fresh) this.pageCache.delete(mangaId);
      const row = this.rowsOf(await this.titlePage(mangaId)).find((r) => r.id === String(chapterId));
      if (!row || !/^https?:\/\//.test(row.href)) {
        if (fresh) throw new Error('VyManga: this chapter is no longer listed on the title page');
        continue;
      }
      try {
        const pages = await this.readerPages(row.href);
        if (pages.length) return { id: chapterId, mangaId, pages };
        failure = null;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        failure = e;
      }
    }
    if (failure) throw failure;
    throw new Error('VyManga has no pages for this chapter yet');
  }
}

function decodeSlug(slug) {
  try {
    return decodeURIComponent(slug);
  } catch (e) {
    return slug;
  }
}

module.exports = { Source };
