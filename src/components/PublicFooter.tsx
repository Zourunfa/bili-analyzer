import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/seo";

export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div>
          <Link href="/" className="public-footer-brand">
            {SITE_NAME}
          </Link>
          <p>把视频内容转化为可检索、可分享、可复用的结构化知识。</p>
        </div>
        <nav aria-label="公共页脚导航">
          <Link href="/features">功能介绍</Link>
          <Link href="/faq">常见问题</Link>
          <Link href="/about">关于</Link>
          <Link href="/privacy">隐私政策</Link>
          <Link href="/terms">服务条款</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>联系</a>
        </nav>
      </div>
    </footer>
  );
}
