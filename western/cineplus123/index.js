const SITE = 'https://cineplus123.org';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const GENRES = [
  ['accion', 'Acción'], ['animacion', 'Animación'], ['aventura', 'Aventura'],
  ['ciencia-ficcion', 'Ciencia Ficción'], ['comedia', 'Comedia'], ['crimen', 'Crimen'],
  ['documental', 'Documental'], ['drama', 'Drama'], ['familia', 'Familia'],
  ['fantasia', 'Fantasía'], ['historia', 'Historia'], ['misterio', 'Misterio'],
  ['musica', 'Música'], ['pelicula-de-la-television', 'Película de TV'],
  ['romance', 'Romance'], ['suspense', 'Suspenso'], ['terror', 'Terror'], ['western', 'Western'],
];

const SERVERS = ['Uqload', 'Vidara', 'VOE', 'OK.ru', 'Streamtape'];

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

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
  }

  getSourceFeeds() {
    return [
      { id: 'tendencias', name: 'Tendencias' },
      { id: 'peliculas', name: 'Películas' },
      { id: 'series', name: 'Series' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'tendencias';

    const tag = tags[0] && (typeof tags[0] === 'string' ? tags[0] : tags[0].id);

    let url = '';
    if (query) {
      url = `${SITE}/${page > 1 ? `page/${page}/` : ''}?s=${encodeURIComponent(query)}`;
    } else if (tag) {
      url = `${SITE}/genero/${encodeURIComponent(tag)}/${page > 1 ? `page/${page}/` : ''}`;
    } else if (feed === 'peliculas') {
      url = `${SITE}/peliculas/${page > 1 ? `page/${page}/` : ''}`;
    } else if (feed === 'series') {
      url = `${SITE}/serie-de-tv/${page > 1 ? `page/${page}/` : ''}`;
    } else {
      url = `${SITE}/tendencias/${page > 1 ? `page/${page}/` : ''}`;
    }

    const html = await this.get(url);
    const $ = cheerio.load(html);
    const seen = new Set();
    const results = [];

    const selector = query ? 'div.search-page .result-item' : 'div.items article.item';
    $(selector).each((i, el) => {
      const a = $(el).find('div.title a, div.image a, .poster a, a').first();
      const href = a.attr('href') || '';
      const match = /\/(peliculas|serie-de-tv)\/([^/?#]+)/.exec(href);
      if (!match) return;
      const mangaId = `${match[1]}/${match[2]}`;
      if (seen.has(mangaId)) return;
      seen.add(mangaId);

      const title = $(el).find('div.title a, h3, h2, .title').first().text().trim() || a.text().trim();
      const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
      const image = img && img.startsWith('//') ? `https:${img}` : img;
      if (title && image && !image.startsWith('data:')) {
        results.push({ mangaId, title, image });
      }
    });

    const hasNext = Boolean($('a.next, .pagination a:contains("»"), .pagination a:contains("Sig")').length);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const html = await this.get(`${SITE}/${mangaId}/`);
    const $ = cheerio.load(html);
    const title = $('h1').first().text().trim();
    const desc = $('div.wp-content p, #info div.wp-content, div.desc p').first().text().trim() || undefined;
    const genres = $('div.sgeneros a, span.genres a')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter((g) => g && !/(bajalogratis|torrent|pelis|repelis|xdede)/i.test(g));

    return {
      mangaInfo: {
        title,
        desc,
        genres: genres.length ? genres : undefined,
        status: mangaId.startsWith('peliculas/') ? 'COMPLETED' : 'ONGOING',
      },
    };
  }

  async getChapters(mangaId) {
    if (mangaId.startsWith('peliculas/')) {
      return [{ id: `${mangaId}/single`, name: 'Película', number: 1 }];
    }
    const html = await this.get(`${SITE}/${mangaId}/`);
    const $ = cheerio.load(html);
    const chapters = [];
    $('#seasons .episodios li').each((i, el) => {
      const a = $(el).find('.numerando a, .episodiotitle a, a').first();
      const href = a.attr('href') || '';
      const match = /\/capitulo\/([^/?#]+)/.exec(href);
      if (!match) return;
      const chapterId = `capitulo/${match[1]}`;
      const name = $(el).find('.episodiotitle a').text().trim() || `Episodio ${i + 1}`;
      const numMatch = /(\d+)\s*-\s*(\d+)/.exec($(el).find('.numerando').text().trim());
      const number = numMatch ? (+numMatch[1] * 1000 + +numMatch[2]) : (i + 1);
      chapters.push({ id: chapterId, name, number });
    });
    return chapters;
  }

  async getVideos(mangaId, chapterId) {
    const pageUrl = chapterId.endsWith('/single')
      ? `${SITE}/${mangaId}/`
      : `${SITE}/${chapterId}/`;

    const html = await this.get(pageUrl);
    const $ = cheerio.load(html);
    const options = $('li.dooplay_player_option, li[id^="player-option-"]').map((i, el) => {
      return {
        post: $(el).attr('data-post'),
        nume: $(el).attr('data-nume'),
        type: $(el).attr('data-type'),
        title: $(el).find('.title').text().trim() || `Servidor ${i + 1}`,
      };
    }).get();

    const embeds = await Promise.all(options.map(async (opt) => {
      try {
        const body = `action=doo_player_ajax&post=${encodeURIComponent(opt.post)}&nume=${encodeURIComponent(opt.nume)}&type=${encodeURIComponent(opt.type)}`;
        const jsonText = await this.post(`${SITE}/wp-admin/admin-ajax.php`, body, {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: pageUrl,
        });
        const json = JSON.parse(jsonText);
        let embed = json.embed_url || '';
        const iframe = /src=["']([^"']+)["']/.exec(embed);
        if (iframe) embed = iframe[1];
        return embed ? { url: embed, title: opt.title } : null;
      } catch (err) {
        return null;
      }
    }));

    const validEmbeds = embeds.filter(Boolean);
    const found = await Promise.all(validEmbeds.map((e) => this.extract(e.url, e.title).catch(() => null)));
    const videos = found
      .filter((v) => v && /^https?:\/\//.test(v.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, ...v }) => ({ ...v, headers: { ...v.headers, ...BROWSER } }));

    if (!videos.length) throw new Error(`CinePlus123: none of the ${validEmbeds.length} servers gave a playable video`);
    return videos;
  }

  async extract(rawUrl, title) {
    const url = rawUrl
      .replace(/^http:/, 'https:')
      .replace(/^\/\//, 'https://');
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;

    if (/(^|\.)uqload\.\w+$/.test(host)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const code = unpack(html) || html;
      const match = /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/.exec(code)
        || /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/.exec(code);
      if (!match) return null;
      return { url: match[1] || match[0], server: 'Uqload', quality: `Uqload ${title}`, headers: { Referer: origin } };
    }

    if (/(^|\.)(vidara\.to|sugbaioug\.com)$/.test(host)) {
      const codeMatch = /\/e\/([^/?#]+)/.exec(url);
      if (!codeMatch) return null;
      const body = JSON.stringify({ filecode: codeMatch[1], device: 'web' });
      const resText = await this.post('https://vidara.to/api/stream', body, {
        'Content-Type': 'application/json',
        Referer: `https://vidara.to/e/${codeMatch[1]}`,
      });
      const data = JSON.parse(resText);
      if (!data || !data.streaming_url) return null;
      return { url: data.streaming_url, server: 'Vidara', quality: `Vidara ${title}`, headers: { Referer: 'https://vidara.to/' } };
    }

    if (/(^|\.)voe\.sx$/.test(host)) {
      let html = await this.get(url);
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', quality: `VOE ${title}` };
    }

    if (/(^|\.)ok\.ru$/.test(host)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options') || '{}');
      const raw = options.flashvars && options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const stream = metadata && (metadata.hlsManifestUrl || metadata.ondemandHls);
      if (!stream) return null;
      return { url: stream, server: 'OK.ru', quality: `OK.ru ${title}`, headers: { Referer: origin } };
    }

    if (/(^|\.)(streamtape\.com|shavetape\.cash)$/.test(host)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const part = /document\.getElementById\('(?:norobot|robot)link'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/.exec(html);
      if (!part) return null;
      return { url: `https:${part[1]}${part[2].substring(+part[3])}`, server: 'Streamtape', quality: `Streamtape ${title}`, headers: { Referer: origin } };
    }

    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, extraHeaders = {}) {
    const response = await this.requests.schedule(
      App.createRequest({ url, method: 'GET', headers: { ...BROWSER, ...extraHeaders } })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`CinePlus123: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }

  async post(url, body, extraHeaders = {}) {
    const response = await this.requests.schedule(
      App.createRequest({ url, method: 'POST', body, headers: { ...BROWSER, ...extraHeaders } })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`CinePlus123: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
