## Approach

本阶段优先处理可被审计工具直接识别的公开 SEO 信号：

1. **页面相关性**
   首页首屏 H1 直接包含核心关键词，Meta description 覆盖平台、摘要、思维导图、知识库、公开分享和适用场景。

2. **结构化数据**
   首页采用单个 JSON-LD `@graph`，避免多个上下文重复，同时补齐 WebSite、SoftwareApplication、HowTo、FAQPage、Organization、BreadcrumbList。功能页使用 `ItemList`，FAQ 页使用 `FAQPage`。

3. **内链和 Sitemap**
   `/features` 和 `/faq` 作为公开功能与问题承接页加入 sitemap、页脚和首页入口，形成首页 -> 功能/FAQ -> 转化入口的稳定路径。

4. **E-E-A-T**
   公开页面继续展示联系方式、产品边界、AI 输出限制和人工核对建议，避免把 AI 摘要包装成原始权威内容。

## Verification

- `npm run build`
- 抽查首页 HTML：`title`、`description`、`canonical`、JSON-LD、H1
- 抽查 `/features`、`/faq`、`/sitemap.xml`
