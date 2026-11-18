const CONFIG = {
  "name": "Cocomic",
  "origin": "https://cocomic.co",
  "archivePath": "/comics/",
  "detailPrefix": "manga",
  "pageSize": 12,
  "referer": true,
  "imageHeaders": false,
  "genres": "checkbox",
  "coverUpgrade": [
    "110x150",
    ""
  ],
  "feeds": [
    {
      "id": "latest",
      "name": "Latest"
    },
    {
      "id": "new-manga",
      "name": "New"
    },
    {
      "id": "alphabet",
      "name": "A-Z"
    },
    {
      "id": "rating",
      "name": "Rating"
    },
    {
      "id": "views",
      "name": "Most Views"
    }
  ]
};
const SITE_BASE = CONFIG.origin;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const RELATIVE_UNIT_MS = {
  sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  min: 60000, mins: 60000, minute: 60000, minutes: 60000,
  hour: 3600000, hours: 3600000,
  day: 86400000, days: 86400000,
  week: 604800000, weeks: 604800000,
  month: 2592000000, months: 2592000000,
  year: 31536000000, years: 31536000000,
};
const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const ADULT_GENRE = /^(adult|hentai|smut|erotica|nsfw|18\+|mature romance|sexual content)$/i;
const SUGGESTIVE_GENRE = /^(mature|ecchi|borderline h)$/i;

function fixMojibake(text) {
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}

function withImageAuth(target) {
  if (CONFIG.imageHeaders) target.headers = { 'User-Agent': UA, Referer: SITE_BASE + '/' };
  else if (CONFIG.referer) target.referer = SITE_BASE + '/';
  return target;
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing') || s.includes('releasing') || s.includes('updating')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished') || s.includes('ended')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('on hold') || s.includes('paused')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('discontinued')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return undefined;
  let m = /^(\d+)\s*([a-z]+)\s+ago$/.exec(t);
  if (m && RELATIVE_UNIT_MS[m[2]] !== undefined) return Date.now() - parseInt(m[1], 10) * RELATIVE_UNIT_MS[m[2]];
  if (/^(just now|today)$/.test(t)) return Date.now();
  if (t === 'yesterday') return Date.now() - 86400000;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(t);
  if (m && MONTHS[m[1]] !== undefined) return Date.UTC(+m[3], MONTHS[m[1]], +m[2]);
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/.exec(t);
  if (m && MONTHS[m[2]] !== undefined) return Date.UTC(+m[3], MONTHS[m[2]], +m[1]);
  return undefined;
}

function chapterNumberOf(slug, name) {
  const fromSlug = /(?:^|[-_/])(?:chapter|ch|episode|ep|capitulo|cap)[-_ ]?(\d+)(?:[-_.](\d+))?(?:$|[-_/])/i.exec(slug);
  if (fromSlug) return parseFloat(fromSlug[1] + (fromSlug[2] ? '.' + fromSlug[2] : ''));
  const fromName = /(\d+(?:\.\d+)?)/.exec(name || '');
  if (fromName) return parseFloat(fromName[1]);
  const anyNum = /(\d+)(?:[-_.](\d+))?/.exec(slug);
  if (anyNum) return parseFloat(anyNum[1] + (anyNum[2] ? '.' + anyNum[2] : ''));
  return 0;
}

function idFromHref(href) {
  const path = (href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return '';
  const prefix = parts[0];
  const slug = parts[1];
  return prefix === CONFIG.detailPrefix ? slug : `${prefix}~${slug}`;
}

function detailUrlOf(mangaId) {
  const at = String(mangaId).indexOf('~');
  const prefix = at < 0 ? CONFIG.detailPrefix : mangaId.slice(0, at);
  const slug = at < 0 ? mangaId : mangaId.slice(at + 1);
  return `${SITE_BASE}/${encodeURIComponent(prefix)}/${encodeURIComponent(slug)}/`;
}

function absolute(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
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
  let pick = (best ? best.url : direct).trim();
  if (/^data:/.test(pick) || /\/(dflazy|lazy|placeholder)[^/]*\.(gif|png|jpe?g|svg)$/i.test(pick)) pick = direct.trim();
  if (CONFIG.coverUpgrade) pick = pick.replace('-' + CONFIG.coverUpgrade[0] + '.', CONFIG.coverUpgrade[1] ? '-' + CONFIG.coverUpgrade[1] + '.' : '.');
  return absolute(pick);
}

function findFieldContent($, label) {
  let found = null;
  $('.post-content_item').each((_, el) => {
    const heading = cleanText($(el).find('.summary-heading h5, .summary-heading').first().text()).replace(/[:：]$/, '');
    if (heading.toLowerCase() === label.toLowerCase()) {
      found = $(el).find('.summary-content').first();
      return false;
    }
  });
  return found;
}

function fieldText($, label) {
  const el = findFieldContent($, label);
  if (!el) return '';
  const anchors = el.find('a');
  if (anchors.length > 0) {
    const parts = [];
    anchors.each((_, a) => {
      const t = cleanText($(a).text());
      if (t) parts.push(t);
    });
    if (parts.length > 0) return parts.join(', ');
  }
  return cleanText(el.text());
}

function chipValue($, label) {
  let found = '';
  $('.asura-chip').each((_, el) => {
    if (found) return;
    const chip = $(el);
    const name = cleanText(chip.find('.chip-label').first().text()).replace(/[:：]$/, '');
    if (name.toLowerCase() !== label.toLowerCase()) return;
    const inner = chip.find('.author-name-text').first();
    found = cleanText((inner.length ? inner : chip.find('.chip-val').first()).text());
  });
  return found;
}

function fixPageUrl(url) {
  return String(url).replace(/^(https?:\/\/cdn2\.cocomic\.co)\/+(?:www\/+wwwroot\/+)*/i, '$1/www/wwwroot/');
}

function parseAsuraGrid($) {
  const results = [];
  const seen = new Set();
  $('.asura-card').each((_, el) => {
    const card = $(el);
    const link = card.find('a.asura-card-title, .asura-card-poster a').first();
    const mangaId = idFromHref(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('a.asura-card-title').first().text()) || cleanText(link.attr('title')) || cleanText(link.attr('aria-label'));
    if (!title) return;
    seen.add(mangaId);
    const img = card.find('.asura-card-poster img').first();
    const manga = { mangaId, title, image: absolute(img.attr('data-src') || img.attr('src') || ''), medium: 'comics' };
    withImageAuth(manga);
    manga.webURL = detailUrlOf(mangaId);
    results.push(manga);
  });
  return results;
}

function parseGrid($) {
  const asura = parseAsuraGrid($);
  if (asura.length > 0) return asura;
  const results = [];
  const seen = new Set();
  $('.page-item-detail').each((_, el) => {
    const card = $(el);
    const link = card.find('.item-thumb a, a').first();
    const mangaId = idFromHref(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('.post-title a').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    const manga = { mangaId, title, image: coverFrom(link.find('img').first()), medium: 'comics' };
    withImageAuth(manga);
    manga.webURL = detailUrlOf(mangaId);
    if (cleanText(card.find('.manga-title-badges').first().text()).toLowerCase() === 'completed') manga.completed = true;
    results.push(manga);
  });
  return results;
}

function parseSearch($) {
  const results = [];
  const seen = new Set();
  $('.c-tabs-item__content').each((_, el) => {
    const card = $(el);
    const link = card.find('.tab-thumb a, a').first();
    const mangaId = idFromHref(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('.post-title a').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    const manga = { mangaId, title, image: coverFrom(link.find('img').first()), medium: 'comics' };
    withImageAuth(manga);
    manga.webURL = detailUrlOf(mangaId);
    const author = cleanText(card.find('.mg_author .summary-content').first().text());
    if (author) manga.author = author;
    results.push(manga);
  });
  return results.length > 0 ? results : parseGrid($);
}

function hasNextLink($) {
  return $('a.nextpostslink, a.next.page-numbers, .pagination a[rel="next"], link[rel="next"], .nav-previous a').length > 0;
}

class Source {
  getSourceFeeds() {
    return CONFIG.feeds.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (CONFIG.genres === 'none') return [];
    try {
      const tags = [];
      const seen = new Set();
      if (CONFIG.genres === 'links') {
        const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}${CONFIG.archivePath}`));
        $('a[href*="-genre/"]').each((_, el) => {
          const slug = ((($(el).attr('href') || '').split(/[?#]/)[0]).split('/').filter(Boolean).pop() || '').trim();
          const label = cleanText($(el).clone().children().remove().end().text()) || cleanText($(el).text());
          if (!slug || !label || seen.has(slug)) return;
          seen.add(slug);
          tags.push({ id: slug, label: label.replace(/\s*\(\d+\)\s*$/, '') });
        });
        return tags;
      }
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/?s=&post_type=wp-manga`));
      const labels = {};
      $('label[for]').each((_, el) => {
        labels[$(el).attr('for')] = cleanText($(el).text());
      });
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        if (!id || seen.has(id)) return;
        const label = labels[$(el).attr('id')] || cleanText($(el).parent().text());
        if (label) {
          seen.add(id);
          tags.push({ id, label });
        }
      });
      return tags;
    } catch (e) {
      console.error(CONFIG.name + ' getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = (request && request.feed) || CONFIG.feeds[0].id;
    const page = (metadata && metadata.page) || 1;

    let url;
    let parse;
    if (query || tags.length > 0) {
      const path = page > 1 ? `/page/${page}/` : '/';
      let qs = `s=${encodeURIComponent(query)}&post_type=wp-manga`;
      tags.forEach((t) => (qs += `&genre[]=${encodeURIComponent(t.id)}`));
      url = `${SITE_BASE}${path}?${qs}`;
      parse = parseSearch;
    } else {
      const base = CONFIG.archivePath;
      const path = page > 1 ? `${base}page/${page}/` : base;
      url = `${SITE_BASE}${path}?m_orderby=${encodeURIComponent(feed)}`;
      parse = parseGrid;
    }

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parse($);
    const more = results.length > 0 && (hasNextLink($) || ($('.asura-card').length === 0 && results.length >= CONFIG.pageSize));
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleBlock = $('.post-title').first().clone();
    titleBlock.find('.manga-title-badges, span').remove();
    const title =
      cleanText($('h1.asura-series-title').first().text()) ||
      cleanText(titleBlock.find('h1').first().text()) ||
      cleanText($('h1').first().text()) ||
      mangaId;

    const image = absolute(
      $('meta[property="og:image"]').attr('content') ||
        $('.asura-poster-img').first().attr('src') ||
        coverFrom($('.summary_image img').first()),
    );

    const author = chipValue($, 'Author') || fieldText($, 'Author(s)') || fieldText($, 'Author');
    const artist = chipValue($, 'Artist') || fieldText($, 'Artist(s)') || fieldText($, 'Artist');
    const people = [];
    [author, artist].forEach((s) => s.split(',').forEach((n) => {
      const t = cleanText(n);
      if (t && !/^(updating|n\/a|unknown|none|tba|-|\?)$/i.test(t) && people.indexOf(t) < 0) people.push(t);
    }));

    const descParts = [];
    $('#synopsisContent p, .summary__content p, .description-summary .summary__content p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && descParts.indexOf(t) < 0) descParts.push(t);
    });
    const desc =
      descParts.length > 0
        ? descParts.join('\n\n')
        : cleanText($('#synopsisContent').first().text()) || cleanText($('.summary__content').first().text());

    const tags = [];
    $('.asura-genres-row .asura-genre-tag').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });
    const genreContent = tags.length > 0 ? null : findFieldContent($, 'Genre(s)') || findFieldContent($, 'Genres');
    if (genreContent) {
      genreContent.find('a').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) tags.push(t);
      });
    }

    const status = mapStatus(cleanText($('.asura-badge-status').first().text()) || fieldText($, 'Status'));
    const info = {
      title,
      image,
      author: people.join(', '),
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    withImageAuth(info);
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async chapterApiRows(mangaId) {
    const slug = mangaId.slice(mangaId.indexOf('~') + 1);
    const rows = [];
    let last = 1;
    for (let page = 1; page <= last; page++) {
      const json = JSON.parse(await this.requestHTML(`${SITE_BASE}/api/comics/${encodeURIComponent(slug)}/chapters?per_page=100&page=${page}`, 'GET', undefined, true));
      const data = (json && json.data) || {};
      last = typeof data.last_page === 'number' ? data.last_page : 1;
      (data.chapters || []).forEach((c) => {
        if (!c || !c.chapter_slug) return;
        rows.push({
          id: c.chapter_slug,
          slug: c.chapter_slug,
          name: cleanText(c.chapter_name) || c.chapter_slug,
          number: typeof c.chapter_num === 'number' ? c.chapter_num : undefined,
          time: c.updated_at ? Date.parse(c.updated_at) || undefined : undefined,
        });
      });
      if (!data.chapters || data.chapters.length === 0) break;
    }
    return rows;
  }

  async getChapters(mangaId) {
    if (CONFIG.chapterApi) {
      const apiRows = await this.chapterApiRows(mangaId);
      apiRows.reverse();
      let lastNumber = -Infinity;
      return apiRows.map((r) => {
        let number = r.number !== undefined ? r.number : chapterNumberOf(r.slug, r.name);
        if (number <= lastNumber) number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
        lastNumber = number;
        const chapter = { id: r.id, chapterId: r.id, name: r.name, number };
        if (r.time !== undefined) chapter.time = r.time;
        return chapter;
      });
    }
    const url = detailUrlOf(mangaId);
    const html = await this.requestHTML(url);
    let $ = cheerio.load(html);
    let rows = this.chapterRows($, url);

    if (rows.length === 0) {
      const holder = $('#manga-chapters-holder').attr('data-id') || $('[data-id]').first().attr('data-id') || '';
      try {
        const fragment = await this.requestHTML(`${url}ajax/chapters/`, 'POST');
        rows = this.chapterRows(cheerio.load(fragment), url);
      } catch (e) {
        rows = [];
      }
      if (rows.length === 0 && holder) {
        try {
          const fragment = await this.requestHTML(`${SITE_BASE}/wp-admin/admin-ajax.php`, 'POST', `action=manga_get_chapters&manga=${encodeURIComponent(holder)}`);
          rows = this.chapterRows(cheerio.load(fragment), url);
        } catch (e) {
          rows = [];
        }
      }
    }

    rows.reverse();
    const items = rows.map((r, i) => ({ r, i, number: chapterNumberOf(r.slug, r.name) }));
    if (items.some((it, k) => k > 0 && it.number < items[k - 1].number)) {
      items.sort((a, b) => a.number - b.number || a.i - b.i);
    }
    let last = -Infinity;
    return items.map((it) => {
      const r = it.r;
      let number = it.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const chapter = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  chapterRows($, detailUrl) {
    const prefix = detailUrl.replace(/^https?:\/\/[^/]+/i, '');
    const rows = [];
    const seen = new Set();
    let cards = $('.asura-chap-card').toArray();
    const own = parseInt($('.chapters-count-badge').first().text(), 10);
    if (own > 0 && own < cards.length) cards = cards.slice(0, own);
    cards.forEach((el) => {
      const $el = $(el);
      const href = ($el.attr('data-href') || $el.find('a').first().attr('href') || '').trim();
      if (!href || href === '#') return;
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
      if (path.indexOf(prefix) !== 0) return;
      const rest = path.slice(prefix.length).replace(/\/+$/, '');
      if (!rest || seen.has(rest)) return;
      seen.add(rest);
      const name = cleanText($el.find('.chap-name').first().text()) || rest;
      const seconds = parseInt($el.attr('data-time') || '', 10);
      rows.push({ id: rest.replace(/\//g, '~'), slug: rest, name, time: seconds > 0 ? seconds * 1000 : parseReleaseDate($el.find('.chap-time').first().text()) });
    });
    if (rows.length > 0) return rows;
    $('li.wp-manga-chapter').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first();
      const href = (link.attr('href') || '').trim();
      if (!href || href === '#') return;
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
      if (path.indexOf(prefix) !== 0) return;
      const rest = path.slice(prefix.length).replace(/\/+$/, '');
      if (!rest || seen.has(rest)) return;
      seen.add(rest);
      const name = cleanText(link.text()) || rest;
      const dateText = cleanText($el.find('.chapter-release-date').first().text());
      rows.push({ id: rest.replace(/\//g, '~'), slug: rest, name, time: dateText ? parseReleaseDate(dateText) : undefined });
    });
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${detailUrlOf(mangaId)}${String(chapterId).split('~').map(encodeURIComponent).join('/')}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const pages = [];
    const seen = new Set();
    $('img.asura-webtoon-slice, img.wp-manga-chapter-img, .reading-content img, .page-break img').each((_, el) => {
      const e = $(el);
      const src = (e.attr('data-src') || e.attr('data-lazy-src') || e.attr('data-cfsrc') || e.attr('src') || '').trim();
      if (!src || /^data:/.test(src)) return;
      const page = fixPageUrl(absolute(src));
      if (seen.has(page)) return;
      seen.add(page);
      pages.push(page);
    });
    if (pages.length === 0) throw new Error(CONFIG.name + ' returned no pages for this chapter');
    const details = { id: chapterId, mangaId, pages };
    withImageAuth(details);
    return details;
  }

  async requestHTML(url, method, body, json) {
    const manager = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
    const headers = { 'User-Agent': UA };
    if (json) {
      headers.Accept = 'application/json';
      headers.Referer = SITE_BASE + '/';
    }
    if (method === 'POST') {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers.Referer = SITE_BASE + '/';
      if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    const request = App.createRequest({ url, method: method || 'GET', headers, body });
    let response = await manager.schedule(request);
    const again = ['no-cache', 'max-age=0'];
    for (let i = 0; i < again.length && (!method || method === 'GET') && (response.status === 502 || response.status === 503 || response.status === 504); i++) {
      const retryHeaders = Object.assign({}, headers, { 'Cache-Control': again[i] });
      response = await manager.schedule(App.createRequest({ url, method: 'GET', headers: retryHeaders }));
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request (a locked chapter, or a block on plain requests)`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return fixMojibake(response.data);
  }
}

module.exports = { Source };
