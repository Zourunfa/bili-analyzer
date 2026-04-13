## Context

当前系统在分析视频时会通过 `POST /api/videos` 将视频信息 upsert 到数据库（Video 模型），已有 `GET /api/videos` 但功能简陋（仅支持按 bvid 查单条或返回最新 20 条，无分页/筛选/删除）。用户缺少一个集中查看所有分析历史的入口。

现有 Video 模型字段完备：bvid、title、pic（封面）、ownerName、ownerMid、duration、knowledgeExtracted、createdAt、updatedAt，无需修改数据模型。

## Goals / Non-Goals

**Goals:**
- 提供视频历史列表页面，展示所有分析过的视频
- 支持关键词搜索和排序
- 支持删除记录
- 从列表可直接跳转到分析详情页
- 首页导航入口

**Non-Goals:**
- 视频收藏/置顶
- 视频标签管理
- 视频播放
- 批量操作

## Decisions

### 1. 复用现有 Video 模型，不加新表

Video 模型已有全部所需字段（pic、title、ownerName、createdAt 等）。`updatedAt` 每次分析都会更新，可作为"最近分析时间"使用。无需新增数据表或字段。

### 2. 扩展现有 `/api/videos` API，而非新建

现有 `GET /api/videos` 功能太简单。在其基础上扩展：
- 新增查询参数：`page`、`pageSize`、`keyword`（搜索标题/UP主）、`sort`（createdAt desc/asc）
- 新增 `DELETE /api/videos/[id]` 路由用于删除单条

### 3. 视频列表页面路由 `/videos`

独立页面，不在首页内嵌。与 `/notebooks`、`/search`、`/upowner` 同级。

### 4. UI 方案：Ant Design Card + Grid

使用 Ant Design 的 Card 组件做视频卡片，Grid 布局。每张卡片包含封面图、标题、UP主、分析时间、知识提取状态标签。复用首页 `feature-card` 的视觉风格。

### 5. 首页 Quick Links 增加"视频历史"入口

在首页 `/` 的 Quick Links 区域增加一个链接到 `/videos`。

## Risks / Trade-offs

- **无用户隔离风险**：当前 Video 表没有 userId 字段，所有视频是全局的。如果后续加用户系统需要迁移。→ 当前 MVP 阶段可接受，后续加 userId 关联即可
- **封面图加载**：B站图片域 `i0.hdslb.com` 可能有跨域/防盗链问题。→ 使用 `next/image` 配置 remotePatterns 或直接用 `<img>` 标签加载
- **大量视频分页性能**：数据量小时不需要担心。→ API 已设计分页，后续可按需优化
