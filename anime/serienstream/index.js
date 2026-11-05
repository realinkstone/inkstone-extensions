const SITE = 'https://serienstream.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 5 * 60 * 1000;

const FEEDS = [
  { id: 'popular', name: 'Beliebt' },
  { id: 'new_seasons', name: 'Neue Staffeln' },
  { id: 'trending', name: 'Angesagt' },
];

const FALLBACK_GENRES = [
  { id: 'abenteuer', label: 'Abenteuer' },
  { id: 'action', label: 'Action' },
  { id: 'animation', label: 'Animation' },
  { id: 'anime', label: 'Anime' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'dokumentation', label: 'Dokumentation' },
  { id: 'dokusoap', label: 'Doku-Soap' },
  { id: 'drama', label: 'Drama' },
  { id: 'dramedy', label: 'Dramedy' },
  { id: 'familie', label: 'Familie' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'history', label: 'Historie' },
  { id: 'horror', label: 'Horror' },
  { id: 'jugend', label: 'Jugend' },
  { id: 'kinderserie', label: 'Kinderserie' },
  { id: 'krankenhaus', label: 'Krankenhausserie' },
  { id: 'krimi', label: 'Krimi' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'romantik', label: 'Romantik' },
  { id: 'science-fiction', label: 'Science Fiction' },
  { id: 'sitcom', label: 'Sitcom' },
  { id: 'telenovela', label: 'Telenovela' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'western', label: 'Western' },
  { id: 'zeichentrick', label: 'Zeichentrick' },
  { id: 'k-drama', label: 'K-Drama' },
  { id: 'reality-tv', label: 'Reality TV' },
  { id: 'true-crime', label: 'True Crime' },
];

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function solveAltcha(salt, challengeHex, maxNumber) {
  const limit = Number.isFinite(maxNumber) && maxNumber > 0 ? maxNumber : 100000;
  const t0 = parseInt(challengeHex.slice(0, 8), 16) | 0;
  const t1 = parseInt(challengeHex.slice(8, 16), 16) | 0;
  const t2 = parseInt(challengeHex.slice(16, 24), 16) | 0;
  const t3 = parseInt(challengeHex.slice(24, 32), 16) | 0;
  const t4 = parseInt(challengeHex.slice(32, 40), 16) | 0;
  const t5 = parseInt(challengeHex.slice(40, 48), 16) | 0;
  const t6 = parseInt(challengeHex.slice(48, 56), 16) | 0;
  const t7 = parseInt(challengeHex.slice(56, 64), 16) | 0;
  const w = new Array(64);

  for (let n = 0; n <= limit; n++) {
    const str = salt + n;
    const len = str.length;
    for (let i = 0; i < 16; i++) w[i] = 0;
    for (let i = 0; i < len; i++) {
      w[i >> 2] |= (str.charCodeAt(i) & 0xff) << (24 - (i & 3) * 8);
    }
    w[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
    w[15] = len * 8;

    for (let i = 16; i < 64; i++) {
      const v0 = w[i - 15];
      const s0 = ((v0 >>> 7) | (v0 << 25)) ^ ((v0 >>> 18) | (v0 << 14)) ^ (v0 >>> 3);
      const v1 = w[i - 2];
      const s1 = ((v1 >>> 17) | (v1 << 15)) ^ ((v1 >>> 19) | (v1 << 13)) ^ (v1 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = 0x6a09e667;
    let b = 0xbb67ae85;
    let c = 0x3c6ef372;
    let d = 0xa54ff53a;
    let e = 0x510e527f;
    let f = 0x9b05688c;
    let g = 0x1f83d9ab;
    let h = 0x5be0cd19;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    if (
      ((a + 0x6a09e667) | 0) === t0 &&
      ((b + 0xbb67ae85) | 0) === t1 &&
      ((c + 0x3c6ef372) | 0) === t2 &&
      ((d + 0xa54ff53a) | 0) === t3 &&
      ((e + 0x510e527f) | 0) === t4 &&
      ((f + 0x9b05688c) | 0) === t5 &&
      ((g + 0x1f83d9ab) | 0) === t6 &&
      ((h + 0x5be0cd19) | 0) === t7
    ) {
      return n;
    }
  }
  return 0;
}

function absoluteUrl(url, base) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  const origin = base || SITE;
  return raw.startsWith('/') ? origin + raw : origin + '/' + raw;
}

function toJpgMediaUrl(url) {
  const abs = absoluteUrl(url);
  if (!abs) return '';
  return abs.replace(/([?&]format=)avif\b/i, '$1jpg');
}

function originOf(url) {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(String(url || ''));
  return match ? match[1] : SITE;
}

function slugFromSerieHref(href) {
  const match = /\/serie\/([^/?#]+)/i.exec(String(href || '').trim());
  return match ? decodeURIComponent(match[1]) : '';
}

function ageRatingOfText(text) {
  const match = /\bFSK\s*(\d+)/i.exec(String(text || ''));
  if (!match) return undefined;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n)) return undefined;
  if (n >= 18) return 18;
  if (n >= 16) return 16;
  return 0;
}

function statusOfYearLine(text) {
  const s = String(text || '');
  if (/\b\d{4}\s*[–-]\s*\d{4}\b/.test(s)) return 'COMPLETED';
  if (/\b\d{4}\s*[–-]\s*(?:Heute|Jetzt|\u2022|$)/i.test(s)) return 'ONGOING';
  return 'UNKNOWN';
}

function qualityLabelOf(langId, langLabel) {
  const id = String(langId || '');
  const label = String(langLabel || '').trim();
  const lower = label.toLowerCase();
  if (id === '1' || lower === 'deutsch') {
    return 'Auto Dub (Deutsch)';
  }
  if (id === '3' || lower.indexOf('sub') !== -1 || lower.indexOf('untertitel') !== -1) {
    return `Auto Sub (${label || 'Ger-Sub'})`;
  }
  if (id === '2' || lower === 'englisch' || lower === 'english') {
    return 'Auto Dub (Englisch)';
  }
  return label ? `Auto (${label})` : 'Auto';
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

function mergeCookies(jar, headers) {
  if (!headers) return;
  const raw = headers['set-cookie'] || headers['Set-Cookie'];
  if (!raw) return;
  const parts = Array.isArray(raw) ? raw : String(raw).split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const part of parts) {
    const first = String(part || '').split(';')[0].trim();
    const eq = first.indexOf('=');
    if (eq > 0) {
      const name = first.slice(0, eq).trim();
      const val = first.slice(eq + 1).trim();
      if (/Max-Age=0/i.test(part)) {
        jar.delete(name);
      } else {
        jar.set(name, val);
      }
    }
  }
}

function formatCookies(jar) {
  const list = [];
  jar.forEach((v, k) => list.push(`${k}=${v}`));
  return list.join('; ');
}

function parseCards($, scope) {
  const results = [];
  const seen = new Set();
  const root = scope ? $(scope) : $.root();
  root.find('.cover-card, a.show-card').each((_, el) => {
    const link = $(el).is('a') ? $(el) : $(el).find('a[href*="/serie/"]').first();
    const href = link.attr('href') || '';
    const mangaId = slugFromSerieHref(href);
    if (!mangaId || seen.has(mangaId)) return;

    const imgEl = $(el).find('img').first();
    const rawImg = imgEl.attr('data-src') || imgEl.attr('src') || '';
    const image = toJpgMediaUrl(rawImg);
    const title =
      $(el).find('.show-title').first().text().trim() ||
      imgEl.attr('alt') ||
      link.attr('title') ||
      mangaId;

    if (!image || !title) return;
    seen.add(mangaId);
    results.push({
      mangaId,
      title,
      image,
      webURL: `${SITE}/serie/${mangaId}`,
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
      const html = await this.text(`${SITE}/beliebte-serien`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('a[href*="/genre/"]').each((_, el) => {
        const href = String($(el).attr('href') || '');
        const match = /\/genre\/([^/?#]+)/i.exec(href);
        const id = match ? decodeURIComponent(match[1]) : '';
        const label = $(el).find('h3').first().text().trim() || $(el).text().trim();
        if (id && label && !seen.has(id)) {
          seen.add(id);
          tags.push({ id, label });
        }
      });
      return tags.length ? tags : FALLBACK_GENRES;
    } catch (e) {
      console.error('SerienStream getSearchTags failed:', e);
      return FALLBACK_GENRES;
    }
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const feedId = (request && request.feed) || FEEDS[0].id;

    if (query) {
      const html = await this.text(`${SITE}/suche?term=${encodeURIComponent(query)}`);
      const $ = cheerio.load(html);
      let firstSection = null;
      $('h2').each((_, h2) => {
        if (!firstSection && $(h2).text().trim().toLowerCase() === 'serien') {
          firstSection = $(h2).parent();
        }
      });
      const results = parseCards($, firstSection || undefined);
      return { results };
    }

    if (included.length > 0 && included[0] && included[0].id) {
      const genreId = String(included[0].id);
      const html = await this.text(`${SITE}/genre/${encodeURIComponent(genreId)}?page=${page}`);
      const $ = cheerio.load(html);
      const results = parseCards($);
      const hasNext = results.length > 0 && $('.pagination a[rel="next"]').length > 0;
      return {
        results,
        metadata: hasNext ? { page: page + 1 } : undefined,
      };
    }

    if (feedId === 'trending') {
      const html = await this.text(`${SITE}/suche`);
      const $ = cheerio.load(html);
      return { results: parseCards($) };
    }

    const html = await this.text(`${SITE}/beliebte-serien`);
    const $ = cheerio.load(html);
    if (feedId === 'new_seasons') {
      const firstBlock = $('.popular-page .mb-5').first();
      return { results: parseCards($, firstBlock.length ? firstBlock : undefined) };
    }
    return { results: parseCards($) };
  }

  async getMangaDetails(mangaId) {
    const html = await this.fetchSeriesPage(mangaId);
    const $ = cheerio.load(html);

    const title = $('h1').first().text().trim() || mangaId;
    let image = '';
    $('img').each((_, img) => {
      if (image) return;
      const src = $(img).attr('data-src') || $(img).attr('src') || '';
      if (src.indexOf('/media/images/channel/') !== -1) {
        image = toJpgMediaUrl(src);
      }
    });

    let banner;
    $('img').each((_, img) => {
      if (banner) return;
      const src = $(img).attr('data-src') || $(img).attr('src') || '';
      if (src.indexOf('/media/images/backdrop/') !== -1) {
        banner = toJpgMediaUrl(src);
      }
    });

    const desc = $('.series-description .description-text').first().text().trim();
    const metaLine = $('h1').first().next('p').text().trim();
    const ageRating = ageRatingOfText(metaLine);
    const status = statusOfYearLine(metaLine);

    const tags = [];
    const seenTags = new Set();
    $('a[href^="/genre/"]').each((_, a) => {
      const t = $(a).text().trim();
      if (t && !seenTags.has(t)) {
        seenTags.add(t);
        tags.push(t);
      }
    });

    const creators = $('a[href^="/produzent/"], a[href^="/regisseur/"]')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);
    const author = creators.length ? [...new Set(creators)].join(', ') : undefined;

    return {
      mangaInfo: {
        title,
        image,
        banner,
        author,
        desc,
        status,
        tags,
        ageRating,
        webURL: `${SITE}/serie/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const firstHtml = await this.fetchSeriesPage(mangaId);
    const $first = cheerio.load(firstHtml);

    const seasonTabs = [];
    const seenPaths = new Set();
    $first(`a[href*="/serie/${mangaId}/staffel-"]`).each((_, a) => {
      const href = String($first(a).attr('href') || '').trim();
      const match = new RegExp(`^/serie/${mangaId}/(staffel-(\\d+))/?$`, 'i').exec(href);
      if (!match) return;
      const seasonPath = `/serie/${mangaId}/${match[1]}`;
      if (seenPaths.has(seasonPath)) return;
      seenPaths.add(seasonPath);
      const seasonNum = match[2];
      const isMovies = seasonNum === '0';
      seasonTabs.push({
        href: seasonPath,
        seasonId: seasonNum,
        label: isMovies ? 'Filme' : `Staffel ${seasonNum}`,
        isMovies,
      });
    });

    if (!seasonTabs.length) {
      throw new Error('SerienStream: keine Staffeln für diese Serie gefunden');
    }

    const activeSeasonHeading = $first('.episode-section h2').first().text().trim();
    const activeMatch = /Staffel\s+(\d+)/i.exec(activeSeasonHeading);
    const activeSeasonId = activeMatch ? activeMatch[1] : /Filme/i.test(activeSeasonHeading) ? '0' : seasonTabs[0].seasonId;

    const pageHtmls = await Promise.all(
      seasonTabs.map((tab) =>
        tab.seasonId === activeSeasonId ? Promise.resolve(firstHtml) : this.text(`${SITE}${tab.href}`)
      )
    );

    const multipleSeasons = seasonTabs.length > 1;
    const episodes = [];
    const seenIds = new Set();

    for (let i = 0; i < seasonTabs.length; i++) {
      const tab = seasonTabs[i];
      const $ = cheerio.load(pageHtmls[i]);
      $('table.episode-table tbody tr.episode-row').each((idx, tr) => {
        const onclick = String($(tr).attr('onclick') || '');
        const linkHref = $(tr).find('a[href*="/serie/"]').first().attr('href') || '';
        const pathMatch =
          new RegExp(`/serie/${mangaId}/(staffel-\\d+/episode-\\d+)`, 'i').exec(onclick) ||
          new RegExp(`/serie/${mangaId}/(staffel-\\d+/episode-\\d+)`, 'i').exec(linkHref);
        if (!pathMatch) return;
        const chapterId = pathMatch[1];
        if (seenIds.has(chapterId)) return;

        const hasProviders = $(tr).find('.watch-link, img[src*="/providers/"]').length > 0;
        if (!hasProviders) return;

        seenIds.add(chapterId);

        const numRaw = parseFloat($(tr).find('.episode-number-cell').first().text().trim());
        const numMatch = /episode-(\d+)/i.exec(chapterId);
        const number = Number.isFinite(numRaw) ? numRaw : numMatch ? parseInt(numMatch[1], 10) : idx + 1;

        const gerTitle = $(tr).find('.episode-title-ger').first().text().trim();
        const engTitle = $(tr).find('.episode-title-eng').first().text().trim();
        const rawTitle =
          gerTitle && engTitle && gerTitle !== engTitle
            ? `${gerTitle} (${engTitle})`
            : gerTitle || engTitle;

        const prefix = tab.isMovies ? `Film ${number}` : `Episode ${number}`;
        const name = rawTitle ? `${prefix}: ${rawTitle}` : prefix;

        const ep = {
          id: chapterId,
          chapterId,
          name,
          number,
        };
        if (multipleSeasons) {
          ep.season = tab.seasonId;
          ep.seasonName = tab.label;
        }
        episodes.push(ep);
      });
    }

    if (!episodes.length) {
      throw new Error('SerienStream: für diese Serie sind noch keine Episoden verfügbar');
    }

    return episodes.reverse();
  }

  async getVideos(mangaId, chapterId) {
    const cleanChapter = String(chapterId || '').replace(/^\/+/, '');
    const epUrl = `${SITE}/serie/${mangaId}/${cleanChapter}`;
    const jar = new Map();

    const epRes = await this.requests.schedule(
      App.createRequest({
        url: epUrl,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      })
    );
    if (epRes.status < 200 || epRes.status >= 300) {
      throw new Error(`SerienStream: HTTP ${epRes.status}`);
    }
    mergeCookies(jar, epRes.headers);

    const $ = cheerio.load(String(epRes.data || ''));
    const csrf = $('input[name="_token"]').first().attr('value') || '';

    const voeButtons = [];
    const seenTokens = new Set();
    $('button.link-box').each((_, btn) => {
      const provider = String($(btn).attr('data-provider-name') || '').trim();
      const playUrl = String($(btn).attr('data-play-url') || '').trim();
      const langLabel = String($(btn).attr('data-language-label') || '').trim();
      const langId = String($(btn).attr('data-language-id') || '').trim();
      if (provider.toLowerCase() !== 'voe' || !playUrl) return;
      const tMatch = /[?&]t=([^&#]+)/.exec(playUrl);
      if (!tMatch) return;
      const tokenT = decodeURIComponent(tMatch[1]);
      if (seenTokens.has(tokenT)) return;
      seenTokens.add(tokenT);
      voeButtons.push({ tokenT, langLabel, langId });
    });

    if (!voeButtons.length) {
      throw new Error('SerienStream: kein unterstützter Stream-Hoster (VOE) für diese Episode gefunden');
    }

    const videos = [];
    let challenge = null;
    for (const btn of voeButtons) {
      try {
        const video = await this.resolveGateVoe(epUrl, csrf, btn, jar);
        if (video) videos.push(video);
      } catch (e) {
        if (e && e.kind === 'challenge') challenge = e;
        console.error('SerienStream VOE resolution error:', e);
      }
    }

    if (!videos.length) {
      if (challenge) throw challenge;
      throw new Error('SerienStream: keiner der Stream-Server lieferte ein abspielbares Video');
    }

    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async resolveGateVoe(epUrl, csrf, btn, jar) {
    const initRes = await this.requests.schedule(
      App.createRequest({
        url: `${SITE}/api/inline/verify-init`,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          Referer: epUrl,
          Cookie: formatCookies(jar),
        },
      })
    );
    if (initRes.status < 200 || initRes.status >= 300) return null;
    mergeCookies(jar, initRes.headers);

    const ch = JSON.parse(String(initRes.data || '{}'));
    if (!ch || !ch.salt || !ch.challenge) return null;

    const solvedNum = solveAltcha(String(ch.salt), String(ch.challenge), Number(ch.maxnumber) || 100000);
    const altchaPayload = App.base64Encode(
      JSON.stringify({
        algorithm: ch.algorithm || 'SHA-256',
        challenge: ch.challenge,
        number: solvedNum,
        salt: ch.salt,
        signature: ch.signature,
        took: 25,
      })
    );

    const postBody =
      `_token=${encodeURIComponent(csrf)}` +
      `&t=${encodeURIComponent(btn.tokenT)}` +
      `&altcha=${encodeURIComponent(altchaPayload)}`;

    const postRes = await this.requests.schedule(
      App.createRequest({
        url: `${SITE}/r`,
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: epUrl,
          Origin: SITE,
          Cookie: formatCookies(jar),
        },
        body: postBody,
      })
    );
    mergeCookies(jar, postRes.headers);

    let voeBody = String(postRes.data || '');
    const locHeader = (postRes.headers && (postRes.headers.location || postRes.headers.Location)) || '';
    const metaRedirectMatch = /url=['"]?(https?:\/\/[^'">\s]+)['"]?/i.exec(voeBody);
    const redirectTarget = locHeader || (metaRedirectMatch ? metaRedirectMatch[1] : '');

    if (redirectTarget && voeBody.indexOf('window.location.href') === -1 && voeBody.indexOf('application/json') === -1) {
      const voeRes = await this.requests.schedule(
        App.createRequest({
          url: redirectTarget,
          method: 'GET',
          headers: { 'User-Agent': UA, Referer: `${SITE}/` },
        })
      );
      voeBody = String(voeRes.data || '');
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
      quality: qualityLabelOf(btn.langId, btn.langLabel),
      server: 'VOE',
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
    const promise = this.text(`${SITE}/serie/${encodeURIComponent(key)}`).catch((err) => {
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
      throw new Error(`SerienStream: HTTP ${response.status}`);
    }
    return String(response.data);
  }
}

module.exports = { Source };
