# vNext System Design: Cloudflare Workers + D1 + Google OAuth

状态：已确认，待开发  
日期：2026-06-25  
对应 PRD：[vNext PRD: 在线记录与 AI 陪伴行动系统](./vnext-online-recording-prd.md)

## 1. 架构目标

把当前 Cloudflare Pages 静态站升级为 Cloudflare Workers 全栈应用，支持：

- 静态资源托管。
- Google OAuth 登录。
- D1 数据库存储。
- 在线记录写入。
- AI 陪伴建议生成。
- 首页提醒与轻量正反馈。

核心原则：

- 前端不能直接访问 AI Key。
- 前端不能只靠隐藏按钮做鉴权。
- private 数据不能通过游客 API 泄露。
- 记录写入失败和 AI 生成失败要解耦，先保证原文保存。
- 本版只做 owner 单人写入，但数据结构预留未来多用户。

## 2. 推荐目录结构

建议迁移为 Workers 静态资源项目：

```text
summary-dashboard/
├── public/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── data/                  # 可选：历史静态 fallback 数据
├── src/
│   ├── worker.js              # Worker 入口
│   ├── routes/
│   │   ├── auth.js
│   │   ├── records.js
│   │   ├── daily-reviews.js
│   │   ├── dashboard.js
│   │   └── ai.js
│   ├── lib/
│   │   ├── db.js
│   │   ├── session.js
│   │   ├── google-oauth.js
│   │   ├── ai-client.js
│   │   ├── authz.js
│   │   └── response.js
│   └── prompts/
│       └── companion.js
├── migrations/
│   └── 0001_initial.sql
├── scripts/
│   └── import-json-to-d1.js
├── wrangler.toml
└── docs/
```

如果开发成本需要更低，也可以先不移动前端目录，但最终建议用 `public/` 承载静态资源，避免 Worker 源码和公开资源混在一起。

## 3. Cloudflare 配置

### 3.1 wrangler.toml 示例

```toml
name = "summary-dashboard"
main = "src/worker.js"
compatibility_date = "2026-06-25"

[assets]
directory = "./public"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "summary-dashboard"
database_id = "<cloudflare-d1-database-id>"
```

### 3.2 环境变量与 Secrets

普通变量：

```text
APP_ORIGIN=https://your-domain.example
OWNER_EMAIL=you@gmail.com
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
AI_PROVIDER=minimax
MINIMAX_MODEL=MiniMax-M3
MINIMAX_API_BASE_URL=https://api.minimax.io/v1
```

Secrets：

```text
GOOGLE_CLIENT_SECRET
SESSION_SECRET
MINIMAX_API_KEY
```

本地开发可提供 `.dev.vars.example`，但真实 `.dev.vars` 不提交。

## 4. 数据库设计

### 4.1 users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'visitor',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);
```

角色：

- `owner`
- `visitor`

当前只有 `email = OWNER_EMAIL` 的用户可被赋予 `owner`。

### 4.2 sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Cookie 中只保存随机 session token，不保存用户信息。数据库保存 token hash。

### 4.3 records

```sql
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  domain TEXT,
  type TEXT NOT NULL DEFAULT 'thought',
  raw_content TEXT NOT NULL,
  summary TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  mood TEXT,
  energy INTEGER,
  projects_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  next_actions_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'web',
  legacy_id TEXT,
  deleted_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX idx_records_owner_date ON records(owner_id, date DESC);
CREATE INDEX idx_records_visibility_date ON records(visibility, date DESC);
CREATE INDEX idx_records_domain_date ON records(domain, date DESC);
```

约束建议：

- `visibility` 允许 `private` / `public` / `shared`，本版只实现 private/public。
- `domain` 允许 `work` / `side_business` / `life` / `content` / `NULL`。
- `type` 允许 `progress` / `thought` / `blocker` / `reflection` / `diary` / `content_seed`。

### 4.4 ai_suggestions

```sql
CREATE TABLE ai_suggestions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  validation TEXT,
  emotional_read TEXT,
  possible_need TEXT,
  next_small_step TEXT,
  gentle_reminder TEXT,
  encouragement TEXT,
  suggested_tags_json TEXT NOT NULL DEFAULT '[]',
  suggested_followups_json TEXT NOT NULL DEFAULT '[]',
  raw_response_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (record_id) REFERENCES records(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE INDEX idx_ai_suggestions_record ON ai_suggestions(record_id);
```

AI 失败时记录 `status = failed` 和 `error_message`，不回滚 `records`。

### 4.5 daily_reviews

```sql
CREATE TABLE daily_reviews (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  most_important_thing TEXT,
  wins_json TEXT NOT NULL DEFAULT '[]',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  reflection TEXT,
  tomorrow_first_step TEXT,
  mood TEXT,
  energy INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, date),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

### 4.6 user_state

```sql
CREATE TABLE user_state (
  owner_id TEXT PRIMARY KEY,
  total_records INTEGER NOT NULL DEFAULT 0,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  last_record_date TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

这里的 `level/xp` 只用于轻量正反馈，不实现宠物养成。

## 5. API 设计

所有返回 JSON 的接口统一结构：

```json
{
  "ok": true,
  "data": {}
}
```

错误结构：

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "请先登录"
  }
}
```

### 5.1 Auth

#### GET /api/auth/google/start

创建 OAuth state，跳转 Google 授权页。

#### GET /api/auth/google/callback

处理 Google 回调：

1. 校验 `state`。
2. 用 `code` 交换 token。
3. 验证 `id_token` 签名和 claims。
4. upsert user。
5. 如果 email 等于 `OWNER_EMAIL`，设置 role `owner`。
6. 创建 session。
7. 写入 HttpOnly Cookie。
8. 跳转首页。

#### GET /api/auth/me

返回当前用户和 CSRF token：

```json
{
  "user": {
    "email": "you@gmail.com",
    "name": "Name",
    "avatarUrl": "https://...",
    "role": "owner"
  },
  "csrfToken": "..."
}
```

#### POST /api/auth/logout

删除 session，清空 Cookie。

### 5.2 Records

#### GET /api/records

查询记录。

Query：

- `date`
- `domain`
- `type`
- `visibility`
- `limit`
- `cursor`

权限：

- visitor 只能查 `public`。
- owner 可查全部。

#### POST /api/records

创建记录。需要 owner。

请求：

```json
{
  "content": "今天有点分心，但我还是想把 PDF Q&A 往前推一点。",
  "domain": "side_business",
  "type": "reflection",
  "mood": "anxious",
  "energy": 2,
  "projects": ["PDF Q&A"],
  "tags": ["分心", "启动困难"],
  "visibility": "private"
}
```

响应：

```json
{
  "record": {},
  "aiSuggestion": {
    "status": "completed",
    "nextSmallStep": "打开 PDF Q&A 项目，只写下第一个要处理的文件名。"
  },
  "userState": {}
}
```

处理流程：

1. 校验登录和 CSRF。
2. 写入 `records`。
3. 更新 `user_state`。
4. 同步尝试生成 AI suggestion。
5. AI 失败则返回 `status = failed`，但记录仍成功。

#### PATCH /api/records/:id

更新记录内容、标签、可见性等。需要 owner。

#### DELETE /api/records/:id

软删除。需要 owner。

### 5.3 AI

#### POST /api/records/:id/ai/regenerate

重新生成 AI 建议。需要 owner。

用途：

- 首次 AI 失败后重试。
- 作者修改记录后重新生成。

### 5.4 Daily Reviews

#### GET /api/daily-reviews/:date

获取某日收束复盘。

权限：

- owner 可读全部。
- visitor 不读 private daily review；后续如需公开总结再单独设计。

#### PUT /api/daily-reviews/:date

创建或更新某日收束复盘。需要 owner。

### 5.5 Dashboard

#### GET /api/dashboard

首页聚合数据。

owner 返回：

- 今日是否记录。
- 最近记录。
- 最近 AI 下一小步。
- 今日 Daily Review。
- 当前 streak。
- total records。
- 本周记录次数。

visitor 返回：

- public records summary。
- 不包含 private 原文、AI 建议和 user_state 私密数据。

## 6. Google OAuth 设计

### 6.1 OAuth Flow

使用 Authorization Code Flow。

```text
用户点击登录
  -> /api/auth/google/start
  -> Google OAuth
  -> /api/auth/google/callback?code=...&state=...
  -> Worker 换 token
  -> Worker 验证 id_token
  -> 创建 session
  -> 跳回首页
```

### 6.2 必须校验

`id_token` 必须校验：

- 签名来自 Google JWKS。
- `iss` 为 Google。
- `aud` 等于 `GOOGLE_CLIENT_ID`。
- `exp` 未过期。
- `email_verified = true`。

不要只 decode JWT。

### 6.3 Session Cookie

Cookie 建议：

```text
sid=<opaque-random-token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000
```

Session 过期建议：

- 默认 30 天。
- 每次访问 `/api/auth/me` 或写入接口可更新 `last_seen_at`。
- logout 删除数据库 session。

### 6.4 CSRF

对所有 mutation 请求要求：

- Cookie session 有效。
- `Origin` 与 `APP_ORIGIN` 匹配。
- Header `X-CSRF-Token` 等于 session 中保存的 token。

Mutation 包括：

- `POST /api/records`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id`
- `PUT /api/daily-reviews/:date`
- `POST /api/records/:id/ai/regenerate`
- `POST /api/auth/logout`

## 7. AI 设计

### 7.1 Provider

本版推荐做 provider abstraction：

```text
AI_PROVIDER=minimax
```

默认使用 MiniMax API，由 Worker 服务端调用，模型使用 `MiniMax-M3`。代码保留 OpenAI 分支作为备用，但部署默认走 MiniMax。

### 7.2 Prompt 输入

输入给 AI 的上下文应控制范围：

- 当前记录原文。
- 用户选择的 domain/type/mood/energy。
- 最近 3-5 条同 domain 记录的摘要，可选。
- 不把 public 访客请求用于生成 private AI。

### 7.3 Prompt 输出

必须要求 AI 返回 JSON，结构对应 `ai_suggestions` 表。

核心字段：

- `summary`
- `validation`
- `emotionalRead`
- `possibleNeed`
- `nextSmallStep`
- `gentleReminder`
- `encouragement`
- `suggestedTags`
- `suggestedFollowUps`

### 7.4 失败策略

- AI 超时：记录保存，AI 状态 `failed`。
- AI JSON 解析失败：保存 raw response，状态 `failed`。
- API Key 缺失：记录保存，前端显示“建议稍后生成”。
- 用户可手动重试。

### 7.5 安全边界

AI 不得：

- 进行心理诊断。
- 输出医疗建议。
- 使用病理化标签。
- 要求作者一次完成多个大任务。
- 把 private 记录转成公开内容。

如果记录出现强烈自伤或危险信号，AI 只能提供支持性回应，并建议联系可信任的人或当地紧急/专业支持。

## 8. 前端改造

### 8.1 Auth State

新增前端 auth 模块：

```text
js/auth.js
```

职责：

- 调用 `/api/auth/me`。
- 保存当前用户状态到内存。
- 为 mutation 请求附带 `X-CSRF-Token`。
- 渲染登录/退出按钮。

### 8.2 API Client

新增：

```text
js/api.js
```

职责：

- 封装 fetch。
- 统一处理 401/403。
- 统一处理 JSON 错误。

### 8.3 首页快速记录

Home 增加：

- 登录提示。
- 快速记录框。
- domain/type 轻量选择。
- 今日状态卡。
- 下一小步卡。
- 正反馈卡。

UI 方向：

- 不像任务管理器。
- 不使用惩罚性红色状态。
- 保持当前手账/数字花园视觉风格。

### 8.4 兼容旧静态数据

开发期可保留现有 JSON 读取逻辑作为 fallback：

- 如果 API 不可用，本地预览仍可读取 `data/summaries`。
- 部署到 Workers 后，在线写入和私密数据以 API 为准。

## 9. 数据迁移设计

### 9.1 导入脚本

新增：

```text
scripts/import-json-to-d1.js
```

能力：

- 读取 `data/records/daily/*.json`。
- 展开 `records[]`。
- 写入 D1 `records`。
- 用 `legacy_id` 或原始 `id` 做幂等。
- 可选择是否导入 public/ private。

### 9.2 命令示例

本地：

```bash
wrangler d1 migrations apply summary-dashboard --local
node scripts/import-json-to-d1.js --local
```

远端：

```bash
wrangler d1 migrations apply summary-dashboard --remote
node scripts/import-json-to-d1.js --remote
```

具体实现可以用 Wrangler CLI 执行 SQL，也可以通过 Worker 管理接口导入。

## 10. 部署步骤

1. 创建 Cloudflare D1 数据库。
2. 配置 `wrangler.toml` 的 `database_id`。
3. 在 Google Cloud Console 创建 OAuth Client。
4. 配置 Authorized redirect URIs：

```text
https://你的域名/api/auth/google/callback
http://localhost:8787/api/auth/google/callback
```

5. 设置 Cloudflare secrets：

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put MINIMAX_API_KEY
```

6. 设置普通环境变量。
7. 执行 D1 migrations。
8. 导入历史 JSON。
9. 本地 `wrangler dev` 验证。
10. `wrangler deploy` 部署。

## 11. 测试清单

### Auth

- 未登录访问 `/api/auth/me` 返回 visitor 或 null user。
- 点击 Google 登录后能回到站点。
- owner 邮箱登录后 role 为 owner。
- 非 owner 邮箱不能写入。
- logout 后 Cookie 清除。

### Records

- 未登录 POST `/api/records` 返回 401。
- owner POST `/api/records` 成功。
- content 为空返回 400。
- private 记录不出现在 visitor 查询结果。
- public 记录 visitor 可读。
- PATCH 可修改 visibility。
- DELETE 为软删除。

### AI

- 新记录能生成 AI suggestion。
- AI 失败时记录仍保存。
- AI 输出缺少 `nextSmallStep` 时应兜底生成提示。
- 低情绪内容不会返回大量任务。

### Dashboard

- 今天未记录时显示低压力提示。
- 今天已记录时显示正反馈。
- streak 计算正确。
- 下一小步优先来自最近 AI suggestion。

### Security

- Mutation 缺少 CSRF token 返回 403。
- Origin 不匹配返回 403。
- Cookie 为 HttpOnly/Secure/SameSite=Lax。
- Secrets 不出现在前端 bundle。

## 12. 开发拆分建议

### Milestone 1: Workers 基础架构

- 新建 `wrangler.toml`。
- 整理 `public/` 静态资源。
- Worker 能正确返回静态页面。
- `/api/health` 可用。

### Milestone 2: D1 Schema

- 创建 migrations。
- 实现 DB helper。
- 本地和远端 D1 可迁移。

### Milestone 3: Google OAuth

- start/callback/logout/me 接口。
- session 和 csrf。
- owner-only authz。

### Milestone 4: Records API

- records CRUD。
- dashboard 聚合。
- user_state 更新。

### Milestone 5: AI Suggestion

- AI client。
- prompt。
- JSON parse 和失败兜底。
- regenerate。

### Milestone 6: Frontend

- auth.js/api.js。
- 首页快速记录。
- AI 建议展示。
- 下一小步和正反馈卡片。

### Milestone 7: Migration & Docs

- JSON 导入脚本。
- README 部署说明。
- 验收测试。

## 13. 官方参考

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Pages 迁移到 Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Cloudflare D1 Workers Binding](https://developers.cloudflare.com/d1/worker-api/)
- [Google OAuth 2.0 Web Server Flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
