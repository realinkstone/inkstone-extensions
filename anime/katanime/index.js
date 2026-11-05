const SITE = 'https://katanime.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'Lulu', 'FileLions', 'Streamtape', 'Doodstream', 'Uqload', 'OK.ru', 'MixDrop', 'YourUpload', 'Mp4Upload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function absolute(url) {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${SITE}/${url.replace(/^\.?\/+/, '')}`;
}

function slugOf(href, kind) {
  const match = new RegExp(`/${kind}/([^/?#"]+)`).exec(href || '');
  return match ? match[1] : null;
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

function decryptLink(payload) {
  const data = JSON.parse(payload);
  const params = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(data.ct),
    salt: CryptoJS.enc.Hex.parse(data.s),
  });
  const raw = CryptoJS.AES.decrypt(params, 'hanabi').toString(CryptoJS.enc.Utf8);
  return JSON.parse(raw);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/animes`));
    return $('select[name="genero[]"] option')
      .map((i, el) => ({
        id: $(el).attr('value'),
        label: $(el).text().replace(/\s*\(\d+\)\s*$/, '').trim(),
      }))
      .get()
      .filter((tag) => tag.id && tag.label);
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = request && request.feed;
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/buscar?q=${encodeURIComponent(query)}&p=${page}`;
    } else if (tags.length) {
      const genres = tags.map((tag) => `genero=${encodeURIComponent(tag.id || tag)}`).join('&');
      url = `${SITE}/animes?${genres}&p=${page}`;
    } else if (feed === 'popular') {
      url = `${SITE}/populares`;
    } else if (feed === 'latest') {
      url = `${SITE}/animes?fecha=${new Date().getUTCFullYear()}&p=${page}`;
    } else {
      url = `${SITE}/animes?p=${page}`;
    }
    const $ = cheerio.load(await this.get(url));
    const results = $('#article-div .full')
      .map((i, el) => {
        const link = $(el).find('a[href*="/anime/"]').first();
        const mangaId = slugOf(link.attr('href'), 'anime');
        const img = $(el).find('img').first();
        const title = $(el).find('._2uHIS').text().trim() || img.attr('alt') || '';
        return mangaId && title ? { mangaId, title, image: absolute(img.attr('data-src') || img.attr('src')), medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    const next = !query && !tags.length && feed === 'popular' ? 0 : $('.pagination .active ~ li:not(.disabled) a').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}/`));
    const img = $('img.lozad').first();
    const status = $('.badge-status, #estado, .detail-item').text();
    return {
      mangaInfo: {
        title: $('h1.anime-title, .comics-title').first().text().trim() || mangaId,
        image: absolute(img.attr('data-src') || img.attr('src')),
        desc: $('.anime-synopsis').first().text().trim(),
        status: /Finalizado/i.test(status) ? 'COMPLETED' : /Emisi/i.test(status) ? 'ONGOING' : 'UNKNOWN',
        tags: $('.genres-anime a, .anime-genres a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/anime/${mangaId}/`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const animeUrl = `${SITE}/anime/${encodeURIComponent(mangaId)}/`;
    const page = await this.sendRaw({ url: animeUrl, method: 'GET', headers: { Accept: 'text/html' } });
    const html = String(page.data);
    const token = (/name="csrf-token" content="([^"]+)"/.exec(html) || [])[1];
    const epsUrl = (/data-url="([^"]+\/eps)"/.exec(html) || [])[1] || `${animeUrl}eps`;
    const cookies = Object.entries(page.headers || {})
      .filter(([name]) => name.toLowerCase() === 'set-cookie')
      .map(([, value]) => String(value))
      .join(', ');
    const cookie = Array.from(cookies.matchAll(/(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g), (match) => `${match[1]}=${match[2]}`).join('; ');
    let total = +((/(\d+)\s*\/\s*[^\s<]+\s*Cap[íi]tulo/i.exec(html) || [])[1] || 0);
    const dates = new Map();
    if (token) {
      const reply = await this.sendRaw({
        url: epsUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
          Origin: SITE,
          Referer: animeUrl,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: `_token=${encodeURIComponent(token)}&pagina=1`,
      }).catch(() => null);
      if (reply && reply.status >= 200 && reply.status < 300) {
        const parsed = JSON.parse(String(reply.data));
        const ep = parsed.ep || parsed;
        if (ep && ep.total) total = +ep.total;
        for (const item of (ep && ep.data) || []) {
          const num = +item.numero;
          const time = item.created_at ? Date.parse(item.created_at.replace(' ', 'T') + 'Z') : NaN;
          if (Number.isFinite(num) && !Number.isNaN(time)) dates.set(num, time);
        }
      }
    }
    const episodes = [];
    for (let number = total; number >= 1; number--) {
      const id = `${mangaId}-${number}`;
      const time = dates.get(number);
      episodes.push({ id, chapterId: id, name: `Episodio ${number}`, number, time });
    }
    return episodes;
  }

  async getVideos(mangaId, chapterId) {
    const episodeUrl = `${SITE}/capitulo/${encodeURIComponent(chapterId)}/`;
    const $ = cheerio.load(await this.get(episodeUrl));
    const tokens = $('[data-player]')
      .filter((i, el) => /voe|lulu|filelions|streamtape|uqload|ok\.?ru|mixdrop|yourupload|mp4upload/i.test($(el).text()))
      .map((i, el) => $(el).attr('data-player'))
      .get()
      .filter(Boolean);
    if (!tokens.length) throw new Error('Katanime: the site lists no supported video servers for this episode');
    const resolved = await Promise.all(
      tokens.map(async (token) => {
        const html = await this.send({
          url: `${SITE}/reproductor?url=${encodeURIComponent(token)}`,
          method: 'GET',
          headers: { Accept: 'text/html', Referer: episodeUrl },
        }).catch(() => '');
        const match = /var\s+e\s*=\s*'([^']+)'/.exec(html);
        return match ? decryptLink(match[1]) : null;
      }),
    );
    const urls = Array.from(new Set(resolved.filter((url) => /^https?:\/\//.test(url))));
    const found = await Promise.all(urls.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`Katanime: none of the ${tokens.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|lulu|filelions\.|streamtape\.|uqload\.|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com)/.test(host)) return null;
    let html = await this.get(url.replace(/^http:/, 'https:'));
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
    }
    if (/(^|\.)lulu/.test(host)) {
      const file = /file:\s*"([^"]+)"/.exec(html) || /file:\s*"([^"]+)"/.exec(unpack(html));
      return { url: file[1], quality: 'Lulu', headers: { Referer: origin } };
    }
    if (/(^|\.)filelions\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /"hls\d"\s*:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked);
      return { url: file[1].replace(/^\/\//, 'https://'), quality: 'FileLions', headers: { Referer: origin } };
    }
    if (/(^|\.)streamtape\./.test(host)) {
      const link = /getElementById\('(?:no)?robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)/.exec(html);
      const query = link && link[1].split('?')[1];
      if (!query) return null;
      return { url: `https://${host}/get_video?${query}&stream=1`, quality: 'Streamtape', headers: { Referer: origin } };
    }
    if (/(^|\.)uqload\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /sources:\s*\[\s*"([^"]+\.mp4[^"]*)"/.exec(unpacked);
      return { url: file[1], quality: 'Uqload', headers: { Referer: 'https://uqload.vc/' } };
    }
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, quality: 'OK.ru' };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  sendRaw(request) {
    return this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
  }

  async send(request) {
    const response = await this.sendRaw(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`Katanime: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
