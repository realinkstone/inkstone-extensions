const SITE = 'https://animeheaven.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FEEDS = [
  { id: 'popular', name: 'Popular' },
  { id: 'new', name: 'New episodes' },
];

const TAGS = [
  'Action', 'Adventure', 'Comedy', 'Demons', 'Drama', 'Ecchi', 'Fantasy', 'Harem', 'Historical', 'Horror', 'Idols', 'Isekai',
  'Josei', 'Magic', 'Martial Arts', 'Mecha', 'Military', 'Music', 'Mystery', 'Parody', 'Psychological', 'Reincarnation',
  'Romance', 'Samurai', 'School Life', 'Seinen', 'Shoujo', 'Shounen', 'Slice Of Life', 'Sports', 'Supernatural', 'Thriller',
];
const SUGGESTIVE_TAGS = ['Ecchi', 'Nudity', 'Sexual Content'];

function absolute(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  return SITE + (raw.startsWith('/') ? '' : '/') + raw;
}

function idOf(href) {
  const match = /anime\.php\?([a-z0-9]+)/i.exec(String(href || ''));
  return match ? match[1] : '';
}

function timeOfAge(text) {
  const match = /(\d+)\s*(mo|y|w|d|h|m|s)\b/i.exec(String(text || ''));
  if (!match) return undefined;
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, y: 31536e6 }[match[2].toLowerCase()];
  return unit ? Date.now() - parseInt(match[1], 10) * unit : undefined;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.suggestive = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return TAGS.map((t) => ({ id: t, label: t }));
  }

  async suggestiveSet() {
    if (this.suggestive) return this.suggestive;
    const set = new Set();
    for (const tag of SUGGESTIVE_TAGS) {
      try {
        const html = await this.text(`${SITE}/tags.php?tag=${encodeURIComponent(tag)}`);
        for (const m of html.matchAll(/anime\.php\?([a-z0-9]+)/gi)) set.add(m[1]);
      } catch (e) {
        console.error('AnimeHeaven tag list failed:', e && e.message);
      }
    }
    this.suggestive = set;
    return set;
  }

  cardsOf($, flagged) {
    const results = [];
    const seen = new Set();
    const add = (id, title, img, extra) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      results.push({
        mangaId: id,
        title: title || id,
        image: absolute(img),
        ageRating: flagged.has(id) ? 16 : undefined,
        webURL: `${SITE}/anime.php?${id}`,
        medium: 'anime',
        ...(extra || {}),
      });
    };
    $('.chart').each((_, el) => {
      const c = $(el);
      const link = c.find('.charttitle a').first();
      add(idOf(link.attr('href')), link.text().trim(), c.find('img.coverimg').first().attr('src'), {
        summary: c.find('.charttitlejp').first().text().trim() || undefined,
      });
    });
    $('.similarimg').each((_, el) => {
      const c = $(el);
      const link = c.find('.similarname a').first();
      add(idOf(link.attr('href')), link.text().trim(), c.find('img.coverimg').first().attr('src'));
    });
    return results;
  }

  async getSearchResults(request) {
    const query = ((request && request.title) || '').trim();
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;
    const flagged = await this.suggestiveSet();
    let url;
    if (query) url = `${SITE}/search.php?s=${encodeURIComponent(query)}`;
    else if (included.length > 0 && included[0] && included[0].id) url = `${SITE}/tags.php?tag=${encodeURIComponent(String(included[0].id))}`;
    else url = `${SITE}/${feedId === 'new' ? 'new' : 'popular'}.php`;
    let html;
    try {
      html = await this.text(url);
    } catch (e) {
      if (e && /HTTP 404/.test(e.message)) return { results: [] };
      throw e;
    }
    return { results: this.cardsOf(cheerio.load(html), flagged) };
  }

  async getMangaDetails(mangaId) {
    const html = await this.text(`${SITE}/anime.php?${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(html);
    const title = $('.infotitle').first().text().trim() || mangaId;
    const jp = $('.infotitlejp').first().text().trim();
    const tags = $('.infotags a').map((_, a) => $(a).text().trim()).get().filter(Boolean);
    const info = $('.infoyear').first().text();
    const score = /Score:\s*([\d.]+)\s*\/\s*10/i.exec(info);
    const flagged = await this.suggestiveSet();
    const suggestive = tags.some((t) => SUGGESTIVE_TAGS.indexOf(t) !== -1) || flagged.has(mangaId);
    return {
      mangaInfo: {
        title,
        image: absolute($('.posterimg').first().attr('src')),
        banner: absolute($('.banner img.bannerimg').first().attr('src')) || undefined,
        desc: $('.infodes').first().text().trim() || undefined,
        status: 'UNKNOWN',
        tags,
        rating: score ? Math.round((parseFloat(score[1]) / 2) * 100) / 100 : undefined,
        ageRating: suggestive ? 16 : 0,
        altTitles: jp ? [jp] : undefined,
        webURL: `${SITE}/anime.php?${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.text(`${SITE}/anime.php?${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(html);
    const episodes = [];
    const seen = new Set();
    $('a[onclick*="gatea("]').each((idx, a) => {
      const el = $(a);
      const key = String(el.attr('id') || '').trim();
      if (!/^[a-f0-9]{32}$/i.test(key) || seen.has(key)) return;
      seen.add(key);
      const num = parseFloat(el.find('.watch2').first().text().trim());
      const age = el.find('.watch1').last().text().trim();
      episodes.push({
        id: key,
        chapterId: key,
        name: Number.isFinite(num) ? `Episode ${num}` : `Episode ${idx + 1}`,
        number: Number.isFinite(num) ? num : undefined,
        time: timeOfAge(age),
      });
    });
    if (!episodes.length) throw new Error('AnimeHeaven has no episodes for this title yet');
    return episodes;
  }

  async getVideos(mangaId, chapterId) {
    const key = String(chapterId || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(key)) throw new Error('AnimeHeaven: unknown episode id');
    const html = await this.text(`${SITE}/gate.php`, {
      Cookie: `key=${key}`,
      Referer: `${SITE}/anime.php?${mangaId}`,
    });
    const $ = cheerio.load(html);
    const urls = [];
    $('#vid source').each((_, s) => {
      const src = String($(s).attr('src') || '').trim();
      if (src && !/[?&]error\d*$/i.test(src) && urls.indexOf(src) === -1) urls.push(src);
    });
    if (!urls.length) throw new Error('AnimeHeaven returned no video for this episode');
    return urls.map((url, i) => ({
      url,
      quality: i === 0 ? '720p Hardsub' : `720p Hardsub (server ${i + 1})`,
      type: 'mp4',
      server: i === 0 ? 'AnimeHeaven' : `AnimeHeaven ${i + 1}`,
    }));
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async text(url, extraHeaders) {
    const response = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, extraHeaders || {}),
      })
    );
    if (response.status === 404) throw new Error('AnimeHeaven: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeHeaven: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
