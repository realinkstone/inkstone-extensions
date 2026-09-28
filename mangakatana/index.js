const SITE_BASE = 'https://mangakatana.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDateMs(text) {
  const m = text && text.match(/([A-Za-z]{3})-(\d{1,2})-(\d{4})/);
  if (!m || !(m[1] in MONTHS)) return undefined;
  return Date.UTC(parseInt(m[3], 10), MONTHS[m[1]], parseInt(m[2], 10));
}

function parseChapterNumber(name) {
  const match = name.match(/(?:ch(?:apter)?\.?\s*)?([\d.]+)/i);
  return match ? parseFloat(match[1]) : 0;
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('completed') || s.includes('ended') || s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function lastPathSegment(href) {
  if (!href) return '';
  const parts = href.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function segmentAfter(href, marker) {
  if (!href) return '';
  const idx = href.indexOf(marker);
  if (idx === -1) return '';
  return href.slice(idx + marker.length).split(/[?#]/)[0];
}

function textWithBreaks($, el) {
  let out = '';
  $(el)
    .contents()
    .each((_, node) => {
      if (node.type === 'text') out += node.data;
      else if (node.type === 'tag' && node.name === 'br') out += '\n';
      else out += $(node).text();
    });
  return out.replace(/[ \t]+/g, ' ').trim();
}

function extractPageImages($) {
  let best = [];
  $('script').each((_, el) => {
    const content = $(el).html() || '';
    if (!content.includes('var ')) return;
    const arrayMatches = content.matchAll(/var\s+[a-zA-Z_$][\w$]*\s*=\s*\[((?:\s*'[^']*'\s*,?)+)\]/g);
    for (const m of arrayMatches) {
      const urls = Array.from(m[1].matchAll(/'([^']+)'/g))
        .map((x) => x[1])
        .filter((u) => /^https?:\/\//.test(u));
      if (urls.length > best.length) best = urls;
    }
  });
  return best;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest Updates' },
      { id: 'new', name: 'New Manga' },
      { id: 'az', name: 'All Manga' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/manga`);
      const $ = cheerio.load(html);
      const tags = $('#genre_side a')
        .map((_, el) => {
          const a = $(el);
          return { id: segmentAfter(a.attr('href') || '', '/genre/'), label: a.text().trim() };
        })
        .get()
        .filter((t) => t.id);
      const seen = new Set();
      return tags.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    } catch (e) {
      console.error('MangaKatana getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      const qs = `search=${encodeURIComponent(query)}&search_by=m_name`;
      url = page > 1 ? `${SITE_BASE}/page/${page}?${qs}` : `${SITE_BASE}/?${qs}`;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const base = `${SITE_BASE}/genre/${encodeURIComponent(includedTags[0].id)}`;
      url = page > 1 ? `${base}/page/${page}` : base;
    } else {
      const base =
        feed === 'new' ? `${SITE_BASE}/new-manga`
        : feed === 'az' ? `${SITE_BASE}/manga`
        : `${SITE_BASE}/latest`;
      url = page > 1 ? `${base}/page/${page}` : base;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = this.parseMangaListPage($);
    const hasNext = results.length > 0 && $('a.next.page-numbers').length > 0;
    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const root = $('#single_book');
    const scope = root.length ? root : $.root();

    const title = scope.find('h1.heading').first().text().trim() || mangaId;
    const image = (scope.find('.cover img').first().attr('src') || '').trim();
    const author = scope
      .find('.value.authors a.author')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(', ') || undefined;
    const tags = scope
      .find('.genres a')
      .map((_, el) => $(el).text().trim())
      .get();
    const status = mapStatus(scope.find('.value.status').first().text().trim());
    const descEl = scope.find('.summary p').first();
    const desc = descEl.length ? textWithBreaks($, descEl) : '';

    return {
      mangaInfo: {
        title,
        image,
        author,
        desc,
        status,
        tags,
        webURL: `${SITE_BASE}/manga/${mangaId}`,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const chapters = [];
    $('.chapters table tbody tr').each((_, row) => {
      const tr = $(row);
      const a = tr.find('td div.chapter a').first();
      const href = a.attr('href');
      const name = a.text().trim();
      if (!href || !name) return;
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;
      const time = parseDateMs(tr.find('td div.update_time').first().text().trim());
      const chapter = { id: chapterId, chapterId, name, number: parseChapterNumber(name) };
      if (time !== undefined) chapter.time = time;
      chapters.push(chapter);
    });
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const pages = extractPageImages($);
    return { id: chapterId, mangaId, pages };
  }

  parseMangaListPage($) {
    const results = [];
    $('#book_list .item').each((_, el) => {
      const item = $(el);

      const titleLink = item.find('h3.title a').first();
      const title = titleLink.text().trim();
      const href = titleLink.attr('href');
      if (!title || !href) return;
      const mangaId = segmentAfter(href, '/manga/');
      if (!mangaId) return;

      const image = (item.find('.wrap_img img').first().attr('src') || '').trim();
      if (!image) return;

      const completed = item.find('.media .status').hasClass('completed');
      const tags = item
        .find('.genres a')
        .map((_, e) => $(e).text().trim())
        .get();
      const summaryEl = item.find('.summary').first();
      const summary = summaryEl.length ? textWithBreaks($, summaryEl) || undefined : undefined;

      results.push({
        mangaId,
        title,
        image,
        tags,
        summary,
        completed,
        webURL: `${SITE_BASE}/manga/${mangaId}`,
        medium: 'comics',
      });
    });
    return results;
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
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
