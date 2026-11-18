const CONFIG = {
  "name": "Thunder Scans",
  "origin": "https://en-thunderscans.com",
  "archivePath": "/comics/",
  "detailPrefix": "comics",
  "pageSize": 30,
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

function idFromHref(href) {
  const path = (href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : '';
}

function detailUrlOf(mangaId) {
  return `${SITE_BASE}${CONFIG.archivePath}${encodeURIComponent(mangaId)}/`;
}

function isNovelTitle(title) {
  return /\[novel\]\s*$/i.test(title || '');
}

function novelText($) {
  const area = $('#readerarea').first();
  area.find('br').each((_, el) => {
    $(el).replaceWith('\n\n');
  });
  const blocks = area.find('p').length > 0 ? area.find('p').map((_, el) => $(el).text()).get() : [area.text()];
  const paragraphs = [];
  blocks.forEach((block) => {
    block.split(/\n\s*\n+/).forEach((part) => {
      const t = cleanText(part);
      if (t) paragraphs.push(t);
    });
  });
  return paragraphs.join('\n\n');
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
    const manga = { mangaId, title, image: coverFrom(card.find('img').first()), medium: isNovelTitle(title) ? 'novel' : 'comics', webURL: detailUrlOf(mangaId) };
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
    const medium = (request && request.medium) || '';
    if (medium && medium !== 'comics' && medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = (request && request.feed) || CONFIG.feeds[0].id;
    const page = (metadata && metadata.page) || 1;

    let url;
    if (medium === 'novel') {
      let qs = `page=${page}&order=${encodeURIComponent(feed)}&type=novel`;
      if (query) qs += `&title=${encodeURIComponent(query)}`;
      tags.forEach((t) => String(t.id).split(',').forEach((id) => (qs += `&genre[]=${encodeURIComponent(id)}`)));
      url = `${SITE_BASE}${CONFIG.archivePath}?${qs}`;
    } else if (query) {
      url = `${SITE_BASE}${page > 1 ? `/page/${page}/` : '/'}?s=${encodeURIComponent(query)}`;
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
    let results = parseGrid($);
    const more = results.length > 0 && hasNext($);
    if (medium === 'comics') results = results.filter((r) => r.medium !== 'novel');
    return { results, metadata: more ? { page: page + 1 } : undefined };
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
    $('.entry-content[itemprop="description"] p, .synp .entry-content p, .entry-content.entry-content-single p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) paragraphs.push(t);
    });
    while (paragraphs.length > 1 && /^read\b.*\b(manga|manhwa|manhua|comic|online)\b/i.test(paragraphs[0]) && paragraphs[0].length < 160) paragraphs.shift();

    const people = [];
    [infoField($, 'Author'), infoField($, 'Artist')].forEach((s) => s.split(',').forEach((n) => {
      const t = cleanText(n);
      if (t && !/^(updating|n\/a|unknown|none|-|\?)$/i.test(t) && people.indexOf(t) < 0) people.push(t);
    }));
    const status = mapStatus(infoField($, 'Status'));
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
      medium: /^novel$/i.test(infoField($, 'Type')) || isNovelTitle(title) ? 'novel' : 'comics',
    };
    if (/^\d{4}$/.test(released)) info.releaseDate = released;
    withImageAuth(info);
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
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
    const url = `${SITE_BASE}/${String(chapterId).split('~').map(encodeURIComponent).join('/')}/`;
    const html = await this.requestHTML(url);
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
    if (pages.length === 0) {
      const $ = cheerio.load(html);
      if ($('#readerarea.novel-reader').length > 0) {
        const text = novelText($);
        if (text) return { id: chapterId, mangaId, pages: [], text };
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
      throw new Error(`${CONFIG.name} HTTP ${response.status}: the site refused the request (a locked chapter, or a block on plain requests)`);
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return fixMojibake(response.data);
  }
}

module.exports = { Source };
