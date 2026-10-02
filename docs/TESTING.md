# Test your extension

One script checks two things: that your extension is **compatible** with Boundless Reader, and that it can **actually fetch real results** from the site. Run it before you submit, and again after every change.

You need Node 18 or newer. It works offline for the first half and needs the internet for the second.

## Run it

1. Get the script: [inkstone.web.app/docs/test-extension.mjs](https://inkstone.web.app/docs/test-extension.mjs) (save it as `test-extension.mjs`).
2. Install the one dependency, the same HTML library Boundless gives your extension:

```bash
npm install cheerio
```

3. Point it at your extension, with an optional search word. If you leave it out, the script picks one from the first title that Browse returns, so it works for any language:

```bash
node test-extension.mjs ./mysite/index.js "naruto"
```

It looks for `versioning.json` one folder above your extension, the same layout as a repository, so it can check your listing entry too.

## What it checks

**Compatibility (no network)**

- The file loads in a bare sandbox like Boundless's: no `fetch`, `URL`, `setTimeout`, `document` or `require`.
- It exports a `Source` class with `getSearchResults`, `getMangaDetails`, `getChapters` and `getChapterDetails`.
- `getSourceFeeds()` is synchronous and every feed has an `id` and `name`.
- Your `versioning.json` entry exists and has a version, `medium`, `contentRating`, `website`, `language`, `description` and `capabilities`.
- Your `sha256` matches the file.

**Live results (real requests)**

- Browse returns titles with a `mangaId`, a `title` and an absolute `image` URL.
- Page 2 really differs from page 1.
- Genre list (if you have one) has ids and labels. An empty list is a warning, because some sites have no working genre filter. In that case don't declare `genres` in `versioning.json`, and the script checks the two agree.
- Search returns titles.
- For two titles: details have a `desc` and an allowed `status`, the chapter list isn't empty, chapter times are in milliseconds, and the first and last chapters open with real image URLs (or text, for novels).
- Every host your extension called is listed in `hosts`.

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
| `fetch is not defined` (or `URL`, `setTimeout`, `document`) | Something Boundless doesn't provide. Use `App.createRequestManager()` and `cheerio` instead. |
| `every cover is an absolute URL in "image"` fails | You used `coverURL`, or returned relative URLs. |
| `page 2 differs from page 1` fails | The site ignores `page=`. Try an `offset` or a different pagination style. |
| `chapter times are in milliseconds` fails | `time` is a `Date`, or in seconds. |
| `chapter ... opens` fails for the oldest chapter | Early chapters often use a different layout. Check one by hand. |
| `HTTP 403` or `HTTP 503` | Bot protection. See below. |
| `sha256 matches the file` fails | You edited the file after hashing it. Run `shasum -a 256 <id>/index.js` again. |
| `every host it called is in "hosts"` fails | Add the missing host, or remove `hosts`. |

## What it can't test

- **Cloudflare challenges.** Boundless solves these in a hidden browser view, but plain Node can't, so a protected site may show `HTTP 403` here even though it works in the app. Test those in Boundless.
- **`App.executeInWebView`.** That only runs inside the app. The script skips those steps with a warning and tells you so at the end.
- **How it looks.** The script checks the data, not the screen. Open the extension in Boundless and look at it.

## Then try it in Boundless

A repository is just a folder of static files. Put `versioning.json` and your `<id>/index.js` on any static host (GitHub Pages works), add that URL in Boundless's extension settings, and install your extension. Browse it, search it, open a title and read a chapter.

When it all works, [list it on Inkstone](https://inkstone.web.app/contribute).
