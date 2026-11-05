const SITE = 'https://es.wikisource.org';
const API = `${SITE}/w/api.php`;
const USER_AGENT = 'InkstoneWikisource/1.0 (https://github.com/realinkstone/inkstone-extensions)';
const LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Wikisource-logo.svg/330px-Wikisource-logo.svg.png';

const PAGE_SIZE = 30;
const PAGE_CACHE_MS = 5 * 60 * 1000;

const CATEGORIES = [
  { id: 'Novelas', label: 'Novelas' },
  { id: 'Novelas_cortas', label: 'Novelas cortas' },
  { id: 'Cuentos', label: 'Cuentos' },
  { id: 'Leyendas', label: 'Leyendas' },
  { id: 'Fábulas', label: 'Fábulas' },
  { id: 'Ensayos', label: 'Ensayos' },
  { id: 'Teatro', label: 'Teatro' },
  { id: 'Poesías', label: 'Poesía' },
];

function wikiUrl(title) {
  return `${SITE}/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')}`;
}

function titleOfHref(href) {
  const match = /^\/wiki\/([^?#]+)/.exec(href || '');
  return match ? decodeURIComponent(match[1]).replace(/_/g, ' ') : null;
}

function partialOf(page) {
  return {
    mangaId: page.title,
    title: page.title,
    image: LOGO,
    webURL: wikiUrl(page.title),
    medium: 'novel',
  };
}

function subpagesOf(html, title) {
  const $ = cheerio.load(html);
  const found = [];
  $('a[href^="/wiki/"]').each((i, el) => {
    if ($(el).closest('#headertemplate').length) return;
    const linked = titleOfHref($(el).attr('href'));
    if (linked && linked.startsWith(`${title}/`) && !found.some((item) => item.title === linked)) {
      found.push({ title: linked, name: $(el).text().replace(/\s+/g, ' ').trim() || linked.slice(title.length + 1) });
    }
  });
  return found;
}

function paragraphsOf(html) {
  const $ = cheerio.load(html);
  $('[style*="display:none"], [style*="display: none"]').remove();
  $('style, script, #headertemplate, #ws-data, .ws-noexport, .noprint, .pagenum, .mw-editsection, sup.reference, ol.references, .mw-references-wrap, table').remove();
  $('br').replaceWith('\n');
  $('p, div, h1, h2, h3, h4, h5, li, dd, blockquote').append('\n');
  return $.root()
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    this.pages = new Map();
  }

  getSourceFeeds() {
    return CATEGORIES.map((category) => ({ id: category.id, name: category.label }));
  }

  async getSearchTags() {
    return CATEGORIES;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tag = ((request && request.includedTags) || [])[0];
    const params = { action: 'query' };
    if (query) {
      const offset = (metadata && metadata.offset) || 0;
      Object.assign(params, { generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: String(PAGE_SIZE), gsroffset: String(offset) });
      const reply = await this.api(params);
      const pages = ((reply.query && reply.query.pages) || []).sort((a, b) => a.index - b.index);
      const next = reply.continue && reply.continue.gsroffset;
      return {
        results: pages.filter((page) => !page.title.includes('/')).map(partialOf),
        metadata: next ? { offset: next } : undefined,
      };
    }
    const category = (tag && tag.id) || (request && request.feed) || CATEGORIES[0].id;
    Object.assign(params, { generator: 'categorymembers', gcmtitle: `Categoría:${category}`, gcmnamespace: '0', gcmtype: 'page', gcmlimit: String(PAGE_SIZE) });
    if (metadata && metadata.cursor) params.gcmcontinue = metadata.cursor;
    const reply = await this.api(params);
    const pages = ((reply.query && reply.query.pages) || []).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    const next = reply.continue && reply.continue.gcmcontinue;
    return { results: pages.filter((page) => !page.title.includes('/')).map(partialOf), metadata: next ? { cursor: next } : undefined };
  }

  page(title) {
    const cached = this.pages.get(title);
    if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return cached.promise;
    const promise = this.api({ action: 'parse', page: title, prop: 'text|categories', redirects: '1' }).then((reply) => {
      if (reply.error) throw new Error(`Wikisource: ${reply.error.info}`);
      return reply.parse;
    });
    this.pages.set(title, { at: Date.now(), promise });
    promise.catch(() => this.pages.delete(title));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const page = await this.page(mangaId);
    const $ = cheerio.load(page.text);
    const author = ($('#ws-data .ws-author').first().text() || $('#headertemplate a[href^="/wiki/Autor:"]').first().text()).replace(/^Autor:/, '').trim() || undefined;
    const year = $('#ws-data .ws-year').first().text().trim();
    const notes = $('#ws-data .ws-notes').first().text().replace(/\s+/g, ' ').trim();
    const tags = (page.categories || [])
      .filter((category) => !category.hidden)
      .map((category) => category.category.replace(/_/g, ' '))
      .filter((name) => !/^(Textos|ES-|P\d|Publicado|Obras por|Wikisource)/.test(name) && name !== mangaId);
    const intro = [year && `Publicada en ${year}.`, notes].filter(Boolean).join('\n\n');
    return {
      mangaInfo: {
        title: page.title,
        image: LOGO,
        author,
        desc: intro || `${page.title}${author ? `, de ${author}` : ''}. Texto de dominio público en Wikisource.`,
        status: 'COMPLETED',
        tags,
        webURL: wikiUrl(page.title),
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const page = await this.page(mangaId);
    const parts = subpagesOf(page.text, page.title);
    if (!parts.length) return [{ id: page.title, chapterId: page.title, name: page.title, number: 1 }];
    const chapters = [];
    for (const part of parts) {
      const inner = /\b(parte|libro|tomo|volumen)\b/i.test(part.name) ? subpagesOf((await this.page(part.title)).text, part.title) : [];
      if (inner.length) inner.forEach((chapter) => chapters.push({ ...chapter, name: `${part.name}: ${chapter.name}` }));
      else chapters.push(part);
    }
    return chapters.map((chapter, i) => ({ id: chapter.title, chapterId: chapter.title, name: chapter.name, number: i + 1 })).reverse();
  }

  async getChapterDetails(mangaId, chapterId) {
    const paragraphs = paragraphsOf((await this.page(chapterId)).text);
    if (!paragraphs.length) throw new Error('Wikisource: the chapter has no text');
    return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
  }

  async api(params) {
    const query = Object.entries({ ...params, format: 'json', formatversion: '2', origin: '*' })
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    const url = `${API}?${query}`;
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Wikisource: HTTP ${response.status} from ${url}`);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }
}

module.exports = { Source };
