const SITE_BASE = 'https://olympusxyz.com';
const PANEL_BASE = 'https://panel.olympusxyz.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const SEARCH_PAGE_SIZE = 24;

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('activo')) return 'ONGOING';
  if (s.includes('final')) return 'COMPLETED';
  if (s.includes('pausado') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('abandonado')) return 'CANCELLED';
  return 'UNKNOWN';
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

const ACCENT_MAP = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u', Ü: 'u', Ñ: 'n',
};
function foldForSearch(text) {
  let out = '';
  const s = (text || '').toLowerCase();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += ACCENT_MAP[c] || c;
  }
  return out;
}

function toPartialManga(item) {
  if (!item || !item.slug || !item.name) return null;
  const image = item.cover || '';
  if (!image) return null;

  const statusRaw = typeof item.status === 'string' ? item.status : (item.status && item.status.name) || '';
  const manga = {
    mangaId: item.slug,
    title: cleanText(item.name),
    image,
    webURL: `${SITE_BASE}/series/comic-${item.slug}`,
    medium: 'comics',
  };
  if (statusRaw) {
    manga.completed = mapStatus(statusRaw) === 'COMPLETED';
  }
  if (typeof item.chapter_count === 'number') {
    manga.chapters = item.chapter_count;
  }
  return manga;
}

const SLUG_SUFFIX_RE = /-\d{8}-\d{9}$/;

class Source {
  getSourceFeeds() {
    return [
      { id: 'series', name: 'Series' },
      { id: 'capitulos', name: 'Latest Chapters' },
      { id: 'rankings', name: 'Rankings' },
    ];
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${SITE_BASE}/api/genres-statuses`);
      const genres = (json && json.genres) || [];
      const tags = [];
      for (const g of genres) {
        const label = cleanText(g && g.name);
        if (label && g.id !== undefined && g.id !== null) {
          tags.push({ id: String(g.id), label });
        }
      }
      return tags;
    } catch (e) {
      console.error('OlympusScans getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';

    if (query) {
      return this.searchByTitle(query, page);
    }

    const includedTags = (request && request.includedTags) || [];
    const genreId = includedTags.length > 0 && includedTags[0] && includedTags[0].id;
    if (genreId) {
      const url = `${SITE_BASE}/api/series?type=comic&direction=asc&page=${page}&genres=${encodeURIComponent(genreId)}`;
      const json = await this.requestJSON(url);
      return this.parseNestedSeriesPage(json, page);
    }

    const feed = (request && request.feed) || 'series';
    if (feed === 'capitulos') {
      const json = await this.requestJSON(`${SITE_BASE}/api/new-chapters?page=${page}`);
      return this.parseFlatSeriesPage(json, page);
    }
    if (feed === 'rankings') {
      const json = await this.requestJSON(`${SITE_BASE}/api/rankings?page=${page}&period=total_ranking`);
      return this.parseFlatSeriesPage(json, page);
    }

    const json = await this.requestJSON(`${SITE_BASE}/api/series?type=comic&direction=asc&page=${page}`);
    return this.parseNestedSeriesPage(json, page);
  }

  async searchByTitle(query, page) {
    const json = await this.requestJSON(`${SITE_BASE}/api/series/list`);
    const all = (json && json.data) || [];
    const needle = foldForSearch(query);
    const matched = [];
    for (const item of all) {
      if (item.type !== 'comic') continue;
      if (!foldForSearch(item.name).includes(needle)) continue;
      const manga = toPartialManga(item);
      if (manga) matched.push(manga);
    }

    const start = (page - 1) * SEARCH_PAGE_SIZE;
    const results = matched.slice(start, start + SEARCH_PAGE_SIZE);
    const hasNext = start + SEARCH_PAGE_SIZE < matched.length;
    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  parseNestedSeriesPage(json, page) {
    const page_ = (json && json.data && json.data.series) || {};
    const rows = page_.data || [];
    const results = [];
    for (const item of rows) {
      const manga = toPartialManga(item);
      if (manga) results.push(manga);
    }
    const currentPage = page_.current_page || page;
    const lastPage = page_.last_page || currentPage;
    const hasNext = currentPage < lastPage;
    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  parseFlatSeriesPage(json, page) {
    const rows = (json && json.data) || [];
    const results = [];
    for (const item of rows) {
      if (item.type && item.type !== 'comic') continue;
      const manga = toPartialManga(item);
      if (manga) results.push(manga);
    }
    const currentPage = (json && json.current_page) || page;
    const lastPage = (json && json.last_page) || currentPage;
    const hasNext = currentPage < lastPage;
    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    let slug = mangaId;
    let json;
    try {
      json = await this.requestJSON(`${SITE_BASE}/api/series/${encodeURIComponent(slug)}`);
    } catch (e) {
      const resolved = await this.resolveCurrentSlug(mangaId);
      if (resolved) slug = resolved;
      try {
        json = await this.requestJSON(`${SITE_BASE}/api/series/${encodeURIComponent(slug)}`);
      } catch (e2) {
        const listed = await this.findListEntry(mangaId);
        if (!listed) throw e2;
        return {
          mangaInfo: {
            title: cleanText(listed.name) || mangaId,
            image: listed.cover || '',
            desc: '',
            status: 'unknown',
            tags: [],
            webURL: `${SITE_BASE}/series/comic-${slug}`,
            medium: 'comics',
          },
        };
      }
    }
    const data = (json && json.data) || {};

    const tags = [];
    const genres = Array.isArray(data.genres) ? data.genres : [];
    for (const g of genres) {
      const label = cleanText(g && g.name);
      if (label) tags.push(label);
    }

    const statusRaw = (data.status && data.status.name) || '';

    return {
      mangaInfo: {
        title: cleanText(data.name) || mangaId,
        image: data.cover || '',
        desc: (data.summary || '').trim(),
        status: mapStatus(statusRaw),
        tags,
        chapters: typeof data.chapter_count === 'number' ? data.chapter_count : undefined,
        webURL: `${SITE_BASE}/series/comic-${slug}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    let slug = mangaId;
    const chapters = [];
    let page = 1;
    for (let i = 0; i < 200; i++) {
      const url = `${PANEL_BASE}/api/series/${encodeURIComponent(slug)}/chapters?page=${page}&direction=asc&type=comic`;
      let json;
      try {
        json = await this.requestJSON(url);
      } catch (e) {
        if (page !== 1) throw e;
        const resolved = await this.resolveCurrentSlug(mangaId);
        if (resolved) slug = resolved;
        try {
          json = await this.requestJSON(
            `${PANEL_BASE}/api/series/${encodeURIComponent(slug)}/chapters?page=${page}&direction=asc&type=comic`
          );
        } catch (e2) {
          console.warn(`OlympusScans getChapters: chapters endpoint unreachable for "${mangaId}", returning []`);
          return [];
        }
      }
      const rows = (json && json.data) || [];
      for (const row of rows) {
        if (row.id === undefined || row.id === null || !row.name) continue;
        const chapterId = String(row.id);
        const number = parseFloat(row.name);
        const chapter = {
          id: chapterId,
          chapterId,
          name: `Capítulo ${row.name}`,
          number: Number.isNaN(number) ? 0 : number,
        };
        const groupName = row.team && row.team.name ? cleanText(row.team.name) : '';
        if (groupName) chapter.group = groupName;
        const time = Date.parse(row.published_at);
        if (!Number.isNaN(time)) chapter.time = time;
        chapters.push(chapter);
      }

      const meta = (json && json.meta) || {};
      const currentPage = meta.current_page || page;
      const lastPage = meta.last_page || currentPage;
      if (currentPage >= lastPage || rows.length === 0) break;
      page += 1;
    }
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/api/capitulo/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}?type=comic`;
    const json = await this.requestJSON(url);
    const rawPages = (json && json.chapter && json.chapter.pages) || [];
    const pages = rawPages.filter((p) => typeof p === 'string' && /^https?:\/\//.test(p));
    return { id: chapterId, mangaId, pages };
  }

  async resolveCurrentSlug(staleSlug) {
    const base = staleSlug.replace(SLUG_SUFFIX_RE, '');
    if (base === staleSlug) return undefined;
    try {
      const json = await this.requestJSON(`${SITE_BASE}/api/series/list`);
      const all = (json && json.data) || [];
      for (const item of all) {
        if (item && typeof item.slug === 'string' && item.slug.replace(SLUG_SUFFIX_RE, '') === base) {
          return item.slug;
        }
      }
    } catch (e) {
      console.error('OlympusScans slug resolution failed: ' + (e && e.message));
    }
    return undefined;
  }

  async findListEntry(mangaId) {
    const base = mangaId.replace(SLUG_SUFFIX_RE, '');
    try {
      const json = await this.requestJSON(`${SITE_BASE}/api/series/list`);
      const all = (json && json.data) || [];
      for (const item of all) {
        if (item && typeof item.slug === 'string' && item.slug.replace(SLUG_SUFFIX_RE, '') === base) {
          return item;
        }
      }
    } catch (e) {
      console.error('OlympusScans list-entry fallback failed: ' + (e && e.message));
    }
    return undefined;
  }

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
