# 部署交接：在线记录 vNext

交接对象：马来研  
项目：`summary-dashboard`  
目标分支：`main`  
当前关键提交：

- `d24e95e fix: use minimax subscription endpoint`
- `f8f1693 feat: switch ai provider to minimax m3`
- `3c6650a feat: add online recording worker stack`

## 1. 本次部署目标

把当前静态复盘站升级为 Cloudflare Workers + D1 的在线记录版本：

- 静态资源由 Workers Static Assets 托管。
- Google OAuth 登录。
- 只有 `OWNER_EMAIL` 对应的 Google 账号拥有写入权限。
- 在线记录写入 Cloudflare D1。
- AI 陪伴建议走 MiniMax 订阅接口，模型 `MiniMax-M3`。
- 首页显示在线记录入口、下一小步、轻量宠物激励和正反馈。

本次不做多用户后台、复杂游戏化、指定人分享、Hermes 接入。

## 2. 部署前需要准备的信息

请向 Weldon 确认以下信息：

```text
Cloudflare Account ID
生产域名，例如 https://blog.zhuwd.com
Owner Google 邮箱
Google OAuth Client ID
Google OAuth Client Secret
MiniMax API Key
Session Secret
```

注意：

- MiniMax key 只能通过 `wrangler secret put MINIMAX_API_KEY` 配置，不要写入仓库。
- `.dev.vars`、`.wrangler/`、`public/` 都不应提交。
- Weldon 之前给过一个测试 key。正式部署建议让他在 MiniMax 控制台重新生成一个正式 key。

## 3. 本地准备

```bash
git clone git@github.com:Simidas/summary-dashboard.git
cd summary-dashboard
git checkout main
git pull origin main
npm install
```

确认当前最新提交包含：

```bash
git log --oneline -3
```

预期能看到 `d24e95e` 或更新提交。

## 4. Cloudflare D1

创建 D1 数据库：

```bash
wrangler d1 create summary-dashboard
```

命令会输出 `database_id`。把 [wrangler.toml](../wrangler.toml) 中的占位值替换掉：

```toml
[[d1_databases]]
binding = "DB"
database_name = "summary-dashboard"
database_id = "<真实 database_id>"
```

执行远端 migration：

```bash
wrangler d1 migrations apply summary-dashboard --remote
```

检查表是否创建成功：

```bash
wrangler d1 execute summary-dashboard --remote --command "select name from sqlite_master where type='table';"
```

至少应该看到：

```text
users
sessions
records
ai_suggestions
daily_reviews
user_state
```

## 5. Google OAuth

在 Google Cloud Console 中创建 OAuth Client：

```text
Application type: Web application
```

Authorized redirect URIs：

```text
http://localhost:8787/api/auth/google/callback
https://你的生产域名/api/auth/google/callback
```

如果 Google 控制台要求 Authorized JavaScript origins，也填：

```text
http://localhost:8787
https://你的生产域名
```

拿到：

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

## 6. Wrangler 变量与 Secrets

修改 [wrangler.toml](../wrangler.toml) 的普通变量：

```toml
[vars]
APP_ORIGIN = "https://你的生产域名"
OWNER_EMAIL = "Weldon 的 Google 邮箱"
GOOGLE_CLIENT_ID = "Google OAuth Client ID"
AI_PROVIDER = "minimax"
MINIMAX_MODEL = "MiniMax-M3"
MINIMAX_API_BASE_URL = "https://api.minimaxi.com/v1"
```

设置 secrets：

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put MINIMAX_API_KEY
```

`SESSION_SECRET` 可以这样生成：

```bash
openssl rand -base64 48
```

重要：MiniMax endpoint 已实测，订阅 key 需要使用：

```text
https://api.minimaxi.com/v1
```

不要改回：

```text
https://api.minimax.io/v1
```

`.io` endpoint 用这类订阅 key 会返回 `invalid api key (2049)`。

## 7. 本地验证

创建本地 `.dev.vars`：

```bash
cp .dev.vars.example .dev.vars
```

填入本地测试值：

```text
APP_ORIGIN=http://localhost:8787
OWNER_EMAIL=<Weldon 的 Google 邮箱>
GOOGLE_CLIENT_ID=<Google OAuth Client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth Client Secret>
SESSION_SECRET=<随机字符串>
AI_PROVIDER=minimax
MINIMAX_MODEL=MiniMax-M3
MINIMAX_API_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_API_KEY=<MiniMax API Key>
```

准备静态资源并启动 Workers 本地服务：

```bash
npm run prepare:worker-assets
npm run d1:migrate:local
npm run dev:worker
```

打开：

```text
http://localhost:8787/#home
```

检查健康接口：

```bash
curl http://localhost:8787/api/health
```

预期：

```json
{
  "ok": true,
  "data": {
    "db": true,
    "assets": true,
    "googleOAuth": true,
    "ai": true,
    "aiProvider": "minimax"
  }
}
```

本地验收：

- 首页不显示“静态预览”，而是显示 Google 登录或在线记录入口。
- 点击 Google 登录能完成回调。
- Weldon 的邮箱登录后显示 owner 权限。
- 首页能提交一条记录。
- 提交后能看到 AI 返回的 `我听到的是` 和 `现在只做这一步`。

## 8. 部署 Workers

确保 [wrangler.toml](../wrangler.toml) 已经换成真实生产配置。

部署：

```bash
npm run deploy:worker
```

这个命令会自动执行：

```bash
npm run prepare:worker-assets
wrangler deploy
```

Cloudflare 自动部署的 Deploy command 应配置为：

```bash
npm run deploy:worker
```

不要直接配置成 `npx wrangler deploy`，否则 `public/` 不会生成。D1 schema 不在 Worker 运行期兜底创建；首次部署、schema 变更，或线上出现缺表/缺字段导致的 500 时，手动执行 `npm run d1:migrate:remote`。如果希望本次部署前显式跑 migration，可以使用 `npm run deploy:worker:migrate`。

部署后先用 Workers 默认域名验证，再绑定生产域名。

生产域名绑定方式二选一：

- Cloudflare Dashboard 里给 Worker 配 Custom Domain。
- 或者配置 Worker Route 指向目标域名路径。

绑定后确保：

```toml
APP_ORIGIN = "https://你的生产域名"
```

如果改了 `APP_ORIGIN`，需要重新部署。

## 9. 生产验收清单

### 9.1 API

```bash
curl https://你的生产域名/api/health
```

确认：

- `db: true`
- `assets: true`
- `googleOAuth: true`
- `ai: true`
- `aiProvider: minimax`

### 9.2 Google 登录

- 未登录访问首页，看到 Google 登录入口。
- 点击登录，跳转 Google 授权。
- 回调地址为 `/api/auth/google/callback`。
- Weldon 邮箱登录后 `/api/auth/me` 返回 `role: owner`。
- 非 Weldon 邮箱登录后不能写入。

### 9.3 在线记录

在首页写一条测试记录：

```text
部署测试：确认在线记录和 AI 建议可以跑通。
```

预期：

- 页面显示“已保存”。
- AI 建议区域出现。
- D1 `records` 有新记录。
- D1 `ai_suggestions` 有新记录。

检查 D1：

```bash
wrangler d1 execute summary-dashboard --remote --command "select id,date,domain,type,visibility from records order by created_at desc limit 5;"

wrangler d1 execute summary-dashboard --remote --command "select status,provider,model,next_small_step from ai_suggestions order by created_at desc limit 5;"
```

### 9.4 权限

未登录直接写入应失败：

```bash
curl -X POST https://你的生产域名/api/records \
  -H "content-type: application/json" \
  -d '{"content":"unauthorized test"}'
```

预期返回 401。

## 10. 历史 JSON 导入

建议先空库跑通登录和在线记录，再导入历史数据。

导入前先让 Weldon 用 owner Google 账号登录一次，确保 `users` 表里已有真实 owner 用户。

查询 owner id：

```bash
wrangler d1 execute summary-dashboard --remote --command "select id,email,role from users;"
```

生成历史静态 JSON 导入 SQL：

```bash
node scripts/import-json-to-d1.js --owner-id <上一步查到的 owner id> > .wrangler/import-static-json.sql
```

执行导入：

```bash
wrangler d1 execute summary-dashboard --remote --file .wrangler/import-static-json.sql
```

检查：

```bash
wrangler d1 execute summary-dashboard --remote --command "select count(*) as count from records;"
```

注意：导入脚本不会立即重算 `user_state`。Weldon 下一次在线记录时，系统会重新计算累计记录和 streak。若需要导入后马上准确展示统计，可以后续补一个 `recompute-user-state` 脚本。

## 11. 常见问题

### 首页仍显示“静态预览”

通常是部署到了旧 Pages 静态站，或者没有执行：

```bash
npm run prepare:worker-assets
```

Workers 版本的 `public/index.html` 会注入：

```js
window.__SUMMARY_API_ENABLED__ = true;
```

### `/api/health` 显示 `db: false`

检查 `wrangler.toml` 的 D1 binding：

```toml
binding = "DB"
database_id = "<真实 database_id>"
```

### Google 回调失败

检查三处是否一致：

- Google Console 的 redirect URI。
- `wrangler.toml` 的 `APP_ORIGIN`。
- 实际访问的生产域名。

### 写入接口返回 `CSRF_FAILED`

通常是 `APP_ORIGIN` 和实际访问 origin 不一致。修正后重新部署。

### MiniMax 返回 401

检查：

- `MINIMAX_API_KEY` 是否设置为 secret。
- `MINIMAX_API_BASE_URL` 是否为 `https://api.minimaxi.com/v1`。
- key 是否为 MiniMax 订阅 key，且没有过期或被重置。

### AI 保存失败但记录成功

这是预期兜底。系统设计就是先保存原文，AI 失败时只把 `ai_suggestions.status` 记为 `failed`，用户可以后续重试生成。

## 12. 不要做的事

- 不要把 `.dev.vars` 提交到仓库。
- 不要把 MiniMax key、Google Client Secret、Session Secret 写入文档或代码。
- 不要直接部署根目录到旧 Cloudflare Pages 来验证在线写入，在线写入必须走 Workers。
- 不要把 `MINIMAX_API_BASE_URL` 改回 `.io` endpoint。
- 不要导入 `data/records/diary/*.json`，除非 Weldon 明确确认。
