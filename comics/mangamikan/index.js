const SITE = 'https://mangamikan.com';
const NAME = 'MangaMikan';
const HAS_ECCHI = true;
const PER_PAGE = 48;

const FEEDS = [
  { id: 'updated', name: 'Recently Updated', sort: 'updated' },
  { id: 'added', name: 'Recently Added', sort: 'added' },
  { id: 'popular', name: 'Most Viewed', sort: 'popular' },
  { id: 'chapters', name: 'Most Chapters', sort: 'chapters' },
  { id: 'completed', name: 'Completed', sort: 'updated', status: 'completed' },
  { id: 'az', name: 'A to Z', sort: 'title' },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['animals', 'Animals'], ['comedy', 'Comedy'], ['cooking', 'Cooking'], ['crime', 'Crime'], ['demons', 'Demons'],
  ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['girls-love', 'Girls Love'], ['gore', 'Gore'], ['gourmet', 'Gourmet'], ['gyaru', 'Gyaru'], ['harem', 'Harem'],
  ['horror', 'Horror'], ['isekai', 'Isekai'], ['iyashikei', 'Iyashikei'], ['josei', 'Josei'], ['kids', 'Kids'], ['magic', 'Magic'], ['manhua', 'Manhua'], ['manhwa', 'Manhwa'],
  ['martial-arts', 'Martial Arts'], ['mecha', 'Mecha'], ['military', 'Military'], ['music', 'Music'], ['mystery', 'Mystery'], ['ninja', 'Ninja'], ['office', 'Office'],
  ['oneshot', 'Oneshot'], ['parody', 'Parody'], ['psychological', 'Psychological'], ['romance', 'Romance'], ['school', 'School'], ['school-life', 'School Life'], ['sci-fi', 'Sci-Fi'],
  ['seinen', 'Seinen'], ['shoujo', 'Shoujo'], ['shounen', 'Shounen'], ['slice-of-life', 'Slice of Life'], ['space', 'Space'], ['sports', 'Sports'], ['super-power', 'Super Power'],
  ['supernatural', 'Supernatural'], ['survival', 'Survival'], ['thriller', 'Thriller'], ['vampire', 'Vampire'],
];

const RATE_16 = ['ecchi'];
const RATE_18 = [];
const SEXUAL_WORDS = /\b(hentai|smut|erotic|erotica|porn\w*|nsfw|nude|nudity|lewd|sex|sexual|masturbat\w*|fetish\w*|netorare|netori|incest|bdsm|orgy|molest\w*|rape|raped)\b/i;

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return `https:${u}`;
  if (u.charAt(0) === '/') return `${SITE}${u}`;
  return `${SITE}/${u}`;
}

function slugPiece(slug) {
  let s = String(slug || '');
  try {
    s = decodeURIComponent(s);
  } catch (e) {
  }
  return encodeURIComponent(s);
}

function mainOf(html) {
  const text = String(html || '');
  const start = text.indexOf('<main');
  if (start < 0) return text.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const end = text.indexOf('</main>', start);
  return text.slice(start, end > start ? end + 7 : text.length).replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

function slugOfHref(href) {
  const m = String(href || '').match(/\/title\/([^/?#]+)/);
  return m ? m[1] : '';
}

function ageOfGenres(slugs) {
  if (slugs.some((s) => RATE_18.indexOf(s) >= 0)) return 18;
  if (slugs.some((s) => RATE_16.indexOf(s) >= 0)) return 16;
  return 0;
}

function statusOf(text) {
  const t = String(text || '').toLowerCase();
  if (/hiatus/.test(t)) return 'HIATUS';
  if (/cancel/.test(t)) return 'CANCELLED';
  if (/complet|finished/.test(t)) return 'COMPLETED';
  if (/ongoing|publishing/.test(t)) return 'ONGOING';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.titles = new Map();
    this.sets = {};
    this.setAt = {};
    this.setLoading = {};
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async page(path) {
    const url = path.indexOf('http') === 0 ? path : `${SITE}${path}`;
    let last = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      let response = null;
      try {
        response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html,application/xhtml+xml' } }));
      } catch (e) {
        if (attempt === 1) throw new Error(`${NAME}: could not reach the site (${oneLine(e && e.message)})`);
      }
      if (response) {
        last = response.status;
        if (response.status === 404) throw new Error(`${NAME}: not found (HTTP 404)`);
        if (response.status >= 200 && response.status < 300 && typeof response.data === 'string' && response.data.length > 200) return response.data;
        if (response.status >= 400 && response.status !== 429 && (response.status < 500 || response.status > 504)) throw new Error(`${NAME}: HTTP ${response.status}`);
      }
      await pause(700);
    }
    throw new Error(`${NAME}: HTTP ${last}`);
  }

  titlePage(slug) {
    const key = String(slug);
    const hit = this.titles.get(key);
    if (hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = this.page(`/title/${slugPiece(slug)}`).then(mainOf);
    this.titles.set(key, { promise, at: Date.now() });
    promise.catch(() => {
      const now = this.titles.get(key);
      if (now && now.promise === promise) this.titles.delete(key);
    });
    if (this.titles.size > 8) this.titles.delete(this.titles.keys().next().value);
    return promise;
  }

  cards(html) {
    const $ = cheerio.load(mainOf(html));
    const rows = [];
    const seen = new Set();
    $('article').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a[href*="/title/"]').first();
      const slug = slugOfHref(link.attr('href'));
      if (!slug || seen.has(slug)) return;
      const title = oneLine($el.find('h2 a, h3 a').first().text()) || oneLine(link.attr('title'));
      if (!title) return;
      seen.add(slug);
      let summary = oneLine($el.find('.card__summary').first().text());
      if (!summary) summary = oneLine($el.find('h2').first().nextAll('p').first().text());
      rows.push({ slug, title, image: absolute($el.find('img').first().attr('src')), summary });
    });
    let next = $('.pager a[rel="next"]').length > 0;
    if (!next) {
      $('.pager a').each((i, a) => {
        if (/^\s*next/i.test($(a).text())) next = true;
      });
    }
    let last = 0;
    $('.pager a').each((i, a) => {
      const m = String($(a).attr('href') || '').match(/[?&]page=(\d+)/);
      if (m) last = Math.max(last, Number(m[1]));
    });
    return { rows, next, last };
  }

  async genreSet(slug) {
    const base = (page) => `/manga?${qs({ genre: slug, sort: 'updated', per_page: PER_PAGE, page })}`;
    const first = this.cards(await this.page(base(1)));
    const set = new Set(first.rows.map((r) => r.slug));
    const pages = [];
    for (let p = 2; p <= Math.min(first.last, 12); p++) pages.push(p);
    const rest = await Promise.all(pages.map((p) => this.page(base(p)).then((h) => this.cards(h).rows)));
    for (const rows of rest) for (const r of rows) set.add(r.slug);
    return set;
  }

  async rated(slug) {
    if (this.sets[slug] && Date.now() - this.setAt[slug] < 1800000) return this.sets[slug];
    if (!this.setLoading[slug]) {
      this.setLoading[slug] = (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const set = await this.genreSet(slug);
            this.sets[slug] = set;
            this.setAt[slug] = Date.now();
            return set;
          } catch (e) {
            console.error(`${NAME} rating index failed: ${e && e.message}`);
            await pause(800);
          }
        }
        return null;
      })().then((set) => {
        this.setLoading[slug] = null;
        return set;
      });
    }
    return this.setLoading[slug];
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = Number(metadata && metadata.page) > 0 ? Number(metadata.page) : 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const wanted = included.length ? String((included[0] && included[0].id) || included[0] || '') : '';
    const tag = GENRES.find((g) => g[0] === wanted || g[1].toLowerCase() === wanted.toLowerCase());
    if (wanted && !tag) return { results: [], metadata: undefined };
    const path = `/manga?${qs({ q: query, genre: tag ? tag[0] : '', status: query ? '' : feed.status, sort: query ? 'updated' : feed.sort, per_page: PER_PAGE, page })}`;
    const onlyEcchi = tag && RATE_16.indexOf(tag[0]) >= 0;
    const [html, index] = await Promise.all([this.page(path), HAS_ECCHI && !onlyEcchi ? this.rated('ecchi') : Promise.resolve(new Set())]);
    const list = this.cards(html);
    const results = [];
    for (const r of list.rows) {
      const card = { mangaId: r.slug, title: r.title, image: r.image, medium: 'comics' };
      if (r.summary) card.summary = r.summary;
      if (onlyEcchi) card.ageRating = 16;
      else if (index === null) card.ageRating = SEXUAL_WORDS.test(`${r.title} ${r.summary}`) ? 16 : undefined;
      else card.ageRating = index.has(r.slug) || SEXUAL_WORDS.test(`${r.title} ${r.summary}`) ? 16 : 0;
      if (card.ageRating === undefined) delete card.ageRating;
      results.push(card);
    }
    return { results, metadata: results.length && list.next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.titlePage(mangaId));
    const title = oneLine($('h1').first().text());
    if (!title) throw new Error(`${NAME}: title not found`);
    const cover = $('.book__cover img, .cherri-detail__cover img').first().attr('src');
    const genres = [];
    const genreSlugs = [];
    $('.chips a.chip, .cherri-detail__chips a').each((i, a) => {
      const label = oneLine($(a).text());
      const m = String($(a).attr('href') || '').match(/\/genre\/([^/?#]+)/);
      if (label && genres.indexOf(label) < 0) {
        genres.push(label);
        if (m) genreSlugs.push(m[1]);
      }
    });
    const credit = oneLine($('.book__credit').first().text());
    const eyebrow = oneLine($('.cherri-detail__copy > .eyebrow').first().text());
    let author = '';
    const by = credit.match(/\bBy\s+(.+?)(?:\s+·\s+\d{4})?$/i);
    if (by) author = oneLine(by[1]);
    if (!author) author = oneLine($('.cherri-detail__description').first().nextAll('p').first().find('strong').text());
    const desc = String($('.synopsis .clamp, .cherri-detail__description').first().text() || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const info = {
      title,
      image: absolute(cover),
      desc: desc || undefined,
      status: statusOf(`${credit.split(' · ')[0]} ${eyebrow.split(' · ').pop()}`),
      tags: genres,
      webURL: `${SITE}/title/${slugPiece(mangaId)}`,
      medium: 'comics',
    };
    if (author) info.author = author;
    let age = ageOfGenres(genreSlugs);
    if (age < 16 && SEXUAL_WORDS.test(`${title} ${desc}`)) age = 16;
    info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titlePage(mangaId));
    const rows = [];
    const seen = new Set();
    $('[data-chapter-row]').each((i, el) => {
      const $row = $(el);
      const href = $row.is('a') ? $row.attr('href') : $row.find('a[href*="/read/"]').first().attr('href');
      const m = String(href || '').match(/\/read\/(\d+)/);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const nameEl = $row.find('.chapterlist__name, strong').first();
      nameEl.find('em').remove();
      let name = oneLine(nameEl.text());
      const numberMatch = (name || oneLine($row.attr('data-filter-text'))).match(/(\d+(?:\.\d+)?)/);
      if (!name) name = numberMatch ? `Chapter ${numberMatch[1]}` : 'Chapter';
      const row = { id: m[1], chapterId: m[1], name };
      if (numberMatch && Number.isFinite(Number(numberMatch[1]))) row.number = Number(numberMatch[1]);
      const time = Date.parse(String($row.find('time').first().attr('datetime') || ''));
      if (Number.isFinite(time)) row.time = time;
      rows.push(row);
    });
    const said = Number(String($('.chapters .section__head p, .cherri-chapter-group__heading span').first().text()).replace(/[^\d]/g, ''));
    if (!rows.length && said > 0) throw new Error(`${NAME}: the chapter list could not be read`);
    if (said > 0 && rows.length < said * 0.9) throw new Error(`${NAME}: read ${rows.length} of ${said} chapters`);
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await this.page(`/read/${encodeURIComponent(String(chapterId))}`);
    const $ = cheerio.load(mainOf(html));
    const pages = [];
    const seen = new Set();
    $('#chapter-reader img[data-page], img[data-page][src*="/mangas/"]').each((i, img) => {
      const src = absolute($(img).attr('src') || $(img).attr('data-src'));
      if (src && !seen.has(src)) {
        seen.add(src);
        pages.push(src);
      }
    });
    if (!pages.length) throw new Error(`${NAME} has no pages for this chapter yet`);
    const said = Number($('[data-page-count]').first().attr('data-page-count')) || 0;
    if (said > 0 && pages.length < said) throw new Error(`${NAME}: read ${pages.length} of ${said} pages`);
    return { id: String(chapterId), mangaId, pages };
  }
}

module.exports = { Source };
