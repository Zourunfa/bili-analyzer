import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { CONTACT_EMAIL, getPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = getPublicPageMetadata({
  title: "关于视记 VideoNote",
  description: "了解视记 VideoNote 的产品定位、适用人群、视频知识管理方法和联系方式。",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <main className="legal-page">
        <h1>关于视记 VideoNote</h1>
        <p className="lead">
          视记是一个面向视频学习者和知识工作者的 AI 视频知识管理工具，帮助用户把 B站、抖音、小红书等平台的视频内容转化为摘要、思维导图、知识点和可检索笔记。
        </p>

        <section className="legal-section">
          <h2>我们解决什么问题</h2>
          <p>
            长视频适合讲解复杂知识，但不适合后续检索、复习和复用。视记通过字幕提取、AI 总结和结构化知识抽取，把一次性观看转化为可沉淀的个人知识资产。
          </p>
        </section>

        <section className="legal-section">
          <h2>适合谁使用</h2>
          <ul>
            <li>通过视频学习技术、课程和知识内容的学生与自学者。</li>
            <li>需要整理大量视频资料的研究者、内容运营和知识工作者。</li>
            <li>希望追踪 UP 主内容方向并形成主题知识库的创作者。</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>产品边界</h2>
          <p>
            视记不提供视频下载服务，不替代原平台播放体验，也不声称 AI 输出总是完全准确。生成的摘要和知识点应作为学习辅助材料，重要信息建议回到原视频核对。
          </p>
        </section>

        <section className="legal-section">
          <h2>联系方式</h2>
          <p>
            产品反馈、数据请求和合作沟通可发送邮件至 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>。
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
