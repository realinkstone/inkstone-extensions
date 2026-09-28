const SITE_BASE = 'https://www.scribblehub.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: '1', name: 'Popularity' },
  { id: '3', name: 'Activity' },
  { id: '2', name: 'Favorites' },
  { id: '4', name: 'Readers' },
  { id: '5', name: 'Rising' },
];
const FEED_IDS = FEEDS.map((f) => f.id);

const SORTS = [
  { id: '1', label: 'Daily' },
  { id: '2', label: 'Weekly' },
  { id: '3', label: 'Monthly' },
  { id: '4', label: 'All Time' },
];

const GENRES = [
  { id: '9', label: 'Action' },
  { id: '902', label: 'Adult' },
  { id: '8', label: 'Adventure' },
  { id: '891', label: 'Boys Love' },
  { id: '7', label: 'Comedy' },
  { id: '903', label: 'Drama' },
  { id: '904', label: 'Ecchi' },
  { id: '38', label: 'Fanfiction' },
  { id: '19', label: 'Fantasy' },
  { id: '905', label: 'Gender Bender' },
  { id: '892', label: 'Girls Love' },
  { id: '1015', label: 'Harem' },
  { id: '21', label: 'Historical' },
  { id: '22', label: 'Horror' },
  { id: '37', label: 'Isekai' },
  { id: '906', label: 'Josei' },
  { id: '1180', label: 'LitRPG' },
  { id: '907', label: 'Martial Arts' },
  { id: '20', label: 'Mature' },
  { id: '908', label: 'Mecha' },
  { id: '909', label: 'Mystery' },
  { id: '910', label: 'Psychological' },
  { id: '6', label: 'Romance' },
  { id: '911', label: 'School Life' },
  { id: '912', label: 'Sci-fi' },
  { id: '913', label: 'Seinen' },
  { id: '914', label: 'Slice of Life' },
  { id: '915', label: 'Smut' },
  { id: '916', label: 'Sports' },
  { id: '5', label: 'Supernatural' },
  { id: '901', label: 'Tragedy' },
];

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function parseCount(text) {
  const t = (text || '').trim().replace(/,/g, '');
  const m = t.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return undefined;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(n * mult);
}

function toInt(text) {
  if (!text) return undefined;
  const n = parseInt(String(text).replace(/[^\d]/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function blockText($, $el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  clone.find('script, style').remove();
  clone.find('br').replaceWith('\n');

  let text = '';
  clone.contents().each((_, node) => {
    if (node.type === 'text') {
      text += node.data;
    } else {
      const inner = $(node).text();
      text += inner.trim() ? inner + '\n\n' : '\n';
    }
  });

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel') || s.includes('dropped') || s.includes('stub')) return 'CANCELLED';
  return 'UNKNOWN';
}

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDate(text) {
  if (!text) return undefined;
  const m = text
    .trim()
    .match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i);
  if (!m) return undefined;
  const mon = MONTHS[m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase()];
  if (mon === undefined) return undefined;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  let hour = 0;
  let minute = 0;
  if (m[4]) {
    hour = parseInt(m[4], 10) % 12;
    minute = parseInt(m[5], 10);
    if (/pm/i.test(m[6])) hour += 12;
  }
  return Date.UTC(year, mon, day, hour, minute);
}

function chapterIdFromHref(href) {
  const m = (href || '').match(/\/chapter\/(\d+)/);
  return m ? m[1] : '';
}

function seriesPath(href) {
  const m = (href || '').match(/\/series\/(\d+)\/([^/?#]+)/);
  return m ? `${m[1]}/${m[2]}` : '';
}

function parseListing($) {
  const results = [];
  $('.search_main_box').each((_, el) => {
    const $item = $(el);
    const titleLink = $item.find('.search_title a').first();
    const mangaId = seriesPath(titleLink.attr('href'));
    const title = cleanText(titleLink.text());
    if (!mangaId || !title) return;

    const image = ($item.find('.search_img img').first().attr('src') || '').trim();

    const ratingText = $item.find('.search_ratings').first().text();
    const ratingMatch = ratingText.match(/([\d.]+)/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

    let views;
    let chapters;
    let author;
    $item.find('.search_stats .nl_stat').each((_, span) => {
      const $span = $(span);
      const text = cleanText($span.text());
      const m = text.match(/^([\d.,]+[KMB]?)\s+(.+)$/i);
      if (m) {
        const label = m[2].toLowerCase();
        if (label === 'views') views = parseCount(m[1]);
        else if (label === 'chapters') chapters = toInt(m[1]);
      }
      if ($span.attr('title') === 'Author') author = cleanText($span.find('a').first().text());
    });

    const tags = [];
    $item.find('.search_genre a.fic_genre').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const descClone = $item.clone();
    descClone
      .find('.search_img, .search_title, .search_stats, .search_genre, .dots, .morelink')
      .remove();
    const summary = cleanText(descClone.text());

    const manga = {
      mangaId,
      title,
      image,
      tags,
      rating,
      views,
      chapters,
      webURL: `${SITE_BASE}/series/${mangaId}/`,
      medium: 'novel',
    };
    if (author) manga.author = author;
    if (summary) manga.summary = summary;
    results.push(manga);
  });
  return results;
}

const PAGE_SIZE = 25;
function hasNextPage(results) {
  return results.length >= PAGE_SIZE;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  getSortOptions() {
    return SORTS;
  }

  getSearchTags() {
    return GENRES;
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const tagIds = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const feed = FEED_IDS.indexOf((request && request.feed) || '') !== -1 ? request.feed : '1';
    const order = (request && request.sortId) || '2';

    let url;
    if (query) {
      url = `${SITE_BASE}/?s=${encodeURIComponent(query)}&post_type=fictionposts&pg=${page}`;
    } else {
      const params = [`sort=${encodeURIComponent(feed)}`, `order=${encodeURIComponent(order)}`];
      if (tagIds.length > 0) params.push(`ge=${tagIds.map(encodeURIComponent).join(',')}`);
      params.push(`pg=${page}`);
      url = `${SITE_BASE}/series-ranking/?${params.join('&')}`;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseListing($);

    return { results, metadata: hasNextPage(results) ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/series/${mangaId}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.fic_title').first().text()) || mangaId;
    const image = ($('.fic_image img').first().attr('src') || '').trim();
    const author = cleanText($('.sb_content.author .auth_name_fic').first().text());
    const desc = blockText($, $('.wi_fic_desc').first());

    const tags = [];
    $('.wi_fic_genre a.fic_genre').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });
    $('.wi_fic_showtags a.stag').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    let status = 'UNKNOWN';
    $('.widget_fic_similar > li').each((_, li) => {
      const text = cleanText($(li).text());
      const mapped = mapStatus(text);
      if (mapped !== 'UNKNOWN') status = mapped;
    });

    let views;
    let favorites;
    let chapters;
    $('.fic_stats .st_item').each((_, span) => {
      const clone = $(span).clone();
      const label = cleanText(clone.find('.mb_stat').text());
      clone.find('.mb_stat').remove();
      const value = cleanText(clone.text());
      if (/^views$/i.test(label)) views = parseCount(value);
      else if (/^favorites$/i.test(label)) favorites = parseCount(value);
      else if (/^chapters$/i.test(label)) chapters = toInt(value);
    });

    const ratingBlockText = cleanText($('#ratefic_user').first().text());
    const ratingCountMatch = ratingBlockText.match(/\(?(\d+)\s*ratings?\)?/i);
    const ratingCount = ratingCountMatch ? parseInt(ratingCountMatch[1], 10) : 0;
    const ratingMatch = ratingBlockText.match(/^([\d.]+)/);
    const rating = ratingCount > 0 && ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'novel',
      completed: status === 'COMPLETED',
    };
    if (author) mangaInfo.author = author;
    if (views !== undefined) mangaInfo.views = views;
    if (chapters !== undefined) mangaInfo.chapters = chapters;
    if (favorites !== undefined) mangaInfo.favorites = favorites;
    if (rating !== undefined) mangaInfo.rating = rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const postId = (mangaId || '').split('/')[0];
    if (!postId) return [];

    const raw = [];
    const seen = new Set();
    for (let pagenum = 1; pagenum <= 500; pagenum++) {
      const body = `action=wi_getreleases_pagination&pagenum=${pagenum}&mypostid=${encodeURIComponent(postId)}`;
      const fragment = await this.requestPost(`${SITE_BASE}/wp-admin/admin-ajax.php`, body);
      const trimmed = fragment.length > 0 ? fragment.slice(0, -1) : fragment;
      const $ = cheerio.load(trimmed);

      const items = $('li.toc_w');
      if (items.length === 0) break;

      let newCount = 0;
      items.each((_, li) => {
        const $li = $(li);
        const link = $li.find('a.toc_a').first();
        const chapterId = chapterIdFromHref(link.attr('href'));
        if (!chapterId || seen.has(chapterId)) return;
        seen.add(chapterId);
        newCount++;

        const number = parseInt($li.attr('order'), 10);
        const name = cleanText(link.text());
        const dateSpan = $li.find('.fic_date_pub').first();
        const time = parseDate(dateSpan.attr('title')) || parseDate(dateSpan.text());

        const chapter = { id: chapterId, chapterId, name, number: isFinite(number) ? number : 0 };
        if (time !== undefined) chapter.time = time;
        raw.push(chapter);
      });
      if (newCount === 0) break;
    }

    raw.sort((a, b) => a.number - b.number);
    return raw;
  }

  async getChapterDetails(mangaId, chapterId) {
    const readPath = (mangaId || '').replace('/', '-');
    const url = `${SITE_BASE}/read/${readPath}/chapter/${chapterId}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const text = blockText($, $('#chp_raw').first());

    return { id: chapterId, mangaId, pages: [], text };
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

  async requestPost(url, body) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
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
