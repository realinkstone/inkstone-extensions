# Build an extension with OpenSpec (beta)

**This is in beta.** It's new, and extensions built by an AI can have bugs. Always run the test script and try the result in Boundless before you share it.

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
| `extensions/asurascans`, `extensions/chikari` | Finished specs for the two reference extensions |

Every new extension adds a spec of its own, at `specs/extensions/<id>/spec.md`, when you archive its change.

## An example

Here's what a finished plan looks like, for an imaginary site called MySite.

**proposal.md**

```markdown
# Proposal: Add the MySite extension

## Why
Boundless readers can't read MySite (mysite.example) yet. It's a comics site with a public JSON API, which makes it reliable to read.

## What Changes
- Add a MySite extension with a Latest feed, search, details, chapter lists and reading.
- Go decision: browse, search, details, chapters and reading all worked against the live site for several titles.
- Content rating `safe`, because every title seen was all-ages.
- Out of scope: anything that needs a login.

## Capabilities

### New Capabilities
- `extensions/mysite`: read comics from mysite.example

### Modified Capabilities

## Impact
- New `mysite/index.js` and a `versioning.json` entry.
- No change to any existing extension.
```

**design.md**

```markdown
# Design: MySite extension

## Data source
A public JSON API at `api.mysite.example`. No login or token is needed.

## Identifiers
A title's id is its slug. Chapter ids come from the chapter list.

## Feeds
One feed, `latest`. Page 2 is requested with `?page=2` and really differs from page 1.

## Images
Page images load without a Referer, so chapters don't set one.

## Hosts
`api.mysite.example`
```

**tasks.md**

```markdown
# Tasks

## 1. Extension
- [ ] 1.1 Write `mysite/index.js` using only `App` and `cheerio`
- [ ] 1.2 Verify: `node docs/test-extension.mjs mysite/index.js "naruto"` shows no FAIL lines

## 2. Listing
- [ ] 2.1 Add the `versioning.json` entry with `contentRating: safe` and `hosts`
- [ ] 2.2 Refresh `sha256` with `shasum -a 256 mysite/index.js`
- [ ] 2.3 Confirm the published file has no comments

## 3. Submit
- [ ] 3.1 Open a pull request with the test output in the description
```

**specs/extensions/mysite/spec.md**

```markdown
## Purpose
Read comics from mysite.example in Boundless Reader.

## ADDED Requirements

### Requirement: Latest feed
The extension SHALL provide a Latest feed.

#### Scenario: Open the Latest feed
- **WHEN** the user opens the `latest` feed
- **THEN** titles with covers are listed
- **AND** scrolling loads the next page, which differs from the first

### Requirement: Search
The extension SHALL support text search.

#### Scenario: Search for a title
- **WHEN** the user searches for "naruto"
- **THEN** matching titles are listed

### Requirement: Details, chapters and reading
The extension SHALL show a title's description and status, return its whole chapter list, and open a chapter as a list of absolute image URLs.

#### Scenario: Read a chapter
- **GIVEN** a title with chapters
- **WHEN** the user opens its first chapter
- **THEN** the chapter's page images load in order

### Requirement: Content rating
The extension SHALL be listed with the content rating `safe`.

#### Scenario: Catalog listing
- **WHEN** the extension appears in the catalog
- **THEN** it is marked Safe
```

## Real examples

Two extensions are the reference for how a finished one looks. Both work well and are the best tested:

- `asurascans`: a comics site on a JSON API. Its spec is [`openspec/specs/extensions/asurascans/spec.md`](https://github.com/realinkstone/inkstone-extensions/blob/main/openspec/specs/extensions/asurascans/spec.md).
- `chikari`: one site serving both comics and novels from a JSON API. Its spec is [`openspec/specs/extensions/chikari/spec.md`](https://github.com/realinkstone/inkstone-extensions/blob/main/openspec/specs/extensions/chikari/spec.md).

Read their code and their specs side by side. Other extensions in the repo can give you ideas, but some have rough edges, so don't copy them blindly.

## Changing an existing extension

To fix or improve an extension that already has a spec, propose a change that uses `## MODIFIED Requirements` for the behavior that changes, and bump its `version` and `sha256` in the tasks. The rest of the flow is the same.

## Checking your work

Two commands cover it:

```bash
openspec validate --all --strict
node docs/test-extension.mjs mysite/index.js "naruto"
```

The first checks your plan and specs are well formed. The second checks the extension itself is compatible and fetches real results. See [TESTING.md](TESTING.md).

## Not using OpenSpec?

That's fine. The same steps live in [BUILD_WITH_AI.md](BUILD_WITH_AI.md), and the full reference is [EXTENSIONS.md](EXTENSIONS.md).
