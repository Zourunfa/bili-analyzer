## ADDED Requirements

### Requirement: Video history list page
系统 SHALL 提供 `/videos` 页面，以卡片网格形式展示所有分析过的视频，每张卡片展示封面图、标题、UP主、分析时间和知识提取状态。

#### Scenario: User views video history
- **WHEN** 用户访问 `/videos` 页面
- **THEN** 系统展示所有已分析视频的卡片列表，按分析时间倒序排列，每页默认 12 条

#### Scenario: Empty history
- **WHEN** 数据库中没有任何视频记录
- **THEN** 页面展示空状态提示"还没有分析过视频，去首页搜索开始吧"并提供跳转首页的链接

### Requirement: Video list search and sort
系统 SHALL 支持按关键词搜索视频标题或UP主名称，并支持按时间排序。

#### Scenario: Search by keyword
- **WHEN** 用户在搜索框输入关键词
- **THEN** 系统实时筛选展示标题或UP主名包含该关键词的视频

#### Scenario: Sort by time
- **WHEN** 用户切换排序方式
- **THEN** 系统按选择的时间正序或倒序重新排列视频列表

### Requirement: Navigate to video detail
系统 SHALL 支持从视频列表卡片点击跳转到视频分析详情页。

#### Scenario: Click video card
- **WHEN** 用户点击视频卡片
- **THEN** 系统跳转到 `/analyze/{bvid}` 页面展示该视频的分析详情

### Requirement: Delete video record
系统 SHALL 支持删除单条视频记录，删除时需二次确认。

#### Scenario: Delete with confirmation
- **WHEN** 用户点击视频卡片上的删除按钮并确认删除
- **THEN** 系统删除该视频及其关联数据（知识点、嵌入向量、笔记本关联），并从列表中移除该卡片

#### Scenario: Cancel delete
- **WHEN** 用户点击删除按钮但取消确认
- **THEN** 不执行任何删除操作

### Requirement: Video history navigation entry
系统 SHALL 在首页 Quick Links 区域提供"视频历史"导航入口。

#### Scenario: Navigate from home
- **WHEN** 用户在首页点击"视频历史"链接
- **THEN** 系统导航到 `/videos` 页面

### Requirement: Video list API with pagination and search
系统 SHALL 扩展 `GET /api/videos` 支持分页、关键词搜索和排序。

#### Scenario: Paginated list
- **WHEN** 客户端请求 `GET /api/videos?page=1&pageSize=12`
- **THEN** 返回第 1 页共 12 条视频数据及总数

#### Scenario: Search by keyword
- **WHEN** 客户端请求 `GET /api/videos?keyword=前端`
- **THEN** 返回标题或UP主名包含"前端"的视频列表

### Requirement: Delete video API
系统 SHALL 提供 `DELETE /api/videos/[id]` 接口用于删除视频及其关联数据。

#### Scenario: Delete single video
- **WHEN** 客户端发送 `DELETE /api/videos/{id}`
- **THEN** 系统删除该视频记录及其关联的知识点和嵌入数据，返回成功状态
