"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Alert, Space } from "antd";
import {
  SearchOutlined, PlayCircleOutlined, BookOutlined, ThunderboltOutlined,
  ExportOutlined, RobotOutlined, BulbOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const features = [
  { icon: <RobotOutlined />, title: "AI 结构化分析", desc: "自动从视频内容中提取主题、要点、概念和问答对", color: "#fb7299" },
  { icon: <BookOutlined />, title: "笔记本管理", desc: "按学习主题组织视频，构建个人知识体系", color: "#4cc9f0" },
  { icon: <ThunderboltOutlined />, title: "UP主追踪", desc: "批量分析UP主的所有视频，洞察内容方向", color: "#a78bfa" },
  { icon: <SearchOutlined />, title: "知识检索", desc: "全文和语义搜索，快速定位知识点", color: "#34d399" },
  { icon: <ExportOutlined />, title: "Skill 导出", desc: "将知识打包为标准 Agent Skill 结构", color: "#fbbf24" },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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
      // 多平台跳转
      const analyzeId = data.platform === "bilibili" ? data.id : data.id;
      const params = new URLSearchParams();
      params.set("platform", data.platform);
      if (data.platform === "bilibili" && data.cid) {
        params.set("cid", String(data.cid));
      }
      router.push(`/analyze/${analyzeId}?${params.toString()}`);
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
            <span>Bilibili Video Knowledge Platform</span>
          </div>
          <h1 className="home-hero-title">
            将视频<span className="gradient-text">转化为</span>知识
          </h1>
          <p className="home-hero-desc">
            粘贴视频链接，AI 自动提取结构化知识点，构建你的个人知识库
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
          <Link href="/search" className="quick-link">
            <SearchOutlined />
            <span>知识检索</span>
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
          background: rgba(18, 18, 42, 0.6);
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
