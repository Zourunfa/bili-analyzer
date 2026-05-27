"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Alert, Space, Modal, message } from "antd";
import {
  SearchOutlined, PlayCircleOutlined, BookOutlined, ThunderboltOutlined,
  ExportOutlined, RobotOutlined, QuestionCircleOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useCaseItems, workflowSteps } from "@/lib/public-content";

export type RecentPublicNote = {
  title: string;
  description: string;
  url: string;
  coverImage: string | null;
  ownerName: string;
  updatedAt: string;
  viewCount: number;
};

type FaqItem = {
  question: string;
  answer: string;
};

type HomeClientProps = {
  recentNotes: RecentPublicNote[];
  faqItems: FaqItem[];
};

const features = [
  { icon: <RobotOutlined />, title: "AI 结构化分析", desc: "自动从视频内容中提取主题、要点、概念和问答对", color: "#fb7299" },
  { icon: <BookOutlined />, title: "笔记本管理", desc: "按学习主题组织视频，构建个人知识体系", color: "#4cc9f0" },
  { icon: <ThunderboltOutlined />, title: "UP主追踪", desc: "批量分析UP主的所有视频，洞察内容方向", color: "#a78bfa" },
  { icon: <SearchOutlined />, title: "知识检索", desc: "全文和语义搜索，快速定位知识点", color: "#34d399" },
  { icon: <ExportOutlined />, title: "Skill 导出", desc: "将知识打包为标准 Agent Skill 结构", color: "#fbbf24" },
];

type VideoInfoResponse = {
  platform: "bilibili" | "douyin" | "xiaohongshu";
  id: string;
  title?: string;
  cid?: number;
  page?: number;
  pages?: Array<{ bvid?: string; cid: number; page: number; part: string; duration: number }>;
  error?: string;
};

export default function HomeClient({ recentNotes, faqItems }: HomeClientProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const buildAnalyzeUrl = (data: VideoInfoResponse) => {
    const params = new URLSearchParams();
    params.set("platform", data.platform);
    if (data.platform === "bilibili" && data.cid) {
      params.set("cid", String(data.cid));
    }
    if (data.platform !== "bilibili" && url.trim()) {
      params.set("sourceUrl", url.trim());
    }
    return `/analyze/${data.id}?${params.toString()}`;
  };

  const analyzeAllChapters = async (data: VideoInfoResponse) => {
    const pages = data.pages || [];
    const firstPage = pages[0];
    if (!firstPage) {
      router.push(buildAnalyzeUrl(data));
      return;
    }

    const hide = message.loading("正在创建章节笔记本...", 0);
    try {
      const notebookRes = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${data.title || data.id} 章节合集`,
          description: `自动保存 ${data.id} 的 ${pages.length} 个章节解析结果`,
          tags: ["章节合集"],
          mode: "manual",
        }),
      });
      const notebookData = await notebookRes.json();
      if (!notebookRes.ok || !notebookData.notebook?.id) {
        throw new Error(notebookData.error || "章节笔记本创建失败");
      }

      hide();
      message.success("章节合集笔记本已创建，开始按顺序解析");
      const params = new URLSearchParams();
      params.set("platform", "bilibili");
      params.set("cid", String(firstPage.cid));
      params.set("chapterQueue", "all");
      params.set("chapterPage", String(firstPage.page));
      params.set("notebookId", notebookData.notebook.id);
      router.push(`/analyze/${firstPage.bvid || data.id}?${params.toString()}`);
    } catch (err) {
      hide();
      message.error(err instanceof Error ? err.message : "章节队列启动失败");
    }
  };

  const continueWithVideoInfo = (data: VideoInfoResponse) => {
    const isMultipart = data.platform === "bilibili" && (data.pages?.length || 0) > 1;
    if (!isMultipart) {
      router.push(buildAnalyzeUrl(data));
      return;
    }

    const currentPage = data.page || data.pages?.find((page) => page.cid === data.cid)?.page || 1;
    Modal.confirm({
      title: "检测到这是一个章节/分P视频",
      content: `当前链接指向第 ${currentPage} 个视频。选择全部解析时，会自动创建一个章节合集笔记本，并按顺序逐个解析保存。`,
      okText: "创建笔记本并解析全部",
      cancelText: "只解析当前视频",
      centered: true,
      onOk: () => analyzeAllChapters(data),
      onCancel: () => router.push(buildAnalyzeUrl(data)),
    });
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "获取视频信息失败");
        return;
      }
      continueWithVideoInfo(data);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero-bg">
          <div className="hero-orb hero-orb-1" />
          <div className="hero-orb hero-orb-2" />
        </div>
        <div className="home-hero-content">
          <div className="home-hero-badge">
            <PlayCircleOutlined style={{ fontSize: 12 }} />
            <span>AI 视频摘要 · 思维导图 · 知识库</span>
          </div>
          <h1 className="home-hero-title">
            AI 视频<span className="gradient-text">转知识笔记</span>
          </h1>
          <p className="home-hero-desc">
            粘贴 B站、抖音或小红书链接，自动生成视频摘要、关键词、思维导图和可检索知识点，沉淀到你的个人知识库。
          </p>
          <div className="home-search-card">
            <Space.Compact style={{ width: "100%" }}>
              <Input
                size="large"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPressEnter={handleSubmit}
                placeholder="粘贴视频链接（B站/抖音/小红书），开始分析..."
                disabled={loading}
                prefix={<SearchOutlined style={{ color: "var(--muted-foreground)" }} />}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                size="large"
                onClick={handleSubmit}
                loading={loading}
                disabled={!url.trim()}
                style={{ padding: "0 32px", fontWeight: 600 }}
              >
                {loading ? null : "开始分析"}
              </Button>
            </Space.Compact>
            {error && <Alert message={error} type="error" showIcon style={{ marginTop: 12 }} />}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="home-features">
        <h2 className="home-section-title">核心功能</h2>
        <div className="features-grid">
          {features.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon" style={{ background: `${f.color}18`, color: f.color }}>
                {f.icon}
              </div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-seo-band">
        <div className="home-seo-inner">
          <h2>从视频到知识库，只保留可复用的信息</h2>
          <p>
            视记 VideoNote 面向高频视频学习场景：粘贴 B站、抖音或小红书链接后，系统会读取可用字幕和视频描述，生成结构化摘要、关键词、思维导图和知识点。你可以继续追问视频内容、把结果保存到笔记本，也可以公开分享为一篇可索引的视频知识页。
          </p>
          <div className="workflow-grid">
            {workflowSteps.map((step, index) => (
              <div key={step.name} className="workflow-card">
                <span>{index + 1}</span>
                <h3>{step.name}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-use-cases">
        <h2 className="home-section-title">适合这些视频学习场景</h2>
        <div className="use-case-grid">
          {useCaseItems.map(([title, desc]) => (
            <article key={title} className="use-case-card">
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </section>

      {recentNotes.length > 0 && (
        <section className="home-public-notes">
          <h2 className="home-section-title">最新公开笔记</h2>
          <div className="public-note-grid">
            {recentNotes.map((note) => (
              <Link key={note.url} href={note.url} className="public-note-card">
                {note.coverImage ? (
                  <img src={note.coverImage.startsWith("//") ? `https:${note.coverImage}` : note.coverImage} alt={`${note.title} 封面`} />
                ) : null}
                <div>
                  <span>{note.ownerName || "公开视频"}</span>
                  <h3>{note.title}</h3>
                  <p>{note.description}</p>
                  <small>{note.viewCount} 次浏览 · {new Date(note.updatedAt).toLocaleDateString("zh-CN")}</small>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="home-faq">
        <h2 className="home-section-title">常见问题</h2>
        <div className="faq-list">
          {faqItems.map((item) => (
            <article key={item.question} className="faq-item">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Quick Links */}
      <section className="home-quick">
        <div className="quick-links">
          <Link href="/notebooks" className="quick-link">
            <BookOutlined />
            <span>我的笔记本</span>
          </Link>
          <Link href="/upowner" className="quick-link">
            <ThunderboltOutlined />
            <span>UP主分析</span>
          </Link>
          <Link href="/features" className="quick-link">
            <RobotOutlined />
            <span>功能介绍</span>
          </Link>
          <Link href="/faq" className="quick-link">
            <QuestionCircleOutlined />
            <span>常见问题</span>
          </Link>
          <Link href="/search" className="quick-link">
            <SearchOutlined />
            <span>知识检索</span>
          </Link>
          <Link href="/about" className="quick-link">
            <BookOutlined />
            <span>关于视记</span>
          </Link>
        </div>
      </section>

      <style jsx>{`
        .home-page {
          background: var(--background);
          min-height: calc(100vh - 56px);
        }
        /* Hero */
        .home-hero {
          position: relative;
          padding: 72px 24px 64px;
          text-align: center;
          overflow: hidden;
        }
        .home-hero-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .hero-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.3;
        }
        .hero-orb-1 {
          width: 500px; height: 500px;
          background: #fb7299;
          top: -200px; left: 50%;
          transform: translateX(-50%);
          animation: heroPulse 6s ease-in-out infinite;
        }
        .hero-orb-2 {
          width: 300px; height: 300px;
          background: #4cc9f0;
          bottom: -100px; right: -50px;
          animation: heroPulse 8s ease-in-out infinite reverse;
        }
        @keyframes heroPulse {
          0%, 100% { opacity: 0.3; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.45; transform: translateX(-50%) scale(1.1); }
        }
        .home-hero-content {
          position: relative;
          z-index: 1;
          max-width: 680px;
          margin: 0 auto;
          animation: fadeInUp 0.6s ease-out;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .home-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(251, 114, 153, 0.1);
          border: 1px solid rgba(251, 114, 153, 0.2);
          color: #fb7299;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 20px;
        }
        .home-hero-title {
          font-size: 42px;
          font-weight: 800;
          color: var(--foreground);
          margin: 0 0 16px;
          letter-spacing: -1px;
          line-height: 1.2;
        }
        .gradient-text {
          background: linear-gradient(135deg, #fb7299, #4cc9f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .home-hero-desc {
          color: var(--muted-foreground);
          font-size: 16px;
          margin: 0 0 32px;
          line-height: 1.6;
        }
        .home-search-card {
          background: var(--soft-card);
          backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 20px;
        }
        /* Features */
        .home-features {
          max-width: 1000px;
          margin: 0 auto;
          padding: 48px 24px;
        }
        .home-section-title {
          text-align: center;
          font-size: 24px;
          font-weight: 700;
          color: var(--foreground);
          margin: 0 0 36px;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }
        .feature-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px 20px;
          text-align: center;
          transition: all 0.3s;
        }
        .feature-card:hover {
          border-color: rgba(251, 114, 153, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(251, 114, 153, 0.08);
        }
        .feature-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          margin: 0 auto 14px;
        }
        .feature-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--foreground);
          margin: 0 0 6px;
        }
        .feature-desc {
          font-size: 13px;
          color: var(--muted-foreground);
          margin: 0;
          line-height: 1.5;
        }
        .home-seo-band,
        .home-use-cases,
        .home-public-notes,
        .home-faq {
          max-width: 1000px;
          margin: 0 auto;
          padding: 40px 24px;
        }
        .home-seo-inner {
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--card);
          padding: 28px;
        }
        .home-seo-inner h2 {
          margin: 0 0 12px;
          color: var(--foreground);
          font-size: 24px;
          line-height: 1.3;
        }
        .home-seo-inner > p {
          margin: 0;
          color: var(--markdown-foreground);
          font-size: 15px;
          line-height: 1.8;
        }
        .workflow-grid,
        .use-case-grid,
        .public-note-grid,
        .faq-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .workflow-grid {
          margin-top: 22px;
        }
        .workflow-card,
        .use-case-card,
        .faq-item {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--soft-card);
          padding: 18px;
        }
        .workflow-card span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: rgba(251, 114, 153, 0.12);
          color: #fb7299;
          font-weight: 700;
          margin-bottom: 10px;
        }
        .workflow-card h3,
        .use-case-card h3,
        .faq-item h3 {
          margin: 0 0 8px;
          color: var(--foreground);
          font-size: 16px;
        }
        .workflow-card p,
        .use-case-card p,
        .faq-item p {
          margin: 0;
          color: var(--muted-foreground);
          font-size: 13px;
          line-height: 1.7;
        }
        .public-note-card {
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--card);
          color: inherit;
          text-decoration: none;
          transition: all 0.2s;
        }
        .public-note-card:hover {
          border-color: #fb7299;
          transform: translateY(-2px);
        }
        .public-note-card img {
          width: 100%;
          aspect-ratio: 16 / 9;
          object-fit: cover;
          background: var(--muted);
        }
        .public-note-card div {
          padding: 14px;
        }
        .public-note-card span,
        .public-note-card small {
          display: block;
          color: var(--muted-foreground);
          font-size: 12px;
        }
        .public-note-card h3 {
          display: -webkit-box;
          margin: 6px 0;
          overflow: hidden;
          color: var(--foreground);
          font-size: 15px;
          line-height: 1.4;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .public-note-card p {
          display: -webkit-box;
          margin: 0 0 10px;
          overflow: hidden;
          color: var(--muted-foreground);
          font-size: 13px;
          line-height: 1.6;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }
        .faq-list {
          grid-template-columns: 1fr;
        }
        /* Quick Links */
        .home-quick {
          max-width: 600px;
          margin: 0 auto;
          padding: 0 24px 48px;
        }
        .quick-links {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }
        .quick-link {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 10px;
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--foreground);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .quick-link:hover {
          border-color: #fb7299;
          color: #fb7299;
          background: rgba(251, 114, 153, 0.06);
        }
        @media (max-width: 768px) {
          .home-hero-title { font-size: 28px; }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
