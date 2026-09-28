const SITE_BASE = 'https://ranobes.top';
const CHAPTER_PAGE_LIMIT = 500;
const CHAPTER_BATCH = 5;

const RATE_LIMIT = { requestsPerSecond: 0.5 };

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function absolute(path) {
  if (!path) return '';
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `${SITE_BASE}${trimmed.charAt(0) === '/' ? '' : '/'}${trimmed}`;
}

function decodeEntities(text) {
  if (!text) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function withPage(baseUrl, page) {
  if (!page || page <= 1) return baseUrl;
  return `${baseUrl}page/${page}/`;
}

function slugFromNovelHref(href) {
  const path = (href || '').split('?')[0].split('#')[0];
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return last.replace(/\.html$/i, '');
}

function splitMangaId(mangaId) {
  const m = String(mangaId || '').match(/^(\d+)-(.+)$/);
  if (!m) return { numericId: String(mangaId || ''), slug: '' };
  return { numericId: m[1], slug: m[2] };
}

function chapterDirSlug(mangaId) {
  const { numericId, slug } = splitMangaId(mangaId);
  return slug ? `${slug}-${numericId}` : numericId;
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('complet')) return 'COMPLETED';
  if (s.includes('drop') || s.includes('cancel') || s.includes('abandon')) return 'CANCELLED';
  if (s.includes('hiatus') || s.includes('paus') || s.includes('frozen')) return 'HIATUS';
  if (s.includes('active') || s.includes('ongoing')) return 'ONGOING';
  return 'UNKNOWN';
}

function parseTime(dateStr) {
  if (!dateStr) return undefined;
  const iso = dateStr.trim().replace(' ', 'T');
  const t = Date.parse(iso);
  return isFinite(t) ? t : undefined;
}

function chapterNumberFromTitle(title) {
  const m = String(title || '').match(/Chapter\s+(\d+(?:\.\d+)?)/i);
  return m ? parseFloat(m[1]) : undefined;
}

function extractChaptersData(html) {
  const m = html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    console.error('Ranobes: failed to parse window.__DATA__:', e);
    return null;
  }
}

function parseMangaList($) {
  const results = [];
  $('article.block.story.shortstory.mod-poster').each((_, el) => {
    const $el = $(el);
    const link = $el.find('h2.title a').first();
    const href = link.attr('href') || '';
    const mangaId = slugFromNovelHref(href);
    if (!mangaId) return;

    const title = cleanText(link.text()) || mangaId;

    const coverStyle = $el.find('figure.cover').first().attr('style') || '';
    const coverMatch = coverStyle.match(/url\(([^)]+)\)/);
    const image = coverMatch ? absolute(coverMatch[1].replace(/^['"]|['"]$/g, '')) : '';

    const summary = cleanText($el.find('.cont-in > div').first().text());

    const tagsText = cleanText($el.find('.r-rate .grey.ellipses.small').first().text());
    const tags = tagsText ? tagsText.split(',').map((t) => t.trim()).filter(Boolean) : [];

    const ratingText = cleanText($el.find('.r-date.r-rate strong').first().text());
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    const manga = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      webURL: absolute(href) || `${SITE_BASE}/novels/${mangaId}.html`,
      medium: 'novel',
    };
    if (summary) manga.summary = summary;
    if (tags.length) manga.tags = tags;
    if (rating && isFinite(rating)) manga.rating = rating;
    results.push(manga);
  });
  return results;
}

function hasNextPage($) {
  return $('.page_next a[href]').length > 0;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'novels', name: 'All Novels' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/tags/genre/`);
      const $ = cheerio.load(html);
      const seen = {};
      const tags = [];
      $('a[href^="/tags/genre/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/^\/tags\/genre\/([^/]+)\/?$/);
        if (!m || !m[1] || seen[m[1]]) return;
        seen[m[1]] = true;
        const label = cleanText($(el).find('h3.title').first().text()) || cleanText($(el).text());
        if (label) tags.push({ id: m[1], label });
      });
      return tags;
    } catch (e) {
      console.error('Ranobes getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }

    const query = (request && request.title) || '';
    const page = (metadata && metadata.page) || 1;
    const tagId =
      request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
    const feed = (request && request.feed) || 'novels';

    let baseUrl;
    if (query) {
      baseUrl = `${SITE_BASE}/search/${encodeURIComponent(query)}/`;
    } else if (tagId) {
      baseUrl = `${SITE_BASE}/tags/genre/${encodeURIComponent(tagId)}/`;
    } else if (feed === 'completed') {
      baseUrl = `${SITE_BASE}/tags/status-trs/Completed/`;
    } else {
      baseUrl = `${SITE_BASE}/novels/`;
    }

    const url = withPage(baseUrl, page);
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);

    return {
      results,
      metadata: results.length > 0 && hasNextPage($) ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/novels/${encodeURIComponent(mangaId)}.html`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const titleEl = $('h1.title').first().clone();
    titleEl.find('span').remove();
    const title = cleanText(titleEl.text()) || mangaId;

    const posterStyle = $('.r-fullstory-poster figure.cover').first().attr('style') || '';
    const posterMatch = posterStyle.match(/url\(([^)]+)\)/);
    const image = posterMatch ? absolute(posterMatch[1].replace(/^['"]|['"]$/g, '')) : '';

    const descContainer = $('.moreless.cont-text.showcont-h').first();
    const descClone = descContainer.clone();
    descClone.find('script, style, iframe, .grey').remove();
    descClone.find('br').replaceWith('\n');
    const desc = descClone
      .text()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n\n');

    const tags = [];
    $('#mc-fs-genre .links a').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    let statusText = '';
    let author = '';
    let chapters;
    $('.r-fullstory-spec li').each((_, el) => {
      const liText = cleanText($(el).text());
      if (/^Translation:/i.test(liText)) {
        statusText = liText.replace(/^Translation:\s*/i, '');
      } else if (!statusText && /^Status in COO:/i.test(liText)) {
        statusText = liText.replace(/^Status in COO:\s*/i, '');
      } else if (/^Authors?:/i.test(liText)) {
        author = liText.replace(/^Authors?:\s*/i, '');
      } else if (/^Translated:/i.test(liText)) {
        const m = liText.match(/([\d,]+)\s*chapters?/i);
        if (m) chapters = parseInt(m[1].replace(/,/g, ''), 10);
      }
    });
    const status = mapStatus(statusText);

    const ratingText = cleanText($('.rate-stat-num .bold').first().text());
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    const mangaInfo = {
      mangaId,
      title,
      image,
      referer: SITE_BASE,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'novel',
    };
    if (author) mangaInfo.author = author;
    if (rating && isFinite(rating)) mangaInfo.rating = rating;
    if (chapters && isFinite(chapters)) mangaInfo.chapters = chapters;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const { numericId } = splitMangaId(mangaId);
    const baseUrl = `${SITE_BASE}/chapters/${encodeURIComponent(numericId)}/`;

    const firstHtml = await this.requestHTML(baseUrl);
    const firstData = extractChaptersData(firstHtml);
    if (!firstData) {
      throw new Error(`Ranobes: no chapters data found for ${mangaId}`);
    }

    const pagesCount = Math.min(
      parseInt(firstData.pages_count, 10) || 1,
      CHAPTER_PAGE_LIMIT
    );

    const dataByPage = { 1: firstData };
    let pending = [];
    for (let page = 2; page <= pagesCount; page += 1) pending.push(page);

    for (let round = 0; round < 3 && pending.length; round += 1) {
      const width = round === 0 ? CHAPTER_BATCH : 1;
      const failed = [];
      for (let i = 0; i < pending.length; i += width) {
        await Promise.all(
          pending.slice(i, i + width).map((page) =>
            this.requestHTML(withPage(baseUrl, page))
              .then((html) => {
                const data = extractChaptersData(html);
                if (!data || !Array.isArray(data.chapters)) {
                  throw new Error(`Ranobes: chapters page ${page} did not parse`);
                }
                dataByPage[page] = data;
              })
              .catch((e) => {
                console.error(`Ranobes chapters page ${page} failed:`, e);
                failed.push(page);
              })
          )
        );
      }
      pending = failed.sort((a, b) => a - b);
    }
    if (pending.length) {
      throw new Error(
        `Ranobes: ${pending.length} of ${pagesCount} chapter pages unavailable for ${mangaId} ` +
          `after retries (pages ${pending.join(', ')}), about ${pending.length * 25} chapters missing`
      );
    }

    const rawChapters = [];
    for (let page = 1; page <= pagesCount; page += 1) {
      const data = dataByPage[page];
      if (data && Array.isArray(data.chapters)) rawChapters.push(...data.chapters);
    }

    const seen = {};
    const chapters = [];
    for (const raw of rawChapters) {
      const id = String((raw && raw.id) || '');
      if (!id || seen[id]) continue;
      seen[id] = true;
      const name = decodeEntities(cleanText(raw.title)) || `Chapter ${id}`;
      const number = chapterNumberFromTitle(name);
      const chapter = { id, chapterId: id, name };
      if (number !== undefined) chapter.number = number;
      const time = parseTime(raw.date);
      if (time !== undefined) chapter.time = time;
      chapters.push(chapter);
    }

    chapters.sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    chapters.forEach((c, i) => {
      if (c.number === undefined) c.number = i + 1;
    });

    return chapters;
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/${chapterDirSlug(mangaId)}/${encodeURIComponent(chapterId)}.html`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);

      const paragraphs = [];
      $('#arrticle p').each((_, el) => {
        const t = cleanText($(el).text());
        if (t) paragraphs.push(t);
      });
      const text = paragraphs.join('\n\n');

      return { id: chapterId, mangaId, pages: [], text };
    } catch (e) {
      console.error('Ranobes getChapterDetails failed:', e);
      throw e;
    }
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({ rateLimit: RATE_LIMIT });
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Ranobes HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
