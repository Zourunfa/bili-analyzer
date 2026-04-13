## 1. 左侧边栏 Tab 重构

- [x] 1.1 在 `analyze/[bvid]/page.tsx` 的 Sider 内添加 antd `Tabs` 组件，包含「字幕」和「历史」两个 Tab 项，默认激活「字幕」 (P0)
- [x] 1.2 将现有字幕内容区域（Divider + 字幕标题 + 字幕滚动区）移入「字幕」Tab 内容中 (P0)

## 2. 历史视频列表

- [x] 2.1 新增状态：`sidebarTab`（当前 Tab）、`historyVideos`（视频列表）、`historyLoading`、`historyKeyword` (P0)
- [x] 2.2 在「历史」Tab 中实现视频列表：调用 `GET /api/videos?pageSize=50&sort=createdAt_desc`，每项显示缩略图、标题、UP主、时长，加载中显示 Spin，空数据显示 Empty (P0)
- [x] 2.3 添加搜索输入框，前端按标题和 UP主名实时过滤 `historyVideos` (P1)
- [x] 2.4 当前视频在列表中高亮显示（添加 active 样式类） (P1)

## 3. 点击历史视频加载分析数据

- [x] 3.1 实现点击历史视频的处理函数：调用 `GET /api/videos?bvid=xxx` 获取视频数据，更新 `videoInfo`、`subtitleText`、`summary` 状态，清空 `messages` (P0)
- [x] 3.2 切换视频后调用 `router.replace(/analyze/${bvid})` 更新 URL，并自动切回「字幕」Tab (P0)

## 4. 清理独立视频页面

- [x] 4.1 删除 `src/app/videos/page.tsx` (P1)
- [x] 4.2 从 `src/components/Navbar.tsx` 移除「视频历史」导航链接和 `VideoCameraOutlined` 导入 (P1)
- [x] 4.3 从 `src/app/page.tsx` 移除首页「视频历史」快捷入口 (P1)
