const SITE = 'https://hydrahd.gd';
const VIX = 'https://vixsrc.to';
const SPARK = 'https://vidspark.to';
const SPARK_KEY = '3a67e8866ae1d2bb9e81fe7f73315a56eb3bdf5e3e755c7554c8be6910aa6b13';
const SUBTITLE_CODES = {
  eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', dan: 'da', fin: 'fi', nor: 'no', swe: 'sv',
  dut: 'nl', nld: 'nl', pol: 'pl', rus: 'ru', tur: 'tr', ara: 'ar', heb: 'he', hin: 'hi', ind: 'id', jpn: 'ja', kor: 'ko', chi: 'zh',
  zho: 'zh', tha: 'th', vie: 'vi', gre: 'el', ell: 'el', hun: 'hu', cze: 'cs', ces: 'cs', rum: 'ro', ron: 'ro', ukr: 'uk', bul: 'bg',
};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', kind: 'movie', path: '/movies/popular' },
  { id: 'movies-rated', name: 'Movies: Top rated', kind: 'movie', path: '/movies/star-rating' },
  { id: 'series-popular', name: 'Series: Popular', kind: 'tv', path: '/tv-shows/popular' },
  { id: 'series-rated', name: 'Series: Top rated', kind: 'tv', path: '/tv-shows/star-rating' },
  { id: 'movies-new', name: 'Movies: Just added', kind: 'movie', path: '/movies/date' },
  { id: 'series-new', name: 'Series: Just added', kind: 'tv', path: '/tv-shows/date' },
  { id: 'movies-year', name: 'Movies: By year', kind: 'movie', path: '/movies/year' },
];

const MOVIE_GENRES = [
  'action', 'adventure', 'animation', 'biography', 'comedy', 'crime', 'documentary', 'drama', 'family', 'fantasy', 'history',
  'horror', 'music', 'musical', 'mystery', 'romance', 'sci-fi', 'sport', 'thriller', 'war', 'western',
];
const SERIES_ONLY_TAGS = ['game-show', 'news', 'reality-tv', 'talk-show'];
const TAGS = MOVIE_GENRES.concat(SERIES_ONLY_TAGS).sort();

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:') || raw.indexOf('placeholder') !== -1) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  return SITE + (raw.startsWith('/') ? '' : '/') + raw;
}

function idOfHref(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return /^(movie|watchseries)\/[^/]+$/.test(path) ? path.replace(/\//g, '~') : '';
}

function pathOfId(mangaId) {
  const id = String(mangaId || '');
  if (!/^(movie|watchseries)~[^~/]+$/.test(id)) throw new Error('HydraHD: unknown title id ' + id);
  return id.replace(/~/g, '/');
}

function genreLabel(tag) {
  return tag
    .split('-')
    .map((w) => (w === 'tv' ? 'TV' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace('Sci Fi', 'Sci-Fi');
}

function ageRatingOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A' || c === '-') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|18PLUS|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|7|10)$/.test(c)) return 0;
  return 16;
}

function fieldOf($, label) {
  const bold = $('.diz-title b').filter((_, b) => cleanText($(b).text()).toLowerCase().indexOf(label) === 0).first();
  return bold.length ? cleanText(bold.next('span').text()) : '';
}

function statusOfShow(text) {
  const t = String(text || '').toLowerCase();
  if (/returning|in production|planned|pilot/.test(t)) return 'ONGOING';
  if (/ended|cancel/.test(t)) return 'COMPLETED';
  return 'UNKNOWN';
}

function parseGrid($) {
  const results = [];
  const seen = new Set();
  $('figure.figured').each((_, el) => {
    const fig = $(el);
    const link = fig.find('a.hthis').first();
    const mangaId = idOfHref(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const image = fig.find('img').first();
    const title = cleanText(fig.find('.title').first().text()) || cleanText(image.attr('alt'));
    if (!title) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image: absolute(image.attr('data-src') || image.attr('src')),
      webURL: `${SITE}/${pathOfId(mangaId)}`,
      medium: 'anime',
    });
  });
  return results;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return TAGS.map((tag) => ({ id: tag, label: genreLabel(tag) }));
  }

  async ageOfMovie(mangaId) {
    if (this.ages.has(mangaId)) return this.ages.get(mangaId);
    let age;
    try {
      const html = await this.text(`${SITE}/${pathOfId(mangaId)}`);
      age = ageRatingOfCertificate(fieldOf(cheerio.load(html), 'certificate'));
      this.ages.set(mangaId, age);
    } catch (e) {
      console.error('HydraHD certificate lookup failed for ' + mangaId + ': ' + (e && e.message));
    }
    return age;
  }

  async rate(results) {
    await Promise.all(
      results.map(async (r) => {
        if (r.mangaId.indexOf('movie~') === 0) r.ageRating = await this.ageOfMovie(r.mangaId);
        else if (this.ages.has(r.mangaId)) r.ageRating = this.ages.get(r.mangaId);
      })
    );
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title).replace(/['’]/g, '');
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    let url;
    if (query) {
      url = page === 1
        ? `${SITE}/index.php?menu=search&query=${encodeURIComponent(query)}`
        : `${SITE}/search/${encodeURIComponent(query).replace(/%20/g, '+')}/${page}`;
    } else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      const tag = included.length ? String(included[0].id || included[0]) : '';
      let base = feed.path;
      let first = '/';
      if (tag) {
        first = '';
        if (TAGS.indexOf(tag) === -1) return { results: [] };
        if (feed.kind === 'movie') {
          if (SERIES_ONLY_TAGS.indexOf(tag) !== -1) return { results: [] };
          base = `/genres/watch-${tag}-movies-online-free`;
        } else base = `/tv-tags/${tag}`;
      }
      url = SITE + base + (page > 1 ? '/' + page : first);
    }
    const $ = cheerio.load(await this.text(url));
    const results = await this.rate(parseGrid($));
    const hasNext = results.length > 0 && $('.pagination a').filter((_, a) => /next/i.test($(a).text())).length > 0;
    return hasNext ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const path = pathOfId(mangaId);
    const isMovie = path.indexOf('movie/') === 0;
    const $ = cheerio.load(await this.text(`${SITE}/${path}`));
    const title = cleanText($('.ploting h1').first().text());
    if (!title) throw new Error('HydraHD: title page not found');
    const tags = [];
    $('.diz-title a[href*="/genres/"], .diz-title a[href*="/tv-tags/"]').each((_, a) => {
      const t = cleanText($(a).text());
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    const directors = [];
    $('.swiper-slide-featured').each((_, slide) => {
      const role = cleanText($(slide).find('.slidedetails').first().text()).toLowerCase();
      const name = cleanText($(slide).find('.title').first().text());
      if (name && /director|creator/.test(role) && directors.indexOf(name) === -1) directors.push(name);
    });
    const poster = $('meta[property="og:image"]').attr('content') || '';
    const info = {
      title,
      image: absolute(poster.replace('/t/p/w342/', '/t/p/w500/')),
      desc: cleanText($('.ploting p').first().text()),
      status: isMovie ? 'COMPLETED' : statusOfShow(fieldOf($, 'show status')),
      tags,
      webURL: `${SITE}/${path}`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    if (directors.length) info.author = directors.join(', ');
    const year = /\d{4}/.exec(fieldOf($, 'year'));
    if (year) info.releaseDate = year[0];
    const age = ageRatingOfCertificate(fieldOf($, 'certificate'));
    if (age !== undefined) {
      info.ageRating = age;
      this.ages.set(mangaId, age);
    }
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const path = pathOfId(mangaId);
    if (path.indexOf('movie/') === 0) return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const $ = cheerio.load(await this.text(`${SITE}/${path}`));
    const rows = [];
    const seen = new Set();
    $('a.dynamic-ep-link').each((_, a) => {
      const node = $(a);
      const season = parseInt(node.attr('data-season'), 10);
      const episode = parseFloat(node.attr('data-episode'));
      if (!Number.isFinite(season) || !Number.isFinite(episode)) return;
      const id = `s${season}e${episode}`;
      if (seen.has(id)) return;
      seen.add(id);
      const label = cleanText(node.find('.tv_episode_name').first().text());
      const m = /^(\d{4})-(\d{2})-(\d{2})\s*-?\s*(.*)$/.exec(label);
      const name = m ? m[4] : label;
      const row = { id, chapterId: id, name: name ? `Episode ${episode}: ${name}` : `Episode ${episode}`, number: episode, season, episode };
      if (m) {
        const time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
        if (Number.isFinite(time)) row.time = time;
      }
      rows.push(row);
    });
    if (!rows.length) throw new Error('HydraHD has no episodes for this series yet');
    rows.sort((x, y) => y.season - x.season || y.episode - x.episode);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) out.time = r.time;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const path = pathOfId(mangaId);
    let pageUrl;
    let listUrl;
    if (path.indexOf('movie/') === 0) {
      pageUrl = `${SITE}/${path}`;
      const m = /\/ajax\/mov_0\.php',\s*\{\s*"i":\s*"([^"]*)",\s*"t":\s*"([^"]*)"/.exec(await this.text(pageUrl));
      if (!m) throw new Error('HydraHD: the movie page names no player');
      listUrl = `${SITE}/ajax/mov_0.php?i=${encodeURIComponent(m[1])}&t=${encodeURIComponent(m[2])}`;
    } else {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('HydraHD: unknown episode id ' + chapterId);
      pageUrl = `${SITE}/${path}/season/${ep[1]}/episode/${ep[2]}`;
      const m = /"i":\s*"([^"]*)",\s*"t":\s*"([^"]*)",\s*"s":\s*"([^"]*)",\s*"e":\s*"([^"]*)"/.exec(await this.text(pageUrl));
      if (!m) throw new Error('HydraHD: the episode page names no player');
      listUrl = `${SITE}/ajax/tv_0.php?i=${encodeURIComponent(m[1])}&t=${encodeURIComponent(m[2])}&s=${encodeURIComponent(m[3])}&e=${encodeURIComponent(m[4])}`;
    }
    const $ = cheerio.load(await this.text(listUrl, { Referer: pageUrl }));
    const links = [];
    $('.iframe-server-button').each((_, el) => {
      const link = String($(el).attr('data-link') || '').trim();
      if (link) links.push(link);
    });
    if (!links.length) throw new Error('HydraHD lists no server for this title yet');

    const tasks = [];
    const done = new Set();
    for (const link of links) {
      const vix = /^https?:\/\/vixsrc\.to\/(movie\/\d+|tv\/\d+\/\d+\/\d+)/.exec(link);
      const spark = /^https?:\/\/(?:www\.)?moviesapi\.to\/(?:movie\/(\d+)|tv\/(\d+)-(\d+)-(\d+))/.exec(link);
      let key;
      let run;
      if (vix) {
        key = 'vix:' + vix[1];
        run = () => this.vixSrc(vix[1]);
      } else if (spark) {
        const path = spark[1] ? `movie/${spark[1]}` : `tv/${spark[2]}/${spark[3]}/${spark[4]}`;
        key = 'spark:' + path;
        run = () => this.vidSpark(path);
      } else continue;
      if (done.has(key)) continue;
      done.add(key);
      tasks.push(run().then((video) => ({ video }), (error) => ({ error })));
    }
    const answers = await Promise.all(tasks);
    const videos = answers.filter((a) => a.video).map((a) => a.video);
    if (!videos.length) {
      const challenged = answers.find((a) => a.error && a.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      const problems = answers.map((a) => (a.error && a.error.message ? a.error.message : String(a.error)));
      throw new Error(problems.length ? `HydraHD: ${problems.join('; ')}` : 'HydraHD lists no server this app can play for this title (it reads only the VixSrc and VidSpark servers)');
    }
    return videos;
  }

  async vixSrc(path) {
    const api = await this.send({ url: `${VIX}/api/${path}`, method: 'GET', headers: { Accept: 'application/json', Referer: `${VIX}/${path}` } });
    if (api.status === 404) throw new Error('VixSrc has no stream for this title yet');
    if (api.status < 200 || api.status >= 300) throw new Error(`VixSrc: HTTP ${api.status}`);
    let src = '';
    try {
      src = JSON.parse(api.data).src;
    } catch (e) {
      src = '';
    }
    if (!src) throw new Error('VixSrc gave no embed page for this title');
    const embed = await this.text(`${VIX}${src}`, { Referer: `${VIX}/${path}` }, true);
    const token = (/'token':\s*'([^']+)'/.exec(embed) || [])[1];
    const expires = (/'expires':\s*'([^']+)'/.exec(embed) || [])[1];
    const base = (/\burl:\s*'(https:\/\/vixsrc\.to\/playlist\/\d+)'/.exec(embed) || [])[1];
    if (!token || !expires || !base) throw new Error('VixSrc: the embed page holds no playlist');
    const fhd = /canPlayFHD\s*=\s*true/.test(embed);
    const master = `${base}?token=${token}&expires=${expires}${fhd ? '&h=1' : ''}&lang=en`;
    const text = await this.text(master, undefined, true);
    return { url: master, quality: 'VixSrc, ' + describeMaster(text), type: 'hls', server: 'VixSrc' };
  }

  async vidSpark(path) {
    const api = await this.send({
        url: `${SPARK}/api/vidora/v1/${path}`,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'x-player-key': SPARK_KEY, Referer: `${SPARK}/${path}` },
      });
    let data = null;
    try {
      data = JSON.parse(api.data);
    } catch (e) {
      data = null;
    }
    if (api.status === 404) throw new Error('VidSpark: ' + ((data && data.message) || 'no stream for this title yet'));
    if (api.status >= 500) throw new Error(`VidSpark is not answering for this title (HTTP ${api.status})`);
    if (api.status < 200 || api.status >= 300 || !data) throw new Error(`VidSpark: HTTP ${api.status}`);
    const source = data.sources && data.sources[0];
    if (!data.result || !source || !source.url) throw new Error('VidSpark gave no stream for this title');
    const subtitles = [];
    (source.tracks || []).forEach((track) => {
      if (!track || !track.file) return;
      const code = (/_([a-z]{3})(?:_[a-z]+)?\.vtt/i.exec(track.file) || [])[1];
      subtitles.push({ url: track.file, label: cleanText(track.label) || 'Subtitles', language: SUBTITLE_CODES[String(code || '').toLowerCase()] || String(code || '').toLowerCase() });
    });
    const english = subtitles.some((t) => t.language === 'en');
    const parts = ['VidSpark', 'Auto'];
    if (subtitles.length) parts.push(subtitles.length <= 3 ? 'Softsub: ' + subtitles.map((t) => t.label).join(', ') : english ? `Softsub: English and ${subtitles.length - 1} more` : `Softsub: ${subtitles.length} languages`);
    const video = { url: source.url, quality: parts.join(', '), type: 'hls', server: 'VidSpark', headers: { Referer: `${SPARK}/` } };
    if (subtitles.length) video.subtitles = subtitles;
    return video;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && e.kind === 'challenge') throw e;
        last = e;
      }
    }
    throw last;
  }

  async text(url, extraHeaders, deviceAgent) {
    const headers = Object.assign({ Accept: 'text/html,application/xhtml+xml,application/vnd.apple.mpegurl,*/*' }, extraHeaders || {});
    if (!deviceAgent) headers['User-Agent'] = UA;
    const response = await this.send({
        url,
        method: 'GET',
        headers,
      });
    if (response.status === 404) throw new Error('HydraHD: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`HydraHD: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

function describeMaster(text) {
  const heights = [];
  const subs = [];
  let audio = '';
  String(text || '')
    .split('\n')
    .forEach((line) => {
      const h = /RESOLUTION=\d+x(\d+)/.exec(line);
      if (h) heights.push(parseInt(h[1], 10));
      if (line.indexOf('TYPE=AUDIO') !== -1 && /DEFAULT=YES/.test(line)) audio = (/NAME="([^"]+)"/.exec(line) || [])[1] || audio;
      if (line.indexOf('TYPE=SUBTITLES') !== -1) {
        const name = (/NAME="([^"]+)"/.exec(line) || [])[1];
        if (name && !/forced/i.test(name) && subs.indexOf(name) === -1) subs.push(name);
      }
    });
  const top = heights.length ? Math.max.apply(null, heights) : 0;
  const parts = [top ? `Auto up to ${top}p` : 'Auto'];
  if (audio) parts.push(`${audio} audio`);
  if (subs.length) {
    const names = subs.map((s) => s.replace(/\s*\[CC\]/i, ''));
    const english = names.indexOf('English') !== -1;
    if (names.length <= 3) parts.push('Softsub: ' + names.join(', '));
    else parts.push(english ? `Softsub: English and ${names.length - 1} more` : `Softsub: ${names.length} languages`);
  }
  return parts.join(', ');
}

module.exports = { Source };
