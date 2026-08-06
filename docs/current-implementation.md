# 当前实现状态

更新时间：2026-08-06
线上域名：https://blog.zhuwd.com
当前形态：Cloudflare Workers + Static Assets + D1 + Google OAuth + MiniMax M3

## 1. 产品定位

本项目是仅供 Owner 使用的个人在线经营复盘系统。当前分支已完成私人工具模式收口，待 Owner Review 后部署；部署后不承担公开博客、内容分发或访客阅读能力。

当前最新迭代开始落地“记录中枢与 AI 类型化增强”：所有输入先归属四大场景和一个记录类型，再由 AI 按类型增强。输入体系已进一步收敛为“场景、类型、主题标签、原文”。

四个长期场景：

- 主业：公寓租赁行业系统后端开发、业务理解、技术沉淀。
- 副业：网站产品出海、产品实验、增长验证。
- 生活和自我：家庭关系、夫妻、父子、儿女关系，以及自身状态。
- 内容产出：从工作、副业和生活记录里沉淀公众号内容素材。

## 2. 当前已落地能力

### 登录与权限

- Google OAuth 登录已接入。
- `OWNER_EMAIL` 对应账号为 owner，可读取、写入并触发 AI。
- 未登录访客只能看到登录入口，不能读取任何记录、聚合、项目、待办或内容素材。
- 非 Owner Google 账号不能访问私有 API。
- 写入接口使用 HttpOnly session cookie + CSRF token。
- session 支持 48 小时内活跃刷新，长时间无操作后需要重新登录。
- 所有响应带 `X-Robots-Tag: noindex`，页面和 `robots.txt` 同时禁止收录。

### 在线记录

- 首页、场景页、Diary、Projects、Content、Follow-up 等模块已接入在线写入。
- 新增 `Records` 统一记录中枢，支持情绪、任务、笔记、复盘、灵感、日记、健康等手动输入类型。
- 首页不再直接承载完整输入表单，只保留 Records 引导和快捷类型入口；真正新增记录统一从 `Records` 进入。
- 输入表单支持场景与类型联动：健康、日记只在生活场景下可选。
- 内容素材不再作为手动输入类型，改由 AI 从任意记录中识别为内容候选。
- 用户手动标签收敛为主题标签，Records 中按记录类型展示枚举标签，枚举没有时可手动补充，最多保存 3 个。
- 历史旧类型不再做长期兼容展示，会通过 D1 migration 清洗到新版类型。
- 记录主表为 D1 `records`，字段包含 `domain`、`type`、`visibility`、`mood`、`energy`、`projects`、`tags`、`nextActions`。
- `records` 新增 `structured_payload_json` 和 `ai_status`，用于保存类型化补充字段和 AI 生成状态。
- 任务类记录会自动生成未闭环事项。
- AI 判断出的内容素材、Daily 复盘、项目线索和非任务待办会展示为“分流建议”，owner 确认后写入对应模块。
- 新建和更新记录都强制保存为 `private`，表单不提供公开选项。
- 记录保存与 AI 生成解耦：先返回保存成功和 `aiPending`，AI 建议后台生成后前端轮询更新。

### AI 陪伴与分析

- AI provider 默认为 MiniMax，模型为 `MiniMax-M3`。
- 单条记录 AI 输出保存到 `ai_suggestions`。
- AI prompt 已升级为类型化版本：情绪类偏陪伴，任务类偏推进，笔记类偏整理，复盘类偏分析，健康类偏状态观察。
- 输出重点是情绪陪伴、具体鼓励、下一小步、主题标签建议、状态/对象/行动/影响标签、建议 follow-up 和候选判断。
- `ai_suggestions` 新增 `record_type`、`prompt_version`、`structured_result_json`、`destination_suggestions_json`。
- Daily 支持基于当天记录、每日复盘、follow-up、内容素材生成 AI 每日分析草稿。
- 场景页支持近 7 天/30 天经营分析，输出事实、状态、推进、卡点、模式和下一步。
- Weekly、Monthly、Yearly 支持 AI 周期分析快照，分别聚焦节奏、趋势和方向。
- 分析结果保存到 `analysis_snapshots`，避免每次打开页面都重新请求大模型。
- 分析中的下一步可以一键转为 `followups`，通过 `source_analysis_id` 和 `source_action_hash` 去重。
- 分析中的建议暂缓事项可以一键写入 `followups`，状态为 `deferred`。
- AI 失败不影响原始记录保存。

### 每日综合复盘

- Daily 模块支持在线编辑指定日期的每日综合复盘，默认今天，也可补昨天或历史日期。
- Daily 心情改为枚举选择：平静、开心、有进展感、疲惫、焦虑、烦躁、低落、松了一口气。
- 每日复盘数据存入 `daily_reviews`。
- Daily 头部展示逻辑：优先展示当天已保存复盘；当天没有时展示最近一天的已保存复盘。
- Daily 页面提供 AI 每日分析草稿入口，按当前复盘日期读取或生成对应分析。

### 周/月/年复盘与趋势

- Weekly、Monthly、Yearly 基于 D1 中的记录、每日复盘、follow-up、内容素材实时聚合。
- 周/月/年页面上方有自动经营洞察，展示复盘节奏、闭环率、成果沉淀、能量、超时事项等指标。
- 周期复盘草稿存入 `period_reviews`，支持手动保存、状态标记为 `draft` 或 `confirmed`。
- 支持 AI 生成周期复盘草稿，接口会读取对应周期内的记录、每日复盘、follow-up 和内容素材生成草稿。
- 周/月/年页面已接入 AI 周期分析面板，分析结果存入 `analysis_snapshots`：
  - Weekly 看节奏、场景投入、闭环和下周重点。
  - Monthly 看主线、项目推进、反复模式和下月策略。
  - Yearly 看长期变化、投入产出、长期问题和下一年方向。
- 周期分析会把长期未闭环事项放入观察项，并可把建议暂缓事项标记为 `deferred`。
- 原独立“周期复盘历史”已融合进趋势卡片：
  - 卡片展示系统统计数据。
  - 同时展示复盘状态、主题、摘要和更新时间。
  - 点击“查看/编辑复盘”会切换上方周期复盘编辑区。
- 周度复盘与趋势标签逻辑：
  - 顶部标签：高频内容标签，来源为 `record.tags` + `aiSuggestion.suggestedTags`。
  - 底部标签：项目标签，来源为 `record.projects`。
  - 日期标签不再展示。

### 场景经营分析

- 四个场景页支持 AI 经营分析。
- 默认读取近 7 天分析，可切换近 30 天。
- 分析输入来自该场景下的 `records`、`followups`、`content_items`，并参考能匹配场景的每日复盘信号。
- 分析输出保存为 `analysis_snapshots`，页面只展示已保存分析，点击生成/刷新才会请求大模型。
- 分析下一步可以直接转成未闭环事项。

### Follow-up 与项目

- Follow-up 数据存入 `followups`，支持创建、更新状态、计划时间、项目关联。
- 首页和场景页都会展示未闭环事项，超过或等于计划时间的 open/deferred 事项显示超时。
- AI 分析和周期复盘草稿里的下一步都可以转为 follow-up。
- 长期未闭环事项会进入周期分析提醒，适合重拆、推进或暂缓。
- Projects 数据存入 `projects`，支持创建、编辑、删除和详情页时间线。
- 项目状态统一为 `active / paused / completed / dropped`。默认项目列表和所有关联项目入口只返回 `active / paused`，项目管理页显式请求全部状态；旧状态通过 D1 migration 清洗，不在运行时代码里做兼容。
- 项目详情可以继续写入关联项目的记录。

### 内容素材

- Content 模块数据存入 `content_items`。
- 支持内容素材创建、状态流转、标签、下一步。
- 周/月/年趋势会统计内容素材和已发布数量。

### 个人经营面板与宠物激励

- Dashboard 聚合 `records`、`daily_reviews`、`followups`、`user_state`。
- 首页展示今日是否记录、今日重点、下一小步、未闭环事项、场景概览、最近记录、内容素材和宠物成长。
- `user_state` 维护总记录数、连续记录天数、最长连续天数、等级和经验值。
- 连续天数中断会扣减经验值，可能导致降级。

## 3. 数据来源与存储

当前线上主数据源是 Cloudflare D1。

D1 表：

- `users`
- `sessions`
- `records`
- `ai_suggestions`
- `daily_reviews`
- `user_state`
- `projects`
- `dashboard_settings`
- `content_items`
- `followups`
- `domain_settings`
- `period_reviews`
- `analysis_snapshots`

新增迁移：

- `migrations/0004_unified_input_ai_enhancement.sql`
- `migrations/0005_clean_legacy_input_data.sql`
- `migrations/0006_clean_project_statuses.sql`
- `migrations/0007_analysis_snapshots.sql`

仓库里的 `data/records`、`data/summaries` 和历史 JSON 现在主要作为：

- 历史导入来源。
- 备份/归档格式。
- 本地开发参考数据。

这些目录不会复制到 Worker 的 `public/`，生产环境不存在历史 JSON 静态 fallback。

## 4. API 概览

- `GET /api/health`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard`
- `PATCH /api/dashboard-settings`
- `GET /api/records`
- `POST /api/records`
- `GET /api/records/:id`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id`
- `POST /api/records/:id/ai/regenerate`
- `POST /api/records/:id/destinations`
- `GET /api/daily-reviews`
- `GET /api/daily-reviews/:date`
- `PUT /api/daily-reviews/:date`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:slugOrId`
- `PATCH /api/projects/:slugOrId`
- `DELETE /api/projects/:slugOrId`
- `GET /api/followups`
- `POST /api/followups`
- `PATCH /api/followups/:id`
- `DELETE /api/followups/:id`
- `GET /api/content-items`
- `POST /api/content-items`
- `PATCH /api/content-items/:id`
- `DELETE /api/content-items/:id`
- `GET /api/domain-settings/:domain`
- `PATCH /api/domain-settings/:domain`
- `GET /api/period-reviews?type=weekly|monthly|yearly`
- `GET /api/period-reviews/:type/:key`
- `PUT /api/period-reviews/:type/:key`
- `POST /api/period-reviews/:type/:key/generate`
- `GET /api/analysis/:scopeType/:scopeKey`
- `POST /api/analysis/:scopeType/:scopeKey/generate`
- `POST /api/analysis/:analysisId/followups`

## 5. 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run prepare:worker-assets
npm run d1:migrate:local
npm run dev:worker
```

访问：

```text
http://localhost:8787/#home
```

常用校验：

```bash
npm run check:js
find js src scripts -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check
npm run prepare:worker-assets
```

## 6. 部署

Cloudflare 自动部署依赖 Workers Builds 的 Git 集成，仓库不保留 GitHub Actions 部署工作流。

Workers Builds 推荐配置：

```text
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npm run deploy
```

如果只配置 Deploy command，也可以使用：

```bash
npm run deploy:worker
```

首次部署、schema 变化或线上出现缺表/缺字段时，手动执行：

```bash
npm run d1:migrate:remote
```

本次 `Records` 输入体系清洗上线前必须执行远程 D1 migration，用于把历史旧类型、自由心情、过长标签清洗到新版结构。

如果希望部署前显式跑 migration：

```bash
npm run deploy:worker:migrate
```

注意：

- D1 schema 不在 Worker 运行期兜底创建。
- `public/` 由 `npm run prepare:worker-assets` 生成，不提交。
- MiniMax key、Google secret、session secret 均通过 Wrangler secrets 配置。
