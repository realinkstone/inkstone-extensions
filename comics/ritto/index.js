const SITE_BASE = 'https://ritto.cc';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', orden: 'vistas' },
  { id: 'latest', name: 'Latest Updates', orden: 'reciente' },
];

const GENRES = [
  ['accion', 'Acción'], ['apocaliptico', 'Apocalíptico'], ['artes-marciales', 'Artes Marciales'],
  ['aventura', 'Aventura'], ['boys-love', 'Boys Love'], ['ciberpunk', 'Ciberpunk'],
  ['ciencia-ficcion', 'Ciencia Ficción'], ['comedia', 'Comedia'], ['crimen', 'Crimen'],
  ['demonios', 'Demonios'], ['deporte', 'Deporte'], ['drama', 'Drama'],
  ['ecchi', 'Ecchi'], ['fantasia', 'Fantasia'], ['girls-love', 'Girls Love'],
  ['gore', 'Gore'], ['guerra', 'Guerra'], ['genero-bender', 'Género Bender'],
  ['harem', 'Harem'], ['historia', 'Historia'], ['horror', 'Horror'],
  ['magia', 'Magia'], ['mecha', 'Mecha'], ['militar', 'Militar'],
  ['misterio', 'Misterio'], ['musica', 'Musica'], ['ninos', 'Niños'],
  ['original', 'Original'], ['parodia', 'Parodia'], ['policiaco', 'Policiaco'],
  ['psicologico', 'Psicológico'], ['realidad', 'Realidad'], ['realidad-virtual', 'Realidad Virtual'],
  ['recuentos-de-la-vida', 'Recuentos de la vida'], ['reencarnacion', 'Reencarnación'], ['romance', 'Romance'],
  ['samurai', 'Samurái'], ['sobrenatural', 'Sobrenatural'], ['superpoderes', 'Superpoderes'],
  ['supervivencia', 'Supervivencia'], ['telenovela', 'Telenovela'], ['thriller', 'Thriller'],
  ['tragedia', 'Tragedia'], ['vampiros', 'Vampiros'], ['vida-escolar', 'Vida Escolar'],
  ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
];


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

function seg(piece) {
  let text = String(piece);
  try {
    text = decodeURIComponent(text);
  } catch (e) {
  }
  return encodeURIComponent(text);
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
    const rsc = extractNextF(html);
    const results = [];
    const seen = new Set();

    const cards = findArrayContaining(rsc, '"obraId"');
    (Array.isArray(cards) ? cards : []).forEach((c) => {
      if (!c || !c.href || String(c.tipo || '').toLowerCase() === 'novela') return;
      const m = /\/obra\/([^/?#]+)/.exec(String(c.href));
      if (!m) return;
      const mangaId = m[1];
      if (seen.has(mangaId)) return;
      const title = cleanText(c.titulo);
      const image = absolute(c.portada);
      if (!title || !image) return;
      seen.add(mangaId);
      const genres = Array.isArray(c.generos) ? c.generos.map(cleanText).filter(Boolean) : [];
      const card = {
        mangaId,
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/obra/${seg(mangaId)}`,
        medium: 'comics',
      };
      if (genres.length) card.tags = genres;
      if (c.adulto === true || genres.some((t) => ADULT_GENRE.test(t))) card.ageRating = 18;
      else if (genres.some((t) => SUGGESTIVE_GENRE.test(t))) card.ageRating = 16;
      results.push(card);
    });

    const pm = /"pagina":(\d+),"totalPaginas":(\d+)/.exec(rsc);
    const hasNext = pm ? parseInt(pm[1], 10) < parseInt(pm[2], 10) : false;
    return { results, metadata: hasNext && results.length > 0 ? { page: page + 1 } : undefined };
  }

  async titleHtml(mangaId) {
    const kept = this.pageCache.get(mangaId);
    if (kept && Date.now() - kept.at < 300000) return kept.html;
    const html = await this.requestHTML(`${SITE_BASE}/obra/${seg(mangaId)}`);
    this.pageCache.set(mangaId, { at: Date.now(), html });
    return html;
  }

  async getMangaDetails(mangaId) {
    const html = await this.titleHtml(mangaId);
    const $ = cheerio.load(html);
    const title = cleanText($('h1.obra-head__titulo').first().text()) || cleanText($('h1').first().text()) || mangaId;
    const image = absolute($('meta[property="og:image"]').attr('content') || $('img.cover-img').first().attr('src'));
    const desc = cleanText($('.sinopsis__texto').first().text()) || title;

    const authorBox = $('.obra-head__autor').first().clone();
    authorBox.find('i').remove();
    const author = cleanText(authorBox.text()).replace(/[\s·]+$/, '');

    const tags = [];
    $('a.chip[href*="genero="]').each((_, el) => {
      const g = cleanText($(el).text());
      if (g && tags.indexOf(g) === -1) tags.push(g);
    });

    let status = 'UNKNOWN';
    $('dt').each((_, el) => {
      if (cleanText($(el).text()).toLowerCase() !== 'estado') return;
      const v = cleanText($(el).next('dd').text()).toLowerCase();
      if (v.indexOf('emisi') >= 0 || v.indexOf('curso') >= 0) status = 'ONGOING';
      else if (v.indexOf('finaliz') >= 0 || v.indexOf('complet') >= 0) status = 'COMPLETED';
      else if (v.indexOf('paus') >= 0 || v.indexOf('hiato') >= 0) status = 'HIATUS';
      else if (v.indexOf('cancel') >= 0) status = 'CANCELLED';
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
      webURL: `${SITE_BASE}/obra/${seg(mangaId)}`,
      medium: 'comics',
    };
    if (tags.some((t) => ADULT_GENRE.test(t))) info.ageRating = 18;
    else if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const html = await this.titleHtml(mangaId);
    const rsc = extractNextF(html);
    const arr = findArrayContaining(rsc, '"versiones"');
    const rows = [];
    const seen = new Set();

    const pushEntry = (row, v) => {
      if (!v || !v.href) return;
      const cid = String(v.href).trim();
      if (!cid || seen.has(cid)) return;
      seen.add(cid);
      const parts = [cleanText(row.etiqueta), cleanText(row.titulo)].filter(Boolean);
      const name = parts.join(' - ') || cid;
      const numM = /(\d+(?:\.\d+)?)/.exec(name);
      const number = typeof row.numero === 'number' ? row.numero : (numM ? parseFloat(numM[1]) : 0);
      const time = v.publicado ? Date.parse(v.publicado) : NaN;
      const group = cleanText(v.scan) || undefined;
      rows.push({ id: cid, name, number, time: Number.isFinite(time) ? time : undefined, group, locked: !!v.bloqueo });
    };

    if (Array.isArray(arr)) {
      arr.forEach((row) => {
        if (!row || !Array.isArray(row.versiones)) return;
        row.versiones.forEach((v) => pushEntry(row, v));
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
    const rsc = extractNextF(await this.requestHTML(url));
    const servers = findArrayContaining(rsc, '"paginas"');
    let pages = [];
    (Array.isArray(servers) ? servers : []).forEach((sv) => {
      if (pages.length === 0 && sv && Array.isArray(sv.paginas)) pages = sv.paginas.map((u) => absolute(cleanText(u))).filter(Boolean);
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
