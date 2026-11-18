const SITE = 'https://doramasflix.in';

const API = 'https://user-api.seriesapi.co/graphql';

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

const BYSE_HOST = /^(?:www\.)?byse[a-z0-9]{4,}\.com$/i;
const ADULT_LABELS = ['18', 'eroticas'];

const ACTION_DEFAULTS = { getEpisodeLinks: '4002fa7b2d7a06e42d3631bad9d89e4c37c49b6f44', getMovieLinks: '4073f74d727a230f5f3813bd7aa8b734942f5c1563' };
const ACTION_KEY = 'doramasflix.actions.v1';
const ACTION_LOOKUP_CHUNKS = 70;
const EMBED_MAX = 6;

const ITEM_FIELDS = '_id name name_es slug poster_path poster labels { slug } __typename';

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

function ageOf(item) {
  const labels = (item && item.labels) || [];
  return labels.some((label) => label && ADULT_LABELS.indexOf(String(label.slug || '').toLowerCase()) >= 0) ? 18 : 0;
}

function cardOf(item, fallbackKind = 'dorama') {
  if (!item || !item.slug || !item._id) return null;
  const kind = /^movie/i.test(String(item.__typename || fallbackKind)) ? 'movie' : 'dorama';
  return {
    mangaId: `${kind}/${item._id}/${item.slug}`,
    title: titleOf(item) || item.slug,
    image: imageOf(item.poster_path || item.poster, 'w342'),
    medium: 'anime',
    ageRating: ageOf(item),
  };
}

function parseMangaId(mangaId) {
  const [, kind, id, slug] = /^(dorama|movie)\/([^/]+)\/(.+)$/.exec(mangaId || '') || [];
  if (kind) return { kind, id, slug };
  return { kind: 'dorama', id: '', slug: String(mangaId || '') };
}

function parseFlight(text) {
  const body = String(text || '');
  if (!/^0:/.test(body)) return null;
  const line = /^1:(.*)$/m.exec(body);
  if (!line) return null;
  try {
    const value = JSON.parse(line[1]);
    return Array.isArray(value) ? value : null;
  } catch (e) {
    return null;
  }
}

function padBase64(text) {
  const plain = String(text).replace(/-/g, '+').replace(/_/g, '/');
  return plain + '==='.slice((plain.length + 3) % 4);
}

function realUrlOf(link) {
  const raw = String(link || '').trim();
  const token = raw.split('?')[0].split('/').pop();
  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(App.base64Decode(padBase64(parts[1])));
      const real = payload && payload.link ? App.base64Decode(padBase64(payload.link)) : '';
      if (/^https?:\/\//i.test(real)) return real;
    } catch (e) {
    }
  }
  return /^https?:\/\//i.test(raw) ? raw : '';
}

function hostOf(url) {
  return (/^https?:\/\/([^/:?#]+)/i.exec(String(url)) || [])[1] || '';
}

const HOST_NAMES = [
  [/(^|\.)voe\./i, 'VOE'],
  [/(^|\.)ok\.ru$/i, 'OK.ru'],
  [/(^|\.)uqload\./i, 'Uqload'],
  [/lulu/i, 'Lulu'],
  [/mi?xdrop\./i, 'MixDrop'],
  [/(^|\.)(callistanise|vidhide\w*)\./i, 'VidHide'],
  [/(^|\.)yourupload\.com$/i, 'YourUpload'],
  [/(^|\.)mp4upload\.com$/i, 'Mp4Upload'],
  [/(^|\.)streamtape\./i, 'Streamtape'],
  [/(^|\.)(do7go|dood\w*|dsvplay|d-s|ds2play|doodstream)\./i, 'Doodstream'],
  [BYSE_HOST, 'Byse'],
];
function hostLabel(url) {
  const host = hostOf(url);
  const hit = HOST_NAMES.find(([test]) => test.test(host));
  if (hit) return hit[1];
  const main = host.replace(/^www\./, '').split('.')[0] || 'Server';
  return main.charAt(0).toUpperCase() + main.slice(1);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.actions = null;
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
    const seen = new Set();
    const tags = [];
    for (const genre of data.listGenres || []) {
      if (!genre || !genre._id || !genre.name) continue;
      const label = genre.name.trim();
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      tags.push({ id: genre._id, label });
    }
    return tags;
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'popular';
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const data = await this.gql(
        `query ($input: String!) { searchDorama(input: $input, limit: 32) { ${ITEM_FIELDS} } searchMovie(input: $input, limit: 32) { ${ITEM_FIELDS} } }`,
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
    if (feed === 'movies') {
      const data = await this.gql(
        `query ($page: Int, $filter: FilterMoviesInput) { paginationMovie(page: $page, limit: 32, sort: CREATEDAT_DESC, filter: $filter) { pageInfo { hasNextPage } items { ${ITEM_FIELDS} } } }`,
        { page, filter: tags.length ? { genreId: tags[0].id } : {} }
      );
      const pageData = data.paginationMovie || {};
      const results = (pageData.items || []).map((item) => cardOf(item, 'movie')).filter(Boolean);
      return { results, metadata: pageData.pageInfo && pageData.pageInfo.hasNextPage ? { page: page + 1 } : undefined };
    }
    const filter = tags.length ? { isTVShow: false, genreId: tags[0].id } : { isTVShow: feed === 'varieties' };
    const sort = !tags.length && feed === 'popular' ? 'POPULARITY_DESC' : 'CREATEDAT_DESC';
    const data = await this.gql(
      `query ($page: Int, $sort: SortDorama, $filter: FilterDoramasInput) { paginationDorama(page: $page, limit: 32, sort: $sort, filter: $filter) { pageInfo { hasNextPage } items { ${ITEM_FIELDS} } } }`,
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
      ? 'query ($slug: String!) { detailMovie(filter: {slug: $slug}) { _id name name_es slug overview poster_path poster backdrop_path genres { name } networks { name } labels { slug } } }'
      : 'query ($slug: String!) { detailDorama(filter: {slug: $slug}) { _id name name_es slug overview poster_path poster backdrop_path isFinish genres { name } networks { name } labels { slug } } }';
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
        ageRating: ageOf(item),
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
    if (!serieId) throw new Error('DoramasFlix: that title was not found');
    const data = await this.gql(
      'query ($id: ID!) { listEpisodes(sort: NUMBER_ASC, filter: {serie_id: $id}) { slug name season_number episode_number air_date } }',
      { id: serieId }
    );
    const items = (data.listEpisodes || []).filter((ep) => ep && ep.slug);
    const seasons = new Set(items.map((ep) => Number(ep.season_number) || 1));
    const multiSeason = seasons.size > 1;
    const seen = new Map();
    for (const ep of items) {
      const season = Number(ep.season_number) || 1;
      const number = Number(ep.episode_number) || 1;
      const stamp = /^\d{9,}$/.test(String(ep.air_date || '')) ? Number(ep.air_date) : Date.parse(ep.air_date);
      seen.set(ep.slug, {
        id: ep.slug,
        chapterId: ep.slug,
        name: `Episodio ${number}`,
        number,
        season: multiSeason ? String(season) : undefined,
        seasonName: multiSeason ? `Temporada ${season}` : undefined,
        time: Number.isFinite(stamp) ? stamp : undefined,
        _s: season,
      });
    }
    return Array.from(seen.values())
      .sort((a, b) => b._s - a._s || b.number - a.number)
      .map(({ _s, ...episode }) => episode);
  }

  async getVideos(mangaId, chapterId) {
    const isMovie = String(chapterId).startsWith('movie/');
    let pageUrl;
    let links;
    if (isMovie) {
      let { id, slug } = parseMangaId(chapterId);
      if (!id) {
        const data = await this.gql('query ($slug: String!) { detailMovie(filter: {slug: $slug}) { _id } }', { slug });
        id = data.detailMovie && data.detailMovie._id;
      }
      pageUrl = `${SITE}/peliculas-online/${encodeURIComponent(slug)}`;
      links = await this.links('getMovieLinks', { movie_id: id || '' }, pageUrl);
    } else {
      const slug = String(chapterId);
      const data = await this.gql('query ($slug: String!) { detailEpisode(filter: {slug: $slug}) { _id } }', { slug });
      const episodeId = data.detailEpisode && data.detailEpisode._id;
      if (!episodeId) throw new Error('DoramasFlix has no such episode');
      pageUrl = `${SITE}/episodios/${encodeURIComponent(slug)}`;
      links = await this.links('getEpisodeLinks', { episode_id: episodeId }, pageUrl);
    }

    const unique = new Map();
    for (const link of links) {
      const url = realUrlOf(link && link.link);
      if (url && !unique.has(url)) unique.set(url, { url, lang: LANGUAGES[link.lang] || 'Sub' });
    }
    const entries = Array.from(unique.values());
    const found = await Promise.all(entries.map((entry) => this.extract(entry.url, entry.lang).catch(() => null)));
    const seenUrl = new Set();
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url) && !seenUrl.has(video.url) && seenUrl.add(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, ...video }) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));

    const embeds = entries
      .filter((entry, i) => !(found[i] && /^https?:\/\//.test(found[i].url)) && /^https?:\/\//.test(entry.url))
      .slice(0, EMBED_MAX)
      .map((entry) => {
        const label = hostLabel(entry.url);
        const embed = { url: entry.url, type: 'embed', quality: `${label} ${entry.lang}`, server: label };
        if (BYSE_HOST.test(hostOf(entry.url))) embed.headers = { Referer: pageUrl };
        return embed;
      });
    if (!videos.length && !embeds.length) {
      throw new Error(links.length ? `DoramasFlix: none of the ${links.length} servers gave a playable video` : 'DoramasFlix lists no servers for this title yet');
    }
    return videos.concat(embeds);
  }

  async links(action, args, pageUrl) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ids = await this.actionIds(attempt > 0 ? pageUrl : '');
      const reply = await this.post(pageUrl, ids[action], JSON.stringify([args]));
      const parsed = parseFlight(reply);
      if (parsed) return parsed.filter((link) => link && link.link);
      last = reply;
      this.actions = null;
    }
    throw new Error(`DoramasFlix: the site did not answer its links call${/^</.test(String(last || '')) ? ' (it sent a page)' : ''}`);
  }

  async actionIds(lookupPage) {
    if (!lookupPage) {
      if (this.actions) return this.actions;
      let saved = null;
      try {
        const state = typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null;
        saved = state ? await state.retrieve(ACTION_KEY) : null;
      } catch (e) {
        saved = null;
      }
      this.actions = saved && saved.getEpisodeLinks && saved.getMovieLinks ? { getEpisodeLinks: saved.getEpisodeLinks, getMovieLinks: saved.getMovieLinks } : { ...ACTION_DEFAULTS };
      return this.actions;
    }
    const html = await this.get(lookupPage);
    const chunks = [];
    const pattern = /<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/g;
    let match;
    while ((match = pattern.exec(html)) && chunks.length < ACTION_LOOKUP_CHUNKS) {
      if (chunks.indexOf(match[1]) < 0) chunks.push(match[1]);
    }
    const idOf = (code, name) => (new RegExp(`"([0-9a-f]{40,})"[^"]{0,160}?"${name}"`).exec(code) || [])[1];
    let found = null;
    let next = 0;
    const worker = async () => {
      while (!found && next < chunks.length) {
        const chunk = chunks[next++];
        let code = '';
        try {
          code = await this.get(`${SITE}${chunk}`);
        } catch (e) {
          continue;
        }
        const episodes = idOf(code, 'getEpisodeLinks');
        const movies = idOf(code, 'getMovieLinks');
        if (episodes && movies) found = { getEpisodeLinks: episodes, getMovieLinks: movies };
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!found) throw new Error('DoramasFlix: could not find the site\'s links call in its scripts');
    this.actions = found;
    try {
      const state = typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null;
      if (state) await state.store(ACTION_KEY, found);
    } catch (e) {
    }
    return found;
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
      const pattern = /getElementById\('robotlink'\)\.innerHTML\s*=\s*(['"])([^'"]*)\1\s*\+\s*(?:''\s*\+\s*)?\(\s*(['"])([^'"]+)\3\s*\)((?:\.substring\(\d+\))+)/g;
      let tape = null;
      let found;
      while ((found = pattern.exec(html))) tape = found;
      if (!tape) throw new Error('Streamtape: no address on its page');
      const cut = (tape[5].match(/\d+/g) || []).reduce((sum, n) => sum + Number(n), 0);
      const address = (tape[2] + tape[4].slice(cut)).replace(/^\/\//, 'https://');
      return { url: address, type: 'mp4', server: 'Streamtape', quality: `Streamtape ${langLabel}`, headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html', Referer: `${SITE}/` } });
  }

  async post(pageUrl, actionId, body) {
    const response = await this.requests.schedule(
      App.createRequest({
        url: pageUrl,
        method: 'POST',
        headers: { ...BROWSER, Accept: 'text/x-component', 'Content-Type': 'text/plain;charset=UTF-8', 'Next-Action': actionId, Origin: SITE, Referer: pageUrl },
        body,
      })
    );
    return String(response.data || '');
  }

  async gql(query, variables = {}) {
    const text = await this.send({
      url: API,
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: SITE, Referer: `${SITE}/` },
      body: JSON.stringify({ query, variables }),
    });
    let reply;
    try {
      reply = JSON.parse(text);
    } catch (e) {
      throw new Error('DoramasFlix: its API did not answer JSON');
    }
    if (reply.errors && !reply.data) throw new Error(`DoramasFlix: its API refused the query (${String((reply.errors[0] && reply.errors[0].message) || '').slice(0, 120)})`);
    return reply.data || {};
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...BROWSER, ...request.headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`DoramasFlix: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
