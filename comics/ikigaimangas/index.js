const LANDING = 'https://ikigaimangas.com';
const FALLBACK = 'https://visorikigai.gettocaboca.com';
const IMAGE_CDN = 'https://image2.ikigaimangas.cloud';
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Cookie: 'is-adult-enabled=true',
};
const IMAGE_HEADERS = { 'Sec-Fetch-Dest': 'image', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Site': 'cross-site' };
const STATUS = { 'en curso': 'ONGOING', completa: 'COMPLETED', hiatus: 'HIATUS', cancelada: 'CANCELLED' };
const PAGE_SIZE = 20;

function ageOfTags(tags) {
  const names = tags.map(plain);
  if (names.some((name) => /^(\+18|adulto|erotico|hentai|smut)/.test(name))) return 18;
  if (names.some((name) => /ecchi|maduro|mature/.test(name))) return 16;
  return undefined;
}

function plain(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function slugOf(href) {
  return (/\/series\/([^/?#]+)/.exec(href || '') || [])[1];
}

function qwikObjects(json) {
  const objs = json._objs || [];
  const ref = (value) => (typeof value === 'string' && /^[0-9a-z]+$/.test(value) ? objs[parseInt(value, 36)] : value);
  return objs
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item) && 'slug' in item && 'is_mature' in item)
    .map((item) => {
      const out = {};
      for (const key of Object.keys(item)) out[key] = ref(item[key]);
      return out;
    });
}

function qwikGenres(json) {
  const objs = json._objs || [];
  const ref = (value) => (typeof value === 'string' && /^[0-9a-z]+$/.test(value) ? objs[parseInt(value, 36)] : value);
  const holder = objs.find((item) => item && typeof item === 'object' && !Array.isArray(item) && 'genres' in item && 'statuses' in item);
  const list = holder ? ref(holder.genres) : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .map((entry) => {
      const item = ref(entry);
      return item && typeof item === 'object' ? { id: String(ref(item.id)), label: String(ref(item.name)).trim() } : null;
    })
    .filter((genre) => genre && /^\d+$/.test(genre.id) && genre.label && !seen.has(genre.id) && seen.add(genre.id));
}

function cardAge(mature, slug, badges) {
  return Math.max(mature && mature.get(slug) ? 18 : 0, ageOfTags(badges) || 0) || undefined;
}

const STATE_KEY = 'qwik-functions';

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
    this.state = App.createSourceStateManager();
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
      { id: 'directory', name: 'Directory' },
    ];
  }

  async origin() {
    if (!this.site) {
      this.site = (async () => {
        try {
          const landing = await this.get(LANDING);
          const script = (/on:click="(q-[\w-]+\.js)#[^"]*"[^>]*>\s*Ir al sitio/.exec(landing) || [])[1];
          const target = (/i\("(https:\/\/[^"]+)"\)/.exec(await this.get(`${LANDING}/build/${script}`)) || [])[1];
          const canonical = (/<link rel="canonical" href="(https:\/\/[^/"]+)/.exec(await this.get(target)) || [])[1];
          return canonical || FALLBACK;
        } catch (e) {
          return FALLBACK;
        }
      })();
    }
    return this.site;
  }

  async qfuncCall(site, qfunc) {
    const response = await this.send({
      url: `${site}/?qfunc=${qfunc}`,
      method: 'POST',
      headers: { 'X-QRL': qfunc, 'Content-Type': 'application/qwik-json', Accept: 'application/json' },
      body: JSON.stringify({ _entry: '1', _objs: [`\u0002_#s_${qfunc}`, ['0']] }),
    }).catch(() => null);
    try {
      return response ? JSON.parse(response) : null;
    } catch (e) {
      return null;
    }
  }

  async qwikData(kind) {
    const site = await this.origin();
    const read = kind === 'series' ? qwikObjects : qwikGenres;
    let saved = null;
    try {
      saved = await this.state.retrieve(STATE_KEY);
    } catch (e) {
      saved = null;
    }
    if (!saved || typeof saved !== 'object' || saved.site !== site) saved = { site };
    if (saved[kind]) {
      const json = await this.qfuncCall(site, saved[kind]);
      const data = json ? read(json) : [];
      if (data.length) return data;
    }
    const home = await this.get(site);
    const search = (/on:input="(q-[\w-]+\.js)#/.exec(home) || [])[1];
    if (!search) throw new Error('Ikigai Mangas: the search module was not found');
    const modules = [search].concat(Array.from((await this.get(`${site}/build/${search}`)).matchAll(/from"\.\/(q-[\w-]+\.js)"/g), (match) => match[1]));
    const candidates = new Set();
    for (const name of modules) {
      for (const match of (await this.get(`${site}/build/${name}`)).matchAll(/\w+\(\w+\("s_(\w+)"\)\)/g)) candidates.add(match[1]);
    }
    const found = { site, series: saved.series, filters: saved.filters };
    let data = [];
    for (const qfunc of candidates) {
      const json = await this.qfuncCall(site, qfunc);
      if (!json) continue;
      const list = qwikObjects(json);
      const genres = qwikGenres(json);
      if (list.length) found.series = qfunc;
      if (genres.length) found.filters = qfunc;
      if ((kind === 'series' ? list : genres).length) {
        data = kind === 'series' ? list : genres;
        break;
      }
    }
    if (!data.length) throw new Error(kind === 'series' ? 'Ikigai Mangas: the search list could not be loaded' : 'Ikigai Mangas: the genre list could not be loaded');
    try {
      await this.state.store(STATE_KEY, found);
    } catch (e) {
    }
    return data;
  }

  seriesList() {
    if (!this.series) {
      this.series = this.qwikData('series');
      this.series.catch(() => (this.series = null));
    }
    return this.series;
  }

  filterGenres() {
    if (!this.filters) {
      this.filters = this.qwikData('filters');
      this.filters.catch(() => (this.filters = null));
    }
    return this.filters;
  }

  matureFlags() {
    if (!this.mature) {
      this.mature = this.seriesList()
        .then((list) => new Map(list.map((series) => [series.slug, Boolean(series.is_mature)])))
        .catch(() => {
          this.mature = null;
          return null;
        });
    }
    return this.mature;
  }

  async getSearchTags() {
    try {
      const genres = await this.filterGenres();
      return genres.map((genre) => ({ id: genre.id, label: genre.label })).sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('Ikigai Mangas: the genre list could not be loaded', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = plain((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const site = await this.origin();
    if (query) {
      const matches = (await this.seriesList())
        .filter((series) => series.type === 'comic')
        .filter((series) => [series.name].concat(series.other_names || []).some((name) => plain(name).includes(query)));
      const results = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((series) => ({
        mangaId: series.slug,
        title: series.name,
        image: series.cover ? IMAGE_CDN + series.cover : undefined,
        headers: IMAGE_HEADERS,
        ageRating: series.is_mature ? 18 : undefined,
        medium: 'comics',
      }));
      return { results, metadata: matches.length > page * PAGE_SIZE ? { page: page + 1 } : undefined };
    }
    const chosen = (Array.isArray(request && request.includedTags) ? request.includedTags : [])
      .map((tag) => String(tag && typeof tag === 'object' ? tag.id || tag.label : tag))
      .filter((id) => /^\d+$/.test(id));
    const feed = chosen.length ? 'directory' : (request && request.feed) || 'popular';
    if (feed === 'popular') {
      const [html, mature] = await Promise.all([this.get(`${site}/clasificacion/`), this.matureFlags()]);
      const $ = cheerio.load(html);
      const results = $('div.grid > div.card')
        .map((i, el) => {
          const mangaId = slugOf($(el).find('.card-actions > a.btn[href]').attr('href'));
          const badges = $(el).find('li.badge').map((j, badge) => $(badge).text().trim()).get();
          return mangaId && { mangaId, title: $(el).find('.card-body .card-title').first().text().trim(), image: $(el).find('img').attr('src'), headers: IMAGE_HEADERS, ageRating: cardAge(mature, mangaId, badges), medium: 'comics' };
        })
        .get()
        .filter(Boolean);
      return { results };
    }
    const genres = chosen.map((id) => `&generos[]=${id}`).join('');
    const url = feed === 'latest' ? `${site}/?pagina=${page}` : `${site}/series/?tipos[]=comic${genres}&pagina=${page}`;
    const [html, mature] = await Promise.all([this.get(url), this.matureFlags()]);
    const $ = cheerio.load(html);
    const cards = feed === 'latest' ? $('section[aria-labelledby="new-chapters-heading"] > ul.grid').last().find('a.card') : $('section[aria-labelledby="archive-heading"] > ul.grid a.card');
    const titles = cards
      .map((i, el) => {
        const mangaId = slugOf($(el).attr('href'));
        const title = ($(el).find('.card-body .card-title').first().text() || $(el).find('h3').first().text()).trim();
        const badges = $(el).find('li.badge').map((j, badge) => $(badge).text().trim()).get();
        return mangaId && { mangaId, title, image: $(el).find('img').attr('src'), headers: IMAGE_HEADERS, ageRating: cardAge(mature, mangaId, badges), medium: 'comics' };
      })
      .get()
      .filter(Boolean);
    const results = Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
    const next = $('nav[aria-label="pagination"] > a:last-child').not('[class*="btn-disabled"]').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const site = await this.origin();
    const $ = cheerio.load(await this.get(`${site}/series/${encodeURIComponent(mangaId)}/`));
    const main = $('main').first();
    const tags = main.find('.card-body > ul > li > a[href*="?generos"]').map((i, el) => $(el).text().trim()).get();
    return {
      mangaInfo: {
        title: main.find('.card-body .card-title').first().text().trim() || mangaId,
        image: main.find('article.card figure > img').attr('src'),
        headers: IMAGE_HEADERS,
        ageRating: ageOfTags(tags),
        desc: main.find('.card-body > p').first().text().trim(),
        status: STATUS[main.find('figure > ul a[href*="?estados"]').first().text().trim().toLowerCase()] || 'UNKNOWN',
        tags,
        webURL: `${site}/series/${mangaId}/`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const site = await this.origin();
    const url = `${site}/series/${encodeURIComponent(mangaId)}/`;
    const first = cheerio.load(await this.get(url));
    const last = Math.max(1, ...first('nav[aria-label="pagination"] > a[q\\:key^="page-"]').map((i, el) => parseInt((first(el).attr('q:key') || '').split('-')[1], 10) || 1).get());
    const pages = [first].concat(await Promise.all(Array.from({ length: last - 1 }, (_, i) => this.get(`${url}?pagina=${i + 2}`).then((html) => cheerio.load(html)))));
    const chapters = pages.flatMap(($) => $('section.card > ul.grid a.card')
      .map((i, el) => {
        const id = ($(el).attr('href') || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '').replace(/\//g, '~');
        const name = $(el).find('.card-body .card-title').first().text().trim();
        const number = parseFloat((/([\d.]+)/.exec(name) || [])[1]);
        const time = Date.parse(($(el).find('time').attr('datetime') || '').replace(/\s*\(.*\)$/, ''));
        return id && { id, chapterId: id, name, number: Number.isNaN(number) ? undefined : number, time: Number.isNaN(time) ? undefined : time };
      })
      .get());
    return Array.from(new Map(chapters.filter(Boolean).map((chapter) => [chapter.id, chapter])).values());
  }

  async getChapterDetails(mangaId, chapterId) {
    const site = await this.origin();
    const $ = cheerio.load(await this.get(`${site}/${chapterId.split('~').map(encodeURIComponent).join('/')}/`));
    const pages = $('img[alt^="Página"]').map((i, el) => encodeURI($(el).attr('src') || '')).get().filter((src) => /^https?:\/\//.test(src) && !/banner/i.test(src));
    return { id: chapterId, mangaId, pages, headers: IMAGE_HEADERS };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Ikigai Mangas: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
