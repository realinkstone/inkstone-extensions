# Test your extension

One script checks two things: that your extension is **compatible** with Boundless Reader, and that it can **actually fetch real results** from the site. Run it before you submit, and again after every change.

You need Node 18 or newer. It works offline for the first half and needs the internet for the second.

## Run it

1. Get the script: [inkstone.web.app/docs/test-extension.mjs](https://inkstone.web.app/docs/test-extension.mjs) (save it as `test-extension.mjs`).
2. Install the dependency. The script uses `cheerio/slim`, the same build Boundless gives your extension. It parses HTML fragments differently from the full cheerio build, so test with this one:

```bash
npm install cheerio
```

If your extension uses `CryptoJS`, install that too (`npm install crypto-js`). Boundless provides it as a global.

3. Point it at your extension, with an optional search word. If you leave it out, the script picks one from the first title that Browse returns, so it works for any language:

```bash
node test-extension.mjs ./mysite/index.js "naruto"
```

It looks for `versioning.json` one folder above your extension, the same layout as a repository, so it can check your listing entry too.

## What it checks

**Compatibility (no network)**

- The file loads in a bare sandbox like Boundless's: no `fetch`, `URL`, `btoa`, `document` or `require`, and the globals the app does provide (`App`, `cheerio`, `CryptoJS`, `console`, `setTimeout`, `clearTimeout`, `atob`).
- The code does not use something that differs between the engines Boundless runs on (JavaScriptCore on iPhone, iPad and Mac, QuickJS on Android): `Intl`, `toLocaleString()`, `WeakRef`, `queueMicrotask`. These are warnings, because Node cannot show the difference.
- It exports a `Source` class with `getSearchResults`, `getMangaDetails`, `getChapters` and `getChapterDetails`.
- `getSourceFeeds()` is synchronous and every feed has an `id` and `name`.
- Your `versioning.json` entry exists and has a version, `medium`, `contentRating`, `website`, `language`, `description` and `capabilities`. A `Catalog・` line that is not rounded down to one significant digit (`11,000+` instead of `10,000+`) is a warning that names the number to write.
- Your `sha256` matches the file.

**Live results (real requests)**

- Browse returns titles with a `mangaId`, a `title` and an absolute `image` URL.
- If titles carry their own rating, it is an `ageRating` number. A `contentRating` word on a title is ignored by Boundless, so the script warns about it.
- Every title has the field types the app reads (text for `title`, `image`, `author`, `status`, `desc`; numbers for `ageRating`, `rating`, `chapters`; a list for `tags`). The app drops a title with a wrong type, so a whole page can come up empty. The `metadata` you return is an object or nothing.
- Page 2 really differs from page 1, and page 3 from page 2 (a pager that sends the same page again never ends).
- Every other feed you declare (up to five) returns titles too, because a feed that returns nothing shows "No results" in Browse.
- The first cover and the first page of a chapter really load, with the headers and `referer` you return and, when you set no `User-Agent`, the browser agent Boundless sends. A hotlink check, a 403 or a page that is not an image fails. A cover over 300 KB is a warning, because a browse grid shows dozens at once.
- Five requests sent at once are not answered with 429 (skipped when you declare a `rateLimit`; a 429 is a warning that tells you to declare one).
- Genre list (if you have one) has ids and labels. An empty list is a warning, because some sites have no working genre filter. In that case don't declare `genres` in `versioning.json`, and the script checks the two agree.
- Search and a genre filter ask feed `recent`, as the app does when a reader types or picks a genre, and still return a list.
- Search returns titles, and a search for a nonsense word returns an empty list instead of an error.
- For two titles: details have a `desc` and an allowed `status` (a warning if every title comes out `UNKNOWN`, which usually means the mapping misses the site's wording or an accent), and the title, author and description are plain strings. The chapter list isn't empty, every chapter id is unique, chapter fields have the types the app casts to (strings for `name`, `group` and `volume`, numbers for `number` and `time`), chapter times are in milliseconds, and the first and last chapters open with real image URLs (or text, for novels).
- Every host your extension called is listed in `hosts`.
- A response that is a bot check (Cloudflare's "Just a moment", a "Browser verification" page, or a 403 saying the bot challenge was not passed) is named as one, with a hint, instead of showing up as `unexpected token '<'`.
- A file that sits in the repository layout (`comics/`, `novels/`, `mixed/`, `anime/`, `donghua/`, `drama/`, `western/`) has no comment lines, because the repository holds extensions without comments (a warning).

Requests that set no `User-Agent` are sent with an iPhone web view agent, the way Boundless sends them, so a site that treats browser agents differently from plain ones shows up here and not only on a phone.

## Reading the output

```
PASS  browse returns titles  (20 results in 0.6s)
WARN  no "hosts" list declared, so nothing limits where it can connect (recommended)
FAIL  search "solo"  (fetch is not defined)
```

- `PASS`: good.
- `WARN`: worth a look, but not a failure.
- `FAIL`: fix this before submitting. The script exits with an error code when anything fails.

Aim for zero `FAIL`. Try a few different search words, including one that should return nothing.

## Common failures

| You see | Usually means |
| --- | --- |
| `fetch is not defined` (or `URL`, `btoa`, `document`) | Something Boundless doesn't provide. Use `App.createRequestManager()`, `App.base64Encode()` and `cheerio` instead. |
| `uses something that differs between the engines` | `Intl` and `toLocaleString()` give different results on iPhone and Android, and `Date.parse` reads text such as `12-01-2024` differently. Format numbers yourself and build dates with `Date.UTC`. |
| `every cover is an absolute URL in "image"` fails | You used `coverURL`, or returned relative URLs. |
| `page 2 differs from page 1` fails | The site ignores `page=`. Try an `offset` or a different pagination style. |
| `chapter times are in milliseconds` fails | `time` is a `Date`, or in seconds. |
| `chapter fields have the types Boundless casts to` fails | A number where a string belongs (`volume: 3`, `name: 12`) or a string where a number belongs (`number: "12"`). The app throws on these. |
| `every chapter id is unique` fails | A chapter appears on two pages of the site's own list. List it once. |
| `a search that matches nothing returns a list` fails | The site answers a no-match search with an error or a 404. Return `{ results: [] }`. |
| `chapter ... opens` fails for the oldest chapter | Early chapters often use a different layout. Check one by hand. |
| `HTTP 403` or `HTTP 503` | Bot protection. See below. |
| `answered a bot check (browser verification page ...)` | The site sends browser looking agents to its own check page. Try a plain `User-Agent` such as `Boundless/1.0 (+https://boundless.moe)`, or fall back to one when that page comes back. |
| `first cover loads` or `first page image loads` fails | The image host refuses the request: a hotlink check that needs a `referer`, or an agent it blocks. Return `referer` or `headers` (covers on the title, pages on the chapter result) that work. |
| `first cover needs the site's Referer` fails | The image host answers a Cloudflare check to a request with no `Referer` and the image to one with the site's. Set `referer` on every result and on the details that carry the image; the app sends only what you return. |
| `feed "..." returns titles` fails | A declared feed returns nothing without a query. Fix its request or remove the feed. |
| `page 3 differs from page 2` fails | The site ignores the page number past the first pages, so the pager never ends. |
| `status is UNKNOWN on all titles checked` | The status mapping misses the site's wording. Print the raw status text of a dozen titles and match it, including accents. |
| `sha256 matches the file` fails | You edited the file after hashing it. Run `shasum -a 256 <id>/index.js` again. |
| `every host it called is in "hosts"` fails | Add the missing host, or remove `hosts`. |

## What it can't test

- **Cloudflare challenges.** Boundless solves these in a hidden browser view, but plain Node can't, so a protected site answers with a check here even though it works in the app. The script names the check and skips that step with a warning. Test those in Boundless. For an image the script first retries once with the site's `Referer`: if that loads, a missing `referer` is the bug and it fails instead of warning.
- **Video hosts that refuse Node.** Some stream hosts (Dailymotion's HLS master) answer 403 to Node and curl and 200 to a real browser, so the step that fetches the first stream fails for those sources while every earlier check passes. Fetch the master, one variant playlist and one segment in a real browser instead, and report that it was not tried in the app. Episode numbers are not checked (`number` is optional): read the lists yourself for episodes that have none.
- **A provider that has only part of the catalog.** A source that plays through one embed provider fails the episode checks on every title the provider lacks (`no stream for this title yet`). That is the script telling the truth, not a bug in the extension: list which titles failed, show one that plays, and report the share of each feed the provider covers.
- **The engines.** The script runs your file in Node. Boundless runs it on JavaScriptCore (iPhone, iPad, Mac) and QuickJS (Android), which differ from Node and from each other in `Intl`, number formatting and how date text is read. The script reads your code for the known differences; it cannot run it on both. If you can, try the extension on an iPhone or Mac and on Android.
- **`App.executeInWebView`.** That only runs inside the app. The script skips those steps with a warning and tells you so at the end.
- **How it looks.** The script checks the data, not the screen. Open the extension in Boundless and look at it.

## Then try it in Boundless

A repository is just a folder of static files. Put `versioning.json` and your `<id>/index.js` on any static host (GitHub Pages works), add that URL in Boundless's extension settings (in Sumizuri: Browse, then Repos, then Add a repo), and install your extension. Browse it, search it, open a title and read a chapter.

When it all works, [list it on Inkstone](https://inkstone.web.app/contribute).
