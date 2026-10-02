# Build an Inkstone extension with AI (beta)

**This is in beta.** It's new, and extensions built by an AI can have bugs. Always run the test script and try the result in Boundless before you share it.

You can have an AI assistant build a Boundless Reader extension for you. Point it at this page, tell it which site you want, and it can look the site over, write the code, test it against the real thing and package it for Inkstone. Everything it needs is below.

**The quick way.** Send your AI this message (swap in your own site):

> Read https://inkstone.web.app/docs/BUILD_WITH_AI.md and follow it to build a Boundless Reader extension for https://example.com

If your AI can't open links, paste this whole file into the chat first, then add the site on the last line.

**What you do:** pick a site, let the AI work, read what it reports back, try the result in Boundless, and send it in.
**What the AI does:** everything in between.

Works with Claude, ChatGPT, Cursor, Codex, Gemini and anything else that can write code. It works best when the AI can run commands (curl, node), so it can check the real site instead of guessing.

**Prefer to approve a plan before any code is written?** Use OpenSpec instead: [OPENSPEC.md](https://inkstone.web.app/docs/OPENSPEC.md).

Inkstone is an independent project. It isn't part of Boundless Reader and isn't endorsed by it.

---

# Instructions for the AI

You're building one extension for Boundless Reader: a single JavaScript file that lets the app browse, search and read one site. Work through the steps in order. Ask the user a question only when you're truly blocked.

If the user asked for OpenSpec, or this repository has an `openspec/` folder and they want a plan first, follow [OPENSPEC.md](https://inkstone.web.app/docs/OPENSPEC.md) instead: propose a change named `add-<id>-extension`, stop for review, then apply. The steps below still apply. Step 1 becomes the findings in the proposal and design, Step 2 becomes the spec and tasks, and Steps 3 to 5 become the tasks you check off.

## What you're delivering

1. `<id>/index.js`, the extension. `<id>` is lowercase letters and numbers, like `asurascans`.
2. A `versioning.json` entry for it.
3. Test results from the live site, and a short report (the format is at the end).

## Ground rules

- **Only say what you've seen.** Every claim about how the site behaves should come from a request you actually made. If you haven't checked, you don't know yet.
- **Never invent data.** No placeholder titles, covers or chapters standing in for a real response.
- **Be gentle with the site.** Send a handful of requests, not hundreds. If it starts answering 429, slow down.
- **Public content only.** Don't work around logins, paywalls or DRM. Don't try to solve CAPTCHAs.
- **Rate it honestly.** Set `contentRating` from what the site really serves, not from its name.
- **One site per extension.**
- **Keep the final file free of comments.** Put your notes in your report instead.
- **Stop early if it can't work.** A short "this isn't feasible, here's why" beats a half-working extension.

## Step 1: Look at the site first

Do these checks in one batch (one script, or a few curl calls sent together), then read the output once. Write down what you found.

1. **Find the real domain.** `curl -sIL https://site` and follow every redirect. Build against the domain that actually serves the content, so the extension doesn't pay for a redirect on every request.
2. **Check for bot protection.** With a normal browser User-Agent, request the homepage, a search page, a title page and a chapter page.
   - A Cloudflare "Just a moment..." page or a `cf-mitigated` header is fine. Boundless solves those in a hidden browser view (and asks the user to tap if it has to), so the extension doesn't have to.
   - If curl fails before any HTTP response arrives (a TLS error like `alert access denied`), the site is rejecting non-browser clients outright. Treat that as a no-go and say so.
   - Fire five requests at once at one endpoint. If you see 429s, add a `rateLimit` (see Step 2).
3. **Look for a JSON API.** Many sites fetch their data from an API. Check the page source for `__NEXT_DATA__`, open the network calls in the page, or try the obvious paths. A JSON API is far more stable than scraping markup.
4. **Sample widely.** Walk details, then the chapter list, then at least two chapters, for 3 to 5 different titles: a brand new one, an old one, different genres. This is the most valuable check there is. It catches sites that run two different reader layouts, and titles that are listed and searchable but have no chapters at all.
5. **Check ids are stable.** Note the id or slug of a few titles. If they carry a date or a long random suffix, fetch the listing again a few minutes later and compare. If the ids change, the extension has to cope with that.
6. **Read the raw HTML for each field.** Is the author plain text, or wrapped in a link or a span? A real HTML parser handles nesting, a regex quietly returns nothing.
7. **Check the images.** Fetch a page image with no `Referer`, then again with `Referer` set to the site. If the results differ, the site has hotlink protection and your chapters need to return `referer`. Then actually look at a downloaded image. If it's a jumble of tiles, that's image scrambling the extension can't undo, so list it as a limitation.
8. **Check the encoding.** For Chinese, Japanese and Korean sites, make sure the response is UTF-8. If not, look for a mobile or app API that serves clean JSON.
9. **Check the edges of pagination.** What does an empty search do? What does one page past the end do: an error, an empty list, or page 1 again?
10. **Start from the reference extensions** in [github.com/realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions). These two are the most complete and the best tested, so copy their structure:

| Reference | What it shows |
| --- | --- |
| `asurascans` | A comics site on a JSON API: feeds, genre filter, search, details, chapters and reading |
| `chikari` | One site serving both comics and novels from a JSON API: it honors the `medium` toggle and returns text chapters for novels |

Both read from a JSON API. For a site that only serves HTML, follow the `cheerio` guidance in Step 2. Other extensions in the repo are fine for ideas, but some have rough edges, so don't copy them blindly.

**Decide go or no-go.** A TLS-level block, or a catalog behind a login, is a real "no". Say so plainly and stop.

## Step 2: Write the extension

### The environment

The code runs in JavaScriptCore inside the app, not a browser. You get modern JavaScript (`Promise`, `async/await`, `JSON`, `Math`, `Date`, `RegExp`, `Intl`, `encodeURIComponent`) plus three things Boundless provides: the `App` object, a `cheerio` global and a `CryptoJS` global.

There is **no** `fetch`, `XMLHttpRequest`, `URL`, `URLSearchParams`, `setTimeout`, `setInterval`, `btoa`, `atob`, `TextDecoder`, `document` or `DOMParser`. Using one throws a `ReferenceError`, and in the app that just looks like an empty screen. Don't `require` anything either.

- Parse HTML with `cheerio.load(html)`. It's cheerio's slim build with the usual jQuery-style API (`$('.title').text()`, `.attr('href')`, `.each()`). Prefer it to regex. Being the slim build, `cheerio.load(fragment)` does not wrap a fragment in `<html><body>` like the full build does, so the test script uses `cheerio/slim` to match.
- `CryptoJS` is the crypto-js library, for sites that encrypt or hash values in their pages.
- Build query strings with this helper (copy it):

```js
function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}
```

### The `App` object

| Call | What it does |
| --- | --- |
| `App.createRequestManager({ rateLimit })` | Returns a manager with `schedule(request)`. All network access goes through it. `rateLimit` is optional: `{ requestsPerSecond, requestsPerMinute }`, and the stricter one wins. |
| `App.createRequest({ url, method, headers, body })` | Describes a request. `method` defaults to `GET`. For a JSON `POST`, set `body` to a string and add a `Content-Type` header. |
| `manager.schedule(request)` | Resolves to `{ status, headers, data }`. `data` is always a **string**, so `JSON.parse` it yourself. A 404 or 500 still resolves, so check `status`. Only network failures reject. |
| `App.getSourceSetting(key)` | Reads a value the user set in your extension's settings. Always a string, or `undefined`. |
| `App.createSourceStateManager()` | Returns `{ store(key, value), retrieve(key) }`, both async, for remembering things between calls. |
| `App.base64Encode(text)` / `App.base64Decode(text)` | Base64 in and out. |
| `App.executeInWebView({ url \| html + baseUrl, script, timeoutMs })` | Last resort. Runs your `script` inside a real browser view, for sites that only hand out a token through their own page scripts. A few newer extensions (`mangafire`, `kagane`, `comix`) use it, but treat them as examples of the call rather than models. It resolves to `{ value }` or `{ error }`. |

A request helper to start from:

```js
async requestJSON(url) {
  const manager = App.createRequestManager({});
  const response = await manager.schedule(
    App.createRequest({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    }),
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return JSON.parse(response.data);
}
```

### The `Source` class

Export it at the very end of the file: `module.exports = { Source };`

**Required methods**

| Method | Returns |
| --- | --- |
| `async getSearchResults(request, metadata)` | `{ results: [PartialManga], metadata }` |
| `async getMangaDetails(mangaId)` | `{ mangaInfo: {...} }` |
| `async getChapters(mangaId)` | `[Chapter]` |
| `async getChapterDetails(mangaId, chapterId)` | `{ id, mangaId, pages: [url] }` |

**Optional methods**

| Method | Returns |
| --- | --- |
| `getSourceFeeds()` | `[{ id, name }]`, the Browse tabs. **Not async**: no `await`, no network. Leave it out for a single "Popular" feed. |
| `async getSearchTags()` | `[{ id, label }]`, the site's genres. Boundless matches a title's genre names against these labels to find related titles, so keep the labels the same as the names in your titles' `tags`. Return a flat list (not grouped sections), or `[]` if the site has no working genre filter. |

`getSearchResults` powers both Browse and Search:

```js
request = {
  title: 'search text',          // '' when browsing
  feed: 'popular',               // a getSourceFeeds() id (browse only)
  includedTags: [{ id: 'action' }],
  excludedTags: [],
  medium: 'comics' | 'novel',    // only if the user set the medium toggle
}
metadata = null                  // first page
metadata = { page: 2 }           // whatever you returned last time
```

Return `metadata: { page: n + 1 }` when there's another page and `undefined` when there isn't. A metadata that's always truthy makes Browse load the last page forever.

### Field names the app reads

A wrong name never throws. The field just shows up blank, which is harder to debug than a crash.

```js
// Title in Browse and Search (PartialManga)
{
  mangaId: 'slug',        // required
  title: 'Title',
  image: 'https://...',   // "image", NOT "coverURL". Absolute URL.
  author, summary, tags: ['Action'], webURL,
  medium: 'comics' | 'novel',
  contentRating: 'safe' | 'mature' | 'adult',   // only if the site rates titles
  rating, views, chapters, completed, releaseDate, publisher,
}

// getMangaDetails
{ mangaInfo: { /* same fields */, desc: '...', status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN' } }

// Chapter
{
  id: 'chapter-id',       // required
  name: 'Chapter 12',
  number: 12,             // used for sorting
  group: 'scanlator',
  time: 1755731400000,    // epoch MILLISECONDS, not a Date
}

// getChapterDetails: comics
{ id, mangaId, pages: ['https://...'], referer: 'https://site.com' }   // referer only if needed

// getChapterDetails: novels
{ id, mangaId, pages: [], text: 'Chapter text' }   // or text: ['paragraph', 'paragraph']
```

It's `desc` (or `summary`), not `description`, and `status` must be one of those exact uppercase words.

### Settings (only if you need them)

If your extension has options (a language, a quality setting, a server URL), declare them as `settingsSchema` in its `versioning.json` entry. Each field has a `type` (`text`, `toggle`, `select`, `multiSelect` or `section`), a `key`, a `label`, and optionally `default`, `placeholder`, `secure` (hides passwords) and `options: [{ value, label }]`. Read the value back with `App.getSourceSetting('key')`, which gives you a string (so a toggle is `'true'` or `'false'`). No published extension declares a schema yet, so test yours in the app.

### Handy rules of thumb

- If the site gives you a JSON API, use it. If not, `cheerio`.
- Return the **whole** chapter list. Many APIs stop at 100 unless you ask for more.
- Page 2 of Browse must really differ from page 1. Plenty of APIs accept a `page=` parameter and quietly ignore it.
- Check that each feed in `getSourceFeeds()` actually reorders the results. A 200 doesn't prove a `sort=` value did anything.
- Chapter and title ids should survive a round trip through your own code. Don't rely on state from an earlier call.
- Cover and page image URLs must be absolute. Resolve relative ones against the site.

## Step 3: Test it on the real site

Run the test script. It does two jobs: it checks the extension is **compatible** with Boundless (loads in a bare sandbox, exports the right methods, has a valid `versioning.json` entry, matching `sha256`), and it checks the extension can **fetch real results** (browse, search, details, chapters and actually opening chapters, for two titles). The full guide is in [TESTING.md](https://inkstone.web.app/docs/TESTING.md).

Save this as `test-extension.mjs` next to your extension folder (or download it from https://inkstone.web.app/docs/test-extension.mjs):

<!-- test-extension:start -->

```js
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
let skippedInApp = false;
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

const requests = [];
const App = {
  createRequestManager: () => ({
    async schedule(request) {
      requests.push(new URL(request.url).hostname);
      let res;
      try {
        res = await fetch(request.url, {
          method: request.method || 'GET',
          headers: request.headers,
          body: request.body,
        });
      } catch (error) {
        throw new Error(`network error: ${error.cause?.code ?? error.cause?.message ?? error.message}`);
      }
      return { status: res.status, headers: Object.fromEntries(res.headers), data: await res.text() };
    },
  }),
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
};

const code = readFileSync(file, 'utf8');

console.log('Compatibility (no network)\n');

const banned = ['fetch', 'XMLHttpRequest', 'URL', 'URLSearchParams', 'setTimeout', 'setInterval', 'btoa', 'atob', 'TextDecoder', 'document', 'DOMParser', 'structuredClone', 'require'];
const hits = [];
code.split('\n').forEach((line, i) => {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
  for (const name of banned) {
    if (new RegExp(`(^|[^\\w.$])${name}\\s*[(.]|new ${name}\\b`).test(line)) hits.push(`${name} on line ${i + 1}`);
  }
});
if (hits.length) {
  say('warn', 'uses something Boundless does not provide', `${hits.slice(0, 4).join(', ')}. Fine inside a string for a WebView script, a bug anywhere else`);
} else {
  say('pass', 'no fetch, URL, setTimeout, document or require in the code');
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
const sandbox = { module: { exports: {} }, App, cheerio, ...(CryptoJS ? { CryptoJS } : {}), console };
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
const source = new Source();

for (const method of ['getSearchResults', 'getMangaDetails', 'getChapters', 'getChapterDetails']) {
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
const listPath = path.join(path.dirname(folder), 'versioning.json');
let entry;
if (existsSync(listPath)) {
  const listing = JSON.parse(readFileSync(listPath, 'utf8'));
  entry = listing.sources?.find((s) => s.id === path.basename(folder));
  if (check(entry, 'has an entry in versioning.json', `id "${path.basename(folder)}"`)) {
    check(entry.name && /^\d+\.\d+\.\d+/.test(entry.version ?? ''), 'entry has a name and a version like 1.0.0');
    check(['comics', 'novel', 'both'].includes(entry.medium), 'medium is comics, novel or both', entry.medium);
    check(['safe', 'mature', 'adult'].includes(entry.contentRating), 'contentRating is safe, mature or adult', entry.contentRating);
    check(isUrl(entry.website), 'website is a full URL');
    check(/^[a-z]{2,3}$/.test(entry.language ?? ''), 'language is a short code like en', entry.language);
    check(entry.description && entry.capabilities?.length, 'has a description and capabilities');
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (entry.sha256) check(entry.sha256 === digest, 'sha256 matches the file', entry.sha256 === digest ? '' : 'run shasum -a 256 and update it');
    else say('warn', 'no sha256 yet', `shasum -a 256 gives ${digest.slice(0, 12)}...`);
  }
} else {
  say('warn', 'no versioning.json one folder up, so the listing checks were skipped');
}

console.log('\nLive results (real requests to the site)\n');

const withTimeout = (promise, ms = 60000) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms))]);
async function step(label, run) {
  const started = Date.now();
  try {
    const value = await withTimeout(run());
    return { value, took: `${((Date.now() - started) / 1000).toFixed(1)}s` };
  } catch (error) {
    const message = String(error.message ?? error);
    if (message.includes('only works inside Boundless')) {
      skippedInApp = true;
      say('warn', `${label} needs Boundless, so it was skipped`);
    } else {
      say('fail', label, message.slice(0, 200));
    }
    return null;
  }
}

const browse = await step('browse', () => source.getSearchResults({ title: '', feed: feeds[0]?.id }, null));
if (browse) {
  const list = browse.value.results ?? [];
  if (usesWebView && list.length === 0) say('warn', 'browse returned nothing, expected if it needs Boundless (WebView)');
  else check(list.length > 0, 'browse returns titles', `${list.length} results in ${browse.took}`);
  check(list.every((r) => r.mangaId && r.title), 'every title has a mangaId and a title');
  check(list.every((r) => isUrl(r.image)), 'every cover is an absolute URL in "image"');
  if (browse.value.metadata) {
    const next = await step('browse page 2', () => source.getSearchResults({ title: '', feed: feeds[0]?.id }, browse.value.metadata));
    if (next) check(next.value.results?.[0]?.mangaId !== list[0]?.mangaId, 'page 2 differs from page 1');
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
  }
}

const query = searchTerm || pickQuery(browse?.value.results?.[0]?.title) || 'a';
const found = await step(`search "${query}"`, () => source.getSearchResults({ title: query }, null));
if (found) {
  const count = found.value.results?.length ?? 0;
  if (usesWebView && count === 0) say('warn', `search "${query}" returned nothing, expected if it needs Boundless (WebView)`);
  else check(count > 0, `search "${query}" returns titles`, `${count} results in ${found.took}`);
}

for (const item of (found?.value.results ?? []).slice(0, 2)) {
  console.log(`\n${item.title}`);
  const details = await step('details', () => source.getMangaDetails(item.mangaId));
  if (details) {
    const info = details.value.mangaInfo;
    check(info && (info.desc !== undefined || info.summary !== undefined), 'details have a description (desc or summary)', details.took);
    check(['ONGOING', 'COMPLETED', 'HIATUS', 'CANCELLED', 'UNKNOWN'].includes(info?.status), 'status is an allowed value', info?.status);
  }
  const chapters = await step('chapters', () => source.getChapters(item.mangaId));
  if (!chapters) continue;
  const list = chapters.value ?? [];
  check(list.length > 0, 'chapter list is not empty', `${list.length} chapters in ${chapters.took}`);
  check(list.every((c) => c.id), 'every chapter has an id');
  check(list.every((c) => c.time === undefined || c.time > 1e11), 'chapter times are in milliseconds');
  const tryOpen = async (chapter) => {
    const label = `chapter "${chapter.name ?? chapter.id}"`;
    const started = Date.now();
    try {
      const read = await withTimeout(source.getChapterDetails(item.mangaId, chapter.id));
      const isText = Array.isArray(read.pages) && read.pages.length === 0 && read.text;
      const isImages = read.pages?.length > 0 && read.pages.every(isUrl);
      const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      return { ok: Boolean(isText || isImages), label, detail: isText ? 'text' : `${read.pages?.length ?? 0} pages in ${took}` };
    } catch (error) {
      const message = String(error.message ?? error);
      if (message.includes('only works inside Boundless')) return { skipped: true, label, detail: message };
      return { ok: false, label, detail: message.slice(0, 200) };
    }
  };
  const readable = list.filter((c) => !gated(c));
  if (readable.length && readable.length < list.length) say('warn', `${list.length - readable.length} locked or paid chapters were skipped`);
  const pool = readable.length ? readable : list;
  const attempts = [];
  for (const chapter of pool.slice(0, 4)) {
    attempts.push(await tryOpen(chapter));
    if (attempts.at(-1).ok || attempts.at(-1).skipped) break;
  }
  const [first] = attempts;
  const opened = attempts.at(-1);
  if (first.skipped) {
    skippedInApp = true;
    say('warn', 'opening a chapter needs Boundless, so it was skipped');
    continue;
  }
  if (first.ok) {
    say('pass', `${first.label} opens`, first.detail);
  } else if (opened.ok) {
    say('warn', `${first.label} did not open (${first.detail}), maybe locked or not published yet`);
    say('pass', `${opened.label} opens`, opened.detail);
  } else {
    say('fail', `none of the ${attempts.length} newest chapters opened`, `${first.label}: ${first.detail}`);
  }
  if (pool.length > 1) {
    const oldest = await tryOpen(pool.at(-1));
    check(oldest.ok, `${oldest.label} opens`, oldest.detail);
  }
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

finish();
```

<!-- test-extension:end -->

Run it (Node 18 or newer):

```bash
npm install cheerio
node test-extension.mjs ./mysite/index.js "naruto"
```

What to do with the results:

- Keep going until there are no `FAIL` lines. Try a few different search words (the script picks one itself if you don't give it one), including one that should return nothing.
- A `fetch is not defined` (or `URL`, `setTimeout`, `document`) means the code used something the app doesn't have.
- `WARN` lines are worth reading but aren't failures. A missing `hosts` list is the usual one.
- The script checks data, not looks. Read the output yourself: do titles, covers and chapter names look like the real site? Are chapters in a sensible order?
- A site behind a Cloudflare challenge may answer `403` to plain Node even though Boundless gets through. Say that in your report.
- Anything using `App.executeInWebView` only runs inside Boundless, and the script says so.

When it passes, try it in Boundless for real. A repository is just a folder of static files, so put `versioning.json` and your `<id>/index.js` on any static host (GitHub Pages works), add that URL in Boundless's extension settings, and install your extension.

## Step 4: Package it

Add an entry to `versioning.json`, and make the folder name equal the `id`:

```json
{
  "id": "mysite",
  "name": "My Site",
  "version": "1.0.0",
  "medium": "comics",
  "website": "https://mysite.com",
  "iconUrl": "https://mysite.com/apple-touch-icon.png",
  "description": "What it covers, which feeds it has, and anything that doesn't work.",
  "capabilities": ["browse", "search", "genres", "details", "chapters", "reader"],
  "language": "en",
  "contentRating": "safe",
  "hosts": ["mysite.com", "*.mysite-cdn.com"],
  "sha256": "<hash of index.js>"
}
```

- `medium` is `comics`, `novel` or `both`. `language` is a two-letter code. `capabilities` lists what really works.
- `contentRating` is `safe`, `mature` or `adult`, based on what you saw in Step 1. When in doubt, go one step stricter.
- `hosts` lists every host the extension talks to. Boundless refuses requests to anything else. Image hosts aren't covered by it, but list them anyway.
- `description` should say what's missing. A description that overclaims costs the next person a debugging session.
- `author` is optional. Add your name or handle to get credit on the catalog. `authorUrl` can link it to your profile.
- Get the hash with `shasum -a 256 mysite/index.js`. **Redo it every time the file changes.** A stale hash makes Boundless refuse the install.
- Bump `version` whenever the file changes.

## Step 5: List it on Inkstone

1. Fork [realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions).
2. Add your `<id>/index.js` folder and your `versioning.json` entry.
3. Open a pull request. Your report (below) works as the description.

No GitHub? Share the folder on the [Inkstone Discord](https://discord.gg/6pX2XgFYcs) instead. Every submission is tried against the live site before it's listed.

## Your final report

End with something the user can read in thirty seconds:

- **Site and extension id.**
- **Data source:** JSON API, HTML or embedded data, and how you found out.
- **What works:** browse feeds, search, genres, details, chapters, reading. Say which titles you tested.
- **What doesn't:** limitations, honestly. Scrambled images, a missing feed, chapters that need a login.
- **Protection:** Cloudflare, rate limits, hotlink protection, and what you did about each.
- **Content rating** you chose, and why.
- **Test output** from the script.
- **Files** to commit.

## Common mistakes

| Mistake | What happens |
| --- | --- |
| `coverURL` instead of `image` | Blank covers, no error |
| Relative image URLs | Covers or pages fail to load |
| `time` as a `Date`, or in seconds | Wrong or missing dates |
| `description` instead of `desc` | Blank summary |
| A `status` that isn't an allowed word | Shows as Unknown |
| Always returning `metadata` | Browse loads the last page forever |
| `getSourceFeeds()` that's `async` or fetches | Feeds never appear |
| Using `fetch`, `URL` or `setTimeout` | Empty screens |
| Chapter list capped at 100 | Missing chapters |
| Forgetting `referer` on hotlink-protected images | Chapters open but every page fails |
| Stale `sha256` | Install refused |
| `contentRating` guessed from the site's name | Wrong filtering for the reader |
