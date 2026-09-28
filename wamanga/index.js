const SITE_BASE = 'https://wamanga.ru';
const API_BASE = 'https://wamanga.ru/api/v1';
const PAGE_SIZE = 20;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function absolute(path) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function cleanList(arr) {
  return (arr || []).map((s) => (s || '').trim()).filter((s) => s && s.toUpperCase() !== 'N/A');
}

function mapStatus(statusTitle) {
  switch (String(statusTitle || '').toLowerCase()) {
    case 'ongoing':
      return 'ONGOING';
    case 'completed':
      return 'COMPLETED';
    case 'hiatus':
      return 'HIATUS';
    case 'abandoned':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

function isCompletedStatus(statusTitle) {
  return String(statusTitle || '').toLowerCase() === 'completed';
}

function normalizeText(text) {
  if (!text) return '';
  return String(text).replace(/\r\n/g, '\n').trim();
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'catalog', name: 'Каталог' },
      { id: 'fresh', name: 'Новые главы' },
      { id: 'top', name: 'Топ дня' },
      { id: 'new', name: 'Новинки' },
      { id: 'random', name: 'Случайное' },
    ];
  }

  async getSearchTags() {
    return [];
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'catalog';
    const page = (metadata && metadata.page) || 1;

    try {
      if (query) {
        const offset = (page - 1) * PAGE_SIZE;
        const json = await this.requestJSON(
          `${API_BASE}/manga?${qs({ query, offset, limit: PAGE_SIZE })}`
        );
        const list = Array.isArray(json) ? json : [];
        return {
          results: list.map((m) => this.toPartialManga(m)),
          metadata: list.length === PAGE_SIZE ? { page: page + 1 } : undefined,
        };
      }

      if (feed === 'catalog') {
        const offset = (page - 1) * PAGE_SIZE;
        const json = await this.requestJSON(
          `${API_BASE}/manga?${qs({ offset, limit: PAGE_SIZE })}`
        );
        const list = Array.isArray(json) ? json : [];
        return {
          results: list.map((m) => this.toPartialManga(m)),
          metadata: list.length === PAGE_SIZE ? { page: page + 1 } : undefined,
        };
      }

      const key = { fresh: 'freshUpdates', top: 'dayTop', new: 'latestPublished', random: 'random' }[
        feed
      ];
      const json = await this.requestJSON(`${API_BASE}/manga/homepage`);
      const list = (key && Array.isArray(json[key]) && json[key]) || [];
      return { results: list.map((m) => this.toPartialManga(m)), metadata: undefined };
    } catch (e) {
      console.error('WaManga getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const m = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}`);
    if (!m || !m.id) throw new Error('manga not found');
    return { mangaInfo: this.toMangaFields(m, true) };
  }

  async getChapters(mangaId) {
    try {
      const json = await this.requestJSON(
        `${API_BASE}/manga/${encodeURIComponent(mangaId)}/chapters`
      );
      const list = Array.isArray(json) ? json : [];
      const chapters = list
        .filter((c) => !c.isProcessing)
        .map((c) => ({
          id: c.id,
          chapterId: c.id,
          name: `Глава ${c.position}`,
          number: Number(c.position),
          time: c.createdAt ? Date.parse(c.createdAt) : undefined,
        }));
      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('WaManga getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const c = await this.requestJSON(`${API_BASE}/chapters/${encodeURIComponent(chapterId)}`);
      const files = Array.isArray(c.files) ? c.files : [];
      const pages = files
        .slice()
        .sort((a, b) => parseFloat(a.position) - parseFloat(b.position))
        .map((f) => absolute(f.diskFile))
        .filter(Boolean);
      return { id: chapterId, mangaId, pages };
    } catch (e) {
      console.error('WaManga getChapterDetails failed:', e);
      throw e;
    }
  }

  toPartialManga(m) {
    const fields = this.toMangaFields(m, false);
    return { mangaId: m.id, ...fields };
  }

  toMangaFields(m, withDesc) {
    const author = [cleanList(m.authors).join(', '), cleanList(m.artists).join(', ')]
      .filter(Boolean)
      .join(' / ');
    const publisher = cleanList(m.publishers)[0];
    const fields = {
      title: m.title,
      image: absolute(m.coverUrl),
      author: author || undefined,
      publisher,
      tags: Array.isArray(m.genres) ? m.genres : [],
      webURL: m.type && m.slug ? `${SITE_BASE}/${m.type}/${m.slug}` : undefined,
      medium: 'comics',
      views: typeof m.views === 'number' ? m.views : undefined,
      completed: isCompletedStatus(m.statusTitle),
      releaseDate: m.year ? String(m.year) : undefined,
    };
    if (withDesc) {
      fields.desc = normalizeText(m.description);
      fields.status = mapStatus(m.statusTitle);
    } else {
      fields.summary = normalizeText(m.description);
    }
    return fields;
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
      throw new Error(`WaManga API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
