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
  "family": { "version": 1, "members": [] },
  "recipes": { "version": 1, "items": [] },
  "teas": { "version": 1, "items": [] },
  "tongueRecords": { "version": 1, "records": [] },
  "recommendationHistory": { "version": 1, "entries": [] }
}
```

舌象照片以 Data URL 存入记录的 `photoDataUrl`。单张图片仍限制为 5MB，格式只接受 JPEG、PNG 或 WebP。页面不访问文件系统，不会把数据写回 Git 仓库。

首次访问若 IndexedDB 没有状态，则读取 `assets/data/seed-data.json` 初始化三位示例成员、菜谱和茶饮。后续刷新复用浏览器状态。

### 静态 API

`static-api.mjs` 接受与现有 Fetch 客户端一致的 `(path, options)` 调用并返回同结构对象。它实现 UI 实际使用的契约：

- 家庭成员列表、创建、更新和删除
- 药膳茶饮搜索、筛选和详情
- 今日全家/个人推荐、换方案和推荐历史
- 舌象草稿创建、编辑、确认、归档、恢复和删除
- 词表、健康状态、数据导出和导入

写入使用一个进程内 Promise 队列串行化，避免同一页面中的并发操作互相覆盖。推荐规则与 Node 版保持一致：过敏/忌口/硬禁忌先过滤，儿童排除药性茶饮，再按需求、季节、偏好和慎用项评分。医生确认标签只读取最近 active 记录。

### 导入导出

家庭档案页在静态模式显示“导出数据”和“导入数据”工具：

- 导出生成包含 `schemaVersion` 和全部本地状态的 JSON 文件；照片 Data URL 一并包含。
- 导入只接受 JSON，校验 schema、家庭成员、库、舌象和历史的基本结构后整体替换。
- 导入前弹出明确确认，导入失败不修改现有状态。

Node 版不显示该工具，继续使用磁盘 `data/*.json`。

## 构建与发布

`scripts/build-static.js` 执行以下确定性步骤：

1. 清理并重建 `docs/`。
2. 复制 `public/` 的 HTML、CSS、模块和图片。
3. 在 `docs/index.html` 注入 `window.__MINGYUAN_STATIC__ = true`。
4. 生成 `docs/assets/data/seed-data.json`。
5. 写入 `docs/.nojekyll`。

`npm run build:static` 运行该脚本。提交后的 `docs/` 可直接由 GitHub Pages 从 `main /docs` 发布。README 记录发布设置和数据局限。

## 错误处理与隐私

- IndexedDB 不可用时显示可操作的启动错误，不静默退回易超限的 localStorage。
- 浏览器配额不足、导入格式错误、无安全推荐和候选耗尽沿用现有错误提示。
- 所有家庭健康数据和照片只保存在访问该站点的浏览器资料中。
- 清除站点数据、无痕模式结束或更换浏览器/设备会丢失本地数据；页面明确提示用户定期导出。
- AI舌诊仍是结构化辅助记录，不进行图片疾病诊断。

## 测试与验收

- 单元测试：静态推荐安全过滤、评分、历史复用/轮换、导入校验和照片限制。
- 构建测试：`docs/` 完整、静态标志存在、无绝对 `/assets` 路径、无外部运行时依赖。
- 浏览器验收：以静态 HTTP 服务打开 `docs/`，完成四页导航、成员编辑、推荐、舌象草稿/编辑、刷新持久化和导出；检查控制台、图片和桌面/390px 布局。
- 回归测试：现有 Node 版 `npm test` 全部继续通过，`npm start` 行为不变。

## 非目标

- 不实现账号、云同步、多设备同步或协作。
- 不将 IndexedDB 数据自动提交到 GitHub。
- 不在 GitHub Pages 上运行 Node.js 或写入仓库 JSON。
- 不把真实家庭数据预置进 `docs/`。
