const SITE = 'https://k-drama.in';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'kdrama', name: 'K-Dramas', type: 'kdrama', sort: 'popular' },
  { id: 'kdrama-new', name: 'New K-Dramas', type: 'kdrama', sort: 'newest' },
  { id: 'cdrama', name: 'C-Dramas', type: 'cdrama', sort: 'popular' },
  { id: 'jdrama', name: 'J-Dramas', type: 'jdrama', sort: 'popular' },
  { id: 'thai', name: 'Thai Dramas', type: 'thai', sort: 'popular' },
  { id: 'movies', name: 'Movies', type: 'movie', sort: 'popular' },
];

const GENRES = [
  ['10749', 'Romance'], ['35', 'Comedy'], ['10759', 'Action & Adventure'], ['9648', 'Mystery'], ['18', 'Drama'], ['14', 'Fantasy'], ['80', 'Crime'],
];

const ASIAN = ['ko', 'zh', 'cn', 'ja', 'th', 'tl', 'vi', 'id'];

const LANGUAGES = {
  english: 'en', arabic: 'ar', chinese: 'zh', danish: 'da', dutch: 'nl', finnish: 'fi', 'français': 'fr', french: 'fr', german: 'de', hindi: 'hi', indonesia: 'id', indonesian: 'id',
  italian: 'it', japanese: 'ja', khmer: 'km', korean: 'ko', malay: 'ms', polish: 'pl', 'português': 'pt', portuguese: 'pt', russian: 'ru', 'español': 'es', spanish: 'es', thai: 'th',
  turkish: 'tr', vietnamese: 'vi', 'ไทย': 'th', 'tiếng việt': 'vi',
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function parseId(mangaId) {
  const m = /^(tv|movie)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Kat Drama: unknown title id ' + mangaId);
  return { kind: m[1], tmdb: m[2] };
}

function decodeEntities(text) {
  return String(text || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function queryOf(url) {
  const out = {};
  const q = String(url).split('?').slice(1).join('?');
  for (const pair of q.split('&')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    try {
      out[pair.slice(0, at)] = decodeURIComponent(pair.slice(at + 1).replace(/\+/g, ' '));
    } catch (e) {
      out[pair.slice(0, at)] = pair.slice(at + 1);
    }
  }
  return out;
}

function parseJsonList(text) {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function thumb(url) {
  return String(url || '').replace('/t/p/w500/', '/t/p/w342/');
}

function languageCode(name) {
  return LANGUAGES[clean(name).toLowerCase()] || clean(name);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g[0], label: g[1] }));
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const data = JSON.parse(await this.text(`${SITE}/api.php?action=search&q=${encodeURIComponent(query)}`, 'application/json'));
      const results = [];
      const seen = new Set();
      for (const r of Array.isArray(data && data.results) ? data.results : []) {
        if (!r || (r.media_type !== 'tv' && r.media_type !== 'movie') || !r.id) continue;
        const title = clean(r.name || r.title);
        const mangaId = `${r.media_type}~${r.id}`;
        if (!title || seen.has(mangaId)) continue;
        seen.add(mangaId);
        const card = { mangaId, title, image: r.poster_path ? `https://image.tmdb.org/t/p/w342${r.poster_path}` : '', medium: 'anime' };
        const year = String(r.first_air_date || r.release_date || '').slice(0, 4);
        if (year) card.summary = year;
        if (r.adult === true || r.softcore === true) card.ageRating = 18;
        card.asian = ASIAN.indexOf(String(r.original_language)) >= 0;
        results.push(card);
      }
      const ordered = results.filter((c) => c.asian).concat(results.filter((c) => !c.asian));
      ordered.forEach((c) => delete c.asian);
      return { results: ordered };
    }

    let url = `${SITE}/explore?type=${feed.type}&sort=${feed.sort}&page=${page}`;
    const genre = included.length && included[0] && included[0].id ? String(included[0].id) : '';
    if (genre) url += `&genre=${encodeURIComponent(genre)}`;
    const $ = cheerio.load(await this.text(url));
    const results = [];
    const seen = new Set();
    $('.cineapse-movie-card').each((i, el) => {
      const card = $(el);
      const m = /\/detail\/(tv|movie)\/(?:[a-z0-9-]*?-)?(\d+)/i.exec(card.attr('onclick') || '');
      if (!m) return;
      const mangaId = `${m[1].toLowerCase()}~${m[2]}`;
      const img = card.find('img').first();
      const title = clean(img.attr('alt'));
      if (!title || seen.has(mangaId)) return;
      seen.add(mangaId);
      const out = { mangaId, title, image: thumb(img.attr('src')), medium: 'anime' };
      const year = (/\b(19|20)\d{2}\b/.exec(card.text()) || [])[0];
      if (year) out.summary = year;
      results.push(out);
    });
    const pages = (/Page\s+(\d+)\s+of\s+(\d+)/i.exec($('body').text()) || []).slice(1).map(Number);
    return { results, metadata: pages.length === 2 && pages[0] < pages[1] ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    const $ = cheerio.load(await this.text(`${SITE}/detail/${kind}/${tmdb}`));
    const h1 = $('h1').first();
    const title = clean(h1.text());
    if (!title) throw new Error('Kat Drama: title not found');
    const block = h1.parent();
    const chips = block.find('span').map((i, e) => clean($(e).text())).get().filter(Boolean);
    const year = chips.find((c) => /^(19|20)\d{2}$/.test(c));
    const genres = chips.filter((c) => !/^(Drama Series|Movie|TV Series)$/i.test(c) && !/^(19|20)\d{2}$/.test(c) && !/^\d+(\.\d+)?$/.test(c) && c.length < 28);
    const text = clean($('body').text());
    const info = {
      title,
      image: clean($('meta[property="og:image"]').attr('content')),
      desc: clean(h1.nextAll('p').first().text()) || undefined,
      author: year || undefined,
      status: /Completed Series/i.test(text) ? 'COMPLETED' : /\b(Ongoing|Currently Airing)\b/i.test(text) ? 'ONGOING' : 'UNKNOWN',
      tags: genres,
      webURL: `${SITE}/detail/${kind}/${tmdb}`,
      medium: 'anime',
    };
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, tmdb } = parseId(mangaId);
    if (kind === 'movie') return [{ id: '1:1', chapterId: '1:1', name: 'Full movie', number: 1 }];
    const first = cheerio.load(await this.text(`${SITE}/detail/tv/${tmdb}`));
    const seasons = [];
    first('a[href*="?season="]').each((i, e) => {
      const n = Number((/season=(\d+)/.exec(first(e).attr('href') || '') || [])[1]);
      if (Number.isFinite(n) && n >= 0 && seasons.indexOf(n) < 0) seasons.push(n);
    });
    if (!seasons.length) seasons.push(1);
    const rows = [];
    for (const season of seasons) {
      const $ = season === 1 && seasons.length === 1 ? first : cheerio.load(await this.text(`${SITE}/detail/tv/${tmdb}?season=${season}`));
      const seen = new Set();
      $('a[href*="download=1"]').each((i, a) => {
        const n = (/-episode-(\d+(?:\.\d+)?)/.exec($(a).attr('href') || '') || [])[1];
        if (n === undefined || seen.has(n)) return;
        seen.add(n);
        let row = $(a).parent();
        for (let up = 0; up < 3 && !/^EP\s*\d/i.test(clean(row.text())); up++) row = row.parent();
        const text = clean(row.text()).replace(/\s*Download\s*$/i, '');
        const m = /^EP\s*(\d+(?:\.\d+)?)\s+(.*?)\s*(\d{4}-\d{2}-\d{2})?$/i.exec(text) || [];
        const number = Number(n);
        const title = clean(m[2]);
        const row2 = { id: `${season}:${n}`, chapterId: `${season}:${n}`, name: title && !/^Episode\s+\d+$/i.test(title) ? `Episode ${number}: ${title}` : `Episode ${number}`, number, season };
        if (title && !/^Episode\s+\d+$/i.test(title)) row2.title = title;
        const t = Date.parse(m[3] || '');
        if (Number.isFinite(t)) row2.time = t;
        if (Number.isFinite(t) && t > Date.now() + 36 * 3600 * 1000) return;
        rows.push(row2);
      });
    }
    if (!rows.length) throw new Error('Kat Drama has no episodes for this title yet');
    rows.sort((a, b) => b.season - a.season || b.number - a.number);
    const many = new Set(rows.map((r) => r.season)).size > 1;
    return rows.map((r) => {
      const out = { id: r.id, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.title) out.title = r.title;
      if (r.time !== undefined) out.time = r.time;
      if (many) {
        out.season = String(r.season);
        out.seasonName = `Season ${r.season}`;
      }
      return out;
    });
  }

  async getVideos(mangaId, chapterId) {
    const { tmdb } = parseId(mangaId);
    const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(String(chapterId));
    if (!m) throw new Error('Kat Drama: unknown episode id ' + chapterId);
    const videos = [];
    let first = null;
    try {
      const list = await this.fromPlayer(`${SITE}/2.php/${tmdb}/${m[1]}/${m[2]}`);
      if (list.length && !(await this.reachable(list[0].url))) first = new Error('Kat Drama: the stream of this episode is on a host that does not answer');
      else videos.push(...list);
    } catch (e) {
      first = e;
    }
    if (!videos.length) {
      try {
        videos.push(...(await this.fromVid2(`${SITE}/vid2.php/${tmdb}/${m[1]}/${m[2]}`)));
      } catch (e) {
      }
    }
    if (!videos.length) {
      if (first && !/HTTP 404|not found/i.test(first.message)) throw first;
      throw new Error('Kat Drama has no stream for this episode yet. A new episode can take a few hours, try again later.');
    }
    return videos;
  }

  async fromPlayer(url) {
    const html = await this.text(url);
    const m = /<iframe[^>]+src="([^"]*player\.html\?[^"]+)"/i.exec(html);
    if (!m) throw new Error('Kat Drama: not found (no player)');
    const q = queryOf(decodeEntities(m[1]));
    const subtitles = [];
    const used = new Set();
    for (const s of parseJsonList(q.subtitle || '[]')) {
      if (!s || !/^https?:\/\//.test(String(s.file || ''))) continue;
      const base = clean(s.name) || 'Subtitles';
      let label = base;
      for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
      used.add(label.toLowerCase());
      subtitles.push({ url: s.file, label, language: languageCode(base), format: 'vtt' });
    }
    const ordered = subtitles.filter((s) => s.language === 'en').concat(subtitles.filter((s) => s.language !== 'en'));
    const out = [];
    for (const f of parseJsonList(q.file || '[]')) {
      if (!f || !/^https?:\/\//.test(String(f.file || ''))) continue;
      const name = (/\(([^)]+)\)/.exec(String(f.title || '')) || [])[1];
      const shown = ordered.slice(0, 3).map((s) => s.label);
      const video = {
        url: f.file,
        quality: `720p, Softsub${ordered.length ? `: ${shown.join(', ')}${ordered.length > 3 ? ` and ${ordered.length - 3} more` : ''}` : ''}`,
        type: 'hls',
        server: name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Kat Drama',
      };
      if (ordered.length) video.subtitles = ordered;
      out.push(video);
    }
    return out;
  }

  async fromVid2(url) {
    const html = await this.text(url);
    const grab = (name) => {
      const m = new RegExp(`const ${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`).exec(html);
      return m ? parseJsonList(m[1]) : [];
    };
    const subs = [];
    const used = new Set();
    for (const s of grab('SUBTITLES')) {
      const file = clean(s && (s.file || s.url));
      if (!/^https?:\/\//.test(file)) continue;
      const base = clean(String(s.label || s.language || 'Subtitles').replace(/^[A-Za-z]+\s+-\s+/, '')) || 'Subtitles';
      let label = base;
      for (let n = 2; used.has(label.toLowerCase()); n++) label = `${base} ${n}`;
      used.add(label.toLowerCase());
      subs.push({ url: file, label, language: clean(s.lang) || languageCode(base), format: String(s.format) === 'srt' ? 'srt' : 'vtt' });
    }
    const ordered = subs.filter((s) => s.language === 'en').concat(subs.filter((s) => s.language !== 'en'));
    const out = [];
    for (const s of grab('SOURCES')) {
      if (!s || s.provider !== 'kisskh' || s.type !== 'hls' || !/^https?:\/\//.test(String(s.url || ''))) continue;
      const video = { url: s.url, quality: `${clean(s.quality) || 'Auto'}${ordered.length ? ', Softsub: ' + ordered.slice(0, 3).map((t) => t.label).join(', ') : ', Sub'}`, type: 'hls', server: 'KissKH' };
      if (ordered.length) video.subtitles = ordered;
      out.push(video);
    }
    return out;
  }

  async reachable(url) {
    try {
      const playlist = await this.text(url, '*/*');
      const seg = playlist.split('\n').map((l) => l.trim()).find((l) => l && l.charAt(0) !== '#');
      if (!/^https?:\/\//.test(seg || '')) return playlist.indexOf('#EXTM3U') >= 0;
      const response = await this.requests.schedule(App.createRequest({ url: seg, method: 'GET', headers: { 'User-Agent': UA, Range: 'bytes=0-1023', Accept: '*/*' } }));
      return response.status >= 200 && response.status < 400;
    } catch (e) {
      return false;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url, accept) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: accept || 'text/html,application/xhtml+xml' } }));
    if (response.status === 404) throw new Error('Kat Drama: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Kat Drama: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
