const SITE = 'https://abertoverse.com';
const PAGE_SIZE = 30;
const LIST_MS = 60 * 1000;
const NOVEL_MS = 60 * 1000;
const RETRY_PAUSE_MS = 600;
const COVER_GRID = 384;
const COVER_DETAILS = 640;

const FEEDS = [
  { id: 'latest', name: 'Latest' },
  { id: 'popular', name: 'Most Viewed' },
];

const EXPLICIT_GENRES = new Set(['adult', 'adult drama', 'smut', 'erotica', 'explicit sex', 'r-18', 'r18', 'hentai', 'nsfw', '18+']);
const SUGGESTIVE_GENRES = new Set(['mature', 'ecchi', 'nudity', 'sex work', 'gore']);

const BLOCKED_GENRES = ['loli', 'lolicon', 'shota', 'shotacon'];

function cleanText(text) {
  return String(text == null ? '' : text).replace(/[\s ]+/g, ' ').trim();
}

function flightOf(html) {
  const marker = 'self.__next_f.push([1,"';
  const parts = [];
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = at + marker.length - 1;
    let end = open + 1;
    while (end < html.length) {
      const c = html.charCodeAt(end);
      if (c === 92) end += 2;
      else if (c === 34) break;
      else end += 1;
    }
    parts.push(JSON.parse(html.slice(open, end + 1)));
    at = html.indexOf(marker, end);
  }
  return parts.join('');
}

function endOfJson(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 92) i += 1;
      else if (c === 34) inString = false;
    } else if (c === 34) {
      inString = true;
    } else if (c === 91 || c === 123) {
      depth += 1;
    } else if (c === 93 || c === 125) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function jsonAfter(flight, anchor, first) {
  let at = flight.indexOf(anchor);
  while (at !== -1) {
    const start = at + anchor.length - 1;
    if (!first || flight.startsWith(first, start + 1)) {
      const end = endOfJson(flight, start);
      return end === -1 ? undefined : JSON.parse(flight.slice(start, end));
    }
    at = flight.indexOf(anchor, at + 1);
  }
  return undefined;
}

function sliceUtf8(text, start, bytes) {
  let i = start;
  let used = 0;
  while (i < text.length && used < bytes) {
    const c = text.charCodeAt(i);
    if (c < 0x80) used += 1;
    else if (c < 0x800) used += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      used += 4;
      i += 1;
    } else used += 3;
    i += 1;
  }
  return text.slice(start, i);
}

function textOf(flight, value) {
  if (typeof value !== 'string') return '';
  const pointer = /^\$([0-9a-f]+)$/.exec(value);
  if (!pointer) return value;
  const row = new RegExp(`(?:^|\\n)${pointer[1]}:T([0-9a-f]+),`).exec(flight);
  if (!row) return '';
  return sliceUtf8(flight, row.index + row[0].length, parseInt(row[1], 16));
}

function genresOf(novel) {
  return (Array.isArray(novel && novel.genres) ? novel.genres : []).map(cleanText).filter(Boolean);
}

function isBlocked(novel) {
  return genresOf(novel).some((g) => BLOCKED_GENRES.indexOf(g.toLowerCase()) !== -1);
}

function ageRatingFor(novel) {
  let age = 0;
  genresOf(novel).forEach((g) => {
    const key = g.toLowerCase();
    if (EXPLICIT_GENRES.has(key)) age = 18;
    else if (SUGGESTIVE_GENRES.has(key) && age < 16) age = 16;
  });
  return age;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complet') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancel') !== -1 || s.indexOf('dropped') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function seconds(stamp) {
  return stamp && typeof stamp.seconds === 'number' ? stamp.seconds : 0;
}

function coverUrl(novel, width) {
  const url = novel && novel.coverImageURL;
  if (typeof url !== 'string' || !/^https:\/\//.test(url)) return undefined;
  return `${SITE}/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

function toPartialManga(flight, novel) {
  const genres = genresOf(novel);
  const status = mapStatus(novel.status);
  const manga = {
    mangaId: String(novel.id),
    title: cleanText(novel.title) || String(novel.id),
    image: coverUrl(novel, COVER_GRID),
    status,
    completed: status === 'COMPLETED',
    ageRating: ageRatingFor(novel),
    webURL: `${SITE}/novels/${novel.id}`,
    medium: 'novel',
  };
  const author = cleanText(novel.authorName);
  if (author) manga.author = author;
  if (genres.length) manga.tags = genres;
  if (novel.chapterCount > 0) manga.chapters = novel.chapterCount;
  const summary = textOf(flight, novel.description);
  if (summary) manga.summary = summary.replace(/\r\n?/g, '\n').trim();
  return manga;
}

function chapterName(chapter, prefix) {
  const title = cleanText(chapter.title);
  const number = chapter.chapterNumber;
  if (prefix && number !== undefined && number !== null) return /^chapter\b/i.test(title) ? title : `Chapter ${number}: ${title}`.replace(/: $/, '');
  return title || `Chapter ${number}`;
}

const squash = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function chapterText($, heading) {
  const lines = $('.markdown-content p')
    .map((i, el) => cleanText($(el).text()))
    .get()
    .filter(Boolean);
  if (lines.length > 1 && lines[0].length <= 160) {
    const a = squash(lines[0]);
    const b = squash(heading);
    if (a && b && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1)) lines.shift();
  }
  return lines.join('\n\n');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this._list = null;
    this._novels = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const list = await this._listing();
      let labels = list.genres;
      if (!labels.length) {
        const seen = new Set();
        list.novels.forEach((n) => genresOf(n).forEach((g) => seen.add(g)));
        labels = Array.from(seen);
      }
      return labels.filter((g) => BLOCKED_GENRES.indexOf(g.toLowerCase()) === -1).map((g) => ({ id: g, label: g }));
    } catch (e) {
      console.error('AbertoVerse getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const query = cleanText(request && request.title).toLowerCase();
    const include = ((request && request.includedTags) || []).map((t) => cleanText(t && t.id).toLowerCase()).filter(Boolean);
    const exclude = ((request && request.excludedTags) || []).map((t) => cleanText(t && t.id).toLowerCase()).filter(Boolean);
    const feed = (request && request.feed) || FEEDS[0].id;

    const list = await this._listing();
    let novels = list.novels.filter((n) => !isBlocked(n));
    if (query) novels = novels.filter((n) => cleanText(n.title).toLowerCase().indexOf(query) !== -1);
    if (include.length || exclude.length) {
      novels = novels.filter((n) => {
        const have = genresOf(n).map((g) => g.toLowerCase());
        return include.every((t) => have.indexOf(t) !== -1) && !exclude.some((t) => have.indexOf(t) !== -1);
      });
    }
    const byViews = (a, b) => (b.totalViews || 0) - (a.totalViews || 0);
    const byDate = (a, b) => seconds(b.publishedAt || b.createdAt) - seconds(a.publishedAt || a.createdAt);
    novels = novels.slice().sort(feed === 'popular' ? byViews : byDate);

    const from = (page - 1) * PAGE_SIZE;
    const slice = novels.slice(from, from + PAGE_SIZE);
    const more = from + PAGE_SIZE < novels.length;
    return { results: slice.map((n) => toPartialManga(list.flight, n)), metadata: more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const page = await this._novel(mangaId);
    const info = toPartialManga(page.flight, page.novel);
    info.image = coverUrl(page.novel, COVER_DETAILS) || info.image;
    info.desc = info.summary;
    info.chapters = page.chapters.length || info.chapters;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const page = await this._novel(mangaId);
    const prefix = page.novel.showChapterNumberPrefix !== false;
    return page.chapters
      .map((c) => ({
        id: String(c.id),
        chapterId: String(c.id),
        name: chapterName(c, prefix),
        number: Number.isFinite(Number(c.chapterNumber)) ? Number(c.chapterNumber) : undefined,
        time: seconds(c.createdAt) * 1000 || undefined,
      }))
      .sort((a, b) => (b.number || 0) - (a.number || 0));
  }

  async getChapterDetails(mangaId, chapterId) {
    const path = `/novels/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}`;
    const $ = cheerio.load(await this._get(path));
    const heading = cleanText($('h1').first().text());
    const text = /^(chapter|novel) not found$/i.test(heading) ? '' : chapterText($, heading);
    if (text) return { id: chapterId, mangaId, pages: [], text };
    return {
      id: chapterId,
      mangaId,
      pages: [],
      text:
        `AbertoVerse lists this chapter but has no text for it (the site answers "Chapter Not Found"), so it is missing on the site itself ` +
        `and there is nothing to retry. The next chapter reads normally.\n\nThe site's page for it: ${SITE}${path}`,
    };
  }

  _listing() {
    if (this._list && Date.now() - this._list.at < LIST_MS) return this._list.promise;
    const promise = this._get('/novels').then((html) => {
      const flight = flightOf(html);
      const novels = jsonAfter(flight, '"novels":[', '{"id":"');
      if (!Array.isArray(novels)) throw new Error('AbertoVerse: the novels page no longer carries its list of novels');
      const $ = cheerio.load(html);
      let genres = [];
      $('select').each((i, el) => {
        const options = $(el)
          .find('option')
          .map((j, o) => cleanText($(o).text()))
          .get();
        if (!genres.length && options.length > 3 && !options.some((o) => /^(ongoing|latest first)$/i.test(o))) genres = options.filter((o) => !/^all$/i.test(o));
      });
      return { flight, genres, novels: novels.filter((n) => n && n.id && (!n.approvalStatus || n.approvalStatus === 'approved')) };
    });
    this._list = { at: Date.now(), promise };
    promise.catch(() => {
      this._list = null;
    });
    return promise;
  }

  _novel(mangaId) {
    const hit = this._novels.get(mangaId);
    if (hit && Date.now() - hit.at < NOVEL_MS) return hit.promise;
    const promise = this._get(`/novels/${encodeURIComponent(mangaId)}`).then((html) => {
      const flight = flightOf(html);
      const novel = jsonAfter(flight, '"novel":{', '"id":"');
      if (!novel || !novel.id) throw new Error('AbertoVerse: no such novel');
      if (isBlocked(novel)) throw new Error('This title is not available in this source.');
      let chapters = jsonAfter(flight, '"chapters":[', '{"id":"');
      if (!Array.isArray(chapters)) chapters = flight.indexOf('"chapters":[]') !== -1 ? [] : undefined;
      if (!Array.isArray(chapters)) throw new Error("AbertoVerse: the novel's page no longer carries its chapter list");
      return { flight, novel, chapters: chapters.filter((c) => c && c.id !== undefined && c.id !== null) };
    });
    this._novels.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this._novels.delete(mangaId));
    return promise;
  }

  async _get(path) {
    let failure = new Error('AbertoVerse: no answer');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response;
      try {
        response = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { Accept: 'text/html' } }));
      } catch (e) {
        failure = e;
        await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`AbertoVerse HTTP ${response.status} for ${path}`);
      return String(response.data);
    }
    throw failure;
  }
}

module.exports = { Source };
