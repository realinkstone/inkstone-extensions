const API_BASE = 'https://api.mangadex.org';
const UPLOADS_BASE = 'https://uploads.mangadex.org';
const PAGE_SIZE = 24;
const MAX_OFFSET_PLUS_LIMIT = 10000;

const PLAIN_UA = 'Boundless/1.0 (+https://boundless.moe)';

const VOLUMES_SUFFIX = '~volumes';
const VOLUME_PREFIX = 'vol-';
const VOLUME_WORKERS = 3;

const PROBE_WORKERS = 6;
const SETTLE_ROUNDS = 3;
const SETTLE_BUDGET_MS = 15000;

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
  uk: 'Ukrainian', nl: 'Dutch', ro: 'Romanian', hu: 'Hungarian', cs: 'Czech', tl: 'Filipino',
  ms: 'Malay', bn: 'Bengali', my: 'Burmese', he: 'Hebrew', fa: 'Persian', el: 'Greek',
  bg: 'Bulgarian', ca: 'Catalan', sv: 'Swedish', fi: 'Finnish', da: 'Danish', no: 'Norwegian',
};

function splitId(id) {
  const text = String(id);
  return text.endsWith(VOLUMES_SUFFIX) ? { base: text.slice(0, -VOLUMES_SUFFIX.length), volumes: true } : { base: text, volumes: false };
}

function wantedLanguages() {
  const raw = App.getSourceSetting('language');
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  let list = [];
  if (text.charAt(0) === '[') {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {
      list = [];
    }
  } else {
    list = text.split(',');
  }
  const codes = [];
  list.forEach((value) => {
    if (typeof value !== 'string') return;
    const code = value.trim().toLowerCase();
    if (code && codes.indexOf(code) === -1) codes.push(code);
  });
  if (codes.indexOf('all') !== -1) return ['all'];
  return codes.length ? codes : ['en'];
}

function orderTies(items, languages) {
  const rank = (c) => {
    const i = languages.indexOf(c.attributes && c.attributes.translatedLanguage);
    return i < 0 ? languages.length : i;
  };
  const numberOf = (c) => (c.attributes ? c.attributes.chapter : undefined);
  const ordered = [];
  let start = 0;
  while (start < items.length) {
    let end = start + 1;
    while (end < items.length && numberOf(items[end]) === numberOf(items[start])) end++;
    items
      .slice(start, end)
      .map((c, k) => ({ c, k }))
      .sort((a, b) => rank(a.c) - rank(b.c) || a.k - b.k)
      .forEach((x) => ordered.push(x.c));
    start = end;
  }
  return ordered;
}

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
    const id = splitId(mangaId);
    const query = qsRepeat('includes[]', ['author', 'artist', 'cover_art']);
    const json = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(id.base)}?${query}`);
    if (!json.data) throw new Error('manga not found');
    const info = this.toMangaInfo(json.data);
    if (id.volumes) {
      info.mangaInfo.mangaId = mangaId;
      info.mangaInfo.title = `${info.mangaInfo.title || ''} (Volumes)`.trim();
      return info;
    }
    try {
      const edition = await this.volumeEdition(id.base, json.data.attributes && json.data.attributes.availableTranslatedLanguages);
      if (edition) info.mangaInfo.volumesId = id.base + VOLUMES_SUFFIX;
    } catch (e) {
      console.error('MangaDex volumes lookup failed: ' + (e && e.message));
    }
    return info;
  }

  async getChapters(mangaId, sinceDate) {
    const id = splitId(mangaId);
    if (id.volumes) return this.volumeEntries(id.base);
    try {
      const wanted = wantedLanguages();
      this._languages = this._languages || new Map();
      const key = `${wanted.join(',')}|${mangaId}`;
      const known = this._languages.has(key);
      const languages = known ? this._languages.get(key) : wanted;
      const everything = languages[0] === 'all';
      const showLanguage = everything || languages.length > 1 || languages.join(',') !== wanted.join(',');
      let chapters = await this._chapterFeed(mangaId, sinceDate, languages, showLanguage);
      if (!chapters.length && !known && !everything) {
        const other = await this._otherLanguage(mangaId, wanted);
        this._languages.set(key, other ? [other] : wanted);
        if (other) chapters = await this._chapterFeed(mangaId, sinceDate, [other], true);
      }
      return chapters;
    } catch (e) {
      console.error('MangaDex getChapters failed:', e);
      throw e;
    }
  }

  async _chapterFeed(mangaId, sinceDate, languages, showLanguage) {
    const items = [];
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
        languages[0] === 'all' ? '' : qsRepeat('translatedLanguage[]', languages),
        qsRepeat('contentRating[]', CONTENT_RATINGS),
        qsRepeat('includes[]', ['scanlation_group']),
      ];
      const json = await this.requestJSON(
        `${API_BASE}/manga/${encodeURIComponent(mangaId)}/feed?${joinQuery(queryParts)}`
      );
      const data = json.data || [];
      data.filter((c) => !c.attributes || !c.attributes.externalUrl).forEach((c) => items.push(c));
      const total = typeof json.total === 'number' ? json.total : data.length;
      offset += limit;
      if (data.length === 0 || offset >= total || offset + limit > MAX_OFFSET_PLUS_LIMIT) break;
    }
    const several = languages.length > 1 && languages[0] !== 'all';
    return (several ? orderTies(items, languages) : items).map((c) => this.toChapter(c, showLanguage));
  }

  async _otherLanguage(mangaId, wanted) {
    const json = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}`);
    const attrs = (json.data && json.data.attributes) || {};
    const available = Array.isArray(attrs.availableTranslatedLanguages) ? attrs.availableTranslatedLanguages : [];
    if (!available.length || available.some((lang) => wanted.indexOf(lang) !== -1)) return null;
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

  async volumeEdition(mangaId, available) {
    const wanted = wantedLanguages();
    const key = `${wanted.join(',')}|${mangaId}`;
    this._editions = this._editions || new Map();
    if (this._editions.has(key)) return this._editions.get(key);
    let candidates = wanted;
    if (wanted[0] === 'all') {
      let listed = available;
      if (!Array.isArray(listed)) {
        const json = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}`);
        listed = (json.data && json.data.attributes && json.data.attributes.availableTranslatedLanguages) || [];
      }
      candidates = ['en'].concat(listed);
    }
    const tried = [];
    candidates.forEach((lang) => {
      if (tried.indexOf(lang) === -1) tried.push(lang);
    });
    const found = await Promise.all(
      tried.slice(0, 8).map(async (lang) => {
        let json;
        try {
          json = await this.requestJSON(`${API_BASE}/manga/${encodeURIComponent(mangaId)}/aggregate?${qsRepeat('translatedLanguage[]', [lang])}`);
        } catch (e) {
          return null;
        }
        const volumes = [];
        Object.keys((json && json.volumes) || {}).forEach((k) => {
          if (k === 'none' || k === '') return;
          const entry = json.volumes[k];
          const chapters = Object.keys((entry && entry.chapters) || {})
            .map((n) => entry.chapters[n])
            .filter((c) => c && c.id && !c.isUnavailable);
          if (!chapters.length) return;
          const rank = (c) => (Number.isFinite(Number(c.chapter)) ? Number(c.chapter) : Infinity);
          chapters.sort((a, b) => rank(a) - rank(b));
          volumes.push({ key: k, chapters });
        });
        const rankVolume = (v) => (Number.isFinite(Number(v.key)) ? Number(v.key) : Infinity);
        volumes.sort((a, b) => rankVolume(a) - rankVolume(b));
        return volumes.length ? { language: lang, volumes, size: volumes.reduce((n, v) => n + v.chapters.length, 0) } : null;
      })
    );
    let edition = null;
    found.forEach((candidate) => {
      if (candidate && (!edition || candidate.size > edition.size)) edition = candidate;
    });
    this._editions.set(key, edition);
    return edition;
  }

  async volumeEntries(mangaId) {
    const edition = await this.volumeEdition(mangaId);
    if (!edition) return [];
    const wanted = wantedLanguages();
    const label =
      wanted.length > 1 || wanted[0] === 'all' || edition.language !== wanted[0]
        ? LANGUAGE_NAMES[edition.language] || String(edition.language).toUpperCase()
        : null;
    return edition.volumes.map((v, i) => ({
      id: VOLUME_PREFIX + v.key,
      chapterId: VOLUME_PREFIX + v.key,
      name: `Volume ${v.key}`,
      number: Number.isFinite(Number(v.key)) ? Number(v.key) : i + 1,
      group: [`${v.chapters.length} ${v.chapters.length === 1 ? 'chapter' : 'chapters'}`, label].filter(Boolean).join(' \u00b7 '),
    }));
  }

  async volumeDetails(mangaId, volumeId) {
    const id = splitId(mangaId);
    const edition = await this.volumeEdition(id.base);
    const key = String(volumeId).slice(VOLUME_PREFIX.length);
    const volume = edition && edition.volumes.find((v) => v.key === key);
    if (!volume) throw new Error(`MangaDex: volume ${key} is not listed for this title in your chapter languages`);
    const saver = App.getSourceSetting('dataSaver') === 'true';
    const parts = new Array(volume.chapters.length).fill(null);
    const load = async (i) => {
      const chapterId = volume.chapters[i].id;
      const home = await this.atHome(chapterId);
      parts[i] = await this.settlePages(chapterId, home, saver);
    };
    let next = 0;
    const worker = async () => {
      while (next < volume.chapters.length) {
        const i = next++;
        try {
          await load(i);
        } catch (e) {
          parts[i] = null;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(VOLUME_WORKERS, volume.chapters.length) }, worker));
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i].length) continue;
      try {
        await load(i);
      } catch (e) {
        parts[i] = null;
      }
    }
    const pages = [];
    let left = 0;
    parts.forEach((list) => {
      if (list && list.length) list.forEach((url) => pages.push(url));
      else left++;
    });
    if (!pages.length) throw new Error(`MangaDex: volume ${key} has no readable pages (its chapters are external or missing)`);
    if (left) console.error(`MangaDex: volume ${key} is missing ${left} of ${parts.length} chapters (no pages)`);
    return { id: volumeId, mangaId, pages };
  }

  async getChapterDetails(mangaId, chapterId) {
    if (splitId(mangaId).volumes) return this.volumeDetails(mangaId, chapterId);
    const home = await this.atHome(chapterId);
    const useDataSaver = App.getSourceSetting('dataSaver') === 'true';
    const pages = await this.settlePages(chapterId, home, useDataSaver);
    return { id: chapterId, mangaId, pages };
  }

  atHome(chapterId) {
    return this.requestJSON(`${API_BASE}/at-home/server/${encodeURIComponent(chapterId)}`);
  }

  pageUrls(home, saver) {
    const chapter = (home && home.chapter) || {};
    const quality = saver ? 'data-saver' : 'data';
    return ((saver ? chapter.dataSaver : chapter.data) || [])
      .filter((f) => typeof f === 'string')
      .map((f) => `${home.baseUrl}/${quality}/${chapter.hash}/${f}`);
  }

  async probePage(url, round) {
    try {
      const manager = App.createRequestManager({});
      const request = App.createRequest({ url, method: 'HEAD', headers: { 'User-Agent': PLAIN_UA, 'X-Check': String(round) } });
      const response = await Promise.race([manager.schedule(request), new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
      if (!response) return null;
      if (response.status >= 200 && response.status < 300) return true;
      return response.status === 404 || response.status >= 500 ? false : null;
    } catch (e) {
      return null;
    }
  }

  async probeAll(urls, round) {
    const found = new Array(urls.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const i = next++;
        found[i] = await this.probePage(urls[i], round);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PROBE_WORKERS, urls.length) }, worker));
    return found;
  }

  async settlePages(chapterId, home, saver) {
    let pages = this.pageUrls(home, saver);
    if (pages.length === 0) return pages;
    const started = Date.now();
    const last = pages.length - 1;
    const sample = Array.from(new Set([0, Math.floor(last / 3), Math.floor((2 * last) / 3), last]));
    const first = await Promise.all(sample.map((i) => this.probePage(pages[i], 0)));
    if (!first.some((ok) => ok === false)) return pages;

    let spare = this.pageUrls(home, !saver);
    let found = [];
    for (let round = 1; round <= SETTLE_ROUNDS && Date.now() - started < SETTLE_BUDGET_MS; round++) {
      found = await this.probeAll(pages, round);
      const missing = found.filter((ok) => ok === false).length;
      if (missing === 0) return pages;
      if (round === 1 && missing * 2 > pages.length) {
        try {
          const fresh = await this.atHome(chapterId);
          const freshPages = this.pageUrls(fresh, saver);
          if (freshPages.length === pages.length) {
            pages = freshPages;
            spare = this.pageUrls(fresh, !saver);
          }
        } catch (e) {
        }
      } else if (round < SETTLE_ROUNDS) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
    const replaceable = spare.length === pages.length ? found.map((ok, i) => (ok === false ? i : -1)).filter((i) => i >= 0) : [];
    if (replaceable.length === 0 || Date.now() - started > SETTLE_BUDGET_MS) return pages;
    const other = await this.probeAll(replaceable.map((i) => spare[i]), SETTLE_ROUNDS + 1);
    return pages.map((url, i) => {
      const at = replaceable.indexOf(i);
      return at >= 0 && other[at] === true ? spare[i] : url;
    });
  }

  async requestJSON(url) {
    if (this.agent !== 'browser') {
      try {
        return await this.fetchJSON(url, true);
      } catch (e) {
        if (!(e && e.refused)) throw e;
        this.agent = 'browser';
        console.error(`MangaDex: the plain agent was refused (${e.message}), using the app's browser identity from now on`);
      }
    }
    try {
      return await this.fetchJSON(url, false);
    } catch (e) {
      if (e && e.botCheck) this.agent = undefined;
      throw e;
    }
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
      if (isBotCheck(null, e)) throw Object.assign(new Error((e && e.message) || 'check not cleared'), plain ? { refused: true } : { botCheck: true });
      throw e;
    }
    if (isBotCheck(response)) {
      throw Object.assign(new Error(`HTTP ${response.status} check page`), plain ? { refused: true } : { botCheck: true });
    }
    if (plain && response.status === 403) throw Object.assign(new Error('HTTP 403'), { refused: true });
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
      volume: a.volume !== null && a.volume !== undefined && String(a.volume) !== '' ? String(a.volume) : undefined,
      time: a.publishAt ? Date.parse(a.publishAt) : undefined,
    };
  }
}

module.exports = { Source };
