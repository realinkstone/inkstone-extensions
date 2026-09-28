const SITE_BASE = 'https://www.scan-vf.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('cours')) return 'ONGOING';
  if (s.includes('complet') || s.includes('termin') || s.includes('fini')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('pause')) return 'HIATUS';
  if (s.includes('annul') || s.includes('abandon') || s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseChapterListDate(text) {
  const m = (text || '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS[m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase()];
  if (mon === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[1], 10));
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function slugToChapterNumber(chapterSlug) {
  const m = (chapterSlug || '').match(/(\d+(?:\.\d+)?)\s*$/);
  return m ? parseFloat(m[1]) : 0;
}

function coverUrlFor(mangaId) {
  return `${SITE_BASE}/uploads/manga/${mangaId}/cover/cover_250x350.jpg`;
}

function parseMangaListFragment($) {
  const results = [];
  $('.media').each((_, el) => {
    const card = $(el);
    const link = card.find('.media-left a.thumbnail').first();
    const mangaId = lastPathSegment(link.attr('href'));
    if (!mangaId) return;

    const title = cleanText(card.find('.media-heading a').first().text());
    if (!title) return;

    const image = (link.find('img').attr('src') || '').trim();

    results.push({
      mangaId,
      title,
      image: image || coverUrlFor(mangaId),
      webURL: `${SITE_BASE}/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function parseLatestReleasePage($) {
  const results = [];
  const seen = new Set();
  $('.manga-item').each((_, el) => {
    const item = $(el);
    const link = item.find('h3.manga-heading a').first();
    const mangaId = lastPathSegment(link.attr('href'));
    if (!mangaId || seen.has(mangaId)) return;

    const title = cleanText(link.text());
    if (!title) return;
    seen.add(mangaId);

    results.push({
      mangaId,
      title,
      image: coverUrlFor(mangaId),
      webURL: `${SITE_BASE}/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function findDetailField($, label) {
  let found = null;
  $('dl.dl-horizontal > dt').each((_, el) => {
    if (found) return;
    if (cleanText($(el).text()) === label) {
      const dd = $(el).next('dd');
      if (dd.length) found = dd;
    }
  });
  return found;
}

function fieldAnchorsText($, field) {
  if (!field || field.length === 0) return '';
  const anchors = field.find('a');
  if (anchors.length > 0) {
    const parts = [];
    anchors.each((_, a) => {
      const t = cleanText($(a).text());
      if (t) parts.push(t);
    });
    if (parts.length > 0) return parts.join(', ');
  }
  return cleanText(field.text());
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'name', name: 'Catalog (A-Z)' },
      { id: 'views', name: 'Most Viewed' },
      { id: 'latest', name: 'Latest Chapters' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/manga-list`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.list-category a.category').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/[?&]cat=([^&]+)/);
        if (!m) return;
        const id = decodeURIComponent(m[1]);
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('ScanVF getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const results = await this.searchByTitle(query);
      return { results };
    }

    const feed = (request && request.feed) || 'name';

    if (feed === 'latest') {
      const html = await this.requestHTML(`${SITE_BASE}/latest-release?page=${page}`);
      const $ = cheerio.load(html);
      const results = parseLatestReleasePage($);
      const hasNext = $('a[rel="next"]').length > 0;
      return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
    }

    const catId = (request && request.includedTags && request.includedTags[0] && request.includedTags[0].id) || '';
    const sortBy = feed === 'views' ? 'views' : 'name';
    const asc = feed === 'views' ? 'false' : 'true';
    const url = `${SITE_BASE}/filterList?page=${page}&cat=${encodeURIComponent(catId)}&sortBy=${sortBy}&asc=${asc}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaListFragment($);
    const hasNext = $('a[rel="next"]').length > 0;
    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  async searchByTitle(query) {
    const url = `${SITE_BASE}/search?query=${encodeURIComponent(query)}`;
    const json = await this.requestJSON(url);
    const suggestions = (json && json.suggestions) || [];
    const results = [];
    const seen = new Set();
    for (const s of suggestions) {
      const mangaId = s && s.data;
      const title = cleanText(s && s.value);
      if (!mangaId || !title || seen.has(mangaId)) continue;
      seen.add(mangaId);
      results.push({
        mangaId,
        title,
        image: coverUrlFor(mangaId),
        webURL: `${SITE_BASE}/${mangaId}`,
        medium: 'comics',
      });
    }
    return results;
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h2.widget-title').first().text()) || mangaId;
    const image = ($('.boxed img').first().attr('src') || '').trim() || coverUrlFor(mangaId);

    const statusField = findDetailField($, 'Statut');
    const status = mapStatus(statusField ? statusField.text() : '');

    const author = fieldAnchorsText($, findDetailField($, 'Auteur(s)'));

    const tags = [];
    const catField = findDetailField($, 'Catégories');
    if (catField) {
      catField.find('a').each((_, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(t);
      });
    }

    const descParts = [];
    $('.well p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0 ? descParts.join(' ') : '';

    return {
      mangaInfo: {
        title,
        image,
        author,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('ul.chapters li').each((_, li) => {
      const $li = $(li);
      const h5 = $li.find('h5.chapter-title-rtl').first();
      const a = h5.find('a').first();
      const chapterId = lastPathSegment(a.attr('href'));
      if (!chapterId) return;

      const numberLabel = cleanText(a.text());
      const subtitle = cleanText(h5.find('em').first().text());
      const name = subtitle ? `${numberLabel} : ${subtitle}` : numberLabel;

      const dateText = cleanText($li.find('.date-chapter-title-rtl').first().text());
      const time = dateText ? parseChapterListDate(dateText) : undefined;

      raw.push({ chapterId, name, time });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = {
        id: r.chapterId,
        chapterId: r.chapterId,
        name: r.name,
        number: slugToChapterNumber(r.chapterId),
      };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('#all img[data-src]').each((_, img) => {
      const src = ($(img).attr('data-src') || '').trim();
      if (src) pages.push(src);
    });

    return { id: chapterId, mangaId, pages };
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

  async requestJSON(url) {
    const text = await this.requestHTML(url);
    return JSON.parse(text);
  }
}

module.exports = { Source };
