const SITE = 'https://jkanime.net';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['Desu', 'Magi', 'VOE', 'MixDrop', 'Mp4Upload'];

const LANGUAGES = { 1: 'Sub', 3: 'Dub' };

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

function slugOf(href) {
  return (/jkanime\.net\/([^/?#]+)/.exec(href || '') || /^\/?([^/?#]+)/.exec(href || '') || [])[1];
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

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const $ = cheerio.load(await this.get(`${SITE}/buscar/${encodeURIComponent(query.replace(/ /g, '_'))}/`));
      const results = $('div.anime__item')
        .map((i, el) => {
          const link = $(el).find('div.anime__item__text a').first();
          const mangaId = slugOf(link.attr('href'));
          return mangaId && { mangaId, title: link.text().trim(), image: $(el).find('[data-setbg]').attr('data-setbg'), medium: 'anime' };
        })
        .get()
        .filter(Boolean);
      return { results };
    }
    const order = request && request.feed === 'latest' ? '' : 'filtro=popularidad&';
    const html = await this.get(`${SITE}/directorio?${order}p=${page}`);
    const json = /var\s+animes\s*=\s*(\{[\s\S]*?\})\s*;\s*\n/.exec(html);
    const animes = json ? JSON.parse(json[1]) : { data: [] };
    const results = animes.data
      .map((anime) => ({ mangaId: slugOf(anime.url), title: anime.title, image: anime.image, medium: 'anime' }))
      .filter((title) => title.mangaId);
    return { results, metadata: results.length && animes.next_page_url ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/${encodeURIComponent(mangaId)}/`));
    const row = (label) => $('div.anime__details__content div.anime_data.pc li').filter((i, el) => $(el).find('span').text().includes(label)).first();
    const status = row('Estado').find('div').text();
    return {
      mangaInfo: {
        title: $('div.anime__details__content div.anime_info h3').first().text().trim() || mangaId,
        image: $('div.anime__details__content div.anime_pic img').attr('src'),
        desc: $('div.anime__details__content div.anime_info p.scroll').text().trim(),
        author: row('Studios').find('a').text().trim() || undefined,
        status: /Finalizado|Concluido/i.test(status) ? 'COMPLETED' : /emisi/i.test(status) ? 'ONGOING' : 'UNKNOWN',
        tags: row('Generos').find('a').map((i, el) => $(el).text().trim()).get(),
        webURL: `${SITE}/${mangaId}/`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const page = await this.send({ url: `${SITE}/${encodeURIComponent(mangaId)}/`, method: 'GET', headers: { Accept: 'text/html' } });
    const html = String(page.data);
    const token = (/name="csrf-token" content="([^"]+)"/.exec(html) || [])[1];
    const animeId = (/id="guardar-anime"[^>]*data-anime="(\d+)"/.exec(html) || /data-anime="(\d+)"/.exec(html) || [])[1];
    if (!token || !animeId) throw new Error('JKAnime: the anime page has no episode list');
    const cookies = Object.entries(page.headers || {})
      .filter(([name]) => name.toLowerCase() === 'set-cookie')
      .map(([, value]) => String(value))
      .join(', ');
    const cookie = Array.from(cookies.matchAll(/(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g), (match) => `${match[1]}=${match[2]}`).join('; ');
    const first = JSON.parse(String((await this.send({
      url: `${SITE}/ajax/episodes/${animeId}/1`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json', Cookie: cookie },
      body: `_token=${encodeURIComponent(token)}`,
    })).data));
    const last = first.from + first.total - 1;
    const dates = new Map(first.data.map((episode) => [episode.number, Date.parse(episode.timestamp.replace(' ', 'T') + 'Z')]));
    const episodes = [];
    for (let number = last; number >= first.from; number--) {
      const time = dates.get(number);
      episodes.push({ id: String(number), chapterId: String(number), name: `Episodio ${number}`, number, time: Number.isNaN(time) ? undefined : time });
    }
    return episodes;
  }

  async getVideos(mangaId, chapterId) {
    const html = await this.get(`${SITE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`);
    const servers = [];
    for (const [, id, url] of html.matchAll(/video\[(\d+)\] = '<iframe class="player_conte" src="([^"]+)"/g)) {
      const lang = (new RegExp(`data-id="${id}" class="[^"]*lg_(\\d+)`).exec(html) || [])[1];
      servers.push({ url, language: LANGUAGES[lang] || 'Sub' });
    }
    const listed = /var servers\s*=\s*(\[[\s\S]*?\]);/.exec(html);
    for (const server of listed ? JSON.parse(listed[1]) : []) {
      servers.push({ url: App.base64Decode(server.remote).trim(), language: LANGUAGES[server.lang] || 'Sub' });
    }
    const found = await Promise.all(servers.map((entry) => this.extract(entry).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, language, ...video }) => ({ ...video, quality: `${server} ${language}`, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`JKAnime: none of the ${servers.length} servers gave a playable video`);
    return videos;
  }

  async extract({ url, language }) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    if (/\/jkplayer\/um\?/.test(url)) {
      const stream = /url:\s*'([^']+)'/.exec(await this.get(url, { Referer: `${SITE}/` }));
      return { url: stream[1], server: 'Desu', language };
    }
    if (/\/jkplayer\/umv\?/.test(url)) {
      const stream = /<source[^>]+src=['"]([^'"]+\.m3u8[^'"]*)['"]/.exec(await this.get(url, { Referer: `${SITE}/` }));
      return { url: stream[1], server: 'Magi', language };
    }
    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', language };
    }
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(await this.get(url)));
      return { url: wurl[1].replace(/^\/\//, 'https://'), server: 'MixDrop', language, headers: { Referer: `https://${host}/` } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(await this.get(url));
      return { url: src[1], server: 'Mp4Upload', language, headers: { Referer: 'https://www.mp4upload.com/' } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers) {
    return String((await this.send({ url, method: 'GET', headers: { Accept: 'text/html', ...headers } })).data);
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`JKAnime: HTTP ${response.status} from ${request.url}`);
    return response;
  }
}

module.exports = { Source };
