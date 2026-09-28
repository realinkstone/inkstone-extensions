# Writing an extension

An extension is a single JavaScript file that exposes a `Source` class. The app
downloads it from a repo, evaluates it in a sandboxed JavaScriptCore context,
and calls its methods to fill the Browse, Search, Detail and Reader screens.

The format keeps the surface area small: implement a handful of methods on
that class and the app can browse, search and read through your source.

---

## 1. The runtime is JavaScriptCore, not a browser

This is the single biggest source of "it silently returns nothing" bugs.
JavaScriptCore gives you the ECMAScript standard library and nothing else.

**Not available**. Using any of these throws a `ReferenceError` that surfaces
in the app as an empty screen:

| Missing | Use instead |
| --- | --- |
| `fetch`, `XMLHttpRequest` | `App.createRequestManager().schedule()` |
| `URL`, `URLSearchParams` | build strings with `encodeURIComponent` |
| `setTimeout`, `setInterval` | (no timers; use `Promise` directly) |
| `btoa`, `atob`, `TextDecoder` | None |
| `document`, `DOM`, `DOMParser` | regex over the HTML string |
| `structuredClone` | `JSON.parse(JSON.stringify(x))` |

**Available:** `Promise`, `async`/`await`, `JSON`, `Math`, `Date`, `RegExp`,
`Intl`, `String.prototype.replaceAll`, `Object.fromEntries`,
`encodeURIComponent`, and the rest of modern ECMAScript.

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

All HTTP goes through the app's native `URLSession` bridge. Extensions never
touch the network directly.

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

`response.data` is always a **string**. There is no automatic JSON parsing.

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
| `getSearchTags()` | yes | `[{ id, label }]` (the genre picker) |

`getSourceFeeds()` is called at load time on the JS queue, so it must return
immediately: no `await`, no network. Omitting it gives you one "Popular" feed.

### `request` and `metadata`

`getSearchResults` is used for both Browse and Search:

```js
request = {
  title: 'search query',        // '' when browsing
  feed: 'popular',              // the selected getSourceFeeds() id (browse only)
  includedTags: [{ id: 'action' }],
  excludedTags: [],
  medium: 'comics' | 'novel',   // only when the app's medium toggle is set
}
metadata = null                 // first page
metadata = { page: 2 }          // whatever you returned last call
```

Return `metadata: { page: n + 1 }` to advertise another page, or `undefined` to
stop infinite scroll. **Returning a truthy metadata forever makes Browse loop
on the last page forever.**

## 4. Field names the app actually reads

Getting these wrong does not throw. The value arrives as `nil` and the field is
just blank in the UI, which is much harder to debug than a crash.

**Partial manga** (Browse / Search grid):

```js
{
  mangaId: 'slug',      // REQUIRED (`id` also accepted)
  title: 'Title',
  image: 'https://…',   // ← `image`, NOT `coverURL`. Must be absolute.
  author, summary, tags: ['Action'], webURL,
  medium: 'comics' | 'novel',
  rating, views, chapters, completed, releaseDate, publisher,
}
```

**Manga details**: same fields, nested under `mangaInfo`, with:

```js
{ mangaInfo: { desc: '…', status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN' } }
```

`desc` (not `description`) and `status` must be one of those exact uppercase
strings. Anything else maps to Unknown.

**Chapter:**

```js
{
  id: 'chapter-id',     // REQUIRED (`chapterId` also accepted)
  name: 'Chapter 12',   // `title` also accepted
  number: 12,           // `chapNum` also accepted; used for sorting
  group: 'scanlator',
  time: 1755731400000,  // ← numeric epoch **ms**, NOT a Date object
}
```

**Chapter details:** `pages` must be an array of absolute image URL **strings**.
The Reader decodes them as images via ImageIO. For a prose source (novels:
`medium: 'novel'`, or the novel side of a `'both'` source), return `pages: []`
and put the chapter body in `text` instead, as either one string or an array
of paragraph strings: `{ id, mangaId, pages: [], text: 'Chapter text…' }`.
The app has a real prose reader for this today. Roughly 20 of this repo's
own bundled sources (novelfire, royalroad, wuxiaworld, webnovel, and others)
already ship this way; it is not a theoretical capability.

Optionally, also return `referer: 'https://example.com'` (your site's own
origin) alongside `pages` if your page-image CDN checks the `Referer` header
and 403s without it. It's a common anti-hotlink measure and easy to miss,
because covers and the manga-detail HTML fetch usually still work fine and
only the actual page images fail. If chapters load but every page in the reader shows
"failed to load", check this before assuming your selectors are wrong: fetch
one page URL with and without a `Referer` header matching your site and
compare the status codes.

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
equal the `id`. `description` and `capabilities` are landing-page-only and
never read by the app itself, but `medium`, `website`, `iconUrl`, `language`,
`contentRating`, `minApiVersion` and `settingsSchema` are all read and copied
onto the installed record at install/update time. They drive real
in-app behavior (category filtering, the source icon, content-rating gating,
per-source settings screens), not just this repo's own listing pages.

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

## 6. Debugging

`console.log/warn/error` inside an extension goes to the device log tagged
`[ext:<source-id>]`. Runtime exceptions appear as `[JSRuntime:<id>] uncaught`.

```bash
xcrun simctl spawn booted log stream --level debug \
  --predicate 'eventMessage CONTAINS "[ext:" OR eventMessage CONTAINS "JSRuntime"'
```

The app only seeds a bundled extension when its stored list is empty, so
reinstalling the app is the reliable way to pick up local changes:

```bash
xcrun simctl uninstall booted com.ahmed.boundless
```

## 7. Checklist before you publish

- [ ] No `fetch` / `URL` / `URLSearchParams` / `setTimeout` anywhere in the file.
- [ ] Covers use `image`, and every URL is absolute.
- [ ] Chapter dates use numeric `time` in **milliseconds**.
- [ ] Page 2 of Browse genuinely differs from page 1. Many APIs accept and
      silently ignore a `page=` parameter and paginate on `offset` instead.
- [ ] Pagination terminates; `metadata` becomes `undefined` at the end.
- [ ] Every advertised feed in `getSourceFeeds()` actually reorders results.
      A 200 response is not proof that a `sort=` value did anything.
- [ ] `getChapters` returns the *whole* list. List endpoints often cap at 100
      unless you pass a `limit`.
