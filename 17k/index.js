const SITE_BASE = 'https://www.17k.com';
const SEARCH_BASE = 'https://search.17k.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const LOCKED_CHAPTER_TEXT =
  '本章为17K付费（VIP）章节，暂无法在此阅读完整内容，请前往17K小说网或官方App订阅解锁。\n\nThis chapter is a 17K members-only (VIP) chapter and cannot be unlocked here. Read it on 17k.com or in the official 17K app.';

const UNSBOX_MAP = [
  15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23, 25, 13, 6, 11,
  39, 18, 20, 8, 14, 21, 32, 26, 2, 30, 7, 4, 17, 5, 3, 28, 34, 37, 12, 36,
];
const ACW_FIXED_KEY = '3000176000856006061501533003690027800375';

function acwUnsbox(str) {
  const ret = new Array(str.length);
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    for (let j = 0; j < UNSBOX_MAP.length; j += 1) {
      if (UNSBOX_MAP[j] === i + 1) ret[j] = ch;
    }
  }
  return ret.join('');
}

function acwHexXor(a, b) {
  let out = '';
  for (let i = 0; i < a.length && i < b.length; i += 2) {
    const x = parseInt(a.substr(i, 2), 16);
    const y = parseInt(b.substr(i, 2), 16);
    let hex = (x ^ y).toString(16);
    if (hex.length === 1) hex = `0${hex}`;
    out += hex;
  }
  return out;
}

function computeAcwScV2(arg1) {
  return acwHexXor(acwUnsbox(arg1), ACW_FIXED_KEY);
}

function isAcwChallenge(html) {
  return (
    typeof html === 'string' &&
    html.length < 20000 &&
    html.indexOf('aliyunwaf') !== -1 &&
    /var arg1\s*=/.test(html)
  );
}

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function hasNextPage(html) {
  const m = html.match(/<a[^>]+href="([^"]*)"[^>]*>\s*<span>下一页<\/span>/);
  if (!m) return false;
  return m[1].indexOf('javascript:') !== 0;
}

function toInt(text) {
  if (!text) return undefined;
  const n = parseInt(String(text).replace(/,/g, ''), 10);
  return isFinite(n) ? n : undefined;
}

function absoluteImage(src) {
  if (!src) return undefined;
  const trimmed = String(src).trim();
  if (!trimmed) return undefined;
  if (trimmed.indexOf('//') === 0) return `https:${trimmed}`;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_BASE}${trimmed.charAt(0) === '/' ? '' : '/'}${trimmed}`;
}

function parseBeijingTimestamp(str) {
  const m = String(str || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s) - 8 * 60 * 60 * 1000;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'male', name: '男生' },
      { id: 'female', name: '女生' },
      { id: 'completed', name: '完结' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestBypassed(`${SITE_BASE}/all/book/2_0_0_0_0_0_0_0_1.html`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = {};
      $('.fllist-item dl').each((_, dl) => {
        const $dl = $(dl);
        if (($dl.find('dt').first().text() || '').indexOf('作品类别') === -1) return;
        $dl.find('dd.allzplb a').each((__, a) => {
          const $a = $(a);
          const href = $a.attr('href') || '';
          const m = href.match(/\/all\/book\/(\d+)_(\d+)_0_0_0_0_0_0_1\.html/);
          if (!m) return;
          const [, channel, genre] = m;
          if (genre === '0') return;
          const id = `${channel}_${genre}`;
          if (seen[id]) return;
          const label = cleanText($a.text());
          if (!label) return;
          seen[id] = true;
          tags.push({ id, label });
        });
      });
      return tags;
    } catch (e) {
      console.error('17K getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'novel') {
      return { results: [] };
    }
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;

    try {
      if (query) {
        const url = `${SEARCH_BASE}/search.xhtml?${qs({
          'c.q': query,
          'c.st': 0,
          page: page > 1 ? page : undefined,
        })}`;
        const html = await this.requestBypassed(url);
        const results = this.parseSearchResults(html);
        return { results, metadata: hasNextPage(html) ? { page: page + 1 } : undefined };
      }

      const tagId = request && request.includedTags && request.includedTags[0] && request.includedTags[0].id;
      let channel = '2';
      let genre = '0';
      if (tagId) {
        const parts = String(tagId).split('_');
        if (parts[0]) channel = parts[0];
        if (parts[1]) genre = parts[1];
      } else if (request && request.feed === 'female') {
        channel = '3';
      }
      const progress = request && request.feed === 'completed' ? '3' : '0';
      const url = `${SITE_BASE}/all/book/${channel}_${genre}_0_0_${progress}_0_0_0_${page}.html`;
      const html = await this.requestBypassed(url);
      const results = this.parseListing(html);
      return { results, metadata: hasNextPage(html) ? { page: page + 1 } : undefined };
    } catch (e) {
      console.error('17K getSearchResults failed:', e);
      throw e;
    }
  }

  async getMangaDetails(mangaId) {
    try {
      const url = `${SITE_BASE}/book/${encodeURIComponent(mangaId)}.html`;
      const html = await this.requestBypassed(url);
      const $ = cheerio.load(html);

      const bookMetaMatch = html.match(/window\.\$__BOOK\s*=\s*\{([\s\S]*?)\}/);
      const bookMetaBody = bookMetaMatch ? bookMetaMatch[1] : '';
      const grabMeta = (key) => {
        const m = bookMetaBody.match(new RegExp(`${key}\\s*:\\s*'([^']*)'`));
        return m ? m[1] : undefined;
      };

      const title = grabMeta('bookName') || cleanText($('.Info.Sign h1 a').first().text()) || 'Untitled';
      const author = grabMeta('authorName') || cleanText($('.Info.Sign .author a').first().text());
      const cover = $('#bookCover img').first().attr('src');

      const $intro = $('.Tab .cont p.intro a').first().clone();
      $intro.find('br').replaceWith('\n');
      const desc = $intro
        .text()
        .split('\n')
        .map((line) => line.replace(/^[\s　]+/, '').replace(/[\s　]+$/, ''))
        .join('\n')
        .trim();

      const tags = [];
      $('#bookInfo table th').each((_, th) => {
        const $th = $(th);
        if (($th.text() || '').indexOf('作品类别') === -1) return;
        const genre = cleanText($th.next('td').find('a').first().text());
        if (genre) tags.push(genre);
      });
      $('tr.label a span').each((_, el) => {
        const t = cleanText($(el).text());
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });

      const bookDataText = $('.BookData').text();
      const completed = bookDataText.indexOf('此书已完成') !== -1;

      const views = toInt($('#howmuchreadBook').first().text());

      return {
        mangaInfo: {
          title,
          image: cover ? absoluteImage(cover) : undefined,
          author: author || undefined,
          desc: desc || undefined,
          status: completed ? 'COMPLETED' : 'ONGOING',
          tags,
          webURL: url,
          medium: 'novel',
          completed,
          views,
        },
      };
    } catch (e) {
      console.error('17K getMangaDetails failed:', e);
      throw e;
    }
  }

  async getChapters(mangaId) {
    try {
      const url = `${SITE_BASE}/list/${encodeURIComponent(mangaId)}.html`;
      const html = await this.requestBypassed(url);
      const $ = cheerio.load(html);
      const chapters = [];
      let order = 0;
      $('dl.Volume dd a[href*="/chapter/"]').each((_, el) => {
        const $a = $(el);
        const href = $a.attr('href') || '';
        const m = href.match(/\/chapter\/\d+\/(\d+)\.html/);
        if (!m) return;
        const chapterId = m[1];
        const title = $a.attr('title') || '';
        const name = cleanText($a.find('span').first().text()) || title.split(String.fromCharCode(13))[0].trim() || `Chapter ${order + 1}`;
        const dateMatch = title.match(/更新日期:([\d-]+\s+[\d:]+)/);
        order += 1;
        chapters.push({
          id: chapterId,
          chapterId,
          name,
          number: order,
          time: dateMatch ? parseBeijingTimestamp(dateMatch[1]) : undefined,
        });
      });
      return chapters;
    } catch (e) {
      console.error('17K getChapters failed:', e);
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/chapter/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}.html`;
      const html = await this.requestBypassed(url);
      const $ = cheerio.load(html);
      const paragraphs = [];
      $('#readArea .p p').each((_, el) => {
        const $p = $(el);
        if ((($p.attr('class') || '')).indexOf('copy') !== -1) return;
        const t = $p.text().replace(/^[\s　]+/, '').trim();
        if (t) paragraphs.push(t);
      });

      if (paragraphs.length === 0) {
        return { id: chapterId, mangaId, pages: [], text: LOCKED_CHAPTER_TEXT };
      }
      return { id: chapterId, mangaId, pages: [], text: paragraphs.join('\n\n') };
    } catch (e) {
      console.error('17K getChapterDetails failed:', e);
      throw e;
    }
  }

  parseListing(html) {
    const $ = cheerio.load(html);
    const items = [];
    $('table tbody tr').each((_, tr) => {
      const $tr = $(tr);
      const $link = $tr.find('td.td3 a.jt').first();
      const href = $link.attr('href') || '';
      const idMatch = href.match(/\/book\/(\d+)\.html/);
      if (!idMatch) return;
      const mangaId = idMatch[1];
      const title = cleanText($link.text()) || mangaId;
      const cover = $tr.find('img').first().attr('src');
      const author = cleanText($tr.find('td.td6 a').first().text());
      const statusText = cleanText($tr.find('td.td8').first().text());

      items.push({
        mangaId,
        title,
        image: cover ? absoluteImage(cover) : undefined,
        author: author || undefined,
        webURL: `${SITE_BASE}/book/${mangaId}.html`,
        medium: 'novel',
        completed: statusText.indexOf('完') !== -1,
      });
    });
    return items;
  }

  parseSearchResults(html) {
    const $ = cheerio.load(html);
    const items = [];
    $('.textlist').each((_, el) => {
      const $card = $(el);
      const $titleLink = $card.find('.textmiddle dt a').first();
      const href = $card.find('.textleft a[href*="/book/"]').first().attr('href') || $titleLink.attr('href') || '';
      const idMatch = href.match(/\/book\/(\d+)\.html/);
      if (!idMatch) return;
      const mangaId = idMatch[1];
      const title = cleanText($titleLink.text()) || mangaId;
      const cover = $card.find('.textleft img').first().attr('src');
      const author = cleanText($card.find('.bq .ls a').first().text());

      let summary = '';
      $card.find('li').each((__, li) => {
        const $li = $(li);
        if (($li.find('strong').first().text() || '').indexOf('简介') === -1) return;
        summary = cleanText($li.find('p a').first().text());
      });

      const tags = [];
      $card.find('.bq10 a').each((__, a) => {
        const t = cleanText($(a).text());
        if (t) tags.push(t);
      });

      items.push({
        mangaId,
        title,
        image: cover ? absoluteImage(cover) : undefined,
        author: author || undefined,
        summary: summary || undefined,
        tags,
        webURL: `${SITE_BASE}/book/${mangaId}.html`,
        medium: 'novel',
      });
    });
    return items;
  }

  async requestText(url, extraHeaders) {
    const manager = App.createRequestManager({});
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
      throw new Error(`17K HTTP ${response.status}`);
    }
    return response.data;
  }

  async requestBypassed(url) {
    const first = await this.requestText(url);
    if (!isAcwChallenge(first)) return first;
    const m = first.match(/var arg1\s*=\s*['"]([0-9A-Fa-f]+)['"]/);
    if (!m) {
      throw new Error(`17K WAF challenge for ${url} carried no arg1 to solve`);
    }
    let solved;
    try {
      const acwScV2 = computeAcwScV2(m[1]);
      solved = await this.requestText(url, { Cookie: `acw_sc__v2=${acwScV2}` });
    } catch (e) {
      console.error('17K WAF-challenge solve failed:', e);
      throw e;
    }
    if (isAcwChallenge(solved)) {
      throw new Error(`17K WAF challenge for ${url} still gated after solving acw_sc__v2`);
    }
    return solved;
  }
}

module.exports = { Source };
