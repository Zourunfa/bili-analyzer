## ADDED Requirements

### Requirement: 侧边栏 Tab 切换
分析页左侧边栏 SHALL 提供两个 Tab：「字幕」和「历史」。默认显示「字幕」Tab。用户可随时切换。

#### Scenario: 默认显示字幕 Tab
- **WHEN** 用户进入分析页面
- **THEN** 左侧边栏默认显示「字幕」Tab，展示当前视频的字幕内容

#### Scenario: 切换到历史 Tab
- **WHEN** 用户点击「历史」Tab
- **THEN** 边栏切换为视频历史列表，同时发起 `GET /api/videos?pageSize=50&sort=createdAt_desc` 请求

#### Scenario: 切回字幕 Tab
- **WHEN** 用户从「历史」Tab 切回「字幕」Tab
- **THEN** 边栏恢复显示当前视频的字幕内容

### Requirement: 历史视频列表展示
「历史」Tab SHALL 展示所有已分析视频的列表，每项包含缩略图、标题、UP主名、时长。列表按分析时间倒序排列。

#### Scenario: 有历史视频
- **WHEN** 用户打开「历史」Tab 且数据库有视频记录
- **THEN** 展示视频列表，每项显示缩略图（无图时显示占位图标）、标题（单行截断）、UP主名、时长

#### Scenario: 无历史视频
- **WHEN** 用户打开「历史」Tab 且数据库无视频记录
- **THEN** 展示空状态提示"还没有分析过视频"

### Requirement: 历史视频关键词搜索
历史列表 SHALL 提供搜索输入框，支持按标题和 UP主名实时过滤。

#### Scenario: 输入搜索关键词
- **WHEN** 用户在搜索框输入关键词
- **THEN** 列表实时过滤，仅显示标题或UP主名包含关键词的视频

#### Scenario: 清空搜索
- **WHEN** 用户清空搜索框或点击清除按钮
- **THEN** 列表恢复显示全部视频

### Requirement: 点击历史视频加载分析数据
用户点击历史列表中的视频 SHALL 直接在当前页面加载该视频的完整分析数据，不触发页面跳转或重新加载。

#### Scenario: 点击已有摘要的视频
- **WHEN** 用户点击历史列表中一个已保存摘要的视频
- **THEN** 系统调用 `GET /api/videos?bvid=xxx` 获取视频数据，将 `subtitleText`、`summary`、`videoInfo` 更新到页面状态，清空对话消息，URL 更新为 `/analyze/[bvid]`

#### Scenario: 当前视频高亮
- **WHEN** 历史列表中包含当前正在分析的视频
- **THEN** 该视频项 SHALL 有视觉高亮标识

### Requirement: 移除独立视频历史页面
系统 SHALL 移除独立的 `/videos` 页面及其所有入口（导航栏链接、首页快捷入口）。

#### Scenario: 访问 /videos 路径
- **WHEN** 用户访问 `/videos` 路径
- **THEN** 返回 404 或重定向到首页
