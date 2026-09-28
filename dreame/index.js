const SITE_BASE = 'https://www.dreame.com';
const API_BASE = 'https://wap-api.dreame.com';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const LOCKED_CHAPTER_TEXT =
  "This chapter is a Dreame paid/coins-only chapter; only a short preview could be shown above. Read the rest on dreame.com or in the official Dreame app.";
const EMPTY_CHAPTER_TEXT = "This chapter's text could not be loaded from Dreame right now.";

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return decodeEntities(String(text || '')).replace(/\s+/g, ' ').trim();
}

function cleanParagraphs(text) {
  return decodeEntities(String(text || ''))
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(text) {
  return String(text || '').replace(/<[^>]+>/g, '');
}

function withPage(url, page) {
  if (!page || page <= 1) return url;
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}page=${page}`;
}

function parseNextData(html) {
  const $ = cheerio.load(html);
  const raw = $('#__NEXT_DATA__').first().html();
  if (!raw) throw new Error('Dreame: __NEXT_DATA__ not found on page');
  return JSON.parse(raw);
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥',
  brvbar: '¦', sect: '§', uml: '¨', copy: '©', ordf: 'ª',
  laquo: '«', not: '¬', shy: '­', reg: '®', macr: '¯',
  deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´',
  micro: 'µ', para: '¶', middot: '·', cedil: '¸', sup1: '¹',
  ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾',
  iquest: '¿',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä',
  Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É',
  Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î',
  Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó',
  Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  THORN: 'Þ', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä',
  aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é',
  ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î',
  iuml: 'ï', eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó',
  ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý',
  thorn: 'þ', yuml: 'ÿ',
  OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†', Dagger: '‡',
  bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″',
  lsaquo: '‹', rsaquo: '›', euro: '€', trade: '™',
};

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : full
    );
}

function chapterHtmlToText(html) {
  if (!html) return '';
  const text = decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  );
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function trimToLastSentence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  let lastEnd = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      lastEnd = i;
    }
  }
  if (lastEnd === -1) return trimmed;
  let end = lastEnd + 1;
  while (end < trimmed.length && /["')’”]/.test(trimmed[end])) end += 1;
  return trimmed.slice(0, end);
}

function mapSearchItem(raw) {
  const id = String(raw.id);
  const manga = {
    mangaId: id,
    title: cleanText(stripTags(raw.name)) || id,
    image: raw.coverUrl || undefined,
    webURL: `${SITE_BASE}/story/${id}`,
    medium: 'novel',
  };
  const author = cleanText(raw.authorName);
  if (author) manga.author = author;
  const summary = cleanText(stripTags(raw.descr));
  if (summary) manga.summary = summary;
  if (Array.isArray(raw.tags) && raw.tags.length) {
    const tags = raw.tags.map((t) => cleanText(stripTags(t))).filter(Boolean);
    if (tags.length) manga.tags = tags;
  }
  return manga;
}

function mapGenreItem(raw) {
  const id = String(raw.id);
  const manga = {
    mangaId: id,
    title: cleanText(raw.name) || id,
    image: raw.cover_url || raw.s_cover_url || undefined,
    webURL: `${SITE_BASE}/story/${id}`,
    medium: 'novel',
  };
  const author = cleanText(raw.author_name);
  if (author) manga.author = author;
  const summary = cleanText(raw.descr);
  if (summary) manga.summary = summary;
  if (Array.isArray(raw.tags) && raw.tags.length) {
    const tags = raw.tags.map((t) => cleanText(t && t.name)).filter(Boolean);
    if (tags.length) manga.tags = tags;
  } else if (raw.categories && raw.categories.name) {
    manga.tags = [cleanText(raw.categories.name)];
  }
  if (typeof raw.read_num === 'number') manga.views = raw.read_num;
  return manga;
}

function mapRankingItem(raw) {
  const id = String(raw.id);
  const manga = {
    mangaId: id,
    title: cleanText(raw.name) || id,
    image: raw.cover_url || undefined,
    webURL: `${SITE_BASE}/story/${id}`,
    medium: 'novel',
  };
  const author = cleanText(raw.author_name);
  if (author) manga.author = author;
  const summary = cleanText(raw.descr);
  if (summary) manga.summary = summary;
  if (typeof raw.read_num === 'number') manga.views = raw.read_num;
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'ranking-6112', name: 'Moon Ticket' },
      { id: 'ranking-6113', name: 'Best Sellers' },
      { id: 'ranking-6114', name: 'Rising Stars' },
      { id: 'ranking-6115', name: 'New Releases' },
      { id: 'ranking-6116', name: 'Completed' },
      { id: 'ranking-6117', name: 'Must Reads' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/search.html`);
      const data = parseNextData(html);
      const genres = (data.props && data.props.pageProps && data.props.pageProps.genres) || [];
      return genres
        .filter((g) => String(g.id) !== '-1')
        .map((g) => ({ id: String(g.id), label: cleanText(g.title) }))
        .filter((t) => t.id && t.label);
    } catch (e) {
      console.error('Dreame getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = cleanText(request && request.title);

    try {
      if (query) {
        const url = `${API_BASE}/search/getsearch?${qs({ kw: query, pn: page })}`;
        const json = await this.requestJSON(url);
        if (!json || json.errno !== 0 || !json.data) {
          throw new Error(`Dreame: search failed (errno ${json && json.errno})`);
        }
        const list = Array.isArray(json.data.novelList) ? json.data.novelList : [];
        const results = list.map(mapSearchItem);
        return {
          results,
          metadata: results.length > 0 ? { page: page + 1 } : undefined,
        };
      }

      const tagId =
        request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      if (tagId) {
        const url = withPage(`${SITE_BASE}/all-genres/${encodeURIComponent(tagId)}-genre.html`, page);
        const html = await this.requestHTML(url);
        const data = parseNextData(html);
        const genreData = (data.props && data.props.pageProps && data.props.pageProps.genreData) || {};
        const list = genreData.list || [];
        const total = typeof genreData.total === 'number' ? genreData.total : 0;
        const results = list.map(mapGenreItem);
        return {
          results,
          metadata: results.length > 0 && page * 10 < total ? { page: page + 1 } : undefined,
        };
      }

      const feed = (request && request.feed) || 'ranking-6112';
      const rankId = feed.indexOf('ranking-') === 0 ? feed.slice('ranking-'.length) : '6112';
      const url = withPage(`${SITE_BASE}/ranking/${encodeURIComponent(rankId)}`, page);
      const html = await this.requestHTML(url);
      const data = parseNextData(html);
      const info = (data.props && data.props.pageProps && data.props.pageProps.info) || {};
      const list = info.list || [];
      const pager = info.pager || {};
      const totalpage = typeof pager.totalpage === 'number' ? pager.totalpage : 0;
      const results = list.map(mapRankingItem);
      return {
        results,
        metadata: results.length > 0 && page < totalpage ? { page: page + 1 } : undefined,
      };
    } catch (e) {
      console.error('Dreame getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/story/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const data = parseNextData(html);
    const novelInfo = data.props && data.props.pageProps && data.props.pageProps.novelInfo;
    const n = novelInfo && novelInfo.novel;
    if (!n) {
      throw new Error('Dreame: manga not found');
    }

    const tags = Array.isArray(n.tag)
      ? n.tag.map((t) => cleanText((t && (t.name || t.tag_name)) || '')).filter(Boolean)
      : [];

    const mangaInfo = {
      mangaId: String(mangaId),
      title: cleanText(n.name) || String(mangaId),
      image: n.cover_url || n.s_cover_url || undefined,
      status: 'UNKNOWN',
      desc: cleanParagraphs(n.descr),
      tags,
      webURL: url,
      medium: 'novel',
    };
    const author = cleanText(n.author_name);
    if (author) mangaInfo.author = author;
    const chapterNum = Number(n.chapter_num);
    if (Number.isFinite(chapterNum) && chapterNum > 0) mangaInfo.chapters = chapterNum;
    const readNum = Number(n.read_num);
    if (Number.isFinite(readNum)) mangaInfo.views = readNum;
    const score = Number(n.score);
    if (Number.isFinite(score) && score > 0) mangaInfo.rating = score;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    try {
      const url = `${API_BASE}/novel/getcatelog?${qs({ nid: mangaId })}`;
      const json = await this.requestJSON(url);
      if (!json || json.errno !== 0 || !json.data || !json.data.pager) {
        throw new Error(`Dreame: chapter catalog failed (errno ${json && json.errno})`);
      }
      const list = Array.isArray(json.data.pager.chap_list) ? json.data.pager.chap_list : [];

      return list.map((c, index) => {
        const id = String(c.encode_id || c.id || '');
        return {
          id,
          chapterId: id,
          name: cleanText(c.title) || `Chapter ${index + 1}`,
          number: index + 1,
        };
      });
    } catch (e) {
      console.error('Dreame getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${API_BASE}/novel/getChapter?${qs({ cid: chapterId, bid: mangaId })}`;
      const json = await this.requestJSON(url);
      if (!json || json.errno !== 0 || !json.data) {
        throw new Error(`Dreame: chapter fetch failed (errno ${json && json.errno})`);
      }

      const info = json.data;
      const isFree = Number(info.is_free) === 1 || info.is_free === true;
      const decoded = chapterHtmlToText(App.base64Decode(info.content || ''));

      let text;
      if (isFree) {
        text = decoded || EMPTY_CHAPTER_TEXT;
      } else {
        const preview = trimToLastSentence(decoded);
        text = preview ? `${preview}\n\n${LOCKED_CHAPTER_TEXT}` : LOCKED_CHAPTER_TEXT;
      }

      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('Dreame getChapterDetails failed:', e);
      throw e;
    }
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Dreame HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestJSON(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Dreame API HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
