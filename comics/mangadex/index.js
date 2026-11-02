const API_BASE = 'https://api.mangadex.org';
const UPLOADS_BASE = 'https://uploads.mangadex.org';
const PAGE_SIZE = 24;
const MAX_OFFSET_PLUS_LIMIT = 10000;

const PLAIN_UA = 'Boundless/1.0 (+https://boundless.moe)';

function isBotCheck(response, error) {
  if (error) return !!(error.kind === 'challenge' || /challenge|bot check/i.test(String(error.message || '')));
  const body = String(response.data || '').slice(0, 600);
  if (response.status === 403 && /bot challenge/i.test(body)) return true;
  return /^\s*</.test(body) && /browser verification|challenge-assets|powblock/i.test(body);
}

const FEEDS = [
  { id: 'latest', name: 'Latest Updates' },
  { id: 'popular', name: 'Most Followed' },
  { id: 'rating', name: 'Top Rated' },
  { id: 'new', name: 'Recently Added' },
  { id: 'title', name: 'A–Z' },
];

const SORT_TO_ORDER = {
  latest: { latestUploadedChapter: 'desc' },
  popular: { followedCount: 'desc' },
  rating: { rating: 'desc' },
  new: { createdAt: 'desc' },
  title: { title: 'asc' },
};

const CONTENT_RATINGS = ['safe', 'suggestive', 'erotica', 'pornographic'];

const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', 'es-la': 'Spanish (Latin America)', 'pt-br': 'Portuguese (Brazil)',
  pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', ru: 'Russian', id: 'Indonesian',
  vi: 'Vietnamese', tr: 'Turkish', ar: 'Arabic', pl: 'Polish', th: 'Thai', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese (Simplified)', 'zh-hk': 'Chinese (Traditional)', hi: 'Hindi',
  uk: 'Ukrainian', nl: 'Dutch', ro: 'Romanian', hu: 'Hungarian', cs: 'Czech', fil: 'Filipino',
  ms: 'Malay', bn: 'Bengali', my: 'Burmese', he: 'Hebrew', fa: 'Persian', el: 'Greek',
  bg: 'Bulgarian', ca: 'Catalan', sv: 'Swedish', fi: 'Finnish', da: 'Danish', no: 'Norwegian',
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function qsRepeat(key, values) {
  return (values || [])
    .filter(Boolean)
    .map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function joinQuery(parts) {
  return parts.filter((p) => p && p.length).join('&');
}

function ageRatingFor(contentRating) {
  switch (contentRating) {
    case 'safe':
      return 0;
    case 'suggestive':
      return 16;
    case 'erotica':
    case 'pornographic':
      return 18;
    default:
      return undefined;
  }
}

function mapStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'ongoing':
      return 'ONGOING';
    case 'completed':
      return 'COMPLETED';
    case 'hiatus':
      return 'HIATUS';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

function pickLang(langMap, preferred) {
  if (!langMap || typeof langMap !== 'object') return undefined;
  return langMap[preferred] || langMap.en || langMap[Object.keys(langMap)[0]] || undefined;
}

function bestTitle(attrs, preferred) {
  const mangaTitle = attrs.title || {};
  const altTitles = attrs.altTitles || [];
  return (
    mangaTitle[preferred] ||
    altTitles.map((t) => t[preferred]).find(Boolean) ||
    pickLang(mangaTitle, preferred) ||
    pickLang(altTitles[0], preferred)
  );
}

function cleanDescription(text) {
  if (!text) return undefined;
  return String(text)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

class Source {
  getSourceFeeds() {
    return FEEDS;
  }

  async getSearchTags() {
    try {
      const json = await this.requestJSON(`${API_BASE}/manga/tag`);
      const tags = [];
      (json.data || []).forEach((t) => {
        const label = pickLang(t.attributes && t.attributes.name, 'en');
        if (label) tags.push({ id: t.id, label });
      });
      return tags.sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('MangaDex getSearchTags failed:', e);
      return [];
    }
  }

  async getSortOptions() {
    return [
      { id: 'relevance', label: 'Best Match' },
      { id: 'latest', label: 'Latest Updates' },
      { id: 'popular', label: 'Most Followed' },
      { id: 'rating', label: 'Top Rated' },
      { id: 'new', label: 'Recently Added' },
      { id: 'title', label: 'A–Z' },
    ];
  }

  async getSearchResults(request, metadata) {
    const title = (request && request.title) || '';
    const feed = (request && request.feed) || null;
    const sortId = (request && request.sortId) || null;
    const includedTags = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
    const excludedTags = ((request && request.excludedTags) || []).map((t) => t.id).filter(Boolean);
    const page = (metadata && metadata.page) || 1;
    const offset = (page - 1) * PAGE_SIZE;

    if (offset + PAGE_SIZE > MAX_OFFSET_PLUS_LIMIT) {
      return { results: [] };
    }

    const order = SORT_TO_ORDER[sortId] || (!title ? SORT_TO_ORDER[feed] || SORT_TO_ORDER.popular : null);

    const queryParts = [
      qs({
        title: title || undefined,
        limit: PAGE_SIZE,
        offset,
        'availableTranslatedLanguage[]': undefined,
      }),
      qsRepeat('contentRating[]', CONTENT_RATINGS),
      qsRepeat('includedTags[]', includedTags),
      qsRepeat('excludedTags[]', excludedTags),
      qsRepeat('includes[]', ['cover_art']),
    ];
    if (order) {
      const [field, dir] = Object.entries(order)[0];
      queryParts.push(qs({ [`order[${field}]`]: dir }));
    }

    const json = await this.requestJSON(`${API_BASE}/manga?${joinQuery(queryParts)}`);
    const data = json.data || [];
    const results = data.map((m) => this.toPartialManga(m));
    const total = typeof json.total === 'number' ? json.total : 0;
    const hasMore = data.length > 0 && offset + data.length < total;
    return { results, metadata: hasMore ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const query = qsRepeat('includes[]', ['author', 'artist', 'cover_art']);
    const json = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}?${query}`);
    if (!json.data) throw new Error('manga not found');
    return this.toMangaInfo(json.data);
  }

  async getChapters(mangaId, sinceDate) {
    try {
      const wanted = App.getSourceSetting('language') || 'en';
      this._languages = this._languages || new Map();
      const key = `${wanted}|${mangaId}`;
      const known = this._languages.has(key);
      const language = known ? this._languages.get(key) : wanted;
      let chapters = await this._chapterFeed(mangaId, sinceDate, language, language !== wanted || wanted === 'all');
      if (!chapters.length && !known && wanted !== 'all') {
        const other = await this._otherLanguage(mangaId, wanted);
        this._languages.set(key, other || wanted);
        if (other) chapters = await this._chapterFeed(mangaId, sinceDate, other, true);
      }
      return chapters;
    } catch (e) {
      console.error('MangaDex getChapters failed:', e);
      throw e;
    }
  }

  async _chapterFeed(mangaId, sinceDate, language, showLanguage) {
    const chapters = [];
    let offset = 0;
    const limit = 500;
    for (let i = 0; i < 20; i++) {
      const queryParts = [
        qs({
          limit,
          offset,
          'order[chapter]': 'asc',
          createdAtSince: sinceDate ? sinceDate.slice(0, 19) : undefined,
        }),
        language === 'all' ? '' : qsRepeat('translatedLanguage[]', [language]),
        qsRepeat('contentRating[]', CONTENT_RATINGS),
        qsRepeat('includes[]', ['scanlation_group']),
      ];
      const json = await this.requestJSON(
        `${API_BASE}/manga/${encodeURIComponent(mangaId)}/feed?${joinQuery(queryParts)}`
      );
      const data = json.data || [];
      data
        .filter((c) => !c.attributes || !c.attributes.externalUrl)
        .forEach((c) => chapters.push(this.toChapter(c, showLanguage)));
      const total = typeof json.total === 'number' ? json.total : data.length;
      offset += limit;
      if (data.length === 0 || offset >= total || offset + limit > MAX_OFFSET_PLUS_LIMIT) break;
    }
    return chapters;
  }

  async _otherLanguage(mangaId, wanted) {
    const json = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}`);
    const attrs = (json.data && json.data.attributes) || {};
    const available = Array.isArray(attrs.availableTranslatedLanguages) ? attrs.availableTranslatedLanguages : [];
    if (!available.length || available.indexOf(wanted) !== -1) return null;
    const counts = await Promise.all(
      available.slice(0, 12).map(async (lang) => {
        try {
          const feed = await this.requestJSON(
            `${API_BASE}/manga/${encodeURIComponent(mangaId)}/feed?${joinQuery([
              qs({ limit: 1 }),
              qsRepeat('translatedLanguage[]', [lang]),
              qsRepeat('contentRating[]', CONTENT_RATINGS),
            ])}`
          );
          return { lang, total: typeof feed.total === 'number' ? feed.total : (feed.data || []).length };
        } catch (e) {
          return { lang, total: 0 };
        }
      })
    );
    counts.sort((x, y) => y.total - x.total);
    return counts[0] && counts[0].total > 0 ? counts[0].lang : null;
  }

  async getChapterDetails(mangaId, chapterId) {
    const json = await this.requestJSON(`${API_BASE}/at-home/server/${encodeURIComponent(chapterId)}`);
    const baseUrl = json.baseUrl;
    const chapter = json.chapter || {};
    const useDataSaver = App.getSourceSetting('dataSaver') === 'true';
    const fileNames = useDataSaver ? chapter.dataSaver : chapter.data;
    const quality = useDataSaver ? 'data-saver' : 'data';
    const pages = (fileNames || [])
      .filter((f) => typeof f === 'string')
      .map((f) => `${baseUrl}/${quality}/${chapter.hash}/${f}`);
    return { id: chapterId, mangaId, pages };
  }

  async requestJSON(url) {
    if (this.agent !== 'plain') {
      try {
        return await this.fetchJSON(url, false);
      } catch (e) {
        if (!(e && e.botCheck)) throw e;
        this.agent = 'plain';
        console.error(`MangaDex: the browser identity met its bot check (${e.message}), using the plain agent from now on`);
      }
    }
    return this.fetchJSON(url, true);
  }

  async fetchJSON(url, plain) {
    const manager = App.createRequestManager({});
    const headers = { Accept: 'application/json' };
    if (plain) headers['User-Agent'] = PLAIN_UA;
    const request = App.createRequest({ url, method: 'GET', headers });
    let response;
    try {
      response = await manager.schedule(request);
    } catch (e) {
      if (!plain && isBotCheck(null, e)) throw Object.assign(new Error((e && e.message) || 'check not cleared'), { botCheck: true });
      throw e;
    }
    if (!plain && isBotCheck(response)) {
      throw Object.assign(new Error(`HTTP ${response.status} check page`), { botCheck: true });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MangaDex API HTTP ${response.status} for ${url}`);
    }
    return JSON.parse(response.data);
  }

  coverUrl(manga, small) {
    const coverRel = (manga.relationships || []).find((r) => r.type === 'cover_art');
    const fileName = coverRel && coverRel.attributes && coverRel.attributes.fileName;
    return fileName ? `${UPLOADS_BASE}/covers/${manga.id}/${fileName}${small ? '.512.jpg' : ''}` : undefined;
  }

  authorNames(manga) {
    const names = (manga.relationships || [])
      .filter((r) => r.type === 'author' || r.type === 'artist')
      .map((r) => r.attributes && r.attributes.name)
      .filter(Boolean);
    return Array.from(new Set(names)).join(' / ') || undefined;
  }

  toPartialManga(manga) {
    const a = manga.attributes || {};
    return {
      mangaId: manga.id,
      title: bestTitle(a, 'en'),
      image: this.coverUrl(manga, true),
      headers: { 'User-Agent': PLAIN_UA },
      author: this.authorNames(manga),
      summary: cleanDescription(pickLang(a.description, 'en')),
      tags: (a.tags || []).map((t) => pickLang(t.attributes && t.attributes.name, 'en')).filter(Boolean),
      medium: 'comics',
      ageRating: ageRatingFor(a.contentRating),
      completed: a.status === 'completed',
      releaseDate: a.year ? String(a.year) : undefined,
      webURL: `https://mangadex.org/title/${manga.id}`,
    };
  }

  toMangaInfo(manga) {
    const partial = this.toPartialManga(manga);
    return {
      mangaInfo: {
        ...partial,
        image: this.coverUrl(manga, false),
        desc: partial.summary,
        status: mapStatus(manga.attributes && manga.attributes.status),
      },
    };
  }

  toChapter(c, showLanguage) {
    const a = c.attributes || {};
    const groupRel = (c.relationships || []).find((r) => r.type === 'scanlation_group');
    const scanlator = groupRel && groupRel.attributes && groupRel.attributes.name;
    const num = a.chapter !== null && a.chapter !== undefined ? a.chapter : '0';
    const lang = showLanguage && a.translatedLanguage ? LANGUAGE_NAMES[a.translatedLanguage] || String(a.translatedLanguage).toUpperCase() : null;
    const group = [lang, scanlator].filter(Boolean).join(' \u00b7 ') || undefined;
    return {
      id: c.id,
      chapterId: c.id,
      name: a.title || `Chapter ${num}`,
      number: Number(num) || 0,
      group,
      time: a.publishAt ? Date.parse(a.publishAt) : undefined,
    };
  }
}

module.exports = { Source };
