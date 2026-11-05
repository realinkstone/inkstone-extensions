const SITE = 'https://www.elejandria.com';
const SITEMAP_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const SEARCH_PAGE_SIZE = 40;
const FEEDS = {
  popular: `${SITE}/libros-mas-descargados`,
  latest: `${SITE}/ultimos-libros-a%C3%B1adidos`,
};
const BOOK_PATH = /\/libro\/([a-z0-9-]+\/[a-z0-9-]+\/\d+)\/?$/;

function fold(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function prettySlug(slug) {
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function cardsOf(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();
  $('a[href*="/libro/"]').each((_, el) => {
    const match = BOOK_PATH.exec($(el).attr('href') || '');
    if (!match || seen.has(match[1])) return;
    const $img = $(el).find('img').first();
    if (!$img.length) return;
    seen.add(match[1]);
    const $card = $(el).parent();
    const title =
      clean(($card.find('p a[title]').first().attr('title') || '').replace(/^Libro\s+/, '')) ||
      clean(($img.attr('title') || '').replace(/^Descargar\s+/, '').replace(/\s+de\s+[^]+$/, ''));
    results.push({
      mangaId: match[1],
      title: title || prettySlug(match[1].split('/')[0]),
      image: $img.attr('data-src') || $img.attr('src') || undefined,
      author: clean($card.find('.book-description-author a').first().text()) || undefined,
      webURL: `${SITE}/libro/${match[1]}`,
      medium: 'novel',
    });
  });
  return results;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
    this.sitemap = null;
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Más descargados' },
      { id: 'latest', name: 'Últimos añadidos' },
    ];
  }

  async getSearchTags() {
    const { categories } = await this.index();
    return categories;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const tag = ((request && request.includedTags) || [])[0];

    if (query) {
      const words = fold(query).split(/[^a-z0-9]+/).filter(Boolean);
      const { books } = await this.index();
      const found = books.filter((path) => words.every((word) => path.includes(word)));
      const page = (metadata && metadata.page) || 1;
      const slice = found.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE);
      return {
        results: slice.map((path) => ({
          mangaId: path,
          title: prettySlug(path.split('/')[0]),
          author: prettySlug(path.split('/')[1]),
          webURL: `${SITE}/libro/${path}`,
          medium: 'novel',
        })),
        metadata: page * SEARCH_PAGE_SIZE < found.length ? { page: page + 1 } : undefined,
      };
    }

    if (metadata) return { results: [] };
    const url = tag ? `${SITE}/categorias/${tag.id}` : FEEDS[(request && request.feed) || 'popular'] || FEEDS.popular;
    return { results: cardsOf(await this.html(url)) };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.html(`${SITE}/libro/${mangaId}`));
    const $h1 = $('h1').first().clone();
    $h1.find('span').remove();
    const tags = [];
    $('.breadcrumb a[href*="/categorias/"]').each((_, el) => {
      const name = clean($(el).text());
      if (name) tags.push(name);
    });
    return {
      mangaInfo: {
        mangaId,
        title: clean($h1.text()).replace(/^Libro\s+/, '') || prettySlug(mangaId.split('/')[0]),
        image: $('meta[property="og:image"]').attr('content') || undefined,
        author: clean($('h2 a[href*="/autor/"]').first().text()).replace(/^de\s+/, '') || undefined,
        desc: $('.book-abstract p')
          .map((_, el) => clean($(el).text()))
          .get()
          .filter(Boolean)
          .join('\n\n'),
        status: 'COMPLETED',
        tags,
        webURL: `${SITE}/libro/${mangaId}`,
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.html(`${SITE}/libro/${mangaId}`));
    const bookId = mangaId.split('/').pop();
    const chapters = [];
    const seen = new Set();
    $('a.download-link[href*="/libro/descargar/"]').each((_, el) => {
      const fileId = ((($(el).attr('href') || '').match(/\/(\d+)\/?$/) || [])[1]);
      const format = clean($(el).text()).replace(/^Descargar en\s+/i, '');
      if (!fileId || seen.has(fileId) || !/^(epub|pdf)$/i.test(format)) return;
      seen.add(fileId);
      chapters.push({ id: `${bookId}/${fileId}`, chapterId: `${bookId}/${fileId}`, name: format });
    });
    if (!chapters.length) throw new Error('Elejandría: this book has no ePub or PDF file');
    chapters.sort((a, b) => (/epub/i.test(b.name) ? 1 : 0) - (/epub/i.test(a.name) ? 1 : 0));
    return chapters.map((chapter, i) => ({ ...chapter, number: i + 1 }));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [], book: { url: `${SITE}/libro/link_descarga_libro/${chapterId}` } };
  }

  index() {
    if (!this.sitemap || Date.now() - this.sitemap.at > SITEMAP_MAX_AGE_MS) {
      const promise = this.html(`${SITE}/sitemap.xml`).then((xml) => {
        const books = [];
        const categories = [];
        for (const [, url] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const book = BOOK_PATH.exec(url);
          if (book) books.push(book[1]);
          const category = /\/categorias\/((?:[a-z0-9-]+\/)+\d+)$/.exec(url);
          if (category) {
            const parts = category[1].split('/');
            categories.push({ id: category[1], label: prettySlug(parts[parts.length - 2]) });
          }
        }
        if (!books.length) throw new Error('Elejandría: the sitemap lists no books');
        return { books, categories };
      });
      this.sitemap = { at: Date.now(), promise };
      promise.catch(() => {
        this.sitemap = null;
      });
    }
    return this.sitemap.promise;
  }

  async html(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET' }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Elejandría: HTTP ${response.status} from ${url}`);
    return response.data;
  }
}

module.exports = { Source };
