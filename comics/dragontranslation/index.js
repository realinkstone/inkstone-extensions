const SITE = 'https://dragontranslation.org';

const STATUS = { ongoing: 'ONGOING', completed: 'COMPLETED', 'on hold': 'HIATUS', canceled: 'CANCELLED', cancelled: 'CANCELLED' };

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function slugOf(href, kind) {
  return (new RegExp(`/${kind}/([^/?#]+)`).exec(href || '') || [])[1];
}

function dateOf(text) {
  const match = /([a-zñ]+)\s+(\d{1,2}),\s*(\d{4})/i.exec(text || '');
  const month = match ? MONTHS.indexOf(match[1].toLowerCase()) : -1;
  return month < 0 ? undefined : Date.UTC(+match[3], month, +match[2]);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return [
      { id: 'views', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/manga/`));
    const tags = $('a[href*="/manga-genre/"]')
      .map((i, el) => ({ id: slugOf($(el).attr('href'), 'manga-genre'), label: $(el).text().trim() }))
      .get()
      .filter((tag) => tag.id && tag.label);
    return Array.from(new Map(tags.map((tag) => [tag.id, tag])).values());
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const paged = page > 1 ? `page/${page}/` : '';
    const order = request && request.feed === 'latest' ? 'latest' : 'views';
    const url = query
      ? `${SITE}/${paged}?s=${encodeURIComponent(query)}&post_type=wp-manga`
      : tags.length
        ? `${SITE}/manga-genre/${encodeURIComponent(tags[0].id)}/${paged}`
        : `${SITE}/manga/${paged}?m_orderby=${order}`;
    const $ = cheerio.load(await this.get(url));
    const titles = $('a:has(.ac-img)')
      .map((i, el) => {
        const mangaId = slugOf($(el).attr('href'), 'manga');
        return mangaId && { mangaId, title: ($(el).attr('title') || '').trim(), image: $(el).find('img').attr('src'), medium: 'comics' };
      })
      .get()
      .filter((title) => title && title.title);
    const results = Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
    return { results, metadata: results.length && $('a.nextpostslink').length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/`));
    const heading = $('div.hero h1').first().clone();
    heading.find('span').remove();
    return {
      mangaInfo: {
        title: heading.text().trim() || $('title').text().replace(/\s*[–-]\s*Dragon Translation\s*$/, '').trim() || mangaId,
        image: $('div.hposter img').attr('src'),
        desc: $('div.syn p').map((i, el) => $(el).text().trim()).get().filter(Boolean).join('\n\n'),
        status: STATUS[$('div.htags > span.htag').first().text().trim().toLowerCase()] || 'UNKNOWN',
        tags: $('div.hchips a.chip').map((i, el) => $(el).text().trim()).get(),
        webURL: `${SITE}/manga/${mangaId}/`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/`));
    const json = $('script[type="application/json"]').map((i, el) => $(el).html()).get().find((text) => /"mangaId"[\s\S]*"items"/.test(text));
    return (json ? JSON.parse(json).items : [])
      .map((item) => {
        const id = (/\/manga\/[^/]+\/([^/?#]+)/.exec(item.url) || [])[1];
        const number = parseFloat(item.num);
        return id && { id, chapterId: id, name: item.name, number: Number.isNaN(number) ? undefined : number, time: dateOf(item.ago) };
      })
      .filter(Boolean);
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`));
    const pages = $('div.reading-content img.wp-manga-chapter-img')
      .map((i, el) => ($(el).attr('data-src') || $(el).attr('src') || '').trim())
      .get()
      .filter((src) => /^https?:\/\//.test(src));
    return { id: chapterId, mangaId, pages };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Dragon Translation: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
