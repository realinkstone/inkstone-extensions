const SITE_BASE = 'https://mangapill.com';
const IMAGE_REFERER = `${SITE_BASE}/`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const STATUS_WORDS = ['publishing', 'finished', 'on hiatus', 'discontinued', 'not yet published'];

function normalizeWhitespace(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^?#]+)/);
  if (!m) return '';
  return m[1].replace(/\/$/, '');
}

function extractChapterId(href) {
  const m = (href || '').match(/\/chapters\/([^?#]+)/);
  if (!m) return '';
  return m[1].replace(/\/$/, '');
}

function parseChapterNumber(text) {
  const m = (text || '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function encodePathId(id) {
  return (id || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('publishing')) return 'ONGOING';
  if (s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('discontinued')) return 'CANCELLED';
  return 'UNKNOWN';
}

function textWithBreaks($, el) {
  let out = '';
  $(el)
    .contents()
    .each((_, node) => {
      if (node.type === 'text') out += (node.data || '').replace(/[\r\n]+/g, ' ');
      else if (node.type === 'tag' && node.name === 'br') out += '\n';
      else out += $(node).text();
    });
  return out
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .join('\n\n');
}

function parseMangaCards($) {
  const results = [];
  $('a.relative.block[href^="/manga/"]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const card = link.parent();
    const title = normalizeWhitespace(card.find('a.mb-2 div').first().text());
    if (!title) return;

    const image = (link.find('img').attr('data-src') || '').trim();
    if (!image) return;

    const badgeRows = card.find('.flex.flex-wrap.gap-1.mt-1');
    let statusText = '';
    if (badgeRows.length > 0) {
      badgeRows
        .eq(0)
        .find('div')
        .each((_, d) => {
          const t = $(d).text().trim().toLowerCase();
          if (STATUS_WORDS.some((w) => t.includes(w))) statusText = t;
        });
    }

    const tags = [];
    if (badgeRows.length > 1) {
      badgeRows
        .eq(1)
        .find('div')
        .each((_, d) => {
          const t = normalizeWhitespace($(d).text());
          if (t) tags.push(t);
        });
    }

    const manga = {
      mangaId,
      title,
      image,
      referer: IMAGE_REFERER,
      webURL: `${SITE_BASE}/manga/${mangaId}`,
      medium: 'comics',
    };
    if (tags.length > 0) manga.tags = tags;
    if (statusText.includes('finished')) manga.completed = true;
    results.push(manga);
  });
  return results;
}

function hasNextLink($) {
  let found = false;
  $('a').each((_, a) => {
    if (found) return;
    if ($(a).attr('href') && $(a).text().trim() === 'Next') found = true;
  });
  return found;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'new', name: 'Recently Added Mangas' },
      { id: 'trending', name: 'Trending Mangas' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/search`);
      const $ = cheerio.load(html);
      const tags = [];
      $('input[name="genre"]').each((_, el) => {
        const value = ($(el).attr('value') || '').trim();
        if (value) tags.push({ id: value, label: value });
      });
      return tags;
    } catch (e) {
      console.error('Mangapill getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'new';
    const page = (metadata && metadata.page) || 1;

    if (query || includedTags.length > 0) {
      const params = [];
      if (query) params.push(`q=${encodeURIComponent(query)}`);
      includedTags.forEach((t) => {
        if (t && t.id) params.push(`genre=${encodeURIComponent(t.id)}`);
      });
      params.push(`page=${page}`);
      const url = `${SITE_BASE}/search?${params.join('&')}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = parseMangaCards($);
      const hasNext = results.length > 0 && hasNextLink($);
      return { results, metadata: hasNext ? { page: page + 1 } : undefined };
    }

    if (page > 1) return { results: [] };

    const url = feed === 'trending' ? `${SITE_BASE}/` : `${SITE_BASE}/mangas/new`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    return { results: parseMangaCards($) };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodePathId(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = normalizeWhitespace($('h1').first().text()) || mangaId;
    const image = ($('.flex-shrink-0.w-60.h-80 img').first().attr('data-src') || '').trim();

    const status = mapStatus(fieldByLabel($, 'Status'));

    const tags = [];
    $('label').each((_, el) => {
      if ($(el).text().trim() !== 'Genres') return;
      $(el)
        .parent()
        .find('a[href*="/search?genre="]')
        .each((_, a) => {
          const t = normalizeWhitespace($(a).text());
          if (t) tags.push(t);
        });
    });

    const descEl = $('p.text--secondary').first();
    const desc = descEl.length ? textWithBreaks($, descEl) : '';

    return {
      mangaInfo: {
        title,
        image,
        referer: IMAGE_REFERER,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/manga/${encodePathId(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapters [data-filter-list] a').each((_, el) => {
      const a = $(el);
      const href = a.attr('href') || '';
      const chapterId = extractChapterId(href);
      if (!chapterId) return;
      const name = normalizeWhitespace(a.text());
      if (!name) return;
      raw.push({ chapterId, name, number: parseChapterNumber(name) });
    });
    raw.reverse();

    return raw.map((r) => ({ id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/chapters/${encodePathId(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.js-page').each((_, el) => {
      const src = ($(el).attr('data-src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
    });

    return { id: chapterId, mangaId, pages, referer: IMAGE_REFERER };
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

function fieldByLabel($, label) {
  let value = '';
  $('label').each((_, el) => {
    if (value) return;
    if ($(el).text().trim() === label) {
      value = $(el).next('div').first().text().trim();
    }
  });
  return value;
}

module.exports = { Source };
