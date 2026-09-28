# Contributing

Thanks for helping out. New extensions and fixes are both welcome.

## Before you start

Read [docs/EXTENSIONS.md](docs/EXTENSIONS.md). Extensions run in a plain JavaScript sandbox with no `fetch`, no DOM and no timers, so it's worth a read before you write any code.

## Add an extension

1. Make a folder named after the extension id (lowercase) with an `index.js` inside.
2. Add an entry for it to `versioning.json`. Copying a similar extension's entry is the easy way.
3. Set `contentRating` honestly: `safe`, `mature` or `adult`. If the site rates titles one by one, rate them per title too.
4. Test it against the live site: browse, search, a title's details, its chapter list, and actually reading a chapter.
5. Hash your file and put the result in `sha256`:
   ```bash
   shasum -a 256 <id>/index.js
   ```
6. Open a pull request.

## Fix an extension

Bump its `version`, update its `sha256`, and say what broke in the pull request.

## A few rules

- Keep the code free of comments. Explain anything unusual in your pull request instead.
- Cover and page image URLs must be absolute.
- Pagination has to end on its own. No endless or repeating pages.
- No placeholder or made up data.
- `hosts` should list only the hosts your extension actually talks to.

## Something broken?

Open an issue with the extension name, what you tried and what happened. You can also ask on [Discord](https://discord.gg/6pX2XgFYcs).

## Credit

Accepted extensions credit you by name or handle. If you'd rather stay anonymous, just say so in the pull request.

## License

By contributing, you agree your work is released under the [MIT license](LICENSE).
