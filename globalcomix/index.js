const BASE = 'https://globalcomix.com';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const TYPE_FEEDS = [
  { id: 'comics', name: 'Comics' },
  { id: 'graphic-novels', name: 'Graphic Novels' },
  { id: 'manga', name: 'Manga' },
  { id: 'web-comics', name: 'Webcomics' },
];

function normalizeWhitespace(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function parseSqlTime(text) {
  const m = (text || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  return Date.UTC(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10),
  );
}

function mapComicStatus(statusName) {
  const s = (statusName || '').trim().toLowerCase();
  if (s === 'ongoing') return 'ONGOING';
  if (s === 'cancelled') return 'CANCELLED';
  if (s === 'finished') return 'COMPLETED';
  if (s === 'on hold') return 'HIATUS';
  return 'UNKNOWN';
}

function extractInitialState(html) {
  const marker = 'window.__INITIAL_STATE__';
  const markerIdx = (html || '').indexOf(marker);
  if (markerIdx === -1) throw new Error('__INITIAL_STATE__ not found on page');
  const eqIdx = html.indexOf('=', markerIdx);
  const start = html.indexOf('{', eqIdx);
  const end = html.indexOf('</script>', start);
  if (eqIdx === -1 || start === -1 || end === -1) {
    throw new Error('__INITIAL_STATE__ payload not found');
  }
  let blob = html.slice(start, end).trim();
  if (blob.endsWith(';')) blob = blob.slice(0, -1);
  return JSON.parse(blob);
}

function findQueryData(state, matchFn) {
  const queries = (state && state.queries) || [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (q && Array.isArray(q.queryKey) && matchFn(q.queryKey)) {
      return q.state && q.state.data;
    }
  }
  return null;
}

function extractBrowseItems(state) {
  const data = findQueryData(state, (k) => k[0] === 'search-query' && k[1] === 'browse' && k[2] === 'series');
  const pages = (data && Array.isArray(data.pages) && data.pages) || [];
  const items = [];
  pages.forEach((p) => {
    const results = p && p.data && p.data.payload && p.data.payload.results;
    const arr = results && results.series && results.series.items;
    if (Array.isArray(arr)) items.push(...arr);
  });
  return items;
}

function toPartialManga(item) {
  const manga = {
    mangaId: item.slug || String(item.id),
    title: normalizeWhitespace(item.name) || String(item.id),
    image: item.cover_image_url || '',
    webURL: item.url ? `${BASE}${item.url}` : `${BASE}/c/${item.slug || ''}`,
    medium: 'comics',
  };
  if (item.artist_name) manga.author = normalizeWhitespace(item.artist_name);
  if (typeof item.total_published_releases === 'number') manga.chapters = item.total_published_releases;
  else if (typeof item.total_releases === 'number') manga.chapters = item.total_releases;
  return manga;
}

class Source {
  getSourceFeeds() {
    return [{ id: 'popular', name: 'Popular' }, ...TYPE_FEEDS];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(BASE);
      const state = extractInitialState(html);
      const data = findQueryData(state, (k) => k[0] === 'APP_INIT');
      const results = data && data.data && data.data.payload && data.data.payload.results;
      const genres = (results && results.comic_genres) || [];
      return genres
        .filter((g) => g && g.slug && g.name && g.is_active !== 0 && g.slug !== 'Unknown')
        .map((g) => ({ id: g.slug, label: g.name }));
    } catch (e) {
      console.error('GlobalComix getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }
    if (metadata) return { results: [] };

    const feedId = (request && request.feed) || '';
    const typeSlug = feedId && feedId !== 'popular' ? feedId : '';
    const includedTags = (request && request.includedTags) || [];
    const genreSlug = includedTags[0] && includedTags[0].id;

    let path = '/browse';
    if (typeSlug) path += `/${encodeURIComponent(typeSlug)}`;
    if (genreSlug) path += `/${encodeURIComponent(genreSlug)}`;

    const html = await this.requestHTML(`${BASE}${path}`);
    const state = extractInitialState(html);
    const items = extractBrowseItems(state);

    const query = ((request && request.title) || '').trim().toLowerCase();
    const filtered = query ? items.filter((it) => (it.name || '').toLowerCase().includes(query)) : items;

    return { results: filtered.map(toPartialManga) };
  }

  async getMangaDetails(mangaId) {
    const url = `${BASE}/c/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const state = extractInitialState(html);
    const data = findQueryData(state, (k) => k[0] === 'comicDetailsComic');
    const comic = data && data.data && data.data.payload && data.data.payload.results;
    if (!comic) throw new Error(`Comic details not found for ${mangaId}`);

    const artist = comic.artist || {};
    const author = normalizeWhitespace(artist.roman_name || artist.name || '');
    const status = mapComicStatus(comic.status_name);
    const langInfo = (Array.isArray(comic.comic_langs) && comic.comic_langs[0]) || {};

    const mangaInfo = {
      mangaId,
      title: normalizeWhitespace(comic.name) || mangaId,
      image: comic.image_url || comic.image_medium_url || comic.image_small_url || '',
      desc: normalizeWhitespace(comic.description),
      status,
      webURL: url,
      medium: 'comics',
    };
    if (author) mangaInfo.author = author;
    if (comic.category_name) mangaInfo.tags = [comic.category_name];
    if (typeof comic.total_pageviews === 'number') mangaInfo.views = comic.total_pageviews;
    if (typeof langInfo.total_published_releases === 'number') {
      mangaInfo.chapters = langInfo.total_published_releases;
    } else if (typeof comic.total_releases === 'number') {
      mangaInfo.chapters = comic.total_releases;
    }
    if (comic.year) mangaInfo.releaseDate = String(comic.year);
    if (status === 'COMPLETED') mangaInfo.completed = true;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${BASE}/c/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const state = extractInitialState(html);
    const data = findQueryData(state, (k) => k[0] === 'get-comic-releases');
    const releases = (data && data.data && data.data.payload && data.data.payload.results) || [];

    return releases
      .filter((r) => r && r.key && r.is_published === 1 && r.is_deleted !== 1)
      .map((r, idx) => {
        const parsedNum = parseFloat(r.chapter);
        const orderNum = typeof r.order === 'number' ? r.order : idx + 1;
        const number = Number.isFinite(parsedNum) ? parsedNum : orderNum;
        const time = parseSqlTime(r.published_time || r.original_published_time);
        const chapter = {
          id: r.key,
          chapterId: r.key,
          name: normalizeWhitespace(r.title) || `${r.release_type_name || 'Chapter'} ${r.chapter || number}`,
          number,
        };
        if (r.release_type_name) chapter.group = r.release_type_name;
        if (time !== undefined) chapter.time = time;
        return chapter;
      })
      .sort((a, b) => a.number - b.number);
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${BASE}/c/${encodeURIComponent(mangaId)}/r/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const state = extractInitialState(html);
    const data = findQueryData(state, (k) => k[0] === 'releaseDetailsRelease');
    const release = data && data.data && data.data.payload && data.data.payload.results;
    const thumbs = (release && release.page_thumbnails) || [];
    const objects = (release && release.page_objects) || [];

    const source = objects.length ? objects : thumbs;
    const pages = source
      .slice()
      .sort((a, b) => (a.page || 0) - (b.page || 0))
      .map((p) => (objects.length ? p.image_xl_url || p.image_small_url || p.url : p.url))
      .filter(Boolean);

    const declared = release && typeof release.page_count === 'number' ? release.page_count : null;
    if (declared !== null && pages.length < declared) {
      console.warn(
        `GlobalComix: release ${chapterId} served ${pages.length} of ${declared} pages` +
          (objects.length ? '' : ' (thumbnail set only, full-size pages not available anonymously)')
      );
    }

    return { id: chapterId, mangaId, pages };
  }

  async requestHTML(url) {
    return this.requestRaw(url);
  }

  async requestRaw(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.data;
  }
}

module.exports = { Source };
