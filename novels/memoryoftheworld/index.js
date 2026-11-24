const SITE = 'https://library.memoryoftheworld.org';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PAGE = 30;
const MAX_FILTER_PAGES = 5;
const MIN_FILTERED = 10;
const RECORD_TTL_MS = 5 * 60 * 1000;
const BIG_FILE_BYTES = 150 * 1024 * 1024;

const FORMATS = [
  { key: 'epub', label: 'EPUB' },
  { key: 'mobi', label: 'MOBI' },
  { key: 'pdf', label: 'PDF' },
];

const FEEDS = {
  latest: { id: 'latest', name: 'Latest additions', path: 'books' },
  fiction: { id: 'fiction', name: 'Fiction', path: 'search/tag/Fiction' },
  philosophy: { id: 'philosophy', name: 'Philosophy', path: 'search/tag/Philosophy' },
  history: { id: 'history', name: 'History', path: 'search/tag/History' },
};

const GENRES = [
  'Anthropology',
  'Archaeology',
  'Architecture',
  'Art',
  'Biography & Autobiography',
  'Biology',
  'Business & Economics',
  'Computers',
  'Cooking',
  'Crime',
  'Design',
  'Drama',
  'Economics',
  'Education',
  'Essays',
  'Fantasy',
  'Feminism',
  'Fiction',
  'Film',
  'Gender Studies',
  'Geography',
  'History',
  'Horror',
  'Humor',
  'Law',
  'Linguistics',
  'Literary Collections',
  'Literary Criticism',
  'Marxism',
  'Mathematics',
  'Media Studies',
  'Medical',
  'Military',
  'Music',
  'Mystery',
  'Nature',
  'Performing Arts',
  'Philosophy',
  'Photography',
  'Physics',
  'Poetry',
  'Political Science',
  'Psychology',
  'Religion',
  'Science',
  'Science Fiction',
  'Short Stories',
  'Social Science',
  'Sociology',
  'Technology',
  'Theology',
  'Travel',
].map((name) => ({ id: name, label: name }));

const EXPLICIT = /\b(erotic\w*|pornograph\w*|porn|bdsm|sadomasochis\w*|kama\s*sutra|hentai|smut|sexually explicit|sex manuals?|sexual instruction|xxx)\b/i;
const MATURE = /\b(nude|nudes|nudity|prostitut\w*|sex workers?|sex work|sexual (abuse|assault|violence|harassment|slavery)|rape|incest|sexual practices|sexual behaviou?r|sexual fantasies)\b/i;

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function pathOf(path) {
  return String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function ratingOf(book) {
  const haystack = [book.title, book.series].concat(book.tags || []).join(' | ');
  if (EXPLICIT.test(haystack)) return 18;
  if (MATURE.test(haystack)) return 16;
  return 0;
}

function tagsOf(book) {
  const seen = new Set();
  const tags = [];
  for (const raw of book.tags || []) {
    const tag = clean(raw);
    if (!tag || tag.length > 40 || /^[A-Z0-9]+$/.test(tag) || /^[A-Z]{3}\d{6}/.test(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 15) break;
  }
  return tags;
}

function filesOf(book) {
  const files = [];
  for (const format of FORMATS) {
    const entry = (book.formats || []).find((f) => String(f.format).toLowerCase() === format.key);
    if (!entry || !entry.file_name) continue;
    files.push({
      key: format.key,
      label: format.label,
      size: Number(entry.size) || 0,
      url: SITE + pathOf((book.library_url || '') + (entry.dir_path || '') + entry.file_name),
    });
  }
  return files;
}

function sizeText(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function coverOf(book) {
  return book.cover_url ? SITE + pathOf((book.library_url || '') + book.cover_url) : undefined;
}

function cardOf(book) {
  return {
    mangaId: book._id,
    title: clean(book.title) || book._id,
    image: coverOf(book),
    author: (book.authors || []).slice(0, 4).join(', ') || undefined,
    tags: tagsOf(book),
    webURL: `${SITE}/#/book/${book._id}`,
    medium: 'novel',
    ageRating: ratingOf(book),
  };
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.records = new Map();
  }

  getSourceFeeds() {
    return Object.values(FEEDS).map((feed) => ({ id: feed.id, name: feed.name }));
  }

  async getSearchTags() {
    return GENRES;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') return { results: [] };
    const query = clean(request && request.title);
    const tag = ((request && request.includedTags) || [])[0];
    const tagName = tag ? clean(tag.id || tag.label) : '';
    let offset = (metadata && metadata.offset) || 0;
    let path;
    if (query) path = `search/all/${encodeURIComponent(query)}`;
    else if (tagName) path = `search/tag/${encodeURIComponent(tagName)}`;
    else path = (FEEDS[(request && request.feed) || 'latest'] || FEEDS.latest).path;
    const wanted = query && tagName ? tagName.toLowerCase() : '';
    const results = [];
    let more = false;
    for (let scanned = 0; scanned < (wanted ? MAX_FILTER_PAGES : 1); scanned++) {
      const data = await this.json(`${SITE}/${path}?limit=${PAGE}&offset=${offset}`);
      const items = data._items || [];
      let books = items.filter((book) => book && book._id && filesOf(book).length);
      if (wanted) books = books.filter((book) => (book.tags || []).some((t) => String(t).toLowerCase().includes(wanted)));
      for (const book of books) results.push(cardOf(book));
      const total = Number(data._meta && data._meta.total) || 0;
      offset += PAGE;
      more = items.length > 0 && offset < total;
      if (!more || results.length >= MIN_FILTERED) break;
    }
    return { results, metadata: more ? { offset } : undefined };
  }

  async getMangaDetails(mangaId) {
    const book = await this.record(mangaId);
    const info = cardOf(book);
    const extra = [];
    if (clean(book.series)) extra.push(`Series: ${clean(book.series)}`);
    const publisher = clean(book.publisher);
    const year = /^\d{4}/.test(book.pubdate || '') && !/^0101/.test(book.pubdate) ? String(book.pubdate).slice(0, 4) : '';
    if (publisher || year) extra.push(`Published${publisher ? ` by ${publisher}` : ''}${year ? ` (${year})` : ''}`);
    if ((book.languages || []).length) extra.push(`Language: ${book.languages.join(', ')}`);
    const abstract = String(book.abstract || '').trim();
    info.desc = [abstract, extra.join('\n')].filter(Boolean).join('\n\n') || undefined;
    info.status = 'COMPLETED';
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const book = await this.record(mangaId);
    const files = filesOf(book);
    if (!files.length) throw new Error('Memory of the World: this book has no EPUB, MOBI or PDF file');
    return files.map((file, i) => ({
      id: file.key,
      chapterId: file.key,
      name: file.size ? `${file.label} (${sizeText(file.size)})` : file.label,
      number: i + 1,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const book = await this.record(mangaId);
    const file = filesOf(book).find((f) => f.key === chapterId);
    if (!file) throw new Error(`Memory of the World: this book has no ${chapterId} file`);
    const big = file.size > BIG_FILE_BYTES ? ' It is larger than 150 MB, which Boundless Reader does not open.' : '';
    return {
      id: chapterId,
      mangaId,
      pages: [],
      text: `This chapter is a book file (${file.label}). If your reader cannot open books yet, download it here: ${file.url}.${big}`,
      book: { url: file.url, headers: { 'User-Agent': UA } },
    };
  }

  record(mangaId) {
    const now = Date.now();
    const known = this.records.get(mangaId);
    if (known && now - known.at < RECORD_TTL_MS) return known.promise;
    const promise = this.json(`${SITE}/book/${encodeURIComponent(mangaId)}`, true).then((book) => {
      if (!book || !book._id) throw new Error('Memory of the World: book not found');
      return book;
    });
    this.records.set(mangaId, { at: now, promise });
    promise.catch(() => {
      this.records.delete(mangaId);
    });
    return promise;
  }

  async json(url, notFoundIsError) {
    const response = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': UA },
      }),
    );
    if (response.status === 404 && notFoundIsError) throw new Error('Memory of the World: book not found');
    if (response.status < 200 || response.status >= 300) throw new Error(`Memory of the World: HTTP ${response.status} from ${url}`);
    try {
      return JSON.parse(response.data);
    } catch (error) {
      throw new Error(`Memory of the World: unreadable answer from ${url}`);
    }
  }
}

module.exports = { Source };
