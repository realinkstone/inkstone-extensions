const SITE = 'https://kaa.lt';
const PLAYER_REFERER = 'https://krussdomi.com/';

function imageOf(picture, kind) {
  if (!picture || !picture.hq) return undefined;
  const format = Array.isArray(picture.formats) && picture.formats.indexOf('webp') !== -1 ? 'webp' : 'jpg';
  return `${SITE}/image/${kind}/${picture.hq}.${format}`;
}

function statusOf(status) {
  const s = String(status || '').toLowerCase();
  if (s.indexOf('airing') !== -1 || s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('finished') !== -1 || s.indexOf('complete') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function titleOf(show) {
  return show.title_en || show.title || show.title_original || show.slug;
}

function toTitle(show) {
  return {
    mangaId: show.slug,
    title: titleOf(show),
    image: imageOf(show.poster, 'poster'),
    status: statusOf(show.status),
    tags: Array.isArray(show.genres) ? show.genres : [],
    medium: 'anime',
  };
}

function absolute(url) {
  const text = String(url || '').trim();
  if (/^https?:\/\/\/+/i.test(text)) return text.replace(/^(https?:)\/\/\/+/i, '$1//');
  if (text.startsWith('//')) return 'https:' + text;
  return text;
}

function htmlDecode(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function revive(value) {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
    const inner = value[1];
    if (value[0] === 1 && Array.isArray(inner)) return inner.map(revive);
    return revive(inner);
  }
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = revive(value[key]);
    return out;
  }
  return value;
}

function playerProps(html) {
  const pattern = /props="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(html))) {
    const text = htmlDecode(match[1]);
    if (text.indexOf('"manifest"') === -1) continue;
    try {
      return revive(JSON.parse(text));
    } catch (e) {
    }
  }
  return null;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
  }

  getSourceFeeds() {
    return [{ id: 'latest', name: 'Latest' }];
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const json = query
      ? await this.json(`${SITE}/api/fsearch`, { method: 'POST', body: JSON.stringify({ query, page }) })
      : await this.json(`${SITE}/api/anime?page=${page}`);
    const shows = Array.isArray(json && json.result) ? json.result : [];
    const last = (json && json.maxPage) || page;
    return {
      results: shows.map(toTitle),
      metadata: page < last && shows.length ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const show = await this.json(`${SITE}/api/show/${encodeURIComponent(mangaId)}`);
    return {
      mangaInfo: {
        title: titleOf(show),
        image: imageOf(show.poster, 'poster'),
        banner: imageOf(show.banner, 'banner'),
        desc: String(show.synopsis || '').trim(),
        status: statusOf(show.status),
        tags: Array.isArray(show.genres) ? show.genres : [],
        webURL: `${SITE}/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const base = `${SITE}/api/show/${encodeURIComponent(mangaId)}`;
    const languages = await this.json(`${base}/language`).catch(() => null);
    const list = languages && Array.isArray(languages.result) ? languages.result : [];
    const lang = list.indexOf('ja-JP') !== -1 ? 'ja-JP' : list[0] || 'ja-JP';
    const first = await this.json(`${base}/episodes?page=1&lang=${encodeURIComponent(lang)}`);
    const pageCount = Array.isArray(first.pages) ? first.pages.length : 1;
    const rest = [];
    for (let page = 2; page <= pageCount; page++) {
      rest.push(this.json(`${base}/episodes?page=${page}&lang=${encodeURIComponent(lang)}`));
    }
    const pages = [first].concat(await Promise.all(rest));
    const seen = new Set();
    const episodes = [];
    for (const page of pages) {
      for (const ep of Array.isArray(page.result) ? page.result : []) {
        const id = `ep-${ep.episode_string || ep.episode_number}-${ep.slug}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const number = Number(ep.episode_number);
        const label = ep.episode_string || ep.episode_number;
        episodes.push({
          id,
          chapterId: id,
          name: ep.title ? `Episode ${label}: ${ep.title}` : `Episode ${label}`,
          number: Number.isFinite(number) ? number : undefined,
          language: lang.slice(0, 2),
        });
      }
    }
    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    const episode = await this.json(`${SITE}/api/show/${encodeURIComponent(mangaId)}/episode/${encodeURIComponent(chapterId)}`);
    const servers = Array.isArray(episode.servers) ? episode.servers : [];
    if (!servers.length) throw new Error('KickAssAnime lists this episode with no server, so the site has no stream for it');
    const videos = [];
    for (const server of servers) {
      if (!server || !server.src) continue;
      try {
        const page = await this.text(absolute(server.src), { Referer: `${SITE}/` });
        const props = playerProps(page);
        if (!props || !props.manifest) continue;
        const subtitles = (Array.isArray(props.subtitles) ? props.subtitles : [])
          .filter((s) => s && s.src)
          .map((s) => ({ url: absolute(s.src), label: s.name || s.language || 'Subtitles', language: s.language }));
        videos.push({
          url: absolute(props.manifest),
          quality: server.name || 'Auto',
          headers: { Referer: PLAYER_REFERER, Origin: PLAYER_REFERER.replace(/\/$/, '') },
          subtitles,
        });
      } catch (e) {
      }
    }
    if (!videos.length) throw new Error(`KickAssAnime: none of this episode's ${servers.length} servers gave a video`);
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url, headers) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: headers || {} }));
    if (response.status < 200 || response.status >= 300) throw new Error(`KickAssAnime: HTTP ${response.status}`);
    return String(response.data);
  }

  async json(url, options) {
    const method = (options && options.method) || 'GET';
    const body = options && options.body;
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await this.requests.schedule(App.createRequest({ url, method, headers, body }));
    if (response.status < 200 || response.status >= 300) throw new Error(`KickAssAnime: HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
