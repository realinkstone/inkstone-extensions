const SITE = 'https://verani.me';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VOE', 'HLS', 'Lulu', 'FileLions', 'Uqload', 'OK.ru', 'MixDrop', 'YourUpload', 'Mp4Upload'];

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

function parseEpisode($, el, seasonPrefix) {
  const card = $(el);
  const href = card.attr('href') || '';
  if (!href || href.includes('proximos-capitulos') || card.hasClass('ver-ahora')) return null;
  const match = /^https?:\/\/verani\.me\/([^?#]+?)\/?$/.exec(href);
  if (!match) return null;
  const id = match[1];
  const title = card.find('.capitulo-card-title, h3').first().text().trim() || card.text().trim() || 'Capítulo';
  const numMatch = /(?:cap[íi]tulo|episodio)\s*(\d+(?:\.\d+)?)/i.exec(title) || /(?:capitulo|episodio)-(\d+)/i.exec(id);
  const number = numMatch ? +numMatch[1] : undefined;
  return {
    id,
    chapterId: id,
    name: `${seasonPrefix}${title}`,
    number: Number.isFinite(number) ? number : undefined,
  };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
    ];
  }

  async getSearchTags() {
    const $ = cheerio.load(await this.get(`${SITE}/animes/`));
    const seen = new Set();
    return $('li.menu-item-object-genero > a[href*="/animes/"]')
      .map((i, el) => ({
        id: (/\/animes\/([^/?#"]+)/.exec($(el).attr('href')) || [])[1],
        label: $(el).text().trim(),
      }))
      .get()
      .filter((tag) => tag.id && tag.label && !seen.has(tag.id) && seen.add(tag.id));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const feed = request && request.feed;
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/page/${page}/?s=${encodeURIComponent(query)}`;
    } else if (tags.length) {
      const genre = encodeURIComponent(tags[0].id || tags[0]);
      url = `${SITE}/animes/${genre}/page/${page}/`;
    } else if (feed === 'latest') {
      url = `${SITE}/animes/page/${page}/`;
    } else {
      url = `${SITE}/animes/page/${page}/?orderby=popular`;
    }
    const $ = cheerio.load(await this.get(url));
    const results = $('.anime-card a.card-link')
      .map((i, el) => {
        const href = $(el).attr('href') || '';
        const match = /^https?:\/\/verani\.me\/((?:pelicula\/)?[^/?#"]+)\/?$/.exec(href);
        const mangaId = match && !/^(animes|page|proximos-capitulos|peliculas)$/.test(match[1]) ? match[1] : null;
        const img = $(el).find('img').first();
        const title = $(el).find('.card-title, h3').first().text().trim() || img.attr('alt') || '';
        return mangaId && title ? { mangaId, title, image: img.attr('src') || img.attr('data-src'), medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    const next = $('.pagination .next, a.next').length;
    return { results, metadata: results.length && next ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/${mangaId}/`));
    const row = (label) =>
      $('.anime-info-card')
        .filter((i, el) => $(el).find('.anime-info-label').text().includes(label))
        .find('.anime-info-value')
        .text()
        .trim();
    const statusText = row('Estado');
    const heroImg = $('img.anime-hero-bg-image').first().attr('src');
    return {
      mangaInfo: {
        title: $('h1').first().text().trim() || mangaId,
        image: heroImg,
        banner: heroImg,
        desc: $('.anime-hero-description, .sinopsis, .description, p.desc, .pelicula-overview p').first().text().trim(),
        author: row('Estudio') || undefined,
        status: /en emisi/i.test(statusText) ? 'ONGOING' : /finalizad/i.test(statusText) || mangaId.startsWith('pelicula/') ? 'COMPLETED' : 'UNKNOWN',
        tags: $('main a[href*="/animes/"]').map((i, el) => $(el).text().trim()).get().filter(Boolean),
        webURL: `${SITE}/${mangaId}/`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const $ = cheerio.load(await this.get(`${SITE}/${mangaId}/`));
    const episodes = [];
    const groups = $('.temporada-group');
    if (groups.length) {
      const multi = groups.length > 1;
      groups.each((i, group) => {
        const badge = $(group).find('.temporada-badge, .temporada-name').first().text();
        const numMatch = /\d+/.exec(badge);
        const prefix = multi && numMatch ? `S${numMatch[0].padStart(2, '0')} ` : '';
        $(group)
          .find('a.capitulo-card-link')
          .each((j, el) => {
            const ep = parseEpisode($, el, prefix);
            if (ep) episodes.push(ep);
          });
      });
    } else {
      $('a.capitulo-card-link').each((i, el) => {
        const ep = parseEpisode($, el, '');
        if (ep) episodes.push(ep);
      });
    }
    if (!episodes.length && $('.iframe-wrapper').length) {
      episodes.push({ id: mangaId, chapterId: mangaId, name: 'Película', number: 1 });
    }
    return Array.from(new Map(episodes.map((ep) => [ep.id, ep])).values());
  }

  async getVideos(mangaId, chapterId) {
    const $ = cheerio.load(await this.get(`${SITE}/${chapterId}/`));
    const entries = $('iframe[src], iframe[data-src]')
      .map((i, el) => {
        const frame = $(el);
        const url = frame.attr('src') || frame.attr('data-src') || '';
        const item = frame.closest('.iframe-item');
        const badge = item.find('.info-badge span').last().text().trim() || item.attr('data-servidor') || '';
        const lang = /latino/i.test(badge) ? 'Latino' : /castellano/i.test(badge) ? 'Castellano' : /japon|sub/i.test(badge) ? 'Sub' : '';
        return /^https?:\/\//.test(url) ? { url, lang } : null;
      })
      .get()
      .filter(Boolean);
    if (!entries.length) throw new Error('VerAnime: the site lists no video servers for this episode');
    const found = await Promise.all(entries.map((entry) => this.extract(entry).catch(() => null)));
    const videos = found
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, lang, ...video }) => ({
        ...video,
        quality: lang ? `${server} (${lang})` : server,
        headers: { ...video.headers, ...BROWSER },
      }));
    if (!videos.length) throw new Error(`VerAnime: none of the ${entries.length} servers gave a playable video`);
    return videos;
  }

  async extract({ url, lang }) {
    const host = (/^https?:\/\/([^/]+)/.exec(url) || [])[1] || '';
    const origin = `https://${host}/`;
    if (/(^|\.)zilla-networks\.com$/.test(host)) {
      return { url: url.replace('/play/', '/m3u8/'), server: 'HLS', lang, headers: { Referer: `${SITE}/` } };
    }
    if (!/(^|\.)(voe\.sx|lulu|filelions\.|uqload\.|mi?xdrop\.|ok\.ru|yourupload\.com|mp4upload\.com)/.test(host)) return null;
    let html = await this.get(url.replace(/^http:/, 'https:'));
    if (/(^|\.)voe\.sx$/.test(host)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1]);
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', lang };
    }
    if (/(^|\.)lulu/.test(host)) {
      const file = /file:\s*"([^"]+)"/.exec(html) || /file:\s*"([^"]+)"/.exec(unpack(html));
      return { url: file[1], server: 'Lulu', lang, headers: { Referer: origin } };
    }
    if (/(^|\.)filelions\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /"hls\d"\s*:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked);
      return { url: file[1].replace(/^\/\//, 'https://'), server: 'FileLions', lang, headers: { Referer: origin } };
    }
    if (/(^|\.)uqload\./.test(host)) {
      const unpacked = unpack(html) || html;
      const file = /file:\s*"([^"]+\.m3u8[^"]*)"/.exec(unpacked) || /sources:\s*\[\s*"([^"]+\.mp4[^"]*)"/.exec(unpacked);
      return { url: file[1], server: 'Uqload', lang, headers: { Referer: 'https://uqload.vc/' } };
    }
    if (/(^|\.)mi?xdrop\./.test(host)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), server: 'MixDrop', lang, headers: { Referer: origin } };
    }
    if (/(^|\.)ok\.ru$/.test(host)) {
      const $ = cheerio.load(html);
      const options = JSON.parse($('[data-options]').first().attr('data-options'));
      const raw = options.flashvars.metadata;
      const metadata = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return { url: metadata.hlsManifestUrl, server: 'OK.ru', lang };
    }
    if (/(^|\.)yourupload\.com$/.test(host)) {
      const file = /file:\s*'([^']+\.mp4)'/.exec(html);
      return { url: file[1], server: 'YourUpload', lang, headers: { Referer: origin } };
    }
    if (/(^|\.)mp4upload\.com$/.test(host)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], server: 'Mp4Upload', lang, headers: { Referer: origin } };
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  get(url) {
    return this.send({ url, method: 'GET', headers: { Accept: 'text/html' } });
  }

  async send(request) {
    const response = await this.requests.schedule(App.createRequest({ ...request, headers: { ...request.headers, ...BROWSER } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`VerAnime: HTTP ${response.status} from ${request.url}`);
    return String(response.data);
  }
}

module.exports = { Source };
