const SITE = 'https://aquareader.org';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Popular' },
  { id: 'views', name: 'Most Views' },
  { id: 'new-manga', name: 'Newest' },
  { id: 'alphabet', name: 'A to Z' },
];

const RATE_18 = ['adult', 'erotica', 'pornographic', 'r-18', 'sexual-violence'];
const RATE_16 = ['ecchi', 'mature', 'suggestive'];
const ADULT_WORDS = /^(adult|erotica|pornographic|r-?18|sexual violence|smut|hentai|18\+|nsfw)$/;
const SUGGESTIVE_WORDS = /^(ecchi|mature|suggestive)$/;

const UNIT_MS = [
  ['sec', 1000],
  ['min', 60000],
  ['hour', 3600000],
  ['hr', 3600000],
  ['day', 86400000],
  ['week', 604800000],
  ['month', 2592000000],
  ['year', 31536000000],
];

function cleanText(text) {
  return String(text == null ? '' : text).replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
  }
  return encodeURIComponent(text);
}

function qs(params) {
  return params
    .filter((p) => p[1] !== undefined && p[1] !== null && p[1] !== '')
    .map((p) => `${encodeURIComponent(p[0])}=${encodeURIComponent(String(p[1]))}`)
    .join('&');
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function relativeTime(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return undefined;
  if (/^(just now|today|now)$/.test(t)) return Date.now();
  if (t === 'yesterday') return Date.now() - 86400000;
  const m = /^(\d+)\s*([a-z]+)\s+ago$/.exec(t);
  if (!m) return undefined;
  const unit = UNIT_MS.find((u) => m[2].indexOf(u[0]) === 0);
  return unit ? Date.now() - parseInt(m[1], 10) * unit[1] : undefined;
}

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s.indexOf('ongoing') >= 0 || s.indexOf('on-going') >= 0) return 'ONGOING';
  if (s.indexOf('complet') >= 0) return 'COMPLETED';
  if (s.indexOf('hold') >= 0 || s.indexOf('hiatus') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0 || s.indexOf('drop') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function genreAge(names) {
  const set = (names || []).map((n) => cleanText(n).toLowerCase());
  if (set.some((n) => ADULT_WORDS.test(n))) return 18;
  if (set.some((n) => SUGGESTIVE_WORDS.test(n))) return 16;
  return 0;
}

function slugOfHref(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const m = /^\/manga\/([^/]+)\/?/.exec(path);
  return m ? m[1] : '';
}

class Source {
  constructor() {
    this.covers = new Map();
    this.pages = new Map();
    this.tags = null;
    this.adult = null;
    this.adultAt = 0;
    this.mature = null;
    this.matureAt = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (this.tags) return this.tags;
    try {
      const $ = cheerio.load(await this.requestHTML(`${SITE}/manga/`));
      const tags = [];
      const seen = new Set();
      $('#aqua-genre-pills a[href*="genre="]').each((_, el) => {
        const m = /[?&]genre=([^&#]+)/.exec($(el).attr('href') || '');
        const id = m ? decodeURIComponent(m[1]) : '';
        const label = cleanText($(el).text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      if (tags.length > 0) this.tags = tags;
      return tags;
    } catch (e) {
      console.error('Aqua Manga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  listUrl(page, params) {
    const path = page > 1 ? `/manga/page/${page}/` : '/manga/';
    const query = qs(params);
    return `${SITE}${path}${query ? '?' + query : ''}`;
  }

  parseCards($) {
    const cards = [];
    const seen = new Set();
    $('.aqua-manga-card').each((_, el) => {
      const card = $(el);
      const link = card.find('a.aqua-manga-card__cover-link, .aqua-manga-card__title a').first();
      const mangaId = slugOfHref(link.attr('href'));
      if (!mangaId || seen.has(mangaId)) return;
      const title = cleanText(card.find('.aqua-manga-card__title').first().text());
      if (!title) return;
      seen.add(mangaId);
      const img = card.find('img.aqua-manga-card__cover, img').first();
      const image = absolute(img.attr('data-src') || img.attr('src'));
      if (image) this.covers.set(mangaId, image);
      cards.push({ mangaId, title, image, medium: 'comics', webURL: `${SITE}/manga/${seg(mangaId)}/` });
    });
    return cards;
  }

  async titlesOf(genres, firstPages) {
    const params = genres.map((g) => ['genre[]', g]);
    const slugs = new Set();
    let lastCount = 0;
    const take = (html) => {
      const $ = cheerio.load(html || '');
      const found = $('.aqua-manga-card__title a');
      found.each((_, el) => {
        const s = slugOfHref($(el).attr('href'));
        if (s) slugs.add(s);
      });
      return found.length;
    };
    const ask = async (p) => {
      try {
        return await this.requestHTML(this.listUrl(p, params));
      } catch (e) {
        if (p > 1 && /HTTP 404/.test(String(e && e.message))) return '';
        throw e;
      }
    };
    const batch = [];
    for (let p = 1; p <= firstPages; p++) batch.push(ask(p));
    (await Promise.all(batch)).forEach((html) => {
      lastCount = take(html);
    });
    for (let p = firstPages + 1; lastCount >= 24 && p <= 25; p++) lastCount = take(await ask(p));
    return slugs;
  }

  async ratings() {
    const fresh = (at) => at && Date.now() - at < 1800000;
    const load = async (genres, pages) => {
      try {
        return await this.titlesOf(genres, pages);
      } catch (e) {
        try {
          return await this.titlesOf(genres, pages);
        } catch (e2) {
          console.error('Aqua Manga rating index failed: ' + (e2 && e2.message));
          return null;
        }
      }
    };
    const jobs = [];
    if (!fresh(this.adultAt)) {
      jobs.push(
        load(RATE_18, 1).then((set) => {
          if (set) {
            this.adult = set;
            this.adultAt = Date.now();
          }
        }),
      );
    }
    if (!fresh(this.matureAt)) {
      jobs.push(
        load(RATE_16, 9).then((set) => {
          if (set) {
            this.mature = set;
            this.matureAt = Date.now();
          }
        }),
      );
    }
    await Promise.all(jobs);
    return { adult: this.adult, mature: this.mature };
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).map((t) => (t && t.id) || t).filter(Boolean).map(String);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];

    const params = [];
    if (query) params.push(['search', query]);
    tags.forEach((id) => params.push(['genre[]', id]));
    if (!query) params.push(['m_orderby', feed.id]);
    const url = this.listUrl(page, params);

    let html;
    try {
      const [body] = await Promise.all([this.requestHTML(url), this.ratings()]);
      html = body;
    } catch (e) {
      if (page > 1 && /HTTP 404/.test(String(e && e.message))) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const cards = this.parseCards($);
    const adult = this.adult;
    const mature = this.mature;
    cards.forEach((c) => {
      if (adult && adult.has(c.mangaId)) c.ageRating = 18;
      else if (mature && mature.has(c.mangaId)) c.ageRating = 16;
      else if (adult && mature) c.ageRating = 0;
    });
    const more = cards.length > 0 && $('.aqua-archive-pagination a.next.page-numbers').length > 0;
    return { results: cards, metadata: more ? { page: page + 1 } : undefined };
  }

  titlePage(mangaId) {
    const key = String(mangaId);
    const hit = this.pages.get(key);
    if (hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = this.requestHTML(`${SITE}/manga/${seg(mangaId)}/`).then((html) => cheerio.load(html));
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(key) && this.pages.get(key).promise === promise) this.pages.delete(key);
    });
    if (this.pages.size > 20) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  fact($, label) {
    let found = '';
    $('.aqua-sp-fact').each((_, el) => {
      if (cleanText($(el).find('dt').first().text()).toLowerCase() === label.toLowerCase()) {
        const dd = $(el).find('dd').first();
        const names = [];
        dd.find('a').each((__, a) => {
          const t = cleanText($(a).text());
          if (t) names.push(t);
        });
        found = names.length > 0 ? names.join(', ') : cleanText(dd.text());
        return false;
      }
    });
    return found;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.titlePage(mangaId);
    const title = cleanText($('h1.aqua-sp-title').first().text());
    if (!title) throw new Error('Aqua Manga: the title page for ' + mangaId + ' has no title (the page changed or the title is gone)');

    const tags = [];
    $('.aqua-series-genre-pill').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const people = [];
    [this.fact($, 'Author'), this.fact($, 'Artist')].forEach((s) =>
      s.split(',').forEach((n) => {
        const t = cleanText(n);
        if (t && !/^(updating|n\/a|unknown|none|-|\?)$/i.test(t) && people.indexOf(t) < 0) people.push(t);
      }),
    );

    const paragraphs = [];
    $('#aqua-synopsis p, .aqua-series-synopsis p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) paragraphs.push(t);
    });
    const desc = paragraphs.length > 0 ? paragraphs.join('\n\n') : cleanText($('.aqua-series-synopsis').first().text());

    const full = absolute($('.aqua-sp-cover img').first().attr('src') || $('meta[property="og:image"]').attr('content'));
    const status = mapStatus(this.fact($, 'Status'));
    const info = {
      title,
      image: this.covers.get(String(mangaId)) || full,
      author: people.join(', '),
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE}/manga/${seg(mangaId)}/`,
      medium: 'comics',
      ageRating: genreAge(tags),
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.titlePage(mangaId);
    const prefix = `/manga/${seg(mangaId)}/`;
    const rows = [];
    const seen = new Set();
    $('a.aqua-ch-item').each((_, el) => {
      const a = $(el);
      const path = String(a.attr('href') || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
      let rest = path.indexOf(prefix) === 0 ? path.slice(prefix.length) : '';
      if (!rest) {
        const m = /^\/manga\/[^/]+\/(.+)$/.exec(path);
        rest = m ? m[1] : '';
      }
      rest = rest.replace(/\/+$/, '');
      if (!rest || seen.has(rest)) return;
      seen.add(rest);
      const name = cleanText(a.find('.aqua-ch-item__name').first().text()) || cleanText(a.attr('data-chapter-name')) || rest;
      let number = parseFloat(a.attr('data-num'));
      if (!isFinite(number)) {
        const n = /(\d+(?:\.\d+)?)/.exec(name);
        number = n ? parseFloat(n[1]) : 0;
      }
      const chapter = { id: rest.replace(/\//g, '~'), chapterId: rest.replace(/\//g, '~'), name, number };
      const time = relativeTime(a.find('.aqua-ch-item__time').first().text());
      if (time !== undefined) chapter.time = time;
      rows.push(chapter);
    });
    const expected = parseInt(cleanText($('.aqua-ch-count').first().text()).replace(/\D/g, ''), 10);
    if (isFinite(expected) && rows.length < expected) {
      throw new Error(`Aqua Manga: the page lists ${rows.length} of ${expected} chapters`);
    }
    rows.reverse();
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const path = String(chapterId).split('~').map(seg).join('/');
    const html = await this.requestHTML(`${SITE}/manga/${seg(mangaId)}/${path}/`);
    const $ = cheerio.load(html);
    const pages = [];
    const seen = new Set();
    $('img.wp-manga-chapter-img, .reading-content img').each((_, el) => {
      const e = $(el);
      const src = (e.attr('data-src') || e.attr('data-lazy-src') || e.attr('src') || '').trim();
      if (!src || /^data:/.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error('Aqua Manga returned no pages for this chapter');
    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Aqua Manga HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
