# 脚本说明

这个目录用于维护复盘站的数据流：手动创建每日综合记录、迁移旧 Hermes 数据、从每日记录生成周/月/年聚合数据。

## 数据流

```text
data/records/daily/YYYY-MM-DD.json
        ↓
scripts/aggregate.js
        ↓
data/summaries/weekly/YYYY-WXX.json
data/summaries/monthly/YYYY-MM.json
data/summaries/yearly/YYYY.json
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
      "type": "progress",
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

## aggregate.js

从 `data/records/daily/` 扫描每日综合记录，生成周/月/年聚合 JSON 和 manifest。

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
```

## generate-manifest.js

只重建 manifest，不重新计算聚合数据。

```bash
node scripts/generate-manifest.js
```

## 本地检查

```bash
node --check scripts/new-daily-record.js
node --check scripts/migrate-legacy-daily.js
node --check scripts/aggregate.js
node scripts/aggregate.js
```

## GitHub Actions

工作流会在以下情况下运行：

```text
定时触发
手动触发
main 分支中 index/css/js/data/records/data/summaries/scripts/templates 等路径变化
```

部署前会运行 `scripts/aggregate.js`，并提交生成的 manifest 与聚合数据。
