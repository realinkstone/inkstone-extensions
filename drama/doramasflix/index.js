const SITE = 'https://doramasflix.in';

const API = 'https://sv1.fluxcedene.net/api/gql';

const ACCESS_PLATFORM = 'RxARncfg1S_MdpSrCvreoLu_SikCGMzE1NzQzODc3NjE2MQ==';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'OK.ru', 'VidHide', 'Uqload', 'Lulu', 'Streamtape', 'YourUpload', 'MixDrop', 'Mp4Upload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const LANGUAGES = {
  36: 'Inglés (Sub)',
  37: 'Castellano (Dub)',
  38: 'Latino (Dub)',
  192: 'Sub',
  1327: 'Portugués (Sub)',
  13109: 'Coreano (Sub)',
  13110: 'Japonés (Sub)',
  13111: 'Mandarín (Sub)',
  13112: 'Tailandés (Sub)',
  13113: 'Filipino (Sub)',
  13114: 'Indonesio (Sub)',
  343422: 'Vietnamita (Sub)',
};

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function voeSource(payload) {
  const clean = VOE_MARKERS.reduce((text, marker) => text.split(marker).join(''), rot13(payload));
  const shifted = App.base64Decode(clean).split('').map((ch) => String.fromCharCode(ch.charCodeAt(0) - 3)).join('');
  return JSON.parse(App.base64Decode(shifted.split('').reverse().join(''))).source;
}

function imageOf(path, size = 'w500') {
  if (!path) return undefined;
  return /^https?:\/\//.test(path) ? path : `https://image.tmdb.org/t/p/${size}${path}`;
}

function titleOf(item) {
  const name = (item && item.name) || '';
  const es = (item && item.name_es) || '';
  return es && es.toLowerCase() !== name.toLowerCase() ? `${name} (${es})` : name || es;
}

function cardOf(item, fallbackKind = 'dorama') {
  if (!item || !item.slug || !item._id) return null;
  const kind = String(item.__typename || fallbackKind).toLowerCase() === 'movie' ? 'movie' : 'dorama';
  return {
    mangaId: `${kind}/${item._id}/${item.slug}`,
    title: titleOf(item) || item.slug,
    image: imageOf(item.poster_path || item.poster, 'w342'),
    medium: 'anime',
  };
}

function parseMangaId(mangaId) {
  const [, kind, id, slug] = /^(dorama|movie)\/([^/]+)\/(.+)$/.exec(mangaId || '') || [];
  if (kind) return { kind, id, slug };
  return { kind: 'dorama', id: '', slug: String(mangaId || '') };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 8 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular Dramas' },
      { id: 'movies', name: 'Movies' },
      { id: 'varieties', name: 'TV Shows' },
      { id: 'latest', name: 'Latest Dramas' },
    ];
  }

  async getSearchTags() {
    const data = await this.gql('query { listGenres(filter: {}) { _id name } }');
    return (data.listGenres || [])
      .filter((genre) => genre && genre._id && genre.name)
      .map((genre) => ({ id: genre._id, label: genre.name.trim() }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const data = await this.gql(
        'query ($input: String!) { searchDorama(input: $input, limit: 32) { _id slug name name_es poster_path poster __typename } searchMovie(input: $input, limit: 32) { _id slug name name_es poster_path poster __typename } }',
        { input: query }
      );
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const list = [...(data.searchDorama || []), ...(data.searchMovie || [])]
        .filter((item) => {
          const hay = `${(item && item.name) || ''} ${(item && item.name_es) || ''} ${(item && item.slug) || ''}`.toLowerCase();
          return words.some((word) => hay.includes(word));
        })
        .map((item) => cardOf(item))
        .filter(Boolean);
      return { results: list };
    }
    if (!tags.length && feed === 'movies') {
      const data = await this.gql(
        'query ($page: Int) { paginationMovie(page: $page, perPage: 32, sort: CREATEDAT_DESC, filter: {}) { pageInfo { hasNextPage } items { _id name name_es slug poster_path poster __typename } } }',
        { page }
      );
      const pageData = data.paginationMovie || {};
      const results = (pageData.items || []).map((item) => cardOf(item, 'movie')).filter(Boolean);
      return { results, metadata: pageData.pageInfo && pageData.pageInfo.hasNextPage ? { page: page + 1 } : undefined };
    }
    const filter = tags.length
      ? { isTVShow: false, genreId: tags[0].id }
      : { isTVShow: feed === 'varieties' };
    const sort = !tags.length && feed === 'popular' ? 'POPULARITY_DESC' : 'CREATEDAT_DESC';
    const data = await this.gql(
      'query ($page: Int, $sort: SortFindManyDoramaInput, $filter: FilterFindManyDoramaInput) { paginationDorama(page: $page, perPage: 32, sort: $sort, filter: $filter) { pageInfo { hasNextPage } items { _id name name_es slug poster_path poster __typename } } }',
      { page, sort, filter }
    );
    const pageData = data.paginationDorama || {};
    const results = (pageData.items || []).map((item) => cardOf(item, 'dorama')).filter(Boolean);
    return { results, metadata: pageData.pageInfo && pageData.pageInfo.hasNextPage ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { kind, slug } = parseMangaId(mangaId);
    const isMovie = kind === 'movie';
    const query = isMovie
      ? 'query ($slug: String!) { detailMovie(filter: {slug: $slug}) { _id name name_es slug overview poster_path poster backdrop_path genres { name } networks { name } } }'
      : 'query ($slug: String!) { detailDorama(filter: {slug: $slug}) { _id name name_es slug overview poster_path poster backdrop_path isFinish genres { name } networks { name } } }';
    const data = await this.gql(query, { slug });
    const item = (isMovie ? data.detailMovie : data.detailDorama) || {};
    const title = titleOf(item) || slug;
    const author = (item.networks || []).map((net) => net && net.name).filter(Boolean).join(', ') || undefined;
    return {
      mangaInfo: {
        title,
        image: imageOf(item.poster_path || item.poster, 'w500'),
        banner: imageOf(item.backdrop_path, 'w780'),
        desc: (item.overview || '').trim() || title,
        author,
        status: isMovie || item.isFinish ? 'COMPLETED' : 'UNKNOWN',
        tags: (item.genres || []).map((genre) => genre && genre.name).filter(Boolean),
        webURL: `${SITE}/${isMovie ? 'peliculas-online' : 'doramas-online'}/${encodeURIComponent(slug)}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const { kind, id, slug } = parseMangaId(mangaId);
    if (kind === 'movie') return [{ id: mangaId, chapterId: mangaId, name: 'Película', number: 1 }];
    let serieId = id;
    if (!serieId) {
      const data = await this.gql('query ($slug: String!) { detailDorama(filter: {slug: $slug}) { _id } }', { slug });
      serieId = data.detailDorama && data.detailDorama._id;
    }
    const data = await this.gql(
      'query ($id: MongoID!) { listEpisodes(sort: NUMBER_ASC, filter: {serie_id: $id}) { slug name season_number episode_number air_date } }',
      { id: serieId }
    );
    const items = (data.listEpisodes || []).filter((ep) => ep && ep.slug);
    const seasons = new Set(items.map((ep) => Number(ep.season_number) || 1));
    const multiSeason = seasons.size > 1;
    const seen = new Map();
    for (const ep of items) {
      const season = Number(ep.season_number) || 1;
      const number = Number(ep.episode_number) || 1;
      const time = ep.air_date ? Date.parse(ep.air_date) : NaN;
      seen.set(ep.slug, {
        id: ep.slug,
        chapterId: ep.slug,
        name: `Episodio ${number}`,
        number,
        season: multiSeason ? String(season) : undefined,
        seasonName: multiSeason ? `Temporada ${season}` : undefined,
        time: Number.isNaN(time) ? undefined : time,
        _s: season,
      });
    }
    return Array.from(seen.values())
      .sort((a, b) => b._s - a._s || b.number - a.number)
      .map(({ _s, ...episode }) => episode);
  }

  async getVideos(mangaId, chapterId) {
    const isMovie = String(chapterId).startsWith('movie/');
    const slug = isMovie ? parseMangaId(chapterId).slug : String(chapterId);
    const query = isMovie
      ? 'query ($slug: String!) { detailMovie(filter: {slug: $slug}) { links_online } }'
      : 'query ($slug: String!) { detailEpisode(filter: {slug: $slug}) { links_online } }';
    const data = await this.gql(query, { slug });
    const item = (isMovie ? data.detailMovie : data.detailEpisode) || {};
    const links = (item.links_online || []).filter((entry) => entry && (entry.link || entry.embed));
    const found = await Promise.all(
      links.map((entry) => this.extract(entry.link || entry.embed, LANGUAGES[entry.lang] || 'Sub').catch(() => null))
    );
    const unique = new Map();
    for (const video of found) {
      if (video && /^https?:\/\//.test(video.url) && !unique.has(video.url)) unique.set(video.url, video);
    }
    const videos = Array.from(unique.values())
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, ...video }) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`DoramasFlix: none of the ${links.length} servers gave a playable video`);
    return videos;
  }

  async extract(rawUrl, langLabel) {
    const url = rawUrl
      .replace(/^http:/, 'https:')
      .replace(/^\/\//, 'https://')
      .replace(/^https:\/\/mi?xdrop\.[^/]+\//, 'https://mixdrop.top/')
      .replace(/^https:\/\/(vidhidepre|vidhidepro|vidhide)\.com\//, 'https://callistanise.com/');
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(callistanise\.com|voe\.sx|lulu|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com|streamtape\.com|uqload\.\w+)/.test(host)) return null;
    let html = await this.get(url);
    if (/(^|\.)callistanise\.com$/.test(host)) {
      const code = unpack(html) || html;
      const hls = (/"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"([^"]+)"/.exec(code) || [])[1];
      const stream = hls && (hls.startsWith('/') ? `https://callistanise.com${hls}` : hls);
      return { url: stream, server: 'VidHide', quality: `VidHide ${langLabel}`, headers: { Referer: origin } };
    }
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', quality: `VOE ${langLabel}` };
    }
    if (/(^|\.)lulu/.test(host)) {
      const file = /file:\s*"([^"]+)"/.exec(html) || /file:\s*"([^"]+)"/.exec(unpack(html));
      return { url: file[1], server: 'Lulu', quality: `Lulu ${langLabel}`, headers: { Referer: origin } };
    }
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), server: 'MixDrop', quality: `MixDrop ${langLabel}`, headers: { Referer: 'https://mixdrop.top/' } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl || metadata.ondemandHls, server: 'OK.ru', quality: `OK.ru ${langLabel}`, headers: { Referer: origin } };
    }
    if (/(^|\.)uqload\.\w+$/.test(host)) {
      const code = unpack(html) || html;
      const src = /sources\s*:\s*\[\s*(?:\{\s*file\s*:\s*)?"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/.exec(code);
      return { url: src[1], server: 'Uqload', quality: `Uqload ${langLabel}`, headers: { Referer: origin } };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], server: 'YourUpload', quality: `YourUpload ${langLabel}`, headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], server: 'Mp4Upload', quality: `Mp4Upload ${langLabel}`, headers: { Referer: origin } };
    }
    if (/(^|\.)streamtape\.com$/.test(host)) {
      const tape = /getElementById\('robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/.exec(html);
      return { url: `https://streamtape.com/${tape[1].slice(+tape[2] + (+tape[3] || 0))}&stream=1`, server: 'Streamtape', quality: `Streamtape ${langLabel}`, headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html', Referer: `${SITE}/` } });
  }

  async gql(query, variables = {}) {
    const text = await this.send({
      url: API,
      method: 'POST',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        Origin: SITE,
        Referer: `${SITE}/`,
        platform: 'doramasflix',
        authorization: 'Bear',
        'x-access-jwt-token': '',
        'x-access-platform': ACCESS_PLATFORM,
      },
      body: JSON.stringify({ query, variables }),
    });
    return JSON.parse(text).data || {};
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...BROWSER, ...request.headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`DoramasFlix: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
