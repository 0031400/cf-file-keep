# 文件柜 API 开发者文档

面向需要接入本服务的第三方客户端（桌面端、移动端、脚本、其他前端）。

- 版本：v1（未做 URL 版本号，破坏性变更会在文末记录）
- 协议：HTTP/1.1、HTTP/2、HTTP/3
- 数据格式：请求与响应均为 `application/json; charset=utf-8`，下载接口返回二进制
- 字符编码：UTF-8

---

## 1. 概览

服务是单账号的私有文件存储器，模型只有两层：

```
文件组 file_group (UUID)
  └── 文件 file (UUID)  →  R2 对象 files/{file_uuid}
```

- 文件组只承载分类，不嵌套。
- 文件和分组都用 UUID 区分，**名称允许重复**：分组可以重名，同一分组内也可以有同名文件。
- 所有需要登录的接口用 JWT（HS256）鉴权，token 有效期 **7 天**，没有 refresh token，过期后重新登录。
- 下载直链是**公开**的：不带任何凭证，拿到链接的人都能下载。请按「可公开分享的链接」来对待。

### Base URL

| 环境 | Base URL |
| --- | --- |
| 生产 | `https://<your-worker>.<your-subdomain>.workers.dev` |
| 本地 | `http://localhost:5173` |

下文所有路径都是相对 Base URL 的绝对路径，例如 `GET /api/groups`。

---

## 2. 基础约定

### 2.1 认证

1. 用账号密码调用 `POST /api/auth/login` 换取 token。
2. 之后每个需要鉴权的请求带上：

```http
Authorization: Bearer <token>
```

3. token 是标准 JWT，payload 为 `{ sub, iat, exp }`（`exp` 为秒级时间戳）。客户端不要解析它做业务判断，用 `expiresAt`（毫秒）即可。
4. 收到 `401 UNAUTHORIZED` 表示 token 缺失、签名不对或已过期，直接清掉本地 token 回登录页。

**不需要鉴权的接口只有两个**：`POST /api/auth/login` 和 `GET /api/file/:uuid/:filename`。

### 2.2 ID 与时间

- 所有 `id` 都是小写带连字符的 UUID v4 字符串，例如 `3f0b9a52-8f0e-4a41-9d3e-0f3f9a1c2b7d`。
- 所有时间字段都是 **Unix 毫秒时间戳**（number），例如 `1760774400000`。
- 所有 `size` 都是字节数（number）。

### 2.3 错误格式

非 2xx 响应统一为：

```json
{
  "error": {
    "code": "GROUP_NOT_EMPTY",
    "message": "文件组内还有文件，请先删除文件"
  }
}
```

`code` 稳定、适合程序判断；`message` 是中文提示，可能调整，不要用它做逻辑判断。

| HTTP | code | 触发场景 |
| --- | --- | --- |
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 400 | `INVALID_BODY` | 缺少必填字段（登录缺账号密码、multipart 缺 `file`、原始上传缺文件名） |
| 400 | `EMPTY_BODY` | 原始 body 上传时没有请求体 |
| 400 | `INVALID_NAME` | 名称为空、超过 200 字符或文件名非法 |
| 400 | `INVALID_PATH` | 下载路径缺少文件名段 |
| 401 | `UNAUTHORIZED` | 未带 token，或 token 无效/过期 |
| 401 | `INVALID_CREDENTIALS` | 用户名或密码错误 |
| 404 | `NOT_FOUND` | 接口路径不存在 |
| 404 | `GROUP_NOT_FOUND` | 分组不存在 |
| 404 | `FILE_NOT_FOUND` | 文件不存在 |
| 405 | `METHOD_NOT_ALLOWED` | 路径存在但 HTTP 方法不对 |
| 409 | `GROUP_NOT_EMPTY` | 分组里还有文件，不允许删除 |
| 500 | `INTERNAL` | 服务端未捕获异常 |

两个例外，返回的是 **纯文本** 而不是 JSON：

- 完全匹配不到的路由：`404` + `Not Found`
- 下载接口找不到文件：`404` + `文件不存在`

客户端解析 JSON 失败时，按 HTTP 状态码兜底即可。

### 2.4 跨域（CORS）

服务端**没有**设置任何 `Access-Control-Allow-*` 响应头，且登录态走 `Authorization` 头而非 Cookie。

- 浏览器里从**其他域名**直接调本 API 会被 CORS 拦截。需要跨域 Web 客户端时，请在 Worker 侧加一层 CORS 或用自己的后端代理。
- 非浏览器客户端（Node、Python、移动原生、桌面端）不受影响。
- 同源部署的 Web 前端（本项目自带的前端）不受影响。

### 2.5 其他约定

- 无分页：列表接口一次性返回全部数据。
- 无频率限制：登录接口也没有失败锁定，请勿用它做撞库测试。
- 服务端不做请求体大小限制，实际上限由 Cloudflare Workers 决定（Free/Pro 约 100MB，Business 200MB，Enterprise 500MB）。
- 原始 body 上传是流式的：Worker 把 `request.body` 直接转给 R2，不落盘也不整块缓存；multipart 会被运行时解析进内存。

---

## 3. 数据模型

### 3.1 Group

```ts
interface Group {
  id: string;         // UUID
  name: string;       // 1~200 字符，允许重名
  fileCount: number;  // 组内文件数
  totalSize: number;  // 组内文件总字节数
  createdAt: number;  // 毫秒时间戳
  updatedAt: number;  // 毫秒时间戳；组内文件增删改也会更新
}
```

### 3.2 File

```ts
interface File {
  id: string;              // UUID
  groupId: string;         // 所属分组 UUID
  name: string;            // 文件名，允许同组内重名
  size: number;            // 字节数（以 R2 实际对象大小为准）
  contentType: string | null; // 上传时记录的 MIME，可能为 null
  url: string;             // 下载直链，形如 /api/file/{id}/{encodeURIComponent(name)}
  createdAt: number;       // 毫秒时间戳
  updatedAt: number;       // 毫秒时间戳
}
```

> `url` 是**相对路径**，客户端需要自己拼 Base URL。其中文件名段只用于展示和保存时的默认文件名，服务端查找只认 UUID —— 所以文件改名后，旧链接依然可以下载。

---

## 4. 接口

### 4.1 登录

```http
POST /api/auth/login
Content-Type: application/json
```

请求：

```json
{ "username": "admin", "password": "your-password" }
```

响应 `200`：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "username": "admin",
  "expiresAt": 1761380000000
}
```

失败：`400 INVALID_BODY`、`401 INVALID_CREDENTIALS`。

> 账号是单账号，没有注册、改密、找回接口，凭证由部署方通过 Worker secret 配置。

### 4.2 校验登录态

```http
GET /api/auth/me
Authorization: Bearer <token>
```

响应 `200`：

```json
{ "username": "admin", "expiresAt": 1761380000000 }
```

适合 App 启动时判断本地 token 是否还能用。

### 4.3 分组列表

```http
GET /api/groups
Authorization: Bearer <token>
```

响应 `200`，按 `createdAt` 倒序：

```json
{
  "groups": [
    {
      "id": "8a1f0c62-2b7e-4d1a-9c33-1f5c2e9a77b1",
      "name": "工作资料",
      "fileCount": 3,
      "totalSize": 5242880,
      "createdAt": 1760700000000,
      "updatedAt": 1760770000000
    }
  ]
}
```

空列表返回 `{ "groups": [] }`。

### 4.4 新建分组

```http
POST /api/groups
Authorization: Bearer <token>
Content-Type: application/json
```

请求：

```json
{ "name": "工作资料" }
```

响应 `201`：

```json
{
  "group": {
    "id": "8a1f0c62-2b7e-4d1a-9c33-1f5c2e9a77b1",
    "name": "工作资料",
    "fileCount": 0,
    "totalSize": 0,
    "createdAt": 1760770000000,
    "updatedAt": 1760770000000
  }
}
```

名称规则：首尾空白会被去掉；去掉后不能为空；最长 200 字符；**允许与已有分组重名**。

失败：`400 INVALID_NAME`。

### 4.5 重命名分组

```http
PATCH /api/groups/:groupId
Authorization: Bearer <token>
Content-Type: application/json
```

请求：

```json
{ "name": "新名字" }
```

响应 `200`：`{ "group": { ... } }`，字段同 4.4。

失败：`400 INVALID_NAME`、`404 GROUP_NOT_FOUND`。

### 4.6 删除分组

```http
DELETE /api/groups/:groupId
Authorization: Bearer <token>
```

- 成功：`204 No Content`，响应体为空。
- 分组里还有文件：`409 GROUP_NOT_EMPTY`。**必须先删完组内文件**，服务端不会级联删除。
- 分组不存在：`404 GROUP_NOT_FOUND`。

### 4.7 组内文件列表

```http
GET /api/groups/:groupId/files
Authorization: Bearer <token>
```

响应 `200`，按 `createdAt` 倒序：

```json
{
  "files": [
    {
      "id": "b6d1f3a4-5c2e-4a19-8b7f-2d4c6e8a0f13",
      "groupId": "8a1f0c62-2b7e-4d1a-9c33-1f5c2e9a77b1",
      "name": "季度报告.pdf",
      "size": 2048576,
      "contentType": "application/pdf",
      "url": "/api/file/b6d1f3a4-5c2e-4a19-8b7f-2d4c6e8a0f13/%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf",
      "createdAt": 1760771000000,
      "updatedAt": 1760771000000
    }
  ]
}
```

失败：`404 GROUP_NOT_FOUND`。

### 4.8 上传文件

一个接口，两种提交方式，任选其一。

```http
POST /api/groups/:groupId/files
Authorization: Bearer <token>
```

**方式 A：multipart/form-data**（简单，适合小文件）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | 文件 | 是 | 文件本体 |
| `name` | 文本 | 否 | 覆盖文件名；不传则用 `file` 自带的文件名 |

```bash
curl -X POST "$BASE/api/groups/$GROUP_ID/files" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./report.pdf" \
  -F "name=季度报告.pdf"
```

> multipart 会被运行时整体解析到内存，大文件请用方式 B。

**方式 B：原始 body 直传**（推荐，支持流式，适合大文件）

文件名通过查询参数 `?name=` 或请求头 `X-File-Name` 传入（**查询参数优先**），请求体就是文件字节：

```bash
curl -X POST "$BASE/api/groups/$GROUP_ID/files?name=%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/pdf" \
  --data-binary @./report.pdf
```

- `name` 必须做 URL 编码（非 ASCII 文件名必须编码）。
- `X-File-Name` 会被原样使用（不做 URL 解码），而多数 HTTP 客户端不允许非 ASCII 头值，所以**优先用查询参数**。
- 建议始终带 `Content-Type`，它会作为文件的 `contentType` 保存，影响后续预览；不带则记为 `null`。
- **必须让服务端知道请求体长度**：带上 `Content-Length`，不要用 `Transfer-Encoding: chunked`。R2 只接受长度已知的流，chunked 请求会失败。用 `curl --data-binary @file`、浏览器 `xhr.send(File)`、Node `fetch(url, { body: buffer })` 都会自动带上长度；Python `requests` 直接传文件对象时走 chunked，需要先读成 bytes（见 6.3）。
- 需要上传进度时用 XHR / 各语言 SDK 的进度回调。

**响应 `201`**（两种方式一致）：

```json
{
  "file": {
    "id": "b6d1f3a4-5c2e-4a19-8b7f-2d4c6e8a0f13",
    "groupId": "8a1f0c62-2b7e-4d1a-9c33-1f5c2e9a77b1",
    "name": "季度报告.pdf",
    "size": 2048576,
    "contentType": "application/pdf",
    "url": "/api/file/b6d1f3a4-5c2e-4a19-8b7f-2d4c6e8a0f13/%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf",
    "createdAt": 1760771000000,
    "updatedAt": 1760771000000
  }
}
```

**文件名处理规则**：

- `\ / : * ? " < > |` 以及所有控制字符 → 静默替换为 `_`
- 首尾空白去掉
- 结果不能为空、不能是 `.` 或 `..`、最长 200 字符，否则 `400 INVALID_NAME`
- 允许与组内已有文件重名

失败：`400 INVALID_BODY`、`400 EMPTY_BODY`、`400 INVALID_NAME`、`404 GROUP_NOT_FOUND`。

### 4.9 重命名文件

```http
PATCH /api/files/:fileId
Authorization: Bearer <token>
Content-Type: application/json
```

请求：

```json
{ "name": "2026-Q3-报告.pdf" }
```

响应 `200`：`{ "file": { ... } }`，`url` 会随新文件名变化，但 `id` 不变。

失败：`400 INVALID_NAME`、`404 FILE_NOT_FOUND`。

### 4.10 删除文件

```http
DELETE /api/files/:fileId
Authorization: Bearer <token>
```

- 成功：`204 No Content`，同时删除 R2 里的对象。
- 文件不存在：`404 FILE_NOT_FOUND`。

### 4.11 下载文件（公开）

```http
GET /api/file/:fileId/:filename
```

**不需要任何鉴权头。**

| 查询参数 | 说明 |
| --- | --- |
| `inline` | 传 `1` 时 `Content-Disposition: inline`（浏览器内联预览），默认 `attachment`（触发下载） |

```bash
# 直接下载
curl -L -o out.pdf "$BASE/api/file/$FILE_ID/%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf"

# 内联预览
curl -I "$BASE/api/file/$FILE_ID/preview.pdf?inline=1"
```

响应头：

```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="____.pdf"; filename*=UTF-8''%E5%AD%A3%E5%BA%A6%E6%8A%A5%E5%91%8A.pdf
Accept-Ranges: bytes
ETag: "...."
Cache-Control: private, max-age=0, must-revalidate
```

关于路径：

- `:filename` 段**必须存在**（缺失返回 `400 INVALID_PATH`），但内容会被忽略，只用于客户端保存文件时的默认名。可以随便填，建议用 `encodeURIComponent(name)`。
- 只接受 `GET` 和 `HEAD`。

关于 Range（断点续传 / 视频拖动）：

- 带 `Range: bytes=0-1023` 时返回 `206 Partial Content`，并带 `Content-Range: bytes 0-1023/<total>`。
- 只支持单段 Range（`bytes=start-end` / `bytes=start-` / `bytes=-suffix`），不支持多段。
- 不带 `Range` 时返回 `200` 和完整内容。
- 越界或格式错误的 Range 可能返回非 2xx（含 4xx/5xx），客户端把它当作下载失败处理即可，不要假设一定是 `416`。

失败：`404`（纯文本 `文件不存在`）。

---

## 5. 典型流程

```bash
BASE="https://your-worker.your-subdomain.workers.dev"

# 1. 登录，取出 token
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-password"}' | jq -r .token)

# 2. 新建分组
GROUP_ID=$(curl -s -X POST "$BASE/api/groups" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"工作资料"}' | jq -r .group.id)

# 3. 上传
curl -s -X POST "$BASE/api/groups/$GROUP_ID/files?name=notes.md" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: text/markdown' \
  --data-binary @./notes.md | jq .

# 4. 列文件
curl -s "$BASE/api/groups/$GROUP_ID/files" -H "Authorization: Bearer $TOKEN" | jq .

# 5. 下载（公开链接，不需要 token）
#    真实 URL 用列表返回的 file.url 拼上 BASE
```

---

## 6. 客户端实现建议

### 6.1 TypeScript 类型

```ts
export interface Group {
  id: string;
  name: string;
  fileCount: number;
  totalSize: number;
  createdAt: number;
  updatedAt: number;
}

export interface FileItem {
  id: string;
  groupId: string;
  name: string;
  size: number;
  contentType: string | null;
  url: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
```

### 6.2 最小客户端封装

```ts
export class FileKeepClient {
  private token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');

    const response = await fetch(this.baseUrl + path, { ...init, headers });
    if (response.status === 204) return undefined as T;

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (payload as ApiErrorBody | null)?.error;
      throw new Error(`${response.status} ${error?.code ?? 'UNKNOWN'}: ${error?.message ?? ''}`);
    }
    return payload as T;
  }

  async login(username: string, password: string) {
    const data = await this.call<{ token: string; username: string; expiresAt: number }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
    );
    this.token = data.token;
    return data;
  }

  listGroups() {
    return this.call<{ groups: Group[] }>('/api/groups');
  }

  createGroup(name: string) {
    return this.call<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) });
  }

  renameGroup(id: string, name: string) {
    return this.call<{ group: Group }>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }

  deleteGroup(id: string) {
    return this.call<void>(`/api/groups/${id}`, { method: 'DELETE' });
  }

  listFiles(groupId: string) {
    return this.call<{ files: FileItem[] }>(`/api/groups/${groupId}/files`);
  }

  /** 原始 body 直传，返回完整 file 对象 */
  async upload(groupId: string, file: File | Blob, name: string, onProgress?: (ratio: number) => void) {
    return new Promise<FileItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/api/groups/${groupId}/files?name=${encodeURIComponent(name)}`);
      if (this.token) xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      xhr.onload = () => {
        const payload = (() => {
          try {
            return JSON.parse(xhr.responseText);
          } catch {
            return null;
          }
        })();
        if (xhr.status >= 200 && xhr.status < 300) resolve((payload as { file: FileItem }).file);
        else reject(new Error(`${xhr.status} ${payload?.error?.code ?? 'UNKNOWN'}`));
      };
      xhr.onerror = () => reject(new Error('network error'));
      xhr.send(file);
    });
  }

  renameFile(id: string, name: string) {
    return this.call<{ file: FileItem }>(`/api/files/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
  }

  deleteFile(id: string) {
    return this.call<void>(`/api/files/${id}`, { method: 'DELETE' });
  }

  /** 下载直链是公开的，这里只是拼绝对地址 */
  downloadUrl(file: FileItem, inline = false) {
    return this.baseUrl + file.url + (inline ? '?inline=1' : '');
  }
}
```

### 6.3 Python 示例

```python
import requests

BASE = "https://your-worker.your-subdomain.workers.dev"

token = requests.post(
    f"{BASE}/api/auth/login",
    json={"username": "admin", "password": "your-password"},
).json()["token"]

headers = {"Authorization": f"Bearer {token}"}

group = requests.post(f"{BASE}/api/groups", json={"name": "工作资料"}, headers=headers).json()["group"]

# 原始 body 直传：注意要传 bytes，requests 才会带 Content-Length
# 直接传文件对象会走 chunked，服务端（R2）不接受未知长度的流
with open("notes.md", "rb") as fh:
    payload = fh.read()

resp = requests.post(
    f"{BASE}/api/groups/{group['id']}/files",
    params={"name": "notes.md"},
    data=payload,
    headers={**headers, "Content-Type": "text/markdown"},
)
file = resp.json()["file"]

# 公开下载，不需要 token
with requests.get(BASE + file["url"], stream=True) as r:
    r.raise_for_status()
    with open("downloaded.md", "wb") as fh:
        for chunk in r.iter_content(64 * 1024):
            fh.write(chunk)
```

---

## 7. 已知限制

- 单账号，无多用户、无权限分享、无访问审计。
- 下载直链公开且永久有效（除非删除文件），**不要把敏感文件放进来**。
- 无分页、无搜索、无排序参数；列表按创建时间倒序。
- 无批量接口，批量删除需要客户端循环调用。
- 无断点续传上传（R2 分片上传未接入），超大文件受 Workers 请求体上限约束。
- 原始 body 上传要求请求带 `Content-Length`；只能发 chunked 的客户端请改用 multipart 方式。
- 无 CORS，浏览器跨域调用需要自行代理或改服务端。
- 上传失败时服务端不会留下孤儿记录；若入库失败会回滚已上传的 R2 对象。

## 8. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-18 | v1 初版：登录、分组 CRUD、文件上传/改名/删除、公开下载直链 |
