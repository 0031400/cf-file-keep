# cf-file-keep

Cloudflare Workers 上的单账号文件存储器：D1 存元数据，R2 存文件本体，前端 React + Vite，后端 Worker 只提供 JSON API。

## 结构

```
worker/
  index.ts          路由
  env.d.ts          绑定与密钥的类型声明
  lib/http.ts       错误、JSON 响应、名称校验
  lib/jwt.ts        HS256 签发/校验、常量时间比较
  lib/auth.ts       requireAuth 中间件
  routes/auth.ts    登录、当前用户
  routes/groups.ts  文件组增删改查
  routes/files.ts   文件列表、上传、改名、删除、下载
migrations/
  0001_init.sql     D1 表结构
src/
  api.ts            API 封装（含 XHR 上传进度）
  utils.ts          文件类型判断、大小/时间格式化
  App.tsx           页面状态与上传队列
  App.css           全部样式
  components/
    LoginPage.tsx
    Sidebar.tsx     分组列表（新建/改名/删除）
    FileTable.tsx   文件表格（行内改名）
    PreviewModal.tsx 图片/视频/音频/PDF/文本预览
    Icons.tsx
```

## 初始化

```bash
npx wrangler d1 create cf-file-keep     # 把返回的 database_id 填进 wrangler.jsonc
npx wrangler r2 bucket create cf-file-keep

npx wrangler d1 migrations apply cf-file-keep --local
npx wrangler d1 migrations apply cf-file-keep --remote

npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put JWT_SECRET
```

本地开发把 `AUTH_USERNAME` / `AUTH_PASSWORD` / `JWT_SECRET` 写进 `.dev.vars`（参考 `.dev.vars.example`）。

## 数据模型

- `file_groups`：`id`(UUID) / `name` / `created_at` / `updated_at`，组名允许重复。
- `files`：`id`(UUID) / `group_id` / `name` / `size` / `content_type` / `r2_key` / `created_at` / `updated_at`，同组内文件名允许重复。
- R2 对象键固定为 `files/{file_uuid}`，改名不动物体。

## API

面向第三方客户端的完整接口文档见 [`docs/API.md`](docs/API.md)（含错误码、上传/下载细节、TS 与 Python 示例）。下面是速查表。

除登录与下载外，全部需要 `Authorization: Bearer <token>`。错误统一为 `{ "error": { "code": "...", "message": "..." } }`。

| 方法 | 路径 | 请求体 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | `{username,password}` | 返回 `{token,username,expiresAt}`，有效期 7 天 |
| GET | `/api/auth/me` | - | 校验 token |
| GET | `/api/groups` | - | 组列表，含 `fileCount` / `totalSize` |
| POST | `/api/groups` | `{name}` | 新建组，201 |
| PATCH | `/api/groups/:id` | `{name}` | 改组名 |
| DELETE | `/api/groups/:id` | - | 删组，非空返回 409 |
| GET | `/api/groups/:id/files` | - | 组内文件列表 |
| POST | `/api/groups/:id/files` | multipart 或原始 body | 上传，201 |
| PATCH | `/api/files/:id` | `{name}` | 改文件名 |
| DELETE | `/api/files/:id` | - | 删文件并删除 R2 对象，204 |
| GET | `/api/file/:uuid/:filename` | - | **公开**下载直链，支持 Range |

下载路径里的文件名只做展示，查找只认 UUID，所以改名后旧链接仍然可用；`?inline=1` 让浏览器内联预览而不是下载。

## 上传的两种写法

```ts
// multipart（小文件，最省事）
const fd = new FormData();
fd.append('file', file);
await fetch(`/api/groups/${groupId}/files`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: fd,
});

// 原始 body 直传（大文件，Worker 把 request.body 直接转给 R2）
await fetch(`/api/groups/${groupId}/files?name=${encodeURIComponent(file.name)}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': file.type || 'application/octet-stream',
  },
  body: file,
});
```

## 前端

`yarn dev` 后访问 Vite 输出的地址（默认 5173）。本地账号来自 `.dev.vars`，默认 `admin` / `changeme`。

- 登录态存在 `localStorage`（key `cf-file-keep.token`），刷新页面会用 `/api/auth/me` 校验，过期自动回到登录页。
- 左侧分组栏：`+` 新建（回车保存、Esc 取消）、铅笔改名、垃圾桶删除；非空分组后端会拒绝，前端会先提示。
- 主区：右上角上传按钮支持多选，整块区域支持拖拽；上传走原始 body 直传并用 XHR 显示进度，队列在右下角。
- 文件表格：点文件名或眼睛图标预览（图片/视频/音频/PDF/文本），下载图标直接用公开直链，铅笔行内改名（回车保存、Esc 取消），垃圾桶删除。
- 文本预览只拉前 200KB（利用下载接口的 Range 支持），避免大日志卡死浏览器。

