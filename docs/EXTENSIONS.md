# Writing an extension

An extension is a single JavaScript file that exposes a `Source` class. The app
downloads it from a repo, runs it in a sandboxed JavaScript engine (JavaScriptCore
on iPhone, iPad and Mac, QuickJS on Android), and calls its methods to fill the
Browse, Search, Detail and Reader screens.

The format keeps the surface area small: implement a handful of methods on
that class and the app can browse, search and read through your source.

Boundless Reader and Sumizuri both load Inkstone extensions. This page describes Boundless's runtime. Anime extensions are for the video apps, Sumizuri and Boundless Player: Boundless Reader is not compatible with them (see [Anime sources](#anime-sources-sumizuri-and-boundless-player)).
Building with an AI assistant? Give it [BUILD_WITH_AI.md](BUILD_WITH_AI.md).
To check an extension works, see [TESTING.md](TESTING.md).

---

## 1. The runtime is a JavaScript engine, not a browser

This is the single biggest source of "it silently returns nothing" bugs.
The engine gives you the ECMAScript standard library and nothing else.
Boundless runs your file on JavaScriptCore (iPhone, iPad, Mac) and on QuickJS
(Android), so it has to work on both.

**Not available**. Using any of these throws a `ReferenceError` that surfaces
in the app as an empty screen:

| Missing | Use instead |
| --- | --- |
| `fetch`, `XMLHttpRequest` | `App.createRequestManager().schedule()` |
| `URL`, `URLSearchParams` | build strings with `encodeURIComponent` |
| `setInterval` | declare a `rateLimit` for pacing; `setTimeout` exists but is not a way to wait for a site |
| `btoa`, `TextEncoder`, `TextDecoder`, `Buffer` | `App.base64Encode(text)` and `App.base64Decode(text)` |
| `document`, `DOM`, `DOMParser` | `cheerio.load(html)`, provided as a global |
| `structuredClone` | `JSON.parse(JSON.stringify(x))` |

**Available:** `Promise`, `async`/`await`, `JSON`, `Math`, `Date`, `RegExp`,
`String.prototype.replaceAll`, `Object.fromEntries`,
`encodeURIComponent`, and the rest of modern ECMAScript. Boundless also
provides these globals: `App` (below), `cheerio`, `CryptoJS`, `console`,
`setTimeout` with `clearTimeout` (older builds have no `clearTimeout`) and
`atob` (it drops characters outside the base64 alphabet and gives one
character per byte, so it also decodes binary data).

**The two engines differ.** `test-extension.mjs` runs your file in Node, a
third engine, so it cannot show these. Each was checked by running the same
code in JavaScriptCore and in QuickJS:

| Difference | What to do |
| --- | --- |
| `Intl` exists on iPhone, iPad and Mac, not on Android | Don't use it |
| `(1234.5).toLocaleString()` gives `1,234.5` on iPhone and `1234.5` on Android | Don't use `toLocale...String()` for anything you return |
| `Date.parse('12-01-2024')` is `NaN` on iPhone and December 1st on Android. ISO 8601 (`2024-01-12`, `2024-01-12T10:00:00Z`) and `Jan 12, 2024` agree | Read any other date text yourself and build the time with `Date.UTC(year, month, day)` |
| `WeakRef` exists only on iPhone and Mac; `queueMicrotask` on neither | Don't use them |

`cheerio` is cheerio's slim build with its usual jQuery-style API. Parse HTML
with it instead of regex. Because it is the slim build, `cheerio.load(fragment)`
does not wrap a fragment in `<html><body>` the way the full build does, so test
with `cheerio/slim`, not the full package. `CryptoJS` is the crypto-js library,
for sites that encrypt or hash values in their pages.

```js
const $ = cheerio.load(html);
const title = $('h1.title').text().trim();
const cover = $('img.cover').attr('src');
$('.chapter-list a').each((_, el) => { /* $(el).attr('href') */ });
```

Every extension in this repo carries a small `qs()` helper for query strings.
Copy it:

```js
function qs(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}
```

## 2. Networking

All HTTP goes through the app's own network layer. Extensions never touch the
network directly.

```js
async requestJSON(url) {
  const manager = App.createRequestManager({});
  const request = App.createRequest({
    url,
    method: 'GET',
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  const response = await manager.schedule(request);   // { status, headers, data }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }
  return JSON.parse(response.data);
}
```

`response.data` is always a **string**. There is no automatic JSON parsing. A
404 or 500 still resolves, so check `response.status`; only network failures
(and a host that is not in your `hosts`) reject. Things the app does for you:
it waits out a 429, or a 503 with a `Retry-After`, and retries up to 3 times
before you see the answer; it answers an identical GET (same address and
headers) from a 90 second cache; it follows up to 5 redirects, but a `POST`
answered with a 301 or 302 is handed to you as it is (only a 303 is followed,
as a `GET`); and it reads text and JSON with no charset as UTF-8, images and
other binary types as Latin-1 (one character per byte). Older builds read any
answer with no charset as Latin-1, so keep a mojibake repair if the site needs
one.

`App.createRequest` takes `{ url, method, headers, body }`. `method` defaults to
`GET`; for a `POST`, pass `body` as a string and a `Content-Type` header. To
pace requests to a site that answers 429, pass a limit when creating the
manager: `App.createRequestManager({ rateLimit: { requestsPerSecond: 2 } })`
(`requestsPerMinute` works too, and the stricter of the two wins). Sites that answer a burst with a 503 "connection limit" page need it as much as ones that answer 429.

### The rest of `App`

| Call | What it does |
| --- | --- |
| `App.getSourceSetting(key)` | Reads a value the user set in your settings (see `settingsSchema` below). Always a string, or `undefined`. |
| `App.createSourceStateManager()` | Returns `{ store(key, value), retrieve(key) }`, both async, for remembering things between calls. |
| `App.base64Encode(text)`, `App.base64Decode(text)` | Base64 in and out, as UTF-8 text. `base64Decode` throws if the bytes are not valid UTF-8. Boundless has `atob` for binary data, but Sumizuri's engine has none (a bare `atob` call throws there), so use `App.base64Decode` for text and guard any `atob` with `typeof atob === 'function'`. |
| `App.requestBrowserVerification({ url })` | Shows the page to the reader in the app's browser and resolves when they close it, or after 3 minutes. For a check that needs a person; the address must be on your `hosts`. Almost no extension needs it, because the app clears ordinary Cloudflare checks itself. |
| `App.descrambleImage({ base64, headers })` | Puts back the pieces of one specific scrambled image scheme: a byte XOR and a 5 by 5 tile shuffle, switched on by `x-enc-*` and `x-scramble-*` response headers. Resolves to `{ base64 }` or `{ error }`. It is not a general descrambler. |
| `App.executeInWebView({ url \| html + baseUrl, script, timeoutMs })` | Last resort for sites that only hand out a token through their own page scripts. Runs `script` in a real browser view and resolves to `{ value }` or `{ error }`. A few newer extensions (`mangafire`, `kagane`) use it, but treat them as examples of the call rather than models. |

## 3. The `Source` class

Export it at the end of the file:

```js
module.exports = { Source };
```

The loader tries `new module.exports.Source()`, then a named export matching the
source id, then a global `Source`.

### Required methods

| Method | Async | Returns |
| --- | --- | --- |
| `getSearchResults(request, metadata)` | yes | `{ results: [PartialManga], metadata }` |
| `getMangaDetails(mangaId)` | yes | `{ mangaInfo: {...} }` |
| `getChapters(mangaId)` | yes | `[Chapter]` |
| `getChapterDetails(mangaId, chapterId)` | yes | `{ id, mangaId, pages: [imageURL] }` |

### Optional methods

| Method | Async | Returns |
| --- | --- | --- |
| `getSourceFeeds()` | **no** (plain/synchronous) | `[{ id, name }]` (the Browse feed tabs) |
| `getSearchTags()` | yes | `[{ id, label }]`, the site's genres |
| `getChapterDates(mangaId)` | yes | `{ dates: { [chapterId]: epochMilliseconds }, remaining }` |

`getSourceFeeds()` is called at load time on the JS queue, so it must return
immediately: no `await`, no network. Omitting it means the app browses with feed `recent`.

`getChapterDates` is for a site whose chapter list has no dates but whose
chapter pages do (`novelfire` does this). `getChapters` returns the list
undated (or with the dates it has), and after the list shows the app calls
`getChapterDates` again and again, up to 80 times, merging each answer into the
list. Return the dates you found this round and the number of units of work
still left in `remaining`; the app stops when `remaining` is 0 or when a call
fails (silently, the list works without dates). Keep each round small, a few
requests. A value that is not a number is left out.

### `request` and `metadata`

`getSearchResults` is used for both Browse and Search:

```js
request = {
  title: 'search query',        // left out when browsing (it is never '')
  feed: 'popular',              // the selected getSourceFeeds() id; 'recent' for a search, a genre filter, or a source with no feeds
  includedTags: [{ id: 'action', label: 'action' }],   // left out when no genre is chosen; label is the id
  medium: 'comics' | 'novel',   // only when the app's medium toggle is set
}
metadata = undefined            // first page
metadata = { page: 2 }          // whatever you returned last call (an object, or nothing)
```

Read every field with a guard (`request.title || ''`, `request.includedTags || []`): the
app leaves out what is empty. It does not send `excludedTags`, because it has no way to
exclude a genre, so an exclusion option an extension supports is not used today. When the
reader types a search or picks a genre the app asks feed `recent` whatever feeds you
declare, so a search and a genre filter must work with any `feed` value. The `metadata`
you return must be an object or nothing: a number or a string makes the whole page
unreadable.

Return `metadata: { page: n + 1 }` to advertise another page, or `undefined` to
stop infinite scroll. **Returning a truthy metadata forever makes Browse loop
on the last page forever.**

## 4. Field names the app actually reads

Getting these wrong does not throw. The value arrives as `nil` and the field is
just blank in the UI, which is much harder to debug than a crash.

**Partial manga** (Browse / Search grid):

```js
{
  mangaId: 'slug',      // REQUIRED. Not `id`: the app reads only `mangaId`
  title: 'Title',
  image: 'https://…',   // ← `image`, NOT `coverURL`. Must be absolute.
  referer: 'https://example.com/',   // only if covers 403 without it
  author, summary, tags: ['Action'], webURL,
  medium: 'comics' | 'novel',
  ageRating: 0 | 16 | 18,   // minimum age, only if the site rates titles one by one
  rating, views, chapters, completed, releaseDate, publisher,
}
```

The app reads `mangaId`, `title`, `image`, `desc` or `summary`, `tags`, `chapters`, `completed`,
`publisher`, `status`, `ageRating`, `medium`, `author`, `rating`, `volumesId`, and `referer` or
`headers`. `webURL`, `views` and `releaseDate` are not used by the app today (it has no open in
browser action on a series page); sending them is harmless.

`ageRating` is a number: the title's own minimum age. Set it only when the site
rates titles one by one (MangaDex's safe, suggestive, erotica and pornographic
become 0, 16, 18 and 18). Boundless reads 16 and up as mature and 18 and up as
restricted, and the reader's content settings decide whether those are shown,
blurred or hidden (by default mature is blurred and restricted is hidden). A
word such as `contentRating: 'adult'` on a title is ignored. It is also a
different thing from the `contentRating` in `versioning.json`, which rates the
whole extension.

**Manga details**: same fields, nested under `mangaInfo`, with:

```js
{ mangaInfo: { desc: '…', status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN' } }
```

`desc` (not `description`) and `status` must be one of those exact uppercase
strings. Anything else maps to Unknown.

**Volumes (optional).** A source that can list a title's volumes returns `volumesId` in the details: any id of its own choosing for the title's volumes edition (MangaFire uses the title's id plus `~volumes`, a suffix that is safe in URLs and never part of a real id). The app then shows a Chapters / Volumes switch. Volumes lists `getChapters(volumesId)` and reads a volume with `getChapterDetails(volumesId, volumeId)`, so the volumes are a second series as far as the extension is concerned, and their progress, history, downloads and read marks are kept apart from the chapters' (they would otherwise be mixed: Continue picks the furthest chapter number). Each volume is a chapter-shaped entry (`id`, `name` such as `Volume 3`, `number`, and a `group` line such as `9 chapters`). It must be a string id. Leave it out when the title has no volumes. Apps without the switch ignore it.

**Chapter:**

```js
{
  id: 'chapter-id',     // REQUIRED. Not `chapterId`: the app reads only `id`
  name: 'Chapter 12',   // not `title`
  number: 12,           // not `chapNum`; used for sorting
  group: 'scanlator',
  volume: '3',          // optional, a STRING, shown as "Vol. 3"
  time: 1755731400000,  // ← numeric epoch **ms**, NOT a Date object
}
```

The app casts these fields: `name`, `group` and `volume` must be strings and
`number` and `time` must be numbers, or the chapter list throws instead of
showing a blank. A locked chapter on a timer ends its `name` with
`(Locked, unlocks in 5h 3m)` (`Xh Ym`, `Xh`, `Ym` or `moments`), which the app
shows as a lock icon with a countdown. Any other lock label is shown as plain
text. See [BUILD_WITH_AI.md](BUILD_WITH_AI.md) for locked chapters, accounts and
the rules that keep an extension stable.

**Chapter details:** `pages` must be an array of absolute image URL **strings**.
The Reader decodes them as images via ImageIO. For a prose source (novels:
`medium: 'novel'`, or the novel side of a `'both'` source), return `pages: []`
and put the chapter body in `text` instead, as ONE string with a blank line
between paragraphs (the app casts `text` to a string, so an array is rejected, and it
splits paragraphs only on blank lines): `{ id, mangaId, pages: [], text: 'Chapter text…' }`.
The app has a real prose reader for this today. `chikari` is a good example:
one site serving both comics and novels.

Optionally, also return `referer: 'https://example.com'` (your site's own
origin) alongside `pages` if your page-image CDN checks the `Referer` header
and 403s without it. It's a common anti-hotlink measure and easy to miss,
because covers and the manga-detail HTML fetch usually still work fine and
only the actual page images fail. If chapters load but every page in the reader shows
"failed to load", check this before assuming your selectors are wrong: fetch
one page URL with and without a `Referer` header matching your site and
compare the status codes. If covers are blocked the same way, put `referer` on
the title as well, on Browse results and in `mangaInfo` (a `headers` object of
strings works too, on the title and on the chapter details; a `Referer` in
`headers` wins over `referer`). The refusal can also be a Cloudflare check page
(HTTP 403, `cf-mitigated: challenge`) that an image host shows only to requests
with no `Referer`: the test script retries such an image once with the site's
`Referer` and fails, naming the `referer` to return, when that loads.

**Scrambled pages (Boundless only).** Return `scrambled: true` next to `pages`
to ask the app to put each page back in order after it downloads it. Today the
app can undo only one scheme (the one `App.descrambleImage` describes, chosen
by `x-enc-*` and `x-scramble-*` response headers); a page whose response has
none of those headers is shown as it came. Anything but a JSON `true` counts as
false. Leave it out when your script descrambles pages itself with
`App.descrambleImage`.

**Book files (Boundless Reader).** A chapter can be a whole book: return `book: { url, headers }` next to an empty
`pages`. `url` is an EPUB, MOBI or PDF that the app downloads itself, and `headers` is optional (a `Cookie`, a
`Referer`, a `User-Agent`), so the file has to answer a plain download. An EPUB or a MOBI becomes the text of the chapter,
and a PDF becomes its pages drawn as pictures on the device (the first open draws them and keeps them). Files over 150 MB and
PDFs over 1,500 pages are refused, and nothing is added to the Local Files library. Also return a short `text` notice
(the book's name and a link to the file works well): an app version that does not know `book`, and a file that cannot be
opened, show that text instead of an empty chapter. A `book` that is not an object with an http or https `url` is ignored.

### Anime sources (Sumizuri and Boundless Player)

**Anime extensions are for the video apps.** Boundless Reader is not compatible with them: it has no video player and does not call `getVideos`. [Sumizuri](https://sumizuri.notakari.com/) and Boundless Player play them. The details here follow Sumizuri's own documentation and engine (version 0.2.0); Boundless Player calls `getVideos` the same way, but test in Sumizuri first; the full walk-through is in [BUILD_WITH_AI.md](BUILD_WITH_AI.md).

Set `medium` to `anime` and list `videos` in `capabilities`. Episodes are chapters (`getChapters` as usual, newest first), and one extra method plays an episode. It returns a **list**, not an object:

```js
async getVideos(mangaId, chapterId) {
  return [
    {
      url: 'https://.../master.m3u8',     // required, a full address
      quality: 'Auto',                     // a label the player reads
      server: 'VixSrc',                    // optional, a stable name for the server or host
      headers: { Referer: 'https://example.com/' },
      subtitles: [{ url: 'https://.../en.vtt', label: 'English', language: 'en' }],
      audio: [{ url: 'https://.../ja.m3u8', label: 'Japanese', language: 'ja' }],
      intro: { start: 90000, end: 180000 },   // milliseconds, end after start
      outro: { start: 1300000, end: 1390000 },
    },
  ];
}
```

- An entry, subtitle track or audio track without a full `url` is dropped silently. `headers` is an object of strings.
- `quality` is read by the player: a height (`1080p`, `720p`, `4k`) ranks videos, and the words `Sub`, `Dub`, `Softsub` and `Hardsub` drive the audio preference and the sub and dub switch. Return an HLS master playlist once, as `Auto`; Sumizuri lists its qualities itself (only for an address whose path ends in `.m3u8`).
- `server` is an optional short name for the server or host (`VixSrc`, `Dailymotion`), the same on every episode of a source. The Boundless Player is being changed to group its Servers panel by it and to start the next episode on the server the viewer last used; builds that do not read it ignore it.
- An entry `{ type: 'embed', url: '<player page>', quality, server }` hands a player page to the Boundless Player, which resolves it to a stream. It opens `dailymotion.com`, `rumble.com`, `ok.ru`, `mp4upload.com`, Vidmoly, Streamtape, MixDrop and the VidHide pages `morencius.com`, `vidhide.com` and `earnvids.com`; any other host goes through the app's page sniffer, which opens the page in a hidden web view and takes the first media request (iPhone build of 2026-11-05, not yet run on a real page; Android not yet). List streams you resolved yourself first and embed entries after, and add the page host, the resolver's hosts and the stream hosts to the manifest `hosts`, or the stream is dropped.
- An episode with no stream yet should throw an `Error` with a clear message, not return an empty list.
- Do not send `group` on video episodes: it means a release group, and the Boundless Player shows none for video. It reads `title`, `thumbnail` (a full http or https address), `duration` in seconds (over 100000 counts as milliseconds) and `summary` instead.
- Episodes of a title with several seasons can carry `season`, `seasonName` and `seasonCover`. `mangaInfo` can carry a `banner`.
- Sumizuri treats only `contentRating: "adult"` as adult.

## 5. Publishing to a repo

A repo is a plain static file host (no server code):

```
your-repo/
├── versioning.json
└── <source-id>/index.js
```

`versioning.json` needs at least:

```json
{ "sources": [ { "id": "mysource", "name": "My Source", "version": "1.0.0" } ] }
```

The app resolves each bundle as `<repo>/<id>/index.js`, so the folder name must
equal the `id`. In the Inkstone repository the folder sits inside `comics/`, `novels/`,
`mixed/`, `anime/`, `donghua/`, `drama/` or `western/` (a video source has `medium: "anime"` whatever it shows, and the first word of its description decides the folder), and the site serves it without that folder. `capabilities` is a
landing-page-only label the app never reads, but `description`, `medium`, `website`,
`iconUrl`, `language`, `contentRating` and `settingsSchema` are all read (with `id`, `name`, `version`,
`sha256` and `hosts`) and copied onto the installed record at install/update time. The app ignores
`status`, `statusNote`, `author`, `authorUrl` and `minApiVersion`: they are for registries and websites. They drive real
in-app behavior (category filtering, the source icon, content-rating gating,
per-source settings screens), not just this repo's own listing pages.

`description` is shown by the app (its first line on the source cards, the whole text on
the source's own page) and on the website, so it has a short fixed shape:

```
Manga・Manhwa・Manhua・Light Novels

Catalog・10,000+

Restrictions:
・Cloudflare Checks
・Rate Limit
```

- Line one lists what the source offers, joined with the middle dot `・`: Manga, Manhwa, Manhua,
  Webtoons, Comics, Web Novels, Light Novels, Novels.
- `Catalog・` is how many titles the source lists, rounded down to one significant digit with a
  plus (`300+`, `1,000+`, `20,000+`, `100,000+`). Count it, do not guess it: leave the line out if you
  could not measure it.
- `Restrictions:` names only real ones you saw, one per line: `Cloudflare Checks` (the app has to
  clear a Cloudflare challenge first), `Rate Limit` (the extension holds its requests back, or the
  site slows you down), `Locked Chapters` (paid or on a timer), `Web View` (pages load in a web
  view, so it is slower). Leave the whole section out when there is none.

Anything longer, such as what you could not test, belongs in the comment at the top of
`index.js` and in your pull request report, not in the description.

### Settings: the optional `settingsSchema` field

If your extension has options (a language, a quality setting, a server URL),
declare them as a `settingsSchema` array on its `versioning.json` entry. Each
field has a `type` (`text`, `toggle`, `select`, `multiSelect` or `section`), a
`key`, a `label`, and optionally `default`, `placeholder`, `secure` (hides
passwords) and `options: [{ value, label }]`. Read the value back with
`App.getSourceSetting('key')`, which returns a string, so a toggle is `'true'`
or `'false'`.

When the site has its own preferences (a content rating, a language), offer them
as settings and send what the site sends. `kagane` does: its content rating
(Safe, 15+ or 18+) and preferred chapter language become the `age_rating` and
`content_lang` of its search request, and its default keeps what the extension
did before the setting existed.

### Known issues: the optional `status` and `statusNote` fields

An extension that is known to be broken is marked with `"status": "broken"` and
a short `statusNote` saying what fails, for example `"Chapters open with no
pages."`. The Inkstone website shows it; the Boundless app does not read it. The entry stays listed
until it is fixed or removed.

### Bundle integrity: the optional `sha256` field

A `versioning.json` entry may also declare `sha256`: the lowercase-hex
SHA-256 of the exact bytes of that source's `<id>/index.js`, computed over
the raw file as published, before any transpilation. A compatible app that
supports it verifies its download against this before trusting an install
or update. A mismatch (corrupted download, or a tampered bundle served from
somewhere between this repo and the app) refuses the install/update outright
rather than silently running unverified code. Declaring no `sha256` at all
installs exactly as before this field existed; it is fail-open by design,
not a requirement.

After changing (or before first publishing) any source's `index.js`, hash it:

```bash
shasum -a 256 <id>/index.js
```

Paste the digest into that entry's `sha256` and commit `versioning.json`
alongside the `index.js` change it matches. A stale `sha256` left over from
a previous version of a bundle behaves exactly like a tampered one to a
verifying app, and its install/update will be refused.

A "Verified" badge built on this field means only that the download matches
what this repo published. It's tamper-evidence, not a safety or review claim.
This repo does not review submitted sources' code for correctness or
malicious behavior beyond what maintainers happen to notice.

### Network scoping: the optional `hosts` field

A `versioning.json` entry may also declare `hosts`: the list of hosts this
source is allowed to reach, an exact hostname (`"example.com"`) or a
leading-wildcard entry (`"*.example.com"`, covering that host's subdomains
but never the bare apex; list it separately if the source also serves
requests at the apex itself). A compatible app enforces this at its own
request chokepoint (`App.createRequestManager` in the reference app), so a
source that tries to reach an undeclared host has that request refused
before it ever leaves the device. Declaring no `hosts` at all installs
unrestricted, exactly as before this field existed. It's fail-open by
design, same posture as `sha256` above.

**Only requests routed through the app's own request bridge are covered.**
A source's cover art and page-image URLs are typically loaded by the host
app's native image component, not through that bridge, so `hosts` says
nothing about where those may point. That's a real, currently open gap in every
app that implements this field today, not something publishing `hosts`
closes on its own.

## 6. Testing

`test-extension.mjs` checks that your extension is compatible with Boundless
(loads in a bare sandbox, exports the right methods, has a valid listing entry
and a matching `sha256`) and that it can fetch real results from the live site
(browse, search, every feed, details, chapters and actually opening them, plus
loading the first cover and page image the way the app would). See
[TESTING.md](TESTING.md) for how to run it and read the output.

```bash
npm install cheerio
node test-extension.mjs ./mysite/index.js "naruto"
```

## 7. Debugging

Open Settings, then Support, then Error Log in the app. A file that would not
load, a call that threw or failed, and every `console.warn` and
`console.error` line (prefixed with the extension's name, at most 50 lines a
minute per extension) are recorded there, with Share and Copy for the whole
report. `console.log`, `console.info` and `console.debug` go to the platform
log only. Call `console.error` with the reason before you rethrow, so the
reader's report says what failed.

To pick up a changed extension, bump its `version` in `versioning.json`, then
remove and re-add the repository in the app, or use Check for update on the
extension.

## 8. Checklist before you publish

- [ ] `node test-extension.mjs` reports no `FAIL` lines.
- [ ] No `fetch` / `URL` / `URLSearchParams` / `btoa` anywhere in the file, and no `Intl`, `toLocaleString()` or date text that is not ISO 8601 handed to `Date.parse` (the two engines differ).
- [ ] Covers use `image`, and every URL is absolute.
- [ ] Chapter dates use numeric `time` in **milliseconds**.
- [ ] Page 2 of Browse genuinely differs from page 1. Many APIs accept and
      silently ignore a `page=` parameter and paginate on `offset` instead.
- [ ] Pagination terminates; `metadata` becomes `undefined` at the end.
- [ ] Every advertised feed in `getSourceFeeds()` actually reorders results.
      A 200 response is not proof that a `sort=` value did anything.
- [ ] `getChapters` returns the *whole* list. List endpoints often cap at 100
      unless you pass a `limit`.
