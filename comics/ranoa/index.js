const SITE_BASE = 'https://www.ranoa.lat';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'all', name: 'All Series' },
];

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

function extractNextF(html) {
  const parts = [];
  const re = /self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      parts.push(JSON.parse('"' + m[1] + '"'));
    } catch (e) {}
  }
  return parts.join('');
}

function extractBalanced(str, startIdx, openChar, closeChar) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str.charAt(i);
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return str.slice(startIdx, i + 1);
    }
  }
  return '';
}

function extractFieldArray(rsc, keyName) {
  const needle = '"' + keyName + '":[';
  const idx = rsc.indexOf(needle);
  if (idx === -1) return null;
  const start = idx + keyName.length + 3;
  const slice = extractBalanced(rsc, start, '[', ']');
  if (!slice) return null;
  try {
    return JSON.parse(slice);
  } catch (e) {
    return null;
  }
}

function resolveRscRef(rsc, val) {
  if (typeof val !== 'string') return val;
  const m = /^\$L?([0-9a-f]+)$/i.exec(val);
  if (!m) return val;
  const id = m[1];
  const re = new RegExp('(?:^|\\n)' + id + ':([\\[\\{])');
  const hit = re.exec(rsc);
  if (!hit) return val;
  const start = hit.index + hit[0].length - 1;
  const open = hit[1];
  const close = open === '[' ? ']' : '}';
  const slice = extractBalanced(rsc, start, open, close);
  if (!slice) return val;
  try {
    return JSON.parse(slice);
  } catch (e) {
    return val;
  }
}

function findDeep(node, key) {
  if (!node || typeof node !== 'object') return undefined;
  if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, key)) return node[key];
  const vals = Array.isArray(node) ? node : Object.values(node);
  for (let i = 0; i < vals.length; i++) {
    const found = findDeep(vals[i], key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function collectVolumes(node, out) {
  if (!node || typeof node !== 'object') return;
  if (!Array.isArray(node)) {
    if (Object.prototype.hasOwnProperty.call(node, 'data-book-number')) {
      out.push(node);
      return;
    }
    Object.values(node).forEach((v) => collectVolumes(v, out));
  } else {
    node.forEach((v) => collectVolumes(v, out));
  }
}

class Source {
  constructor() {
    this.catalogCache = null;
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async loadCatalog(key) {
    if (!key && this.catalogCache && Date.now() - this.catalogCache.at < 300000) {
      return this.catalogCache;
    }
    const url = key ? `${SITE_BASE}/manga?obra=${encodeURIComponent(key)}` : `${SITE_BASE}/manga`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const metaDesc = cleanText($('meta[name="description"]').attr('content'));
    const rsc = extractNextF(html);
    const obras = extractFieldArray(rsc, 'obras') || [];
    const data = { at: Date.now(), obras, metaDesc, rsc };
    if (!key) this.catalogCache = data;
    return data;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const page = (metadata && metadata.page) || 1;
    if (page > 1) return { results: [], metadata: undefined };
    const query = cleanText(request && request.title).toLowerCase();
    const { obras } = await this.loadCatalog();
    const results = obras
      .filter((w) => w && w.key && w.titulo && (!query || String(w.titulo).toLowerCase().includes(query)))
      .map((w) => ({
        mangaId: String(w.key),
        title: cleanText(w.titulo),
        image: absolute(w.imagen),
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/manga?obra=${encodeURIComponent(w.key)}`,
        medium: 'comics',
      }))
      .filter((r) => r.image);
    return { results, metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const { obras, metaDesc, rsc } = await this.loadCatalog(mangaId);
    const work = obras.find((w) => w && String(w.key) === String(mangaId));
    if (!work) throw new Error('Ranoa: work not found');
    const content = resolveRscRef(rsc, work.contenido);
    const st = String(findDeep(content, 'data-publication-status') || '').toLowerCase();
    const status = st === 'ongoing' ? 'ONGOING' : (st === 'completed' ? 'COMPLETED' : 'UNKNOWN');
    return {
      mangaInfo: {
        title: cleanText(work.titulo) || mangaId,
        image: absolute(work.imagen),
        referer: SITE_BASE + '/',
        author: '',
        desc: metaDesc || cleanText(work.contexto) || cleanText(work.titulo),
        status,
        completed: status === 'COMPLETED',
        tags: [],
        webURL: `${SITE_BASE}/manga?obra=${encodeURIComponent(mangaId)}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const { obras, rsc } = await this.loadCatalog(mangaId);
    const work = obras.find((w) => w && String(w.key) === String(mangaId));
    if (!work) throw new Error('Ranoa: work not found');
    const content = resolveRscRef(rsc, work.contenido);
    const volumes = [];
    collectVolumes(content, volumes);
    const rows = [];
    const seen = new Set();
    volumes.forEach((vol) => {
      const href = String(findDeep(vol, 'href') || '');
      const chs = findDeep(vol, 'chapters');
      if (!href || !Array.isArray(chs)) return;
      chs.forEach((c) => {
        if (!c || c.number === undefined || c.number === null) return;
        const numText = String(c.number).replace(/\.0$/, '');
        const cid = href.replace('/tomo/', '/leer/') + '/' + numText;
        if (seen.has(cid)) return;
        seen.add(cid);
        const title = cleanText(c.title);
        const name = title.indexOf('Capítulo') === 0 ? title : (title ? `Capítulo ${numText}: ${title}` : `Capítulo ${numText}`);
        const num = parseFloat(numText);
        const time = c.publishedAt ? Date.parse(c.publishedAt) : undefined;
        rows.push({
          id: cid,
          chapterId: cid,
          name,
          number: Number.isFinite(num) ? num : 0,
          time: Number.isFinite(time) ? time : undefined,
        });
      });
    });
    rows.sort((a, b) => a.number - b.number);
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
    const html = await this.requestHTML(absolute(chapterId));
    const rsc = extractNextF(html);
    const arr = extractFieldArray(rsc, 'pages') || [];
    const pages = arr.map((p) => absolute(p && p.imageUrl)).filter(Boolean);
    if (pages.length === 0) throw new Error('Ranoa returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Ranoa HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
