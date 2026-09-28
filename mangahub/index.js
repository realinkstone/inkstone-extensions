const SITE_BASE = 'https://mangahub.io';
const API_URL = 'https://api.mghcdn.com/graphql';
const IMG_BASE = 'https://imgx.mghcdn.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const ORDER_MAP = {
  popular: 'POPULAR',
  latest: 'LATEST',
  az: 'ALPHABET',
  new: 'NEW',
  completed: 'COMPLETED',
};

function normalizeWhitespace(str) {
  return (str || '').replace(/[ \t\r\n]+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('completed') || s.includes('ended') || s.includes('finished')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function randomAccessToken() {
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

function gqlEscape(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findLabeledValue($, scope, label) {
  let value;
  scope.find('span').each((_, span) => {
    if (value !== undefined) return;
    if ($(span).text().trim() === label) {
      const next = $(span).next('span');
      if (next.length) value = next.text().trim();
    }
  });
  return value;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Updates' },
      { id: 'new', name: 'New' },
      { id: 'completed', name: 'Completed' },
      { id: 'az', name: 'A-Z' },
    ];
  }

  async getSearchTags() {
    try {
      const manager = App.createRequestManager({});
      const request = App.createRequest({
        url: API_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mhub-access': randomAccessToken(),
        },
        body: JSON.stringify({ query: '{genres{slug title}}' }),
      });
      const response = await manager.schedule(request);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`GraphQL HTTP ${response.status}`);
      }
      const json = JSON.parse(response.data);
      const genres = (json && json.data && json.data.genres) || [];
      const tags = [];
      const seen = new Set();
      genres.forEach((g) => {
        const id = g && g.slug;
        const label = g && normalizeWhitespace(g.title);
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MangaHub getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'popular';
    const order = ORDER_MAP[feed] || ORDER_MAP.popular;
    const includedTag = request && request.includedTags && request.includedTags[0];
    const genre = includedTag && includedTag.id ? includedTag.id : 'all';
    const page = (metadata && metadata.page) || 1;

    const qs = `q=${encodeURIComponent(query)}&order=${encodeURIComponent(order)}&genre=${encodeURIComponent(genre)}`;
    const url = page > 1 ? `${SITE_BASE}/search/page/${page}?${qs}` : `${SITE_BASE}/search?${qs}`;

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaCards($);
    return { results, metadata: results.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const h1 = $('h1').first();
    const scope = h1.length ? h1.closest('.row') : $.root();
    const infoScope = scope.length ? scope : $.root();

    const titleClone = h1.clone();
    titleClone.find('a, small').remove();
    const title = normalizeWhitespace(titleClone.text()) || mangaId;

    const image = (infoScope.find('img.manga-thumb').first().attr('src') || '').trim();
    const author = findLabeledValue($, infoScope, 'Author');
    const status = mapStatus(findLabeledValue($, infoScope, 'Status') || '');

    const tags = [];
    infoScope.find('a.genre-label').each((_, a) => {
      const t = normalizeWhitespace($(a).text());
      if (t) tags.push(t);
    });

    const desc = normalizeWhitespace($('meta[name="description"]').attr('content') || '');

    return {
      mangaInfo: {
        mangaId,
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
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const chapters = [];

    $('.tab-content li.list-group-item').each((_, li) => {
      const $li = $(li);
      const candidates = $li.find('a[href*="/chapter/"]');
      if (!candidates.length) return;

      let target = candidates.filter((_, a) => $(a).find('small').length > 0).first();
      if (!target.length) target = candidates.first();

      const href = (target.attr('href') || '').trim();
      const numMatch = href.match(/\/chapter-([\d.]+)\s*$/);
      if (!numMatch) return;

      const chapterId = href.split('/').filter(Boolean).pop();
      const number = parseFloat(numMatch[1]);
      const nameSource = target.clone();
      nameSource.find('small').remove();
      const name = normalizeWhitespace(nameSource.text()) || `Chapter ${numMatch[1]}`;

      const chapter = { id: chapterId, chapterId, name, number };

      const dateText = target.find('small').first().text().trim();
      const dm = dateText.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (dm) {
        const time = Date.UTC(parseInt(dm[3], 10), parseInt(dm[1], 10) - 1, parseInt(dm[2], 10));
        if (!Number.isNaN(time)) chapter.time = time;
      }

      chapters.push(chapter);
    });

    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/chapter/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const fallbackPages = [];
    $('img.PB0mN').each((_, img) => {
      const src = ($(img).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) fallbackPages.push(src);
    });

    let pages = fallbackPages;
    const numMatch = String(chapterId).match(/([\d.]+)\s*$/);
    if (numMatch) {
      try {
        const apiPages = await this.fetchPagesFromApi(mangaId, parseFloat(numMatch[1]));
        if (apiPages.length > 0) pages = apiPages;
      } catch (e) {
        console.warn(
          `MangaHub getChapterDetails: GraphQL page fetch failed for ${mangaId}/${chapterId}, ` +
            `falling back to ${fallbackPages.length} SSR-rendered page(s): ${e && e.message}`,
        );
      }
    }

    return { id: chapterId, mangaId, pages };
  }

  async fetchPagesFromApi(mangaId, number) {
    const manager = App.createRequestManager({});
    const cacheBustingUrl = `${API_URL}?slug=${encodeURIComponent(mangaId)}&n=${encodeURIComponent(number)}`;
    const query = `{chapter(slug:"${gqlEscape(mangaId)}",number:${number}){pages}}`;
    const request = App.createRequest({
      url: cacheBustingUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mhub-access': randomAccessToken(),
      },
      body: JSON.stringify({ query }),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GraphQL HTTP ${response.status}`);
    }
    const json = JSON.parse(response.data);
    const rawPages = json && json.data && json.data.chapter && json.data.chapter.pages;
    if (!rawPages) return [];
    const parsed = JSON.parse(rawPages);
    const prefix = parsed.p || '';
    const files = Array.isArray(parsed.i) ? parsed.i : [];
    return files.map((name) => `${IMG_BASE}/${prefix}${name}`);
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

function parseMangaCards($) {
  const results = [];
  $('.media-manga').each((_, el) => {
    const card = $(el);
    const href = card.find('.media-left a').first().attr('href') || card.find('h4.media-heading a').first().attr('href');
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = normalizeWhitespace(card.find('h4.media-heading a').first().text());
    if (!title) return;

    const image = (card.find('.media-left img').first().attr('src') || '').trim();
    if (!image) return;

    const author = normalizeWhitespace(card.find('h4.media-heading small').first().text()).replace(/^by\s+/i, '');

    const tags = [];
    card.find('a.genre-label').each((_, a) => {
      const t = normalizeWhitespace($(a).text());
      if (t) tags.push(t);
    });

    const statusText = normalizeWhitespace(card.find('.media-body > span').first().text());
    const statusMatch = statusText.match(/\(([^)]+)\)\s*$/);
    const completed = !!(statusMatch && /completed/i.test(statusMatch[1]));

    results.push({
      mangaId,
      title,
      image,
      author: author || undefined,
      tags,
      completed,
      webURL: `${SITE_BASE}/manga/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

module.exports = { Source };
