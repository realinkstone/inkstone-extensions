const SITE = 'https://cinecalidad.org';
const API = `${SITE}/wp-api/v1`;
const UPLOADS = `${SITE}/wp-content/uploads`;
const PER_PAGE = 24;

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  'Accept-Language': 'es-MX',
};

const VIDEO_HEADERS = { 'User-Agent': BROWSER['User-Agent'] };

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return source;
  const radix = +match[2];
  const words = match[4].split('|');
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + DIGITS.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

function poster(images) {
  const path = images && images.poster;
  return path ? `${UPLOADS}${path}` : undefined;
}

function idOf(post) {
  return `${post.type === 'tvshows' ? 'series' : 'movies'}~${post._id}~${post.slug}`;
}

function partsOf(mangaId) {
  const [, kind, id, slug] = /^(movies|series)~(\d+)~(.+)$/.exec(mangaId) || [];
  if (!kind) throw new Error(`CineCalidad: unknown title id ${mangaId}`);
  return { kind, id, slug };
}

function toResult(post) {
  return { mangaId: idOf(post), title: post.title, image: poster(post.images), medium: 'anime' };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'peliculas', name: 'Películas' },
      { id: 'series', name: 'Series' },
    ];
  }

  async getSearchTags() {
    if (!this.genres) {
      const items = [];
      let page = 1;
      let lastPage = 1;
      do {
        const data = await this.json(`${API}/listing/tax/genres?page=${page}`).catch(() => null);
        const box = (data && data.data) || {};
        items.push(...(box.items || []));
        lastPage = (box.pagination && box.pagination.last_page) || 1;
        page += 1;
      } while (page <= lastPage);
      this.genres = items.map((item) => ({ id: String(item.term_id), label: item.term_name }));
    }
    return this.genres;
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const kind = request && request.feed === 'series' ? 'series' : 'movies';
    const filter = tags.length ? `&filter=${encodeURIComponent(JSON.stringify({ genres: [Number(tags[0].id)] }))}` : '';
    const url = query
      ? `${API}/search?postType=any&q=${encodeURIComponent(query.slice(0, 60))}&postsPerPage=${PER_PAGE}&page=${page}${filter}`
      : `${API}/listing/${kind}?postsPerPage=${PER_PAGE}&page=${page}${filter}`;
    const data = (await this.json(url)) || {};
    const box = data.data || {};
    const posts = (box.posts || []).filter((post) => post && post._id && post.title && post.slug);
    const lastPage = box.pagination && box.pagination.last_page;
    return {
      results: posts.map(toResult),
      metadata: lastPage && page < lastPage ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const { kind, slug } = partsOf(mangaId);
    const data = await this.json(`${API}/single/${kind}?slug=${encodeURIComponent(slug)}&postType=${kind}`);
    const item = (data && data.data) || {};
    const genres = await this.getSearchTags().catch(() => []);
    const names = new Map(genres.map((genre) => [Number(genre.id), genre.label]));
    const year = (item.release_date || '').slice(0, 4);
    return {
      mangaInfo: {
        title: item.title || mangaId,
        image: poster(item.images),
        banner: item.images && item.images.backdrop ? `${UPLOADS}${item.images.backdrop}` : undefined,
        desc: item.overview || '',
        status: 'UNKNOWN',
        tags: (item.genres || []).map((id) => names.get(Number(id))).filter(Boolean).concat(year ? [year] : []),
        webURL: `${SITE}/${kind === 'series' ? 'series' : 'peliculas'}/${slug}/`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const { kind, id } = partsOf(mangaId);
    if (kind === 'movies') return [{ id: 'pelicula', chapterId: 'pelicula', name: 'Película', number: 1 }];
    const first = await this.episodePage(id, 1, 1);
    const seasons = first.seasons || [];
    const lists = await Promise.all(seasons.map((season) => this.seasonEpisodes(id, season)));
    return lists
      .flat()
      .sort((a, b) => b.season - a.season || b.number - a.number);
  }

  async seasonEpisodes(seriesId, season) {
    const chapters = [];
    let page = 1;
    let lastPage = 1;
    do {
      const data = await this.episodePage(seriesId, season, page);
      (data.posts || []).forEach((item) => {
        const time = Date.parse(String(item.date || '').replace(' ', 'T'));
        chapters.push({
          id: String(item._id),
          chapterId: String(item._id),
          name: `Episodio ${item.episode_number}`,
          number: Number(item.episode_number),
          season: Number(item.season_number || season),
          seasonName: `Temporada ${item.season_number || season}`,
          time: Number.isNaN(time) ? undefined : time,
        });
      });
      lastPage = (data.pagination && data.pagination.last_page) || 1;
      page += 1;
    } while (page <= lastPage);
    return chapters;
  }

  async episodePage(seriesId, season, page) {
    const data = await this.json(`${API}/single/episodes/list?_id=${seriesId}&season=${season}&page=${page}&postsPerPage=100`);
    return (data && data.data) || {};
  }

  async getVideos(mangaId, chapterId) {
    const { kind, id } = partsOf(mangaId);
    const postId = kind === 'movies' ? id : String(chapterId);
    const data = await this.json(`${API}/player?postId=${encodeURIComponent(postId)}&demo=0`);
    const embeds = (data && data.data && data.data.embeds) || [];
    const players = embeds.filter((embed) => embed && embed.url && /^https?:\/\/([a-z0-9-]+\.)*vimeos\.(net|zip)\//i.test(embed.url));
    const found = await Promise.all(players.map((embed) => this.extract(embed).catch(() => null)));
    const videos = found.flat().filter((video) => video && /^https?:\/\//.test(video.url));
    if (!videos.length) throw new Error(`CineCalidad: none of the ${embeds.length} servers gave a playable video`);
    return videos;
  }

  async extract(embed) {
    const html = await this.get(embed.url, 'text/html');
    const code = unpack(html);
    const file = /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/.exec(code) || /"file"\s*:\s*"(https?:[^"]+?\.m3u8[^"]*)"/.exec(code);
    if (!file) throw new Error('CineCalidad: the player page has no video address');
    const url = file[1].replace(/\\\//g, '/');
    const quality = [embed.lang, embed.quality].filter(Boolean).join(' ') || 'Online';
    const master = await this.get(url, '*/*');
    const variant = master.split('\n').filter((line) => /^https?:\/\/\S*index-v\d+-a\d+/.test(line)).pop();
    const audios = Array.from(master.matchAll(/TYPE=AUDIO[^\n]*NAME="([^"]+)"[^\n]*URI="[^"]*index-(a\d+)\.m3u8/g));
    if (!variant || audios.length < 2) return [{ url, quality, headers: VIDEO_HEADERS }];
    return audios.map(([, name, track]) => ({ url: variant.replace(/index-(v\d+)-a\d+/, `index-$1-${track}`), quality: [name, embed.quality].filter(Boolean).join(' '), headers: VIDEO_HEADERS }));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, accept) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: accept, Referer: `${SITE}/`, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`CineCalidad: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }

  async json(url) {
    return JSON.parse(await this.get(url, 'application/json'));
  }
}

module.exports = { Source };
