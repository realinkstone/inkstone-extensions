const SITE = 'https://tioanime.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'OK.ru', 'YourUpload', 'MixDrop'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['accion', 'Acción'], ['artes-marciales', 'Artes Marciales'], ['aventura', 'Aventuras'], ['carreras', 'Carreras'],
  ['ciencia-ficcion', 'Ciencia Ficción'], ['comedia', 'Comedia'], ['demencia', 'Demencia'], ['demonios', 'Demonios'],
  ['deportes', 'Deportes'], ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['escolares', 'Escolares'], ['espacial', 'Espacial'],
  ['fantasia', 'Fantasía'], ['harem', 'Harem'], ['historico', 'Histórico'], ['infantil', 'Infantil'], ['josei', 'Josei'],
  ['juegos', 'Juegos'], ['magia', 'Magia'], ['mecha', 'Mecha'], ['militar', 'Militar'], ['misterio', 'Misterio'],
  ['musica', 'Música'], ['parodia', 'Parodia'], ['policia', 'Policía'], ['psicologico', 'Psicológico'],
  ['recuentos-de-la-vida', 'Recuentos de la vida'], ['romance', 'Romance'], ['samurai', 'Samurai'], ['seinen', 'Seinen'],
  ['shoujo', 'Shoujo'], ['shounen', 'Shounen'], ['sobrenatural', 'Sobrenatural'], ['superpoderes', 'Superpoderes'],
  ['suspenso', 'Suspenso'], ['terror', 'Terror'], ['vampiros', 'Vampiros'], ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
];

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

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

function absolute(src) {
  return src ? (/^https?:\/\//.test(src) ? src : `${SITE}${src.startsWith('/') ? '' : '/'}${src}`) : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Episodes' },
      { id: 'directorio', name: 'Directory' },
      { id: 'airing', name: 'Airing' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = request && request.feed;
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length && feed === 'latest') {
      const $ = cheerio.load(await this.get(SITE));
      const results = $('article.episode a[href^="/ver/"]')
        .map((i, el) => {
          const mangaId = (/^\/ver\/(.+)-[\d.]+$/.exec($(el).attr('href')) || [])[1];
          const image = absolute(($(el).find('img').attr('src') || '').replace('/uploads/thumbs/', '/uploads/portadas/'));
          return mangaId && { mangaId, title: $(el).find('h3.title').text().trim(), image, medium: 'anime' };
        })
        .get()
        .filter(Boolean);
      return { results: Array.from(new Map(results.map((title) => [title.mangaId, title])).values()) };
    }
    const params = [`p=${page}`];
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    tags.forEach((tag) => params.push(`genero%5B%5D=${encodeURIComponent(tag.id)}`));
    if (!query && !tags.length && feed === 'airing') params.push('status=1');
    const $ = cheerio.load(await this.get(`${SITE}/directorio?${params.join('&')}`));
    const results = $('article.anime a[href^="/anime/"]')
      .map((i, el) => {
        const mangaId = (/^\/anime\/([^/?#]+)/.exec($(el).attr('href')) || [])[1];
        return mangaId && { mangaId, title: $(el).find('h3.title').text().trim(), image: absolute($(el).find('img').attr('src')), medium: 'anime' };
      })
      .get()
      .filter(Boolean);
    const next = $('.pagination .active ~ li:not(.disabled) a').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`));
    const status = $('a.status').text();
    return {
      mangaInfo: {
        title: $('h1.title').first().text().trim() || mangaId,
        image: absolute($('.thumb img').first().attr('src')),
        desc: $('p.sinopsis').first().text().trim(),
        status: /Finalizado/i.test(status) ? 'COMPLETED' : /En emisi/i.test(status) ? 'ONGOING' : 'UNKNOWN',
        tags: $('p.genres a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/anime/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.get(`${SITE}/anime/${encodeURIComponent(mangaId)}`);
    const list = /var episodes = \[([^\]]*)\]/.exec(html);
    const info = /var anime_info = (\[[^\]]*\])/.exec(html);
    const slug = (info && JSON.parse(info[1])[1]) || mangaId;
    return Array.from(new Set((list ? list[1].split(',') : []).map((value) => value.trim()).filter(Boolean)))
      .map((value) => {
        const id = `${slug}-${value}`;
        return { id, chapterId: id, name: `Episodio ${value}`, number: Number(value) };
      });
  }

  async getVideos(mangaId, chapterId) {
    const html = await this.get(`${SITE}/ver/${encodeURIComponent(chapterId)}`);
    const list = /var videos = (\[\[[\s\S]*?\]\]);/.exec(html);
    const players = list ? JSON.parse(list[1]).map((server) => server[1]) : [];
    const found = await Promise.all(players.map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`TioAnime: none of the ${players.length} servers gave a playable video`);
    return videos;
  }

  async extract(url) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|mi?xdrop\.|ok\.ru|yourupload\.com)/.test(host)) return null;
    let html = await this.get(url.replace(/^http:/, 'https:'));
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), quality: 'VOE' };
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
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`TioAnime: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
