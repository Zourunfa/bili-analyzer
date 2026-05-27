import type { Metadata } from "next";
import PublicFooter from "@/components/PublicFooter";
import { CONTACT_EMAIL, getPublicPageMetadata } from "@/lib/seo";

export const metadata: Metadata = getPublicPageMetadata({
  title: "服务条款",
  description: "阅读视记 VideoNote 的使用规则、AI 输出限制、内容归属和免责声明。",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <>
      <main className="legal-page">
        <h1>服务条款</h1>
        <p className="lead">最后更新：2026-05-26。使用视记 VideoNote 即表示你理解并接受以下条款。</p>

        <section className="legal-section">
          <h2>服务说明</h2>
          <p>
            视记提供视频信息解析、字幕处理、AI 摘要、知识点提取、笔记本管理、检索和公开分享等学习辅助能力。服务结果用于辅助理解和整理，不构成专业建议。
          </p>
        </section>

        <section className="legal-section">
          <h2>可接受使用</h2>
          <ul>
            <li>你应确保提交的视频链接和内容使用符合原平台规则与相关法律法规。</li>
            <li>不得使用本服务批量抓取、传播侵权内容或绕过原平台限制。</li>
            <li>不得尝试攻击、滥用或干扰服务的正常运行。</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>AI 输出限制</h2>
          <p>
            AI 生成的摘要、问答和知识点可能存在遗漏、误解或事实错误。对重要学习、研究或决策内容，请回到原视频和可靠来源进行核对。
          </p>
        </section>

        <section className="legal-section">
          <h2>内容归属</h2>
          <p>
            原视频、封面、标题和创作者信息归属于原平台和原作者。视记生成的分析结果仅用于用户学习整理和分享展示，不改变原内容权属。
          </p>
        </section>

        <section className="legal-section">
          <h2>联系我们</h2>
          <p>
            条款问题、侵权反馈或服务沟通可发送邮件至 <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>。
          </p>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
