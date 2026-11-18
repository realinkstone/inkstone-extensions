const SITE = 'https://wuxiadreams.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'update', name: 'Latest Update' },
  { id: 'score', name: 'Highest Rated' },
];

const SUGGESTIVE_TAGS = ['mature', 'ecchi', 'gore', 'loli'];
const EXPLICIT_TAGS = ['rape', 'first-time-intercourse'];

const TAGS = [
  { id: 'action', label: 'Action' },
  { id: 'adapted-to-drama', label: 'Adapted to Drama' },
  { id: 'adapted-to-manhua', label: 'Adapted to Manhua' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'beautiful-female-lead', label: 'Beautiful Female Lead' },
  { id: 'calm-protagonist', label: 'Calm Protagonist' },
  { id: 'clever-protagonist', label: 'Clever Protagonist' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'cultivation', label: 'Cultivation' },
  { id: 'demons', label: 'Demons' },
  { id: 'drama', label: 'Drama' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'handsome-male-lead', label: 'Handsome Male Lead' },
  { id: 'hard-working-protagonist', label: 'Hard-Working Protagonist' },
  { id: 'harem', label: 'Harem' },
  { id: 'historical', label: 'Historical' },
  { id: 'magic', label: 'Magic' },
  { id: 'male-protagonist', label: 'Male Protagonist' },
  { id: 'martial-arts', label: 'Martial Arts' },
  { id: 'mature', label: 'Mature' },
  { id: 'modern-day', label: 'Modern Day' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'psychological', label: 'Psychological' },
  { id: 'romance', label: 'Romance' },
  { id: 'school-life', label: 'School Life' },
  { id: 'science-fiction', label: 'Science Fiction' },
  { id: 'slice-of-life', label: 'Slice of Life' },
  { id: 'strong-love-interests', label: 'Strong Love Interests' },
  { id: 'supernatural', label: 'Supernatural' },
  { id: 'tragedy', label: 'Tragedy' },
  { id: 'transmigration', label: 'Transmigration' },
  { id: 'weak-to-strong', label: 'Weak to Strong' },
  { id: 'wuxia', label: 'Wuxia' },
  { id: 'xianxia', label: 'Xianxia' },
  { id: 'xuanhuan', label: 'Xuanhuan' },
];

const ACTION_PAGE = 500;
const PARALLEL = 6;
const DETAIL_TTL = 5 * 60 * 1000;
const RATING_TTL = 60 * 60 * 1000;

const detailCache = new Map();
let ratingCache = null;

function fixUtf8(text) {
  if (typeof text !== 'string' || !/[\u00c2-\u00f4][\u0080-\u00bf]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}

function clean(text) {
  return fixUtf8(String(text || '')).replace(/\s+/g, ' ').trim();
}

function toInt(text) {
  const n = parseInt(String(text || '').replace(/[^\d]/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function slugOf(label) {
  return clean(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function enc(piece) {
  const text = String(piece);
  try {
    return encodeURIComponent(decodeURIComponent(text));
  } catch (e) {
    return encodeURIComponent(text);
  }
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function mapStatus(text) {
  const s = clean(text).toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('complete') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancel') !== -1 || s.indexOf('dropped') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function ageFromTags(labels) {
  let age = 0;
  for (const label of labels || []) {
    const s = slugOf(label);
    if (EXPLICIT_TAGS.indexOf(s) !== -1) return 18;
    if (SUGGESTIVE_TAGS.indexOf(s) !== -1) age = 16;
  }
  return age;
}

function devalue(text) {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error('Unexpected action answer');
  const memo = {};
  function at(i) {
    if (i === -1) return undefined;
    if (typeof i !== 'number' || i < 0 || i >= arr.length) throw new Error('Bad action index');
    if (Object.prototype.hasOwnProperty.call(memo, i)) return memo[i];
    const v = arr[i];
    if (v === null || typeof v !== 'object') {
      memo[i] = v;
      return v;
    }
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') {
        if (v[0] === 'Date') {
          memo[i] = String(v[1]);
          return memo[i];
        }
        throw new Error('Unknown action type ' + v[0]);
      }
      const out = [];
      memo[i] = out;
      for (const x of v) out.push(at(x));
      return out;
    }
    const obj = {};
    memo[i] = obj;
    for (const k of Object.keys(v)) obj[k] = at(v[k]);
    return obj;
  }
  return at(0);
}

function totalPages(html) {
  const m = String(html).match(/Page\s*(?:<[^>]*>\s*)*(\d+)\s*(?:<[^>]*>\s*)*of\s+(\d+)/i);
  return m ? parseInt(m[2], 10) : 1;
}

function parseCards($) {
  const seen = {};
  const cards = [];
  $('a[href^="/novel/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/^\/novel\/([^/?#]+)$/);
    if (!m || seen[m[1]]) return;
    const $a = $(a);
    const title = clean($a.find('h3').first().text());
    if (!title) return;
    seen[m[1]] = true;
    const text = clean($a.text());
    const tail = text.match(/(\d[\d,]*)\s+Chapters?\s+([\d,]+)\s+([\d.]+)\s*$/i);
    const status = text.match(/^(completed|ongoing|hiatus|dropped|cancelled)\b/i);
    cards.push({
      slug: m[1],
      title,
      image: absolute($a.find('img').first().attr('src') || ''),
      chapters: tail ? toInt(tail[1]) : undefined,
      views: tail ? toInt(tail[2]) : undefined,
      score: tail ? parseFloat(tail[3]) : undefined,
      status: status ? mapStatus(status[1]) : 'UNKNOWN',
    });
  });
  return cards;
}

async function requestRaw(url, options) {
  const manager = App.createRequestManager({});
  const headers = Object.assign({ 'User-Agent': UA }, (options && options.headers) || {});
  const request = App.createRequest({
    url,
    method: (options && options.method) || 'GET',
    headers,
    body: options && options.body,
  });
  let response;
  try {
    response = await manager.schedule(request);
  } catch (e) {
    response = await manager.schedule(request);
  }
  if (response && typeof response.data === 'string') {
    return { status: response.status, headers: response.headers, data: fixUtf8(response.data) };
  }
  return response;
}

async function requestHTML(url) {
  const response = await requestRaw(url);
  if (response.status < 200 || response.status >= 300) {
    throw new Error('HTTP ' + response.status + ' for ' + url);
  }
  return response.data;
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const part = await Promise.all(items.slice(i, i + size).map(fn));
    for (const x of part) out.push(x);
  }
  return out;
}

async function tagSlugs(tag) {
  const first = await requestHTML(SITE + '/tag/' + tag + '?page=1');
  const total = totalPages(first);
  const slugs = parseCards(cheerio.load(first)).map((c) => c.slug);
  const rest = [];
  for (let p = 2; p <= total && p <= 12; p++) rest.push(p);
  const pages = await Promise.all(rest.map((p) => requestHTML(SITE + '/tag/' + tag + '?page=' + p)));
  for (const html of pages) for (const c of parseCards(cheerio.load(html))) slugs.push(c.slug);
  return slugs;
}

async function loadRatings() {
  const map = {};
  const jobs = SUGGESTIVE_TAGS.concat(EXPLICIT_TAGS).map(async (tag) => {
    const age = EXPLICIT_TAGS.indexOf(tag) !== -1 ? 18 : 16;
    let slugs;
    try {
      slugs = await tagSlugs(tag);
    } catch (e) {
      slugs = await tagSlugs(tag);
    }
    for (const s of slugs) if (!map[s] || map[s] < age) map[s] = age;
  });
  await Promise.all(jobs);
  return map;
}

function ratings() {
  if (ratingCache && Date.now() - ratingCache.at < RATING_TTL) return ratingCache.promise;
  const promise = loadRatings();
  ratingCache = { at: Date.now(), promise };
  promise.catch((e) => {
    console.error('Wuxia Dreams rating index failed: ' + (e && e.message));
    if (ratingCache && ratingCache.promise === promise) ratingCache = null;
  });
  return promise;
}

function titlePage(slug) {
  const hit = detailCache.get(slug);
  if (hit && Date.now() - hit.at < DETAIL_TTL) return hit.promise;
  const promise = requestHTML(SITE + '/novel/' + enc(slug)).then((html) => {
    const $ = cheerio.load(html);
    if (!$('h1').length || !/\/novel\//.test($('link[rel="canonical"]').attr('href') || '')) {
      throw new Error('Title not found: ' + slug);
    }
    return { html, $ };
  });
  detailCache.set(slug, { at: Date.now(), promise });
  promise.catch(() => {
    if (detailCache.get(slug) && detailCache.get(slug).promise === promise) detailCache.delete(slug);
  });
  return promise;
}

function readStats($) {
  const stats = {};
  $('span').each((_, el) => {
    const label = clean($(el).text());
    if (label === 'Chapters' || label === 'Views' || label === 'Score' || label === 'Status') {
      const value = clean($(el).next('span').text());
      if (value && stats[label] === undefined) stats[label] = value;
    }
  });
  return stats;
}

function infoLinks($, prefix) {
  const out = [];
  const panel = $('h3')
    .filter((_, h) => clean($(h).text()) === 'Information')
    .first()
    .parent();
  panel.find('a[href^="' + prefix + '"]').each((_, a) => {
    const t = clean($(a).text());
    if (t && out.indexOf(t) === -1) out.push(t);
  });
  return out;
}

function paragraphs($, root) {
  const out = [];
  root.find('p').each((_, p) => {
    const clone = $(p).clone();
    clone.find('script, style').remove();
    clone.find('br').replaceWith('\n');
    const text = fixUtf8(clone.text())
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
    if (text) out.push(text);
  });
  return out;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return TAGS.map((t) => ({ id: t.id, label: t.label }));
  }

  async collect(urlFor, start, span) {
    let page = start;
    let results = [];
    let more = false;
    for (let round = 0; round < 3; round++) {
      const pages = [];
      for (let i = 0; i < span; i++) pages.push(page + i);
      const htmls = await Promise.all(pages.map((p) => requestHTML(urlFor(p))));
      let total = 1;
      let cards = [];
      for (const html of htmls) {
        total = Math.max(total, totalPages(html));
        cards = cards.concat(parseCards(cheerio.load(html)));
      }
      if (cards.length && cards.every((c) => c.chapters === undefined)) {
        throw new Error('The list cards no longer show a chapter count');
      }
      const last = pages[pages.length - 1];
      more = last < total;
      page = last + 1;
      const seen = {};
      for (const r of results) seen[r.slug] = true;
      for (const c of cards) {
        if (seen[c.slug] || !c.chapters) continue;
        seen[c.slug] = true;
        results.push(c);
      }
      if (results.length >= 8 || !more) break;
    }
    return { cards: results, next: more ? page : undefined };
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }
    const query = clean((request && request.title) || '');
    const tags = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feed = FEEDS.some((f) => f.id === (request && request.feed)) ? request.feed : 'update';
    const page = (metadata && metadata.page) || 1;

    let urlFor;
    let span = 3;
    if (query) {
      urlFor = (p) => SITE + '/novels?q=' + encodeURIComponent(query) + '&page=' + p;
      span = 2;
    } else if (tags.length) {
      const tag = String(tags[0]);
      if (!TAGS.some((t) => t.id === tag)) return { results: [] };
      urlFor = (p) => SITE + '/tag/' + enc(tag) + '?page=' + p;
      span = 2;
    } else {
      urlFor = (p) => SITE + '/novels?sort=' + feed + '&page=' + p;
    }

    const [found, rated] = await Promise.all([this.collect(urlFor, page, span), ratings()]);
    const results = found.cards.map((c) => {
      const manga = {
        mangaId: c.slug,
        title: c.title,
        image: c.image,
        webURL: SITE + '/novel/' + c.slug,
        medium: 'novel',
        ageRating: rated[c.slug] || 0,
        chapters: c.chapters,
      };
      if (c.views !== undefined) manga.views = c.views;
      if (c.score !== undefined && isFinite(c.score)) manga.rating = c.score;
      if (c.status === 'COMPLETED') manga.completed = true;
      return manga;
    });
    return { results, metadata: found.next ? { page: found.next } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { $ } = await titlePage(mangaId);
    const title = clean($('h1').first().text()) || mangaId;
    const stats = readStats($);
    const genres = infoLinks($, '/genre/');
    const tagNames = infoLinks($, '/tag/');
    const tags = genres.slice();
    for (const t of tagNames) if (tags.indexOf(t) === -1) tags.push(t);

    let image = '';
    $('img').each((_, img) => {
      const src = $(img).attr('src') || '';
      if (!image && /\/covers\//.test(src)) image = absolute(src);
    });

    const synopsis = $('h3')
      .filter((_, h) => clean($(h).text()) === 'Synopsis')
      .first()
      .next();
    const clone = synopsis.clone();
    clone.find('br').replaceWith('\n');
    const desc = fixUtf8(clone.text())
      .split('\n')
      .map((line) => line.trim())
      .filter((line, i, all) => line || (i > 0 && all[i - 1]))
      .join('\n')
      .trim();

    const author = clean($('a[href^="/author/"]').first().find('span').first().text());
    const status = mapStatus(stats.Status);
    const score = parseFloat(stats.Score);
    const info = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: SITE + '/novel/' + mangaId,
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: ageFromTags(tagNames.concat(genres)),
    };
    if (author) info.author = author;
    if (stats.Chapters) info.chapters = toInt(stats.Chapters);
    if (stats.Views) info.views = toInt(stats.Views);
    if (isFinite(score)) info.rating = score;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { html, $ } = await titlePage(mangaId);
    const declared = toInt(readStats($).Chapters);
    if (declared === undefined) throw new Error('The title page printed no chapter count');
    if (declared === 0) return [];

    let rows = null;
    const id = (html.match(/novelId&quot;:\[0,&quot;([0-9a-f-]{36})&quot;/) || [])[1];
    if (id) {
      try {
        rows = await this.chaptersFromAction(id, declared);
      } catch (e) {
        console.error('Wuxia Dreams chapter action failed, reading the pages: ' + (e && e.message));
        rows = null;
      }
    }
    if (!rows) rows = await this.chaptersFromPages(mangaId, declared, html);
    if (rows.length !== declared) {
      throw new Error('Chapter list has ' + rows.length + ' rows, the site says ' + declared);
    }

    rows.sort((a, b) => a.number - b.number);
    const seen = {};
    const chapters = [];
    for (const r of rows) {
      const key = String(r.number);
      if (seen[key]) continue;
      seen[key] = true;
      const chapter = {
        id: key,
        chapterId: key,
        name: clean(r.title) || 'Chapter ' + key,
        number: r.number,
      };
      const time = r.createdAt ? Date.parse(r.createdAt) : NaN;
      if (isFinite(time)) chapter.time = time;
      chapters.push(chapter);
    }
    return chapters;
  }

  async chaptersFromAction(novelId, declared) {
    const pages = [];
    for (let p = 1; p <= Math.ceil(declared / ACTION_PAGE); p++) pages.push(p);
    const parts = await inBatches(pages, PARALLEL, async (p) => {
      const response = await requestRaw(SITE + '/_actions/chapter.getNovelChapters/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ novelId, page: p, pageSize: ACTION_PAGE }),
      });
      if (response.status !== 200) throw new Error('HTTP ' + response.status);
      const data = devalue(response.data);
      if (!data || !Array.isArray(data.chapters)) throw new Error('No chapters in the answer');
      return data.chapters;
    });
    const rows = [];
    for (const part of parts) {
      for (const c of part) {
        if (!c || typeof c.number !== 'number') throw new Error('A chapter row has no number');
        rows.push({ number: c.number, title: c.title, createdAt: c.createdAt });
      }
    }
    return rows;
  }

  async chaptersFromPages(mangaId, declared, firstHtml) {
    const pageCount = Math.ceil(declared / 100);
    const nums = [];
    for (let p = 2; p <= pageCount; p++) nums.push(p);
    const htmls = [firstHtml].concat(
      await inBatches(nums, PARALLEL, (p) =>
        requestHTML(SITE + '/novel/' + enc(mangaId) + '?page=' + p + '&sort=asc'),
      ),
    );
    const rows = [];
    for (const html of htmls) {
      const $ = cheerio.load(html);
      $('a[href^="/novel/' + mangaId + '/chapter-"]').each((_, a) => {
        const m = ($(a).attr('href') || '').match(/\/chapter-(\d+)$/);
        if (!m) return;
        rows.push({ number: parseInt(m[1], 10), title: clean($(a).find('span').first().text()) });
      });
    }
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const html = await requestHTML(
      SITE + '/novel/' + enc(mangaId) + '/chapter-' + enc(chapterId),
    );
    const $ = cheerio.load(html);
    const article = $('article.chapter-content-container').first();
    if (!article.length) throw new Error('Chapter not found: ' + chapterId);
    const text = paragraphs($, article).join('\n\n');
    if (!text) throw new Error('Chapter ' + chapterId + ' has no text');
    return { id: chapterId, mangaId, pages: [], text };
  }
}

module.exports = { Source };
