const SITE_BASE = 'https://www.lelmanga.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function parseChapterDate(text) {
  if (!text) return undefined;
  const m = (text || '').trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[2], 10));
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('en cours')) return 'ONGOING';
  if (s.includes('terminé') || s.includes('termine') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('pause') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('annulé') || s.includes('annule') || s.includes('abandon')) return 'CANCELLED';
  return 'UNKNOWN';
}

function extractMangaId(href) {
  const m = (href || '').match(/\/(manga|manhwa|manhua)\/([^/?#]+)/);
  return m ? `${m[1]}/${m[2]}` : '';
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function mangaUrlFor(mangaId) {
  return `${SITE_BASE}/${mangaId}`;
}

function chapterUrlFor(chapterId) {
  return `${SITE_BASE}/${encodeURIComponent(chapterId)}`;
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
      webURL: mangaUrlFor(mangaId),
      medium: 'comics',
    });
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'update', name: 'Dernières Mises à Jour' },
      { id: 'latest', name: 'Récemment Ajoutés' },
      { id: 'popular', name: 'Populaire' },
      { id: 'title', name: 'A-Z' },
      { id: 'titlereverse', name: 'Z-A' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/manga`);
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
      console.error('LelManga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;

    if (query) {
      const url = page > 1
        ? `${SITE_BASE}/page/${page}?${qs({ s: query })}`
        : `${SITE_BASE}/?${qs({ s: query })}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = parseMangaCards($, $.root());
      const hasNext = $('.pagination a.next.page-numbers').length > 0;
      return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
    }

    const feed = (request && request.feed) || 'update';
    const includedTags = (request && request.includedTags) || [];

    const params = [qs({ order: feed, page })];
    for (const tag of includedTags) {
      if (tag && tag.id) params.push(`genre%5B%5D=${encodeURIComponent(tag.id)}`);
    }
    const url = `${SITE_BASE}/manga?${params.join('&')}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaCards($, $.root());
    const hasNext = $('.pagination a.next.page-numbers').length > 0;
    return { results, metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = mangaUrlFor(mangaId);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1.entry-title').first().text()) || mangaId;
    const image = ($('.info-left .thumb img').first().attr('src') || '').trim();

    const fields = {};
    $('.tsinfo .imptdt').each((_, el) => {
      const $el = $(el);
      const label = cleanText($el.clone().find('i, a, span').remove().end().text());
      const value = cleanText(
        $el.find('i').first().text() || $el.find('a').first().text() || $el.find('span').first().text(),
      );
      if (label) fields[label] = value;
    });

    const status = mapStatus(fields['Statut'] || '');

    const tags = [];
    $('.mgen a').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const descParts = [];
    $('.info-desc .entry-content.entry-content-single p').each((_, p) => {
      const t = cleanText($(p).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0
      ? descParts.join(' ')
      : cleanText($('.info-desc .entry-content.entry-content-single').text());

    return {
      mangaInfo: {
        title,
        image,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.requestHTML(mangaUrlFor(mangaId));
    const $ = cheerio.load(html);

    const raw = [];
    const seen = new Set();
    $('#chapterlist li[data-num]').each((_, li) => {
      const $li = $(li);
      const a = $li.find('.eph-num a').first();
      const chapterId = lastPathSegment(a.attr('href'));
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);

      const name = cleanText($li.find('.chapternum').first().text());
      const dateText = cleanText($li.find('.chapterdate').first().text());
      const time = dateText ? parseChapterDate(dateText) : undefined;
      const number = parseFloat($li.attr('data-num'));

      raw.push({ chapterId, name, time, number: Number.isFinite(number) ? number : 0 });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = chapterUrlFor(chapterId);
    const html = await this.requestHTML(url);

    let pages = [];
    const m = html.match(/ts_reader\.run\((\{[\s\S]*?\})\);?\s*<\/script>/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const images = (sources[0] && Array.isArray(sources[0].images)) ? sources[0].images : [];
        pages = images.map((src) => (src || '').trim()).filter((src) => /^https?:\/\//.test(src));
      } catch (e) {
        console.error(`LelManga getChapterDetails ts_reader parse failed for ${chapterId}: ` + (e && e.message));
      }
    }

    if (pages.length === 0) {
      const $ = cheerio.load(html);
      $('#readerarea img').each((_, img) => {
        const src = ($(img).attr('src') || '').trim();
        if (/^https?:\/\//.test(src)) pages.push(src);
      });
    }

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
