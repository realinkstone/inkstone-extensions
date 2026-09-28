const SITE_BASE = 'https://nirvanamanga.com';
const MANGA_LIST_URL = `${SITE_BASE}/manga/`;
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function extractMangaId(href) {
  const m = (href || '').match(/\/manga\/([^/?#]+)\/?$/);
  return m ? m[1] : '';
}

function lastPathSegment(href) {
  const parts = (href || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

const TR_MONTHS = {
  ocak: 0,
  şubat: 1,
  mart: 2,
  nisan: 3,
  mayıs: 4,
  haziran: 5,
  temmuz: 6,
  ağustos: 7,
  eylül: 8,
  ekim: 9,
  kasım: 10,
  aralık: 11,
};

function parseTurkishDate(text) {
  if (!text) return undefined;
  const m = text.trim().match(/^([^\s]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return undefined;
  const mon = TR_MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return undefined;
  return Date.UTC(parseInt(m[3], 10), mon, parseInt(m[2], 10));
}

function mapStatus(text) {
  const s = (text || '').toLowerCase();
  if (s.includes('devam ediyor') || s.includes('ongoing')) return 'ONGOING';
  if (s.includes('tamamlandı') || s.includes('complet')) return 'COMPLETED';
  if (s.includes('ara verildi') || s.includes('hiatus')) return 'HIATUS';
  if (s.includes('iptal') || s.includes('bırakıldı') || s.includes('durduruldu') || s.includes('cancel')) {
    return 'CANCELLED';
  }
  return 'UNKNOWN';
}

function fieldText($, label) {
  let result = '';
  $('.flex-wrap .fmed').each((_, el) => {
    const b = $(el).find('b').first();
    if (cleanText(b.text()) === label) {
      result = cleanText($(el).find('span').first().text());
      return false;
    }
  });
  return result;
}

function imptdtText($, label) {
  let result = '';
  $('.tsinfo .imptdt').each((_, el) => {
    const $el = $(el);
    if (cleanText($el.text()).indexOf(label) === 0) {
      result = cleanText($el.find('i, a').first().text());
      return false;
    }
  });
  return result;
}

function isRealValue(v) {
  return !!v && v !== '-' && v !== '—';
}

function parseListingCards($) {
  const results = [];
  $('.bs .bsx').each((_, el) => {
    const card = $(el);
    const link = card.find('a').first();
    const href = link.attr('href') || '';
    const mangaId = extractMangaId(href);
    if (!mangaId) return;

    const title = cleanText(link.attr('title') || card.find('.tt').first().text()) || mangaId;
    const image = (card.find('.limit img').first().attr('src') || '').trim();
    if (!image) return;

    const manga = {
      mangaId,
      title,
      image,
      webURL: `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`,
      medium: 'comics',
    };

    const ratingText = cleanText(card.find('.numscore').first().text());
    const rating = parseFloat(ratingText);
    if (Number.isFinite(rating)) manga.rating = rating;

    results.push(manga);
  });
  return results;
}

function extractTsReaderData(html) {
  const marker = 'ts_reader.run(';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  let i = start + marker.length;
  while (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r') i++;
  if (html[i] !== '{') return null;

  const jsonStart = i;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  if (depth !== 0) return null;

  try {
    return JSON.parse(html.slice(jsonStart, i));
  } catch (e) {
    return null;
  }
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'update', name: 'Latest Update' },
      { id: 'latest', name: 'Recently Added' },
      { id: 'popular', name: 'Most Popular' },
      { id: 'title', name: 'A-Z' },
      { id: 'titlereverse', name: 'Z-A' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(MANGA_LIST_URL);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('input[name="genre[]"]').each((_, el) => {
        const id = ($(el).attr('value') || '').trim();
        const label = cleanText($(el).next('label').text());
        if (!id || !label || seen.has(id)) return;
        seen.add(id);
        tags.push({ id, label });
      });
      return tags;
    } catch (e) {
      console.error('NirvanaManga getSearchTags failed: ' + (e && e.message));
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium === 'novel') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const feed = (request && request.feed) || 'update';
    const query = (request && request.title) || '';
    const includedTags = (request && request.includedTags) || [];

    const params = [`order=${encodeURIComponent(feed)}`];
    if (query) params.push(`title=${encodeURIComponent(query)}`);
    includedTags.forEach((t) => {
      const id = t && t.id;
      if (typeof id === 'string' && id) params.push(`genre[]=${encodeURIComponent(id)}`);
    });
    params.push(`page=${page}`);

    const url = `${MANGA_LIST_URL}?${params.join('&')}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);
    const results = parseListingCards($);

    return { results, metadata: results.length > 0 ? { page: page + 1 } : undefined };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const title = cleanText($('h1.entry-title').first().text()) || mangaId;

    const ogImage = $('meta[property="og:image"]').attr('content');
    const thumbImage = $('.thumb img').first().attr('src');
    const image = (ogImage || thumbImage || '').trim();

    const author = fieldText($, 'Yazar');
    const artist = fieldText($, 'Çizer');
    const authorCombined = [author, artist].filter(isRealValue).join(', ');

    const publisher = fieldText($, 'Yayımcı');
    const releaseYear = fieldText($, 'Çıkış');

    const status = mapStatus(imptdtText($, 'Durum'));

    const descParts = [];
    $('.entry-content-single p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) descParts.push(t);
    });
    const desc = descParts.length > 0 ? descParts.join(' ') : cleanText($('.entry-content-single').text());

    const tags = [];
    $('.mgen a[rel="tag"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) tags.push(t);
    });

    const mangaInfo = {
      title,
      image,
      desc,
      status,
      tags,
      webURL: url,
      medium: 'comics',
    };
    if (authorCombined) mangaInfo.author = authorCombined;
    if (isRealValue(publisher)) mangaInfo.publisher = publisher;
    if (isRealValue(releaseYear)) mangaInfo.releaseDate = releaseYear;

    const ratingContent = $('[itemprop="ratingValue"]').first().attr('content');
    const rating = parseFloat(ratingContent);
    if (Number.isFinite(rating)) mangaInfo.rating = rating;

    return { mangaInfo };
  }

  async getChapters(mangaId) {
    const url = `${SITE_BASE}/manga/${encodeURIComponent(mangaId)}/`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const raw = [];
    $('#chapterlist li[data-num]').each((_, li) => {
      const $li = $(li);
      const a = $li.find('.eph-num a').first();
      const chapterId = lastPathSegment(a.attr('href'));
      if (!chapterId) return;

      const name = cleanText($li.find('.chapternum').first().text());
      const dateText = cleanText($li.find('.chapterdate').first().text());
      const time = dateText ? parseTurkishDate(dateText) : undefined;
      const rawNumber = parseFloat($li.attr('data-num'));

      raw.push({ chapterId, name, time, rawNumber });
    });

    raw.reverse();

    let lastNumber = -Infinity;
    return raw.map((r) => {
      let number = Number.isFinite(r.rawNumber) ? r.rawNumber : 0;
      if (number <= lastNumber) {
        number = Math.round((lastNumber + 0.0001) * 10000) / 10000;
      }
      lastNumber = number;

      const chapter = { id: r.chapterId, chapterId: r.chapterId, name: r.name || `Bölüm ${number}`, number };
      if (r.time !== undefined) chapter.time = r.time;
      return chapter;
    });
  }

  async getChapterDetails(mangaId, chapterId) {
    const url = `${SITE_BASE}/${encodeURIComponent(chapterId)}/`;
    const html = await this.requestHTML(url);

    const data = extractTsReaderData(html);
    const pages = [];
    if (data && Array.isArray(data.sources)) {
      const seen = new Set();
      data.sources.forEach((source) => {
        if (!source || !Array.isArray(source.images)) return;
        source.images.forEach((src) => {
          if (typeof src === 'string' && src && !seen.has(src)) {
            seen.add(src);
            pages.push(src);
          }
        });
      });
    }

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
}

module.exports = { Source };
