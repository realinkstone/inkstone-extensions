const CONFIG = {
  name: 'MHScans',
  origin: 'https://mhscans.com',
  referer: false,
  imageHeaders: false,
  rateLimit: { requestsPerSecond: 1 },
  feeds: [
    { id: 'updated', name: 'Latest' },
    { id: 'views', name: 'Most Views' },
    { id: 'rating', name: 'Rating' },
    { id: 'title', name: 'A-Z' },
  ],
};
const SITE_BASE = CONFIG.origin;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function plain(text) {
  let t = String(text == null ? '' : text).toLowerCase();
  try {
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (e) {
  }
  return t.replace(/\u0131/g, 'i').replace(/\s+/g, ' ').trim();
}

const UNIT_WORDS = [
  [1000, ['sec', 'seg', 'saniye', 'detik', 'giay', 'sekunde', 'ثانية', 'ثواني', 'ثوان', 'วินาที']],
  [60000, ['min', 'dakika', 'menit', 'phut', 'دقيقة', 'دقائق', 'دقايق', 'นาที']],
  [3600000, ['hour', 'hr', 'hora', 'heure', 'saat', 'jam', 'gio', 'stunde', 'ora', 'ore', 'ساعة', 'ساعات', 'ชั่วโมง']],
  [86400000, ['day', 'dia', 'jour', 'gun', 'hari', 'ngay', 'tag', 'giorn', 'يوم', 'أيام', 'ايام', 'วัน']],
  [604800000, ['week', 'sem', 'hafta', 'minggu', 'tuan', 'woche', 'settiman', 'أسبوع', 'اسبوع', 'أسابيع', 'اسابيع', 'สัปดาห์']],
  [2592000000, ['month', 'mes', 'mois', 'ay', 'bulan', 'thang', 'monat', 'mese', 'شهر', 'أشهر', 'اشهر', 'شهور', 'เดือน']],
  [31536000000, ['year', 'ano', 'an', 'yil', 'tahun', 'nam', 'jahr', 'anno', 'سنة', 'سنوات', 'عام', 'ปี']],
];

function unitMs(word) {
  const w = plain(word);
  if (!w) return undefined;
  let best = null;
  UNIT_WORDS.forEach(([ms, stems]) => {
    stems.forEach((stem) => {
      const ok = /^[a-z]+$/.test(stem) ? (stem.length <= 2 ? w === stem || w === stem + 's' : w.indexOf(stem) === 0) : w === stem || w.indexOf(stem) === 0;
      if (ok && (!best || stem.length > best.len)) best = { ms, len: stem.length };
    });
  });
  return best ? best.ms : undefined;
}

const MONTH_NAMES = {
  jan: 0, january: 0, ene: 0, enero: 0, janeiro: 0, janvier: 0, ocak: 0, januari: 0, januar: 0, gennaio: 0,
  feb: 1, february: 1, febrero: 1, fev: 1, fevereiro: 1, fevrier: 1, subat: 1, februari: 1, februar: 1, febbraio: 1,
  mar: 2, march: 2, marzo: 2, marco: 2, mars: 2, mart: 2, maret: 2, marz: 2,
  apr: 3, april: 3, abr: 3, abril: 3, avril: 3, nisan: 3, aprile: 3,
  may: 4, mayo: 4, maio: 4, mai: 4, mayis: 4, mei: 4, maggio: 4,
  jun: 5, june: 5, junio: 5, junho: 5, juin: 5, haziran: 5, juni: 5, giugno: 5,
  jul: 6, july: 6, julio: 6, julho: 6, juillet: 6, temmuz: 6, juli: 6, luglio: 6,
  aug: 7, august: 7, ago: 7, set: 8, agosto: 7, aout: 7, agustos: 7, agustus: 7, augustus: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8, setembro: 8, septembre: 8, eylul: 8, settembre: 8,
  oct: 9, october: 9, out: 9, octubre: 9, outubro: 9, octobre: 9, ekim: 9, oktober: 9, ottobre: 9, okt: 9,
  nov: 10, november: 10, noviembre: 10, novembro: 10, novembre: 10, kasim: 10,
  มกราคม: 0, กุมภาพันธ์: 1, มีนาคม: 2, เมษายน: 3, พฤษภาคม: 4, มิถุนายน: 5,
  กรกฎาคม: 6, สิงหาคม: 7, กันยายน: 8, ตุลาคม: 9, พฤศจิกายน: 10, ธันวาคม: 11,
  يناير: 0, فبراير: 1, مارس: 2, أبريل: 3, ابريل: 3, مايو: 4, يونيو: 5, يوليو: 6, أغسطس: 7, اغسطس: 7, سبتمبر: 8, أكتوبر: 9, اكتوبر: 9, نوفمبر: 10, ديسمبر: 11,
  января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
  dec: 11, december: 11, dic: 11, diciembre: 11, dez: 11, dezembro: 11, decembre: 11, aralik: 11, desember: 11, des: 11, dezember: 11, dicembre: 11,
};

const YESTERDAY = /^(yesterday|ayer|ontem|hier|dun|kemarin|ieri|gestern|أمس|امس|hom qua|เมื่อวาน)$/;
const TODAY = /^(just now|today|now|hoy|hoje|aujourd'hui|bugun|hari ini|oggi|heute|اليوم|ahora|agora|maintenant|simdi|baru saja|vua xong|hom nay)$/;

function parseReleaseDate(text) {
  const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!raw) return undefined;
  const t = plain(raw).replace(/\s*,\s*/g, ' ').replace(/\bde\b|\bdel\b|\bdo\b|\bda\b|\bdi\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (TODAY.test(t)) return Date.now();
  if (YESTERDAY.test(t)) return Date.now() - 86400000;
  let m = /(\d+)\s*([^\d\s.,]+)/.exec(t);
  if (m && /\b(ago|atras|hace|ha|il y a|once|lalu|truoc|vor|fa)\b|منذ|ที่แล้ว|ที่ผ่านมา/.test(t)) {
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

const ADULT_GENRE_WORDS = /^(adult|adults|adulto|adulte|adultos|adultes|hentai|smut|erotica|erotico|erotique|erotik|erotic|nsfw|\+?18\+?|18\+|mature romance|sexual content|sin censura|uncensored|dewasa|yetiskin|nguoi lon|ผู้ใหญ่|بالغين|للبالغين|r-?18|ecchi 18)$/;
const SUGGESTIVE_GENRE_WORDS = /^(mature|maduro|madura|maduros|ecchi|borderline h|olgun|dewasa muda|truong thanh|ناضج|ايتشي|أيتشي|إيتشي|اتشي)$/;

function genreAge(names) {
  const set = (names || []).map((n) => plain(n));
  if (set.some((n) => ADULT_GENRE_WORDS.test(n))) return 18;
  if (set.some((n) => SUGGESTIVE_GENRE_WORDS.test(n))) return 16;
  return 0;
}


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
  return (text || '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing') || s.includes('releasing') || s.includes('updating')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished') || s.includes('ended')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('on hold') || s.includes('paused')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('discontinued')) return 'CANCELLED';
  return 'UNKNOWN';
}

const PAGE_SIZE = 24;
const CHAPTER_PAGE = 30;
const OLD_PREFIX = 'mhscans-';
const TYPES = /^(manga|manhwa|manhua|novel|webtoon|comic|donghua)$/i;

function absolute(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function slugOf(href) {
  const m = /^(?:https?:\/\/[^/]+)?\/comics\/([^/?#]+)/i.exec(href || '');
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function mapStatusEs(text) {
  const s = plain(text);
  if (s.includes('emision') || s.includes('ongoing') || s.includes('publicando') || s.includes('en curso')) return 'ONGOING';
  if (s.includes('finaliz') || s.includes('complet') || s.includes('terminad')) return 'COMPLETED';
  if (s.includes('pausa') || s.includes('hiato') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandon') || s.includes('dropped')) return 'CANCELLED';
  return mapStatus(text);
}

function headerOf(response, name) {
  const headers = (response && response.headers) || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  const cards = $('a.comic-card');
  cards.each((_, el) => {
    const card = $(el);
    const mangaId = slugOf(card.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const type = card
      .find('span')
      .map((__, s) => cleanText($(s).text()))
      .get()
      .find((t) => TYPES.test(t));
    if (type && /^novel$/i.test(type)) return;
    const img = card.find('img').first();
    const title = cleanText(img.attr('alt')) || cleanText(card.find('h3, h2').first().text());
    if (!title) return;
    seen.add(mangaId);
    const manga = {
      mangaId,
      title,
      image: absolute(img.attr('data-src') || img.attr('src')),
      medium: 'comics',
      webURL: `${SITE_BASE}/comics/${encodeURIComponent(mangaId)}`,
    };
    withImageAuth(manga);
    results.push(manga);
  });
  return { results, raw: cards.length };
}

class Source {
  getSourceFeeds() {
    return CONFIG.feeds.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const $ = cheerio.load(await this.requestHTML(`${SITE_BASE}/library`));
      const tags = [];
      const seen = new Set();
      $('a[href*="genre="]').each((_, el) => {
        const m = /[?&]genre=([^&#]+)/.exec($(el).attr('href') || '');
        if (!m) return;
        let name = m[1].replace(/\+/g, ' ');
        try {
          name = decodeURIComponent(name);
        } catch (e) {
        }
        name = cleanText(name);
        if (!name || seen.has(name)) return;
        seen.add(name);
        tags.push({ id: name, label: name });
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

    const params = [];
    if (query) params.push('q=' + encodeURIComponent(query));
    else params.push('sort=' + encodeURIComponent(feed));
    if (tags.length > 0) params.push('genre=' + encodeURIComponent(tags[0].id));
    if (page > 1) params.push('page=' + page);

    let html;
    try {
      html = await this.requestHTML(`${SITE_BASE}/library?${params.join('&')}`);
    } catch (e) {
      if (page > 1) return { results: [], metadata: undefined };
      throw e;
    }
    const $ = cheerio.load(html);
    const { results, raw } = parseCards($);
    const more = raw >= PAGE_SIZE || $(`a[href*="page=${page + 1}"]`).length > 0;
    return { results, metadata: raw > 0 && more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { html, slug } = await this.comicPage(mangaId, '');
    const $ = cheerio.load(html);
    const url = `${SITE_BASE}/comics/${encodeURIComponent(slug)}`;

    const title = cleanText($('h1').first().text()) || cleanText($('meta[property="og:title"]').attr('content')) || mangaId;
    const image = absolute($('img.comic-cover__img').first().attr('src') || $('meta[property="og:image"]').attr('content'));

    const toggle = $('#comic-description-toggle');
    let desc = toggle.length ? cleanText(toggle.parent().find('p').first().text()) : '';
    if (!desc) desc = cleanText($('meta[property="og:description"]').attr('content'));

    const tags = [];
    $('li.comic-chip').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const status = mapStatusEs($('.comic-meta__status').first().text());
    const info = {
      title,
      image,
      author: '',
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'comics',
    };
    withImageAuth(info);
    const age = genreAge(tags);
    if (age) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const rows = [];
    const seen = new Set();
    let pages = 1;
    for (let page = 1; page <= pages && page <= 200; page++) {
      const { html, response } = await this.comicPage(mangaId, `/chapters?page=${page}&asc=1`);
      const total = parseInt(headerOf(response, 'x-pages'), 10);
      if (page === 1 && total > 1) pages = total;
      const $ = cheerio.load(html);
      let added = 0;
      $('a[data-chapter-num]').each((_, el) => {
        const link = $(el);
        const href = (link.attr('href') || '').trim();
        const num = parseFloat(link.attr('data-chapter-num'));
        const label = cleanText(link.attr('data-chapter-label')) || (Number.isFinite(num) ? `Capitulo ${num}` : '');
        if (!label) return;
        const token = /^\/leer\/([^/?#]+)/.exec(href);
        const locked = !token;
        const id = token ? token[1] : `locked-${Number.isFinite(num) ? num : label}`;
        if (seen.has(id)) return;
        seen.add(id);
        added++;
        const price = /(?:💎|💰)\s*(\d+)/.exec(cleanText(link.text()));
        const dateText = link
          .find('span')
          .map((__, s) => cleanText($(s).text()))
          .get()
          .find((t) => /^(hace|ahora|hoy|ayer|\d)/i.test(t) && !/^(nuevo|gratis)$/i.test(t));
        rows.push({
          id,
          name: locked ? (price ? `${label} (Locked, ${price[1]} coins)` : `${label} (Locked)`) : label,
          number: Number.isFinite(num) ? num : 0,
          time: dateText ? parseReleaseDate(dateText) : undefined,
        });
      });
      if (added === 0) break;
    }
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
    let token = String(chapterId);
    if (/^locked-/.test(token)) {
      throw new Error(`${CONFIG.name}: this chapter is premium, it needs an account and coins on the site`);
    }
    const old = /^(?:capitulo|chapter|cap|ch)[-_]?(\d+)(?:[-_.](\d+))?/i.exec(token);
    if (old) {
      const number = old[2] ? `${old[1]}.${old[2]}` : old[1];
      const { html } = await this.comicPage(mangaId, `/chapters?page=1&q=${encodeURIComponent(number)}`);
      const $ = cheerio.load(html);
      let found = '';
      $('a[data-chapter-num]').each((_, el) => {
        if (found || parseFloat($(el).attr('data-chapter-num')) !== parseFloat(number)) return;
        const m = /^\/leer\/([^/?#]+)/.exec($(el).attr('href') || '');
        if (m) found = m[1];
      });
      if (!found) throw new Error(`${CONFIG.name}: chapter ${number} was not found (it may be premium or removed)`);
      token = found;
    }
    const html = await this.requestHTML(`${SITE_BASE}/leer/${encodeURIComponent(token)}`);
    const $ = cheerio.load(html);
    const pages = [];
    const seen = new Set();
    $('img.page-img').each((_, el) => {
      const e = $(el);
      const src = (e.attr('data-src') || e.attr('src') || '').trim();
      if (!src || /^data:/.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(absolute(src));
    });
    if (pages.length === 0) {
      throw new Error(`${CONFIG.name} returned no pages for this chapter (premium chapters need a signed in account)`);
    }
    const details = { id: chapterId, mangaId, pages };
    withImageAuth(details);
    return details;
  }

  async comicPage(mangaId, suffix) {
    const id = String(mangaId);
    const candidates = id.indexOf(OLD_PREFIX) === 0 ? [id] : [id, OLD_PREFIX + id];
    let lastError;
    for (const slug of candidates) {
      try {
        const response = await this.request(`${SITE_BASE}/comics/${encodeURIComponent(slug)}${suffix}`);
        return { html: fixMojibake(response.data), slug, response };
      } catch (e) {
        lastError = e;
        if (!/HTTP 404/.test((e && e.message) || '')) throw e;
      }
    }
    throw lastError;
  }

  async requestHTML(url) {
    const response = await this.request(url);
    return fixMojibake(response.data);
  }

  async request(url) {
    const manager = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
    const request = App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return response;
  }
}

module.exports = { Source };
