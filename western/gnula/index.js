const SITE = 'https://gnula.life';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const LANGUAGES = [['latino', 'Latino', 'Dub'], ['spanish', 'Castellano', 'Dub'], ['english', 'Inglés', 'Sub'], ['japanese', 'Japonés', 'Sub']];

const GENRES = [
  ['accion', 'Acción'], ['aventura', 'Aventura'], ['animacion', 'Animación'], ['ciencia-ficcion', 'Ciencia Ficción'],
  ['comedia', 'Comedia'], ['crimen', 'Crimen'], ['documental', 'Documentales'], ['drama', 'Drama'], ['familia', 'Familia'],
  ['fantasia', 'Fantasía'], ['misterio', 'Misterio'], ['romance', 'Romance'], ['suspenso', 'Suspenso'], ['terror', 'Terror'],
];

const SERVERS = [['vidhide', 'VidHide'], ['voe', 'VOE']];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

function voeSource(payload) {
  const clean = VOE_MARKERS.reduce((text, marker) => text.split(marker).join(''), rot13(payload));
  const shifted = App.base64Decode(clean).split('').map((ch) => String.fromCharCode(ch.charCodeAt(0) - 3)).join('');
  return JSON.parse(App.base64Decode(shifted.split('').reverse().join(''))).source;
}

function pageProps(html) {
  const data = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!data) throw new Error('Gnula: the page has no __NEXT_DATA__');
  return JSON.parse(data[1]).props.pageProps;
}

function poster(images, size) {
  const src = images && images.poster;
  return src ? src.replace('/original/', `/${size}/`) : undefined;
}

function pageOf(mangaId) {
  const [, kind, slug] = /^(serie|pelicula)-(.+)$/.exec(mangaId) || [];
  if (!kind) throw new Error(`Gnula: unknown title id ${mangaId}`);
  return { kind, url: `${SITE}/${kind === 'serie' ? 'series' : 'movies'}/${encodeURIComponent(slug)}` };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'peliculas', name: 'Movies' },
      { id: 'series', name: 'Series' },
      { id: 'estrenos', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const feed = request && request.feed;
    let url = `${SITE}/archives/movies/page/${page}`;
    if (feed === 'series') url = `${SITE}/archives/series/page/${page}`;
    else if (feed === 'estrenos') url = `${SITE}/archives/movies/releases/page/${page}`;
    if (tags.length) url = `${SITE}/genres/${encodeURIComponent(tags[0].id)}/page/${page}`;
    if (query) url = `${SITE}/search?q=${encodeURIComponent(query)}&p=${page}`;
    const box = pageProps(await this.get(url)).results || {};
    const results = (box.data || [])
      .filter((item) => item && item.slug && item.slug.name && item.titles && item.titles.name)
      .map((item) => {
        const isSerie = box.__typename === 'PaginatedSerie' || /^series\//.test((item.url && item.url.slug) || '');
        const kind = isSerie ? 'serie' : 'pelicula';
        return { mangaId: `${kind}-${item.slug.name}`, title: item.titles.name, image: poster(item.images, 'w342'), medium: 'anime' };
      });
    return { results, metadata: results.length && page < (box.pages || 0) ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { url } = pageOf(mangaId);
    const item = pageProps(await this.get(url)).post || {};
    return {
      mangaInfo: {
        title: (item.titles && item.titles.name) || mangaId,
        image: poster(item.images, 'w500'),
        banner: item.images && item.images.backdrop,
        desc: item.overview || '',
        artist: ((item.cast && item.cast.acting) || []).slice(0, 5).map((person) => person.name).join(', ') || undefined,
        status: 'UNKNOWN',
        tags: (item.genres || []).map((genre) => genre && genre.name).filter(Boolean),
        webURL: url,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const { kind, url } = pageOf(mangaId);
    if (kind === 'pelicula') return [{ id: 'pelicula', chapterId: 'pelicula', name: 'Película', number: 1 }];
    const post = pageProps(await this.get(url)).post || {};
    return (post.seasons || [])
      .flatMap((season) => (season.episodes || []).map((episode) => {
        const slug = episode.slug || {};
        const id = `${slug.name}/seasons/${slug.season}/episodes/${slug.episode}`;
        const time = Date.parse(episode.releaseDate);
        return {
          id,
          chapterId: id,
          name: `Episodio ${slug.episode}`,
          number: Number(slug.episode),
          season: Number(slug.season),
          seasonName: `Temporada ${slug.season}`,
          time: Number.isNaN(time) ? undefined : time,
        };
      }))
      .filter((episode) => episode.number)
      .sort((a, b) => b.season - a.season || b.number - a.number);
  }

  async getVideos(mangaId, chapterId) {
    const { kind, url } = pageOf(mangaId);
    const props = pageProps(await this.get(kind === 'pelicula' ? url : `${SITE}/series/${chapterId}`));
    const sources = ((kind === 'pelicula' ? props.post : props.episode) || {}).players || {};
    const players = SERVERS.flatMap(([server, name]) => LANGUAGES.flatMap(([key, label, audio]) => (sources[key] || [])
      .filter((player) => (player.cyberlocker || '').toLowerCase().startsWith(server) && player.result)
      .map((player) => ({ server, url: player.result, quality: `${name} ${label} (${audio})` }))));
    const found = await Promise.all(players.map((player) => this.extract(player).catch(() => null)));
    const videos = found.filter((video) => video && /^https?:\/\//.test(video.url)).map((video) => ({ ...video, headers: BROWSER }));
    if (!videos.length) throw new Error(`Gnula: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract(player) {
    const embed = /var url = '([^']+)'/.exec(await this.get(player.url));
    let html = await this.get(embed[1]);
    if (player.server === 'vidhide') {
      const code = unpack(html);
      const hls = /"hls2"\s*:\s*"(https:[^"]+)"/.exec(code) || /"hls3"\s*:\s*"(https:[^"]+)"/.exec(code);
      return { url: hls[1], quality: player.quality };
    }
    const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
    if (redirect) html = await this.get(redirect[1]);
    const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    return { url: voeSource(JSON.parse(json[1])[0]), quality: player.quality };
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', Referer: `${SITE}/`, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Gnula: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
