const CONFIG = {
  "name": "Traducciones Moonlight Novelas",
  "origin": "https://traduccionesmoonlight.com"
};
const SITE_BASE = CONFIG.origin;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 24;
const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Popular' },
  { id: 'trending', name: 'Trending' },
  { id: 'title', name: 'A-Z' },
];

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+|porn|sin censura|contenido sexual)$/i;
const SUGGESTIVE_GENRE = /^(mature|maduro|ecchi|bl|yaoi)$/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

function genreNames(genders) {
  if (!Array.isArray(genders)) return [];
  const out = [];
  genders.forEach((g) => {
    const name = cleanText(g && (g.name || (g.gender && g.gender.name)));
    if (name && out.indexOf(name) < 0) out.push(name);
  });
  return out;
}

function mapStatus(stateObj, stateId) {
  const raw = cleanText(stateObj && (stateObj.estado || stateObj.name || stateObj.state || stateObj)).toLowerCase();
  if (raw.includes('finaliz') || raw.includes('complet') || raw.includes('terminad')) return 'COMPLETED';
  if (raw.includes('pausa') || raw.includes('hiatus')) return 'HIATUS';
  if (raw.includes('cancel') || raw.includes('abandonad')) return 'CANCELLED';
  if (raw.includes('emisi') || raw.includes('curso') || raw.includes('activo') || raw.includes('public')) return 'ONGOING';
  if (stateId === 1) return 'ONGOING';
  if (stateId === 2) return 'COMPLETED';
  if (stateId === 3) return 'HIATUS';
  return 'UNKNOWN';
}

function ageOf(s18, tags) {
  if (s18) return 18;
  if (tags.some((t) => ADULT_GENRE.test(t))) return 18;
  if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) return 16;
  return undefined;
}

function peopleOf(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => cleanText(x && (x.name || (x.autor && x.autor.name) || (x.artist && x.artist.name) || x))).filter(Boolean);
}

function toCard(it) {
  const tags = genreNames(it.genders);
  const age = ageOf(it.s18, tags);
  const card = {
    mangaId: it.slug,
    title: cleanText(it.name),
    image: absolute(it.urlImg),
    referer: SITE_BASE + '/',
    tags,
    summary: cleanText(it.sinopsis),
    webURL: `${SITE_BASE}/ver/${encodeURIComponent(it.slug)}`,
    medium: 'novel',
  };
  if (age !== undefined) card.ageRating = age;
  return card;
}

function utf8Length(ch) {
  const code = ch.codePointAt(0);
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

function flightTexts(html) {
  let flight = '';
  const push = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m;
  while ((m = push.exec(html))) {
    try { flight += JSON.parse(m[1]); } catch (e) {}
  }
  const texts = [];
  const row = /(?:^|\n)[0-9a-f]+:T([0-9a-f]+),/g;
  while ((m = row.exec(flight))) {
    let bytes = parseInt(m[1], 16);
    let end = row.lastIndex;
    for (const ch of flight.slice(row.lastIndex)) {
      if (bytes <= 0) break;
      bytes -= utf8Length(ch);
      end += ch.length;
    }
    texts.push(flight.slice(row.lastIndex, end));
    row.lastIndex = end;
  }
  return texts;
}

class Source {
  constructor() {
    this.catalogCache = null;
    this.detailCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async loadCatalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < 300000) return this.catalogCache.items;
    const text = await this.requestRaw(`${SITE_BASE}/api/comics`, true);
    const json = JSON.parse(text);
    const items = (Array.isArray(json && json.response) ? json.response : []).filter((x) => x && x.slug && x.name && x.isVisible !== 0 && x.type === 'novela');
    this.catalogCache = { at: Date.now(), items };
    return items;
  }

  async getSearchTags() {
    try {
      const items = await this.loadCatalog();
      const map = new Map();
      items.forEach((it) => {
        genreNames(it.genders).forEach((name) => {
          const key = name.toLowerCase();
          if (!map.has(key)) map.set(key, { id: key, label: name });
        });
      });
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error(CONFIG.name + ' getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = cleanText(request && request.title).toLowerCase();
    const tags = ((request && request.includedTags) || []).map((t) => cleanText(t && (t.id || t.label)).toLowerCase()).filter(Boolean);
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;

    let list = (await this.loadCatalog()).slice();
    if (query) {
      list = list.filter((it) => {
        const hay = `${it.name || ''} ${it.alternativeName || ''} ${it.slug || ''}`.toLowerCase();
        return hay.indexOf(query) >= 0;
      });
    }
    if (tags.length > 0) {
      list = list.filter((it) => {
        const g = genreNames(it.genders).map((x) => x.toLowerCase());
        return tags.every((t) => g.indexOf(t) >= 0);
      });
    }
    if (feed === 'popular') {
      list.sort((a, b) => (Number(b.ratingCount) || 0) - (Number(a.ratingCount) || 0) || (Number(b.averageRating) || 0) - (Number(a.averageRating) || 0));
    } else if (feed === 'trending') {
      list.sort((a, b) => (b.trending ? 1 : 0) - (a.trending ? 1 : 0) || (Date.parse(b.actualizacionCap || b.updated_at || '') || 0) - (Date.parse(a.actualizacionCap || a.updated_at || '') || 0));
    } else if (feed === 'title') {
      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else {
      list.sort((a, b) => (Date.parse(b.actualizacionCap || b.updated_at || '') || 0) - (Date.parse(a.actualizacionCap || a.updated_at || '') || 0));
    }

    const start = (page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);
    const results = slice.map(toCard).filter((c) => c.mangaId && c.title && c.image);
    return { results, metadata: start + PAGE_SIZE < list.length ? { page: page + 1 } : undefined };
  }

  async loadProject(mangaId) {
    const kept = this.detailCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.data;
    const text = await this.requestRaw(`${SITE_BASE}/api/showProject/${encodeURIComponent(mangaId)}`, true);
    const json = JSON.parse(text);
    const data = json && json.response;
    if (!data) throw new Error(CONFIG.name + ': title not found');
    this.detailCache.set(mangaId, { at: Date.now(), data });
    return data;
  }

  async getMangaDetails(mangaId) {
    const data = await this.loadProject(mangaId);
    const tags = genreNames(data.genders);
    const status = mapStatus(data.state, data.state_id);
    const people = [...peopleOf(data.autors), ...peopleOf(data.artists)];
    const uniquePeople = people.filter((p, i) => people.indexOf(p) === i);
    const age = ageOf(data.s18, tags);
    const info = {
      title: cleanText(data.name) || mangaId,
      image: absolute(data.urlImg),
      referer: SITE_BASE + '/',
      author: uniquePeople.join(', '),
      desc: cleanText(data.sinopsis),
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/ver/${encodeURIComponent(mangaId)}`,
      medium: 'novel',
    };
    if (age !== undefined) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const data = await this.loadProject(mangaId);
    const raw = Array.isArray(data.lastChapters) ? data.lastChapters : [];
    const rows = [];
    const seen = new Set();
    raw.forEach((c) => {
      if (!c || !c.slug || seen.has(c.slug)) return;
      seen.add(c.slug);
      const num = parseFloat(String(c.num || '').replace(',', '.'));
      const baseName = c.name ? `Capítulo ${c.num || ''} - ${cleanText(c.name)}`.trim() : `Capítulo ${c.num || c.slug}`;
      const locked = Boolean(c.patreon) || (Number(c.price_coins) || 0) > 0;
      const name = locked ? `${baseName} (Locked)` : baseName;
      const time = c.created_at ? Date.parse(c.created_at) : undefined;
      rows.push({
        id: c.slug,
        chapterId: c.slug,
        name,
        number: Number.isFinite(num) ? num : 0,
        time: Number.isFinite(time) ? time : undefined,
      });
    });
    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/ver/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestRaw(url, false);
    const paragraphs = [];
    flightTexts(html).forEach((body) => {
      if (paragraphs.length || body.indexOf('<p') < 0) return;
      const $ = cheerio.load(body);
      $('p').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) paragraphs.push(t);
      });
    });
    if (paragraphs.length === 0) throw new Error(CONFIG.name + ': this chapter may be locked or has no text');
    return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
  }

  async requestRaw(url, isJson) {
    const headers = { 'User-Agent': UA };
    if (isJson) headers.Accept = 'application/json';
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers }));
    if (response.status < 200 || response.status >= 300) throw new Error(`${CONFIG.name} HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
