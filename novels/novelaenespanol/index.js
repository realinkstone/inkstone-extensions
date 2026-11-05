const SITE = 'https://novelaenespanol.com';
const THEME = `${SITE}/wp-content/themes/ranobe-novels/template-parts`;

function slugOf(href) {
  const match = /\/novela-ligera\/([^/?#]+)\/?$/.exec(href || '');
  return match ? match[1] : null;
}

function statusOf(text) {
  const status = (text || '').toLowerCase();
  if (/terminad|complet/.test(status)) return 'COMPLETED';
  if (/proceso|curso|emisi/.test(status)) return 'ONGOING';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 0.25 } });
  }

  getSourceFeeds() {
    return [{ id: 'all', name: 'All novels' }];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = ((request && request.title) || '').trim().toLowerCase();
    if (query) {
      const all = JSON.parse(await this.send(`${THEME}/queries/categories-select-query.php`, 'POST'));
      const results = all
        .filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(query))
        .map((item) => ({ mangaId: item.slug, title: item.name.trim(), medium: 'novel' }));
      return { results };
    }
    const page = (metadata && metadata.page) || 1;
    const $ = cheerio.load(await this.send(`${SITE}/todas-las-novelas/page/${page}/`));
    const results = $('article')
      .map((i, el) => {
        const link = $(el).find('.card-title a').first();
        const mangaId = slugOf(link.attr('href'));
        const title = link.text().trim();
        return mangaId && title ? { mangaId, title, image: $(el).find('img').first().attr('src'), medium: 'novel' } : null;
      })
      .get()
      .filter(Boolean);
    const next = $('.pagination a').filter((i, el) => $(el).text().trim() === '>').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.send(`${SITE}/novela-ligera/${mangaId}/`));
    return {
      mangaInfo: {
        title: $('.category-title').first().text().trim() || mangaId,
        image: $('img[itemprop="image"]').first().attr('src'),
        desc: $('.category-exerpt').first().text().trim(),
        author: $('.cat-author [itemprop="creator"]').first().text().trim() || undefined,
        status: statusOf($('.cat-status').first().text()),
        tags: $('.post_tags a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/novela-ligera/${mangaId}/`,
        medium: 'novel',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.send(`${SITE}/novela-ligera/${mangaId}/`));
    const data = $('.js-cat-data').first();
    const category = data.attr('data-category');
    const slug = data.attr('data-slug') || mangaId;
    const count = Number(data.attr('data-count')) || 5000;
    if (!category) throw new Error('Novela en Español: this novel has no chapter list');
    const body = `cat_id=${encodeURIComponent(category)}&limit=${count + 50}&offset=0`;
    const posts = JSON.parse(await this.send(`${THEME}/category/chapters-query.php`, 'POST', body)) || [];
    return posts.map((post, i) => {
      const found = /cap[ií]tulo\s+(\d+(?:\.\d+)?)/i.exec(post.post_title);
      const chapterId = `${slug}/novela-ligera/${post.post_name}`;
      return { id: chapterId, chapterId, name: post.post_title.trim(), number: found ? +found[1] : posts.length - i };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.send(`${SITE}/${chapterId}/`));
    const paragraphs = $('.js-full-content')
      .first()
      .find('p')
      .map((i, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
    if (!paragraphs.length) throw new Error('Novela en Español: the chapter has no text');
    return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
  }

  async send(url, method, body) {
    const headers = method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' } : { Accept: 'text/html' };
    const response = await this.requests.schedule(App.createRequest({ url, method: method || 'GET', headers, body }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Novela en Español: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
