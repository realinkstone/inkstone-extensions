const SITE_BASE = 'https://www.royalroad.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FEEDS = [
  { id: 'latest-updates', name: 'Latest Updates' },
  { id: 'new', name: 'Newest Fictions' },
  { id: 'trending', name: 'Trending' },
  { id: 'best-rated', name: 'Best Rated' },
  { id: 'active-popular', name: 'Ongoing Fictions' },
  { id: 'complete', name: 'Complete' },
  { id: 'weekly-popular', name: 'Popular This Week' },
  { id: 'rising-stars', name: 'Rising Stars' },
];
const FEED_IDS = FEEDS.map((f) => f.id);

const SORTS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'popularity', label: 'Popularity' },
  { id: 'rating', label: 'Average Rating' },
  { id: 'last_update', label: 'Last Update' },
  { id: 'release_date', label: 'Release Date' },
  { id: 'followers', label: 'Followers' },
  { id: 'length', label: 'Number of Pages' },
  { id: 'views', label: 'Views' },
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
];

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function toInt(text) {
  if (!text) return undefined;
  const n = parseInt(String(text).replace(/[^\d]/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('ongoing')) return 'ONGOING';
  if (s.includes('completed')) return 'COMPLETED';
  if (s.includes('hiatus') || s.includes('inactive')) return 'HIATUS';
  if (s.includes('dropped') || s.includes('stub')) return 'CANCELLED';
  return 'UNKNOWN';
}

function fictionPath(href) {
  const m = (href || '').match(/\/fiction\/(\d+\/[^/?#]+)/);
  return m ? m[1] : '';
}

function chapterPath(href) {
  const m = (href || '').match(/\/chapter\/(\d+\/[^/?#]+)/);
  return m ? m[1] : '';
}

function statByIcon($card, iconClass) {
  const span = $card.find('i.' + iconClass).closest('div').find('span').first();
  return toInt(span.text());
}

function ratingFromAriaLabel(el) {
  const label = (el.attr('aria-label') || '').match(/([\d.]+)/);
  return label ? parseFloat(label[1]) : undefined;
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

function parseFictionList($) {
  const results = [];
  $('.fiction-list-item').each((_, el) => {
    const $card = $(el);
    const href = $card.find('a[href^="/fiction/"]').first().attr('href') || '';
    const mangaId = fictionPath(href);
    if (!mangaId) return;

    const title = cleanText($card.find('h2.fiction-title a').first().text());
    if (!title) return;

    const image = ($card.find('img[data-type="cover"]').first().attr('src') || '').trim();
    if (!image) return;

    const tags = [];
    $card.find('.tags a.fiction-tag').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    let completed = false;
    $card.find('.margin-bottom-10 > span.label').each((_, span) => {
      if (mapStatus(cleanText($(span).text())) === 'COMPLETED') completed = true;
    });

    const ratingEl = $card.find('[aria-label^="Rating:"]').first();
    const releaseDate = $card.find('.fa-calendar').closest('div').find('time').attr('datetime');

    const manga = {
      mangaId,
      title,
      image,
      tags,
      rating: ratingFromAriaLabel(ratingEl),
      views: statByIcon($card, 'fa-eye'),
      chapters: statByIcon($card, 'fa-list'),
      webURL: SITE_BASE + '/fiction/' + mangaId,
      medium: 'novel',
    };
    if (releaseDate) manga.releaseDate = releaseDate;
    if (completed) manga.completed = true;
    results.push(manga);
  });
  return results;
}

function hasNextPage($, currentPage) {
  let has = false;
  $('.pagination a[data-page]').each((_, a) => {
    const dp = parseInt($(a).attr('data-page'), 10);
    if (!isNaN(dp) && dp > currentPage) has = true;
  });
  return has;
}

class Source {
  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  getSortOptions() {
    return SORTS;
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(SITE_BASE + '/fictions/search');
      const $ = cheerio.load(html);

      let genresRow = null;
      $('label').each((_, el) => {
        if (!genresRow && cleanText($(el).text()) === 'Genres') genresRow = $(el).next('.row');
      });
      const genres = [];
      if (genresRow) {
        genresRow.find('button[data-tag]').each((_, btn) => {
          const id = $(btn).attr('data-tag');
          const label = cleanText($(btn).attr('data-label') || '');
          if (id && label) genres.push({ id, label });
        });
      }

      const additional = [];
      $('select[name="tagsAdd"] option').each((_, opt) => {
        const id = ($(opt).attr('value') || '').trim();
        const label = cleanText($(opt).text());
        if (id && label) additional.push({ id, label });
      });

      const groups = [];
      if (genres.length) groups.push({ id: 'genres', title: 'Genres', tags: genres });
      if (additional.length) groups.push({ id: 'additional', title: 'Additional Tags', tags: additional });
      return groups;
    } catch (e) {
      console.error('RoyalRoad getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const includedTags = ((request && request.includedTags) || []).map((t) => t && t.id).filter(Boolean);
    const excludedTags = ((request && request.excludedTags) || []).map((t) => t && t.id).filter(Boolean);
    const sortId = (request && request.sortId) || '';
    const feed = (request && request.feed) || 'latest-updates';
    const page = (metadata && metadata.page) || 1;

    let url;
    if (query || includedTags.length > 0 || excludedTags.length > 0 || sortId) {
      const params = [];
      if (query) params.push('title=' + encodeURIComponent(query));
      includedTags.forEach((id) => params.push('tagsAdd=' + encodeURIComponent(id)));
      excludedTags.forEach((id) => params.push('tagsRemove=' + encodeURIComponent(id)));
      if (sortId) params.push('orderBy=' + encodeURIComponent(sortId));
      params.push('page=' + page);
      url = SITE_BASE + '/fictions/search?' + params.join('&');
    } else {
      const feedSlug = FEED_IDS.indexOf(feed) !== -1 ? feed : 'latest-updates';
      url = SITE_BASE + '/fictions/' + feedSlug + '?page=' + page;
    }

    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseFictionList($);
    const hasNext = results.length > 0 && hasNextPage($, page);

    return { results, metadata: hasNext ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = SITE_BASE + '/fiction/' + mangaId;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.fic-title h1').first().text()) || mangaId;
    const image = ($('.cover-art-container img').first().attr('src') || '').trim();
    const author = cleanText($('.fic-title h4 a').first().text());

    let status = 'UNKNOWN';
    $('.fiction-info .margin-bottom-10 > span.label').each((_, span) => {
      const mapped = mapStatus(cleanText($(span).text()));
      if (mapped !== 'UNKNOWN') status = mapped;
    });

    const tags = [];
    $('.fiction-info .tags a.fiction-tag').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const desc = blockText($, $('.description .hidden-content').first());

    const rating = ratingFromAriaLabel($('.stats-content [aria-label$="stars"]').first());

    const stats = {};
    $('.stats-content li').each((_, li) => {
      const text = cleanText($(li).text());
      if (text.charAt(text.length - 1) === ':') {
        const key = text.slice(0, -1).trim().toLowerCase();
        stats[key] = cleanText($(li).next('li').text());
      }
    });

    return {
      mangaInfo: {
        title,
        image,
        author: author || undefined,
        desc,
        status,
        tags,
        rating,
        views: toInt(stats['total views']),
        chapters: $('tr.chapter-row').length || undefined,
        webURL: url,
        medium: 'novel',
        completed: status === 'COMPLETED',
      },
    };
  }

  async getChapters(mangaId) {
    const url = SITE_BASE + '/fiction/' + mangaId;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const chapters = [];
    $('tr.chapter-row').each((_, tr) => {
      const $tr = $(tr);
      const href = $tr.find('a').first().attr('href') || '';
      const chapterId = chapterPath(href);
      if (!chapterId) return;

      const name = cleanText($tr.find('td').first().text());
      const unixtime = $tr.find('time[unixtime]').first().attr('unixtime');
      const time = unixtime ? parseInt(unixtime, 10) * 1000 : undefined;

      const chapter = {
        id: chapterId,
        chapterId,
        name: name || 'Chapter ' + (chapters.length + 1),
        number: chapters.length + 1,
      };
      if (time !== undefined && !isNaN(time)) chapter.time = time;
      chapters.push(chapter);
    });

    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = SITE_BASE + '/fiction/' + mangaId + '/chapter/' + chapterId;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const text = blockText($, $('.chapter-inner.chapter-content').first());

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
      throw new Error('HTTP ' + response.status);
    }
    return response.data;
  }
}

module.exports = { Source };
