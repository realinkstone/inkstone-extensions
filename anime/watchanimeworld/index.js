const SITE = 'https://watchanimeworld.one';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'series', name: 'Series', path: '/series/' },
  { id: 'movies', name: 'Movies', path: '/movies/' },
  { id: 'hindi', name: 'Hindi Dubbed', path: '/category/language/hindi/' },
  { id: 'tamil', name: 'Tamil Dubbed', path: '/category/language/tamil/' },
  { id: 'telugu', name: 'Telugu Dubbed', path: '/category/language/telugu/' },
  { id: 'english', name: 'English Dubbed', path: '/category/language/english/' },
  { id: 'ongoing', name: 'Ongoing', path: '/category/status/ongoing/' },
  { id: 'anime', name: 'Anime', path: '/category/anime/' },
  { id: 'cartoons', name: 'Cartoons', path: '/category/cartoon/' },
];

const GENRES = [
  ['action', 'Action'], ['fantasy', 'Fantasy'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['sci-fi', 'Sci-Fi'], ['drama', 'Drama'], ['shounen', 'Shounen'], ['romance', 'Romance'],
  ['family', 'Family'], ['kids', 'Kids'], ['school', 'School'], ['slice-of-life', 'Slice of Life'], ['supernatural', 'Supernatural'], ['isekai', 'Isekai'], ['mystery', 'Mystery'],
  ['reincarnation', 'Reincarnation'], ['super-power', 'Super Power'], ['historical', 'Historical'], ['psychological', 'Psychological'], ['sports', 'Sports'], ['horror-genre', 'Horror'],
  ['mecha', 'Mecha'], ['suspense', 'Suspense'], ['thriller', 'Thriller'], ['martial-arts', 'Martial Arts'], ['military', 'Military'], ['gore', 'Gore'], ['ecchi', 'Ecchi'],
  ['musical', 'Musical'], ['video-game', 'Video Game'], ['superhero', 'Superhero'], ['time-travel', 'Time Travel'], ['sitcom', 'Sitcom'], ['urban', 'Urban'], ['medical', 'Medical'],
  ['parody', 'Parody'],
];

const DUBS = { hindi: 'Hindi', tamil: 'Tamil', telugu: 'Telugu', english: 'English', kannada: 'Kannada', malayalam: 'Malayalam', bengali: 'Bengali', marathi: 'Marathi' };

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function imageUrl(src) {
  const s = clean(src);
  if (!s) return '';
  return s.indexOf('//') === 0 ? `https:${s}` : s;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseId(mangaId) {
  const m = /^(series|movies)~([a-z0-9][a-z0-9-]*)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Watch Anime World: unknown title id ' + mangaId);
  return { kind: m[1], slug: m[2] };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 4 } });
    this.pages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async send(url, options) {
    const o = options || {};
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(
          App.createRequest({ url, method: o.method || 'GET', headers: Object.assign({ 'User-Agent': UA, Accept: o.accept || 'text/html,application/xhtml+xml' }, o.headers || {}), body: o.body })
        );
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
        last = response;
      } catch (e) {
        if (attempt === 1) throw e;
      }
      await pause(700);
    }
    return last;
  }

  async text(url, options) {
    const response = await this.send(url, options);
    if (response.status === 404) throw new Error('Watch Anime World: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Watch Anime World: HTTP ${response.status}`);
    const body = String(response.data || '');
    if (/<title>\s*Just a moment/i.test(body)) throw new Error('Watch Anime World answered a Cloudflare check; open the site in the web view and try again');
    return body;
  }

  async page(url) {
    const hit = this.pages.get(url);
    if (hit && Date.now() - hit.at < 60000) return hit.html;
    const html = await this.text(url);
    this.pages.set(url, { at: Date.now(), html });
    if (this.pages.size > 24) this.pages.delete(this.pages.keys().next().value);
    return html;
  }

  async ongoing() {
    if (this.ongoingSet && Date.now() - this.ongoingAt < 600000) return this.ongoingSet;
    const set = new Set();
    try {
      for (let page = 1; page <= 8; page++) {
        const html = await this.text(`${SITE}/category/status/ongoing/${page > 1 ? `page/${page}/` : ''}`);
        for (const card of this.cards(cheerio.load(html))) set.add(card.mangaId);
        if (html.indexOf(`/page/${page + 1}/`) < 0) break;
      }
    } catch (e) {
      if (!set.size) return set;
    }
    this.ongoingSet = set;
    this.ongoingAt = Date.now();
    return set;
  }

  cards($) {
    const results = [];
    const seen = new Set();
    $('li[id^="post-"]').each((i, li) => {
      const node = $(li);
      const href = node.find('a.lnk-blk').first().attr('href') || '';
      const m = /\/(series|movies)\/([a-z0-9][a-z0-9-]*)\/?$/.exec(href);
      if (!m) return;
      const title = clean(node.find('.entry-title').first().text());
      const mangaId = `${m[1]}~${m[2]}`;
      if (!title || seen.has(mangaId)) return;
      seen.add(mangaId);
      const classes = (node.attr('class') || '').split(/\s+/);
      const dubs = classes.filter((c) => c.indexOf('category-') === 0 && DUBS[c.slice(9)]).map((c) => DUBS[c.slice(9)]);
      const card = { mangaId, title, image: imageUrl(node.find('img').first().attr('src') || node.find('img').first().attr('data-src')), medium: 'anime' };
      card.summary = [m[1] === 'movies' ? 'Movie' : 'Series'].concat(dubs.slice(0, 3)).join(', ');
      if (classes.indexOf('category-ecchi') >= 0) card.ageRating = 16;
      results.push(card);
    });
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    let url;
    if (query) url = page > 1 ? `${SITE}/page/${page}/?s=${encodeURIComponent(query)}` : `${SITE}/?s=${encodeURIComponent(query)}`;
    else if (tag) {
      if (!GENRES.some((g) => g[0] === tag)) return { results: [], metadata: undefined };
      url = `${SITE}/category/genre/${tag}/${page > 1 ? `page/${page}/` : ''}`;
    } else url = `${SITE}${feed.path}${page > 1 ? `page/${page}/` : ''}`;
    let html;
    try {
      html = await this.text(url);
    } catch (e) {
      if (/HTTP 404|not found/i.test(String(e.message))) return { results: [], metadata: undefined };
      throw e;
    }
    const results = this.cards(cheerio.load(html));
    return { results, metadata: results.length && html.indexOf(`/page/${page + 1}/`) >= 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { kind, slug } = parseId(mangaId);
    const html = await this.page(`${SITE}/${kind}/${slug}/`);
    const $ = cheerio.load(html);
    const title = clean($('h1.entry-title').first().text());
    if (!title) throw new Error('Watch Anime World: title not found');
    const poster = (/image\.tmdb\.org\/t\/p\/w185\/([^"'\s]+)/.exec(html) || [])[1];
    const genres = $('p.genres a').map((i, a) => clean($(a).text())).get().filter(Boolean);
    const languages = $('ul.cast-lst li')
      .filter((i, li) => /^Languages/i.test(clean($(li).find('span').first().text())))
      .find('a')
      .map((i, a) => clean($(a).text()))
      .get()
      .filter(Boolean);
    const info = {
      title,
      image: poster ? `https://image.tmdb.org/t/p/w500/${poster}` : '',
      desc: [clean($('.description').first().text()), languages.length ? `Audio: ${languages.join(', ')}` : ''].filter(Boolean).join('\n\n') || undefined,
      status: kind === 'movies' ? 'COMPLETED' : (await this.ongoing()).has(`series~${slug}`) ? 'ONGOING' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/${kind}/${slug}/`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    if (genres.some((g) => /^ecchi$/i.test(g))) info.ageRating = 16;
    return { mangaInfo: info };
  }

  episodesOf($, season) {
    const rows = [];
    $('li').each((i, li) => {
      const node = $(li);
      const href = node.find('a.lnk-blk').first().attr('href') || '';
      const m = /\/episode\/([a-z0-9][a-z0-9-]*)\/?$/.exec(href);
      if (!m) return;
      const num = /(\d+)x(\d+)/.exec(clean(node.find('.num-epi').first().text()));
      const s = num ? Number(num[1]) : season;
      const n = num ? Number(num[2]) : NaN;
      if (!Number.isFinite(n)) return;
      const row = { id: m[1], chapterId: m[1], name: `Episode ${n}`, number: n, season: s };
      const thumb = imageUrl(node.find('img').first().attr('src') || node.find('img').first().attr('data-src'));
      if (/^https?:\/\//.test(thumb)) row.thumbnail = thumb;
      rows.push(row);
    });
    return rows;
  }

  async getChapters(mangaId) {
    const { kind, slug } = parseId(mangaId);
    const html = await this.page(`${SITE}/${kind}/${slug}/`);
    if (kind === 'movies') {
      if (!this.firePlayer(html)) throw new Error('Watch Anime World has this movie only on players of other sites, which this extension does not open');
      return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    }
    const $ = cheerio.load(html);
    const shown = Number(clean($('.n_s').first().text())) || 1;
    const menu = $('.sel-temp a[data-season]')
      .map((i, a) => ({ season: Number($(a).attr('data-season')), post: $(a).attr('data-post') }))
      .get()
      .filter((s) => Number.isFinite(s.season));
    const rows = this.episodesOf($, shown);
    for (const s of menu) {
      if (s.season === shown && rows.length) continue;
      const body = await this.text(`${SITE}/wp-admin/admin-ajax.php?action=action_select_season&season=${s.season}&post=${encodeURIComponent(s.post)}`);
      rows.push(...this.episodesOf(cheerio.load(`<ul>${body}</ul>`), s.season));
    }
    const seen = new Set();
    const unique = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    if (!unique.length) throw new Error('Watch Anime World has no episodes for this series yet');
    unique.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(unique.map((r) => r.season)).size > 1;
    return unique.map((r) => {
      const out = { id: r.id, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.thumbnail) out.thumbnail = r.thumbnail;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  firePlayer(html) {
    const $ = cheerio.load(html);
    let found = null;
    $('iframe').each((i, f) => {
      if (found) return;
      const m = /^(https?:\/\/[^/]+)\/video\/([0-9a-f]{32})/.exec($(f).attr('data-src') || $(f).attr('src') || '');
      if (m) found = { origin: m[1], hash: m[2] };
    });
    return found;
  }

  async getVideos(mangaId, chapterId) {
    const { kind, slug } = parseId(mangaId);
    const pageUrl = kind === 'movies' ? `${SITE}/movies/${slug}/` : `${SITE}/episode/${encodeURIComponent(chapterId)}/`;
    let html;
    try {
      html = await this.page(pageUrl);
    } catch (e) {
      if (/HTTP 404|not found/i.test(String(e.message))) throw new Error('Watch Anime World has no such episode');
      throw e;
    }
    const player = this.firePlayer(html);
    if (!player) throw new Error('Watch Anime World has this title only on players of other sites, which this extension does not open');
    const answer = await this.text(`${player.origin}/player/index.php?data=${player.hash}&do=getVideo`, {
      method: 'POST',
      accept: '*/*',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: `${player.origin}/video/${player.hash}`, Origin: player.origin },
      body: `hash=${player.hash}&r=${encodeURIComponent(pageUrl)}`,
    });
    let data = null;
    try {
      data = JSON.parse(answer);
    } catch (e) {
      throw new Error('Watch Anime World: its player did not answer a stream (try again in a minute)');
    }
    const master = clean(data && (data.securedLink || (/\.m3u8/.test(String(data.videoSource || '')) ? data.videoSource : '')));
    if (!/^https?:\/\//.test(master)) throw new Error('Watch Anime World: its player gave no stream for this one');
    const headers = { Referer: `${player.origin}/`, 'User-Agent': UA };
    const text = await this.text(master, { accept: '*/*' });
    if (text.indexOf('#EXTM3U') !== 0) throw new Error('Watch Anime World: its stream is not ready yet (try again in a minute)');
    if (!(await this.playable(master, text, headers))) throw new Error('Watch Anime World: its stream host refused the first segment (HTTP 403 or no answer), so it cannot play right now');
    let top = 0;
    for (const h of text.match(/RESOLUTION=\d+x(\d+)/g) || []) top = Math.max(top, Number(h.split('x')[1]) || 0);
    const audio = [];
    for (const line of text.split('\n')) {
      if (line.indexOf('#EXT-X-MEDIA') !== 0 || !/TYPE=AUDIO/.test(line)) continue;
      const name = clean((/NAME="([^"]+)"/.exec(line) || [])[1]);
      if (name && audio.indexOf(name) < 0) audio.push(name);
    }
    const rank = (n) => (n === 'Hindi' ? 0 : n === 'Japanese' ? 9 : 5);
    audio.sort((a, b) => rank(a) - rank(b));
    return [
      {
        url: master,
        quality: `${top ? `Auto up to ${top}p` : 'Auto'}${audio.length ? `, Multi-Audio: ${audio.join(', ')}` : ''}`,
        type: 'hls',
        server: 'Multi-Audio',
        headers,
      },
    ];
  }

  async playable(master, text, headers) {
    const absolute = (ref, base) => {
      if (/^https?:\/\//i.test(ref)) return ref;
      const origin = (/^(https?:\/\/[^/]+)/i.exec(base) || [])[1] || '';
      if (ref.charAt(0) === '/') return origin + ref;
      return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + ref;
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const lines = text.split('\n').map((l) => l.trim());
        const at = lines.findIndex((l) => l.indexOf('#EXT-X-STREAM-INF') === 0);
        if (at < 0 || !lines[at + 1]) return false;
        const variant = absolute(lines[at + 1], master);
        const plain = await this.send(variant, { accept: '*/*', headers });
        if (plain.status < 200 || plain.status >= 300) return false;
        const seg = String(plain.data || '').split('\n').map((l) => l.trim()).find((l) => l && l.charAt(0) !== '#');
        if (!seg) return false;
        const got = await this.send(absolute(seg, variant), { accept: '*/*', headers: Object.assign({ Range: 'bytes=0-1023' }, headers) });
        return got.status >= 200 && got.status < 400;
      } catch (e) {
      }
    }
    return false;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
