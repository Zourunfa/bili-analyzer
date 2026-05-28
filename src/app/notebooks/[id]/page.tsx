"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Card, Typography, Space, Tag, Button, Spin, Empty, Row, Col, Divider, message, Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, PlayCircleOutlined, ExportOutlined, DeleteOutlined,
  FileTextOutlined, CheckCircleOutlined, LoadingOutlined, DownloadOutlined,
  FolderOpenOutlined, ShareAltOutlined, LinkOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import JSZip from "jszip";

const { Title, Text } = Typography;

interface NotebookVideo {
  id: string;
  notes: string | null;
  order: number;
  video: {
    id: string;
    bvid: string;
    title: string;
    pic: string | null;
    ownerName: string;
    duration: number;
    summary: string | null;
  };
}

interface Notebook {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  mode: "manual" | "smart";
  videoCount: number;
  videos: NotebookVideo[];
}

interface NotebookShareInfo {
  shareId: string;
  visibility: string;
  url: string;
}

interface ExportResult {
  folderName: string;
  files: Record<string, string>;
  stats: { videos: number; knowledgePoints: number };
}

type ExportStep = "collect" | "metadata" | "generate" | "package" | "done";

const STEPS: { key: ExportStep; title: string; desc?: string }[] = [
  { key: "collect", title: "收集知识点" },
  { key: "metadata", title: "生成元数据" },
  { key: "generate", title: "AI 生成指令层", desc: "正在调用 AI 生成指令内容，预计需要 10-30 秒..." },
  { key: "package", title: "打包文件" },
  { key: "done", title: "导出完成" },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function NotebookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [shareInfo, setShareInfo] = useState<NotebookShareInfo | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareBlockReason, setShareBlockReason] = useState<string | null>(null);

  // Drawer 状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<ExportStep>("collect");
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [previewTab, setPreviewTab] = useState<string>("SKILL.md");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchNotebook();
    }
  }, [status, router]);

  const fetchNotebook = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotebook(data.notebook);
        fetchShareStatus();
      } else {
        message.error("笔记本不存在");
        router.push("/notebooks");
      }
    } catch {
      message.error("获取失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchShareStatus = async () => {
    try {
      const res = await fetch(`/api/share/notebooks/${params.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setShareInfo(data.share);
      setShareBlockReason(data.reason || null);
    } catch {
      setShareInfo(null);
    }
  };

  const handleCreateShare = async () => {
    if (!notebook) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/share/notebooks/${notebook.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "开启公开分享失败");
        return;
      }
      setShareInfo(data.share);
      setShareBlockReason(null);
      await navigator.clipboard.writeText(data.share.url);
      message.success("笔记本公开分享已开启，链接已复制");
    } catch {
      message.error("开启公开分享失败");
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareInfo?.url) return;
    await navigator.clipboard.writeText(shareInfo.url);
    message.success("分享链接已复制");
  };

  const handleDisableShare = async () => {
    if (!notebook) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/share/notebooks/${notebook.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "关闭公开分享失败");
        return;
      }
      setShareInfo(data.share);
      message.success("公开分享已关闭");
    } catch {
      message.error("关闭公开分享失败");
    } finally {
      setShareLoading(false);
    }
  };

  // Markdown 导出
  const handleExportMarkdown = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/skills/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookId: params.id, format: "markdown" }),
      });
      const data = await res.json();
      if (res.ok) {
        const blob = new Blob([data.content], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
        message.success("导出成功");
      } else {
        message.error(data.error || "导出失败");
      }
    } catch {
      message.error("导出失败");
    } finally {
      setExporting(false);
    }
  };

  // Skill 导出（带抽屉进度）
  const handleExportSkill = async () => {
    setDrawerOpen(true);
    setExportResult(null);
    setCurrentStep("collect");
    setPreviewTab("SKILL.md");

    await delay(400);
    setCurrentStep("metadata");
    await delay(300);
    setCurrentStep("generate");

    try {
      const res = await fetch("/api/skills/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookId: params.id, format: "skill-folder" }),
      });

      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "导出失败");
        setDrawerOpen(false);
        return;
      }

      setCurrentStep("package");
      await delay(300);

      setExportResult(data);
      setCurrentStep("done");
    } catch {
      message.error("导出失败");
      setDrawerOpen(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!exportResult) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(exportResult.folderName)!;
      for (const [path, content] of Object.entries(exportResult.files)) {
        folder.file(path, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportResult.folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      message.success("下载成功");
    } catch {
      message.error("打包失败");
    } finally {
      setExporting(false);
    }
  };

  const handleRemoveVideo = async (videoId: string) => {
    try {
      const res = await fetch(`/api/notebooks/${params.id}/videos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (res.ok) {
        message.success("已移除");
        fetchNotebook();
      }
    } catch {
      message.error("移除失败");
    }
  };

  const closeDrawer = () => setDrawerOpen(false);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!notebook) return null;

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const isSharePublic = shareInfo?.visibility === "public";
  const canCreateShare = notebook.mode === "manual" && notebook.videos.length > 0;

  return (
    <>
      {/* 主内容 */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>
        <div style={{ marginBottom: 24 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            type="text"
            onClick={() => router.push("/notebooks")}
            style={{ marginBottom: 12, color: "var(--muted-foreground)" }}
          >
            返回列表
          </Button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Title level={3} style={{ marginBottom: 4, color: "var(--foreground)" }}>{notebook.title}</Title>
              {notebook.description && <Text type="secondary">{notebook.description}</Text>}
              <div style={{ marginTop: 8 }}>
                <Tag color="blue">{notebook.videoCount} 个视频</Tag>
                {notebook.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
              </div>
            </div>
            <Space wrap>
              {isSharePublic ? (
                <>
                  <Button
                    type="primary"
                    icon={<LinkOutlined />}
                    onClick={handleCopyShareUrl}
                    className="notebook-share-main-btn"
                  >
                    复制公开分享
                  </Button>
                  <Button danger onClick={handleDisableShare} loading={shareLoading}>
                    关闭分享
                  </Button>
                </>
              ) : (
                <Tooltip title={canCreateShare ? "" : shareBlockReason || "当前笔记本暂不支持公开分享"}>
                  <Button
                    type="primary"
                    icon={<ShareAltOutlined />}
                    onClick={handleCreateShare}
                    loading={shareLoading}
                    disabled={!canCreateShare}
                    className="notebook-share-main-btn"
                  >
                    公开分享笔记本
                  </Button>
                </Tooltip>
              )}
              <Button icon={<ExportOutlined />} onClick={handleExportMarkdown} loading={exporting}>
                导出 Markdown
              </Button>
              <Button type="primary" icon={<ExportOutlined />} onClick={handleExportSkill}>
                导出 Skill
              </Button>
            </Space>
          </div>
        </div>

        <Divider style={{ margin: "16px 0" }} />

        {notebook.videos.length === 0 ? (
          <Empty description="还没有关联视频，去分析页面添加视频到这个笔记本" />
        ) : (
          <Row gutter={[16, 16]}>
            {notebook.videos.map((nv) => (
              <Col key={nv.id} xs={24} sm={12} md={8}>
                <Card
                  size="small"
                  hoverable
                  style={{ borderRadius: 10 }}
                  cover={
                    <div className="notebook-video-cover" style={{ width: "100%", aspectRatio: "16/9", background: "var(--card)", overflow: "hidden" }}>
                      {nv.video.pic ? (
                        <img
                          src={nv.video.pic}
                          alt={nv.video.title}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                          <PlayCircleOutlined style={{ fontSize: 32, color: "var(--muted-foreground)" }} />
                        </div>
                      )}
                    </div>
                  }
                  actions={[
                    <Link href={`/analyze/${nv.video.bvid}?notebookId=${params.id}`} key="analyze">
                      <FileTextOutlined /> 查看
                    </Link>,
                    <span key="remove" onClick={() => handleRemoveVideo(nv.video.id)} style={{ color: "#ff4d4f" }}>
                      <DeleteOutlined /> 移除
                    </span>,
                  ]}
                >
                  <Card.Meta
                    title={<Text ellipsis style={{ fontSize: 13 }}>{nv.video.title}</Text>}
                    description={
                      <Space size={8}>
                        <Tag>{nv.video.ownerName}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(nv.video.duration)}</Text>
                      </Space>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* 遮罩层 */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={closeDrawer} />
      )}

      {/* 右侧抽屉 */}
      <div className={`skill-drawer ${drawerOpen ? "open" : ""}`}>
        {/* 头部 */}
        <div className="skill-drawer-header">
          <div className="skill-drawer-header-title">
            <FolderOpenOutlined style={{ color: "#fb7299", fontSize: 18 }} />
            <Title level={4} style={{ margin: 0, color: "var(--foreground)" }}>导出 Skill</Title>
          </div>
          <Button type="text" onClick={closeDrawer} style={{ color: "var(--muted-foreground)" }}>关闭</Button>
        </div>

        {/* 内容 */}
        <div className="skill-drawer-body">
          {/* 进度步骤 */}
          <div style={{ marginBottom: 32 }}>
            {STEPS.map((step, i) => {
              const isActive = step.key === currentStep;
              const isCompleted = i < stepIndex;
              return (
                <div
                  key={step.key}
                  className={`export-step ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                >
                  <div className={`export-step-icon ${isCompleted ? "done" : isActive ? "running" : ""}`}>
                    {isCompleted ? <CheckCircleOutlined /> : isActive && step.key === "generate" ? <LoadingOutlined spin /> : <span>{i + 1}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="export-step-title" style={{
                      fontWeight: isActive ? 600 : isCompleted ? 500 : 400,
                      color: isCompleted ? "#34d399" : isActive ? "#fb7299" : "var(--muted-foreground)",
                    }}>
                      {step.title}
                    </div>
                    {isActive && step.desc && (
                      <Text type="secondary" style={{ fontSize: 12 }}>{step.desc}</Text>
                    )}
                  </div>
                  {isCompleted && (
                    <CheckCircleOutlined style={{ color: "#34d399", fontSize: 16 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* 导出完成 */}
          {currentStep === "done" && exportResult && (
            <>
              {/* 统计卡片 */}
              <div className="export-stats-card">
                <div className="export-stats-title">
                  <CheckCircleOutlined style={{ marginRight: 6 }} />
                  导出完成
                </div>
                <Space size={16}>
                  <Text type="secondary">{exportResult.stats.videos} 个视频</Text>
                  <Text type="secondary">{exportResult.stats.knowledgePoints} 个知识点</Text>
                  <Text type="secondary">{Object.keys(exportResult.files).length} 个文件</Text>
                </Space>
              </div>

              {/* 文件 Tab */}
              <div className="export-file-tabs">
                <div style={{ display: "flex", gap: 0 }}>
                  {Object.keys(exportResult.files).map((filename) => (
                    <button
                      key={filename}
                      onClick={() => setPreviewTab(filename)}
                      className={`export-file-tab ${previewTab === filename ? "active" : ""}`}
                    >
                      {filename.split("/").pop()}
                    </button>
                  ))}
                </div>
              </div>

              {/* 文件预览 */}
              <div className="export-preview">
                {exportResult.files[previewTab]}
              </div>
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className="skill-drawer-footer">
          <Button style={{ flex: 1 }} onClick={closeDrawer}>
            关闭
          </Button>
          {currentStep === "done" && exportResult && (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownloadZip}
              loading={exporting}
              style={{ flex: 1 }}
            >
              下载 ZIP
            </Button>
          )}
        </div>
      </div>

      <style jsx>{`
        :global(.notebook-share-main-btn) {
          min-height: 40px;
          font-weight: 700;
          box-shadow: 0 10px 24px rgba(251, 114, 153, 0.22);
        }
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          z-index: 999;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .skill-drawer {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 520px;
          background: #0e0e22;
          border-left: 1px solid var(--border);
          box-shadow: -8px 0 40px rgba(0, 0, 0, 0.4);
          z-index: 1000;
          transform: translateX(100%);
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .skill-drawer.open {
          transform: translateX(0);
        }
        .skill-drawer-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }
        .skill-drawer-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .skill-drawer-body {
          flex: 1;
          overflow: auto;
          padding: 24px;
        }
        .export-step {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          margin-bottom: 4px;
          border-radius: 8px;
          background: transparent;
          transition: all 0.3s;
        }
        .export-step.active {
          background: rgba(251, 114, 153, 0.08);
        }
        .export-step.completed {
          background: rgba(52, 211, 153, 0.06);
        }
        .export-step-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          background: var(--card);
          color: var(--muted-foreground);
          font-size: 14px;
          flex-shrink: 0;
          transition: all 0.3s;
        }
        .export-step-icon.done {
          background: #34d399;
          color: #fff;
        }
        .export-step-icon.running {
          background: #fb7299;
          color: #fff;
        }
        .export-stats-card {
          background: rgba(52, 211, 153, 0.08);
          border: 1px solid rgba(52, 211, 153, 0.2);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .export-stats-title {
          font-weight: 600;
          margin-bottom: 8px;
          color: #34d399;
        }
        .export-file-tabs {
          border-bottom: 1px solid var(--border);
          margin-bottom: 16px;
        }
        .export-file-tab {
          padding: 8px 16px;
          border: none;
          background: none;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          color: var(--muted-foreground);
          font-weight: 400;
          font-size: 13px;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .export-file-tab:hover {
          color: var(--foreground);
        }
        .export-file-tab.active {
          border-bottom-color: #fb7299;
          color: #fb7299;
          font-weight: 600;
        }
        .export-preview {
          background: #0a0a18;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          max-height: 400px;
          overflow: auto;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 12px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          color: #c8c8e0;
        }
        .skill-drawer-footer {
          padding: 16px 24px;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
          display: flex;
          gap: 12px;
        }
        @media (max-width: 600px) {
          .skill-drawer {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
