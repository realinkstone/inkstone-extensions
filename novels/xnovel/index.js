const SITE = 'https://xnovel.me';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CHAPTER_PAGE = 120;
const CHAPTER_BATCH = 8;
const MAX_CHAPTER_PAGES = 400;
const TAG_BATCH = 30;
const TAG_CACHE_MAX = 4000;

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Hot Novels' },
  { id: 'completed', name: 'Completed' },
];

const GENRES = [
  ['action', 'Action'], ['adult', 'Adult'], ['adventure', 'Adventure'], ['anime_&_comics', 'Anime & Comics'], ['comedy', 'Comedy'], ['drama', 'Drama'], ['eastern', 'Eastern'],
  ['ecchi', 'Ecchi'], ['fan_fiction', 'Fan-Fiction'], ['fantasy', 'Fantasy'], ['game', 'Game'], ['gender_bender', 'Gender-Bender'], ['harem', 'Harem'], ['historical', 'Historical'],
  ['horror', 'Horror'], ['isekai', 'Isekai'], ['josei', 'Josei'], ['lgbt+', 'LGBT+'], ['litrpg', 'LitRPG'], ['magic', 'Magic'], ['magical_realism', 'Magical-Realism'],
  ['martial_arts', 'Martial-Arts'], ['mature', 'Mature'], ['mecha', 'Mecha'], ['military', 'Military'], ['modern_life', 'Modern-Life'], ['mystery', 'Mystery'], ['other', 'Other'],
  ['psychological', 'Psychological'], ['reincarnation', 'Reincarnation'], ['romance', 'Romance'], ['school_life', 'School-Life'], ['sci_fi', 'Sci-fi'], ['seinen', 'Seinen'],
  ['shoujo', 'Shoujo'], ['shoujo_ai', 'Shoujo-Ai'], ['shounen', 'Shounen'], ['shounen_ai', 'Shounen-Ai'], ['slice_of_life', 'Slice-of-Life'], ['smut', 'Smut'], ['sports', 'Sports'],
  ['supernatural', 'Supernatural'], ['system', 'System'], ['thriller', 'Thriller'], ['tragedy', 'Tragedy'], ['urban', 'Urban'], ['video_games', 'Video-Games'], ['war', 'War'],
  ['wuxia', 'Wuxia'], ['xianxia', 'Xianxia'], ['xuanhuan', 'Xuanhuan'], ['yaoi', 'Yaoi'], ['yuri', 'Yuri'],
];

const GENRE_LABELS = {};
GENRES.forEach(([key, label]) => {
  GENRE_LABELS[key] = label;
});

const EXPLICIT_GENRES = ['adult', 'smut'];
const SUGGESTIVE_GENRES = ['mature', 'ecchi'];
const EXPLICIT_TAG =
  /^(r_?18|incest|rape|reverse_rape|rape_victim_becomes_lover|bdsm|netorare|first_time_intercourse|masturbation|exhibitionism|voyeurism|futanari|prostitutes|sex_friends|sexual_cultivation_technique|lolicon|shotacon)$|^s[*_]?e?xual_abuse$/;
const SUGGESTIVE_TAG = /^(nudity|seduction|adultery|breast_fetish)$/;
const BLOCKED_TAG = /lolicon|shotacon|^loli_|_loli$|^shota_|_shota$/;

function oneLine(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function toMs(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  const text = String(value == null ? '' : value).trim();
  if (!text) return undefined;
  if (/^\d{10,}$/.test(text)) return Number(text);
  const parsed = Date.parse(text);
  return isFinite(parsed) ? parsed : undefined;
}

function decodeQwik(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Xnovel answered something that is not JSON');
  }
  const objs = data && data._objs;
  if (!Array.isArray(objs) || data._entry === undefined) throw new Error('Xnovel changed its page data format');
  const cache = {};
  const ref = (r) => {
    if (typeof r !== 'string') return r;
    const index = parseInt(r, 36);
    if (!(index >= 0) || index >= objs.length) return r;
    if (Object.prototype.hasOwnProperty.call(cache, index)) return cache[index];
    const value = objs[index];
    if (value === null || typeof value !== 'object') {
      cache[index] = value;
      return value;
    }
    let out;
    if (Array.isArray(value)) {
      out = [];
      cache[index] = out;
      for (let i = 0; i < value.length; i++) out.push(ref(value[i]));
    } else {
      out = {};
      cache[index] = out;
      Object.keys(value).forEach((k) => {
        out[k] = ref(value[k]);
      });
    }
    return out;
  };
  return ref(data._entry);
}

function findLoader(decoded, test) {
  const loaders = decoded && decoded.loaders;
  if (loaders && typeof loaders === 'object') {
    const keys = Object.keys(loaders);
    for (let i = 0; i < keys.length; i++) {
      const v = loaders[keys[i]];
      if (v && typeof v === 'object' && test(v)) return v;
    }
  }
  return null;
}

function genreKeys(d) {
  return asList(d && d.info_meta_Genre).map((g) => String(g).toLowerCase());
}

function tagKeys(d) {
  return asList(d && d.info_meta_Tag).map((t) => String(t).toLowerCase());
}

function isBlocked(tags) {
  return tags.some((t) => BLOCKED_TAG.test(t));
}

function ageRatingOf(genres, tags) {
  if (genres.some((g) => EXPLICIT_GENRES.indexOf(g) >= 0) || tags.some((t) => EXPLICIT_TAG.test(t))) return 18;
  if (genres.some((g) => SUGGESTIVE_GENRES.indexOf(g) >= 0) || tags.some((t) => SUGGESTIVE_TAG.test(t))) return 16;
  return 0;
}

function genreLabel(key) {
  if (GENRE_LABELS[key]) return GENRE_LABELS[key];
  const words = String(key).replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

function coverUrl(d) {
  const path = String((d && d.urlCoverOri) || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return SITE + (path.charAt(0) === '/' ? '' : '/') + path;
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'dropped' || s === 'cancelled' || s === 'canceled') return 'CANCELLED';
  return 'UNKNOWN';
}

function viewsOf(d) {
  let total = 0;
  asList(d && d.views).forEach((v) => {
    if (v && typeof v.count === 'number') total += v.count;
  });
  return total || undefined;
}

function lastChapterNumber(d) {
  const last = asList(d && d.chaptersNodes_last)[0];
  const n = last && last.data ? Number(last.data.ch_index) : NaN;
  return isFinite(n) && n > 0 ? n : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.tagCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([key, label]) => ({ id: key, label }));
  }

  async send(request, what) {
    const response = await this.requests.schedule(request);
    if (response.status === 404) throw new Error(`Xnovel: ${what} not found (HTTP 404)`);
    if (response.status < 200 || response.status >= 300) throw new Error(`Xnovel: HTTP ${response.status} for ${what}`);
    return String(response.data == null ? '' : response.data);
  }

  async route(path, test, what) {
    const text = await this.send(App.createRequest({ url: SITE + path, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }), what);
    const loader = findLoader(decodeQwik(text), test);
    if (!loader) throw new Error(`Xnovel: ${what} came back without its data`);
    return loader;
  }

  async graphql(query, variables) {
    const text = await this.send(
      App.createRequest({
        url: SITE + '/n2/',
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: variables || {} }),
      }),
      'the site api',
    );
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      throw new Error('Xnovel api answered something that is not JSON');
    }
    if (!body || body.errors || !body.data) {
      const first = body && body.errors && body.errors[0];
      throw new Error(`Xnovel api: ${oneLine(first && first.message) || 'no data'}`);
    }
    return body.data;
  }

  async tagsFor(ids) {
    const wanted = ids.filter((id) => /^\d+$/.test(id) && !this.tagCache.has(id));
    for (let i = 0; i < wanted.length; i += TAG_BATCH) {
      const chunk = wanted.slice(i, i + TAG_BATCH);
      const query = 'query { ' + chunk.map((id, j) => `n${j}: get_NovelsNode(id: "${id}") { id data { N_id info_meta_Genre info_meta_Tag } }`).join(' ') + ' }';
      let data;
      try {
        data = await this.graphql(query);
      } catch (e) {
        console.error('Xnovel tag read failed: ' + (e && e.message));
        continue;
      }
      if (this.tagCache.size > TAG_CACHE_MAX) this.tagCache.clear();
      chunk.forEach((id, j) => {
        const node = data['n' + j];
        const d = node && node.data;
        if (d) this.tagCache.set(id, { genres: genreKeys(d), tags: tagKeys(d) });
      });
    }
    return this.tagCache;
  }

  card(d, known) {
    const id = String((d && d.N_id) || '').trim();
    const title = oneLine(d && d.N_title);
    if (!id || !title) return null;
    const genres = genreKeys(d);
    const tags = d.info_meta_Tag !== undefined ? tagKeys(d) : known ? known.tags : [];
    if (isBlocked(tags)) return null;
    const status = mapStatus(d.info_meta_Status);
    const card = {
      mangaId: id,
      title,
      image: coverUrl(d),
      tags: genres.map(genreLabel).filter(Boolean),
      webURL: SITE + (d.N_Path || '/' + id),
      medium: 'novel',
      ageRating: ageRatingOf(genres, tags),
    };
    const author = asList(d.info_meta_Author).map(oneLine).filter(Boolean).join(', ');
    if (author) card.author = author;
    const summary = oneLine(d.info_descText);
    if (summary) card.summary = summary.length > 280 ? summary.slice(0, 277) + '...' : summary;
    const chapters = lastChapterNumber(d);
    if (chapters) card.chapters = chapters;
    const views = viewsOf(d);
    if (views) card.views = views;
    if (status === 'COMPLETED') card.completed = true;
    const created = toMs(d.date_create);
    if (created && created < 4e12) card.releaseDate = new Date(created).toISOString();
    return card;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = oneLine(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feedId = FEEDS.some((f) => f.id === (request && request.feed)) ? request.feed : 'latest';
    const included = asList(request && request.includedTags)
      .map((t) => {
        const raw = String((t && t.id) || t || '').trim();
        const byKey = GENRES.find(([key]) => key === raw.toLowerCase() || key === raw.toLowerCase().replace(/-/g, '_'));
        const byLabel = GENRES.find(([, label]) => label.toLowerCase() === String((t && t.label) || raw).toLowerCase());
        return (byKey || byLabel || [''])[0];
      })
      .filter(Boolean);

    const plainFeed = !query && !included.length && (feedId === 'popular' || feedId === 'completed');
    let items;
    let more;
    if (plainFeed) {
      const loader = await this.route(`/${feedId}/q-data.json?page=${page}`, (v) => v.result && Array.isArray(v.result.items), 'the list');
      items = asList(loader.result.items);
      more = items.length >= 20;
    } else {
      let path = `/search/q-data.json?word=${encodeURIComponent(query)}&page=${page}`;
      if (included.length) path += '&genres=' + included.map((k) => encodeURIComponent(k)).join(',');
      const loader = await this.route(path, (v) => v.json && Array.isArray(v.json.items), 'the search');
      items = asList(loader.json.items);
      const paging = loader.json.paging || {};
      more = items.length >= 36 || Number(paging.next) > 0;
    }
    const rows = items.map((it) => it && it.data).filter(Boolean);
    let known = null;
    if (plainFeed && rows.length) {
      try {
        known = await this.tagsFor(rows.map((d) => String(d.N_id || '')));
      } catch (e) {
        console.error('Xnovel tag read failed: ' + (e && e.message));
      }
    }
    let results = [];
    rows.forEach((d) => {
      const c = this.card(d, known ? known.get(String(d.N_id)) : null);
      if (c) results.push(c);
    });
    if (query) {
      const lower = query.toLowerCase();
      const rank = (c) => (c.title.toLowerCase() === lower ? 0 : c.title.toLowerCase().indexOf(lower) === 0 ? 1 : 2);
      results = [0, 1, 2].reduce((all, r) => all.concat(results.filter((c) => rank(c) === r)), []);
    }
    return { results, metadata: rows.length && more ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const id = String(mangaId || '').trim();
    if (!/^\d+$/.test(id)) throw new Error('Xnovel: bad title id');
    const data = await this.graphql(
      'query($id: String!) { node: get_NovelsNode(id: $id) { id data { N_id N_title N_Path info_descText info_meta_Author info_meta_Genre info_meta_Tag info_meta_Status urlCoverOri date_create views { field count } } } }',
      { id },
    );
    const d = data.node && data.node.data;
    if (!d || !oneLine(d.N_title)) throw new Error('Xnovel: title not found');
    const genres = genreKeys(d);
    const tags = tagKeys(d);
    if (isBlocked(tags)) throw new Error('Xnovel: this title is not available');
    const status = mapStatus(d.info_meta_Status);
    const info = {
      title: oneLine(d.N_title),
      image: coverUrl(d),
      desc: String(d.info_descText || '').replace(/\r/g, '').trim() || undefined,
      status,
      tags: genres.map(genreLabel).filter(Boolean),
      webURL: SITE + (d.N_Path || '/' + id),
      medium: 'novel',
      completed: status === 'COMPLETED',
      ageRating: ageRatingOf(genres, tags),
    };
    const author = asList(d.info_meta_Author).map(oneLine).filter(Boolean).join(', ');
    if (author) info.author = author;
    const views = viewsOf(d);
    if (views) info.views = views;
    return { mangaInfo: info };
  }

  async chapterPages(id, pages) {
    const vars = {};
    const decl = [];
    const body = [];
    pages.forEach((p, i) => {
      vars['s' + i] = { N_id: id, size: CHAPTER_PAGE, page: p, sortBy: 'asc' };
      decl.push(`$s${i}: NovelsChaptersList_Select`);
      body.push(`p${i}: get_NovelsChaptersList(select: $s${i}) { paging { total pages page size } items { id data { ch_id ch_index ch_title date_create } } }`);
    });
    const data = await this.graphql(`query(${decl.join(', ')}) { ${body.join(' ')} }`, vars);
    return pages.map((p, i) => {
      const list = data['p' + i];
      if (!list) throw new Error('Xnovel: a chapter page is missing');
      return list;
    });
  }

  async getChapters(mangaId) {
    const id = String(mangaId || '').trim();
    if (!/^\d+$/.test(id)) throw new Error('Xnovel: bad title id');
    const first = (await this.chapterPages(id, [1]))[0];
    const lists = [first];
    let floor = Number(first.paging && first.paging.total) || 0;
    let hint = Number(first.paging && first.paging.pages) || 1;
    let lastCount = asList(first.items).length;
    let next = 2;
    while (lastCount >= CHAPTER_PAGE && next <= MAX_CHAPTER_PAGES) {
      const upTo = Math.min(MAX_CHAPTER_PAGES, Math.max(hint, next + CHAPTER_BATCH - 1));
      const groups = [];
      for (let p = next; p <= upTo; p += CHAPTER_BATCH) {
        const group = [];
        for (let q = p; q < p + CHAPTER_BATCH && q <= upTo; q++) group.push(q);
        groups.push(group);
      }
      const answers = await Promise.all(groups.map((g) => this.chapterPages(id, g)));
      answers.forEach((a) =>
        a.forEach((l) => {
          lists.push(l);
          floor = Math.max(floor, Number(l.paging && l.paging.total) || 0);
          hint = Math.max(hint, Number(l.paging && l.paging.pages) || 0);
        }),
      );
      const lastList = answers[answers.length - 1];
      lastCount = asList(lastList[lastList.length - 1].items).length;
      next = upTo + 1;
    }
    const rows = [];
    const seen = new Set();
    lists.forEach((list) => {
      asList(list && list.items).forEach((it) => {
        const c = it && it.data;
        const chapterId = String((c && c.ch_id) || (it && it.id) || '').trim();
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);
        const number = Number(c.ch_index);
        const row = { id: chapterId, chapterId, name: oneLine(c.ch_title) || (isFinite(number) ? `Chapter ${number}` : `Chapter ${rows.length + 1}`) };
        if (isFinite(number)) row.number = number;
        const time = toMs(c.date_create);
        if (time) row.time = time;
        rows.push(row);
      });
    });
    if (!rows.length) throw new Error('Xnovel has no chapters for this title yet');
    if (rows.length < floor) throw new Error(`Xnovel: read ${rows.length} of ${floor} chapters, try again`);
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const id = String(mangaId || '').trim();
    const chapter = String(chapterId || '').trim();
    if (!/^\d+$/.test(id) || !/^\d+$/.test(chapter)) throw new Error('Xnovel: bad chapter id');
    const loader = await this.route(`/${id}/${chapter}/q-data.json`, (v) => v.chapterNode && v.chapterNode.data, 'the chapter');
    const sources = asList(loader.chapterNode.data.sourcesNode_list);
    let best = '';
    sources.forEach((s) => {
      const content = s && s.data ? s.data.content : null;
      const paragraphs = Array.isArray(content) ? content : typeof content === 'string' ? content.split(/\n+/) : [];
      const text = paragraphs
        .map((p) => String(p == null ? '' : p).replace(/ /g, ' ').replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean)
        .join('\n\n');
      if (text.length > best.length) best = text;
    });
    if (best.length < 40) throw new Error('Xnovel has no text for this chapter yet');
    return { id: chapter, mangaId: id, pages: [], text: best };
  }
}

module.exports = { Source };
