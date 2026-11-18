const SITE = 'https://www.scrollerspub.com';
const API = `${SITE}/api`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE = 30;
const CHAPTER_PAGE = 1000;

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', sort: 'updated_at' },
  { id: 'popular', name: 'Most Viewed', sort: 'views' },
  { id: 'top', name: 'Top Rated', sort: 'rating' },
  { id: 'new', name: 'New Additions', sort: 'created_at' },
  { id: 'long', name: 'Most Chapters', sort: 'chapter_count' },
  { id: 'completed', name: 'Completed', sort: 'views', status: 'completed' },
];

const GENRES = [
  'fantasy', 'action', 'romance', 'adventure', 'comedy', 'slice of life', 'drama', 'mystery', 'harem', 'supernatural', 'shounen', 'martial arts', 'sci-fi', 'seinen', 'xianxia', 'josei',
  'psychological', 'school life', 'xuanhuan', 'historical', 'mature', 'tragedy', 'isekai', 'urban', 'eastern', 'military', 'yaoi', 'game', 'horror', 'shoujo', 'fan-fiction', 'adult',
  'wuxia', 'gender bender', 'ecchi', 'litrpg', 'shounen ai', 'mecha', 'smut', 'yuri', 'sports', 'reverse harem', 'thriller', 'video game', 'magical realism', 'shoujo ai',
];

const RATE_18 = ['smut', 'erotica', 'r-18', 'r18', 'hentai', 'nsfw', 'explicit sex', 'rape', 'reverse rape', 'sexual abuse', 'incest', 'sex slaves', 'sex s*aves', 'lolicon', 'shotacon'];
const RATE_16 = ['adult', 'mature', 'ecchi', 'nudity', 'adultery', 'slave harem', 's*ave harem', 'sexual cultivation technique', 'loli', 'shota'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function oneLine(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function titleCase(text) {
  return oneLine(text).replace(/(^|[\s\-\/(])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

function ageOf(item) {
  const tags = (Array.isArray(item && item.tags) ? item.tags : []).map((t) => oneLine(t).toLowerCase());
  if (item && (item.adult_override === true || (item.is_adult === true && item.adult_override !== false))) return 18;
  if (tags.some((t) => RATE_18.indexOf(t) >= 0)) return 18;
  if (tags.some((t) => RATE_16.indexOf(t) >= 0)) return 16;
  return 0;
}

const KNOWN_TAGS = new Set('p div span em strong i b u s a br hr h1 h2 h3 h4 h5 h6 blockquote ul ol li center font sup sub small big mark del ins strike table tbody thead tr td th pre code cite q abbr dl dt dd figure figcaption section article'.split(' '));
const PATREON = /p\W?a\W?t\W?r\W?e\W?o\W?n|ko\W?fi\b|discord|paypal|buymeacoffee/i;
const SITE_NAMES = /novelfull|freewebnovel|lightnovelpub|novelfire|webnovel|royalroad|readnovelfull|libread|ranobes|wuxiaworld|scribblehub|novelbin|boxnovel|lnmtl|scrollerspub|chikari/i;
const HAS_LINK = /https?:\/\/|www\.|\.gg\/|\b[a-z0-9*-]+\.\*?(?:com|net|org|gg|io|moe|to|cc|me|co)\b/i;
const HAS_URL = /https?:\/\/|www\./i;
const TEXT_TAG = /<\/?(?:p|div|br|span|em|strong|i|b|u|s|a|center|font|hr|ul|ol|li|blockquote|h[1-6]|sup|sub|img)(?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))*\s*\/?>/gi;
const TEXT_BREAK = /<\/?(?:p|div|br|hr|ul|ol|li|blockquote|h[1-6])(?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))*\s*\/?>/gi;

const ENTITY_NAMES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function entities(text) {
  return text
    .replace(/&#(\d{1,6});/g, (m, n) => (Number(n) > 8 && Number(n) < 0x110000 ? String.fromCodePoint(Number(n)) : m))
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, n) => (parseInt(n, 16) > 8 && parseInt(n, 16) < 0x110000 ? String.fromCodePoint(parseInt(n, 16)) : m))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (m, n) => ENTITY_NAMES[n.toLowerCase()]);
}

const CREDITS = /^\W*(?:chapter\b[^\n]{0,200}?)?(?:(?:translator|translated by|editor|edited by|proofreader)\s*:\s*[^:\n]{1,40}?\s{3,})+/i;

function squeeze(line) {
  return entities(line).replace(/[ \t\r\f\v\u00a0]+/g, ' ').trim();
}

function segments(text) {
  return String(text || '')
    .replace(TEXT_BREAK, '\u0001')
    .replace(TEXT_TAG, '')
    .replace(/\s*(?:this|the) (?:text|story|chapter|novel|content) (?:is|was) (?:hosted|taken|stolen|originally|posted)\b[^\n]{0,80}$/gim, '')
    .split('\u0001')
    .map((part) => part.replace(CREDITS, '').split('\n').map(squeeze).filter(Boolean).join('\n'))
    .filter(Boolean);
}

function paragraphs(html) {
  const $ = cheerio.load(`<div id="sp-root">${String(html || '')}</div>`);
  const root = $('#sp-root');
  root.find('script, style, iframe, ins, noscript, img').remove();
  root.find('*').toArray().forEach((el) => {
    const name = String(el.tagName || el.name || '').toLowerCase();
    if (!name || KNOWN_TAGS.has(name)) return;
    const $el = $(el);
    const text = oneLine($el.text());
    if (text.length < 200 && (HAS_LINK.test(text) || SITE_NAMES.test(text) || /\b(?:hosted|stolen|taken|copied)\b.{0,30}\b(?:at|from|on)\b/i.test(text))) $el.remove();
    else $el.replaceWith($el.contents());
  });
  root.find('br').replaceWith('\n');
  const blocks = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';
  const out = [];
  root.find(blocks).each((_, el) => {
    const $el = $(el);
    if ($el.find(blocks).length) return;
    out.push(...segments($el.text()));
  });
  if (!out.length) {
    String(root.text() || '')
      .replace(TEXT_BREAK, '\n')
      .replace(TEXT_TAG, '')
      .split('\n')
      .map(squeeze)
      .filter(Boolean)
      .forEach((line) => out.push(line));
  }
  return out;
}

function isPromo(line) {
  if (line.length > 400) return false;
  if (/^\W*(?:translator|translated by|editor|edited by|proofreader|proofread by|checker)\s*[:：]\s*\S/i.test(line) && line.length < 120) return true;
  if (/^\W*read the original (?:on|at)\b/i.test(line)) return true;
  if (/^\W*\(?\s*erase the \*\s*\)?\W*$/i.test(line)) return true;
  if (/^\W*(?:my|our)\s+(?:p\W?a\W?t\W?r\W?e\W?o\W?n|ko\W?fi|discord|paypal|twitter|instagram|facebook|blog|website)\b.{0,30}:/i.test(line)) return true;
  if (/please read my translations (?:at|on)|did not give permission to any site|(?:read|find) (?:my|our|the) (?:translations?|novel|story) (?:at|on)\b/i.test(line) && (HAS_LINK.test(line) || /translations?/i.test(line))) return true;
  if (/(?:support|join|follow|find|visit) (?:me|us)\s+(?:on|at)\b/i.test(line) && (PATREON.test(line) || HAS_LINK.test(line))) return true;
  if (/unlock early (?:chapter|access)|(?:more than )?\d+\+? (?:extra |bonus )?chapters? ahead|free trial is available/i.test(line)) return true;
  if (PATREON.test(line) && HAS_LINK.test(line)) return true;
  if (HAS_URL.test(line) && line.length < 400) return true;
  if (/\bhas been stolen\b|\b(?:reading|read) this (?:translation|novel|story|chapter) (?:anywhere|on any|at any)\b/i.test(line) && line.length < 300) return true;
  if (/(?:monthly|recommendation) tickets?|\bqidian\b.{0,60}\b(?:vote|support|read)\b/i.test(line)) return true;
  if (SITE_NAMES.test(line) && line.length < 120 && !/[.,;!?"\u201c\u201d]/.test(line)) return true;
  if (/p\W?a\W?t\W?r\W?e\W?o\W?n|ko\W?fi\b/i.test(line) && /\b(?:my|our|support(?:ing)?|page|link|advance|early|tier|join|subscri\w*|donat\w*)\b/i.test(line) && line.length < 400) return true;
  if (/(?:read|visit|find)\b.{0,30}\b(?:on|at)\s+(?:https?:\/\/)?(?:[a-z]+\.)?\*?(?:novelfull|freewebnovel|lightnovelpub|novelfire|webnovel|royalroad|readnovelfull|libread|ranobes|wuxiaworld|scribblehub|novelbin|boxnovel|lnmtl|scrollerspub|chikari)/i.test(line) && line.length < 200) return true;
  if (SITE_NAMES.test(line) && HAS_LINK.test(line) && line.length < 200) return true;
  if (/read (?:the )?(?:latest|more|full) chapters? (?:at|on|here)|if you find any errors? \(|please (?:bookmark|add us)\b|report (?:this )?(?:chapter|error)|enable javascript|^\W*(?:sponsored|advertisement)\W*$/i.test(line)) return true;
  return false;
}

function plain(html) {
  return paragraphs(html).join('\n\n');
}

function chapterName(title, serial) {
  let name = oneLine(title);
  name = name.replace(/^(Chapter\s+(\d+(?:\.\d+)?))\s*[-:]?\s+\2(?=\s*[:\-.]|\s|$)/i, '$1');
  return name || `Chapter ${serial}`;
}

const READ_TIMES = [];

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.genres = null;
  }

  async readSlot() {
    for (;;) {
      const now = Date.now();
      while (READ_TIMES.length && now - READ_TIMES[0] >= 61000) READ_TIMES.shift();
      if (READ_TIMES.length < 14) {
        READ_TIMES.push(now);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, READ_TIMES[0] + 61000 - now + 50));
    }
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    if (!this.genres) {
      let names = null;
      try {
        const data = await this.api('/meta/tags?kind=genre&limit=100');
        const list = (Array.isArray(data && data.items) ? data.items : []).map((x) => oneLine(x && x.name).toLowerCase()).filter(Boolean);
        if (list.length >= 10) names = list;
      } catch (e) {
        console.error('ScrollersPub genres failed: ' + (e && e.message));
      }
      this.genres = names || GENRES;
    }
    return this.genres.map((name) => ({ id: name, label: titleCase(name) }));
  }

  async api(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${API}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
        if (response.status === 429) {
          const wait = Number((response.headers && (response.headers['retry-after'] || response.headers['Retry-After'])) || 0);
          const err = new Error(`ScrollersPub allows 15 chapter reads a minute, try again in ${wait > 0 ? wait + ' seconds' : 'a minute'}`);
          err.rateLimited = true;
          throw err;
        }
        if (response.status < 502 || response.status > 504) {
          if (response.status === 404) throw new Error('ScrollersPub: not found (HTTP 404)');
          if (response.status < 200 || response.status >= 300) throw new Error(`ScrollersPub: HTTP ${response.status}`);
          try {
            return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          } catch (e) {
            throw new Error('ScrollersPub answered something that is not JSON');
          }
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || e.rateLimited || /ScrollersPub/.test(String(e.message))) throw e;
      }
    }
    throw new Error(`ScrollersPub: HTTP ${last ? last.status : 0}`);
  }

  coverOf(item) {
    if (item && item.cover_available !== false && item.cover_file) {
      return `${SITE}/static/${item.cover_file}${item.cover_version ? `?v=${item.cover_version}` : ''}`;
    }
    const url = oneLine(item && item.cover_url);
    return /^https:\/\//.test(url) ? url : '';
  }

  info(item) {
    const tags = [];
    const seen = new Set();
    for (const t of Array.isArray(item.tags) ? item.tags : []) {
      const label = titleCase(t);
      const key = label.toLowerCase();
      if (label && !seen.has(key)) {
        seen.add(key);
        tags.push(label);
      }
    }
    const status = String(item.status || '').toLowerCase();
    const card = {
      mangaId: String(item.id),
      title: oneLine(item.title),
      image: this.coverOf(item),
      tags,
      medium: 'novel',
      ageRating: ageOf(item),
      webURL: item.slug ? `${SITE}/novel/${item.slug}` : SITE,
    };
    const author = oneLine(item.authors);
    if (author && author.toLowerCase() !== 'unknown author' && author.toLowerCase() !== 'unknown') card.author = author;
    if (Number(item.rating) > 0) card.rating = Number(item.rating);
    if (Number.isFinite(Number(item.views))) card.views = Number(item.views);
    if (Number.isFinite(Number(item.chapter_count))) card.chapters = Number(item.chapter_count);
    if (status === 'completed') card.completed = true;
    return card;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = oneLine(request && request.title);
    const offset = (metadata && Number(metadata.offset)) || 0;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? oneLine((included[0] && included[0].id) || included[0]).toLowerCase() : '';
    const sort = query ? 'views' : feed.sort;
    let path = `/novels?limit=${PAGE}&offset=${offset}&sort_by=${sort}`;
    if (query) path += `&search=${encodeURIComponent(query)}`;
    if (tag) path += `&tag=${encodeURIComponent(tag)}`;
    if (feed.status && !query) path += `&status=${feed.status}`;
    const data = await this.api(path);
    const list = Array.isArray(data && data.items) ? data.items : [];
    const results = [];
    for (const item of list) {
      if (!item || !item.id || !oneLine(item.title)) continue;
      results.push(this.info(item));
    }
    const total = Number((data && data.total) || 0);
    const next = offset + list.length;
    return { results, metadata: list.length && next < total ? { offset: next } : undefined };
  }

  async getMangaDetails(mangaId) {
    const item = await this.api(`/novel/${encodeURIComponent(mangaId)}`);
    if (!item || !oneLine(item.title)) throw new Error('ScrollersPub: title not found');
    const info = this.info(item);
    const status = String(item.status || '').toLowerCase();
    info.status = status === 'ongoing' ? 'ONGOING' : status === 'completed' ? 'COMPLETED' : status === 'hiatus' ? 'HIATUS' : 'UNKNOWN';
    const desc = plain(item.synopsis || item.synopsis_original);
    if (desc) info.desc = desc;
    info.completed = info.status === 'COMPLETED';
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const id = encodeURIComponent(mangaId);
    const first = await this.api(`/novel/${id}/chapters?offset=0&limit=${CHAPTER_PAGE}`);
    const total = Number((first && first.total) || 0);
    let rows = Array.isArray(first && first.items) ? first.items.slice() : [];
    const jobs = [];
    for (let offset = CHAPTER_PAGE; offset < total; offset += CHAPTER_PAGE) {
      jobs.push(this.api(`/novel/${id}/chapters?offset=${offset}&limit=${CHAPTER_PAGE}`));
    }
    const pages = await Promise.all(jobs);
    for (const page of pages) rows = rows.concat(Array.isArray(page && page.items) ? page.items : []);
    const chapters = [];
    const seen = new Set();
    for (const c of rows) {
      const cid = String((c && c.id) || '');
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      const serial = Number(c.serial);
      const row = { id: cid, chapterId: cid, name: chapterName(c.title, c.serial) };
      if (Number.isFinite(serial)) row.number = serial;
      chapters.push(row);
    }
    if (total > 0 && chapters.length < total) throw new Error(`ScrollersPub chapter list came back short (${chapters.length} of ${total})`);
    chapters.sort((a, b) => (b.number || 0) - (a.number || 0));
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    await this.readSlot();
    const data = await this.api(`/chapter/${encodeURIComponent(chapterId)}/read?mark=false`);
    const lines = paragraphs(data && data.content).filter((line) => !isPromo(line));
    if (lines.length > 1 && lines[0].length < 160 && /^chapter\s*\d/i.test(lines[0]) && !/[.!?]["'”]?$/.test(lines[0])) lines.shift();
    const text = lines.join('\n\n');
    if (text.length < 80) throw new Error('ScrollersPub has no text for this chapter yet');
    return { id: chapterId, mangaId, pages: [], text };
  }
}

module.exports = { Source };
