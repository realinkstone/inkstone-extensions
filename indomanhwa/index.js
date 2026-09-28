const SITE_BASE = 'https://indomanhwa.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const MONTHS_FULL = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet') || s.includes('tamat')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('batal')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseReleaseDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const mon = MONTHS_FULL[m[1]];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return Date.UTC(year, mon, day);
}

function chapterNumberFromId(chapterId) {
  const m = (chapterId || '').match(/-chapter-([\d.]+)$/i);
  return m ? parseFloat(m[1]) : 0;
}

const CARD_TITLE_SELECTOR = 'a[class*="line-clamp-2"][title]';

function parseCardListPage($) {
  const results = [];
  const seen = new Set();
  $(CARD_TITLE_SELECTOR).each((_, el) => {
    const $title = $(el);
    const href = ($title.attr('href') || '').trim();
    const slug = href.replace(/^\//, '').replace(/\/$/, '');
    if (!slug || slug.includes('/') || seen.has(slug)) return;

    const title = cleanText($title.attr('title')) || cleanText($title.text());
    if (!title) return;

    const row = $title.closest('div');
    const card = row.parent();
    const coverLink = card.children('a').first();
    const image = (coverLink.find('img').first().attr('src') || '').trim();

    const chapterBadge = cleanText(card.find('div[class*="bg-primary/60"]').first().text());
    const chapterMatch = chapterBadge.match(/(\d+(?:\.\d+)?)/);

    const ratingText = cleanText(card.find('p[class*="text-white"][class*="font-semibold"]').first().text());
    const rating = parseFloat(ratingText);

    seen.add(slug);
    const manga = {
      mangaId: slug,
      title,
      image,
      webURL: `${SITE_BASE}/${slug}`,
      medium: 'comics',
    };
    if (chapterMatch) manga.chapters = parseFloat(chapterMatch[1]);
    if (Number.isFinite(rating)) manga.rating = rating;
    results.push(manga);
  });
  return results;
}

function collectFactPanel($) {
  const facts = {};
  $('div').each((_, el) => {
    const children = $(el).children();
    if (children.length !== 2) return;
    const $label = $(children[0]);
    const $value = $(children[1]);
    if (!$label.is('span') || !$value.is('span')) return;
    if (!(($label.attr('class') || '').includes('font-semibold'))) return;
    const label = cleanText($label.text());
    if (!label) return;
    facts[label] = cleanText($value.text());
  });
  return facts;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'latest', name: 'Latest' },
      { id: 'popular', name: 'Popular' },
      { id: 'manga', name: 'Manga' },
      { id: 'manhwa', name: 'Manhwa' },
      { id: 'ongoing', name: 'Ongoing' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    if (metadata && metadata.page) {
      return { results: [], metadata: undefined };
    }

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'latest';

    const url = query ? `${SITE_BASE}/all` : `${SITE_BASE}/list/${encodeURIComponent(feed)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    let results = parseCardListPage($);

    if (query) {
      const q = query.toLowerCase();
      results = results.filter((m) => m.title.toLowerCase().includes(q));
    }

    return { results, metadata: undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1').first().text()) || mangaId;
    const image = ($('meta[property="og:image"]').attr('content') || '').trim();

    const tags = [];
    $('a[href^="/genre/"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const facts = collectFactPanel($);
    const status = mapStatus(facts['Status']);
    const author = facts['Author'] && facts['Author'] !== '-' ? facts['Author'] : undefined;
    const releaseDate = facts['Released'] || undefined;
    const chapters = parseInt(facts['Total Chapter'], 10);
    const viewsMatch = (facts['Dilihat'] || '').match(/[\d,.]+/);
    const views = viewsMatch ? parseInt(viewsMatch[0].replace(/[,.]/g, ''), 10) : undefined;

    const ratingText = cleanText($('span[class*="pr-3"][class*="items-center"]').first().text());
    const rating = parseFloat(ratingText);

    const desc = cleanText($('div.Sinopsis p').first().text());

    return {
      mangaInfo: {
        title,
        image,
        referer: SITE_BASE,
        tags,
        status,
        author,
        releaseDate,
        chapters: Number.isFinite(chapters) ? chapters : undefined,
        views: Number.isFinite(views) ? views : undefined,
        rating: Number.isFinite(rating) ? rating : undefined,
        desc,
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
    const seen = new Set();
    $('#listChapter li a').each((_, el) => {
      const $el = $(el);
      const href = ($el.attr('href') || '').trim();
      const chapterId = href.replace(/^\/read\//, '').replace(/\/$/, '');
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);

      const name = cleanText($el.find('span').first().text());
      const dateText = cleanText($el.find('span').eq(1).text());
      const time = parseReleaseDate(dateText);

      raw.push({ chapterId, name, time });
    });

    raw.reverse();

    return raw.map((r) => {
      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name, number: chapterNumberFromId(r.chapterId) };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/read/${encodeURIComponent(chapterId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('img.ld-img').each((_, el) => {
      const src = ($(el).attr('src') || '').trim();
      if (/^https?:\/\//.test(src)) pages.push(src);
    });

    return { id: chapterId, mangaId, pages, referer: SITE_BASE };
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
