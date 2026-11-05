const SITE = 'https://leermanhwas.com';

const GENRES = [
  ['accion', 'Acción'], ['adulto', 'Adulto'], ['aventura', 'Aventura'], ['ciencia-ficcion', 'Ciencia ficción'], ['comedia', 'Comedia'],
  ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['familia', 'Familia'], ['fantasia', 'Fantasía'], ['harem', 'Harem'],
  ['isekai', 'Isekai'], ['josei', 'Josei'], ['maduro', 'Maduro'], ['magia', 'Magia'], ['recuentos-de-la-vida', 'Recuentos de la vida'],
  ['reencarnacion', 'Reencarnación'], ['romance', 'Romance'], ['seinen', 'Seinen'], ['shonen', 'Shonen'], ['sin-censura', 'Sin censura'],
  ['smut', 'Smut'], ['sobrenatural', 'Sobrenatural'], ['supervivencia', 'Supervivencia'], ['vida-escolar', 'Vida escolar'],
];

function absolute(src) {
  return src && src.startsWith('/') ? SITE + src : src;
}

function slugOf(href) {
  return (/\/manhwa\/([^/?#]+)\/?$/.exec(href || '') || [])[1];
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const url = query
      ? `${SITE}/search/?s=${encodeURIComponent(query)}&page=${page}`
      : tags.length
        ? `${SITE}/genero/${encodeURIComponent(tags[0].id)}/page/${page}/`
        : `${SITE}/page/${page}/`;
    const $ = cheerio.load(await this.get(url));
    const titles = $('.latest-list .latest-item, .list .list-item')
      .map((i, el) => {
        const link = $(el).find('.latest-right a:has(h3), .latest-right a:has(h4), .item-title a').first();
        const mangaId = slugOf(link.attr('href'));
        return mangaId && { mangaId, title: link.text().trim(), image: absolute($(el).find('.latest-left img, .item-img img').attr('src')), medium: 'comics' };
      })
      .get()
      .filter(Boolean);
    const results = Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
    return { results, metadata: results.length && $('#pagination li.next a').length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manhwa/${encodeURIComponent(mangaId)}/`));
    const info = (label) => $('.main-info-list li').filter((i, el) => $(el).find('h5').text().trim().replace(/:$/, '') === label).first();
    const status = info('Estado').children().not('h5').text().trim().toLowerCase();
    return {
      mangaInfo: {
        title: $('h1.main-info-title').first().text().trim() || mangaId,
        image: absolute($('img.img-cover').attr('src')),
        desc: $('.short-desc-content p').map((i, el) => $(el).text().trim()).get().filter(Boolean).join('\n\n'),
        status: status === 'ongoing' ? 'ONGOING' : status === 'completed' ? 'COMPLETED' : 'UNKNOWN',
        tags: info('Géneros').find('a').map((i, el) => $(el).text().trim()).get(),
        webURL: `${SITE}/manhwa/${mangaId}/`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manhwa/${encodeURIComponent(mangaId)}/`));
    const chapters = $('ul.chapter-list li a[href]')
      .map((i, el) => {
        const id = (/\/manhwa\/[^/]+\/([^/?#]+)/.exec($(el).attr('href')) || [])[1];
        const name = $(el).find('.chapter-name').text().trim() || $(el).attr('title');
        const number = parseFloat((/([\d.]+)\s*$/.exec(name) || [])[1]);
        return id && { id, chapterId: id, name, number: Number.isNaN(number) ? undefined : number };
      })
      .get()
      .filter(Boolean);
    return Array.from(new Map(chapters.map((chapter) => [chapter.id, chapter])).values());
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/manhwa/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`));
    const pages = $('.reading-content img, .read-content img').map((i, el) => absolute($(el).attr('src') || $(el).attr('data-src'))).get().filter(Boolean);
    return { id: chapterId, mangaId, pages };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Leer Manhwas: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
