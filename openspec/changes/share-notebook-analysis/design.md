## Context

当前公开分享能力只覆盖单视频，入口在分析页，数据记录在 `SharePage`，公开页面为 `/share/videos/[shareId]`。`SharePage.targetType` 已预留 `video | notebook`，笔记本模型也已经通过 `NotebookVideo` 关联多个 `Video`，每个视频包含 `summary` 与 `KnowledgePoint`。

用户希望公开分享“整个笔记本的解析数据”。这里的解析数据限定为 AI 生成的摘要与结构化知识点，不包含完整字幕、用户时间戳笔记或聊天历史。

## Goals / Non-Goals

**Goals:**

- 支持手动笔记本开启、复制、关闭公开分享。
- 生成可被搜索引擎索引的公开笔记本页。
- 公开展示笔记本元数据、视频清单、每个视频摘要与知识点。
- 复用现有分享数据模型、SEO helper 和页面风格。

**Non-Goals:**

- 不支持智能笔记本公开分享。
- 不公开完整字幕、用户私有笔记、聊天历史、智能规则。
- 不新增复杂权限模型或数据库表。

## Decisions

### 数据模型设计

复用现有 `SharePage`：

- `targetType = "notebook"`
- `targetId = notebook.id`
- `title = notebook.title`
- `description = notebook.description`
- `coverImage = notebook.coverImage`，若为空可在公开页使用首个视频封面
- `visibility = "public" | "disabled"`

原因：现有表已经有 `(userId, targetType, targetId)` 唯一约束和 `shareId` 公开标识，足够表达笔记本分享状态。避免新增 migration，降低部署风险。

### API 设计

新增 `/api/share/notebooks/[notebookId]`：

- `GET`：登录用户查询该笔记本分享状态。
- `POST`：校验用户拥有笔记本、笔记本为 `manual`、至少有一个视频后 upsert 分享页。
- `DELETE`：校验权限后将分享页标记为 `disabled`。

原因：与单视频分享 API 保持一致，前端状态管理可以复用同一模式。

### 公开页面设计

新增 `/share/notebooks/[shareId]`：

- 只读取 `visibility = "public"` 且 `targetType = "notebook"` 的分享。
- 查询笔记本及其视频，包含视频 `summary` 和有限数量 `knowledgePoints`。
- 页面展示主题概览、视频目录、摘要卡片、知识点聚合和 CTA。
- 生成 `CollectionPage`、`ItemList`、`BreadcrumbList` JSON-LD。

原因：笔记本本质是一个主题集合，`CollectionPage` 比 `Article` 更贴合，同时每个视频作为 item 保留来源上下文。

### 智能笔记本限制

第一版 `POST` 对 `mode = "smart"` 返回 400，并提示智能笔记本暂不支持公开分享。

原因：智能笔记本会随规则动态变化，公开后可能自动暴露后续匹配视频，超出用户直觉。

## Risks / Trade-offs

- [Risk] 大笔记本页面过长 → 限制每个视频知识点展示数量，后续可加分页或折叠。
- [Risk] 用户误以为完整笔记也公开 → 页面和 API 只公开 AI 摘要/知识点，不读取私有表。
- [Risk] sitemap 查询变慢 → 与视频分享页一致限制数量，先按 `updatedAt` 取最新公开分享。
- [Risk] 分享页 SEO 内容重复 → 每个笔记本使用标题、描述、视频列表和知识点聚合生成独立 metadata。

## Migration Plan

- 不需要数据库 migration。
- 部署后旧视频分享不受影响。
- 回滚时删除新增页面/API 和前端按钮即可，`share_pages` 中 `targetType = notebook` 记录不会影响现有流程。

## Open Questions

- 后续是否允许用户选择公开完整字幕，需要单独做权限和版权提示。
- 后续是否支持智能笔记本快照分享，需要新增快照数据模型。
