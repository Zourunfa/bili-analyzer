"use client";

import { useState } from "react";
import {
  Input, Button, Card, Typography, Space, Radio, Tag, Empty, Spin, Row, Col, Divider, message,
} from "antd";
import { SearchOutlined, PlayCircleOutlined, TagOutlined, BulbOutlined, QuestionCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Text, Paragraph } = Typography;

interface SearchResult {
  id: string;
  type: string;
  content: string;
  timestamp: number | null;
  metadata: Record<string, unknown> | null;
  videoId: string;
  videoTitle?: string;
  videoBvid?: string;
  score?: number;
}

const typeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  topic: { label: "主题", color: "#fb7299", icon: <TagOutlined /> },
  keyPoint: { label: "要点", color: "#34d399", icon: <BulbOutlined /> },
  concept: { label: "概念", color: "#a78bfa", icon: <TagOutlined /> },
  qaPair: { label: "问答", color: "#fbbf24", icon: <QuestionCircleOutlined /> },
};

function formatTimestamp(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"fulltext" | "semantic">("fulltext");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), mode, topK: 20 }),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results);
      } else {
        message.error(data.error || "搜索失败");
      }
    } catch {
      message.error("搜索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-page">
      <div className="search-header">
        <div className="search-header-icon">
          <SearchOutlined />
        </div>
        <Title level={3} style={{ margin: 0, color: "var(--foreground)" }}>知识检索</Title>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        搜索你分析过的视频中的知识点
      </Paragraph>

      {/* 搜索栏 */}
      <div className="search-card">
        <Space.Compact style={{ width: "100%", marginBottom: 12 }}>
          <Input
            size="large"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={handleSearch}
            placeholder="输入关键词或问题搜索知识点..."
            prefix={<SearchOutlined style={{ color: "var(--muted-foreground)" }} />}
          />
          <Button type="primary" size="large" onClick={handleSearch} loading={loading}>
            搜索
          </Button>
        </Space.Compact>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} size="small">
          <Radio.Button value="fulltext">全文搜索</Radio.Button>
          <Radio.Button value="semantic">语义搜索</Radio.Button>
        </Radio.Group>
      </div>

      {/* 搜索结果 */}
      {loading && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <Empty description="未找到相关知识点" />
      )}

      {!loading && results.length > 0 && (
        <div className="search-results">
          <div className="search-results-header">
            <Text type="secondary">找到 {results.length} 个结果</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === "semantic" ? "按语义相似度排序" : "按全文匹配排序"}
            </Text>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {results.map((result, idx) => {
              const config = typeConfig[result.type] || { label: result.type, color: "var(--muted-foreground)", icon: null };
              return (
                <div
                  key={result.id}
                  className="search-result-card"
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                        <Tag
                          icon={config.icon}
                          style={{
                            background: `${config.color}18`,
                            borderColor: `${config.color}40`,
                            color: config.color,
                            borderRadius: 6,
                          }}
                        >
                          {config.label}
                        </Tag>
                        {result.timestamp !== null && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatTimestamp(result.timestamp)}
                          </Text>
                        )}
                        {result.score !== undefined && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            相似度: {(result.score * 100).toFixed(1)}%
                          </Text>
                        )}
                      </div>
                      <Paragraph style={{ marginBottom: 8, fontSize: 14, lineHeight: 1.8, color: "var(--foreground)" }}>
                        {result.content}
                      </Paragraph>
                      {result.videoTitle && (
                        <Link href={`/analyze/${result.videoBvid}`} className="search-result-video-link">
                          <PlayCircleOutlined /> {result.videoTitle}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!searched && (
        <div className="search-empty-state">
          <div className="search-empty-icon">
            <ThunderboltOutlined />
          </div>
          <Text type="secondary" style={{ fontSize: 15 }}>输入关键词开始搜索你的知识库</Text>
          <div className="search-empty-hints">
            {["React", "机器学习", "系统设计"].map((hint) => (
              <Tag
                key={hint}
                className="search-hint-tag"
                onClick={() => { setQuery(hint); }}
              >
                {hint}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .search-page {
          max-width: 900px;
          margin: 0 auto;
          padding: 32px 24px;
        }
        .search-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .search-header-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(251, 114, 153, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fb7299;
          font-size: 18px;
        }
        .search-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .search-results {
          animation: fadeInUp 0.3s ease-out;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .search-results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .search-result-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.2s;
          animation: fadeInUp 0.4s ease-out both;
        }
        .search-result-card:hover {
          border-color: rgba(251, 114, 153, 0.25);
          box-shadow: 0 4px 16px rgba(251, 114, 153, 0.06);
        }
        .search-result-video-link {
          font-size: 12px;
          color: var(--muted-foreground);
          text-decoration: none;
          transition: color 0.2s;
        }
        .search-result-video-link:hover {
          color: #fb7299;
        }
        .search-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 80px 0;
        }
        .search-empty-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: rgba(76, 201, 240, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: #4cc9f0;
        }
        .search-empty-hints {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        .search-hint-tag {
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 8px;
        }
        .search-hint-tag:hover {
          border-color: #fb7299;
          color: #fb7299;
        }
      `}</style>
    </div>
  );
}
