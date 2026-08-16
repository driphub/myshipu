# 明膳家庭食养系统设计规格

## 目标

实现一个纯本地、可持续保存数据的药食同源家庭食养工具。系统围绕家庭成员特性，自动生成每日菜谱与茶饮建议，并提供可追溯的推荐依据。用户可以维护家庭档案、浏览药膳茶饮库，以及归档舌苔照片和专业医生结论。

系统不联网、不依赖第三方 API，不根据舌苔照片自行诊断。所有结果仅用于日常饮食参考，不替代医疗诊断、处方或治疗。

## 体验结构

一级导航为：

1. 今日推荐
2. 家庭档案
3. 药膳茶饮库
4. AI舌诊

首页采用“顶部导航 + 左侧成员选择 + 今日方案主区”结构。主区信息顺序为：

1. 今日全家菜谱与茶饮
2. 换一套方案
3. 推荐依据与忌口避让说明
4. 每位成员的适配度
5. 食养安全提示

左侧可以切换全家方案或单个成员，并显示最近舌诊记录。移动端隐藏左侧栏，成员选择改为顶部控件，主内容单列排列。

## 功能模块

### 今日推荐

读取当前日期、季节标签和选定家庭范围，展示一道主菜/药膳与一款茶饮。每个结果带有功效、用餐或饮用时间、食材摘要、成员适配度和推荐依据。相同日期和范围默认复用已保存方案；“换一套方案”重新评分并记录历史。

### 家庭档案

支持成员增删改。每位成员包含稳定 `id`、姓名、出生年份、年龄段（由年龄计算为 `child` 0-12、`teen` 13-17、`adult` 18-64、`senior` 65+）、需求标签（即页面上的“健康目标”）、饮食偏好、过敏、明确忌口、孕期/产后状态、慢性病标签和用药标签。标签使用稳定英文 ID，页面显示中文名称。初始数据提供三位可编辑示例成员。

医生确认标签不直接存储在成员档案中，而是由“AI舌诊”记录产生。推荐时读取该成员最近一条 `status: active` 且带有医生结论的记录；归档或删除记录后立即停止影响推荐。多个有效记录按 `confirmedAt` 最新者优先。

### 药膳茶饮库

支持按类型、功效和适用人群筛选，提供搜索和详情页。每条数据包含稳定 `id`、名称、季节标签（`spring/summer/autumn/winter/all`）、需求标签、偏好标签、硬性冲突标签、慎用标签和 `medicinalTea` 布尔值。菜谱详情还包含材料、步骤、功效、适宜/慎用标签；茶饮详情包含材料、用量、饮用时间、适宜/慎用标签。首版随项目提供可运行的示例菜谱、茶饮和食材标签数据。

### AI舌诊

这里的“AI”是辅助记录入口，不承诺自动图像诊断。用户选择家庭成员和日期，上传舌苔照片，填写舌色、苔色、厚薄、润燥等观察项，粘贴专业中医医生结论，并明确勾选可用于推荐的确认标签。记录可查看、编辑和归档。照片文件存入 `data/uploads/`，JSON 只保存相对路径和元数据。

## 数据契约

推荐引擎只读取受控词表；自由文本仅用于展示。首版词表为：

- 需求：`spleen-support`、`digestion-support`、`low-oil`、`low-salt`、`gentle-moistening`、`growth-support`
- 偏好：`mild`、`soft`、`soup`、`vegetarian`
- 医生确认：`dampness-tendency` → `spleen-support`，`dryness-tendency` → `gentle-moistening`，`weak-digestion` → `digestion-support`
- 孕期：`none`、`pregnant`、`postpartum`
- 慢性病：`hypertension`、`diabetes`、`kidney-disease`
- 用药：`anticoagulant`、`glucose-lowering`、`blood-pressure-lowering`
- 食材与过敏/忌口使用同一个受控食材 ID，例如 `peanut`、`shrimp`、`milk`、`chili`；页面可另存自由文本备注，但不参与自动匹配

家庭成员最小结构：

```json
{
  "id": "member-lin",
  "name": "林女士",
  "birthYear": 1988,
  "needTags": ["spleen-support", "low-oil"],
  "preferenceTags": ["soup", "mild"],
  "allergies": ["peanut"],
  "avoidIngredients": ["chili"],
  "pregnancyStatus": "none",
  "chronicConditions": [],
  "medications": [],
  "notes": "示例档案"
}
```

菜谱与茶饮共享的匹配字段为 `needTags`、`preferenceTags`、`seasonTags`、`hardContraindications`、`cautionFlags`；菜谱材料必须带食材 ID。`hardContraindications` 和 `cautionFlags` 使用 `child`、`pregnant`、慢性病、用药或食材 ID。茶饮额外包含 `medicinalTea`。

```json
{
  "id": "recipe-yam-lotus-soup",
  "name": "山药莲子排骨汤",
  "ingredients": [{"id": "yam", "name": "山药", "amount": "200g"}],
  "needTags": ["spleen-support", "gentle-moistening"],
  "preferenceTags": ["soup", "mild"],
  "seasonTags": ["autumn"],
  "hardContraindications": [],
  "cautionFlags": ["kidney-disease"],
  "steps": ["食材洗净后炖煮至熟软"]
}
```

舌诊观察项允许值：舌色 `pale/pink/red/dark`，苔色 `white/yellow/none`，厚薄 `thin/thick`，润燥 `dry/normal/wet`。记录状态为 `draft/active/archived`，状态转换固定为：创建/编辑内容 → `draft`；调用 `/confirm` 且医生结论和确认标签均非空 → `active`；调用 `/archive` → `archived`；调用 `/restore` 时条件满足 → `active`，否则 → `draft`。普通 `PATCH` 不接受 `status` 字段；若编辑 active 记录移除医生结论或确认标签，服务端自动降级为 `draft` 并使相关推荐失效。`confirmedAt` 在每次从 draft 恢复到 active 时重新生成。删除为物理删除并清理照片。

```json
{
  "id": "tongue-001",
  "memberId": "member-lin",
  "observedAt": "2026-08-16",
  "photoPath": "uploads/uuid.webp",
  "observations": {"color":"pink","coating":"white","thickness":"thick","moisture":"normal"},
  "doctorConclusion": "示例：已由专业医生确认",
  "confirmedTags": ["dampness-tendency"],
  "status": "active",
  "confirmedAt": "2026-08-16T08:00:00.000Z",
  "createdAt": "2026-08-16T08:00:00.000Z",
  "updatedAt": "2026-08-16T08:00:00.000Z"
}
```

## 技术架构

采用原生 Node.js 本地服务和 Vanilla JS 前端，无构建工具依赖。

- Node 服务提供静态文件、JSON API、上传接口和推荐计算
- 浏览器页面通过 `fetch` 调用本地 API
- JSON 数据按职责拆分：`family.json`、`recipes.json`、`teas.json`、`tongue-records.json`、`recommendation-history.json`
- 写入采用临时文件 + 原子替换，避免中途写入损坏原文件
- 首次启动若数据文件缺失，使用内置示例数据初始化

模块边界固定为：`JsonRepository`（读写并校验单个 JSON 文件）、`RecommendationEngine`（纯函数评分与候选选择）、`UploadStore`（图片校验/保存/删除）、`HttpApi`（路由、状态码和错误结构）、前端四个页面模块。每个边界通过函数参数或 JSON HTTP 契约通信；写入在进程内串行化。每次成功写入保留一个 `.bak`，主文件损坏时自动读取备份并在界面显示恢复警告。

推荐流程：读取日期和家庭范围 → 对每位成员执行硬性排除 → 汇总需求、季节与已确认医生标签 → 对剩余条目确定性评分 → 选择菜谱和茶饮 → 保存推荐历史。

硬性排除包括：成员过敏、明确忌口、`hardContraindications` 命中、儿童选择 `medicinalTea: true`。推荐时从成员生成安全标签：年龄段、`pregnant` 或 `postpartum`、慢性病和用药标签。它们命中 `cautionFlags` 时不自动排除，但每项扣 10 分并显示警告；命中 `hardContraindications` 时硬性排除。

评分前，将最近有效记录的医生确认标签按词表映射并并入成员需求标签。季节按中国本地公历月份确定：3-5 月春、6-8 月夏、9-11 月秋、12-2 月冬；候选含当前季节或 `all` 即视为季节命中。对每个成员与候选条目计算：`positive = 4 * 需求命中数 + 2 * 季节是否命中 + 1 * 偏好命中数`；`cautions = 成员安全标签与 cautionFlags 的命中数`；`memberScore = clamp(60 + 5 * positive - 10 * cautions, 0, 100)`。例如命中 1 个需求、当前季节和 1 个偏好，且无慎用命中，分数为 `60 + 5 * (4 + 2 + 1) = 95`。全家方案取所有成员分数的最小值，个人方案取该成员分数。菜谱和茶饮分别计算，最后按两者分数和降序、稳定 `id` 升序决胜，保证同输入得到同输出。

推荐历史记录包含 `id`、`date`、`scopeKey`、`memberIds`、`inputFingerprint`、`recipeId`、`teaId`、`status`、`sequence`、`createdAt`。全家 `scopeKey` 为 `all:<排序后的成员ID>`，个人为 `member:<成员ID>`。`inputFingerprint` 是当前成员安全相关字段、最近 active 舌诊记录 ID/确认时间和库数据版本的稳定哈希。首次推荐保存 `sequence: 1, status: active`；读取 active 记录时必须重新执行硬性安全校验并比较指纹，任何不匹配都先标记 `superseded` 再生成新方案。成员档案的过敏、忌口、年龄、孕期、慢性病、用药或需求变化，以及舌诊确认/归档/删除，都会在同一事务中使该成员相关历史失效。换方案收集该日期和范围的全部历史组合，排除后选择下一组，旧记录改为 `superseded`，新记录变为 `active`。候选耗尽时返回 `409 NO_ALTERNATIVE` 且不修改历史。刷新页面仅复用指纹仍匹配且安全复核通过的 active 记录。

删除家庭成员时级联删除该成员的舌诊记录与照片，并删除 `memberIds` 包含该成员的推荐历史。菜谱和茶饮库为只读示例数据，不提供页面编辑，因此不存在删除引用问题。

跨文件级联写入由 `JsonRepository.writeBatch` 完成：先在内存生成全部新文档并校验，为每个目标创建临时文件和备份，再写入 `data/.transaction.json` 事务清单，随后逐个原子替换；照片先移动到 `data/.trash/<transactionId>/`。成功后删除事务清单和回收站目录；启动时若发现未完成清单，则使用备份回滚 JSON，并把照片移回原位置。所有写操作共用同一进程级队列，避免事务交错。

核心 API 契约：所有失败响应统一为 `{ code, message, details? }`。

```text
GET    /api/family                        -> { members: [...] }
POST   /api/family                        -> 201 { member: {...} }
GET    /api/family/:id                    -> { member: {...} }
PUT    /api/family/:id                    -> { member: {...} }
DELETE /api/family/:id                    -> 204
GET    /api/library?type=recipe&q=...&tag=...
                                         -> { items: [...] }
GET    /api/library/:type/:id             -> { item: {...} }
GET  /api/recommendations?date=YYYY-MM-DD&scope=all
                                         -> { recipe, tea, reasons, warnings, scores }
GET  /api/recommendations?date=YYYY-MM-DD&scope=member:<memberId>
                                         -> { recipe, tea, reasons, warnings, scores }
POST /api/recommendations/rotate          body { date, scope: "all" | "member:<memberId>" }
                                         -> 200 同上 | 409 { code: "NO_ALTERNATIVE", message }
GET    /api/recommendation-history?date=...&scope=...
                                         -> { entries: [...] }
GET    /api/tongue-records?memberId=...   -> { records: [...] }
GET    /api/tongue-records/:id            -> { record: {...} }
POST   /api/tongue-records (multipart)    -> 201 { record: {...} }
PATCH  /api/tongue-records/:id            -> 200 { record: {...} }
POST   /api/tongue-records/:id/confirm    -> 200 { record: {...status:"active"} }
POST   /api/tongue-records/:id/archive    -> 200 { record: {...status:"archived"} }
POST   /api/tongue-records/:id/restore    -> 200 { record: {...status:"active"|"draft"} }
DELETE /api/tongue-records/:id            -> 204
```

首次生成时若安全候选菜谱或茶饮为空，返回 `422 NO_SAFE_PLAN`，`details.missing` 为 `recipe`、`tea` 或二者；不创建或修改推荐历史。页面根据 `missing` 说明哪类候选不足，并引导检查忌口或成员范围。个人范围中的成员不存在时返回 `404 NOT_FOUND`。

## 安全与错误处理

- 不对照片做疾病诊断；未经确认的观察项不改变推荐
- 过敏与明确忌口为硬性排除条件
- 儿童默认不推荐药性茶饮；孕期、慢性病和服药状态命中慎用标签时扣分并显示警告，明确硬性禁忌仍然排除
- 所有页面显示非医疗免责声明
- 表单和 API 校验必填字段、标签值、图片格式和大小
- JSON 读取失败时显示可理解的错误，并保留原文件；写入失败不覆盖旧数据
- 无可用候选时解释原因，并引导用户调整范围或档案，而不是生成无依据结果

照片仅接受 `image/jpeg`、`image/png`、`image/webp`，最大 5MB。服务端使用随机 UUID 文件名，拒绝路径穿越；替换照片时先写入新文件再删除旧文件，删除舌诊记录或家庭成员时同步删除其照片，启动时清理无引用孤立文件。

## 验收与测试

- 推荐引擎：给定固定示例输入时，过敏/忌口条目永不出现；儿童不会得到 `medicinalTea`；分数按固定公式计算；换方案排除历史组合，候选耗尽返回 `409 NO_ALTERNATIVE`
- 存储层：首次初始化创建 5 个 JSON 文件；更新后主文件和 `.bak` 均存在；主文件损坏时读取 `.bak` 并返回恢复警告；并发更新不丢字段
- API：成功返回 2xx 和 JSON；校验失败返回 `400 VALIDATION_ERROR`；不存在返回 `404 NOT_FOUND`；无替代返回 `409 NO_ALTERNATIVE`
- UI：四个一级导航、成员切换、换方案、表单校验、错误提示、移动端布局；AI舌诊页面明确显示“辅助记录，不做自动诊断”
- 端到端流程：编辑示例成员 → 修改忌口 → 上传并归档舌诊 → 生成推荐 → 刷新后确认数据保留 → 归档舌诊后确认标签不再影响新推荐

## 非目标

- 不接入豆包或其他云端模型
- 不提供疾病诊断、处方、药物相互作用判断或疗效承诺
- 不实现多用户账号、云同步和远程部署
