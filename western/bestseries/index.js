const SITES = ['https://topsrs.day', 'https://srstop.link', 'https://bstsrs.in'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const SEARCH_LIMIT = 60;

const FEEDS = [
  { id: 'new', name: 'New episodes' },
  { id: 'newest', name: 'Newest shows', sort: 'date' },
];

const GENRES = [
  ['9', 'Action'], ['15', 'Adventure'], ['5', 'Animation'], ['44', 'Anime'], ['47', 'Children'], ['8', 'Comedy'], ['16', 'Crime'],
  ['41', 'Current Events'], ['37', 'Discovery/Science'], ['21', 'Documentary'], ['3', 'Drama'], ['20', 'Family'], ['12', 'Fantasy'],
  ['46', 'Food'], ['28', 'Game-Show'], ['22', 'History'], ['1', 'Horror'], ['36', 'Lifestyle'], ['26', 'Music'], ['23', 'Musical'],
  ['10', 'Mystery'], ['29', 'News'], ['4', 'Reality'], ['6', 'Romance'], ['38', 'Romance/Dating'], ['14', 'Sci-Fi'], ['19', 'Sport'],
  ['43', 'Talent'], ['27', 'Talk-Show'], ['11', 'Thriller'], ['13', 'War'], ['17', 'Western'],
];

const EXPLICIT_RE = /\b(hentai|porno?|pornography|pornstars?|xxx|erotic|erotica|sex tape|nudist|nudists|naked attraction|naked news|playboy|uncensored|adult film|strip(?:per|pers|club)?)\b/i;
const SUGGESTIVE_RE = /\b(naked|nude|nudity|sex|sexy|sexual|sexuality|lust|seduc\w*|ecchi|harem|temptation|swingers?|hookup|too hot|virgin|fetish|kinky|escort)\b/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function ratingOf(title, tags, text) {
  const t = String(title || '');
  if (EXPLICIT_RE.test(t)) return 18;
  if (SUGGESTIVE_RE.test(t)) return 16;
  const genres = (tags || []).map((g) => String(g).toLowerCase());
  const body = String(text || '');
  if (/\b(hentai|sexually explicit|pornograph\w*|erotic)\b/i.test(body)) return 18;
  if (genres.indexOf('horror') !== -1) return 16;
  if (/\b(sex|sexual|nudity|naked|nude)\b/i.test(body)) return 16;
  return 0;
}

function slugOfHref(href) {
  const m = /\/show\/([^/?#]+)\/?(?:[?#].*)?$/.exec(String(href || '').replace(/^https?:\/\/[^/]+/i, ''));
  return m ? m[1] : '';
}

function pageNumber(text) {
  const n = parseInt(String(text || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function decodeLink(token) {
  const codes = String(token || '').split('-').map((x) => parseInt(x, 16));
  if (!codes.length || codes.some((c) => !Number.isFinite(c))) return '';
  const offset = codes[0] - 104;
  let out = '';
  for (const c of codes) {
    const code = c - offset;
    if (code < 32 || code > 0x10ffff) return '';
    out += String.fromCharCode(code);
  }
  return /^https?:\/\/[^\s]+$/.test(out) ? out : '';
}

function unpack(source) {
  const match = /\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/.exec(source);
  if (!match) return '';
  const radix = +match[2];
  const words = match[4].split('|');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const decode = (word) => word.split('').reduce((n, ch) => n * radix + digits.indexOf(ch), 0);
  return match[1].replace(/\\'/g, "'").replace(/\b\w+\b/g, (word) => words[decode(word)] || word);
}

function describeMaster(text) {
  const heights = [];
  let audio = '';
  String(text || '')
    .split('\n')
    .forEach((line) => {
      const h = /RESOLUTION=\d+x(\d+)/.exec(line);
      if (h) heights.push(parseInt(h[1], 10));
      if (line.indexOf('TYPE=AUDIO') !== -1 && /DEFAULT=YES/.test(line)) audio = (/NAME="([^"]+)"/.exec(line) || [])[1] || audio;
    });
  const top = heights.length ? Math.max.apply(null, heights) : 0;
  const parts = [top ? `Auto up to ${top}p` : 'Auto'];
  if (audio) parts.push(`${audio} audio`);
  return parts.join(', ');
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.base = SITES[0];
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async send(request) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.requests.schedule(App.createRequest(request));
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last;
  }

  async site(path, options) {
    const o = options || {};
    const order = [this.base].concat(SITES.filter((s) => s !== this.base));
    let last = null;
    for (const base of order) {
      let response;
      try {
        const headers = Object.assign({ 'User-Agent': UA, Accept: o.accept || 'text/html,application/xhtml+xml,*/*' }, o.headers || {});
        if (o.method === 'POST') Object.assign(headers, { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: base, Referer: `${base}/` });
        response = await this.send({ url: base + path, method: o.method || 'GET', headers, body: o.body });
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
        continue;
      }
      const status = response.status;
      const text = String(response.data || '');
      if (status >= 500 || status === 429 || status === 451 || status === 403) {
        last = new Error(`Best Series (${base}): HTTP ${status}`);
        continue;
      }
      if (status >= 200 && status < 300 && !(o.valid || ((t) => /tvstream|home-box|"permalink"|No shows found/.test(t)))(text)) {
        last = new Error(`Best Series (${base}) did not answer like the site`);
        continue;
      }
      this.base = base;
      return { status, text, base };
    }
    throw last || new Error('Best Series: no mirror answered');
  }

  async page(path, options) {
    const r = await this.site(path, options);
    if (r.status === 404) throw new Error('Best Series: not found (HTTP 404)');
    if (r.status < 200 || r.status >= 300) throw new Error(`Best Series: HTTP ${r.status}`);
    return r;
  }

  async get(url, headers) {
    const response = await this.send({ url, method: 'GET', headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/vnd.apple.mpegurl,*/*' }, headers || {}) });
    return { status: response.status, text: String(response.data || '') };
  }

  cover(raw, base) {
    const m = /[?&]src=([^&'")]+)/.exec(String(raw || '').replace(/&amp;/g, '&'));
    if (!m) return '';
    let src = m[1];
    try {
      src = decodeURIComponent(src);
    } catch (e) {
      src = m[1];
    }
    src = src.replace(/^https?:\/\/[^/]+/i, '');
    if (src.indexOf('/thumbs/') !== 0) return '';
    return `${base}/templates/tvstream/timthumb.php?src=${src}&w=300&h=450&zc=1`;
  }

  result(slug, title, image, base) {
    const out = { mangaId: slug, title, webURL: `${base}/show/${slug}`, medium: 'anime', ageRating: ratingOf(title) };
    if (image) {
      out.image = image;
      out.referer = `${base}/`;
    }
    return out;
  }

  parseCards($, base) {
    const results = [];
    const seen = new Set();
    $('.home-box').each((_, el) => {
      const box = $(el);
      const link = box.find('a.img_poster[href*="/show/"], a.browse_now[href*="/show/"]').first();
      const slug = slugOfHref(link.attr('href'));
      if (!slug || seen.has(slug)) return;
      const title = cleanText(box.find('.title.tags').first().text()) || cleanText(link.attr('title')).replace(/^Browse\s+/i, '').replace(/\s+episodes$/i, '');
      if (!title) return;
      seen.add(slug);
      results.push(this.result(slug, title, this.cover(link.attr('style'), base), base));
    });
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    if (query) {
      if (page > 1) return { results: [] };
      const r = await this.page('/ajax/search.php', {
        method: 'POST',
        accept: 'application/json',
        body: `q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`,
        valid: (t) => /^\s*\[/.test(t),
      });
      let list = [];
      try {
        list = JSON.parse(r.text);
      } catch (e) {
        throw new Error('Best Series: the search answer was not JSON');
      }
      const results = [];
      const seen = new Set();
      (Array.isArray(list) ? list : []).forEach((row) => {
        const slug = slugOfHref(row && row.permalink);
        const title = cleanText(row && row.title);
        if (!slug || !title || seen.has(slug)) return;
        seen.add(slug);
        results.push(this.result(slug, title, this.cover(row.image, r.base), r.base));
      });
      return { results };
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';
    if (tag && !GENRES.some((g) => g[0] === tag)) return { results: [] };
    if (feed.id === 'new' && !tag) {
      let results = [];
      for (let attempt = 0; attempt < 3 && !results.length; attempt++) {
        const r = await this.page(`/new-shows/${page}${attempt ? `?r=${attempt}` : ''}`);
        results = this.parseCards(cheerio.load(r.text), r.base);
        if (page > 1) break;
      }
      return results.length ? { results, metadata: { page: page + 1 } } : { results };
    }
    const sort = feed.sort || 'date';
    let r;
    let $;
    let results = [];
    for (let attempt = 0; attempt < 3 && !results.length; attempt++) {
      r = await this.page('/browse-shows.php', {
        method: 'POST',
        body: `genres=${encodeURIComponent(JSON.stringify(tag ? [tag] : []))}&genreName=&years=${encodeURIComponent('[]')}&star=&sortby=${sort}&p=${page}&ajax=1`,
      });
      $ = cheerio.load(r.text);
      results = this.parseCards($, r.base);
      if (page > 1) break;
    }
    let last = 0;
    $('.navigation a[data-link]').each((_, a) => {
      last = Math.max(last, pageNumber(cleanText($(a).text())));
    });
    return results.length && (!last || page < last) ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const slug = String(mangaId || '');
    if (!/^[^/\s]+$/.test(slug)) throw new Error('Best Series: unknown show id ' + slug);
    const r = await this.page(`/show/${encodeURIComponent(decodeURIComponent(slug))}`);
    const $ = cheerio.load(r.text);
    const title = cleanText($('h1.channel-title').first().text()).replace(/\s+Episodes$/i, '');
    if (!title) throw new Error('Best Series: show page not found');
    const tags = [];
    $('.meta a[href*="/tv-tags/"]').each((_, a) => {
      const t = cleanText($(a).text());
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    const desc = cleanText($('.info1').first().text());
    const meta = cleanText($('.post_show_right .meta').first().text());
    const info = {
      title,
      desc,
      status: 'UNKNOWN',
      completed: false,
      tags,
      webURL: `${r.base}/show/${slug}`,
      medium: 'anime',
      ageRating: ratingOf(title, tags, desc),
    };
    const poster = this.cover($('.img_poster').first().attr('src'), r.base);
    if (poster) {
      info.image = poster;
      info.referer = `${r.base}/`;
    }
    const creators = [];
    $('.meta a[href*="director="]').each((_, a) => {
      const n = cleanText($(a).text());
      if (n && creators.indexOf(n) === -1) creators.push(n);
    });
    if (creators.length) info.author = creators.join(', ');
    const year = /Year started:\s*(\d{4})/.exec(meta);
    if (year) info.releaseDate = year[1];
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const slug = String(mangaId || '');
    const r = await this.page(`/show/${encodeURIComponent(decodeURIComponent(slug))}`);
    const $ = cheerio.load(r.text);
    const rows = [];
    const seen = new Set();
    $('#episodeContainer .home-box').each((_, el) => {
      const box = $(el);
      const link = box.find('a.episode[href*="/episode/"]').first();
      const href = String(link.attr('href') || '').replace(/^https?:\/\/[^/]+/i, '');
      const m = /^\/show\/([^/]+\/season\/(\d+)\/episode\/(\d+))\/?$/.exec(href);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const season = parseInt(m[2], 10);
      const episode = parseInt(m[3], 10);
      const title = cleanText(box.find('span.episode').first().text());
      const row = { id: m[1], season, episode, title };
      const thumb = String(box.find('a.hb-image').first().attr('data-original') || '').replace(/&amp;/g, '&');
      if (/^https?:\/\//.test(thumb)) row.thumbnail = thumb.replace(/^https?:\/\/[^/]+/i, r.base);
      rows.push(row);
    });
    if (!rows.length) throw new Error('Best Series lists no episodes for this show yet');
    rows.sort((a, b) => b.season - a.season || b.episode - a.episode);
    const many = new Set(rows.map((x) => x.season)).size > 1;
    return rows.map((x) => {
      const out = { id: x.id, chapterId: x.id, name: x.title && !/^episode\s+\d+$/i.test(x.title) ? `Episode ${x.episode}: ${x.title}` : `Episode ${x.episode}`, number: x.episode };
      if (x.title) out.title = x.title;
      if (x.thumbnail) out.thumbnail = x.thumbnail;
      if (many) {
        out.season = String(x.season);
        out.seasonName = x.season === 0 ? 'Specials' : `Season ${x.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const id = String(chapterId || '');
    if (!/^[^/\s]+\/season\/\d+\/episode\/\d+$/.test(id)) throw new Error('Best Series: unknown episode id ' + id);
    const parts = id.split('/');
    const r = await this.page(`/show/${encodeURIComponent(decodeURIComponent(parts[0]))}/${parts.slice(1).join('/')}`);
    const $ = cheerio.load(r.text);
    const rows = [];
    $('#listlink a.embed-selector').each((_, a) => {
      const node = $(a);
      const token = (/dbneg\('([^']+)'\)/.exec(String(node.attr('onclick') || '')) || [])[1];
      const url = decodeLink(token);
      if (!url) return;
      const dub = cleanText(node.find('.duben').first().text());
      const sub = cleanText(node.find('.subtitle').first().text());
      rows.push({ url, label: dub ? 'Dub' : sub ? 'Sub' : '' });
    });
    if (!rows.length) {
      const count = (/-\s*\((\d+)\s+Links?\)/i.exec($('#listlink h4').first().text()) || [])[1];
      if (count === '0' || !$('#listlink').length) throw new Error('Best Series has no stream for this episode (the site lists 0 links for it)');
      throw new Error('Best Series: this episode lists links but none could be read (the site may have changed its link format)');
    }
    const pick = (re, limit) => rows.filter((row) => re.test(hostOf(row.url))).slice(0, limit);
    const jobs = [];
    pick(/(^|\.)vidmoly\.(me|biz|net|org|to)$/, 2).forEach((row) => jobs.push(this.vidmoly(row)));
    pick(/(^|\.)(mixdrop\.\w+|mxdrop\.\w+)$/, 2).forEach((row) => jobs.push(this.mixdrop(row)));
    pick(/(^|\.)streamtape\.\w+$/, 1).forEach((row) => jobs.push(this.streamtape(row)));
    const answers = await Promise.all(jobs.map((job) => job.then((video) => ({ video }), (error) => ({ error }))));
    const videos = [];
    const seen = new Set();
    answers.forEach((a) => {
      if (a.video && !seen.has(a.video.url)) {
        seen.add(a.video.url);
        videos.push(a.video);
      }
    });
    if (!videos.length) {
      const challenged = answers.find((a) => a.error && (a.error.kind === 'challenge' || a.error.kind === 'blocked'));
      if (challenged) throw challenged.error;
      const hosts = Array.from(new Set(rows.map((row) => hostOf(row.url)))).slice(0, 6).join(', ');
      throw new Error(`Best Series has no stream this app can read for this episode (it lists ${hosts}; it reads Vidmoly, MixDrop and Streamtape, and older episodes mostly keep other or dead hosts)`);
    }
    return videos;
  }

  async vidmoly(row) {
    const code = (/\/(?:v\/|embed-|w\/)([a-z0-9]+)/i.exec(row.url) || [])[1];
    if (!code) throw new Error('Vidmoly: no video id in ' + row.url);
    let master = '';
    for (const host of ['vidmoly.biz', 'vidmoly.net', 'vidmoly.org']) {
      try {
        const page = await this.get(`https://${host}/embed-${code}.html`);
        master = (/sources:\s*\[\s*\{\s*file:\s*'([^']+)'/.exec(page.text) || [])[1] || '';
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      }
      if (master) break;
    }
    if (!master) throw new Error('Vidmoly: the video is gone');
    const list = await this.get(master);
    if (list.status !== 200 || list.text.indexOf('#EXTM3U') !== 0) throw new Error(`Vidmoly: the playlist answered HTTP ${list.status}`);
    return { url: master, quality: ['Vidmoly', describeMaster(list.text), row.label].filter(Boolean).join(', '), type: 'hls', server: 'Vidmoly' };
  }

  async mixdrop(row) {
    const code = (/\/(?:f|e)\/([a-z0-9]+)/i.exec(row.url) || [])[1];
    if (!code) throw new Error('MixDrop: no video id in ' + row.url);
    const page = await this.get(`https://mxdrop.click/e/${code}`);
    if (!/MDCore\.wurl\s*=\s*"[^"]+"/.test(unpack(page.text) || page.text)) throw new Error('MixDrop: the video is gone');
    return { type: 'embed', url: `https://mxdrop.click/e/${code}`, quality: ['MixDrop', row.label].filter(Boolean).join(', '), server: 'MixDrop' };
  }

  async streamtape(row) {
    const m = /^(https?:\/\/[^/]+)\/(?:v|e)\/([A-Za-z0-9_-]+)/.exec(row.url);
    if (!m) throw new Error('Streamtape: not a video page');
    const url = `${m[1]}/e/${m[2]}`;
    const page = await this.get(url);
    if (page.status !== 200 || !/getElementById\(['"]robotlink['"]\)/.test(page.text)) throw new Error('Streamtape: the video is gone');
    return { type: 'embed', url, quality: ['Streamtape', row.label].filter(Boolean).join(', '), server: 'Streamtape' };
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

function hostOf(url) {
  return ((/^https?:\/\/([^/:?#]+)/i.exec(String(url || '')) || [])[1] || '').toLowerCase().replace(/^www\./, '');
}

module.exports = { Source };
