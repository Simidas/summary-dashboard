# Project Control Board

- 项目：summary-dashboard
- 域名：https://blog.zhuwd.com
- 站点类型：Owner-only 私人工具
- 商业化：无
- 当前状态：LIVE / OWNER_REVIEW_PENDING
- 事实源：本文件 + `stage-status.md` + Git

## Owner 已确认

- 私人工具，不提供公开内容浏览。
- Pricing、SEO 增长、公开合规页面和 Launch Ops 不适用。
- 需要禁索引、认证隔离、数据备份和第三方 AI 数据边界。

## 当前阶段

- running：Owner 真实登录验收
- waiting：首周私人工具使用复盘
- blocked：无
- done：PRD 主路径、Workers/D1、Google OAuth、AI、前后端实现、生产 migration 与部署

## 当前修改目标

- 不再将历史 JSON 发布为静态资源。
- 私有 API 统一要求 Owner Session。
- 记录强制保存为 private。
- 全站发出 noindex/noarchive 信号。
- 移除公开评论入口。

## 上线前硬闸门

- [x] 本地测试、构建和 migration 通过。
- [x] 未登录访问私有 API 返回 401。
- [x] 非 Owner 账号返回 403。
- [x] `public/` 不包含 `data/`。
- [x] 生产 migration `0013_private_tool_mode.sql` 已执行。
- [x] 未登录生产冒烟测试通过。
- [ ] Owner 真实登录任务验收通过。
- [x] 记录 commit、分支、部署 URL 和最终 Git 状态。

## 自动 QA 证据

- `npm run check`：语法、12 个测试、构建通过。
- Wrangler Node 22 dry-run：通过，构建读取 47 个静态文件。
- 本地 D1：`0013_private_tool_mode.sql` 成功执行。
- 构建断言：`public/data` 不存在，`public/robots.txt` 存在。

## 生产发布证据（2026-08-06）

- 分支：`agent/private-tool-mode`
- 功能提交：`ce794ec`、`c3405e6`
- Workers 服务：`summary-dashboard`
- 生产 URL：`https://blog.zhuwd.com`
- Workers URL：`https://summary-dashboard.simidas2017.workers.dev`
- 部署平台：Cloudflare Workers（当前 Version ID 以 Wrangler 发布日志为准）
- D1 备份：`backups/summary-dashboard-remote-2026-08-06T09-48-51-171Z.sql`（本地忽略文件）
- 冒烟结果：首页 200；私有 API 401；访客 dashboard 仅返回当天数据；旧 JSON 路径不再暴露数据。
- `robots.txt` 线上复验仅包含 `User-agent: *` 与 `Disallow: /`，未再发现 Cloudflare 注入的 `Allow: /`。
