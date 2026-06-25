# 🌾 复盘 — 个人经营复盘系统

> 每天种下一行记录，到了年底回头看，是一片金色的收成。

一个面向主业、副业、生活和内容产出的个人经营复盘站。试运行阶段以手动每日综合记录为核心，先让记录能驱动行动，再逐步引入 AI 分析和洞察。

## 功能特性

- **Daily View** — 最近 14 天每日综合记录，支持按场景展开查看
- **Weekly/Monthly/Yearly** — 从每日记录聚合出的周、月、年视图
- **Home 四场景面板** — 主业、副业、生活和自我、内容产出的当前重点和下一步
- **Projects** — 按项目线查看时间线、决策、卡点和 open follow-up
- **Diary** — 私密碎片记录入口，支持本地草稿和 JSON 记录展示
- **Content** — 从记录中提取公众号素材和选题
- **手动记录模板** — 通过脚本生成当天记录文件
- **Giscus 评论** — 基于 GitHub Discussions 的评论区
- **键盘导航** — ← → 键切换相邻日期
- **标签系统** — 项目、话题分类
- **响应式设计** — 移动端优先

## 本地预览

### 方法一：直接打开（推荐）

```bash
# 克隆仓库
git clone https://github.com/Simidas/summary-dashboard.git
cd summary-dashboard

# macOS
open index.html

# Linux
xdg-open index.html

# Windows
start index.html
```

> ⚠️ 注意：由于使用了 ES Modules (`<script type="module">`)，部分浏览器需要通过 HTTP 服务访问才能正常加载。

### 方法二：HTTP 服务

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8080
```

然后访问 http://localhost:8080

## 项目结构

```
summary-dashboard/
├── index.html              # 单页应用入口
├── css/
│   ├── variables.css       # CSS 自定义属性（颜色、字体、间距）
│   ├── base.css            # 基础样式重置
│   ├── layout.css          # 布局系统
│   └── components.css      # 组件样式
├── js/
│   ├── app.js              # 主入口，路由+状态
│   ├── router.js           # Hash 路由
│   ├── data.js             # 数据加载+缓存
│   ├── views/
│   │   ├── home.js         # Home 四场景面板
│   │   ├── daily.js        # Daily 视图
│   │   ├── domain.js       # 场景详情
│   │   ├── projects.js     # 项目线视图
│   │   ├── diary.js        # Diary 视图
│   │   └── content.js      # 内容素材池
│   ├── components/
│   │   ├── card.js         # 卡片组件
│   │   ├── tag.js          # 标签组件
│   │   └── giscus.js       # Giscus 评论组件
│   └── utils/
│       └── date.js         # 日期工具函数
├── data/records/daily/    # 每日综合记录 (JSON)
├── data/records/diary/    # Diary 记录 (JSON)
├── data/summaries/        # 聚合数据 (JSON)
├── data/legacy/           # 已迁移的历史数据
├── scripts/               # 记录生成、迁移、聚合脚本
├── templates/             # 手动记录模板
├── SPEC.md                 # 设计规范文档
├── PRD.md                  # 迭代 PRD
├── WORKFLOW_GUIDE.md       # 使用指南
└── README.md
```

## 数据格式

每日综合记录 JSON 示例：

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
      "raw": "梳理租赁合同状态流转，发现历史状态不统一。",
      "summary": "",
      "projects": ["租赁系统"],
      "tags": ["合同", "状态机"],
      "blockers": ["老数据状态含义不一致"],
      "decisions": [],
      "nextActions": ["画出现有合同状态流转图"],
      "contentSeeds": ["复杂业务系统里的状态机设计"],
      "visibility": "private",
      "aiAnalysis": {
        "analysis": "",
        "suggestions": []
      }
    }
  ],
  "dailyReview": {
    "mostImportantThing": "完成合同状态流转梳理",
    "reflection": "先理解业务语义，再写迁移逻辑。",
    "tomorrowFirstStep": "补充异常状态案例",
    "contentCreated": false,
    "mood": ""
  }
}
```

旧 Hermes 自动生成的 Daily JSON 已迁移为统一结构，并归档到 `data/legacy/hermes-daily/`。

### 新建当天记录

```bash
node scripts/new-daily-record.js
```

指定日期：

```bash
node scripts/new-daily-record.js 2026-06-24
```

新建 Diary：

```bash
node scripts/new-diary-entry.js
node scripts/new-diary-entry.js 2026-06-24
```

生成聚合数据：

```bash
node scripts/aggregate.js
```

## 部署

项目使用 GitHub Actions 自动构建：

1. 提交 `data/records/daily/` 下的每日综合记录
2. GitHub Actions 生成 weekly/monthly/yearly 聚合 JSON
3. 自动部署到 Cloudflare Pages

## 技术栈

- 纯 HTML + CSS + Vanilla JS（零框架依赖）
- CSS Custom Properties
- ES Modules
- Giscus (GitHub Discussions)
- Phosphor Icons

## 设计规范

详见 [SPEC.md](./SPEC.md)

---

Built with 🌾 by [Simidas](https://github.com/Simidas)
