const SITE = 'https://www.leercapitulo.co';

const STATUS = { ongoing: 'ONGOING', completed: 'COMPLETED', paused: 'HIATUS', cancelled: 'CANCELLED' };

function mangaPath(href) {
  const match = /\/manga\/([^/?#]+\/[^/?#]+)/.exec(href || '');
  return match ? match[1] : null;
}

function absolute(src) {
  return src && src.startsWith('/') ? SITE + src : src;
}

function cardsOf($, card, name) {
  const titles = $(card)
    .map((i, el) => {
      const link = $(el).find(name).first();
      const mangaId = mangaPath(link.attr('href'));
      return mangaId && { mangaId, title: link.text().trim(), image: absolute($(el).find('img').attr('src')), medium: 'comics' };
    })
    .get()
    .filter(Boolean);
  return Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 0.5 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/manga/`));
    return $('select[name="genre"] option, select[name="theme"] option')
      .map((i, el) => ({ id: ($(el).attr('value') || '').replace('/manga/?', ''), label: $(el).text().trim() }))
      .get()
      .filter((tag) => /^(genre|theme)=/.test(tag.id));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && request && request.feed === 'latest') {
      return { results: cardsOf(cheerio.load(await this.get(SITE)), 'article.lc-release', 'a.lc-release-title') };
    }
    const params = [];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    const kinds = new Set();
    for (const tag of tags) {
      const kind = tag.id.split('=')[0];
      if (!kinds.has(kind)) params.push(tag.id);
      kinds.add(kind);
    }
    if (page > 1) params.push(`page=${page}`);
    const $ = cheerio.load(await this.get(`${SITE}/manga/?${params.join('&')}`));
    const results = cardsOf($, 'article.lc-card', 'a.lc-card-name');
    return { results, metadata: results.length && $('a.page-link[rel="next"]').length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${mangaId}/`));
    const fact = (label) => $('.lc-facts li').filter((i, el) => $(el).find('.k').text().trim() === label).children().last().text().trim();
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: absolute($('.lc-cover-lg img').attr('src')),
        desc: $('#sinopsis p:not(.lc-muted)').first().text().trim(),
        author: fact('Autor') || undefined,
        artist: fact('Dibujo') || undefined,
        status: STATUS[fact('Estado').toLowerCase()] || 'UNKNOWN',
        tags: $('a.badge[href^="/manga/?genre="], a.badge[href^="/manga/?theme="]').map((i, el) => $(el).text().trim()).get(),
        webURL: `${SITE}/manga/${mangaId}/`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${mangaId}/`));
    return $('a.lc-chapter-row')
      .map((i, el) => {
        const id = (/\/leer\/(.+?)\/?$/.exec($(el).attr('href')) || [])[1];
        const name = $(el).find('.n').text().trim();
        const number = parseFloat((/[\d.]+$/.exec(name) || [])[0]);
        const time = Date.parse($(el).find('.d').text().trim());
        return id && { id, chapterId: id, name, number: Number.isNaN(number) ? undefined : number, time: Number.isNaN(time) ? undefined : time };
      })
      .get()
      .filter(Boolean);
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/leer/${chapterId}/`));
    const pages = $('#lcPages img[data-src]').map((i, el) => $(el).attr('data-src')).get();
    return { id: chapterId, mangaId, pages };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`LeerCapitulo: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
