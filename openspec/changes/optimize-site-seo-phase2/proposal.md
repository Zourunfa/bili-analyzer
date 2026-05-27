## Why

最新 SEO 复测显示站点基础抓取已恢复，但页面相关性、Schema/E-E-A-T、公开功能页发现和锚文本仍然偏弱。需要在不改变核心产品流程的前提下，继续把公开站点从“可索引”提升为“主题清晰、结构化充分、内部链接完整”的 SEO/GEO 入口。

## What Changes

- 强化首页 title、description、H1 和首屏说明，让“AI 视频转知识笔记 / 视频摘要 / 思维导图 / 知识库”成为明确首屏信号。
- 将首页 JSON-LD 升级为 `@graph`，补充 WebSite、SoftwareApplication、HowTo、FAQPage、Organization 和 BreadcrumbList。
- 新增可索引 `/features` 功能页和 `/faq` 常见问题页，提供更完整的 crawlable 文本、页面级 metadata 和结构化数据。
- 将新公开页加入 sitemap、页脚和首页入口，修复“核心功能页未收录进 sitemap / 内链不足”的问题。
- 新增根路由动态 Open Graph 图片，替代通用 SVG，提高社交分享预览质量。

## Impact

- 影响 `src/app/page.tsx`、`src/components/HomeClient.tsx`、`src/app/sitemap.ts`、`src/components/PublicFooter.tsx`、`src/lib/seo.ts`。
- 新增 `src/app/features/page.tsx`、`src/app/faq/page.tsx`、`src/app/opengraph-image.tsx`。
- 不新增数据库表；不改变登录后功能和用户数据权限。

## Non-Goals

- 不做 Core Web Vitals 深度专项。
- 不做完整主题聚合 `/topics/[tag]`。
- 不自动提交 GitHub。
- 不自动部署，除非用户再次明确要求。
