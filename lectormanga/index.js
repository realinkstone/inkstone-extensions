const SITE_BASE = 'https://lectormangass.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

function cleanText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mapStatus(raw) {
  const s = (raw || '').toLowerCase();
  if (s.includes('emisi')) return 'ONGOING';
  if (s.includes('final')) return 'COMPLETED';
  if (s.includes('hiatus')) return 'HIATUS';
  if (s.includes('cancel')) return 'CANCELLED';
  return 'UNKNOWN';
}

function parseRelativeDate(text) {
  const s = (text || '').toLowerCase();
  if (/\bahora\b|\bhoy\b/.test(s)) return Date.now();
  const m = /(\d+)\s*([a-záéíóúñ]+)/.exec(s);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return undefined;
  const unit = m[2];
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  let ms;
  if (unit.startsWith('seg')) ms = n * SECOND;
  else if (unit.startsWith('min')) ms = n * MINUTE;
  else if (unit.startsWith('h')) ms = n * HOUR;
  else if (unit.startsWith('sem')) ms = n * 7 * DAY;
  else if (unit.startsWith('mes')) ms = n * 30 * DAY;
  else if (unit.startsWith('a') && !unit.startsWith('ah')) ms = n * 365 * DAY;
  else if (unit.startsWith('d')) ms = n * DAY;
  else return undefined;
  return Date.now() - ms;
}

const GENRE_TAGS = [
  { id: '+18', label: '+18' },
  { id: 'accion', label: 'Accion' },
  { id: 'adulto', label: 'Adulto' },
  { id: 'apocalíptico', label: 'Apocalíptico' },
  { id: 'artes-marciales', label: 'Artes Marciales' },
  { id: 'aventura', label: 'Aventura' },
  { id: 'boys-love', label: 'Boys Love' },
  { id: 'ciencia-ficción', label: 'Ciencia ficción' },
  { id: 'comedia', label: 'Comedia' },
  { id: 'demonios', label: 'Demonios' },
  { id: 'deporte', label: 'Deporte' },
  { id: 'drama', label: 'Drama' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'familia', label: 'Familia' },
  { id: 'fantasía', label: 'Fantasía' },
  { id: 'girls-love', label: 'Girls Love' },
  { id: 'gore', label: 'Gore' },
  { id: 'harem', label: 'Harem' },
  { id: 'harem-inverso', label: 'Harem Inverso' },
  { id: 'histórico', label: 'Histórico' },
  { id: 'horror', label: 'Horror' },
  { id: 'josei', label: 'Josei' },
  { id: 'maduro', label: 'Maduro' },
  { id: 'magia', label: 'Magia' },
  { id: 'militar', label: 'Militar' },
  { id: 'misterio', label: 'Misterio' },
  { id: 'omegaverse', label: 'Omegaverse' },
  { id: 'psicológico', label: 'Psicológico' },
  { id: 'recuentos-de-la-vida', label: 'Recuentos de la vida' },
  { id: 'reencarnación', label: 'Reencarnación' },
  { id: 'regresion', label: 'Regresion' },
  { id: 'romance', label: 'Romance' },
  { id: 'seinen', label: 'Seinen' },
  { id: 'shonen', label: 'Shonen' },
  { id: 'shoujo', label: 'Shoujo' },
  { id: 'shoujo-ai', label: 'Shoujo Ai' },
  { id: 'shounen-ai', label: 'Shounen Ai' },
  { id: 'smut', label: 'Smut' },
  { id: 'sobrenatural', label: 'Sobrenatural' },
  { id: 'supervivencia', label: 'Supervivencia' },
  { id: 'tragedia', label: 'Tragedia' },
  { id: 'transmigración', label: 'Transmigración' },
  { id: 'vida-escolar', label: 'Vida Escolar' },
];

function findLd($, typeName) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    let data;
    try {
      data = JSON.parse($(el).html() || '{}');
    } catch (e) {
      return;
    }
    const types = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
    if (types.indexOf(typeName) !== -1) found = data;
  });
  return found;
}

function parseInfoList($) {
  const map = {};
  $('ul.serie-seo-info li').each((_, el) => {
    const text = cleanText($(el).text());
    const idx = text.indexOf(':');
    if (idx === -1) return;
    const key = text.slice(0, idx).trim().toLowerCase();
    const value = text.slice(idx + 1).trim();
    if (key) map[key] = value;
  });
  return map;
}

function lastSegment(href) {
  const parts = String(href || '')
    .split('/')
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function cardToPartial($, el) {
  const $a = $(el);
  const slug = lastSegment($a.attr('href'));
  const title = cleanText($a.attr('title'));
  const image = $a.find('img').attr('src') || '';
  if (!slug || !title || !image) return null;

  const manga = {
    mangaId: slug,
    title,
    image,
    webURL: `${SITE_BASE}/comics/${slug}`,
    medium: 'comics',
  };

  const wrap = $a.parent();
  const statusText = cleanText(wrap.find('.status-overlay').text());
  if (statusText) manga.completed = mapStatus(statusText) === 'COMPLETED';

  const cardInfo = wrap.parent().find('.card-info').first();
  if (cardInfo.length) {
    const infoText = cleanText(cardInfo.text());
    const chMatch = /([\d.,]+)\s*Cap[ií]tulos/i.exec(infoText);
    if (chMatch) {
      const n = parseInt(chMatch[1].replace(/[.,]/g, ''), 10);
      if (!Number.isNaN(n)) manga.chapters = n;
    }
  }

  return manga;
}

class Source {
  getSourceFeeds() {
    return [
      { id: 'recientes', name: 'Recently Updated' },
      { id: 'populares', name: 'Popular' },
      { id: 'valoracion', name: 'Top Rated' },
      { id: 'capitulos', name: 'Most Chapters' },
    ];
  }

  async getSearchTags() {
    try {
      const html = await this.requestHTML(`${SITE_BASE}/comics`);
      const $ = cheerio.load(html);
      const tags = [];
      $('.filter-genre-checkbox').each((_, el) => {
        const $el = $(el);
        const id = $el.attr('value');
        const label = cleanText($el.attr('data-label')) || cleanText(id);
        if (id && label) tags.push({ id, label });
      });
      return tags.length > 0 ? tags : GENRE_TAGS;
    } catch (e) {
      console.error('Lectormanga getSearchTags failed: ' + (e && e.message));
      return GENRE_TAGS;
    }
  }

  async getSearchResults(request, metadata) {
    if (request && request.medium && request.medium !== 'comics') {
      return { results: [] };
    }

    const page = (metadata && metadata.page) || 1;
    const query = ((request && request.title) || '').trim();
    const includedTags = (request && request.includedTags) || [];
    const feed = (request && request.feed) || 'recientes';

    const params = {};
    if (page > 1) params.page = page;

    if (query) {
      params.search = query;
    } else if (includedTags.length > 0 && includedTags[0] && includedTags[0].id) {
      params.genres = includedTags[0].id;
    } else {
      switch (feed) {
        case 'populares':
          params.sort = 'view_count';
          params.order = 'desc';
          break;
        case 'valoracion':
          params.sort = 'rating';
          params.order = 'desc';
          break;
        case 'capitulos':
          params.sort = 'chapter_count';
          params.order = 'desc';
          break;
        default:
          break;
      }
    }

    const query_ = qs(params);
    const url = `${SITE_BASE}/comics${query_ ? `?${query_}` : ''}`;

    try {
      const html = await this.requestHTML(url);
      return this.parseComicsListing(html, page);
    } catch (e) {
      console.error('Lectormanga getSearchResults failed: ' + (e && e.message));
      throw e;
    }
  }

  parseComicsListing(html, page) {
    const $ = cheerio.load(html);
    const results = [];
    $('a.card-cover-link').each((_, el) => {
      const manga = cardToPartial($, el);
      if (manga) results.push(manga);
    });
    const hasNext = $('a[aria-label="Next page"]').length > 0;
    return {
      results,
      metadata: results.length > 0 && hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const url = `${SITE_BASE}/comics/${encodeURIComponent(mangaId)}`;
    const html = await this.requestHTML(url);
    const $ = cheerio.load(html);

    const ld = findLd($, 'ComicSeries') || {};
    const info = parseInfoList($);

    const title = cleanText(ld.name) || cleanText($('h1').first().text()) || mangaId;
    const image = ld.image || $('a.card-cover-link img').first().attr('src') || '';
    const desc = cleanText(ld.description) || '';
    const statusRaw = info['estado'] || '';

    const tags = Array.isArray(ld.genre)
      ? ld.genre.map((g) => cleanText(g)).filter(Boolean)
      : (info['géneros'] || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

    let chapters;
    if (typeof ld.numberOfEpisodes === 'number') {
      chapters = ld.numberOfEpisodes;
    } else {
      const n = parseInt((info['capítulos publicados'] || '').replace(/[.,]/g, ''), 10);
      if (!Number.isNaN(n)) chapters = n;
    }

    let rating;
    if (ld.aggregateRating && typeof ld.aggregateRating.ratingValue === 'number') {
      rating = ld.aggregateRating.ratingValue;
    }

    return {
      mangaInfo: {
        title,
        image,
        desc,
        status: mapStatus(statusRaw),
        tags,
        chapters,
        rating,
        webURL: url,
        medium: 'comics',
      },
    };
  }

  async getChapters(mangaId) {
    try {
      const url = `${SITE_BASE}/comics/${encodeURIComponent(mangaId)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);

      const chapters = [];
      $('#chapters-list > div[data-chapter-num]').each((_, el) => {
        const $row = $(el);
        const numAttr = $row.attr('data-chapter-num');
        const number = parseFloat(numAttr);
        if (Number.isNaN(number)) return;

        const href = $row.find('a').first().attr('href') || '';
        const chapterId = lastSegment(href);
        if (!chapterId) return;

        const chapter = {
          id: chapterId,
          chapterId,
          name: `Capítulo ${numAttr}`,
          number,
        };

        const relText = cleanText($row.find('.text-caption > div').first().text());
        const time = parseRelativeDate(relText);
        if (typeof time === 'number' && !Number.isNaN(time)) chapter.time = time;

        chapters.push(chapter);
      });

      return chapters.sort((a, b) => b.number - a.number);
    } catch (e) {
      console.error('Lectormanga getChapters failed: ' + (e && e.message));
      throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    try {
      const url = `${SITE_BASE}/comics/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`;
      const html = await this.requestHTML(url);
      const $ = cheerio.load(html);

      const pages = [];
      $('img.reader-page-img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && /^https?:\/\//.test(src)) pages.push(src);
      });

      return { id: chapterId, mangaId, pages };
    } catch (e) {
      console.error('Lectormanga getChapterDetails failed: ' + (e && e.message));
      throw e;
    }
  }

  async requestHTML(url) {
    const manager = App.createRequestManager({});
    const request = App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    const response = await manager.schedule(request);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Lectormanga HTTP ${response.status}`);
    }
    return response.data;
  }
}

module.exports = { Source };
