const SITE = 'https://aniworld.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_PAGE_SIZE = 10;

const FEEDS = [
  { id: 'popular', name: 'Beliebt' },
  { id: 'trending', name: 'Derzeit beliebt' },
  { id: 'new', name: 'Neue Animes' },
  { id: 'catalog', name: 'Katalog A-Z' },
];

const CATALOG_LETTERS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0-9',
];

const FALLBACK_GENRES = [
  { id: 'abenteuer', label: 'Abenteuer' },
  { id: 'action', label: 'Action' },
  { id: 'actiondrama', label: 'Actiondrama' },
  { id: 'actionkomoedie', label: 'Actionkomödie' },
  { id: 'alltagsleben', label: 'Alltagsleben' },
  { id: 'alltagsdrama', label: 'Alltagsdrama' },
  { id: 'boys-love', label: 'Boys Love' },
  { id: 'drama', label: 'Drama' },
  { id: 'ecchi', label: 'Ecchi' },
  { id: 'engsub', label: 'EngSub' },
  { id: 'erotik', label: 'Erotik' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'fighting-shounen', label: 'Fighting-Shounen' },
  { id: 'ganbatte', label: 'Ganbatte' },
  { id: 'geistergeschichten', label: 'Geistergeschichten' },
  { id: 'ger', label: 'Ger' },
  { id: 'gersub', label: 'GerSub' },
  { id: 'harem', label: 'Harem' },
  { id: 'horror', label: 'Horror' },
  { id: 'komoedie', label: 'Komödie' },
  { id: 'krimi', label: 'Krimi' },
  { id: 'liebesdrama', label: 'Liebesdrama' },
  { id: 'magical-girl', label: 'Magical Girl' },
  { id: 'mecha', label: 'Mecha' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'nonsense-komoedie', label: 'Nonsense-Komödie' },
  { id: 'psychodrama', label: 'Psychodrama' },
  { id: 'romantische-komoedie', label: 'Romantische Komödie' },
  { id: 'romanze', label: 'Romanze' },
  { id: 'scifi', label: 'Scifi' },
  { id: 'sport', label: 'Sport' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'yuri', label: 'Yuri' },
  { id: 'uebermaessige-gewaltdarstellung', label: 'Übermäßige Gewaltdarstellung' },
];

function absoluteUrl(url, base) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  const origin = base || SITE;
  return raw.startsWith('/') ? origin + raw : origin + '/' + raw;
}

function originOf(url) {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(String(url || ''));
  return match ? match[1] : SITE;
}

function slugFromHref(href) {
  const match = /^\/anime\/stream\/([^/?#]+)\/?$/i.exec(String(href || '').trim());
  return match ? decodeURIComponent(match[1]) : '';
}

function cleanCardTitle(raw) {
  return String(raw || '')
    .replace(/\s+stream\s+online\b[\s\S]*$/i, '')
    .replace(/\s+als\s+Stream\s+anschauen\s*$/i, '')
    .replace(/\s+Stream\s+anschauen\s*$/i, '')
    .replace(/\s+Cover\s*$/i, '')
    .trim();
}

function stripTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8230;/g, '...')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function ageRatingOfFsk(fskRaw) {
  const n = parseInt(String(fskRaw || '').trim(), 10);
  if (!Number.isFinite(n)) return undefined;
  if (n >= 18) return 18;
  if (n >= 16) return 16;
  return 0;
}

function statusFromEndDate(endText) {
  const t = String(endText || '').trim().toLowerCase();
  if (!t) return 'UNKNOWN';
  if (t.indexOf('heute') !== -1 || t.indexOf('now') !== -1) return 'ONGOING';
  if (/^\d{4}$/.test(t)) return 'COMPLETED';
  return 'UNKNOWN';
}

function langFlagShort(src, title) {
  const s = String(src || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (s.indexOf('japanese-german') !== -1 || t.indexOf('untertitel deutsch') !== -1) return 'GerSub';
  if (s.indexOf('japanese-english') !== -1 || t.indexOf('untertitel englisch') !== -1) return 'EngSub';
  if (s.indexOf('german') !== -1 || t === 'deutsch') return 'GerDub';
  if (s.indexOf('english') !== -1 || t === 'englisch') return 'EngDub';
  return '';
}

function qualityLabelForLang(langKey, langMeta) {
  const key = String(langKey || '');
  const title = String((langMeta && langMeta.title) || '').toLowerCase();
  const src = String((langMeta && langMeta.src) || '').toLowerCase();
  if (key === '1' || (src.indexOf('german.svg') !== -1 && src.indexOf('japanese') === -1)) {
    return 'Auto Dub (Deutsch)';
  }
  if (key === '3' || src.indexOf('japanese-german') !== -1 || title.indexOf('untertitel deutsch') !== -1) {
    return 'Auto Sub (Deutsch)';
  }
  if (key === '2' || src.indexOf('japanese-english') !== -1 || title.indexOf('untertitel englisch') !== -1) {
    return 'Auto Sub (Englisch)';
  }
  if (src.indexOf('english.svg') !== -1) {
    return 'Auto Dub (Englisch)';
  }
  return 'Auto Sub';
}

function decodeVoePayload(encoded) {
  let s = String(encoded || '').replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  s = s.replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g, '');
  s = App.base64Decode(s);
  let shifted = '';
  for (let i = 0; i < s.length; i++) {
    shifted += String.fromCharCode(s.charCodeAt(i) - 3);
  }
  const reversed = shifted.split('').reverse().join('');
  return JSON.parse(App.base64Decode(reversed));
}

function parseCardsFromHtml($, selector) {
  const results = [];
  const seen = new Set();
  $(selector).each((_, el) => {
    const link = $(el).is('a') ? $(el) : $(el).find('a[href*="/anime/stream/"]').first();
    const href = link.attr('href') || '';
    const mangaId = slugFromHref(href);
    if (!mangaId || seen.has(mangaId)) return;
    const imgEl = $(el).find('img').first();
    const rawImg = imgEl.attr('data-src') || imgEl.attr('src') || '';
    const image = absoluteUrl(rawImg.replace('_150x225.', '_220x330.'));
    const h3 = $(el).find('h3').first().text().trim();
    const rawTitle = h3 || cleanCardTitle(link.attr('title')) || cleanCardTitle(imgEl.attr('alt')) || mangaId;
    if (!image || !rawTitle) return;
    seen.add(mangaId);
    const genreText = $(el).find('small').first().text().trim();
    const tags = genreText ? [genreText] : [];
    results.push({
      mangaId,
      title: rawTitle,
      image,
      tags,
      webURL: `${SITE}/anime/stream/${mangaId}`,
      medium: 'anime',
    });
  });
  return results;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.seriesCache = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.text(`${SITE}/`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('a[href*="/genre/"]').each((_, el) => {
        const href = String($(el).attr('href') || '');
        const match = /\/genre\/([^/?#]+)/i.exec(href);
        const id = match ? decodeURIComponent(match[1]) : '';
        const label = $(el).text().trim();
        if (id && label && !seen.has(id)) {
          seen.add(id);
          tags.push({ id, label });
        }
      });
      return tags.length ? tags : FALLBACK_GENRES;
    } catch (e) {
      console.error('AniWorld getSearchTags failed:', e);
      return FALLBACK_GENRES;
    }
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;

    if (query) {
      const response = await this.requests.schedule(
        App.createRequest({
          url: `${SITE}/ajax/search`,
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json',
          },
          body: `keyword=${encodeURIComponent(query)}`,
        })
      );
      if (response.status === 404) return { results: [] };
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`AniWorld: HTTP ${response.status}`);
      }
      let items = [];
      try {
        items = JSON.parse(response.data);
      } catch (e) {
        items = [];
      }
      if (!Array.isArray(items)) return { results: [] };

      const matched = [];
      const seen = new Set();
      for (const item of items) {
        const mangaId = slugFromHref(item && item.link);
        if (!mangaId || seen.has(mangaId)) continue;
        seen.add(mangaId);
        matched.push({
          mangaId,
          title: stripTags(item.title) || mangaId,
          summary: stripTags(item.description),
        });
      }

      const start = (page - 1) * SEARCH_PAGE_SIZE;
      const slice = matched.slice(start, start + SEARCH_PAGE_SIZE);
      const results = await Promise.all(
        slice.map(async (entry) => {
          try {
            const details = await this.getMangaDetails(entry.mangaId);
            const info = details && details.mangaInfo ? details.mangaInfo : {};
            return {
              mangaId: entry.mangaId,
              title: info.title || entry.title,
              image: info.image,
              summary: info.desc || entry.summary,
              tags: info.tags,
              ageRating: info.ageRating,
              webURL: `${SITE}/anime/stream/${entry.mangaId}`,
              medium: 'anime',
            };
          } catch (e) {
            return null;
          }
        })
      );

      const valid = results.filter((r) => r && r.image);
      const hasNext = start + SEARCH_PAGE_SIZE < matched.length;
      return {
        results: valid,
        metadata: hasNext ? { page: page + 1 } : undefined,
      };
    }

    if (included.length > 0 && included[0] && included[0].id) {
      const genreId = String(included[0].id);
      const url = page > 1
        ? `${SITE}/genre/${encodeURIComponent(genreId)}/${page}`
        : `${SITE}/genre/${encodeURIComponent(genreId)}`;
      const html = await this.text(url);
      const $ = cheerio.load(html);
      const results = parseCardsFromHtml($, '.seriesListContainer > div');
      const nextHref = $(`.pagination a[href$="/${page + 1}"]`).attr('href');
      return {
        results,
        metadata: results.length > 0 && nextHref ? { page: page + 1 } : undefined,
      };
    }

    if (feedId === 'catalog') {
      const idx = page - 1;
      if (idx < 0 || idx >= CATALOG_LETTERS.length) return { results: [] };
      const letter = CATALOG_LETTERS[idx];
      const html = await this.text(`${SITE}/katalog/${encodeURIComponent(letter)}`);
      const $ = cheerio.load(html);
      const results = parseCardsFromHtml($, '.seriesListContainer > div');
      return {
        results,
        metadata: idx + 1 < CATALOG_LETTERS.length ? { page: page + 1 } : undefined,
      };
    }

    if (feedId === 'new') {
      const html = await this.text(`${SITE}/neu`);
      const $ = cheerio.load(html);
      return { results: parseCardsFromHtml($, '.seriesListContainer > div') };
    }

    if (feedId === 'trending') {
      const html = await this.text(`${SITE}/`);
      const $ = cheerio.load(html);
      return { results: parseCardsFromHtml($, '.coverListItem') };
    }

    const html = await this.text(`${SITE}/beliebte-animes`);
    const $ = cheerio.load(html);
    return { results: parseCardsFromHtml($, '.seriesListContainer > div') };
  }

  async getMangaDetails(mangaId) {
    const html = await this.fetchSeriesPage(mangaId);
    const $ = cheerio.load(html);
    const title = $('.series-title h1 span').first().text().trim() || $('.series-title h1').first().text().trim() || mangaId;
    const coverEl = $('.seriesCoverBox img').first();
    const rawCover = coverEl.attr('data-src') || coverEl.attr('src') || '';
    const image = absoluteUrl(rawCover.replace('_150x225.', '_220x330.'));

    const backdropStyle = $('.backdrop').first().attr('style') || '';
    const bannerMatch = /url\(['"]?([^'")\s]+)['"]?\)/i.exec(backdropStyle);
    const banner = bannerMatch ? absoluteUrl(bannerMatch[1]) : undefined;

    const descEl = $('p.seri_des').first();
    const desc = (descEl.attr('data-full-description') || descEl.text() || '').trim();

    const tags = $('.genres li a')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    const creators = $('[itemprop="creator"] [itemprop="name"], [itemprop="director"] [itemprop="name"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    const author = creators.length ? [...new Set(creators)].join(', ') : undefined;

    const ratingVal = parseFloat($('[itemprop="ratingValue"]').first().text().trim());
    const bestVal = parseFloat($('[itemprop="bestRating"]').first().text().trim()) || 5;
    const rating = Number.isFinite(ratingVal) && ratingVal > 0
      ? Math.round((ratingVal / bestVal) * 5 * 100) / 100
      : undefined;

    const ageRating = ageRatingOfFsk($('[data-fsk]').first().attr('data-fsk'));
    const status = statusFromEndDate($('[itemprop="endDate"]').first().text());

    return {
      mangaInfo: {
        title,
        image,
        banner,
        author,
        desc,
        status,
        tags,
        rating,
        ageRating,
        webURL: `${SITE}/anime/stream/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const firstHtml = await this.fetchSeriesPage(mangaId);
    const $first = cheerio.load(firstHtml);

    const seasonTabs = [];
    const seenPaths = new Set();
    $first('#stream ul').first().find('li a').each((_, a) => {
      const href = String($first(a).attr('href') || '').trim();
      const label = $first(a).text().trim();
      if (!href || seenPaths.has(href)) return;
      if (href.indexOf(`/anime/stream/${mangaId}/`) === -1) return;
      seenPaths.add(href);
      const isMovies = /\/filme\/?$/i.test(href);
      seasonTabs.push({
        href,
        label: isMovies ? 'Filme' : `Staffel ${label}`,
        seasonId: isMovies ? '0' : String(label),
        isMovies,
      });
    });

    if (!seasonTabs.length) {
      throw new Error('AniWorld: keine Staffeln für diesen Anime gefunden');
    }

    const activeHref = $first('#stream ul').first().find('li a.active').attr('href') || seasonTabs[0].href;
    const pageHtmls = await Promise.all(
      seasonTabs.map((tab) => (tab.href === activeHref ? Promise.resolve(firstHtml) : this.text(`${SITE}${tab.href}`)))
    );

    const multipleSeasons = seasonTabs.length > 1;
    const episodes = [];
    const seenIds = new Set();

    for (let i = 0; i < seasonTabs.length; i++) {
      const tab = seasonTabs[i];
      const $ = cheerio.load(pageHtmls[i]);
      $('table.seasonEpisodesList tbody tr').each((idx, tr) => {
        const link = $(tr).find('a[href*="/anime/stream/"]').first();
        const href = String(link.attr('href') || '').trim();
        const match = new RegExp(`^/anime/stream/${mangaId}/(.+)$`, 'i').exec(href);
        if (!match) return;
        const chapterId = match[1].replace(/\/+$/, '');
        if (!chapterId || seenIds.has(chapterId)) return;

        const langFlags = $(tr)
          .find('td.editFunctions img')
          .map((__, img) => langFlagShort($(img).attr('src'), $(img).attr('title')))
          .get()
          .filter(Boolean);
        if (!langFlags.length) return;

        seenIds.add(chapterId);

        const metaNum = parseFloat($(tr).find('meta[itemprop="episodeNumber"]').attr('content') || '');
        const numMatch = /(?:episode-|film-)(\d+)/i.exec(chapterId);
        const number = Number.isFinite(metaNum) ? metaNum : numMatch ? parseInt(numMatch[1], 10) : idx + 1;

        const gerTitle = $(tr).find('.seasonEpisodeTitle strong').first().text().trim();
        const engTitle = $(tr).find('.seasonEpisodeTitle span').first().text().trim();
        const rawTitle = gerTitle && engTitle && gerTitle !== engTitle
          ? `${gerTitle} (${engTitle})`
          : gerTitle || engTitle;

        const prefix = tab.isMovies ? `Film ${number}` : `Episode ${number}`;
        const name = rawTitle ? `${prefix}: ${rawTitle}` : prefix;

        const ep = {
          id: chapterId,
          chapterId,
          name,
          number,
          group: [...new Set(langFlags)].join(', '),
        };
        if (multipleSeasons) {
          ep.season = tab.seasonId;
          ep.seasonName = tab.label;
        }
        episodes.push(ep);
      });
    }

    if (!episodes.length) {
      throw new Error('AniWorld: für diesen Anime sind noch keine Episoden verfügbar');
    }

    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    const cleanChapter = String(chapterId || '').replace(/^\/+/, '');
    const epUrl = `${SITE}/anime/stream/${mangaId}/${cleanChapter}`;
    const html = await this.text(epUrl);
    const $ = cheerio.load(html);

    const langMap = new Map();
    $('.changeLanguageBox img[data-lang-key]').each((_, img) => {
      const key = String($(img).attr('data-lang-key') || '').trim();
      if (key) {
        langMap.set(key, {
          title: $(img).attr('title') || '',
          src: $(img).attr('src') || '',
        });
      }
    });

    const voeTargets = [];
    const seenTargets = new Set();
    $('ul.row li[data-lang-key]').each((_, li) => {
      const hosterName = $(li).find('h4').first().text().trim();
      const target = String($(li).attr('data-link-target') || '').trim();
      const langKey = String($(li).attr('data-lang-key') || '').trim();
      if (!target || seenTargets.has(target)) return;
      if (hosterName.toLowerCase() === 'voe') {
        seenTargets.add(target);
        voeTargets.push({ target, langKey });
      }
    });

    if (!voeTargets.length) {
      throw new Error('AniWorld: kein unterstützter Stream-Hoster (VOE) für diese Episode gefunden');
    }

    const videos = [];
    for (const item of voeTargets) {
      try {
        const video = await this.resolveVoeRedirect(`${SITE}${item.target}`, epUrl, item.langKey, langMap.get(item.langKey));
        if (video) videos.push(video);
      } catch (e) {
        console.error('AniWorld VOE resolution error:', e);
      }
    }

    if (!videos.length) {
      throw new Error('AniWorld: keiner der Stream-Server lieferte ein abspielbares Video');
    }

    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async resolveVoeRedirect(redirectUrl, refererUrl, langKey, langMeta) {
    const res1 = await this.requests.schedule(
      App.createRequest({
        url: redirectUrl,
        method: 'GET',
        headers: { 'User-Agent': UA, Referer: refererUrl },
      })
    );

    let voeBody = String(res1.data || '');
    const locHeader = (res1.headers && (res1.headers.location || res1.headers.Location)) || '';
    if (locHeader && voeBody.indexOf('window.location.href') === -1 && voeBody.indexOf('application/json') === -1) {
      const nextRes = await this.requests.schedule(
        App.createRequest({
          url: absoluteUrl(locHeader, redirectUrl),
          method: 'GET',
          headers: { 'User-Agent': UA, Referer: refererUrl },
        })
      );
      voeBody = String(nextRes.data || '');
    }

    let embedHtml = voeBody;
    let playerOrigin = 'https://jamespatterncamera.com';
    const jsRedirectMatch = /window\.location\.href\s*=\s*['"](https?:\/\/[^'"]+)['"]/i.exec(voeBody);
    if (jsRedirectMatch) {
      const stage2Url = jsRedirectMatch[1];
      playerOrigin = originOf(stage2Url);
      const res2 = await this.requests.schedule(
        App.createRequest({
          url: stage2Url,
          method: 'GET',
          headers: { 'User-Agent': UA, Referer: 'https://voe.sx/' },
        })
      );
      embedHtml = String(res2.data || '');
    }

    const $ = cheerio.load(embedHtml);
    const jsonScript = $('script[type="application/json"]').first().text().trim();
    let streamUrl = '';
    if (jsonScript) {
      const parsed = JSON.parse(jsonScript);
      if (Array.isArray(parsed) && parsed[0]) {
        const decoded = decodeVoePayload(parsed[0]);
        streamUrl = decoded && decoded.source ? String(decoded.source) : '';
      }
    }
    if (!streamUrl) {
      const hlsMatch = /['"]hls['"]\s*:\s*['"]([^'"]+)['"]/i.exec(embedHtml);
      if (hlsMatch) {
        const raw = hlsMatch[1];
        streamUrl = /^https?:\/\//i.test(raw) ? raw : App.base64Decode(raw);
      }
    }
    if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) return null;

    return {
      url: streamUrl,
      quality: qualityLabelForLang(langKey, langMeta),
      headers: {
        Referer: `${playerOrigin}/`,
        'User-Agent': UA,
      },
    };
  }

  async fetchSeriesPage(mangaId) {
    const key = String(mangaId);
    const cached = this.seriesCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return cached.promise;
    }
    const promise = this.text(`${SITE}/anime/stream/${encodeURIComponent(key)}`).catch((err) => {
      this.seriesCache.delete(key);
      throw err;
    });
    this.seriesCache.set(key, { time: Date.now(), promise });
    return promise;
  }

  async text(url, extraHeaders) {
    const response = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: Object.assign({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, extraHeaders || {}),
      })
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`AniWorld: HTTP ${response.status}`);
    }
    return String(response.data);
  }
}

module.exports = { Source };
