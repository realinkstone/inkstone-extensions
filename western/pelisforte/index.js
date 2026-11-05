const SITE = 'https://www2.pelisforte.se';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const GENRES = [
  ['accion-p01', 'Acción'], ['animacion-p04', 'Animación'], ['aventura', 'Aventura'], ['belica', 'Bélicas'],
  ['ciencia-ficcion', 'Ciencia Ficción'], ['comedia', 'Comedia'], ['crimen', 'Crimen'], ['documental', 'Documentales'],
  ['drama', 'Drama'], ['familia-p01', 'Familia'], ['fantasia-p01', 'Fantasía'], ['historia', 'Historia'],
  ['horror', 'Horror'], ['misterio', 'Misterio'], ['musica', 'Música'], ['navidad', 'Navidad'],
  ['pelicula-de-tv', 'Película de TV'], ['romance', 'Romance'], ['suspense', 'Suspenso'], ['terror-p01', 'Terror'],
  ['western', 'Western'],
];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
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

function voeSource(payload) {
  const clean = VOE_MARKERS.reduce((text, marker) => text.split(marker).join(''), rot13(payload));
  const shifted = App.base64Decode(clean).split('').map((ch) => String.fromCharCode(ch.charCodeAt(0) - 3)).join('');
  return JSON.parse(App.base64Decode(shifted.split('').reverse().join(''))).source;
}

function idOf(href) {
  const match = /\/(pelicula|serie)\/([^/?#]+)/.exec(href || '');
  return match ? `${match[1]}-${match[2]}` : null;
}

function pageOf(mangaId) {
  const [, kind, slug] = /^(pelicula|serie)-(.+)$/.exec(mangaId) || [];
  if (!kind) throw new Error(`PelisForte: unknown title id ${mangaId}`);
  return { kind, url: `${SITE}/${kind}/${encodeURIComponent(slug)}` };
}

function coverOf($img) {
  const src = $img.attr('src') || $img.attr('data-src') || '';
  return src ? src.replace(/-\d+x\d+(?=\.\w+$)/, '') : undefined;
}

function audioLabel(text) {
  if (/castellano/i.test(text)) return 'Castellano (Dub)';
  if (/subtitulad/i.test(text)) return 'Subtitulado (Sub)';
  return 'Latino (Dub)';
}

function episodesFrom($) {
  return $('article.episodes')
    .map((i, el) => {
      const href = $(el).find('a.lnk-blk').attr('href') || '';
      const slug = (/\/episodio\/([^/?#]+)/.exec(href) || [])[1];
      const numText = $(el).find('.num-epi').text().trim();
      const [, s, e] = /^(\d+)x(\d+)$/.exec(numText) || [];
      if (!slug || !e) return null;
      const season = Number(s);
      const number = Number(e);
      return {
        id: slug,
        chapterId: slug,
        name: `Episodio ${number}`,
        number,
        season,
        seasonName: `Temporada ${season}`,
      };
    })
    .get()
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'peliculas', name: 'Movies' },
      { id: 'series', name: 'Series' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    const suffix = page > 1 ? `/page/${page}` : '';
    let url = `${SITE}/${request && request.feed === 'series' ? 'series-1746289646' : 'todas-las-peliculas'}${suffix}`;
    if (tags.length) url = `${SITE}/peliculas/${encodeURIComponent(tags[0].id)}${suffix}`;
    if (query) url = `${SITE}/page/${page}?s=${encodeURIComponent(query)}`;
    const $ = cheerio.load(await this.get(url));
    const results = $('#movies-a article.post')
      .map((i, el) => {
        const mangaId = idOf($(el).find('a.lnk-blk').attr('href'));
        const title = $(el).find('.entry-title').text().trim();
        if (!mangaId || !title) return null;
        return {
          mangaId,
          title,
          image: coverOf($(el).find('.post-thumbnail img').first()),
          medium: 'anime',
        };
      })
      .get()
      .filter(Boolean);
    const hasNext = $('.pagination .nav-links .current').nextAll('a.page-link').length > 0;
    return { results, metadata: results.length && hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { url } = pageOf(mangaId);
    const $ = cheerio.load(await this.get(url));
    let author;
    let artist;
    $('.cast-lst li').each((i, el) => {
      const label = $(el).find('span').first().text();
      const names = $(el).find('p a').map((j, a) => $(a).text().trim()).get().filter(Boolean).slice(0, 5).join(', ');
      if (/director/i.test(label) && names) author = names;
      if (/actores/i.test(label) && names) artist = names;
    });
    const desc = $('.alg-cr .description p')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter((text) => text && !/también conocida por los títulos/i.test(text))
      .join('\n\n');
    return {
      mangaInfo: {
        title: $('.alg-cr .entry-header .entry-title').first().text().trim() || mangaId,
        image: coverOf($('.alg-cr .post-thumbnail img').first()),
        desc: desc || $('.alg-cr .description').first().text().trim(),
        author,
        artist,
        status: 'UNKNOWN',
        tags: $('.genres a').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: url,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const { kind, url } = pageOf(mangaId);
    if (kind === 'pelicula') return [{ id: 'pelicula', chapterId: 'pelicula', name: 'Película', number: 1 }];
    const html = await this.get(url);
    const $ = cheerio.load(html);
    const currentSeason = $('.choose-season .n_s').first().text().trim();
    const nonce = (/"content_nonce"\s*:\s*"([^"]+)"/.exec(html) || [])[1];
    const otherSeasons = $('.sel-temp a[data-post][data-season]')
      .map((i, el) => ({ post: $(el).attr('data-post'), season: $(el).attr('data-season') }))
      .get()
      .filter((item) => item.post && item.season && item.season !== currentSeason);
    const extraLists = nonce
      ? await Promise.all(
        otherSeasons.map((item) => this.post(`${SITE}/wp-admin/admin-ajax.php`, `action=action_select_season&nonce=${encodeURIComponent(nonce)}&season=${encodeURIComponent(item.season)}&post=${encodeURIComponent(item.post)}`)
          .then((frag) => episodesFrom(cheerio.load(frag)))
          .catch(() => []))
      )
      : [];
    const all = episodesFrom($).concat(...extraLists);
    const unique = new Map(all.map((ep) => [ep.id, ep]));
    return Array.from(unique.values()).sort((a, b) => b.season - a.season || b.number - a.number);
  }

  async getVideos(mangaId, chapterId) {
    const { kind, url } = pageOf(mangaId);
    const pageUrl = kind === 'pelicula' ? url : `${SITE}/episodio/${encodeURIComponent(chapterId)}`;
    const $ = cheerio.load(await this.get(pageUrl));
    const options = $('aside.video-player div.video[id]')
      .map((i, el) => {
        const id = $(el).attr('id');
        const iframe = $(el).find('iframe').first();
        const src = iframe.attr('data-src') || iframe.attr('src') || '';
        const key = src.split('/?h=')[1];
        const info = $(`a[href="#${id}"] .server`).text().replace(/\s+/g, ' ').trim();
        const serverName = (info.split('-')[0] || 'Server').trim();
        if (!key || /^(byse|dood)/i.test(serverName)) return null;
        return {
          key,
          src,
          server: serverName,
          quality: `${serverName} ${audioLabel(info)}`,
        };
      })
      .get()
      .filter(Boolean);
    if (!options.length) throw new Error('PelisForte: this title only has servers that require interactive captcha verification');
    const found = await Promise.all(options.map((opt) => this.extract(opt).catch(() => null)));
    const videos = found.filter((video) => video && /^https?:\/\//.test(video.url));
    if (!videos.length) throw new Error(`PelisForte: none of the ${options.length} servers gave a playable video`);
    return videos;
  }

  async extract(option) {
    let html = await this.get(`https://mp4.nu/r.php?h=${option.key}`, option.src);
    const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
    if (redirect) html = await this.get(redirect[1], option.src);
    const voeJson = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    if (voeJson && /voe/i.test(option.server)) {
      return { url: voeSource(JSON.parse(voeJson[1])[0]), quality: option.quality, headers: BROWSER };
    }
    const code = unpack(html) || html;
    const file = /file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/.exec(code)
      || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code)
      || /"hls3"\s*:\s*"(https?:[^"]+)"/.exec(code);
    if (!file) return null;
    const host = (/^https?:\/\/([^/]+)/.exec(file[1]) || [])[1] || '';
    const rootDomain = host.split('.').slice(-2).join('.');
    return {
      url: file[1].replace(/\\\//g, '/'),
      quality: option.quality,
      headers: { ...BROWSER, Referer: rootDomain ? `https://${rootDomain}/` : `${SITE}/` },
    };
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, referer = `${SITE}/`) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', Referer: referer, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`PelisForte: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }

  async post(url, body) {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: `${SITE}/`, ...BROWSER };
    const response = await this.requests.schedule(App.createRequest({ url, method: 'POST', headers, body }));
    if (response.status < 200 || response.status >= 300) throw new Error(`PelisForte: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
