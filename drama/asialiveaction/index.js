const SITE = 'https://asialiveaction.com';
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

const GENRES = [
  ['accion', 'Acción'],
  ['adulto', 'Adulto'],
  ['animacion', 'Animación'],
  ['aventura', 'Aventura'],
  ['ciencia-ficcion', 'Ciencia Ficción'],
  ['comedia', 'Comedia'],
  ['documental', 'Documental'],
  ['drama', 'Drama'],
  ['fantasia', 'Fantasía'],
  ['misterio', 'Misterio'],
  ['romance', 'Romance'],
  ['suspenso', 'Suspenso'],
  ['terror', 'Terror'],
  ['tokusatsu', 'Tokusatsu'],
];

class Source {
  constructor() {
    this.requests = App.createRequestManager({
      rateLimit: { requestsPerSecond: 4 },
    });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Todos' },
      { id: 'series', name: 'Series' },
      { id: 'peliculas', name: 'Películas' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'popular';

    const tag = tags[0] && (typeof tags[0] === 'string' ? tags[0] : tags[0].id);

    let url = '';
    if (query) {
      url = `${SITE}/search/${encodeURIComponent(query)}/${page > 1 ? `?pagina=${page}` : ''}`;
    } else if (tag) {
      url = `${SITE}/navegacion/?genero%5B%5D=${encodeURIComponent(tag)}&pagina=${page}`;
    } else if (feed === 'series') {
      url = `${SITE}/navegacion/?tipo%5B%5D=series&pagina=${page}`;
    } else if (feed === 'peliculas') {
      url = `${SITE}/navegacion/?tipo%5B%5D=peliculas&pagina=${page}`;
    } else {
      url = `${SITE}/navegacion/?pagina=${page}`;
    }

    const html = await this.get(url).catch(() => '');
    if (!html) return { results: [] };

    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();

    $('ul.navegacion-grid li').each((_, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href');
      if (!href) return;
      const title = $(el).find('.carousel-title').first().text().trim();
      const img = $(el).find('img').first().attr('src') || $(el).find('img').first().attr('data-src') || '';
      const match = href.match(/asialiveaction\.com\/(tv\/[^/]+|pelicula\/[^/]+)/);
      const mangaId = match ? match[1] : href.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
      if (mangaId && title && !seen.has(mangaId)) {
        seen.add(mangaId);
        results.push({
          mangaId,
          title,
          image: img,
        });
      }
    });

    const hasNext = Boolean($('div.paginado a[href*="pagina="]').length);
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE}/${mangaId.replace(/^\//, '')}/`;
    const html = await this.get(url);
    const $ = cheerio.load(html);

    const title = $('h2.Title').first().text().trim() || $('title').text().replace(/– Asia Live Action.*/, '').trim();
    const image = $('meta[property="og:image"]').attr('content') || $('article img').first().attr('src') || '';
    const desc = $('article p').first().text().trim() || $('meta[name="description"]').attr('content') || undefined;

    const genres = [];
    $('footer a.genero, footer a.tag').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    let status = 'ONGOING';
    const infoText = $('.categorias').text();
    if (/Finalizado/i.test(infoText) || /Pel[ií]cula/i.test(infoText)) {
      status = 'COMPLETED';
    }

    return {
      mangaInfo: {
        title,
        image,
        desc,
        summary: desc,
        genres: genres.length ? genres : undefined,
        status,
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE}/${mangaId.replace(/^\//, '')}/`;
    const html = await this.get(url);
    const $ = cheerio.load(html);

    const chapters = [];
    const seen = new Set();

    $('div.lista-episodios a[href*="/e/"], div.lista-episodios a[href*="/f/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const match = href.match(/asialiveaction\.com\/([ef]\/[^/]+\/[^/]+(?:\/[^/]+)?)/);
      const chapterId = match ? match[1] : href.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      let name = $(el).find('.numero-episodio').text().trim() || $(el).text().trim() || `Episodio ${i + 1}`;
      const numMatch = name.match(/(\d+(?:\.\d+)?)/);
      const number = numMatch ? parseFloat(numMatch[1]) : i + 1;

      chapters.push({
        id: chapterId,
        chapterId,
        name,
        number,
      });
    });

    if (!chapters.length) {
      chapters.push({
        id: `${mangaId}/single`,
        chapterId: `${mangaId}/single`,
        name: 'Película',
        number: 1,
      });
    }

    return chapters;
  }

  async getVideos(mangaId, chapterId) {
    const pageUrl = (chapterId && chapterId.endsWith('/single'))
      ? `${SITE}/${mangaId.replace(/^\//, '')}/`
      : /^https?:\/\//.test(chapterId)
      ? chapterId
      : `${SITE}/${(chapterId || '').replace(/^\//, '')}/`;

    const html = await this.get(pageUrl);

    const match = /var\s+allVideos\s*=\s*(\{[\s\S]*?\});/.exec(html);
    const serverEntries = [];

    if (match) {
      try {
        const allVideos = JSON.parse(match[1]);
        for (const key of Object.keys(allVideos)) {
          const list = allVideos[key];
          if (Array.isArray(list)) {
            for (const item of list) {
              if (Array.isArray(item) && item[1]) {
                const sUrl = String(item[1]).replace(/\\\//g, '/');
                serverEntries.push({ label: item[0] || 'Server', url: sUrl });
              }
            }
          }
        }
      } catch (err) {}
    }

    const resolved = await Promise.all(
      serverEntries.map(async (entry) => {
        try {
          return await this.extract(entry.url);
        } catch {
          return null;
        }
      })
    );

    const videos = resolved.filter((v) => v && v.url);
    if (!videos.length) {
      throw new Error(`AsiaLiveAction: none of the ${serverEntries.length} servers gave a playable video`);
    }

    return videos;
  }

  async extract(rawUrl) {
    const url = rawUrl.replace(/^http:/, 'https:');
    if (/vidmoly\.(org|to|net|me)/.test(url)) {
      const page = await this.get(url, { Referer: `${SITE}/` });
      const m3u8Match = /sources:\s*\[\{\s*file:\s*['"]([^'"]+)['"]/.exec(page) ||
                        /file:\s*['"](https:\/\/[^'"]+\.m3u8[^'"]*)['"]/.exec(page);
      if (m3u8Match) {
        return {
          url: m3u8Match[1],
          originalUrl: m3u8Match[1],
          quality: 'Vidmoly',
          headers: { ...BROWSER, Referer: 'https://vidmoly.org/' },
        };
      }
    }

    if (/ok\.ru/.test(url)) {
      const page = await this.get(url, { Referer: `${SITE}/` });
      const match = /data-options="([^"]+)"/.exec(page);
      if (match) {
        const unescaped = match[1].replace(/&quot;/g, '"');
        const data = JSON.parse(unescaped);
        const raw = data.flashvars ? data.flashvars.metadata : null;
        const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const streamUrl = meta ? (meta.hlsManifestUrl || meta.ondemandHls || (meta.videos && meta.videos[0] && meta.videos[0].url)) : null;
        if (streamUrl) {
          return {
            url: streamUrl,
            originalUrl: streamUrl,
            quality: 'OK.ru',
            headers: { ...BROWSER, Referer: 'https://ok.ru/' },
          };
        }
      }
    }

    if (/streamtape\.com/.test(url)) {
      const html = await this.get(url, { Referer: `${SITE}/` });
      const tape = /getElementById\('robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/.exec(html);
      if (tape) {
        const finalUrl = `https://streamtape.com/${tape[1].slice(+tape[2] + (+tape[3] || 0))}&stream=1`;
        return {
          url: finalUrl,
          originalUrl: finalUrl,
          quality: 'Streamtape',
          headers: { ...BROWSER, Referer: 'https://streamtape.com/' },
        };
      }
    }

    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers = {}) {
    const res = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: { ...BROWSER, Accept: 'text/html', ...headers },
      })
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AsiaLiveAction: HTTP ${res.status} from ${url}`);
    }
    return String(res.data);
  }
}

module.exports = { Source };
