# 个人 AI 复盘展示站 — SPEC.md

> 本文件是项目的设计规范文档，所有实现必须严格遵循。如需调整，必须先更新此文档再改代码。

---

## 1. Concept & Vision

**是什么：** 一个展示 AI 自动化工作复盘的公开博客/仪表盘。

**核心理念：** 「数字农夫的水稻田」——每天种下一行记录，到了年底回头看，是一片金色的收成。数据翔实但不过度装修，有手工感但不粗糙。读起来像翻一本认真写的笔记本，而不是刷社交媒体。

**目标读者：** 对 AI 提效感兴趣的技术人、潜在读者/粉丝

**内容基调：** 真实、不端着、有过程（踩坑+突破都有）

---

## 2. Design Language

### 2.1 Aesthetic Direction
**关键词：** Digital Garden / 数字园艺 / 手账感

灵感参考：Notion 官方博客的干净排版 + 传统手账的温暖感。不是极简主义黑白灰，而是带一点点暖调，让人愿意停留。

### 2.2 Color Palette
```
--bg-primary:     #FAFAF8   // 米白底，有温度
--bg-card:       #FFFFFF   // 卡片纯白
--text-primary:  #1A1A1A   // 深灰黑
--text-secondary:#6B6B6B   // 次要灰
--accent:        #D97706   // 琥珀橙，温暖的品牌色
--accent-light:  #FEF3C7   // 浅橙背景，用于标签/高亮
--border:        #E5E5E0   // 柔和边框线
--success:       #059669   // 绿色，用于完成状态
```

### 2.3 Typography
- **标题：** `Noto Serif SC`（思源宋体）— 有书卷气，适合长文阅读
- **正文：** `Noto Sans SC`（思源黑体）— 清晰易读
- **代码/数据：** `JetBrains Mono` 或 `Fira Code`
- **英文辅助：** `Inter`
- Google Fonts CDN 加载，优先字体

### 2.4 Spatial System
- 基础单位：8px
- 卡片内边距：24px
- 区块间距：48px
- 最大内容宽度：720px（居中）
- 响应式：移动端 16px 边距，平板 32px

### 2.5 Motion Philosophy
- **进入动画：** 淡入 + 微上移（opacity 0→1, translateY 12px→0），300ms ease-out
- **卡片悬停：** 微弱阴影加深 + 轻微上浮（translateY -2px），200ms
- **页面切换：** 内容区淡出淡入，150ms
- **时间线滚动：** 滚动触发的渐显效果（Intersection Observer）
- 不要过度动画：以阅读体验优先，不要分散注意力

### 2.6 Visual Assets
- **图标库：** Phosphor Icons（细线条风格，跟手账感很搭）
- **无装饰性图片：** 全部内容为文字+数据，不需要配图
- **分隔线：** 用细线和留白代替 hr
- **进度条：** 用于周/月/年统计的完成度可视化

---

## 3. Layout & Structure

### 3.1 页面结构

```
┌─────────────────────────────────────────────┐
│  Header（固定顶部导航）                        │
│  Logo + 年份导航（Daily/Weekly/Monthly/Yearly）│
├─────────────────────────────────────────────┤
│                                             │
│  Main Content（居中，最大720px）              │
│  - Hero Section（日最新一条记录的预览）         │
│  - Timeline / 卡片列表                        │
│  - 或者数据可视化区域                         │
│                                             │
├─────────────────────────────────────────────┤
│  Footer（极简：© + 备案号 / 建于 OpenClaw）   │
└─────────────────────────────────────────────┘
```

### 3.2 四个视图

**Daily View（首页默认）**
- Hero：今日复盘预览（如果当日未结束则显示昨日）
- 时间线列表：最近14天，每条以「日期 + 标签 + 简述」展示
- 点击卡片 → 展开当日完整内容

**Weekly View**
- 过去8周，以「周」为单位聚合
- 每周卡片：周日期范围 + 成就数 + 讨论数 + 标签云
- 点击 → 展开本周所有条目

**Monthly View**
- 过去12个月，以「月」为单位聚合
- 月度卡片：月份 + 本月成就数 + 热点标签 + 进展项目
- 简单的柱状图展示每月成就数趋势

**Yearly View**
- 所有年份概览（2026起）
- 年份大卡片：年 + 成就总数 + 项目总数 + 内容产出数
- 点击年份 → 展开该年所有月份

### 3.3 响应式策略
- Desktop（>1024px）：双栏（侧边导航 + 主内容）
- Tablet（768-1024px）：单栏，顶部导航
- Mobile（<768px）：汉堡菜单，全宽卡片

---

## 4. Features & Interactions

### 4.1 核心功能

**F1: 数据加载**
- 静态 HTML/JS 从 `/data/summaries/YYYY-MM-DD.json` 加载每日数据
- 构建期：GitHub Actions 定时（每日 00:05）从 workspace/memory/summaries/ 拉取并构建
- 离线友好：数据内嵌在构建产物里，无需运行时 API

**F2: 每日视图**
- 默认展示最新一条记录
- 14天时间线可滚动
- 点击「展开」：卡片展开显示完整字段（achievements/discussions/followUps/learnings）
- 键盘导航：← → 切换相邻日期

**F3: 评论功能（Giscus）**
- 每篇日/周/月/年记录下方集成 Giscus
- 映射规则：每篇内容的 URL 对应 GitHub Discussion 一个帖子
- 主题标签：自动打上 `daily` / `weekly` / `monthly` / `yearly` 标签
- 评论区顶部显示评论数

**F4: 标签系统**
- 每条记录有标签（项目名/话题类型）
- 标签可点击，筛选显示所有相关记录
- 标签云展示所有历史标签（按频率排序）

**F5: 搜索**
- 键盘快捷键 `Ctrl+K` 或 `/` 打开搜索
- 搜索标题 + achievements + discussions
- 实时过滤，不需要跳转页面

**F6: 数据 API（供自己调用）**
- `GET /api/summary?type=daily&date=2026-03-30`
- `GET /api/summary?type=weekly&week=2026-W13`
- `GET /api/summary?type=monthly&month=2026-03`
- Cloudflare Workers 实现，读取 D1 数据库（summary-dashboard 的专属库）

### 4.2 交互细节

| 元素 | 默认状态 | Hover | Active | 备注 |
|------|---------|-------|--------|------|
| 导航链接 | 灰色文字 | 橙色下划线 | 橙色文字 | 平滑过渡 |
| 记录卡片 | 白色背景 | 轻微阴影+上浮 | - | 300ms |
| 标签Pill | 浅橙背景 | 深橙背景 | - | 200ms |
| 展开箭头 | 向下 | 旋转180° | 旋转180° | 用于折叠展开 |
| 评论区 | 折叠隐藏 | - | 点击「评论区」展开 | Giscus 懒加载 |

### 4.3 错误/空状态

- **无数据：** 显示「今日的记录还在整理中，明早见 🌙」配插画（ASCII art 或 SVG）
- **加载失败：** 显示「数据获取失败了，点此重试」按钮
- **评论加载失败：** 显示「评论加载失败，刷新页面重试」

---

## 5. Component Inventory

### 5.1 Header
- 左侧：站点名称「复盘」+ 年份下拉
- 右侧：视图切换（Daily / Weekly / Monthly / Yearly）+ 搜索图标按钮
- 滚动时添加底部细线阴影
- 移动端：Logo + 汉堡菜单

### 5.2 SummaryCard（每日卡片）
```
┌──────────────────────────────────────────┐
│ 📅 2026-03-30（周一）           🏷️ 标签1 标签2│
│                                          │
│ ✅ 今日成就                                 │
│ · 站立远眺提醒状态排查                      │
│ · cron delivery 配置修复                   │
│                                          │
│ 💬 讨论                                    │
│ · 跨实例 Agent 记忆共享                     │
│                                          │
│ 📋 待跟进                                  │
│ · 字流平台接入 · ADHD筛查                   │
│                                          │
│ ⬇️ 展开评论区                              │
└──────────────────────────────────────────┘
```

### 5.3 WeekCard / MonthCard / YearCard
聚合视图的卡片，格式统一：标题 + 数字统计 + 标签云 + 进度指示

### 5.4 TagPill
- 圆角胶囊形状
- 颜色：`--accent-light` 背景 + `—accent` 文字
- Hover：背景变为 `—accent`，文字变白

### 5.5 SearchModal
- 全屏遮罩 + 中央输入框
- 实时显示匹配结果列表
- ESC 或点击遮罩关闭
- 键盘 ↑↓ 导航，Enter 跳转

### 5.6 Giscus评论区
- 懒加载：点击「展开评论区」才渲染 iframe
- 显示评论区总标题「来聊聊这篇复盘吧」

---

## 6. Technical Approach

### 6.1 技术栈
- **前端：** 纯 HTML + CSS + Vanilla JS（零框架依赖，CDN 加载）
- **样式：** CSS Custom Properties + Grid/Flexbox，无 CSS 框架
- **评论：** Giscus（GitHub Discussions + giscus.app）
- **数据源：** GitHub 仓库 `/data/summaries/*.json`（构建时拉取）
- **构建：** GitHub Actions（每日定时）+ Cloudflare Pages 自动部署
- **可选增强 API：** Cloudflare Workers 读取 D1 做服务端搜索（后续迭代）

### 6.2 数据模型

**每日摘要 `data/summaries/daily/YYYY-MM-DD.json`**
```json
{
  "date": "2026-03-30",
  "week": "2026-W13",
  "weekday": "Monday",
  "achievements": ["字符串数组，每条成就一行"],
  "discussions": ["讨论主题"],
  "followUps": ["待跟进事项"],
  "learnings": ["学到的教训/发现"],
  "projects": ["相关项目名，用于打标签"],
  "contentCreated": true,
  "exercise": "运动简述",
  "tags": ["项目A", "技术踩坑", "AI自动化"],
  "mood": "🟢"  // 可选：🟢积极 🟡平淡 🔴低落
}
```

**每周摘要 `data/summaries/weekly/YYYY-WXX.json`**（自动聚合）
```json
{
  "year": 2026,
  "week": "W13",
  "dateRange": "2026-03-24 ~ 2026-03-30",
  "days": 7,
  "totalAchievements": 12,
  "totalDiscussions": 3,
  "totalFollowUps": 5,
  "topProjects": ["背景去除项目", "安居乐寓"],
  "topTags": ["AI自动化", "踩坑"],
  "dailyRecords": ["2026-03-24", "2026-03-25", ...]
}
```

**每月摘要 `data/summaries/monthly/YYYY-MM.json`**（自动聚合）
```json
{
  "year": 2026,
  "month": "03",
  "monthName": "三月",
  "totalAchievements": 45,
  "totalDiscussions": 12,
  "weeks": ["W10", "W11", "W12", "W13"],
  "topProjects": ["背景去除项目"],
  "topTags": ["AI自动化"],
  "contentPublished": 3
}
```

**每年摘要 `data/summaries/yearly/YYYY.json`**（自动聚合）
```json
{
  "year": 2026,
  "totalAchievements": 200,
  "totalProjects": 5,
  "totalContentPublished": 12,
  "topProjects": [...],
  "topTags": [...],
  "months": ["2026-01", "2026-02", ...]
}
```

### 6.3 文件结构

```
summary-dashboard/
├── index.html              ← 单页应用入口
├── css/
│   ├── variables.css       ← CSS 自定义属性
│   ├── base.css            ← 基础样式重置
│   ├── layout.css          ← 布局系统
│   ├── components.css       ← 组件样式
│   └── pages/              ← 各视图专属样式
│       ├── daily.css
│       ├── weekly.css
│       ├── monthly.css
│       └── yearly.css
├── js/
│   ├── app.js              ← 主入口，路由+状态
│   ├── router.js           ← 简单的 hash 路由
│   ├── data.js             ← 数据加载+缓存
│   ├── views/
│   │   ├── daily.js
│   │   ├── weekly.js
│   │   ├── monthly.js
│   │   └── yearly.js
│   ├── components/
│   │   ├── card.js
│   │   ├── tag.js
│   │   ├── search.js
│   │   └── giscus.js
│   └── utils/
│       ├── date.js
│       └── format.js
├── data/                   ← 构建时由 GitHub Actions 填充
│   └── summaries/
│       ├── daily/YYYY-MM-DD.json
│       ├── weekly/YYYY-WXX.json
│       ├── monthly/YYYY-MM.json
│       └── yearly/YYYY.json
├── SPEC.md                 ← 本文档
└── README.md
```

### 6.4 构建流程

```
GitHub Actions (每日 00:05 UTC = 北京 08:05)
  1. git clone ~/projects/summary-dashboard (workspace repo)
  2. cp memory/summaries/*.json → data/summaries/daily/
  3. node scripts/aggregate.js → 生成 weekly/monthly/yearly JSON
  4. git add + commit + push
  5. Cloudflare Pages 自动触发构建部署
```

### 6.5 GitHub Actions 定时配置

```yaml
on:
  schedule:
    - cron: '5 0 * * *'  # 每日 00:05 UTC
  workflow_dispatch:       # 也可手动触发
```

### 6.6 评论配置（Giscus）

在 `index.html` 底部嵌入 Giscus，参数：
- `repo`: `Simidas/summary-dashboard`（新建一个公开仓库放源码）
- `repoId`: 从 giscus.app 获取
- `category`: `Daily Summaries`
- `mapping`: `pathname`
- `theme`: `light`（匹配站点配色）

### 6.7 域名规划

可选：`summary.zhuwd.com` 或 `review.zhuwd.com`
（域名已在 Cloudflare，可用 Workers 处理）

---

## 7. Implementation Phases

**Phase 1（MVP）：** 基础框架 + Daily 视图 + Giscus 评论
- 纯静态，数据写死 3-5 条 demo JSON
- 验证 UI + 评论流程

**Phase 2：** 接入真实数据 + Weekly/Monthly 聚合
- GitHub Actions 自动拉取 memory/summaries/
- 聚合脚本生成 weekly/monthly JSON

**Phase 3：** 搜索 + 标签筛选
- 键盘快捷键搜索
- 标签云和筛选

**Phase 4（可选）：** Cloudflare Workers API + 私有备注
- D1 存储全文检索
- 支持私有笔记（只有登录可见）

---

## 8. Open Questions

- [x] 仓库名：`summary-dashboard`
- [x] Giscus 评论：**开启匿名评论**（在 GitHub repo 设置中允许陌生人创建 Discussion）
- [x] RSS 订阅：要做，`/rss.xml` 端点，订阅地址 `summary.zhuwd.com/rss.xml`
- [ ] 评论区的头像显示是否需要 Giscus 官方样式微调？

---

_本文档由小乐于 2026-03-30 起草_
