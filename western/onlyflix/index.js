const SITE = 'https://onlyflix.to';
const PAGE_SIZE = 20;

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Accept-Language': 'en' };

const GENRES = [
  ['animation', 'Animation'], ['adventure', 'Adventure'], ['action', 'Action'], ['biography', 'Biography'], ['comedy', 'Comedy'],
  ['crime', 'Crime'], ['documentary', 'Documentary'], ['drama', 'Drama'], ['family', 'Family'], ['fantasy', 'Fantasy'],
  ['history', 'History'], ['horror', 'Horror'], ['kids', 'Kids'], ['music', 'Music'], ['musical', 'Musical'], ['mystery', 'Mystery'],
  ['reality', 'Reality'], ['romance', 'Romance'], ['sci-fi', 'Sci-Fi'], ['sport', 'Sport'], ['thriller', 'Thriller'], ['war', 'War'],
  ['western', 'Western'],
];

const FEEDS = [
  { id: 'movies', name: 'Movies', path: 'movies' },
  { id: 'series', name: 'TV Shows', path: 'series' },
  { id: 'top-movies', name: 'Top Rated Movies', path: 'best/movies' },
];

function clean(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

function idOfUrl(url) {
  const path = String(url || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
  const tv = /^series\/([^/]+)$/.exec(path);
  if (tv) return `tv~${tv[1]}`;
  return /^[^/]+$/.test(path) ? `movie~${path}` : '';
}

function pathOfId(id) {
  const m = /^(movie|tv)~(.+)$/.exec(String(id || ''));
  if (!m) throw new Error(`OnlyFlix: unknown title id ${id}`);
  return m[1] === 'tv' ? `series/${m[2]}` : m[2];
}

function absolute(url) {
  const text = String(url || '').trim();
  if (!text) return undefined;
  if (/^https?:\/\//i.test(text)) return text;
  return `${SITE}/${text.replace(/^\/+/, '')}`;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 6 } });
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = clean(request && request.title);
    const genre = request && Array.isArray(request.includedTags) && request.includedTags.length ? String(request.includedTags[0].id || request.includedTags[0]) : '';
    let url;
    if (query) url = page > 1 ? `${SITE}/page/${page}/?s=${encodeURIComponent(query)}` : `${SITE}/?s=${encodeURIComponent(query)}`;
    else if (genre) url = `${SITE}/genre/${encodeURIComponent(genre)}/${page > 1 ? `page/${page}/` : ''}`;
    else {
      const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
      url = `${SITE}/${feed.path}/${page > 1 ? `page/${page}/` : ''}`;
    }
    const html = await this.text(url);
    const $ = cheerio.load(html);
    const seen = new Set();
    const results = [];
    $('article.of-title-card-v2').each((_, el) => {
      const card = $(el);
      const mangaId = idOfUrl(card.attr('data-url') || card.find('a.of-title-card-v2__link').attr('href'));
      const title = clean(card.attr('data-title') || card.find('a.of-title-card-v2__link').attr('aria-label'));
      if (!mangaId || !title || seen.has(mangaId)) return;
      seen.add(mangaId);
      const genres = clean(card.attr('data-genres')).split(',').map(clean).filter(Boolean);
      results.push({
        mangaId,
        title,
        image: absolute(card.find('img.of-title-card-v2__poster').attr('src')),
        tags: genres,
        medium: 'anime',
      });
    });
    return { results, metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const path = pathOfId(mangaId);
    const html = await this.text(`${SITE}/${path}/`);
    const $ = cheerio.load(html);
    let info = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (info) return;
      try {
        const data = JSON.parse($(el).contents().text());
        const list = Array.isArray(data) ? data : [data];
        info = list.find((d) => d && (d['@type'] === 'Movie' || d['@type'] === 'TVSeries')) || null;
      } catch (e) {
      }
    });
    if (!info) throw new Error('OnlyFlix: the title page has no details');
    const decode = (text) => clean(cheerio.load(`<i>${text || ''}</i>`)('i').text());
    const genres = (Array.isArray(info.genre) ? info.genre : [info.genre]).map(decode).filter(Boolean);
    const rating = info.aggregateRating && Number(info.aggregateRating.ratingValue);
    const ended = info.endDate && Date.parse(info.endDate) < Date.now();
    const poster = clean($('meta[property="og:image"]').attr('content')) || (Array.isArray(info.image) ? info.image[0] : info.image);
    return {
      mangaInfo: {
        title: decode(info.name),
        image: absolute(poster),
        desc: decode(info.description),
        status: info['@type'] === 'Movie' ? 'COMPLETED' : ended ? 'COMPLETED' : 'ONGOING',
        tags: genres,
        rating: rating > 0 ? rating : undefined,
        webURL: `${SITE}/${path}/`,
        medium: 'anime',
      },
    };
  }

  async ajax(html, referer, action, extra) {
    const nonce = (/"playerNonce":"([a-z0-9]+)"/i.exec(html) || [])[1];
    const postId = (/"current":\{"postId":(\d+)/.exec(html) || [])[1];
    if (!postId || !nonce) throw new Error('OnlyFlix: the page has no player');
    const response = await this.requests.schedule(
      App.createRequest({
        url: `${SITE}/wp-admin/admin-ajax.php`,
        method: 'POST',
        headers: { ...BROWSER, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: referer },
        body: `action=${action}&nonce=${encodeURIComponent(nonce)}&${extra(postId)}`,
      })
    );
    if (response.status < 200 || response.status >= 300) throw new Error(`OnlyFlix: HTTP ${response.status} from the ${action} call`);
    try {
      return JSON.parse(String(response.data));
    } catch (e) {
      throw new Error('OnlyFlix: the page call answered no data');
    }
  }

  async getChapters(mangaId) {
    const path = pathOfId(mangaId);
    if (mangaId.indexOf('movie~') === 0) return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    const page = `${SITE}/${path}/`;
    const html = await this.text(page);
    const decode = (text) => clean(cheerio.load(`<i>${text || ''}</i>`)('i').text());
    const episodes = [];
    let json = null;
    try {
      json = await this.ajax(html, page, 'mcs_home_hero_tv_episodes', (postId) => `show_id=${encodeURIComponent(postId)}`);
    } catch (e) {
      json = null;
    }
    const seasons = json && json.success && json.data && Array.isArray(json.data.seasons) ? json.data.seasons : [];
    for (const season of seasons) {
      for (const ep of Array.isArray(season.episodes) ? season.episodes : []) {
        const id = String(ep.permalink || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
        if (!/^episodes\/[^/]+$/.test(id)) continue;
        const number = Number(ep.episode);
        const seasonNumber = Number(ep.season !== undefined ? ep.season : season.season);
        const title = decode((/S\d+E\d+\s*(?:&#8211;|\u2013|-)\s*(.*)$/i.exec(String(ep.title || '')) || [])[1]);
        const label = Number.isFinite(number) ? `Episode ${number}` : 'Episode';
        const episode = { id, chapterId: id, name: title ? `${label}: ${title}` : label, number: Number.isFinite(number) ? number : undefined };
        if (Number.isFinite(seasonNumber)) {
          episode.season = String(seasonNumber);
          episode.seasonName = seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`;
        }
        episodes.push(episode);
      }
    }
    if (!episodes.length) {
      const $ = cheerio.load(html);
      $('[id^="season-"][id$="-episodes"]').each((_, block) => {
        const season = Number((/^season-(\d+)-episodes$/.exec($(block).attr('id')) || [])[1]);
        $(block)
          .find('.episode-list-col')
          .each((__, col) => {
            const card = $(col);
            const href = card.find('a.episode-watch-link').attr('href');
            const id = String(href || '').replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+|\/+$/g, '');
            if (!/^episodes\/[^/]+$/.test(id)) return;
            const number = Number((/(\d+(?:\.\d+)?)/.exec(card.find('.episode-card-kicker').text()) || [])[1]);
            const episode = { id, chapterId: id, name: `Episode ${Number.isFinite(number) ? number : ''}`.trim(), number: Number.isFinite(number) ? number : undefined };
            if (Number.isFinite(season)) {
              episode.season = String(season);
              episode.seasonName = season === 0 ? 'Specials' : `Season ${season}`;
            }
            episodes.push(episode);
          });
      });
    }
    if (!episodes.length) throw new Error('OnlyFlix: this series lists no episodes yet');
    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    const isMovie = mangaId.indexOf('movie~') === 0;
    const path = isMovie ? pathOfId(mangaId) : String(chapterId || '').replace(/^\/+|\/+$/g, '');
    const page = `${SITE}/${path}/`;
    const html = await this.text(page);
    const json = await this.ajax(html, page, 'mcp_get_available_players', (postId) => `post_id=${encodeURIComponent(postId)}&type=${isMovie ? 'movie' : 'episode'}`);
    const players = json && json.success && json.data && Array.isArray(json.data.players) ? json.data.players : [];
    const seen = new Set();
    const DEAD = /cdnm|vidapi|balance|nontongo/i;
    const videos = players
      .filter((p) => p && /^https?:\/\/\S+$/i.test(String(p.url || '')) && !DEAD.test(`${p.name} ${String(p.url).split('/')[2]}`) && !seen.has(p.url) && seen.add(p.url))
      .map((p) => {
        const name = clean(p.name) || 'Server';
        return {
          url: String(p.url),
          type: 'embed',
          quality: clean(`${p.quality || ''} ${p.language || ''}`) || name,
          server: name,
        };
      });
    if (!videos.length) throw new Error('OnlyFlix: this title has no server yet');
    const first = (v) => (/vidfast/i.test(v.server) ? 0 : 1);
    return videos.map((v, i) => ({ v, i })).sort((a, b) => first(a.v) - first(b.v) || a.i - b.i).map((x) => x.v);
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { ...BROWSER, Accept: 'text/html,application/xhtml+xml' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`OnlyFlix: HTTP ${response.status} from ${url}`);
    return String(response.data);
  }
}

module.exports = { Source };
