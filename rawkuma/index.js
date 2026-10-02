const SITE_BASE = 'https://rawkuma.net';
const SEARCH_AJAX_URL = `${SITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`;
const LIBRARY_URL = `${SITE_BASE}/library/`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel')) return 'CANCELLED';
  return 'UNKNOWN';
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)\/?$/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function extractJsonLd($, type) {
  let result = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    const text = $(el).html() || $(el).text() || '';
    try {
      const data = JSON.parse(text);
      const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
      if (types.indexOf(type) !== -1) result = data;
    } catch (e) {
    }
  });
  return result;
}

function extractDescription($) {
  let node = $('[itemprop="description"][data-show="false"]').first();
  if (node.length === 0 || cleanText(node.text()) === '') {
    node = $('[itemprop="description"][data-show="true"]').first();
  }
  if (node.length === 0) return '';
  const clone = node.clone();
  clone.find('hr').replaceWith(' ');
  return cleanText(clone.text()).replace(/\s*\[…\]\s*$/, '').trim();
}

function loadFragment(html) {
  return cheerio.load(html, null, false);
}

function parseSearchCards($) {
  const results = [];
  $.root().children('div').each((_, el) => {
    const card = $(el);
    const infoBlock = card.children().first();
    const links = infoBlock.find('a[href*="/manga/"]');
    if (links.length === 0) return;

    const mangaId = extractMangaId(links.first().attr('href'));
    if (!mangaId) return;

    const image = (infoBlock.find('img').first().attr('src') || '').trim();
    if (!image) return;

    const titleLink = links.length > 1 ? links.eq(1) : links.first();
    const title = cleanText(titleLink.text()) || mangaId;

    const statusText = cleanText(infoBlock.find('span.bg-accent.text-xs').first().text());
    const desc = cleanText(infoBlock.find('p.line-clamp-3').first().text());

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    };
    if (desc) manga.summary = desc;
    if (statusText.toLowerCase() === 'completed') manga.completed = true;
    results.push(manga);
  });
  return results;
}

function hasNextPage($, currentPage) {
  let maxPage = 0;
  $('button[onclick*="addSingularFilter"]').each((_, el) => {
    const onclick = $(el).attr('onclick') || '';
    const m = onclick.match(/addSingularFilter'\]\('page',\s*'(\d+)'/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxPage) maxPage = n;
    }
  });
  return maxPage > currentPage;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'updated', name: 'Updated' },
      { id: 'popular', name: 'Popular' },
      { id: 'rating', name: 'Rating' },
      { id: 'bookmarked', name: 'Bookmarked' },
      { id: 'title', name: 'Title' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(LIBRARY_URL);
      const $ = cheerio.load(html);
      let data = null;
      $('script').each((_, el) => {
        if (data) return;
        const text = $(el).html() || '';
        const idx = text.indexOf('var searchTerms');
        if (idx === -1) return;
        const eq = text.indexOf('=', idx);
        if (eq === -1) return;
        let raw = text.slice(eq + 1).trim();
        if (raw.charAt(raw.length - 1) === ';') raw = raw.slice(0, -1);
        try {
          data = JSON.parse(raw);
        } catch (e) {
        }
      });
      if (!data || !data.genre) return [];
      const tags = [];
      Object.keys(data.genre).forEach((key) => {
        const g = data.genre[key];
        if (g && g.slug && g.name) tags.push({ id: g.slug, label: cleanText(g.name) });
      });
      return tags;
    } catch (e) {
      console.error('Rawkuma getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const feed = (request && request.feed) || 'updated';
    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];
    const excludedTags = (request && request.excludedTags) || [];

    const fields = { page: String(page), orderby: feed, order: 'desc' };
    if (query) fields.query = query;

    const includedSlugs = includedTags.map((t) => t && t.id).filter(Boolean);
    if (includedSlugs.length > 0) fields.genre = JSON.stringify(includedSlugs);

    const excludedSlugs = excludedTags.map((t) => t && t.id).filter(Boolean);
    if (excludedSlugs.length > 0) fields.genre_exclude = JSON.stringify(excludedSlugs);

    const html = await this.requestSearchCards(fields);
    const $ = loadFragment(html);
    const results = parseSearchCards($);
    const hasNext = results.length > 0 && hasNextPage($, page);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const ld = extractJsonLd($, 'ComicSeries');

    const title = cleanText((ld && ld.name) || $('h1[itemprop="name"]').first().text()) || mangaId;

    const image = (
      $('[itemprop="image"] img').first().attr('src') ||
      (ld && ld.image && ld.image.url) ||
      ''
    ).trim();

    const author = ld && ld.author && ld.author.name ? cleanText(ld.author.name) : undefined;

    let tags = [];
    if (ld && Array.isArray(ld.genre)) {
      tags = ld.genre.map((g) => cleanText(g)).filter(Boolean);
    } else {
      $('a[itemprop="genre"]').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) tags.push(t);
      });
    }

    const status = mapStatus((ld && ld.creativeWorkStatus) || '');
    const desc = extractDescription($);

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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapter-list > div[data-chapter-number]').each((_, el) => {
      const item = $(el);
      const link = item.find('a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText(item.find('span').first().text());
      const dateText = item.find('time').first().attr('datetime');
      const time = dateText ? Date.parse(dateText) : NaN;
      const number = parseFloat(item.attr('data-chapter-number'));

      raw.push({ chapterId, name, time, number });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = {
        id: r.chapterId,
        chapterId: r.chapterId,
        name: r.name || `Chapter ${r.number}`,
        number: Number.isFinite(r.number) ? r.number : 0,
      };
      if (!Number.isNaN(r.time)) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('section[data-image-data] img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
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

  async requestSearchCards(fields) {
    const manager = App.createRequestManager({});
    const body = Object.keys(fields)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(fields[key])}`)
      .join('&');
    const request = App.createRequest({
      url: SEARCH_AJAX_URL,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
