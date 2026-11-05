const SITE = 'https://manhwa-latino.com';

const STATUS = { ongoing: 'ONGOING', completed: 'COMPLETED', 'on hold': 'HIATUS', canceled: 'CANCELLED', cancelled: 'CANCELLED' };

function slugOf(href) {
  return (/\/manga\/([^/?#]+)\/?$/.exec(href || '') || [])[1];
}

function imageOf(img) {
  return ((img.attr('data-src') || img.attr('src') || '').trim()) || undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 0.5 } });
  }

  getSourceFeeds() {
    return [
      { id: 'views', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const found = JSON.parse(await this.send({
        url: `${SITE}/wp-admin/admin-ajax.php`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `action=wp-manga-search-manga&title=${encodeURIComponent(query)}`,
      }));
      const results = (found.success ? found.data : [])
        .map((item) => ({ mangaId: slugOf(item.url), title: item.title, medium: 'comics' }))
        .filter((title) => title.mangaId);
      return { results };
    }
    const order = request && request.feed === 'latest' ? 'latest' : 'views';
    const $ = cheerio.load(await this.get(`${SITE}/manga/${page > 1 ? `page/${page}/` : ''}?m_orderby=${order}`));
    const titles = $('.page-item-detail .item-thumb a[title]')
      .map((i, el) => {
        const mangaId = slugOf($(el).attr('href'));
        return mangaId && { mangaId, title: $(el).attr('title').trim(), image: imageOf($(el).find('img').first()), medium: 'comics' };
      })
      .get()
      .filter(Boolean);
    const results = Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
    return { results, metadata: results.length && $('a.nextpostslink').length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/`));
    const item = (label) => $('div.post-content_item').filter((i, el) => $(el).find('.summary-heading, h5').first().text().trim().startsWith(label)).first();
    const heading = $('h1').not('.popup-title').first().clone();
    heading.find('span').remove();
    const status = item('Estado').find('.summary-content').text().trim().toLowerCase();
    return {
      mangaInfo: {
        title: heading.text().replace(/\s*>>.*$/, '').trim() || mangaId,
        image: imageOf($('.summary_image img').first()),
        desc: item('Resumen').find('.summary-container').first().text().trim(),
        author: item('Author').find('.summary-content').text().trim() || undefined,
        artist: item('Artist').find('.summary-content').text().trim() || undefined,
        status: STATUS[status] || 'UNKNOWN',
        tags: item('Genre').find('a').map((i, el) => $(el).text().trim()).get(),
        webURL: `${SITE}/manga/${mangaId}/`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/`));
    const chapters = $('li.wp-manga-chapter')
      .map((i, el) => {
        const link = $(el).find('div.mini-letters > a').first();
        const id = (/\/manga\/[^/]+\/([^/?#]+)/.exec(link.attr('href') || $(el).find('a[href]').attr('href') || '') || [])[1];
        const name = link.text().replace(/\s+/g, ' ').trim() || `Capitulo ${id}`;
        const number = parseFloat((/([\d.]+)/.exec(name) || [])[1]);
        return id && { id, chapterId: id, name, number: Number.isNaN(number) ? undefined : number };
      })
      .get()
      .filter(Boolean);
    return Array.from(new Map(chapters.map((chapter) => [chapter.id, chapter])).values());
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`));
    const pages = $('div.page-break img.wp-manga-chapter-img')
      .map((i, el) => imageOf($(el)))
      .get()
      .filter((src) => /^https?:\/\//.test(src));
    return { id: chapterId, mangaId, pages, referer: `${SITE}/` };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest(request));
    if (response.status < 200 || response.status >= 300) throw new Error(`Manhwa Latino: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
