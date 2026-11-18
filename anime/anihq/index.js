const SITE = 'https://anihq.cc';
const VOE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const AJAX = `${SITE}/wp-admin/admin-ajax.php`;
const PAGE_SIZE = 30;

const NO_PLAYER_TAG = ' (No player yet)';
const PROBE_MAX_EPISODES = 24;
const PROBE_CONCURRENCY = 4;
const PROBE_BUDGET_MS = 9000;
const PROBE_TTL_HAS_MS = 60 * 60 * 1000;
const PROBE_TTL_NONE_MS = 15 * 60 * 1000;
const EMPTY_KEY = 'anihq.noplayer.v1';
const EMPTY_TTL_MS = 48 * 60 * 60 * 1000;
const EMPTY_MAX = 400;
const PLAYER_MARKUP = /<[a-z][a-z0-9]*\b[^>]*\sdata-embed-id="[^"]*:[^"]+"/i;

const FEEDS = [
  { id: 'updated', name: 'Latest Updates', params: [['orderby', 'updated'], ['order', 'DESC']] },
  { id: 'popular', name: 'Popular', params: [['orderby', 'popular'], ['order', 'DESC']] },
  { id: 'airing', name: 'Airing Now', params: [['status[]', 'airing'], ['orderby', 'updated'], ['order', 'DESC']] },
  { id: 'rating', name: 'Top Rated', params: [['orderby', 'rating'], ['order', 'DESC']] },
  { id: 'new', name: 'Recently Added', params: [['orderby', 'date'], ['order', 'DESC']] },
  { id: 'tv', name: 'TV Series', params: [['type[]', 'tv'], ['orderby', 'popular'], ['order', 'DESC']] },
  { id: 'movie', name: 'Movies', params: [['type[]', 'movie'], ['orderby', 'popular'], ['order', 'DESC']] },
  { id: 'ova', name: 'OVA', params: [['type[]', 'ova'], ['orderby', 'popular'], ['order', 'DESC']] },
  { id: 'ona', name: 'ONA', params: [['type[]', 'ona'], ['orderby', 'popular'], ['order', 'DESC']] },
  { id: 'special', name: 'Specials', params: [['type[]', 'special'], ['orderby', 'popular'], ['order', 'DESC']] },
  { id: 'az', name: 'A to Z', params: [['orderby', 'title'], ['order', 'ASC']] },
];

const GENRES = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['gore', 'Gore'], ['hentai', 'Hentai'],
  ['horror', 'Horror'], ['mahou-shoujo', 'Mahou Shoujo'], ['mecha', 'Mecha'], ['music', 'Music'], ['mystery', 'Mystery'], ['psychological', 'Psychological'], ['romance', 'Romance'],
  ['sci-fi', 'Sci-fi'], ['shounen', 'Shounen'], ['slice-of-life', 'Slice of life'], ['sports', 'Sports'], ['supernatural', 'Supernatural'], ['thriller', 'Thriller'],
];

const RATED_GENRES = [
  { id: 1366, age: 18 },
  { id: 344, age: 16 },
  { id: 819, age: 16 },
];

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pathPiece(piece) {
  let text = String(piece || '');
  try {
    text = decodeURIComponent(text);
  } catch (e) {
  }
  return encodeURIComponent(text);
}

function form(pairs) {
  return pairs.map((p) => `${encodeURIComponent(p[0])}=${encodeURIComponent(String(p[1]))}`).join('&');
}

function originOf(url) {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(String(url || ''));
  return m ? m[1] : '';
}

function absolute(ref, base) {
  if (/^https?:\/\//i.test(ref)) return ref;
  if (ref.indexOf('//') === 0) return `https:${ref}`;
  if (ref.charAt(0) === '/') return originOf(base) + ref;
  return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + ref;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

function decodeVoePayload(encoded) {
  let s = String(encoded || '').replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  s = s.replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g, '');
  s = App.base64Decode(s);
  let shifted = '';
  for (let i = 0; i < s.length; i++) shifted += String.fromCharCode(s.charCodeAt(i) - 3);
  return JSON.parse(App.base64Decode(shifted.split('').reverse().join('')));
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.nonceValue = '';
    this.nonceAt = 0;
    this.ratings = null;
    this.probed = new Map();
    this.probeBackoffUntil = 0;
    this.emptyBook = null;
  }

  async probe(slug) {
    const hit = this.probed.get(slug);
    if (hit && Date.now() - hit.at < (hit.has ? PROBE_TTL_HAS_MS : PROBE_TTL_NONE_MS)) return hit.has;
    if (Date.now() < this.probeBackoffUntil) return null;
    let response;
    try {
      response = await this.send(`${SITE}/watch/${slug}/`, { once: true });
    } catch (e) {
      return null;
    }
    if (!response) return null;
    if (response.status === 429 || response.status >= 500) {
      this.probeBackoffUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
    if (response.status < 200 || response.status >= 300) return null;
    const has = PLAYER_MARKUP.test(String(response.data || ''));
    this.probed.set(slug, { has, at: Date.now() });
    if (this.probed.size > 600) this.probed.delete(this.probed.keys().next().value);
    return has;
  }

  async probeEpisodes(slugs) {
    const work = mapLimit(slugs, PROBE_CONCURRENCY, (slug) => this.probe(slug));
    work.catch(() => {});
    await Promise.race([work, pause(PROBE_BUDGET_MS)]);
  }

  async loadEmpties() {
    if (this.emptyBook) return this.emptyBook;
    let saved = null;
    try {
      const state = typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null;
      saved = state ? await state.retrieve(EMPTY_KEY) : null;
    } catch (e) {
      saved = null;
    }
    const book = {};
    if (saved && typeof saved === 'object') {
      Object.keys(saved).forEach((key) => {
        if (typeof saved[key] === 'number') book[key] = saved[key];
      });
    }
    this.emptyBook = book;
    return book;
  }

  async markEmpty(slug, empty) {
    const book = await this.loadEmpties();
    if (empty) book[slug] = Date.now();
    else if (book[slug] !== undefined) delete book[slug];
    else return;
    const keys = Object.keys(book);
    if (keys.length > EMPTY_MAX) keys.sort((a, b) => book[a] - book[b]).slice(0, keys.length - EMPTY_MAX).forEach((key) => delete book[key]);
    try {
      const state = typeof App.createSourceStateManager === 'function' ? App.createSourceStateManager() : null;
      if (state) await state.store(EMPTY_KEY, book);
    } catch (e) {
    }
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async send(url, options) {
    const o = options || {};
    const method = o.method || 'GET';
    let last = null;
    const attempts = o.once ? 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const target = attempt && method === 'GET' ? `${url}${url.indexOf('?') >= 0 ? '&' : '?'}r=${attempt}` : url;
        const response = await this.requests.schedule(
          App.createRequest({ url: target, method, headers: Object.assign({ Accept: o.accept || 'text/html,application/xhtml+xml,application/json' }, o.headers || {}), body: o.body })
        );
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) return response;
        last = response;
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
        if (attempt === attempts - 1) throw e;
      }
      if (attempt < attempts - 1) await pause(900 * (attempt + 1));
    }
    return last;
  }

  async text(url, options) {
    const response = await this.send(url, options);
    if (response.status === 404) throw new Error('AniHQ: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AniHQ: HTTP ${response.status}`);
    return String(response.data || '');
  }

  async page(url) {
    const hit = this.pages.get(url);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = this.text(url).catch((e) => {
      this.pages.delete(url);
      throw e;
    });
    this.pages.set(url, { at: Date.now(), promise });
    if (this.pages.size > 24) this.pages.delete(this.pages.keys().next().value);
    return promise;
  }

  async nonce(fresh) {
    if (!fresh && this.nonceValue && Date.now() - this.nonceAt < 20 * 60 * 1000) return this.nonceValue;
    const html = await this.text(fresh ? `${SITE}/?nonce=${Date.now()}` : `${SITE}/`);
    const m = /"search_actions"\s*:\s*"([A-Za-z0-9]+)"/.exec(html);
    if (!m) throw new Error('AniHQ: the site did not give its search key');
    this.nonceValue = m[1];
    this.nonceAt = Date.now();
    return this.nonceValue;
  }

  async advanced(pairs, page) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const nonce = await this.nonce(attempt > 0);
      const response = await this.send(AJAX, {
        method: 'POST',
        accept: 'application/json',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: SITE, Referer: `${SITE}/` },
        body: form([['action', 'advanced_search'], ['nonce', nonce], ['page', page]].concat(pairs)),
      });
      const body = String(response.data || '').trim();
      if (response.status === 403 || body === '-1' || body === '0') {
        this.nonceValue = '';
        continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`AniHQ: search answered HTTP ${response.status}`);
      let json;
      try {
        json = JSON.parse(body);
      } catch (e) {
        throw new Error('AniHQ: the search answer was not JSON');
      }
      if (!json || !json.success || !json.data) throw new Error('AniHQ: the search did not succeed');
      return { html: String(json.data.html || ''), pages: Number(json.data.max_pages) || 0 };
    }
    throw new Error('AniHQ: the search key was refused twice');
  }

  async ratingSets() {
    if (!this.ratings) {
      const promise = (async () => {
        const map = new Map();
        const add = (genre, body) => {
          const rows = JSON.parse(body);
          for (const row of rows) if (row && row.id) map.set(Number(row.id), Math.max(map.get(Number(row.id)) || 0, genre.age));
          return rows.length;
        };
        const read = async (genre, p) => {
          const r = await this.send(`${SITE}/wp-json/wp/v2/anime?genre=${genre.id}&per_page=100&page=${p}&_fields=id`, { accept: 'application/json' });
          if (r.status < 200 || r.status >= 300) throw new Error(`AniHQ: the genre list answered HTTP ${r.status}`);
          return r;
        };
        await Promise.all(
          RATED_GENRES.map(async (genre) => {
            const first = await read(genre, 1);
            const headers = first.headers || {};
            const total = Number(headers['x-wp-totalpages'] || headers['X-WP-TotalPages']) || 0;
            let count = add(genre, String(first.data || ''));
            if (total > 1) {
              const rest = [];
              for (let p = 2; p <= total; p++) rest.push(p);
              const more = await mapLimit(rest, 3, async (p) => String((await read(genre, p)).data || ''));
              for (const body of more) add(genre, body);
            } else if (!total) {
              for (let p = 2; count % 100 === 0 && count > 0 && p <= 40; p++) count = add(genre, String((await read(genre, p)).data || ''));
            }
          })
        );
        return map;
      })().catch((e) => {
        this.ratings = null;
        throw e;
      });
      this.ratings = promise;
    }
    return this.ratings;
  }

  cards(html, ages) {
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('article.anime-card').each((i, article) => {
      const node = $(article);
      const onclick = node.find('button[onclick*="/anime-show/"]').first().attr('onclick') || '';
      const slug = (/\/anime-show\/([^/'"?#]+)/.exec(onclick) || [])[1];
      if (!slug || seen.has(slug)) return;
      const spans = node.find('h3 a span');
      const english = clean(spans.eq(0).text());
      const romaji = clean(node.find('h3 a').first().attr('title'));
      const title = english || romaji;
      if (!title) return;
      seen.add(slug);
      const idMatch = /id="watchlist-(\d+)"/.exec(node.html() || '');
      const card = { mangaId: slug, title, image: node.find('img').first().attr('src') || '', medium: 'anime' };
      const summary = clean(node.find('p.text-muted').first().text());
      if (summary) card.summary = summary;
      card.ageRating = idMatch ? ages.get(Number(idMatch[1])) || 0 : 0;
      results.push(card);
    });
    return results;
  }

  async getSearchResults(request, metadata) {
    const query = clean(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? String(included[0].id || included[0]).toLowerCase() : '';
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    let pairs;
    if (query) pairs = [['s_keyword', query], ['orderby', 'popular'], ['order', 'DESC']];
    else if (tag) {
      if (!GENRES.some((g) => g[0] === tag)) return { results: [], metadata: undefined };
      pairs = [['genre[]', tag], ['orderby', 'popular'], ['order', 'DESC']];
    } else pairs = feed.params;
    const [ages, answer] = await Promise.all([this.ratingSets(), this.advanced(pairs, page)]);
    const results = this.cards(answer.html, ages);
    return { results, metadata: results.length && page < answer.pages ? { page: page + 1 } : undefined };
  }

  async titlePage(mangaId) {
    return this.page(`${SITE}/anime-show/${pathPiece(mangaId)}/`);
  }

  async getMangaDetails(mangaId) {
    const html = await this.titlePage(mangaId);
    const $ = cheerio.load(html);
    const spans = $('main h1 span');
    const english = spans.length ? clean(spans.eq(0).text()) : clean($('main h1').first().text());
    const romaji = clean(spans.eq(1).text());
    const title = english || romaji;
    if (!title) throw new Error('AniHQ: title not found');
    const info = {};
    $('dl > div').each((i, row) => {
      const key = clean($(row).find('dt').first().text());
      const dd = $(row).find('dd').first();
      info[key] = { text: clean(dd.text()), links: dd.find('a').map((j, a) => clean($(a).text())).get().filter(Boolean) };
    });
    const genres = (info.Genres && info.Genres.links) || [];
    const studios = (info.Studios && info.Studios.links) || [];
    const aired = (info.Aired && info.Aired.text) || '';
    const type = (info.Type && info.Type.text) || '';
    let status = 'UNKNOWN';
    if (/\bto\s*\?/.test(aired)) status = 'ONGOING';
    else if (/\bto\b/i.test(aired) || (aired && /^(movie|ova|special|ona)$/i.test(type))) status = 'COMPLETED';
    const postId = this.animeId(html);
    if (postId) {
      try {
        const r = await this.send(`${SITE}/wp-json/wp/v2/anime/${postId}?_fields=class_list`, { accept: 'application/json' });
        const classes = r.status === 200 ? (JSON.parse(String(r.data || '{}')).class_list || []) : [];
        if (classes.indexOf('status-airing') >= 0) status = 'ONGOING';
        else if (classes.indexOf('status-completed') >= 0) status = 'COMPLETED';
      } catch (e) {
        if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      }
    }
    const paragraphs = $('main section')
      .first()
      .find('p')
      .map((i, p) => clean($(p).text()))
      .get()
      .filter((t) => t && !/^\(Source:.*\)$/i.test(t) && !/^No description available\.?$/i.test(t));
    const alsoKnown = [info.Native && info.Native.text, info.Synonyms && info.Synonyms.text, romaji && romaji !== title ? romaji : '']
      .filter((t) => t && t !== 'N/A')
      .join(', ');
    const desc = paragraphs.join('\n\n');
    const out = {
      title,
      image: $('img.anime-main-image').first().attr('src') || '',
      desc: [desc, alsoKnown ? `Also known as: ${alsoKnown}` : ''].filter(Boolean).join('\n\n') || undefined,
      status,
      tags: genres,
      webURL: `${SITE}/anime-show/${pathPiece(mangaId)}/`,
      medium: 'anime',
    };
    if (studios.length) out.author = studios.slice(0, 3).join(', ');
    out.completed = status === 'COMPLETED';
    out.ageRating = genres.some((g) => /^hentai$/i.test(g)) ? 18 : genres.some((g) => /^(ecchi|gore)$/i.test(g)) ? 16 : 0;
    return { mangaInfo: out };
  }

  animeId(html) {
    const $ = cheerio.load(html);
    const active = $('#seasonButtonsContainer button[data-season].bg-accent-2').first().attr('data-season');
    const first = $('#seasonButtonsContainer button[data-season]').first().attr('data-season');
    const fromVar = (/current_post_data_id\s*=\s*(\d+)/.exec(html) || [])[1];
    return active || fromVar || first || '';
  }

  async episodePage(animeId, page) {
    const url = `${AJAX}?action=get_episodes&anime_id=${animeId}&page=${page}&order=asc`;
    const body = await this.text(url, { accept: 'application/json' });
    let json;
    try {
      json = JSON.parse(body);
    } catch (e) {
      throw new Error('AniHQ: the episode list was not JSON');
    }
    if (!json || !json.success || !json.data) throw new Error('AniHQ: the episode list did not succeed');
    return { episodes: Array.isArray(json.data.episodes) ? json.data.episodes : [], pages: Number(json.data.max_episodes_page) || 1 };
  }

  async getChapters(mangaId) {
    const html = await this.titlePage(mangaId);
    const animeId = this.animeId(html);
    if (!animeId) throw new Error('AniHQ: could not find the title id on the page');
    const first = await this.episodePage(animeId, 1);
    const rest = [];
    for (let p = 2; p <= first.pages; p++) rest.push(p);
    const more = await mapLimit(rest, 4, (p) => this.episodePage(animeId, p));
    const rows = first.episodes.concat(...more.map((m) => m.episodes));
    const seen = new Set();
    const chapters = [];
    for (const row of rows) {
      const slug = (/\/watch\/([^/?#]+)/.exec(String(row.url || '')) || [])[1];
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const number = parseFloat(row.meta_number);
      const name = clean(row.number) || clean(row.title) || (Number.isFinite(number) ? `Episode ${number}` : 'Episode');
      const chapter = { id: slug, chapterId: slug, name };
      if (Number.isFinite(number)) chapter.number = number;
      const minutes = parseInt(clean(row.duration), 10);
      if (minutes > 0 && /m/i.test(clean(row.duration))) chapter.duration = minutes * 60;
      chapters.push(chapter);
    }
    if (!chapters.length) throw new Error('AniHQ has no episodes for this title yet');
    chapters.sort((a, b) => (b.number === undefined ? -1 : b.number) - (a.number === undefined ? -1 : a.number));
    try {
      if (chapters.length <= PROBE_MAX_EPISODES) await this.probeEpisodes(chapters.map((c) => pathPiece(c.id)));
      const book = await this.loadEmpties();
      const now = Date.now();
      chapters.forEach((chapter) => {
        const key = pathPiece(chapter.id);
        const seen = this.probed.get(key);
        const fresh = seen && now - seen.at < (seen.has ? PROBE_TTL_HAS_MS : PROBE_TTL_NONE_MS);
        const empty = fresh ? !seen.has : book[key] !== undefined && now - book[key] < EMPTY_TTL_MS;
        if (empty) chapter.name += NO_PLAYER_TAG;
      });
    } catch (e) {
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  players(html) {
    const $ = cheerio.load(html);
    const found = [];
    const seen = new Set();
    $('[data-embed-id]').each((i, el) => {
      const raw = String($(el).attr('data-embed-id') || '');
      let target = '';
      try {
        target = clean(App.base64Decode(raw.slice(raw.indexOf(':') + 1)));
      } catch (e) {
        return;
      }
      if (!/^https?:\/\//i.test(target)) return;
      const group = $(el).closest('.player-dub').length ? 'dub' : 'sub';
      const key = `${group}|${target}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ group, url: target });
    });
    return found;
  }

  async voe(embedUrl) {
    let url = embedUrl;
    let referer = `${SITE}/`;
    let origin = originOf(embedUrl);
    for (let hop = 0; hop < 5; hop++) {
      const response = await this.send(url, { headers: { Referer: referer, 'User-Agent': VOE_UA } });
      const location = response.headers && (response.headers.location || response.headers.Location);
      if (response.status >= 300 && response.status < 400 && location) {
        url = absolute(location, url);
        origin = originOf(url);
        continue;
      }
      if (response.status === 404) throw new Error('VOE no longer has this video');
      if (response.status < 200 || response.status >= 300) throw new Error(`VOE answered HTTP ${response.status}`);
      const body = String(response.data || '');
      const jump = /window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/.exec(body);
      if (jump && body.length < 4000 && body.indexOf('application/json') < 0) {
        url = jump[1];
        origin = originOf(url);
        referer = 'https://voe.sx/';
        continue;
      }
      const $ = cheerio.load(body);
      const json = $('script[type="application/json"]').first().text().trim();
      if (!json) {
        if (/altcha|confirm you|captcha|verify/i.test(body.slice(0, 20000))) throw new Error('VOE asked for a human check');
        throw new Error('VOE gave no video data (the video may have been removed)');
      }
      const data = decodeVoePayload(JSON.parse(json)[0]);
      let source = clean(data && data.source);
      let type = 'hls';
      if (!/^https?:\/\//i.test(source)) {
        const mp4 = Array.isArray(data && data.fallback) ? data.fallback.find((f) => f && /^https?:\/\//i.test(String(f.file || ''))) : null;
        if (!mp4) throw new Error('VOE gave no stream address');
        source = String(mp4.file);
        type = 'mp4';
      }
      return { url: source, type, headers: { Referer: `${origin}/` } };
    }
    throw new Error('VOE sent too many redirects');
  }

  async getVideos(mangaId, chapterId) {
    let html;
    try {
      html = await this.page(`${SITE}/watch/${pathPiece(chapterId)}/`);
    } catch (e) {
      if (/HTTP 404|not found/i.test(String(e.message))) throw new Error('AniHQ has no such episode');
      throw e;
    }
    const players = this.players(html);
    const slug = pathPiece(chapterId);
    this.probed.set(slug, { has: players.length > 0, at: Date.now() });
    await this.markEmpty(slug, players.length === 0).catch(() => {});
    if (!players.length) throw new Error('AniHQ lists this episode with no player yet, so the site has no stream for it');
    const kind = (host) => (/(^|\.)voe\./i.test(host) ? 'VOE' : /mixdrop|mxdrop/i.test(host) ? 'MixDrop' : '');
    let challenge = null;
    let lastError = '';
    const label = (group) => (group === 'dub' ? 'Auto Dub' : 'Auto Hardsub');
    const skipped = [];
    const resolved = await Promise.all(
      players.map(async (player) => {
        const host = originOf(player.url).replace(/^https?:\/\//i, '');
        const server = kind(host);
        if (!server) {
          if (skipped.indexOf(host) < 0) skipped.push(host);
          return null;
        }
        if (server === 'MixDrop') return { player, server, video: { url: player.url, type: 'embed' } };
        try {
          return { player, server, video: await this.voe(player.url) };
        } catch (e) {
          if (e && e.kind === 'challenge') challenge = e;
          lastError = String((e && e.message) || e);
          if (/human check/i.test(lastError)) return { player, server, video: { url: player.url, type: 'embed' } };
          return null;
        }
      })
    );
    const entries = resolved.filter(Boolean).map((r) => {
      const entry = { url: r.video.url, quality: label(r.player.group), type: r.video.type, server: r.server };
      if (r.video.headers) entry.headers = r.video.headers;
      return entry;
    });
    const order = { VOE: 0, MixDrop: 1 };
    const rank = (e) => (e.type === 'embed' ? 100 : 0) + (order[e.server] === undefined ? 9 : order[e.server]) * 2 + (/Dub/.test(e.quality) ? 1 : 0);
    entries.sort((a, b) => rank(a) - rank(b));
    if (!entries.length) {
      if (challenge) throw challenge;
      throw new Error(`AniHQ: none of this episode's ${players.length} players gave a video${lastError ? ` (${lastError})` : skipped.length ? ` (it uses ${skipped.join(', ')}, which this extension does not open)` : ''}`);
    }
    return entries;
  }
}

module.exports = { Source };
