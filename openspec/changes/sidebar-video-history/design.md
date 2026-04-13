## Context

当前分析页面 (`/analyze/[bvid]`) 左侧边栏固定显示字幕内容，视频历史是独立 `/videos` 页面。用户切换视频需离开分析页面，打断工作流。

现有代码关键点：
- `GET /api/videos` 已支持分页、关键词搜索、排序，可直接复用
- `Video` 模型包含 `subtitleText`、`summary` 字段，可一次性返回分析数据
- 左侧边栏当前由 `Sider` + 字幕区组成，无 Tab 切换
- 分析页面所有状态（`videoInfo`、`subtitleText`、`summary`、`messages`）都在顶层组件管理

## Goals / Non-Goals

**Goals:**
- 左侧边栏新增「字幕」/「历史」Tab 切换
- 历史列表展示缩略图、标题、UP主、时长
- 点击历史视频在当前页加载完整分析数据（字幕 + 摘要 + 对话）
- 支持关键词搜索过滤
- 复用现有 API，零后端改动

**Non-Goals:**
- 不做视频删除功能
- 不做分页（历史列表展示最近 50 条）
- 不做对话历史持久化（对话内容仅存内存，切换视频后丢失）
- 不修改数据模型

## Decisions

### 1. 边栏 Tab 用 Ant Design Tabs 组件

使用 antd `Tabs` 替代当前边栏的固定内容结构。两个 Tab：「字幕」保持原有字幕展示，「历史」展示视频列表。

**理由**：antd Tabs 已内置切换动画和样式，与项目风格一致。自建 Tab 增加无谓工作量。

### 2. 点击历史视频直接更新页面状态，不触发路由跳转

点击视频后调用 `GET /api/videos?bvid=xxx` 获取视频记录（含 `subtitleText`、`summary`），直接 `setState` 更新 `videoInfo`、`subtitleText`、`summary`，清空 `messages`。

**理由**：
- 避免路由跳转导致整个组件卸载重建，体验更流畅
- `Video` 模型已存储 `subtitleText` 和 `summary`，无需重新调用 AI
- URL 可通过 `router.replace` 更新 bvid 参数，保持浏览器历史一致

**备选方案**：路由跳转到 `/analyze/[bvid]`。放弃原因：整页重载，且已有摘要需重新生成。

### 3. 历史列表一次加载最近 50 条，前端关键词过滤

调用 `GET /api/videos?pageSize=50` 一次加载，前端用 `keyword` 状态过滤。

**理由**：50 条视频数据量小（每条约 200 字节），一次加载避免分页交互复杂度。用户个人视频分析量级不会超过这个范围。

### 4. 删除 `/videos` 独立页面

**理由**：功能已集成到边栏，独立页面冗余。同时移除 Navbar 和首页对应的入口。

## Risks / Trade-offs

- **[历史列表加载延迟]** 50 条数据在首次打开历史 Tab 时加载 → 用 antd Spin 加 loading 态，列表通常 < 500ms
- **[对话丢失]** 切换视频会清空当前对话 → 在 UI 上提示"切换视频将清空当前对话"，用户可预期
- **[摘要不完整]** 若之前分析时摘要未保存（如中途退出），历史视频会显示空摘要 → 可选"重新生成摘要"按钮，但 v1 不做
