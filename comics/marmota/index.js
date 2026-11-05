const CONFIG = {
  "name": "Marmota",
  "origin": "https://marmota.me",
  "archivePath": "/comic/",
  "detailPrefix": "comic",
  "pageSize": 12,
  "referer": true,
  "imageHeaders": false,
  "genres": "checkbox",
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
    },
    {
      "id": "trending",
      "name": "Trending"
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
  if (s.includes('ongoing') || s.includes('releasing') || s.includes('updating')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished') || s.includes('ended')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('on hold') || s.includes('paused')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('discontinued')) return 'CANCELLED';
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
  let smallest = null;
  srcset.split(',').forEach((part) => {
    const m = /^\s*(\S+)\s+(\d+)w\s*$/.exec(part);
    if (!m || Number(m[2]) < 100) return;
    const width = Number(m[2]);
    if (width <= 400 && (!best || width > best.width)) best = { url: m[1], width };
    if (width > 400 && (!smallest || width < smallest.width)) smallest = { url: m[1], width };
  });
  best = best || smallest;
  const direct = $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('src') || '';
  let pick = (best ? best.url : direct).trim();
  if (/^data:/.test(pick) || /\/(dflazy|lazy|placeholder)[^/]*\.(gif|png|jpe?g|svg)$/i.test(pick)) pick = direct.trim();
  if (CONFIG.coverUpgrade) pick = pick.replace('-' + CONFIG.coverUpgrade[0] + '.', CONFIG.coverUpgrade[1] ? '-' + CONFIG.coverUpgrade[1] + '.' : '.');
  if (/^https?:\/\/i\d\.wp\.com\//i.test(pick) && pick.indexOf('?') < 0) pick += '?w=300';
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
    const more = results.length > 0 && (hasNextLink($) || results.length >= CONFIG.pageSize);
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = detailUrlOf(mangaId);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleBlock = $('.post-title').first().clone();
    titleBlock.find('.manga-title-badges, span').remove();
    const title = cleanText(titleBlock.find('h1').first().text()) || cleanText($('h1').first().text()) || mangaId;

    const image = absolute(
      $('meta[property="og:image"]').attr('content') || coverFrom($('.summary_image img').first()),
    );

    const author = fieldText($, 'Author(s)') || fieldText($, 'Author');
    const artist = fieldText($, 'Artist(s)') || fieldText($, 'Artist');
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
    const desc = descParts.length > 0 ? descParts.join('\n\n') : cleanText($('.summary__content').first().text());

    const tags = [];
    const genreContent = findFieldContent($, 'Genre(s)') || findFieldContent($, 'Genres');
    if (genreContent) {
      genreContent.find('a').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) tags.push(t);
      });
    }

    const status = mapStatus(fieldText($, 'Status'));
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
    const age = genreAge(tags);
    if (age) info.ageRating = age;
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
    let last = -Infinity;
    return rows.map((r) => {
      let number = chapterNumberOf(r.slug, r.name);
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
    $('img.wp-manga-chapter-img, .reading-content img, .page-break img').each((_, el) => {
      const e = $(el);
      const src = (e.attr('data-src') || e.attr('data-lazy-src') || e.attr('data-cfsrc') || e.attr('src') || '').trim();
      if (!src || /^data:/.test(src) || seen.has(src)) return;
      seen.add(src);
      pages.push(absolute(src));
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
    const response = await manager.schedule(request);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request (a locked chapter, or a block on plain requests)`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return fixMojibake(response.data);
  }
}

module.exports = { Source };
