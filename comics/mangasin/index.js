const SITE = 'https://m440.in';

const STATUS = { 'en curso': 'ONGOING', 'en emisión': 'ONGOING', finalizado: 'COMPLETED', terminado: 'COMPLETED', abandonado: 'CANCELLED', cancelado: 'CANCELLED' };

const KEY_HOOK = [
  '(function () {',
  '  var real; var done = false;',
  '  Object.defineProperty(window, "CryptoJS", { configurable: true, get: function () { return real; }, set: function (value) {',
  '    real = value; var decrypt = value.AES.decrypt;',
  '    value.AES.decrypt = function (data, key) {',
  '      if (!done && typeof key === "string") { done = true; __reportResult(key); }',
  '      return decrypt.apply(this, arguments);',
  '    };',
  '  } });',
  '  setTimeout(function () { if (!done) __reportError("the page did not decrypt its chapter list"); }, 20000);',
  '})();',
].join('\n');

function coverOf(slug) {
  return `${SITE}/uploads/manga/${slug}/cover/cover_250x350.jpg`;
}

function decrypt(payload, key) {
  const params = CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(payload.ct), salt: CryptoJS.enc.Hex.parse(payload.s) });
  let list = JSON.parse(CryptoJS.AES.decrypt(params, key).toString(CryptoJS.enc.Utf8));
  if (typeof list === 'string') list = JSON.parse(list);
  return list;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
    this.state = App.createSourceStateManager();
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    if (query) {
      if (query.length < 3) return { results: [] };
      const found = JSON.parse(await this.get(`${SITE}/search?q=${encodeURIComponent(query)}`, 'application/json'));
      const results = found
        .map((item) => {
          const slug = (/\/manga\/([^/"\\]+)/.exec(item.label || '') || [])[1];
          return slug && { mangaId: slug, title: item.value, image: coverOf(slug), medium: 'comics' };
        })
        .filter(Boolean);
      return { results };
    }
    const latest = JSON.parse(await this.get(`${SITE}/lasted?p=${page}`, 'application/json'));
    const results = latest.data.map((item) => ({ mangaId: item.manga_slug, title: item.manga_name, image: coverOf(item.manga_slug), medium: 'comics' }));
    return { results, metadata: page < latest.totalPages ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}`));
    const field = (label) => $('dt').filter((i, el) => $(el).text().trim() === label).first().next('dd');
    return {
      mangaInfo: {
        title: $('h2.widget-title').first().text().trim() || mangaId,
        image: $('.boxed img.img-responsive').attr('src') || coverOf(mangaId),
        desc: $('.well p').map((i, el) => $(el).text().trim()).get().filter(Boolean).join('\n\n'),
        author: field('Autor(es)').text().trim() || undefined,
        status: STATUS[$('div.manga-name span.label').first().text().trim().toLowerCase()] || 'UNKNOWN',
        tags: field('Categorías').find('a').map((i, el) => $(el).text().trim()).get(),
        webURL: `${SITE}/manga/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE}/manga/${encodeURIComponent(mangaId)}`;
    const literal = /=\s*("\{\\"ct\\"(?:[^"\\]|\\.)*")/.exec(await this.get(url));
    if (!literal) throw new Error('Mangas.in: the title page has no chapter list');
    const payload = JSON.parse(JSON.parse(literal[1]));
    let key = await this.state.retrieve('key');
    let list = null;
    try {
      list = key ? decrypt(payload, key) : null;
    } catch (e) {
      list = null;
    }
    if (!list) {
      const found = await App.executeInWebView({ url, script: KEY_HOOK, runBeforePageScripts: true, timeoutMs: 30000 });
      if ('error' in found) throw new Error(`Mangas.in: could not read the chapter list key (${found.error})`);
      key = found.value;
      await this.state.store('key', key);
      list = decrypt(payload, key);
    }
    return list.map((chapter) => {
      const time = Date.parse(String(chapter.created_at || '').replace(' ', 'T') + 'Z');
      const name = chapter.name && chapter.name !== `Capítulo ${chapter.number}` ? `Capítulo ${chapter.number}: ${chapter.name}` : `Capítulo ${chapter.number}`;
      return {
        id: chapter.slug,
        chapterId: chapter.slug,
        name,
        number: Number.isFinite(+chapter.number) ? +chapter.number : undefined,
        volume: chapter.volume ? String(chapter.volume) : undefined,
        time: Number.isNaN(time) ? undefined : time,
      };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`));
    const pages = $('#all > img.img-responsive')
      .map((i, el) => {
        const src = ($(el).attr('data-src') || $(el).attr('src') || '').trim();
        if (/^https?:\/\//.test(src)) return src;
        try {
          return decodeURIComponent(App.base64Decode(src.split('://').pop()));
        } catch (e) {
          return null;
        }
      })
      .get()
      .filter((src) => src && /^https?:\/\//.test(src));
    return { id: chapterId, mangaId, pages };
  }

  async get(url, accept) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: accept || 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Mangas.in: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
