const API = 'https://be.aryplus.tv';
const IMAGES = 'https://images.aryplus.tv/';
const CLIENT_KEY = 'ak_37515186786306625012043079404171';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const COUNTRY = 'PK';
const PAGE_SIZE = 20;
const CACHE_MS = 5 * 60 * 1000;
const DIGITAL = 'https://arydigital.tv';
const LONG_CACHE_MS = 6 * 60 * 60 * 1000;

const FEEDS = [
  { id: 'dramas', name: 'Dramas', category: 'dramas' },
  { id: 'latest', name: 'Latest on ARY Plus', category: 'latest on ary plus' },
  { id: 'telefilms', name: 'Telefilms', category: 'telefilms' },
];

const GENRES = [
  { id: 'romance', label: 'Romance' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'suspense', label: 'Suspense' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'crime', label: 'Crime' },
  { id: 'horror', label: 'Horror' },
  { id: 'tragedy', label: 'Tragedy' },
  { id: 'social', label: 'Social' },
  { id: 'religious', label: 'Religious' },
  { id: 'sports', label: 'Sports' },
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'bingeworthy', label: 'Bingeworthy' },
  { id: 'gems', label: 'Gems' },
];

function imageUrl(path) {
  const p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return IMAGES + p.replace(/^\/+/, '');
}

function ageOf(text) {
  const n = parseInt(String(text || '').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n)) return 0;
  if (n >= 18) return 18;
  if (n >= 16) return 16;
  return 0;
}

function playable(s) {
  return s && s._id && s.drmEnabled !== true && s.isLive !== true;
}

const ACRONYMS = ['ARY', 'OST', 'TV', 'PTV', 'FM', 'DJ', 'UK', 'USA', 'UAE', 'PSL', 'CID', 'GM'];
function prettyTitle(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!/[A-Za-z]/.test(t) || /[a-z]/.test(t)) return t;
  return t.replace(/[A-Za-z][A-Za-z']*/g, (w) => (ACRONYMS.indexOf(w) !== -1 ? w : w.charAt(0) + w.slice(1).toLowerCase()));
}

function minutesOf(value) {
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value).trim();
  let seconds = 0;
  if (/^\d+(?::\d+){1,2}$/.test(text)) {
    const parts = text.split(':').map(Number);
    seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  } else if (/^\d+(?:\.\d+)?$/.test(text)) seconds = parseFloat(text);
  return Math.round(seconds / 60);
}

function secondsOf(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  let seconds = 0;
  if (/^\d+(?::\d+){1,2}$/.test(text)) {
    const parts = text.split(':').map(Number);
    seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  } else if (/^\d+(?:\.\d+)?$/.test(text)) seconds = parseFloat(text);
  return seconds > 0 ? Math.round(seconds) : undefined;
}

function createdOf(id) {
  const m = /^([0-9a-f]{8})[0-9a-f]{16}$/i.exec(String(id || ''));
  if (!m) return undefined;
  const ms = parseInt(m[1], 16) * 1000;
  return ms > Date.UTC(2020, 0, 1) && ms < Date.now() + 86400000 ? ms : undefined;
}

function squash(text) {
  let t = String(text || '').toLowerCase();
  if (typeof t.normalize === 'function') t = t.normalize('NFKD');
  return t.replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

function distance(a, b) {
  let row = [];
  for (let j = 0; j <= b.length; j++) row.push(j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next.push(Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    row = next;
  }
  return row[b.length];
}

function sameTitle(a, b) {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 12 && y.length >= 12 && x.replace(/\D/g, '') === y.replace(/\D/g, '') && distance(x, y) <= 1;
}

function samePerson(a, b) {
  const x = squash(a);
  const y = squash(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const wa = String(a).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const wb = String(b).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const small = wa.length <= wb.length ? wa : wb;
  const big = wa.length <= wb.length ? wb : wa;
  if (small.length >= 2 && small.every((w) => big.indexOf(w) !== -1)) return true;
  return x.length >= 8 && x[0] === y[0] && distance(x, y) <= 2;
}

function isClip(s) {
  if (/\bOST\b|teaser|trailer|promo/i.test(String(s && s.title))) return true;
  const mins = minutesOf(s && s.duration);
  return !!s && s.seriesType === 'singleVideo' && mins > 0 && mins < 20;
}

const LANGUAGE_NAMES = { en: 'English', ur: 'Urdu', ar: 'Arabic', hi: 'Hindi', pa: 'Punjabi', fr: 'French', es: 'Spanish', tr: 'Turkish' };

function describeMaster(text) {
  let height = 0;
  for (const m of String(text || '').matchAll(/RESOLUTION=\d+x(\d+)/g)) height = Math.max(height, parseInt(m[1], 10));
  const languages = [];
  for (const m of String(text || '').matchAll(/#EXT-X-MEDIA:TYPE=SUBTITLES[^\n]*/g)) {
    const code = (/LANGUAGE="([^"]+)"/i.exec(m[0]) || [])[1] || '';
    const name = LANGUAGE_NAMES[code.toLowerCase().slice(0, 2)] || (code ? code.toUpperCase() : 'Subtitles');
    if (languages.indexOf(name) === -1) languages.push(name);
  }
  return { height, languages };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.ages = new Map();
    this.episodeCache = new Map();
    this.castCache = new Map();
    this.digital = null;
    this.catalogCache = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  card(s) {
    const age = ageOf(s.ageRating);
    this.ages.set(s._id, age);
    const tags = Array.isArray(s.genreId) ? s.genreId.map((g) => (g && g.title) || g).filter((g) => typeof g === 'string') : [];
    const mins = minutesOf(s.duration);
    const count = Number(s.episodeCount);
    const what = s.seriesType === 'singleVideo' ? `Telefilm${mins ? `, ${mins} min` : ''}` : Number.isFinite(count) && count > 0 ? `${count} ${count === 1 ? 'episode' : 'episodes'}` : '';
    const rated = String(s.ageRating || '').trim();
    const summary = [what, rated ? `rated ${rated}` : ''].filter(Boolean).join(', ');
    return {
      mangaId: s._id,
      title: prettyTitle(s.title || s._id),
      image: imageUrl(s.imagePoster || s.imageCoverBig),
      summary: summary || undefined,
      tags: tags.length ? tags : undefined,
      ageRating: age || undefined,
      webURL: `https://aryplus.tv/series/${s._id}`,
      medium: 'anime',
    };
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;
    const page = (metadata && metadata.page) || 1;

    if (/^cast(?:name)?:/.test(feedId) && !query) return this.castTitles(feedId);

    if (query) {
      const data = await this.json(`${API}/api/v2/search`, { method: 'POST', body: { query } });
      const list = Array.isArray(data && data.series) ? data.series : [];
      const results = [];
      const seen = new Set();
      for (const s of list) {
        if (!playable(s) || seen.has(s._id)) continue;
        seen.add(s._id);
        results.push(this.card(s));
      }
      return { results };
    }

    const category = included.length > 0 && included[0] && included[0].id ? String(included[0].id) : (FEEDS.find((f) => f.id === feedId) || FEEDS[0]).category;
    const data = await this.json(`${API}/api/series/byCatID/status/pg/${encodeURIComponent(category)}/${COUNTRY}?limit=${PAGE_SIZE}&page=${page}`);
    const results = [];
    const seen = new Set();
    for (const s of (data && data.series) || []) {
      if (!playable(s) || seen.has(s._id)) continue;
      seen.add(s._id);
      results.push(this.card(s));
    }
    const more = data && data.pagination && data.pagination.hasNextPage === true;
    return { results, metadata: more ? { page: page + 1 } : undefined };
  }

  async html(url) {
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html' } }));
    if (response.status < 200 || response.status >= 300) throw new Error(`ARY Digital: HTTP ${response.status}`);
    return response.data;
  }

  async digitalSlugs() {
    if (this.digital && Date.now() - this.digital.at < LONG_CACHE_MS) return this.digital.list;
    const xml = await this.html(`${DIGITAL}/drama.xml`);
    const list = [];
    for (const m of String(xml).matchAll(/<loc>\s*https:\/\/arydigital\.tv\/drama\/([a-z0-9-]+)\/?\s*<\/loc>/g)) if (list.indexOf(m[1]) === -1) list.push(m[1]);
    this.digital = { at: Date.now(), list };
    return list;
  }

  async digitalCast(title) {
    const slug = (await this.digitalSlugs()).find((x) => sameTitle(x.replace(/-/g, ' '), title));
    if (!slug) return [];
    const $ = cheerio.load(await this.html(`${DIGITAL}/drama/${slug}/`));
    const cards = [];
    $('article.cast-card').each((i, el) => {
      const card = $(el);
      const name = card.find('h4').first().text().replace(/\s+/g, ' ').trim();
      const path = card.find('a').first().attr('href') || '';
      const src = card.find('img').first().attr('src') || '';
      if (!name) return;
      cards.push({
        name,
        role: card.find('span').first().text().replace(/\s+/g, ' ').trim(),
        path: /^\/pakistani-(?:actors|actresses)\/[a-z0-9-]+\/?$/.test(path) ? path : '',
        image: /^\/_next\/image\/\?url=/.test(src) ? `${DIGITAL}${src}` : /^https:\/\//.test(src) ? src : '',
      });
    });
    return cards;
  }

  async castOf(mangaId, title, names) {
    const hit = this.castCache.get(mangaId);
    if (hit && Date.now() - hit.at < LONG_CACHE_MS) return hit.list;
    let cards = [];
    try {
      cards = await this.digitalCast(title);
    } catch (e) {
      cards = [];
    }
    const used = new Set();
    const list = [];
    const entry = (card, name) => {
      const out = { name: card ? card.name : name };
      if (card && card.image) out.image = card.image;
      if (card && card.role) out.role = card.role;
      out.feed = card && card.path ? `cast:${card.path}` : `castname:${name}`;
      return out;
    };
    for (const name of names) {
      const i = cards.findIndex((c, k) => !used.has(k) && samePerson(c.name, name));
      if (i >= 0) used.add(i);
      list.push(entry(i >= 0 ? cards[i] : null, name));
    }
    cards.forEach((c, k) => {
      if (!used.has(k)) list.push(entry(c, c.name));
    });
    const result = list.slice(0, 30);
    this.castCache.set(mangaId, { at: Date.now(), list: result });
    return result.length ? result : undefined;
  }

  async catalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < CACHE_MS * 6) return this.catalogCache.list;
    const url = (page) => `${API}/api/series/byCatID/status/pg/dramas/${COUNTRY}?limit=${PAGE_SIZE}&page=${page}`;
    const first = await this.json(url(1));
    const total = Math.min(Math.max(Number(first && first.pagination && first.pagination.totalPages) || 1, 1), 40);
    const pages = [first];
    for (let from = 2; from <= total; from += 4) {
      const batch = [];
      for (let page = from; page < from + 4 && page <= total; page++) batch.push(this.json(url(page)).catch(() => null));
      pages.push(...(await Promise.all(batch)));
    }
    const list = [];
    const seen = new Set();
    for (const data of pages) {
      for (const s of (data && data.series) || []) {
        if (!playable(s) || seen.has(s._id)) continue;
        seen.add(s._id);
        list.push(s);
      }
    }
    this.catalogCache = { at: Date.now(), list };
    return list;
  }

  async castTitles(feedId) {
    const found = new Map();
    let name = '';
    if (feedId.indexOf('cast:') === 0) {
      const path = feedId.slice(5);
      if (!/^\/pakistani-(?:actors|actresses)\/[a-z0-9-]+\/?$/.test(path)) throw new Error('ARY Plus: not a cast page');
      try {
        const $ = cheerio.load(await this.html(`${DIGITAL}${path}`));
        name = $('h1').first().text().replace(/\s+/g, ' ').trim();
        const slugs = [];
        $('a[href^="/drama/"]').each((i, el) => {
          const m = /^\/drama\/([a-z0-9-]+)\/?$/.exec($(el).attr('href') || '');
          if (m && slugs.indexOf(m[1]) === -1) slugs.push(m[1]);
        });
        const catalog = slugs.length ? await this.catalog() : [];
        for (const slug of slugs) {
          const s = catalog.find((c) => sameTitle(slug.replace(/-/g, ' '), c.title));
          if (s) found.set(s._id, s);
        }
      } catch (e) {
        found.clear();
      }
      if (!name) name = path.split('/').filter(Boolean).pop().replace(/-/g, ' ');
    } else {
      name = feedId.slice('castname:'.length).trim();
    }
    if (name) {
      try {
        const data = await this.json(`${API}/api/v2/search`, { method: 'POST', body: { query: name } });
        for (const s of Array.isArray(data && data.series) ? data.series : []) {
          if (playable(s) && s.cast_match && !isClip(s) && !found.has(s._id)) found.set(s._id, s);
        }
      } catch (e) {
        if (!found.size) throw e;
      }
    }
    return { results: [...found.values()].map((s) => this.card(s)) };
  }

  async seriesOf(mangaId) {
    return this.json(`${API}/api/series/${encodeURIComponent(mangaId)}`);
  }

  async getMangaDetails(mangaId) {
    const s = await this.seriesOf(mangaId);
    const tags = (Array.isArray(s.genreId) ? s.genreId : []).map((g) => (g && g.title) || g).filter((g) => typeof g === 'string');
    const cast = (Array.isArray(s.cast) ? s.cast : []).filter((n) => typeof n === 'string' && n.trim());
    const age = s.ageRating !== undefined ? ageOf(s.ageRating) : this.ages.get(mangaId) || 0;
    return {
      mangaInfo: {
        title: prettyTitle(s.title || mangaId),
        image: imageUrl(s.imagePoster || s.imageCoverBig),
        banner: imageUrl(s.imageCoverDesktop) || undefined,
        author: cast.join(', ') || undefined,
        cast: await this.castOf(mangaId, s.title, cast),
        desc: String(s.description || '').trim() || undefined,
        status: 'UNKNOWN',
        tags,
        ageRating: age,
        webURL: `https://aryplus.tv/series/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async episodesOf(mangaId) {
    const hit = this.episodeCache.get(mangaId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
    const data = await this.json(`${API}/api/cdn/${encodeURIComponent(mangaId)}`);
    const list = (Array.isArray(data && data.episode) ? data.episode : []).slice();
    await this.addMissing(list);
    this.episodeCache.set(mangaId, { at: Date.now(), list });
    return list;
  }

  async addMissing(list) {
    if (!list.length) return;
    const seen = new Set(list.map((e) => String(e && e._id)));
    const numbered = list.filter((e) => e && e._id && Number.isFinite(Number(e.videoEpNumber))).sort((a, b) => Number(a.videoEpNumber) - Number(b.videoEpNumber));
    const starts = [];
    for (let i = 0; i < numbered.length; i++) {
      const next = numbered[i + 1];
      if (!next || Number(next.videoEpNumber) - Number(numbered[i].videoEpNumber) > 1) starts.push(numbered[i]);
    }
    if (!numbered.length) starts.push(list[list.length - 1]);
    let budget = 80;
    for (const first of starts.slice(-20).reverse()) {
      if (budget <= 0) return;
      let nextId = '';
      try {
        budget--;
        const detail = await this.json(`${API}/api/cdn/ep/${encodeURIComponent(String(first._id))}`);
        nextId = String((detail && detail.episode && detail.episode.nextEpId) || '');
      } catch (e) {
        continue;
      }
      while (nextId && !seen.has(nextId) && budget > 0) {
        budget--;
        let episode = null;
        try {
          const detail = await this.json(`${API}/api/cdn/ep/${encodeURIComponent(nextId)}`);
          episode = detail && detail.episode && detail.episode._id ? detail.episode : null;
        } catch (e) {
          episode = null;
        }
        if (!episode) break;
        seen.add(nextId);
        list.push(episode);
        nextId = String(episode.nextEpId || '');
      }
    }
  }

  async getChapters(mangaId) {
    const s = await this.seriesOf(mangaId);
    if (s.seriesType === 'singleVideo') {
      if (s.drmEnabled === true) throw new Error('ARY Plus: this title is copy protected (DRM) and cannot be played here');
      return [{ id: 'main', chapterId: 'main', name: 'Full telefilm', number: 1, duration: secondsOf(s.duration) }];
    }
    const list = await this.episodesOf(mangaId);
    const rows = [];
    for (const e of list) {
      if (!e || !e._id || e.drmEnabled === true || !e.videoSource) continue;
      const number = Number(e.videoEpNumber);
      const created = Date.parse(e.createdAd || '') || createdOf(e._id);
      rows.push({
        id: String(e._id),
        chapterId: String(e._id),
        name: String(e.title || (Number.isFinite(number) ? `Episode ${number}` : 'Episode')).trim(),
        number: Number.isFinite(number) ? number : undefined,
        time: Number.isFinite(created) ? created : undefined,
        duration: secondsOf(e.videoLength),
      });
    }
    if (!rows.length) throw new Error('ARY Plus has no playable episodes for this title yet');
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getVideos(mangaId, chapterId) {
    let url = '';
    if (chapterId === 'main') {
      const s = await this.seriesOf(mangaId);
      if (s.drmEnabled === true) throw new Error('ARY Plus: this title is copy protected (DRM) and cannot be played here');
      url = String(s.seiresCDN || '');
    } else {
      const list = await this.episodesOf(mangaId);
      const e = list.find((x) => x && String(x._id) === String(chapterId));
      if (e && e.drmEnabled === true) throw new Error('ARY Plus: this episode is copy protected (DRM) and cannot be played here');
      url = e ? String(e.videoSource || '') : '';
    }
    if (!/^https?:\/\//i.test(url)) throw new Error('ARY Plus has no video for this episode yet');

    let info = { height: 0, languages: [] };
    try {
      const master = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { 'User-Agent': UA } }));
      if (master.status === 200) info = describeMaster(master.data);
    } catch (e) {
      info = { height: 0, languages: [] };
    }
    const parts = ['Auto'];
    if (info.height) parts.push(`up to ${info.height}p`);
    let label = parts.join(' ');
    if (info.languages.length) label += `, ${info.languages.join(' and ')} Softsub`;
    return [{ url, quality: label, type: 'hls', server: 'ARY Plus' }];
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async json(url, opts) {
    const headers = { 'User-Agent': UA, Accept: 'application/json', 'x-api-key': CLIENT_KEY };
    const req = { url, method: (opts && opts.method) || 'GET', headers };
    if (opts && opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      req.body = JSON.stringify(opts.body);
    }
    const response = await this.requests.schedule(App.createRequest(req));
    if (response.status === 404) throw new Error('ARY Plus: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`ARY Plus: HTTP ${response.status}`);
    try {
      return JSON.parse(response.data);
    } catch (e) {
      throw new Error('ARY Plus returned a page that is not data');
    }
  }
}

module.exports = { Source };
