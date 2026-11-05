const SITE = 'https://shademanga.com';
const API = `${SITE}/api/series-locales`;

const STATUS = { 'en curso': 'ONGOING', completado: 'COMPLETED', pausada: 'HIATUS' };

function titleOf(series) {
  return { mangaId: String(series.id), title: series.titulo, image: series.portadaUrl || undefined, medium: 'comics' };
}

function unique(titles) {
  return Array.from(new Map(titles.map((title) => [title.mangaId, title])).values());
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    return (await this.get(`${API}/tags`)).map((tag) => ({ id: tag, label: tag }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const feed = !query && !tags.length && request && request.feed;
    if (feed === 'popular') {
      const groups = await this.get(`${API}/popular`);
      return { results: unique(groups.flatMap((group) => group.series).map(titleOf)) };
    }
    if (feed === 'latest') {
      const recent = await this.get(`${API}/capitulos/recientes?page=${page}&pageSize=24`);
      return { results: unique(recent.items.map((item) => titleOf(item.serie))), metadata: recent.page < recent.totalPages ? { page: page + 1 } : undefined };
    }
    const filters = tags.map((tag) => `&tags=${encodeURIComponent(tag.id)}`).join('');
    const series = await this.get(`${API}/search-candidates?q=${encodeURIComponent(query)}&includeAdult=false&showSinPortada=false&take=120${filters}`);
    return { results: unique(series.map(titleOf)).sort((a, b) => a.title.localeCompare(b.title)) };
  }

  async getMangaDetails(mangaId) {
    const series = await this.get(`${API}/${encodeURIComponent(mangaId)}`);
    return {
      mangaInfo: {
        title: series.titulo,
        image: series.portadaUrl || undefined,
        desc: series.descripcion || '',
        author: series.autor || undefined,
        status: STATUS[(series.estado || '').toLowerCase()] || 'UNKNOWN',
        tags: (series.generos || '').split(',').map((genre) => genre.trim()).filter(Boolean),
        webURL: `${SITE}/serie/local/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const series = await this.get(`${API}/${encodeURIComponent(mangaId)}`);
    return series.capitulos
      .map((chapter) => {
        const time = Date.parse(chapter.fechaSubida);
        return {
          id: String(chapter.id),
          chapterId: String(chapter.id),
          name: `Cap. ${chapter.numeroCapitulo}${chapter.titulo ? ` - ${chapter.titulo}` : ''}`,
          number: chapter.numeroCapitulo,
          time: Number.isNaN(time) ? undefined : time,
        };
      })
      .sort((a, b) => b.number - a.number);
  }

  async getChapterDetails(mangaId, chapterId) {
    const result = await this.get(`${API}/${encodeURIComponent(mangaId)}/capitulos/${encodeURIComponent(chapterId)}/paginas`);
    return { id: chapterId, mangaId, pages: result.paginas };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Shadow Manga: HTTP ${response.status} from ${url}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
