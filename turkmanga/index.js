const SITE_BASE = 'https://turkmanga.org';
const API_BASE = 'https://api.turkmanga.org';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MANGALAR_PAGE_SIZE = 16;
const KATEGORI_PAGE_SIZE = 24;
const SEARCH_PAGE_SIZE = 16;

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function coverURL(slug) {
  return `${API_BASE}/api/media/manga/${encodeURIComponent(slug)}?width=600&height=900`;
}

function pageImageURL(mangaSlug, bolumSlug, idx) {
  return `${API_BASE}/api/media/${encodeURIComponent(mangaSlug)}/${encodeURIComponent(bolumSlug)}/${idx}`;
}

function mapStatus(finished) {
  return finished ? 'COMPLETED' : 'ONGOING';
}

function cleanName(s) {
  const cleaned = (s || '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*$/, '')
    .trim();
  return cleaned === '---' ? '' : cleaned;
}

function cleanAbout(about, title) {
  if (!about) return '';
  let text = String(about);
  const prefix = `Özet ${(title || '').trim()}`;
  if (title && text.startsWith(prefix)) {
    text = text.slice(prefix.length);
  }
  text = text.replace(/Daha Fazla Göster\s*$/i, '');
  return text.replace(/\s+/g, ' ').trim();
}

function buildChapterName(rawName, number, mangaTitle) {
  const base = `Bölüm ${number}`;
  if (!rawName) return base;
  let text = String(rawName).trim();
  const titlePrefix = (mangaTitle || '').trim();
  if (titlePrefix && text.toLowerCase().startsWith(titlePrefix.toLowerCase())) {
    text = text.slice(titlePrefix.length).replace(/^[\s–—-]+/, '');
  }
  const m = /^Bölüm\s*\d+\s*(.*)$/i.exec(text);
  const subtitle = m ? m[1].replace(/\s+/g, ' ').trim() : '';
  return subtitle ? `${base} - ${subtitle}` : base;
}

function toPartialManga(r) {
  const manga = {
    mangaId: r.slug,
    title: (r.name || '').trim(),
    image: coverURL(r.slug),
    webURL: `${SITE_BASE}/manga/${r.slug}`,
    medium: 'comics',
  };
  const about = cleanAbout(r.about, r.name);
  if (about) manga.summary = about;
  if (typeof r.finished === 'boolean') manga.completed = r.finished;
  if (r.year && r.year !== '---') manga.releaseDate = String(r.year).trim();
  return manga;
}

function parseNextData(html) {
  const $ = cheerio.load(html);
  const raw = $('#__NEXT_DATA__').first().html();
  if (!raw) throw new Error('__NEXT_DATA__ not found on page');
  return JSON.parse(raw);
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'tum-mangalar', name: 'Tüm Mangalar' },
      { id: 'haftalik', name: 'Haftanın En Çok Okunanları' },
      { id: 'aylik', name: 'Ayın En Çok Okunanları' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/mangalar`);
      const data = parseNextData(html);
      const list = (data.props && data.props.kategori_data && data.props.kategori_data.kategoriler) || [];
      return list
        .map((k) => ({ id: (k.slug || '').trim(), label: (k.kategori || '').trim() }))
        .filter((t) => t.id && t.label);
    } catch (e) {
      console.error('Turkmanga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = ((request && request.title) || '').trim();
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'tum-mangalar';
    const page = (metadata && metadata.page) || 1;

    if (query) return this.searchByTitle(query, page);
    if (includedTags[0] && includedTags[0].id) return this.fetchGenre(includedTags[0].id, page);
    if (feed === 'haftalik') return this.fetchPopular('week', page);
    if (feed === 'aylik') return this.fetchPopular('month', page);
    return this.fetchAllManga(page);
  }

  async getMangaDetails(mangaId) {
    const manga = await this.fetchMangaObject(mangaId);

    const author = cleanName(manga.author);
    const artist = cleanName(manga.artist);
    const authorField =
      author && artist && author.toLowerCase() === artist.toLowerCase()
        ? author
        : [author, artist].filter(Boolean).join(' / ');

    const tags = (manga.kategoriler || [])
      .map((k) => (k && k.name ? k.name.trim() : ''))
      .filter(Boolean);

    const slug = manga.slug || mangaId;
    return {
      mangaInfo: {
        title: (manga.name || '').trim() || String(mangaId),
        image: coverURL(slug),
        author: authorField || undefined,
        desc: cleanAbout(manga.about, manga.name),
        status: mapStatus(manga.finished),
        tags,
        webURL: `${SITE_BASE}/manga/${slug}`,
        medium: 'comics',
        publisher: cleanName(manga.ceviri) || undefined,
        releaseDate: manga.year && manga.year !== '---' ? String(manga.year).trim() : undefined,
      },
    };
  }

  async getChapters(mangaId) {
    const manga = await this.fetchMangaObject(mangaId);
    const episodes = manga.episodes || [];
    const group = cleanName(manga.ceviri) || undefined;
    const mangaTitle = manga.name || '';

    const chapters = episodes.map((e) => {
      const slug = e.slug || '';
      const slugMatch = /bolum-(\d+(?:\.\d+)?)/i.exec(slug);
      const nameMatch = /(\d+(?:\.\d+)?)/.exec(e.name || '');
      const parsed = slugMatch ? parseFloat(slugMatch[1]) : nameMatch ? parseFloat(nameMatch[1]) : NaN;
      const number = Number.isNaN(parsed) ? 0 : parsed;

      const chapter = {
        id: slug,
        chapterId: slug,
        name: buildChapterName(e.name, number, mangaTitle),
        number,
      };
      if (group) chapter.group = group;
      const t = e.date ? Date.parse(e.date) : NaN;
      if (!Number.isNaN(t)) chapter.time = t;
      return chapter;
    });

    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const data = parseNextData(html);
    const bolum = data.props && data.props.pageProps && data.props.pageProps.datab && data.props.pageProps.datab.bolum;
    if (!bolum) throw new Error('chapter not found');

    const count = Array.isArray(bolum.images) ? bolum.images.length : 0;
    const pages = [];
    for (let i = 0; i < count; i++) {
      pages.push(pageImageURL(mangaId, chapterId, i));
    }

    return { id: chapterId, mangaId, pages };
  }

  async fetchMangaObject(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const data = parseNextData(html);
    const manga = data.props && data.props.pageProps && data.props.pageProps.data && data.props.pageProps.data.manga;
    if (!manga) throw new Error('manga not found');
    return manga;
  }

  async fetchAllManga(page) {
    const html = await this.requestHTML(`${SITE_BASE}/mangalar?${qs({ page })}`);
    const data = parseNextData(html);
    const pp = data.props && data.props.pageProps;
    const rows = (pp && pp.data && pp.data.mangalar) || [];
    const items = rows.filter((r) => !r.draft).map(toPartialManga);
    return {
      results: items,
      metadata: rows.length >= MANGALAR_PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }

  async fetchGenre(slug, page) {
    const html = await this.requestHTML(`${SITE_BASE}/kategori/${encodeURIComponent(slug)}?${qs({ page })}`);
    const data = parseNextData(html);
    const pp = data.props && data.props.pageProps;
    const rows = (pp && pp.mangalar) || [];
    const items = rows.filter((r) => !r.draft).map(toPartialManga);
    return {
      results: items,
      metadata: rows.length >= KATEGORI_PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }

  async searchByTitle(query, page) {
    const html = await this.requestHTML(`${SITE_BASE}/search?${qs({ input: query, page })}`);
    const data = parseNextData(html);
    const pp = data.props && data.props.pageProps;
    const rows = (pp && pp.data && pp.data.mangalar) || [];
    const items = rows.filter((r) => !r.draft).map(toPartialManga);
    return {
      results: items,
      metadata: rows.length >= SEARCH_PAGE_SIZE ? { page: page + 1 } : undefined,
    };
  }

  async fetchPopular(kind, page) {
    if (page > 1) return { results: [], metadata: undefined };
    const html = await this.requestHTML(`${SITE_BASE}/populer`);
    const data = parseNextData(html);
    const pp = data.props && data.props.pageProps;
    const rows = (pp && pp[kind]) || [];
    return { results: rows.map(toPartialManga), metadata: undefined };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
