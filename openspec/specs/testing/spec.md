# Testing Specification

## Purpose
How an extension is checked for compatibility with Boundless Reader and for fetching real results, using `docs/test-extension.mjs`.

## Requirements

### Requirement: Run the test script
Every new or changed extension SHALL pass `node docs/test-extension.mjs <type>/<id>/index.js "<search term>"` with no `FAIL` lines before it is submitted. The script exits with a non-zero code when any check fails.

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
The script SHALL make real requests to check that browse and search return titles with absolute covers, that page 2 differs from page 1 and page 3 from page 2, that every other declared feed (up to five) returns titles, and that for two titles the details, the chapter list and the first and last chapters return real data. It SHALL also confirm every host the extension called is covered by `hosts` when `hosts` is declared.

#### Scenario: A feed that returns nothing
- **GIVEN** an extension that declares a second feed which returns no titles
- **WHEN** the script runs
- **THEN** `feed "<name>" returns titles` fails

#### Scenario: A pager that never ends
- **GIVEN** an extension whose page 3 is the same as page 2
- **WHEN** the script runs
- **THEN** `page 3 differs from page 2` fails

#### Scenario: Status never detected
- **GIVEN** an extension whose details come out `UNKNOWN` for every title checked
- **WHEN** the script runs
- **THEN** it warns that the status mapping may miss the site's wording
- **AND** the run does not fail because of it

#### Scenario: Undeclared host
- **GIVEN** an extension that calls a host missing from `hosts`
- **WHEN** the script runs
- **THEN** `every host it called is in "hosts"` fails

#### Scenario: Rating field Boundless ignores
- **GIVEN** an extension whose titles set a string `contentRating` and no `ageRating`
- **WHEN** the script runs
- **THEN** it warns that Boundless ignores that field
- **AND** the run does not fail because of it

#### Scenario: Empty genre list
- **GIVEN** an extension whose genre list is empty
- **WHEN** the script runs
- **THEN** it reports a warning rather than a failure
- **AND** it fails only if the listing declares `genres`

### Requirement: Requests look like the app's
Requests that set no `User-Agent` SHALL be sent with a browser agent of the kind Boundless's web view sends, and a `User-Agent` the extension sets SHALL be kept, so a site that treats browser agents and plain ones differently shows the same behaviour in the script as in the app.

#### Scenario: A site that checks browser agents
- **GIVEN** a site that answers a browser agent with a bot check page and a plain agent with data
- **WHEN** an extension that sets no `User-Agent` runs
- **THEN** the step fails
- **AND** the message names the bot check and suggests a plain `User-Agent`

### Requirement: Bot check pages are named
The script SHALL recognise a Cloudflare check, a "Browser verification" page and a 403 saying the bot challenge was not passed, and SHALL name them instead of reporting a parse error. A Cloudflare check SHALL skip that step with a warning, because Boundless clears it in its web view and plain Node cannot. Any other bot check SHALL fail the step with a hint.

#### Scenario: Cloudflare check
- **GIVEN** a site that answers with Cloudflare's "Just a moment..." page
- **WHEN** a step receives it
- **THEN** the step is skipped with a warning
- **AND** the run ends saying the parts that need Boundless were skipped

### Requirement: Images load
The script SHALL load the first cover and the first page image of a chapter with the headers and `referer` the extension returns (and the app's browser agent when none is set), and SHALL fail when the host answers anything but an image. A cover over 300 KB SHALL be a warning.

#### Scenario: Hotlink protection
- **GIVEN** an image host that answers 403 without a `Referer`
- **AND** an extension that returns no `referer` or `headers`
- **WHEN** the script runs
- **THEN** `first cover loads` and `first page image loads` fail

#### Scenario: Large cover
- **GIVEN** a cover of 500 KB
- **WHEN** the script runs
- **THEN** it warns that a browse grid shows dozens of covers at once
- **AND** the run does not fail because of it

### Requirement: Pace
When the extension declares no `rateLimit` and does not use `App.executeInWebView`, the script SHALL send five browse requests at once and warn when the site answers any with 429.

#### Scenario: Throttled burst
- **GIVEN** a site that answers 429 to concurrent requests
- **AND** an extension that declares no `rateLimit`
- **WHEN** the script runs
- **THEN** it warns that a `rateLimit` is needed

### Requirement: Repository layout
When the file sits in a `comics/`, `novels/`, `mixed/` or `anime/` folder, the script SHALL warn about comment lines, because the repository holds extensions without comments.

#### Scenario: Comments in the repository
- **GIVEN** a file in `comics/<id>/` with comment lines
- **WHEN** the script runs
- **THEN** it warns and the run does not fail because of it

### Requirement: Parts that need Boundless
Anything that relies on `App.executeInWebView` SHALL be reported as skipped with a warning rather than a failure, and SHALL be tried inside Boundless Reader instead.

#### Scenario: WebView extension
- **GIVEN** an extension that uses `App.executeInWebView`
- **WHEN** the script reaches that step
- **THEN** it warns that the step needs Boundless
- **AND** the run can still end without failures

### Requirement: Cloudflare caveat
Because plain Node cannot pass a Cloudflare challenge, a protected site answers with the check in the script even though it works in Boundless. The script reports those steps as skipped with a warning, and the author SHALL test the extension in Boundless and say so in the pull request.

#### Scenario: Protected site
- **GIVEN** a site behind a Cloudflare challenge
- **WHEN** the script gets the check page
- **THEN** it warns that the step was skipped
- **AND** the author tests the extension in Boundless and says so
