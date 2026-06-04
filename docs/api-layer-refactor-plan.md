# API Layer Refactor Plan

## 背景

当前项目使用 Next.js App Router 的 Route Handler 实现后端 API。这个方式适合快速交付，但随着功能扩展，部分 `route.ts` 已经同时承担了 HTTP 入参解析、鉴权、业务编排、第三方平台逻辑、数据库查询、错误映射和响应组装。

后续需要把 API 层逐步重构成可维护的分层结构，目标不是机械套传统 MVC，而是让每一层职责清晰、可测试、可复用。

## 当前问题

1. `route.ts` 过重

   例如后台用户列表接口同时处理分页参数、筛选条件、排序字段、Prisma 查询、统计聚合和响应结构。

2. 平台业务逻辑和 HTTP 控制层耦合

   例如 UP 主视频列表接口包含 B 站 Cookie 来源选择、登录态校验、降级策略、错误码判断。后续如果后台任务、批量任务、定时同步也要复用，会比较困难。

3. 错误响应不统一

   目前有的接口使用 `NextResponse.json`，有的接口使用原生 `Response`，错误码和错误结构散落在各个 route 中。

4. 参数校验手写较多

   例如 `if (!mid)`、`Number(...)`、手动限制分页大小。后续建议用 schema 统一校验 query/body。

5. 数据访问口径分散

   Prisma 查询直接写在 API route 中，统计口径、筛选条件、排序字段容易重复和漂移。

## 目标架构

采用 Next.js 友好的 Controller / Service / Repository 分层：

```txt
src/app/api/**/route.ts        Controller: HTTP 边界
src/server/services/**         Service: 业务编排
src/server/repositories/**     Repository: 数据访问
src/server/schemas/**          Schema: query/body 校验和 DTO
src/server/errors/**           Error: 业务错误和 HTTP 映射
src/lib/**                     Platform SDK / infra utilities
```

### Controller

只处理 HTTP 边界：

- 读取 `Request`
- 调用鉴权函数
- 调用 schema 解析 query/body
- 调用 service
- 返回统一响应

不直接写复杂业务逻辑，不直接堆 Prisma 查询。

示例：

```ts
export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;

  const query = parseAdminUserQuery(req);
  const result = await adminUserService.listUsers(query);

  return ok(result);
}
```

### Service

负责业务编排：

- 调用 repository
- 调用第三方平台能力
- 处理业务规则
- 聚合返回 DTO
- 抛出业务错误

示例：

```ts
export async function listUsers(query: AdminUserQuery) {
  const [users, stats] = await Promise.all([
    adminUserRepository.findUsers(query),
    adminUserRepository.getStats(),
  ]);

  return {
    users,
    pagination: query.pagination,
    stats,
  };
}
```

### Repository

只负责数据库访问：

- Prisma 查询
- select/include 固化
- where/orderBy 构造
- 事务封装

不处理 HTTP 状态码，不拼接前端文案。

示例：

```ts
export async function findUsers(query: AdminUserQuery) {
  return prisma.user.findMany({
    where: buildUserWhere(query),
    orderBy: buildUserOrder(query),
    skip: query.skip,
    take: query.pageSize,
    select: userListSelect,
  });
}
```

### Schema

负责输入校验和默认值：

- query 参数
- request body
- path params
- sort/filter 白名单

建议引入 `zod`。如果暂时不想新增依赖，可以先用轻量手写 parser，但保持集中在 `src/server/schemas`。

### Error

统一业务错误和 HTTP 映射：

```ts
class AppError extends Error {
  constructor(
    message: string,
    public status = 500,
    public code = "INTERNAL_ERROR",
  ) {
    super(message);
  }
}
```

统一响应：

```ts
type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};
```

## 推荐目录

第一阶段先建立以下目录：

```txt
src/server/
  admin/
    admin-user.repository.ts
    admin-user.schema.ts
    admin-user.service.ts
  bilibili/
    bili-cookie.service.ts
    upowner.service.ts
    bilibili-error.ts
  http/
    response.ts
    route-handler.ts
  errors/
    app-error.ts
```

后续可继续扩展：

```txt
src/server/
  notebooks/
  videos/
  knowledge/
  share/
  search/
```

## 模块拆分建议

### 后台用户管理

优先重构，风险最低，适合作为样板。

当前接口：

```txt
src/app/api/admin/users/route.ts
src/app/api/admin/users/[id]/route.ts
```

目标拆分：

```txt
src/app/api/admin/users/route.ts
src/server/admin/admin-user.schema.ts
src/server/admin/admin-user.repository.ts
src/server/admin/admin-user.service.ts
```

职责：

- schema: 解析分页、搜索、邮箱验证状态、排序字段
- repository: 用户列表查询、用户统计、更新验证状态、删除用户
- service: 聚合列表和统计，处理后台用户管理业务
- route: 鉴权、调用 service、返回响应

### UP 主分析

第二优先级，收益最高。

当前接口：

```txt
src/app/api/upowner/videos/route.ts
src/app/api/upowner/analyze/route.ts
```

目标拆分：

```txt
src/server/bilibili/bili-cookie.service.ts
src/server/bilibili/upowner.service.ts
src/server/bilibili/upowner.schema.ts
src/server/bilibili/bilibili-error.ts
```

职责：

- cookie service: 读取服务端 cookie、读取客户端 header cookie、验证 cookie 三态
- upowner service: 获取 UP 主视频、批量分析、进度事件编排
- bilibili error: 把 B 站错误转成业务错误，如登录态失效、风控、公开视频不可取等
- route: 只处理 GET/POST 和 SSE 响应

### 视频解析链路

第三优先级，改动风险较高。

相关接口：

```txt
src/app/api/video-info/route.ts
src/app/api/subtitle/route.ts
src/app/api/transcribe/route.ts
src/app/api/summarize/route.ts
src/app/api/knowledge/extract/route.ts
```

目标拆分：

```txt
src/server/videos/video-info.service.ts
src/server/videos/subtitle.service.ts
src/server/videos/transcribe.service.ts
src/server/knowledge/knowledge-extraction.service.ts
```

关注点：

- 视频链接识别和平台元信息获取
- 字幕获取和 ASR fallback
- LLM 摘要生成
- 知识点提取和入库
- 失败恢复与日志记录

## 响应规范

普通 JSON 成功响应：

```json
{
  "data": {},
  "meta": {}
}
```

为了兼容现有前端，第一阶段不强制改全部响应结构。新接口和重构接口可以先保持现状，只在内部使用统一错误类型。

错误响应建议最终统一为：

```json
{
  "error": {
    "code": "BILI_COOKIE_INVALID",
    "message": "B站登录态已失效，请更新 Cookie 后重试。"
  }
}
```

SSE 响应保持事件流格式，但错误事件也应该携带统一 code：

```txt
data: {"type":"error","code":"MODEL_UNAVAILABLE","message":"模型不可用"}
```

## 迁移策略

不要一次性重构所有 API。按低风险到高收益逐步迁移。

### Phase 1: 建立样板

目标：重构后台用户管理 API。

任务：

1. 新建 `src/server/admin` 目录。
2. 抽出 `admin-user.schema.ts`。
3. 抽出 `admin-user.repository.ts`。
4. 抽出 `admin-user.service.ts`。
5. route 只保留鉴权、调用 service、返回响应。
6. 保持前端响应格式不变。

验收：

- 用户列表分页、搜索、筛选、排序正常。
- 邮箱验证状态更新正常。
- 删除用户正常。
- 后台统计数字不变。

### Phase 2: 统一错误处理

目标：增加 `AppError` 和 response helper。

任务：

1. 新建 `src/server/errors/app-error.ts`。
2. 新建 `src/server/http/response.ts`。
3. 提供 `ok`、`fail`、`handleRouteError`。
4. 先在后台用户 API 使用。

验收：

- route 中不再散落重复 `try/catch`。
- 业务错误能稳定映射到 HTTP 状态码。

### Phase 3: 重构 UP 主视频列表

目标：把 B 站登录态选择和 UP 主视频业务从 route 中移出。

任务：

1. 抽出 cookie 解析和选择逻辑。
2. 抽出 `getUpownerVideos` service。
3. 抽出 B 站错误映射。
4. 保持现有接口返回结构不变。

验收：

- 服务端 Cookie 正常。
- 客户端 Cookie 正常。
- 客户端 Cookie invalid 时按现有逻辑回退或返回 401。
- 风控错误仍返回 429。

### Phase 4: 重构视频解析核心链路

目标：降低 `/api/video-info`、`/api/subtitle`、`/api/transcribe`、`/api/summarize` 等接口复杂度。

任务：

1. 将平台识别和元信息获取移入 service。
2. 将字幕获取和 ASR fallback 移入 service。
3. 将 LLM 摘要和知识点提取移入 service。
4. 保持接口协议兼容。

验收：

- B 站视频解析正常。
- 抖音、小红书链接错误提示正常。
- 字幕缺失时 ASR fallback 正常。
- SSE 摘要流正常。

## 代码风格约定

1. `route.ts` 不超过 80 行，复杂接口例外但要明确原因。
2. route 中不直接写 Prisma 查询，除非是极小的只读状态接口。
3. service 不依赖 `NextRequest` / `NextResponse`。
4. repository 不拼接前端展示文案。
5. schema 是唯一的入参默认值来源。
6. 错误码使用大写蛇形命名，如 `BILI_COOKIE_INVALID`。
7. 保持现有前端接口兼容，重构不顺手改协议。

## 面试表述

可以这样介绍：

> 项目前期为了快速验证功能，我直接使用 Next.js Route Handler 实现 API。随着功能复杂度提升，我规划把后端逐步演进为 Controller / Service / Repository 分层。Controller 只负责 HTTP 边界，Service 负责业务编排，Repository 负责 Prisma 数据访问，Schema 负责参数校验，Error 层负责统一错误映射。这样 UP 主分析、B 站登录态、用户管理、日志管理和视频解析链路都能更容易测试、复用和维护。

## 暂不做的事

1. 暂不一次性重构所有 API。
2. 暂不改前端接口协议。
3. 暂不引入完整 NestJS。
4. 暂不把所有模块强行拆成传统 MVC 目录。
5. 暂不在重构阶段同时做性能优化或 UI 改版。
