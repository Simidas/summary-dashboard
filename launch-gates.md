# Private Launch Gates

## 发布状态

- 日期：2026-08-06
- 结论：GO（私人工具生产发布）
- 分支：`agent/private-tool-mode`
- 生产 URL：`https://blog.zhuwd.com`
- Workers URL：`https://summary-dashboard.simidas2017.workers.dev`

## Gate 证据

- [x] `npm run check`：12 个测试、语法检查和构建通过。
- [x] 生产 D1 已备份并执行 `0013_private_tool_mode.sql`。
- [x] 首页返回 200，并带 HSTS、CSP、`X-Robots-Tag`。
- [x] HTML 包含 `noindex`。
- [x] 未登录 `/api/records` 返回 401。
- [x] 访客 `/api/dashboard` 仅返回当天数据。
- [x] 历史静态 JSON 路径不再返回数据文件。
- [ ] Owner 登录后的完整真实任务验收。

## 已知残项

- Cloudflare Managed robots 自动注入 `Allow: /`，与仓库的 `Disallow: /` 同时存在。HTML `noindex` 和 `X-Robots-Tag` 仍是主要禁索引控制；彻底清理需具备 Cloudflare Bot Management 权限后关闭 Managed robots。
