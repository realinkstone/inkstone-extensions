import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as cheerio from 'cheerio/slim';

const [file, searchTerm] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node test-extension.mjs <path/to/index.js> [search term]');
  process.exit(1);
}

const tally = { pass: 0, fail: 0, warn: 0 };
const say = (kind, label, detail = '') => {
  tally[kind]++;
  console.log(`${kind.toUpperCase().padEnd(4)}  ${label}${detail ? `  (${detail})` : ''}`);
  return kind === 'pass';
};
const check = (ok, label, detail) => say(ok ? 'pass' : 'fail', label, detail);
let warnedRating = false;
const warnIgnoredRating = (what) => {
  if (warnedRating) return;
  warnedRating = true;
  say('warn', `${what} set contentRating, which Boundless ignores`, 'to rate titles one by one, set ageRating to a minimum age such as 0, 16 or 18');
};
let skippedInApp = false;
const shapeWarned = new Set();
const finish = () => {
  console.log(`\n${tally.pass} passed, ${tally.fail} failed, ${tally.warn} warnings.`);
  if (tally.fail) console.log('Not ready yet.');
  else if (skippedInApp) console.log('No problems found. The parts that need Boundless were skipped, so try those in the app.');
  else console.log('Compatible, and it fetches real results.');
  process.exit(tally.fail ? 1 : 0);
};
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
const pickQuery = (title) => {
  const parts = String(title ?? '').split(/[^\p{L}\p{N}]+/u).filter((w) => [...w].length >= 3);
  const first = parts[0] ?? String(title ?? '').trim();
  return /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(first) ? [...first].slice(0, 4).join('') : first;
};
const gated = (chapter) => /\b(locked|paid|premium|join to read|early access|coins?)\b/i.test(chapter.name ?? '');

const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const withAppAgent = (headers) => {
  const given = headers && typeof headers === 'object' ? headers : {};
  return Object.keys(given).some((k) => k.toLowerCase() === 'user-agent') ? given : { 'User-Agent': APP_UA, ...given };
};
const botCheckKind = (status, headers, text) => {
  const head = String(text).slice(0, 4096).toLowerCase();
  if (headers.get('cf-mitigated') === 'challenge' || ((status === 403 || status === 503) && /just a moment|cf-turnstile|challenges\.cloudflare\.com/.test(head))) return 'Cloudflare';
  if (/browser verification/.test(head) && /challenge-assets|powblock/.test(head)) return 'browser verification page';
  if (status === 403 && /bot challenge not passed/.test(head)) return 'bot check refusal';
  return null;
};
const botCheckHint = (c) =>
  c.kind === 'Cloudflare'
    ? `${c.host} answered a Cloudflare check (HTTP ${c.status}). Boundless clears those in its web view, so try this part in the app`
    : `${c.host} answered a bot check (${c.kind}, HTTP ${c.status}). With no User-Agent set Boundless sends its web view's browser agent, and this site sends that to its check. Try a plain User-Agent such as "Boundless/1.0 (+https://boundless.moe)", or fall back to one when this page comes back`;
const statuses = {};
const botChecks = [];
const reportedChecks = new Set();
let lastCheck = null;
let declaredLimit = false;

const requests = [];
const App = {
  createRequestManager: (options = {}) => {
    const limit = options.rateLimit ?? {};
    if (limit.requestsPerSecond > 0 || limit.requestsPerMinute > 0) declaredLimit = true;
    const gaps = [limit.requestsPerSecond > 0 ? 1000 / limit.requestsPerSecond : 0, limit.requestsPerMinute > 0 ? 60000 / limit.requestsPerMinute : 0];
    const gap = Math.max(...gaps);
    let nextSlot = 0;
    return {
    async schedule(request) {
      if (gap > 0) {
        const wait = Math.max(0, nextSlot - Date.now());
        nextSlot = Math.max(nextSlot, Date.now()) + gap;
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      const host = new URL(request.url).hostname;
      requests.push(host);
      let res;
      try {
        res = await fetch(request.url, {
          method: request.method || 'GET',
          headers: withAppAgent(request.headers),
          body: request.body,
        });
      } catch (error) {
        throw new Error(`network error: ${error.cause?.code ?? error.cause?.message ?? error.message}`);
      }
      const data = await res.text();
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      const kind = botCheckKind(res.status, res.headers, data);
      if (kind) {
        lastCheck = { host, kind, status: res.status };
        if (!botChecks.some((c) => c.host === host && c.kind === kind)) botChecks.push(lastCheck);
      }
      return { status: res.status, headers: Object.fromEntries(res.headers), data };
    },
    };
  },
  createRequest: (options) => options,
  getSourceSetting: () => undefined,
  createSourceStateManager: () => {
    const saved = new Map();
    return { store: async (k, v) => void saved.set(k, v), retrieve: async (k) => saved.get(k) };
  },
  base64Encode: (s) => Buffer.from(s).toString('base64'),
  base64Decode: (s) => Buffer.from(s, 'base64').toString(),
  executeInWebView: async () => {
    throw new Error('App.executeInWebView only works inside Boundless. Test that part in the app.');
  },
  requestBrowserVerification: async () => {
    throw new Error('App.requestBrowserVerification only works inside Boundless. Test that part in the app.');
  },
  descrambleImage: async () => ({ error: 'App.descrambleImage only works inside Boundless. Test that part in the app.' }),
};

const code = readFileSync(file, 'utf8');

console.log('Compatibility (no network)\n');

const banned = ['fetch', 'XMLHttpRequest', 'URL', 'URLSearchParams', 'setInterval', 'btoa', 'TextEncoder', 'TextDecoder', 'Buffer', 'document', 'DOMParser', 'structuredClone', 'require'];
const engineDiffers = [
  ['Intl', /(^|[^\w.$])Intl\b/, 'Intl does not exist on Android'],
  ['toLocale...String()', /\.toLocale(Date|Time)?String\s*\(/, 'gives different text on iPhone and Android'],
  ['WeakRef', /(^|[^\w.$])WeakRef\b/, 'only exists on iPhone and Mac'],
  ['queueMicrotask', /(^|[^\w.$])queueMicrotask\s*\(/, 'exists on neither'],
];
const hits = [];
const engineHits = [];
code.split('\n').forEach((line, i) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  for (const name of banned) {
    if (new RegExp(`(^|[^\\w.$])${name}\\s*[(.]|new ${name}\\b`).test(line)) hits.push(`${name} on line ${i + 1}`);
  }
  for (const [name, pattern, why] of engineDiffers) {
    if (pattern.test(line)) engineHits.push(`${name} on line ${i + 1} (${why})`);
  }
});
if (hits.length) {
  say('warn', 'uses something Boundless does not provide', `${hits.slice(0, 4).join(', ')}. Fine inside a string for a WebView script, a bug anywhere else`);
} else {
  say('pass', 'no fetch, URL, btoa, document or require in the code');
}
if (engineHits.length) {
  say('warn', 'uses something that differs between the engines Boundless runs on', `${engineHits.slice(0, 3).join(', ')}. Format numbers and dates yourself`);
}
const usesWebView = code.includes('executeInWebView');
if (usesWebView) {
  say('warn', 'uses App.executeInWebView, which only runs inside Boundless. Test that part in the app');
}

let CryptoJS;
try {
  CryptoJS = (await import('crypto-js')).default;
} catch {
  CryptoJS = undefined;
}
const atob = (input) => Buffer.from(String(input).replace(/[^A-Za-z0-9+/]/g, ''), 'base64').toString('latin1');
const sandbox = { module: { exports: {} }, App, cheerio, ...(CryptoJS ? { CryptoJS } : {}), console, setTimeout, clearTimeout, atob };
sandbox.exports = sandbox.module.exports;
try {
  vm.runInNewContext(code, sandbox, { filename: file });
  say('pass', 'loads without errors in a bare Boundless-style sandbox');
} catch (error) {
  check(false, 'loads without errors in a bare Boundless-style sandbox', error.message);
  finish();
}
const Source = sandbox.module.exports.Source;
if (!check(typeof Source === 'function', 'exports a Source class', 'module.exports = { Source }')) finish();
// Sumizuri's engine has no atob (its 0.2.0 source defines one only while cheerio loads, then deletes it); Boundless has one. A bare atob call throws in Sumizuri,
// and a source that catches that returns nothing, so the failure looks like an empty site.
if (!/typeof\s+atob/.test(code) && /(^|[^.\w$])atob\s*\(/.test(code.split('\n').filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).join('\n'))) {
  say('warn', 'calls atob, which Sumizuri does not have', 'use App.base64Decode(text), which both apps have (it reads UTF-8 text and throws on other bytes; guard a bare atob with typeof atob === "function")');
}
const source = new Source();

// The player pages the Boundless Player opens itself (docs/design/video-embeds.md in its repo, 2026-11-05).
const EMBED_HOSTS = ['dailymotion.com', 'dai.ly', 'rumble.com', 'ok.ru', 'mp4upload.com', 'morencius.com', 'vidhide.com', 'earnvids.com', 'vidmoly.org', 'vidmoly.biz', 'vidmoly.net', 'streamtape.com', 'streamtape.to', 'streamtape.net', 'streamtape.xyz', 'streamta.pe', 'mixdrop.top', 'mixdrop.ag', 'mixdrop.to', 'mixdrop.co', 'mixdrop.ps', 'mixdrop.si', 'mixdrop.bz', 'mixdrop.ch', 'mixdrop.cv', 'mxdrop.click'];
const sniffed = new Set();
const warnSniffer = (host) => {
  if (sniffed.has(host)) return;
  sniffed.add(host);
  say('warn', `${host} has no resolver in the app, so its embed entry goes through the page sniffer`, 'fine for a player the site owns: the page host must be in hosts, and a player that needs a click, DRM, a captcha or a login will not open');
};
const anime = typeof source.getVideos === 'function';
for (const method of ['getSearchResults', 'getMangaDetails', 'getChapters', anime ? 'getVideos' : 'getChapterDetails']) {
  check(typeof source[method] === 'function', `has ${method}()`);
}

let feeds = [];
if (typeof source.getSourceFeeds === 'function') {
  const returned = source.getSourceFeeds();
  check(!(returned && typeof returned.then === 'function'), 'getSourceFeeds() is synchronous, not async');
  feeds = Array.isArray(returned) ? returned : [];
  check(feeds.every((f) => f.name && f.id !== undefined && f.id !== null), 'every feed has an id and a name', `${feeds.length} feeds`);
  if (feeds.some((f) => f.id === '')) say('warn', 'a feed has an empty id', 'it can work as the default feed, but a named id is safer');
}

const folder = path.resolve(path.dirname(file));
const listPath = [path.dirname(folder), path.dirname(path.dirname(folder))].map((dir) => path.join(dir, 'versioning.json')).find((candidate) => existsSync(candidate)) ?? path.join(path.dirname(folder), 'versioning.json');
let entry;
if (existsSync(listPath)) {
  const listing = JSON.parse(readFileSync(listPath, 'utf8'));
  entry = listing.sources?.find((s) => s.id === path.basename(folder));
  if (check(entry, 'has an entry in versioning.json', `id "${path.basename(folder)}"`)) {
    check(entry.name && /^\d+\.\d+\.\d+/.test(entry.version ?? ''), 'entry has a name and a version like 1.0.0');
    check(['comics', 'novel', 'both', 'anime'].includes(entry.medium), 'medium is comics, novel, both or anime', entry.medium);
    check((entry.medium === 'anime') === anime, 'an anime source has getVideos, and only an anime source', entry.medium);
    const typeFolder = path.basename(path.dirname(folder));
    // A video source has the medium "anime" whatever it shows; the first word of its description (Anime, Donghua, Drama, Western) picks the folder.
    const videoFolder = String(entry.description ?? '').split('\n')[0].split('・')[0].trim().toLowerCase();
    const wantedFolder = entry.medium === 'anime' ? (['anime', 'donghua', 'drama', 'western'].includes(videoFolder) ? videoFolder : 'anime') : { comics: 'comics', novel: 'novels', both: 'mixed' }[entry.medium];
    if (['comics', 'novels', 'mixed', 'anime', 'donghua', 'drama', 'western'].includes(typeFolder)) {
      check(typeFolder === wantedFolder, 'sits in the folder for its medium', `${typeFolder}/ holds it, ${wantedFolder}/ fits "${entry.medium}"`);
      const commentLines = code.split('\n').filter((line) => /^\s*(\/\/|\/\*|\*\/|\*\s)/.test(line)).length;
      if (commentLines) say('warn', `${commentLines} comment lines in a file that sits in the repository layout`, 'the repository holds extensions without comments (keep your commented copy elsewhere)');
    }
    check(['safe', 'mature', 'adult'].includes(entry.contentRating), 'contentRating is safe, mature or adult', entry.contentRating);
    check(isUrl(entry.website), 'website is a full URL');
    check(/^[a-z]{2,3}$/.test(entry.language ?? ''), 'language is a short code like en', entry.language);
    check(entry.description && entry.capabilities?.length, 'has a description and capabilities');
    if ((entry.description ?? '').length > 300) say('warn', 'description is long', `${entry.description.length} characters: keep the short shape (a line of types, a Catalog line, a Restrictions list) and put the rest in the file header and your report`);
    // The Catalog line is rounded down to one significant digit with a plus (300+, 1,000+, 20,000+), never a measured count.
    const catalog = /Catalog・([\d,]+)\+/.exec(entry.description ?? '');
    if (catalog) {
      const digits = catalog[1].replace(/,/g, '');
      if (digits.replace(/0+$/, '').length > 1) say('warn', 'Catalog is not rounded down to one significant digit', `${catalog[1]}+ should read ${(Number(digits[0]) * 10 ** (digits.length - 1)).toLocaleString('en-US')}+`);
    }
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (entry.sha256) check(entry.sha256 === digest, 'sha256 matches the file', entry.sha256 === digest ? '' : 'run shasum -a 256 and update it');
    else say('warn', 'no sha256 yet', `shasum -a 256 gives ${digest.slice(0, 12)}...`);
  }
} else {
  say('warn', 'no versioning.json one or two folders up, so the listing checks were skipped');
}

console.log('\nLive results (real requests to the site)');
console.log('Requests that set no User-Agent are sent with an iPhone web view agent, as Boundless sends them.\n');

const withTimeout = (promise, ms = 60000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);
async function step(label, run) {
  const started = Date.now();
  lastCheck = null;
  try {
    const value = await withTimeout(run());
    return { value, took: `${((Date.now() - started) / 1000).toFixed(1)}s` };
  } catch (error) {
    const message = String(error.message ?? error);
    if (message.includes('only works inside Boundless')) {
      skippedInApp = true;
      say('warn', `${label} needs Boundless, so it was skipped`);
    } else if (lastCheck?.kind === 'Cloudflare') {
      skippedInApp = true;
      reportedChecks.add(`${lastCheck.host}|${lastCheck.kind}`);
      say('warn', `${label} hit a Cloudflare check, so it was skipped`, botCheckHint(lastCheck));
    } else if (lastCheck) {
      reportedChecks.add(`${lastCheck.host}|${lastCheck.kind}`);
      say('fail', label, `${message.slice(0, 120)} | ${botCheckHint(lastCheck)}`);
    } else {
      say('fail', label, message.slice(0, 200));
    }
    return null;
  }
}

const browseRequest = { feed: feeds[0]?.id ?? 'recent' };
const typeProblem = (m) => {
  for (const key of ['title', 'image', 'author', 'status', 'publisher', 'medium', 'volumesId', 'desc', 'summary']) {
    if (m[key] !== undefined && m[key] !== null && typeof m[key] !== 'string') return `${key} is ${typeof m[key]}, the app needs text`;
  }
  for (const key of ['ageRating', 'rating', 'chapters']) {
    if (m[key] !== undefined && m[key] !== null && typeof m[key] !== 'number') return `${key} is ${typeof m[key]}, the app needs a number`;
  }
  if (m.completed !== undefined && m.completed !== null && typeof m.completed !== 'boolean') return 'completed is not true or false';
  if (m.tags !== undefined && m.tags !== null && !Array.isArray(m.tags)) return 'tags is not a list';
  return null;
};
const imageHeaders = (item) => {
  const given = { ...(item && item.headers && typeof item.headers === 'object' ? item.headers : {}) };
  if (item && typeof item.referer === 'string' && item.referer && !Object.keys(given).some((k) => k.toLowerCase() === 'referer')) given.Referer = item.referer;
  return withAppAgent(given);
};
async function loadImage(url, headers) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 30000);
  try {
    const res = await fetch(url, { headers, signal: control.signal });
    const type = res.headers.get('content-type') ?? '';
    let bytes = Number(res.headers.get('content-length')) || 0;
    let text = '';
    if (!res.ok) {
      text = (await res.text()).slice(0, 4096);
    } else if (!bytes) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 2e6) {
          await reader.cancel();
          break;
        }
      }
    } else {
      await res.body?.cancel();
    }
    return { status: res.status, type, bytes, text, kind: botCheckKind(res.status, res.headers, text) };
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'timed out after 30s' : (error.cause?.code ?? error.message) };
  } finally {
    clearTimeout(timer);
  }
}
async function checkImage(what, url, headers, { cover = false } = {}) {
  const shot = await loadImage(url, headers);
  const host = new URL(url).hostname;
  if (shot.error) return check(false, `${what} loads`, `${host}: ${shot.error}`);
  if (shot.kind === 'Cloudflare') {
    // An image host can answer the check only to requests with no Referer (AnimeXin: 403 without the site's address, 200 with it).
    // That is a bug in the extension, not a check for the app to clear: the app sends only the headers the result carries.
    const sentReferer = Object.keys(headers ?? {}).some((k) => k.toLowerCase() === 'referer');
    let site = '';
    try {
      site = new URL(entry?.website ?? '').origin;
    } catch {
      site = '';
    }
    if (!sentReferer && site) {
      const again = await loadImage(url, { ...headers, Referer: `${site}/` });
      if (!again.error && again.status >= 200 && again.status < 300 && /^image\//i.test(again.type)) {
        return check(false, `${what} needs the site's Referer`, `${host} answers a Cloudflare check without one and the image with Referer ${site}/. Set referer: '${site}/' on every result and on the details that carry this image (the app sends only the headers you return)`);
      }
    }
    skippedInApp = true;
    return say('warn', `${what} hit a Cloudflare check, so it was skipped`, botCheckHint({ host, kind: shot.kind, status: shot.status }));
  }
  const isImage = /^image\//i.test(shot.type) || /^application\/octet-stream/i.test(shot.type);
  if (shot.status < 200 || shot.status >= 300 || !isImage) {
    const said = shot.text ? ` "${shot.text.replace(/\s+/g, ' ').slice(0, 60)}"` : '';
    return check(false, `${what} loads`, `${host} answered HTTP ${shot.status} ${shot.type || 'with no type'}${said}. Boundless sends only the headers you return, plus a browser User-Agent when you set none, so return a referer or headers that work, or a plain User-Agent`);
  }
  const kb = Math.round(shot.bytes / 1024);
  check(true, `${what} loads`, `${kb}${shot.bytes > 2e6 ? '+' : ''} KB ${shot.type.split(';')[0] || 'image'}`);
  if (cover && shot.bytes > 300000) say('warn', `${what} is ${kb} KB`, 'a browse grid shows dozens of covers at once, so use a thumbnail size if the site has one');
  return true;
}

const browse = await step('browse', () => source.getSearchResults(browseRequest, undefined));
if (browse) {
  const list = browse.value.results ?? [];
  if (usesWebView && list.length === 0) say('warn', 'browse returned nothing, expected if it needs Boundless (WebView)');
  else check(list.length > 0, 'browse returns titles', `${list.length} results in ${browse.took}`);
  check(list.every((r) => r.mangaId && r.title), 'every title has a mangaId and a title');
  const badType = list.map(typeProblem).find(Boolean);
  check(!badType, 'every title has the field types the app reads', badType ? `${badType}: the app drops the title` : 'a wrong type makes the app drop the title');
  const metadata = browse.value.metadata;
  check(metadata === undefined || metadata === null || (typeof metadata === 'object' && !Array.isArray(metadata)), 'metadata is an object, or nothing', 'the app rejects the whole page for any other value');
  check(list.every((r) => isUrl(r.image)), 'every cover is an absolute URL in "image"');
  const withCover = list.find((r) => isUrl(r.image));
  if (withCover) await checkImage('first cover', withCover.image, imageHeaders(withCover), { cover: true });
  if (list.some((r) => r.contentRating !== undefined && r.ageRating === undefined)) warnIgnoredRating('titles');
  if (list.some((r) => r.ageRating !== undefined)) {
    check(list.every((r) => r.ageRating === undefined || typeof r.ageRating === 'number'), 'ageRating is a number, a minimum age such as 0, 16 or 18');
  }
  if (browse.value.metadata) {
    const next = await step('browse page 2', () => source.getSearchResults(browseRequest, browse.value.metadata));
    if (next) check(next.value.results?.[0]?.mangaId !== list[0]?.mangaId, 'page 2 differs from page 1');
    if (next?.value.metadata && next.value.results?.length) {
      const third = await step('browse page 3', () => source.getSearchResults(browseRequest, next.value.metadata));
      if (third && third.value.results?.length) check(third.value.results[0].mangaId !== next.value.results[0].mangaId, 'page 3 differs from page 2', 'a pager that sends the same page again never ends');
    }
  }
  if (!declaredLimit && !usesWebView) {
    const before = statuses[429] ?? 0;
    await Promise.allSettled(Array.from({ length: 5 }, () => withTimeout(source.getSearchResults(browseRequest, undefined))));
    const throttled = (statuses[429] ?? 0) - before;
    if (throttled) say('warn', `the site answered 429 to ${throttled} of 5 requests sent at once`, 'declare a rateLimit in App.createRequestManager (see the guide)');
    else say('pass', 'five requests at once were not throttled', 'so no rateLimit is needed');
  }
  for (const feed of feeds.slice(1, 6)) {
    const other = await step(`feed "${feed.name}"`, () => source.getSearchResults({ feed: feed.id }, undefined));
    if (!other) continue;
    const count = other.value.results?.length ?? 0;
    if (usesWebView && count === 0) say('warn', `feed "${feed.name}" returned nothing, expected if it needs Boundless (WebView)`);
    else check(count > 0, `feed "${feed.name}" returns titles`, `${count} results in ${other.took}`);
  }
}

let genreCount = null;
if (typeof source.getSearchTags === 'function') {
  const tags = await step('genre list', () => source.getSearchTags());
  if (tags) {
    genreCount = tags.value.length;
    if (genreCount === 0) say('warn', 'genre list is empty', 'fine if the site has no working genre filter, but then do not declare "genres"');
    else if (tags.value.some((t) => Array.isArray(t.tags))) say('warn', 'genre list is grouped into sections', 'Boundless reads flat { id, label } entries, so return a flat list');
    else check(tags.value.every((t) => t.id && t.label), 'genre list has ids and labels', `${genreCount} genres`);
    const usable = tags.value.find((t) => t && t.id);
    if (usable) {
      const filtered = await step('browse filtered by a genre', () => source.getSearchResults({ feed: 'recent', includedTags: [{ id: usable.id, label: usable.id }] }, undefined));
      if (filtered) check(Array.isArray(filtered.value?.results), 'a genre filter returns a list', `genre "${usable.id}", ${filtered.value?.results?.length ?? 0} results`);
    }
  }
}

const query = searchTerm || pickQuery(browse?.value.results?.[0]?.title) || 'a';
const found = await step(`search "${query}"`, () => source.getSearchResults({ title: query, feed: 'recent' }, undefined));
if (found) {
  const count = found.value.results?.length ?? 0;
  if (usesWebView && count === 0) say('warn', `search "${query}" returned nothing, expected if it needs Boundless (WebView)`);
  else check(count > 0, `search "${query}" returns titles`, `${count} results in ${found.took}`);
}

const nothing = await step('search for a word that matches nothing', () => source.getSearchResults({ title: 'zzqxkvjwpl', feed: 'recent' }, undefined));
if (nothing) {
  const empty = nothing.value?.results;
  check(Array.isArray(empty), 'a search that matches nothing returns a list, not an error', 'some sites answer 404 for no match: treat that as an empty list');
  if (Array.isArray(empty) && empty.length > 0) say('warn', `a nonsense search still returned ${empty.length} titles`, 'fine if the site does fuzzy matching, a bug if the query is being ignored (check the parameter name)');
}

const seenStatuses = [];
let pageChecked = false;
for (const item of (found?.value.results ?? []).slice(0, 2)) {
  console.log(`\n${item.title}`);
  const details = await step('details', () => source.getMangaDetails(item.mangaId));
  if (details) {
    const info = details.value.mangaInfo;
    check(info && (info.desc !== undefined || info.summary !== undefined), 'details have a description (desc or summary)', details.took);
    check(['ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED', 'UNKNOWN'].includes(info?.status), 'status is an allowed value', info?.status);
    seenStatuses.push(info?.status);
    if (info && info.image !== undefined && info.image !== null) check(isUrl(info.image), 'the cover in details is an absolute URL');
    check([info?.title, info?.author, info?.desc, info?.summary].every((v) => v === undefined || v === null || typeof v === 'string'), 'title, author and description are plain strings', 'join several author names into one string, the app throws on a list');
    if (info && info.contentRating !== undefined && info.ageRating === undefined) warnIgnoredRating('details');
  }
  const chapters = await step('chapters', () => source.getChapters(item.mangaId));
  if (!chapters) continue;
  const list = chapters.value ?? [];
  check(list.length > 0, 'chapter list is not empty', `${list.length} chapters in ${chapters.took}`);
  check(list.every((c) => c.id), 'every chapter has an id');
  check(list.every((c) => c.time === undefined || c.time > 1e11), 'chapter times are in milliseconds');
  check(new Set(list.map((c) => String(c.id))).size === list.length, 'every chapter id is unique', 'a chapter that appears on two pages of the site should be listed once');
  const wrongType = (v, type) => v !== undefined && v !== null && typeof v !== type;
  check(
    list.every((c) => !wrongType(c.name, 'string') && !wrongType(c.group, 'string') && !wrongType(c.volume, 'string') && !wrongType(c.number, 'number') && !wrongType(c.time, 'number')),
    'chapter fields have the types Boundless casts to',
    'name, group and volume are strings; number and time are numbers, not "12"',
  );
  const tryPlay = async (chapter, label, started) => {
    const videos = await withTimeout(source.getVideos(item.mangaId, chapter.id));
    if (!Array.isArray(videos) || videos.length === 0 || !videos.every((v) => isUrl(v.url))) return { ok: false, label, detail: 'getVideos gave no video with a full URL' };
    // An entry of type 'embed' is a player page the Boundless Player opens itself: it is checked on its shape, never fetched as a stream.
    const embeds = videos.filter((v) => v.type === 'embed');
    const streams = videos.filter((v) => v.type !== 'embed');
    const first = streams[0] ?? embeds[0];
    let answer = { ok: true, status: 'embed' };
    let plays = true;
    if (streams.length) {
      answer = await withTimeout(fetch(first.url, { headers: first.headers ?? {} }), 30000);
      const body = answer.ok ? await answer.text() : '';
      plays = answer.ok && (body.startsWith('#EXTM3U') || (answer.headers.get('content-type') ?? '').startsWith('video/'));
    }
    const subtitles = (first.subtitles ?? []).length;
    const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
    const skip = first.intro ? `, intro ${Math.round(first.intro.start / 1000)}s to ${Math.round(first.intro.end / 1000)}s` : '';
    const problems = [];
    for (const video of videos) {
      const quality = video.quality === undefined ? 'a video' : `"${video.quality}"`;
      if (video.quality !== undefined && typeof video.quality !== 'string') problems.push(`${quality}: quality is not a string`);
      if (video.server !== undefined && (typeof video.server !== 'string' || !video.server.trim())) problems.push(`${quality}: server must be a short non empty string`);
      if (video.type === 'embed') {
        const host = (() => { try { return new URL(video.url).hostname; } catch { return ''; } })();
        if (!/^https?:\/\//i.test(video.url)) problems.push(`${quality}: an embed entry needs a full http or https page address`);
        else if (!EMBED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) warnSniffer(host);
      }
      if (video.headers !== undefined && (typeof video.headers !== 'object' || video.headers === null || Object.values(video.headers).some((v) => typeof v !== 'string'))) problems.push(`${quality}: headers must be an object of strings`);
      for (const kind of ['subtitles', 'audio']) {
        if (video[kind] === undefined) continue;
        if (!Array.isArray(video[kind])) problems.push(`${quality}: ${kind} must be a list`);
        else if (video[kind].some((track) => !track || !isUrl(track.url))) problems.push(`${quality}: a ${kind} track has no full URL`);
      }
      for (const kind of ['intro', 'outro']) {
        const range = video[kind];
        if (range !== undefined && !(range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)) problems.push(`${quality}: ${kind} needs numbers start and end in milliseconds, with end after start`);
      }
    }
    const embedNote = embeds.length ? `, ${embeds.length} embed ${embeds.length === 1 ? 'entry' : 'entries'} the app opens (not run here)` : '';
    return { ok: plays, label, problems, detail: plays ? `${videos.length} video${embedNote}, ${subtitles} subtitle tracks${skip}, in ${took}` : `the stream answered ${answer.status}` };
  };
  const tryOpen = async (chapter) => {
    const label = `chapter "${chapter.name ?? chapter.id}"`;
    const started = Date.now();
    try {
      if (anime) return await tryPlay(chapter, label, started);
      const read = await withTimeout(source.getChapterDetails(item.mangaId, chapter.id));
      const isText = Array.isArray(read.pages) && read.pages.length === 0 && typeof read.text === 'string' && read.text.trim().length > 0;
      if (Array.isArray(read.pages) && read.pages.length === 0 && Array.isArray(read.text)) {
        return { ok: false, label, detail: 'text is an array; the app casts text to a string and throws, so join the paragraphs with a blank line' };
      }
      if (read.book !== undefined && read.book !== null) {
        const book = read.book;
        const headersOk = book.headers === undefined || book.headers === null || (typeof book.headers === 'object' && !Array.isArray(book.headers) && Object.values(book.headers).every((v) => typeof v === 'string'));
        const shapeOk = typeof book === 'object' && !Array.isArray(book) && /^https?:\/\//i.test(String(book.url ?? '')) && headersOk;
        if (!shapeOk) return { ok: false, label, detail: 'book must be { url: "https://...", headers?: { name: "text" } }; the app ignores a book that has no http or https url' };
        return { ok: true, label, detail: `a book file on ${new URL(book.url).host}, which this script does not download (the app reads an EPUB or MOBI as text and draws a PDF)` };
      }
      const isImages = read.pages?.length > 0 && read.pages.every(isUrl);
      const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      return { ok: Boolean(isText || isImages), label, detail: isText ? 'text' : `${read.pages?.length ?? 0} pages in ${took}`, images: isImages ? read.pages : undefined, headers: read.headers, referer: read.referer };
    } catch (error) {
      const message = String(error.message ?? error);
      if (message.includes('only works inside Boundless')) return { skipped: true, label, detail: message };
      return { ok: false, label, detail: message.slice(0, 200) };
    }
  };
  const readable = list.filter((c) => !gated(c));
  if (readable.length && readable.length < list.length) say('warn', `${list.length - readable.length} locked or paid chapters were skipped`, 'timed locks should end in "(Locked, unlocks in 5h 3m)" so the app shows a countdown');
  const pool = readable.length ? readable : list;
  const attempts = [];
  for (const chapter of pool.slice(0, 4)) {
    attempts.push(await tryOpen(chapter));
    if (attempts.at(-1).ok || attempts.at(-1).skipped) break;
  }
  if (attempts.length === 0) continue;
  const [first] = attempts;
  const opened = attempts.at(-1);
  if (first.skipped) {
    skippedInApp = true;
    say('warn', 'opening a chapter needs Boundless, so it was skipped');
    continue;
  }
  if (first.ok) {
    say('pass', `${first.label} opens`, first.detail);
    for (const problem of first.problems ?? []) {
      if (shapeWarned.has(problem)) continue;
      shapeWarned.add(problem);
      say('warn', 'a video has a field Sumizuri would drop', problem);
    }
  } else if (opened.ok) {
    say('warn', `${first.label} did not open (${first.detail}), maybe locked or not published yet`);
    say('pass', `${opened.label} opens`, opened.detail);
  } else {
    say('fail', `none of the ${attempts.length} newest chapters opened`, `${first.label}: ${first.detail}`);
  }
  const readable1 = first.ok ? first : opened.ok ? opened : null;
  if (readable1?.images && !pageChecked) {
    pageChecked = true;
    await checkImage('first page image', readable1.images[0], imageHeaders({ headers: readable1.headers, referer: readable1.referer }));
  }
  if (pool.length > 1) {
    const oldest = await tryOpen(pool.at(-1));
    check(oldest.ok, `${oldest.label} opens`, oldest.detail);
  }
}

if (seenStatuses.length >= 2 && seenStatuses.every((v) => v === 'UNKNOWN')) {
  say('warn', `status is UNKNOWN on all ${seenStatuses.length} titles checked`, 'fine if the site shows no status, otherwise check the wording and accents the mapping matches (a site can say "Publicándose", "En cours" or "連載中")');
}

if (entry && genreCount !== null && browse && !usesWebView) {
  const declares = entry.capabilities?.includes('genres');
  if (declares && genreCount === 0) say('fail', 'declares "genres" in versioning.json but the genre list is empty');
  if (!declares && genreCount > 0) say('warn', 'has a working genre list but versioning.json does not declare "genres"');
}

const hostsUsed = [...new Set(requests)];
console.log(`\nMade ${requests.length} requests to ${hostsUsed.join(', ') || 'nothing'}.`);
if (entry?.hosts?.length) {
  const allowed = (host) => entry.hosts.some((p) => (p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p));
  const blocked = hostsUsed.filter((h) => !allowed(h));
  check(blocked.length === 0, 'every host it called is in "hosts"', blocked.join(', '));
} else if (entry) {
  say('warn', 'no "hosts" list declared, so nothing limits where it can connect (recommended)');
}

for (const c of botChecks) {
  if (!reportedChecks.has(`${c.host}|${c.kind}`)) say('warn', `${c.host} answered a bot check during the run`, botCheckHint(c));
}

finish();
