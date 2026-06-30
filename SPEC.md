# 个人经营复盘系统 — SPEC.md

> 本文件是项目的设计规范文档，所有实现必须严格遵循。如需调整，必须先更新此文档再改代码。
>
> 当前已上线实现以 [docs/current-implementation.md](docs/current-implementation.md) 为准。系统已经从 Cloudflare Pages 静态站升级为 Cloudflare Workers + D1 + Google OAuth 的在线记录系统。

---

## 1. Concept & Vision

**是什么：** 一个帮助作者持续记录、接住情绪、推进事情、定期复盘的个人经营系统。

**核心理念：** 「数字农夫的水稻田」——每天种下一行记录，到了年底回头看，是一片金色的收成。数据翔实但不过度装修，有手工感但不粗糙。读起来像翻一本认真写的笔记本，而不是刷社交媒体。

**目标用户：** 当前首先服务作者本人，围绕主业、副业、生活和自我、内容产出四个场景驱动行动。未来可探索对外开放，但多用户复杂后台不属于当前版本。

**内容基调：** 真实、不端着、有过程。AI 反馈先接住状态，再给鼓励和下一小步。

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

### 3.2 主要视图

**Home**
- 首页第一屏展示产品定位语：帮你持续记录、接住情绪、推进事情、定期复盘的个人经营系统。
- Owner 登录后展示快速记录入口、今日重点、下一小步、未闭环事项、四场景面板、项目主线、最近在线记录、内容素材和宠物成长。
- 最近在线记录分页，每页 10 条，避免遮挡后续板块。

**Daily**
- 展示每日综合复盘和当天/历史在线记录。
- 头部复盘优先展示当天保存的每日复盘；当天没有时展示最近一天的已保存复盘。
- 支持选择日期，默认今天，也可以补写昨天或历史日期。

**Weekly**
- 过去若干周，以周为单位聚合 D1 中的记录、每日复盘、follow-up 和内容素材。
- 页面包含本周经营洞察、周复盘草稿和“周度复盘与趋势”。
- 周度趋势卡片融合系统统计与周期复盘：复盘天数、闭环率、超时、能量、内容发布、复盘状态、主题、摘要和查看/编辑入口。
- 顶部标签为高频内容标签，来源为 `record.tags` + `aiSuggestion.suggestedTags`；底部标签为项目，来源为 `record.projects`；不展示日期标签。

**Monthly**
- 按月聚合每日复盘和事项闭环，展示月度经营洞察、月复盘草稿、月度成就趋势图和“月度复盘与趋势”。
- 月度卡片同样融合统计数据与周期复盘状态。

**Yearly**
- 按年聚合复盘天数、成果、项目、闭环率和内容产出。
- 年度卡片融合年度洞察、年度复盘状态、主题摘要和编辑入口。

**Domain / Projects / Diary / Content**
- 四场景详情页支持写入场景记录、设置当前重点和下一步、管理未闭环事项。
- Projects 支持项目创建、编辑、删除和详情页时间线。
- Diary 用作情绪和思绪出口。
- Content 用作内容素材池。

### 3.3 响应式策略
- Desktop（>1024px）：双栏（侧边导航 + 主内容）
- Tablet（768-1024px）：单栏，顶部导航
- Mobile（<768px）：汉堡菜单，全宽卡片

---

## 4. Features & Interactions

### 4.1 核心功能

**F1: 数据加载**
- Owner 登录后优先从 Workers API 读取 D1 数据。
- 游客只能读取公开记录和公开 dashboard 数据。
- `data/records` 和 `data/summaries` 保留为历史导入来源、静态 fallback 和备份格式。

**F2: 每日视图**
- 支持在线编辑每日综合复盘。
- 支持展示当天记录、复盘字段、心情和能量。
- 支持日期选择，默认今天，可补写历史日期。

**F3: 评论功能（Giscus）**
- 每篇日/周/月/年记录下方集成 Giscus
- 映射规则：每篇内容的 URL 对应 GitHub Discussion 一个帖子
- 主题标签：自动打上 `daily` / `weekly` / `monthly` / `yearly` 标签
- 评论区顶部显示评论数

**F4: 标签系统**
- 内容标签来源为记录手动标签和 AI 建议标签。
- 项目标签来源为记录关联项目。
- 周度复盘与趋势中，顶部展示内容标签，底部展示项目标签。

**F5: 在线写入**
- 首页、场景、Diary、Projects、Content、Follow-up、Daily Review、Period Review 均支持在线写入。
- 记录保存先成功返回，AI 建议异步生成并回填。

**F6: 周期复盘**
- `period_reviews` 保存周/月/年复盘草稿和确认状态。
- 支持 AI 生成周期复盘草稿。
- 周期复盘历史已经融合进周/月/年趋势卡片。

**F7: 数据 API**
- Cloudflare Workers 提供 `/api/records`、`/api/daily-reviews`、`/api/period-reviews`、`/api/projects`、`/api/followups`、`/api/content-items`、`/api/dashboard` 等接口。

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
- **前端：** 纯 HTML + CSS + Vanilla JS（零框架依赖，ES Modules）
- **样式：** CSS Custom Properties + Grid/Flexbox，无 CSS 框架
- **评论：** Giscus（GitHub Discussions + giscus.app）
- **运行环境：** Cloudflare Workers + Static Assets
- **数据库：** Cloudflare D1
- **鉴权：** Google OAuth + HttpOnly session cookie + CSRF token
- **AI：** MiniMax M3，Worker 服务端调用
- **静态 fallback：** 仓库 JSON 和聚合脚本保留作历史归档/导入/无 API 预览

### 6.2 数据模型

当前线上主数据模型为 D1，详见 [docs/current-implementation.md](docs/current-implementation.md)。下面的静态 JSON 结构保留为历史导入、静态 fallback 和本地归档格式，不再是线上主写入路径。

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
  "dailyRecords": ["2026-03-24", "2026-03-25", "..."]
}
```

`dailyRecords` 仅作为内部统计字段保留，不在周度趋势卡片中以标签形式展示。

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
├── src/                    ← Worker API
│   ├── worker.js
│   ├── routes/
│   ├── lib/
│   └── prompts/
├── migrations/             ← D1 schema
├── scripts/                ← 静态资产准备和历史导入
├── data/                   ← 历史 JSON / 静态 fallback
├── public/                 ← prepare:worker-assets 生成，不提交
├── wrangler.toml
├── package.json
├── SPEC.md                 ← 本文档
└── README.md
```

### 6.4 构建与部署流程

```
npm run prepare:worker-assets
  1. 清理并重建 public/
  2. 拷贝 index.html、css、js、data 等静态资源
  3. wrangler deploy 发布 Worker + Static Assets
```

Cloudflare 自动部署的 Deploy command 应使用：

```bash
npm run deploy:worker
```

首次部署或 schema 变化时执行：

```bash
npm run d1:migrate:remote
```

### 6.6 评论配置（Giscus）

在 `index.html` 底部嵌入 Giscus，参数：
- `repo`: `Simidas/summary-dashboard`（新建一个公开仓库放源码）
- `repoId`: 从 giscus.app 获取
- `category`: `Daily Summaries`
- `mapping`: `pathname`
- `theme`: `light`（匹配站点配色）

### 6.7 域名规划

当前生产域名：`blog.zhuwd.com`，由 Cloudflare Workers 处理。

---

## 7. Implementation Phases

**已完成：** 静态展示、统一每日综合记录、Workers + D1、Google 登录、在线记录、AI 建议、四场景面板、项目、Follow-up、内容素材、Daily Review、Period Review、宠物激励、周/月/年趋势和复盘融合。

**后续可选：** 多用户开放、指定人分享、D1 定期备份/导出、外部提醒、内容自动发布、更完整的宠物养成。

---

## 8. Open Questions

- [x] 仓库名：`summary-dashboard`
- [x] Giscus 评论：**开启匿名评论**（在 GitHub repo 设置中允许陌生人创建 Discussion）
- [ ] D1 定期备份和导出策略
- [ ] shared 可见性的指定人分享模型
- [ ] 多用户开放时的权限和计费边界

---

- **GitHub 仓库：** https://github.com/Simidas/summary-dashboard
- **初始化完成：** 2026-03-30，SPEC.md 已 push
- **Cloudflare Workers 域名：** https://blog.zhuwd.com

_本文档最初由小乐于 2026-03-30 起草，2026-06-30 按当前 Workers + D1 实现状态更新。_
