const SITE = 'https://www.doramasyt.com';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'Lulu', 'OK.ru', 'Mp4Upload', 'Streamtape', 'YourUpload', 'MixDrop'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['policial', 'Policial'], ['romance', 'Romance'], ['comedia', 'Comedia'], ['escolar', 'Escolar'],
  ['accion', 'Acción'], ['thriller', 'Thriller'], ['drama', 'Drama'], ['misterio', 'Misterio'],
  ['fantasia', 'Fantasía'], ['historico', 'Histórico'], ['belico', 'Bélico'], ['militar', 'Militar'],
  ['medico', 'Médico'], ['ciencia-ficcion', 'Ciencia Ficción'], ['sobrenatural', 'Sobrenatural'], ['horror', 'Horror'],
  ['politica', 'Política'], ['familiar', 'Familiar'], ['melodrama', 'Melodrama'], ['deporte', 'Deporte'],
  ['comida', 'Comida'], ['supervivencia', 'Supervivencia'], ['aventuras', 'Aventuras'], ['artes-marciales', 'Artes marciales'],
  ['recuentos-de-la-vida', 'Recuentos de la vida'], ['amistad', 'Amistad'], ['psicologico', 'Psicológico'], ['yuri', 'Yuri'],
  ['k-drama', 'K-Drama'], ['j-drama', 'J-Drama'], ['c-drama', 'C-Drama'], ['hk-drama', 'HK-Drama'],
  ['tw-drama', 'TW-Drama'], ['thai-drama', 'Thai-Drama'], ['idols', 'Idols'], ['suspenso', 'Suspenso'],
  ['negocios', 'Negocios'], ['time-travel', 'Time Travel'], ['crimen', 'Crimen'], ['yaoi', 'Yaoi'],
  ['legal', 'Legal'], ['juvenil', 'Juvenil'], ['musical', 'Musical'], ['reality-show', 'Reality Show'],
  ['documental', 'Documental'], ['turcas', 'Turcas'],
];

function slugOf(href, kind) {
  const match = new RegExp('/' + kind + '/([^/?#]+)').exec(href || '');
  return match ? match[1] : null;
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

function cardsOf($) {
  return $('.ficha_efecto a')
    .map((i, el) => {
      const card = $(el);
      const mangaId = slugOf(card.attr('href'), 'dorama');
      if (!mangaId) return null;
      const img = card.find('img').first();
      return {
        mangaId,
        title: card.find('.title_cap, h3').first().text().trim(),
        image: img.attr('data-src') || img.attr('src'),
        medium: 'anime',
      };
    })
    .get()
    .filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'directory', name: 'Directory' },
      { id: 'latest', name: 'Airing' },
    ];
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    let url = `${SITE}/${request && request.feed === 'latest' ? 'emision' : 'doramas'}?p=${page}`;
    if (tags.length) url = `${SITE}/doramas?genero=${encodeURIComponent(tags[0].id)}&p=${page}`;
    if (query) url = `${SITE}/buscar?q=${encodeURIComponent(query)}&p=${page}`;
    const $ = cheerio.load(await this.get(url));
    const results = cardsOf($);
    return {
      results,
      metadata: results.length && $('.pagination [rel="next"]').length ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const webURL = `${SITE}/dorama/${encodeURIComponent(mangaId)}`;
    const $ = cheerio.load(await this.get(webURL));
    const text = $('.lh-sm').text() || $('body').text();
    const img = $('.gap-3 img, img.lazy').first();
    const tags = $('a[href*="/genero/"], .lh-lg span').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: img.attr('data-src') || img.attr('src'),
        desc: $('.mb-3 p').first().text().trim(),
        status: /Finalizado/.test(text) ? 'COMPLETED' : /Estreno|En emisi[oó]n/.test(text) ? 'ONGOING' : 'UNKNOWN',
        tags: Array.from(new Set(tags)),
        webURL,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const referer = `${SITE}/dorama/${encodeURIComponent(mangaId)}`;
    const page = await this.raw({ url: referer, method: 'GET', headers: { Accept: 'text/html' } });
    const html = String(page.data);
    const $ = cheerio.load(html);
    const token = $('meta[name="csrf-token"]').attr('content');
    const ajax = $('.caplist').attr('data-ajax');
    const cookies = Object.entries(page.headers || {})
      .filter(([name]) => name.toLowerCase() === 'set-cookie')
      .map(([, value]) => (Array.isArray(value) ? value.join(', ') : String(value)))
      .join(', ');
    const cookie = Array.from(cookies.matchAll(/(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g), (match) => `${match[1]}=${match[2]}`).join('; ');
    if (token && ajax) {
      const first = await this.post(ajax, `_token=${encodeURIComponent(token)}`, cookie, referer).catch(() => null);
      if (first) {
        const list = JSON.parse(first);
        const pages = Math.ceil((list.eps || []).length / (list.perpage || 50));
        const answers = await Promise.all(
          Array.from({ length: pages }, (_, i) => this.post(list.paginate_url, `_token=${encodeURIComponent(token)}&p=${i + 1}`, cookie, referer))
        );
        const caps = answers.flatMap((answer) => JSON.parse(answer).caps || []);
        const unique = new Map(caps.map((cap) => [slugOf(cap.url, 'ver'), cap]));
        unique.delete(null);
        return Array.from(unique.entries())
          .map(([id, cap]) => ({ id, chapterId: id, name: `Episodio ${cap.episodio}`, number: Number.isFinite(+cap.episodio) ? +cap.episodio : undefined }))
          .reverse();
      }
    }
    const firstSlug = slugOf($('a[href*="/ver/"]').first().attr('href'), 'ver') || `${mangaId.replace(/-sub-espanol$/, '')}-episodio-1`;
    const prefix = firstSlug.replace(/-episodio-\d+$/, '');
    if (/<dd>\s*Pel[ií]cula\s*<\/dd>/i.test(html)) {
      return [{ id: firstSlug, chapterId: firstSlug, name: 'Episodio 1', number: 1 }];
    }
    const hasEpisode = async (n) => {
      const res = await this.requests.schedule(App.createRequest({ url: `${SITE}/ver/${prefix}-episodio-${n}`, method: 'HEAD', headers: BROWSER }));
      return res.status >= 200 && res.status < 300;
    };
    let low = 1;
    let high = 16;
    while (high <= 128 && (await hasEpisode(high))) {
      low = high;
      high *= 2;
    }
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (await hasEpisode(mid)) low = mid;
      else high = mid;
    }
    return Array.from({ length: low }, (_, i) => {
      const number = low - i;
      const id = `${prefix}-episodio-${number}`;
      return { id, chapterId: id, name: `Episodio ${number}`, number };
    });
  }

  async getVideos(mangaId, chapterId) {
    const episodeUrl = `${SITE}/ver/${encodeURIComponent(chapterId)}`;
    const html = await this.get(episodeUrl);
    const $ = cheerio.load(html);
    const key = $('.player').attr('data-key') || `${SITE}/reproductor?video=`;
    const token = (/resource_token\s*=\s*['"]([^'"]+)['"]/.exec(html) || [])[1] || '';
    const entries = $('button.play-video[data-player]')
      .map((i, el) => ({
        name: $(el).text().trim(),
        raw: $(el).attr('data-player'),
        api: $(el).attr('data-usa-api') === '1',
      }))
      .get()
      .filter((item) => item.raw && (!item.api || /^(voe|lulu.*|m.?xdrop|ok.*|yourupload|mp4upload|streamtape)$/i.test(item.name)));
    const players = await Promise.all(
      entries.map(async (item) => {
        if (!item.api) return /^https?:\/\//.test(item.raw) ? item.raw : App.base64Decode(item.raw);
        const url = `${key}${item.raw}&player=${encodeURIComponent(item.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
        const rep = await this.get(url, { Referer: episodeUrl }).catch(() => '');
        return cheerio.load(rep)('iframe[src]').first().attr('src') || null;
      })
    );
    const found = await Promise.all(players.filter(Boolean).map((url) => this.extract(url).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.quality) - SERVERS.indexOf(b.quality))
      .map((video) => ({ ...video, headers: { ...video.headers, ...BROWSER } }));
    if (!videos.length) throw new Error(`DoramasYT: none of the ${entries.length} servers gave a playable video`);
    return videos;
  }

  async extract(rawUrl) {
    const url = rawUrl.replace(/^http:/, 'https:').replace(/^https:\/\/mi?xdrop\.[^/]+\//, 'https://mixdrop.top/');
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (!/(^|\.)(voe\.sx|lulu|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com|streamtape\.com)/.test(host)) return null;
    let html = await this.get(url);
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
      return { url: wurl[1].replace(/^\/\//, 'https://'), quality: 'MixDrop', headers: { Referer: 'https://mixdrop.top/' } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl || metadata.ondemandHls, quality: 'OK.ru', headers: { Referer: origin } };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], quality: 'YourUpload', headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], quality: 'Mp4Upload', headers: { Referer: origin } };
    }
    if (/(^|\.)streamtape\.com$/.test(host)) {
      const tape = /getElementById\('robotlink'\)\.innerHTML\s*=\s*'[^']*'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)(?:\.substring\((\d+)\))?/.exec(html);
      return { url: `https://streamtape.com/${tape[1].slice(+tape[2] + (+tape[3] || 0))}&stream=1`, quality: 'Streamtape', headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url, headers = {}) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html', ...headers } });
  }

  post(url, body, cookie, referer) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
      Origin: SITE,
      Referer: referer,
      Cookie: cookie,
    };
    return this.send({ url, method: 'POST', headers, body });
  }

  async send(request) {
    return String((await this.raw(request)).data);
  }

  async raw(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...BROWSER, ...request.headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`DoramasYT: HTTP ${response.status} from ${request.url}`);
    return response;
  }
}

module.exports = { Source };
