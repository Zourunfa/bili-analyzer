## Context

当前系统已具备视频分析主链路：`/api/video-info` 获取元信息、`/api/subtitle`/`/api/transcribe` 产出字幕、`/api/summarize` 生成摘要、`/api/chat` 对话、`/api/videos` 进行用户隔离历史存储。  
但在“知识沉淀与复用”层仍缺三块：时间戳笔记、结构化组织（标签/合集）、跨视频检索与场景化输出模板。  
约束条件：继续使用 Next.js Route Handlers + Prisma + PostgreSQL，复用现有会话鉴权与流式 AI 响应能力，避免大规模重构。

## Goals / Non-Goals

**Goals:**
- 提供可复用的时间戳笔记能力，支持从字幕上下文快速记录并回到原片段。
- 提供标签与智能合集能力，降低“历史视频堆积后不可管理”的问题。
- 提供跨视频搜索入口，打通字幕级全文检索与知识点语义检索。
- 提供模板化输出，支持“分析结果 -> 可发布内容”一键生成。

**Non-Goals:**
- 不实现浏览器插件、移动端原生分享入口。
- 不实现 MCP/Agent 编排与外部自动化工作流。
- 不实现复杂多角色权限，仅沿用现有用户隔离模型。

## Decisions

### 决策 1：新增“时间戳笔记”实体，挂靠用户与视频
- 方案：新增 `VideoTimestampNote`（`userId`, `videoId`, `timestampSec`, `content`, `sourceText`, `createdAt`, `updatedAt`）。
- 原因：笔记天然是“用户私有 + 视频内片段”关系，不适合复用 `NotebookVideo.notes`（粒度过粗，缺时间定位）。
- 备选方案：
  - 复用 `NotebookVideo.notes`：无法支持多条时间戳、排序和快速跳转。
  - 前端 localStorage：无法跨端同步且不可检索。

### 决策 2：在现有 Notebook 之上扩展“智能合集”
- 方案：复用 `Notebook` 作为合集容器，新增字段：
  - `mode`：`manual | smart`
  - `rule`：JSON（关键词、UP主、标签、时间范围等）
- `manual` 使用既有 `NotebookVideo` 显式关联；
- `smart` 在查询时按规则动态筛选，不落地冗余关联。
- 原因：最大化复用现有页面与接口（`/api/notebooks*`），降低迁移成本。
- 备选方案：
  - 新建 `Collection` 体系：边界清晰但改动面大、与既有笔记本功能重叠。

### 决策 3：新增“用户视频标签”多对多模型
- 方案：新增 `VideoTag` 与 `VideoTagRelation`（或等效二表设计）并带 `userId` 隔离。
- 原因：标签是组织能力核心，需支持多标签筛选、智能合集规则与搜索过滤。
- 备选方案：
  - 把标签放到 `Video` 的字符串数组：无法实现用户隔离且不利于统计/过滤索引。

### 决策 4：全局搜索采用“双通道聚合”
- 方案：
  - 通道 A：字幕全文检索（`videos.subtitleText ILIKE`，按 `user_videos` 过滤）。
  - 通道 B：复用现有 `/api/knowledge/search` 语义检索。
  - 在新接口统一返回标准结果结构，前端支持来源筛选与排序。
- 原因：全文检索速度快、召回广；语义检索理解强，组合后更实用。
- 备选方案：
  - 仅保留语义检索：冷启动弱、对未抽取知识点的视频覆盖不足。

### 决策 5：模板输出先做“系统模板 + 流式生成”
- 方案：
  - 新增模板配置（`ppt-outline`, `wechat-article`, `xiaohongshu-post`）。
  - 新增 `/api/templates/generate`，复用现有 `streamText` 与模型路由。
- 原因：先满足高频使用场景，减少用户手写 prompt 成本。
- 备选方案：
  - 先做用户自定义模板 CRUD：灵活但首版复杂度高、交互成本高。

### 数据模型设计

- 新增表（Prisma）：
  - `VideoTimestampNote`
  - `VideoTag`
  - `VideoTagRelation`
- 扩展表：
  - `Notebook` 增加 `mode` 与 `rule`（JSON）
- 索引建议：
  - `VideoTimestampNote @@index([userId, videoId, timestampSec])`
  - `VideoTag @@unique([userId, name])`
  - `VideoTagRelation @@unique([userId, videoId, tagId])`
  - `Notebook @@index([userId, mode])`

## Risks / Trade-offs

- [风险] 智能合集规则过于复杂导致查询慢  
  → Mitigation：首版限制规则维度（关键词/UP主/标签）并加分页；后续再加物化缓存。

- [风险] 字幕全文检索在数据量变大后性能下降  
  → Mitigation：先上 `ILIKE + pageSize`；后续升级 `tsvector` 或专用检索引擎。

- [风险] 模板输出结果不稳定  
  → Mitigation：固定模板结构 + 统一 system prompt + 输出格式校验。

- [风险] 数据迁移影响现有笔记本逻辑  
  → Mitigation：`Notebook.mode` 默认 `manual`，旧数据零行为变更。

## Migration Plan

1. Prisma schema 增加新模型与字段，生成迁移并在预发执行。
2. 后端先发布（接口向后兼容），前端灰度启用新入口。
3. 观测查询耗时与错误率，必要时关闭智能合集入口（保留 manual）。
4. 若需回滚：
   - 前端隐藏新功能开关；
   - 后端接口降级返回空数据；
   - 暂不删除新表，确保可恢复。

## Open Questions

- 智能合集是否支持“与/或”组合规则（首版建议仅 `AND`）？
- 模板输出结果是否要入库留痕（首版可不入库，仅前端复制/下载）？
- 时间戳笔记是否支持富文本（首版建议纯文本）？
