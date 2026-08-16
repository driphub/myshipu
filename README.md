# 明膳 · 家庭食养

一个纯本地运行的药食同源家庭工具。系统根据家庭成员的健康目标、饮食偏好、过敏和忌口，每天推荐菜谱与茶饮，并说明推荐依据。

## 功能

- 今日推荐：全家或个人方案、成员适配度、推荐依据、换一套方案
- 家庭档案：年龄、健康目标、偏好、过敏、忌口、孕期/产后、慢性病和用药提示
- 药膳茶饮库：搜索、分类、功效筛选、材料与步骤
- AI舌诊：本地保存照片、结构化观察和专业医生结论

“AI舌诊”是辅助记录功能，不会自动分析照片或诊断疾病。所有食养建议仅供日常饮食参考，不替代医疗诊断、处方或治疗。

## Node.js 本地版

需要 Node.js 14.14 或更高版本，无需联网安装依赖。

```bash
npm start
```

然后打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。macOS 也可直接双击 `start-macos.command`。

更换端口：

```bash
PORT=5000 npm start
```

## 本地数据

第一次启动时自动创建：

- `data/family.json`
- `data/recipes.json`
- `data/teas.json`
- `data/tongue-records.json`
- `data/recommendation-history.json`
- `data/uploads/`（舌苔照片）

JSON 更新前会保留 `.bak` 备份。系统运行期间不建议直接修改文件；需要手工调整时，请先停止服务。

图片只接受 JPG、PNG 和 WebP，最大 5MB，文件不会上传到互联网。

## 纯 HTML / GitHub Pages 版

静态版无需 Node.js 服务器，四个页面和推荐规则都在浏览器内运行。构建发布文件：

```bash
npm run build:static
```

产物位于 `docs/`。本地按与 GitHub Pages 相同的 `/myshipu/` 子路径预览：

```bash
npm run preview:static
```

然后打开 [http://127.0.0.1:4174/myshipu/](http://127.0.0.1:4174/myshipu/)。

GitHub 仓库中进入 **Settings > Pages**，选择：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/docs`

发布地址为 [https://driphub.github.io/myshipu/](https://driphub.github.io/myshipu/)。每次修改静态版源码后，重新运行 `npm run build:static` 并提交 `docs/` 产物。

### 浏览器数据与隐私

- 家庭档案、舌象照片和推荐历史保存在 IndexedDB，只属于当前浏览器资料，不会自动写入 Git 仓库或同步到其他设备。
- IndexedDB 按网站 origin 隔离，不按 `/myshipu/` 路径隔离。同一 `driphub.github.io` origin 下的其他页面理论上可访问同一数据库；需要更强隔离时应使用独立自定义域名。
- 清除站点数据、结束无痕浏览或更换浏览器/设备会丢失未备份数据。家庭档案页提供“导出数据”和“导入数据”。
- 导出的 JSON 未加密，包含家庭健康资料和舌象照片，应作为敏感文件妥善保管。
- 静态版初次加载页面、模块、图片和种子数据后，档案编辑、推荐和舌象记录不需要服务器 API。

## 测试

```bash
npm test
```

测试覆盖数据校验、原子持久化、推荐过滤与评分、家庭及舌象状态、HTTP API、IndexedDB 静态适配器、前端契约、静态构建和完整持久化流程。
