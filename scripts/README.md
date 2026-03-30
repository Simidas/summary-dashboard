# 聚合脚本

用于将每日摘要聚合为周/月/年维度的统计数据。

## aggregate.js

### 功能

- 扫描 `data/summaries/daily/` 目录下的所有 JSON 文件
- 生成 `data/summaries/weekly/YYYY-WXX.json`（按 ISO 周分组）
- 生成 `data/summaries/monthly/YYYY-MM.json`（按月份分组）
- 生成 `data/summaries/yearly/YYYY.json`（按年份分组）

### 数据格式

**每日摘要** `data/summaries/daily/YYYY-MM-DD.json`
```json
{
  "date": "2026-03-30",
  "week": "2026-W13",
  "weekday": "Monday",
  "achievements": ["成就1", "成就2"],
  "discussions": ["讨论1"],
  "followUps": ["待跟进1"],
  "learnings": ["教训1"],
  "projects": ["项目A"],
  "contentCreated": true,
  "exercise": "跑步30分钟",
  "tags": ["AI自动化", "技术踩坑"],
  "mood": "🟢"
}
```

**每周摘要** `data/summaries/weekly/YYYY-WXX.json`
```json
{
  "year": 2026,
  "week": "W13",
  "dateRange": "2026-03-24 ~ 2026-03-30",
  "days": 7,
  "totalAchievements": 12,
  "totalDiscussions": 3,
  "totalFollowUps": 5,
  "topProjects": ["项目A", "项目B"],
  "topTags": ["AI自动化", "踩坑"],
  "contentPublished": 2,
  "dailyRecords": ["2026-03-24", "2026-03-25", ...]
}
```

**每月摘要** `data/summaries/monthly/YYYY-MM.json`
```json
{
  "year": 2026,
  "month": "03",
  "monthName": "三月",
  "totalAchievements": 45,
  "totalDiscussions": 12,
  "weeks": ["W10", "W11", "W12", "W13"],
  "topProjects": ["项目A"],
  "topTags": ["AI自动化"],
  "contentPublished": 3
}
```

**每年摘要** `data/summaries/yearly/YYYY.json`
```json
{
  "year": 2026,
  "totalAchievements": 200,
  "totalProjects": 5,
  "totalContentPublished": 12,
  "topTags": ["AI自动化", "踩坑"],
  "months": ["2026-01", "2026-02", ...]
}
```

## 本地运行

```bash
cd /root/projects/summary-dashboard
node scripts/aggregate.js
```

## GitHub Actions

聚合脚本在 GitHub Actions 中自动运行：

- **触发时间**：每日 09:00 UTC（北京时间 17:00）
- **触发方式**：
  1. 定时触发（cron）
  2. 手动触发（workflow_dispatch）
  3. 当 `data/summaries/` 目录有变更时

### 本地测试

```bash
# 1. 确保有每日数据
ls data/summaries/daily/

# 2. 运行聚合
node scripts/aggregate.js

# 3. 检查生成的文件
ls data/summaries/weekly/
ls data/summaries/monthly/
ls data/summaries/yearly/
```

### 数据来源

每日摘要数据来自 workspace 仓库：
`/root/.openclaw/workspace/memory/summaries/daily/`

GitHub Actions 在构建时会从 [Ledazhushou](https://github.com/Simidas/Ledazhushou) 仓库拉取最新数据。
