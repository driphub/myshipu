# Mingyuan Static GitHub Pages Edition Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure HTML/JavaScript edition under `docs/` that preserves all four workflows, runs recommendation logic in the browser, persists private data in IndexedDB, and can be published from GitHub Pages without changing the Node.js edition.

**Architecture:** Keep `public/` as the single UI source and select either the current Fetch adapter or a browser-local API adapter at application startup. The local adapter uses an injectable state store, with production persistence in one IndexedDB record and pure functions for validation and recommendation so Node's built-in test runner can exercise them. A deterministic build copies the shared UI into `docs/`, injects static mode, and emits seed/bootstrap JSON while preserving `docs/superpowers/`.

**Tech Stack:** Node.js CommonJS server, browser ES modules, IndexedDB, HTML/CSS, Node built-in assertions/test harness, GitHub Pages.

**Design spec:** `docs/superpowers/specs/2026-08-16-static-pages-design.md`

---

## Chunk 1: Browser Domain And Persistence

### Task 1: Shared recommendation fixtures and browser recommendation core

**Files:**
- Create: `test/fixtures/recommendation-cases.json`
- Create: `test/static/static-core.test.js`
- Create: `public/assets/static-core.mjs`
- Modify: `test/domain/recommendation-engine.test.js`
- Modify: `test/run.js`

- [ ] **Step 1: Extract rule-parity fixtures**

Move the existing representative member, recipe, tea, season, safety, and scoring cases into JSON fixtures. Include named cases for hard allergy filtering, dietary exclusion, child medicinal-tea exclusion, the current 95-point example, family minimum score, doctor-confirmed need tags, stable ID tie-break ordering, pair rotation, and no safe candidate.

- [ ] **Step 2: Write the failing browser-core tests**

Use dynamic `import()` from the CommonJS test file and assert the browser exports:

```js
const { rankPlanPairs, memberSafetyFlags } = await import('../../public/assets/static-core.mjs');
assert.deepStrictEqual(normalize(rankPlanPairs(input)), expected);
assert.deepStrictEqual(memberSafetyFlags(member, item), expectedFlags);
```

Run: `node test/static/static-core.test.js`

Expected: FAIL because `public/assets/static-core.mjs` does not exist.

- [ ] **Step 3: Implement the browser recommendation core**

Port the pure behavior of `src/domain/recommendation-engine.js` into named ES-module exports. Do not access DOM, storage, dates, crypto, or fetch in this module. Preserve stable sort semantics by score descending and recipe/tea IDs ascending.

- [ ] **Step 4: Make Node and browser engines consume the same fixtures**

Update `test/domain/recommendation-engine.test.js` to load the JSON fixtures rather than maintaining a second set of scenario data. Add both test files to `test/run.js`.

- [ ] **Step 5: Run parity and full regression tests**

Run: `node test/static/static-core.test.js && npm test`

Expected: browser-core cases pass and the original suite remains green.

- [ ] **Step 6: Commit**

```bash
git add public/assets/static-core.mjs test/fixtures/recommendation-cases.json test/static/static-core.test.js test/domain/recommendation-engine.test.js test/run.js
git commit -m "feat: add browser recommendation core"
```

### Task 2: Static state schema, import normalization, and image safety

**Files:**
- Create: `public/assets/static-schema.mjs`
- Create: `test/static/static-schema.test.js`
- Modify: `test/run.js`

- [ ] **Step 1: Write failing schema tests**

Cover exact `schemaVersion: 1`, state/object store versions, controlled taxonomy values, global ID uniqueness and `^[a-z0-9][a-z0-9-]{0,63}$`, member references, derived age group, tongue status invariants, library shapes, local-only `assets/images/<name>` paths, Data URL MIME/signature validation, 5 MiB per image, 25 MiB decoded photo total, 38 MiB normalized UTF-8 state size, unknown-field removal, and imported history becoming `superseded`.

Include malicious inputs such as:

```js
const badIds = ['tongue-x\" onmouseover=\"alert(1)', '../x', 'UPPER', 'x'.repeat(65)];
const badImages = ['https://example.com/x.jpg', '//example.com/x.jpg', 'javascript:alert(1)', '../x.jpg'];
```

Run: `node test/static/static-schema.test.js`

Expected: FAIL because the schema module is missing.

- [ ] **Step 2: Implement normalized state validation**

Export constants and pure functions:

```js
export const IMPORT_FILE_LIMIT = 40 * 1024 * 1024;
export const STATE_SIZE_LIMIT = 38 * 1024 * 1024;
export const PHOTO_LIMIT = 5 * 1024 * 1024;
export const PHOTO_TOTAL_LIMIT = 25 * 1024 * 1024;
export function validateAndNormalizeState(input, taxonomy) { /* returns cloned v1 state */ }
export function validateImageDataUrl(value) { /* returns decoded byte length */ }
export function serializedStateSize(state) { /* TextEncoder byte length */ }
```

Use explicit property reconstruction instead of spreading imported objects. Reject unsafe IDs and image paths. Treat `revision` as internal metadata; accept but do not trust its imported value.

- [ ] **Step 3: Verify boundary and atomic-validation behavior**

Run: `node test/static/static-schema.test.js && npm test`

Expected: all schema and regression tests pass, including just-under/just-over byte boundaries.

- [ ] **Step 4: Commit**

```bash
git add public/assets/static-schema.mjs test/static/static-schema.test.js test/run.js
git commit -m "feat: validate static browser data"
```

### Task 3: IndexedDB state store and serialized cross-tab writes

**Files:**
- Create: `public/assets/static-store.mjs`
- Create: `test/static/static-store.test.js`
- Modify: `test/run.js`

- [ ] **Step 1: Write failing store tests around an injected IDB facade**

Test first-open seed initialization, read cloning, complete read-modify-write inside one transaction, revision increments, failed validation leaving the previous value intact, imported revision being ignored, and two queued writers preserving both changes. The production function must be injectable so tests do not require a browser global.

```js
const store = createStateStore({ openDatabase: fake.open, loadSeed, validateState });
await Promise.all([
  store.update((state) => updateMember(state, 'member-a', { name: '甲' })),
  store.update((state) => updateMember(state, 'member-b', { name: '乙' })),
]);
assert.equal((await store.read()).revision, 2);
```

Run: `node test/static/static-store.test.js`

Expected: FAIL because the store module is missing.

- [ ] **Step 2: Implement IndexedDB version 1**

Create database `mingyuan-static`, store `state`, key `app`. Cache a `loadBootstrap()` request for `assets/data/seed-data.json` resolved relative to `document.baseURI`; on an empty database initialize from its `state` property exactly once. For every update, perform get, mutate cloned state, validate/size-check, assign transaction-local `revision + 1`, and put before the same `readwrite` transaction completes.

Convert IndexedDB requests and transaction completion to promises without allowing the transaction to go inactive between read and write. Translate unavailable IndexedDB and quota errors to stable application errors.

- [ ] **Step 3: Run focused and full tests**

Run: `node test/static/static-store.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/assets/static-store.mjs test/static/static-store.test.js test/run.js
git commit -m "feat: persist static data in indexeddb"
```

---

## Chunk 2: Static API And Shared UI

### Task 4: Browser-local API contract

**Files:**
- Create: `public/assets/static-api.mjs`
- Create: `test/static/static-api.test.js`
- Modify: `test/run.js`

- [ ] **Step 1: Write contract tests with an in-memory store**

Test every route listed in the design spec and compare successful envelope shapes, error `code/message/details`, ordering, invalidation, last-member protection, recommendation history reuse/rotation, tongue state transitions, FormData parsing, import/export, and `204`-equivalent `null` results with the Node API tests.

Run: `node test/static/static-api.test.js`

Expected: FAIL because the adapter is missing.

- [ ] **Step 2: Implement an injectable API factory**

```js
export function createStaticApi({ store, loadBootstrap, clock = () => new Date(), idGenerator = crypto.randomUUID }) {
  return async function api(path, options = {}) { /* URLPattern-free router for Node 14 */ };
}

export const api = createStaticApi({ store: browserStore, bootstrap });
```

Use `new URL(path, 'http://mingyuan.invalid')` only as an inert parser base and anchored regular expressions for route matching. Resolve the cached bootstrap for taxonomy responses while the state store independently consumes `bootstrap.state`. Convert `File` to a validated Data URL outside the state transaction, then pass the complete prospective state into the atomic store update. Port service behavior without importing CommonJS modules.

- [ ] **Step 3: Implement browser recommendation history semantics**

Use `static-core.mjs` to rank pairs. Derive scope keys identically to `RecommendationService`, consume only the latest active tongue record per member, reuse active same-input history, supersede invalidated entries, rotate to the next safe pair, and raise `NO_SAFE_RECOMMENDATION` or `NO_ALTERNATIVE` consistently.

- [ ] **Step 4: Run API, parity, and full tests**

Run: `node test/static/static-api.test.js && node test/static/static-core.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/assets/static-api.mjs test/static/static-api.test.js test/run.js
git commit -m "feat: add browser local api"
```

### Task 5: Runtime adapter selection and base-path-safe media

**Files:**
- Modify: `public/index.html`
- Modify: `public/assets/api.js`
- Modify: `public/assets/app.js`
- Modify: `public/assets/pages/today.js`
- Modify: `public/assets/pages/library.js`
- Modify: `public/assets/pages/tongue.js`
- Modify: `test/ui/page-contracts.test.js`
- Modify: `test/ui/static-ui.test.js`

- [ ] **Step 1: Write failing UI contract tests**

Assert that HTML resource URLs are relative, `app.js` selects `static-api.mjs` only when `window.__MINGYUAN_STATIC__ === true`, every persisted image source goes through `mediaUrl`, no template prepends `/`, and all ID values interpolated into HTML attributes use `escapeHtml`.

Run: `node test/ui/page-contracts.test.js && node test/ui/static-ui.test.js`

Expected: FAIL on absolute resources and image templates.

- [ ] **Step 2: Add a shared media resolver**

In `api.js`, export `mediaUrl(value)` that returns an empty string for empty input, returns validated image Data URLs, and resolves allowed relative paths against `document.baseURI`. Throw `ApiError` for external/protocol-relative/script URLs. Keep the existing Fetch adapter unchanged otherwise.

- [ ] **Step 3: Select the adapter once during startup**

Replace the static import of `api` in `app.js` with one top-level dynamic selection before initial requests. Keep `escapeHtml` imports in page modules. Pass `isStatic` to pages that render static-only controls.

- [ ] **Step 4: Update pages to use safe URLs and escaped attributes**

Replace all `src="/${...}"` expressions with escaped `mediaUrl(...)` results. Escape `record.id` and any other persisted value used in `data-*`, `value`, class, or URL attributes.

- [ ] **Step 5: Run UI and Node regressions**

Run: `node test/ui/page-contracts.test.js && node test/ui/static-ui.test.js && npm test`

Expected: all tests pass and Node behavior remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/assets/api.js public/assets/app.js public/assets/pages/today.js public/assets/pages/library.js public/assets/pages/tongue.js test/ui/page-contracts.test.js test/ui/static-ui.test.js
git commit -m "feat: share ui with static runtime"
```

### Task 6: Private data import and export controls

**Files:**
- Create: `public/assets/data-tools.js`
- Modify: `public/assets/pages/family.js`
- Modify: `public/assets/pages.css`
- Create: `test/ui/data-tools.test.js`
- Modify: `test/run.js`

- [ ] **Step 1: Write failing data-tool UI tests**

Assert controls render only in static mode, export requires a sensitive-data confirmation, download uses a JSON Blob and server-provided filename, import rejects non-JSON and files over 40 MiB before parsing, import shows a second privacy/replacement confirmation, and errors do not refresh or replace visible data.

Run: `node test/ui/data-tools.test.js`

Expected: FAIL because `data-tools.js` is missing.

- [ ] **Step 2: Implement focused import/export helpers**

Export small injectable functions for confirmation, download, `File.text()`, and API calls so tests can exercise behavior without a DOM implementation. Never log or send exported contents.

- [ ] **Step 3: Add the static-only family-page panel**

Render an un-nested utility band with “导出数据” and “导入数据”, a hidden JSON file input, and concise warnings that exports are unencrypted and browser data can be cleared. After successful import, refresh members and reroute/reload the current view so all pages use the replacement state.

- [ ] **Step 4: Run focused, UI, and full tests**

Run: `node test/ui/data-tools.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/assets/data-tools.js public/assets/pages/family.js public/assets/pages.css test/ui/data-tools.test.js test/run.js
git commit -m "feat: add static data backup tools"
```

---

## Chunk 3: Build, Publication, And Acceptance

### Task 7: Deterministic `docs/` build and subpath preview

**Files:**
- Create: `scripts/build-static.js`
- Create: `scripts/preview-static.js`
- Create: `test/static/static-build.test.js`
- Modify: `package.json`
- Modify: `test/run.js`
- Generate: `docs/index.html`
- Generate: `docs/assets/**`
- Generate: `docs/.nojekyll`

- [ ] **Step 1: Write the failing build test**

Record the file list and SHA-256 hashes below `docs/superpowers/`, run the build twice, and assert those values are unchanged. Assert generated assets exist, `docs/index.html` injects `window.__MINGYUAN_STATIC__ = true` before `app.js`, resource paths are relative, `.nojekyll` exists, bootstrap seed JSON is valid, and generated JavaScript contains no third-party URL or external runtime dependency.

Run: `node test/static/static-build.test.js`

Expected: FAIL because the build script is missing.

- [ ] **Step 2: Implement a narrowly scoped deterministic build**

Use Node built-ins only. Delete exactly `docs/index.html`, `docs/assets/`, and `docs/.nojekyll`; never delete `docs/` or `docs/superpowers/`. Copy shared UI files and inject the static flag. Convert `createSeedData()` explicitly from Node repository keys to the browser v1 contract (`tongue-records` to `tongueRecords`, `recommendation-history` to `recommendationHistory`), add `schemaVersion: 1` and `revision: 0`, then serialize `{ state, taxonomy: TAXONOMY, labels: LABELS }` to `docs/assets/data/seed-data.json` and write `.nojekyll`.

- [ ] **Step 3: Add scripts and a `/myshipu/` preview server**

Add:

```json
"build:static": "node scripts/build-static.js",
"preview:static": "node scripts/preview-static.js"
```

The preview server serves only `docs/` below `/myshipu/`, redirects `/` to `/myshipu/`, rejects traversal, emits correct MIME types, and defaults to `127.0.0.1:4174` with `PORT` override.

- [ ] **Step 4: Generate and test publication artifacts**

Run: `npm run build:static && node test/static/static-build.test.js && npm test`

Expected: deterministic generated files, preserved source docs, and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-static.js scripts/preview-static.js test/static/static-build.test.js package.json test/run.js docs/index.html docs/assets docs/.nojekyll
git commit -m "build: generate github pages edition"
```

### Task 8: Documentation, complete verification, and browser acceptance

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document both editions and Pages settings**

Explain `npm start`, `npm run build:static`, and `npm run preview:static`; configure GitHub Pages as “Deploy from a branch”, branch `main`, folder `/docs`; document the expected URL `https://driphub.github.io/myshipu/`. State that IndexedDB is device/browser-local, origin-scoped rather than path-scoped, exported JSON is unencrypted, clearing site data loses unsaved data, and no browser data is committed to Git.

- [ ] **Step 2: Run complete automated verification**

Run: `npm run build:static && npm test && git diff --check`

Expected: all tests pass, build is deterministic, and no whitespace errors exist.

- [ ] **Step 3: Start the preview server**

Run: `PORT=4174 npm run preview:static`

Expected: `http://127.0.0.1:4174/myshipu/#today` loads the static edition.

- [ ] **Step 4: Perform desktop and 390px browser acceptance**

Using browser automation under the exact `/myshipu/` path, verify four-page navigation, library images/detail, member edit, recommendation reuse/rotation, tongue draft/edit/confirm/archive/restore with a Data URL photo, persistence after reload, and no layout overlap at desktop and 390px. Capture console errors and failed requests.

- [ ] **Step 5: Perform privacy, backup, failure, and concurrency acceptance**

After initial same-origin assets and seed load, record that member/tongue/recommendation operations produce no Fetch/XHR/WebSocket or cross-origin requests. Export, close IndexedDB connections, delete `mingyuan-static` through the test fixture, reload to seed, and import the backup; verify the edited member and photo return. Verify invalid version/ID/image imports preserve current data, and verify two tabs updating different members preserve both writes.

- [ ] **Step 6: Re-run Node edition smoke test**

Start `npm start` on a free port, open `/#today`, and verify at least family load, recommendation load, and one library image. Stop the temporary Node server without stopping the user's existing server.

- [ ] **Step 7: Commit documentation and any acceptance-only fixes**

```bash
git add README.md public test scripts docs package.json
git commit -m "docs: add github pages publishing guide"
```

- [ ] **Step 8: Request final review and finish the branch**

Use `superpowers:requesting-code-review`, resolve all Critical/Important findings, rerun `npm run build:static && npm test`, then use `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch`. Do not push until the user explicitly requests a retry and GitHub connectivity succeeds.
