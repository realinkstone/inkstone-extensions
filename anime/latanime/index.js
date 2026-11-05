const SITE = 'https://latanime.org';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'Lulu', 'OK.ru', 'MixDrop', 'YourUpload', 'Mp4Upload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

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
      { id: 'animes', name: 'Directory' },
      { id: 'emision', name: 'Airing' },
    ];
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const list = request && request.feed === 'emision' ? 'emision' : 'animes';
    const url = query ? `${SITE}/buscar?q=${encodeURIComponent(query)}&p=${page}` : `${SITE}/${list}?p=${page}`;
    const $ = cheerio.load(await this.get(url));
    const results = $('a[href*="/anime/"]')
      .filter((i, el) => $(el).find('.seriedetails').length > 0)
      .map((i, el) => {
        const mangaId = (/\/anime\/([^/?#]+)/.exec($(el).attr('href')) || [])[1];
        const image = $(el).find('img.lozad').attr('data-src');
        return mangaId && { mangaId, title: $(el).find('.seriedetails h3').text().trim(), image, medium: 'anime' };
      })
      .get()
      .filter(Boolean);
    const next = $('ul.pagination > li.active ~ li a').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const status = $('button').text();
    return {
      mangaInfo: {
        title: $('h2').first().text().trim() || mangaId,
        image: $('img.img-fluid2').not('.lozad').first().attr('src'),
        desc: $('p.my-2').first().text().trim(),
        status: /Finalizado/.test(status) ? 'COMPLETED' : /En emisi/.test(status) ? 'ONGOING' : 'UNKNOWN',
        tags: $('a[href*="/genero/"]').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const episodes = $('a[href*="/ver/"]')
      .map((i, el) => {
        const id = (/\/ver\/([^/?#]+)/.exec($(el).attr('href')) || [])[1];
        const number = parseFloat((/Capitulo\s+([\d.]+)/i.exec($(el).text()) || [])[1]);
        return id && { id, chapterId: id, name: `Episodio ${Number.isNaN(number) ? id : number}`, number: Number.isNaN(number) ? undefined : number };
      })
      .get()
      .filter(Boolean);
    return Array.from(new Map(episodes.map((episode) => [episode.id, episode])).values()).reverse();
  }

  async getVideos(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/ver/${encodeURIComponent(chapterId)}`));
    const players = $('[data-player]')
      .map((i, el) => App.base64Decode($(el).attr('data-player')))
      .get();
    const found = await Promise.all(players.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`Latanime: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|lulu|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com)/.test(host)) return null;
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

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Latanime: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
