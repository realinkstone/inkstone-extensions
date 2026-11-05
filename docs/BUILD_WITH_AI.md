# Build an Inkstone extension with AI (beta)

**This is in beta.** It's new, and extensions built by an AI can have bugs. Always run the test script and try the result in Boundless before you share it.

You can have an AI assistant build a Boundless Reader extension for you. Point it at this page, tell it which site you want, and it can look the site over, write the code, test it against the real thing and package it for Inkstone. Everything it needs is below.

**The quick way.** Send your AI this message (swap in your own site):

> Read https://inkstone.web.app/docs/BUILD_WITH_AI.md and follow it to build a Boundless Reader extension for https://example.com

If your AI can't open links, paste this whole file into the chat first, then add the site on the last line.

**What you do:** pick a site, let the AI work, read what it reports back, try the result in Boundless, and send it in.
**What the AI does:** everything in between.

The extensions you build load in Boundless Reader and in Sumizuri. The details below describe Boundless's runtime, so test in Boundless, and in Sumizuri too if you can.

**Anime extensions are for the video apps.** An extension with `medium: "anime"` plays video through a `getVideos` method that [Sumizuri](https://sumizuri.notakari.com/) and Boundless Player call. Boundless Reader is not compatible with anime extensions. They are built to Sumizuri's documented contract, so install, play and test them in Sumizuri first. The section "Anime (video) extensions (Sumizuri and Boundless Player)" in Step 2 says how to build one.

Works with Claude, ChatGPT, Cursor, Codex, Gemini and anything else that can write code. It works best when the AI can run commands (curl, node), so it can check the real site instead of guessing.

**Why the instructions are so specific.** Every rule below comes from building and repairing real extensions in this catalog: blank screens, chapters that never loaded, covers that came back 403, lists that quietly stopped at page 5. Each rule is here because skipping it once broke a real extension.

**Prefer to approve a plan before any code is written?** Use OpenSpec instead: [OPENSPEC.md](https://inkstone.web.app/docs/OPENSPEC.md).

Inkstone is an independent project. It isn't part of Boundless Reader or Sumizuri and isn't endorsed by either.

---

# Instructions for the AI

You're building one extension for Boundless Reader: a single JavaScript file that lets the app browse, search and read one site. If the site is an anime site, the extension is for the video apps (Sumizuri and Boundless Player) and plays video instead: read "Anime (video) extensions (Sumizuri and Boundless Player)" in Step 2 before you start. Work through the steps in order. Ask the user a question only when you're truly blocked.

If the user asked for OpenSpec, or this repository has an `openspec/` folder and they want a plan first, follow [OPENSPEC.md](https://inkstone.web.app/docs/OPENSPEC.md) instead: propose a change named `add-<id>-extension`, stop for review, then apply. The steps below still apply. Step 1 becomes the findings in the proposal and design, Step 2 becomes the spec and tasks, and Steps 3 to 5 become the tasks you check off.

## What you're delivering

1. `<id>/index.js`, the extension. `<id>` is lowercase letters and numbers, like `asurascans`.
2. A `versioning.json` entry for it.
3. Test results from the live site, and a short report (the format is at the end).

## Ground rules

- **Only say what you've seen.** Every claim about how the site behaves should come from a request you actually made. If you haven't checked, you don't know yet.
- **Never invent data.** No placeholder titles, covers or chapters standing in for a real response.
- **Look again today.** What you remember about a site, or what an old comment says about it, may be out of date. Sites change their CDN rules, their APIs and their layouts. Check it now.
- **Never hand back a partial result as a whole one.** A chapter list that stopped early, or came back empty because a filter matched nothing, has to fail loudly or say what is missing.
- **Be gentle with the site.** Send a handful of requests, not hundreds. If it starts answering 429, slow down.
- **Public content only.** Don't work around paywalls or DRM, and don't try to solve CAPTCHAs. A reader signing in with their own account is fine as an optional setting (see Accounts below), but never ask the user for their password in the chat and never create an account.
- **Rate it honestly.** Set `contentRating` from what the site really serves, not from its name.
- **One site per extension.**
- **Keep the final file free of comments.** Put your notes in your report instead.
- **Stop early if it can't work.** A short "this isn't feasible, here's why" beats a half-working extension.
- **Say what you couldn't test.** Anything you only checked against a mock, or in a browser tab instead of the app, goes in your report as untested.

## Step 1: Look at the site first

Do these checks in one batch (one script, or a few curl calls sent together), then read the output once. Write down what you found.

1. **Find the real domain.** `curl -sIL https://site` and follow every redirect. Build against the domain that actually serves the content, so the extension doesn't pay for a redirect on every request. If the name no longer resolves at all (`curl: Could not resolve host`), the site has probably moved: find its new address and confirm it is the same site before you build, because the API usually changes with the move (Kagane left `kagane.to` for `kagane.org` and renamed fields at the same time).
2. **Check for bot protection.** With a normal browser User-Agent, request the homepage, a search page, a title page and a chapter page.
   - A Cloudflare "Just a moment..." page or a `cf-mitigated: challenge` header is fine. Boundless tries to clear the check in a hidden browser view and, when it cannot, lists the site under Security checks (Settings, then Network) so the reader can finish it in the browser, so the extension doesn't have to. Plain curl and Node get a 403 from such a site, so you can't calibrate against it from the command line: build from what a real browser shows, put `Cloudflare Checks` in the description's restrictions, and say in your report that it was not tested in the app. A site can also start challenging halfway through your work (one answered its first 150 requests and then challenged everything), so keep the request count low.
   - Repeat the same requests with a plain User-Agent (curl's own, or `Boundless/1.0 (+https://boundless.moe)`) and with none. A few APIs treat the two differently: MangaDex sends any browser looking User-Agent to its own proof of work page (a 302 to `/edge/challenge`, or a 403 `Bot challenge not passed`) and answers a plain one with the data. If the plain agent is the one that works, ask as the app does first (send no `User-Agent`, so the app's browser one goes out), and when the answer is the check page fall back to the plain agent for the rest of the session, which keeps the source working on app builds that cannot clear that check. Covers and pages on a host that checks the same way must declare the plain agent in `headers`, because a solved check is kept per host.
   - If curl fails before any HTTP response arrives (a TLS error like `alert access denied`), the site is rejecting non-browser clients outright. Treat that as a no-go and say so.
   - Fire five requests at once at one endpoint. If you see 429s, add a `rateLimit` (see Step 2).
   - A limit can also hide behind a 503 or a page that says "Connection limit reached". Dynasty Scans let 16 requests through, then refused the next, then let about 1.3 a second pass; it only showed up when 40 requests ran one after another, and a retry inside the extension made the deep-check tool miss it. Measure with a longer run (40 requests, at two or three different paces) and say which pace passed.
   - A page that asks the reader to solve something (a sum, a password box, "verify you are human") is a gate, not a bug. Do not script around it: report the chapter as locked (a 403 with a short message in the error) and say so in the description. Bun Manga locks its newest four chapters of every title this way.
3. **Look for a JSON API.** Many sites fetch their data from an API. Check the page source for `__NEXT_DATA__`, `__NUXT__` or hydration props (`astro-island` tags), search the site's JavaScript files for `/api/`, or watch the network calls in a real browser. Note whether the page uses `fetch` or `XMLHttpRequest`. A JSON API is far more stable than scraping markup. A WordPress site often has `/wp-json/wp/v2/<post type>?search=<q>&per_page=30&_fields=slug,link,title` for its own post type (the type is the first part of a title address such as `/series/<slug>/`), which can answer a search when its HTML search page sits behind a Cloudflare check (MyAsianTV, 2026-11-05); its JSON routes were challenged now and then too, so list the check under Restrictions. Check that a field you will read is a real name: a site can scramble the field names of the data it fetches in the browser (`dg`, `Cu`, `vl` for `items`, `id`, `name`) while its server-rendered pages keep the plain ones, and the scrambled names can change on any deploy. If you see that, read values by what they are instead (a chapter's own link carries its id and number, a list is the property holding an array of objects, a rating is one of a few known words) and check the result against the plain data on a few hundred items. A page's data can also hide in a script whose address is `data:text/javascript;base64,...` (a speed plugin does that to the page's own scripts): decode it with `atob` and search the result. A Next.js site on the App Router has no `__NEXT_DATA__`: its data is in the strings of `self.__next_f.push([1,"..."])` calls in the page, which joined hold the objects as JSON (`"novels":[{"id":...`). It is often the whole data set even where the page shows only a first page (a chapter list of 15 rows can carry all 1,589 chapters), and a long text field is not inline but `"$20"`, a pointer to a row `20:T<hex length>,<text>` whose length counts UTF-8 bytes, not characters. Walk the strings by hand instead of with one big regular expression, and make a changed format throw instead of returning a short list. Also note what a missing page answers: such a site may send status 200 with a "Not Found" heading. On an Astro site the data often comes from server actions: watch the network for `POST /_actions/<name>/` with a JSON body. The answer is `application/json+devalue`: one array where `values[0]` is the root, objects and arrays hold indexes into it, and `-1` is undefined; 25 lines decode it, and these calls needed no `Origin`, `Referer` or cookie. An Astro island's `props` attribute is another source of data: every value is written `[type, value]` (0 plain, 1 an array of tagged values), and a server rendered page can hold a show's whole TMDB record there.
4. **Sample widely.** Walk details, then the chapter list, then at least two chapters, for 3 to 5 different titles: a brand new one, an old one, different genres. This is the most valuable check there is. It catches sites that run two different reader layouts, and titles that are listed and searchable but have no chapters at all. Include a title that shows no chapters in your language: ask the API what that title does have (other languages, other sections) before you decide the request is wrong. Also find a fractional chapter (12.5, 219.5; scan the whole catalog for non-integers, a few titles have them) and open it: a site that addresses a chapter by its number can answer "219-5" or "219_5" with chapter 219 and no error, so compare the chapter you got with the one you asked for.
5. **Check ids are stable.** Note the id or slug of a few titles. If they carry a date or a long random suffix, fetch the listing again a few minutes later and compare. If the ids change, the extension has to cope with that.
6. **Read the raw HTML for each field.** Is the author plain text, or wrapped in a link or a span? A real HTML parser handles nesting, a regex quietly returns nothing.
7. **Check the images.** Fetch a page image three ways: with no `Referer`, with `Referer` set to the site, and with an unrelated one. Sites differ, and the rule can flip: one image CDN went from needing the site's `Referer` to rejecting any `Referer` at all. If the results differ, return the `referer` that works, or none. Then actually look at a downloaded image. If it's a jumble of tiles, that's image scrambling. The app can put back only one scheme (see `App.descrambleImage`), so unless the site uses that one, list it as a limitation. Boundless draws JPEG, PNG, GIF, WebP and BMP. AVIF is the grey case: the app's own engine decoded an AVIF page and cover to the right size in a headless test, but its tiler for very tall pages cannot read AVIF and nothing was checked on a device, so prefer the WebP or JPEG form of an image when the site offers one (a `<picture>` with an avif source and a webp img is common), and when AVIF is the only form, say so as a limitation. HEIC and JXL are not drawn. Cover size matters as well: Browse shows dozens at once, so if a cover is over about 300 KB and the site offers a thumbnail size, use it. WordPress sites often serve covers through the Jetpack proxy (`i0.wp.com/...`): adding `?w=300` returned the same cover at a tenth of the size (430 KB to 47 KB). That proxy answers 429 when many images load at once, so open images from the start, the middle and the end of a chapter, not only the first page. Check that a 200 really is an image (content type and first bytes): sites hand out one placeholder file for every page, or an HTML page where an image should be. Take the sample from the middle of a chapter, not its first image: one site put its own banner first, on its own host, while the real pages sat on a CDN with a different rule. A bot check can hang on the `Referer` alone: one video site answered plain requests everywhere, yet its images (covers and logo) answered a Cloudflare challenge (HTTP 403, `cf-mitigated: challenge`) to every request without its own `Referer`, and the image with it; an unrelated `Referer` was challenged too. A clean home page proves nothing about the images, so fetch one cover and one page image the three ways above on every site. The test script fails this case and prints the `referer` to return (the app sends only the headers and `referer` you return).
8. **Check the encoding.** Look at real output for any site with accents or Chinese, Japanese or Korean text. Current Boundless reads a page or JSON answer with no charset as UTF-8 and only images and other binary types as Latin-1, but older builds read any answer with no charset as Latin-1, and a site that names the wrong charset breaks every build, so UTF-8 text can arrive as mojibake (`Ã©` instead of `é`). If you see it, repair it with the snippet in Step 2, or look for a mobile or app API that serves clean JSON.
9. **Check the edges of pagination.** What does an empty search do? What does one page past the end do: an error, an empty list, page 1 again, or the last page again? A site that answers any page number with its last page makes a catalog look endless when you measure it, so find the end with the site's own total or its "next" link. A filter or sort address that quietly falls back to the default list looks like a working feed: one video site answered 200 with the newest titles for `/movies/popular` (no closing slash) and for `/movies/certificate/<anything>`, while `/movies/popular/` was the real popular list. Compare the first titles of every feed and filter with the default list, and with each other. A listing address that redirects (one site answered `/manga/` with a redirect to `/mangas/`) pages only on the address it lands on, and page 2 of the original address repeats page 1, so build against the final address and keep comparing page 2 with page 1.
10. **Check that each parameter really does something.** Send the request with and without it and compare. Typical traps: a search word sent under the wrong name is ignored (`q=` where the site wants `search=`, so search seems to do nothing), `sort=title` can run Z to A unless you also give an order, several genres can mean AND rather than OR, and a `page=` is ignored in favor of `offset=`, and a page size over the maximum is clamped without a word (a chapter list asked for 2000 at a time came back 100 at a time).
11. **Find how the site lists titles.** Watch how the homepage fills its latest, popular and new lists, and note the sort parameters. Every extension needs at least one feed that works with no search word.
12. **Look at the locked chapters.** Count them across the whole catalog, not one title. Are they paid, on a timer, or for signed-in readers only? What does an anonymous request for one return: an empty page, a preview, an error page?
13. **Look for a second catalog.** A site that adds novels, volumes or another language often has separate routes for them, with their own parameters and ids that can collide with the first catalog. The obvious-looking route can be a stub that ignores its parameters, so use the one the page itself calls.
14. **Check whether the site runs a shared engine.** Many sites are installs of a few engines and answer the same way: Madara (a WordPress theme; search is `/?s=...&post_type=wp-manga` and chapters are `li.wp-manga-chapter` rows), MangaThemesia (a WordPress theme that keeps a chapter's pages in a `ts_reader.run({...})` script), PizzaReader (a JSON API where `/api/comics` lists every title in one answer). Do not guess the engine from the homepage: a `wp-content` path is on every WordPress site and mislabelled half the sites checked. Open source extension projects for other readers say which engine each site runs. The Keiyoushi extensions for Mihon (github.com/keiyoushi/extensions-source) name it in each extension's `build.gradle.kts` (`theme = "madara"`), and their Kotlin shows the endpoints, selectors and tokens. Use that as a starting map, then check every claim on the live site, because sites change theme, move behind another address or lock their pages.
15. **Start from the reference extensions** in [github.com/realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions). Copy their structure:

| Reference | What it shows |
| --- | --- |
| `asurascans` | Comics and novels from one JSON API: feeds, genres, search, details, chapters, locked chapters and an optional sign-in |
| `chikari` | One site serving both comics and novels from a JSON API: it honors the `medium` toggle and returns text chapters for novels |
| `mangadex` | A public JSON API with settings (chapter language, data saver) and a fallback when a title has nothing in your language |
| `mangatoon` | HTML and embedded JSON, paid episodes marked locked, an optional email sign-in |
| `abertoverse` | Novels from a Next.js site with no API: the data is read from the strings the page streams to its own scripts (`self.__next_f.push`), and the images go through the site's own image optimizer |
| `navercomic` | Server-rendered pages, an age wall, and an optional login with session cookies |
| `mangafire` | A site that needs the web view: one page visit per title, shared by details and chapters (not yet timed inside the app) |
| `anikoto` | Anime, for the video apps: HTML pages, an embed player page whose source data is AES encrypted (read with the bundled CryptoJS), and subtitle tracks |
| `aniworld` | Anime in German, for the video apps: HTML pages and an embedded payload that is reversed base64 JSON (`App.base64Decode`) |
| `serienstream` | Series in German, for the video apps: HTML pages and the same kind of reversed base64 JSON payload |
| `miruro` | Anime, for the video apps: HLS playlists behind the site's own obfuscated proxy addresses, subtitles, and intro and outro skip ranges |

`asurascans`, `chikari` and `mangadex` read from a JSON API. For a site that only serves HTML, follow the `cheerio` guidance in Step 2 and look at `mangatoon`. Other extensions in the repo are fine for ideas, but some have rough edges, so don't copy them blindly.

**For an anime site, also check these** (the extension is for Sumizuri, see Step 2):

- **Where the stream comes from.** Open an episode page and watch its network calls, or read the player's embedded data. You want the stream address (usually a `.m3u8` playlist) and the call that gives it.
- **What the stream host wants.** Fetch the playlist with no headers, then with `Referer` and `Origin` set to the site, then to the player's own page. KickAssAnime's playlist answers 403 without its player's Referer; AniZone's and UniqueStream's answer either way. Return the headers that work. Test the WHOLE redirect chain, not the first answer: one video address answered 302 with or without a Referer, the next hop answered 500 without it and the final CDN address hung, while with it the final address served several ranges (use `curl -sL -H "Range: bytes=0-1023"` with and without the header and read the status of the last hop, then ask the final address for more ranges). If a stream needs headers, return them in `headers` on every entry.
- **Master or single.** A master playlist lists the qualities (count the `#EXT-X-STREAM-INF` lines); a media playlist is one quality.
- **Subtitles and audio.** Which languages, which file type (`.vtt` or `.ass`), and whether sub and dub are separate streams or separate audio tracks.
- **Skip times.** Does the player data carry intro and outro times, or a WebVTT chapters track with cues called Intro, Opening, Credits or Ending?
- **An episode with no stream yet.** Sites list episodes before they are encoded. Find out what that answers, so it can be an error with a clear message and not an empty list.
- **Whether addresses expire.** Fetch a stream address again a few minutes later.

**Decide go or no-go.** A TLS-level block, or a whole catalog behind a login, is a real "no". Say so plainly and stop. A login that only opens extra chapters is not: see Accounts in Step 2.

## Step 2: Write the extension

### The environment

The code runs in a JavaScript engine inside the app, not a browser. Boundless uses JavaScriptCore on iPhone, iPad and Mac and QuickJS on Android, so one file has to work on both. You get modern JavaScript (`Promise`, `async/await`, `JSON`, `Math`, `Date`, `RegExp`, `encodeURIComponent`) plus what Boundless provides: the `App` object, a `cheerio` global, a `CryptoJS` global, `console`, `setTimeout` (with `clearTimeout`) and `atob`.

There is **no** `fetch`, `XMLHttpRequest`, `URL`, `URLSearchParams`, `setInterval`, `btoa`, `TextEncoder`, `TextDecoder`, `Buffer`, `structuredClone`, `document` or `DOMParser`. Using one throws a `ReferenceError`, and in the app that just looks like an empty screen. Don't `require` anything either. Where you would use `btoa`, use `App.base64Encode`. `setTimeout` exists, but it is not a way to wait for a site (see Speed below), and older builds of the app have no `clearTimeout`, so don't rely on cancelling a timer.

**The two engines differ**, and the test script runs your file in Node, a third engine, so it cannot warn you. Each point below was checked by running the same code in JavaScriptCore and in QuickJS:

- `Intl` does not exist on Android. Don't use it. Don't use `toLocaleString()` for anything you return either: it gives `1,234.5` on iPhone and `1234.5` on Android.
- Date text is read differently. `Date.parse` and `new Date(text)` agree on ISO 8601 (`2024-01-12`, `2024-01-12T10:00:00Z`) and on `Jan 12, 2024`, but `12-01-2024` is not a date on iPhone and is December 1st on Android. Read any other date text yourself and build the time with `Date.UTC(year, month, day)`.
- `WeakRef` exists only on iPhone and Mac, and `queueMicrotask` on neither.

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
| `manager.schedule(request)` | Resolves to `{ status, headers, data }`. `data` is always a **string**, so `JSON.parse` it yourself. A 404 or 500 still resolves, so check `status`. Only network failures reject, and so does a host that is not in your `hosts`. The app waits out a 429 (or a 503 with a `Retry-After`) and retries it up to 3 times before you see the answer, and answers an identical GET (same address and headers) from a 90 second cache. |
| `App.getSourceSetting(key)` | Reads a value the user set in your extension's settings. Always a string, or `undefined`. |
| `App.createSourceStateManager()` | Returns `{ store(key, value), retrieve(key) }`, both async, for remembering things between calls. |
| `App.base64Encode(text)` / `App.base64Decode(text)` | Base64 in and out, as UTF-8 text. `base64Decode` throws if the bytes are not valid UTF-8. Boundless has `atob` for binary data (one character per byte), but Sumizuri's engine has none (its 0.2.0 source removes the one it needs while cheerio loads), so a bare `atob` call throws there: use `App.base64Decode` for text, and guard any `atob` with `typeof atob === 'function'`. A source that catches the error returns nothing, which looks like an empty site. The test script warns on a bare `atob`. |
| `App.requestBrowserVerification({ url })` | Shows the page to the reader in the app's browser and resolves when they close it, or after 3 minutes. For a check that needs a person. The address must be on your `hosts`. Almost no extension needs it, because the app clears ordinary Cloudflare checks itself. |
| `App.descrambleImage({ base64, headers })` | Puts back the pieces of one specific scrambled image scheme (a byte XOR and a 5 by 5 tile shuffle, switched on by `x-enc-*` and `x-scramble-*` response headers). Resolves to `{ base64 }` or `{ error }`. It is not a general descrambler. |
| `App.executeInWebView({ url \| html + baseUrl, script, timeoutMs })` | Last resort. Runs your `script` inside a real browser view, for sites that only hand out a token through their own page scripts. It resolves to `{ value }` or `{ error }`. Read "When the site needs the web view" below first, because it is easy to make slow or flaky. |

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
| `getSourceFeeds()` | `[{ id, name }]`, the Browse tabs. **Not async**: no `await`, no network. Leave it out and the app browses with feed `recent`. |
| `async getSearchTags()` | `[{ id, label }]`, the site's genres. Boundless matches a title's genre names against these labels to find related titles, so keep the labels the same as the names in your titles' `tags`. Return a flat list (not grouped sections), or `[]` if the site has no working genre filter. |

`getSearchResults` powers both Browse and Search:

```js
request = {
  title: 'search text',          // left out when browsing (it is never '')
  feed: 'popular',               // a getSourceFeeds() id; 'recent' for a search, a genre filter, or a source with no feeds
  includedTags: [{ id: 'action', label: 'action' }],   // left out when no genre is chosen; label is the id
  medium: 'comics' | 'novel',    // only if the user set the medium toggle
}
metadata = undefined             // first page
metadata = { page: 2 }           // whatever you returned last time (an object, or nothing)
```

Read every field with a guard (`request.title || ''`, `request.includedTags || []`): the
app leaves out what is empty. It does not send `excludedTags`, because it has no way to
exclude a genre, so an exclusion option an extension supports is not used today. When the
reader types a search or picks a genre the app asks feed `recent` whatever feeds you
declare, so a search and a genre filter must work with any `feed` value. The `metadata`
you return must be an object or nothing: a number or a string makes the whole page
unreadable.

Return `metadata: { page: n + 1 }` when there's another page and `undefined` when there isn't. A metadata that's always truthy makes Browse load the last page forever.

### Field names the app reads

A wrong field *name* never throws. The field just shows up blank, which is harder to debug than a crash. A wrong *type* does throw: the app casts `name`, `author`, `group`, `volume` and `text` to strings and `number`, `time` and `ageRating` to numbers, so `volume: 3` or `number: '12'` makes the whole list or screen fail instead of showing a blank.

```js
// Title in Browse and Search (PartialManga)
{
  mangaId: 'slug',        // required
  title: 'Title',
  image: 'https://...',   // "image", NOT "coverURL". Absolute URL.
  referer: 'https://site.com/',   // only if covers 403 without it
  author, summary, tags: ['Action'], webURL,
  medium: 'comics' | 'novel',
  ageRating: 0 | 16 | 18,   // minimum age, only if the site rates titles one by one
  rating, views, chapters, completed, releaseDate, publisher,
}

// getMangaDetails
{ mangaInfo: { /* same fields */, desc: '...', status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'CANCELLED' | 'UNKNOWN' } }

// Chapter
{
  id: 'chapter-id',       // required
  name: 'Chapter 12',     // a string. Some chapters have no title, so build it
  number: 12,             // a number, used for sorting
  group: 'scanlator',     // a string
  volume: '3',            // a string, optional, shown as "Vol. 3". Only if the site says which volume
  time: 1755731400000,    // epoch MILLISECONDS, not a Date
}

// getChapterDetails: comics
{ id, mangaId, pages: ['https://...'], referer: 'https://site.com' }   // referer only if needed

// getChapterDetails: novels
{ id, mangaId, pages: [], text: 'Chapter text' }   // one string, paragraphs joined with a blank line (an array is rejected)

// getChapterDetails: a chapter that is a book file (EPUB, MOBI or PDF)
{ id, mangaId, pages: [], text: 'Short notice with the link', book: { url: 'https://...', headers: { Cookie: '...' } } }
```

It's `desc` (or `summary`), not `description`, and `status` must be one of those exact uppercase words. If the site's description is markdown or HTML, pass it on as written: the app's own description cleaner turns bold, italics, links, headings and entities into styled text, so stripping them yourself only loses the emphasis. Remove only what it leaves behind, such as a backslash before punctuation.

**Book files (optional).** Some sites hand over a whole book instead of pages or text. Return `book: { url, headers }` next to an empty `pages`: Boundless Reader downloads the file itself (`headers` is optional, a `Cookie`, `Referer` or `User-Agent`, so it has to answer a plain download), turns an EPUB or MOBI into the text of the chapter and draws a PDF as pictures, once, and keeps the result. Files over 150 MB and PDFs over 1,500 pages are refused. Always add a short `text` notice as well, ideally with the file's link: an app version that does not know `book`, and a file that cannot be opened, show it instead of an empty chapter. The test script checks the shape of `book` but does not download it.

**Volumes (optional).** A source that can list a title's volumes returns `volumesId` in the details: any id of its own choosing for the title's volumes edition (MangaFire uses the title's id plus `~volumes`, a suffix that is safe in URLs and never part of a real id). The app then shows a Chapters / Volumes switch. Volumes lists `getChapters(volumesId)` and reads a volume with `getChapterDetails(volumesId, volumeId)`, so the volumes are a second series as far as the extension is concerned, and their progress, history, downloads and read marks are kept apart from the chapters' (they would otherwise be mixed: Continue picks the furthest chapter number). Each volume is a chapter-shaped entry (`id`, `name` such as `Volume 3`, `number`, and a `group` line such as `9 chapters`). It must be a string id. Leave it out when the title has no volumes. Apps without the switch ignore it.

`ageRating` is a number, the title's own minimum age, and only for sites that rate titles one by one (safe is 0, suggestive 16, erotica and pornographic 18). By default Boundless blurs 16 and up and hides 18 and up, and the reader can change that. A word like `contentRating: 'adult'` on a title is ignored. The `contentRating` in `versioning.json` is a separate thing that rates the whole extension.

### Settings (only if you need them)

If your extension has options (a language, a quality setting, a server URL), declare them as `settingsSchema` in its `versioning.json` entry. Each field has a `type` (`text`, `toggle`, `select`, `multiSelect` or `section`), a `key`, a `label`, and optionally `default`, `placeholder`, `secure` (hides passwords) and `options: [{ value, label }]`. Read the value back with `App.getSourceSetting('key')`, which gives you a string (so a toggle is `'true'` or `'false'`), or `undefined` when the reader never set it.

```json
"settingsSchema": [
  { "type": "select", "key": "language", "label": "Chapter language", "default": "en",
    "options": [{ "value": "en", "label": "English" }, { "value": "all", "label": "All languages" }] },
  { "type": "toggle", "key": "dataSaver", "label": "Data saver", "default": false }
]
```

If the site has its own content or language preferences, offer them as settings and send them the way the site does (read the site's own request to see the names and values): `kagane` has a content rating of Safe, 15+ or 18+ and a preferred chapter language, which become `age_rating` and `content_lang` in its search, and a default that keeps what the extension did before. A setting your code reads but the schema doesn't declare can never be changed: one extension read a language setting for months, and nobody could set it. A few published extensions do declare one (`mangadex`, `kagane`, `asurascans`, `mangatoon`, `navercomic`), so copy their shape. The fields only appear inside the app, so look at the settings screen there.

### Rules that keep an extension stable

These are the mistakes that broke real extensions. Check your code against each one.

**Lists, errors and paging**

- Return the **whole** chapter list. Many APIs stop at 100 unless you ask for more, and a pager can have pages you never walked. Compare your count with the total the site itself shows.
- **Throw when something fails. Don't return `[]` to hide it.** Boundless remembers how many chapters a saved title had and counts any rise as new chapters. A list that came back short (a failed page, a filter that matched nothing) gets remembered, and the next complete list then arrives as dozens of "new" chapters. An error is skipped and tried again later. Return `[]` only when the title really has no chapters, and call `console.error` with the reason before you rethrow.
- A search with no match returns `{ results: [] }` and no `metadata`. Some sites answer a no-match search with a 404 page: that is "no results", not an error.
- Page 2 of Browse must really differ from page 1. Plenty of APIs accept a `page=` parameter and quietly ignore it.
- Check that each feed in `getSourceFeeds()` actually reorders the results. A 200 doesn't prove a `sort=` value did anything.
- If the site repeats a chapter across the pages of its own list, list it once.

**Data shapes**

- Build every field the way the app casts it: strings for `name`, `author`, `group`, `volume` and `text`, numbers for `number`, `time` and `ageRating`. Real data is messy. One site had hundreds of chapters with `title: null`, so build the name as `title ? 'Chapter ' + n + ' - ' + title : 'Chapter ' + n`.
- Only set `volume` when the site says which volume a chapter belongs to. Don't work it out from the order.
- Cover and page image URLs must be absolute. Resolve relative ones against the site.
- Ids must survive a round trip through your own code, so don't rely on state from an earlier call. **Encode a path piece only once.** Some sites write their links already percent-encoded (Thai, Arabic and Vietnamese slugs look like `%e0%b8%95...`). If the id keeps that text and you call `encodeURIComponent` on it again, `%e0` becomes `%25e0` and the site answers a 404 (or a 200 page with no images). Decode first, then encode: `encodeURIComponent(decodeURIComponent(piece))`, with the decode inside a try for text that was never encoded. The title page and the chapter list can work fine while only the reader fails, so open a chapter of a title whose slug is not plain ASCII before calling a source done. **Don't change how ids are built in an update**: saved library entries and reading history are keyed by them. If a second catalog on the same site collides with the first (novels and comics shared 21 slugs), prefix the new ids only (`novel:the-slug`) and leave the old ones alone.
- `ageRating` is a number, and `undefined` when the site doesn't say. Don't guess "safe". A rating word you don't recognise should count as 16. When the list cards carry no rating but the title pages do (a certificate such as R, TV-MA or NC-17), rate each page of results by reading its title pages at once: 24 pages took 0.5 s and no throttling on one site, and a read that fails leaves that title's rating `undefined` instead of failing the list. Remember each result for the session. Scan the certificates of a few hundred titles before you choose the source's `contentRating`: a mainstream looking movie site had NC-17 adult films in its newest-added list and in search, 4 of 300 titles sampled.
- **A source level tag blurs nothing, so rate the titles.** The `contentRating` in `versioning.json` rates the whole extension and hides it on the Inkstone website, but the apps blur and hide by each title's own `ageRating`. When 38 Spanish sources were merged on 2026-11-05, almost none rated a single title, including the ones tagged `adult`, so explicit covers would have shown unblurred. Rate in this order: a site that is entirely explicit (a hentai site) sends `ageRating: 18` on every result and every detail page; where the cards carry no genre, read the titles of the explicit genre once per session (6 titles on one site, 40 on another, 64 on a third, a few pages each), rate those in lists and details, and do not remember a failed read; always rate a title page from its own genres (hentai, erotica, smut, +18 and porn are 18; ecchi, adult and mature are 16; "adult cast" only says the characters are adults); and rate every card of a filter on an explicit genre. A site's own lists can put an explicit title first (one movie list opened with a Filipino VMX title). The Boundless Player sends each chosen genre as `{ id, label }` with the label set to the id (read in its source, 2026-11-05), so look the genre's name up in your own `getSearchTags()` list, and test with ids, not with names you typed.
- **Do not pin a host that rotates.** VOE, and every site that embeds it, changes its domain (`shanelocaldog.com`, later `shannoncoldalready.com`). A fixed `hosts` list then fails the test and can block the stream. For such a source leave `hosts` out (empty means no limit), as AniWorld, SerienStream, DoramasYT, Gnula and VerAnime do. Vidmoly's stream host changed family between two runs (`vmget.online`, then `vmpx.online`), so list every family you see.
- **A human check is not yours to defeat.** A player page that answers "Confirm you're human to start the video" (VOE's ALTCHA proof of work, a Turnstile widget, a captcha) is a bot check. Do not write a solver for it. Hand the player page to the app as a `type: 'embed'` entry after the streams you could read, so the app's own web view runs the page's script, and say in your report that you could not read that server yourself. A check can also appear only after many requests from one address: pace your own testing.
- **A name that does not resolve is not proof the site is gone.** A VPN or DNS filter can refuse live sites: one phone answered NSURLErrorDomain -1003 for five working sites while public DNS answered for all of them. Before you call a source dead, ask both `dig @1.1.1.1 <host> A` and `dig @8.8.8.8 <host> A` (and AAAA). NXDOMAIN on both is gone. SERVFAIL on both can be a broken DNSSEC record, so try `dig +cd`, then `dig +trace`, whois for the expiry date, the `www` name (a CNAME to a registrar parking page means the domain lapsed into parking), the address the name resolves to, and a search for a new domain or an announcement. Say what you saw; archive a source only when the host is really gone.

**Speed**

- Boundless opens a title by asking for its details and its chapters at the same moment. If both come from the same page or request, fetch it once: keep the pending promise in a `Map` keyed by id for a few minutes, and delete the entry if it fails.
- When the site pages its chapters, read the first page for the total, then fetch the remaining pages together with `Promise.all`, not one after another.
- No `rateLimit`, and no waiting, unless the site really pushed back with a 429 or a "connection limit" 503. A fixed delay for something you could detect is a bug. `setTimeout` exists, but don't use it to sleep: a request that was refused is sent again through the same manager, and its declared spacing is the pause. The app already waits out a 429 (or a 503 with a `Retry-After`) and retries it up to 3 times, so a source that only works because of that is slow, not fixed. The test script spaces requests by your declared `rateLimit` the way the app does, so run it after you add one.

**Language and region**

- If the site filters by language, don't show "No chapters yet" for a title that has chapters in another language (one MangaDex title had 11, all Portuguese). Offer a `select` setting with an "All languages" option, and when the wanted language has nothing, fall back to the language the title does have and name it on each chapter. Ask the API what a title has (a list of languages, or a count per language) instead of guessing.
- Read dates the way the site writes them. Sites in other languages print `hace 3 horas`, `3 saat önce`, `5 jam yang lalu`, `12 de enero de 2024` or `12 Ocak 2024`: turn the unit and month words into milliseconds yourself (a small table per language) and leave `time` out when you cannot read a date. Never fall back to today's date, because every chapter would then look new. Look at the first page of the real list for dates your code does not understand.
- Rate adult content by the words the site uses for it in its own language (Adulto, Maduro, Yetişkin, Dewasa, Người lớn, ผู้ใหญ่, بالغين), and read the real titles and blurbs as well: some sites hide adult words behind spelling tricks and print no genres on the title page.
- Set `language` in `versioning.json` to the site's own language, and leave titles and descriptions as the site wrote them.

**Redirects and text**

- Boundless doesn't follow a `POST` answered with a 301 or 302 (only a 303). Read the `Location` header and follow it yourself.
- Older builds read a response with no charset as Latin-1, and a site that names the wrong charset breaks any build, so UTF-8 text such as `é` can arrive as `Ã©`. Repair it when you see that:

```js
function fixUtf8(text) {
  if (typeof text !== 'string' || !/[Â-ô][\u0080-¿]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch (e) {
    return text;
  }
}
```

### Locked, paid and early-access chapters

List every chapter, locked ones too, so the reader sees the real count. Mark each locked one with a short suffix on its name:

- **Timed early access** (free after a delay): end the name with `(Locked, unlocks in 5h 3m)`. The app understands exactly this shape (`Xh Ym`, `Xh`, `Ym` or `moments`) and shows a lock icon with a countdown instead. Work the time out from the site's own unlock date each time you build the list.
- **Paid, or locked any other way**: add a plain suffix such as `(Locked, Coins)` or `(Locked, 100 shards)`. The app shows it as ordinary text.

Read the whole catalog before you choose. On one site the comics had a 6 hour timer while every locked novel chapter was paid with no timer, so a countdown would have been wrong for half of it. When a locked chapter is opened, return what the site really serves: the free preview pages or an empty `pages: []` for comics, and for novels `pages: []` with a `text` that says why it's locked and how to read it, never a blank chapter. Don't hide locked chapters and don't invent an unlock.

### Accounts (optional)

Some sites open more chapters to a signed-in or paying reader. An extension can offer that as an optional setting. The reader signs in with their own account, and you never handle anyone else's.

- With no account set, behave exactly as before. If signing in fails, fall back to that, and say why where the reader will see it (for a novel, the text of the locked chapter works).
- Declare the fields in `settingsSchema` (`secure: true` hides a password). Never put credentials in the code, and never log a password or a token.
- Find the exact sign-in calls in the site's own login page script instead of guessing them. Keep the token with `App.createSourceStateManager()`, reuse it for a few hours, and renew it once when a request is refused. Put a ceiling on every retry (one sign-in attempt a minute, say), so a site that never signs you in can't cause a loop. List the login host in `hosts` as well.
- If the site's sign-in is built to resist scripts (an encrypted password, captchas, security emails, device checks), don't script it, because that can lock the reader's account. Take the session cookies from a browser the reader is already signed in with, as `secure` settings, and send them only to that site.
- A site that keeps the login in cookies (its own client sends every call "with credentials" and sets no Authorization header) needs its cookies handled by hand: the app has no cookie jar for an ordinary extension. Read `set-cookie` from the sign-in reply (several arrive as one string joined by a bare comma, and an `Expires` date has a comma in it too, so split only at a comma that is followed by `name=`), keep the name and value pairs with `App.createSourceStateManager()`, send them as a `Cookie` header only on the calls that depend on the account (and only to that site's own hosts), merge any fresh `set-cookie` a later reply brings, drop one the site expires (`Max-Age=0`), and when a call answers 401 try the site's refresh call once, then sign in once more, then read anonymously. Never call a site's buy or unlock endpoint: the account is for reading what the reader already has.
- Content that only a login opens keeps its rating (a 19+ title is `ageRating: 18`).
- Never ask the user for a password or a cookie in the chat. You can't test a signed-in path without an account, so test it against a mock server, and write "not tested with a real account" in your report and in the `description`.

`asurascans` and `mangatoon` sign in with an email and password, `navercomic` uses session cookies, and `qimanga`, `exnovels` and `ezmanga` sign in with an email and password and keep the login in cookies (not tried with a real account).

### When the site needs the web view

`App.executeInWebView` is the last resort, for a site whose requests carry a token that only its own page scripts can make. These are the hardest extensions to get right, and they usually go wrong by being slow or flaky. What to know:

- Boundless runs web view calls **one at a time** for the whole app, and each one is a full page load. Two calls per title (details, then chapters) cost two page loads in a queue. Make **one visit** that returns everything the screen needs (for example the details URL and every chapter page URL), remember it per title for a few minutes, and share it between `getMangaDetails` and `getChapters`. A signed URL can usually be replayed outside the page, so fetch the actual data with a plain request. Check that it really can be.
- Your script gets three helpers: `__reportResult(value)`, `__reportError(message)` and `__fetchJSON(url, options)`, which throws `Error('HTTP ' + status)` on a non-2xx answer. End every path of your script with one of the two report functions. The call resolves to `{ value }` or `{ error }` and never throws, so check `'error' in result`. A fourth, `__watchFetch(urlSubstring, idleMs, timeoutMs)`, collects the addresses of matching page requests, but it only sees `fetch` calls made after your script starts (see the next points). The address you open must be on your `hosts`, even when you pass `html` with a `baseUrl`, and a successful run is remembered for 45 seconds for the same page and script.
- The script runs once the page has loaded. A site that makes its requests while the page starts has already made them (set `runBeforePageScripts: true` to inject earlier). Many sites use `XMLHttpRequest` rather than `fetch`, so wrapping `window.fetch` alone sees nothing. Read the page's own list of requests instead: `performance.getEntriesByType('resource')` holds every one, from before your script ran.
- Timers get slow in a view nobody is looking at: in a hidden browser tab, a walk that took 0.3 seconds took 17. Poll with a `MessageChannel` tick for the first quarter second, then a short timer. In a test web view with no window, timers can stop altogether after a few seconds (a 500 ms interval stopped after 7 s), so wait for things with events (a wrapped `fetch`, a `MutationObserver` for a button that appears) and work out "how long has it been" from `Date.now()`, never by counting timer ticks.
- A site that puts an age prompt in front of a reader needs the prompt cleared before it sends the page list. Find out what the button does before you press it for the reader, say in your report that the extension presses it (the app's own content settings already hide or blur 18+ titles), and do not press it yourself while testing unless the user said to.
- To walk a list through the site's own pager, click its page number yourself, one click per page, and count the pages yourself. Several clicks in the same moment collapse into one request, and the pager marks a page active only after it redraws, which lags on a phone, so don't read that back. Read the total from the first page of results so you know when to stop and which page you missed.
- If the visit missed pages, repeat it once, then throw. Never return a short list.
- The most reliable way to make a web view source fast is to need the page less. Check whether the token the site's scripts put on a request is a fixed function of the URL: load the same page twice (or a day apart) and compare the tokens, and replay a day-old URL with a plain request. One site's tokens were identical a day apart, so every URL its page produced is remembered with `App.createSourceStateManager()` (as one capped list per kind, so storage cannot grow without limit) and replayed with a plain request next time: a title opened again after a relaunch took 84 ms instead of 3 seconds, and a chapter read before 30 ms. Anything remembered that stops working is dropped and found the slow way once. A token that does depend on time or a session cannot be remembered this way.
- Start the script from the page's first moment (`runBeforePageScripts: true`) when the site makes its requests as the page starts: the call then ends when the site has made them, not after every image and ad has loaded (0.7 s against 1.3 s in WebKit with a cold cache). Give that early attempt a long enough runner timeout for a long walk, and a short wait inside the script for "the page never made its request", then try once more the usual way (a security check page is only waited out for scripts that run after load).
- Walk a site's pager one page at a time: click, wait for that page's RESPONSE, then click the next. Moving on as soon as a request was seen raced ahead of the pager and stalled in WebKit, and clicking every visible number in a burst made the site reset its pager to page 1 and freeze. The site can also rebuild its pager from page 1 while it is still starting (seen in 2 of 25 runs), so read the pager again at every step, click the nearest number below the one you want if it is not shown, and cap both the steps and the total time. Compare the pages you collected with `meta.lastPage`.
- A browser tab is not the app's engine. A walk that was clean in a Chromium tab stalled in WebKit, which is what the app uses on iPhone and Mac. On a Mac, a small Swift program with a `WKWebView` (the helper shim defined, the script installed at document start, a fresh non-persistent data store for a cold cache) runs the exact script in that engine: run it 20 to 40 times, because failures that happen one time in ten only show up that way.
- Test the exact script in a real browser tab first: open the page, wait about 2.5 seconds, define stand-ins for the three helpers, evaluate the script text, and check the result against the site's own totals. The test script can't run web view code, so say in your report which engine you tested it in and that it was not tested inside the app.
- A site behind a Cloudflare check can be served **entirely** by the web view. When the app's own HTTP client cannot reuse the site's clearance, Boundless answers every plain request for that site by loading the URL in its hidden web view and returning the page's HTML with status 200. A page of HTML reads the same either way, but a JSON endpoint comes back as `<html><head>...</head><body><pre>{...}</pre></body></html>`, so a bare `JSON.parse` fails with "unexpected token '<'" (seen on a phone: the chapter list of a novel site failed after three attempts and 70 seconds, because each attempt was a whole web view load, one at a time for the app). If the body starts with `<`, read the JSON out of the `<pre>` and remember that this site is in this mode. A plain curl or Node request to such a site gets a 403, so the test script cannot reach it: say so in your report. For a list that needs many requests, run ONE `executeInWebView` visit whose script fetches every page from inside the site's own page (same origin, so no clearance problem, and real timers for pacing and retrying a 429), and send the rows back in one result. Keep the plain one-request-per-page path as a fallback if the visit fails.
- A web view script is usually built inside a JavaScript template literal, and a template literal swallows backslash escapes: a `\s` or `\d` in your script reaches the page as `s` or `d`, so a regex silently matches the wrong thing (here it would have rewritten every `s` in the chapter names). Print the generated script and read it, or avoid escapes in the page code and tidy the data on the extension side.
- A site where every page image needs its own request can return the text `boundless-lazy-page` for each page, and answer `getPageData(mangaId, chapterId, pageIndex)` with `{ uri, referer, headers }` for a URL, `{ base64, mimeType }` for the image itself, or `{ error }`. No published extension uses it right now (one did until its page images turned out to be plain URLs again, with no Referer).

### Anime (video) extensions (Sumizuri and Boundless Player)

**These extensions are for the video apps.** Boundless Reader is not compatible with anime extensions: it has no video player and does not call `getVideos`. [Sumizuri](https://sumizuri.notakari.com/) and Boundless Player play them. Boundless Player calls `getVideos` the same way (checked in its source on 2026-11-05), but nothing below has been tested against it, so install, play and test in Sumizuri first. The rules below are from Sumizuri's own extension documentation and engine source (version 0.2.0), first checked against three anime extensions that the catalog has since replaced with `anikoto`, `aniworld`, `serienstream` and `miruro` (not rechecked against those four). Everything else in this guide (feeds, search, details, episode lists, rate limits, the `App` object, the test script) applies to them unchanged. This section is only what is different.

- **Manifest.** `medium` is `anime` and `capabilities` is `["browse", "search", "details", "chapters", "videos"]` (there is no `reader`). In the public repository the file lives in `anime/`, `donghua/`, `drama/` or `western/`, as `<folder>/<id>/index.js`: the first word of the `description` (Anime, Donghua, Drama or Western) picks the folder, and `medium` stays `anime` for all of them.
- **Episodes are chapters.** `getChapters(mangaId)` returns the usual shape, newest first: `id` (or `chapterId`), `name` such as `Episode 12: Title`, `number`, `time` in milliseconds. `language`, `isLocked` and `unlockAt` work as for chapters. Do not send `group` for video: it means a release group, a video title has none, and the Boundless Player shows no group for video (an extension that sent each episode's length as `group: "38 min"` got "38 min" and "40 min" as filter entries before the Player ignored it). Boundless Player reads these optional episode fields instead: `title` (the episode's own name apart from the number), `thumbnail` (a full http or https address), `duration` in **seconds** (a value over 100000 is read as milliseconds; zero and negative values are dropped) and `summary` (plain text), besides `season` and `seasonName`; leave one out when the site does not have it. Nothing is read from `getChapterDetails` to play an episode; the catalog extensions return `{ id, mangaId, pages: [] }` from it. Titles may carry `medium: 'anime'`.
- **Episode numbers.** Read `number` out of the site's own label, which often holds more than digits: `12`, `S2E290`, `S4 E378-379` (two episodes in one post), `1 to 2` or `S1P04` (season 1 part 4). `parseFloat` on those gives NaN, so the episode ships with no `number`, and the test script still passes because `number` is optional. Take the number from the label, then from the title (`Episode 12`; one site wrote `Episod 209`), count a batch as its last episode so continuing moves past it, and leave `number` out for a PV, a trailer or an information post instead of inventing one. An episode with no `number` has nothing to sort or continue from.
- **`getVideos(mangaId, chapterId)` plays an episode.** It returns a list, one entry per stream. It must be an array: `{ videos: [...] }` gives no video.

```js
async getVideos(mangaId, chapterId) {
  const episode = await this.json(`${API}/episode/${encodeURIComponent(chapterId)}`);
  if (!episode.stream) throw new Error('This episode has no stream yet');
  return [
    {
      url: episode.stream,
      quality: 'Auto',
      headers: { Referer: 'https://example.com/' },
      subtitles: [{ url: episode.vtt, label: 'English', language: 'en' }],
      intro: { start: 90000, end: 180000 },
      outro: { start: 1300000, end: 1390000 },
    },
  ];
}
```

| Field | Needed | What Sumizuri does with it |
| --- | --- | --- |
| `url` | yes | The stream, a full address. An entry without one is dropped silently. |
| `quality` | no | A text label. Sumizuri reads it (see below). |
| `server` | no | A short name for the server or host that serves this stream (`VixSrc`, `VidSpark`, `Dailymotion`, `Citadel`), the same string on every episode of the source. Send it when your source offers more than one server or can have another later. The Boundless Player is being changed to group its Servers panel by it, to remember the last one that played for each source and to start the next episode on it; builds that do not read it ignore it, so it is safe to send now. Keep `quality` for the resolution and the language, and keep the server name in `quality` as well until the grouping is released. |
| `headers` | no | An object of strings sent with the stream requests, such as `Referer` and `Origin`. |
| `subtitles` | no | `[{ url, label, language }]`. A track without a full `url` is dropped. `language` is a code such as `en`; the player picks the person's language by code or label. |
| `audio` | no | Separate audio tracks, the same shape as `subtitles`. |
| `intro`, `outro` | no | `{ start, end }` in **milliseconds**, with `end` after `start` or the range is ignored. The player offers to skip them. |

- **Label `quality` for the player.** Sumizuri ranks videos by a height in the label (`1080p`, `720p`, `4k`) and recognizes the words `Sub`, `Dub`, `Softsub` and `Hardsub`: they drive the person's audio preference and the switch between a subbed and a dubbed version. A stream with several qualities is `Auto` (add the word, for example `Auto Dub`). If you offer both a sub and a dub, say which is which in the label. Name the host once: a site's own label `Hardsub English Dailymotion AX` already says it, so do not add ` (Dailymotion)`, while a bare `DM` or `Player` says nothing and should become `Dailymotion`.
- **Return an HLS master playlist once.** Sumizuri fetches an address whose path ends in `.m3u8` (with your `headers`) and offers each quality itself, tallest first. Do not list the qualities yourself. An address that does not end in `.m3u8` (UniqueStream's ends in `/hls/m3u8`) is played as given.
- **Headers.** Put `Referer` (and `Origin`) in `headers` when the stream host checks them, and test with and without, as in Step 1.
- **Sites that only embed other people's players (western movie and series sites).** These sites list a dozen servers per title (`data-link` embed addresses keyed by a TMDB id) and host nothing. Read only the servers you can prove, and say which. One that works with a plain client: VixSrc (`vixsrc.to`), where `GET /api/movie/<tmdb>` or `/api/tv/<tmdb>/<season>/<episode>` answers `{"src": "/embed/..."}`, that page holds `window.masterPlaylist` (`url`, `token`, `expires`) and `window.canPlayFHD`, and `<url>?token=&expires=` (plus `&h=1` when FHD is allowed) is an HLS master that needs no `Referer` and no cookie; its default audio is Italian, so add `&lang=en` for English. Ones to leave out: a player whose own script calls a challenge route first (CineSrc: `/api/c/bootstrap`, `/issue`, `/stage2/issue`), a link endpoint behind a Cloudflare "Just a moment" page (PrimeSrc's `/api/v1/l`), and a payload that is encrypted for the player's script (xpass: it was not looked at beyond seeing that). Do not solve the challenges; name them in your report. A payload sealed with a key that is a constant in the site's own public script, and that the page serves to every visitor, is a different thing: Bingr's `sealed` stream list is a keyed stream cipher of about 30 lines, and decoding it reads what any visitor receives, not a check that tells a person from a program. It is still your call: say in the report that you used it and which constant, and do not reproduce anything that needs a challenge, a captcha or a token bound to a host you do not control. A site whose only server is one of them is a no-go for a source under that site's name, and playing another provider under it would misrepresent it.
- **Lists can answer empty once.** One site's list call answered `{results: [], total_pages: 2}` and, on the very next identical call, a full page of 20 (a title page also answered 404 once and 200 on the next try). Ask again, up to twice, when the first page of a list is empty, and once more for a title page, instead of showing "No results". Keep it to a retry: a site that resets the connection after many pages in a few seconds is telling you to slow down.
- **A site's own flags rate its lists for free.** TMDB style records carry `adult` (and one site added `softcore`) on every list item. Use them for `ageRating: 18` at list level when they are set, and say in the header how many items you counted with them set (0 of 300 on the site that keeps explicit titles out of its lists). A site with no such flag needs the certificate on each title page instead (see `ageRating` above).
- **Measure how much of the catalog plays, per feed, a few requests at a time.** A provider has only part of what the site lists, and the share differs a lot between the site's lists. Take 48 titles from each feed (the first two pages), follow each one through the provider's whole chain (its API, the embed page, and a fetch of the master playlist) and count only the ones that end in a playlist; keep the status codes. One site's provider played 100% of the popular and top rated movies and series, 31% of the movies "by year", 42% of the newest series and 0% of the newest movies (the API answers 404 for titles that are too new). Run it with 4 requests at a time: a first run that fired 72 at once read the same provider as 63% and 33% on the popular movies, because part of the answers under that burst were not 200 and were counted as "missing" (the statuses were not recorded, so nobody could tell). Put the lists with the highest share first (the first feed is the one people open), say the numbers in the file header and in your report, and make the error say so (`VixSrc has no stream for this title yet`). The test script fails the episode checks on titles the provider lacks, whatever you do: read which titles failed, and show titles that do play.
- **Several audio languages per title.** One site returned a stream for each language of a title (English, Original, Hindi, Ptbr, French, and names ending in "sub" for a hardsub over the original audio). Label each by what it is (`English audio, 1080p`, `Hindi audio Dub, 720p`, `Original audio, Hardsub Arabic, 1080p`), sort English first and the original next, and keep the taller stream first inside a language: the person opens the list and reads it. Some titles have only a dub (the same site had only Hindi for The Matrix on one day).
- **Free plan stream hosts.** A stream behind Cloudflare Workers on a free plan can answer HTTP 429 (error 1027, quota) for hours and work again later. Nothing in the extension can fix it; say in the report that it happened and when, and take the host from the payload each time instead of remembering one.
- **Let a security check reach the app.** When `manager.schedule` rejects with `kind === 'challenge'` (the app's own text is "Could not get past <host>'s Cloudflare check."), do not catch it and throw your own `Error`: the app reads the kind and the origin to offer the reader a Verify button, and your text hides both. Do not retry it either. If you ask several servers and want fallbacks, collect the failures and, when all fail and any one was a challenge, rethrow that original object. Keep every stream host in `hosts` (the app only offers a check for origins the manifest allows) and never put a Cookie or User-Agent into `headers`: the app adds the cleared session's own to the stream, subtitle and audio requests for that host. The same goes for your own calls to a host that may show a check: leave your own `User-Agent` out of them. The Player sends the cleared session's agent if one is saved, else the one your call names, else the device web view's, and the web view's is the one its solver clears the check with, so a Safari string you invent only adds a mismatch (read in the Player's `withBrowserIdentity`; that leaving it out avoids a first check on a distrusted network is not yet confirmed on a phone).
- **The app caches a repeated GET.** The first answer of a GET is kept for 90 seconds, so a retry of the same address gets the same answer from the cache, and a page that was empty by chance stays empty. Retry with a different query (`?r=1`) or on a request the cache does not keep (a POST). A connection that is reset is worth one more try, in every request helper: a source that never retried lost whole title pages to one reset.
- **Ask a title's servers at once.** A source that lists two or more servers should ask them in parallel and keep whichever answer: a slow Cloudflare wait on the first no longer holds up the second, and a phone where one host does not resolve (a tunnel, Private Relay or a DNS filter made `vidspark.to` fail on one phone while `vixsrc.to` was challenged) still plays from the other. The Player shows only "This episode has no stream" for a failure; its device Error Log has the engine's own error with the file and line, so ask the owner for that line before guessing.
- **Keep the `quality` label short.** A master with 25 subtitle languages made a 300 character label; write `Softsub: English and 24 more` and list names only up to three.
- **Embedded Dailymotion players.** Many video sites embed the same Dailymotion player. Its metadata call, `https://www.dailymotion.com/player/metadata/video/<id>`, answers the HLS master (`qualities.auto[0].url`) and the subtitle files, but only to a request that sends the site's episode page as `Referer`. Called with Dailymotion's own address as the `Referer` (for example from a Dailymotion tab in a browser) it answers 200 with `"private": true`, error `DM010` and no `qualities`, which looks like a dead video and is not. The master itself answers 403 to curl and Node and 200 to a real browser (checked 2026-11-05 on seven sites), so the test script's stream step fails for these sources whatever you do and everything before it passes. Prove playback another way: take the master address your extension returned, fetch it, one variant playlist and one segment in a real browser (all three answered 200 on every one of the seven), and say in your report that you did not try it in the app. Send `headers: { Referer: 'https://www.dailymotion.com/', Origin: 'https://www.dailymotion.com' }` on the stream: the Player's own probe got 403 on some manifests without them and 200 with them, and Apple's AVPlayer plays the stream with and without them (checked 2026-11-05), so they cost nothing. A Node 403 on a Dailymotion manifest is therefore not proof that the app fails; opening the master in AVPlayer (a few lines of Swift with `AVURLAsset` and `AVPlayerItem`, watching `status` and `error`) is the closest test you can run on a Mac.
- **A mirror list can change shape.** AnimeStream sites usually put base64 of the player html in each `select.mirror option` value. LMAnime switched on 2026-11-05 to plain page addresses (`https://lmanime.com/<episode>/v/1/`, 10 to 21 per episode, each page holding one player iframe), and an extension that only decoded base64 dropped every mirror and kept just the default player, which is a Dailymotion video on some episodes only. Read both forms: decode a value that is not an address, fetch one that is (with the episode page as `Referer`, a few at a time, and stop once you have enough players you can open), and take the `iframe` `src` of each page. When a source starts failing with "no player", compare today's `select.mirror` values with what the extension expects before suspecting the site's streams.
- **Player pages the app opens itself (`type: 'embed'`).** A `getVideos` entry `{ type: 'embed', url: '<player page address>', quality, server }` hands a player page to the Boundless Player, which resolves it to a stream before playback, so you do not write a resolver for each host. The hosts it opens, as of 2026-11-05 (iPhone build; the Android build is not rebuilt yet, and an older build lists the page address as a server that fails to open): `dailymotion.com` and `dai.ly`, `rumble.com`, `ok.ru`, `mp4upload.com`, the VidHide family pages `morencius.com`, `vidhide.com` and `earnvids.com`, Vidmoly (`vidmoly.org`, `.biz` and `.net`), Streamtape (`streamtape.com`, `.to`, `.net` and `.xyz`, and `streamta.pe`) and MixDrop (`mixdrop.*` and `mxdrop.click`). Put the streams you resolved yourself first and the embed entries after them, and keep `server` the player's name (`Dailymotion`, `Rumble`, `OK.ru`, `mp4upload`, `VidHide`, `Vidmoly`, `Streamtape`, `MixDrop`). The manifest `hosts` must list the embed page host, every host the resolver asks and every host of the stream it returns: `www.dailymotion.com` or `*.dailymotion.com`, `rumble.com` and `*.rumble.cloud`, `ok.ru` and `*.mycdn.me` and `*.okcdn.ru` (OK.ru media hosts not seen yet), `*.mp4upload.com` (the port is ignored), `morencius.com` and `*.acek-cdn.com`, Vidmoly's `*.vmget.online` and `*.vmpx.online`, Streamtape's `*.tapecontent.net` and MixDrop's `*.mxcontent.net`; a stream on an unlisted host is dropped. Facts measured on a Mac with Apple's AVPlayer: mp4upload's media address answers 403 without `Referer: https://www.mp4upload.com/`; Rumble's `embedJS` API answers only a non browser User-Agent (a phone or Chrome agent gets a Cloudflare page) and its `.tar` files are not playable, only `ua.hls.auto.url`; a morencius page holds a packed script whose `links` object has the HLS master. A taken down video is gone on every host: Dailymotion answers 200 with an error and no `qualities` ("removed due to a breach of the Terms of Use"), mp4upload answers a 16 byte "deleted" page, so test embeds on a recent episode. OK.ru and the other VidHide hosts could not be tested from the author's network.
- **Three file hosts and the page sniffer (measured 2026-11-05 on a Mac with Apple's AVPlayer).** Vidmoly's embed page holds a plain JW setup, `sources: [{ file: '<master.m3u8>' }]`, and the master needs no header. Streamtape's page hides decoy links in hidden elements with other tokens; the real address is the LAST script assignment `getElementById('robotlink').innerHTML = '//streamtape.com/get_video' + ('xcd?id=...').substring(2).substring(1)`, a request to it answers a 302 to an MP4 on `*.tapecontent.net` that needs no header, and the address has no `.mp4`, so a stream you resolve yourself needs `type: 'mp4'`. MixDrop's page holds one packed script whose `MDCore.wurl` is the media address; its media host answers 403 to the `AppleCoreMedia` and curl agents and to a `Referer` of the embedding site, and plays only with a Safari `User-Agent` and no Referer (or a MixDrop one). A host the app has no resolver for goes through its page sniffer: the page opens in a hidden web view when the viewer chooses that server or the fallback reaches it (up to 15 seconds), the first media request is taken, popups and navigation off the page's site are blocked, and the page host must be in `hosts`. The sniffer was built on 2026-11-05 and had not yet run on a real page when this was written: a player that needs a real click, DRM, a captcha or a login ends in "no stream" or "timeout", never a hang.
- **Several servers.** Return one entry per working server, each labeled (KickAssAnime returns `VidStreaming` and `BirdStream`). Skip a server that fails and keep the others.
- **An episode with no stream yet** is an `Error` with a message that says so, not an empty list (which shows "no videos" with no reason). Check the newest episodes of a new show and a few old ones: KickAssAnime lists some episodes with an empty server list (19 of 76 episodes sampled on 2026-10-23, new shows and old ones alike), and there the site has no stream to read. Say which case it is in the message (no server listed, or servers that gave no video).
- **Skip times.** Use the site's own intro and outro times when it has them. AniZone reads them from a WebVTT chapters track whose cues are named Intro or Opening, and Credits, Outro or Ending.
- **Seasons.** When a title has more than one season, give each episode `season` (an id as text), `seasonName` and optionally `seasonCover`; the title page groups by season. Leave them out for a single season. Find out how the site does it before you write the code: scan 24 to 40 real titles (popular and latest) with your own extension and count the lists that hold more than one season. On seven sites built from the same theme, five gave each season its own title in all 40 titles read (the series name carries "Season 4") and two folded several seasons into one list (5 of 40 titles on one, 2 of 40 on the other), naming the season in each row (`Season 2 Episode 290`, `S4 E380`). Read the season from the row, and set the fields only when the finished list has two or more. A row that names no season is season 1 only when at least three numbered ones sit under seasons 2 and up; a PV, a special, a movie or a lone row takes the season of the row beside it; and a series whose own title names a season is one season. Look at every split your scan reports before you trust the rule: the first version split a one-season title in two because a single row said "Final Arc" and the others said "Season 3".
- **Banner.** `mangaInfo` can carry a `banner`, a wide picture shown behind the title page.
- **Content rating.** Sumizuri treats only `contentRating: "adult"` as adult; `safe` and `mature` show without the gate. The Inkstone website hides `adult` sources.
- **How Sumizuri differs as a runtime.** It runs sources in QuickJS (Boundless uses JavaScriptCore on iPhone, iPad and Mac and QuickJS on Android), can reach only public `http` and `https` addresses and never the local network, keeps cookies between a source's requests, and accepts a number written as text where Boundless would throw. Keep real numbers anyway. If the site needs a `Cookie`, send it yourself as AniZone does, so it works everywhere. `hosts` limits what your extension requests; keep listing the site, its API and the stream hosts. A video host that changes its domain from week to week (VOE lands on a new address every few weeks) cannot be listed in `hosts`: the app refuses the request and no episode plays. For a source that follows such a host, leave `hosts` out of its manifest entry (the app then allows every host), and expect the test script to warn about it.
- **Test it.** The Step 3 script plays instead of opening chapters: it fetches the first video's address with its headers and expects an HLS playlist or a video content type, tries up to four of the newest episodes, and warns about video fields Sumizuri would drop. A stream host that refuses Node (see Embedded Dailymotion players) fails that step while every earlier check passes. Then try it in Sumizuri: in **Browse**, open **Extensions**, tap **Create a source** or add your repository (the editor has a **Test** tab with **Run all**), or add the repository with the link `sumizuri://add-repo?url=` followed by the encoded repository address.
- **Other Sumizuri additions** that Boundless ignores: tag sections with `single: true` (the person picks one tag of the section or none) in `getSearchTags`, and `getSortOptions()` with `request.sortId`.

## Step 3: Test it on the real site

Run the test script. It does two jobs: it checks the extension is **compatible** with Boundless (loads in a bare sandbox, exports the right methods, has a valid `versioning.json` entry, matching `sha256`), and it checks the extension can **fetch real results** (browse, search, every feed, details, chapters and actually opening chapters, for two titles, plus loading the first cover and page image with the headers you return and the browser agent the app sends when you set none, and naming a bot check page as one). The full guide is in [TESTING.md](https://inkstone.web.app/docs/TESTING.md).

For an anime extension the script plays an episode instead of opening a chapter, and passing it means the stream answered, not that Sumizuri played it: say so in your report.

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
```

<!-- test-extension:end -->

Run it (Node 18 or newer):

```bash
npm install cheerio
node test-extension.mjs ./mysite/index.js "naruto"
```

What to do with the results:

- Keep going until there are no `FAIL` lines. Try a few different search words (the script picks one itself if you don't give it one), including one that should return nothing.
- A `fetch is not defined` (or `URL`, `btoa`, `document`) means the code used something the app doesn't have.
- A `WARN` about "differs between the engines" means the code uses `Intl`, `toLocaleString()`, `WeakRef` or `queueMicrotask`, which behave differently on iPhone and Android. Replace them; Node cannot show the difference, so reading the code is the only check.
- `WARN` lines are worth reading but aren't failures. A missing `hosts` list is the usual one.
- The script checks data, not looks. Read the output yourself: do titles, covers and chapter names look like the real site? Are chapters in a sensible order?
- A site behind a Cloudflare challenge may answer `403` to plain Node even though Boundless gets through. Say that in your report.
- Anything using `App.executeInWebView` only runs inside Boundless, and the script says so.

The script checks data, so these are yours to check before you report:

- The chapter count against the number the site itself shows, for a short title and for a long one. A long title has several pages of chapters, which is where paging bugs hide.
- A title with nothing in your language, a title with no chapters, and a search that matches nothing. None of them should end in a blank error.
- One locked chapter, if the site has any: its name, and what opening it does.
- A title with a mature rating: it should blur in Boundless.
- Everything the script skipped (web view code, Cloudflare). Report it as not tested.

When it passes, try it in Boundless for real. A repository is just a folder of static files, so put `versioning.json` and your `<id>/index.js` on any static host (GitHub Pages works), add that URL in Boundless's extension settings (in Sumizuri: Browse, then Repos, then Add a repo), and install your extension.

## Step 4: Package it

Add an entry to `versioning.json`, and make the extension's folder name equal the `id` (the folder sits inside `comics`, `novels`, `mixed`, `anime`, `donghua`, `drama` or `western` in the repository, see Step 5):

```json
{
  "id": "mysite",
  "name": "My Site",
  "version": "1.0.0",
  "medium": "comics",
  "website": "https://mysite.com",
  "iconUrl": "https://mysite.com/apple-touch-icon.png",
  "description": "Manga・Manhwa・Manhua\n\nCatalog・1,000+\n\nRestrictions:\n・Rate Limit",
  "capabilities": ["browse", "search", "genres", "details", "chapters", "reader"],
  "language": "en",
  "contentRating": "safe",
  "hosts": ["mysite.com", "*.mysite-cdn.com"],
  "sha256": "<hash of index.js>"
}
```

- `medium` is `comics`, `novel`, `both` or `anime` (anime is for the video apps, Sumizuri and Boundless Player, see Step 2). An anime entry lists `videos` in `capabilities` and has no `reader`. `language` is a two-letter code. `capabilities` lists what really works.
- `contentRating` is `safe`, `mature` or `adult`, based on what you saw in Step 1. When in doubt, go one step stricter.
- `hosts` lists every host the extension talks to. Boundless refuses requests to anything else. Image hosts aren't covered by it, but list them anyway.
- `description` is shown in the app (the first line on the source cards, the whole text on the source's page) and on the website, so it is short and has a fixed shape:

  ```
  Manga・Manhwa・Manhua・Light Novels

  Catalog・10,000+

  Restrictions:
  ・Cloudflare Checks
  ・Rate Limit
  ```

  Line one lists what the source offers, joined with the middle dot `・`: Manga, Manhwa, Manhua, Webtoons, Comics, Web Novels, Light Novels, Novels. `Catalog・` is how many titles the source lists, rounded down to one significant digit with a plus (`300+`, `1,000+`, `20,000+`, `100,000+`): count it by paging the source's own list, never guess, and leave the line out when you could not measure it. For a numbered archive (`?page=N`), double the page number until one comes back empty, bisect to the last page that has titles, and count `(last page - 1) * titles per page + titles on the last page`; then round down to one significant digit (1,243 titles is `1,000+`, 247 is `200+`, 306 is `300+`). The test script warns when the number keeps a second digit (`11,000+`). `Restrictions:` names only real ones you saw, one per line: `Cloudflare Checks` (the app has to clear a Cloudflare challenge first), `Rate Limit` (the extension holds requests back, or the site slows you down), `Locked Chapters` (paid or on a timer), `Web View` (pages load in a web view, so it is slower). Leave the whole section out when there is none. What is missing and what you couldn't test (no real account, a browser tab instead of the app) goes in the comment at the top of `index.js` and in your report below, not in the description. An extension that overclaims costs the next person a debugging session, so say it there.
- If your code reads a setting, declare it in `settingsSchema` (see Settings above), or nobody can change it. `capabilities` only labels the listing: the app never reads it.
- `author` is optional. Add your name or handle to get credit on the catalog. `authorUrl` can link it to your profile.
- Get the hash with `shasum -a 256 mysite/index.js`. **Redo it every time the file changes.** A stale hash makes Boundless refuse the install.
- Bump `version` whenever the file changes.

## Step 5: List it on Inkstone

1. Fork [realinkstone/inkstone-extensions](https://github.com/realinkstone/inkstone-extensions).
2. Add your folder under the one that matches what it offers, as `comics/<id>/index.js` (manga, manhwa, webtoons), `novels/<id>/index.js`, `mixed/<id>/index.js` (both) or, for video, `anime/<id>/index.js`, `donghua/<id>/index.js`, `drama/<id>/index.js` or `western/<id>/index.js` (a video source has `medium: "anime"` whatever it shows, and the first word of its description decides the folder), and add your entry to the `versioning.json` at the top of the repository. The site serves every extension at `/<id>/index.js` whatever its folder, so the folder changes nothing in the app.
3. Open a pull request. Your report (below) works as the description.

No GitHub? Share the folder on the [Inkstone Discord](https://discord.gg/6pX2XgFYcs) instead. Every submission is tried against the live site before it's listed.

## Your final report

End with something the user can read in thirty seconds:

- **Site and extension id.**
- **Data source:** JSON API, HTML or embedded data, and how you found out.
- **What works:** browse feeds, search, genres, details, chapters, reading. Say which titles you tested.
- **What doesn't:** limitations, honestly. Scrambled images, a missing feed, chapters that need a login.
- **Protection:** Cloudflare, rate limits, hotlink protection, and what you did about each.
- **Locked chapters:** how many, whether they are timed or paid, and what opening one does.
- **Anime** (for an anime source): which episode played, with which headers, how many qualities, subtitle tracks and skip times it had, and whether you tried it in Sumizuri, fetched the stream with the script, or could only fetch it in a real browser.
- **Content rating** you chose, and why.
- **Test output** from the script.
- **Not tested:** anything you could only check against a mock or in a browser tab (sign-in, web view code, Cloudflare), so the user knows what to try in the app.
- **Files** to commit.

## Common mistakes

| Mistake | What happens |
| --- | --- |
| `coverURL` instead of `image` | Blank covers, no error |
| Relative image URLs | Covers or pages fail to load |
| `time` as a `Date`, or in seconds | Wrong or missing dates |
| `description` instead of `desc` | Blank summary |
| `getVideos` returns `{ videos: [...] }` or one object | Sumizuri reads only a list, so there is no video |
| A video, subtitle or audio entry with no full `url` | Dropped silently |
| `intro` or `outro` in seconds, or with `end` not after `start` | Ignored |
| Listing every HLS quality as its own video | Return the master playlist once; Sumizuri offers the qualities |
| The stream host checks `Referer` and `headers` is left out | The stream answers 403 and nothing plays |
| Sub and dub offered with no `Sub` or `Dub` in `quality` | The sub and dub switch is missing |
| An empty list for an episode with no stream yet | "No videos" with no reason: throw an `Error` that says why |
| Testing an anime extension in Boundless Reader | Boundless Reader is not compatible with anime: test in Sumizuri |
| A `status` that isn't an allowed word | Shows as Unknown |
| Always returning `metadata` | Browse loads the last page forever |
| `getSourceFeeds()` that's `async` or fetches | Feeds never appear |
| Using `fetch`, `URL`, `btoa` or `TextEncoder` | Empty screens |
| Using `Intl` or `toLocaleString()` | Works on iPhone, `Intl is not defined` or different text on Android |
| `new Date(text)` on date text that is not ISO 8601 | A different date (or none) on iPhone and Android: read it yourself and use `Date.UTC` |
| Returning today's date for a chapter date you could not read | Every chapter looks new, on every refresh |
| Waiting with `setTimeout` instead of declaring a `rateLimit` | A slow source that the app's own 429 retries hide |
| Chapter list capped at 100 | Missing chapters |
| Forgetting `referer` on hotlink-protected images | Chapters open but every page fails |
| A cover host that answers a Cloudflare check only to requests with no `Referer`, and no `referer` returned | Every cover is blank in the app; the test script fails it and names the `referer` to set |
| `parseFloat` on an episode label such as `S2E290` or `1 to 2` | The episode has no `number`, and the chapter checks still pass |
| Splitting a title into seasons because one row says "Season 3" | A one-season title shows two seasons; read every split a scan reports |
| Catching a security check (`kind: 'challenge'`) and throwing your own `Error` | The app cannot offer its Verify button; the reader sees only "no stream" |
| Retrying the same GET address after an empty answer | The app's 90 second cache returns the same empty answer; vary the query |
| A filter or sort address that answers 200 with the default list (`/movies/popular` with no closing slash) | A feed that shows the wrong titles, and two feeds that look alike |
| Rating a movie site from the list cards alone | Adult films sit unrated in Browse; read the certificate on the title page for each result |
| Measuring a provider's coverage with a burst of parallel requests, or without keeping the status codes | Throttled answers count as "missing" and the report understates the provider by a third; measure a few requests at a time and keep the codes |
| An HLS master whose default audio is not the reader's language | Plays in the wrong language; look for a language parameter or return the rendition you want |
| Calling a Dailymotion metadata address with Dailymotion's own address as `Referer` | `private: true` and no `qualities` for a video that plays fine on the site: send the site's episode page |
| An API that sends browser looking user agents to a bot check and lets a plain one through (MangaDex) | Every answer is an HTML page, `JSON.parse` fails on `<`; detect the check page (or its 403 text) and retry with a plain `User-Agent`, remembering it for the session |
| A CDN that refuses the app's own user agent, with only `referer` returned | Chapters open but every page fails, though the same URL works in curl; return `headers` with a browser `User-Agent` on pages and covers |
| Using the 110 by 150 thumbnail a WordPress grid names | Blurry covers; check whether the 175 by 238 or 350 by 476 size of the same file exists and use it |
| Rating a site safe because it prints no genres | Explicit titles in a source the reader trusts; look at the titles and blurbs of the first listing page too |
| Stale `sha256` | Install refused |
| `contentRating` guessed from the site's name | Wrong filtering for the reader |
| `getChapters` returning `[]` after an error | The title looks empty, then a burst of "new chapters" later |
| A chapter list filtered to one language | "No chapters yet" for a title that has chapters in another |
| A number where a string belongs (`volume: 3`, `name: 12`) | The whole chapter list can fail to load |
| `q=` sent where the site wants `search=` | Search quietly ignores the query |
| Locked chapters hidden, or a made-up lock format | Wrong chapter count, no lock icon |
| Two web view calls per title | Every title opens slowly |
| Wrapping only `window.fetch` in a web view script | The site's own `XMLHttpRequest` calls are never seen |
| Reading the pager's "active" page to know where you are | The walk stops early on a phone |
| Clicking the next pager number as soon as a request is seen | The walk races ahead and stalls (the site resets its pager) |
| Loading the page again for a token that never changes | Every open is a full page load, for ever |
| Testing a web view script only in a browser tab | Passes there, stalls one time in ten in WebKit |
| Calling a JSON endpoint with a plain request and a bare `JSON.parse` on a site that is served by the web view | "unexpected token '<'": the JSON arrives wrapped in a `<pre>` page and the title never opens |
| A backslash escape (`\s`, `\d`) inside the template literal that builds a web view script | The page gets `s` or `d` and the regex matches the wrong thing |
| Sending `volumesId` as a number, or a volumes id that is the title's own id | The details fail to load, or volumes mix into the chapters' history |
| A setting read in code but missing from `settingsSchema` | Nobody can change it |
| Scripting a sign-in that is built to resist scripts | Captchas, security emails, a locked account |
| Trusting an old comment or memory about a site | The wrong CDN rule or API |
| Reading a site's browser-fetched JSON by field name when the site scrambles the names | Empty lists and timeouts after a deploy, with the server-rendered pages still fine |
| Counting timer ticks to measure a timeout in a web view | Twice as long, or never, in a view that holds timers back |
| Keeping the old domain after the site moved | Every request fails at once (the name does not resolve) |
| Treating a site's old address as dead when it still resolves but answers a challenge | It may now be only a directory of mirror addresses (a real browser shows a "Mirrors" page, curl gets a 403 challenge): open it in a browser, test each listed address with curl, and have the source try them in order and stay on the one that answers |
| Changing how ids are built in an update | Saved library and history entries stop matching |
| Encoding a slug that the site already percent-encoded | Titles open but every chapter is a 404 (the id reads `%25e0%25b8...`); only slugs that are not plain ASCII show it |
| A source level `adult` tag and no `ageRating` on the titles | The apps blur by the title's rating, so explicit covers show unblurred |
| Reading a genre's name from `includedTags[].label` | The Boundless Player sends the id as the label; look the name up in your own `getSearchTags()` list |
| Pinning a rotating embed domain (VOE) in `hosts` | The stream is dropped and your test fails the day the domain changes; leave `hosts` out for such a source |
| Writing code to solve a player's human check (ALTCHA, Turnstile) | Not allowed, and it breaks when the check changes; hand the page to the app as an embed entry |
| Calling a source dead because a phone could not resolve its name | A VPN or DNS filter can refuse live sites (-1003 on a tunnel while public DNS answers); ask 1.1.1.1 and 8.8.8.8 first |
