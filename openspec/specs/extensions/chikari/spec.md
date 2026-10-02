# extensions/chikari Specification

## Purpose
Chikari (chikari.moe): Manga, manhwa, manhua and light novels from Chikari's on-site JSON API: two real catalogs, not one relabeled as the other. Four browse feeds, genre filtering, full in-app reading for both comics and light novels.

## Requirements

### Requirement: Listing
The extension SHALL be listed as `chikari`, for comics and novels in English, with the content rating `adult`.

#### Scenario: Catalog listing
- **WHEN** the extension appears in the catalog
- **THEN** it is marked Adult
- **AND** it declares the capabilities `browse`, `search`, `genres`, `details`, `chapters` and `reader`

### Requirement: Browse feeds
The extension SHALL provide the feeds Popular (`popular`), Trending (`trending`), Latest (`latest`) and Top Rated (`rating`).

#### Scenario: Open a feed
- **WHEN** the user opens the `popular` feed
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
The extension SHALL show a title's description and status, return its whole chapter list, and open a chapter as a list of absolute image URLs for comics, or as text for novels.

#### Scenario: Read a chapter
- **GIVEN** a title with chapters
- **WHEN** the user opens a chapter
- **THEN** the chapter's pages load in order

### Requirement: Comics and novels
The extension SHALL serve both comics and light novels from the same site, and SHALL honor the medium toggle in Browse and Search.

#### Scenario: Medium set to novels
- **WHEN** the user sets the medium toggle to novels
- **THEN** only novels are listed

#### Scenario: Read a novel chapter
- **GIVEN** a novel with chapters
- **WHEN** the user opens a chapter
- **THEN** `pages` is empty
- **AND** the chapter text is shown
