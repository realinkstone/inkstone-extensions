const SITE = 'https://readmanga.cc';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'latest', name: 'Latest Updates', path: '/browse/latest-manga' },
  { id: 'hot', name: 'Popular', path: '/browse/hot-manga' },
  { id: 'all', name: 'All Manga', path: '/browse' },
];

const GENRES = [
  ['fantasy', 'Fantasy'], ['action', 'Action'], ['comedy', 'Comedy'], ['romance', 'Romance'], ['drama', 'Drama'], ['adventure', 'Adventure'], ['shounen', 'Shounen'],
  ['slice of life', 'Slice of Life'], ['seinen', 'Seinen'], ['school life', 'School Life'], ['supernatural', 'Supernatural'], ['isekai', 'Isekai'], ['ecchi', 'Ecchi'],
  ['manhwa', 'Manhwa'], ['harem', 'Harem'], ['mystery', 'Mystery'], ['martial arts', 'Martial Arts'], ['webtoon', 'Webtoon'], ['psychological', 'Psychological'],
  ['shoujo', 'Shoujo'], ['reincarnation', 'Reincarnation'], ['historical', 'Historical'], ['horror', 'Horror'], ['tragedy', 'Tragedy'], ['manga', 'Manga'], ['gore', 'Gore'],
  ['sci-fi', 'Sci-Fi'], ['sci fi', 'Sci Fi'], ['erotica', 'Erotica'], ['manhua', 'Manhua'], ['josei', 'Josei'], ['sports', 'Sports'], ['survival', 'Survival'],
  ['sexual violence', 'Sexual Violence'], ['time travel', 'Time Travel'], ['gender bender', 'Gender Bender'], ['adult', 'Adult'], ['cooking', 'Cooking'],
  ['shoujo ai', 'Shoujo Ai'], ['award winning', 'Award Winning'], ['overpowered mc', 'Overpowered MC'], ['loli', 'Loli'], ['magic', 'Magic'], ['yuri', 'Yuri'],
  ['mecha', 'Mecha'], ['4 koma', '4 Koma'], ['shota', 'Shota'], ['shounen ai', 'Shounen Ai'], ['music', 'Music'], ['one shot', 'One Shot'], ['mature', 'Mature'],
  ['yaoi', 'Yaoi'], ['medical', 'Medical'],
];

const RATE_18 = ['erotica', 'adult', 'sexual violence', 'hentai', 'smut'];
const RATE_16 = ['ecchi', 'mature', 'suggestive', 'gore', 'loli', 'shota', 'doujinshi'];

const UNITS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };

function oneLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function absolute(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (u.charAt(0) === '/') return SITE + u;
  return '';
}

function slugOf(href) {
  const m = String(href || '').match(/\/manga\/([^\/?#]+)/);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

function mapStatus(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('ongoing') >= 0) return 'ONGOING';
  if (s.indexOf('complete') >= 0) return 'COMPLETED';
  if (s.indexOf('hiatus') >= 0) return 'HIATUS';
  if (s.indexOf('cancel') >= 0 || s.indexOf('drop') >= 0) return 'CANCELLED';
  return 'UNKNOWN';
}

function readAgo(text) {
  const m = oneLine(text).match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i);
  if (!m) return undefined;
  return Date.now() - Number(m[1]) * UNITS[m[2].toLowerCase()];
}

function isBlocked(genres) {
  return genres.some((g) => /loli|shota/.test(g) && g !== 'loli' && g !== 'shota');
}

function ageOfGenres(genres) {
  if (genres.some((g) => RATE_18.indexOf(g) >= 0)) return 18;
  if (genres.some((g) => RATE_16.indexOf(g) >= 0)) return 16;
  return undefined;
}

function genreSlugs(list) {
  return list.map((g) => oneLine(g).toLowerCase()).filter(Boolean);
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.pages = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map(([id, label]) => ({ id, label }));
  }

  async html(path) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.requests.schedule(
          App.createRequest({ url: `${SITE}${path}`, method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } }),
        );
        if (response.status === 404) throw new Error('ReadManga: not found (HTTP 404)');
        if (response.status < 502 || response.status > 504) {
          if (response.status < 200 || response.status >= 300) throw new Error(`ReadManga: HTTP ${response.status}`);
          return String(response.data || '');
        }
        last = response;
      } catch (e) {
        if (attempt === 1 || /ReadManga/.test(String(e && e.message))) throw e;
      }
    }
    throw new Error(`ReadManga: HTTP ${last ? last.status : 0}`);
  }

  cards($) {
    const rows = [];
    const seen = new Set();
    $('a[href*="/manga/"]').each((i, el) => {
      const link = $(el);
      const h2 = link.find('h2').first();
      if (!h2.length) return;
      const id = slugOf(link.attr('href'));
      const title = oneLine(h2.text());
      if (!id || !title || seen.has(id)) return;
      let box = link.closest('div[class*="drop-shadow"]');
      if (!box.length) box = link.parent().parent().parent();
      const genres = genreSlugs(
        box
          .find('a[href*="/browse/genre/"]')
          .map((j, g) => $(g).text())
          .get(),
      );
      if (isBlocked(genres)) return;
      seen.add(id);
      let author = '';
      let status = '';
      let summary = '';
      box.find('p').each((j, p) => {
        const text = oneLine($(p).text());
        if (/^Author:/i.test(text)) author = oneLine(text.replace(/^Author:/i, ''));
        else if (/^Status:/i.test(text)) status = oneLine(text.replace(/^Status:/i, ''));
        else if (text.length > summary.length && !/^[\d.]+$/.test(text)) summary = text;
      });
      const cover = box
        .find('img')
        .filter((j, img) => /^Cover of/i.test($(img).attr('alt') || ''))
        .first();
      rows.push({ id, title, image: absolute(cover.attr('src')), genres, author, status, summary });
    });
    return rows;
  }

  lastPage($) {
    let max = 0;
    $('a[href*="page="]').each((i, el) => {
      const m = String($(el).attr('href') || '').match(/[?&]page=(\d+)/);
      if (m && Number(m[1]) > max) max = Number(m[1]);
    });
    return max;
  }

  async getSearchResults(request, metadata) {
    const query = oneLine(request && request.title);
    const page = Math.max(1, Number((metadata && metadata.page) || 1));
    const feed = FEEDS.find((f) => f.id === ((request && request.feed) || FEEDS[0].id)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const wanted = included.length ? String((included[0] && included[0].id) || included[0]).toLowerCase() : '';
    const genre = wanted ? GENRES.find((g) => g[0] === wanted) : null;
    let path;
    if (query) path = `/browse?title=${encodeURIComponent(query)}${page > 1 ? `&page=${page}` : ''}`;
    else if (genre) path = `/browse/genre/${encodeURIComponent(genre[0])}${page > 1 ? `?page=${page}` : ''}`;
    else path = `${feed.path}${page > 1 ? `?page=${page}` : ''}`;
    const $ = cheerio.load(await this.html(path));
    const results = this.cards($).map((c) => {
      const card = { mangaId: c.id, title: c.title, image: c.image, medium: 'comics' };
      if (c.author) card.author = c.author;
      if (c.summary) card.summary = c.summary;
      if (c.genres.length) card.tags = c.genres.map((g) => g.replace(/\b\w/g, (ch) => ch.toUpperCase()));
      const age = ageOfGenres(c.genres);
      card.ageRating = age === undefined ? 0 : age;
      return card;
    });
    const more = page < this.lastPage($);
    return { results, metadata: results.length && more ? { page: page + 1 } : undefined };
  }

  titlePage(mangaId) {
    const key = String(mangaId);
    const hit = this.pages.get(key);
    if (hit && Date.now() - hit.at < 180000) return hit.promise;
    const promise = this.html(`/manga/${encodeURIComponent(key)}`).then((body) => {
      const $ = cheerio.load(body);
      if (!$('h1').length || !$('#chapters').length) throw new Error('ReadManga: title not found');
      return $;
    });
    this.pages.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.pages.get(key) && this.pages.get(key).promise === promise) this.pages.delete(key);
    });
    return promise;
  }

  async getMangaDetails(mangaId) {
    const $ = await this.titlePage(mangaId);
    const head = $('h1').first();
    const title = oneLine(head.text());
    if (!title) throw new Error('ReadManga: title not found');
    const root = head.parent();
    const genreList = genreSlugs(
      root
        .find('a[href*="/browse/genre/"]')
        .map((i, el) => $(el).text())
        .get(),
    );
    if (isBlocked(genreList)) throw new Error('ReadManga: this title is not available in the app');
    const labels = root
      .find('a[href*="/browse/genre/"]')
      .map((i, el) => oneLine($(el).text()))
      .get()
      .filter(Boolean);
    let alt = '';
    let author = '';
    root.children('div').each((i, el) => {
      const text = oneLine($(el).text());
      if (/^Author:/i.test(text)) author = oneLine(text.replace(/^Author:/i, ''));
      else if (!alt && !$(el).find('a, h3, button').length && text && text.length < 400) alt = text;
    });
    let summary = '';
    root.children('p').each((i, el) => {
      const text = oneLine($(el).text());
      if (text.length > summary.length) summary = text;
    });
    summary = summary.replace(/^You are reading[\s\S]*? covering [^.]*? \.\s+/, '');
    const statusText = oneLine($('h3:contains("Status")').first().next().text());
    const cover = $('img')
      .filter((i, img) => /^Cover of/i.test($(img).attr('alt') || ''))
      .first();
    const info = {
      title,
      image: absolute(cover.attr('src')),
      desc: summary ? (alt ? `${summary}\n\nAlso known as: ${alt}` : summary) : alt ? `Also known as: ${alt}` : undefined,
      author: author || undefined,
      status: mapStatus(statusText),
      tags: labels,
      webURL: `${SITE}/manga/${encodeURIComponent(String(mangaId))}`,
      medium: 'comics',
    };
    const age = ageOfGenres(genreList);
    info.ageRating = age === undefined ? 0 : age;
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const $ = await this.titlePage(mangaId);
    const latestHref = String($('a:contains("Read Latest")').first().attr('href') || '');
    const latest = Number((latestHref.match(/chapter-(\d+(?:\.\d+)?)\/?$/) || [])[1]);
    const rows = [];
    const seen = new Set();
    $('#chapters a[data-chapter]').each((i, el) => {
      const row = $(el);
      const href = String(row.attr('href') || '').split('?')[0].replace(/\/+$/, '');
      const id = href.split('/').pop();
      const number = Number(row.attr('data-chapter'));
      if (!id || seen.has(id)) return;
      if (Number.isFinite(latest) && Number.isFinite(number) && number > latest) return;
      seen.add(id);
      const chapter = { id, chapterId: id, name: oneLine(row.find('h5').first().text()) || id };
      if (Number.isFinite(number)) chapter.number = number;
      const time = readAgo(row.find('p').first().text());
      if (time !== undefined) chapter.time = time;
      rows.push(chapter);
    });
    return rows;
  }

  async getChapterDetails(mangaId, chapterId) {
    const $ = cheerio.load(await this.html(`/read/${encodeURIComponent(String(mangaId))}/${encodeURIComponent(String(chapterId))}`));
    const pages = [];
    $('img').each((i, el) => {
      const url = absolute($(el).attr('src'));
      if (!/\/\/bcdn\.readmanga\.cc\/comic\/[^\/]+\/[^\/]+\/[^\/]+\.(jpe?g|png|webp|gif|bmp)$/i.test(url) || url.indexOf('/cover/') >= 0) return;
      if (pages.indexOf(url) < 0) pages.push(url);
    });
    if (!pages.length) throw new Error('ReadManga has no pages for this chapter yet');
    return { id: chapterId, mangaId, pages };
  }
}

module.exports = { Source };
