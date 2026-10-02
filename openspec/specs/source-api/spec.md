# Source API Specification

## Purpose
The `Source` class an extension exports, the data shapes the app reads, and how browsing, searching, details, chapters and reading behave.

## Requirements

### Requirement: Source export
An extension SHALL end with `module.exports = { Source };`. Boundless loads it by trying `new module.exports.Source()`, then a named export matching the extension id, then a global `Source`.

#### Scenario: Standard export
- **GIVEN** a file ending in `module.exports = { Source };`
- **WHEN** Boundless loads it
- **THEN** a `Source` instance is created

### Requirement: Required methods
The `Source` class SHALL provide the asynchronous methods `getSearchResults(request, metadata)`, `getMangaDetails(mangaId)`, `getChapters(mangaId)` and `getChapterDetails(mangaId, chapterId)`.

#### Scenario: Missing method
- **GIVEN** a class without `getChapters`
- **WHEN** a user opens a title
- **THEN** its chapter list cannot be shown

### Requirement: Browse and search share one method
`getSearchResults` SHALL serve both Browse and Search. The `request` contains `title` (an empty string when browsing), `feed` (a `getSourceFeeds()` id, browse only), `includedTags`, `excludedTags` and, only when the user set the medium toggle, `medium`. It SHALL return `{ results, metadata }`.

#### Scenario: Browsing
- **GIVEN** a request with `title: ''` and a `feed`
- **WHEN** `getSearchResults` runs
- **THEN** it returns that feed's titles

#### Scenario: Searching
- **GIVEN** a request with a search `title`
- **WHEN** `getSearchResults` runs
- **THEN** it returns titles matching the search

### Requirement: Pagination terminates
`getSearchResults` SHALL return `metadata: { page: n + 1 }` when another page exists and `undefined` when it does not. Page 2 SHALL return different titles than page 1. A metadata value that is always truthy makes Browse load the last page forever.

#### Scenario: Last page
- **GIVEN** the final page of results
- **WHEN** `getSearchResults` returns
- **THEN** `metadata` is `undefined`

#### Scenario: Site ignores page parameter
- **GIVEN** an API that ignores `page=` and paginates on `offset`
- **WHEN** page 2 is requested
- **THEN** the extension uses the pagination the site really honors
- **AND** page 2 differs from page 1

### Requirement: Feeds
`getSourceFeeds()` MAY be provided and SHALL be synchronous, returning `[{ id, name }]` with no `await` and no network. Each advertised feed SHALL really change the order or contents of results.

#### Scenario: Async feeds
- **GIVEN** a `getSourceFeeds` that is `async`
- **WHEN** Boundless loads the extension
- **THEN** no feeds appear

### Requirement: Genre list
`getSearchTags()` MAY be provided. When it is, it SHALL be asynchronous and return a flat array of `{ id, label }`, where each `label` matches the genre names used in the `tags` of titles, because Boundless matches them to find related titles. Grouped sections are not read.

#### Scenario: Related titles
- **GIVEN** a title whose `tags` include "Action" and a genre list with the label "Action"
- **WHEN** Boundless looks for related titles
- **THEN** it searches the site using that genre's id

#### Scenario: Grouped sections
- **GIVEN** a genre list grouped into sections
- **WHEN** Boundless reads it
- **THEN** no genres are matched

#### Scenario: Site with no working genre filter
- **GIVEN** a site whose genre filter does nothing
- **WHEN** `getSearchTags` runs
- **THEN** it returns an empty array
- **AND** the listing does not declare `genres`

### Requirement: Title fields
Each result SHALL have `mangaId` and `title`, and a cover in `image` as an absolute URL. It MAY have `author`, `summary`, `tags`, `webURL`, `medium` (`comics` or `novel`) and a per-title `contentRating` of `safe`, `mature` or `adult`. The cover field is `image`, not `coverURL`.

#### Scenario: Wrong cover field
- **GIVEN** a result that uses `coverURL`
- **WHEN** it is shown in Browse
- **THEN** the cover is blank and no error is raised

#### Scenario: Relative cover URL
- **GIVEN** a cover such as `/c.jpg`
- **WHEN** it is shown
- **THEN** it fails to load

### Requirement: Title details
`getMangaDetails` SHALL return `{ mangaInfo }` with `desc` for the summary and `status` set to exactly one of `ONGOING`, `COMPLETED`, `HIATUS`, `CANCELLED` or `UNKNOWN`.

#### Scenario: Unrecognized status
- **GIVEN** a `status` of `Ongoing`
- **WHEN** details are shown
- **THEN** the status appears as Unknown

### Requirement: Chapter list
`getChapters` SHALL return the whole list of chapters, even when the site's list endpoint caps results. Each chapter SHALL have an `id`, and MAY have `name`, `number` (used for sorting), `group` and `time` as epoch milliseconds.

#### Scenario: Capped list endpoint
- **GIVEN** an endpoint that stops at 100 chapters unless asked for more
- **WHEN** a title has 300 chapters
- **THEN** all 300 are returned

#### Scenario: Time in seconds
- **GIVEN** a `time` in seconds or a `Date` object
- **WHEN** chapters are shown
- **THEN** dates are wrong or missing

### Requirement: Chapter content
`getChapterDetails` SHALL return `{ id, mangaId, pages }`. For comics, `pages` SHALL be an array of absolute image URL strings. For novels, `pages` SHALL be empty and `text` SHALL hold the chapter as one string or an array of paragraphs. When the image host rejects requests without a matching Referer, the result SHALL include `referer` set to the site's origin.

#### Scenario: Comic chapter
- **GIVEN** a chapter of images
- **WHEN** it is opened
- **THEN** `pages` lists absolute image URLs

#### Scenario: Novel chapter
- **GIVEN** a prose chapter
- **WHEN** it is opened
- **THEN** `pages` is empty
- **AND** `text` holds the chapter body

#### Scenario: Hotlink protection
- **GIVEN** an image host that returns 403 without a Referer
- **WHEN** the chapter is opened
- **THEN** the result includes `referer`
- **AND** the pages load
