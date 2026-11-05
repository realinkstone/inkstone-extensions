const SITE = 'https://anime.uniquestream.net';
const API = `${SITE}/api/v1`;
const PAGE_SIZE = 20;

const FEEDS = [
  { id: 'new', name: 'New', path: 'videos/new' },
  { id: 'popular', name: 'Popular', path: 'videos/popular' },
];

function bigPoster(url) {
  return url ? String(url).replace(/\/posters\/\d+x\d+\//, '/posters/480x720/') : undefined;
}

function imageOf(images, type) {
  const list = Array.isArray(images) ? images : [];
  const found = list.find((i) => i && i.type === type) || list[0];
  return found ? found.url : undefined;
}

function statusOf(status) {
  const s = String(status || '').toLowerCase();
  if (s.indexOf('airing') !== -1 || s.indexOf('ongoing') !== -1 || s.indexOf('releasing') !== -1) return 'ONGOING';
  if (s.indexOf('finished') !== -1 || s.indexOf('complete') !== -1 || s.indexOf('ended') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function toTitle(item) {
  return {
    mangaId: item.content_id,
    title: item.title || item.content_id,
    image: bigPoster(item.image),
    status: statusOf(item.status),
    tags: [item.subbed ? 'Sub' : null, item.dubbed ? 'Dub' : null].filter(Boolean),
    medium: 'anime',
  };
}

function languageName(code) {
  const names = { en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', ar: 'Arabic', ru: 'Russian', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese' };
  const base = String(code || '').split('-')[0].toLowerCase();
  const name = names[base] || code;
  return code && code.indexOf('-') !== -1 ? `${name} (${code.split('-')[1]})` : name;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
  }

  getSourceFeeds() {
    return FEEDS.map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    if (query) {
      const json = await this.json(`${API}/search?page=${page}&limit=${PAGE_SIZE}&query=${encodeURIComponent(query)}&t=all`);
      const items = [].concat(Array.isArray(json.series) ? json.series : [], Array.isArray(json.movies) ? json.movies : []);
      return { results: items.map(toTitle), metadata: items.length >= PAGE_SIZE ? { page: page + 1 } : undefined };
    }
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const json = await this.json(`${API}/${feed.path}?limit=${PAGE_SIZE}&page=${page}`);
    const items = Array.isArray(json) ? json : [];
    return { results: items.map(toTitle), metadata: items.length >= PAGE_SIZE ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const series = await this.json(`${API}/series/${encodeURIComponent(mangaId)}`);
    const genres = Array.isArray(series.genre) ? series.genre.map((g) => (typeof g === 'string' ? g : g && (g.name || g.title))).filter(Boolean) : [];
    return {
      mangaInfo: {
        title: series.title || mangaId,
        image: imageOf(series.images, 'poster_tall'),
        banner: imageOf(series.images, 'poster_wide'),
        desc: String(series.description || '').trim(),
        status: 'UNKNOWN',
        tags: genres,
        rating: typeof series.rating_avg === 'number' && series.rating_avg > 0 ? series.rating_avg : undefined,
        webURL: `${SITE}/series/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const series = await this.json(`${API}/series/${encodeURIComponent(mangaId)}`);
    const seasons = Array.isArray(series.seasons) ? series.seasons : [];
    const many = seasons.length > 1;
    const requests = [];
    for (const season of seasons) {
      const pages = Math.max(1, Math.ceil((Number(season.episode_count) || PAGE_SIZE) / PAGE_SIZE));
      for (let page = 1; page <= pages; page++) {
        requests.push(
          this.json(`${API}/season/${encodeURIComponent(season.content_id)}/episodes?page=${page}&limit=${PAGE_SIZE}&order_by=asc`)
            .then((list) => (Array.isArray(list) ? list : []).map((ep) => ({ ep, season })))
            .catch(() => [])
        );
      }
    }
    const found = [].concat(...(await Promise.all(requests)));
    const covers = new Map();
    for (const { ep, season } of found) {
      const still = ep && ep.image && ep.image.indexOf('/missing.') === -1 ? ep.image : null;
      const number = Number(ep && ep.episode_number);
      if (!still || ep.is_clip) continue;
      const rank = number >= 1 ? number : Number.MAX_SAFE_INTEGER;
      const best = covers.get(season.content_id);
      if (!best || rank < best.rank) covers.set(season.content_id, { rank, still });
    }
    const seen = new Set();
    const episodes = [];
    for (const { ep, season } of found) {
      if (!ep || !ep.content_id || seen.has(ep.content_id) || ep.is_clip) continue;
      seen.add(ep.content_id);
      const number = Number(ep.episode_number);
      const label = ep.episode || (Number.isFinite(number) ? number : '');
      const title = String(ep.title || '').trim();
      const named = title && !/^episode\s+[\d.]+$/i.test(title);
      const chapter = {
        id: ep.content_id,
        chapterId: ep.content_id,
        name: named ? (number >= 1 ? `Episode ${label}: ${title}` : title) : `Episode ${label}`,
        number: Number.isFinite(number) ? number : undefined,
      };
      if (many) {
        chapter.season = String(season.season_seq_number || season.season_number || season.content_id);
        chapter.seasonName = season.title || undefined;
        const cover = covers.get(season.content_id);
        if (cover) chapter.seasonCover = cover.still;
      }
      episodes.push(chapter);
    }
    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    const media = await this.json(`${API}/episode/${encodeURIComponent(chapterId)}/media/dash/ja-JP`);
    const hls = media && media.hls;
    if (!hls || !hls.playlist) throw new Error('UniqueStream: this episode has no stream yet');
    const subtitles = (Array.isArray(hls.subtitles) ? hls.subtitles : [])
      .filter((s) => s && s.url)
      .map((s) => ({ url: s.url, label: languageName(s.language), language: s.language }));
    return [
      {
        url: hls.playlist,
        quality: hls.locale ? `Auto, ${languageName(hls.locale)} audio` : 'Auto',
        headers: { Referer: `${SITE}/` },
        subtitles,
      },
    ];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'application/json' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`UniqueStream: HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
