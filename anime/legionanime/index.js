const SITE = 'https://legionanime.xyz';
const API = 'https://legionanime.club/api';
const CDN = 'https://la-space-4.sfo2.cdn.digitaloceanspaces.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const DEVICE_JSON = JSON.stringify({
  mob3: 'wj2fea7esGZ44ef',
  mob: 'ca-app-pub-8704883736496335~2640452466',
  mob2: 'ca-app-pub-8704883736496335/7509635763',
  laltx: 'ca-app-pub-7457591504273346/96408526573970637unleinunleba',
  language: 'es',
  isDeb: false,
  mobx: 'ca-app-pub-7457591504273346~4714978974',
  loadLvl: 1,
  code_name: 'emu64xa',
  vcode: '2.0.2.6',
  platform: '13',
  lalt: 'ca-app-pub-8704883736496335/71217888083970637unleinunleba',
  kind_device: '0',
  manufacturer: 'Google',
  som: 'android',
  device_name: 'Sdk_gphone64_x86_64',
  player_id: '50dfea02-9f24-4116-902b-a726146da421',
  mobf: 'ca-app-pub-8704883736496335/2195575817',
  ipv6: 'FE80::6898:34FF:FE32:E13E',
  root: '0',
  eth: '02:00:00:00:00:00',
  tel: 'XXX-XXX-XXX',
  UUID: '00000000-0001-a657-0001-aad30001b11d',
  yek: 'bqUgI4l339bqQbnz',
  moned: false,
  lvl_sign: 1,
  mobfx: 'ca-app-pub-7457591504273346/1377852271',
  device_id: '',
  orp: false,
  modelo: 'sdk_gphone64_x86_64',
  market_name: 'Sdk_gphone64_x86_64',
  token: 'es',
  isSign: true,
  malt: 'ca-app-pub-8704883736496335/7121788808',
  maltx: 'ca-app-pub-7457591504273346/9640852657',
  api_lvl: '33',
  package_version: '50',
  kind_release: 0,
  ipLocal: '10.0.2.15',
  mob2x: 'ca-app-pub-7457591504273346/9640852657',
  wlan: '02:00:00:00:00:00',
  inmo: 'a3c41c881e7f4bc982db32a889eb9e57',
  inst: '',
  package_name: 'aplicaciones.paleta.legionanimefull',
  androidID: 'b70a95e4fda18f3c',
});

const API_HEADERS = {
  json: DEVICE_JSON,
  'User-Agent': 'android l3gi0n4N1mE %E6%9C%AC%E7%89%A9',
  Accept: 'application/json',
};

const API_BODY = 'apyki=pM7VYr2bBG2plWQp';

const GENRES = [
  ['1', 'Acción'],
  ['11', 'Artes Marciales'],
  ['21', 'Aventuras'],
  ['31', 'Carreras'],
  ['2', 'Ciencia Ficción'],
  ['12', 'Comedia'],
  ['22', 'Demencia'],
  ['32', 'Demonios'],
  ['3', 'Deportes'],
  ['45', 'Donghua'],
  ['13', 'Drama'],
  ['23', 'Ecchi'],
  ['33', 'Escolares'],
  ['4', 'Espacial'],
  ['14', 'Fantasía'],
  ['24', 'Harem'],
  ['34', 'Histórico'],
  ['5', 'Infantil'],
  ['43', 'Isekai'],
  ['15', 'Josei'],
  ['25', 'Juegos'],
  ['41', 'Latino y Castellano'],
  ['35', 'Magia'],
  ['6', 'Mecha'],
  ['16', 'Militar'],
  ['26', 'Misterio'],
  ['36', 'Música'],
  ['7', 'Parodia'],
  ['17', 'Policía'],
  ['27', 'Psicológico'],
  ['37', 'Recuentos de la vida'],
  ['8', 'Romance'],
  ['18', 'Samurai'],
  ['28', 'Seinen'],
  ['38', 'Shoujo'],
  ['9', 'Shounen'],
  ['19', 'Sobrenatural'],
  ['29', 'Superpoderes'],
  ['39', 'Suspenso'],
  ['10', 'Terror / Gore'],
  ['20', 'Vampiros'],
  ['30', 'Yaoi'],
  ['40', 'Yuri'],
];

const SERVERS = ['MediaFire', 'YourUpload', 'Mp4Upload', 'Streamtape', 'OK.ru', 'Desu', 'VideoFLV', 'AnimeCen'];

function decodePlayerUrl(raw) {
  const idx = (raw || '').indexOf('-');
  if (idx < 0) return '';
  const body = raw.slice(idx + 1);
  return (raw.startsWith('F-') ? body : body.split('').reverse().join('')).trim();
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const orderBy = request && request.feed === 'latest' ? '2' : '4';
    const genre = tags.map((tag) => encodeURIComponent(tag.id)).join('%2C');
    const offset = (page - 1) * 24;
    const url = `${API}/v2/directories?studio=0&not_genre=&year=&orderBy=${orderBy}&language=&type=&duration=&search=${encodeURIComponent(query)}&letter=0&limit=24&genre=${genre}&season=&page=${offset}&status=`;
    const data = await this.apiPost(url);
    const list = Array.isArray(data && data.response) ? data.response : [];
    const results = list
      .filter((item) => item && item.id && item.nombre)
      .map((item) => ({
        mangaId: String(item.id),
        title: String(item.nombre).trim(),
        image: item.img_url ? `${CDN}/${item.img_url}` : item.img_extra ? `https://cdn.myanimelist.net/images/anime/${item.img_extra}` : undefined,
        medium: 'anime',
      }));
    return { results, metadata: results.length === 24 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const data = await this.apiGet(`${API}/v1/episodes/${encodeURIComponent(mangaId)}`);
    const anime = (data && data.response && data.response.anime) || {};
    const banner = anime.img_large_url ? `${CDN}/${anime.img_large_url}` : undefined;
    const image = anime.img_extra ? `https://cdn.myanimelist.net/images/anime/${anime.img_extra}` : banner;
    const status = anime.status === 'Finalizado' ? 'COMPLETED' : anime.status === 'En emisión' ? 'ONGOING' : 'UNKNOWN';
    const tags = String(anime.genres || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return {
      mangaInfo: {
        title: String(anime.name || mangaId).trim(),
        image,
        banner,
        desc: String(anime.synopsis || '').trim(),
        status,
        tags,
        webURL: SITE,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const data = await this.apiGet(`${API}/v1/episodes/${encodeURIComponent(mangaId)}`);
    const list = (data && data.response && data.response.episodes) || [];
    return list.map((episode, index) => {
      const id = String(episode.id);
      const rawNum = parseFloat(episode.name);
      const number = Number.isFinite(rawNum) ? rawNum : list.length - index;
      return {
        id,
        chapterId: id,
        name: `Episodio ${episode.name}`,
        number,
      };
    });
  }

  async getVideos(mangaId, chapterId) {
    const data = await this.apiPost(`${API}/v2/episode_links/${encodeURIComponent(chapterId)}`);
    const players = ((data && data.response && data.response.players) || [])
      .map((player) => ({ option: player.option || '', url: decodePlayerUrl(player.name) }))
      .filter((player) => /^https?:\/\//.test(player.url));
    const found = await Promise.all(players.map((player) => this.extract(player).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...BROWSER, ...video.headers } }));
    if (!videos.length) throw new Error(`LegionAnime: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract({ url }) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (/flvvideo/.test(host) && /\.(m3u8|mp4)(\?|$)/.test(url)) return { url, quality: 'VideoFLV' };
    if (/cdnlat4animecen/.test(host) && /\.(class|m3u8|mp4)(\?|$)/.test(url)) return { url, quality: 'AnimeCen' };
    if (/(^|\.)mediafire\.com$/.test(host)) {
      const normalized = url.replace(/^https?:\/\/(www\.)?mediafire\.com/, 'https://www.mediafire.com');
      const $ = cheerio.load(await this.get(normalized));
      const direct = $('a#downloadButton').attr('href');
      if (direct && /^https?:\/\//.test(direct)) return { url: direct, quality: 'MediaFire' };
      return null;
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(await this.get(url));
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(await this.get(url));
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
    if (/(^|\.)streamtape\./.test(host)) {
      const html = await this.get(url);
      const robot = /getElementById\('robotlink'\)\.innerHTML\s*=\s*'([^']*)'\s*\+\s*\('([^']*)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/.exec(html);
      if (!robot) return null;
      const skip = +robot[3] + (+robot[4] || 0);
      return { url: `https:${robot[1]}${robot[2].slice(skip)}&stream=1`, quality: 'Streamtape', headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(await this.get(url));
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, quality: 'OK.ru' };
    }
    if (/(^|\.)jkanime\./.test(host)) {
      const html = await this.get(url);
      const stream = /url:\s*'([^']+)'/.exec(html);
      if (stream) return { url: stream[1], quality: 'Desu' };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async apiGet(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: API_HEADERS }));
    if (response.status < 200 || response.status >= 300) throw new Error(`LegionAnime: HTTP ${response.status} from ${url}`);
    return JSON.parse(String(response.data));
  }

  async apiPost(url) {
    const response = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'POST',
        headers: { ...API_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: API_BODY,
      })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`LegionAnime: HTTP ${response.status} from ${url}`);
    return JSON.parse(String(response.data));
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url: url.replace(/^http:/, 'https:'), method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`LegionAnime: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
