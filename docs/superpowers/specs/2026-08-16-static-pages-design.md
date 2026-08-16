# 明膳纯 HTML 静态版设计规格

## 目标与范围

在保留现有 Node.js 本地版的同时，新增可由 GitHub Pages 托管的纯 HTML、CSS 和 JavaScript 版本。静态版继续提供“今日推荐、家庭档案、药膳茶饮库、AI舌诊”四个页面，不调用服务器 API，不上传家庭健康信息或舌象照片。

静态版发布产物位于 `docs/`，目标地址为 `https://driphub.github.io/myshipu/`。源码仍以 `public/` 为共享 UI 源，构建脚本复制到 `docs/`，避免维护两套页面。

## 已选方案

采用“共享 UI + 可替换 API 适配器”。现有页面继续调用 `/api/...` 形式的内部契约；Node 版使用 Fetch 适配器，静态版根据页面配置改用浏览器内的静态 API。这样四个页面、交互与视觉保持一致，只替换数据和推荐执行位置。

未采用以下方案：

- 单独重写一套静态 UI：重复代码多，后续容易产生功能差异。
- 仅把示例数据写进 HTML：无法保存家庭档案、舌象照片和推荐历史。
- 使用云数据库：违背已确认的纯本地、无账号和隐私边界。

## 架构

### 共享 UI

`public/index.html` 和 `public/assets/pages/*.js` 继续作为页面源码。页面资源路径改为基于当前文档或模块的相对 URL，使其同时适配本地根路径和 GitHub Pages 的 `/myshipu/` 子路径。

`public/assets/app.js` 读取 `window.__MINGYUAN_STATIC__`：

- 未设置时使用现有 `api.js` Fetch 客户端。
- 设置为 `true` 时使用 `static-api.mjs`。

`docs/index.html` 在加载应用模块前设置静态标志。

### 浏览器数据

IndexedDB 数据库名为 `mingyuan-static`，版本 1，使用单一 `state` object store。`app` 键保存完整状态：

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "family": { "version": 1, "members": [] },
  "recipes": { "version": 1, "items": [] },
  "teas": { "version": 1, "items": [] },
  "tongueRecords": { "version": 1, "records": [] },
  "recommendationHistory": { "version": 1, "entries": [] }
}
```

静态 API 继续使用既有 `photoPath` 字段，但其值可以是本地 Data URL；Node API 仍返回 `uploads/<id>.<ext>`。共享 `mediaUrl(value)` 解析器只接受两类值：经校验的 `data:image/jpeg|png|webp;base64,...` 原样返回，本地相对路径按当前应用基路径解析；`http:`、`https:`、`javascript:`、协议相对 URL 和其他协议一律拒绝。菜谱与茶饮的 `image` 进一步限制为现有 `assets/images/<文件名>` 本地路径，舌象 `photoPath` 在静态版只允许空值或已验证的图片 Data URL，在 Node 版只允许 `uploads/<id>.<ext>`。页面禁止手工添加 `/`，因此同时适配 `/` 和 `/myshipu/`，且导入内容不能触发外部图片请求。

单张图片限制为 5 MiB，格式只接受 JPEG、PNG 或 WebP。导入时校验 Data URL 声明 MIME、base64 格式、文件特征字节和解码大小。所有照片解码后总量限制为 25 MiB，完整规范化状态经 `JSON.stringify` 和 UTF-8 编码后限制为 38 MiB；每次创建、编辑、删除、推荐历史写入和导入都在提交前验证完整状态大小，超限操作失败且不部分保存。40 MiB 的导入文件上限为 UTF-8 解析和规范化预留 2 MiB 缓冲，因此应用产生的任何合法导出都能再次导入。

首次访问若 IndexedDB 没有状态，则读取 `assets/data/seed-data.json` 初始化三位示例成员、菜谱和茶饮。后续刷新复用浏览器状态。

### 静态 API

`static-api.mjs` 接受与现有 Fetch 客户端一致的 `(path, options)` 调用并返回同结构对象。现有设计规格中的 Node API 是规范契约：相同 method、路径、JSON/FormData 字段、成功结果和 `{ code, message, details? }` 错误封套必须一致。204 操作在适配器中返回 `null`。实现的精确路由为：

- `GET/POST /api/family`、`GET/PUT/DELETE /api/family/:id`。POST/PUT 接受普通对象。
- `GET /api/library?type=&q=&tag=`、`GET /api/library/:type/:id`。
- `GET /api/recommendations?date=&scope=`、`POST /api/recommendations/rotate`、`GET /api/recommendation-history?date=&scope=`。
- `GET/POST /api/tongue-records`、`GET/PATCH/DELETE /api/tongue-records/:id`、`POST /api/tongue-records/:id/(confirm|archive|restore)`。POST/PATCH 接受 FormData，读取可选 File，其他字段和 Node 版相同。
- `GET /api/taxonomy` 和 `GET /api/health`。
- 静态专用 `GET /api/data/export` 返回 `{ filename, data }`；`POST /api/data/import` 接受已解析 JSON 对象并返回 `{ imported: true }`。

每个写操作把完整 read-modify-write 放入同一个 IndexedDB `readwrite` 事务。IndexedDB 对同一 object store 的事务在不同标签页间串行执行；状态包含单调递增 `revision`，提交前基于事务内读到的最新 revision 计算并写回 `revision + 1`。导入时忽略外部 `revision`，同样基于事务内当前 revision 写入下一值。File 转 Data URL 和导入文本解析在事务外完成，最终校验和状态替换在一个事务中完成。页面内 Promise 队列只负责维持用户操作返回顺序，不承担跨标签页一致性。

浏览器推荐逻辑放在独立 `static-core.mjs`。它是 Node CommonJS 引擎的浏览器端实现，不直接导入 CommonJS；现有推荐 fixture 被提取为两端共享测试输入，同一组安全过滤、95 分示例、家庭最低分、医生标签、稳定排序、轮换和无候选断言必须同时运行于 Node 引擎与静态核心，防止规则漂移。推荐规则仍为：过敏/忌口/硬禁忌先过滤，儿童排除药性茶饮，再按需求、季节、偏好和慎用项评分。医生确认标签只读取最近 active 记录。

### 导入导出

家庭档案页在静态模式显示“导出数据”和“导入数据”工具：

- 导出生成包含 `schemaVersion` 和全部本地状态的 JSON 文件；照片 Data URL 一并包含。下载前明确提示其中含未加密的家庭健康资料和照片。
- 导入只接受 UTF-8 JSON，文件最大 40 MiB，且 `schemaVersion` 必须严格等于 1。规范化后的完整状态不得超过 38 MiB，保证应用自己生成的合法导出可以重新导入。校验受控标签、实体 ID、成员/舌象引用、年龄段派生值、舌象状态条件、库材料、禁忌字段、库图片本地路径、Data URL MIME/特征字节/单张与总量限制；所有成员、库条目、舌象记录和历史 ID 必须为字符串、全局唯一并匹配 `^[a-z0-9][a-z0-9-]{0,63}$`，引用 ID 使用相同语法。拒绝任何外部、协议相对或脚本 URL。未知受控值或断裂引用导致整次失败；未知对象字段被丢弃并输出规范化 v1 状态。共享 UI 对 ID 和其他持久化字符串放入 HTML 内容或属性前一律调用 `escapeHtml`，不得依赖导入校验替代输出编码。
- 导入的推荐历史全部标记为 `superseded`，首次查看时按导入后的档案和库重新生成，防止篡改历史绕过安全过滤。
- 导入前弹出明确确认，导入失败不修改现有状态。

Node 版不显示该工具，继续使用磁盘 `data/*.json`。

## 构建与发布

`scripts/build-static.js` 执行以下确定性步骤：

1. 只清理 `docs/index.html`、`docs/assets/` 和 `docs/.nojekyll` 三个生成目标；保留 `docs/superpowers/` 及其他源码文档。
2. 复制 `public/` 的 HTML、CSS、模块和图片。
3. 在 `docs/index.html` 注入 `window.__MINGYUAN_STATIC__ = true`。
4. 生成 `docs/assets/data/seed-data.json`。
5. 写入 `docs/.nojekyll`。

`npm run build:static` 运行该脚本。提交后的 `docs/` 可直接由 GitHub Pages 从 `main /docs` 发布。README 记录发布设置和数据局限。

## 错误处理与隐私

- IndexedDB 不可用时显示可操作的启动错误，不静默退回易超限的 localStorage。
- 浏览器配额不足、导入格式错误、无安全推荐和候选耗尽沿用现有错误提示。
- 所有家庭健康数据和照片只保存在访问该站点的浏览器资料中，不由应用主动发送到网络。IndexedDB 按 origin 隔离而不是按路径隔离，因此同源 `driphub.github.io` 下的其他页面理论上可访问同一数据库；更强隔离需要独立自定义域名。
- 导出的 JSON 未加密并包含健康信息与照片。导出和导入前均显示敏感数据提示，用户自行保管文件。
- 清除站点数据、无痕模式结束或更换浏览器/设备会丢失本地数据；页面明确提示用户定期导出。
- AI舌诊仍是结构化辅助记录，不进行图片疾病诊断。

## 测试与验收

- 单元测试：静态推荐安全过滤、评分、历史复用/轮换、导入校验、ID 注入载荷、单张/总照片限制、完整状态 38 MiB 限制和与 Node fixture 的规则一致性。
- 构建测试：`docs/` 完整、静态标志存在、无绝对 `/assets` 路径、无外部运行时依赖；构建前记录 `docs/superpowers/` 文件清单和内容哈希，连续运行两次构建后确认目录未被删除、增加或改写。
- 浏览器验收：本地服务必须把产物挂载在 `/myshipu/`，完成四页导航、成员编辑、推荐、舌象草稿/编辑、Data URL 图片、刷新持久化、导出-重置-导入往返和失败导入保持原状态；其中“重置”由 Playwright 测试夹具关闭数据库连接后直接删除 `mingyuan-static` IndexedDB，再刷新页面触发种子初始化，不增加面向用户的数据清除功能。检查模块、CSS、图片、控制台和桌面/390px 布局。
- 导入边界验收：构造接近 25 MiB 照片总量及接近 38 MiB 完整状态上限的合法状态，确认导出文件仍低于 40 MiB 且可完整重新导入；超过 40 MiB 文件、规范化状态超过 38 MiB、恶意 ID、外部图片 URL、非法协议或非法本地图片路径均被拒绝且不修改原状态。
- 并发与失败验收：两个标签页分别更新不同成员后两项都保留；不支持的 schemaVersion、配额失败和超限图片均不改变先前状态。
- 网络验收：初始同源 HTML、模块、图片和 seed 加载完成后，家庭/舌象变更和推荐操作不产生任何 Fetch/XHR/WebSocket 或跨源请求。
- 回归测试：现有 Node 版 `npm test` 全部继续通过，`npm start` 行为不变。

## 非目标

- 不实现账号、云同步、多设备同步或协作。
- 不将 IndexedDB 数据自动提交到 GitHub。
- 不在 GitHub Pages 上运行 Node.js 或写入仓库 JSON。
- 不把真实家庭数据预置进 `docs/`。
