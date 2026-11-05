const SITE = 'https://anikototv.to';
const PLAYER_ORIGIN = 'https://megaplay.buzz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SOURCE_ENC_KEY = 'i?LMTAx0Q6,:}50U';
const SOURCE_ENC_IV = "W0;27ToaUpl_P%'c";
const CDN_TOKEN_SECRET = 'MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s';
const CACHE_TTL_MS = 5 * 60 * 1000;

const FEEDS = [
  { id: 'latest-updated', name: 'Latest Updated' },
  { id: 'most-viewed', name: 'Most Viewed' },
  { id: 'score', name: 'Top Score' },
  { id: 'latest-added', name: 'Latest Added' },
  { id: 'name-az', name: 'Name A-Z' },
];

const LANG_CODES = {
  english: 'en',
  eng: 'en',
  arabic: 'ar',
  ara: 'ar',
  german: 'de',
  ger: 'de',
  deu: 'de',
  spanish: 'es',
  spa: 'es',
  french: 'fr',
  fre: 'fr',
  fra: 'fr',
  italian: 'it',
  ita: 'it',
  portuguese: 'pt',
  por: 'pt',
  russian: 'ru',
  rus: 'ru',
  japanese: 'ja',
  jpn: 'ja',
  chinese: 'zh',
  chi: 'zh',
  zho: 'zh',
  korean: 'ko',
  kor: 'ko',
  indonesian: 'id',
  ind: 'id',
  malay: 'ms',
  may: 'ms',
  msa: 'ms',
  thai: 'th',
  tha: 'th',
  vietnamese: 'vi',
  vie: 'vi',
};

function absoluteUrl(url, base) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  const origin = base || SITE;
  return raw.startsWith('/') ? origin + raw : origin + '/' + raw;
}

function slugFromHref(href) {
  const match = /\/watch\/([^/?#]+)/.exec(String(href || ''));
  return match ? decodeURIComponent(match[1]) : '';
}

function statusOf(text) {
  const s = String(text || '').toLowerCase();
  if (s.indexOf('currently') !== -1 || s.indexOf('ongoing') !== -1) return 'ONGOING';
  if (s.indexOf('finished') !== -1 || s.indexOf('completed') !== -1) return 'COMPLETED';
  return 'UNKNOWN';
}

function ageRatingOf(text) {
  const r = String(text || '').trim().toUpperCase();
  if (!r || r === '?') return undefined;
  if (r === 'RX' || r === 'R+') return 18;
  if (r === 'R') return 16;
  if (r === 'G' || r === 'PG' || r === 'PG-13') return 0;
  return 16;
}

function b64UrlToB64(str) {
  let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return s;
}

function b64ToB64Url(str) {
  return String(str || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decryptSourcesEnc(enc) {
  const key = CryptoJS.enc.Utf8.parse(SOURCE_ENC_KEY + '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0');
  const iv = CryptoJS.enc.Utf8.parse(SOURCE_ENC_IV);
  const ciphertext = CryptoJS.enc.Base64.parse(b64UrlToB64(enc));
  const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
}

function attachCdnToken(fileUrl) {
  const text = String(fileUrl || '');
  if (!text || /[?&]token=/.test(text)) return text;
  const match = /\/([a-f0-9]{32})\/([a-f0-9]{32})\//i.exec(text);
  if (!match) return text;
  const pathKey = match[1].toLowerCase() + '/' + match[2].toLowerCase();
  const exp = Math.floor(Date.now() / 1000) + 90;
  const msg = String(exp) + '|' + pathKey;
  const msgB64 = b64ToB64Url(CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(msg)));
  const sig = CryptoJS.HmacSHA256(msg, CDN_TOKEN_SECRET);
  const sigB64 = b64ToB64Url(CryptoJS.enc.Base64.stringify(sig));
  const token = msgB64 + '.' + sigB64;
  const sep = text.indexOf('?') !== -1 ? '&' : '?';
  return text + sep + 'token=' + encodeURIComponent(token);
}

function replaceHost(urlStr, newHost) {
  const cleanHost = String(newHost || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!cleanHost) return urlStr;
  return String(urlStr || '').replace(/^(https?:\/\/)[^/?#]+/i, '$1' + cleanHost);
}

function languageCodeOf(label, fileUrl) {
  const words = String(label || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    if (LANG_CODES[w]) return LANG_CODES[w];
  }
  const fileMatch = /_([a-z]{3})\.vtt(?:[?#]|$)/i.exec(String(fileUrl || ''));
  if (fileMatch && LANG_CODES[fileMatch[1].toLowerCase()]) {
    return LANG_CODES[fileMatch[1].toLowerCase()];
  }
  return words[0] ? words[0].slice(0, 2) : 'en';
}

function skipRange(range, fallbackTuple) {
  let start = NaN;
  let end = NaN;
  if (range && typeof range === 'object') {
    start = Number(range.start);
    end = Number(range.end);
  } else if (Array.isArray(fallbackTuple) && fallbackTuple.length >= 2) {
    start = Number(fallbackTuple[0]);
    end = Number(fallbackTuple[1]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return undefined;
  }
  return { start: Math.round(start * 1000), end: Math.round(end * 1000) };
}

function qualityLabelOf(type) {
  const t = String(type || '').toLowerCase();
  if (t.indexOf('dub') !== -1) return 'Auto Dub';
  if (t.indexOf('hsub') !== -1 || t.indexOf('hard') !== -1) return 'Auto Hardsub';
  if (t.indexOf('soft') !== -1) return 'Auto Softsub';
  return 'Auto Sub';
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({});
    this.watchCache = new Map();
    this.episodeCache = new Map();
    this.fallbackHostPromise = null;
    this.fallbackHostTime = 0;
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    try {
      const html = await this.text(`${SITE}/filter`);
      const $ = cheerio.load(html);
      const tags = [];
      const seen = new Set();
      $('ul.genres li input[name="genre[]"]').each((_, el) => {
        const id = String($(el).attr('value') || '').trim();
        const label = $(el).next('label').text().trim();
        if (id && label && !seen.has(id)) {
          seen.add(id);
          tags.push({ id, label });
        }
      });
      return tags;
    } catch (e) {
      console.error('Anikoto getSearchTags failed:', e);
      return [];
    }
  }

  async getSearchResults(request, metadata) {
    const query = ((request && request.title) || '').trim();
    const page = (metadata && metadata.page) || 1;
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const excluded = Array.isArray(request && request.excludedTags) ? request.excludedTags : [];

    const parts = [];
    if (query) {
      parts.push(`keyword=${encodeURIComponent(query)}`);
    } else if (feed && feed.id) {
      parts.push(`sort=${encodeURIComponent(feed.id)}`);
    }
    for (const tag of included) {
      if (tag && tag.id) parts.push(`genre%5B%5D=${encodeURIComponent(String(tag.id))}`);
    }
    for (const tag of excluded) {
      if (tag && tag.id) parts.push(`genre%5B%5D=${encodeURIComponent('-' + String(tag.id).replace(/^-/,'') )}`);
    }
    parts.push(`page=${encodeURIComponent(String(page))}`);

    const url = `${SITE}/filter?${parts.join('&')}`;
    const response = await this.requests.schedule(
      App.createRequest({
        url,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      })
    );
    if (response.status === 404) {
      return { results: [] };
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Anikoto: HTTP ${response.status}`);
    }

    const $ = cheerio.load(String(response.data));
    const results = [];
    const seen = new Set();
    $('.item').each((_, el) => {
      const nameLink = $(el).find('a.name').first();
      const posterLink = $(el).find('.poster a').first();
      const href = nameLink.attr('href') || posterLink.attr('href') || '';
      const mangaId = slugFromHref(href);
      const title = nameLink.text().trim() || $(el).find('img').attr('alt') || '';
      const image = absoluteUrl($(el).find('img').first().attr('src'));
      if (!mangaId || !title || !image || seen.has(mangaId)) return;
      seen.add(mangaId);
      const tags = $(el)
        .find('.genre a')
        .map((__, a) => $(a).text().trim())
        .get()
        .filter(Boolean);
      results.push({
        mangaId,
        title,
        image,
        tags,
        webURL: `${SITE}/watch/${mangaId}`,
        medium: 'anime',
      });
    });

    const hasNext = results.length > 0 && $('.pagination a[rel="next"]').length > 0;
    return {
      results,
      metadata: hasNext ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId) {
    const html = await this.fetchWatchPage(mangaId);
    const $ = cheerio.load(html);
    const title = $('#w-info h1.title').first().text().trim() || mangaId;
    const image = absoluteUrl($('#w-info .poster img').first().attr('src'));
    const playerStyle = $('#player').attr('style') || '';
    const bannerMatch = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/i.exec(playerStyle);
    const banner = bannerMatch ? bannerMatch[1] : undefined;

    const synopsis = $('#w-info .synopsis .content').first().text().trim();
    const altNames = $('#w-info .names').first().text().trim();
    const desc = synopsis || altNames || '';

    const statusText = $('#w-info .bmeta a[href*="/status/"]').first().text().trim();
    const tags = $('#w-info .bmeta a[href*="/genre/"]')
      .map((_, a) => $(a).text().trim())
      .get()
      .filter(Boolean);

    let studio = '';
    $('#w-info .bmeta .meta > div').each((_, div) => {
      const text = $(div).text().trim();
      if (/^Studios:/i.test(text)) {
        studio = $(div).find('span').text().replace(/\s+/g, ' ').trim();
      }
    });

    const scoreRaw = parseFloat($('#w-rating').attr('data-score') || '');
    const rating = Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : undefined;
    const ageRating = ageRatingOf($('#w-info .meta.icons i.rating').first().text());

    return {
      mangaInfo: {
        title,
        image,
        banner,
        author: studio || undefined,
        desc,
        status: statusOf(statusText),
        tags,
        rating,
        ageRating,
        webURL: `${SITE}/watch/${mangaId}`,
        medium: 'anime',
      },
    };
  }

  async getChapters(mangaId) {
    const list = await this.loadEpisodes(mangaId);
    return list
      .map((ep) => ({
        id: ep.id,
        chapterId: ep.id,
        name: ep.name,
        number: ep.number,
        time: ep.time,
      }))
      .reverse();
  }

  async getVideos(mangaId, chapterId) {
    const list = await this.loadEpisodes(mangaId);
    const target = String(chapterId);
    const ep = list.find((item) => item.id === target || item.epId === target);
    if (!ep || !ep.dataIds) {
      throw new Error('Anikoto: episode was not found in the episode list');
    }

    const srvJson = await this.json(`${SITE}/ajax/server/list?servers=${encodeURIComponent(ep.dataIds)}`, {
      Referer: `${SITE}/watch/${mangaId}/ep-${ep.id}`,
      'X-Requested-With': 'XMLHttpRequest',
    });
    if (!srvJson || typeof srvJson.result !== 'string') {
      throw new Error('Anikoto: this episode has no server list yet');
    }

    const $ = cheerio.load(srvJson.result);
    const groups = [];
    $('.type').each((_, typeEl) => {
      const type = String($(typeEl).attr('data-type') || 'sub').trim();
      let picked = null;
      $(typeEl)
        .find('li[data-link-id]')
        .each((__, li) => {
          const name = $(li).text().trim();
          const linkId = $(li).attr('data-link-id');
          if (!linkId) return;
          if (!picked || /vidstream-2/i.test(name)) {
            picked = { type, name, linkId };
          }
        });
      if (picked) groups.push(picked);
    });

    if (!groups.length) {
      throw new Error('Anikoto: this episode lists no streaming servers yet');
    }

    const fallbackHost = await this.getFallbackHost();
    const videos = [];
    let challenge = null;

    for (const group of groups) {
      try {
        const srv = await this.json(`${SITE}/ajax/server?get=${encodeURIComponent(group.linkId)}`, {
          Referer: `${SITE}/watch/${mangaId}/ep-${ep.id}`,
          'X-Requested-With': 'XMLHttpRequest',
        });
        const rawEmbedUrl = srv && srv.result && srv.result.url ? String(srv.result.url) : '';
        if (!rawEmbedUrl) continue;

        const embedUrl = rawEmbedUrl.replace('/videojs/stream/', '/stream/').split('?')[0];
        const embedHtml = await this.text(embedUrl, { Referer: `${SITE}/` });
        const $p = cheerio.load(embedHtml);
        const playerId = $p('#megaplay-player').attr('data-id');
        if (!playerId) continue;

        const gs = await this.json(`${PLAYER_ORIGIN}/stream/getSources?id=${encodeURIComponent(playerId)}`, {
          Referer: embedUrl,
          'X-Requested-With': 'XMLHttpRequest',
        });
        const sourceObj = gs && gs.enc ? decryptSourcesEnc(gs.enc) : gs && gs.sources;
        const rawFile = typeof sourceObj === 'string' ? sourceObj : sourceObj && sourceObj.file;
        if (!rawFile) continue;

        const streamUrl = attachCdnToken(replaceHost(rawFile, fallbackHost));
        const rawTracks = Array.isArray(gs.tracks) ? gs.tracks : [];
        const subtitles = rawTracks
          .filter((t) => t && t.file && t.kind !== 'thumbnails')
          .map((t) => {
            const subUrl = replaceHost(String(t.file), fallbackHost);
            const label = String(t.label || 'Subtitles').trim();
            return {
              url: subUrl,
              label,
              language: languageCodeOf(label, subUrl),
            };
          })
          .filter((t) => /^https?:\/\//i.test(t.url));

        const skipData = (srv && srv.result && srv.result.skip_data) || {};
        const intro = skipRange(gs.intro, skipData.intro);
        const outro = skipRange(gs.outro, skipData.outro);

        videos.push({
          url: streamUrl,
          quality: qualityLabelOf(group.type),
          server: 'Anikoto',
          headers: {
            Referer: `${PLAYER_ORIGIN}/`,
            Origin: PLAYER_ORIGIN,
          },
          subtitles,
          intro,
          outro,
        });
      } catch (e) {
        if (e && e.kind === 'challenge') challenge = e;
      }
    }

    if (!videos.length) {
      if (challenge) throw challenge;
      throw new Error(`Anikoto: none of this episode's ${groups.length} server groups returned a playable stream`);
    }
    return videos;
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }

  async fetchWatchPage(mangaId) {
    const key = String(mangaId);
    const cached = this.watchCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return cached.promise;
    }
    const promise = this.text(`${SITE}/watch/${encodeURIComponent(key)}`).catch((err) => {
      this.watchCache.delete(key);
      throw err;
    });
    this.watchCache.set(key, { time: Date.now(), promise });
    return promise;
  }

  async loadEpisodes(mangaId) {
    const key = String(mangaId);
    const cached = this.episodeCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return cached.promise;
    }
    const promise = (async () => {
      const watchHtml = await this.fetchWatchPage(key);
      const $w = cheerio.load(watchHtml);
      const dataId = $w('#watch-main').attr('data-id') || $w('[data-id]').first().attr('data-id');
      if (!dataId) {
        throw new Error('Anikoto: could not find anime id on watch page');
      }
      const json = await this.json(`${SITE}/ajax/episode/list/${encodeURIComponent(dataId)}`, {
        Referer: `${SITE}/watch/${key}`,
        'X-Requested-With': 'XMLHttpRequest',
      });
      if (!json || typeof json.result !== 'string') {
        throw new Error('Anikoto: invalid episode list response');
      }
      const $ = cheerio.load(json.result);
      const episodes = [];
      const seen = new Set();
      $('a[data-ids]').each((_, el) => {
        const slug = String($(el).attr('data-slug') || $(el).attr('data-num') || $(el).attr('data-id') || '').trim();
        const dataIds = $(el).attr('data-ids');
        if (!slug || !dataIds || seen.has(slug)) return;
        seen.add(slug);
        const numRaw = parseFloat($(el).attr('data-num') || slug);
        const number = Number.isFinite(numRaw) ? numRaw : undefined;
        const label = $(el).attr('data-num') || slug;
        const rawTitle = $(el).find('span.d-title').text().trim();
        const named = rawTitle && !/^episode\s+[\d.]+$/i.test(rawTitle);
        const name = named ? `Episode ${label}: ${rawTitle}` : `Episode ${label}`;
        const ts = parseInt($(el).attr('data-timestamp') || '', 10);
        const time = Number.isFinite(ts) && ts > 0 ? ts * 1000 : undefined;
        episodes.push({
          id: slug,
          epId: String($(el).attr('data-id') || ''),
          name,
          number,
          time,
          dataIds,
        });
      });
      return episodes;
    })().catch((err) => {
      this.episodeCache.delete(key);
      throw err;
    });
    this.episodeCache.set(key, { time: Date.now(), promise });
    return promise;
  }

  async getFallbackHost() {
    if (this.fallbackHostPromise && Date.now() - this.fallbackHostTime < CACHE_TTL_MS) {
      return this.fallbackHostPromise;
    }
    this.fallbackHostTime = Date.now();
    this.fallbackHostPromise = this.json(`${PLAYER_ORIGIN}/lib/check_domain.json?cache_burst=${Date.now()}`, {
      Referer: `${PLAYER_ORIGIN}/`,
    })
      .then((d) => (d && typeof d.fallback === 'string' ? d.fallback.trim() : ''))
      .catch(() => '');
    return this.fallbackHostPromise;
  }

  async text(url, extraHeaders) {
    const headers = Object.assign({ 'User-Agent': UA, Accept: 'text/html,*/*' }, extraHeaders || {});
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers }));
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Anikoto: HTTP ${response.status}`);
    }
    return String(response.data);
  }

  async json(url, extraHeaders) {
    const headers = Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, extraHeaders || {});
    const response = await this.requests.schedule(App.createRequest({ url, method: 'GET', headers }));
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Anikoto: HTTP ${response.status}`);
    }
    return JSON.parse(response.data);
  }
}

module.exports = { Source };
