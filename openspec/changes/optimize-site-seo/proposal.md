## Why

当前站点已经具备公开视频分享页和 sitemap 基础，但首页内容、全站元数据、爬虫入口、结构化数据和信任页面不足，导致搜索引擎抓取信号弱、GEO/AI 引用准备度低。需要先把公开页面变成稳定可索引、可分享、可被答案引擎理解的内容资产。

## What Changes

- 补齐全站 SEO 基础：robots.txt、canonical、Open Graph、Twitter Card、搜索引擎友好的默认 metadata。
- 为首页和公开分享页添加 JSON-LD 结构化数据，覆盖 WebApplication、FAQPage、Article、VideoObject、BreadcrumbList。
- 扩展首页公开内容，增加产品说明、适用场景、工作原理、FAQ 和最新公开笔记入口。
- 新增关于、隐私政策、服务条款页面，并通过全站页脚稳定链接。
- 优化 sitemap，将所有公开可索引页面纳入 sitemap，并保持公开分享页动态收录。
- 对登录后或内容较薄的功能页明确索引策略，避免低质量页面进入索引。

## Capabilities

### New Capabilities
- `public-seo-foundation`: 定义公开站点的抓取入口、元数据、索引策略、结构化数据和信任页面要求。
- `public-content-discovery`: 定义首页到公开分享页、法律/信任页面和未来主题页的内部链接与发现要求。

### Modified Capabilities
- `product`: 公开首页从纯工具入口增强为可被搜索引擎理解的产品介绍与转化入口。

## Impact

- 影响 `src/app/layout.tsx`、`src/app/page.tsx`、`src/app/sitemap.ts`、`public/robots.txt`、公开分享页、全站导航/页脚和新增公开页面。
- 不新增数据库表；首页“最新公开笔记”复用现有 `SharePage` 与 `Video` 数据。
- 不自动部署服务器；安全响应头的 nginx 配置只形成建议，本轮先在 Next.js 配置层补基础 headers。

## Non-Goals

- 不做服务器部署或 nginx 生产配置变更。
- 不做 Core Web Vitals 深度性能专项、Ant Design 拆包或图片 CDN 改造。
- 不实现完整主题集群 `/topics/[tag]`，仅为后续主题聚合预留内部链接策略。
- 不更改私有用户数据的访问权限和认证模型。
