"use client";

import { useState, useEffect } from "react";
import {
  Card, Input, Button, Typography, Space, Row, Col, Checkbox, Spin, Progress, Empty, message, Avatar, Tag, Divider, Collapse,
} from "antd";
import { SearchOutlined, UserOutlined, PlayCircleOutlined, ThunderboltOutlined, LoadingOutlined, SettingOutlined, WarningOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Panel } = Collapse;

// localStorage keys
const LS_SESSDATA = "bilibili_sessdata";
const LS_DEDE_USERID = "bilibili_dede_userid";
const LS_BILI_JCT = "bilibili_bili_jct";

const { Title, Text, Paragraph } = Typography;

interface UPVideo {
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  play: number;
  created: number;
}

interface UPOwner {
  mid: string;
  name: string;
  face: string;
  sign: string;
  videoCount: number;
}

type AnalyzeProgressState = {
  completed: number;
  total: number;
  failed: number;
  skipped: number;
  succeeded: number;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN");
}

export default function UpownerPage() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [midInput, setMidInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [upowner, setUpowner] = useState<UPOwner | null>(null);
  const [videos, setVideos] = useState<UPVideo[]>([]);
  const [selectedBvids, setSelectedBvids] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<AnalyzeProgressState>({
    completed: 0, total: 0, failed: 0, skipped: 0, succeeded: 0,
  });

  // B站 Cookie 配置
  const [sessdata, setSessdata] = useState("");
  const [dedeUserId, setDedeUserId] = useState("");
  const [biliJct, setBiliJct] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 从 localStorage 恢复配置
  useEffect(() => {
    setSessdata(localStorage.getItem(LS_SESSDATA) || "");
    setDedeUserId(localStorage.getItem(LS_DEDE_USERID) || "");
    setBiliJct(localStorage.getItem(LS_BILI_JCT) || "");
  }, []);

  const saveSettings = () => {
    if (sessdata) localStorage.setItem(LS_SESSDATA, sessdata);
    else localStorage.removeItem(LS_SESSDATA);
    if (dedeUserId) localStorage.setItem(LS_DEDE_USERID, dedeUserId);
    else localStorage.removeItem(LS_DEDE_USERID);
    if (biliJct) localStorage.setItem(LS_BILI_JCT, biliJct);
    else localStorage.removeItem(LS_BILI_JCT);
    messageApi.success("Cookie 配置已保存");
  };

  const clearSettings = () => {
    localStorage.removeItem(LS_SESSDATA);
    localStorage.removeItem(LS_DEDE_USERID);
    localStorage.removeItem(LS_BILI_JCT);
    setSessdata("");
    setDedeUserId("");
    setBiliJct("");
    messageApi.info("本地 Cookie 已清空");
  };

  /** 构建带 B站 Cookie 的请求头 */
  const bilibiliHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (sessdata) h["x-bilibili-sessdata"] = sessdata;
    if (dedeUserId) h["x-bilibili-dede-userid"] = dedeUserId;
    if (biliJct) h["x-bilibili-bili-jct"] = biliJct;
    return h;
  };

  const handleSearch = async () => {
    if (!midInput.trim()) return;

    // 支持 URL 输入
    let mid = midInput.trim();
    const urlMatch = mid.match(/space\.bilibili\.com\/(\d+)/);
    if (urlMatch) mid = urlMatch[1];

    setLoading(true);
    try {
      const res = await fetch(`/api/upowner/videos?mid=${mid}&pageSize=30`, {
        headers: bilibiliHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setUpowner(data.upowner);
        setVideos(data.videos);
        setSelectedBvids(new Set());
      } else if (res.status === 401) {
        setSettingsOpen(true);
        messageApi.error(data.error || "登录态失效，请更新 SESSDATA 后重试");
      } else if (res.status === 429) {
        messageApi.error({
          content: "B站已限制当前 IP 访问（请求过于频繁）。请等待几分钟后重试，或部署到 Vercel 使用云端 IP。",
          duration: 8,
        });
      } else {
        messageApi.error(data.error || "获取失败");
      }
    } catch {
      messageApi.error("请求失败");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (all: boolean) => {
    if (!upowner) return;
    const bvidsToAnalyze = all ? videos.map((v) => v.bvid) : [...selectedBvids];
    if (bvidsToAnalyze.length === 0) {
      messageApi.warning("请先选择视频");
      return;
    }

    setAnalyzing(true);
    setAnalyzeProgress({
      completed: 0,
      total: bvidsToAnalyze.length,
      failed: 0,
      skipped: 0,
      succeeded: 0,
    });

    try {
      const res = await fetch("/api/upowner/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...bilibiliHeaders(),
        },
        body: JSON.stringify({ mid: upowner.mid, bvids: bvidsToAnalyze, all }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "分析失败");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "progress") {
                setAnalyzeProgress({
                  completed: Number(event.completed || 0),
                  total: Number(event.total || bvidsToAnalyze.length),
                  failed: Number(event.failed || 0),
                  skipped: Number(event.skipped || 0),
                  succeeded: Number(event.succeeded || 0),
                });
              } else if (event.type === "done") {
                const succeeded = typeof event.succeeded === "number"
                  ? event.succeeded
                  : Math.max(0, Number(event.completed || 0) - Number(event.failed || 0));
                const failed = Number(event.failed || 0);
                const skipped = Number(event.skipped || 0);
                setAnalyzeProgress({
                  completed: Number(event.completed || bvidsToAnalyze.length),
                  total: Number(event.total || bvidsToAnalyze.length),
                  failed,
                  skipped,
                  succeeded,
                });

                const summary = `分析完成！成功 ${succeeded}，跳过 ${skipped}，失败 ${failed}`;
                if (failed > 0) {
                  messageApi.warning(summary);
                  const failedReasons = Array.isArray(event.failedReasons) ? event.failedReasons : [];
                  if (failedReasons.length > 0) {
                    const reasonText = failedReasons
                      .map((item: { reason?: string; count?: number }) => `${item.reason || "未知错误"} x${item.count || 0}`)
                      .join("；");
                    messageApi.info({ content: `失败原因：${reasonText}`, duration: 10 });
                  }
                } else {
                  messageApi.success(summary);
                }
              }
            } catch { /* skip */ }
          }
        }
      } else {
        throw new Error("分析服务未返回可读流");
      }
    } catch (e) {
      messageApi.error(e instanceof Error ? e.message : "分析失败");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelect = (bvid: string) => {
    setSelectedBvids((prev) => {
      const next = new Set(prev);
      if (next.has(bvid)) next.delete(bvid);
      else next.add(bvid);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedBvids.size === videos.length) {
      setSelectedBvids(new Set());
    } else {
      setSelectedBvids(new Set(videos.map((v) => v.bvid)));
    }
  };

  return (
    <div className="upowner-page">
      {messageContextHolder}
      <div className="upowner-header">
        <div className="upowner-header-icon">
          <ThunderboltOutlined />
        </div>
        <Title level={3} style={{ margin: 0, color: "var(--foreground)" }}>UP主分析</Title>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        输入UP主的主页链接或 mid，查看其所有视频并批量分析
      </Paragraph>

      {/* B站 Cookie 配置 */}
      <Collapse
        ghost
        activeKey={settingsOpen ? ["settings"] : []}
        onChange={() => setSettingsOpen(!settingsOpen)}
        items={[{
          key: "settings",
          label: <span><SettingOutlined /> B站 Cookie 配置{sessdata ? " ✓" : ""}</span>,
          children: (
            <div style={{ padding: "8px 0" }}>
              <Space direction="vertical" style={{ width: "100%" }} size="middle">
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>SESSDATA（必填）</Text>
                  <Input.Password
                    value={sessdata}
                    onChange={(e) => setSessdata(e.target.value)}
                    placeholder="从浏览器 Cookie 中复制"
                    size="small"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>DedeUserID（选填）</Text>
                  <Input
                    value={dedeUserId}
                    onChange={(e) => setDedeUserId(e.target.value)}
                    placeholder="从浏览器 Cookie 中复制"
                    size="small"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>bili_jct（选填）</Text>
                  <Input
                    value={biliJct}
                    onChange={(e) => setBiliJct(e.target.value)}
                    placeholder="从浏览器 Cookie 中复制"
                    size="small"
                  />
                </div>
                <Space>
                  <Button size="small" type="primary" onClick={saveSettings}>保存</Button>
                  <Button size="small" onClick={clearSettings}>清空</Button>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    获取方法：浏览器登录 B站 → F12 → Application → Cookies → 分别复制三个值
                  </Text>
                </Space>
              </Space>
            </div>
          ),
        }]}
      />

      {/* 搜索栏 */}
      <div className="upowner-search-card">
        <Space.Compact style={{ width: "100%" }}>
          <Input
            size="large"
            value={midInput}
            onChange={(e) => setMidInput(e.target.value)}
            onPressEnter={handleSearch}
            placeholder="输入UP主主页链接或 mid，如 https://space.bilibili.com/12345"
            prefix={<SearchOutlined style={{ color: "var(--muted-foreground)" }} />}
            disabled={loading}
          />
          <Button type="primary" size="large" onClick={handleSearch} loading={loading}>
            查询
          </Button>
        </Space.Compact>
      </div>

      {/* UP主信息和视频列表 */}
      {upowner && (
        <>
          <div className="upowner-info-card">
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <Avatar size={64} src={upowner.face || undefined} icon={<UserOutlined />} className="upowner-avatar" />
              <div>
                <Title level={4} style={{ marginBottom: 4, color: "var(--foreground)" }}>{upowner.name}</Title>
                <Space>
                  <Tag color="blue">{upowner.videoCount} 个视频</Tag>
                  <Text type="secondary">mid: {upowner.mid}</Text>
                </Space>
                {upowner.sign && (
                  <Text type="secondary" style={{ display: "block", marginTop: 4, fontSize: 13 }}>{upowner.sign}</Text>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <Space>
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleAnalyze(true)}
                  loading={analyzing}
                  type="primary"
                >
                  全量分析
                </Button>
                <Button
                  onClick={() => handleAnalyze(false)}
                  loading={analyzing}
                  disabled={selectedBvids.size === 0}
                >
                  分析选中 ({selectedBvids.size})
                </Button>
              </Space>
            </div>
          </div>

          {/* 分析进度 */}
          {analyzing && (
            <div className="upowner-progress-card">
              <Progress
                percent={Math.round((analyzeProgress.completed / analyzeProgress.total) * 100)}
                status="active"
                strokeColor={{ from: "#fb7299", to: "#4cc9f0" }}
              />
              <Text type="secondary">
                已完成 {analyzeProgress.completed}/{analyzeProgress.total}
                {`，成功 ${analyzeProgress.succeeded}`}
                {analyzeProgress.skipped > 0 && `，跳过 ${analyzeProgress.skipped}`}
                {analyzeProgress.failed > 0 && `，失败 ${analyzeProgress.failed}`}
              </Text>
            </div>
          )}

          <div className="upowner-select-bar">
            <Checkbox
              checked={selectedBvids.size === videos.length && videos.length > 0}
              indeterminate={selectedBvids.size > 0 && selectedBvids.size < videos.length}
              onChange={toggleAll}
            >
              全选 ({videos.length} 个视频)
            </Checkbox>
          </div>

          <Row gutter={[16, 16]}>
            {videos.map((video, idx) => (
              <Col key={video.bvid} xs={24} sm={12} md={8} lg={6}>
                <div
                  className={`upowner-video-card ${selectedBvids.has(video.bvid) ? "selected" : ""}`}
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <div className="upowner-video-cover">
                    {video.pic ? (
                      <img
                        src={video.pic}
                        alt={video.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--muted-foreground)" }}>
                        <PlayCircleOutlined style={{ fontSize: 24 }} />
                      </div>
                    )}
                    <div className="upowner-video-duration">{formatDuration(video.duration)}</div>
                    <Checkbox
                      checked={selectedBvids.has(video.bvid)}
                      onChange={() => toggleSelect(video.bvid)}
                      className="upowner-video-check"
                    />
                  </div>
                  <div className="upowner-video-info">
                    <Text ellipsis style={{ fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{video.title}</Text>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(video.created)}</Text>
                    </div>
                    <Link href={`/analyze/${video.bvid}`} className="upowner-video-analyze">
                      <PlayCircleOutlined /> 分析
                    </Link>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </>
      )}

      {!upowner && !loading && (
        <div className="upowner-empty-state">
          <div className="upowner-empty-icon">
            <UserOutlined />
          </div>
          <Text type="secondary" style={{ fontSize: 15 }}>输入UP主信息开始查询</Text>
        </div>
      )}

      <style jsx>{`
        .upowner-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 24px;
        }
        .upowner-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .upowner-header-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(167, 139, 250, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #a78bfa;
          font-size: 18px;
        }
        .upowner-search-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .upowner-info-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .upowner-avatar {
          border: 2px solid rgba(251, 114, 153, 0.3);
        }
        .upowner-progress-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .upowner-select-bar {
          margin-bottom: 12px;
          padding: 8px 12px;
          border-radius: 8px;
          background: rgba(251, 114, 153, 0.04);
        }
        .upowner-video-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          animation: fadeInUp 0.4s ease-out both;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .upowner-video-card:hover {
          border-color: rgba(251, 114, 153, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(251, 114, 153, 0.08);
        }
        .upowner-video-card.selected {
          border-color: rgba(251, 114, 153, 0.4);
          box-shadow: 0 0 0 1px rgba(251, 114, 153, 0.15);
        }
        .upowner-video-cover {
          width: 100%;
          aspect-ratio: 16/9;
          background: #0a0a18;
          overflow: hidden;
          position: relative;
        }
        .upowner-video-duration {
          position: absolute;
          bottom: 6px;
          right: 6px;
          background: rgba(0, 0, 0, 0.7);
          color: #fff;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .upowner-video-check {
          position: absolute;
          top: 8px;
          left: 8px;
        }
        .upowner-video-info {
          padding: 10px 12px;
        }
        .upowner-video-analyze {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--muted-foreground);
          text-decoration: none;
          margin-top: 6px;
          transition: color 0.2s;
        }
        .upowner-video-analyze:hover {
          color: #fb7299;
        }
        .upowner-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 80px 0;
        }
        .upowner-empty-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: rgba(167, 139, 250, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: #a78bfa;
        }
      `}</style>
    </div>
  );
}
