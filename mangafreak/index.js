const SITE_BASE = 'https://mangafreak.me';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/Manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractGenreId(href) {
  const m = (href || '').match(/\/Genre\/([^/?#]+)/);
  return m ? m[1] : '';
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function parseChapterNumber(chapterId) {
  const m = (chapterId || '').match(/_(\d+)([a-zA-Z]*)$/);
  if (!m) return 0;
  const base = parseInt(m[1], 10);
  return m[2] ? base + 0.5 : base;
}

function parseSlashDate(text) {
  const m = (text || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return undefined;
  return Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase().replace(/-/g, '');
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function fieldValue($, scope, label) {
  const prefix = label + ':';
  let value;
  scope.children('div').each((_, div) => {
    if (value !== undefined) return;
    const text = cleanText($(div).text());
    if (text.indexOf(prefix) === 0) value = text.slice(prefix.length).trim();
  });
  return value;
}

function parseLatestReleases($) {
  const results = [];
  $('.latest_releases_item').each((_, el) => {
    const card = $(el);
    const link = card.find('.latest_releases_info a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;
    const title = cleanText(link.text());
    if (!title) return;
    const image = (card.find('img').first().attr('src') || '').trim();
    if (!image) return;
    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/Manga/${mangaId}`,
      medium: 'comics',
    });
  });
  return results;
}

function parseMangaListAll($) {
  const results = [];
  $('.list_item').each((_, el) => {
    const card = $(el);
    const info = card.find('.list_item_info').first();
    const link = info.find('h3 a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;
    const title = cleanText(link.text());
    if (!title) return;
    const image = (card.find('.list_image img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/Manga/${mangaId}`,
      medium: 'comics',
    };

    info.children('div').each((_, div) => {
      const text = cleanText($(div).text());
      if (text.indexOf('Status:') === 0) {
        const status = mapStatus(text.slice('Status:'.length).trim());
        if (status === 'COMPLETED') manga.completed = true;
        else if (status === 'ONGOING') manga.completed = false;
      }
    });

    results.push(manga);
  });
  return results;
}

function parseRankingList($) {
  const results = [];
  $('.ranking_item').each((_, el) => {
    const card = $(el);
    const info = card.find('.ranking_item_info').first();
    const link = info.find('a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;
    const title = cleanText(link.text());
    if (!title) return;
    const image = (card.find('.ranking_item_image img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/Manga/${mangaId}`,
      medium: 'comics',
    };

    info.children('div').each((_, div) => {
      const text = cleanText($(div).text());
      const authorMatch = text.match(/^Sensei Name\s*-\s*(.+)$/);
      if (authorMatch) manga.author = authorMatch[1].trim();
      const statusMatch = text.match(/Published\.\s*\(([^)]+)\)/i);
      if (statusMatch) {
        const status = mapStatus(statusMatch[1]);
        if (status === 'COMPLETED') manga.completed = true;
        else if (status === 'ONGOING') manga.completed = false;
      }
    });

    results.push(manga);
  });
  return results;
}

function parseSearchResults($) {
  const results = [];
  $('.manga_search_item').each((_, el) => {
    const card = $(el);
    const spans = card.children('span');
    const imageSpan = spans.first();
    const infoSpan = spans.last();

    const link = infoSpan.find('h3 a').first();
    const mangaId = extractMangaId(link.attr('href'));
    if (!mangaId) return;
    const title = cleanText(link.text());
    if (!title) return;
    const image = (imageSpan.find('img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/Manga/${mangaId}`,
      medium: 'comics',
    };

    infoSpan.children('div').each((_, div) => {
      const $div = $(div);
      const text = cleanText($div.text());
      const statusMatch = text.match(/Published\.\s*\(([^)]+)\)/i);
      if (statusMatch) {
        const status = mapStatus(statusMatch[1]);
        if (status === 'COMPLETED') manga.completed = true;
        else if (status === 'ONGOING') manga.completed = false;
      }
      const genreLinks = $div.find('a[href^="/Genre/"]');
      if (genreLinks.length > 0) {
        const tags = [];
        genreLinks.each((_, a) => {
          const t = cleanText($(a).text());
          if (t) tags.push(t);
        });
        if (tags.length > 0) manga.tags = tags;
      }
    });

    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'New Release' },
      { id: 'all', name: 'Manga List' },
      { id: 'genre', name: 'Genre' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/Genre`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.genre_list a[href^="/Genre/"]').each((_, el) => {
        const id = extractGenreId($(el).attr('href'));
        if (!id || id === 'All' || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('MangaFreak getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'latest';

    let url;
    let parse;
    if (query) {
      url = `${SITE_BASE}/Find/${encodeURIComponent(query)}?page=${page}`;
      parse = parseSearchResults;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      url = `${SITE_BASE}/Genre/${encodeURIComponent(includedTags[0].id)}/${page}`;
      parse = parseRankingList;
    } else if (feed === 'all') {
      url = `${SITE_BASE}/Mangalist/All/${page}`;
      parse = parseMangaListAll;
    } else if (feed === 'genre') {
      url = `${SITE_BASE}/Genre/All/${page}`;
      parse = parseRankingList;
    } else {
      url = `${SITE_BASE}/Latest_Releases/${page}`;
      parse = parseLatestReleases;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parse($);
    const hasNext = results.length > 0 && $('a.next_p').length > 0;

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/Manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const dataScope = $('.manga_series_data');
    const title = cleanText(dataScope.find('h1').first().text()) || mangaId;
    const image = ($('.manga_series_image img').first().attr('src') || '').trim();

    const written = fieldValue($, dataScope, 'Written By');
    const illustrated = fieldValue($, dataScope, 'Illustrated By');
    let author;
    if (written && illustrated && written === illustrated) {
      author = written;
    } else {
      const parts = [written, illustrated].filter(Boolean);
      author = parts.length > 0 ? parts.join(', ') : undefined;
    }

    let statusText = '';
    dataScope.children('div').each((_, div) => {
      if (statusText) return;
      const text = cleanText($(div).text());
      const m = text.match(/^This is ([A-Za-z-]+) series$/);
      if (m) statusText = m[1];
    });
    const status = mapStatus(statusText);

    const tags = [];
    dataScope.find('.series_sub_genre_list a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const descParts = [];
    $('.manga_series_description p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.join(' ');

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
    const url = `${SITE_BASE}/Manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('.manga_series_list table tr').each((_, tr) => {
      const $tr = $(tr);
      const link = $tr.find('a.chapter-link').first();
      if (!link.length) return;
      const chapterId = lastPathSegment(link.attr('href'));
      if (!chapterId) return;
      const name = cleanText(link.text());
      const dateText = cleanText($tr.find('td').eq(1).text());
      const time = parseSlashDate(dateText);
      raw.push({ chapterId, name, time });
    });

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = parseChapterNumber(r.chapterId);
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.slideshow-container img').each((_, img) => {
      const src = ($(img).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
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
}

module.exports = { Source };
