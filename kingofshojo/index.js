const SITE_BASE = 'https://kingofshojo.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const PAGE_SIZE = 40;

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  if (!text) return undefined;
  const m = (text || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[2], 10));
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)/);
  return m ? m[1] : '';
}

function parseMangaCards($, scope) {
  const results = [];
  scope.find('.bsx').each((_, el) => {
    const card = $(el);
    const a = card.find('a').first();
    const mangaId = extractMangaId(a.attr('href'));
    if (!mangaId) return;

    const title = cleanText(a.attr('title') || card.find('.tt').first().text());
    if (!title) return;

    const image = (card.find('.limit img').first().attr('src') || '').trim();
    if (!image) return;

    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${mangaId}/`,
      medium: 'comics',
    });
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'update', name: 'Latest Update' },
      { id: 'latest', name: 'Recently Added' },
      { id: 'popular', name: 'Most Popular' },
      { id: 'title', name: 'A-Z' },
      { id: 'titlereverse', name: 'Z-A' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/manga/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('.genrez li').each((_, li) => {
        const $li = $(li);
        const id = $li.find('input.genre-item').attr('value');
        const label = cleanText($li.find('label').first().text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Kingofshojo getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const url = page > 1
        ? `${SITE_BASE}/page/${page}/?s=${encodeURIComponent(query)}`
        : `${SITE_BASE}/?s=${encodeURIComponent(query)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = parseMangaCards($, $.root());
      const hasNext = $('.pagination a.next.page-numbers').length > 0;
      return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
    }

    const feed = (request && request.feed) || 'update';
    const includedTags = (request && request.includedTags) || [];

    const params = [`order=${encodeURIComponent(feed)}`, `page=${page}`];
    for (const tag of includedTags) {
      if (tag && tag.id) params.push(`genre[]=${encodeURIComponent(tag.id)}`);
    }
    const url = `${SITE_BASE}/manga/?${params.join('&')}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaCards($, $.root());
    return { results, metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.entry-title').first().text()) || mangaId;
    const image = ($('.seriestucontl .thumb img').first().attr('src') || '').trim();

    const fields = {};
    $('table.infotable tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 2) return;
      const label = cleanText($(tds[0]).text());
      const value = cleanText($(tds[1]).text());
      if (label) fields[label] = value;
    });

    const isRealValue = (v) => v && v.toLowerCase() !== 'n/a';
    const author = [fields['Author'], fields['Artist']].filter(isRealValue).join(', ');
    const status = mapStatus(fields['Status'] || '');
    const releaseDate = isRealValue(fields['Released']) ? fields['Released'] : undefined;

    const tags = [];
    $('.seriestugenre a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const descParts = [];
    $('.entry-content.entry-content-single p').each((_, p) => {
      const t = cleanText($(p).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0
      ? descParts.join(' ')
      : cleanText($('.entry-content.entry-content-single').text());

    return {
      mangaInfo: {
        title,
        image,
        author: author || undefined,
        desc,
        status,
        tags,
        releaseDate,
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
    $('#chapterlist li[data-num]').each((_, li) => {
      const $li = $(li);
      const a = $li.find('.eph-num a').first();
      const chapterId = lastPathSegment(a.attr('href'));
      if (!chapterId) return;

      const name = cleanText($li.find('.chapternum').first().text());
      const dateText = cleanText($li.find('.chapterdate').first().text());
      const time = dateText ? parseReleaseDate(dateText) : undefined;
      const rawNumber = parseFloat($li.attr('data-num'));

      raw.push({ chapterId, name, time, rawNumber });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = Number.isFinite(r.rawNumber) ? r.rawNumber : 0;
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
    const url = `${SITE_BASE}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('#readerarea img').each((_, img) => {
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
