# Instructions for AI assistants

This repository holds extensions for Boundless Reader and Sumizuri: one folder per site, each with an `index.js`, inside `comics/`, `novels/`, `mixed/`, `anime/`, `donghua/`, `drama/` or `western/` by what the site offers, plus `versioning.json`.

## Adding or fixing an extension

Read `docs/BUILD_WITH_AI.md` and follow it. It covers looking at the site, writing the code, testing and packaging. The full reference is `docs/EXTENSIONS.md`.

## Spec-driven workflow with OpenSpec

This repo uses [OpenSpec](https://github.com/Fission-AI/OpenSpec). `openspec/specs/` describes how extensions work (runtime, source-api, listing, testing) and `openspec/config.yaml` says what a proposal for a new extension must contain.

If the user wants OpenSpec, follow `docs/OPENSPEC.md`: propose a change named `add-<id>-extension` (for example `/opsx:propose`), stop for review, then apply and archive. Plan first and write no extension code until asked. Run `openspec validate --all --strict` before finishing.

If they don't, follow `docs/BUILD_WITH_AI.md` directly.

## Reference extensions

`asurascans` (comics, JSON API) and `chikari` (comics and novels, JSON API) are the most complete and best tested. Copy their structure. Their specs are in `openspec/specs/extensions/`. Other extensions may have rough edges, so don't copy them blindly.

## Rules

- One folder per extension, named after its `id` (lowercase), containing `index.js`. It goes in `comics/` for `medium: "comics"`, `novels/` for `"novel"`, `mixed/` for `"both"` and, for video, `anime/`, `donghua/`, `drama/` or `western/` by the first word of the description (all four use `"anime"` as the medium), for example `comics/mysite/index.js`. Anime extensions add `getVideos` and only play in apps with a video player, such as Sumizuri. The site still serves each one at `/<id>/index.js`.
- No comments in `index.js`. Put notes in the pull request.
- Run the test script before finishing, and fix every `FAIL`:

```bash
npm install
node docs/test-extension.mjs <type>/<id>/index.js "search term"
```

- Update the extension's entry in `versioning.json`: bump `version`, set an honest `contentRating`, and refresh `sha256` with `shasum -a 256 <type>/<id>/index.js`.
- Only use what Boundless provides: `App` and `cheerio`. No `fetch`, `URL`, `setTimeout` or `require`.
- Never invent data. Only describe behavior you have seen on the live site.
