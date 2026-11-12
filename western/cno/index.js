const SITE = 'https://cno.to';
const IMG = 'https://image.tmdb.org/t/p/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'movies', name: 'Popular Movies', kind: 'movie', sort: '' },
  { id: 'movies-top', name: 'Top Rated Movies', kind: 'movie', sort: 'top' },
  { id: 'movies-new', name: 'New Movies', kind: 'movie', sort: 'new' },
  { id: 'shows', name: 'Popular Shows', kind: 'tv', sort: '' },
  { id: 'shows-top', name: 'Top Rated Shows', kind: 'tv', sort: 'top' },
  { id: 'shows-new', name: 'New Shows', kind: 'tv', sort: 'new' },
];

const GENRES = {
  action: { label: 'Action', movie: 28, tv: 10759 },
  adventure: { label: 'Adventure', movie: 12, tv: 10759 },
  animation: { label: 'Animation', movie: 16, tv: 16 },
  comedy: { label: 'Comedy', movie: 35, tv: 35 },
  crime: { label: 'Crime', movie: 80, tv: 80 },
  documentary: { label: 'Documentary', movie: 99, tv: 99 },
  drama: { label: 'Drama', movie: 18, tv: 18 },
  family: { label: 'Family', movie: 10751, tv: 10751 },
  fantasy: { label: 'Fantasy', movie: 14, tv: 10765 },
  history: { label: 'History', movie: 36 },
  horror: { label: 'Horror', movie: 27 },
  music: { label: 'Music', movie: 10402 },
  mystery: { label: 'Mystery', movie: 9648, tv: 9648 },
  romance: { label: 'Romance', movie: 10749 },
  'sci-fi': { label: 'Sci-Fi', movie: 878, tv: 10765 },
  thriller: { label: 'Thriller', movie: 53 },
  war: { label: 'War', movie: 10752, tv: 10768 },
  western: { label: 'Western', movie: 37, tv: 37 },
};

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseId(mangaId) {
  const m = /^(movie|tv)~(\d+)$/.exec(String(mangaId || ''));
  if (!m) throw new Error('Cno.to: unknown title id ' + mangaId);
  return { kind: m[1], id: parseInt(m[2], 10) };
}

function ageOfCertificate(raw) {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '');
  if (!c || c === 'NR' || c === 'UNRATED' || c === 'NOTRATED' || c === 'N/A') return undefined;
  if (/^(NC-?17|X|XXX|AO|R-?18|18\+?|18A|ADULT)$/.test(c)) return 18;
  if (/^(R|TV-?MA|MA|MA15\+?|15\+?|16\+?|17\+?|14A|M)$/.test(c)) return 16;
  if (/^(G|PG|PG-?13|TV-?Y7?(-FV)?|TV-?G|TV-?PG|TV-?14|U|UA|12A?|13\+?|7|10)$/.test(c)) return 0;
  return 16;
}

const EXPLICIT_KEYWORDS = /^(softcore|hardcore|pornograph\w*|porn|erotic movie|erotica|sexploitation|pink film|cumshot|blowjob|gangbang|pussy licking|orgy|bukkake|unsimulated sex|explicit sex|anal sex|oral sex|group sex|lesbian sex|hentai)$/i;
const SUGGESTIVE_KEYWORDS = /^(erotic|eroticism|erotic thriller|erotic drama|nudity|female nudity|male nudity|full frontal nudity|sexual arousal|sexual fantasy|sex scene|sexy|seduction|striptease|stripper)$/i;

function ageOfKeywords(keywords) {
  let age;
  for (const k of Array.isArray(keywords) ? keywords : []) {
    const name = clean(k && k.name ? k.name : k);
    if (EXPLICIT_KEYWORDS.test(name)) return 18;
    if (SUGGESTIVE_KEYWORDS.test(name)) age = 16;
  }
  return age;
}

function ageOfTitle(d) {
  const a = ageOfCertificate(d && d.certification);
  const b = ageOfKeywords(d && d.keywords);
  return a === undefined ? b : b === undefined ? a : Math.max(a, b);
}

function shiftOf(pick) {
  const sync = pick && pick.status === 'ready' ? pick.sync : null;
  if (!sync) return 0;
  const offset = Number(sync.offset);
  const scale = Number(sync.scale);
  const confidence = Number(sync.confidence);
  if (!Number.isFinite(offset) || !Number.isFinite(scale) || !Number.isFinite(confidence)) return 0;
  if ((Array.isArray(sync.segments) && sync.segments.length) || Math.abs(scale - 1) >= 5e-4) return 0;
  if (!(confidence >= 0.2 || (confidence >= 0.06 && Math.abs(offset) <= 1.5)) || Math.abs(offset) < 0.15) return 0;
  return Math.round(Math.max(-600, Math.min(600, offset)) * 1000);
}

function hasOwnStream(sources) {
  return (Array.isArray(sources) ? sources : []).some((s) => s && s.kind === 'hls' && s.url);
}

function absolute(url) {
  return /^https?:\/\//i.test(url) ? url : SITE + (url.charAt(0) === '/' ? '' : '/') + url;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await fn(items[at], at);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 20 } });
    this.details = new Map();
    this.probes = new Map();
    this.people = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return Object.keys(GENRES).map((id) => ({ id, label: GENRES[id].label }));
  }

  async call(path, asText) {
    let response = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${SITE}${path}${attempt ? `${path.indexOf('?') >= 0 ? '&' : '?'}r=${Date.now()}` : ''}`;
      response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: asText ? '*/*' : 'application/json' } }));
      if (response.status !== 429 && (response.status < 502 || response.status > 504)) break;
      if (attempt === 0) await pause(1500);
    }
    if (response.status === 404) throw new Error('Cno.to: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`Cno.to: HTTP ${response.status}`);
    if (asText) return String(response.data || '');
    try {
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error('Cno.to answered something that is not JSON');
    }
  }

  async detail(kind, id) {
    const key = `${kind}~${id}`;
    const hit = this.details.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.value;
    const value = await this.call(`/api/${kind}/${id}`);
    this.details.set(key, { at: Date.now(), value });
    if (this.details.size > 40) this.details.delete(this.details.keys().next().value);
    return value;
  }

  async probe(kind, id) {
    const key = `${kind}~${id}`;
    if (this.probes.has(key)) return this.probes.get(key);
    let out = { hls: null, age: undefined };
    try {
      if (kind === 'movie') {
        const d = await this.detail('movie', id);
        out = { hls: hasOwnStream(d.sources), age: ageOfTitle(d) };
      } else {
        try {
          const d = await this.call(`/api/tv/${id}/episode/1/1`);
          out = { hls: hasOwnStream(d.sources), age: ageOfTitle(d.show) };
        } catch (e) {
          if (!/404|not found/i.test(String(e.message))) throw e;
          const d = await this.detail('tv', id);
          out = { hls: false, age: ageOfTitle(d) };
        }
      }
      this.probes.set(key, out);
    } catch (e) {
      console.error('Cno.to probe failed for ' + key + ': ' + (e && e.message));
    }
    return out;
  }

  card(item, probe) {
    if (!item || (item.type !== 'movie' && item.type !== 'tv') || !item.id) return null;
    const title = clean(item.title);
    if (!title) return null;
    const out = {
      mangaId: `${item.type}~${item.id}`,
      title,
      image: item.poster ? `${IMG}w342${item.poster}` : '',
      medium: 'anime',
    };
    const bits = [item.type === 'tv' ? 'Show' : 'Movie', item.year || ''].filter(Boolean);
    if (probe && probe.hls === false) bits.push('no stream');
    out.summary = bits.join(', ');
    if (probe && probe.age !== undefined) out.ageRating = probe.age;
    return out;
  }

  async fill(page, load, keepWithoutStream) {
    const results = [];
    let more = true;
    for (let fetched = 0; more && results.length < 10 && fetched < 3; fetched++) {
      let batch;
      try {
        batch = await load(page);
      } catch (e) {
        if (results.length) break;
        throw e;
      }
      const probes = await pool(batch.items, 10, (it) => this.probe(it.type, it.id));
      batch.items.forEach((it, at) => {
        if (!keepWithoutStream && probes[at].hls === false) return;
        const card = this.card(it, probes[at]);
        if (card && !results.some((r) => r.mangaId === card.mangaId)) results.push(card);
      });
      more = batch.more;
      if (more) page += 1;
    }
    return { results, metadata: more ? { page } : undefined };
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;
    if (query) {
      let data;
      try {
        data = await this.call(`/api/search?q=${encodeURIComponent(query)}&type=multi&page=${page}`);
      } catch (e) {
        if (/404|not found/i.test(String(e.message))) return { results: [], metadata: undefined };
        throw e;
      }
      const items = Array.isArray(data && data.results) ? data.results : [];
      const probes = await pool(items, 10, (it) => this.probe(it.type, it.id));
      const results = items.map((it, at) => this.card(it, probes[at])).filter(Boolean);
      const total = Math.min(Number((data && data.totalPages) || 1), 500);
      return { results, metadata: results.length && page < total ? { page: page + 1 } : undefined };
    }
    if (/^person:\d+$/.test(feedId)) return this.person(Number(feedId.slice(7)), page);
    const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]) : '';
    let genre = '';
    if (tag) {
      const id = GENRES[tag] && GENRES[tag][feed.kind];
      if (!id) return { results: [], metadata: undefined };
      genre = `&genre=${id}`;
    }
    return this.fill(page, async (p) => {
      const data = await this.call(`/api/browse?type=${feed.kind}${feed.sort ? `&sort=${feed.sort}` : ''}${genre}&page=${p}`);
      const items = Array.isArray(data && data.results) ? data.results : [];
      return { items, more: items.length > 0 && p < Math.min(Number((data && data.totalPages) || 1), 500) };
    });
  }

  async person(id, page) {
    let p = this.people.get(id);
    if (!p) {
      p = await this.call(`/api/person/${id}`);
      this.people.set(id, p);
      if (this.people.size > 12) this.people.delete(this.people.keys().next().value);
    }
    const seen = new Set();
    const list = [];
    for (const it of [].concat(Array.isArray(p.knownFor) ? p.knownFor : [], Array.isArray(p.credits) ? p.credits : [])) {
      if (!it || (it.type !== 'movie' && it.type !== 'tv') || !it.id || seen.has(`${it.type}~${it.id}`)) continue;
      seen.add(`${it.type}~${it.id}`);
      list.push(it);
    }
    return this.fill(page, async (n) => ({ items: list.slice((n - 1) * 20, n * 20), more: n * 20 < list.length }));
  }

  async getMangaDetails(mangaId) {
    const { kind, id } = parseId(mangaId);
    const d = await this.detail(kind, id);
    const title = clean(d.title);
    if (!title) throw new Error('Cno.to: title not found');
    const state = String(d.status || '');
    const names = (list) => (Array.isArray(list) ? list : []).map((p) => clean(p && p.name ? p.name : p)).filter(Boolean);
    const makers = kind === 'movie' ? names(d.directors) : names(d.creators);
    const info = {
      title,
      image: d.poster ? `${IMG}w500${d.poster}` : '',
      desc: clean(d.overview) || undefined,
      author: makers.length ? makers.slice(0, 3).join(', ') : undefined,
      status: kind === 'movie' ? 'COMPLETED' : /returning|production|planned|pilot/i.test(state) ? 'ONGOING' : /ended|cancel/i.test(state) ? 'COMPLETED' : 'UNKNOWN',
      tags: (Array.isArray(d.genres) ? d.genres : []).map((g) => clean(g && g.name ? g.name : g)).filter(Boolean),
      webURL: `${SITE}/${kind === 'movie' ? 'movie' : 'show'}/${id}`,
      medium: 'anime',
    };
    info.completed = info.status === 'COMPLETED';
    const cast = [];
    for (const p of Array.isArray(d.cast) ? d.cast.slice(0, 20) : []) {
      if (!p || !p.id || !clean(p.name)) continue;
      const row = { name: clean(p.name), feed: `person:${p.id}` };
      if (p.photo) row.image = `${IMG}w185${p.photo}`;
      if (clean(p.role)) row.role = clean(p.role);
      cast.push(row);
    }
    for (const p of kind === 'movie' && Array.isArray(d.directors) ? d.directors.slice(0, 2) : []) {
      if (!p || !p.id || !clean(p.name) || cast.some((c) => c.feed === `person:${p.id}`)) continue;
      const row = { name: clean(p.name), role: 'Director', feed: `person:${p.id}` };
      if (p.photo) row.image = `${IMG}w185${p.photo}`;
      cast.push(row);
    }
    if (cast.length) info.cast = cast;
    const age = ageOfTitle(d);
    if (age !== undefined) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const { kind, id } = parseId(mangaId);
    if (kind === 'movie') {
      const d = await this.detail('movie', id);
      const own = (Array.isArray(d.sources) ? d.sources : []).find((s) => s && s.kind === 'hls' && s.url);
      if (!own) throw new Error('Cno.to has no stream of its own for this movie (its other players are pages of other sites, which this extension does not open)');
      this.warm(`movie/${id}`, own.url);
      return [{ id: 'movie', chapterId: 'movie', name: 'Full movie', number: 1 }];
    }
    const d = await this.detail('tv', id);
    const seasons = (Array.isArray(d.seasonList) ? d.seasonList : []).filter((s) => s && Number.isFinite(Number(s.number)) && Number(s.number) >= 1 && Number(s.episodes) > 0);
    if (!seasons.length) throw new Error('Cno.to has no episodes for this show');
    const pages = await pool(seasons, 6, async (s) => {
      try {
        return { number: Number(s.number), data: await this.call(`/api/tv/${id}/season/${s.number}`) };
      } catch (e) {
        return { number: Number(s.number), error: e };
      }
    });
    const rows = [];
    for (const page of pages) {
      for (const e of page.data && Array.isArray(page.data.episodes) ? page.data.episodes : []) {
        const n = Number(e && e.episode);
        if (!Number.isFinite(n)) continue;
        const time = Date.parse(e.date || '');
        if (Number.isFinite(time) && time > Date.now() + 36 * 3600 * 1000) continue;
        const heading = clean(e.title);
        const generic = !heading || /^Episode\s+\d+$/i.test(heading);
        const row = { id: `${page.number}:${n}`, chapterId: `${page.number}:${n}`, name: generic ? `Episode ${n}` : `Episode ${n}: ${heading}`, number: n, season: page.number };
        if (!generic) row.title = heading;
        if (Number.isFinite(time)) row.time = time;
        rows.push(row);
      }
    }
    if (!rows.length) {
      const failed = pages.find((p) => p.error);
      if (failed) throw failed.error;
      throw new Error('Cno.to has no aired episodes for this show yet');
    }
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

  warm(key, stream) {
    this.call(`/api/subs/best/${key}/en?stream=${encodeURIComponent(stream)}`).catch(() => {});
  }

  async getVideos(mangaId, chapterId) {
    const { kind, id } = parseId(mangaId);
    let key;
    let sources;
    let next = null;
    let minutes = 0;
    if (kind === 'movie') {
      const d = await this.detail('movie', id);
      key = `movie/${id}`;
      sources = d.sources;
      minutes = Number(d.runtime) || 0;
    } else {
      const m = /^(\d+):(\d+)$/.exec(String(chapterId));
      if (!m) throw new Error('Cno.to: unknown episode id ' + chapterId);
      let d;
      try {
        d = await this.call(`/api/tv/${id}/episode/${m[1]}/${m[2]}`);
      } catch (e) {
        if (/404|not found/i.test(String(e.message))) throw new Error('Cno.to has no such episode');
        throw e;
      }
      key = `tv/${id}/${m[1]}/${m[2]}`;
      sources = d.sources;
      next = d.next && Number.isFinite(Number(d.next.season)) && Number.isFinite(Number(d.next.episode)) ? { season: Number(d.next.season), episode: Number(d.next.episode) } : null;
      minutes = Number(d.episode && d.episode.runtime) || Number(d.show && d.show.runtime) || 0;
    }
    const owns = (Array.isArray(sources) ? sources : []).filter((s) => s && s.kind === 'hls' && s.url);
    if (owns.length && next) {
      const follow = /^(.*\/tv\/\d+\/)\d+\/\d+(.*)$/.exec(owns[0].url);
      if (follow) this.warm(`tv/${id}/${next.season}/${next.episode}`, `${follow[1]}${next.season}/${next.episode}${follow[2]}`);
    }
    if (!owns.length) {
      throw new Error(`Cno.to has no stream of its own for this ${kind === 'movie' ? 'movie' : 'episode'} (its other players are pages of other sites, which this extension does not open)`);
    }
    const relative = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');
    const [masters, subtitles, skips] = await Promise.all([
      Promise.all(owns.map((s) => this.call(relative(s.url), true).catch(() => ''))),
      this.subtitles(key, owns[0].url),
      this.skips(key, minutes),
    ]);
    const shown = subtitles.slice(0, 3).map((s) => s.label);
    const videos = [];
    owns.forEach((s, at) => {
      if (masters[at].indexOf('#EXTM3U') !== 0) return;
      let top = 0;
      for (const h of masters[at].match(/RESOLUTION=\d+x(\d+)/g) || []) top = Math.max(top, Number(h.split('x')[1]) || 0);
      const note = clean(s.note).toLowerCase();
      const dub = s.channel === 'dub' || /\bdub\b/.test(note);
      const burned = !dub && /burned|hardsub/.test(note);
      let quality = top ? `Auto up to ${top}p` : 'Auto';
      if (dub) quality += ', Dub';
      else if (burned) quality += ', Hardsub';
      else if (subtitles.length) quality += `, Softsub: ${shown.join(', ')}${subtitles.length > 3 ? ` and ${subtitles.length - 3} more` : ''}`;
      const video = {
        url: absolute(s.url),
        quality,
        type: 'hls',
        server: clean(s.label) || 'Server 21',
        headers: { 'User-Agent': UA },
      };
      if (!dub && !burned && subtitles.length) video.subtitles = subtitles;
      if (skips.intro) video.intro = skips.intro;
      if (skips.outro) video.outro = skips.outro;
      videos.push(video);
    });
    if (!videos.length) throw new Error("Cno.to's own stream is not ready for this title yet. Try again in a minute.");
    return videos;
  }

  async subtitles(key, stream) {
    let files = [];
    let best = null;
    let shift = 0;
    try {
      const bestPath = `/api/subs/best/${key}/en?stream=${encodeURIComponent(stream)}`;
      let [list, pick] = await Promise.all([this.call(`/api/subs/list/${key}`).catch(() => null), this.call(bestPath).catch(() => null)]);
      for (let wait = 0; wait < 4 && pick && pick.status === 'pending'; wait++) {
        await pause(1000);
        pick = await this.call(bestPath).catch(() => null);
      }
      files = list && Array.isArray(list.files) ? list.files : [];
      best = pick && pick.status === 'ready' && pick.file ? String(pick.file) : null;
      shift = best ? shiftOf(pick) : 0;
    } catch (e) {
      return [];
    }
    const fileUrl = (id) => `${SITE}/api/subs/file/${key}/${id}.vtt`;
    const byLanguage = new Map();
    for (const f of files) {
      if (!f || !f.id || !f.lang) continue;
      const lang = String(f.lang);
      if (!byLanguage.has(lang)) byLanguage.set(lang, []);
      byLanguage.get(lang).push(f);
    }
    for (const list of byLanguage.values()) list.sort((a, b) => (b.synced === true) - (a.synced === true) || (Number(b.rank) || 0) - (Number(a.rank) || 0));
    const out = [];
    const english = byLanguage.get('en') || [];
    const chosen = [];
    if (best) chosen.push({ id: best, shift, label: clean((english.find((f) => String(f.id) === best) || {}).label) || 'English' });
    for (const f of english) {
      if (chosen.length >= 3) break;
      if (!chosen.some((c) => c.id === String(f.id))) chosen.push({ id: String(f.id), label: clean(f.label) || 'English' });
    }
    const taken = new Set();
    for (const c of chosen) {
      let label = c.label;
      for (let n = 2; taken.has(label.toLowerCase()); n++) label = `${c.label} ${n}`;
      taken.add(label.toLowerCase());
      const track = { url: fileUrl(c.id), label, language: 'en', format: 'vtt' };
      if (c.shift) track.offset = c.shift;
      out.push(track);
    }
    const others = [];
    for (const [lang, list] of byLanguage) {
      if (lang === 'en') continue;
      others.push({ url: fileUrl(list[0].id), label: clean(list[0].label) || lang, language: lang, format: 'vtt' });
    }
    others.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    const used = new Set(out.map((s) => s.label.toLowerCase()));
    for (const s of others) {
      let label = s.label;
      for (let n = 2; used.has(label.toLowerCase()); n++) label = `${s.label} ${n}`;
      used.add(label.toLowerCase());
      out.push({ url: s.url, label, language: s.language, format: 'vtt' });
    }
    return out;
  }

  async skips(key, minutes) {
    const out = {};
    if (!(minutes >= 2)) return out;
    try {
      const d = await this.call(`/api/skips/${key}?duration=${Math.round(minutes * 60)}`);
      const range = (r) => (Array.isArray(r) && Number.isFinite(Number(r[0])) && Number.isFinite(Number(r[1])) && Number(r[1]) > Number(r[0]) ? { start: Math.round(Number(r[0]) * 1000), end: Math.round(Number(r[1]) * 1000) } : null);
      const intro = range(d && d.intro);
      const outro = range(d && d.credits);
      if (intro) out.intro = intro;
      if (outro) out.outro = outro;
    } catch (e) {
    }
    return out;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
