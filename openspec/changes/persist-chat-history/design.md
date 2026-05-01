## Context

分析页当前使用本地 `messages` state 维护对话，`/api/chat` 只负责基于字幕与前端传入的消息生成流式回复。历史视频从数据库恢复视频、字幕与摘要时不会恢复对话，刷新页面或从历史列表再次进入同一视频都会得到空白对话。

这项变更跨越数据模型、API 和分析页状态管理。现有 Prisma、NextAuth、`Video`/`UserVideo` 权限关系和 `/api/chat` 流式接口应继续复用。

## Goals / Non-Goals

**Goals:**
- 已登录用户对同一视频的对话历史可持久保存并恢复。
- 保存 user 与 assistant 两类消息，保持现有流式体验。
- 对话历史按用户隔离，用户只能读取和追加自己可访问视频的对话。
- 删除视频时自动清理关联对话。

**Non-Goals:**
- 不支持一个视频下多个命名会话。
- 不做单条消息编辑、删除、重新生成。
- 不保存匿名用户临时对话。

## Decisions

### 决策 1：新增 `ChatMessage` 表

新增表保存最小消息粒度：
- `id String @id @default(cuid())`
- `userId String`
- `videoId String`
- `role String`，仅保存 `user` / `assistant`
- `content Text`
- `createdAt DateTime @default(now())`
- 关联 `User` 与 `Video`，`onDelete: Cascade`
- 索引：`@@index([userId, videoId, createdAt])`、`@@index([videoId])`

原因：消息是后续搜索、导出、删除和多端同步的最小可演进单位。相比把整个会话 JSON 存在 `Video` 或 `UserVideo` 上，单条消息表更易分页、审计和级联清理。

### 决策 2：新增历史读取接口，扩展现有聊天接口保存

- 新增 `GET /api/videos/[id]/chat`：返回当前用户对该视频的消息列表。
- 扩展 `POST /api/chat`：请求可带 `videoId`；流式生成完成后在服务端追加本轮 user/assistant 消息。

原因：读取历史是普通 JSON 响应，生成回复仍沿用现有 SSE 流式体验，避免前端额外等待。

### 决策 3：前端按视频切换加载历史

分析页在确定数据库 `videoId` 后加载历史消息；切换到另一个历史视频时先清空旧对话，再加载目标视频对话。发送消息时继续乐观展示用户消息和流式 assistant 内容，服务端完成后落库。

原因：保持当前交互手感，同时避免不同视频间消息串台。

### 决策 4：兼容未保存视频和未登录状态

如果没有 `videoId` 或未登录，`/api/chat` 不保存历史，仍按当前临时对话模式工作。

原因：分析新视频的前半段可能尚未创建数据库记录，不能因为持久化失败阻断核心问答。

## Risks / Trade-offs

- [Risk] 流式过程中连接中断可能导致 assistant 未保存 → Mitigation：仅在完整生成后保存，前端仍显示本次临时内容；用户可重试。
- [Risk] 对话历史无限增长影响加载速度 → Mitigation：首版按创建时间返回最近 200 条，后续可加分页。
- [Risk] 请求携带历史消息且服务端又读取历史可能重复上下文 → Mitigation：首版 `/api/chat` 仍使用前端传入 messages 生成，只负责保存本轮新增消息。

## Migration Plan

1. 新增 Prisma 模型与 migration。
2. 生成 Prisma Client。
3. 部署 API 与前端加载逻辑。
4. 回滚时删除新增接口使用并回滚 migration；已有业务表不受影响。

## Open Questions

- 是否需要在 UI 暴露“清空当前视频对话”？首版不做，等用户使用反馈后再加。
