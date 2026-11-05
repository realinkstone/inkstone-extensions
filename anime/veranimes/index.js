const SITE = 'https://wwv.veranimes.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'FileLions', 'Lulu', 'Uqload', 'OK.ru', 'MixDrop', 'YourUpload', 'Mp4Upload'];

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

function unhex(hex) {
  return (hex || '').replace(/[0-9a-fA-F]{2}/g, (pair) => String.fromCharCode(parseInt(pair, 16)));
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
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'latest', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/animes`));
    const seen = new Set();
    return $('a[href*="?genero="]')
      .map((i, el) => ({
        id: (/genero=([^&#"]+)/.exec($(el).attr('href')) || [])[1],
        label: $(el).text().trim(),
      }))
      .get()
      .filter((tag) => tag.id && tag.label && !/-\d{4}$/.test(tag.id) && !seen.has(tag.id) && seen.add(tag.id));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = request && request.feed;
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/animes?buscar=${encodeURIComponent(query)}&pag=${page}`;
    } else if (tags.length) {
      const genres = tags.map((tag) => encodeURIComponent(tag.id || tag)).join(',');
      url = `${SITE}/animes?genero=${genres}&orden=desc&pag=${page}`;
    } else if (feed === 'latest') {
      url = `${SITE}/animes?estado=en-emision&orden=desc&pag=${page}`;
    } else {
      url = `${SITE}/animes?orden=desc&pag=${page}`;
    }
    const $ = cheerio.load(await this.get(url));
    const results = $('article.li')
      .map((i, el) => {
        const link = $(el).find('figure a').first();
        const mangaId = slugOf(link.attr('href'), 'anime');
        const img = link.find('img').first();
        const title = $(el).find('h3 a').text().trim() || link.attr('title') || '';
        return mangaId && title ? { mangaId, title, image: absolute(img.attr('data-src') || img.attr('src')), medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    const next = $('.pag li a[title*="Siguiente"]').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const img = $('figure.i img').first();
    const authorMatch = /Estudio\(s\):\s*([^\n]+)/.exec($('body').text());
    return {
      mangaInfo: {
        title: $('.ti h1').first().text().trim() || mangaId,
        image: absolute(img.attr('data-src') || img.attr('src')),
        desc: $('.tx p').first().text().trim(),
        author: authorMatch ? authorMatch[1].trim() : undefined,
        status: $('.ti .em').length ? 'ONGOING' : $('.ti .fi').length ? 'COMPLETED' : 'UNKNOWN',
        tags: $('.gn li a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`);
    const slug = (/data-sl="([^"]+)"/.exec(html) || [])[1] || mangaId;
    const raw = (/var\s+eps\s*=\s*(\[[^\]]*\])/.exec(html) || [])[1];
    const list = raw ? JSON.parse(raw) : [];
    return list.map((ep) => {
      const id = `${slug}-${ep}`;
      const num = +ep;
      return { id, chapterId: id, name: `Episodio ${ep}`, number: Number.isFinite(num) ? num : undefined };
    });
  }

  async getVideos(mangaId, chapterId) {
    const episodeUrl = `${SITE}/ver/${encodeURIComponent(chapterId)}`;
    const html = await this.get(episodeUrl);
    const opt = (/class="opt"[^>]*data-encrypt="([^"]+)"/.exec(html) || /data-encrypt="([^"]+)"/.exec(html) || [])[1];
    if (!opt) throw new Error('VerAnimes: no video options token found on episode page');
    const serversHtml = await this.post(`${SITE}/process`, `acc=opt&i=${encodeURIComponent(opt)}`, episodeUrl);
    const $ = cheerio.load(serversHtml);
    const players = Array.from(
      new Set(
        $('li[encrypt]')
          .map((i, el) => unhex($(el).attr('encrypt')))
          .get()
          .filter((url) => /^https?:\/\//.test(url)),
      ),
    );
    if (!players.length) throw new Error('VerAnimes: the site lists no video servers for this episode');
    const found = await Promise.all(players.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`VerAnimes: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|filelions\.|lulu|uqload\.|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com)/.test(host)) return null;
    let html = await this.get(url.replace(/^http:/, 'https:'));
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
    }
    if (/(^|\.)filelions\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /"hls\d"\s*:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked);
      return { url: file[1].replace(/^\/\//, 'https://'), quality: 'FileLions', headers: { Referer: origin } };
    }
    if (/(^|\.)lulu/.test(host)) {
      const file = /file:\s*"([^"]+)"/.exec(html) || /file:\s*"([^"]+)"/.exec(unpack(html));
      return { url: file[1], quality: 'Lulu', headers: { Referer: origin } };
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

  post(url, body, referer) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: referer };
    return this.send({ url, method: 'POST', headers, body });
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`VerAnimes: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
