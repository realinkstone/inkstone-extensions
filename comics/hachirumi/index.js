const SITE = 'https://hachirumi.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const NAME = 'Hachirumi Scans';
const PAGE_SIZE = 30;
const CACHE_MS = 600000;

const FEEDS = [
  { id: 'latest', name: 'Recently Updated', path: '/' },
  { id: 'series', name: 'Series', path: '/series/' },
  { id: 'oneshots', name: 'Oneshots', path: '/oneshots/' },
  { id: 'az', name: 'A to Z', path: '/' },
  { id: 'nsfw', name: 'NSFW', path: '/nsfw/' },
];

const SUGGESTIVE = /\b(ecchi|lewd|sex|sexy|sexual|sexuality|erotic\w*|boobs?|oppai|breasts?|tits|nude|naked|underwear|panties|bikini|fetish|seduc\w*|succubus|virgin|dick|milf|hentai|bdsm|porn\w*|horny|lust\w*)\b/i;
const SOCIAL = /(twitter|pixiv|fanbox|fantia|booth|website|instagram|youtube|bsky|bluesky|skeb|patreon|ci-en|linktree|tumblr|facebook|\bx\b)/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function codePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch (e) {
    return '';
  }
}

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(text) {
  return plain(text).replace(/\s+/g, ' ').trim();
}

function cleanDescription(html) {
  let s = String(html || '');
  s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (m, inner) => {
    const t = oneLine(inner);
    return t.length < 40 && SOCIAL.test(t) ? '' : m;
  });
  s = s.replace(/<img\b[^>]*>/gi, '').replace(/\r/g, '');
  return plain(s).length ? s.trim() : undefined;
}

function encodePiece(piece) {
  let p = String(piece);
  let query = '';
  const q = p.indexOf('?');
  if (q >= 0) {
    query = p.slice(q);
    p = p.slice(0, q);
  }
  try {
    p = decodeURIComponent(p);
  } catch (e) {
  }
  return encodeURIComponent(p) + query;
}

function coverUrl(path) {
  const m = /^(\/media\/manga\/.+\/)([^\/]+?)(?:_blur)?\.(?:png|jpe?g|gif|webp)$/i.exec(String(path || ''));
  if (!m) return path ? SITE + path : '';
  const name = m[2];
  return SITE + m[1] + (/^(\d{4,6}|\d{1,2})$/.test(name) ? name + '_shrunk.webp' : name + '.webp');
}

function ageOf(title, nsfw) {
  if (nsfw) return 18;
  return SUGGESTIVE.test(title) ? 16 : 0;
}

function parseCards(html) {
  const text = String(html || '');
  const parts = text.split('<div class="card h-100 text-center">');
  const cards = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const slug = /href="\/read\/manga\/([^\/"]+)\/"/.exec(chunk);
    if (!slug) continue;
    const cover = /(?:data-src|src)="(\/media\/manga\/[^"]+)"/.exec(chunk);
    const titleTag = /<h7 class="card-title">\s*<a [^>]*>([\s\S]*?)<\/a>/.exec(chunk);
    const alt = /alt="Cover for ([^"]*)"/.exec(chunk);
    const title = oneLine(titleTag ? titleTag[1] : alt ? alt[1] : '');
    if (!title) continue;
    cards.push({ slug: slug[1], title, key: title.toLowerCase(), cover: cover ? cover[1] : '', nsfw: /badge-danger[^>]*>\s*NSFW/i.test(chunk) });
  }
  if (parts.length > 1 && cards.length < (parts.length - 1) / 2) throw new Error(`${NAME}: the list page changed and its titles could not be read`);
  return cards;
}

function unique(cards) {
  const seen = new Set();
  return cards.filter((c) => (seen.has(c.slug) ? false : (seen.add(c.slug), true)));
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
    this.series = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return [];
  }

  async get(path, accept) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: accept } }));
        if (response.status < 502 || response.status > 504) {
          if (response.status === 404) throw new Error(`${NAME}: not found (HTTP 404)`);
          if (response.status < 200 || response.status >= 300) throw new Error(`${NAME}: HTTP ${response.status}`);
          return response.data;
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || String(e && e.message).indexOf(NAME) === 0) throw e;
      }
      await pause(700);
    }
    throw new Error(`${NAME}: HTTP ${last ? last.status : 0}`);
  }

  listPage(path) {
    const hit = this.pages.get(path);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = this.get(path, 'text/html').then(parseCards);
    this.pages.set(path, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(path) && this.pages.get(path).promise === promise) this.pages.delete(path);
    });
    return promise;
  }

  async nsfwSlugs() {
    const cards = await this.listPage('/nsfw/');
    return new Set(cards.map((c) => c.slug));
  }

  toResult(card, nsfw) {
    const flagged = card.nsfw || nsfw.has(card.slug);
    const result = { mangaId: card.slug, title: card.title, image: coverUrl(card.cover), medium: 'comics', ageRating: ageOf(card.title, flagged) };
    return result;
  }

  async cardsFor(query, feed) {
    if (query) {
      const [all, flagged] = await Promise.all([this.listPage('/'), this.listPage('/nsfw/')]);
      const words = query.split(/\s+/).filter(Boolean);
      return unique(all.concat(flagged)).filter((c) => {
        const hay = (c.title + ' ' + c.slug.replace(/[-_]+/g, ' ')).toLowerCase();
        return words.every((w) => hay.indexOf(w) >= 0);
      });
    }
    if (feed.id === 'az') {
      const [all, flagged] = await Promise.all([this.listPage('/'), this.listPage('/nsfw/')]);
      return unique(all.concat(flagged)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    }
    return this.listPage(feed.path);
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title).toLowerCase();
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const [nsfw, cards] = await Promise.all([this.nsfwSlugs(), this.cardsFor(query, feed)]);
    const start = (page - 1) * PAGE_SIZE;
    const slice = cards.slice(start, start + PAGE_SIZE);
    return { results: slice.map((c) => this.toResult(c, nsfw)), metadata: start + PAGE_SIZE < cards.length ? { page: page + 1 } : undefined };
  }

  seriesData(slug) {
    const hit = this.series.get(slug);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.get(`/api/series/${encodeURIComponent(slug)}/`, 'application/json').then((body) => {
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        throw new Error(`${NAME} answered something that is not JSON`);
      }
      if (!data || typeof data.chapters !== 'object') throw new Error(`${NAME}: title not found`);
      return data;
    });
    this.series.set(slug, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.series.get(slug) && this.series.get(slug).promise === promise) this.series.delete(slug);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const [d, nsfw] = await Promise.all([this.seriesData(mangaId), this.nsfwSlugs()]);
    const title = oneLine(d.title);
    if (!title) throw new Error(`${NAME}: title not found`);
    const author = oneLine(d.author);
    const artist = oneLine(d.artist);
    const info = {
      title,
      image: coverUrl(d.cover),
      status: 'UNKNOWN',
      webURL: `${SITE}/read/manga/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
      ageRating: ageOf(title, nsfw.has(mangaId)),
    };
    const desc = cleanDescription(d.description);
    const groups = Object.keys(d.groups || {}).map((id) => oneLine(d.groups[id])).filter(Boolean);
    if (desc) info.desc = desc;
    else if (groups.length) info.desc = `Scanlated by ${groups.join(', ')}.`;
    if (author || artist) info.author = author && artist && author !== artist ? `${author}, ${artist}` : author || artist;
    return { mangaInfo: info };
  }

  groupOf(d, chapter) {
    const groups = (chapter && chapter.groups) || {};
    for (const list of [chapter && chapter.preferred_sort, d && d.preferred_sort]) {
      for (const id of Array.isArray(list) ? list : []) if (groups[id] && groups[id].length) return String(id);
    }
    for (const id of Object.keys(groups)) if (groups[id] && groups[id].length) return String(id);
    return null;
  }

  async getChapters(mangaId) {
    const d = await this.seriesData(mangaId);
    const rows = [];
    for (const key of Object.keys(d.chapters)) {
      const c = d.chapters[key];
      if (!c || c.is_public === false) continue;
      const gid = this.groupOf(d, c);
      if (gid === null) continue;
      const number = Number(key);
      const title = oneLine(c.title);
      const row = { id: String(key), chapterId: String(key), name: title ? (key === '0' ? title : `Chapter ${key} - ${title}`) : `Chapter ${key}` };
      if (Number.isFinite(number)) row.number = number;
      const group = oneLine(d.groups && d.groups[gid]);
      if (group) row.group = group;
      const volume = String(c.volume === undefined || c.volume === null ? '' : c.volume).trim();
      if (volume && volume !== '0') row.volume = volume;
      const stamp = Number(c.release_date && c.release_date[gid]);
      if (Number.isFinite(stamp) && stamp > 0) row.time = stamp * 1000;
      rows.push(row);
    }
    if (!rows.length) throw new Error(`${NAME} has no chapters for this title yet`);
    rows.sort((a, b) => (b.number || 0) - (a.number || 0));
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const d = await this.seriesData(mangaId);
    const c = d.chapters[chapterId];
    if (!c) throw new Error(`${NAME}: chapter not found`);
    if (c.is_public === false) throw new Error(`${NAME}: this chapter is not public`);
    const gid = this.groupOf(d, c);
    if (gid === null) throw new Error(`${NAME} has no pages for this chapter yet`);
    const base = `${SITE}/media/manga/${encodeURIComponent(mangaId)}/chapters/${encodePiece(c.folder)}/${encodeURIComponent(gid)}/`;
    const pages = c.groups[gid].map((f) => base + encodePiece(f));
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
