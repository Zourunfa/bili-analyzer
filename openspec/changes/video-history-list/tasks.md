## 1. 后端 API

- [x] 1.1 扩展 `GET /api/videos` 支持分页（page/pageSize）、关键词搜索（keyword，匹配标题和UP主）、排序（sort: createdAt_asc/desc），返回 `{ videos, total, page, pageSize }` (P0)
- [x] 1.2 新增 `DELETE /api/videos/[id]/route.ts`，删除视频及其级联关联数据（知识点、嵌入向量、笔记本关联），返回成功状态 (P0)

## 2. 前端页面

- [x] 2.1 创建 `/videos` 页面 `src/app/videos/page.tsx`，实现视频历史卡片网格布局，展示封面图、标题、UP主、分析时间、知识提取状态标签 (P0)
- [x] 2.2 实现搜索栏和排序切换功能，搜索框输入时实时筛选列表，排序切换按钮支持时间正序/倒序 (P1)
- [x] 2.3 实现卡片点击跳转到 `/analyze/{bvid}` 详情页 (P0)
- [x] 2.4 实现删除功能：卡片悬浮显示删除按钮，点击弹出确认弹窗，确认后调用 DELETE API 并刷新列表 (P1)
- [x] 2.5 实现空状态展示：无视频时显示引导提示和首页跳转链接 (P1)
- [x] 2.6 实现分页：卡片列表底部加分页器，切换页码时请求数据 (P1)

## 3. 导航入口

- [x] 3.1 在首页 `src/app/page.tsx` 的 Quick Links 区域增加"视频历史"入口链接到 `/videos` (P0)
