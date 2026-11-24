const SITE_BASE = 'https://www.luscious.net';
const API_BASE = `${SITE_BASE}/graphql/nobatch/`;
const SPANISH_LANG_ID = '3';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'popular', name: 'Popular', display: 'rating_all_time' },
  { id: 'latest', name: 'Latest Updates', display: 'date_newest' },
];

const ALBUM_LIST_Q =
  'query AlbumList($input: AlbumListInput!) { album { list(input: $input) { info { page has_next_page } items { id title url cover { url } } } } }';

const ALBUM_GET_Q =
  'query AlbumGet($id: ID!) { album { get(id: $id) { ... on Album { id title description created url cover { url } created_by { display_name name } language { title } tags { text } genres { title } } } } }';

const ALBUM_PICS_Q =
  'query AlbumListOwnPictures($input: PictureListInput!) { picture { list(input: $input) { info { total_pages } items { url_to_original thumbnails { url width } } } } }';

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return SITE_BASE + (u.charAt(0) === '/' ? '' : '/') + u;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async gql(operationName, query, variables) {
    const qs =
      `operationName=${encodeURIComponent(operationName)}` +
      `&query=${encodeURIComponent(query)}` +
      `&variables=${encodeURIComponent(JSON.stringify(variables))}`;
    const response = await this.requests.schedule(App.createRequest({
      url: `${API_BASE}?${qs}`,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SITE_BASE + '/' },
    }));
    if (response.status < 200 || response.status >= 300) throw new Error(`Luscious HTTP ${response.status}`);
    return JSON.parse(response.data);
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const page = (metadata && metadata.page) || 1;

    const filters = [
      { name: 'language_ids', value: `+${SPANISH_LANG_ID}` },
      { name: 'album_type', value: 'manga' },
    ];
    if (query) filters.push({ name: 'search_query', value: query });

    const json = await this.gql('AlbumList', ALBUM_LIST_Q, {
      input: { display: feed.display, filters, page },
    });
    const listObj = json && json.data && json.data.album && json.data.album.list;
    const items = Array.isArray(listObj && listObj.items) ? listObj.items : [];
    const results = items
      .filter((it) => it && it.id && it.title && it.cover && it.cover.url)
      .map((it) => ({
        mangaId: String(it.id),
        title: cleanText(it.title),
        image: absolute(it.cover.url),
        referer: SITE_BASE + '/',
        webURL: absolute(it.url || `/albums/${it.id}/`),
        medium: 'comics',
        ageRating: 18,
      }));
    const hasNext = Boolean(listObj && listObj.info && listObj.info.has_next_page) && results.length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const json = await this.gql('AlbumGet', ALBUM_GET_Q, { id: String(mangaId) });
    const a = json && json.data && json.data.album && json.data.album.get;
    if (!a || !a.id) throw new Error('Luscious: album not found');
    const tags = [];
    (Array.isArray(a.genres) ? a.genres : []).forEach((g) => {
      const t = cleanText(g && g.title);
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    (Array.isArray(a.tags) ? a.tags : []).forEach((g) => {
      const t = cleanText(g && g.text);
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    const author = cleanText(a.created_by && (a.created_by.display_name || a.created_by.name));
    return {
      mangaInfo: {
        title: cleanText(a.title) || mangaId,
        image: absolute(a.cover && a.cover.url),
        referer: SITE_BASE + '/',
        author,
        desc: cleanText(a.description) || cleanText(a.title) || mangaId,
        status: 'COMPLETED',
        completed: true,
        tags,
        webURL: absolute(a.url || `/albums/${mangaId}/`),
        medium: 'comics',
        ageRating: 18,
      },
    };
  }

  async getChapters(mangaId) {
    return [{ id: String(mangaId), chapterId: String(mangaId), name: 'Álbum completo', number: 1 }];
  }

  async getChapterDetails(mangaId, chapterId) {
    const pages = [];
    for (let page = 1; page <= 10; page++) {
      const json = await this.gql('AlbumListOwnPictures', ALBUM_PICS_Q, {
        input: {
          filters: [{ name: 'album_id', value: String(chapterId) }],
          display: 'date_oldest',
          page,
        },
      });
      const listObj = json && json.data && json.data.picture && json.data.picture.list;
      const items = Array.isArray(listObj && listObj.items) ? listObj.items : [];
      items.forEach((p) => {
        let pick = p && p.url_to_original;
        if (!pick && Array.isArray(p && p.thumbnails) && p.thumbnails.length > 0) {
          const sorted = p.thumbnails.slice().sort((a, b) => (Number(b && b.width) || 0) - (Number(a && a.width) || 0));
          pick = sorted[0] && sorted[0].url;
        }
        const u = absolute(pick);
        if (u) pages.push(u);
      });
      const totalPages = Number(listObj && listObj.info && listObj.info.total_pages) || 1;
      if (items.length === 0 || page >= totalPages) break;
    }
    if (pages.length === 0) throw new Error('Luscious returned no pages for this album');
    return { id: chapterId, mangaId, pages, referer: SITE_BASE + '/' };
  }
}

module.exports = { Source };
