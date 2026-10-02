# Runtime Specification

## Purpose
The environment an extension runs in inside Boundless Reader, and what it can and cannot use.

## Requirements

### Requirement: Sandboxed JavaScript environment
An extension SHALL run in a JavaScriptCore context provided by Boundless Reader, with the modern ECMAScript standard library plus the globals `App` and `cheerio`. An extension MUST NOT use `fetch`, `XMLHttpRequest`, `URL`, `URLSearchParams`, `setTimeout`, `setInterval`, `btoa`, `atob`, `TextDecoder`, `document`, `DOMParser`, `structuredClone` or `require`.

#### Scenario: Extension uses a missing global
- **GIVEN** an extension that calls `fetch`
- **WHEN** Boundless runs that code path
- **THEN** a `ReferenceError` is thrown
- **AND** the screen shows no results

#### Scenario: Extension uses only provided globals
- **GIVEN** an extension that uses `App`, `cheerio`, `Promise`, `JSON` and `encodeURIComponent`
- **WHEN** Boundless loads it
- **THEN** it loads without errors

### Requirement: HTML parsing with cheerio
An extension that parses HTML SHALL do so with the provided `cheerio` global (`cheerio.load(html)`), which offers the usual jQuery-style API, rather than regular expressions that stop at the first nested tag.

#### Scenario: Field wrapped in a link
- **GIVEN** an author name wrapped in a nested `<a>` element
- **WHEN** the extension reads it with `$('.author').text()`
- **THEN** the full author name is returned

### Requirement: Network access through the request manager
An extension SHALL make every network request through `App.createRequestManager().schedule(request)`, where the request comes from `App.createRequest({ url, method, headers, body })`. The response SHALL be `{ status, headers, data }`, where `data` is always a string.

#### Scenario: Successful request
- **GIVEN** a request to a reachable URL
- **WHEN** it is scheduled
- **THEN** the response has a numeric `status`
- **AND** `data` is a string that the extension parses itself

#### Scenario: HTTP error status
- **GIVEN** a request that the site answers with 404 or 500
- **WHEN** it is scheduled
- **THEN** the promise resolves with that `status`
- **AND** the extension checks `status` itself

#### Scenario: Network failure
- **GIVEN** a request that cannot reach the site
- **WHEN** it is scheduled
- **THEN** the promise rejects

### Requirement: Request pacing
An extension MAY pass `rateLimit` with `requestsPerSecond` and `requestsPerMinute` to `App.createRequestManager`. When both are given, the stricter limit SHALL apply.

#### Scenario: Site answers 429
- **GIVEN** a site that rate limits after a burst of requests
- **WHEN** the extension declares a `rateLimit`
- **THEN** its requests are spaced out to match

### Requirement: Source settings and state
`App.getSourceSetting(key)` SHALL return the user's value for that setting as a string, or `undefined` when unset. `App.createSourceStateManager()` SHALL provide asynchronous `store(key, value)` and `retrieve(key)`.

#### Scenario: Toggle setting
- **GIVEN** a toggle setting the user switched on
- **WHEN** the extension calls `App.getSourceSetting('dataSaver')`
- **THEN** it receives the string `'true'`

### Requirement: Encoding helpers
`App.base64Encode(text)` and `App.base64Decode(text)` SHALL be provided, since `btoa` and `atob` are not.

#### Scenario: Round trip
- **GIVEN** a text string
- **WHEN** it is encoded and then decoded
- **THEN** the original text is returned

### Requirement: WebView execution as a last resort
For sites that hand out a token only through their own page scripts, an extension MAY call `App.executeInWebView({ url or html with baseUrl, script, timeoutMs })`. It SHALL resolve to `{ value }` on success or `{ error }` on failure, and it only runs inside Boundless Reader.

#### Scenario: Script reports a result
- **GIVEN** a script that reports a value
- **WHEN** the call completes
- **THEN** the promise resolves to `{ value }`

#### Scenario: Script times out
- **GIVEN** a script that never reports
- **WHEN** `timeoutMs` passes
- **THEN** the promise resolves to `{ error }`

### Requirement: Bot protection is handled by the app
An extension SHALL NOT try to solve bot checks itself. Boundless Reader solves Cloudflare challenges in a browser view on the extension's behalf, and asks the user to tap if it has to.

#### Scenario: Protected site
- **GIVEN** a site behind a Cloudflare challenge
- **WHEN** the extension makes its first request
- **THEN** Boundless solves the challenge
- **AND** the request continues without extension code for it
