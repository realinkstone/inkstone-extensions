const SITE = 'https://www.animelatinohd.com';
const API = 'https://api.animelatinohd.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['FileLions', 'StreamWish', 'VidHide', 'Filemoon', 'VOE', 'OK.ru', 'Doodstream', 'StreamTape', 'YourUpload', 'Mp4Upload', 'SolidFiles', 'Od.lk', 'CldUp'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['accion', 'Acción'], ['aliens', 'Aliens'], ['artes-marciales', 'Artes Marciales'], ['aventura', 'Aventura'],
  ['ciencia-ficcion', 'Ciencia Ficción'], ['comedia', 'Comedia'], ['cyberpunk', 'Cyberpunk'], ['demonios', 'Demonios'],
  ['deportes', 'Deportes'], ['detectives', 'Detectives'], ['drama', 'Drama'], ['ecchi', 'Ecchi'],
  ['escolar', 'Escolar'], ['espacio', 'Espacio'], ['fantasia', 'Fantasía'], ['gore', 'Gore'],
  ['harem', 'Harem'], ['historico', 'Histórico'], ['horror', 'Horror'], ['josei', 'Josei'],
  ['juegos', 'Juegos'], ['kodomo', 'Kodomo'], ['magia', 'Magia'], ['maho-shoujo', 'Maho Shoujo'],
  ['mecha', 'Mecha'], ['militar', 'Militar'], ['misterio', 'Misterio'], ['musica', 'Musica'],
  ['parodia', 'Parodia'], ['policial', 'Policial'], ['psicologico', 'Psicológico'], ['recuentos-de-la-vida', 'Recuentos De La Vida'],
  ['romance', 'Romance'], ['samurais', 'Samurais'], ['seinen', 'Seinen'], ['shoujo', 'Shoujo'],
  ['shoujo-ai', 'Shoujo Ai'], ['shounen', 'Shounen'], ['shounen-ai', 'Shounen Ai'], ['sobrenatural', 'Sobrenatural'],
  ['soft-hentai', 'Soft Hentai'], ['super-poderes', 'Super Poderes'], ['suspenso', 'Suspenso'], ['terror', 'Terror'],
  ['vampiros', 'Vampiros'], ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
];

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

function pageData(html) {
  const $ = cheerio.load(html);
  let data = null;
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    if (text.includes('{"props":{"pageProps":')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.props && parsed.props.pageProps && parsed.props.pageProps.data) {
          data = parsed.props.pageProps.data;
        }
      } catch (_) {}
    }
  });
  const hasNext = $('#__next > main > div > div[class*="Animes_paginate"] a:last-child svg').length > 0;
  return { data, hasNext };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'directory', name: 'Directory' },
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
    let isPopularFeed = false;
    if (query) {
      url = `${SITE}/animes?page=${page}&search=${encodeURIComponent(query)}`;
    } else if (tags.length) {
      url = `${SITE}/animes?page=${page}&genre=${encodeURIComponent(tags[0].id)}&status=&type=`;
    } else if (request && request.feed === 'latest') {
      url = `${SITE}/animes?page=${page}&status=1`;
    } else if (request && request.feed === 'directory') {
      url = `${SITE}/animes?page=${page}&genre=&status=&type=`;
    } else {
      url = `${SITE}/animes/populares`;
      isPopularFeed = true;
    }
    const { data, hasNext } = pageData(await this.get(url));
    if (!data) throw new Error('AnimeLatinoHD: page data could not be loaded');
    const items = isPopularFeed ? data.popular_today || [] : data.data || [];
    const results = items
      .map((item) => {
        const mangaId = item && item.slug ? String(item.slug) : null;
        const title = item && item.name ? String(item.name).trim() : '';
        const image = item && item.poster ? `https://image.tmdb.org/t/p/w200${item.poster}` : undefined;
        return mangaId && title ? { mangaId, title, image, medium: 'anime' } : null;
      })
      .filter(Boolean);
    return {
      results,
      metadata: !isPopularFeed && results.length && hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const { data } = pageData(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    if (!data) throw new Error('AnimeLatinoHD: anime details could not be loaded');
    const statusText = String(data.status ?? '');
    const tags = typeof data.genres === 'string'
      ? data.genres.split(',').map((g) => g.trim()).filter(Boolean)
      : Array.isArray(data.genres)
        ? data.genres.map((g) => String(g).trim()).filter(Boolean)
        : [];
    return {
      mangaInfo: {
        title: String(data.name || mangaId).trim(),
        image: data.poster ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${data.poster}` : undefined,
        desc: String(data.overview || '').trim(),
        status: statusText.includes('1') ? 'ONGOING' : statusText.includes('0') ? 'COMPLETED' : 'UNKNOWN',
        tags,
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const { data } = pageData(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    if (!data || !Array.isArray(data.episodes)) throw new Error('AnimeLatinoHD: the anime page has no episode list');
    const slug = data.slug || mangaId;
    return data.episodes.map((item) => {
      const number = parseFloat(item.number);
      const id = `${slug}/${Number.isNaN(number) ? item.number : number}`;
      return {
        id,
        chapterId: id,
        name: `Episodio ${Number.isNaN(number) ? item.number : number}`,
        number: Number.isNaN(number) ? undefined : number,
      };
    });
  }

  async getVideos(mangaId, chapterId) {
    const path = chapterId.includes('/') ? chapterId : `${mangaId}/${chapterId}`;
    const { data } = pageData(await this.get(`${SITE}/ver/${path}`));
    if (!data || !data.players) throw new Error('AnimeLatinoHD: episode players could not be loaded');
    const groups = Array.isArray(data.players) ? data.players : Object.values(data.players);
    const entries = [];
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const server of group) {
        if (server && server.id) {
          entries.push({
            id: String(server.id),
            lang: String(server.languaje) === '1' ? 'Dub' : 'Sub',
          });
        }
      }
    }
    const found = await Promise.all(entries.map((entry) => this.resolveStream(entry).catch(() => null)));
    const videos = found
      .flat()
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, lang, ...video }) => ({
        ...video,
        quality: `${server} ${lang}`,
        headers: { ...video.headers, ...BROWSER },
      }));
    if (!videos.length) throw new Error(`AnimeLatinoHD: none of the ${entries.length} servers gave a playable video`);
    return videos;
  }

  async resolveStream({ id, lang }) {
    const response = await this.send({
      url: `${API}/stream/${encodeURIComponent(id)}`,
      method: 'GET',
      headers: {
        Referer: `${SITE}/`,
        'Upgrade-Insecure-Requests': '1',
      },
    });
    const text = [
      response.headers && (response.headers.location || response.headers.Location),
      String(response.data || ''),
    ].filter(Boolean).join('\n');
    const urls = Array.from(
      new Set(
        Array.from(
          text.matchAll(/https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b[-a-zA-Z0-9()@:%_+.~#?&/=]*/g),
          (m) => m[0].replace(/["'\\]+$/, '')
        ).filter((u) => !u.includes('animelatinohd.com'))
      )
    );
    const direct = await this.extractHtml(String(response.data || ''), `${API}/`, lang).catch(() => null);
    if (direct) return [direct];
    const resolved = await Promise.all(urls.map((url) => this.extract(url, lang).catch(() => null)));
    return resolved.filter(Boolean);
  }

  async extract(url, lang) {
    const cleanUrl = url.replace(/^http:/, 'https:');
    const host = (/^https?:\/\/([^/]+)/.exec(cleanUrl) || [])[1] || '';
    const origin = `https://${host}/`;
    if (/(^|\.)od\.lk$/.test(host)) {
      return { url: cleanUrl, server: 'Od.lk', lang };
    }
    if (/(^|\.)cldup\.com$/.test(host)) {
      return { url: cleanUrl, server: 'CldUp', lang };
    }
    const html = await this.get(cleanUrl, { Origin: `https://${host}`, Referer: origin });
    return this.extractHtml(html, origin, lang, host);
  }

  async extractHtml(html, origin, lang, host = '') {
    const lowerHost = host.toLowerCase();
    if (/filelions|lion/.test(lowerHost)) {
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      if (hls) {
        const stream = hls[1].replace(/\\\//g, '/');
        return { url: stream.startsWith('/') ? `${origin.slice(0, -1)}${stream}` : stream, server: 'FileLions', lang, headers: { Referer: origin } };
      }
    }
    if (/streamwish|playerwish|wishonly|swhoi|swdyu|strwish|wishembed/.test(lowerHost)) {
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      if (hls) {
        const stream = hls[1].replace(/\\\//g, '/');
        return { url: stream.startsWith('/') ? `${origin.slice(0, -1)}${stream}` : stream, server: 'StreamWish', lang, headers: { Referer: origin } };
      }
    }
    if (/vidhide|morencius|minochinos|dhtpre|peytonepre|smoothpre|earnvids|ryderjet/.test(lowerHost)) {
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      if (hls) {
        const stream = hls[1].replace(/\\\//g, '/');
        return { url: stream.startsWith('/') ? `${origin.slice(0, -1)}${stream}` : stream, server: 'VidHide', lang, headers: { Referer: origin } };
      }
    }
    if (/filemoon|moonplayer/.test(lowerHost)) {
      const code = unpack(html) || html;
      const hls = /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code);
      if (hls) return { url: hls[1].replace(/\\\//g, '/'), server: 'Filemoon', lang, headers: { Origin: origin.slice(0, -1), Referer: origin } };
    }
    if (/voe\.sx/.test(lowerHost)) {
      let page = html;
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(page);
      if (redirect) page = await this.get(redirect[1], { Referer: origin });
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(page);
      if (json) return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', lang, headers: { Referer: origin } };
    }
    if (/ok\.ru|okru/.test(lowerHost) || html.includes('data-options=')) {
      const $ = cheerio.load(html);
      const rawOptions = $('[data-options]').first().attr('data-options');
      if (rawOptions) {
        const options = JSON.parse(rawOptions);
        const raw = options.flashvars.metadata;
        const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (metadata && metadata.hlsManifestUrl) return { url: metadata.hlsManifestUrl, server: 'OK.ru', lang };
      }
    }
    if (/dood|ds2play|d000/.test(lowerHost)) {
      const pass = /\/pass_md5\/([^']+)'/.exec(html);
      if (pass) {
        const token = pass[1].split('/').pop();
        const base = await this.get(`${origin}pass_md5/${pass[1]}`, { Referer: origin });
        return { url: `${base}1234567890?token=${token}&expiry=${Date.now()}`, server: 'Doodstream', lang, headers: { Referer: origin } };
      }
    }
    if (/streamtape|shavetape/.test(lowerHost)) {
      const part = /document\.getElementById\('(?:norobot|robot)link'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/.exec(html);
      if (part) {
        const stream = `https:${part[1]}${part[2].substring(+part[3])}`;
        return { url: stream, server: 'StreamTape', lang, headers: { Referer: origin } };
      }
    }
    if (/solidfiles/.test(lowerHost) || html.includes('"downloadUrl":')) {
      const dl = /"downloadUrl"\s*:\s*"(https?:[^"]+)"/.exec(html);
      if (dl) return { url: dl[1], server: 'SolidFiles', lang };
    }
    if (/yourupload\.com/.test(lowerHost)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      if (file) return { url: file[1], server: 'YourUpload', lang, headers: { Referer: origin } };
    }
    if (/mp4upload\.com/.test(lowerHost)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      if (src) return { url: src[1], server: 'Mp4Upload', lang, headers: { Referer: origin } };
    }
    const unpacked = unpack(html);
    if (unpacked) {
      const hls = /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(unpacked) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(unpacked);
      if (hls) return { url: hls[1].replace(/\\\//g, '/'), server: 'FileLions', lang, headers: { Referer: origin } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers = {}) {
    return String((await this.send({ url, method: 'GET', headers: { Accept: 'text/html', ...headers } })).data);
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...BROWSER, ...request.headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeLatinoHD: HTTP ${response.status} from ${request.url}`);
    return response;
  }
}

module.exports = { Source };
