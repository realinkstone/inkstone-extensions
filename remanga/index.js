const API_BASE = 'https://api.remanga.org/api';
const SITE_BASE = 'https://remanga.org';
const MEDIA_BASE = 'https://api.remanga.org';
const PAGE_SIZE = 30;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

const GENRES = [
  { id: 2, name: 'Экшен' },
  { id: 3, name: 'Боевые искусства' },
  { id: 5, name: 'Гарем' },
  { id: 6, name: 'Гендерная интрига' },
  { id: 7, name: 'Героическое фэнтези' },
  { id: 8, name: 'Детектив' },
  { id: 9, name: 'Дзёсэй' },
  { id: 10, name: 'Додзинси' },
  { id: 11, name: 'Драма' },
  { id: 13, name: 'История' },
  { id: 14, name: 'Киберпанк' },
  { id: 15, name: 'Кодомо' },
  { id: 16, name: 'Элементы юмора' },
  { id: 17, name: 'Махо-сёдзё' },
  { id: 18, name: 'Меха' },
  { id: 19, name: 'Мистика' },
  { id: 20, name: 'Научная фантастика' },
  { id: 21, name: 'Повседневность' },
  { id: 22, name: 'Постапокалиптика' },
  { id: 23, name: 'Приключения' },
  { id: 24, name: 'Психология' },
  { id: 25, name: 'Романтика' },
  { id: 27, name: 'Сверхъестественное' },
  { id: 28, name: 'Сёдзё' },
  { id: 30, name: 'Сёнэн' },
  { id: 32, name: 'Спорт' },
  { id: 33, name: 'Сэйнэн' },
  { id: 34, name: 'Трагедия' },
  { id: 35, name: 'Триллер' },
  { id: 36, name: 'Ужасы' },
  { id: 37, name: 'Фантастика' },
  { id: 38, name: 'Фэнтези' },
  { id: 39, name: 'Школьники' },
  { id: 40, name: 'Этти' },
  { id: 42, name: 'Эротика' },
  { id: 50, name: 'Комедия' },
  { id: 51, name: 'Мурим' },
  { id: 53, name: 'Юмор' },
  { id: 56, name: 'Попаданцы' },
  { id: 57, name: 'ЛитРПГ' },
  { id: 59, name: 'Боевик' },
];

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Recently Added' },
      { id: 'popular', name: 'Popular' },
      { id: 'views', name: 'Most Viewed' },
    ];
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: String(g.id), label: g.name }));
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const tagIds = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${API_BASE}/search/?${qs({ query, count: PAGE_SIZE, page })}`;
    } else {
      const params = { count: PAGE_SIZE, page };
      if (tagIds.length) params.genres = tagIds.join(',');
      if (feed === 'popular') params.ordering = '-total_votes';
      else if (feed === 'views') params.ordering = '-total_views';
      url = `${API_BASE}/titles/?${qs(params)}`;
    }

    const json = await this.requestJSON(url);
    const items = json.content || [];
    const results = sortHasChaptersFirst(items.map(toPartialManga));
    return { results, metadata: items.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const json = await this.requestJSON(`${API_BASE}/titles/${encodeURIComponent(mangaId)}/`);
    const s = json.content;
    if (!s) throw new Error('ReManga: title not found');
    return { mangaInfo: toMangaInfo(s) };
  }

  async getChapters(mangaId) {
    try {
      const detail = await this.requestJSON(`${API_BASE}/titles/${encodeURIComponent(mangaId)}/`);
      const branch = detail.content && detail.content.branches && detail.content.branches[0];
      if (!branch) return [];
      const branchId = branch.id;

      const all = [];
      for (let page = 1; page <= 200; page++) {
        const json = await this.requestJSON(
          `${API_BASE}/titles/chapters/?${qs({ branch_id: branchId, count: 100, page })}`
        );
        const rows = json.content || [];
        if (!rows.length) break;
        for (const c of rows) all.push(toChapter(c));
      }
      return all;
    } catch (e) {
      console.error('ReManga getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const json = await this.requestJSON(`${API_BASE}/titles/chapters/${encodeURIComponent(chapterId)}/`);
      const c = json.content;
      const groups = (c && c.pages) || [];
      const pages = [];
      for (const group of groups) {
        for (const img of group) {
          if (img && img.link) pages.push(img.link);
        }
      }
      return { id: chapterId, mangaId, pages };
    } catch (e) {
      console.error('ReManga getChapterDetails failed:', e);
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
      throw new Error(`ReManga API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

function coverUrl(img) {
  if (!img) return undefined;
  const path = img.mid || img.high || img.low;
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${MEDIA_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

function mapStatus(status) {
  const id = status && status.id;
  switch (id) {
    case 1:
      return 'COMPLETED';
    case 2:
      return 'ONGOING';
    case 3:
      return 'HIATUS';
    default:
      return 'UNKNOWN';
  }
}

function mapAgeLimit(ageLimit) {
  switch (ageLimit) {
    case 0:
      return 0;
    case 1:
      return 16;
    case 2:
      return 18;
    default:
      return undefined;
  }
}

function sortHasChaptersFirst(results) {
  const withChapters = [];
  const withoutChapters = [];
  for (const r of results) {
    if (typeof r.chapters === 'number' && r.chapters > 0) withChapters.push(r);
    else withoutChapters.push(r);
  }
  return withChapters.concat(withoutChapters);
}

function toPartialManga(s) {
  return {
    mangaId: s.dir,
    title: s.main_name || s.rus_name || s.en_name,
    image: coverUrl(s.img),
    tags: undefined,
    webURL: s.dir ? `${SITE_BASE}/manga/${encodeURIComponent(s.dir)}` : undefined,
    medium: 'comics',
    rating: s.avg_rating !== undefined ? Number(s.avg_rating) : undefined,
    chapters: typeof s.count_chapters === 'number' ? s.count_chapters : undefined,
    completed: s.status ? mapStatus(s.status) === 'COMPLETED' : undefined,
    releaseDate: s.issue_year ? String(s.issue_year) : undefined,
    ageRating: s.is_erotic ? 18 : undefined,
  };
}

function toMangaInfo(s) {
  const creators = s.creators || {};
  const authors = (creators['1'] || []).map((c) => c.name).filter(Boolean);
  const artists = (creators['2'] || []).map((c) => c.name).filter(Boolean);
  const publishers = (creators['3'] || []).map((c) => c.name).filter(Boolean);
  const branch = (s.branches && s.branches[0]) || null;

  return {
    title: s.main_name || s.rus_name || s.en_name,
    image: coverUrl(s.img),
    author: [authors.join(', '), artists.join(', ')].filter(Boolean).join(' / ') || undefined,
    desc: htmlToText(s.description),
    status: mapStatus(s.status),
    tags: (s.genres || []).map((g) => g.name),
    webURL: s.dir ? `${SITE_BASE}/manga/${encodeURIComponent(s.dir)}` : undefined,
    medium: 'comics',
    rating: s.avg_rating !== undefined ? Number(s.avg_rating) : undefined,
    chapters:
      typeof s.count_chapters === 'number'
        ? s.count_chapters
        : branch && typeof branch.count_chapters === 'number'
          ? branch.count_chapters
          : undefined,
    completed: mapStatus(s.status) === 'COMPLETED',
    releaseDate: s.issue_year ? String(s.issue_year) : undefined,
    publisher: publishers.join(', ') || undefined,
    ageRating: mapAgeLimit(s.age_limit),
  };
}

function toChapter(c) {
  const parsedNumber = parseFloat(c.chapter);
  return {
    id: String(c.id),
    chapterId: String(c.id),
    name: c.name && String(c.name).trim() ? c.name : `Глава ${c.chapter}`,
    number: Number.isFinite(parsedNumber) ? parsedNumber : c.index,
    volume: c.tome !== undefined && c.tome !== null ? String(c.tome) : undefined,
    group: (c.publishers && c.publishers[0] && c.publishers[0].name) || undefined,
    time: c.upload_date ? Date.parse(c.upload_date) : undefined,
  };
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(String(html));
  $('br').each((_, el) => {
    $(el).replaceWith('\n');
  });
  $('p, div, li').each((_, el) => {
    const isParagraph = el.tagName && el.tagName.toLowerCase() === 'p';
    $(el).append(isParagraph ? '\n\n' : '\n');
  });
  return $.root()
    .text()
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { Source };
