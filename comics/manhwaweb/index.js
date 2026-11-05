const SITE = 'https://manhwaweb.com';
const API = 'https://api.manhwaweb.com';
const REFERER = `${SITE}/`;

const GENRES = [
  ['3', 'Acción'], ['29', 'Aventura'], ['18', 'Comedia'], ['1', 'Drama'], ['42', 'Recuentos de la vida'],
  ['2', 'Romance'], ['5', 'Venganza'], ['6', 'Harem'], ['23', 'Fantasia'], ['31', 'Sobrenatural'],
  ['25', 'Tragedia'], ['43', 'Psicológico'], ['32', 'Horror'], ['44', 'Thriller'], ['28', 'Historias cortas'],
  ['30', 'Ecchi'], ['34', 'Gore'], ['27', 'Girls love'], ['45', 'Boys love'], ['41', 'Reencarnación'],
  ['37', 'Sistema de niveles'], ['33', 'Ciencia ficción'], ['38', 'Apocalíptico'], ['39', 'Artes Marciales'], ['40', 'Superpoderes'],
  ['35', 'Cultivación (cultivo)'], ['8', 'Milf'],
];

function unique(titles) {
  return Array.from(new Map(titles.filter((title) => title.mangaId).map((title) => [title.mangaId, title])).values());
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
      { id: 'directory', name: 'Directory' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const feed = !query && !tags.length && request && request.feed;
    if (feed === 'popular') {
      const top = (await this.get(`${API}/manhwa/nuevos`)).top;
      const items = top.manhwas_esp.concat(top.manhwas_raw).sort((a, b) => b.numero - a.numero);
      return { results: unique(items.map((item) => ({ mangaId: item.link.replace(/^\/?(manga|manhwa)\//, ''), title: item.name, image: item.imagen, referer: REFERER, medium: 'comics' }))) };
    }
    if (feed === 'latest') {
      const latest = (await this.get(`${API}/latest/new-manhwa`)).manhwas;
      const items = latest.manhwas_esp.concat(latest.manhwas_raw, latest._manhwas).sort((a, b) => b.create - a.create);
      return { results: unique(items.map((item) => ({ mangaId: item.id_rel, title: item.name_manhwa, image: item.img, referer: REFERER, medium: 'comics' }))) };
    }
    const genres = tags.map((tag) => tag.id).join('a');
    const url = `${API}/manhwa/library?buscar=${encodeURIComponent(query)}${genres ? `&generes=${genres}` : ''}&page=${page - 1}`;
    const result = await this.get(url);
    return {
      results: unique(result.data.map((item) => ({ mangaId: item.real_id, title: item.the_real_name, image: item._imagen, referer: REFERER, medium: 'comics' }))),
      metadata: result.next ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const comic = await this.get(`${API}/manhwa/see/${encodeURIComponent(mangaId)}`);
    const names = (list) => (list || []).map((person) => person.name).join(', ') || undefined;
    return {
      mangaInfo: {
        title: comic.name_esp || mangaId,
        image: comic._imagen,
        referer: REFERER,
        desc: comic._sinopsis || '',
        author: names(comic.autor),
        artist: names(comic.artista),
        status: comic._status === 'publicandose' ? 'ONGOING' : comic._status === 'finalizado' ? 'COMPLETED' : 'UNKNOWN',
        tags: (comic._categoris || []).map((genre) => Object.values(genre)[0]),
        webURL: `${SITE}/manhwa/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const comic = await this.get(`${API}/manhwa/see/${encodeURIComponent(mangaId)}`);
    return comic.chapters
      .flatMap((chapter) => chapter.versions
        .filter((version) => version.create)
        .map((version) => {
          const id = version.link.split('/').pop().replace(comic._id, comic.real_id);
          const group = (version.joint || []).map((person) => person.name.trim()).filter(Boolean).join(', ');
          return { id, chapterId: id, name: `Capítulo ${chapter.chapter}`, number: chapter.chapter, group: group || 'ManhwaWeb Bot', time: version.create };
        }))
      .sort((a, b) => b.number - a.number);
  }

  async getChapterDetails(mangaId, chapterId) {
    const result = await this.get(`${API}/chapters/see/${encodeURIComponent(chapterId)}`);
    return { id: chapterId, mangaId, pages: result.chapter.img.filter((src) => /^https?:\/\//.test(src)), referer: REFERER };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`ManhwaWeb: HTTP ${response.status} from ${url}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
