const SITE_BASE = 'https://renascans.net';
const API_BASE = `${SITE_BASE}/api/v1`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PER_PAGE = 30;
const COVER_WIDTH = 300;
const DETAIL_COVER_WIDTH = 480;

const FEEDS = [
  { id: 'newest', name: 'Latest Update' },
  { id: 'popular', name: 'Most Popular' },
  { id: 'rating', name: 'Top Rated' },
  { id: 'chapters', name: 'Most Chapters' },
  { id: 'title', name: 'A-Z' },
];

const BLOCKED_GENRES = new Set(['shotacon', 'shota', 'lolicon', 'loli']);
const BLOCKED_PARAM = 'loli,lolicon,shota,shotacon';

const ADULT_GENRE = /^(adult|hentai|smut|erotica|nsfw|18\+|mature romance|sexual content)$/i;
const SUGGESTIVE_GENRE = /^(mature|ecchi|borderline h)$/i;

function blockedKey(value) {
  return String(value === undefined || value === null ? '' : value)
    .toLowerCase()
    .replace(/[\s-]+/g, '');
}

function isBlockedGenre(genre) {
  return BLOCKED_GENRES.has(blockedKey(genre));
}

function hasBlockedGenre(list) {
  return Array.isArray(list) && list.some(isBlockedGenre);
}

function cleanText(text) {
  return (text === undefined || text === null ? '' : String(text)).replace(/\s+/g, ' ').trim();
}

function creditName(value) {
  const text = cleanText(value);
  return /^(-+|n\/a|unknown|none|\?)$/i.test(text) ? '' : text;
}

function descriptionText(raw) {
  if (!raw) return '';
  const frag = cheerio.load(`<div id="ikn-root">${raw}</div>`);
  frag('br').replaceWith('\n');
  const root = frag('#ikn-root');
  const paragraphs = root.find('> p');
  let text;
  if (paragraphs.length > 0) {
    const parts = [];
    paragraphs.each((_, el) => {
      const t = frag(el).text().replace(/[ \t]+/g, ' ').trim();
      if (t) parts.push(t);
    });
    text = parts.join('\n\n');
  } else {
    text = root.text();
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function mapStatus(status) {
  const s = (status || '').toUpperCase();
  if (s === 'ONGOING') return 'ONGOING';
  if (s === 'COMPLETED') return 'COMPLETED';
  if (s === 'HIATUS') return 'HIATUS';
  if (s === 'DROPPED' || s === 'CANCELLED') return 'CANCELLED';
  return 'UNKNOWN';
}

function ageRatingOf(tags) {
  if (tags.some((t) => ADULT_GENRE.test(t))) return 18;
  if (tags.some((t) => SUGGESTIVE_GENRE.test(t))) return 16;
  return undefined;
}

function coverOf(raw, width) {
  const value = cleanText(raw);
  if (!value) return '';
  let path = '';
  const wrapped = /^https?:\/\/images\.weserv\.nl\/\?(?:[^#]*&)?url=([^&#]+)/.exec(value);
  const source = wrapped ? decodeURIComponent(wrapped[1]) : value;
  const sized = /\/uploads\/_img\/\d+\/(.+)$/.exec(source);
  if (sized) path = sized[1];
  else {
    const plain = /\/uploads\/(.+)$/.exec(source);
    if (plain) path = plain[1];
  }
  if (!path) return /^https?:\/\//.test(value) ? value : '';
  return `${SITE_BASE}/uploads/_img/${width}/${path}`;
}

function parseItem(p) {
  const tags = (p.genres || []).map(cleanText).filter(Boolean);
  const manga = {
    mangaId: p.slug,
    title: cleanText(p.title) || p.slug,
    image: coverOf(p.cover, COVER_WIDTH),
    tags,
    webURL: `${SITE_BASE}/manga/${p.slug}`,
    medium: 'comics',
  };
  if (mapStatus(p.status) === 'COMPLETED') manga.completed = true;
  const age = ageRatingOf(tags);
  if (age) manga.ageRating = age;
  return manga;
}

function chapterDisplayName(ch) {
  const title = cleanText(ch.title);
  const base = title || `Chapter ${ch.chapter_number}`;
  if (!ch.is_locked) return base;
  if (typeof ch.coins === 'number' && ch.coins > 0) return `${base} (Locked, ${ch.coins} coins)`;
  return `${base} (Locked)`;
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) return headers[keys[i]];
  }
  return undefined;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const genres = await this.requestJSON(`${API_BASE}/genres`);
      const seen = new Set();
      const tags = [];
      (Array.isArray(genres) ? genres : []).forEach((g) => {
        const label = cleanText(g && g.title);
        if (!label || isBlockedGenre(label)) return;
        const id = label.toLowerCase();
        if (seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Renascans getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };
    const page = Math.max(1, (metadata && metadata.page) || 1);
    const params = [`limit=${PER_PAGE}`, `offset=${(page - 1) * PER_PAGE}`];

    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    params.push(`sort=${feed.id}`);

    const query = ((request && request.title) || '').trim();
    if (query) params.push(`q=${encodeURIComponent(query)}`);

    const included = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean).map((id) => String(id).toLowerCase());
    if (included.some(isBlockedGenre)) return { results: [], metadata: undefined };
    if (included.length > 0) params.push(`genres=${encodeURIComponent(included.join(','))}`);

    const excluded = ((request && request.excludedTags) || []).map((t) => t && t.id).filter(Boolean).map((id) => String(id).toLowerCase());
    BLOCKED_PARAM.split(',').forEach((g) => {
      if (excluded.indexOf(g) === -1) excluded.push(g);
    });
    params.push(`exclude_genres=${encodeURIComponent(excluded.join(','))}`);

    const response = await this.requestRaw(`${API_BASE}/manga?${params.join('&')}`);
    const list = JSON.parse(response.data);
    const items = Array.isArray(list) ? list : [];
    const results = items
      .filter((p) => p && p.slug && !hasBlockedGenre(p.genres) && !/novel/i.test(p.type || ''))
      .map(parseItem);
    const total = parseInt(headerValue(response.headers, 'x-total-count'), 10);
    const more = Number.isNaN(total) ? items.length >= PER_PAGE : (page - 1) * PER_PAGE + items.length < total;
    return { results, metadata: more && items.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const post = await this.requestManga(mangaId);
    const tags = (post.genres || []).map(cleanText).filter(Boolean);
    const credits = [];
    [post.author, post.artist].forEach((value) => {
      const name = creditName(value);
      if (name && credits.indexOf(name) === -1) credits.push(name);
    });
    const status = mapStatus(post.status);
    const info = {
      title: cleanText(post.title) || mangaId,
      image: coverOf(post.cover, DETAIL_COVER_WIDTH),
      desc: descriptionText(post.description),
      status,
      tags,
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`,
      medium: 'comics',
    };
    if (credits.length > 0) info.author = credits.join(' / ');
    if (status === 'COMPLETED') info.completed = true;
    const age = ageRatingOf(tags);
    if (age) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const post = await this.requestManga(mangaId);
    const raw = post.chapters;
    if (!Array.isArray(raw)) throw new Error(`No chapter list in the response for ${mangaId}`);
    const seen = new Set();
    const chapters = [];
    raw.forEach((ch) => {
      if (!ch || ch.id === undefined || ch.id === null) return;
      const id = String(ch.id);
      if (seen.has(id)) return;
      seen.add(id);
      const chapter = {
        id,
        chapterId: id,
        name: chapterDisplayName(ch),
        number: typeof ch.chapter_number === 'number' ? ch.chapter_number : parseFloat(ch.chapter_number) || 0,
      };
      const time = Date.parse(ch.created_at);
      if (!Number.isNaN(time)) chapter.time = time;
      chapters.push(chapter);
    });
    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const [, data] = await Promise.all([
      this.requestManga(mangaId),
      this.requestJSON(`${API_BASE}/chapters/${encodeURIComponent(chapterId)}`),
    ]);
    const content = data && Array.isArray(data.content) ? data.content : [];
    if (content.length === 0) {
      if (data && (data.is_locked || data.unlocked === false)) {
        const price = typeof data.coins === 'number' && data.coins > 0 ? ` (${data.coins} coins)` : '';
        throw new Error(`Renascans: this chapter is locked${price}, it cannot be read without buying it on the site`);
      }
      throw new Error('Renascans: no pages for this chapter (not published yet)');
    }
    const pages = content.map((p) => (/^https?:\/\//.test(p) ? p : `${SITE_BASE}/uploads/${String(p).replace(/^\/+/, '')}`));
    return { id: chapterId, mangaId, pages };
  }

  async requestManga(mangaId) {
    const post = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}`);
    if (!post || post.id === undefined || post.id === null) throw new Error(`Could not find series data for ${mangaId}`);
    if (hasBlockedGenre(post.genres)) throw new Error('title not available');
    return post;
  }

  async requestRaw(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) throw new Error(`Renascans HTTP ${response.status} for ${url}`);
    return response;
  }

  async requestJSON(url) {
    return JSON.parse((await this.requestRaw(url)).data);
  }
}

module.exports = { Source };
