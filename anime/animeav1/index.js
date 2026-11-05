const SITE = 'https://animeav1.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'HLS', 'MP4Upload'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

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

function slugOf(href) {
  return (/\/media\/([^/?#"]+)/.exec(href || '') || [])[1];
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest_released', name: 'Latest' },
    ];
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const order = request && request.feed === 'latest_released' ? 'latest_released' : 'popular';
    const url = query ? `${SITE}/catalogo?search=${encodeURIComponent(query)}&page=${page}` : `${SITE}/catalogo?order=${order}&page=${page}`;
    const $ = cheerio.load(await this.get(url));
    const results = $('article[class*="group/item"]')
      .map((i, el) => {
        const mangaId = slugOf($(el).find('a').attr('href'));
        return mangaId && { mangaId, title: $(el).find('header h3').text().trim(), image: $(el).find('.bg-current img').attr('src'), medium: 'anime' };
      })
      .get()
      .filter(Boolean);
    const next = $('.pointer-events-none:not([class*="max-sm:hidden"]) ~ a').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/media/${encodeURIComponent(mangaId)}`));
    const info = $('header > .items-center.text-sm span').text();
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: $('img.object-cover').first().attr('src'),
        desc: $('.entry > p').first().text().trim(),
        status: /Finalizado/.test(info) ? 'COMPLETED' : /En emisi/.test(info) ? 'ONGOING' : 'UNKNOWN',
        tags: $('header > .items-center > a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/media/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.get(`${SITE}/media/${encodeURIComponent(mangaId)}`);
    const list = (/episodes:\[([^\]]*)\]/.exec(html) || [])[1] || '';
    const numbers = Array.from(list.matchAll(/number:([0-9.]+)/g), (match) => match[1]);
    return numbers.reverse().map((number) => ({ id: number, chapterId: number, name: `Episodio ${number}`, number: +number }));
  }

  async getVideos(mangaId, chapterId) {
    const html = await this.get(`${SITE}/media/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`);
    const embeds = (/embeds:\{([\s\S]*?)\},downloads:/.exec(html) || [])[1] || '';
    const servers = [];
    for (const [, language, block] of embeds.matchAll(/(SUB|DUB):\[([^\]]*)\]/g)) {
      for (const [, server, url] of block.matchAll(/\{server:"([^"]*)",url:"([^"]*)"\}/g)) servers.push({ language, server, url });
    }
    const found = await Promise.all(servers.map((entry) => this.extract(entry).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, language, ...video }) => ({ ...video, quality: `${server} ${language === 'DUB' ? 'Dub' : 'Sub'}`, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`AnimeAV1: none of the ${servers.length} servers gave a playable video`);
    return videos;
  }

  async extract({ language, url }) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    if (/(^|\.)zilla-networks\.com$/.test(host)) return { url: url.replace('/play/', '/m3u8/'), server: 'HLS', language };
    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', language };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(await this.get(url));
      return { url: src[1], server: 'MP4Upload', language, headers: { Referer: 'https://www.mp4upload.com/' } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeAV1: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
