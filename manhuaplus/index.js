const SITE_BASE = 'https://manhuaplus.org';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function resolveUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return SITE_BASE + url;
  return url;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hold') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function extractGenreId(href) {
  const m = (href || '').match(/\/genres\/([^/?#]+)/);
  return m ? m[1] : '';
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function parseMangaList($) {
  const results = [];
  $('.grid.gtc-f141a.gg-20.p-13.mh-77vh > div').each((_, el) => {
    const card = $(el);
    const coverLink = card.find('.b-img a[href*="/manga/"]').first();
    const href = coverLink.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(coverLink.attr('title') || card.find('.text-center a').first().text());
    if (!title) return;

    const image = resolveUrl((card.find('.b-img img').first().attr('data-src') || '').trim());
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}`,
      medium: 'comics',
    };

    const ratingText = cleanText(card.find('.manga-meta .fa-star').first().parent().text());
    if (ratingText) {
      const rating = parseFloat(ratingText);
      if (!Number.isNaN(rating)) manga.rating = rating;
    }

    results.push(manga);
  });
  return results;
}

function hasNextPage($, page) {
  const target = String(page + 1);
  let found = false;
  $('#blog-pager a').each((_, a) => {
    if (!found && $(a).text().trim() === target) found = true;
  });
  return found;
}

function findInfoField($, label) {
  let found = null;
  $('.y6x11p').each((_, el) => {
    if (found) return;
    const $el = $(el);
    const dt = $el.find('.dt').first();
    const clone = $el.clone();
    clone.find('.dt').remove();
    const labelText = cleanText(clone.text());
    if (labelText.toLowerCase() === label.toLowerCase()) found = dt;
  });
  return found;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'last_update', name: 'Latest Updated' },
      { id: 'views', name: 'Most Viewed' },
      { id: 'score', name: 'Score' },
      { id: 'az', name: 'Name A-Z' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/home`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('.genresList a').each((_, el) => {
        const id = extractGenreId($(el).attr('href'));
        if (!id || seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).attr('title') || $(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Manhuaplus getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'last_update';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query) {
      url = `${SITE_BASE}/search/${page}/?keyword=${encodeURIComponent(query)}`;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      url = `${SITE_BASE}/genres/${encodeURIComponent(includedTags[0].id)}/${page}/?sort=${encodeURIComponent(feed)}&status=0`;
    } else {
      url = `${SITE_BASE}/all-manga/${page}/?sort=${encodeURIComponent(feed)}&status=0`;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);
    const hasNext = results.length > 0 && hasNextPage($, page);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const heroImage = $('#custom-hero img').first().attr('src');
    const image = resolveUrl((ogImage || heroImage || '').trim());

    const authorEl = findInfoField($, 'Authors');
    let author = '';
    if (authorEl) {
      const links = authorEl.find('a');
      if (links.length > 0) {
        const names = [];
        links.each((_, a) => {
          const t = cleanText($(a).text());
          if (t) names.push(t);
        });
        author = names.join(', ');
      } else {
        author = cleanText(authorEl.text());
      }
    }

    const statusEl = findInfoField($, 'Status');
    const status = mapStatus(statusEl ? statusEl.text() : '');

    const tags = [];
    $('a.label[href*="/genres/"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const desc = cleanText($('#syn-target').text());

    return {
      mangaInfo: {
        title,
        image,
        author: author || undefined,
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

    const raw = [];
    $('#myUL li.chapter').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a').first();
      const href = link.attr('href') || '';
      const chapterId = lastPathSegment(href);
      if (!chapterId) return;

      const name = cleanText(link.text());
      const numMatch = name.match(/chapter\s*([\d.]+)/i);
      const number = numMatch ? parseFloat(numMatch[1]) : 0;

      const dtAttr = $el.find('time.timeago').first().attr('datetime');
      const time = dtAttr ? parseInt(dtAttr, 10) * 1000 : undefined;

      raw.push({ chapterId, name, number, time });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = r.number;
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number };
      if (r.time !== undefined && !Number.isNaN(r.time)) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const readerUrl = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(readerUrl);

    const idMatch = html.match(/const\s+CHAPTER_ID\s*=\s*(\d+)/);
    if (!idMatch) {
      throw new Error('Manhuaplus: could not find CHAPTER_ID on chapter reader page');
    }

    const json = await this.requestJSON(`${SITE_BASE}/ajax/image/list/chap/${idMatch[1]}`, 'POST');
    if (!json || json.status !== true || typeof json.html !== 'string') {
      throw new Error('Manhuaplus: unexpected response from image list endpoint');
    }

    const $ = cheerio.load(json.html);
    const items = [];
    $('.separator[data-index]').each((_, el) => {
      const $el = $(el);
      const index = parseInt($el.attr('data-index'), 10);
      const src = ($el.find('a.readImg').first().attr('href') || '').trim();
      if (src && !Number.isNaN(index)) items.push({ index, src });
    });
    items.sort((a, b) => a.index - b.index);

    return { id: chapterId, mangaId, pages: items.map((i) => i.src) };
  }

  async requestHTML(url, method) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: method || 'GET',
      headers: { 'User-Agent': UA },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestJSON(url, method) {
    const text = await this.requestHTML(url, method);
    return JSON.parse(text);
  }
}

module.exports = { Source };
