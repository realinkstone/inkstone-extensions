const SITE_BASE = 'https://demonicscans.org';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const ADVANCED_PAGE = 56;
const UPDATES_PAGE = 40;
const SETS_KEY = 'rating-sets-v1';
const SETS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SET_GENRES = { 27: 18, 22: 16, 19: 16 };
const SET_MAX_PAGES = 8;

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Top Views' },
  { id: 'new', name: 'Recently Added' },
  { id: 'az', name: 'A To Z' },
  { id: 'ongoing', name: 'Ongoing' },
  { id: 'completed', name: 'Completed' },
];

const GENRES = [
  ['1', 'Action'], ['2', 'Adventure'], ['3', 'Comedy'], ['34', 'Cooking'], ['25', 'Doujinshi'], ['4', 'Drama'],
  ['19', 'Ecchi'], ['5', 'Fantasy'], ['30', 'Gender Bender'], ['10', 'Harem'], ['28', 'Historical'], ['8', 'Horror'],
  ['33', 'Isekai'], ['31', 'Josei'], ['6', 'Martial Arts'], ['22', 'Mature'], ['32', 'Mecha'], ['36', 'Murim'],
  ['15', 'Mystery'], ['26', 'One Shot'], ['35', 'Our Translation'], ['11', 'Psychological'], ['12', 'Romance'],
  ['13', 'School Life'], ['16', 'Sci-fi'], ['17', 'Seinen'], ['14', 'Shoujo'], ['23', 'Shoujo Ai'], ['7', 'Shounen'],
  ['29', 'Shounen Ai'], ['21', 'Slice of Life'], ['27', 'Smut'], ['20', 'Sports'], ['9', 'Supernatural'],
  ['18', 'Tragedy'], ['24', 'Webtoons'],
];

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function fixUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  const abs = /^https?:/i.test(u) ? u : u.indexOf('//') === 0 ? 'https:' + u : SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
  try {
    return encodeURI(decodeURI(abs));
  } catch (e) {
    return abs.replace(/ /g, '%20');
  }
}

const ENCODED_HYPHEN = /%(?:25)*2D/i;

function addressOf(id) {
  return ENCODED_HYPHEN.test(id) ? id : encodeURIComponent(id);
}

function slugOf(href) {
  const m = /\/manga\/([^/?#]+)/.exec(String(href || ''));
  if (!m) return '';
  if (ENCODED_HYPHEN.test(m[1])) return m[1];
  let s = m[1];
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(s);
      if (d === s) break;
      s = d;
    } catch (e) {
      break;
    }
  }
  return s;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('completed') >= 0) return 'COMPLETED';
  return 'UNKNOWN';
}

function ageRatingOfGenres(names) {
  const set = (names || []).map((n) => cleanText(n).toLowerCase());
  if (set.indexOf('smut') >= 0) return 18;
  if (set.indexOf('mature') >= 0 || set.indexOf('ecchi') >= 0) return 16;
  return 0;
}

function qs(params) {
  const out = [];
  Object.keys(params).forEach((k) => {
    const v = params[k];
    if (Array.isArray(v)) v.forEach((x) => out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`));
    else if (v !== undefined && v !== null && v !== '') out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  });
  return out.join('&');
}

class Source {
  constructor() {
    this._sets = null;
    this._setsLoading = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const title = cleanText((request && request.title) || '');
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) ? request.feed : 'latest';
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const genres = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);

    if (title) {
      const html = await this._html('/search.php?' + qs({ manga: title }));
      const $ = cheerio.load(html);
      const rows = [];
      $('a[href]').each((_, el) => {
        const a = $(el);
        if (!a.find('div.seach-right').length) return;
        const id = slugOf(a.attr('href'));
        if (!id) return;
        rows.push({
          id,
          title: cleanText(a.find('div.seach-right > div').first().text()) || id,
          image: fixUrl(a.find('img').first().attr('src')),
        });
      });
      return { results: await this._rated(rows.map((r) => this._partial(r))), metadata: undefined };
    }

    if (feed === 'latest' && genres.length === 0) {
      const $ = cheerio.load(await this._html('/lastupdates.php?' + qs({ list: page })));
      const rows = [];
      $('#updates-container > .updates-element').each((_, el) => {
        const e = $(el);
        if (e.find('.toffee-badge').length) return;
        const a = e.find('.updates-element-info a').first();
        const id = slugOf(a.attr('href'));
        if (!id) return;
        rows.push({ id, title: cleanText(a.text()) || id, image: fixUrl(e.find('.thumb img').first().attr('src')) });
      });
      return {
        results: await this._rated(rows.map((r) => this._partial(r))),
        metadata: rows.length >= UPDATES_PAGE ? { page: page + 1 } : undefined,
      };
    }

    const params = { list: page, status: 'all', orderby: 'VIEWS DESC' };
    if (feed === 'new') params.orderby = 'ID DESC';
    else if (feed === 'az') params.orderby = 'NAME ASC';
    else if (feed === 'ongoing' || feed === 'completed') params.status = feed;
    if (genres.length) params['genre[]'] = genres;
    const $ = cheerio.load(await this._html('/advanced.php?' + qs(params)));
    const rows = [];
    $('#advanced-content > .advanced-element').each((_, el) => {
      const e = $(el);
      const a = e.find('a[href]').first();
      const id = slugOf(a.attr('href'));
      if (!id) return;
      rows.push({ id, title: cleanText(e.find('h1').first().clone().children().remove().end().text()) || cleanText(a.attr('title')) || id, image: fixUrl(e.find('img').first().attr('src')) });
    });
    return {
      results: await this._rated(rows.map((r) => this._partial(r))),
      metadata: rows.length >= ADVANCED_PAGE ? { page: page + 1 } : undefined,
    };
  }

  _partial(r) {
    return {
      mangaId: r.id,
      title: r.title,
      image: r.image || undefined,
      medium: 'comics',
      webURL: `${SITE_BASE}/manga/${addressOf(r.id)}`,
    };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this._html(`/manga/${addressOf(mangaId)}`));
    const box = $('#manga-info-container');
    if (!box.length) throw new Error('Manga Demon: title not found');
    const tags = [];
    box.find('.genres-list > li').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const stat = (label) => {
      let value = '';
      box.find('#manga-info-stats > div').each((_, el) => {
        const items = $(el).children('li');
        if (items.length >= 2 && cleanText(items.eq(0).text()).toLowerCase().indexOf(label) === 0) value = cleanText(items.eq(1).text());
      });
      return value;
    };
    const author = stat('author');
    const status = mapStatus(stat('status'));
    const info = {
      mangaId,
      title: cleanText(box.find('h1.big-fat-titles').first().clone().children().remove().end().text()) || mangaId,
      image: fixUrl(box.find('#manga-page img').first().attr('src')) || undefined,
      author: author && !/updating/i.test(author) ? author : undefined,
      desc: cleanText(box.find('#manga-info-rightColumn > div > div.white-font').first().text()) || undefined,
      status,
      completed: status === 'COMPLETED',
      tags,
      ageRating: ageRatingOfGenres(tags),
      medium: 'comics',
      webURL: `${SITE_BASE}/manga/${addressOf(mangaId)}`,
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this._html(`/manga/${addressOf(mangaId)}`));
    const rows = [];
    const seen = new Set();
    $('#chapters-list a.chplinks').each((_, el) => {
      const a = $(el);
      const m = /manga=(\d+)&(?:amp;)?chapter=([0-9.]+)/.exec(a.attr('href') || '');
      if (!m) return;
      const id = `${m[1]}~${m[2]}`;
      if (seen.has(id)) return;
      seen.add(id);
      const number = parseFloat(m[2]);
      const name = cleanText(a.clone().children().remove().end().text()) || `Chapter ${m[2]}`;
      const row = { id, chapterId: id, name, number: Number.isFinite(number) ? number : rows.length + 1 };
      const when = /(\d{4})-(\d{2})-(\d{2})/.exec(a.find('span').first().text());
      if (when) row.time = Date.UTC(Number(when[1]), Number(when[2]) - 1, Number(when[3]));
      rows.push(row);
    });
    rows.sort((x, y) => x.number - y.number);
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const m = /^(\d+)~([0-9.]+)$/.exec(String(chapterId));
    if (!m) throw new Error('Manga Demon: bad chapter id ' + chapterId);
    const $ = cheerio.load(await this._html('/chaptered.php?' + qs({ manga: m[1], chapter: m[2] })));
    const pages = [];
    $('img.imgholder').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (!src || /\/img\/free_ads/i.test(src)) return;
      pages.push(fixUrl(src));
    });
    if (pages.length === 0) throw new Error('Manga Demon returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async _ratingSets() {
    if (this._sets) return this._sets;
    if (!this._setsLoading) {
      this._setsLoading = this._loadSets().then(
        (s) => {
          this._setsLoading = null;
          this._sets = s;
          return s;
        },
        (e) => {
          this._setsLoading = null;
          throw e;
        },
      );
    }
    return this._setsLoading;
  }

  async _loadSets() {
    const state = App.createSourceStateManager();
    let saved = null;
    try {
      saved = await state.retrieve(SETS_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved && typeof saved.at === 'number' && Date.now() - saved.at < SETS_MAX_AGE_MS && saved.ages) return saved.ages;
    const ages = {};
    for (const genre of Object.keys(SET_GENRES)) {
      for (let page = 1; page <= SET_MAX_PAGES; page++) {
        const $ = cheerio.load(await this._html('/advanced.php?' + qs({ list: page, status: 'all', orderby: 'ID DESC', 'genre[]': [genre] })));
        let n = 0;
        $('#advanced-content > .advanced-element a[href]').each((_, el) => {
          const id = slugOf($(el).attr('href'));
          if (!id) return;
          n += 1;
          if (!ages[id] || ages[id] < SET_GENRES[genre]) ages[id] = SET_GENRES[genre];
        });
        if (n < ADVANCED_PAGE) break;
      }
    }
    try {
      await state.store(SETS_KEY, { at: Date.now(), ages });
    } catch (e) {
    }
    return ages;
  }

  async _rated(results) {
    let ages = {};
    try {
      ages = await this._ratingSets();
    } catch (e) {
      ages = {};
    }
    return results.map((r) => (ages[r.mangaId] ? { ...r, ageRating: ages[r.mangaId] } : { ...r, ageRating: 0 }));
  }

  async _html(path) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({ url: SITE_BASE + path, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`Manga Demon HTTP ${response.status} for ${path.split('?')[0]}`);
    return response.data;
  }
}

module.exports = { Source };
