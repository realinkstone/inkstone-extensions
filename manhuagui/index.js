const SITE_BASE = 'https://m.manhuagui.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const IMAGE_REFERER = `${SITE_BASE}/`;
const IMAGE_HOST = 'i.hamreus.com';
const PAGE_SIZE = 20;

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(text) {
  const s = text || '';
  if (s.indexOf('连载') !== -1) return 'ONGOING';
  if (s.indexOf('完结') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function absoluteImage(src) {
  const s = (src || '').trim();
  if (s.indexOf('//') === 0) return 'https:' + s;
  return s;
}

function findDl($, scope, label) {
  let dd = null;
  scope.find('dl').each((_, el) => {
    if (dd) return;
    const dt = $(el).find('dt').first().text().replace(/\s+/g, '').replace(/：$/, '');
    if (dt === label) {
      dd = $(el).find('dd').first();
      return false;
    }
  });
  return dd;
}

function dlText($, scope, label) {
  const dd = findDl($, scope, label);
  return dd ? cleanText(dd.text()) : '';
}

function dlAnchorTexts($, scope, label) {
  const dd = findDl($, scope, label);
  if (!dd) return [];
  const anchors = dd.find('a');
  if (anchors.length === 0) {
    return dd
      .text()
      .split(',')
      .map((t) => cleanText(t))
      .filter(Boolean);
  }
  const out = [];
  anchors.each((_, a) => {
    const t = cleanText($(a).text());
    if (t) out.push(t);
  });
  return out;
}

function parseMangaCards($) {
  const results = [];
  $('li:has(h3)').each((_, el) => {
    const li = $(el);
    const link = li.find('a').first();
    const href = link.attr('href') || '';
    const idMatch = href.match(/\/comic\/(\d+)\/?/);
    if (!idMatch) return;
    const mangaId = idMatch[1];

    const title = cleanText(li.find('h3').first().text());
    if (!title) return;

    const image = absoluteImage(
      li.find('.thumb img').first().attr('data-src') || li.find('.thumb img').first().attr('src'),
    );
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/comic/${mangaId}/`,
      medium: 'comics',
    };

    const statusText = cleanText(li.find('.thumb i').first().text());
    if (statusText.indexOf('完结') !== -1) manga.completed = true;

    const author = dlText($, li, '作者');
    if (author) manga.author = author;

    const tagsText = dlText($, li, '类别');
    if (tagsText) {
      manga.tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    results.push(manga);
  });
  return results;
}

function extractPageCount(html) {
  const m = html.match(/var\s+pageCount\s*=\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractPageInfo(html) {
  const m = html.match(/var\s+pageInfo\s*=\s*\{([^}]*)\}/);
  if (!m) return null;
  const body = m[1];
  const keyM = body.match(/key:\s*'((?:[^'\\]|\\.)*)'/);
  const orderM = body.match(/order:\s*(\d+)/);
  const pageCountM = body.match(/pageCount:\s*(\d+)/);
  return {
    key: keyM ? keyM[1] : '',
    order: orderM ? parseInt(orderM[1], 10) : 0,
    pageCount: pageCountM ? parseInt(pageCountM[1], 10) : 1,
  };
}

const LZ_KEY_STR_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function lzDecompressFromBase64(input) {
  if (input === null || input === undefined) return '';
  if (input === '') return null;
  return lzDecompressCore(input.length, 32, function (index) {
    return LZ_KEY_STR_BASE64.indexOf(input.charAt(index));
  });
}

function lzDecompressCore(length, resetValue, getNextValue) {
  const dictionary = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = '';
  const result = [];
  let i;
  let w;
  let bits;
  let resb;
  let maxpower;
  let power;
  let c;
  const data = { val: getNextValue(0), position: resetValue, index: 1 };

  for (i = 0; i < 3; i += 1) dictionary[i] = i;

  bits = 0;
  maxpower = Math.pow(2, 2);
  power = 1;
  while (power !== maxpower) {
    resb = data.val & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.val = getNextValue(data.index++);
    }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  let next = bits;
  if (next === 0) {
    bits = 0;
    maxpower = Math.pow(2, 8);
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    c = String.fromCharCode(bits);
  } else if (next === 1) {
    bits = 0;
    maxpower = Math.pow(2, 16);
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }
    c = String.fromCharCode(bits);
  } else {
    return '';
  }
  dictionary[3] = c;
  w = c;
  result.push(c);

  for (;;) {
    if (data.index > length) return '';
    bits = 0;
    maxpower = Math.pow(2, numBits);
    power = 1;
    while (power !== maxpower) {
      resb = data.val & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.val = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    c = bits;
    if (c === 0) {
      bits = 0;
      maxpower = Math.pow(2, 8);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      dictionary[dictSize++] = String.fromCharCode(bits);
      c = dictSize - 1;
      enlargeIn--;
    } else if (c === 1) {
      bits = 0;
      maxpower = Math.pow(2, 16);
      power = 1;
      while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      dictionary[dictSize++] = String.fromCharCode(bits);
      c = dictSize - 1;
      enlargeIn--;
    } else if (c === 2) {
      return result.join('');
    }

    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }

    if (dictionary[c]) {
      entry = dictionary[c];
    } else if (c === dictSize) {
      entry = w + w.charAt(0);
    } else {
      return null;
    }
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = Math.pow(2, numBits);
      numBits++;
    }
  }
}

function unpackTokens(p, a, c, k) {
  function token(n) {
    return (n < a ? '' : token(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  }
  let count = c;
  while (count--) {
    if (k[count]) {
      p = p.replace(new RegExp('\\b' + token(count) + '\\b', 'g'), k[count]);
    }
  }
  return p;
}

function extractReaderData($) {
  let result = null;
  $('script').each((_, el) => {
    if (result) return;
    const content = $(el).html() || '';
    if (content.indexOf('p,a,c,k,e,d') === -1) return;
    const m = content.match(/\}\('((?:[^'\\]|\\.)*)',(\d+),(\d+),'([^']*)'\[/);
    if (!m) return;
    const p = m[1];
    const a = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    const compressedDict = m[4];
    const dictText = lzDecompressFromBase64(compressedDict);
    if (!dictText) return;
    const dict = dictText.split('|');
    const unpacked = unpackTokens(p, a, c, dict);
    const callMatch = unpacked.match(/^[\w.$]+\((\{[\s\S]*\})\)\s*\.\s*[\w$]+\(\)\s*;?\s*$/);
    if (!callMatch) return;
    try {
      result = JSON.parse(callMatch[1]);
    } catch (e) {
      result = null;
    }
  });
  return result;
}

function parseChapterNumber(name) {
  const m = (name || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'update', name: 'Latest Updates' },
      { id: 'all', name: 'All Comics' },
      { id: 'rank', name: 'Rankings' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/`);
      const $ = cheerio.load(html);
      const seen = new Set();
      const tags = [];
      $('#popCat .cat-list a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/list\/([^/]+)\/?$/);
        if (!m) return;
        const id = m[1];
        if (seen.has(id)) return;
        seen.add(id);
        const label = cleanText($(el).text());
        if (label) tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('Manhuagui getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') return { results: [] };

    const query = (request && request.title) || '';
    const feed = (request && request.feed) || 'update';
    const includedTags = (request && request.includedTags) || [];
    const page = (metadata && metadata.page) || 1;

    if (query) return this.searchByQuery(query, page, metadata);

    let baseUrl;
    let pagedUrl;
    if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      const tagId = encodeURIComponent(includedTags[0].id);
      baseUrl = `${SITE_BASE}/list/${tagId}/`;
      pagedUrl = (p) => `${baseUrl}?page=${p}&ajax=1`;
    } else if (feed === 'rank') {
      baseUrl = `${SITE_BASE}/rank/`;
      pagedUrl = (p) => `${baseUrl}?page=${p}&ajax=1&order=1`;
    } else if (feed === 'all') {
      baseUrl = `${SITE_BASE}/list/`;
      pagedUrl = (p) => `${baseUrl}?page=${p}&catid=0&ajax=1&order=`;
    } else {
      baseUrl = `${SITE_BASE}/update/`;
      pagedUrl = (p) => `${baseUrl}?page=${p}&ajax=1&order=1`;
    }

    const url = page > 1 ? pagedUrl(page) : baseUrl;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseMangaCards($);

    let pageCount = metadata && metadata.pageCount;
    if (page === 1) {
      const parsed = extractPageCount(html);
      if (parsed) pageCount = parsed;
    }
    const hasNext = pageCount ? page < pageCount : results.length >= PAGE_SIZE;
    return { results, metadata: hasNext ? { page: page + 1, pageCount } : undefined };
  }

  async searchByQuery(query, page, metadata) {
    const url = `${SITE_BASE}/s/${encodeURIComponent(query)}.html`;

    if (page <= 1) {
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);
      const results = parseMangaCards($);
      const info = extractPageInfo(html);
      const hasNext = !!(info && info.pageCount > 1);
      return {
        results,
        metadata: hasNext
          ? { page: 2, pageCount: info.pageCount, order: info.order, key: info.key }
          : undefined,
      };
    }

    const order = (metadata && metadata.order) || 0;
    const key = (metadata && metadata.key) || query;
    const pageCount = (metadata && metadata.pageCount) || page;
    const html = await this.requestPOST(url, { page, ajax: 1, order, key });
    const $ = cheerio.load(html);
    const results = parseMangaCards($);
    const hasNext = page < pageCount;
    return {
      results,
      metadata: hasNext ? { page: page + 1, pageCount, order, key } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/comic/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('.main-bar h1').first().text()) || mangaId;
    const image = absoluteImage($('.book-detail .thumb img').first().attr('src'));
    const statusText = cleanText($('.book-detail .thumb i').first().text());
    const status = mapStatus(statusText);

    const detailScope = $('.book-detail');
    const author = dlAnchorTexts($, detailScope, '作者').join(', ');
    const tags = dlAnchorTexts($, detailScope, '类别');
    const desc = cleanText($('#bookIntro').text());

    return {
      mangaInfo: {
        title,
        image,
        author: author || undefined,
        desc,
        status,
        tags,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/comic/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapterList li a').each((_, el) => {
      const a = $(el);
      const href = a.attr('href') || '';
      const last = href.split('/').filter(Boolean).pop() || '';
      const chapterId = last.replace(/\.html?$/i, '');
      if (!chapterId) return;
      const name = cleanText(a.text());
      if (!name) return;
      raw.push({ chapterId, name });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = parseChapterNumber(r.name);
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;
      return { id: r.chapterId, chapterId: r.chapterId, name: r.name, number };
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/comic/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}.html`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const data = extractReaderData($);
    if (!data || !Array.isArray(data.images)) {
      throw new Error('Manhuagui: could not decode chapter reader data for ' + chapterId);
    }

    const sl = data.sl && typeof data.sl === 'object' ? data.sl : {};
    const qs = Object.keys(sl)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(sl[k]))
      .join('&');
    const pages = data.images.map((p) => `https://${IMAGE_HOST}${p}${qs ? '?' + qs : ''}`);

    return { id: chapterId, mangaId, pages, referer: IMAGE_REFERER };
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
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

  async requestPOST(url, bodyParams) {
    const manager = App.createRequestManager({ rateLimit: { requestsPerSecond: 1 } });
    const body = Object.keys(bodyParams)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(bodyParams[k]))
      .join('&');
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
