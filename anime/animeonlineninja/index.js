const SITE = 'https://ver2.animeonline.ninja';

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'es' };

const SERVERS = ['VidHide', 'StreamWish', 'Filemoon', 'VOE', 'MixDrop', 'Uqload', 'WolfStream', 'Mp4Upload', 'StreamTape', 'DoodStream'];

const VOE_MARKERS = ['@$', '^^', '~@', '%?', '*~', '!!', '#&'];

const GENRES = [
  ['sin-censura', 'Sin Censura'],
  ['en-emision-1', 'En emisión'],
  ['blu-ray-dvd-2', 'Blu-Ray / DVD'],
  ['proximamente', 'Próximamente'],
  ['live-action', 'Live Action'],
  ['audio-latino', 'Audio Latino'],
  ['anime-castellano', 'Audio Castellano'],
  ['pelicula', 'Películas'],
];

function absolute(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${SITE}${url.startsWith('/') ? '' : '/'}${url}`;
}

function imageOf(img) {
  const candidates = [
    img.attr('data-src'),
    img.attr('data-lazy-src'),
    (img.attr('srcset') || '').split(' ')[0],
    img.attr('src'),
  ];
  const chosen = candidates.find((u) => u && !u.startsWith('data:'));
  return absolute(chosen);
}

function pathOf(href) {
  if (!href) return null;
  const clean = href.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
  return clean || null;
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

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const tags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;
    let url;
    if (query) {
      url = `${SITE}/page/${page}/?s=${encodeURIComponent(query)}`;
    } else if (tags.length) {
      const tagId = tags[0].id;
      const base = tagId === 'pelicula' ? '/pelicula' : `/genero/${encodeURIComponent(tagId)}`;
      url = page > 1 ? `${SITE}${base}/page/${page}/` : `${SITE}${base}/`;
    } else if (request && request.feed === 'latest') {
      url = page > 1 ? `${SITE}/genero/en-emision-1/page/${page}/` : `${SITE}/genero/en-emision-1/`;
    } else {
      url = page > 1 ? `${SITE}/tendencias/page/${page}/` : `${SITE}/tendencias/`;
    }
    const $ = cheerio.load(await this.get(url));
    const selector = query ? 'div.result-item div.image a' : 'div.content article > div.poster';
    const results = $(selector)
      .map((i, el) => {
        const node = $(el);
        const href = node.is('a') ? node.attr('href') : node.find('a').first().attr('href');
        const mangaId = pathOf(href);
        const img = node.find('img').first();
        const title = (img.attr('alt') || node.parent().find('div.data h3, div.details div.title a').first().text() || '').trim();
        const image = imageOf(img);
        return mangaId && title ? { mangaId, title, image, medium: 'anime' } : null;
      })
      .get()
      .filter(Boolean);
    const lastPager = $('div.pagination > *').last();
    const hasNext = lastPager.length > 0 && !lastPager.is('span') && !lastPager.hasClass('current');
    return {
      results,
      metadata: results.length && hasNext ? { page: page + 1 } : undefined,
    };
  }

  async loadAnimeDoc(mangaId) {
    let $ = cheerio.load(await this.get(`${SITE}/${mangaId.replace(/^\/+|\/+$/g, '')}/`));
    const menu = $('div.pag_episodes div.item a[href] i.icon-bars, div.pag_episodes div.item a[href] i.fa-bars').first();
    if (menu.length) {
      const parentHref = menu.parent().attr('href');
      if (parentHref) {
        $ = cheerio.load(await this.get(absolute(parentHref)));
      }
    }
    return $;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.loadAnimeDoc(mangaId);
    const sheader = $('div.sheader').first();
    const posterImg = sheader.find('div.poster > img').first();
    const title = (posterImg.attr('alt') || sheader.find('div.data > h1').first().text() || mangaId).trim();
    const image = imageOf(posterImg);
    const tags = sheader.find('div.data > div.sgeneros > a').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    const paragraphs = $('div#info div.wp-content p').map((i, el) => $(el).text().trim()).get().filter(Boolean);
    const desc = paragraphs.join('\n\n') || $('div#info p').first().text().trim();
    const status = tags.some((t) => /emisi/i.test(t))
      ? 'ONGOING'
      : mangaId.startsWith('pelicula/')
        ? 'COMPLETED'
        : 'UNKNOWN';
    return {
      mangaInfo: {
        title,
        image,
        desc,
        status,
        tags: Array.from(new Set(tags)),
        webURL: `${SITE}/${mangaId.replace(/^\/+|\/+$/g, '')}/`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const cleanId = mangaId.replace(/^\/+|\/+$/g, '');
    const $ = await this.loadAnimeDoc(cleanId);
    const seasons = $('div#seasons > div').get();
    if (!seasons.length) {
      return [{ id: cleanId, chapterId: cleanId, name: 'Película', number: 1 }];
    }
    const episodes = [];
    let counter = 1;
    for (const seasonEl of seasons.slice().reverse()) {
      const season = $(seasonEl);
      const seasonName = season.find('span.se-t').first().text().trim() || '1';
      const items = season.find('ul.episodios > li').get().reverse();
      for (const itemEl of items) {
        const item = $(itemEl);
        const numMatch = /(\d+(?:\.\d+)?)$/.exec(item.find('div.numerando').first().text().trim());
        const epNum = numMatch ? numMatch[1] : String(counter);
        const link = item.find('a[href]').first();
        const id = pathOf(link.attr('href'));
        if (!id) continue;
        const epTitle = link.clone().children().remove().end().text().trim();
        const number = parseFloat(epNum);
        episodes.push({
          id,
          chapterId: id,
          name: epTitle ? `Temporada ${seasonName} x ${epNum} - ${epTitle}` : `Temporada ${seasonName} x ${epNum}`,
          number: Number.isNaN(number) ? counter : number,
        });
        counter++;
      }
    }
    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    const cleanChapter = chapterId.replace(/^\/+|\/+$/g, '');
    const $ = cheerio.load(await this.get(`${SITE}/${cleanChapter}/`));
    const options = $('ul#playeroptionsul li')
      .map((i, el) => {
        const item = $(el);
        return {
          name: item.find('span.title').first().text().trim() || 'SUB',
          type: item.attr('data-type') || '',
          id: item.attr('data-post') || '',
          num: item.attr('data-nume') || '',
        };
      })
      .get()
      .filter((opt) => opt.id && opt.num);
    const resolved = await Promise.all(
      options.map(async (opt) => {
        try {
          const body = await this.get(`${SITE}/wp-json/dooplayer/v1/post/${encodeURIComponent(opt.id)}?type=${encodeURIComponent(opt.type)}&source=${encodeURIComponent(opt.num)}`);
          const match = /"embed_url"\s*:\s*"([^"]+)"/.exec(body);
          if (!match) return [];
          const embedUrl = match[1].replace(/\\/g, '');
          return await this.extractVideos(embedUrl, opt.name);
        } catch (_) {
          return [];
        }
      })
    );
    const videos = resolved
      .flat()
      .filter((video) => video && /^https?:\/\//.test(video.url))
      .sort((a, b) => SERVERS.indexOf(a.server) - SERVERS.indexOf(b.server))
      .map(({ server, lang, ...video }) => ({
        ...video,
        quality: `${server} ${lang}`.trim(),
        headers: { ...video.headers, ...BROWSER },
      }));
    if (!videos.length) throw new Error(`AnimeOnline.Ninja: none of the ${options.length} servers gave a playable video`);
    return videos;
  }

  async extractVideos(url, lang) {
    const cleanUrl = url.replace(/^http:/, 'https:');
    const lower = `${cleanUrl} ${lang}`.toLowerCase();
    if (/saidochesto|multiserver/.test(lower)) {
      const $ = cheerio.load(await this.get(cleanUrl));
      const items = $('div.ODDIV div > li')
        .map((i, el) => {
          const li = $(el);
          const onclick = li.attr('onclick') || '';
          const hosterUrl = (/\('([^']+)'\)/.exec(onclick) || [])[1];
          const parentClass = li.parent().attr('class') || '';
          const subLang = (/OD_([^\s]+)/.exec(parentClass) || [])[1] || lang;
          return hosterUrl ? { url: hosterUrl, lang: subLang } : null;
        })
        .get()
        .filter(Boolean);
      const nested = await Promise.all(items.map((item) => this.extractSingle(item.url, item.lang).catch(() => null)));
      return nested.filter(Boolean);
    }
    const single = await this.extractSingle(cleanUrl, lang).catch(() => null);
    return single ? [single] : [];
  }

  async extractSingle(url, lang) {
    const cleanUrl = url.replace(/^http:/, 'https:');
    const host = (/^https?:\/\/([^/]+)/.exec(cleanUrl) || [])[1] || '';
    const lower = `${host} ${lang}`.toLowerCase();
    const origin = `https://${host}/`;
    const isVidHide = /ahvsh|streamhide|guccihide|streamvid|vidhide|kinoger|smoothpre|dhtpre|peytonepre|earnvids|ryderjet|morencius|minochinos/.test(lower);
    const isStreamWish = /wishembed|streamwish|strwish|wish|kswplayer|swhoi|multimovies|uqloads|neko-stream|swdyu|iplayerhls|streamgg/.test(lower);
    const isFilemoon = /filemoon|moonplayer|moviesm4u|files\.im/.test(lower);
    let html = await this.get(cleanUrl, { Referer: `${SITE}/` });
    if (isVidHide || isStreamWish) {
      const code = unpack(html) || html;
      const hls = /"hls4"\s*:\s*"([^"]+)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code) || /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code);
      const stream = hls[1].replace(/\\\//g, '/');
      return { url: stream.startsWith('/') ? `https://${host}${stream}` : stream, server: isVidHide ? 'VidHide' : 'StreamWish', lang, headers: { Referer: origin } };
    }
    if (isFilemoon) {
      const code = unpack(html) || html;
      const hls = /file:\s*"(https?:[^"]+\.m3u8[^"]*)"/.exec(code) || /"hls2"\s*:\s*"(https?:[^"]+)"/.exec(code);
      return { url: hls[1].replace(/\\\//g, '/'), server: 'Filemoon', lang, headers: { Referer: origin } };
    }
    if (/voe\.sx/.test(lower)) {
      const redirect = /window\.location\.href\s*=\s*'([^']+)'/.exec(html);
      if (redirect) html = await this.get(redirect[1], { Referer: origin });
      const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return { url: voeSource(JSON.parse(json[1])[0]), server: 'VOE', lang, headers: { Referer: origin } };
    }
    if (/mixdrop|mxdrop/.test(lower)) {
      const wurl = /MDCore\.wurl\s*=\s*"([^"]+)"/.exec(unpack(html));
      return { url: wurl[1].replace(/^\/\//, 'https://'), server: 'MixDrop', lang, headers: { Referer: origin } };
    }
    if (/uqload/.test(lower)) {
      const code = unpack(html) || html;
      const src = /sources\s*:\s*\[\s*(?:\{\s*file\s*:\s*)?"(https?:[^"]+\.(?:m3u8|mp4)[^"]*)"/.exec(code);
      return { url: src[1], server: 'Uqload', lang, headers: { Referer: origin } };
    }
    if (/wolfstream/.test(lower)) {
      const file = /\{file\s*:\s*"(https?:[^"]+)"/.exec(html);
      return { url: file[1], server: 'WolfStream', lang, headers: { Referer: origin } };
    }
    if (/mp4upload/.test(lower)) {
      const src = /src:\s*"([^"]+\.mp4)"/.exec(html);
      return { url: src[1], server: 'Mp4Upload', lang, headers: { Referer: origin } };
    }
    if (/streamtape|stp|stape|shavetape/.test(lower)) {
      const part = /document\.getElementById\('(?:norobot|robot)link'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('([^']+)'\)\.substring\((\d+)\)/.exec(html);
      return { url: `https:${part[1]}${part[2].substring(+part[3])}`, server: 'StreamTape', lang, headers: { Referer: origin } };
    }
    if (/dood|ds2play|ds2video|d000/.test(lower)) {
      const pass = /\/pass_md5\/([^']+)'/.exec(html);
      const token = pass[1].split('/').pop();
      const base = await this.get(`${origin}pass_md5/${pass[1]}`, { Referer: origin });
      return { url: `${base}1234567890?token=${token}&expiry=${Date.now()}`, server: 'DoodStream', lang, headers: { Referer: origin } };
    }
    return null;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async get(url, headers = {}) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html', Referer: `${SITE}/`, ...BROWSER, ...headers } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeOnline.Ninja: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
