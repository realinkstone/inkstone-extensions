const SITE_BASE = 'https://www.wattpad.com';
const PAGE_SIZE = 20;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapStatus(completed) {
  return completed ? 'COMPLETED' : 'ONGOING';
}

function storyTextToPlain(html) {
  if (!html) return '';
  const $ = cheerio.load(String(html));
  $('br').each((_, el) => {
    $(el).replaceWith('\n');
  });
  $('p').each((_, el) => {
    $(el).append('\n\n');
  });
  const text = $.root()
    .text()
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.indexOf('Paid Stories program') !== -1) {
    return "This chapter is part of Wattpad's Paid Stories program and isn't available here for free.";
  }
  return text;
}

function toPartialManga(s) {
  const user = s.user || {};
  const author = (user.fullname && user.fullname.trim()) || user.name || undefined;
  const manga = {
    mangaId: String(s.id),
    title: s.title || String(s.id),
    image: s.cover,
    summary: cleanText(s.description),
    tags: Array.isArray(s.tags) ? s.tags : [],
    webURL: s.url || `${SITE_BASE}/story/${s.id}`,
    medium: 'novel',
    completed: !!s.completed,
  };
  if (author) manga.author = author;
  if (typeof s.numParts === 'number') manga.chapters = s.numParts;
  if (typeof s.readCount === 'number') manga.views = s.readCount;
  if (s.createDate) {
    const year = new Date(s.createDate).getFullYear();
    if (isFinite(year)) manga.releaseDate = String(year);
  }
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'hot', name: 'Hot' },
      { id: 'new', name: 'New' },
      { id: 'featured', name: 'Featured' },
    ];
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${SITE_BASE}/api/v3/categories`);
      return (Array.isArray(json) ? json : [])
        .map((c) => ({ id: String(c.id), label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('Wattpad getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'hot';
    const categoryId =
      request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
    const offset = (metadata && metadata.offset) || 0;

    let results;
    if (query) {
      const url = `${SITE_BASE}/v4/search/stories?${qs({ query, limit: PAGE_SIZE, offset })}`;
      const json = await this.requestJSON(url);
      results = (json.stories || []).map(toPartialManga);
    } else {
      const params = {
        filter: categoryId && feed === 'new' ? 'hot' : feed,
        limit: PAGE_SIZE,
        offset,
      };
      if (categoryId) params.category = categoryId;
      const url = `${SITE_BASE}/api/v3/stories?${qs(params)}`;
      const json = await this.requestJSON(url);
      results = (json.stories || []).map(toPartialManga);
    }

    return {
      results,
      metadata: results.length > 0 ? { offset: offset + PAGE_SIZE } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const json = await this.requestJSON(`${SITE_BASE}/api/v3/stories/${encodeURIComponent(mangaId)}`);
    const { summary, ...manga } = toPartialManga(json);
    return {
      mangaInfo: {
        ...manga,
        desc: summary,
        status: mapStatus(json.completed),
      },
    };
  }

  async getChapters(mangaId) {
    try {
      const json = await this.requestJSON(`${SITE_BASE}/api/v3/stories/${encodeURIComponent(mangaId)}`);
      const parts = Array.isArray(json.parts) ? json.parts : [];
      return parts.map((p, i) => ({
        id: String(p.id),
        chapterId: String(p.id),
        name: p.title || `Part ${i + 1}`,
        number: i + 1,
        time: p.createDate ? Date.parse(p.createDate) : undefined,
      }));
    } catch (e) {
      console.error('Wattpad getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/apiv2/storytext?${qs({ id: chapterId })}`;
      const html = await this.requestText(url);
      return { id: chapterId, mangaId, pages: [], text: storyTextToPlain(html) };
    } catch (e) {
      console.error('Wattpad getChapterDetails failed:', e);
      throw e;
    }
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
      throw new Error(`Wattpad API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }

  async requestText(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/plain, text/html' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Wattpad HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
