const SITE = 'https://komix.to';

const FEEDS = [
  { id: 'popular', name: 'Most Popular', sort: 'views' },
  { id: 'latest', name: 'Latest Update', sort: 'date' },
  { id: 'added', name: 'Recently Added', sort: 'new' },
  { id: 'rated', name: 'Highest Rated', sort: 'rating' },
  { id: 'az', name: 'A to Z', sort: 'az' },
];

const GENRES = [
  ['action', 'Action'], ['adult', 'Adult'], ['adventure', 'Adventure'], ['boys-love', 'Boys Love'], ['comedy', 'Comedy'], ['crime', 'Crime'], ['drama', 'Drama'], ['ecchi', 'Ecchi'],
  ['fantasy', 'Fantasy'], ['girls-love', 'Girls Love'], ['harem', 'Harem'], ['hentai', 'Hentai'], ['historical', 'Historical'], ['horror', 'Horror'], ['isekai', 'Isekai'],
  ['josei', 'Josei'], ['magical-girls', 'Magical Girls'], ['manhua', 'Manhua'], ['manhwa', 'Manhwa'], ['mature', 'Mature'], ['mecha', 'Mecha'], ['medical', 'Medical'],
  ['mystery', 'Mystery'], ['philosophical', 'Philosophical'], ['psychological', 'Psychological'], ['romance', 'Romance'], ['sci-fi', 'Sci-Fi'], ['seinen', 'Seinen'],
  ['shoujo', 'Shoujo'], ['shounen', 'Shounen'], ['slice-of-life', 'Slice of Life'], ['smut', 'Smut'], ['sports', 'Sports'], ['superhero', 'Superhero'],
  ['supernatural', 'Supernatural'], ['thriller', 'Thriller'], ['tragedy', 'Tragedy'], ['wuxia', 'Wuxia'],
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function plain(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(text) {
  return plain(text).replace(/\s+/g, ' ').trim();
}

function nameList(value) {
  const out = [];
  const add = (v) => {
    if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object') add(v.name || v.slug);
    else if (typeof v === 'string' && v.trim()) out.push(oneLine(v));
  };
  add(value);
  return out;
}

function lower(name) {
  return String(name).toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

const G18 = ['hentai', 'smut', 'adult', 'sexual violence', 'erotica', 'pornographic'];
const G16 = ['mature', 'ecchi'];
const TAG18 = /\b(sexual violence|rape|hentai|smut|intercourse|public sex|bdsm|explicit)\b/i;
const TAG16 = /\b(ecchi|nudity|sexual content|mature)\b/i;
const TITLE18 = /\b(porn\w*|hentai\w*|dohentai|sex|sexual|erotic\w*|nsfw|xxx|orgy|incest\w*|rape)\b/i;
const TITLE16 = /\b(ecchi|lewd|nude|naked|sexy|lust|lustful|seductive|seduction)\b/i;
function ageOf(item) {
  const meta = item && item.extra_meta && typeof item.extra_meta === 'object' ? item.extra_meta : {};
  const genres = nameList(item && item.genres).concat(nameList(meta.genres)).map(lower);
  const tags = nameList(item && item.tags).concat(nameList(meta.tags));
  const rated = String(meta.content_rating || '').toLowerCase();
  const title = String((item && item.title) || '');
  if (genres.some((g) => G18.indexOf(g) >= 0) || tags.some((t) => TAG18.test(t)) || rated === 'erotica' || rated === 'pornographic' || meta.is_adult === true || TITLE18.test(title)) return 18;
  if (genres.some((g) => G16.indexOf(g) >= 0) || tags.some((t) => TAG16.test(t)) || rated === 'suggestive' || rated === 'mature' || TITLE16.test(title)) return 16;
  return 0;
}

function statusOf(text) {
  const t = String(text || '').toLowerCase();
  if (t === 'ongoing' || t === 'releasing') return 'ONGOING';
  if (t === 'completed') return 'COMPLETED';
  if (t === 'hiatus' || t === 'on hiatus') return 'HIATUS';
  if (t === 'cancelled' || t === 'canceled') return 'CANCELLED';
  return 'UNKNOWN';
}

function coverOf(item, width) {
  const c = String((item && item.cover_image) || '');
  if (c.indexOf('/api/images') === 0) return `${SITE}${c}${width ? `&w=${width}` : ''}`;
  if (/^https:\/\/komix\.to\//.test(c)) return c;
  return '';
}

function arrayAt(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function flight(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let out = '';
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse(`"${m[1]}"`);
    } catch (e) {
    }
  }
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([slug, name]) => ({ id: slug, label: name }));
  }

  async get(path, accept) {
    let last = 'no answer';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { Accept: accept } }));
        if (response.status >= 200 && response.status < 300) return String(response.data || '');
        if (response.status === 404) throw new Error('Komix: not found (HTTP 404)');
        last = `HTTP ${response.status}`;
      } catch (e) {
        if (/Komix:/.test(String(e && e.message))) throw e;
        last = String((e && e.message) || e);
      }
      await pause(500 * (attempt + 1));
    }
    throw new Error(`Komix: ${last}`);
  }

  async json(path) {
    const text = await this.get(path, 'application/json');
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Komix answered something that is not JSON');
    }
  }

  async getSearchResults(request, metadata) {
    const q = oneLine(request && request.title);
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const wanted = [];
    for (const t of included) {
      const key = lower(oneLine(t && typeof t === 'object' ? t.id || t.label : t));
      const hit = GENRES.find((g) => g[0].replace(/-/g, ' ') === key || lower(g[1]) === key);
      if (hit && wanted.indexOf(hit[0]) < 0) wanted.push(hit[0]);
    }
    let page = Math.max(1, Number(metadata && metadata.page) || 1);
    const results = [];
    let more = false;
    for (let round = 0; round < (wanted.length > 1 ? 3 : 1); round++) {
      let path = `/api/page-data/browse?sort=${q ? 'relevance' : feed.sort}&page=${page}`;
      if (q) path += `&q=${encodeURIComponent(q)}`;
      if (wanted.length) path += `&genre=${encodeURIComponent(wanted[0])}`;
      const data = await this.json(path);
      const list = Array.isArray(data && data.results) ? data.results : [];
      for (const it of list) {
        const title = oneLine(it && it.title);
        const slug = String((it && it.slug) || '').trim();
        if (!slug || !title) continue;
        if (wanted.length > 1) {
          const have = nameList(it.genres).concat(nameList(it.extra_meta && it.extra_meta.genres)).map((g) => lower(g));
          if (!wanted.slice(1).every((w) => have.indexOf(w.replace(/-/g, ' ')) >= 0)) continue;
        }
        results.push({ mangaId: slug, title, image: coverOf(it, 480), medium: 'comics', ageRating: ageOf(it) });
      }
      more = list.length > 0 && page * 60 < Number((data && data.totalCount) || 0);
      page += 1;
      if (!more || results.length) break;
    }
    return { results, metadata: more ? { page } : undefined };
  }

  async titleData(slug) {
    const data = await this.json(`/api/page-data/title/${encodeURIComponent(slug)}`);
    if (data && data.state === 'redirect' && data.slug && data.slug !== slug) return this.titleData(data.slug);
    if (!data || data.state !== 'ok' || !data.manga) throw new Error('Komix: title not found');
    return data;
  }

  async getMangaDetails(mangaId) {
    const data = await this.titleData(decodeURIComponent(mangaId));
    const m = data.manga;
    const title = oneLine(m.title);
    if (!title) throw new Error('Komix: title not found');
    let desc = '';
    try {
      const ld = JSON.parse(data.jsonLd);
      const book = (ld['@graph'] || []).find((n) => n && n['@type'] === 'Book');
      desc = plain(book && book.description);
    } catch (e) {
      desc = '';
    }
    if (!desc) desc = plain(m.description);
    const meta = m.extra_meta && typeof m.extra_meta === 'object' ? m.extra_meta : {};
    const tags = [];
    for (const n of nameList(m.genres).concat(nameList(meta.genres))) if (tags.indexOf(n) < 0) tags.push(n);
    const info = {
      title,
      image: coverOf(m, 0),
      status: statusOf(m.status || meta.status),
      tags,
      webURL: `${SITE}/title/${m.slug || mangaId}`,
      medium: 'comics',
      ageRating: ageOf(m),
    };
    if (desc) info.desc = desc;
    const author = oneLine(m.author);
    const artist = oneLine(m.artist);
    if (author && author !== 'None') info.author = author;
    if (artist && artist !== 'None') info.artist = artist;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const data = await this.titleData(decodeURIComponent(mangaId));
    const rows = Array.isArray(data.chapters) ? data.chapters : [];
    const seen = new Set();
    const out = [];
    for (const c of rows) {
      const number = Number(c && c.chapter_number);
      if (!c || !Number.isFinite(number)) continue;
      const group = oneLine(c.group);
      const id = group ? `${number}~${encodeURIComponent(group)}` : String(number);
      if (seen.has(id)) continue;
      seen.add(id);
      const name = oneLine(c.title) || `Chapter ${number}`;
      const item = { id, chapterId: id, name, number };
      if (group && group.toLowerCase() !== '(none)') item.group = group;
      const time = Date.parse(String(c.release_date || c.created_at || ''));
      if (Number.isFinite(time)) item.time = time;
      out.push(item);
    }
    if (!out.length) return [];
    const indexOf = new Map(out.map((c, i) => [c.id, i]));
    out.sort((a, b) => b.number - a.number || indexOf.get(a.id) - indexOf.get(b.id));
    return out;
  }

  async getChapterDetails(mangaId, chapterId) {
    const slug = decodeURIComponent(mangaId);
    const raw = decodeURIComponent(String(chapterId));
    const cut = String(chapterId).indexOf('~');
    const number = cut >= 0 ? String(chapterId).slice(0, cut) : String(chapterId);
    const group = cut >= 0 ? decodeURIComponent(String(chapterId).slice(cut + 1)) : '';
    let path = `/title/${encodeURIComponent(slug)}/chapter/${encodeURIComponent(number)}`;
    if (group) path += `?group=${encodeURIComponent(group)}`;
    const html = await this.get(path, 'text/html');
    const text = flight(html);
    const at = text.indexOf('"chapter":{"id"');
    const start = at >= 0 ? text.indexOf('"pages":[', at) : -1;
    if (start < 0) throw new Error(`Komix has no pages for this chapter (${raw})`);
    let list = [];
    try {
      list = JSON.parse(arrayAt(text, start + 8));
    } catch (e) {
      throw new Error('Komix: the chapter pages could not be read');
    }
    const pages = list
      .slice()
      .sort((a, b) => Number(a && a.page_number) - Number(b && b.page_number))
      .map((p) => {
        if (p && p.enc) return `${SITE}/api/images?t=${encodeURIComponent(p.enc)}`;
        const u = String((p && p.image_url) || '').trim();
        return u.charAt(0) === '/' && u.charAt(1) !== '/' ? `${SITE}${u}` : u;
      })
      .filter((u) => /^https?:\/\//.test(u));
    if (!pages.length) throw new Error('Komix has no pages for this chapter yet');
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
