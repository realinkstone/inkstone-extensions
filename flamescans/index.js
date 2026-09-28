const SITE_BASE = 'https://flamecomics.xyz';
const CDN_BASE = 'https://cdn.flamecomics.xyz';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const RESULTS_PER_PAGE = 24;

function slugify(label) {
  return (label || '').trim().toLowerCase();
}

function joinNames(list) {
  return (list || [])
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ');
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('completed')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function coverURL(seriesId, cover, version) {
  if (!cover) return '';
  const v = version ? `?${version}` : '';
  return `${CDN_BASE}/uploads/images/series/${seriesId}/${cover}${v}`;
}

const KNOWN_TAG_RE =
  /^<\/?(p|br|strong|em|b|i|u|s|span|div|li|ul|ol|a|h[1-6]|blockquote|sup|sub|hr|img)(?:[\s/>]|$)/i;

function escapeStrayAngleBrackets(html) {
  let out = '';
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === '<' && !KNOWN_TAG_RE.test(html.slice(i))) {
      out += '&lt;';
    } else {
      out += ch;
    }
  }
  return out;
}

function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(escapeStrayAngleBrackets(String(html)));
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

function parseNextData(html) {
  const $ = cheerio.load(html);
  const raw = $('#__NEXT_DATA__').first().html();
  if (!raw) throw new Error('__NEXT_DATA__ not found on page');
  return JSON.parse(raw);
}

function toPartialManga(s) {
  const manga = {
    mangaId: String(s.series_id),
    title: (s.title || '').trim(),
    image: coverURL(s.series_id, s.cover, s.last_edit),
    webURL: `${SITE_BASE}/series/${s.series_id}`,
    medium: 'comics',
  };
  const author = joinNames(s.author);
  if (author) manga.author = author;
  const desc = htmlToText(s.description);
  if (desc) manga.summary = desc;
  const tags = s.categories || s.tags;
  if (tags && tags.length) manga.tags = tags;
  const publisher = joinNames(s.publisher);
  if (publisher) manga.publisher = publisher;
  if (s.year) manga.releaseDate = String(s.year);
  if (s.status === 'Completed') manga.completed = true;
  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'browse', name: 'Browse' },
    ];
  }

  async getSearchTags() {
    try {
      const list = await this.fetchCatalog('browse');
      const seen = new Map();
      list.forEach((s) => {
        (s.categories || []).forEach((label) => {
          const trimmed = (label || '').trim();
          if (!trimmed) return;
          const id = slugify(trimmed);
          if (!seen.has(id)) seen.set(id, trimmed);
        });
      });
      return Array.from(seen.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('FlameScans getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = ((request && request.title) || '').trim();
    const includedTags = (request && request.includedTags) || [];
    const excludedTags = (request && request.excludedTags) || [];
    const feed = (request && request.feed) || 'latest';
    const page = (metadata && metadata.page) || 1;

    let list;
    if (query) {
      list = await this.fetchCatalog('browse');
    } else if (includedTags[0] && includedTags[0].id) {
      list = await this.fetchCatalog({ genre: includedTags[0].id });
    } else {
      list = await this.fetchCatalog(feed === 'browse' ? 'browse' : 'latest');
    }

    let filtered = list;
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter((s) => (s.title || '').toLowerCase().includes(q));
    }
    if (excludedTags.length > 0) {
      const excludeIds = new Set(excludedTags.map((t) => t && t.id).filter(Boolean));
      filtered = filtered.filter((s) => {
        const cats = s.categories || s.tags || [];
        return !cats.some((c) => excludeIds.has(slugify(c)));
      });
    }

    const start = (page - 1) * RESULTS_PER_PAGE;
    const pageItems = filtered.slice(start, start + RESULTS_PER_PAGE);
    const hasNext = start + RESULTS_PER_PAGE < filtered.length;

    return {
      results: pageItems.map(toPartialManga),
      metadata: pageItems.length > 0 && hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const pp = await this.fetchSeriesPage(mangaId);
    const s = pp.series;
    const author = [joinNames(s.author), joinNames(s.artist)].filter(Boolean).join(' / ');

    return {
      mangaInfo: {
        title: (s.title || '').trim() || String(mangaId),
        image: coverURL(s.series_id, s.cover, s.last_edit),
        author: author || undefined,
        desc: htmlToText(s.description),
        status: mapStatus(s.status),
        tags: s.tags || [],
        webURL: `${SITE_BASE}/series/${s.series_id}`,
        medium: 'comics',
        publisher: joinNames(s.publisher) || undefined,
        releaseDate: s.year ? String(s.year) : undefined,
      },
    };
  }

  async getChapters(mangaId) {
    const pp = await this.fetchSeriesPage(mangaId);
    const raw = (pp.chapters || []).slice();

    raw.sort((a, b) => {
      const na = parseFloat(a.chapter);
      const nb = parseFloat(b.chapter);
      const da = Number.isNaN(na) ? 0 : na;
      const db = Number.isNaN(nb) ? 0 : nb;
      if (da !== db) return da - db;
      return (a.chapter_id || 0) - (b.chapter_id || 0);
    });

    let lastNumber = -Infinity;
    return raw.map((c) => {
      const parsed = parseFloat(c.chapter);
      const displayNumber = Number.isNaN(parsed) ? 0 : parsed;
      let number = displayNumber;
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const title = (c.title || '').trim();
      const name = title ? `Chapter ${displayNumber} - ${title}` : `Chapter ${displayNumber}`;

      const chapter = { id: c.token, chapterId: c.token, name, number };
      if (typeof c.release_date === 'number') chapter.time = c.release_date * 1000;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const data = parseNextData(html);
    const ch = data.props && data.props.pageProps && data.props.pageProps.chapter;
    if (!ch) throw new Error('chapter not found');

    const images = ch.images || {};
    const orderedKeys = Object.keys(images)
      .map((k) => parseInt(k, 10))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)
      .map((n) => String(n));

    const version = ch.edit_time || ch.release_date;
    const pages = orderedKeys
      .map((k) => images[k])
      .filter((img) => img && img.name)
      .map((img) => {
        const v = version ? `?${version}` : '';
        return `${CDN_BASE}/uploads/images/series/${ch.series_id}/${ch.token}/${img.name}${v}`;
      });

    return { id: chapterId, mangaId, pages };
  }

  async fetchCatalog(kind) {
    let url;
    let key;
    if (kind && typeof kind === 'object' && kind.genre) {
      url = `${SITE_BASE}/genre/${encodeURIComponent(kind.genre)}`;
      key = 'series';
    } else if (kind === 'latest') {
      url = `${SITE_BASE}/latest`;
      key = 'allSeries';
    } else {
      url = `${SITE_BASE}/browse`;
      key = 'series';
    }
    const html = await this.requestHTML(url);
    const data = parseNextData(html);
    const pp = data.props && data.props.pageProps;
    const list = (pp && pp[key]) || [];
    return list.filter((s) => typeof s.series_id === 'number');
  }

  async fetchSeriesPage(mangaId) {
    const url = `${SITE_BASE}/series/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const data = parseNextData(html);
    const pp = data.props && data.props.pageProps;
    if (!pp || !pp.series) throw new Error('series not found');
    return pp;
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
