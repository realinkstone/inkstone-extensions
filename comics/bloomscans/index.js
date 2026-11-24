const CONFIG = {
  "name": "BloomScans",
  "origin": "https://bloomscans.com",
  "archivePath": "/series/",
  "referer": true,
  "imageHeaders": false,
  "genres": "checkbox",
  "feeds": [
    { "id": "popular", "name": "Popular" },
    { "id": "update", "name": "Latest Updates" },
    { "id": "latest", "name": "Newly Added" },
    { "id": "title", "name": "A-Z" }
  ]
};
const SITE_BASE = CONFIG.origin;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const RELATIVE_UNIT_MS = {
  sec: 1000, secs: 1000, second: 1000, seconds: 1000, seg: 1000, segundo: 1000, segundos: 1000,
  min: 60000, mins: 60000, minute: 60000, minutes: 60000, minuto: 60000, minutos: 60000,
  hour: 3600000, hours: 3600000, hora: 3600000, horas: 3600000,
  day: 86400000, days: 86400000, dia: 86400000, dias: 86400000, 'día': 86400000, 'días': 86400000,
  week: 604800000, weeks: 604800000, semana: 604800000, semanas: 604800000,
  month: 2592000000, months: 2592000000, mes: 2592000000, meses: 2592000000,
  year: 31536000000, years: 31536000000, ano: 31536000000, anos: 31536000000, 'año': 31536000000, 'años': 31536000000,
};
const MONTHS = {
  jan: 0, january: 0, ene: 0, enero: 0,
  feb: 1, february: 1, febrero: 1,
  mar: 2, march: 2, marzo: 2,
  apr: 3, april: 3, abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, junio: 5,
  jul: 6, july: 6, julio: 6,
  aug: 7, august: 7, ago: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8, setiembre: 8,
  oct: 9, october: 9, octubre: 9,
  nov: 10, november: 10, noviembre: 10,
  dec: 11, december: 11, dic: 11, diciembre: 11,
};

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn|mature romance|sexual content|contenido sexual)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|borderline h)$/i;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing') || s.includes('releasing') || s.includes('updating') || s.includes('en curso') || s.includes('emisi') || s.includes('publicand') || s.includes('activo')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished') || s.includes('ended') || s.includes('finaliz') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('on hold') || s.includes('paused') || s.includes('pausa')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('discontinued') || s.includes('abandonad')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return undefined;
  let m = /^(\d+)\s*([a-záéíóúñ]+)\s+ago$/.exec(t);
  if (m && RELATIVE_UNIT_MS[m[2]] !== undefined) return Date.now() - parseInt(m[1], 10) * RELATIVE_UNIT_MS[m[2]];
  m = /^hace\s+(\d+)\s*([a-záéíóúñ]+)$/.exec(t);
  if (m && RELATIVE_UNIT_MS[m[2]] !== undefined) return Date.now() - parseInt(m[1], 10) * RELATIVE_UNIT_MS[m[2]];
  if (/^(just now|today|hoy|ahora)$/.test(t)) return Date.now();
  if (/^(yesterday|ayer)$/.test(t)) return Date.now() - 86400000;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^([a-záéíóúñ]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(?:de\s+)?(\d{4})$/.exec(t);
  if (m && MONTHS[m[1]] !== undefined) return Date.UTC(+m[3], MONTHS[m[1]], +m[2]);
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:de\s+)?([a-záéíóúñ]+)\.?,?\s+(?:de\s+)?(\d{4})$/.exec(t);
  if (m && MONTHS[m[2]] !== undefined) return Date.UTC(+m[3], MONTHS[m[2]], +m[1]);
  return undefined;
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

function idFromHref(href) {
  const path = (href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : '';
}

function detailUrlOf(mangaId) {
  let clean = mangaId;
  try { clean = decodeURIComponent(mangaId); } catch (e) {}
  return `${SITE_BASE}${CONFIG.archivePath}${encodeURIComponent(clean)}/`;
}

function parseGrid($) {
  const results = [];
  const seen = new Set();
  $('.listupd .bsx, .bs .bsx').each((_, el) => {
    const card = $(el);
    const link = card.find('a').first();
    const mangaId = idFromHref(link.attr('href'));
    if (!mangaId || mangaId === 'list-mode' || seen.has(mangaId)) return;
    const title = cleanText(card.find('.tt').first().text()) || cleanText(link.attr('title'));
    if (!title || /\bnovela\b|\bnovel\b/i.test(title) || card.find('.novelabel, .type.Novel, .novel').length > 0) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image: coverFrom(card.find('img').first()),
      referer: SITE_BASE + '/',
      medium: 'comics',
      webURL: detailUrlOf(mangaId),
    });
  });
  return results;
}

function hasNext($) {
  return $('.hpage a.r, .pagination a.next, a.next.page-numbers, .pagination a[rel="next"]').length > 0;
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return CONFIG.feeds.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}${CONFIG.archivePath}`);
      const $ = cheerio.load(html);
      const groups = new Map();
      const labels = {};
      $('label[for]').each((_, el) => {
        labels[$(el).attr('for')] = cleanText($(el).text());
      });
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        const label = labels[$(el).attr('id')] || cleanText($(el).parent().text());
        if (!id || !label) return;
        const key = label.toLowerCase();
        const group = groups.get(key) || { label, ids: [] };
        if (group.ids.indexOf(id) < 0) group.ids.push(id);
        groups.set(key, group);
      });
      return [...groups.values()].map((g) => ({ id: g.ids.join(','), label: g.label }));
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
    if (query) {
      url = `${SITE_BASE}/page/${page}/?s=${encodeURIComponent(query)}`;
    } else {
      let qs = `page=${page}&order=${encodeURIComponent(feed)}`;
      tags.forEach((t) => String(t.id).split(',').forEach((id) => (qs += `&genre[]=${encodeURIComponent(id)}`)));
      url = `${SITE_BASE}${CONFIG.archivePath}?${qs}`;
    }

    let html;
    try {
      html = await this.requestHTML(url);
    } catch (e) {
      if (page > 1) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const results = parseGrid($);
    return { results, metadata: results.length > 0 && hasNext($) ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(detailUrlOf(mangaId));
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const title = cleanText($('.lrs-title, h1.entry-title, h1').first().text()) || mangaId;
    const image = absolute(coverFrom($('img.lrs-cover, .thumb img').first()) || $('meta[property="og:image"]').attr('content'));
    const desc = cleanText($('.lrs-syn-wrap, .entry-content[itemprop="description"], .synp .entry-content').first().text()) || title;

    const tags = [];
    $('.lrs-genre, .genxed a, .mgen a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    let statusText = '';
    let author = '';
    $('.lrs-infotable tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length >= 2) {
        const k = cleanText(cells.first().text()).toLowerCase();
        const v = cleanText(cells.last().text());
        if (k.includes('status') || k.includes('estado')) statusText = v;
        if ((k.includes('author') || k.includes('autor')) && v && v !== '-') author = v;
      }
    });
    const status = mapStatus(statusText);

    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author,
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $('#lrs-native-chapterlist li, #chapterlist li, .eplister li').each((_, el) => {
      const li = $(el);
      const link = li.find('a').first();
      const href = (link.attr('href') || '').trim();
      if (!href || href.charAt(0) === '#') return;
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
      if (!path || seen.has(path)) return;
      seen.add(path);
      const name = cleanText(li.find('.chapternum').first().text()) || cleanText(link.text()) || path;
      const dataNum = parseFloat(li.attr('data-num'));
      const fromName = /(\d+(?:\.\d+)?)/.exec(name);
      rows.push({
        id: path.replace(/\//g, '~'),
        name,
        number: Number.isFinite(dataNum) ? dataNum : fromName ? parseFloat(fromName[1]) : 0,
        time: parseReleaseDate(li.find('.chapterdate').first().text()),
      });
    });
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const chapter = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const parts = String(chapterId).split('~').map((p) => {
      let clean = p;
      try { clean = decodeURIComponent(p); } catch (e) {}
      return encodeURIComponent(clean);
    });
    const url = `${SITE_BASE}/${parts.join('/')}/`;
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'POST',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`BloomScans HTTP ${response.status}`);
    const html = response.data;
    let pages = [];
    const m = /ts_reader\.run\((\{[\s\S]*?\})\)\s*;/.exec(html);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const source = (data.sources || [])[0];
        pages = ((source && source.images) || []).map((u) => absolute(u)).filter(Boolean);
      } catch (e) {
        pages = [];
      }
    }
    if (pages.length === 0) {
      const $ = cheerio.load(html);
      const seen = new Set();
      $('#readerarea img').each((_, el) => {
        const e = $(el);
        const src = (e.attr('data-src') || e.attr('data-lazy-src') || e.attr('src') || '').trim();
        if (!src || /^data:/.test(src) || seen.has(src)) return;
        seen.add(src);
        pages.push(absolute(src));
      });
    }
    if (pages.length === 0) throw new Error('BloomScans returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`BloomScans HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
