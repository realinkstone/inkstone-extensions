const SITE = 'https://novelasligeras.net';
const LIST = `${SITE}/index.php/lista-de-novela-ligera-novela-web`;

function pathOf(href) {
  const match = /^https?:\/\/[^/]+(\/[^?#]*)/.exec(href || '');
  return match ? match[1].replace(/^\/+|\/+$/g, '') : null;
}

function dateOf(href) {
  const match = /\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(href || '');
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) : undefined;
}

const PAID = /(^|\/)novela-protegida-/;

function cards($) {
  return $('div#content div.products article')
    .map((i, el) => {
      const link = $(el).find('a[href]').first();
      const mangaId = pathOf(link.attr('href'));
      const title = $(el).find('h4').first().text().trim();
      const img = $(el).find('img').first();
      const image = img.attr('data-src') || img.attr('src');
      return mangaId && title ? { mangaId, title, image, medium: 'novel' } : null;
    })
    .get()
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popularity', name: 'Popular' },
      { id: 'date', name: 'Latest' },
      { id: 'rating', name: 'Top rated' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const $ = cheerio.load(await this.get(`${LIST}/page/${page}/?s=${encodeURIComponent(query)}`));
      let results = cards($);
      if (!results.length && page === 1 && $('div.summary.entry-summary h1').length) {
        const mangaId = pathOf($('link[rel="canonical"]').attr('href'));
        if (mangaId) results = [{ mangaId, title: $('div.summary.entry-summary h1').first().text().trim(), image: $('meta[property="og:image"]').attr('content'), medium: 'novel' }];
      }
      const next = $('a.nav-next, a.next.page-numbers').length;
      return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
    }
    const order = ['popularity', 'date', 'rating'].includes(request && request.feed) ? request.feed : 'popularity';
    const $ = cheerio.load(await this.get(`${LIST}/page/${page}/?orderby=${order}`));
    const results = cards($);
    const next = $('a.nav-next, a.next.page-numbers').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/${mangaId}/`));
    const info = $('div.summary.entry-summary');
    const attribute = (name) => $(`tr.woocommerce-product-attributes-item--attribute_pa_${name} td`).first().text().trim();
    const status = attribute('estado').toLowerCase();
    return {
      mangaInfo: {
        title: info.find('h1').first().text().trim() || mangaId,
        image: $('div.woocommerce-product-gallery__image img').first().attr('src') || $('meta[property="og:image"]').attr('content'),
        desc: info.find('div.woocommerce-product-details__short-description p').map((i, el) => $(el).text().trim()).get().filter(Boolean).join('\n\n'),
        author: attribute('escritor') || undefined,
        artist: attribute('ilustrador') || undefined,
        status: /proceso|emisi/.test(status) ? 'ONGOING' : /complet/.test(status) ? 'COMPLETED' : /pausa/.test(status) ? 'HIATUS' : /cancel/.test(status) ? 'CANCELLED' : 'UNKNOWN',
        tags: info.find('div.product_meta span.tagged_as a, div.product_meta span.posted_in a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/${mangaId}/`,
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/${mangaId}/`));
    const chapters = [];
    const seen = new Set();
    let volume;
    let paid = 0;
    $('.wpb_wrapper a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const chapterId = pathOf(href);
      if (!chapterId || !/\/\d{4}\/\d{2}\/\d{2}\//.test(href) || seen.has(chapterId)) return;
      seen.add(chapterId);
      const found = /-volumen-(\d+)-/.exec(href);
      if (found) volume = +found[1];
      if (PAID.test(chapterId)) {
        paid += 1;
        return;
      }
      const title = $(el).text().trim().replace(/\bCapitulo\b/g, 'Capítulo');
      chapters.push({
        id: chapterId,
        chapterId,
        name: volume ? `Vol. ${volume} – ${title}` : title,
        volume,
        time: dateOf(href),
      });
    });
    if (!chapters.length && paid) throw new Error('NovelasLigeras: every chapter of this novel is for subscribers of the site');
    return chapters.map((chapter, i) => ({ ...chapter, number: i + 1 })).reverse();
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/${chapterId}/`));
    const body = $('div.wpb_text_column.wpb_content_element > div').first();
    body.find('h1, h2, script, style, noscript, ins, a.track-ad, div[style]').remove();
    const paragraphs = body
      .find('p')
      .map((i, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter((text) => text && text !== 'Publicidad');
    if (PAID.test(chapterId) && paragraphs.join('').length < 200) throw new Error('NovelasLigeras: this chapter is for subscribers of the site only');
    if (!paragraphs.length) throw new Error('NovelasLigeras: the chapter has no text');
    return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`NovelasLigeras: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
