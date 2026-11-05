const CONFIG = {
  "name": "MangaTV",
  "origin": "https://mangatv.net",
  "archivePath": "/lista",
  "detailPrefix": "manga",
  "pageSize": 10,
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
  if (s.includes('public') || s.includes('emisi')) return 'ONGOING';
  if (s.includes('finaliz') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('pausa') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('discontinued')) return 'CANCELLED';
  return 'UNKNOWN';
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
  if (/^https?:\/\/i\d\.wp\.com\//i.test(pick) && pick.indexOf('?') < 0) pick += '?w=300';
  return absolute(pick);
}

function idFromHref(href) {
  const match = /\/manga\/(\d+)\/([^/?#]+)/.exec(href || '');
  return match ? `${match[1]}~${match[2]}` : '';
}

function detailUrlOf(mangaId) {
  return `${SITE_BASE}/manga/${String(mangaId).split('~').map(encodeURIComponent).join('/')}`;
}

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

function readerPages(blob) {
  const cipher = CryptoJS.enc.Base64.parse(blob.c);
  cipher.sigBytes -= 16;
  cipher.clamp();
  const counter = CryptoJS.enc.Base64.parse(blob.iv).concat(CryptoJS.enc.Hex.parse('00000002'));
  const plain = CryptoJS.AES.decrypt({ ciphertext: cipher }, CryptoJS.enc.Base64.parse(blob.k), { iv: counter, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding });
  return JSON.parse(plain.toString(CryptoJS.enc.Utf8)).p;
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

function infoField($, label) {
  let found = '';
  $('.imptdt, .fmed, .spe span').each((_, el) => {
    const node = $(el).clone();
    const value = cleanText(node.find('i, a, b + *').first().text());
    node.find('i').remove();
    const name = cleanText(node.text()).replace(/[:：]$/, '');
    if (name.toLowerCase().indexOf(label.toLowerCase()) === 0) {
      found = value || cleanText($(el).text().replace(new RegExp('^\\s*' + label + '\\s*:?', 'i'), ''));
      return false;
    }
  });
  return found.toLowerCase() === 'n/a' || found === '-' ? '' : found;
}

class Source {
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
      url = `${SITE_BASE}${CONFIG.archivePath}?s=${encodeURIComponent(query)}&page=${page}`;
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

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const $ = cheerio.load(await this.requestHTML(url));
    const title = cleanText($('h1.entry-title').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('meta[property="og:image"]').attr('content') || coverFrom($('.thumb img').first()));

    const tags = [];
    $('.genxed a, .mgen a, .seriestugenre a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const paragraphs = [];
    $('.wd-full b:contains("Sinopsis") + span').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) paragraphs.push(t);
    });
    while (paragraphs.length > 1 && /^read\b.*\b(manga|manhwa|manhua|comic|online)\b/i.test(paragraphs[0]) && paragraphs[0].length < 160) paragraphs.shift();

    const people = [];
    [infoField($, 'Author'), infoField($, 'Artist')].forEach((s) => s.split(',').forEach((n) => {
      const t = cleanText(n);
      if (t && !/^(updating|n\/a|unknown|none|-|\?)$/i.test(t) && people.indexOf(t) < 0) people.push(t);
    }));
    const status = mapStatus(infoField($, 'Estado'));
    const released = infoField($, 'Released');
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
    const age = genreAge(tags);
    if (age) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.requestHTML(detailUrlOf(mangaId)));
    const rows = [];
    const seen = new Set();
    $('#chapterlist li, .eplister li').each((_, el) => {
      const li = $(el);
      const link = li.find('a').first();
      const href = (link.attr('href') || '').trim();
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
      if (!path || seen.has(path)) return;
      seen.add(path);
      const name = cleanText(li.find('.chapternum').first().text()) || cleanText(link.text()) || path;
      const dataNum = parseFloat(li.attr('data-num'));
      const fromName = /(\d+(?:\.\d+)?)/.exec(name);
      const gold = li.find('.text-gold').first();
      const price = gold.length ? parseInt(cleanText(gold.text()).replace(/\D+/g, ''), 10) : NaN;
      rows.push({
        id: path.replace(/\//g, '~'),
        name: gold.length ? (price > 0 ? `${name} (Locked, ${price} coins)` : `${name} (Locked)`) : name,
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
    const html = await this.requestHTML(`${SITE_BASE}/${String(chapterId).split('~').map(encodeURIComponent).join('/')}`);
    const blob = /ReaderBlob\.start\((\{.+?\})\)/.exec(unpack(html));
    if (!blob) throw new Error(CONFIG.name + ' returned no pages for this chapter');
    const pages = readerPages(JSON.parse(blob[1]));
    const details = { id: chapterId, mangaId, pages };
    withImageAuth(details);
    return details;
  }

  async requestHTML(url) {
    const manager = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
    const request = App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } });
    const response = await manager.schedule(request);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request (a locked chapter, or a block on plain requests)`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return fixMojibake(response.data);
  }
}

module.exports = { Source };
