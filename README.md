# 🌾 复盘 — AI 工作复盘展示站

> 每天种下一行记录，到了年底回头看，是一片金色的收成。

一个展示 AI 自动化工作复盘的公开仪表盘。数据翔实但不过度装修，读起来像翻一本认真写的笔记本。

## 功能特性

- **Daily View** — 最近14天复盘记录，点击展开完整内容
- **Weekly/Monthly/Yearly** — 聚合视图（开发中）
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
│   │   └── daily.js        # Daily 视图
│   ├── components/
│   │   ├── card.js         # 卡片组件
│   │   ├── tag.js          # 标签组件
│   │   └── giscus.js       # Giscus 评论组件
│   └── utils/
│       └── date.js         # 日期工具函数
├── data/summaries/daily/  # 每日复盘数据 (JSON)
├── SPEC.md                 # 设计规范文档
└── README.md
```

## 数据格式

每日复盘 JSON 示例：

```json
{
  "date": "2026-03-30",
  "week": "2026-W13",
  "weekday": "Monday",
  "achievements": ["完成 cron delivery 修复"],
  "discussions": ["Agent 长期记忆方案"],
  "followUps": ["复盘项目 Phase 2"],
  "learnings": ["OpenClaw cron 时区问题"],
  "projects": ["复盘项目", "OpenClaw"],
  "tags": ["OpenClaw", "复盘项目"],
  "mood": "🟢"
}
```

## 部署

项目使用 GitHub Actions 每日自动构建：

1. GitHub Actions 定时任务（每日 00:05 UTC）从 `memory/summaries/` 拉取数据
2. 生成 weekly/monthly/yearly 聚合 JSON
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
