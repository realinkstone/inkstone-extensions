const SITE_BASE = 'https://ritto.cc';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', orden: 'vistas' },
  { id: 'latest', name: 'Latest Updates', orden: 'reciente' },
];

const GENRES = [
  ['accion', 'Acción'], ['artes-marciales', 'Artes Marciales'], ['aventura', 'Aventura'],
  ['boys-love', 'Boys Love'], ['ciencia-ficcion', 'Ciencia Ficción'], ['comedia', 'Comedia'],
  ['crimen', 'Crimen'], ['demonios', 'Demonios'], ['deporte', 'Deporte'],
  ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasia', 'Fantasía'],
  ['girls-love', 'Girls Love'], ['gore', 'Gore'], ['guerra', 'Guerra'],
  ['harem', 'Harem'], ['historico', 'Histórico'], ['horror', 'Horror'],
  ['isekai', 'Isekai'], ['josei', 'Josei'], ['magia', 'Magia'],
  ['mecha', 'Mecha'], ['misterio', 'Misterio'], ['psicologico', 'Psicológico'],
  ['recuentos-de-la-vida', 'Recuentos de la vida'], ['romance', 'Romance'],
  ['seinen', 'Seinen'], ['shojo', 'Shojo'], ['shonen', 'Shonen'],
  ['sobrenatural', 'Sobrenatural'], ['tragedia', 'Tragedia'],
];

const MONTHS_ES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sept: 8, sep: 8, oct: 9, nov: 10, dic: 11,
};

const ADULT_GENRE = /^(adult|adulto|hentai|smut|erotica|erótico|erotico|nsfw|\+18|18\+)$/i;
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

function findArrayContaining(rsc, needle) {
  const idx = rsc.indexOf(needle);
  if (idx === -1) return null;
  for (let i = idx; i >= 0; i--) {
    if (rsc.charAt(i) === '[') {
      const slice = extractBalanced(rsc, i, '[', ']');
      if (slice && slice.indexOf(needle) !== -1) {
        try {
          const parsed = JSON.parse(slice);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
      }
    }
  }
  return null;
}

function parseDateEs(text) {
  const m = /(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/i.exec(cleanText(text));
  if (!m) return undefined;
  const mon = MONTHS_ES[m[2].toLowerCase()];
  if (mon === undefined) return undefined;
  const t = Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
  return Number.isFinite(t) ? t : undefined;
}

function mapStatusFromHref(href) {
  const m = /[?&]estado=([^&]+)/.exec(String(href || ''));
  const val = m ? m[1].toUpperCase() : '';
  if (val === 'EN_EMISION') return 'ONGOING';
  if (val === 'FINALIZADO') return 'COMPLETED';
  if (val === 'PAUSADO') return 'HIATUS';
  if (val === 'CANCELADO') return 'CANCELLED';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.pageCache = new Map();
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const tags = ((request && request.includedTags) || []).filter((t) => t && t.id);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    const params = [`pagina=${page}`];
    if (query) params.push(`busqueda=${encodeURIComponent(query)}`);
    else params.push(`orden=${encodeURIComponent(feed.orden)}`);
    if (tags.length > 0) params.push(`genero=${encodeURIComponent(tags[0].id)}`);

    const html = await this.requestHTML(`${SITE_BASE}/catalogo?${params.join('&')}`);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    $('a.ritto-work-card').each((_, el) => {
      const card = $(el);
      let isNovel = false;
      card.find('span').each((__, sp) => {
        if (cleanText($(sp).text()) === 'Novela') isNovel = true;
      });
      if (isNovel) return;
      const href = String(card.attr('href') || '').trim();
      const m = /\/obra\/([^/?#]+)/.exec(href);
      if (!m) return;
      const mangaId = m[1];
      if (seen.has(mangaId)) return;
      const title = cleanText(card.find('h3').first().text());
      const image = absolute(card.find('img').first().attr('src'));
      if (!title || !image) return;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/obra/${encodeURIComponent(mangaId)}`,
        medium: 'comics',
      });
    });

    const rsc = extractNextF(html);
    const pm = /"paginaActual":(\d+),"totalPaginas":(\d+)/.exec(rsc);
    const hasNext = pm ? parseInt(pm[1], 10) < parseInt(pm[2], 10) : false;
    return { results, metadata: hasNext && results.length > 0 ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/obra/${encodeURIComponent(mangaId)}`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const html = await this.titleHtml(mangaId);
    const $ = cheerio.load(html);
    const title = cleanText($('h1.rf-hero__title').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('.rf-hero__cover img').first().attr('src') || $('img').first().attr('src'));
    const desc = cleanText($('.rf-hero__synopsis .whitespace-pre-wrap').first().text()) || cleanText($('.rf-hero__synopsis').first().text()) || title;

    let author = '';
    const tags = [];
    let status = 'UNKNOWN';
    $('a[href*="estado="]').each((_, el) => {
      if (status === 'UNKNOWN') status = mapStatusFromHref($(el).attr('href'));
    });
    $('a[href*="/autor/"]').each((_, el) => {
      const a = cleanText($(el).text());
      if (a && !author) author = a;
    });
    $('a[href*="genero="], .rf-hero__genres a').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });

    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author,
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/obra/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const html = await this.titleHtml(mangaId);
    const rsc = extractNextF(html);
    const arr = findArrayContaining(rsc, '"capituloEsImagen"');
    const rows = [];
    const seen = new Set();

    const pushEntry = (entry, fallbackNum) => {
      if (!entry || !entry.capituloEsImagen || !entry.href) return;
      const cid = String(entry.href).trim();
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      const parts = [cleanText(entry.nombre), cleanText(entry.tituloExtra)].filter(Boolean);
      const name = parts.join(' - ') || cid;
      const numVal = typeof entry.numero === 'number' ? entry.numero : (typeof fallbackNum === 'number' ? fallbackNum : NaN);
      const numM = /(\d+(?:\.\d+)?)/.exec(name);
      const number = Number.isFinite(numVal) ? numVal : (numM ? parseFloat(numM[1]) : 0);
      const time = parseDateEs(entry.fechaLabel);
      const group = cleanText(entry.scanLabel) || undefined;
      rows.push({ id: cid, chapterId: cid, name, number, time, group });
    };

    if (Array.isArray(arr)) {
      arr.forEach((c) => {
        if (!c) return;
        pushEntry(c, c.numero);
        if (Array.isArray(c.versiones)) {
          c.versiones.forEach((v) => pushEntry(v, c.numero));
        }
      });
    }

    rows.reverse();
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      if (r.group) ch.group = r.group;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = absolute(chapterId);
    const $ = cheerio.load(await this.requestHTML(url));
    const pages = [];
    $('img.reader-image').each((_, el) => {
      const src = cleanText($(el).attr('src') || $(el).attr('data-src'));
      if (src) pages.push(absolute(src));
    });
    if (pages.length === 0) throw new Error('Ritto returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestHTML(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Ritto HTTP ${response.status}`);
    return response.data;
  }
}

module.exports = { Source };
