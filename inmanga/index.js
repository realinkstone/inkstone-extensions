const SITE_BASE = 'https://inmanga.com';
const IMAGE_BASE = 'https://cdn1.intomanga.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'updated', name: 'Recently Updated', sortby: 3, broadcastStatus: 0 },
  { id: 'views', name: 'Most Viewed', sortby: 1, broadcastStatus: 0 },
  { id: 'new', name: 'Newly Added', sortby: 4, broadcastStatus: 0 },
  { id: 'az', name: 'Name (A-Z)', sortby: 5, broadcastStatus: 0 },
  { id: 'ongoing', name: 'Ongoing', sortby: 3, broadcastStatus: 1 },
  { id: 'completed', name: 'Completed', sortby: 3, broadcastStatus: 2 },
];
const DEFAULT_FEED_ID = 'updated';

function findFeed(id) {
  return FEEDS.find((f) => f.id === id) || FEEDS.find((f) => f.id === DEFAULT_FEED_ID);
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('emision') || s.includes('emisión')) return 'ONGOING';
  if (s.includes('finaliz') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('pausa')) return 'HIATUS';
  if (s.includes('cancel')) return 'CANCELLED';
  return 'UNKNOWN';
}

function mangaGuidFromId(mangaId) {
  const idx = (mangaId || '').indexOf('/');
  return idx === -1 ? mangaId || '' : mangaId.slice(idx + 1);
}

function findListGroupValue($, scope, label) {
  let value;
  scope.find('.list-group-item').each((_, item) => {
    if (value !== undefined) return;
    const $item = $(item);
    const valueEl = $item.find('.label').first();
    if (valueEl.length === 0) return;
    const clone = $item.clone();
    clone.find('.label').remove();
    if (cleanText(clone.text()) === label) {
      value = cleanText(valueEl.text());
    }
  });
  return value;
}

function parseMangaList($) {
  const results = [];
  $('a.manga-result').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') || '').trim();
    const mangaId = href.replace(/^\/?ver\/manga\//, '').replace(/\/$/, '');
    if (!mangaId) return;

    const title = cleanText($el.find('h4.ellipsed-text').first().text());
    if (!title) return;

    const image = ($el.find('img').first().attr('data-src') || '').trim();

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/ver/manga/${mangaId}`,
      medium: 'comics',
    };
    const status = mapStatus(findListGroupValue($, $el, 'Estado') || '');
    if (status === 'COMPLETED') manga.completed = true;
    results.push(manga);
  });
  return results;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const title = ((request && request.title) || '').trim();
    const feed = findFeed(request && request.feed);
    const page = (metadata && metadata.page) || 1;
    const take = 10;
    const skip = (page - 1) * take;

    const body = buildConsultBody({
      queryString: title,
      skip,
      take,
      sortby: feed.sortby,
      broadcastStatus: feed.broadcastStatus,
    });

    const html = await this.requestConsult(body);
    const $ = cheerio.load(html);
    const results = parseMangaList($);

    return {
      results,
      metadata: results.length >= take ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/ver/manga/${mangaId}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1').first().text()) || mangaId;
    const image = ($('.custom-bg-center img').first().attr('src') || '').trim();

    const status = mapStatus(findListGroupValue($, $.root(), 'Estado') || '');
    const releaseDate = findListGroupValue($, $.root(), 'Publicación');

    const descBox = $('.panel-body').first();
    const descClone = descBox.clone();
    descClone.find('br').replaceWith(' ');
    const desc = cleanText(descClone.text());

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      webURL: url,
      medium: 'comics',
    };
    if (releaseDate) mangaInfo.releaseDate = releaseDate;
    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const guid = mangaGuidFromId(mangaId);
    const url = `${SITE_BASE}/chapter/getall?mangaIdentification=${encodeURIComponent(guid)}`;
    const raw = await this.requestHTML(url);

    let outer;
    try {
      outer = JSON.parse(raw);
    } catch (e) {
      throw new Error('InManga getChapters: could not parse response');
    }
    let inner;
    try {
      inner = JSON.parse((outer && outer.data) || 'null');
    } catch (e) {
      throw new Error('InManga getChapters: could not parse inner chapter payload');
    }
    if (!inner || inner.success !== true || !Array.isArray(inner.result)) {
      const message = (inner && inner.message) || '';
      throw new Error(`InManga getChapters: chapter list request failed${message ? ` (${message})` : ''}`);
    }
    const list = inner.result;

    const chapters = list.map((c) => {
      const number = typeof c.Number === 'number' ? c.Number : parseFloat(c.Number) || 0;
      const friendly = c.FriendlyChapterNumber || String(number);
      const chapter = {
        id: c.Identification,
        chapterId: c.Identification,
        name: `Chapter ${friendly}`,
        number,
      };
      const time = Date.parse(c.RegistrationDate);
      if (!Number.isNaN(time)) chapter.time = time;
      return chapter;
    });

    chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/chapter/chapterIndexControls?identification=${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const mangaGuid = ($('#MangaIdentification').attr('value') || mangaGuidFromId(mangaId)).toLowerCase();
    const chapterGuid = ($('#ChapterIdentification').attr('value') || chapterId).toLowerCase();

    const pageEntries = [];
    $('img.ImageContainer[id]').each((_, el) => {
      const $el = $(el);
      const pageId = ($el.attr('id') || '').trim().toLowerCase();
      const pageNumber = parseInt($el.attr('data-pagenumber') || '0', 10);
      if (pageId) pageEntries.push({ pageId, pageNumber: Number.isNaN(pageNumber) ? 0 : pageNumber });
    });
    pageEntries.sort((a, b) => a.pageNumber - b.pageNumber);

    const pages = pageEntries.map((p) => `${IMAGE_BASE}/i/m/${mangaGuid}/c/${chapterGuid}/o/${p.pageId}.jpg`);

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

  async requestConsult(body) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url: `${SITE_BASE}/manga/getMangasConsultResult`,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
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

function buildConsultBody({ queryString, skip, take, sortby, broadcastStatus }) {
  const parts = [
    'filter[generes][]=' + encodeURIComponent(-1),
    'filter[queryString]=' + encodeURIComponent(queryString || ''),
    'filter[skip]=' + encodeURIComponent(skip),
    'filter[take]=' + encodeURIComponent(take),
    'filter[sortby]=' + encodeURIComponent(sortby),
    'filter[broadcastStatus]=' + encodeURIComponent(broadcastStatus),
    'filter[onlyFavorites]=false',
    'd=',
  ];
  return parts.join('&');
}

module.exports = { Source };
