const SITES = [
  'https://nepu.us',
  'https://nepu.cx',
  'https://nep.is',
  'https://nepu.jp',
  'https://nepu.mx',
  'https://nepustream.tv',
  'https://nepu.pw',
  'https://nepu.boo',
  'https://nepu.xyz',
  'https://nepu.sh',
  'https://nepu.beer',
  'https://nep.bet',
];

const FEEDS = [
  { id: 'movies-popular', name: 'Movies: Popular', path: '/movies', sorting: 'popular' },
  { id: 'shows-popular', name: 'Series: Popular', path: '/shows', sorting: 'popular' },
  { id: 'anime-popular', name: 'Anime: Popular', path: '/anime', sorting: 'popular' },
  { id: 'movies-newest', name: 'Movies: Newest', path: '/movies', sorting: 'newest' },
  { id: 'shows-newest', name: 'Series: Newest', path: '/shows', sorting: 'newest' },
  { id: 'anime-newest', name: 'Anime: Newest', path: '/anime', sorting: 'newest' },
  { id: 'movies-imdb', name: 'Movies: Top rated', path: '/movies', sorting: 'imdb' },
  { id: 'shows-imdb', name: 'Series: Top rated', path: '/shows', sorting: 'imdb' },
  { id: 'movies-4k', name: 'Movies: 4K', path: '/movies', sorting: 'newest', category: '31' },
];

const CATEGORIES = [
  ['1', 'Action'], ['21', 'Action & Adventure'], ['2', 'Adventure'], ['3', 'Animation'], ['4', 'Comedy'], ['5', 'Crime'], ['6', 'Documentary'],
  ['7', 'Drama'], ['8', 'Family'], ['9', 'Fantasy'], ['10', 'History'], ['11', 'Horror'], ['22', 'Kids'], ['12', 'Music'], ['30', 'Musical'],
  ['13', 'Mystery'], ['25', 'News'], ['24', 'Reality'], ['14', 'Romance'], ['20', 'Sci-Fi & Fantasy'], ['15', 'Science Fiction'], ['27', 'Soap'],
  ['26', 'Talk'], ['16', 'Thriller'], ['17', 'TV Movie'], ['18', 'War'], ['23', 'War & Politics'], ['19', 'Western'],
  ['35', 'Anime Sub (movies)'], ['33', 'Anime Sub (series)'], ['36', 'Anime Dub (movies)'], ['34', 'Anime Dub (series)'], ['37', 'Anime Dub (series 2)'],
  ['31', '4K'], ['32', '3D'],
];

const EXPLICIT_WORDS = /\b(porn\w*|hentai|erotic\w*|bdsm|fetish\w*|nudist\w*|orgy|orgies|incest\w*|milf|cuckold\w*|hotwife|lolita|sexually explicit|hardcore)\b/i;
const SUGGESTIVE_WORDS = /\b(sex|sexy|sexual\w*|seduc\w*|lust\w*|naked|nude|ecchi|kinky|swingers?|striptease|stripper|mistress|affair|escort|prostitut\w*)\b/i;

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function ageRatingOf(text) {
  const t = String(text || '');
  if (EXPLICIT_WORDS.test(t) || /\bXXX\b/.test(t)) return 18;
  if (SUGGESTIVE_WORDS.test(t)) return 16;
  return 0;
}

function idOfHref(href) {
  const path = String(href || '').replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  const m = /^(movie|show)\/([A-Za-z0-9%._~-]+)$/.exec(path);
  return m ? `${m[1]}~${m[2]}` : '';
}

function pathOfId(mangaId) {
  const id = String(mangaId || '');
  const i = id.indexOf('~');
  const kind = id.slice(0, i);
  const slug = id.slice(i + 1);
  if (i < 0 || (kind !== 'movie' && kind !== 'show') || !/^[A-Za-z0-9%._~-]+$/.test(slug)) throw new Error('NEPU: unknown title id ' + id);
  return `/${kind}/${slug}`;
}

function imageOf(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  return SITES[0] + (raw.startsWith('/') ? '' : '/') + raw;
}

function parseCards($) {
  const results = [];
  const seen = new Set();
  $('div.list-movie').each((_, el) => {
    const card = $(el);
    const mangaId = idOfHref(card.find('a.list-media').first().attr('href'));
    if (!mangaId || seen.has(mangaId)) return;
    const title = cleanText(card.find('.list-caption a').first().text());
    if (!title) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image: imageOf(card.find('.media-cover').first().attr('data-src')),
      webURL: SITES[0] + pathOfId(mangaId),
      medium: 'anime',
      ageRating: ageRatingOf(title),
    });
  });
  return results;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.start = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return CATEGORIES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const query = cleanText(request && request.title);
    const page = (metadata && metadata.page) || 1;
    if (query) {
      if (page > 1) return { results: [] };
      const data = await this.json(`/ajax/posts?q=${encodeURIComponent(query.replace(/\s+/g, '-'))}`);
      const results = [];
      const seen = new Set();
      ((data && data.data) || []).forEach((row) => {
        if (!row || (row.type !== 'Movie' && row.type !== 'Shows')) return;
        const mangaId = idOfHref(row.url);
        if (!mangaId || seen.has(mangaId)) return;
        seen.add(mangaId);
        const title = cleanText(row.name);
        if (!title) return;
        results.push({
          mangaId,
          title,
          image: imageOf(row.image),
          webURL: SITES[0] + pathOfId(mangaId),
          medium: 'anime',
          ageRating: ageRatingOf(title + ' ' + cleanText(row.second_name)),
        });
      });
      return { results };
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : feed.category || '';
    const filter = { sorting: feed.sorting };
    if (tag) {
      if (!CATEGORIES.some((c) => c[0] === tag)) return { results: [] };
      filter.category = tag;
    }
    const html = await this.html(`${feed.path}?filter=${encodeURIComponent(JSON.stringify(filter))}&page=${page}`);
    const $ = cheerio.load(html);
    const results = parseCards($);
    const hasNext = results.length > 0 && $('.pagination a').filter((_, a) => /next/i.test($(a).text())).length > 0;
    return hasNext ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const path = pathOfId(mangaId);
    const isMovie = path.indexOf('/movie/') === 0;
    const $ = cheerio.load(await this.html(path));
    const title = cleanText($('h1').first().text());
    if (!title) throw new Error('NEPU: title page not found');
    const rows = {};
    let last = '';
    $('.video-attr').each((_, el) => {
      const row = $(el);
      const label = cleanText(row.find('.attr').first().text()).replace(/:$/, '').toLowerCase();
      const text = cleanText(row.find('.text').first().text());
      const key = label || last;
      if (label) last = label;
      if (key && text && !rows[key]) rows[key] = text;
    });
    const tags = [];
    $('.video-attr a[href*="/category/"]').each((_, a) => {
      const t = cleanText($(a).text());
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    const cast = [];
    $('a[href*="/actor/"]').each((_, a) => {
      const name = cleanText($(a).text());
      if (name && !cast.some((c) => c.name === name)) cast.push({ name });
    });
    const desc = rows.overview || '';
    const year = /\d{4}/.exec(rows['release date'] || '');
    const endYear = /\d{4}/.exec(rows['end date'] || '');
    const poster = $('meta[property="og:image"]').attr('content') || '';
    const info = {
      title,
      image: imageOf(poster),
      desc,
      status: isMovie ? 'COMPLETED' : endYear && +endYear[0] < new Date().getFullYear() ? 'COMPLETED' : 'ONGOING',
      tags,
      webURL: SITES[0] + path,
      medium: 'anime',
      ageRating: Math.max(ageRatingOf(title), ageRatingOf(desc)),
    };
    info.completed = info.status === 'COMPLETED';
    if (year) info.releaseDate = year[0];
    if (cast.length) info.cast = cast.slice(0, 30);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const path = pathOfId(mangaId);
    if (path.indexOf('/movie/') === 0) return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const $ = cheerio.load(await this.html(path));
    const rows = [];
    const seen = new Set();
    $('.tab-pane a[href*="/episode/"]').each((_, a) => {
      const node = $(a);
      const m = /\/season\/(\d+)\/episode\/(\d+)/.exec(String(node.attr('href') || ''));
      if (!m) return;
      const season = parseInt(m[1], 10);
      const episode = parseInt(m[2], 10);
      const id = `s${season}e${episode}`;
      if (seen.has(id)) return;
      seen.add(id);
      const name = cleanText(node.find('.name').first().text());
      const generic = !name || /^episode\s+\d+$/i.test(name);
      rows.push({ id, season, episode, name: generic ? `Episode ${episode}` : `Episode ${episode}: ${name}` });
    });
    if (!rows.length) throw new Error('NEPU has no episodes for this series yet');
    rows.sort((x, y) => y.season - x.season || y.episode - x.episode);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.id, name: r.name, number: r.episode };
      if (many) {
        out.season = String(r.season);
        out.seasonName = r.season === 0 ? 'Specials' : `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const path = pathOfId(mangaId);
    let pagePath = path;
    if (path.indexOf('/show/') === 0) {
      const ep = /^s(\d+)e(\d+)$/.exec(String(chapterId || ''));
      if (!ep) throw new Error('NEPU: unknown episode id ' + chapterId);
      pagePath = `${path}/season/${ep[1]}/episode/${ep[2]}`;
    }
    const $ = cheerio.load(await this.html(pagePath));
    const sources = [];
    $('[data-embed]').each((_, el) => {
      const node = $(el);
      const id = String(node.attr('data-embed') || '').trim();
      if (!/^\d+$/.test(id) || sources.some((s) => s.id === id)) return;
      const label = cleanText(node.find('.source-selected').first().text()) || cleanText(node.text()).replace(/^Source:\s*/i, '');
      sources.push({ id, label: label || 'Full HD' });
    });
    if (!sources.length) throw new Error('NEPU has no stream for this title yet');

    const answers = await Promise.all(
      sources.slice(0, 4).map((s) => this.embed(pagePath, s).then((video) => ({ video }), (error) => ({ error })))
    );
    const videos = answers.filter((a) => a.video).map((a) => a.video);
    if (!videos.length) {
      const challenged = answers.find((a) => a.error && a.error.kind === 'challenge');
      if (challenged) throw challenged.error;
      const problems = answers.map((a) => (a.error && a.error.message ? a.error.message : String(a.error)));
      throw new Error(problems[0] || 'NEPU gave no stream for this title');
    }
    return videos;
  }

  async embed(pagePath, source) {
    const response = await this.site(
      '/ajax/embed',
      (base) => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: '*/*',
          Origin: base,
          Referer: base + pagePath,
        },
        body: `id=${encodeURIComponent(source.id)}`,
      })
    );
    if (response.status === 404) throw new Error('NEPU has no stream for this title yet');
    if (response.status < 200 || response.status >= 300) throw new Error(`NEPU: the player answered HTTP ${response.status}`);
    const m = /relayManifestUrl\s*=\s*("(?:[^"\\]|\\.)*")/.exec(String(response.data || ''));
    let rel = '';
    if (m) {
      try {
        rel = JSON.parse(m[1]);
      } catch (e) {
        rel = '';
      }
    }
    if (!rel || rel.indexOf('/ajax/hls') !== 0) throw new Error('NEPU: the player holds no stream for this title');
    return { url: response.base + rel, quality: source.label, type: 'hls', server: 'NEPU' };
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async site(path, makeRequest, expect) {
    let last = null;
    let waited = false;
    for (let i = 0; i < SITES.length; i++) {
      const base = SITES[(this.start + i) % SITES.length];
      const spec = typeof makeRequest === 'function' ? makeRequest(base) : makeRequest || {};
      const headers = Object.assign({ Accept: 'text/html,application/xhtml+xml,application/json,*/*' }, spec.headers || {});
      let response;
      try {
        response = await this.send({ url: base + path, method: spec.method || 'GET', headers, body: spec.body });
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
        continue;
      }
      const status = response.status;
      const body = String(response.data || '');
      if (status === 429 && !waited) {
        waited = true;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        i--;
        continue;
      }
      if (status === 451 || status >= 500 || status === 403) {
        last = new Error(`NEPU: ${base} answered HTTP ${status}`);
        continue;
      }
      if (expect === 'page' && !/nepu|list-movie|video-attr/i.test(body.slice(0, 200000))) {
        last = new Error(`NEPU: ${base} did not answer with the site`);
        continue;
      }
      this.start = (this.start + i) % SITES.length;
      return { status, data: body, base };
    }
    throw last || new Error('NEPU is not reachable');
  }

  async html(path) {
    const r = await this.site(path, undefined, 'page');
    if (r.status === 404) throw new Error('NEPU: not found (HTTP 404)');
    if (r.status < 200 || r.status >= 300) throw new Error(`NEPU: HTTP ${r.status}`);
    return r.data;
  }

  async json(path) {
    const r = await this.site(path, { headers: { Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' } });
    if (r.status < 200 || r.status >= 300) throw new Error(`NEPU: HTTP ${r.status}`);
    let text = r.data.trim();
    if (text.charAt(0) === '<') {
      const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(text);
      if (pre) text = pre[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('NEPU: the answer was not JSON');
    }
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
}

module.exports = { Source };
