import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";
import { publicFaqItems } from "@/lib/public-content";
import { absoluteUrl, FAQ_DESCRIPTION, FAQ_TITLE, getPublicPageMetadata, jsonLdScript } from "@/lib/seo";

export const metadata: Metadata = {
  ...getPublicPageMetadata({
    title: FAQ_TITLE,
    description: FAQ_DESCRIPTION,
    path: "/faq",
  }),
  title: { absolute: FAQ_TITLE },
};

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": absoluteUrl("/faq#faq"),
    mainEntity: publicFaqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <main className="legal-page">
        <h1>视记 VideoNote 常见问题</h1>
        <p className="lead">
          这里汇总视频转知识笔记、AI 视频摘要、公开视频分享、知识库保存和数据边界相关问题，帮助你判断视记是否适合当前学习或内容研究场景。
        </p>

        {publicFaqItems.map((item) => (
          <section key={item.question} className="legal-section">
            <h2>{item.question}</h2>
            <p>{item.answer}</p>
          </section>
        ))}

        <section className="legal-section">
          <h2>还有其他问题？</h2>
          <p>
            可以先查看 <Link href="/features">功能介绍</Link> 和 <Link href="/about">关于视记</Link>，或通过页脚邮箱联系。
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
