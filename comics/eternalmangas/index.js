const SITE = 'https://eternalmangas.org';

const STATUS = { 'en emisión': 'ONGOING', finalizado: 'COMPLETED', pausado: 'HIATUS', cancelado: 'CANCELLED', abandonado: 'CANCELLED' };

function cardsOf($, selector) {
  const titles = $(selector)
    .filter((i, el) => $(el).find('.em-series-type-badge').text().trim() !== 'Novela')
    .map((i, el) => {
      const mangaId = (/\/series\/([^/?#]+)/.exec($(el).attr('href')) || [])[1];
      const image = $(el).find('img').first();
      return mangaId && { mangaId, title: (image.attr('alt') || '').trim(), image: image.attr('src'), medium: 'comics' };
    })
    .get()
    .filter((title) => title && title.title);
  return Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/series`));
    return $('select[name="genre"] option')
      .map((i, el) => ({ id: $(el).attr('value'), label: $(el).text().trim() }))
      .get()
      .filter((tag) => tag.id && tag.label);
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'popular') {
      return { results: cardsOf(cheerio.load(await this.get(SITE)), 'a.em-popular-card') };
    }
    const params = [];
    if (query) params.push(`search=${encodeURIComponent(query)}`);
    if (tags.length) params.push(`genre=${encodeURIComponent(tags[0].id)}`);
    params.push(`page=${page}`);
    const $ = cheerio.load(await this.get(`${SITE}/series?${params.join('&')}`));
    const results = cardsOf($, 'a.em-series-catalog-card');
    return { results, metadata: results.length && $('a[rel="next"]').length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/series/${encodeURIComponent(mangaId)}`));
    const status = $('li').filter((i, el) => $(el).find('strong').first().text().trim() === 'Estado:').first();
    status.find('strong').remove();
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: $('img.em-cover-lg').attr('src'),
        desc: $('#resume-content').text().trim(),
        status: STATUS[status.text().trim().toLowerCase()] || 'UNKNOWN',
        tags: $('#tab-sinopsis .em-badge').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/series/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/series/${encodeURIComponent(mangaId)}`));
    const group = $('#tab-sinopsis a[href*="/teams/"]').map((i, el) => $(el).text().trim()).get().join(', ');
    return $('#chapter-list .em-chapter-row > a')
      .map((i, el) => {
        const id = (/\/series\/[^/]+\/([^/?#]+)/.exec($(el).attr('href')) || [])[1];
        const name = $(el).find('.fw-semibold').first().text().trim();
        const number = parseFloat((/([\d.]+)/.exec(name) || [])[1]);
        return id && { id, chapterId: id, name, number: Number.isNaN(number) ? undefined : number, group: group || undefined };
      })
      .get()
      .filter(Boolean);
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/series/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`));
    const pages = $('#em-reader-pages img.em-reader-img')
      .map((i, el) => $(el).attr('data-src') || $(el).attr('src'))
      .get()
      .filter((src) => /^https?:\/\//.test(src));
    return { id: chapterId, mangaId, pages };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Eternal Mangas: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
