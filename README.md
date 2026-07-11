# 复盘 — 人生经营复盘系统

> 帮你持续记录、接住情绪、推进事情、定期复盘的个人经营系统。

这是一个面向主业、副业、生活和自我、内容产出的个人经营复盘站。当前线上版本已经升级为 Cloudflare Workers + D1 + Google OAuth 的在线记录系统，主数据源从仓库 JSON 切换为 D1。

线上域名：https://blog.zhuwd.com

当前实现详情见：[docs/current-implementation.md](./docs/current-implementation.md)

## 功能特性

- **Google 登录与 owner 写入权限**：只有 `OWNER_EMAIL` 对应 Google 账号可以写入和查看私密数据。
- **首页快速记录**：保存原始记录后先返回成功，AI 建议后台生成并回填。
- **四场景经营面板**：主业、副业、生活和自我、内容产出的当前重点、下一步、未闭环事项。
- **Diary**：随时记录情绪、想法和碎碎念，AI 给出陪伴式分析和行动建议。
- **Daily**：在线编辑每日综合复盘，支持选择日期补写。
- **Weekly / Monthly / Yearly**：基于每日复盘、在线记录、follow-up、内容素材生成趋势和经营洞察。
- **周期复盘与趋势**：周/月/年趋势卡片内融合复盘状态、主题、摘要和“查看/编辑复盘”入口。
- **Projects**：项目创建、编辑、删除、详情页时间线和关联记录写入。
- **Follow-up**：未闭环事项支持计划时间、状态流转、超时标识。
- **Content**：管理内容素材、选题、状态和下一步。
- **宠物激励**：根据记录天数、连续记录、经验值和等级给予轻量正反馈；中断会扣减经验。
- **Giscus 评论**：保留在 Daily / Weekly / Monthly / Yearly 视图中作为公开讨论区。

## 当前数据逻辑

线上主数据源是 Cloudflare D1。

核心表：

- `records`：在线记录、Diary、场景记录、项目记录。
- `ai_suggestions`：单条记录的 AI 陪伴建议。
- `daily_reviews`：每日综合复盘。
- `period_reviews`：周/月/年周期复盘草稿与确认记录。
- `followups`：未闭环事项。
- `followup_events`：待办创建、延期、完成、放弃和重新打开的事件历史。
- `suggestion_decisions`：AI 建议候选项的采纳、修改和忽略决定。
- `insights`：用户确认或观察中的认知、规律、风险与策略。
- `daily_focus`：按日期保存的今日重点及完成结果。
- `projects`：项目。
- `content_items`：内容素材。
- `domain_settings`：四场景当前重点和下一步。
- `user_state`：连续记录、经验值、等级。

仓库里的 `data/records` 和 `data/summaries` 仍保留，但现在主要用于历史导入、静态 fallback、本地归档和备份。

## 周度复盘与趋势标签逻辑

周度趋势卡片的标签展示已经统一：

- 顶部标签：高频内容标签，来源为 `record.tags` + `aiSuggestion.suggestedTags`。
- 底部标签：项目标签，来源为 `record.projects`。
- 日期不再以标签形式展示。

月度和年度趋势也使用相同的内容标签/项目聚合逻辑。

## 本地开发

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

健康检查：

```bash
curl http://localhost:8787/api/health
```

## 常用命令

```bash
# 准备 Worker 静态资源
npm run build

# 本地 D1 migration
npm run d1:migrate:local

# 远端 D1 migration
npm run d1:migrate:remote

# 本地启动 Worker
npm run dev:worker

# 部署 Worker
npm run deploy:worker

# 部署前显式跑远端 migration
npm run deploy:worker:migrate

# JS 语法检查
npm run check:js

# 导出远端 D1 SQL 备份（写入 backups/，不会提交 Git）
npm run backup:d1

# 导出本地 D1 SQL 备份
npm run backup:d1:local
```

登录 Owner 账号后，还可以通过 `/api/export?format=json` 或
`/api/export?format=markdown` 下载个人数据；导出不包含 Session 等认证数据。

## 部署

当前仓库不保留 GitHub Actions 部署工作流，push 后的自动部署依赖 Cloudflare Workers Builds 的 Git 集成。

Cloudflare Workers Builds 推荐配置：

```text
Production branch: main
Root directory: /
Build command: npm run build
Deploy command: npm run deploy
```

如果只想配置 Deploy command，也可以使用：

```bash
npm run deploy:worker
```

不要直接使用 `npx wrangler deploy`，否则可能漏掉 `public/` 静态资源准备。

D1 schema 不在 Worker 运行期兜底创建。首次部署、schema 变更，或线上出现缺表/缺字段导致的 500 时，手动执行：

```bash
npm run d1:migrate:remote
```

需要部署前显式执行 migration 时使用：

```bash
npm run deploy:worker:migrate
```

## 环境变量

普通变量在 [wrangler.toml](./wrangler.toml) 中配置：

```text
APP_ORIGIN
OWNER_EMAIL
GOOGLE_CLIENT_ID
AI_PROVIDER
MINIMAX_MODEL
MINIMAX_API_BASE_URL
```

Secrets 使用 Wrangler 配置：

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put MINIMAX_API_KEY
```

MiniMax 订阅 key 当前使用：

```text
https://api.minimaxi.com/v1
```

## 历史 JSON 导入 D1

线上推荐按 owner 邮箱导入。前提是已经用 Google 登录过一次，`users` 表中存在该邮箱：

```bash
node scripts/import-json-to-d1.js --owner-email you@example.com > .wrangler/import-static-json.sql
wrangler d1 execute summary-dashboard --remote --file .wrangler/import-static-json.sql
```

本地验证可使用临时 owner id：

```bash
node scripts/import-json-to-d1.js --owner-id owner-import > .wrangler/import-static-json.sql
wrangler d1 execute summary-dashboard --local --file .wrangler/import-static-json.sql
```

## 项目结构

```text
summary-dashboard/
├── index.html
├── css/
├── js/
├── src/                    # Worker API
│   ├── worker.js
│   ├── routes/
│   ├── lib/
│   └── prompts/
├── migrations/             # D1 schema
├── scripts/                # 静态资产准备、历史导入、旧 JSON 工具
├── data/                   # 历史 JSON / 静态 fallback
├── docs/
│   └── current-implementation.md
├── public/                 # 生成产物，不提交
├── wrangler.toml
└── package.json
```

## 设计与需求文档

- 当前实现状态：[docs/current-implementation.md](./docs/current-implementation.md)
- 使用指南：[WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md)
- 设计规范：[SPEC.md](./SPEC.md)
- 在线记录 PRD：[docs/vnext-online-recording-prd.md](./docs/vnext-online-recording-prd.md)
- 系统设计：[docs/vnext-online-recording-system-design.md](./docs/vnext-online-recording-system-design.md)
- 部署交接：[docs/deployment-handoff-malayyan.md](./docs/deployment-handoff-malayyan.md)

Built with care by [Simidas](https://github.com/Simidas)
