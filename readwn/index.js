const SITE_BASE = 'https://www.wuxiabox.com';
const CHAPTER_PAGE_LIMIT = 60;
const CHAPTER_BATCH = 5;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

const FEED_CONFIG = {
  popular: { sort: 'onclick', status: 'all' },
  latest: { sort: 'newstime', status: 'all' },
  updated: { sort: 'lastdotime', status: 'all' },
  completed: { sort: 'newstime', status: 'Completed' },
};

class Source {
  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'latest', name: 'Latest' },
      { id: 'updated', name: 'Updated' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestText(`${SITE_BASE}/list/all/all-newstime-0.html`);
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('#categorylist a').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const slugMatch = href.match(/^\/list\/([a-z0-9_-]+)\/all-newstime-0\.html/i);
        if (!slugMatch) return;
        const slug = slugMatch[1];
        if (slug === 'all' || seen[slug]) return;
        seen[slug] = true;
        const label = $a.text().trim();
        if (label) tags.push({ id: slug, label });
      });
      return tags.sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('ReadWN getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = (request && request.title) || '';

    try {
      if (query) {
        if (metadata && metadata.searchid) {
          const url = `${SITE_BASE}/e/search/result/index.php?${qs({
            searchid: metadata.searchid,
            page: metadata.page - 1,
          })}`;
          const html = await this.requestText(url);
          const $ = cheerio.load(html);
          const results = this.parseListing($);
          const hasMore = maxPageIndex($, /[?&]page=(\d+)/) > metadata.page - 1;
          return {
            results,
            metadata: hasMore ? { searchid: metadata.searchid, page: metadata.page + 1 } : undefined,
          };
        }

        const html = await this.requestForm(`${SITE_BASE}/e/search/index.php`, {
          show: 'title',
          tempid: 1,
          tbname: 'news',
          keyboard: query,
        });
        const $ = cheerio.load(html);
        const results = this.parseListing($);
        const searchidMatch = html.match(/searchid=(\d+)/);
        const hasMore = searchidMatch && maxPageIndex($, /[?&]page=(\d+)/) > 0;
        return {
          results,
          metadata: hasMore ? { searchid: searchidMatch[1], page: 2 } : undefined,
        };
      }

      const page = (metadata && metadata.page) || 1;
      const feed = FEED_CONFIG[(request && request.feed) || 'popular'] || FEED_CONFIG.popular;
      const tagIds = ((request && request.includedTags) || []).map((t) => t.id).filter(Boolean);
      const genre = tagIds.length ? tagIds[0] : 'all';
      const pageIndex = page - 1;
      const url = `${SITE_BASE}/list/${genre}/${feed.status}-${feed.sort}-${pageIndex}.html`;
      const html = await this.requestText(url);
      const $ = cheerio.load(html);
      const results = this.parseListing($);
      const pageRe = new RegExp(`${feed.status}-${feed.sort}-(\\d+)\\.html`);
      const hasMore = maxPageIndex($, pageRe) > pageIndex;
      return { results, metadata: hasMore ? { page: page + 1 } : undefined };
    } catch (e) {
      console.error('ReadWN getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const html = await this.requestText(`${SITE_BASE}/novel/${encodeURIComponent(mangaId)}.html`);
    const $ = cheerio.load(html);

    const title = $('h1.novel-title').first().text().trim();
    const author = $('.author span[itemprop="author"]').first().text().trim();
    const cover = coverFrom($('.fixed-img .cover img').first());
    const desc = blockText($, $('.summary .content').first());

    const statByLabel = (label) =>
      $('.header-stats span')
        .filter((_, el) => $(el).find('small').text().trim().toLowerCase() === label)
        .first();
    const chapterCount = statByLabel('chapters').find('strong').text().trim();
    const statusText = statByLabel('status').find('strong').text().trim();

    const tags = [];
    $('.categories a.property-item').each((_, el) => {
      const t = $(el).text().trim();
      if (t) tags.push(t);
    });

    return {
      mangaInfo: {
        title: title || 'Untitled',
        image: cover ? absolute(cover) : undefined,
        author: author || undefined,
        desc,
        status: mapStatus(statusText),
        tags,
        webURL: `${SITE_BASE}/novel/${mangaId}.html`,
        medium: 'novel',
        chapters: toInt(chapterCount),
        completed: statusText.toLowerCase().indexOf('completed') !== -1,
      },
    };
  }

  async getChapters(mangaId) {
    try {
      const detailHtml = await this.requestText(`${SITE_BASE}/novel/${encodeURIComponent(mangaId)}.html`);
      let lastPage = 0;
      const pageRe = new RegExp('page=(\\d+)&(?:amp;)?wjm=' + escapeRegExp(mangaId), 'g');
      let m;
      while ((m = pageRe.exec(detailHtml))) {
        lastPage = Math.max(lastPage, parseInt(m[1], 10));
      }
      lastPage = Math.min(lastPage, CHAPTER_PAGE_LIMIT);

      const htmlByPage = { 0: detailHtml };
      let pending = [];
      for (let page = 1; page <= lastPage; page += 1) pending.push(page);

      for (let round = 0; round < 3 && pending.length; round += 1) {
        const width = round === 0 ? CHAPTER_BATCH : 1;
        const failed = [];
        for (let i = 0; i < pending.length; i += width) {
          await Promise.all(
            pending.slice(i, i + width).map((page) =>
              this.requestText(`${SITE_BASE}/e/extend/fy.php?${qs({ page, wjm: mangaId })}`)
                .then((html) => {
                  htmlByPage[page] = html;
                })
                .catch((e) => {
                  console.error(`ReadWN chapters page ${page} failed:`, e);
                  failed.push(page);
                })
            )
          );
        }
        pending = failed.sort((a, b) => a - b);
      }
      if (pending.length) {
        throw new Error(
          `ReadWN: ${pending.length} of ${lastPage} chapter pages unavailable for ${mangaId} ` +
            `after retries (pages ${pending.join(', ')}), about ${pending.length * 100} chapters missing`
        );
      }

      const fragments = [];
      for (let page = 0; page <= lastPage; page += 1) {
        if (htmlByPage[page] !== undefined) fragments.push(htmlByPage[page]);
      }

      const chapters = [];
      const seen = {};
      for (const html of fragments) {
        for (const chapter of this.parseChapterList(html)) {
          if (seen[chapter.id]) continue;
          seen[chapter.id] = true;
          chapters.push(chapter);
        }
      }
      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('ReadWN getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/novel/${encodeURIComponent(mangaId)}_${encodeURIComponent(chapterId)}.html`;
      const html = await this.requestText(url);
      const $ = cheerio.load(html);
      const text = blockText($, $('.chapter-content').first());
      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('ReadWN getChapterDetails failed:', e);
      throw e;
    }
  }

  parseListing($) {
    const items = [];
    $('li.novel-item').each((_, el) => {
      const $card = $(el);
      const $link = $card.find('a[href^="/novel/"]').first();
      const href = $link.attr('href') || '';
      const slugMatch = href.match(/^\/novel\/([^/?#]+)\.html/);
      if (!slugMatch) return;
      const slug = slugMatch[1];

      const title = $card.find('.novel-title').first().text().trim() || $link.attr('title') || '';
      const cover = coverFrom($card.find('img').first());
      const statsText = $card.find('.novel-stats').text();
      const chapterMatch = statsText.match(/([\d,]+)\s*Chapters?/i);
      const statusMatch = statsText.match(/Status:\s*([A-Za-z]+)/i);

      items.push({
        mangaId: slug,
        title: title || slug,
        image: cover ? absolute(cover) : undefined,
        chapters: chapterMatch ? toInt(chapterMatch[1]) : undefined,
        completed: statusMatch ? statusMatch[1].toLowerCase() === 'completed' : undefined,
        webURL: `${SITE_BASE}/novel/${slug}.html`,
        medium: 'novel',
      });
    });
    return items;
  }

  parseChapterList(html) {
    const $ = cheerio.load(html);
    const chapters = [];
    $('.chapter-list li').each((_, el) => {
      const $a = $(el).find('a[href]').first();
      const href = $a.attr('href') || '';
      const numMatch = href.match(/_([0-9]+)\.html$/);
      if (!numMatch) return;
      const number = parseInt(numMatch[1], 10);
      if (!isFinite(number)) return;
      const title = $a.find('.chapter-title').text().trim();
      const ageText = $a.find('.chapter-update').text();

      chapters.push({
        id: String(number),
        chapterId: String(number),
        name: title || `Chapter ${number}`,
        number,
        time: parseRelativeAge(ageText),
      });
    });
    return chapters;
  }

  async requestText(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ReadWN HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestForm(url, params) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: qs(params),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ReadWN HTTP ${response.status}`);
    }
    return response.data;
  }
}

function absolute(path) {
  return /^https?:\/\//i.test(path) ? path : `${SITE_BASE}${path.charAt(0) === '/' ? '' : '/'}${path}`;
}

function coverFrom($img) {
  if (!$img || !$img.length) return undefined;
  const dataSrc = $img.attr('data-src');
  if (dataSrc) return dataSrc;
  const src = $img.attr('src');
  return src && !/^data:/i.test(src) ? src : undefined;
}

function toInt(text) {
  if (!text) return undefined;
  const n = parseInt(String(text).replace(/,/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('completed') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancelled') !== -1 || s.indexOf('dropped') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRelativeAge(text) {
  if (!text) return undefined;
  const m = String(text)
    .trim()
    .match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i);
  if (!m) return undefined;
  const amount = parseInt(m[1], 10);
  const unitMs = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  }[m[2].toLowerCase()];
  if (!unitMs || !isFinite(amount)) return undefined;
  return Date.now() - amount * unitMs;
}

function maxPageIndex($, re) {
  let max = -1;
  $('.pagination a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
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
      text += inner.trim() ? `${inner}\n\n` : '\n';
    }
  });

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { Source };
