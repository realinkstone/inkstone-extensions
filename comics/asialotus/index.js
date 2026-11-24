const CONFIG = {
  "name": "AsiaLotus",
  "origin": "https://asialotuss.com",
  "archivePath": "/manga/",
  "referer": true,
  "imageHeaders": false,
  "genres": "checkbox",
  "feeds": [
    {
      "id": "update",
      "name": "Latest Updates"
    },
    {
      "id": "popular",
      "name": "Popular"
    },
    {
      "id": "latest",
      "name": "Newly Added"
    },
    {
      "id": "title",
      "name": "A-Z"
    }
  ]
};
const SITE_BASE = CONFIG.origin;
const SEARCH_BASE = CONFIG.siteBase || CONFIG.origin;
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
  if (s.includes('ongoing') || s.includes('releasing') || s.includes('updating') || s.includes('en curso') || s.includes('emisi') || s.includes('publicand') || s.includes('publicánd') || s.includes('activo')) return 'ONGOING';
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
  const srcset = $img.attr('data-srcset') || $img.attr('srcset') || '';
  let best = null;
  srcset.split(',').forEach((part) => {
    const m = /^\s*(\S+)\s+(\d+)w\s*$/.exec(part);
    if (m && Number(m[2]) <= 400 && (!best || Number(m[2]) > best.width)) best = { url: m[1], width: Number(m[2]) };
  });
  const direct = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
  let pick = (best ? best.url : direct).trim();
  if (/^data:/.test(pick) || /\/(dflazy|lazy|placeholder)[^/]*\.(gif|png|jpe?g|svg)$/i.test(pick)) pick = direct.trim();
  if (/^https?:\/\/i\d\.wp\.com\//i.test(pick) && pick.indexOf('?') < 0) pick += '?w=300';
  return absolute(pick);
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
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('.tt').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    const manga = { mangaId, title, image: coverFrom(card.find('img').first()), medium: 'comics', webURL: detailUrlOf(mangaId) };
    withImageAuth(manga);
    results.push(manga);
  });
  return results;
}

function hasNext($) {
  return $('.hpage a.r, .pagination a.next, a.next.page-numbers, .pagination a[rel="next"]').length > 0;
}

function infoField($, labels) {
  const list = Array.isArray(labels) ? labels : [labels];
  let found = '';
  $('.imptdt, .fmed, .spe span').each((_, el) => {
    const node = $(el).clone();
    const value = cleanText(node.find('i, a, b + *').first().text());
    node.find('i').remove();
    const name = cleanText(node.text()).replace(/[:：]$/, '').toLowerCase();
    for (let i = 0; i < list.length; i++) {
      const label = list[i].toLowerCase();
      if (name.indexOf(label) === 0) {
        found = value || cleanText($(el).text().replace(new RegExp('^\\s*' + list[i] + '\\s*:?', 'i'), ''));
        return false;
      }
    }
  });
  return found.toLowerCase() === 'n/a' || found === '-' ? '' : found;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function dataScripts(html) {
  const out = [];
  const re = /src=["']data:text\/javascript;base64,([A-Za-z0-9+\/=]+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    let text = '';
    let bits = 0;
    let acc = 0;
    for (let i = 0; i < m[1].length; i++) {
      const v = B64.indexOf(m[1].charAt(i));
      if (v < 0) continue;
      acc = ((acc << 6) | v) & 0xffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        text += String.fromCharCode((acc >> bits) & 255);
      }
    }
    out.push(text);
  }
  return out.join('\n');
}

class Source {
  constructor() {
    this.pageCache = new Map();
  }

  getSourceFeeds() {
    return CONFIG.feeds.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (CONFIG.genres === 'none') return [];
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
    if (query) {
      url = `${SEARCH_BASE}${page > 1 ? `/page/${page}/` : '/'}?s=${encodeURIComponent(query)}`;
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
    const title = cleanText($('h1.entry-title').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute(coverFrom($('.thumb img').first()) || $('meta[property="og:image"]').attr('content'));

    const tags = [];
    $('.genxed a, .mgen a, .seriestugenre a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const paragraphs = [];
    $('.entry-content[itemprop="description"] p, .synp .entry-content p, .entry-content.entry-content-single p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) paragraphs.push(t);
    });
    if (paragraphs.length === 0) {
      const fallback = cleanText($('.entry-content[itemprop="description"], .synp .entry-content').first().text());
      if (fallback) paragraphs.push(fallback);
    }

    const people = [];
    [infoField($, ['Author', 'Autor']), infoField($, ['Artist', 'Artista'])].forEach((s) => s.split(',').forEach((n) => {
      const t = cleanText(n);
      if (t && !/^(updating|n\/a|unknown|none|-|\?|desconocido)$/i.test(t) && people.indexOf(t) < 0) people.push(t);
    }));
    const status = mapStatus(infoField($, ['Status', 'Estado']));
    const released = infoField($, ['Released', 'Publicado', 'Lanzamiento', 'Año']);
    const info = {
      title,
      image,
      author: people.join(', '),
      desc: paragraphs.join('\n\n'),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (/^\d{4}$/.test(released)) info.releaseDate = released;
    withImageAuth(info);
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.titleHtml(mangaId));
    const rows = [];
    const seen = new Set();
    $('#chapterlist li, .eplister li').each((_, el) => {
      const li = $(el);
      const link = li.find('a').first();
      const href = (link.attr('href') || '').trim();
      if (!href || href.charAt(0) === '#') return;
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
      if (!path || seen.has(path)) return;
      seen.add(path);
      const name = cleanText(li.find('.chapternum').first().text()) || cleanText(link.text()) || path;
      const locked = li.find('.premium-lock, .fa-lock, .text-gold').length > 0;
      const dataNum = parseFloat(li.attr('data-num'));
      const fromName = /(\d+(?:\.\d+)?)/.exec(name);
      rows.push({
        id: path.replace(/\//g, '~'),
        name: locked ? `${name} (Locked)` : name,
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
    const html = await this.requestHTML(url);
    let pages = [];
    let m = /ts_reader\.run\((\{[\s\S]*?\})\)\s*;/.exec(html);
    if (!m) m = /ts_reader\.run\((\{[\s\S]*?\})\)\s*;/.exec(dataScripts(html));
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
    if (pages.length === 0) {
      if (/post-password-form|premium-lock|contrase/i.test(html)) {
        throw new Error(CONFIG.name + ' HTTP 403: this chapter is locked');
      }
      throw new Error(CONFIG.name + ' returned no pages for this chapter');
    }
    const details = { id: chapterId, mangaId, pages };
    withImageAuth(details);
    return details;
  }

  async requestHTML(url) {
    const manager = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
    const request = App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return fixMojibake(response.data);
  }
}

module.exports = { Source };
