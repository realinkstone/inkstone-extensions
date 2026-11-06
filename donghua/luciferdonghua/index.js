const CONFIG = {
  "name": "LuciferDonghua",
  "origin": "https://luciferdonghua.org",
  "archivePath": "/anime/",
  "detailBase": "/anime/",
  "slash": true,
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
  if (!/[Â-ô][\u0080-¿]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}

function withImageAuth(target) {
  if (CONFIG.referer) target.referer = SITE_BASE + '/';
  return target;
}

function cleanText(text) {
  return (text || '').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing') || s.includes('releasing') || s.includes('updating')) return 'ONGOING';
  if (s.includes('complet') || s.includes('finished') || s.includes('ended')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('on hold') || s.includes('paused')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
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
  if (/^data:/.test(pick)) pick = direct.trim();
  if (/^data:/.test(pick)) return '';
  if (/^https?:\/\/i\d\.wp\.com\//i.test(pick) && pick.indexOf('?') < 0) pick += '?w=300';
  return absolute(pick);
}

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
  }
  return encodeURIComponent(text);
}

function idFromHref(href) {
  const path = (href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function detailUrlOf(mangaId) {
  return `${SITE_BASE}${CONFIG.detailBase}${seg(mangaId)}${CONFIG.slash ? '/' : ''}`;
}

function episodeUrlOf(chapterId) {
  return `${SITE_BASE}/${String(chapterId).split('~').map(seg).join('/')}${CONFIG.slash ? '/' : ''}`;
}

function streamLabel(label) {
  if (!label || /^(player|dm|dailymotion)$/i.test(label)) return 'Dailymotion';
  return /dailymotion/i.test(label) ? label : label + ' (Dailymotion)';
}

const RANGE = '(\\d+(?:\\.\\d+)?)(?:\\s*(?:-|to)\\s*(\\d+(?:\\.\\d+)?))?';
function seasonIn(text) {
  const m = /season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*season/i.exec(text || '');
  return m ? parseInt(m[1] || m[2], 10) : null;
}
const EXTRA = /\b(pv|special|specials|movie|ova|information|trailer|recap)\b/i;
function parseEpisodeLabel(numText, title) {
  const text = cleanText(numText);
  let season = null;
  let number = NaN;
  const se = new RegExp('^S(\\d+)\\s*[EP]\\s*' + RANGE, 'i').exec(text);
  if (se) {
    season = parseInt(se[1], 10);
    number = parseFloat(se[3] || se[2]);
  } else {
    const plain = new RegExp('^' + RANGE + '$', 'i').exec(text);
    if (plain) number = parseFloat(plain[2] || plain[1]);
  }
  if (season === null) season = seasonIn(title);
  if (!Number.isFinite(number)) {
    const m = new RegExp('\\b(?:episod\\w*|ep)\\.?\\s*' + RANGE, 'i').exec(title || '');
    if (m) number = parseFloat(m[2] || m[1]);
  }
  return { season, number: Number.isFinite(number) ? number : undefined };
}

function parseGrid($) {
  const results = [];
  const seen = new Set();
  $('.listupd .bsx, .bs .bsx').each((_, el) => {
    const card = $(el);
    const link = card.find('a').first();
    const mangaId = idFromHref(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('.tt').first().clone().children().remove().end().text()) || cleanText(card.find('.tt').first().text()) || cleanText(link.attr('title'));
    if (!title) return;
    seen.add(mangaId);
    results.push(withImageAuth({ mangaId, title, image: coverFrom(card.find('img').first()), medium: 'anime', webURL: detailUrlOf(mangaId) }));
  });
  return results;
}

function hasNext($) {
  return $('.hpage a.r, .pagination a.next, a.next.page-numbers, .pagination a[rel="next"]').length > 0;
}

function infoField($, label) {
  let found = '';
  $('.spe span, .imptdt').each((_, el) => {
    const node = $(el).clone();
    const value = cleanText(node.find('i, a, b + *').first().text());
    node.find('i').remove();
    const name = cleanText(node.text()).replace(/[:：].*$/, '');
    if (name.toLowerCase().indexOf(label.toLowerCase()) === 0) {
      found = value || cleanText($(el).text().replace(new RegExp('^\\s*' + label + '\\s*:?', 'i'), ''));
      return false;
    }
  });
  return found.toLowerCase() === 'n/a' || found === '-' ? '' : found;
}

function decodeMirror(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  try {
    return App.base64Decode(v);
  } catch (e) {
    try {
      return typeof atob === 'function' ? atob(v) : '';
    } catch (e2) {
      return '';
    }
  }
}

function embedUrlFrom(html) {
  const text = String(html || '');
  const m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(text) || /(?:src|file)\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/i.exec(text);
  const src = m ? m[1] : /^(?:https?:)?\/\/\S+$/.test(text.trim()) ? text.trim() : '';
  return src.indexOf('//') === 0 ? 'https:' + src : src;
}

function dailymotionId(url) {
  const u = String(url || '');
  if (!/(?:^|\/\/|\.)(?:geo\.|www\.)?dailymotion\.com|dai\.ly/i.test(u)) return '';
  const q = /[?&]video=([A-Za-z0-9]+)/.exec(u);
  if (q) return q[1];
  const p = /(?:\/embed)?\/video\/([A-Za-z0-9]+)/.exec(u) || /dai\.ly\/([A-Za-z0-9]+)/.exec(u);
  return p ? p[1] : '';
}

const MAX_MIRROR_PAGES = 16;

const EMBED_PLAYERS = [
  { name: 'Rumble', test: /(?:^|\.)rumble\.com$/i },
  { name: 'OK.ru', test: /(?:^|\.)ok\.ru$/i },
  { name: 'mp4upload', test: /(?:^|\.)mp4upload\.com$/i },
  { name: 'VidHide', test: /(?:^|\.)(?:morencius|vidhide|earnvids)\.com$/i },
];
const EMBEDS_PER_PLAYER = 2;

function embedPlayerOf(url) {
  const m = /^https?:\/\/([^\/:?#]+)/i.exec(String(url || ''));
  if (!m) return null;
  return EMBED_PLAYERS.find((p) => p.test.test(m[1])) || null;
}

function embedLabel(label, playerName) {
  const text = cleanText(label) || 'Player';
  const key = playerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').indexOf(key) !== -1 ? text : `${text} (${playerName})`;
}

const LANGUAGE_CODES = { en: 'en', id: 'id', ar: 'ar', es: 'es', pt: 'pt', fr: 'fr', th: 'th', vi: 'vi', tr: 'tr', ru: 'ru', zh: 'zh', ja: 'ja', ko: 'ko', hi: 'hi', de: 'de' };

const SEASON_ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const SEASON_NOISE = /\b(sub|subs|subtitulado|subtitulada|espanol|latino|castellano|dub|dublado|doblado|hd|tv|uncensored|sin censura)\b/g;
const SEASON_MAX_SIBLINGS = 14;
const SEASON_SEP = '@@';
function splitSeasonId(mangaId, chapterId) {
  const text = String(chapterId === undefined || chapterId === null ? '' : chapterId);
  const at = text.indexOf(SEASON_SEP);
  return at > 0 ? { mangaId: text.slice(0, at), chapterId: text.slice(at + SEASON_SEP.length) } : { mangaId, chapterId };
}

function parseFranchise(title) {
  const folded = String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ');
  let lang = '';
  if (/\blatino\b/.test(folded)) lang = 'latino';
  else if (/\bcastellano\b/.test(folded)) lang = 'castellano';
  else if (/\b(sub|subs|subtitulado|subtitulada)\b/.test(folded)) lang = 'sub';
  else if (/\b(dub|dublado|doblado)\b/.test(folded)) lang = 'dub';
  let t = folded
    .replace(SEASON_NOISE, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let kind = 'main';
  if (/\b(ova|oad|ona|original video animation)\b/.test(t)) kind = 'ova';
  if (/\b(special|specials|recap|recaps|extra|extras|summary)\b/.test(t)) kind = 'special';
  if (/\b(movie|movies|pelicula|peliculas|film|gekijouban)\b/.test(t)) kind = 'movie';
  let season = null;
  let final = false;
  const take = (re, read) => {
    const m = re.exec(t);
    if (!m) return false;
    season = read(m);
    t = t.replace(re, ' ');
    return true;
  };
  if (/\bfinal season\b/.test(t)) {
    final = true;
    t = t.replace(/\bfinal season\b/, ' ');
  } else if (
    !take(/\b(\d{1,2})(?:st|nd|rd|th) season\b/, (m) => Number(m[1])) &&
    !take(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) season\b/, (m) => SEASON_ORDINALS[m[1]]) &&
    !take(/\b(?:season|temporada|staffel|saison)s? (\d{1,2})\b/, (m) => Number(m[1])) &&
    !take(/\bs(\d{1,2})\b/, (m) => Number(m[1])) &&
    !take(/\s([2-9])$/, (m) => Number(m[1]))
  ) {
    take(/\s(ii|iii|iv)$/, (m) => ({ ii: 2, iii: 3, iv: 4 })[m[1]]);
  }
  t = t.replace(/\b(?:part|cour|parte) \d{1,2}\b/g, ' ').replace(/\b(ova|oad|ona|special|specials|recap|movie|pelicula|film)\b/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return { base: t, kind, season, final, lang };
}

async function findFranchise(source, mangaId, ownTitle) {
  const own = parseFranchise(ownTitle);
  if (!own.base || own.base.length < 3) return [];
  const words = own.base.split(' ');
  const queries = [own.base];
  if (words.length > 4) queries.push(words.slice(0, 4).join(' '));
  const spelled = String(ownTitle || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  if (spelled && queries.indexOf(spelled) < 0) queries.push(spelled);
  const found = new Map();
  for (const query of queries) {
    let metadata;
    for (let pageNumber = 0; pageNumber < 2; pageNumber++) {
      let page;
      try {
        page = await source.getSearchResultsRaw({ title: query }, metadata);
      } catch (e) {
        break;
      }
      for (const r of (page && page.results) || []) {
        if (!r || !r.mangaId || found.has(r.mangaId)) continue;
        const p = parseFranchise(r.title);
        const same = p.base === own.base || (p.kind !== 'main' && p.base.indexOf(own.base + ' ') === 0);
        if (same) found.set(r.mangaId, { mangaId: r.mangaId, title: r.title, image: r.image, kind: p.kind, season: p.season, final: p.final, base: p.base, lang: p.lang });
      }
      metadata = page && page.metadata;
      if (!metadata) break;
    }
    if (found.size > 1) break;
  }
  if (!found.has(mangaId)) found.set(mangaId, { mangaId, title: ownTitle, image: undefined, kind: own.kind, season: own.season, final: own.final, base: own.base, lang: own.lang });
  return found.size > 1 ? pickVariants(Array.from(found.values()), mangaId, own.lang) : [];
}

function pickVariants(members, mangaId, ownLang) {
  const keyOf = (m) => (m.kind === 'main' ? `main:${m.final ? 'final' : m.season || 1}` : `${m.kind}:${m.base}`);
  const score = (m) => (m.mangaId === mangaId ? 3 : m.lang && m.lang === ownLang ? 2 : !m.lang ? 1 : 0);
  const best = new Map();
  for (const m of members) {
    const key = keyOf(m);
    if (!best.has(key) || score(m) > score(best.get(key))) best.set(key, m);
  }
  const chosen = Array.from(best.values());
  const rank = (m) => (m.mangaId === mangaId ? 0 : m.kind === 'main' ? 1 : 2);
  return chosen
    .map((m, index) => ({ m, index }))
    .sort((a, b) => rank(a.m) - rank(b.m) || a.index - b.index)
    .slice(0, SEASON_MAX_SIBLINGS + 1)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.m);
}

function numberSeasons(members) {
  const seasons = members.filter((m) => m.kind === 'main');
  let highest = 1;
  for (const m of seasons) if (m.season) highest = Math.max(highest, m.season);
  for (const m of seasons) {
    if (m.final) m.number = highest + 1;
    else m.number = m.season || 1;
  }
  return seasons;
}

const SEASON_GROUP_NAMES = { ova: 'OVAs', movie: 'Movies', special: 'Specials' };

async function connectSeasons(source, mangaId, ownTitle, composite) {
  let members = [];
  try {
    members = await findFranchise(source, mangaId, ownTitle);
  } catch (e) {
    members = [];
  }
  const own = parseFranchise(ownTitle);
  if (members.length < 2 || (own.kind !== 'main')) return source.getChaptersOfTitle(mangaId);
  const seasons = numberSeasons(members);
  if (seasons.length < 2 && members.filter((m) => m.kind !== 'main').length === 0) return source.getChaptersOfTitle(mangaId);
  const lists = new Array(members.length);
  const ownAt = members.findIndex((m) => m.mangaId === mangaId);
  if (ownAt >= 0) lists[ownAt] = await source.getChaptersOfTitle(members[ownAt].mangaId);
  const todo = members.map((m, i) => i).filter((i) => i !== ownAt);
  const readSibling = async (i) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const list = await source.getChaptersOfTitle(members[i].mangaId);
        if (list && list.length) return list;
      } catch (e) {
      }
    }
    return [];
  };
  let cursor = 0;
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (cursor < todo.length) {
        const i = todo[cursor++];
        lists[i] = await readSibling(i);
      }
    })
  );
  const out = [];
  const seen = new Set();
  members.forEach((m, i) => {
    const group = m.kind === 'main' ? null : SEASON_GROUP_NAMES[m.kind];
    const name = m.final ? 'Final Season' : `Season ${m.number}`;
    for (const chapter of lists[i] || []) {
      if (!chapter) continue;
      const finalId = composite && m.mangaId !== mangaId ? m.mangaId + SEASON_SEP + chapter.id : chapter.id;
      if (seen.has(finalId)) continue;
      seen.add(finalId);
      const tagged = Object.assign({}, chapter);
      if (finalId !== chapter.id) {
        tagged.id = finalId;
        if (tagged.chapterId !== undefined) tagged.chapterId = finalId;
      }
      if (m.kind === 'main') {
        if (tagged.season === undefined || tagged.season === null) {
          tagged.season = String(m.number);
          tagged.seasonName = name;
        }
        if (m.image && !tagged.seasonCover) tagged.seasonCover = m.image;
      } else {
        delete tagged.season;
        tagged.seasonName = group;
      }
      out.push(tagged);
    }
  });
  const rank = (chapter) => {
    const s = chapter.season === undefined ? -1 : Number(chapter.season);
    return Number.isFinite(s) ? s : -1;
  };
  return out
    .map((chapter, index) => ({ chapter, index }))
    .sort((a, b) => rank(b.chapter) - rank(a.chapter) || a.index - b.index)
    .map((x) => x.chapter);
}

function collapseSeasons(page, request) {
  if (!page || !Array.isArray(page.results)) return page;
  const parsed = page.results.map((r) => parseFranchise(r.title));
  const groups = new Map();
  parsed.forEach((p, index) => {
    if (p.kind !== 'main' || !p.base) return;
    const rank = p.final ? 99 : p.season || 1;
    const list = groups.get(p.base) || [];
    list.push({ index, rank });
    groups.set(p.base, list);
  });
  const drop = new Set();
  const heads = new Map();
  for (const [base, list] of groups) {
    const lowest = list.reduce((a, b) => (b.rank < a.rank ? b : a));
    heads.set(base, lowest.index);
    if (list.length < 2 || lowest.rank !== 1) continue;
    for (const x of list) if (x.index !== lowest.index) drop.add(x.index);
  }
  const headOf = (p) => {
    let best = '';
    for (const base of heads.keys()) {
      const sameName = p.kind !== 'main' && p.base === base;
      if ((sameName || p.base.indexOf(base + ' ') === 0) && base.length > best.length) best = base;
    }
    return best ? heads.get(best) : -1;
  };
  const deferred = new Map();
  const rest = [];
  page.results.forEach((r, index) => {
    if (drop.has(index)) return;
    const head = headOf(parsed[index]);
    if (head > index) {
      const list = deferred.get(head) || [];
      list.push(r);
      deferred.set(head, list);
    } else rest.push({ r, index });
  });
  let results = page.results;
  if (drop.size || deferred.size) {
    results = [];
    for (const x of rest) {
      results.push(x.r);
      for (const d of deferred.get(x.index) || []) results.push(d);
    }
  }
  const typed = request && request.title ? parseFranchise(request.title) : null;
  if (typed && typed.base.length >= 3) {
    const exact = results.filter((r) => {
      const p = parseFranchise(r.title);
      return p.kind === 'main' && p.base === typed.base;
    });
    if (exact.length && results[0] !== exact[0]) results = exact.concat(results.filter((r) => exact.indexOf(r) < 0));
  }
  return results === page.results ? page : Object.assign({}, page, { results });
}

class Source {
  constructor() {
    this.requests = App.createRequestManager(CONFIG.rateLimit ? { rateLimit: CONFIG.rateLimit } : {});
  }

  getSourceFeeds() {
    return CONFIG.feeds.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (CONFIG.genres === 'none') return [];
    try {
      const html = await this.requestHTML(`${SITE_BASE}${CONFIG.archivePath}`);
      const $ = cheerio.load(html);
      const labels = {};
      $('label[for]').each((_, el) => {
        labels[$(el).attr('for')] = cleanText($(el).text());
      });
      const tags = [];
      const seen = new Set();
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        const label = labels[$(el).attr('id')] || cleanText($(el).parent().text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error(CONFIG.name + ' getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResultsRaw(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = (request && request.feed) || CONFIG.feeds[0].id;
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}${page > 1 ? `/page/${page}/` : '/'}?s=${encodeURIComponent(query)}`;
    } else {
      let qs = `page=${page}&order=${encodeURIComponent(feed)}`;
      tags.forEach((t) => (qs += `&genre[]=${encodeURIComponent(t.id)}`));
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
    $('.genxed a, .mgen a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t && tags.indexOf(t) < 0) tags.push(t);
    });

    const paragraphs = [];
    $('.synp .entry-content p, .synp .entry-content').each((_, el) => {
      const node = $(el);
      if (node.is('div') && node.find('p').length) return;
      const t = cleanText(node.text());
      if (t && !/^(english|indonesia|indonesian|portugu[eê]s|espa[nñ]ol|العربية)$/i.test(t) && paragraphs.indexOf(t) < 0) paragraphs.push(t);
    });
    while (paragraphs.length > 1 && /^watch\b.*\b(streaming|online|english sub)/i.test(paragraphs[0])) paragraphs.shift();

    const status = mapStatus(infoField($, 'Status'));
    const info = {
      title,
      image,
      desc: paragraphs.join('\n\n'),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: url,
      medium: 'anime',
    };
    const studio = infoField($, 'Studio') || infoField($, 'Network');
    if (studio) info.author = studio;
    const released = infoField($, 'Released');
    const year = /(\d{4})/.exec(released);
    if (year) info.releaseDate = year[1];
    const age = genreAge(tags);
    if (age) info.ageRating = age;
    withImageAuth(info);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    return connectSeasons(this, mangaId, await this.seasonTitleOf(mangaId));
  }

  async getSearchResults(request, metadata) {
    return collapseSeasons(await this.getSearchResultsRaw(request, metadata), request);
  }

  async seasonTitleOf(mangaId) {
    this.seasonTitles = this.seasonTitles || new Map();
    if (!this.seasonTitles.has(mangaId)) {
      let title = '';
      try {
        const details = await this.getMangaDetails(mangaId);
        title = String((details && details.mangaInfo && details.mangaInfo.title) || '');
      } catch (e) {
        title = '';
      }
      this.seasonTitles.set(mangaId, title || String(mangaId).split('/').pop().replace(/[-_]+/g, ' '));
    }
    return this.seasonTitles.get(mangaId);
  }

  async getChaptersOfTitle(mangaId) {
    const $ = cheerio.load(await this.requestHTML(detailUrlOf(mangaId)));
    const rows = [];
    const seen = new Set();
    $('.eplister li').each((idx, el) => {
      const li = $(el);
      const link = li.find('a').first();
      const href = (link.attr('href') || '').trim();
      const path = href.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
      if (!path || seen.has(path)) return;
      seen.add(path);
      const title = cleanText(li.find('.epl-title').first().text());
      const label = parseEpisodeLabel(li.find('.epl-num').first().text(), title);
      const time = parseReleaseDate(li.find('.epl-date').first().text());
      const row = {
        id: path.replace(/\//g, '~'),
        chapterId: path.replace(/\//g, '~'),
        name: title || (label.number !== undefined ? `Episode ${label.number}` : path),
        number: label.number,
      };
      if (time !== undefined) row.time = time;
      rows.push({ row, season: label.season });
    });
    if (!rows.length) throw new Error(CONFIG.name + ' has no episodes for this title yet');

    const named = rows.map((r) => r.season);
    const titleSeason = seasonIn(cleanText($('h1.entry-title').first().text()));
    const lowest = Math.min(...named.filter((x) => x !== null));
    const plain = rows.filter((r) => r.season === null && r.row.number !== undefined && !EXTRA.test(r.row.name)).length;
    if (titleSeason === null && Number.isFinite(lowest)) {
      const base = plain >= 3 && lowest >= 2 ? 1 : null;
      const after = [];
      let ahead = null;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (named[i] !== null) ahead = named[i];
        after[i] = ahead;
      }
      let before = null;
      const seasons = rows.map((r, i) => {
        if (r.season !== null) {
          before = r.season;
          return r.season;
        }
        if (base !== null && r.row.number !== undefined && !EXTRA.test(r.row.name)) return base;
        return before !== null ? before : after[i];
      });
      if (new Set(seasons).size > 1) {
        rows.forEach((r, i) => {
          r.row.season = String(seasons[i]);
          r.row.seasonName = `Season ${seasons[i]}`;
        });
      }
    }
    return rows.map((r) => r.row);
  }

  async getVideos(mangaId, chapterId) {
    const epUrl = episodeUrlOf(chapterId);
    const html = await this.requestHTML(epUrl);
    const $ = cheerio.load(html);

    const embeds = [];
    const seenEmbed = new Set();
    const add = (label, src) => {
      if (!src || seenEmbed.has(src)) return;
      seenEmbed.add(src);
      embeds.push({ label: cleanText(label) || 'Player', src });
    };
    const mirrorPages = [];
    $('select.mirror option').each((_, o) => {
      const value = $(o).attr('value') || '';
      if (/^https?:\/\//i.test(value)) mirrorPages.push({ label: $(o).text(), url: value });
      else if (value) add($(o).text(), embedUrlFrom(decodeMirror(value)));
    });
    $('#pembed iframe, .video-content iframe, .player-embed iframe').each((_, f) => add('Player', absolute($(f).attr('src') || $(f).attr('data-src') || '')));
    const videos = [];
    const seenVideo = new Set();
    const removed = [];
    const resolve = async () => {
      for (const embed of embeds) {
        const id = dailymotionId(embed.src);
        if (!id || seenVideo.has(id)) continue;
        seenVideo.add(id);
        try {
          const response = await this.requests.schedule(
            App.createRequest({ url: `https://www.dailymotion.com/player/metadata/video/${id}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json', Referer: epUrl } })
          );
          if (response.status < 200 || response.status >= 300) continue;
          const meta = JSON.parse(response.data);
          const master = meta && meta.qualities && meta.qualities.auto && meta.qualities.auto[0] && meta.qualities.auto[0].url;
          if (!master) {
            const reason = meta && meta.error && cleanText(meta.error.message);
            if (reason && removed.indexOf(reason) === -1) removed.push(reason);
            continue;
          }
          const subtitles = [];
          const data = (meta.subtitles && meta.subtitles.data) || {};
          Object.keys(data).forEach((code) => {
            const entry = data[code] || {};
            const file = entry.urls && entry.urls[0];
            if (file) subtitles.push({ url: file, label: cleanText(entry.label) || code, language: LANGUAGE_CODES[String(code).slice(0, 2)] || String(code).slice(0, 2) });
          });
          const video = { url: master, quality: streamLabel(embed.label), type: 'hls', server: 'Dailymotion', headers: { Referer: 'https://www.dailymotion.com/', Origin: 'https://www.dailymotion.com' } };
          if (subtitles.length) video.subtitles = subtitles;
          videos.push(video);
        } catch (e) {
          console.error(CONFIG.name + ' Dailymotion lookup failed: ' + (e && e.message));
        }
      }
    };
    await resolve();
    const playerPages = () => embeds.filter((e) => embedPlayerOf(e.src)).length;
    for (let i = 0; i < mirrorPages.length && i < MAX_MIRROR_PAGES && (videos.length < 2 || playerPages() < 3); i += 4) {
      const pages = await Promise.all(
        mirrorPages.slice(i, i + 4).map((page) =>
          this.requestHTML(page.url, epUrl).then(
            (text) => ({ page, text }),
            (error) => {
              if (error && error.kind === 'challenge') throw error;
              return null;
            }
          )
        )
      );
      pages.forEach((entry) => {
        if (entry) add(entry.page.label, embedUrlFrom(cheerio.load(entry.text)('iframe').first().toString()));
      });
      await resolve();
    }
    const perPlayer = {};
    embeds.forEach((embed) => {
      const player = embedPlayerOf(embed.src);
      if (!player || (perPlayer[player.name] || 0) >= EMBEDS_PER_PLAYER) return;
      perPlayer[player.name] = (perPlayer[player.name] || 0) + 1;
      videos.push({ url: embed.src, type: 'embed', quality: embedLabel(embed.label, player.name), server: player.name });
    });
    if (!videos.length) {
      const why = removed.length ? `Dailymotion took the video down ("${removed[0]}")` : 'the site may have no stream for it yet';
      throw new Error(CONFIG.name + ' lists this episode on no player this app can open (it opens Dailymotion players); ' + why);
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async requestHTML(url, referer) {
    const headers = { 'User-Agent': UA };
    if (referer) headers.Referer = referer;
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers }));
    if (response.status === 401 || response.status === 403) {
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return fixMojibake(response.data);
  }
}

module.exports = { Source };
