import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { publicFeatureItems, workflowSteps } from "@/lib/public-content";
import { absoluteUrl, FEATURES_DESCRIPTION, FEATURES_TITLE, getPublicPageMetadata, jsonLdScript } from "@/lib/seo";

export const metadata: Metadata = {
  ...getPublicPageMetadata({
    title: FEATURES_TITLE,
    description: FEATURES_DESCRIPTION,
    path: "/features",
  }),
  title: { absolute: FEATURES_TITLE },
};

export default function FeaturesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": absoluteUrl("/features#page"),
        name: "视记 VideoNote 功能介绍",
        url: absoluteUrl("/features"),
        description: FEATURES_DESCRIPTION,
        isPartOf: { "@id": absoluteUrl("/#website") },
      },
      {
        "@type": "ItemList",
        "@id": absoluteUrl("/features#features"),
        name: "视记 VideoNote 核心功能",
        itemListElement: publicFeatureItems.map((feature, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "SoftwareApplication",
            name: feature.name,
            description: feature.description,
            applicationCategory: "EducationalApplication",
          },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <main className="legal-page">
        <h1>AI 视频转知识笔记功能介绍</h1>
        <p className="lead">
          视记 VideoNote 将视频摘要、思维导图、知识点抽取和个人知识库管理放在同一个工作流里，适合把长视频内容沉淀为可检索、可分享、可复用的学习资料。
        </p>

        <section className="legal-section">
          <h2>核心功能</h2>
          <ul>
            {publicFeatureItems.map((feature) => (
              <li key={feature.name}>
                <strong>{feature.name}：</strong>{feature.description}
              </li>
            ))}
          </ul>
        </section>

        <section className="legal-section">
          <h2>从视频到知识库的流程</h2>
          <ol>
            {workflowSteps.map((step) => (
              <li key={step.name}>
                <strong>{step.name}：</strong>{step.text}
              </li>
            ))}
          </ol>
        </section>

        <section className="legal-section">
          <h2>为什么适合 SEO 和 GEO 内容沉淀</h2>
          <p>
            公开分享页会保留视频标题、AI 摘要、结构化知识点、思维导图和来源归属，方便搜索引擎理解页面主题，也便于 AI 答案引擎引用清晰的事实片段。用户可以选择是否公开，默认不会把私人笔记自动发布。
          </p>
        </section>

        <section className="legal-section">
          <h2>开始使用</h2>
          <p>
            回到 <Link href="/">首页</Link> 粘贴视频链接即可生成 AI 视频知识笔记；如果想先了解权限和使用边界，可以查看 <Link href="/faq">常见问题</Link>。
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
