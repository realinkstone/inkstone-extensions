# extensions/asurascans Specification

## Purpose
AsuraScans (asurascans.com): Manhwa and manhua from AsuraScans' public JSON API. Five browse feeds, genre filtering, search, and full chapter reading. Chapters still under the site's 6-hour early-access window are clearly marked as locked, with a live countdown to when they unlock.

## Requirements

### Requirement: Listing
The extension SHALL be listed as `asurascans`, for comics in English, with the content rating `safe`.

#### Scenario: Catalog listing
- **WHEN** the extension appears in the catalog
- **THEN** it is marked Safe
- **AND** it declares the capabilities `browse`, `search`, `genres`, `details`, `chapters` and `reader`

### Requirement: Browse feeds
The extension SHALL provide the feeds Trending (`trending`), Popular (`popular`), Latest (`latest`), Top Rated (`rating`) and A–Z (`title`).

#### Scenario: Open a feed
- **WHEN** the user opens the `trending` feed
- **THEN** titles with covers are listed
- **AND** scrolling loads the next page, which differs from the first

### Requirement: Search
The extension SHALL support text search.

#### Scenario: Search for a title
- **WHEN** the user searches for a title
- **THEN** matching titles are listed

### Requirement: Genres
The extension SHALL provide a genre list that can narrow Browse and Search.

#### Scenario: Pick a genre
- **WHEN** the user opens the genre picker
- **THEN** the site's genres are listed

### Requirement: Details, chapters and reading
The extension SHALL show a title's description and status, return its whole chapter list, and open a chapter as a list of absolute image URLs.

#### Scenario: Read a chapter
- **GIVEN** a title with chapters
- **WHEN** the user opens a chapter
- **THEN** the chapter's pages load in order

### Requirement: Locked chapters
Chapters still inside the site's six hour early-access window SHALL show a countdown such as "(Locked, unlocks in ...)" at the end of their name, because the chapter contract has no locked field.

#### Scenario: Newly published chapter
- **GIVEN** a chapter published less than six hours ago
- **WHEN** the chapter list is shown
- **THEN** its name ends with a countdown to when it unlocks
