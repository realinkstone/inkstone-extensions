const SITE_BASE = 'https://namicomi.com';
const API_BASE = 'https://api.namicomi.com';
const CDN_BASE = 'https://uploads.namicomi.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'views', name: 'Popular', order: 'order[views]=desc' },
  { id: 'latest', name: 'Latest Updates', order: 'order[publishedAt]=desc' },
];

const GENRES = [
  { id: '4-koma', label: '4-Koma' },
  { id: 'action', label: 'Action' },
  { id: 'adaptation', label: 'Adaptation' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'aliens', label: 'Aliens' },
  { id: 'angst', label: 'Angst' },
  { id: 'animals', label: 'Animals' },
  { id: 'anthology', label: 'Anthology' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'crime', label: 'Crime' },
  { id: 'crossdressing', label: 'Crossdressing' },
  { id: 'delinquents', label: 'Delinquents' },
  { id: 'demons', label: 'Demons' },
  { id: 'drama', label: 'Drama' },
  { id: 'drugs', label: 'Drugs' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'full-color', label: 'Full Color' },
  { id: 'gambling', label: 'Gambling' },
  { id: 'genderswap', label: 'Genderswap' },
  { id: 'ghosts', label: 'Ghosts' },
  { id: 'girls-love', label: "Girls' Love" },
  { id: 'gore', label: 'Gore' },
  { id: 'harem', label: 'Harem' },
  { id: 'historical', label: 'Historical' },
  { id: 'horror', label: 'Horror' },
  { id: 'isekai', label: 'Isekai' },
  { id: 'lgbtq', label: 'LGBTQ' },
  { id: 'mafia', label: 'Mafia' },
  { id: 'magic', label: 'Magic' },
  { id: 'magical-girls', label: 'Magical Girls' },
  { id: 'martial-arts', label: 'Martial Arts' },
  { id: 'medical', label: 'Medical' },
  { id: 'mental-disorders', label: 'Mental Disorders' },
  { id: 'military', label: 'Military' },
  { id: 'monster-girls', label: 'Monster Girls' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'music', label: 'Music' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'ninja', label: 'Ninja' },
  { id: 'office-workers', label: 'Office Workers' },
  { id: 'omegaverse', label: 'Omegaverse' },
  { id: 'oneshot', label: 'Oneshot' },
  { id: 'philosophical', label: 'Philosophical' },
  { id: 'physical-abuse', label: 'Physical Abuse' },
  { id: 'police', label: 'Police' },
  { id: 'post-apocalyptic', label: 'Post-Apocalyptic' },
  { id: 'psychological', label: 'Psychological' },
  { id: 'reincarnation', label: 'Reincarnation' },
  { id: 'reverse-harem', label: 'Reverse Harem' },
  { id: 'romance', label: 'Romance' },
  { id: 'samurai', label: 'Samurai' },
  { id: 'school-life', label: 'School Life' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'slice-of-life', label: 'Slice of Life' },
  { id: 'superhero', label: 'Superhero' },
  { id: 'supernatural', label: 'Supernatural' },
  { id: 'survival', label: 'Survival' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'time-travel', label: 'Time Travel' },
  { id: 'tragedy', label: 'Tragedy' },
  { id: 'vampires', label: 'Vampires' },
  { id: 'video-games', label: 'Video Games' },
  { id: 'villainess', label: 'Villainess' },
  { id: 'zombies', label: 'Zombies' },
];

const LANG_QS = 'availableTranslatedLanguages[]=es-es&availableTranslatedLanguages[]=es-419';
const CH_LANG_QS = 'translatedLanguages[]=es-es&translatedLanguages[]=es-419';

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pickLocalized(map) {
  if (!map || typeof map !== 'object') return '';
  const order = ['es-419', 'es-es', 'es', 'en'];
  for (let i = 0; i < order.length; i++) {
    if (map[order[i]]) return cleanText(map[order[i]]);
  }
  const vals = Object.values(map);
  return vals.length > 0 ? cleanText(vals[0]) : '';
}

function coverFromRels(titleId, rels) {
  const list = Array.isArray(rels) ? rels : [];
  const cov = list.find((r) => r && r.type === 'cover_art' && r.attributes && r.attributes.fileName);
  if (!cov) return '';
  return `${CDN_BASE}/covers/${encodeURIComponent(titleId)}/${encodeURIComponent(cov.attributes.fileName)}`;
}

function mapStatus(st) {
  const s = cleanText(st).toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'completed') return 'COMPLETED';
  if (s === 'hiatus') return 'HIATUS';
  if (s === 'cancelled') return 'CANCELLED';
  return 'UNKNOWN';
}

function mapContentAge(rating) {
  const r = cleanText(rating).toLowerCase();
  if (r === 'restricted' || r === 'erotica' || r === 'pornographic') return 18;
  if (r === 'mature' || r === 'suggestive') return 16;
  return 0;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 3 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  getSearchTags() {
    return GENRES.map((g) => ({ id: g.id, label: g.label }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const tags = ((request && request.includedTags) || []).map((t) => cleanText(t && (t.id || t.label)).toLowerCase()).filter(Boolean);
    const page = (metadata && metadata.page) || 1;
    const limit = 24;
    const offset = (page - 1) * limit;

    const params = [
      LANG_QS,
      `limit=${limit}`,
      `offset=${offset}`,
      'includes[]=cover_art',
      'includes[]=organization',
    ];
    tags.forEach((t) => params.push(`includedTags[]=${encodeURIComponent(t)}`));
    if (query) params.push(`title=${encodeURIComponent(query)}`);
    else params.push(feed.order);

    const json = await this.requestJSON(`${API_BASE}/title/search?${params.join('&')}`);
    const list = Array.isArray(json && json.data) ? json.data : [];
    const results = list.map((it) => {
      if (!it || !it.id || !it.attributes) return null;
      const title = pickLocalized(it.attributes.title) || it.attributes.slug || it.id;
      const image = coverFromRels(it.id, it.relationships);
      if (!title || !image) return null;
      const item = {
        mangaId: String(it.id),
        title,
        image,
        referer: SITE_BASE + '/',
        webURL: `${SITE_BASE}/en/title/${encodeURIComponent(it.id)}/${encodeURIComponent(it.attributes.slug || it.id)}`,
        medium: 'comics',
      };
      const age = mapContentAge(it.attributes.contentRating);
      if (age) item.ageRating = age;
      return item;
    }).filter(Boolean);

    const total = Number(json && json.meta && json.meta.total) || 0;
    const hasNext = offset + limit < total && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const json = await this.requestJSON(
      `${API_BASE}/title/${encodeURIComponent(mangaId)}?includes[]=cover_art&includes[]=organization&includes[]=tag`
    );
    const d = json && json.data;
    if (!d || !d.attributes) throw new Error('NamiComi: title not found');
    const attr = d.attributes;
    const title = pickLocalized(attr.title) || attr.slug || mangaId;
    const desc = pickLocalized(attr.description) || title;
    const image = coverFromRels(d.id, d.relationships);
    const rels = Array.isArray(d.relationships) ? d.relationships : [];
    const authors = rels
      .filter((r) => r && r.type === 'organization' && r.attributes && r.attributes.name)
      .map((r) => cleanText(r.attributes.name))
      .filter((n, i, a) => n && a.indexOf(n) === i);
    const tags = rels
      .filter((r) => r && r.type === 'tag' && r.attributes && r.attributes.name)
      .map((r) => pickLocalized(r.attributes.name))
      .filter((t, i, a) => t && a.indexOf(t) === i);
    const status = mapStatus(attr.publicationStatus);
    const info = {
      title,
      image,
      referer: SITE_BASE + '/',
      author: authors.join(', '),
      desc,
      status,
      completed: status === 'COMPLETED',
      tags,
      webURL: `${SITE_BASE}/en/title/${encodeURIComponent(d.id)}/${encodeURIComponent(attr.slug || d.id)}`,
      medium: 'comics',
    };
    const age = mapContentAge(attr.contentRating);
    if (age) info.ageRating = age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const rows = [];
    const seen = new Set();
    const limit = 100;
    for (let offset = 0; offset < 1000; offset += limit) {
      const json = await this.requestJSON(
        `${API_BASE}/chapter?titleId=${encodeURIComponent(mangaId)}&${CH_LANG_QS}&order[chapter]=desc&limit=${limit}&offset=${offset}`
      );
      const list = Array.isArray(json && json.data) ? json.data : [];
      list.forEach((c) => {
        if (!c || !c.id || !c.attributes) return;
        const cid = String(c.id);
        if (seen.has(cid)) return;
        seen.add(cid);
        const a = c.attributes;
        const numText = a.chapter ? String(a.chapter) : '';
        const chTitle = cleanText(a.name);
        const name = numText
          ? (chTitle ? `Capítulo ${numText} - ${chTitle}` : `Capítulo ${numText}`)
          : (chTitle || 'Capítulo');
        const num = parseFloat(numText);
        const time = a.publishAt ? Date.parse(a.publishAt) : undefined;
        rows.push({
          id: cid,
          chapterId: cid,
          name,
          number: Number.isFinite(num) ? num : 0,
          time: Number.isFinite(time) ? time : undefined,
        });
      });
      const total = Number(json && json.meta && json.meta.total) || 0;
      if (list.length === 0 || offset + limit >= total) break;
    }
    rows.sort((a, b) => a.number - b.number);
    let last = -Infinity;
    return rows.map((r) => {
      let number = r.number;
      if (number <= last) number = Math.round((last + 0.0001) * 10000) / 10000;
      last = number;
      const ch = { id: r.id, chapterId: r.id, name: r.name, number };
      if (r.time !== undefined) ch.time = r.time;
      return ch;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this.requestJSON(`${API_BASE}/images/chapter/${encodeURIComponent(chapterId)}?newQualities=true`);
    const data = json && json.data;
    if (!data || !data.baseUrl || !data.hash) throw new Error('NamiComi returned no pages for this chapter');
    const list = Array.isArray(data.source) && data.source.length > 0 ? data.source : (Array.isArray(data.low) ? data.low : []);
    const quality = Array.isArray(data.source) && data.source.length > 0 ? 'source' : 'low';
    const prefix = `${data.baseUrl}/chapter/${encodeURIComponent(chapterId)}/${encodeURIComponent(data.hash)}/${quality}`;
    const pages = list.map((p) => p && p.filename ? `${prefix}/${encodeURIComponent(p.filename)}` : '').filter(Boolean);
    if (pages.length === 0) throw new Error('NamiComi returned no pages for this chapter');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }

  async requestJSON(url) {
    const response = await this.requests.schedule(App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`NamiComi HTTP ${response.status}`);
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
