const SITE = 'https://animetvplus.xyz';
const CATALOG = 'https://catalog.animetvplus.site';
const CATALOG_2 = 'https://edge-us.animetvplus.site';
const SEARCH_HOST = 'https://search.animetvplus.site';
const CDN = 'https://cdn.animetvplus.site';
const EDGE = 'https://edge.animetvplus.xyz';
const PAGE = 24;

const FEEDS = [
  { id: 'popular', name: 'Popular', path: '/api/anime/popular' },
  { id: 'new-releases', name: 'New releases', path: '/api/anime/new-releases' },
  { id: 'airing', name: 'Airing', path: '/api/anime/airing' },
  { id: 'top-rated', name: 'Top rated', path: '/api/anime/top-rated' },
  { id: 'database', name: 'All anime', path: '/api/anime/database' },
];

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Hentai', 'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

const LANG = { eng: 'en', spa: 'es', pol: 'pl', ara: 'ar', fra: 'fr', fre: 'fr', ita: 'it', deu: 'de', ger: 'de', por: 'pt', rus: 'ru', jpn: 'ja', zho: 'zh', chi: 'zh', kor: 'ko', tha: 'th', vie: 'vi', ind: 'id', tur: 'tr', hin: 'hi', heb: 'he', ukr: 'uk', nld: 'nl', dut: 'nl', swe: 'sv', msa: 'ms', may: 'ms', fil: 'tl', ces: 'cs', cze: 'cs', ell: 'el', gre: 'el', hun: 'hu', ron: 'ro', rum: 'ro', bul: 'bg', dan: 'da', fin: 'fi', nor: 'no', cat: 'ca' };

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function parseGenres(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const list = JSON.parse(raw || '[]');
    return Array.isArray(list) ? list.map(String) : [];
  } catch (e) {
    return [];
  }
}

function ageFrom(genres, title) {
  const g = genres.map((x) => String(x).toLowerCase());
  if (g.indexOf('hentai') >= 0 || g.indexOf('erotica') >= 0) return 18;
  if (g.indexOf('ecchi') >= 0) return 16;
  if (/hentai|oppai|ecchi|breeder|\bero\b/i.test(String(title || ''))) return 16;
  return 0;
}

function smallImage(url) {
  const u = String(url || '');
  if (!/^https?:\/\//.test(u)) return undefined;
  let m = /^https:\/\/(?:www|imgsrv)\.crunchyroll\.com\/imgsrv\/display\/thumbnail\/\d+x\d+\/(catalog\/crunchyroll\/[A-Za-z0-9_.-]+)$/.exec(u);
  if (m) return `https://imgsrv.crunchyroll.com/cdn-cgi/image/format=jpeg,quality=75,width=300/${m[1]}`;
  m = /^(https:\/\/s4\.anilist\.co\/file\/anilistcdn\/media\/anime\/cover\/)large\/(.+)$/.exec(u);
  if (m) return `${m[1]}medium/${m[2]}`;
  return u;
}

function bannerImage(url) {
  const u = String(url || '');
  if (!/^https?:\/\//.test(u)) return undefined;
  return u.replace('format=auto,quality=90,width=1920', 'format=jpeg,quality=80,width=1280');
}

function thumbImage(url) {
  const u = String(url || '');
  if (!/^https?:\/\//.test(u)) return undefined;
  const m = /^https:\/\/(?:www|imgsrv)\.crunchyroll\.com\/imgsrv\/display\/thumbnail\/\d+x\d+\/(catalog\/crunchyroll\/[A-Za-z0-9_.-]+)$/.exec(u);
  if (m) return `https://imgsrv.crunchyroll.com/cdn-cgi/image/format=jpeg,quality=70,width=320/${m[1]}`;
  return u;
}

function statusOf(item) {
  const s = String(item.status || '').toUpperCase();
  if (s === 'RELEASING') return 'ONGOING';
  if (s === 'FINISHED') return 'COMPLETED';
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'HIATUS') return 'HIATUS';
  return 'UNKNOWN';
}

function titleOf(item) {
  return String(item.english_title || item.canonical_title || item.romaji_title || item.native_title || `Anime ${item.mal_id}`);
}

function kindOf(item) {
  const f = String(item.format || '').toUpperCase();
  return { TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special' }[f] || '';
}

class Source {
  constructor() {
    this.manager = App.createRequestManager({});
    this.memo = new Map();
    this.hasIndex = new Map();
  }

  remember(key, ms, make) {
    const hit = this.memo.get(key);
    if (hit && hit.until > Date.now()) return hit.promise;
    const promise = make();
    this.memo.set(key, { until: Date.now() + ms, promise });
    promise.catch(() => this.memo.delete(key));
    if (this.memo.size > 400) this.memo.delete(this.memo.keys().next().value);
    return promise;
  }

  async send(url, headers) {
    let last;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const target = attempt === 0 ? url : `${url}${url.indexOf('?') >= 0 ? '&' : '?'}r=${attempt}`;
      try {
        const res = await this.manager.schedule(App.createRequest({ url: target, method: 'GET', headers: Object.assign({ Accept: 'application/json' }, headers || {}) }));
        if (res.status >= 500 || res.status === 429) {
          last = new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
          continue;
        }
        return res;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        last = e;
      }
    }
    throw last || new Error('request failed');
  }

  async catalog(path) {
    let res;
    try {
      res = await this.send(`${CATALOG}${path}`);
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      res = await this.send(`${CATALOG_2}${path}`);
    }
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw new Error(`animeTVplus catalog answered HTTP ${res.status}`);
    try {
      return JSON.parse(res.data);
    } catch (e) {
      throw new Error('animeTVplus catalog sent something that is not JSON');
    }
  }

  async getJSON(url) {
    const res = await this.send(url);
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    try {
      return JSON.parse(res.data);
    } catch (e) {
      throw new Error(`${new URL(url).hostname} sent something that is not JSON`);
    }
  }

  episodeIndex(mal) {
    return this.remember(`idx:${mal}`, 300000, async () => {
      const data = await this.getJSON(`${CDN}/${encodeURIComponent(mal)}`);
      if (!data || !Array.isArray(data.episodes)) return null;
      const seen = new Set();
      const list = [];
      for (const e of data.episodes) {
        const n = Number(e && e.episode);
        if (!Number.isFinite(n) || seen.has(n)) continue;
        seen.add(n);
        list.push(n);
      }
      list.sort((a, b) => a - b);
      return list.length ? list : null;
    });
  }

  async headOk(url) {
    try {
      const res = await this.manager.schedule(App.createRequest({ url, method: 'HEAD', headers: { Accept: '*/*' } }));
      if (res.status === 404) return false;
      return true;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return true;
    }
  }

  async hosted(mal) {
    if (this.hasIndex.has(mal)) return this.hasIndex.get(mal);
    try {
      const list = await this.episodeIndex(mal);
      let ok = !!(list && list.length);
      if (ok) {
        const base = `${EDGE}/v/${encodeURIComponent(mal)}/${encodeURIComponent(list[0])}`;
        ok = (await this.headOk(`${base}/sub.m3u8`)) || (await this.headOk(`${base}/dub.m3u8`));
      }
      this.hasIndex.set(mal, ok);
      return ok;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return true;
    }
  }

  async item(mal) {
    return this.remember(`item:${mal}`, 300000, async () => {
      const data = await this.catalog(`/api/anime/by-id/${encodeURIComponent(mal)}`);
      return data && data.item ? data.item : null;
    });
  }

  async card(mal) {
    return this.remember(`card:${mal}`, 600000, async () => {
      try {
        return await this.catalog(`/api/cr/card/${encodeURIComponent(mal)}?full=1`);
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        return null;
      }
    });
  }

  card2(item) {
    return {
      mangaId: String(item.mal_id),
      title: titleOf(item),
      image: smallImage(item.cover_image || item.cr_poster || item.thumbnail_1080_url || item.banner_image),
      tags: parseGenres(item.genres_json),
      ageRating: 0,
      medium: 'anime',
    };
  }

  rate(item) {
    return ageFrom(parseGenres(item.genres_json), titleOf(item));
  }

  toTitle(item) {
    const t = this.card2(item);
    t.ageRating = this.rate(item);
    const year = Number(item.season_year) || (item.start_date ? Number(String(item.start_date).slice(0, 4)) : 0);
    const bits = [kindOf(item), year > 0 ? String(year) : ''].filter(Boolean);
    if (bits.length) t.summary = bits.join(' · ');
    t.completed = statusOf(item) === 'COMPLETED';
    const score = Number(item.average_score);
    if (Number.isFinite(score) && score > 0) t.rating = Math.round(score) / 10;
    t.webURL = `${SITE}/anime/${encodeURIComponent(String(item.mal_id))}`;
    return t;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  genreName(request) {
    const tags = request.includedTags || [];
    if (!tags.length) return '';
    const first = String(tags[0].id || tags[0].label || '');
    const hit = GENRES.find((g) => g.toLowerCase() === first.toLowerCase());
    return hit || '';
  }

  async getSearchResults(request, metadata) {
    request = request || {};
    const page = (metadata && Number(metadata.page)) || 1;
    const query = String(request.title || '').trim();
    const genre = this.genreName(request);
    let data;
    if (query) {
      data = await this.catalog(`/api/search?${qs({ q: query, limit: PAGE, page })}`);
    } else if (genre) {
      data = await this.catalog(`/api/anime/genre/${encodeURIComponent(genre.toLowerCase())}?${qs({ limit: PAGE, page })}`);
    } else {
      const feed = FEEDS.find((f) => f.id === request.feed) || FEEDS[0];
      data = await this.catalog(`${feed.path}?${qs({ limit: PAGE, page })}`);
    }
    if (!data) return { results: [] };
    const items = (Array.isArray(data.items) ? data.items : []).filter((i) => i && i.mal_id !== undefined && i.mal_id !== null);
    const flags = await Promise.all(items.map((i) => this.hosted(String(i.mal_id))));
    const results = items.filter((i, n) => flags[n]).map((i) => this.toTitle(i));
    const more = data.has_more === true && items.length > 0;
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async overview(item) {
    try {
      const data = await this.getJSON(`${SEARCH_HOST}/api/search?${qs({ q: item.canonical_title || item.english_title || '', limit: 8, page: 1 })}`);
      const hit = data && Array.isArray(data.items) ? data.items.find((i) => String(i.mal_id) === String(item.mal_id)) : null;
      return hit && hit.overview ? String(hit.overview) : '';
    } catch (e) {
      return '';
    }
  }

  async getMangaDetails(mangaId) {
    const mal = String(mangaId);
    const item = await this.item(mal);
    if (!item) throw new Error(`animeTVplus has no title with id ${mal}`);
    const card = await this.card(mal);
    let desc = card && card.synopsis ? String(card.synopsis) : '';
    if (!desc) desc = await this.overview(item);
    const genres = parseGenres(item.genres_json);
    const info = {
      mangaId: mal,
      title: titleOf(item),
      image: smallImage(item.cover_image || item.cr_poster || item.thumbnail_1080_url),
      banner: bannerImage(item.detail_banner || (card && card.detail_banner) || item.banner_image),
      desc: desc.replace(/\s+\n/g, '\n').trim(),
      status: statusOf(item),
      tags: genres,
      ageRating: this.rate(item),
      medium: 'anime',
      webURL: `${SITE}/anime/${encodeURIComponent(mal)}`,
    };
    if (card && card.poster && !info.image) info.image = smallImage(card.poster);
    const score = Number(item.average_score);
    if (Number.isFinite(score) && score > 0) info.rating = Math.round(score) / 10;
    return { mangaInfo: info };
  }

  async owners(mal) {
    const item = await this.item(mal);
    const plain = [{ owner: mal, name: '' }];
    if (!item) return plain;
    const root = String(item.canonical_mal_id || item.mal_id) === String(item.mal_id);
    if (!root) return plain;
    const card = await this.card(mal);
    const seasons = card && Array.isArray(card.seasons) ? card.seasons : [];
    const out = [];
    const seen = new Set();
    for (const s of seasons) {
      const owner = String((s && s.owner_mal) || '').trim();
      if (!owner || seen.has(owner)) continue;
      seen.add(owner);
      out.push({ owner, name: owner === mal ? '' : String(s.title || '') });
    }
    if (!seen.has(mal)) out.unshift({ owner: mal, name: '' });
    return out.length ? out : plain;
  }

  async episodeNames(owner) {
    return this.remember(`names:${owner}`, 600000, async () => {
      const map = new Map();
      try {
        const first = await this.catalog(`/api/episodes/${encodeURIComponent(owner)}`);
        if (!first) return map;
        let pages = [first];
        const limit = Number(first.limit) || 100;
        const total = Number(first.num_episodes) || 0;
        if (first.has_more && total > limit) {
          const last = Math.min(8, Math.ceil(total / limit));
          const rest = await Promise.all(
            Array.from({ length: last - 1 }, (x, i) => i + 2).map((p) => this.catalog(`/api/episodes/${encodeURIComponent(owner)}?page=${p}`).catch(() => null)),
          );
          pages = pages.concat(rest.filter(Boolean));
        }
        for (const p of pages) {
          for (const e of p.episodes || []) {
            const n = Number(e && e.ep);
            if (!Number.isFinite(n)) continue;
            const had = map.get(n) || {};
            const title = e.title && !/^Episode\s+\d+$/i.test(String(e.title)) ? String(e.title) : '';
            map.set(n, { title: had.title || title, thumb: had.thumb || (e.thumbnail && !e.thumb_fallback ? String(e.thumbnail) : '') });
          }
        }
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      }
      return map;
    });
  }

  async getChapters(mangaId) {
    const mal = String(mangaId);
    const owners = await this.owners(mal);
    const parts = await Promise.all(
      owners.map(async (o) => {
        const index = await this.episodeIndex(o.owner);
        return { o, index };
      }),
    );
    const live = parts.filter((p) => p.index && p.index.length);
    if (!live.length) throw new Error('animeTVplus has no episodes for this title on its own server yet');
    const names = await Promise.all(live.map((p) => this.episodeNames(p.o.owner)));
    const split = live.length > 1;
    const chapters = [];
    live.forEach((p, k) => {
      for (const n of p.index) {
        const info = names[k].get(n) || {};
        const chapter = {
          id: `${p.o.owner}:${n}`,
          name: info.title ? `Episode ${n}: ${info.title}` : `Episode ${n}`,
          number: n,
        };
        if (info.thumb) chapter.thumbnail = thumbImage(info.thumb);
        if (split) {
          chapter.season = k + 1;
          chapter.seasonName = p.o.name || `Season ${k + 1}`;
        }
        chapters.push(chapter);
      }
    });
    chapters.sort((a, b) => (b.season || 0) - (a.season || 0) || b.number - a.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: String(chapterId), mangaId: String(mangaId), pages: [] };
  }

  splitChapter(mangaId, chapterId) {
    const raw = String(chapterId);
    const cut = raw.lastIndexOf(':');
    if (cut > 0) return { owner: raw.slice(0, cut), ep: raw.slice(cut + 1) };
    return { owner: String(mangaId), ep: raw };
  }

  async masterOf(owner, ep, type) {
    const url = `${EDGE}/v/${encodeURIComponent(owner)}/${encodeURIComponent(ep)}/${type}.m3u8`;
    let res;
    try {
      res = await this.send(url, { Accept: '*/*' });
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return null;
    }
    if (res.status !== 200 || String(res.data).indexOf('#EXTM3U') !== 0) return null;
    const heights = [];
    String(res.data).replace(/RESOLUTION=\d+x(\d+)/g, (m, h) => {
      heights.push(Number(h));
      return m;
    });
    return { url, heights };
  }

  async tracks(owner, ep) {
    try {
      const data = await this.getJSON(`${CDN}/${encodeURIComponent(owner)}/${encodeURIComponent(ep)}?tracks=all&format=ass`);
      return data && typeof data === 'object' ? data : null;
    } catch (e) {
      return null;
    }
  }

  subtitleList(data, sdhOnly) {
    const out = [];
    const seen = new Set();
    const tracks = data && Array.isArray(data.tracks) ? data.tracks : [];
    const wanted = tracks
      .filter((t) => t && t.files && t.files.vtt && String(t.role || 'full') !== 'signs' && !/forced|signs/i.test(String(t.label || '')))
      .filter((t) => (sdhOnly ? String(t.role) === 'sdh' && /^eng/i.test(String(t.language || '')) : true));
    wanted.sort((a, b) => Number(/^eng/i.test(String(b.language || ''))) - Number(/^eng/i.test(String(a.language || ''))) || Number(b.default === true) - Number(a.default === true));
    for (const t of wanted) {
      const label = String(t.label || t.language || 'Subtitles');
      if (seen.has(label)) continue;
      seen.add(label);
      const code = String(t.language || '').toLowerCase();
      out.push({ url: String(t.files.vtt), label, language: LANG[code] || code || 'und' });
      if (out.length >= 12) break;
    }
    return out;
  }

  async getVideos(mangaId, chapterId) {
    const { owner, ep } = this.splitChapter(mangaId, chapterId);
    const [sub, dub, data] = await Promise.all([this.masterOf(owner, ep, 'sub'), this.masterOf(owner, ep, 'dub'), this.tracks(owner, ep)]);
    if (!sub && !dub) throw new Error(`animeTVplus has no stream for episode ${ep} of this title yet (its server lists the episode but serves no video)`);
    const ch = data && data.chapters ? data.chapters : null;
    const range = (r) => {
      if (!r || !Number.isFinite(Number(r.start)) || !Number.isFinite(Number(r.end))) return undefined;
      const start = Math.round(Number(r.start) * 1000);
      const end = Math.round(Number(r.end) * 1000);
      return end > start ? { start, end } : undefined;
    };
    const intro = range(ch && ch.intro);
    const outro = range(ch && ch.outro);
    const entries = [];
    const add = (m, label, subtitles) => {
      const tall = m.heights.length ? Math.max.apply(null, m.heights) : 0;
      const quality = m.heights.length === 1 && tall > 0 ? `${tall}p ${label}` : `Auto ${label}`;
      const entry = { url: m.url, quality, server: 'animeTVplus' };
      if (subtitles && subtitles.length) entry.subtitles = subtitles;
      if (intro) entry.intro = intro;
      if (outro) entry.outro = outro;
      entries.push(entry);
    };
    if (sub) add(sub, 'Sub', this.subtitleList(data, false));
    if (dub) add(dub, 'Dub', this.subtitleList(data, true));
    return entries;
  }
}

module.exports = { Source };
