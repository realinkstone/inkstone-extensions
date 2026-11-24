const CONFIG = {
  "name": "Seraphic Deviltry",
  "origin": "https://spanish.seraphic-deviltry.com",
  "archivePath": "/manga/",
  "detailPrefix": "manga",
  "pageSize": 10,
  "referer": true,
  "imageHeaders": false,
  "genres": "checkbox",
  "adult": true,
  "feeds": [
    { "id": "latest", "name": "Latest" },
    { "id": "new-manga", "name": "New" },
    { "id": "views", "name": "Most Views" },
    { "id": "trending", "name": "Trending" }
  ]
};
const SITE_BASE = CONFIG.origin;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function plain(text) {
  let t = String(text == null ? '' : text).toLowerCase();
  try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return t.replace(/\u0131/g, 'i').replace(/\s+/g, ' ').trim();
}

const UNIT_WORDS = [
  [1000, ['sec', 'seg']],
  [60000, ['min']],
  [3600000, ['hour', 'hr', 'hora']],
  [86400000, ['day', 'dia']],
  [604800000, ['week', 'sem']],
  [2592000000, ['month', 'mes']],
  [31536000000, ['year', 'ano']],
];

function unitMs(word) {
  const w = plain(word);
  if (!w) return undefined;
  let best = null;
  UNIT_WORDS.forEach(([ms, stems]) => {
    stems.forEach((stem) => {
      const ok = stem.length <= 2 ? w === stem || w === stem + 's' : w.indexOf(stem) === 0;
      if (ok && (!best || stem.length > best.len)) best = { ms, len: stem.length };
    });
  });
  return best ? best.ms : undefined;
}

const MONTH_NAMES = {
  jan: 0, january: 0, ene: 0, enero: 0,
  feb: 1, february: 1, febrero: 1,
  mar: 2, march: 2, marzo: 2,
  apr: 3, april: 3, abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, junio: 5,
  jul: 6, july: 6, julio: 6,
  aug: 7, august: 7, ago: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8,
  oct: 9, october: 9, octubre: 9,
  nov: 10, november: 10, noviembre: 10,
  dec: 11, december: 11, dic: 11, diciembre: 11,
};

function parseReleaseDate(text) {
  const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!raw) return undefined;
  const t = plain(raw).replace(/\s*,\s*/g, ' ').replace(/\bde\b|\bdel\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(just now|today|now|hoy|ahora)$/.test(t)) return Date.now();
  if (/^(yesterday|ayer)$/.test(t)) return Date.now() - 86400000;
  let m = /(\d+)\s*([^\d\s.,]+)/.exec(t);
  if (m && /\b(ago|atras|hace)\b/.test(t)) {
    const ms = unitMs(m[2]);
    if (ms !== undefined) return Date.now() - parseInt(m[1], 10) * ms;
  }
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(t);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return Number(m[2]) > 12 ? Date.UTC(year, Number(m[1]) - 1, Number(m[2])) : Date.UTC(year, Number(m[2]) - 1, Number(m[1]));
  }
  m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^([^\d\s.]+)\.? (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/.exec(t);
  if (m && MONTH_NAMES[m[1]] !== undefined) return Date.UTC(+m[3], MONTH_NAMES[m[1]], +m[2]);
  m = /^(\d{1,2})(?:st|nd|rd|th|\.)? ([^\d\s.]+)\.? (\d{4})$/.exec(t);
  if (m && MONTH_NAMES[m[2]] !== undefined) return Date.UTC(+m[3], MONTH_NAMES[m[2]], +m[1]);
  return undefined;
}

function cleanText(text) {
  return (text || '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing') || s.includes('en curso') || s.includes('emisi') || s.includes('publicand') || s.includes('activo')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finaliz') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('pausa')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonad')) return 'CANCELLED';
  return 'UNKNOWN';
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
  return parts[0] === CONFIG.detailPrefix ? parts[1] : `${parts[0]}~${parts[1]}`;
}

function seg(piece) {
  let text = String(piece);
  try { text = decodeURIComponent(text); } catch (e) {}
  return encodeURIComponent(text);
}

function detailUrlOf(mangaId) {
  const at = String(mangaId).indexOf('~');
  const prefix = at < 0 ? CONFIG.detailPrefix : mangaId.slice(0, at);
  const slug = at < 0 ? mangaId : mangaId.slice(at + 1);
  return `${SITE_BASE}/${seg(prefix)}/${seg(slug)}/`;
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
  const direct = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
  return absolute(direct);
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

function parseGrid($) {
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
    results.push({
      mangaId,
      title,
      image: coverFrom(link.find('img').first()),
      referer: SITE_BASE + '/',
      webURL: detailUrlOf(mangaId),
      medium: 'comics',
      ageRating: 18,
    });
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
    results.push({
      mangaId,
      title,
      image: coverFrom(link.find('img').first()),
      referer: SITE_BASE + '/',
      webURL: detailUrlOf(mangaId),
      medium: 'comics',
      ageRating: 18,
    });
  });
  return results.length > 0 ? results : parseGrid($);
}

function hasNextLink($) {
  return $('a.nextpostslink, a.next.page-numbers, .pagination a[rel="next"], link[rel="next"], .nav-previous a').length > 0;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return CONFIG.feeds.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/?s=&post_type=wp-manga`));
      const labels = {};
      $('label[for]').each((_, el) => { labels[$(el).attr('for')] = cleanText($(el).text()); });
      const tags = [];
      const seen = new Set();
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        if (!id || seen.has(id)) return;
        const label = labels[$(el).attr('id')] || cleanText($(el).parent().text());
        if (label) { seen.add(id); tags.push({ id, label }); }
      });
      return tags;
    } catch (e) {
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
    try { html = await this.requestHTML(url); } catch (e) {
      if (page > 1) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parse($);
    const more = results.length > 0 && (hasNextLink($) || results.length >= CONFIG.pageSize);
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const titleBlock = $('.post-title').first().clone();
    titleBlock.find('.manga-title-badges, span').remove();
    const title = cleanText(titleBlock.find('h1').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('meta[property="og:image"]').attr('content') || coverFrom($('.summary_image img').first()));
    const author = fieldText($, 'Author(s)') || fieldText($, 'Author') || fieldText($, 'Autor(es)') || fieldText($, 'Autor');
    const artist = fieldText($, 'Artist(s)') || fieldText($, 'Artist') || fieldText($, 'Artista(s)') || fieldText($, 'Artista');
    const people = [];
    [author, artist].forEach((s) => s.split(',').forEach((n) => {
      const t = cleanText(n);
      if (t && !/^(updating|n\/a|unknown|none|-|\?)$/i.test(t) && people.indexOf(t) < 0) people.push(t);
    }));
    const descParts = [];
    $('.summary__content p, .description-summary .summary__content p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0 ? descParts.join('\n\n') : (cleanText($('.summary__content').first().text()) || title);
    const tags = [];
    const genreContent = findFieldContent($, 'Genre(s)') || findFieldContent($, 'Genres') || findFieldContent($, 'Género(s)') || findFieldContent($, 'Géneros');
    if (genreContent) {
      genreContent.find('a').each((_, el) => { const t = cleanText($(el).text()); if (t) tags.push(t); });
    }
    const status = mapStatus(fieldText($, 'Status') || fieldText($, 'Estado'));
    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE + '/',
        author: people.join(', '),
        desc,
        status,
        completed: status === 'COMPLETED',
        tags,
        webURL: url,
        medium: 'comics',
        ageRating: 18,
      },
    };
  }

  async getChapters(mangaId) {
    const url = detailUrlOf(mangaId);
    const html = await this.requestHTML(url);
    let rows = this.chapterRows(cheerio.load(html), url);
    if (rows.length === 0) {
      try {
        const fragment = await this.requestHTML(`${url}ajax/chapters/`, 'POST');
        rows = this.chapterRows(cheerio.load(fragment), url);
      } catch (e) { rows = []; }
    }
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = chapterNumberOf(r.slug, r.name);
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      return ch;
    });
  }

  chapterRows($, detailUrl) {
    const prefix = detailUrl.replace(/^https?:\/\/[^/]+/i, '');
    const rows = [];
    const seen = new Set();
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
    const url = `${detailUrlOf(mangaId)}${String(chapterId).split('~').map(seg).join('/')}/?style=list`;
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    const seen = new Set();
    $('img.wp-manga-chapter-img, .reading-content img, .page-break img').each((_, el) => {
      const e = $(el);
      const src = (e.attr('data-src') || e.attr('data-lazy-src') || e.attr('data-cfsrc') || e.attr('src') || '').trim();
      if (!src || /^data:/.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error('Seraphic Deviltry returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url, method, body) {
    const headers = { 'User-Agent': UA };
    if (method === 'POST') {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers.Referer = SITE_BASE + '/';
      if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    const response = await this.requests.schedule(App.createRequest({ url, method: method || 'GET', headers, body }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Seraphic Deviltry HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
