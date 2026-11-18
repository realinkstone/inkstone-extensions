const SITE = 'https://justanime.to';
const API = 'https://core.justanime.to/api';
const ANILIST = 'https://graphql.anilist.co';

const FEEDS = [
  { id: 'popular', name: 'Popular', params: {} },
  { id: 'trending', name: 'Trending', params: { sort: 'trending' } },
  { id: 'updated', name: 'Recently Updated', params: { sort: 'updated' } },
  { id: 'airing', name: 'Airing', params: { status: 'RELEASING' } },
  { id: 'rating', name: 'Top Rated', params: { sort: 'rating' } },
  { id: 'favourites', name: 'Most Favourited', params: { sort: 'favourites' } },
  { id: 'movies', name: 'Movies', params: { type: 'MOVIE' } },
  { id: 'completed', name: 'Recently Completed', params: { sort: 'completed', status: 'FINISHED' } },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

const PROVIDERS = [
  { id: 'momo', server: 'Momo' },
  { id: 'revo', server: 'Revo' },
  { id: 'calm', server: 'Calm' },
  { id: 'onyx', server: 'Onyx', hard: true },
  { id: 'gigi', server: 'Gigi', quality: '360p' },
];

const LANGS = {
  english: 'en', portuguese: 'pt', spanish: 'es', arabic: 'ar', french: 'fr', german: 'de', italian: 'it', indonesian: 'id', malay: 'ms', chinese: 'zh', japanese: 'ja', russian: 'ru',
  korean: 'ko', thai: 'th', vietnamese: 'vi', turkish: 'tr', hindi: 'hi', polish: 'pl', dutch: 'nl', hebrew: 'he', filipino: 'fil', greek: 'el', swedish: 'sv', ukrainian: 'uk',
};

const EXPLICIT_TAG = /^(rape|ahegao|anal sex|cunnilingus|fellatio|group sex|handjob|masturbation|nakadashi|threesome|futanari|squirting|sex toys|boobjob|deepthroat|fingering|cumflation|mating press|public sex|zoophilia|watersports|scat|fisting|facial|irrumatio|double penetration|cervix penetration|rimjob|sixty-nine|strap-on|sumata|ashikoki)$/i;
const EVERYDAY_TAG = /^(sweat|feet|armpits|flat chest|large breasts|virginity|amputation|hair pulling|vore|lactation|bondage|sadism|masochism|hypersexuality|pet play|asphyxiation|erotic piercings|dilf|milf|voyeur|femdom|omegaverse|netorare|netorase|netori|prostitution|exhibitionism|defloration|tentacles|swapping|oyakodon|shimaidon|human pet|male pregnancy)$/i;

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function within(promise, ms, fallback) {
  return new Promise((resolve) => {
    let done = false;
    setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!done) {
          done = true;
          resolve(value);
        }
      },
      () => {
        if (!done) {
          done = true;
          resolve(fallback);
        }
      }
    );
  });
}

function queryString(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function titleOf(t) {
  const title = t || {};
  return clean(title.english) || clean(title.romaji) || clean(title.native);
}

function coverOf(url) {
  return String(url || '').replace('/cover/large/', '/cover/medium/');
}

function parseId(mangaId) {
  const id = String(mangaId || '').split('@@')[0];
  if (!/^\d+$/.test(id)) throw new Error('JustAnime: unknown title id ' + mangaId);
  return id;
}

function rateMedia(media) {
  const genres = (media && media.genres) || [];
  if ((media && media.isAdult) || genres.indexOf('Hentai') >= 0) return 18;
  let rating = genres.indexOf('Ecchi') >= 0 ? 16 : 0;
  const tags = (media && media.tags) || [];
  for (let i = 0; i < tags.length; i++) {
    const name = clean(tags[i].name);
    const rank = Number(tags[i].rank) || 0;
    if (EXPLICIT_TAG.test(name) && rank >= 50) return 18;
    if (name === 'Nudity' && rank >= 50) rating = Math.max(rating, 16);
    else if (tags[i].isAdult && !EVERYDAY_TAG.test(name) && rank >= 70) rating = Math.max(rating, 16);
  }
  return rating;
}

function dateMs(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
  if (!m) return undefined;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ms > 1e11 ? ms : undefined;
}

function plainStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'RELEASING') return 'ONGOING';
  if (s === 'FINISHED') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'HIATUS') return 'HIATUS';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ratings = new Map();
    this.pending = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    let names = GENRES;
    try {
      const body = await this.api('/genre');
      if (body && Array.isArray(body.data) && body.data.length) names = body.data.filter((g) => typeof g === 'string' && g);
    } catch (e) {
      names = GENRES;
    }
    return names.map((g) => ({ id: g, label: g }));
  }

  async api(path, params) {
    const url = `${API}${path}${params && Object.keys(params).length ? `?${queryString(params)}` : ''}`;
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Origin: SITE, Accept: 'application/json' } }));
        if (response.status === 404) return { __status: 404 };
        if (response.status < 200 || response.status >= 300) {
          last = new Error(`JustAnime: HTTP ${response.status}`);
          if (response.status < 500) throw last;
          await pause(600);
          continue;
        }
        try {
          return JSON.parse(response.data);
        } catch (e) {
          throw new Error('JustAnime: the API did not answer JSON');
        }
      } catch (e) {
        last = e;
        if (/HTTP 4\d\d|JSON/.test(String((e && e.message) || ''))) throw e;
        if (attempt === 0) await pause(500);
      }
    }
    throw last || new Error('JustAnime: no answer');
  }

  async anilist(ids) {
    const query = 'query($ids:[Int],$n:Int){Page(perPage:$n){media(id_in:$ids,type:ANIME){id isAdult genres tags{name rank isAdult}}}}';
    const response = await this.requests.schedule(
      App.createRequest({
        url: ANILIST,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { ids: ids.map(Number), n: Math.min(50, ids.length) } }),
      })
    );
    if (response.status !== 200) throw new Error(`AniList: HTTP ${response.status}`);
    const data = JSON.parse(response.data);
    const media = data && data.data && data.data.Page && data.data.Page.media;
    if (!Array.isArray(media)) throw new Error('AniList: no media');
    const out = {};
    for (const m of media) out[String(m.id)] = m;
    return out;
  }

  async rate(ids) {
    const want = ids.filter((id) => !this.ratings.has(id));
    if (want.length) {
      let found = {};
      if (!this.anilistDownUntil || Date.now() > this.anilistDownUntil) {
        try {
          found = await within(this.anilist(want), 6000, null);
        } catch (e) {
          found = null;
        }
        if (!found) {
          found = {};
          this.anilistDownUntil = Date.now() + 60000;
        }
      }
      const missing = [];
      for (const id of want) {
        if (found[id]) this.ratings.set(id, rateMedia(found[id]));
        else missing.push(id);
      }
      let at = 0;
      const lane = async () => {
        while (at < missing.length) {
          const id = missing[at++];
          try {
            const body = await this.api(`/anime/${id}`);
            const media = body && (body.data || body);
            if (media && media.id) this.ratings.set(id, rateMedia(media));
          } catch (e) {
          }
        }
      };
      await Promise.all([lane(), lane(), lane(), lane(), lane(), lane()]);
    }
    const out = {};
    for (const id of ids) out[id] = this.ratings.get(id);
    return out;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const genres = included.map((t) => clean(t && (t.id || t.label || t))).filter(Boolean);
    const params = query ? {} : Object.assign({}, feed.params);
    if (query) params.query = query;
    if (genres.length) params.genre = genres.join(',');
    if (page > 1) params.page = page;
    const body = await this.api('/search', params);
    if (body && body.__status === 404) return { results: [], metadata: undefined };
    const rows = Array.isArray(body && body.results) ? body.results : [];
    const ratings = await this.rate(rows.map((r) => String(r.id)));
    const results = [];
    const seen = new Set();
    for (const r of rows) {
      const id = String(r.id);
      const title = titleOf(r.title);
      if (!title || seen.has(id)) continue;
      seen.add(id);
      const item = { mangaId: id, title, image: coverOf(r.cover), medium: 'anime' };
      const bits = [r.type === 'MOVIE' ? 'Movie' : r.type, r.year ? String(r.year) : '', r.episodes > 1 ? `${r.episodes} episodes` : ''].filter(Boolean);
      if (bits.length) item.summary = bits.join(', ');
      if (typeof ratings[id] === 'number') item.ageRating = ratings[id];
      results.push(item);
    }
    const info = (body && body.pageInfo) || {};
    return { results, metadata: info.hasNextPage && results.length ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const id = parseId(mangaId);
    const body = await this.api(`/anime/${id}`);
    const media = body && (body.data || body);
    if (!media || !media.id) throw new Error('JustAnime: title not found');
    const rated = await this.rate([id]);
    const slug = titleOf(media.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const info = {
      title: titleOf(media.title),
      image: coverOf(media.coverImage && media.coverImage.extraLarge),
      desc: String(media.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/\n{3,}/g, '\n\n').trim() || undefined,
      status: plainStatus(media.status),
      tags: Array.isArray(media.genres) ? media.genres : [],
      webURL: `${SITE}/anime/${id}${slug ? `/${slug}` : ''}`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    if (media.bannerImage) info.banner = media.bannerImage;
    if (typeof rated[id] === 'number') info.ageRating = rated[id];
    else if (media.isAdult) info.ageRating = 18;
    else if ((media.genres || []).indexOf('Ecchi') >= 0) info.ageRating = 16;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const id = parseId(mangaId);
    const first = await this.api(`/anime/${id}/episodes`, { page: 1 });
    if (first && first.__status === 404) throw new Error('JustAnime: title not found');
    let rows = Array.isArray(first && first.episodes) ? first.episodes.slice() : [];
    const pages = Number(first && first.totalPages) || 1;
    if (pages > 1) {
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) =>
          this.api(`/anime/${id}/episodes`, { page: i + 2 }).then((b) => {
            if (!b || !Array.isArray(b.episodes)) throw new Error(`JustAnime: episode page ${i + 2} of ${pages} did not load`);
            return b.episodes;
          })
        )
      );
      for (const part of rest) rows = rows.concat(part);
    }
    const total = Number(first && first.totalEpisodes) || rows.length;
    if (rows.length < total) throw new Error(`JustAnime: the episode list came back short (${rows.length} of ${total}), try again`);
    const seen = new Set();
    const list = [];
    for (const e of rows) {
      const number = Number(e.number);
      if (!Number.isFinite(number)) continue;
      const key = String(number);
      if (seen.has(key)) continue;
      seen.add(key);
      const name = /^episode\s+[\d.]+$/i.test(clean(e.title)) ? '' : clean(e.title);
      const row = { id: key, chapterId: key, name: name ? `Episode ${key}: ${name}` : `Episode ${key}`, number };
      if (name) row.title = name;
      const time = dateMs(e.airDate);
      if (time !== undefined) row.time = time;
      if (/^https?:\/\//i.test(String(e.image || ''))) row.thumbnail = e.image;
      const summary = clean(e.description);
      if (summary) row.summary = summary;
      list.push(row);
    }
    if (!list.length) throw new Error('JustAnime has no episodes for this title yet');
    list.sort((a, b) => b.number - a.number);
    return list;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async provider(id, episode, name) {
    try {
      const body = await this.api(`/watch/${id}/episode/${encodeURIComponent(episode)}/${name}`);
      if (body && body.__status === 404) return { status: 404 };
      return { status: 200, body };
    } catch (e) {
      const m = /HTTP (\d+)/.exec(String((e && e.message) || ''));
      return { status: m ? Number(m[1]) : 0, error: e };
    }
  }

  entries(spec, body) {
    const out = [];
    const headersOf = (side, found) => {
      const h = {};
      const given = Object.assign({}, (side && side.headers) || {}, (found && found.headers) || {});
      for (const k of Object.keys(given)) if (typeof given[k] === 'string' && given[k]) h[k] = given[k];
      return h;
    };
    const urlOf = (side) => {
      const src = side && Array.isArray(side.sources) ? side.sources.find((s) => s && /^https?:\/\//i.test(String(s.url || ''))) : null;
      return src ? { url: src.url, mp4: src.isM3U8 === false, headers: src.headers } : null;
    };
    const subsOf = (side) => {
      const tracks = side && (side.subtitles || side.tracks);
      const list = [];
      for (const t of Array.isArray(tracks) ? tracks : []) {
        const url = String((t && (t.file || t.url)) || '');
        if (!/^https?:\/\//i.test(url) || (t.kind && t.kind !== 'captions' && t.kind !== 'subtitles')) continue;
        const label = clean(t.label) || 'Subtitles';
        const lang = LANGS[clean(label.split(/[\s(]/)[0]).toLowerCase()];
        const track = { url, label };
        if (lang) track.language = lang;
        if (typeof t.offset === 'number' && Number.isFinite(t.offset) && t.offset !== 0) track.offset = Math.max(-600000, Math.min(600000, Math.round(t.offset * 1000)));
        list.push(track);
      }
      list.sort((a, b) => (b.language === 'en' ? 1 : 0) - (a.language === 'en' ? 1 : 0));
      return list;
    };
    const range = (r) => (r && Number(r.end) > Number(r.start) && Number(r.end) > 0 ? { start: Math.round(Number(r.start) * 1000), end: Math.round(Number(r.end) * 1000) } : undefined);
    const sub = urlOf(body.sub);
    const dub = urlOf(body.dub);
    const same = sub && dub && sub.url === dub.url;
    const add = (kind, side, found, label) => {
      if (!found) return;
      const entry = { url: found.url, quality: `${spec.quality || 'Auto'} ${label}`, server: spec.server, headers: headersOf(side, found) };
      if (found.mp4) entry.type = 'mp4';
      else entry.type = 'hls';
      const subs = kind === 'sub' ? subsOf(side) : [];
      if (subs.length) entry.subtitles = subs;
      const intro = range(side.intro);
      const outro = range(side.outro);
      if (intro) entry.intro = intro;
      if (outro) entry.outro = outro;
      out.push(entry);
    };
    if (same) {
      const subs = subsOf(body.sub);
      add('sub', body.sub, sub, `${subs.length ? 'Softsub' : 'Sub'}, Multi-Audio`);
      return out;
    }
    if (sub) {
      const subs = subsOf(body.sub);
      add('sub', body.sub, sub, subs.length ? 'Softsub' : spec.hard ? 'Hardsub' : 'Sub');
    }
    if (dub) add('dub', body.dub, dub, 'Dub');
    return out;
  }

  async getVideos(mangaId, chapterId) {
    const id = parseId(mangaId);
    const episode = String(chapterId || '').split('@@').pop();
    if (!/^\d+(\.\d+)?$/.test(episode)) throw new Error('JustAnime: unknown episode id ' + chapterId);
    const answers = PROVIDERS.map(() => ({ status: 0, late: true }));
    await new Promise((resolve) => {
      let left = PROVIDERS.length;
      let graced = false;
      PROVIDERS.forEach((spec, i) => {
        within(this.provider(id, episode, spec.id), 10000, { status: 0, late: true }).then((a) => {
          answers[i] = a;
          left -= 1;
          if (left === 0) resolve();
          else if (a.status === 200 && !graced) {
            graced = true;
            setTimeout(resolve, 2500);
          }
        });
      });
    });
    const out = [];
    const notes = [];
    const seen = new Set();
    answers.forEach((a, i) => {
      const spec = PROVIDERS[i];
      if (a.status !== 200 || !a.body) {
        notes.push(`${spec.id} ${a.late ? 'timed out' : a.status || 'failed'}`);
        return;
      }
      for (const entry of this.entries(spec, a.body)) {
        if (seen.has(entry.url)) continue;
        seen.add(entry.url);
        out.push(entry);
      }
    });
    if (!out.length) {
      const missing = answers.filter((a) => a.status === 404).length;
      const broken = answers.filter((a) => a.status !== 404 && a.status !== 200).length;
      if (missing && missing >= broken) throw new Error(`JustAnime has no stream for this episode yet (${notes.join(', ')})`);
      throw new Error(`JustAnime: no server gave a stream (${notes.join(', ')}), try again in a minute`);
    }
    return out;
  }
}

module.exports = { Source };
