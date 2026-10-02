# Testing Specification

## Purpose
How an extension is checked for compatibility with Boundless Reader and for fetching real results, using `docs/test-extension.mjs`.

## Requirements

### Requirement: Run the test script
Every new or changed extension SHALL pass `node docs/test-extension.mjs <id>/index.js "<search term>"` with no `FAIL` lines before it is submitted. The script exits with a non-zero code when any check fails.

#### Scenario: Passing run
- **GIVEN** a working extension
- **WHEN** the script runs
- **THEN** it prints `Compatible, and it fetches real results.`
- **AND** exits with code 0

#### Scenario: Failing run
- **GIVEN** an extension that uses `fetch`
- **WHEN** the script runs
- **THEN** it reports `FAIL` with the error
- **AND** exits with a non-zero code

### Requirement: Compatibility checks
The script SHALL, without using the network, check that the file loads in a bare sandbox, exports a `Source` class with the four required methods, has a synchronous `getSourceFeeds()` if it defines one, and has a valid entry in the `versioning.json` one folder above, including a matching `sha256`.

#### Scenario: Stale hash
- **GIVEN** a file edited after its hash was recorded
- **WHEN** the script runs
- **THEN** `sha256 matches the file` fails

### Requirement: Live result checks
The script SHALL make real requests to check that browse and search return titles with absolute covers, that page 2 differs from page 1, and that for two titles the details, the chapter list and the first and last chapters return real data. It SHALL also confirm every host the extension called is covered by `hosts` when `hosts` is declared.

#### Scenario: Undeclared host
- **GIVEN** an extension that calls a host missing from `hosts`
- **WHEN** the script runs
- **THEN** `every host it called is in "hosts"` fails

#### Scenario: Empty genre list
- **GIVEN** an extension whose genre list is empty
- **WHEN** the script runs
- **THEN** it reports a warning rather than a failure
- **AND** it fails only if the listing declares `genres`

### Requirement: Parts that need Boundless
Anything that relies on `App.executeInWebView` SHALL be reported as skipped with a warning rather than a failure, and SHALL be tried inside Boundless Reader instead.

#### Scenario: WebView extension
- **GIVEN** an extension that uses `App.executeInWebView`
- **WHEN** the script reaches that step
- **THEN** it warns that the step needs Boundless
- **AND** the run can still end without failures

### Requirement: Cloudflare caveat
Because plain Node cannot pass a Cloudflare challenge, a protected site MAY answer with HTTP 403 in the script even though it works in Boundless. This SHALL be noted in the pull request.

#### Scenario: Protected site
- **GIVEN** a site behind a Cloudflare challenge
- **WHEN** the script gets a 403
- **THEN** the author tests the extension in Boundless and says so
