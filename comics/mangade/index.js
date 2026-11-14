const SITE = 'https://mangade.io';
const API = 'https://api.mangade.io/api';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'latest', name: 'Latest Added', sort: 'newest' },
  { id: 'popular', name: 'Most Viewed', sort: 'most-viewed' },
  { id: 'top', name: 'Top Rated', sort: 'rating' },
  { id: 'az', name: 'A to Z', sort: 'a-z' },
];

const GENRES = [
  [380, 'romance', 'Romance'], [3, 'fantasy', 'Fantasy'], [2, 'drama', 'Drama'], [387, 'action', 'Action'], [1, 'comedy', 'Comedy'], [388, 'adventure', 'Adventure'],
  [4, 'manhwa', 'Manhwa'], [386, 'webtoons', 'Webtoons'], [401, 'shounen', 'Shounen'], [398, 'shoujo', 'Shoujo'], [406, 'school-life', 'School Life'],
  [409, 'slice-of-life', 'Slice of Life'], [385, 'manhwa-hot', 'Hot Manhwa'], [396, 'supernatural', 'Supernatural'], [383, 'historical', 'Historical'], [421, 'seinen', 'Seinen'],
  [390, 'josei', 'Josei'], [379, 'mature', 'Mature'], [397, 'manhua', 'Manhua'], [395, 'mystery', 'Mystery'], [381, 'adaptation', 'Adaptation'], [407, 'isekai', 'Isekai'],
  [392, 'martial-arts', 'Martial Arts'], [389, 'magic', 'Magic'], [412, 'harem', 'Harem'], [423, 'horror', 'Horror'], [400, 'tragedy', 'Tragedy'], [411, 'ecchi', 'Ecchi'],
  [432, 'sci-fi', 'Sci-Fi'], [428, 'shounen-ai', 'Shounen Ai'], [402, 'reincarnation', 'Reincarnation'], [384, 'smut', 'Smut'], [382, 'adult', 'Adult'],
  [405, 'office-workers', 'Office Workers'], [399, 'manga', 'Manga'], [450, 'shoujo-ai', 'Shoujo Ai'], [439, 'sports', 'Sports'], [434, 'monsters', 'Monsters'],
  [414, 'demons', 'Demons'], [444, 'thriller', 'Thriller'], [403, 'time-travel', 'Time Travel'], [408, 'one-shot', 'One Shot'], [455, 'survival', 'Survival'],
  [391, 'royal-family', 'Royal Family'], [429, 'philosophical', 'Philosophical'], [454, 'yuri', 'Yuri'], [404, 'cooking', 'Cooking'], [449, 'crime', 'Crime'],
  [473, 'mecha', 'Mecha'], [415, 'villainess', 'Villainess'], [453, 'military', 'Military'], [410, 'psychological', 'Psychological'], [448, 'music', 'Music'],
  [442, 'crossdressin', 'Crossdressing'], [393, 'yaoi', 'Yaoi'], [420, 'vampire', 'Vampire'], [427, 'reverse-harem', 'Reverse Harem'], [416, 'medical', 'Medical'],
  [475, 'delinquents', 'Delinquents'], [474, 'ghosts', 'Ghosts'], [460, 'zombies', 'Zombies'], [435, 'superhero', 'Superhero'], [445, 'game', 'Game'], [456, 'police', 'Police'],
  [418, 'super-power', 'Super Power'],
];

const RATE_18 = [382, 384, 488];
const RATE_16 = [379, 411, 458, 436, 483, 422];
const HIDDEN_TAGS = ['completed', 'comic', 'comics', 'man', 'liexing', 'ping-ping-jun', 'my-team-manga', 'moder'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", ndash: '-', mdash: '-' };

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ascii(ch) {
  const map = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u2013': '-', '\u2014': '-', '\u00a0': ' ' };
  return map[ch] !== undefined ? map[ch] : ch;
}

function plain(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (m, n) => ascii(String.fromCharCode(Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => ascii(String.fromCharCode(parseInt(n, 16))))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(text) {
  return plain(text).replace(/\s+/g, ' ').trim();
}

function upperFirst(text) {
  const s = oneLine(text);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function ageOfGenres(ids) {
  if (ids.some((id) => RATE_18.indexOf(id) >= 0)) return 18;
  if (ids.some((id) => RATE_16.indexOf(id) >= 0)) return 16;
  return undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.adult = null;
    this.adultAt = 0;
    this.mature = null;
    this.matureAt = 0;
    this.matureLoading = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([, slug, label]) => ({ id: slug, label }));
  }

  async api(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(App.createRequest({ url: `${API}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'application/json' } }));
        if (response.status !== 429 && (response.status < 502 || response.status > 504)) {
          if (response.status === 404) throw new Error('MangaDE: not found (HTTP 404)');
          if (response.status < 200 || response.status >= 300) throw new Error(`MangaDE: HTTP ${response.status}`);
          let body;
          try {
            body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          } catch (e) {
            throw new Error('MangaDE answered something that is not JSON');
          }
          if (!body || body.success === false) throw new Error(`MangaDE: ${oneLine(body && body.message) || 'the api refused the request'}`);
          return body.data;
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || /MangaDE/.test(String(e.message))) throw e;
      }
      await pause(700);
    }
    throw new Error(`MangaDE: HTTP ${last ? last.status : 0}`);
  }

  async titlesOf(genreIds) {
    const filter = genreIds.map((id) => `genres[]=${id}`).join('&');
    const set = new Set();
    for (let page = 1; page <= 3; page++) {
      const data = await this.api(`/comics?page=${page}&size=1000&${filter}`);
      for (const it of Array.isArray(data && data.list) ? data.list : []) set.add(String(it.id));
      if (!data || page >= Number(data.totalPage || 1)) break;
    }
    return set;
  }

  async ratings() {
    const fresh = (at) => at && Date.now() - at < 1800000;
    if (!fresh(this.adultAt)) {
      let set = null;
      try {
        set = await this.titlesOf(RATE_18);
      } catch (e) {
        await pause(800);
        try {
          set = await this.titlesOf(RATE_18);
        } catch (e2) {
          console.error('MangaDE rating index failed: ' + (e2 && e2.message));
        }
      }
      if (set) {
        this.adult = set;
        this.adultAt = Date.now();
      }
    }
    if (!fresh(this.matureAt) && !this.matureLoading) {
      this.matureLoading = this.titlesOf(RATE_16)
        .then((set) => {
          this.mature = set;
          this.matureAt = Date.now();
        })
        .catch((e) => console.error('MangaDE 16 rating index failed: ' + (e && e.message)))
        .then(() => {
          this.matureLoading = null;
        });
    }
    return { adult: this.adult || new Set(), mature: this.mature || new Set() };
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? GENRES.find((x) => x[1] === String((included[0] && included[0].id) || included[0])) : null;
    let path = `/comics?page=${page}&size=20&sort=${feed.sort}`;
    if (query) path += `&name=${encodeURIComponent(query)}`;
    if (tag) path += `&genres[]=${tag[0]}`;
    const [data, rated] = await Promise.all([this.api(path), this.ratings()]);
    const list = Array.isArray(data && data.list) ? data.list : [];
    const results = [];
    for (const it of list) {
      const title = oneLine(it && it.name);
      if (!it || !it.id || !title) continue;
      const id = String(it.id);
      const card = { mangaId: id, title, image: /^https?:\/\//.test(String(it.image || '')) ? it.image : '', medium: 'comics' };
      if (rated.adult.has(id)) card.ageRating = 18;
      else if (rated.mature.has(id)) card.ageRating = 16;
      results.push(card);
    }
    const total = Number((data && data.totalPage) || 1);
    return { results, metadata: results.length && page < total ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const d = await this.api(`/comics/${encodeURIComponent(mangaId)}/view`);
    const title = oneLine(d && d.name);
    if (!title) throw new Error('MangaDE: title not found');
    const genres = Array.isArray(d.genres) ? d.genres : [];
    const info = {
      title,
      image: /^https?:\/\//.test(String(d.image || '')) ? d.image : '',
      desc: plain(d.description) || undefined,
      status: 'UNKNOWN',
      tags: genres.filter((g) => g && HIDDEN_TAGS.indexOf(String(g.slug)) < 0).map((g) => oneLine(g.name)).filter(Boolean),
      webURL: d.slug ? `${SITE}/comic/${d.slug}-pid${d.id}` : SITE,
      medium: 'comics',
    };
    const age = ageOfGenres(genres.map((g) => Number(g && g.id)));
    if (age !== undefined) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const d = await this.api(`/comics/${encodeURIComponent(mangaId)}/view`);
    const rows = [];
    const seen = new Set();
    for (const c of Array.isArray(d && d.news_chapters) ? d.news_chapters : []) {
      const slug = oneLine(c && c.slug);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const number = Number(c.chapter_number);
      const row = { id: slug, chapterId: slug, name: upperFirst(c.name) || `Chapter ${c.chapter_number}` };
      if (Number.isFinite(number)) row.number = number;
      const time = Date.parse(`${String(c.published_date || '').replace(' ', 'T')}Z`);
      if (Number.isFinite(time)) row.time = time;
      rows.push(row);
    }
    if (!rows.length) throw new Error('MangaDE has no chapters for this title yet');
    rows.sort((a, b) => (b.number || 0) - (a.number || 0) || (b.time || 0) - (a.time || 0));
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const d = await this.api(`/chapters/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/view`);
    const pages = (Array.isArray(d && d.chapter_images) ? d.chapter_images : []).map((x) => String((x && x.image) || '').trim()).filter((u) => /^https?:\/\//.test(u));
    if (!pages.length) throw new Error('MangaDE has no pages for this chapter yet');
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
