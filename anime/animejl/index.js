const SITE = 'https://www.anime-jl.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'OK.ru', 'VidHide', 'StreamWish', 'MixDrop', 'StreamTape', 'Uqload', 'YourUpload', 'Mp4Upload', 'Sendvid'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['1', 'Acción'], ['2', 'Artes Marciales'], ['3', 'Aventuras'], ['33', 'Ciencia Ficción'],
  ['9', 'Comedia'], ['71', 'Cultivación'], ['40', 'Demencia'], ['42', 'Demonios'],
  ['27', 'Deportes'], ['50', 'Donghua'], ['10', 'Drama'], ['25', 'Ecchi'],
  ['22', 'Escolares'], ['48', 'Espacial'], ['6', 'Fantasia'], ['67', 'Gore'],
  ['32', 'Harem'], ['31', 'Hentai'], ['43', 'Historico'], ['39', 'Horror'],
  ['45', 'Isekai'], ['70', 'Josei'], ['11', 'Juegos'], ['46', 'Latino / Castellano'],
  ['38', 'Magia'], ['41', 'Mecha'], ['44', 'Militar'], ['26', 'Misterio'],
  ['73', 'Mitología'], ['28', 'Musica'], ['13', 'Parodia'], ['51', 'Policía'],
  ['29', 'Psicologico'], ['23', 'Recuentos de la vida'], ['72', 'Reencarnación'], ['12', 'Romance'],
  ['69', 'Samurai'], ['24', 'Seinen'], ['36', 'Shoujo'], ['4', 'Shounen'],
  ['68', 'Sin Censura'], ['7', 'Sobrenatural'], ['5', 'Superpoderes'], ['21', 'Suspenso'],
  ['20', 'Terror'], ['49', 'Vampiros'], ['74', 'Venganza'], ['78', 'Video Games'],
  ['75', 'Wuxia'], ['76', 'Xianxia'], ['77', 'Xuanhuan'], ['53', 'Yaoi'], ['52', 'Yuri'],
];

function absolute(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${SITE}${url.startsWith('/') ? '' : '/'}${url}`;
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

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/animes?q=${encodeURIComponent(query)}&page=${page}`;
    } else if (tags.length) {
      const filters = tags.map((tag) => `genre[]=${encodeURIComponent(tag.id)}&`).join('');
      url = `${SITE}/animes?${filters}order=created&page=${page}`;
    } else {
      const order = request && request.feed === 'latest' ? 'updated' : 'rating';
      url = `${SITE}/animes?order=${order}&page=${page}`;
    }
    const $ = cheerio.load(await this.get(url));
    const results = $('ul.ListAnimes li article')
      .map((i, el) => {
        const card = $(el);
        const href = card.find('a').first().attr('href') || card.find('div.Description a.Button').attr('href');
        const mangaId = (/\/anime\/(\d+\/[^/?#]+)/.exec(href || '') || [])[1];
        const title = card.find('h3.Title').first().text().trim();
        const image = absolute(card.find('figure img').first().attr('src'));
        return mangaId && title ? { mangaId, title, image, medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    const next = $('ul.pagination a[rel="next"]').length > 0;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${mangaId}`));
    const status = $('span.fa-tv').text();
    const tags = $('nav.Nvgnrs a').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    return {
      mangaInfo: {
        title: $('div.Ficha div.Container .Title').first().text().trim() || mangaId,
        image: absolute($('div.AnimeCover div.Image figure img').first().attr('src')),
        desc: $('div.Description').first().text().trim().replace(/^"|"$/g, ''),
        status: /Finalizado/i.test(status) ? 'COMPLETED' : /En emisi/i.test(status) ? 'ONGOING' : 'UNKNOWN',
        tags: Array.from(new Set(tags)),
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.get(`${SITE}/anime/${mangaId}`);
    const list = /var\s+episodes\s*=\s*(\[[\s\S]*?\]);/.exec(html);
    if (!list) throw new Error('AnimeJL: the anime page has no episode list');
    const episodes = new Map();
    for (const [, numText, slug] of list[1].matchAll(/\[(\d+(?:\.\d+)?)\s*,\s*"([^"]+)"/g)) {
      const number = parseFloat(numText);
      const id = slug || `episodio-${numText}`;
      if (!episodes.has(id)) {
        episodes.set(id, {
          id,
          chapterId: id,
          name: `Episodio ${numText}`,
          number: Number.isNaN(number) ? undefined : number,
        });
      }
    }
    return Array.from(episodes.values()).sort((a, b) => (b.number || 0) - (a.number || 0));
  }

  async getVideos(mangaId, chapterId) {
    const html = await this.get(`${SITE}/anime/${mangaId}/${encodeURIComponent(chapterId)}`);
    const players = Array.from(html.matchAll(/video\[\d+\]\s*=\s*'<iframe[^>]+src="([^"]+)"/g), (match) => match[1]);
    const found = await Promise.all(players.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`AnimeJL: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const cleanUrl = url.replace(/^http:/, 'https:');
    const host = (/^https?:\/\/([^/]+)/.exec(cleanUrl) || [])[1] || '';
    const origin = `https://${host}/`;
    const isVidHide = /(^|\.)(vidhide\w*\.com|morencius\.com|minochinos\.com|dhtpre\.com|peytonepre\.com|smoothpre\.com|earnvids\.com|ryderjet\.com|bingezove\.com)$/.test(host);
    const isStreamWish = /(^|\.)(streamwish\.\w+|playerwish\.com|wishonly\.site|swhoi\.com|swdyu\.com|strwish\.com|wishembed\.pro)$/.test(host);
    if (!isVidHide && !isStreamWish && !/(^|\.)(voe\.sx|ok\.ru|mi?xdrop\.\w+|streamtape\.com|shavetape\.cash|uqload\.\w+|yourupload\.com|mp4upload\.com|sendvid\.com)$/.test(host)) {
      return null;
    }
    let html = await this.get(cleanUrl, { Referer: `${SITE}/` });
    if (isVidHide || isStreamWish) {
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      const stream = hls[1].replace(/\\\//g, '/');
      return { url: stream.startsWith('/') ? `https://${host}${stream}` : stream, quality: isVidHide ? 'VidHide' : 'StreamWish', headers: { Referer: origin } };
    }
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1], { Referer: origin });
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE', headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, quality: 'OK.ru' };
    }
    if (/(^|\.)mi?xdrop\.\w+$/.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', headers: { Referer: origin } };
    }
    if (/(^|\.)(streamtape\.com|shavetape\.cash)$/.test(host)) {
      const part = /document\.getElementById\('(?:norobot|robot)link'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/.exec(html);
      return { url: `https:${part[1]}${part[2].substring(+part[3])}`, quality: 'StreamTape', headers: { Referer: origin } };
    }
    if (/(^|\.)uqload\.\w+$/.test(host)) {
      const code = unpack(html) || html;
      const src = /sources\s*:\s*\[\s*(?:\{\s*file\s*:\s*)?"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/.exec(code);
      return { url: src[1], quality: 'Uqload', headers: { Referer: origin } };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
    if (/(^|\.)sendvid\.com$/.test(host)) {
      const src = /<source[^>]+src="([^"]+\.mp4[^"]*)"/.exec(html);
      return { url: src[1], quality: 'Sendvid', headers: { Referer: origin } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers = {}) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER, ...headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeJL: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
