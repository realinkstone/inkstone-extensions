const SITE_BASE = 'https://novelfire.net';
const CHAPTER_PAGE_LIMIT = 60;
const CHAPTER_BATCH = 4;

const CHAPTERS_PER_PAGE = 100;
const DATE_PAGES_PER_CALL = 4;
const LIST_QUERY =
  'draw=1&columns%5B0%5D%5Bdata%5D=n_sort&columns%5B0%5D%5Bname%5D=' +
  '&columns%5B0%5D%5Bsearchable%5D=false&columns%5B0%5D%5Borderable%5D=true' +
  '&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc' +
  '&search%5Bvalue%5D=&search%5Bregex%5D=false';
const LIST_PAGE = 10000;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

class Source {
  constructor() {
    this.postIds = {};
    this.rowsByManga = {};
  }

  get state() {
    if (!this.stateManager) this.stateManager = App.createSourceStateManager();
    return this.stateManager;
  }

  getSourceFeeds() {
    return [
      { id: 'popular', name: 'Popular' },
      { id: 'new', name: 'Latest' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestText(
        `${SITE_BASE}/genre-all/sort-new/status-all/all-novel`
      );
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('#categorylist a').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const slugMatch = href.match(
          /^\/genre-([a-z0-9-]+)\/sort-[a-z]+\/status-[a-z]+\/all-novel/i
        );
        if (!slugMatch) return;
        const slug = slugMatch[1];
        if (slug === 'all' || seen[slug]) return;
        seen[slug] = true;
        const label = ($a.attr('title') || $a.text() || '').trim();
        if (label) tags.push({ id: slug, label });
      });
      return tags.sort((a, b) => a.label.localeCompare(b.label));
    } catch (e) {
      console.error('NovelFire getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const page = (metadata && metadata.page) || 1;
    const query = (request && request.title) || '';
    const tagIds = ((request && request.includedTags) || [])
      .map((t) => t.id)
      .filter(Boolean);
    const feed = (request && request.feed) || 'popular';

    let url;
    if (query) {
      url = `${SITE_BASE}/search?${qs({ keyword: query, page: page > 1 ? page : undefined })}`;
    } else {
      const genre = tagIds.length ? tagIds[0] : 'all';
      const sort = feed === 'new' ? 'new' : 'popular';
      const status = feed === 'completed' ? 'completed' : 'all';
      url = `${SITE_BASE}/genre-${genre}/sort-${sort}/status-${status}/all-novel${
        page > 1 ? `?${qs({ page })}` : ''
      }`;
    }

    try {
      const html = await this.requestText(url);
      const results = this.parseListing(html);
      return { results, metadata: results.length >= 20 ? { page: page + 1 } : undefined };
    } catch (e) {
      console.error('NovelFire getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    const html = await this.requestText(`${SITE_BASE}/book/${encodeURIComponent(mangaId)}`);
    await this.rememberPostId(mangaId, html);
    const $ = cheerio.load(html);

    const title = $('h1.novel-title').first().text().trim();
    const author = $('span[itemprop="author"]').first().text().trim();
    const cover = $('figure.cover img').first().attr('src');
    const desc = blockText($, $('.content.expand-wrapper').first());

    const statByLabel = (label) =>
      $('.header-stats span')
        .filter((_, el) => $(el).find('small').text().trim().toLowerCase() === label)
        .first();

    const chapterCount = statByLabel('chapters').find('strong').text().trim();
    const views = statByLabel('views').find('strong').text().trim();
    const statusStrong = statByLabel('status').find('strong');
    const status = (statusStrong.attr('class') || statusStrong.text() || '').trim();

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
        status: mapStatus(status),
        tags: tags.filter(Boolean),
        webURL: `${SITE_BASE}/book/${mangaId}`,
        medium: 'novel',
        views: toInt(views),
        chapters: toInt(chapterCount),
        completed: status.toLowerCase().indexOf('completed') !== -1,
      },
    };
  }

  async getChapters(mangaId) {
    let rows = null;
    try {
      rows = await this.chapterRows(mangaId);
    } catch (e) {
      console.warn('NovelFire chapter table failed, reading pages instead:', e);
    }
    if (!rows) return this.getChaptersFromPages(mangaId);

    const dates = await this.loadDates(mangaId);
    const lastPage = Math.max(1, Math.ceil(rows.length / CHAPTERS_PER_PAGE));
    try {
      await this.fetchDatePage(mangaId, lastPage, dates);
      await this.saveDates(mangaId, dates);
    } catch (e) {
      console.warn('NovelFire newest dates failed:', e);
    }
    return this.chaptersFrom(rows, dates);
  }

  async getChapterDates(mangaId) {
    const rows = this.rowsByManga[mangaId] || (await this.chapterRows(mangaId));
    if (!rows) return { dates: {}, remaining: 0 };
    const dates = await this.loadDates(mangaId);
    const pages = this.undatedPages(rows, dates);
    const found = {};
    let failure = null;
    for (const page of pages.slice(0, DATE_PAGES_PER_CALL)) {
      try {
        Object.assign(found, await this.fetchDatePage(mangaId, page, dates));
      } catch (e) {
        failure = e;
        break;
      }
    }
    await this.saveDates(mangaId, dates);
    if (failure && !Object.keys(found).length) throw failure;
    return {
      dates: found,
      remaining: this.undatedPages(rows, dates).length,
    };
  }

  async chapterRows(mangaId) {
    const postId = await this.postIdFor(mangaId);
    if (!postId) return null;
    const rows = [];
    for (let start = 0; start < LIST_PAGE * 10; start += LIST_PAGE) {
      const url =
        `${SITE_BASE}/ajax/listChapterDataAjax?post_id=${postId}&${LIST_QUERY}` +
        `&start=${start}&length=${LIST_PAGE}`;
      const json = JSON.parse(
        await this.requestText(url, undefined, {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        })
      );
      if (!json || !Array.isArray(json.data)) throw new Error('NovelFire: bad chapter table');
      for (const row of json.data) {
        const n = Number(row.n_sort);
        if (Number.isFinite(n) && n > 0) rows.push({ n, title: String(row.title || '').trim() });
      }
      if (json.data.length < LIST_PAGE || rows.length >= Number(json.recordsTotal || 0)) break;
    }
    if (!rows.length) return null;
    rows.sort((a, b) => a.n - b.n);
    this.rowsByManga[mangaId] = rows;
    return rows;
  }

  chaptersFrom(rows, dates) {
    return rows
      .map(({ n, title }) => ({
        id: `chapter-${n}`,
        chapterId: `chapter-${n}`,
        name: title || `Chapter ${n}`,
        number: n,
        time: dates[n] ? dates[n] * 1000 : undefined,
      }))
      .sort((a, b) => b.number - a.number);
  }

  undatedPages(rows, dates) {
    const pages = [];
    const last = Math.ceil(rows.length / CHAPTERS_PER_PAGE);
    for (let page = last; page >= 1; page -= 1) {
      const slice = rows.slice((page - 1) * CHAPTERS_PER_PAGE, page * CHAPTERS_PER_PAGE);
      if (slice.some(({ n }) => dates[n] === undefined)) pages.push(page);
    }
    return pages;
  }

  async fetchDatePage(mangaId, page, dates) {
    const html = await this.requestText(
      `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/chapters?${qs({ page })}`
    );
    const found = {};
    for (const chapter of this.parseChapterList(html, mangaId)) {
      const seconds = chapter.time ? Math.round(chapter.time / 1000) : 0;
      dates[chapter.number] = seconds;
      if (seconds) found[chapter.id] = seconds * 1000;
    }
    return found;
  }

  async loadDates(mangaId) {
    try {
      const saved = await this.state.retrieve(`dates:${mangaId}`);
      return saved && typeof saved === 'object' ? saved : {};
    } catch (e) {
      return {};
    }
  }

  async saveDates(mangaId, dates) {
    try {
      await this.state.store(`dates:${mangaId}`, dates);
    } catch (e) {
      console.warn('NovelFire could not save dates:', e);
    }
  }

  async postIdFor(mangaId) {
    if (this.postIds[mangaId]) return this.postIds[mangaId];
    try {
      const saved = await this.state.retrieve(`post:${mangaId}`);
      if (saved) return (this.postIds[mangaId] = String(saved));
    } catch (e) {
    }
    const html = await this.requestText(`${SITE_BASE}/book/${encodeURIComponent(mangaId)}`);
    return this.rememberPostId(mangaId, html);
  }

  async rememberPostId(mangaId, html) {
    const m = String(html).match(/report-post_id="(\d+)"/);
    if (!m) return null;
    if (this.postIds[mangaId] !== m[1]) {
      this.postIds[mangaId] = m[1];
      try {
        await this.state.store(`post:${mangaId}`, m[1]);
      } catch (e) {
      }
    }
    return m[1];
  }

  async getChaptersFromPages(mangaId) {
    try {
      const base = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/chapters`;
      const first = await this.requestText(base);

      const $pagination = cheerio.load(first);
      let lastPage = 1;
      $pagination('.pagination a[href*="page="]').each((_, el) => {
        const href = $pagination(el).attr('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) lastPage = Math.max(lastPage, parseInt(m[1], 10));
      });
      lastPage = Math.min(lastPage, CHAPTER_PAGE_LIMIT);

      const htmlByPage = { 1: first };
      let pending = [];
      for (let page = 2; page <= lastPage; page += 1) pending.push(page);

      for (let round = 0; round < 3 && pending.length; round += 1) {
        const width = round === 0 ? CHAPTER_BATCH : 1;
        const failed = [];
        for (let i = 0; i < pending.length; i += width) {
          await Promise.all(
            pending.slice(i, i + width).map((page) =>
              this.requestText(`${base}?${qs({ page })}`)
                .then((html) => {
                  htmlByPage[page] = html;
                })
                .catch((e) => {
                  console.error(`NovelFire chapters page ${page} failed:`, e);
                  failed.push(page);
                })
            )
          );
        }
        pending = failed.sort((a, b) => a - b);
      }
      if (pending.length) {
        throw new Error(
          `NovelFire: ${pending.length} of ${lastPage} chapter pages unavailable after retries ` +
            `(pages ${pending.join(', ')}), about ${pending.length * 100} chapters missing from this list`
        );
      }

      const chapters = [];
      const seen = {};
      for (let page = 1; page <= lastPage; page += 1) {
        const html = htmlByPage[page];
        if (!html) continue;
        for (const chapter of this.parseChapterList(html, mangaId)) {
          if (seen[chapter.id]) continue;
          seen[chapter.id] = true;
          chapters.push(chapter);
        }
      }
      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('NovelFire getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}/${chapterId}`;
      const html = await this.requestText(url);
      const $ = cheerio.load(html);
      const extractedPlainText = blockText($, $('#content').first());

      return { id: chapterId, mangaId, pages: [], text: extractedPlainText };
    } catch (e) {
      console.error('NovelFire getChapterDetails failed:', e);
      throw e;
    }
  }

  parseListing(html) {
    const $ = cheerio.load(html);
    const items = [];
    const $cards = $('li.novel-item').filter(
      (_, el) => $(el).parents('.popular-novels').length === 0
    );
    $cards.each((_, el) => {
      const $card = $(el);
      const $link = $card.find('a[href^="/book/"]').first();
      const href = $link.attr('href') || '';
      const slugMatch = href.match(/^\/book\/([^/?#]+)/);
      if (!slugMatch) return;
      const slug = slugMatch[1];

      const title = $card.find('.novel-title').first().text().trim() || $link.attr('title') || '';
      const cover = coverFrom($card.find('img').first());
      const statsText = $card.find('.novel-stats').text();
      const chapterMatch = statsText.match(/([\d,]+)\s*Chapters?/i);

      items.push({
        mangaId: slug,
        title: title || slug,
        image: cover ? absolute(cover) : undefined,
        chapters: chapterMatch ? toInt(chapterMatch[1]) : undefined,
        webURL: `${SITE_BASE}/book/${slug}`,
        medium: 'novel',
      });
    });
    return items;
  }

  parseChapterList(html, mangaId) {
    const $ = cheerio.load(html);
    const chapters = [];
    $('.chapter-list li a[href*="/chapter-"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      const numMatch = href.match(/chapter-([0-9.]+)/i);
      if (!numMatch) return;
      const number = parseFloat(numMatch[1]);
      if (!isFinite(number)) return;
      const title = $a.find('.chapter-title').text().trim();
      const datetime = $a.find('time.chapter-update').attr('datetime');

      chapters.push({
        id: `chapter-${numMatch[1]}`,
        chapterId: `chapter-${numMatch[1]}`,
        name: title || `Chapter ${number}`,
        number,
        time: datetime ? Date.parse(datetime.replace(' ', 'T') + 'Z') : undefined,
      });
    });
    return chapters;
  }

  async requestText(url, hopsLeft, extraHeaders) {
    const manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: Object.assign(
        { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        extraHeaders || {}
      ),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`NovelFire HTTP ${response.status}`);
    }

    const redirectTarget = extractLoadingShellRedirect(response.data);
    const remainingHops = hopsLeft === undefined ? 2 : hopsLeft;
    if (redirectTarget && remainingHops > 0) {
      console.warn(
        `NovelFire: ${url} bounced to a loading-shell mirror page; following its client-side redirect to ${redirectTarget}`
      );
      return this.requestText(redirectTarget, remainingHops - 1, extraHeaders);
    }
    return response.data;
  }
}

const LOADING_SHELL_MAX_BYTES = 4096;
function extractLoadingShellRedirect(html) {
  if (!html || html.length > LOADING_SHELL_MAX_BYTES) return undefined;
  if (!/class="spinner"/.test(html)) return undefined;
  const m = /window\.location\.href\s*=\s*["']([^"']+)["']/.exec(html);
  if (!m) return undefined;
  return m[1].replace(/\\\//g, '/');
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
  if (s.indexOf('ongoing') !== -1 || s.indexOf('releasing') !== -1) return 'ONGOING';
  if (s.indexOf('completed') !== -1 || s.indexOf('finished') !== -1) return 'COMPLETED';
  if (s.indexOf('hiatus') !== -1) return 'HIATUS';
  if (s.indexOf('cancelled') !== -1 || s.indexOf('dropped') !== -1) return 'CANCELLED';
  return 'UNKNOWN';
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
