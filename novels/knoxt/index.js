const SITE = 'https://knoxt.space';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'update', name: 'Latest Update' },
  { id: 'latest', name: 'Latest Added' },
  { id: 'popular', name: 'Popular' },
  { id: 'rating', name: 'Rating' },
  { id: 'title', name: 'A to Z' },
];

const RATE_18 = [['adult', 3], ['adults', 1], ['smut', 3], ['urban-erotica-vibes', 1]];
const RATE_16 = [['mature', 4]];
const ADULT_WORDS = /^(adult|adults|smut|erotica|urban erotica vibes|r-?18|18\+|nsfw|hentai|f\*llatio|first-time interc\*\*rse|s\*x friends)$/;
const SUGGESTIVE_WORDS = /^(mature|ecchi|suggestive)$/;

const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

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

function gridCover(url) {
  const u = absolute(url);
  return u.replace(/([?&])resize=\d+(?:,|%2C)\d+/i, '$1resize=300,430');
}

function parseDate(text) {
  const m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(cleanText(text));
  if (!m) return undefined;
  const month = MONTHS[m[1].toLowerCase()];
  return month === undefined ? undefined : Date.UTC(parseInt(m[3], 10), month, parseInt(m[2], 10));
}

function mapStatus(text) {
  const s = cleanText(text).toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('complet') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0 || s.indexOf('hold') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0 || s.indexOf('drop') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function genreAge(names) {
  const set = (names || []).map((n) => cleanText(n).toLowerCase());
  if (set.some((n) => ADULT_WORDS.test(n))) return 18;
  if (set.some((n) => SUGGESTIVE_WORDS.test(n))) return 16;
  return 0;
}

function pathOf(href) {
  return String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
}

function hasNext($) {
  let found = false;
  $('.pagination a, .hpage a').each((_, el) => {
    if (/^next/i.test(cleanText($(el).text())) || $(el).hasClass('next')) found = true;
  });
  return found;
}

function readLabel(label) {
  const text = cleanText(label);
  const vol = /Vol(?:ume)?\.?\s*(\d+(?:\.\d+)?)/i.exec(text);
  const ch = /Ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i.exec(text);
  let base = text.replace(/Vol(?:ume)?\.?\s*\d+(?:\.\d+)?\s*/i, '').replace(/^Ch\.?\s*/i, 'Chapter ').replace(/^Chapter\s+Chapter\b/i, 'Chapter').replace(/\s+/g, ' ').trim();
  if (!base) base = text;
  return { base, number: ch ? parseFloat(ch[1]) : undefined, volume: vol ? vol[1] : undefined };
}

function chapterText($) {
  const root = $('.epcontent.entry-content').first();
  if (root.length === 0) return '';
  root.find('script, style, noscript, iframe, ins, .kln, .code-block, .adsbygoogle').remove();
  root.find('br').replaceWith('\n');
  const paragraphs = [];
  const take = (text) =>
    String(text || '')
      .split(/\n+/)
      .forEach((line) => {
        const t = cleanText(line);
        if (t) paragraphs.push(t);
      });
  root.children().each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    if (tag === 'hr' || tag === 'img') return;
    if (tag === 'ul' || tag === 'ol') $(el).find('li').each((__, li) => take($(li).text()));
    else take($(el).text());
  });
  return paragraphs.join('\n\n');
}

class Source {
  constructor() {
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
      const $ = cheerio.load(await this.requestHTML(`${SITE}/series/`));
      const labels = {};
      $('label[for]').each((_, el) => {
        labels[$(el).attr('for')] = cleanText($(el).text());
      });
      const tags = [];
      const seen = new Set();
      $('input[name="genre[]"]').each((_, el) => {
        const id = cleanText($(el).attr('value'));
        const label = labels[$(el).attr('id')] || '';
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label: label.replace(/^[|\s]+/, '') });
      });
      if (tags.length > 0) this.tags = tags;
      return tags;
    } catch (e) {
      console.error('KnoxT getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  listUrl(page, query, params) {
    if (query) {
      const path = page > 1 ? `/series/page/${page}/` : '/series/';
      return `${SITE}${path}?${qs([['s', query]].concat(params))}`;
    }
    return `${SITE}/series/?${qs(params.concat([['page', page > 1 ? page : '']]))}`;
  }

  parseCards($) {
    const cards = [];
    const seen = new Set();
    $('article.maindet').each((_, el) => {
      const card = $(el);
      const link = card.find('h2 a').first();
      const mangaId = pathOf(link.attr('href'));
      if (!mangaId || mangaId.indexOf('/') >= 0 || seen.has(mangaId)) return;
      const title = cleanText(link.text());
      if (!title) return;
      if (card.find('.nchapter a').length === 0) return;
      seen.add(mangaId);
      const img = card.find('.mdthumb img').first();
      const tags = [];
      card.find('.mdgenre a').each((__, g) => {
        const t = cleanText($(g).text()).replace(/^#\s*/, '');
        if (t) tags.push(t);
      });
      cards.push({
        mangaId,
        title,
        image: gridCover(img.attr('data-src') || img.attr('src')),
        tags,
        medium: 'novel',
        webURL: `${SITE}/${seg(mangaId)}/`,
      });
    });
    return cards;
  }

  async titlesOfGenre(genre, firstPages) {
    const slugs = new Set();
    let lastCount = 0;
    const take = (html) => {
      const $ = cheerio.load(html);
      const found = $('article.maindet');
      found.each((_, el) => {
        const s = pathOf($(el).find('h2 a').first().attr('href'));
        if (s) slugs.add(s);
      });
      return found.length;
    };
    const batch = [];
    for (let p = 1; p <= firstPages; p++) batch.push(this.requestHTML(this.listUrl(p, '', [['genre[]', genre]])));
    (await Promise.all(batch)).forEach((html) => {
      lastCount = take(html);
    });
    for (let p = firstPages + 1; lastCount >= 20 && p <= 25; p++) {
      lastCount = take(await this.requestHTML(this.listUrl(p, '', [['genre[]', genre]])));
    }
    return slugs;
  }

  async titlesOf(genres) {
    const sets = await Promise.all(genres.map((g) => this.titlesOfGenre(g[0], g[1])));
    const all = new Set();
    sets.forEach((s) => s.forEach((x) => all.add(x)));
    return all;
  }

  async ratings() {
    const fresh = (at) => at && Date.now() - at < 1800000;
    const load = async (genres) => {
      try {
        return await this.titlesOf(genres);
      } catch (e) {
        try {
          return await this.titlesOf(genres);
        } catch (e2) {
          console.error('KnoxT rating index failed: ' + (e2 && e2.message));
          return null;
        }
      }
    };
    const jobs = [];
    if (!fresh(this.adultAt)) {
      jobs.push(
        load(RATE_18).then((set) => {
          if (set) {
            this.adult = set;
            this.adultAt = Date.now();
          }
        }),
      );
    }
    if (!fresh(this.matureAt)) {
      jobs.push(
        load(RATE_16).then((set) => {
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
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).map((t) => (t && t.id) || t).filter(Boolean).map(String);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];

    const params = tags.map((id) => ['genre[]', id]);
    if (!query) params.unshift(['order', feed.id]);
    const url = this.listUrl(page, query, params);

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
      const own = genreAge(c.tags);
      if (adult && adult.has(c.mangaId)) c.ageRating = 18;
      else if (own >= 18) c.ageRating = 18;
      else if (mature && mature.has(c.mangaId)) c.ageRating = 16;
      else if (own >= 16) c.ageRating = 16;
      else if (adult && mature) c.ageRating = 0;
      delete c.tags;
    });
    const raw = $('article.maindet').length;
    return { results: cards, metadata: raw > 0 && hasNext($) ? { page: page + 1 } : undefined };
  }

  titlePage(mangaId) {
    const key = String(mangaId);
    const hit = this.pages.get(key);
    if (hit && Date.now() - hit.at < 120000) return hit.promise;
    const promise = this.requestHTML(`${SITE}/${seg(mangaId)}/`).then((html) => cheerio.load(html));
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(key) && this.pages.get(key).promise === promise) this.pages.delete(key);
    });
    if (this.pages.size > 20) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  fact($, label) {
    let found = '';
    $('.info-content .spe span').each((_, el) => {
      const b = $(el).find('b').first();
      if (cleanText(b.text()).replace(/:$/, '').toLowerCase() === label.toLowerCase()) {
        const names = [];
        $(el).find('a').each((__, a) => {
          const t = cleanText($(a).text());
          if (t) names.push(t);
        });
        found = names.length > 0 ? names.join(', ') : cleanText($(el).clone().children('b').remove().end().text());
        return false;
      }
    });
    return found;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.titlePage(mangaId);
    const title = cleanText($('h1.entry-title').first().text());
    if (!title || $('.bixbox.animefull').length === 0) {
      throw new Error('KnoxT: ' + mangaId + ' is not a title page (the page changed or the title is gone)');
    }

    const tags = [];
    $('.genxed a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const paragraphs = [];
    const take = (text) =>
      String(text || '')
        .split(/\n+/)
        .forEach((line) => {
          const t = cleanText(line);
          if (t && /[A-Za-z0-9]/.test(t)) paragraphs.push(t);
        });
    const block = (el) => {
      const tag = (el.tagName || el.name || '').toLowerCase();
      const node = $(el);
      if (tag === 'p' || tag === 'blockquote') {
        node.find('br').replaceWith('\n');
        take(node.text());
      } else if (tag === 'div') {
        if (node.children('p, div').length > 0) {
          node.children().each((_, c) => block(c));
        } else if (cleanText(node.text()) !== cleanText(node.find('a').text())) {
          node.find('br').replaceWith('\n');
          take(node.text());
        }
      }
    };
    $('.synp .entry-content').first().children().each((_, el) => block(el));
    let desc = paragraphs.join('\n\n');
    if (desc.length > 1500) desc = desc.slice(0, desc.lastIndexOf('\n\n', 1500) > 200 ? desc.lastIndexOf('\n\n', 1500) : 1500);

    const img = $('.thumbook .thumb img, .thumb img').first();
    const status = mapStatus(this.fact($, 'Status'));
    const info = {
      title,
      image: absolute(img.attr('data-src') || img.attr('src')),
      author: this.fact($, 'Author'),
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE}/${seg(mangaId)}/`,
      medium: 'novel',
      ageRating: genreAge(tags),
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.titlePage(mangaId);
    if ($('.bixbox.animefull').length === 0) throw new Error('KnoxT: ' + mangaId + ' is not a title page');
    const rows = [];
    const seen = new Set();
    $('.eplister li').each((_, el) => {
      const li = $(el);
      const a = li.find('a').first();
      const path = pathOf(a.attr('href'));
      if (!path || seen.has(path)) return;
      seen.add(path);
      const label = readLabel(li.find('.epl-num').first().text());
      const title = cleanText(li.find('.epl-title').first().text());
      const id = path.replace(/\//g, '~');
      const row = { id, chapterId: id, name: title && title.toLowerCase() !== label.base.toLowerCase() ? `${label.base} - ${title}` : label.base, number: label.number };
      if (label.volume !== undefined) row.volume = label.volume;
      const time = parseDate(li.find('.epl-date').first().text());
      if (time !== undefined) row.time = time;
      rows.push(row);
    });
    rows.reverse();
    let last = -1;
    rows.forEach((r) => {
      let n = r.number;
      if (n === undefined || n <= last) n = Math.round((last + (n === undefined ? 0.001 : 0.0001)) * 10000) / 10000;
      r.number = n;
      last = n;
    });
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const path = String(chapterId).split('~').map(seg).join('/');
    const html = await this.requestHTML(`${SITE}/${path}/`);
    const $ = cheerio.load(html);
    const text = chapterText($);
    if (text.length < 40) throw new Error('KnoxT returned no text for this chapter');
    return { id: chapterId, mangaId, pages: [], text };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`KnoxT HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
