# 明膳家庭食养系统 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可离线运行、通过本地 JSON 持久化家庭档案、药膳茶饮、舌象记录与每日推荐的家庭食养 Web 工具。

**Architecture:** 原生 Node.js HTTP 服务承载静态页面和 JSON API；存储、推荐、上传和业务服务各自独立。Vanilla JS 单页应用按四个一级页面拆分，所有推荐均由确定性规则引擎生成并解释。

**Tech Stack:** Node.js 14 CommonJS、原生 HTTP/FS/Crypto、HTML5、CSS3、Vanilla JS、项目内轻量测试运行器。

---

## File Map

- `package.json`: 启动与测试命令，Node 版本声明。
- `.gitignore`: 运行期上传、临时事务和系统文件。
- `src/domain/taxonomy.js`: 受控标签、季节和展示映射。
- `src/domain/validation.js`: 家庭成员和舌象记录校验。
- `src/domain/recommendation-engine.js`: 纯函数过滤、评分和排序。
- `src/storage/seed-data.js`: 示例家庭、菜谱和茶饮。
- `src/storage/json-repository.js`: 初始化、备份、串行写入和批量事务。
- `src/storage/upload-store.js`: 图片校验、随机命名、删除和孤立文件清理。
- `src/services/family-service.js`: 家庭 CRUD 与级联失效。
- `src/services/tongue-service.js`: 草稿、确认、归档、恢复和照片生命周期。
- `src/services/recommendation-service.js`: 输入指纹、历史复用、轮换和解释。
- `src/http/body.js`: 受限 JSON 和 multipart 请求解析。
- `src/http/app.js`: HTTP 路由、静态文件与统一错误响应。
- `src/server.js`: 服务入口和端口输出。
- `public/index.html`: 应用壳、导航和无脚本提示。
- `public/assets/styles.css`: 桌面/移动端视觉系统。
- `public/assets/api.js`: Fetch 封装和错误类型。
- `public/assets/app.js`: 路由、共享状态、启动流程。
- `public/assets/pages/*.js`: 今日推荐、家庭档案、药膳茶饮库、AI舌诊页面。
- `public/assets/images/*.jpg`: 本地药膳与茶饮图片资源。
- `data/*.json`: 可直接编辑和备份的本地数据。
- `test/**/*.test.js`: 域、存储、服务、HTTP 和静态 UI 测试。

## Chunk 1: Foundation, Data, and Storage

### Task 1: Project shell and test harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `test/helpers/test-runner.js`
- Create: `test/run.js`
- Create: `test/project-shell.test.js`

- [ ] **Step 1: Write the failing project-shell test**

Assert that `package.json` exposes `start`, `dev`, and `test`, and that the test runner reports failures with a non-zero exit code.

- [ ] **Step 2: Run `node test/run.js test/project-shell.test.js` and verify RED**

Expected: FAIL because `package.json` and the runner contract are missing.

- [ ] **Step 3: Implement the package scripts and tiny async test runner**

Use CommonJS and no runtime dependencies. Set `npm test` to `node test/run.js` and `npm start` to `node src/server.js`.

- [ ] **Step 4: Run `npm test -- test/project-shell.test.js` and verify GREEN**

Expected: 1 test file passes with exit code 0.

- [ ] **Step 5: Commit**

`git add package.json .gitignore test && git commit -m "chore: add project shell and test runner"`

### Task 2: Taxonomy and validation

**Files:**
- Create: `src/domain/taxonomy.js`
- Create: `src/domain/validation.js`
- Create: `test/domain/validation.test.js`

- [ ] **Step 1: Write failing validation tests**

Cover derived age groups, allowed controlled tags, ingredient IDs, valid draft tongue observations, rejection of active records without doctor conclusion/tags, and rejection of unknown values.

- [ ] **Step 2: Run `npm test -- test/domain/validation.test.js` and verify RED**

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement taxonomy constants and validators**

Return normalized copies rather than mutating callers; validation errors contain field paths and Chinese messages.

- [ ] **Step 4: Run the focused test and full `npm test`**

Expected: all tests pass.

- [ ] **Step 5: Commit**

`git add src/domain test/domain && git commit -m "feat: define food therapy data contracts"`

### Task 3: Seed data and JSON repository

**Files:**
- Create: `src/storage/seed-data.js`
- Create: `src/storage/json-repository.js`
- Create: `test/storage/json-repository.test.js`
- Create at runtime: `data/family.json`, `data/recipes.json`, `data/teas.json`, `data/tongue-records.json`, `data/recommendation-history.json`

- [ ] **Step 1: Write failing repository tests**

Use a temporary directory. Verify five-file initialization, three example members, at least eight recipes and six teas, serialized updates, `.bak` recovery, and failed validation preserving prior content.

- [ ] **Step 2: Run `npm test -- test/storage/json-repository.test.js` and verify RED**

Expected: FAIL because repository does not exist.

- [ ] **Step 3: Implement seed data and repository**

Expose `init()`, `read(name)`, `write(name, value)`, and `writeBatch(changes, fileMoves)`. Use temp files, backups, one shared promise queue, and `.transaction.json` recovery.

- [ ] **Step 4: Run focused and full tests**

Expected: repository tests cover initialization, recovery, and concurrency with no warnings.

- [ ] **Step 5: Commit**

`git add src/storage test/storage && git commit -m "feat: add local json persistence"`

## Chunk 2: Recommendation and API

### Task 4: Deterministic recommendation engine

**Files:**
- Create: `src/domain/recommendation-engine.js`
- Create: `test/domain/recommendation-engine.test.js`

- [ ] **Step 1: Write failing engine tests**

Verify allergy/avoid/hard-flag filtering, medicinal tea exclusion for children, month-to-season mapping, doctor-tag mapping, caution deductions, the 95-point example, family minimum aggregation, stable ID tie-breaks, and `NO_SAFE_PLAN` missing details.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL with missing engine exports.

- [ ] **Step 3: Implement pure filtering, scoring, and pair ranking**

Export small functions for season, member safety flags, candidate eligibility, member score, family score, and ranked plan pairs.

- [ ] **Step 4: Run focused and full tests**

Expected: all scoring and safety cases pass deterministically.

- [ ] **Step 5: Commit**

`git add src/domain/recommendation-engine.js test/domain/recommendation-engine.test.js && git commit -m "feat: add explainable recommendation engine"`

### Task 5: Family, tongue, upload, and recommendation services

**Files:**
- Create: `src/storage/upload-store.js`
- Create: `src/services/family-service.js`
- Create: `src/services/tongue-service.js`
- Create: `src/services/recommendation-service.js`
- Create: `test/services/family-service.test.js`
- Create: `test/services/tongue-service.test.js`
- Create: `test/services/recommendation-service.test.js`

- [ ] **Step 1: Write failing service tests**

Cover member CRUD and cascade cleanup; JPEG/PNG/WebP acceptance and 5MB rejection; draft/confirm/archive/restore transitions; active-record downgrade; recommendation fingerprints; stale-plan invalidation; rotate de-duplication and `NO_ALTERNATIVE` without history mutation.

- [ ] **Step 2: Run service tests and verify RED**

Expected: FAIL because services are missing.

- [ ] **Step 3: Implement the services against repository interfaces**

Keep filesystem access inside repository/upload store. Generate UUIDs with `crypto.randomBytes`, sanitize extensions, and expose domain error codes.

- [ ] **Step 4: Run focused and full tests**

Expected: service state transitions and history behavior pass.

- [ ] **Step 5: Commit**

`git add src/services src/storage/upload-store.js test/services && git commit -m "feat: add family food therapy services"`

### Task 6: HTTP API and static server

**Files:**
- Create: `src/http/body.js`
- Create: `src/http/app.js`
- Create: `src/server.js`
- Create: `test/http/body.test.js`
- Create: `test/http/app.test.js`

- [ ] **Step 1: Write failing HTTP tests**

Start the app on an ephemeral port. Cover family CRUD; library filters/details; all and member recommendations; rotate JSON body; history; tongue draft multipart upload, confirm/archive/restore/delete; 400/404/409/413/415/422 error envelopes; and static path traversal rejection.

- [ ] **Step 2: Run HTTP tests and verify RED**

Expected: FAIL because app factory is missing.

- [ ] **Step 3: Implement body parsers, routes, and static delivery**

Cap JSON at 1MB and multipart at 6MB, accept one image, use explicit route matching, set correct content types, and never expose files outside `public/` or approved `data/uploads/`.

- [ ] **Step 4: Run focused and full tests**

Expected: API cases pass with the specified status codes and response structures.

- [ ] **Step 5: Commit**

`git add src/http src/server.js test/http && git commit -m "feat: expose local food therapy api"`

## Chunk 3: Product UI and Delivery

### Task 7: Application shell and Today page

**Files:**
- Create: `public/index.html`
- Create: `public/assets/styles.css`
- Create: `public/assets/api.js`
- Create: `public/assets/app.js`
- Create: `public/assets/pages/today.js`
- Create: `public/assets/images/yam-soup.jpg`
- Create: `public/assets/images/herbal-tea.jpg`
- Create: `test/ui/static-ui.test.js`

- [ ] **Step 1: Write failing static UI tests**

Assert the four exact navigation labels, Today page mount, local image references, disclaimer, accessible controls, and no external script/style URLs.

- [ ] **Step 2: Run `npm test -- test/ui/static-ui.test.js` and verify RED**

Expected: FAIL because public app is missing.

- [ ] **Step 3: Generate local food photography assets and implement the shell/Today page**

Match the approved quiet Chinese food-therapy visual direction: compact top navigation, member sidebar, prominent recipe image, tea panel, reasons, warnings, scores, loading/empty/error states, and mobile member selector.

- [ ] **Step 4: Run focused and full tests**

Expected: static requirements pass and API errors render as actionable messages.

- [ ] **Step 5: Commit**

`git add public test/ui && git commit -m "feat: build daily recommendation experience"`

### Task 8: Family, library, and AI tongue pages

**Files:**
- Create: `public/assets/pages/family.js`
- Create: `public/assets/pages/library.js`
- Create: `public/assets/pages/tongue.js`
- Modify: `public/assets/app.js`
- Modify: `public/assets/styles.css`
- Create: `public/assets/images/lotus-chicken.jpg`
- Create: `public/assets/images/pumpkin-lily.jpg`
- Create: `test/ui/page-contracts.test.js`

- [ ] **Step 1: Write failing page-contract tests**

Verify member form fields and delete confirmation; library search/type/tag controls and detail panel; tongue draft upload, observation selects, doctor conclusion, confirmed tags, confirm/archive/restore actions, image preview, and safety language.

- [ ] **Step 2: Run focused test and verify RED**

Expected: FAIL because page modules are missing.

- [ ] **Step 3: Implement the three pages and shared responsive states**

Use modal dialogs only for editing/detail actions, keep navigation stable, show success/error toasts, and update shared member state after CRUD.

- [ ] **Step 4: Run focused and full tests**

Expected: all UI contract tests pass.

- [ ] **Step 5: Commit**

`git add public/assets test/ui && git commit -m "feat: complete family food therapy workflows"`

### Task 9: End-to-end verification and handoff

**Files:**
- Create: `README.md`
- Create: `start-macos.command`
- Create: `test/e2e/workflow.test.js`

- [ ] **Step 1: Write failing full workflow test**

Exercise edit member → add allergy → create and confirm tongue record → generate plan → reload API → archive tongue record → verify fingerprint changes and the tag no longer affects new output.

- [ ] **Step 2: Run the workflow test and verify RED**

Expected: FAIL until launcher/docs and final integration behavior are complete.

- [ ] **Step 3: Add launcher, user README, and any minimal integration fixes**

Document Node 14+, `npm start`, JSON locations, backup behavior, image limits, offline operation, and the medical disclaimer.

- [ ] **Step 4: Run fresh verification**

Run `npm test`, start on an unused port, call health/recommendation endpoints, then inspect desktop and mobile screenshots in the in-app browser for overflow, blank assets, broken navigation, and console errors.

- [ ] **Step 5: Commit**

`git add README.md start-macos.command test/e2e && git commit -m "docs: finish local delivery and verification"`

