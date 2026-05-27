import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { CONTACT_EMAIL, getPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = getPublicPageMetadata({
  title: "隐私政策",
  description: "了解视记 VideoNote 如何处理视频链接、字幕、AI 摘要、账号信息和公开分享内容。",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <main className="legal-page">
        <h1>隐私政策</h1>
        <p className="lead">最后更新：2026-05-26。本政策说明视记 VideoNote 在提供视频知识管理服务时如何处理数据。</p>

        <section className="legal-section">
          <h2>我们处理的数据</h2>
          <ul>
            <li>用户主动提交的视频链接、视频基础信息、字幕文本和分析结果。</li>
            <li>账号注册和登录所需的邮箱、昵称、认证状态等信息。</li>
            <li>用户创建的笔记本、标签、时间戳笔记、对话记录和公开分享页。</li>
            <li>服务运行所需的日志、错误信息和基础访问记录。</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>数据用途</h2>
          <p>
            数据用于生成摘要、知识点、思维导图、检索结果、笔记本和公开分享页；也用于账号认证、安全审计、问题排查和产品改进。
          </p>
        </section>

        <section className="legal-section">
          <h2>公开分享</h2>
          <p>
            只有用户主动开启公开分享后，对应视频笔记才会生成可访问的公开页面。关闭分享后，该公开页面不再作为公开内容展示。
          </p>
        </section>

        <section className="legal-section">
          <h2>第三方服务</h2>
          <p>
            为完成视频信息获取、AI 摘要、转写和邮件验证，服务可能调用视频平台接口、AI 模型服务和邮件服务。我们只传递完成对应功能所需的数据。
          </p>
        </section>

        <section className="legal-section">
          <h2>用户请求</h2>
          <p>
            如需查询、更正或删除相关数据，请通过 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> 联系我们。
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
