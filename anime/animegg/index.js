const SITE = 'https://www.animegg.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const PAGE_SIZE = 25;
const RELEASE_PAGE_SIZE = 10;

const FEEDS = [
  { id: 'popular', name: 'Popular', query: 'sortBy=hits&sortDirection=DESC' },
  { id: 'ongoing', name: 'Ongoing', query: 'ongoing=true&sortBy=hits&sortDirection=DESC' },
  { id: 'completed', name: 'Completed', query: 'ongoing=false&sortBy=hits&sortDirection=DESC' },
  { id: 'new', name: 'New', query: 'sortBy=createdAt&sortDirection=DESC' },
  { id: 'az', name: 'A-Z', query: 'sortBy=sortLetter&sortDirection=ASC' },
  { id: 'releases', name: 'Latest episodes' },
];

const GENRES = [
  'action', 'adventure', 'comedy', 'demons', 'drama', 'ecchi', 'fantasy', 'game', 'harem', 'historical', 'horror', 'josei',
  'kids', 'magic', 'martial arts', 'mecha', 'military', 'music', 'mystery', 'parody', 'police', 'psychological', 'romance',
  'samurai', 'school life', 'scifi', 'seinen', 'shoujo', 'shoujo ai', 'shounen', 'shounen ai', 'slice of life', 'space',
  'sports', 'super power', 'supernatural', 'thriller', 'vampire', 'yaoi', 'yuri',
];
const ADULT_GENRES = ['hentai', 'erotica'];

function absolute(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  return SITE + (raw.startsWith('/') ? '' : '/') + raw;
}

function slugOf(href) {
  const match = /\/series\/([^/?#]+)/i.exec(String(href || ''));
  return match ? decodeURIComponent(match[1]) : '';
}

function ageRatingOf(genres) {
  const names = (genres || []).map((g) => String(g).toLowerCase().trim());
  if (names.some((g) => ADULT_GENRES.indexOf(g) !== -1)) return 18;
  if (names.indexOf('ecchi') !== -1) return 16;
  return 0;
}

function statusOf(text) {
  const t = String(text || '').toLowerCase();
  if (t.indexOf('ongoing') !== -1) return 'ONGOING';
  if (t.indexOf('complete') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.adultSlugs = null;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g.replace(/\b\w/g, (c) => c.toUpperCase()) }));
  }

  async adultSet() {
    if (this.adultSlugs) return this.adultSlugs;
    const set = new Set();
    for (const genre of ADULT_GENRES) {
      try {
        const html = await this.text(`${SITE}/genre/${encodeURIComponent(genre)}`);
        const $ = cheerio.load(html);
        $('a[href^="/series/"]').each((_, a) => {
          const slug = slugOf($(a).attr('href'));
          if (slug) set.add(slug);
        });
      } catch (e) {
        console.error('AnimeGG adult genre list failed:', e && e.message);
      }
    }
    this.adultSlugs = set;
    return set;
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;
    const adult = await this.adultSet();

    if (query) {
      const html = await this.text(`${SITE}/search/?q=${encodeURIComponent(query)}`);
      const $ = cheerio.load(html);
      const results = [];
      const seen = new Set();
      $('a.mse').each((_, a) => {
        const mangaId = slugOf($(a).attr('href'));
        if (!mangaId || seen.has(mangaId)) return;
        seen.add(mangaId);
        results.push({
          mangaId,
          title: $(a).find('h2').first().text().trim() || mangaId,
          image: absolute($(a).find('img').first().attr('src')),
          ageRating: adult.has(mangaId) ? 18 : undefined,
          webURL: `${SITE}/series/${mangaId}`,
          medium: 'anime',
        });
      });
      return { results };
    }

    let url;
    let step = PAGE_SIZE;
    if (included.length > 0 && included[0] && included[0].id) {
      url = `${SITE}/genre/${encodeURIComponent(String(included[0].id))}?start=${(page - 1) * PAGE_SIZE}`;
    } else {
      const feed = FEEDS.find((f) => f.id === feedId) || FEEDS[0];
      if (feed.id === 'releases') {
        url = `${SITE}/releases?start=${(page - 1) * RELEASE_PAGE_SIZE}`;
        step = RELEASE_PAGE_SIZE;
      } else {
        url = `${SITE}/popular-series?${feed.query}&start=${(page - 1) * 10}`;
      }
    }

    const html = await this.text(url);
    const $ = cheerio.load(html);
    const results = [];
    const seen = new Set();
    $('li.fea').each((_, li) => {
      const el = $(li);
      const link = el.find('.rightpop a[href^="/series/"], a.releaseLink').first();
      const mangaId = slugOf(link.attr('href'));
      if (!mangaId || seen.has(mangaId)) return;
      seen.add(mangaId);
      const genres = el.find('a[href^="/genre/"]').map((__, g) => $(g).text().trim()).get();
      const rating = adult.has(mangaId) ? 18 : ageRatingOf(genres);
      results.push({
        mangaId,
        title: link.text().trim() || mangaId,
        image: absolute(el.find('.img img, .releaseImg img').first().attr('src')),
        summary: el.find('.desfea').first().text().trim() || undefined,
        tags: genres.length ? genres : undefined,
        ageRating: rating || undefined,
        webURL: `${SITE}/series/${mangaId}`,
        medium: 'anime',
      });
    });
    return {
      results,
      metadata: results.length >= step ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const html = await this.text(`${SITE}/series/${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(html);
    const title = $('.media-body .first h1').first().text().trim() || $('h1').last().text().trim() || mangaId;
    const image = absolute($('.media .media-object').first().attr('src'));
    const desc = $('p.ptext').first().text().trim();
    const tags = $('.tagscat a').map((_, a) => $(a).text().trim()).get().filter(Boolean);
    const infoText = $('.infoami').text();
    const alt = /Alternate Titles:\s*([^\n]+?)(?:Status:|$)/i.exec($('.infoami').map((_, p) => $(p).text()).get().join('\n'));
    const adult = await this.adultSet();
    const ageRating = adult.has(mangaId) ? 18 : ageRatingOf(tags);
    return {
      mangaInfo: {
        title,
        image,
        desc: desc || undefined,
        status: statusOf(infoText),
        tags,
        ageRating,
        altTitles: alt ? alt[1].split(';').map((s) => s.trim()).filter(Boolean) : undefined,
        webURL: `${SITE}/series/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const html = await this.text(`${SITE}/series/${encodeURIComponent(mangaId)}`);
    const $ = cheerio.load(html);
    const episodes = [];
    const seen = new Set();
    $('ul.newmanga li').each((idx, li) => {
      const el = $(li);
      const href = String(el.find('a.anm_det_pop').first().attr('href') || '').replace(/#.*$/, '');
      const chapterId = href.replace(/^\/+/, '');
      if (!chapterId || seen.has(chapterId)) return;
      seen.add(chapterId);
      const label = el.find('.anititle').first().text().trim();
      const numMatch = /(\d+(?:\.\d+)?)\s*$/.exec(label) || /-episode-(\d+(?:\.\d+)?)$/i.exec(chapterId);
      const number = numMatch ? parseFloat(numMatch[1]) : undefined;
      const versions = [];
      if (el.find('.btn-subbed').length) versions.push('Sub');
      if (el.find('.btn-dubbed').length) versions.push('Dub');
      episodes.push({
        id: chapterId,
        chapterId,
        name: label || `Episode ${number !== undefined ? number : idx + 1}`,
        number: number !== undefined ? number : undefined,
        group: versions.join(', ') || undefined,
      });
    });
    if (!episodes.length) throw new Error('AnimeGG has no episodes for this title yet');
    return episodes;
  }

  async getVideos(mangaId, chapterId) {
    const slug = String(chapterId || '').replace(/^\/+/, '');
    const epUrl = `${SITE}/${slug}`;
    const html = await this.text(epUrl);
    const $ = cheerio.load(html);

    const tabs = [];
    $('#videos li a[data-id]').each((_, a) => {
      const id = String($(a).attr('data-id') || '').trim();
      const version = String($(a).attr('data-version') || '').toLowerCase();
      if (id) tabs.push({ id, version });
    });
    if (!tabs.length) throw new Error('AnimeGG has no video for this episode yet');

    const videos = [];
    for (const tab of tabs) {
      let embed;
      try {
        embed = await this.text(`${SITE}/embed/${tab.id}`, { Referer: epUrl });
      } catch (e) {
        console.error('AnimeGG embed failed:', e && e.message);
        continue;
      }
      const list = /var\s+videoSources\s*=\s*(\[[\s\S]*?\])\s*;/.exec(embed);
      if (!list) continue;
      const found = [];
      for (const m of list[1].matchAll(/file:\s*"([^"]+)"\s*,\s*label:\s*"([^"]*)"/g)) {
        found.push({ file: m[1], label: m[2] });
      }
      found.sort((a, b) => (parseInt(b.label, 10) || 0) - (parseInt(a.label, 10) || 0));
      const kind = tab.version === 'dubbed' ? 'Dub' : 'Hardsub';
      for (const f of found) {
        videos.push({
          url: absolute(f.file),
          quality: `${f.label} ${kind}`.trim(),
          type: 'mp4',
          server: 'AnimeGG',
          headers: { Referer: `${SITE}/` },
        });
      }
    }
    if (!videos.length) throw new Error('AnimeGG listed no playable video for this episode');
    return videos;
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
    if (response.status === 404) throw new Error('AnimeGG: not found (HTTP 404)');
    if (response.status < 200 || response.status >= 300) throw new Error(`AnimeGG: HTTP ${response.status}`);
    return String(response.data || '');
  }
}

module.exports = { Source };
