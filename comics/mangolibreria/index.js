const SITE = 'https://lectorfenix.com';
const IMAGE_HEADERS = { 'Sec-Fetch-Dest': 'image' };

const STATUS = { ongoing: 'ONGOING', completed: 'COMPLETED', finalizado: 'COMPLETED', hiatus: 'HIATUS', pausa: 'HIATUS' };

function resolve(data, index, seen) {
  if (seen.has(index)) return seen.get(index);
  const value = data[index];
  if (!value || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  seen.set(index, out);
  for (const key of Object.keys(value)) out[key] = typeof value[key] === 'number' ? resolve(data, value[key], seen) : value[key];
  return out;
}

function payload(json, ...keys) {
  for (const node of json.nodes || []) {
    const data = node && node.data;
    const index = data ? data.findIndex((item) => item && typeof item === 'object' && !Array.isArray(item) && keys.some((key) => key in item)) : -1;
    if (index >= 0) return resolve(data, index, new Map());
  }
  throw new Error(`MangoLibreria: the page data has no ${keys.join(' or ')}`);
}

function slugOf(path) {
  return (/\/comics\/([^/?#]+)/.exec(path || '') || [])[1];
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
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
    const sort = query || (request && request.feed === 'latest') ? '' : '&sort=views';
    const search = query ? `&q=${encodeURIComponent(query)}` : '';
    const list = payload(await this.get(`${SITE}/comics/__data.json?x-sveltekit-invalidated=01&page=${page}${sort}${search}`), 'comics');
    const results = list.comics
      .map((comic) => ({ mangaId: slugOf(comic.urlPath), title: comic.name, image: comic.urlCover || comic.coverImage, headers: IMAGE_HEADERS, medium: 'comics' }))
      .filter((title) => title.mangaId && title.title);
    return { results, metadata: results.length && list.page < list.totalPages ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const comic = await this.comic(mangaId);
    return {
      mangaInfo: {
        title: comic.title || mangaId,
        image: comic.coverImage,
        headers: IMAGE_HEADERS,
        desc: comic.description || '',
        author: comic.author || undefined,
        artist: comic.artist || undefined,
        status: STATUS[String(comic.status || '').toLowerCase()] || 'UNKNOWN',
        tags: (comic.genres || []).map((genre) => (typeof genre === 'string' ? genre : genre && genre.name)).filter(Boolean),
        webURL: `${SITE}/comics/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const comic = await this.comic(mangaId);
    return comic.comicScans
      .flatMap((scan) => (scan.chapters || []).map((chapter) => {
        const time = Date.parse(chapter.releaseDate || chapter.createdAt);
        const id = (/\/chapters\/([^/?#]+)/.exec(chapter.chapterPath || '') || [])[1] || String(chapter.id);
        return {
          id,
          chapterId: id,
          name: `Capítulo ${chapter.chapterNumber}`,
          number: Number.isFinite(+chapter.chapterNumber) ? +chapter.chapterNumber : undefined,
          group: (scan.scanGroup && scan.scanGroup.name) || undefined,
          time: Number.isNaN(time) ? undefined : time,
        };
      }))
      .sort((a, b) => b.number - a.number);
  }

  async getChapterDetails(mangaId, chapterId) {
    const chapter = payload(await this.get(`${SITE}/comics/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}/__data.json?x-sveltekit-invalidated=01`), 'url_pages', 'urlPages');
    const pages = (chapter.url_pages || chapter.urlPages || []).filter((src) => typeof src === 'string' && !/banner/i.test(src));
    return { id: chapterId, mangaId, pages, headers: IMAGE_HEADERS };
  }

  async comic(mangaId) {
    return payload(await this.get(`${SITE}/comics/${encodeURIComponent(mangaId)}/__data.json?x-sveltekit-invalidated=01`), 'comicScans');
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`MangoLibreria: HTTP ${response.status} from ${url}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
