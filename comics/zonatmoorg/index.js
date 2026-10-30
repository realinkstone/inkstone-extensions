const SITE = 'https://zonatmo.org';

function libraryPath(href) {
  const match = /\/library\/([^?#]+)/.exec(href || '');
  return match ? match[1] : null;
}

function dateOf(text) {
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text || '');
  return match ? Date.UTC(+match[3], +match[2] - 1, +match[1]) : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return [
      { id: 'likes_count', name: 'Popular' },
      { id: 'creation', name: 'Newest' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/biblioteca`));
    return $('input[name="genders[]"]')
      .map((i, el) => ({ id: $(el).attr('value'), label: $(`label[for="${$(el).attr('id')}"]`).text().trim() }))
      .get()
      .filter((tag) => tag.id && tag.label);
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const order = request && request.feed === 'creation' && !query ? 'creation' : 'likes_count';
    const genres = tags.map((tag) => `&genders[]=${encodeURIComponent(tag.id)}`).join('');
    const url = `${SITE}/biblioteca?title=${encodeURIComponent(query)}&filter_by=title&order_item=${order}&order_dir=desc&_pg=1&page=${page}${genres}`;
    const html = JSON.parse(await this.get(url, { 'X-Requested-With': 'XMLHttpRequest', Referer: `${SITE}/biblioteca`, Accept: 'application/json' })).html;
    const $ = cheerio.load(html || '');
    const results = $('#library-grid .element')
      .map((i, el) => {
        const link = $(el).find('a[href*="/library/"]').first();
        const mangaId = libraryPath(link.attr('href'));
        const heading = link.find('.thumbnail-title h4');
        const title = (heading.attr('title') || heading.text()).trim();
        const image = link.find('img.cover-bg-img').attr('src') || link.find('.thumbnail.book').attr('data-bg');
        return mangaId && title ? { mangaId, title, image, medium: 'comics' } : null;
      })
      .get()
      .filter(Boolean);
    const next = $('a[rel="next"]').length || $('.pagination a').filter((i, el) => /Siguiente|›/.test($(el).text())).length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/library/${mangaId}`));
    const after = (label) => $('h5.element-subtitle').filter((i, el) => $(el).text().trim() === label).first().next();
    const people = (label) => after(label).find('a').map((i, el) => $(el).text().trim()).get().join(', ') || undefined;
    const status = after('Estado').text().trim().toLowerCase();
    return {
      mangaInfo: {
        title: $('h1.element-title').first().contents().filter((i, node) => node.type === 'text').text().trim() || mangaId,
        image: $('img.book-thumbnail').attr('src'),
        desc: $('#manga-synopsis').text().trim(),
        author: people('Autor/es'),
        artist: people('Artista/s'),
        status: /emisi|publicand/.test(status) ? 'ONGOING' : /complet|finaliz/.test(status) ? 'COMPLETED' : /pausa|hiatus/.test(status) ? 'HIATUS' : /cancel/.test(status) ? 'CANCELLED' : 'UNKNOWN',
        tags: $('.element-header-content-text a[href*="/tag/"]').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/library/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/library/${mangaId}`));
    const chapters = $('li.upload-link')
      .map((i, row) => {
        const number = $(row).attr('data-chapter-number');
        const time = dateOf($(row).find('.text-muted.small').first().text());
        return $(row)
          .find('a[href*="/view_uploads/"]')
          .map((j, link) => {
            const id = /view_uploads\/(\d+)/.exec($(link).attr('href'))[1];
            const group = $(link).parent().find('a[href*="/groups/"]').first().text().trim();
            return { id, chapterId: id, name: `Capítulo ${number}`, number: Number.isFinite(+number) ? +number : undefined, group: group || undefined, time };
          })
          .get();
      })
      .get();
    return Array.from(new Map(chapters.map((chapter) => [chapter.id, chapter])).values());
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/view_uploads/${encodeURIComponent(chapterId)}`));
    const pages = $('#reader-wrap img.reader-image')
      .map((i, el) => $(el).attr('src'))
      .get()
      .filter((src) => /^https?:\/\//.test(src));
    return { id: chapterId, mangaId, pages };
  }

  async get(url, headers) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: headers || { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`ZonaTMO: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
