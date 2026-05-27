## Context

站点基于 Next.js 16 App Router，公开入口包括首页、搜索/UP 主等功能页、公开视频分享页和动态 sitemap。当前 `src/app/layout.tsx` 仅提供基础 title/description；分享页已经具备动态 metadata、canonical、OG/Twitter 图片和 sitemap 收录，但缺少 JSON-LD、稳定信任页面、首页内部链接入口和更完整的产品语义内容。

现有数据模型已经有 `SharePage`、`Video`、`KnowledgePoint`，足够支撑首页“最新公开笔记”和分享页结构化数据。本变更不新增表，也不改变用户私有数据模型。

## Goals / Non-Goals

**Goals:**
- 建立公开站点 SEO 基础：robots、canonical、OG/Twitter、sitemap、索引策略和安全响应头。
- 提升 GEO/AI 引用准备度：为首页和分享页输出 JSON-LD，并让页面正文包含可提取的问答、场景和事实信息。
- 强化 E-E-A-T：新增关于、隐私、条款页面，并通过全站页脚稳定链接。
- 复用现有分享页数据，在首页展示最新公开笔记，降低分享页孤立风险。

**Non-Goals:**
- 不自动部署、不修改服务器生产 nginx 配置；只在代码层提供 Next headers。
- 不做性能深度专项，例如 Ant Design 拆包、图片 CDN 或 Core Web Vitals 调优。
- 不新增主题聚合页和数据库标签结构；主题集群作为后续变更处理。

## Decisions

### 1. 使用 Next.js Metadata API 统一全站元数据
在 `layout.tsx` 中定义 `metadataBase`、默认 title 模板、description、canonical、Open Graph 和 Twitter Card。页面级 metadata 继续由分享页的 `generateMetadata` 覆盖。

替代方案：手写 `<head>` 标签。放弃原因是 App Router 已有 Metadata API，能和动态页面 metadata 合并并减少重复。

### 2. JSON-LD 使用小型组件/内联脚本输出
首页输出 `WebApplication`、`FAQPage`、`Organization`；分享页输出 `Article`、`VideoObject`、`BreadcrumbList`。JSON-LD 直接在 server/client 页面里以 `application/ld+json` script 输出，不引入新依赖。

替代方案：引入 schema-dts 或 SEO 库。放弃原因是 schema 类型简单，直接对象生成更轻量。

### 3. 首页最新公开笔记使用服务端组件包装
当前首页是 client component，处理输入框和跳转逻辑。为避免在 client component 直接访问 Prisma，拆出 server page 查询公开分享数据，再把交互入口保留在 client 子组件中，或创建 server 组件段落专门读取最近分享页。

数据模型复用：
- `SharePage.visibility = "public"` 过滤公开内容。
- `SharePage.targetType = "video"` 限制视频分享。
- 通过 `targetId` 查询 `Video` 标题、封面、UP 主、摘要。

### 4. 信任页面采用静态公开页面
新增 `/about`、`/privacy`、`/terms`，内容以中文为主，提供项目背景、数据处理说明、AI 输出边界和联系方式。页面必须可索引，并进入 sitemap 与页脚。

### 5. 登录后薄内容页明确索引策略
对需要登录或主要价值在用户私有数据中的页面，添加 `robots: { index: false, follow: true }` 或在页面内补充公开可见说明。第一轮优先对薄内容功能页设置 noindex，避免低质量索引。

## Risks / Trade-offs

- [Risk] 首页从 client page 拆分可能触及现有交互逻辑 → Mitigation：保留现有交互代码为 client 子组件，server page 只负责数据查询和布局组合。
- [Risk] JSON-LD 字段过度承诺产品能力 → Mitigation：只描述已经存在的功能，不写无法验证的数据。
- [Risk] robots 误挡公开分享页 → Mitigation：仅阻止 `/api/`、`/admin/`、登录/验证页面，不阻止 `/share/`。
- [Risk] 安全头 CSP 过严导致 Ant Design、Next、图片或外部平台资源异常 → Mitigation：第一轮使用保守 CSP 或仅添加非破坏性安全头，CSP 单独验证后再收紧。

## Migration Plan

1. 添加 robots、metadata、headers 和 sitemap 扩展。
2. 新增信任页面与全站页脚。
3. 拆分首页 client 交互组件，扩展首页 SEO 内容和最新公开笔记。
4. 为首页与分享页添加 JSON-LD。
5. 为薄内容功能页设置 noindex。
6. 本地运行 lint/build；若 build 受既有问题阻断，记录阻断点并至少完成相关文件 lint。

Rollback：所有变更均为页面/metadata/静态文件级改动，可通过回退本变更涉及文件恢复，不需要数据库迁移。

## Open Questions

- 联系邮箱使用站点公开邮箱还是作者个人邮箱？本轮先使用通用占位 `contact@afai.asia`，上线前可替换。
- 首页最新公开笔记展示数量默认 6 条；后续可根据内容规模调整。
