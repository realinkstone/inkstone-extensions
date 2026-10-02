# Listing Specification

## Purpose
How an extension is published in this repository: its folder, its `versioning.json` entry, content rating, integrity hash and network scope.

## Requirements

### Requirement: Folder layout
Each extension SHALL live at `<id>/index.js`, where `<id>` is lowercase letters and numbers, and the folder name SHALL equal the `id` in `versioning.json`. Boundless resolves each extension as `<repository>/<id>/index.js`.

#### Scenario: Matching names
- **GIVEN** an entry with `id` `mysite`
- **WHEN** Boundless installs it
- **THEN** it downloads `mysite/index.js`

### Requirement: Listing entry
`versioning.json` SHALL contain an entry for every extension with `id`, `name` and `version`. The app reads `medium` (`comics`, `novel` or `both`), `website`, `iconUrl`, `language` (a short code), `contentRating` and `settingsSchema` when installing. `description` and `capabilities` are shown on the website.

#### Scenario: Complete entry
- **GIVEN** an entry with id, name, version, medium, website, language, contentRating, description and capabilities
- **WHEN** the extension is listed
- **THEN** the catalog shows its name, version, medium and language

### Requirement: Honest content rating
Each extension SHALL declare `contentRating` as `safe`, `mature` or `adult`, chosen from what the site really serves rather than from its name or genre tags. When unsure, the stricter rating SHALL be used. An extension MAY also set a per-title `ageRating` on titles when the site rates them individually, as described in the source-api specification. That is a separate field from the listing's `contentRating`.

#### Scenario: Site serves explicit titles
- **GIVEN** a site that lists pornographic titles
- **WHEN** the extension is listed
- **THEN** its `contentRating` is `adult`

### Requirement: Integrity hash
An entry SHOULD declare `sha256`, the lowercase hex SHA-256 of the exact bytes of `<id>/index.js`. The hash SHALL be recomputed after every change to the file, because a stale hash makes Boundless refuse the install or update.

#### Scenario: File edited after hashing
- **GIVEN** an entry whose `sha256` no longer matches the file
- **WHEN** Boundless downloads the extension
- **THEN** the install or update is refused

### Requirement: Version bump
The `version` SHALL be bumped whenever the contents of `index.js` change.

#### Scenario: Fix released
- **GIVEN** a fixed `index.js`
- **WHEN** it is published
- **THEN** its `version` is higher than before

### Requirement: Network scope
An entry SHOULD declare `hosts`, the hosts the extension may reach, as exact hostnames or `*.example.com` wildcards. A wildcard SHALL cover subdomains but not the bare apex, so the apex is listed separately when needed. Boundless refuses requests made through the request manager to any other host. Image URLs loaded natively by the app are not covered.

#### Scenario: Undeclared host
- **GIVEN** an entry whose `hosts` omits `cdn.example.com`
- **WHEN** the extension requests a URL on that host
- **THEN** the request is refused before leaving the device

### Requirement: Settings schema
An entry MAY declare `settingsSchema`. When it does, each field SHALL have a `type` of `text`, `toggle`, `select`, `multiSelect` or `section`, a `key` and a `label`, and MAY have `default`, `placeholder`, `secure` and `options`. Values are read back with `App.getSourceSetting`.

#### Scenario: Language option
- **GIVEN** a `select` field with key `language`
- **WHEN** the user picks a language
- **THEN** `App.getSourceSetting('language')` returns that value

### Requirement: Known issues are marked
An entry that is known to be broken SHALL declare `status` as `broken` and a short `statusNote` saying what fails. Websites and apps MAY show it. The entry stays listed until it is fixed or removed.

#### Scenario: Site changed
- **GIVEN** an extension whose site changed and no longer returns titles
- **WHEN** it is listed
- **THEN** its entry has `status` set to `broken` and a `statusNote`
- **AND** the catalog shows it as Broken

### Requirement: Honest description
An entry's `description` SHALL state what the extension covers and any limitation it has, such as scrambled images, a missing feed or login-only content.

#### Scenario: Known limitation
- **GIVEN** an extension whose chapter images are scrambled by the site
- **WHEN** it is listed
- **THEN** its description says so

### Requirement: Published code has no comments
The published `index.js` SHALL be free of comments. Explanations belong in the pull request.

#### Scenario: Submission with comments
- **GIVEN** an `index.js` containing comments
- **WHEN** it is submitted
- **THEN** the comments are removed before it is merged
