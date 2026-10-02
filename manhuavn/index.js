const SITE_BASE = 'https://manhuavn2.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const EMBEDDED_CHAPTER_CAP = 20;

const APP_ONLY_ICON = 'i.fa-mobile';
const APP_ONLY_SUFFIX = ' (Locked, App Only)';

const FEEDS = {
  latest: { status: 0, sort: 2 },
  hot: { status: 0, sort: 1 },
  new: { status: 0, sort: 0 },
  completed: { status: 2, sort: 1 },
};
const DEFAULT_FEED = 'latest';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function slugifyQuery(query) {
  return (query || '').trim().replace('-', '_').replace(/ /g, '-');
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('hoàn thành')) return 'COMPLETED';
  if (s.includes('tiến hành') || s.includes('cập nhật')) return 'ONGOING';
  return 'UNKNOWN';
}

function cleanAuthor(text) {
  const t = cleanText(text);
  if (!t || t.toLowerCase() === 'đang cập nhật') return undefined;
  return t;
}

function readListInfoText($, label) {
  let value = '';
  $('.list-info > li').each((_, el) => {
    const text = cleanText($(el).text());
    if (text.indexOf(label) === 0) {
      value = cleanText(text.slice(label.length).replace(/^[:\s]+/, ''));
      return false;
    }
  });
  return value;
}

function extractDescription($) {
  let desc = '';
  $('.list-info > li').each((_, el) => {
    const $el = $(el);
    if ($el.find('h2').length === 0) return;
    const $clone = $el.clone();
    $clone.find('h2').remove();
    $clone.find('br').replaceWith(' ');
    const fullText = cleanText($clone.text());
    const boilerplateIndex = fullText.search(/Nguồn gốc/i);
    desc = boilerplateIndex !== -1 ? cleanText(fullText.slice(0, boilerplateIndex)) : fullText;
    return false;
  });
  return desc;
}

function extractMangaId(href) {
  const clean = (href || '').split('?')[0].split('#')[0];
  const m = clean.match(/^(?:https?:\/\/[^/]+)?\/([a-z0-9-]+)\.html$/i);
  return m ? m[1] : '';
}

function extractChapterId(href) {
  const m = (href || '').match(/\/doc-truyen\/([a-z0-9-]+)\.html/i);
  return m ? m[1] : '';
}

function chapterNumberFromName(name) {
  const m = (name || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function feedParams(feedId) {
  return FEEDS[feedId] || FEEDS[DEFAULT_FEED];
}

function pageSegment(page) {
  return page > 1 ? `P${page}/` : '';
}

function buildListingURL({ query, feedId, genreId, page }) {
  const { status, sort } = feedParams(feedId);
  const seg = pageSegment(page);

  if (query) {
    const slug = slugifyQuery(query);
    return `${SITE_BASE}/${encodeURIComponent(slug)}/${seg}tim-kiem.html`;
  }
  if (genreId) {
    return `${SITE_BASE}/the-loai/${seg}${encodeURIComponent(genreId)}.html?status=${status}&sort=${sort}`;
  }
  return `${SITE_BASE}/danhsach/${seg}index.html?status=${status}&sort=${sort}`;
}

function parseMangaList($) {
  const results = [];
  $('li.story_item').each((_, el) => {
    const item = $(el);
    const titleLink = item.find('a.story_title').first();
    const imgAnchor = item.find('a.story_img').first();
    const href = titleLink.attr('href') || imgAnchor.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(titleLink.text()) || mangaId;
    const style = imgAnchor.attr('style') || '';
    const styleMatch = style.match(/url\((['"]?)([^'")]+)\1\)/);
    const image = styleMatch ? styleMatch[2].trim() : '';

    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/${mangaId}.html`,
      medium: 'comics',
    });
  });
  return results;
}

function extractStoryId($) {
  const onclick = $('.view-more').first().attr('onclick') || '';
  const m = onclick.match(/loadfullchuong\(\$\(this\),\s*'([^']+)'\)/);
  return m ? m[1] : '';
}

class Source {
  getSourceFeeds() {
    return [
      { id: DEFAULT_FEED, name: 'Latest Updated' },
      { id: 'hot', name: 'Most Popular' },
      { id: 'new', name: 'New Manga' },
      { id: 'completed', name: 'Completed' },
    ];
  }

  async getSearchTags() {
    return [
      { id: 'co-dai', label: 'Cổ Đại' },
      { id: 'hien-dai-', label: 'Hiện đại' },
      { id: 'huyen-huyen', label: 'Huyền Huyễn' },
      { id: 'hai-huoc', label: 'Hài Hước' },
      { id: 'han-quoc', label: 'Hàn Quốc' },
      { id: 'hau-cung', label: 'Hậu Cung' },
      { id: 'he-thong', label: 'Hệ Thống' },
      { id: 'kinh-di', label: 'Kinh Dị' },
      { id: 'lich-su', label: 'Lịch Sử' },
      { id: 'mat-the', label: 'Mạt Thế' },
      { id: 'ngon-tinh', label: 'Ngôn Tình' },
      { id: 'thanh-xuan---vuon-truong', label: 'Thanh xuân - Vườn trường' },
      { id: 'truyen-ai', label: 'Truyện AI' },
      { id: 'truyen-sang-tac', label: 'Truyện Sáng Tác' },
      { id: 'trung-sinh', label: 'Trùng Sinh' },
      { id: 'trong-sinh', label: 'Trọng sinh' },
      { id: 'tu-tien', label: 'Tu Tiên' },
      { id: 'xuyen-khong', label: 'Xuyên Không' },
      { id: 'do-thi', label: 'Đô Thị' },
    ];
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = ((request && request.title) || '').trim();
    const feedId = (request && request.feed) || DEFAULT_FEED;
    const includedTags = (request && request.includedTags) || [];
    const genreId = includedTags.length > 0 && includedTags[0] ? includedTags[0].id : '';

    const url = buildListingURL({ query, feedId, genreId, page });
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaList($);

    return { results, metadata: results.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/${encodeURIComponent(mangaId)}.html`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1.title').first().text()) || mangaId;
    const image = ($('.wrap-content-image img').first().attr('src') || '').trim();

    const status = mapStatus(readListInfoText($, 'Tình Trạng'));
    const author = cleanAuthor(readListInfoText($, 'Tác Giả'));

    const tags = [];
    $('.list-info a[href*="/the-loai/"]').each((_, a) => {
      const t = cleanText($(a).text());
      if (t) tags.push(t);
    });

    const desc = extractDescription($);

    const viewsText = cleanText($('.list-info view').first().text());
    const views = /^\d+$/.test(viewsText) ? parseInt(viewsText, 10) : undefined;

    const ratingText = cleanText($('[itemprop="ratingValue"]').first().text());
    const rating = ratingText ? parseFloat(ratingText) : undefined;

    return {
      mangaInfo: {
        title,
        image,
        author,
        desc,
        status,
        tags,
        views,
        rating,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const detailURL = `${SITE_BASE}/${encodeURIComponent(mangaId)}.html`;
    const detailHTML = await this.requestHTML(detailURL);
    const $detail = cheerio.load(detailHTML);
    const ssid = extractStoryId($detail);

    let $list = $detail;
    let selector = '#lst-chapter li.chap-item';
    let fullListError = null;

    if (ssid) {
      try {
        const fragmentHTML = await this.requestFullChapterList(ssid);
        if (!fragmentHTML || fragmentHTML.indexOf('chap-item') === -1) {
          throw new Error('getListChapterOfStory returned no chap-item rows');
        }
        $list = cheerio.load(fragmentHTML);
        selector = 'li.chap-item';
      } catch (error) {
        fullListError = error;
        console.error(
          `ManhuaVN: full chapter list fetch failed for ssid ${ssid} (${mangaId}):`,
          error
        );
      }
    }

    const raw = [];
    $list(selector).each((_, el) => {
      const link = $list(el).find('a').first();
      const href = link.attr('href') || '';
      const chapterId = extractChapterId(href);
      if (!chapterId) return;
      const baseName = cleanText(link.text());
      const appOnly = $list(el).find(APP_ONLY_ICON).length > 0;
      raw.push({
        chapterId,
        name: appOnly ? `${baseName}${APP_ONLY_SUFFIX}` : baseName,
        number: chapterNumberFromName(baseName),
      });
    });

    if (fullListError && raw.length >= EMBEDDED_CHAPTER_CAP) {
      throw new Error(
        `ManhuaVN: chapter list for ${mangaId} is truncated at the embedded ` +
          `${EMBEDDED_CHAPTER_CAP}-row cap because the full-list request failed: ` +
          `${(fullListError && fullListError.message) || fullListError}`
      );
    }

    raw.reverse();

    return raw.map((r) => ({ id: r.chapterId, chapterId: r.chapterId, name: r.name, number: r.number }));
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/doc-truyen/${encodeURIComponent(chapterId)}.html`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const pages = [];
    $('.page-chapter img').each((_, el) => {
      const src = ($(el).attr('data-original') || '').trim();
      if (src) pages.push(src);
    });

    if (pages.length === 0 && $('.wrap_taiapp').length === 0) {
      throw new Error(
        `ManhuaVN: chapter ${chapterId} has no page images and no app-only notice, ` +
          'so the reader markup may have changed'
      );
    }

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

  async requestFullChapterList(ssid) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url: `${SITE_BASE}/Service.asmx/getListChapterOfStory`,
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ssid }),
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = JSON.parse(response.data);
    return typeof parsed.d === 'string' ? parsed.d : '';
  }
}

module.exports = { Source };
