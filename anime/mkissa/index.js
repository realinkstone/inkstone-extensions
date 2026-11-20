const NAME = 'MKissa';
const SITE = 'https://mkissa.to';
const CLOCK = 'https://allanime.day/apivtwo/clock.json';
const APIS = ['https://api.mkissa.net/api', 'https://api.allanime.day/api'];
const IMAGE_PROXY = 'https://wp.youtube-anime.com/aln.youtube-anime.com/';
const PAGE = 100;
const MAX_PAGE = 100;
const API_GAP_MS = 1100;

const CARD = '_id name englishName thumbnail type status rating isAdult genres availableEpisodes';
const searchQuery = (fields) =>
  'query($search:SearchInput,$limit:Int,$page:Int,$translationType:VaildTranslationTypeEnumType,$countryOrigin:VaildCountryOriginEnumType)' +
  `{shows(search:$search,limit:$limit,page:$page,translationType:$translationType,countryOrigin:$countryOrigin){edges{${fields}}}}`;
const SEARCH_QUERY = searchQuery(CARD);
const IDS_ONLY_QUERY = searchQuery('_id');
const IDS_QUERY = `query($ids:[String!]!){showsWithIds(ids:$ids){${CARD}}}`;
const SHOW_QUERY =
  'query($id:String!){show(_id:$id){_id name englishName nativeName thumbnail description genres status type season rating isAdult score availableEpisodesDetail altNames airedStart studios}}';
const EPISODES_QUERY =
  'query($id:String!){episodeInfos(showId:$id,episodeNumStart:0,episodeNumEnd:9999){episodeIdNum notes thumbnails uploadDates vidInforssub}}';

const FEEDS = [
  { id: 'latest', name: 'Latest updates', sortBy: 'Latest_Update' },
  { id: 'top', name: 'Top rated', sortBy: 'Top' },
  { id: 'trending', name: 'Trending', sortBy: 'Trending', resolve: true },
];

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
  'Mecha', 'Music', 'Psychological', 'Isekai', 'School', 'Magic', 'Military', 'Historical', 'Super Power', 'Samurai', 'Vampire', 'Demons', 'Game',
  'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids', 'Parody', 'Space', 'Martial Arts', 'Police', 'Ecchi',
];

const LANGUAGES = [
  { key: 'sub', label: 'Sub' },
  { key: 'dub', label: 'Dub' },
  { key: 'raw', label: 'Raw' },
];

const HOOK = `(function () {
  var cap = window.__mkCap = { full: null, seen: 0 };
  function find(v, depth) {
    if (!v || typeof v !== 'object' || depth > 4) return null;
    if (v.episode && typeof v.episode === 'object' && v.episode.sourceUrls) return v.episode;
    var keys = Object.keys(v);
    for (var i = 0; i < keys.length && i < 12; i++) { var r = find(v[keys[i]], depth + 1); if (r) return r; }
    return null;
  }
  function grab(v) { try { var f = find(v, 0); if (f) cap.full = f; } catch (e) {} }
  var decode = TextDecoder.prototype.decode;
  TextDecoder.prototype.decode = function () {
    var text = decode.apply(this, arguments);
    try { if (text && text.length > 100 && text.indexOf('sourceUrls') >= 0) { cap.seen++; grab(JSON.parse(text)); } } catch (e) {}
    return text;
  };
  var parse = JSON.parse;
  JSON.parse = function () { var v = parse.apply(this, arguments); grab(v); return v; };
  var json = Response.prototype.json;
  Response.prototype.json = function () { return json.apply(this, arguments).then(function (v) { grab(v); return v; }); };
})();`;

function pageScript(showId, number, languages, waitMs) {
  return `(async function () {
  var showId = ${JSON.stringify(showId)}, number = ${JSON.stringify(number)}, langs = ${JSON.stringify(languages)};
  var limit = Date.now() + ${waitMs};
  function sleep(ms) {
    return new Promise(function (resolve) {
      var end = Date.now() + ms, done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      setTimeout(finish, ms);
      var ch = new MessageChannel();
      ch.port1.onmessage = function () { if (Date.now() >= end) finish(); else if (!done) ch.port2.postMessage(0); };
      ch.port2.postMessage(0);
    });
  }
  function checkShowing() {
    if (/just a moment|attention required|verify you are human/i.test(document.title || '')) return true;
    var d = document.querySelector('.captcha-overlay');
    if (d && !d.hasAttribute('inert') && d.getAttribute('aria-hidden') !== 'true' && getComputedStyle(d).visibility !== 'hidden') return true;
    return !!document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-form, .cf-turnstile');
  }
  try {
    while (Date.now() < limit && !(document.body && document.body.innerText.length > 300)) {
      if (checkShowing()) return __reportResult({ check: true });
      await sleep(200);
    }
    var out = {};
    for (var i = 0; i < langs.length; i++) {
      var lang = langs[i];
      window.__mkCap.full = null;
      var a = document.createElement('a');
      a.href = '/anime/' + showId + '/p-' + number + '-' + lang;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      while (Date.now() < limit) {
        var f = window.__mkCap.full;
        var pageId = f && f.pageStatus && f.pageStatus.pageId ? String(f.pageStatus.pageId) : '';
        if (f && String(f.episodeString) === number && (!pageId || pageId.indexOf('_' + lang + '_') >= 0)) {
          var info = f.episodeInfo && f.episodeInfo['vidInfors' + lang];
          out[lang] = { resolution: info && info.vidResolution ? info.vidResolution : null, sources: (f.sourceUrls || []).map(function (s) { return { name: s.sourceName, url: s.sourceUrl, type: s.type }; }) };
          break;
        }
        if (checkShowing()) return __reportResult({ check: true });
        await sleep(250);
      }
    }
    __reportResult(out);
  } catch (e) {
    __reportError(String(e && e.message || e));
  }
})();`;
}

function decodeProvider(hex) {
  const digits = String(hex || '').replace(/^--/, '');
  let out = '';
  for (let i = 0; i + 1 < digits.length; i += 2) out += String.fromCharCode(parseInt(digits.substr(i, 2), 16) ^ 56);
  return /^\/apivtwo\/clock\?id=[0-9a-f]+$/i.test(out) ? out : '';
}

function cleanText(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
}

const SUGGESTIVE_TITLE = /\b(hentai|erotic\w*|porn\w*|nsfw|xxx|sex(?:y|ual)?|nude|nudity|ecchi|lewd|futanari)\b/i;

function ageOf(show) {
  if (!show) return 0;
  const genres = Array.isArray(show.genres) ? show.genres.map((g) => cleanText(g).toLowerCase()) : [];
  const rating = cleanText(show.rating).toUpperCase();
  if (show.isAdult === true || rating === 'RX' || genres.indexOf('hentai') !== -1) return 18;
  if (rating === 'R+' || genres.indexOf('ecchi') !== -1 || genres.indexOf('erotica') !== -1) return 16;
  if (!rating && SUGGESTIVE_TITLE.test(`${cleanText(show.name)} ${cleanText(show.englishName)}`)) return 16;
  return 0;
}

function imageOf(path) {
  const text = cleanText(path);
  if (!text) return undefined;
  if (/^https?:\/\//.test(text)) return text;
  return `${IMAGE_PROXY}${text.replace(/^\/+/, '')}?w=300`;
}

function titleOf(show) {
  return cleanText(show.englishName) || cleanText(show.name);
}

function plainText(html) {
  const source = String(html === undefined || html === null ? '' : html).replace(/<br\s*\/?>/gi, '\n');
  const text = cheerio.load(`<div>${source}</div>`)('div').text();
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function timeOf(text) {
  const t = Date.parse(String(text || ''));
  return Number.isFinite(t) && t > 1e11 ? t : undefined;
}

function numbersOf(list) {
  return Array.isArray(list) ? list.map((n) => cleanText(n)).filter((n) => n && Number.isFinite(parseFloat(n))) : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function card(show) {
  if (!show || !show._id) return null;
  const title = titleOf(show);
  if (!title) return null;
  const out = {
    mangaId: String(show._id),
    title,
    medium: 'anime',
    webURL: `${SITE}/anime/${show._id}`,
    ageRating: ageOf(show),
  };
  const image = imageOf(show.thumbnail);
  if (image) out.image = image;
  return out;
}

class Source {
  constructor() {
    this.requests = App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } });
    this.api = 0;
    this.nextApi = 0;
    this.shows = new Map();
  }

  getSourceFeeds() {
    return FEEDS.map((f) => ({ id: f.id, name: f.name }));
  }

  async getSearchTags() {
    return GENRES.map((g) => ({ id: g, label: g }));
  }

  async gql(query, variables) {
    const body = JSON.stringify({ query, variables });
    let last = null;
    for (let i = 0; i < APIS.length; i++) {
      const index = (this.api + i) % APIS.length;
      for (let attempt = 0; attempt < 2; attempt++) {
        const at = Math.max(Date.now(), this.nextApi);
        this.nextApi = at + API_GAP_MS;
        if (at > Date.now()) await sleep(at - Date.now());
        let response;
        try {
          response = await this.requests.schedule(
            App.createRequest({ url: APIS[index], method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body }),
          );
        } catch (e) {
          if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
          last = e;
          break;
        }
        if (response.status >= 500 || response.status === 403) {
          last = new Error(`${NAME}: the API answered HTTP ${response.status}`);
          break;
        }
        let data;
        try {
          data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        } catch (e) {
          last = new Error(`${NAME}: the API did not answer JSON`);
          break;
        }
        const errors = data && Array.isArray(data.errors) ? data.errors : [];
        if (errors.length && /too many requests/i.test(String(errors[0].message))) {
          const stated = /in (\d+) seconds?/i.exec(String(errors[0].message));
          await sleep(Math.min(stated ? Number(stated[1]) : 3, 10) * 1000 + 500);
          last = new Error(`${NAME}: the API asked to slow down`);
          continue;
        }
        if (errors.length && !(data && data.data)) throw new Error(`${NAME}: ${cleanText(errors[0].message) || 'the API refused the request'}`);
        this.api = index;
        return (data && data.data) || {};
      }
    }
    throw last || new Error(`${NAME}: the API did not answer`);
  }

  show(id) {
    const key = String(id);
    const kept = this.shows.get(key);
    if (kept && Date.now() - kept.at < 600000) return kept.pending;
    const pending = this.gql(SHOW_QUERY, { id: key }).then((data) => {
      if (!data.show || !data.show._id) throw new Error(`${NAME}: title not found`);
      return data.show;
    });
    this.shows.set(key, { at: Date.now(), pending });
    pending.catch(() => {
      const now = this.shows.get(key);
      if (now && now.pending === pending) this.shows.delete(key);
    });
    return pending;
  }

  async getSearchResults(request, metadata) {
    const page = metadata && Number.isFinite(metadata.page) && metadata.page > 0 ? metadata.page : 1;
    if (page > MAX_PAGE) return { results: [] };
    const query = cleanText(request && request.title);
    const feed = FEEDS.find((f) => f.id === (request && request.feed)) || FEEDS[0];
    const included = Array.isArray(request && request.includedTags) ? request.includedTags : [];
    const tag = included.length ? cleanText(included[0] && (included[0].id || included[0])) : '';
    const search = { allowAdult: false, allowUnknown: false };
    if (query) search.query = query;
    else search.sortBy = feed.sortBy;
    if (tag) {
      if (GENRES.indexOf(tag) === -1) return { results: [] };
      search.genres = [tag];
    }
    const resolve = !query && feed.resolve === true;
    const data = await this.gql(resolve ? IDS_ONLY_QUERY : SEARCH_QUERY, { search, limit: PAGE, page, translationType: 'sub', countryOrigin: 'ALL' });
    let edges = data.shows && Array.isArray(data.shows.edges) ? data.shows.edges : [];
    const count = edges.length;
    if (resolve && count) {
      const order = edges.map((e) => e && e._id).filter(Boolean);
      const full = await this.gql(IDS_QUERY, { ids: order });
      const byId = new Map((Array.isArray(full.showsWithIds) ? full.showsWithIds : []).filter(Boolean).map((e) => [e._id, e]));
      edges = order.map((id) => byId.get(id)).filter(Boolean);
    }
    const results = [];
    const seen = new Set();
    edges.forEach((show) => {
      const c = card(show);
      if (c && !seen.has(c.mangaId)) {
        seen.add(c.mangaId);
        results.push(c);
      }
    });
    return count >= PAGE && page < MAX_PAGE ? { results, metadata: { page: page + 1 } } : { results };
  }

  async getMangaDetails(mangaId) {
    const show = await this.show(mangaId);
    const title = titleOf(show);
    if (!title) throw new Error(`${NAME}: title not found`);
    const status = /releasing/i.test(cleanText(show.status)) ? 'ONGOING' : /finished/i.test(cleanText(show.status)) ? 'COMPLETED' : 'UNKNOWN';
    const notes = [];
    if (show.score) notes.push(`Score ${show.score}`);
    if (cleanText(show.type)) notes.push(cleanText(show.type));
    if (cleanText(show.rating)) notes.push(cleanText(show.rating));
    const desc = [plainText(show.description), notes.join(', ')].filter(Boolean).join('\n\n');
    const info = {
      title,
      desc,
      status,
      completed: status === 'COMPLETED',
      tags: (Array.isArray(show.genres) ? show.genres : []).map(cleanText).filter(Boolean),
      webURL: `${SITE}/anime/${show._id}`,
      medium: 'anime',
      ageRating: ageOf(show),
    };
    const image = imageOf(show.thumbnail);
    if (image) info.image = image;
    const year = (show.season && show.season.year) || (show.airedStart && show.airedStart.year);
    if (year) info.releaseDate = String(year);
    const studios = (Array.isArray(show.studios) ? show.studios : []).map(cleanText).filter(Boolean);
    if (studios.length) info.author = studios.slice(0, 3).join(', ');
    const alts = (Array.isArray(show.altNames) ? show.altNames : []).map(cleanText).filter((a) => a && a !== title);
    if (alts.length) info.altTitles = alts.slice(0, 10);
    return { mangaInfo: info };
  }

  async getChapters(mangaId) {
    const show = await this.show(mangaId);
    const detail = show.availableEpisodesDetail || {};
    const all = new Set();
    LANGUAGES.forEach((l) => numbersOf(detail[l.key]).forEach((n) => all.add(n)));
    if (!all.size) throw new Error(`${NAME} has no episodes for this title yet`);
    const infos = new Map();
    try {
      const data = await this.gql(EPISODES_QUERY, { id: String(mangaId) });
      (Array.isArray(data.episodeInfos) ? data.episodeInfos : []).forEach((e) => {
        if (e && e.episodeIdNum !== undefined && e.episodeIdNum !== null) infos.set(String(Number(e.episodeIdNum)), e);
      });
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    }
    return Array.from(all)
      .sort((a, b) => parseFloat(b) - parseFloat(a))
      .map((n) => {
        const number = parseFloat(n);
        const info = infos.get(String(number)) || {};
        const title = cleanText(info.notes);
        const named = title && !/^episode\s+[\d.]+$/i.test(title) ? title : '';
        const out = { id: n, chapterId: n, name: named ? `Episode ${n}: ${named}` : `Episode ${n}`, number };
        if (named) out.title = named;
        const when = timeOf(info.uploadDates && (info.uploadDates.sub || info.uploadDates.dub));
        if (when !== undefined) out.time = when;
        const still = Array.isArray(info.thumbnails) ? cleanText(info.thumbnails[0]) : '';
        if (/^https:\/\//.test(still)) out.thumbnail = still;
        const seconds = info.vidInforssub && Number(info.vidInforssub.vidDuration);
        if (seconds > 0) out.duration = Math.round(seconds);
        return out;
      });
  }

  async readSources(showId, number, languages) {
    const titlePage = await this.requests.schedule(App.createRequest({ url: `${SITE}/anime/${showId}`, method: 'GET', headers: { Accept: 'text/html' } }));
    if (titlePage.status < 200 || titlePage.status >= 300) throw new Error(`${NAME}: HTTP ${titlePage.status} from the title page`);
    const html = String(titlePage.data);
    const at = html.search(/<head[^>]*>/i);
    const hooked = at >= 0 ? html.replace(/<head[^>]*>/i, (tag) => `${tag}<script>${HOOK}</script>`) : `<script>${HOOK}</script>${html}`;
    const run = async () =>
      App.executeInWebView({ html: hooked, baseUrl: `${SITE}/anime/${showId}`, script: pageScript(showId, number, languages, 40000), timeoutMs: 50000 });
    let result = await run();
    if (result && result.value && result.value.check) {
      await App.requestBrowserVerification({ url: `${SITE}/anime/${showId}/p-${number}-${languages[0]}` });
      result = await run();
    }
    if (!result || result.error) throw new Error(`${NAME}: ${(result && result.error) || 'the page did not answer'}`);
    const value = result.value || {};
    if (value.check) throw new Error(`${NAME} wants a security check before it shows this episode. Pass it in the verification page and try again.`);
    return value;
  }

  async entriesOf(found, language) {
    const label = language.label;
    const sources = found && Array.isArray(found.sources) ? found.sources : [];
    const videos = [];
    const tries = sources.filter((x) => x && typeof x.url === 'string' && x.url.indexOf('--') === 0).slice(0, 3);
    const clocks = await Promise.all(tries.map((x) => this.clock(x.url, label)));
    clocks.forEach((list) => list.forEach((v) => videos.push(v)));
    sources.forEach((x) => {
      if (!x || typeof x.url !== 'string' || !/^https:\/\//.test(x.url)) return;
      if (x.name === 'Yt-mp4') {
        const height = found.resolution ? `${found.resolution}p` : 'Auto';
        videos.push({ type: 'mp4', url: x.url, quality: `${height} ${label}`, server: NAME, headers: { Referer: `${SITE}/` } });
      } else if (/^https:\/\/(www\.)?ok\.ru\/videoembed\//.test(x.url)) {
        videos.push({ type: 'embed', url: x.url, quality: `Auto ${label}`, server: 'OK.ru' });
      } else if (/^https:\/\/(www\.)?mp4upload\.com\/embed-/.test(x.url)) {
        videos.push({ type: 'embed', url: x.url, quality: `Auto ${label}`, server: 'mp4upload' });
      }
    });
    return videos;
  }

  async clock(hex, label) {
    const path = decodeProvider(hex);
    if (!path) return [];
    try {
      const response = await this.requests.schedule(
        App.createRequest({ url: `${CLOCK}?${path.slice(path.indexOf('?') + 1)}`, method: 'GET', headers: { Accept: 'application/json', Referer: `${SITE}/` } }),
      );
      if (response.status < 200 || response.status >= 300) return [];
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      const links = data && Array.isArray(data.links) ? data.links : [];
      const out = [];
      for (const link of links.slice(0, 3)) {
        if (!link || typeof link.link !== 'string' || !/^https:\/\//.test(link.link)) continue;
        const headers = link.headers && typeof link.headers === 'object' ? link.headers : { Referer: `${SITE}/` };
        const probe = await this.requests.schedule(App.createRequest({ url: link.link, method: 'GET', headers: Object.assign({ Range: 'bytes=0-1023' }, headers) }));
        if (probe.status < 200 || probe.status >= 300) continue;
        if (link.hls === true) {
          if (String(probe.data).replace(/^\s+/, '').indexOf('#EXTM3U') !== 0) continue;
          out.push({ type: 'hls', url: link.link, quality: `Auto ${label}`, server: NAME, headers });
        } else {
          const res = parseInt(link.resolutionStr, 10);
          out.push({ type: 'mp4', url: link.link, quality: `${res > 0 ? res + 'p' : 'Auto'} ${label}`, server: NAME, headers });
        }
      }
      return out;
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      return [];
    }
  }

  watchPages(show, number, languages) {
    return languages.map((l) => ({ type: 'embed', url: `${SITE}/anime/${show._id}/p-${number}-${l.key}`, quality: `Auto ${l.label}`, server: NAME }));
  }

  async getVideos(mangaId, chapterId) {
    const show = await this.show(mangaId);
    const detail = show.availableEpisodesDetail || {};
    const number = cleanText(chapterId);
    const languages = LANGUAGES.filter((l) => numbersOf(detail[l.key]).indexOf(number) !== -1);
    if (!languages.length) throw new Error(`${NAME} has no stream for this episode yet`);
    let videos = [];
    try {
      const found = await this.readSources(show._id, number, languages.map((l) => l.key));
      for (const l of languages) videos = videos.concat(await this.entriesOf(found[l.key], l));
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
      videos = [];
    }
    if (videos.length) return videos;
    await this.preflight(`${SITE}/anime/${show._id}/p-${number}-${languages[0].key}`);
    return this.watchPages(show, number, languages);
  }

  async preflight(url) {
    try {
      await this.requests.schedule(App.createRequest({ url, method: 'GET', headers: { Accept: 'text/html' } }));
    } catch (e) {
      if (e && (e.kind === 'challenge' || e.kind === 'blocked')) throw e;
    }
  }

  async getChapterDetails(mangaId, chapterId) {
    return { id: chapterId, mangaId, pages: [] };
  }
}

module.exports = { Source };
