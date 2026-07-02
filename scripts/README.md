# 脚本说明

这个目录用于维护复盘站的数据流：手动创建每日综合记录和 Diary，迁移旧 Hermes 数据，把历史静态 JSON 导入 D1。

## 数据流

```text
data/records/daily/*.json
data/summaries/**/*.json
        ↓
scripts/import-json-to-d1.js
        ↓
Cloudflare D1
        ↓
Workers API
        ↓
前端实时聚合 Daily / Weekly / Monthly / Yearly / Domain / Project / Content
```

旧 Hermes Daily JSON 已迁移到统一结构，原始文件归档在：

```text
data/legacy/hermes-daily/
```

## new-daily-record.js

创建一份手动填写的每日综合记录模板。

```bash
node scripts/new-daily-record.js
node scripts/new-daily-record.js 2026-06-24
```

生成文件：

```text
data/records/daily/YYYY-MM-DD.json
```

核心结构：

```json
{
  "date": "2026-06-24",
  "source": "manual",
  "records": [
    {
      "id": "record-20260624-001",
      "createdAt": "2026-06-24T09:00:00+08:00",
      "domain": "work",
      "type": "note",
      "raw": "",
      "summary": "",
      "projects": [],
      "tags": [],
      "blockers": [],
      "decisions": [],
      "nextActions": [],
      "contentSeeds": [],
      "visibility": "private",
      "aiAnalysis": {
        "analysis": "",
        "suggestions": []
      }
    }
  ],
  "dailyReview": {
    "mostImportantThing": "",
    "reflection": "",
    "tomorrowFirstStep": "",
    "contentCreated": false,
    "mood": ""
  }
}
```

## migrate-legacy-daily.js

把归档的旧 Hermes Daily JSON 转为统一的每日综合记录结构。

```bash
node scripts/migrate-legacy-daily.js
```

默认不会覆盖已经存在的新记录。如需强制重新迁移：

```bash
node scripts/migrate-legacy-daily.js --force
```

输入目录：

```text
data/legacy/hermes-daily/
```

输出目录：

```text
data/records/daily/
```

## new-diary-entry.js

创建一条私密 Diary 记录模板。

```bash
node scripts/new-diary-entry.js
node scripts/new-diary-entry.js 2026-06-24
```

生成文件：

```text
data/records/diary/diary-YYYYMMDD-001.json
```

并自动更新：

```text
data/records/diary/manifest.json
```

## aggregate.js

从 `data/records/daily/` 扫描每日综合记录，生成历史静态聚合 JSON 和 manifest。

线上主数据源已切换为 D1，`aggregate.js` 只保留作历史归档和无 API 静态预览使用。

```bash
node scripts/aggregate.js
```

输出：

```text
data/records/daily/manifest.json
data/summaries/weekly/manifest.json
data/summaries/monthly/manifest.json
data/summaries/yearly/manifest.json
data/summaries/weekly/YYYY-WXX.json
data/summaries/monthly/YYYY-MM.json
data/summaries/yearly/YYYY.json
data/summaries/domains/overview.json
data/summaries/projects/manifest.json
data/summaries/followups/open.json
data/summaries/content/seeds.json
data/summaries/insights/weekly/YYYY-WXX.json
```

## generate-manifest.js

只重建 manifest，不重新计算聚合数据。

```bash
node scripts/generate-manifest.js
```

## import-json-to-d1.js

把当前仓库里的历史静态 JSON 导入 D1。脚本会生成 SQL，不会直接连接 Cloudflare。

覆盖范围：

```text
data/records/daily/*.json              -> records, daily_reviews
data/summaries/projects/*.json         -> projects
data/summaries/followups/*.json        -> followups
data/summaries/content/seeds.json      -> content_items
data/summaries/domains/*.json          -> domain_settings
data/summaries/insights/weekly/*.json  -> period_reviews
data/summaries/monthly/*.json          -> period_reviews
data/summaries/yearly/*.json           -> period_reviews
```

推荐线上按 owner 邮箱导入。前提是你已经在网站上完成过一次 Google 登录，`users` 表里已有这个邮箱：

```bash
node scripts/import-json-to-d1.js --owner-email you@example.com > .wrangler/import-static-json.sql
wrangler d1 execute summary-dashboard --remote --file .wrangler/import-static-json.sql
```

如果只是本地验证，也可以指定临时 owner id：

```bash
node scripts/import-json-to-d1.js --owner-id owner-import > .wrangler/import-static-json.sql
wrangler d1 execute summary-dashboard --local --file .wrangler/import-static-json.sql
```

脚本使用 `INSERT OR IGNORE`，重复执行不会覆盖线上已经存在的数据。

默认输出不包含 `BEGIN TRANSACTION` / `COMMIT`，以兼容 `wrangler d1 execute --remote --file`。如果只是本地 SQLite 验证并且需要事务包裹，可以加：

```bash
node scripts/import-json-to-d1.js --owner-id owner-import --with-transaction
```

## 本地检查

```bash
node --check scripts/new-daily-record.js
node --check scripts/new-diary-entry.js
node --check scripts/migrate-legacy-daily.js
node --check scripts/aggregate.js
node scripts/aggregate.js
```

## 自动部署说明

当前线上部署以 Cloudflare Workers 为准。Cloudflare 自动部署的 Deploy command 应使用：

```bash
npm run deploy:worker
```

不要直接使用 `npx wrangler deploy`，否则可能漏掉 `public/` 静态资源准备。

D1 schema 不在 Worker 运行期兜底创建。首次部署、schema 变化，或线上出现缺表/缺字段导致的 500 时，手动执行：

```bash
npm run d1:migrate:remote
```

如果希望部署前显式跑 migration：

```bash
npm run deploy:worker:migrate
```
