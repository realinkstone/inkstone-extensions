const SITE = 'https://www.kumanga.com';

const KEY = 'Jr54VwepF4La';

const PAGE_CACHE_MS = 5 * 60 * 1000;

const GENRES = [
  ['1', 'Acción'], ['2', 'Artes marciales'], ['3', 'Automóviles'], ['4', 'Aventura'], ['44', 'Boys Love'],
  ['5', 'Ciencia Ficción'], ['6', 'Comedia'], ['7', 'Demonios'], ['8', 'Deportes'], ['9', 'Doujinshi'],
  ['10', 'Drama'], ['11', 'Ecchi'], ['12', 'Espacio exterior'], ['13', 'Fantasía'], ['14', 'Gender bender'],
  ['45', 'Girls Love'], ['46', 'Gore'], ['15', 'Harem'], ['17', 'Histórico'], ['18', 'Horror'],
  ['51', 'Isekai'], ['19', 'Josei'], ['20', 'Juegos'], ['21', 'Locura'], ['22', 'Magia'],
  ['23', 'Mecha'], ['24', 'Militar'], ['25', 'Misterio'], ['26', 'Música'], ['27', 'Niños'],
  ['28', 'Parodia'], ['29', 'Policía'], ['30', 'Psicológico'], ['31', 'Recuentos de la vida'], ['49', 'Reencarnación'],
  ['32', 'Romance'], ['33', 'Samurai'], ['34', 'Seinen'], ['35', 'Shoujo'], ['36', 'Shoujo Ai'],
  ['37', 'Shounen'], ['38', 'Shounen Ai'], ['39', 'Sobrenatural'], ['41', 'Súperpoderes'], ['50', 'Supervivencia'],
  ['40', 'Suspenso'], ['47', 'Terror'], ['48', 'Tragedia'], ['42', 'Vampiros'], ['43', 'Vida escolar'],
];

function mangaIdOf(href) {
  const match = /manga\/(\d+)\//.exec(href || '');
  return match ? match[1] : null;
}

function decrypt(encoded) {
  const words = CryptoJS.enc.Base64.parse(encoded);
  let text = '';
  for (let i = 0; i < words.sigBytes; i++) {
    const byte = (words.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255;
    text += String.fromCharCode(byte ^ KEY.charCodeAt(i % KEY.length));
  }
  return JSON.parse(text);
}

function coverOf(id) {
  return `https://static.kumanga.com/manga/${Math.floor((+id + 2499) / 2500)}/${id}.jpg`;
}

function imageOf(path) {
  const hex = /[?&]src=([0-9a-f]+)/i.exec(path);
  if (hex) return hex[1].replace(/../g, (pair) => String.fromCharCode(parseInt(pair, 16)));
  return /^https?:\/\//.test(path) ? path : SITE + (path.startsWith('/') ? '' : '/') + path;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
    this.pages = new Map();
  }

  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
    ];
  }

  async getSearchTags() {
    return [];
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    if (!query && !tags.length) {
      const $ = cheerio.load(await this.get(SITE));
      const titles = $('.update_item .update_left a')
        .map((i, el) => {
          const link = $(el);
          const mangaId = mangaIdOf(link.attr('href'));
          const cover = /url\(([^)]+)\)/.exec(link.find('div[style]').attr('style') || '');
          return mangaId && { mangaId, title: link.attr('title'), image: cover ? cover[1] : undefined, medium: 'comics' };
        })
        .get()
        .filter(Boolean);
      return { results: Array.from(new Map(titles.map((title) => [title.mangaId, title])).values()) };
    }
    const body = [`contentType=manga`, `page=${page}`, `perPage=24`];
    if (query) body.push(`keywords=${encodeURIComponent(query)}`);
    for (const tag of tags) body.push(`category_filter[${encodeURIComponent(tag.id)}]=${encodeURIComponent(tag.id)}`);
    const answer = await this.send({
      url: `${SITE}/backend/ajax/searchengine2.php`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      body: body.join('&'),
    });
    if (!answer.trim()) throw new Error('KuManga: the site search answered nothing (it needs a token the site script makes, so search and genre filters are off for now)');
    const result = JSON.parse(answer);
    if (!result || !Array.isArray(result.contents)) throw new Error('KuManga: the search answer has no list of titles');
    const results = result.contents.map((manga) => ({ mangaId: String(manga.id), title: manga.name, image: coverOf(manga.id), medium: 'comics' }));
    return { results, metadata: page * 24 < result.totalContents ? { page: page + 1 } : undefined };
  }

  titlePage(mangaId) {
    const cached = this.pages.get(mangaId);
    if (cached && Date.now() - cached.at < PAGE_CACHE_MS) return cached.promise;
    const promise = this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}`);
    this.pages.set(mangaId, { at: Date.now(), promise });
    promise.catch(() => this.pages.delete(mangaId));
    return promise;
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.titlePage(mangaId));
    const info = (label) => $('.media-info-list__item')
      .filter((i, el) => $(el).find('.media-info-list__title').text().trim().startsWith(label))
      .find('.media-info-list__value')
      .text()
      .toLowerCase();
    const status = info('Estado');
    return {
      mangaInfo: {
        title: $('h1.media-name__main').first().contents().filter((i, node) => node.type === 'text').text().trim() || mangaId,
        image: $('.media-sidebar__cover img').attr('data-src'),
        desc: $('p.Mdesc').text().trim(),
        status: /emisi|activo/.test(status) ? 'ONGOING' : /finaliz/.test(status) ? 'COMPLETED' : /inconclus/.test(status) ? 'CANCELLED' : 'UNKNOWN',
        tags: $('.media-cats a.btn-dark').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/manga/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    const listed = $('.media-chapter')
      .map((i, el) => ({ number: $(el).attr('data-sort'), name: $(el).find('.media-chapter__name').text().trim() }))
      .get();
    const others = /OTHER_CHAPTERS\s*=\s*(\[[\s\S]*?\])\s*;/.exec(html);
    const rest = others
      ? JSON.parse(others[1]).map((cap) => ({ number: String(cap.NumCap), name: `Capítulo ${cap.NumCap}${cap.title ? `: ${cap.title}` : ''}` }))
      : [];
    const unique = new Map(listed.concat(rest).filter((cap) => cap.number).map((cap) => [cap.number, cap]));
    return Array.from(unique.values()).map((cap) => ({
      id: cap.number,
      chapterId: cap.number,
      name: cap.name,
      number: Number.isFinite(+cap.number) ? +cap.number : undefined,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const redirect = /leer\/(\d+)/.exec(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/capitulo/${encodeURIComponent(chapterId)}`));
    if (!redirect) throw new Error('KuManga: the chapter page has no reader link');
    const html = await this.get(`${SITE}/manga/leer/${redirect[1]}`);
    const name = /const\s+rpics\s*=\s*(\w+)/.exec(html);
    const encoded = name && new RegExp(`const\\s+${name[1]}\\s*=\\s*"([^"]+)"`).exec(html);
    if (!encoded && html.includes('its_a_joke')) throw new Error('KuManga: the reader page list uses a new encoding this source cannot read yet');
    if (!encoded) throw new Error('KuManga: the reader has no page list');
    return { id: chapterId, mangaId, pages: decrypt(encoded[1]).map(imageOf) };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest(request));
    if (response.status < 200 || response.status >= 300) throw new Error(`KuManga: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
