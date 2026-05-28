## Why

现有公开分享只支持单个视频，用户整理好的笔记本无法作为一个完整知识主题对外传播和被搜索引擎索引。新增笔记本级公开分享可以把多个视频的 AI 解析结果组织成一篇可引用、可分享、可收录的主题知识页。

## What Changes

- 新增笔记本公开分享能力，用户可在笔记本详情页开启、复制、关闭公开分享。
- 新增公开页面 `/share/notebooks/[shareId]`，展示笔记本标题、描述、标签、视频列表、AI 摘要和结构化知识点。
- 复用 `share_pages` 表，使用 `targetType = "notebook"` 存储分享状态。
- 新增 sitemap 收录公开笔记本分享页，并补齐 canonical、Open Graph 和 JSON-LD。
- 第一版仅支持手动笔记本，智能笔记本暂不支持公开分享。

## Non-goals

- 不公开完整字幕内容。
- 不公开用户时间戳笔记、聊天历史或私有批注。
- 不公开智能笔记本动态规则，也不让智能笔记本自动暴露后续匹配的新视频。
- 不新增数据库表或引入新的分享权限模型。

## Capabilities

### New Capabilities

- `notebook-public-share`: 用户可以把手动笔记本的 AI 解析结果发布为公开分享页，并管理分享状态。

### Modified Capabilities

- `architecture`: 增加笔记本公开分享 API、页面路由和 sitemap 收录行为。

## Impact

- 新增 API：`/api/share/notebooks/[notebookId]`
- 新增页面：`/share/notebooks/[shareId]`
- 修改笔记本详情页，新增公开分享按钮和复制/关闭操作。
- 修改分享 URL helper、sitemap、SEO 元数据和首页/公开内容可发现性。
- 不需要 Prisma migration，继续使用现有 `share_pages` 表。
