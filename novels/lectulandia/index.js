const SITE = 'https://ww3.lectulandia.co';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const GENRES = [
  { id: 'arqueologia', label: 'Arqueología' },
  { id: 'arte', label: 'Arte' },
  { id: 'autoayuda', label: 'Autoayuda' },
  { id: 'aventuras', label: 'Aventuras' },
  { id: 'biografia', label: 'Biografía' },
  { id: 'ciencia', label: 'Ciencia' },
  { id: 'ciencia-ficcion', label: 'Ciencia ficción' },
  { id: 'clasico', label: 'Clásico' },
  { id: 'cuentos', label: 'Cuentos' },
  { id: 'distopia', label: 'Distopía' },
  { id: 'divulgacion-cientifica', label: 'Divulgación científica' },
  { id: 'drama', label: 'Drama' },
  { id: 'ensayo', label: 'Ensayo' },
  { id: 'erotico', label: 'Erótico' },
  { id: 'espionaje', label: 'Espionaje' },
  { id: 'fantasia', label: 'Fantasía' },
  { id: 'filosofia', label: 'Filosofía' },
  { id: 'historia', label: 'Historia' },
  { id: 'humor', label: 'Humor' },
  { id: 'infantil', label: 'Infantil' },
  { id: 'intriga', label: 'Intriga' },
  { id: 'juvenil', label: 'Juvenil' },
  { id: 'memorias', label: 'Memorias' },
  { id: 'misterio', label: 'Misterio' },
  { id: 'mitologia', label: 'Mitología' },
  { id: 'novela', label: 'Novela' },
  { id: 'novela-negra', label: 'Novela negra' },
  { id: 'poesia', label: 'Poesía' },
  { id: 'policiaco', label: 'Policíaco' },
  { id: 'politica', label: 'Política' },
  { id: 'psicologia', label: 'Psicología' },
  { id: 'realismo-magico', label: 'Realismo mágico' },
  { id: 'relato', label: 'Relato' },
  { id: 'romantico', label: 'Romántico' },
  { id: 'satira', label: 'Sátira' },
  { id: 'teatro', label: 'Teatro' },
  { id: 'terror', label: 'Terror' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'viajes', label: 'Viajes' },
];

function pathOf(href) {
  const match = /\/book\/([^/?#]+)/.exec(href || '');
  return match ? match[1] : null;
}

function extractCookies(headers) {
  if (!headers) return '';
  const key = Object.keys(headers).find((name) => name.toLowerCase() === 'set-cookie');
  if (!key) return '';
  const raw = Array.isArray(headers[key]) ? headers[key].join(', ') : String(headers[key]);
  const cookies = [];
  const parts = raw.split(/,(?=\s*[a-zA-Z0-9_]+=[^;]+)/);
  for (const part of parts) {
    const pair = part.trim().split(';')[0];
    if (pair && pair.includes('=')) {
      const name = pair.split('=')[0].trim();
      if (!/^(path|expires|domain|samesite|max-age|priority)$/i.test(name)) {
        cookies.push(pair);
      }
    }
  }
  return cookies.join('; ');
}

function parseCards($) {
  return $('article.card')
    .map((i, el) => {
      const link = $(el).find('a.title, a.card-click-target').first();
      const mangaId = pathOf(link.attr('href'));
      const title = $(el).find('a.title').first().text().replace(/[\r\n\t]+/g, ' ').trim();
      const img = $(el).find('img.cover').first();
      const image = img.attr('src') || img.attr('data-src');
      const author = $(el).find('div.subdetail a').first().text().trim() || undefined;
      return mangaId && title ? { mangaId, title, image, author, medium: 'novel' } : null;
    })
    .get()
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return [{ id: 'latest', name: 'Últimas novedades' }];
  }

  async getSearchTags() {
    return GENRES;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tag = ((request && request.includedTags) || [])[0];
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = page === 1 ? `${SITE}/search/${encodeURIComponent(query)}/` : `${SITE}/search/${encodeURIComponent(query)}/page/${page}/`;
    } else if (tag && tag.id) {
      url = page === 1 ? `${SITE}/genero/${encodeURIComponent(tag.id)}/` : `${SITE}/genero/${encodeURIComponent(tag.id)}/page/${page}/`;
    } else {
      url = page === 1 ? `${SITE}/book/` : `${SITE}/book/page/${page}/`;
    }
    const $ = cheerio.load(await this.get(url));
    const results = parseCards($);
    const next = $('div.page-nav a.next.page-numbers').length > 0;
    return {
      results,
      metadata: results.length && next ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/book/${mangaId}/`));
    const title = $('#title h1').first().text().replace(/[\r\n\t]+/g, ' ').trim() || mangaId;
    const author = $('#autor a').first().text().trim() || undefined;
    const img = $('#cover img').first();
    const image = img.attr('src') || $('meta[property="og:image"]').attr('content');
    const tags = $('#genero a').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    const serie = $('#serie').text().replace(/[\r\n\t]+/g, ' ').trim();
    const syn = $('#sinopsis span').first();
    syn.find('br').replaceWith('\n\n');
    const desc = [serie, syn.text().replace(/\n{3,}/g, '\n\n').trim()].filter(Boolean).join('\n\n');
    const isAdult = tags.some((t) => /er[oó]tic/i.test(t));
    return {
      mangaInfo: {
        title,
        image,
        desc: desc || undefined,
        author,
        status: 'COMPLETED',
        tags,
        webURL: `${SITE}/book/${mangaId}/`,
        medium: 'novel',
        ageRating: isAdult ? 18 : undefined,
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/book/${mangaId}/`));
    const chapters = [];
    $('#downloadContainer a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const type = $(el).find('input').val() || '';
      const isEpub = /epub|\bt=1\b/i.test(href) || /epub/i.test(type);
      const isPdf = /pdf|\bt=2\b/i.test(href) || /pdf/i.test(type);
      if (!isEpub && !isPdf) return;
      const match = /[?&]d=([^&]+)/.exec(href);
      if (!match) return;
      let code;
      try {
        code = atob(decodeURIComponent(match[1]));
      } catch (_) {
        return;
      }
      const fmt = isEpub ? 'epub' : 'pdf';
      const label = isEpub ? 'EPUB' : 'PDF';
      const chapterId = `${fmt}:${code}`;
      chapters.push({
        id: chapterId,
        chapterId,
        name: `Libro (${label})`,
      });
    });
    if (!chapters.length) throw new Error('Lectulandia: no se encontraron enlaces de descarga');
    return chapters.map((c, i) => ({ ...c, number: i + 1 }));
  }

  async getChapterDetails(mangaId, chapterId) {
    let code = chapterId;
    if (code.includes(':')) code = code.split(':')[1];
    if (!code || code === 'epub' || code === 'pdf') {
      const $ = cheerio.load(await this.get(`${SITE}/book/${mangaId}/`));
      const wantPdf = chapterId.toLowerCase().includes('pdf');
      const selector = wantPdf ? 'a[href*="t=2"]' : 'a[href*="t=1"]';
      const link = $(selector).first();
      const href = link.attr('href') || $('#downloadContainer a').first().attr('href') || '';
      const match = /[?&]d=([^&]+)/.exec(href);
      if (!match) throw new Error('Lectulandia: enlace de descarga no encontrado');
      code = atob(decodeURIComponent(match[1]));
    }
    const fileUrl = `https://www.antupload.com/file/${code}`;
    const response = await this.requests.schedule(App.createRequest({
      url: fileUrl,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': UA,
      },
    }));
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Lectulandia: HTTP ${response.status} al consultar antupload`);
    }
    const $ = cheerio.load(response.data);
    const downloadHref = $('#downloadB').attr('href');
    if (!downloadHref) {
      throw new Error('Lectulandia: el archivo ya no está disponible en antupload');
    }
    const downloadUrl = downloadHref.startsWith('http') ? downloadHref : `https://www.antupload.com${downloadHref}`;
    const cookies = extractCookies(response.headers);
    return {
      id: chapterId,
      mangaId,
      pages: [],
      text: 'Este capítulo es un libro (EPUB o PDF). Si tu lector no lo abre, todavía no admite libros.',
      book: {
        url: downloadUrl,
        headers: {
          Cookie: cookies,
          Referer: fileUrl,
          'User-Agent': UA,
        },
      },
    };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': UA,
      },
    }));
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Lectulandia: HTTP ${response.status} from ${url}`);
    }
    return String(response.data);
  }
}

module.exports = { Source };
