# Instructions for AI assistants

This repository holds Boundless Reader extensions: one folder per site, each with an `index.js`, plus `versioning.json`.

## Adding or fixing an extension

Read `docs/BUILD_WITH_AI.md` and follow it. It covers looking at the site, writing the code, testing and packaging. The full reference is `docs/EXTENSIONS.md`.

## Rules

- One folder per extension, named after its `id` (lowercase), containing `index.js`.
- No comments in `index.js`. Put notes in the pull request.
- Run the test script before finishing, and fix every `FAIL`:

```bash
npm install
node docs/test-extension.mjs <id>/index.js "search term"
```

- Update the extension's entry in `versioning.json`: bump `version`, set an honest `contentRating`, and refresh `sha256` with `shasum -a 256 <id>/index.js`.
- Only use what Boundless provides: `App` and `cheerio`. No `fetch`, `URL`, `setTimeout` or `require`.
- Never invent data. Only describe behavior you have seen on the live site.
