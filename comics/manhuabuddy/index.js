const SITE = 'https://manhuabuddy.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', path: '/', size: 30 },
  { id: 'new', name: 'New Titles', path: '/new-manga', size: 20 },
  { id: 'top-manhwa', name: 'Top Manhwa', path: '/top-manhwa', size: 20 },
  { id: 'top-manga', name: 'Top Manga', path: '/top-manga', size: 20 },
  { id: 'top-manhua', name: 'Top Manhua', path: '/top-manhua', size: 20 },
  { id: 'top-comics', name: 'Top Comics', path: '/top-comics', size: 20 },
  { id: 'completed', name: 'Completed Manhwa', path: '/completed-manhwa', size: 30 },
];

const GENRES = [
  ['fantasy', 'Fantasy'], ['romance', 'Romance'], ['drama', 'Drama'], ['manhwa', 'Manhwa'], ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'],
  ['historical', 'Historical'], ['martial-arts', 'Martial Arts'], ['manhwa-hot', 'Manhwa Hot'], ['manga', 'Manga'], ['isekai', 'Isekai'], ['full-color', 'Full Color'],
  ['manhua', 'Manhua'], ['adaptation', 'Adaptation'], ['mature', 'Mature'], ['magic', 'Magic'], ['josei', 'Josei'], ['harem', 'Harem'], ['mystery', 'Mystery'],
  ['joseiw', 'Josei(W)'], ['psychological', 'Psychological'], ['ecchi', 'Ecchi'], ['adult', 'Adult'], ['office-workers', 'Office Workers'], ['magical', 'Magical'],
  ['horror', 'Horror'], ['demons', 'Demons'], ['childhood-friends', 'Childhood Friends'], ['one-shot', 'One Shot'], ['gender-bender', 'Gender Bender'], ['cooking', 'Cooking'],
  ['crime', 'Crime'], ['college-life', 'College Life'], ['game', 'Game'], ['monsters', 'Monsters'], ['music', 'Music'], ['korean', 'Korean'], ['medical', 'Medical'],
];

const RATE_18 = ['adult', 'mature-18', 'hentai', 'incest', 'fetish', 'netorare-ntr'];
const RATE_16 = ['mature', 'ecchi', 'omegaverse', 'cheating-infidelity', 'doujinshi', 'loli'];

const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function slugOf(href) {
  const m = String(href || '').match(/\/(?:manhwa|read-hentai)\/([^\/?#]+)/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u || /^data:/i.test(u) || /loading\.svg/i.test(u)) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return SITE + u;
  return '';
}

function encodeAddress(url) {
  const m = String(url).match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
  if (!m) return String(url);
  const path = (m[2] || '')
    .replace(/%(?![0-9a-fA-F]{2})/g, '%25')
    .replace(/[^\x21-\x7e]|["<>\\^`{|}?#]/g, (c) => {
      try {
        return encodeURIComponent(c);
      } catch (e) {
        return '';
      }
    });
  return m[1] + path;
}

function repairPages(sources) {
  const isPicture = (u) => /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(u);
  const out = [];
  let open = '';
  let host = '';
  for (const raw of sources) {
    const src = String(raw || '').trim();
    if (!src) continue;
    if (open) {
      const piece = host && src.indexOf(host) === 0 ? src.slice(host.length) : src;
      open = `${open},${piece}`;
      if (isPicture(open)) {
        out.push(open);
        open = '';
      }
      continue;
    }
    if (isPicture(src)) {
      out.push(src);
    } else {
      const m = src.match(/^(https?:\/\/[^\/]+\/)/);
      open = src;
      host = m ? m[1] : '';
    }
  }
  if (open) throw new Error('ManhuaBuddy: a page address could not be put back together');
  return out.map((u) => absolute(encodeAddress(u))).filter(Boolean);
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('complete') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0 || s.indexOf('drop') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function readDate(text) {
  const m = oneLine(text).match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return undefined;
  return Date.UTC(Number(m[3]), month, Number(m[2]));
}

function ageOfGenres(slugs) {
  if (slugs.some((s) => RATE_18.indexOf(s) >= 0)) return 18;
  if (slugs.some((s) => RATE_16.indexOf(s) >= 0)) return 16;
  return undefined;
}

function searchWords(query) {
  const words = oneLine(query).split(' ').filter(Boolean);
  const long = words.filter((w) => w.length >= 4);
  return (long.length ? long : words).join(' ');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.adult = null;
    this.adultAt = 0;
    this.mature = null;
    this.matureAt = 0;
    this.matureLoading = null;
    this.pages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async html(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(
          App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }),
        );
        if (response.status === 404) throw new Error('ManhuaBuddy: not found (HTTP 404)');
        if (response.status < 502 || response.status > 504) {
          if (response.status < 200 || response.status >= 300) throw new Error(`ManhuaBuddy: HTTP ${response.status}`);
          return String(response.data || '');
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || /ManhuaBuddy/.test(String(e && e.message))) throw e;
      }
    }
    throw new Error(`ManhuaBuddy: HTTP ${last ? last.status : 0}`);
  }

  cards($, scope) {
    const rows = [];
    const seen = new Set();
    scope.find('li').each((i, el) => {
      const row = $(el);
      const link = row.find('h3.title a').first();
      const id = slugOf(link.attr('href'));
      const title = oneLine(link.text());
      if (!id || !title || seen.has(id)) return;
      seen.add(id);
      const img = row.find('img').first();
      rows.push({ id, title, image: absolute(img.attr('data-original')) || absolute(img.attr('src')) });
    });
    return rows;
  }

  lastPage($) {
    let max = 0;
    $('.pagination a').each((i, el) => {
      const m = String($(el).attr('href') || '').match(/[?&]page=(\d+)/);
      if (m && Number(m[1]) > max) max = Number(m[1]);
    });
    return max;
  }

  async titlesOf(slug) {
    const first = await this.html(`/genre/${slug}`);
    const $ = cheerio.load(first);
    const set = new Set();
    for (const c of this.cards($, $('.section_todayup').first())) set.add(c.id);
    const last = Math.min(this.lastPage($), 12);
    if (last > 1) {
      const pages = [];
      for (let p = 2; p <= last; p++) pages.push(p);
      const rest = await Promise.all(pages.map((p) => this.html(`/genre/${slug}?page=${p}`)));
      for (const body of rest) {
        const $p = cheerio.load(body);
        for (const c of this.cards($p, $p('.section_todayup').first())) set.add(c.id);
      }
    }
    return set;
  }

  async titlesOfAll(slugs) {
    const sets = await Promise.all(slugs.map((s) => this.titlesOf(s)));
    const all = new Set();
    for (const set of sets) for (const id of set) all.add(id);
    return all;
  }

  async ratings() {
    const fresh = (at) => at && Date.now() - at < 1800000;
    if (!fresh(this.adultAt)) {
      let set = null;
      try {
        set = await this.titlesOfAll(RATE_18);
      } catch (e) {
        try {
          set = await this.titlesOfAll(RATE_18);
        } catch (e2) {
          console.error('ManhuaBuddy rating index failed: ' + (e2 && e2.message));
        }
      }
      if (set) {
        this.adult = set;
        this.adultAt = Date.now();
      }
    }
    if (!fresh(this.matureAt) && !this.matureLoading) {
      this.matureLoading = this.titlesOfAll(RATE_16)
        .then((set) => {
          this.mature = set;
          this.matureAt = Date.now();
        })
        .catch((e) => console.error('ManhuaBuddy 16 rating index failed: ' + (e && e.message)))
        .then(() => {
          this.matureLoading = null;
        });
    }
    return { adult: this.adult || new Set(), mature: this.mature || new Set() };
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = Math.max(1, Number((metadata && metadata.page) || 1));
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const wanted = included.length ? String((included[0] && included[0].id) || included[0]) : '';
    const genre = wanted ? GENRES.find((g) => g[0] === wanted) : null;
    const pager = page > 1 ? `page=${page}` : '';
    let path;
    let size = 20;
    let scopeOf = ($) => $('.list_wrap').first();
    if (query) {
      path = `/search?s=${encodeURIComponent(searchWords(query))}${pager ? '&' + pager : ''}`;
    } else if (genre) {
      path = `/genre/${genre[0]}${pager ? '?' + pager : ''}`;
      size = 30;
      scopeOf = ($) => $('.section_todayup').first();
    } else {
      path = `${feed.path}${pager ? '?' + pager : ''}`;
      size = feed.size;
      scopeOf = ($) => $('.main-content').first();
    }
    const [body, rated] = await Promise.all([this.html(path), this.ratings()]);
    const $ = cheerio.load(body);
    const list = this.cards($, scopeOf($));
    const results = list.map((c) => {
      const card = { mangaId: c.id, title: c.title, image: c.image, referer: `${SITE}/`, medium: 'comics' };
      if (rated.adult.has(c.id)) card.ageRating = 18;
      else if (rated.mature.has(c.id)) card.ageRating = 16;
      else card.ageRating = 0;
      return card;
    });
    const last = this.lastPage($);
    const more = last > 0 ? page < last : results.length >= size;
    return { results, metadata: results.length && more ? { page: page + 1 } : undefined };
  }

  titlePage(mangaId) {
    const key = String(mangaId);
    const hit = this.pages.get(key);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.html(`/manhwa/${encodeURIComponent(key)}`).then((body) => {
      const $ = cheerio.load(body);
      if (/Page Not Found/i.test($('title').text()) || !$('.title_content h1').length) throw new Error('ManhuaBuddy: title not found');
      return $;
    });
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(key) && this.pages.get(key).promise === promise) this.pages.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.titlePage(mangaId);
    const title = oneLine($('.title_content h1').first().text());
    if (!title) throw new Error('ManhuaBuddy: title not found');
    const line = (label) => $('.manga-info .line').filter((i, el) => new RegExp(label, 'i').test($(el).find('.line-text').first().text()));
    const names = (label) =>
      line(label)
        .find('.item-tag')
        .map((i, el) => oneLine($(el).text()))
        .get()
        .filter(Boolean);
    const genreLinks = line('^\\s*Genres').find('a.item-tag');
    const genreSlugs = genreLinks.map((i, el) => String($(el).attr('href') || '').replace(/^.*\/genre\//, '')).get();
    const tags = genreLinks
      .map((i, el) => oneLine($(el).text()))
      .get()
      .filter((t) => t && t.toLowerCase() !== 'comics');
    const authors = names('^\\s*Authors?');
    const artists = names('^\\s*Artists?');
    const desc = $('.ep-body .d-box .desc').first().clone();
    desc.find('h2').remove();
    let text = desc.text().replace(/\r/g, '').trim();
    const lines = text.split('\n').map((l) => l.trim());
    if (lines.length && /^(A brief description of|Read )/i.test(lines[0])) lines.shift();
    text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const alt = oneLine($('h2.alternative').first().text()).replace(/\s+(Manga|Manhwa|Manhua|Comics)$/i, '');
    const info = {
      title,
      image: absolute($('.comic-thumb-detail .manga-cover img').first().attr('src')),
      referer: `${SITE}/`,
      desc: text ? (alt && alt !== title ? `${text}\n\nAlso known as: ${alt}` : text) : alt && alt !== title ? `Also known as: ${alt}` : undefined,
      author: (authors.length ? authors : artists).join(', ') || undefined,
      status: mapStatus(line('^\\s*Status').find('.line-content').first().text()),
      tags,
      webURL: `${SITE}/manhwa/${encodeURIComponent(String(mangaId))}`,
      medium: 'comics',
    };
    const age = ageOfGenres(genreSlugs);
    info.ageRating = age === undefined ? 0 : age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.titlePage(mangaId);
    const rows = [];
    const seen = new Set();
    $('#chapter-list li.citem').each((i, el) => {
      const row = $(el);
      const link = row.find('a').first();
      const href = String(link.attr('href') || '').trim();
      const id = href.split('?')[0].replace(/\/+$/, '').split('/').pop();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const name = oneLine(link.text()) || id;
      const n = name.match(/^Chapter\s+(\d+(?:\.\d+)?)/i);
      const chapter = { id, chapterId: id, name };
      if (n) chapter.number = Number(n[1]);
      const time = readDate(row.find('.time').first().text());
      if (time !== undefined) chapter.time = time;
      rows.push(chapter);
    });
    const expected = Number(String($('#chapter-list').attr('class') || '').replace(/^.*col-(\d+).*$/, '$1'));
    if (!rows.length) {
      if (expected > 0) throw new Error('ManhuaBuddy: the chapter list could not be read');
      throw new Error('ManhuaBuddy has no chapters for this title yet');
    }
    if (expected > 0 && rows.length < expected) throw new Error(`ManhuaBuddy: read ${rows.length} of ${expected} chapters`);
    return rows;
  }

  async pageExists(url) {
    try {
      const request = App.createRequest({ url, method: 'HEAD', headers: { 'User-Agent': UA, Referer: `${SITE}/` } });
      const response = await Promise.race([this.requests.schedule(request), new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
      if (!response) return null;
      if (response.status === 404) return false;
      if (response.status < 200 || response.status >= 300) return null;
      const headers = response.headers || {};
      let length = NaN;
      for (const key of Object.keys(headers)) if (String(key).toLowerCase() === 'content-length') length = Number(headers[key]);
      return Number.isFinite(length) && length < 300 ? false : true;
    } catch (e) {
      return null;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    const body = await this.html(`/manhwa/${encodeURIComponent(String(mangaId))}/${encodeURIComponent(String(chapterId))}`);
    const $ = cheerio.load(body);
    const sources = [];
    $('.chapter-content .item-photo img').each((i, el) => {
      sources.push(String($(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || '').trim());
    });
    const pages = [];
    for (const url of repairPages(sources)) {
      if (url && pages.indexOf(url) < 0) pages.push(url);
    }
    if (!pages.length) throw new Error('ManhuaBuddy has no pages for this chapter yet');
    const checks = await Promise.all([this.pageExists(pages[0]), pages.length > 1 ? this.pageExists(pages[pages.length - 1]) : Promise.resolve(false)]);
    if (checks[0] === false && checks[1] === false) throw new Error('ManhuaBuddy has no pictures for this chapter: the files are missing on the site');
    return { id: chapterId, mangaId, pages, referer: `${SITE}/` };
  }
}

module.exports = { Source };
