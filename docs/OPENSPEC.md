# Build an extension with OpenSpec

[OpenSpec](https://github.com/Fission-AI/OpenSpec) is a spec-driven workflow for AI coding assistants. You and the AI agree on a written plan first, then it writes the code. This repository is set up for it:

- `openspec/specs/` already describes how Boundless extensions work: the runtime, the `Source` class, the listing format and testing.
- `openspec/config.yaml` tells the AI what a good extension proposal looks like, so it plans the right things.

Use OpenSpec when you want to read and approve the plan before any code gets written. If you'd rather just hand the job to an AI, use [BUILD_WITH_AI.md](BUILD_WITH_AI.md). Both end in the same place: a tested extension and a pull request.

Inkstone is independent. It isn't part of Boundless Reader or OpenSpec, and neither endorses it.

## Set up once

You need Node 20.19 or newer.

```bash
npm install -g @fission-ai/openspec@latest
git clone https://github.com/<you>/inkstone-extensions
cd inkstone-extensions
npm install
openspec init
```

`openspec init` asks which AI tools you use and adds their commands. It leaves `openspec/config.yaml` and the specs alone. Restart your editor afterwards so the new commands show up.

## The flow

1. **Propose.** Ask your AI to plan the extension. The command is spelled a little differently per tool:

   | Tool | Command |
   | --- | --- |
   | Claude Code | `/opsx:propose add-mysite-extension` |
   | Cursor, GitHub Copilot | `/opsx-propose add-mysite-extension` |
   | Codex | `$openspec-propose add-mysite-extension` |
   | Others | `/openspec-propose add-mysite-extension` |

   Tell it the site (`https://mysite.com`). It looks the site over for real, then writes a change folder under `openspec/changes/add-mysite-extension/` and stops so you can review.

2. **Review.** Read the proposal, the specs, the design and the tasks. Is the data source right? Is the content rating fair? Is anything missing? Ask for changes until you're happy. Nothing has been built yet.

3. **Apply.** Run `/opsx:apply`. The AI writes `mysite/index.js`, adds the `versioning.json` entry, runs the test script until there are no `FAIL` lines, and ticks off the tasks.

4. **Archive.** Run `/opsx:archive`. The new extension spec moves into `openspec/specs/extensions/mysite/spec.md`, and the change is filed away.

5. **Submit.** Open a pull request on [GitHub](https://github.com/realinkstone/inkstone-extensions), or share it on [Discord](https://discord.gg/6pX2XgFYcs). More in [Contribute](https://inkstone.web.app/contribute).

## What's in a change folder

```
openspec/changes/add-mysite-extension/
├── proposal.md                          why, what changes, which capabilities
├── design.md                            data source, ids, feeds, hosts
├── tasks.md                             the checklist the AI works through
└── specs/extensions/mysite/spec.md      what the extension must do
```

## What the specs already cover

| Spec | What it says |
| --- | --- |
| `runtime` | What an extension can and can't use, the `App` calls, and how requests behave |
| `source-api` | The `Source` class, the data shapes the app reads, and pagination |
| `listing` | The folder layout, `versioning.json`, content rating, `sha256` and `hosts` |
| `testing` | What `test-extension.mjs` checks and when an extension is ready |

Every new extension adds one more spec of its own, at `specs/extensions/<id>/spec.md`.

## An example

Here's what a finished plan looks like, for MangaKatana.

**proposal.md**

```markdown
# Proposal: Add the MangaKatana extension

## Why
Boundless readers can't read MangaKatana (mangakatana.com) yet. It's a large manga and manhwa catalog, and its pages are plain HTML that answers ordinary requests.

## What Changes
- Add a MangaKatana extension with three browse feeds, search, a genre filter, details, chapter lists and reading.
- Go decision: browse, search, details, chapters and reading all worked against the live site for several titles.
- Content rating `adult`, because the site serves explicit titles.
- Out of scope: anything that needs a login.

## Capabilities

### New Capabilities
- `extensions/mangakatana`: read manga and manhwa from mangakatana.com

### Modified Capabilities

## Impact
- New `mangakatana/index.js` and a `versioning.json` entry.
- No change to any existing extension.
```

**design.md**

```markdown
# Design: MangaKatana extension

## Data source
Server-rendered HTML, parsed with cheerio. No login or token is needed.

## Identifiers
A title's id is the id segment of its `/manga/<id>` URL. A genre's id is the segment after `/genre/`.

## Feeds and genres
Three feeds: `latest`, `new` and `az`. The genre list is read live from the site (52 genres when checked) rather than hardcoded.

## Hosts
`mangakatana.com`
```

**tasks.md**

```markdown
# Tasks

## 1. Extension
- [ ] 1.1 Write `mangakatana/index.js` using only `App` and `cheerio`
- [ ] 1.2 Verify: `node docs/test-extension.mjs mangakatana/index.js "one"` shows no FAIL lines

## 2. Listing
- [ ] 2.1 Add the `versioning.json` entry with `contentRating: adult` and `hosts`
- [ ] 2.2 Refresh `sha256` with `shasum -a 256 mangakatana/index.js`
- [ ] 2.3 Confirm the published file has no comments

## 3. Submit
- [ ] 3.1 Open a pull request with the test output in the description
```

**specs/extensions/mangakatana/spec.md**

```markdown
## Purpose
Read manga and manhwa from mangakatana.com in Boundless Reader.

## ADDED Requirements

### Requirement: Browse feeds
The extension SHALL provide the feeds Latest Updates, New Manga and All Manga.

#### Scenario: Open the Latest Updates feed
- **WHEN** the user opens the `latest` feed
- **THEN** titles with covers are listed
- **AND** scrolling loads the next page, which differs from the first

### Requirement: Search and genres
The extension SHALL support text search and a genre filter read from the site.

#### Scenario: Search for a title
- **WHEN** the user searches for "one"
- **THEN** matching titles are listed

#### Scenario: Pick a genre
- **WHEN** the user opens the genre picker
- **THEN** the site's genres are listed

### Requirement: Details, chapters and reading
The extension SHALL show a title's description and status, return its whole chapter list, and open a chapter as a list of absolute image URLs.

#### Scenario: Read a chapter
- **GIVEN** a title with chapters
- **WHEN** the user opens its first chapter
- **THEN** the chapter's page images load in order

### Requirement: Content rating
The extension SHALL be listed with the content rating `adult`.

#### Scenario: Catalog listing
- **WHEN** the extension appears in the catalog
- **THEN** it is marked adult
```

## Checking your work

Two commands cover it:

```bash
openspec validate --all --strict
node docs/test-extension.mjs mysite/index.js "naruto"
```

The first checks your plan and specs are well formed. The second checks the extension itself is compatible and fetches real results. See [TESTING.md](TESTING.md).

## Not using OpenSpec?

That's fine. The same steps live in [BUILD_WITH_AI.md](BUILD_WITH_AI.md), and the full reference is [EXTENSIONS.md](EXTENSIONS.md).
