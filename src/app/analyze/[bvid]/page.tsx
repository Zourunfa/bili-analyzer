"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Layout, Card, Tabs, Input, Button, Spin, Empty, Typography, Space, Tag, Divider, Progress, Modal, Select, message } from "antd";
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  ArrowLeftOutlined,
  LoadingOutlined,
  SaveOutlined,
  BookOutlined,
  PlusOutlined,
  HistoryOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { marked } from "marked";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

interface VideoInfo {
  title: string;
  pic: string;
  owner: { name: string };
  duration: number;
  desc: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface HistoryVideo {
  id: string;
  bvid: string;
  title: string;
  pic: string | null;
  ownerName: string;
  duration: number;
  subtitleText: string;
  summary: string | null;
  createdAt: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AnalyzePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const bvid = params.bvid as string;
  const cid = searchParams.get("cid");
  const isHistoryMode = bvid === "history";

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [subtitleText, setSubtitleText] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "chat">("summary");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStep, setTranscribeStep] = useState<string>("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSize, setDownloadSize] = useState("");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [notebooks, setNotebooksList] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [creating, setCreating] = useState(false);

  // 顶部链接输入框
  const [headerUrl, setHeaderUrl] = useState("");
  const [headerLoading, setHeaderLoading] = useState(false);

  const handleHeaderSubmit = async () => {
    if (!headerUrl.trim() || headerLoading) return;
    setHeaderLoading(true);
    try {
      const res = await fetch("/api/video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: headerUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "获取视频信息失败");
        return;
      }
      router.push(`/analyze/${data.bvid}?cid=${data.cid}`);
    } catch {
      message.error("网络错误，请重试");
    } finally {
      setHeaderLoading(false);
    }
  };

  // 侧边栏历史视频
  const [sidebarTab, setSidebarTab] = useState<"subtitle" | "history">(isHistoryMode ? "history" : "subtitle");
  const [historyVideos, setHistoryVideos] = useState<HistoryVideo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyKeyword, setHistoryKeyword] = useState("");

  const videoInfoRef = useRef<VideoInfo | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 刷新历史视频列表
  const refreshHistory = useCallback(() => {
    fetch("/api/videos?pageSize=50&sort=createdAt_desc")
      .then((r) => r.json())
      .then((data) => {
        if (data.videos) setHistoryVideos(data.videos);
      })
      .catch(() => { /* 静默 */ });
  }, []);

  // 切换到历史 Tab 时加载视频列表
  useEffect(() => {
    if (sidebarTab !== "history") return;
    setHistoryLoading(true);
    fetch("/api/videos?pageSize=50&sort=createdAt_desc")
      .then((r) => r.json())
      .then((data) => {
        if (data.videos) setHistoryVideos(data.videos);
      })
      .catch(() => { /* 静默 */ })
      .finally(() => setHistoryLoading(false));
  }, [sidebarTab]);

  // 点击历史视频：加载分析数据
  const handleSelectHistoryVideo = async (video: HistoryVideo) => {
    const info: VideoInfo = {
      title: video.title,
      pic: video.pic || "",
      owner: { name: video.ownerName },
      duration: video.duration,
      desc: "",
    };
    setVideoInfo(info);
    videoInfoRef.current = info;
    setSubtitleText(video.subtitleText || "");
    setSummary(video.summary || "");
    setMessages([]);
    setSidebarTab("subtitle");
    router.replace(`/analyze/${video.bvid}`);
  };

  // 前端过滤历史视频
  const filteredHistory = historyKeyword
    ? historyVideos.filter(
        (v) =>
          v.title.toLowerCase().includes(historyKeyword.toLowerCase()) ||
          v.ownerName.toLowerCase().includes(historyKeyword.toLowerCase())
      )
    : historyVideos;

  // 自动保存视频记录到数据库（字幕 + 摘要），info 参数避免闭包陷阱
  const autoSaveVideo = async (info: VideoInfo, text: string, source: string, summaryText: string) => {
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bvid,
          title: info.title,
          pic: info.pic,
          desc: info.desc,
          duration: info.duration,
          ownerName: info.owner.name,
          ownerMid: "",
          cid: Number(cid),
          subtitleText: text,
          subtitleSource: source,
          summary: summaryText,
        }),
      });
      if (res.ok && sidebarTab === "history") {
        refreshHistory();
      }
    } catch { /* 静默 */ }
  };

  // 生成 AI 摘要（流式），返回最终的摘要文本
  const generateSummary = async (text: string): Promise<string> => {
    setSummaryLoading(true);
    let result = "";
    try {
      const sumRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleText: text }),
      });
      if (!sumRes.ok) {
        setError("生成摘要失败");
        return result;
      }
      const reader = sumRes.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setSummary(acc);
        }
        result = acc;
      }
    } catch {
      setError("生成摘要失败");
    } finally {
      setSummaryLoading(false);
    }
    return result;
  };

  // 获取视频信息 + 字幕/摘要（优先从数据库加载已有数据）
  useEffect(() => {
    if (!bvid || isHistoryMode) return;

    let cancelled = false;

    (async () => {
      // 先查数据库，看是否已有完整的分析数据
      try {
        const dbRes = await fetch(`/api/videos?bvid=${bvid}`);
        if (dbRes.ok && !cancelled) {
          const dbData = await dbRes.json();
          if (dbData.video && dbData.video.subtitleText) {
            // 数据库有完整数据，直接使用
            const v = dbData.video;
            setVideoInfo({
              title: v.title,
              pic: v.pic || "",
              owner: { name: v.ownerName },
              duration: v.duration,
              desc: v.desc || "",
            });
            videoInfoRef.current = {
              title: v.title,
              pic: v.pic || "",
              owner: { name: v.ownerName },
              duration: v.duration,
              desc: v.desc || "",
            };
            setSubtitleText(v.subtitleText);
            if (v.summary) {
              setSummary(v.summary);
            }
            // 如果没有摘要但有字幕，触发摘要生成
            if (!v.summary && v.subtitleText) {
              const summaryText = await generateSummary(v.subtitleText);
              autoSaveVideo(videoInfoRef.current!, v.subtitleText, v.subtitleSource || "cc", summaryText);
            }
            return; // 数据库数据加载完毕，无需再走在线流程
          }
        }
      } catch { /* 查库失败，继续走在线流程 */ }

      if (cancelled) return;

      // 数据库无数据，走在线获取流程
      // 1. 获取视频信息
      try {
        const infoRes = await fetch("/api/video-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: bvid }),
        });
        const infoData = await infoRes.json();
        if (infoData.error) {
          setError(infoData.error);
          return;
        }
        if (!cancelled) {
          setVideoInfo(infoData);
          videoInfoRef.current = infoData;
        }
      } catch {
        setError("获取视频信息失败");
        return;
      }

      if (cancelled) return;

      // 2. 如果有 cid，获取字幕并生成摘要
      if (!cid) return;

      try {
        const subRes = await fetch("/api/subtitle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bvid, cid: Number(cid) }),
        });
        const subData = await subRes.json();
        if (subData.error) {
          setError(subData.error);
          return;
        }

        // 有 CC 字幕，直接走摘要
        if (subData.subtitleSource === "cc") {
          setSubtitleText(subData.text);
          const summaryText = await generateSummary(subData.text);
          autoSaveVideo(videoInfoRef.current!, subData.text, "cc", summaryText);
          return;
        }

        // 无 CC 字幕，走语音转写（SSE 流式获取进度）
        if (subData.subtitleSource === "none") {
          setTranscribing(true);
          setTranscribeStep("正在下载音频...");
          setDownloadProgress(0);
          setDownloadSize("");
          setSummaryLoading(true);

          const transRes = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bvid, cid: Number(cid) }),
          });

          const reader = transRes.body?.getReader();
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
                    setDownloadProgress(event.percent);
                    setDownloadSize(`${event.downloaded} / ${event.total} MB`);
                    setTranscribeStep(`正在下载音频 ${event.percent}%`);
                  } else if (event.type === "status") {
                    setTranscribeStep(event.message);
                  } else if (event.type === "error") {
                    setError("语音转写失败：" + event.error);
                    setTranscribing(false);
                    setSummaryLoading(false);
                    return;
                  } else if (event.type === "done") {
                    const transData = event.data;
                    setTranscribeStep("转写完成，正在生成摘要...");
                    setSubtitleText(transData.text);
                    setTranscribing(false);
                    const summaryText = await generateSummary(transData.text);
                    autoSaveVideo(videoInfoRef.current!, transData.text, "transcribe", summaryText);
                  }
                } catch { /* skip invalid JSON */ }
              }
            }
          }
        }
      } catch {
        setError("处理失败，请重试");
        setSummaryLoading(false);
        setTranscribing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [bvid, cid]);

  const handleChat = useCallback(
    async (e: { preventDefault: () => void }) => {
      e.preventDefault();
      if (!chatInput.trim() || chatLoading) return;

      const userMsg: Message = { role: "user", content: chatInput.trim() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setChatInput("");
      setChatLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            subtitleText,
          }),
        });

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "抱歉，回复失败，请重试。" },
          ]);
          setChatLoading(false);
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + chunk,
              };
              return updated;
            });
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "网络错误，请重试。" },
        ]);
      } finally {
        setChatLoading(false);
      }
    },
    [chatInput, chatLoading, messages, subtitleText]
  );

  if (error) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <Card style={{ maxWidth: 480 }}>
          <Text type="danger">{error}</Text>
          <div style={{ marginTop: 16 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => (window.location.href = "/")}>
              返回首页
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const quickQuestions = [
    "视频的核心观点是什么？",
    "总结视频的主要内容",
    "视频中提到了哪些关键时间点？",
  ];

  // 新建笔记本
  const handleCreateNotebook = async () => {
    if (!newNotebookTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newNotebookTitle.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotebooksList((prev) => [data.notebook, ...prev]);
        setSelectedNotebook(data.notebook.id);
        setNewNotebookTitle("");
        message.success("笔记本已创建");
      } else {
        message.error("创建失败");
      }
    } catch {
      message.error("创建失败");
    } finally {
      setCreating(false);
    }
  };

  // 打开保存弹窗时获取笔记本列表
  const handleOpenSaveModal = async () => {
    try {
      const res = await fetch("/api/notebooks");
      if (res.ok) {
        const data = await res.json();
        setNotebooksList(data.notebooks || []);
      }
    } catch { /* 忽略 */ }
    setSaveModalOpen(true);
  };

  // 保存视频到笔记本
  const handleSaveToNotebook = async () => {
    if (!selectedNotebook || !videoInfo) return;
    setSaving(true);
    try {
      // 先保存视频到数据库
      const videoRes = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bvid,
          title: videoInfo.title,
          pic: videoInfo.pic,
          desc: videoInfo.desc,
          duration: videoInfo.duration,
          ownerName: videoInfo.owner.name,
          ownerMid: "",
          cid: Number(cid),
          subtitleText,
          subtitleSource: "cc",
          summary,
        }),
      });
      const videoData = await videoRes.json();

      // 关联到笔记本
      await fetch(`/api/notebooks/${selectedNotebook}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: videoData.video.id }),
      });

      message.success("已保存到笔记本");
      setSaveModalOpen(false);
      setNewNotebookTitle("");

      // 异步触发知识提取
      fetch("/api/knowledge/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bvid }),
      }).catch(() => { /* 后台处理，不阻塞 */ });
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout style={{ height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* Header */}
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          background: "transparent",
          borderBottom: "1px solid var(--border)",
          height: 52,
          lineHeight: "52px",
        }}
      >
        <Link href="/" style={{ fontWeight: 700, fontSize: 16, color: "#fb7299", display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowLeftOutlined /> {isHistoryMode ? "历史分析" : "B站视频分析"}
        </Link>
        {videoInfo && (
          <Text type="secondary" ellipsis style={{ maxWidth: 240, fontSize: 13 }}>
            {videoInfo.title}
          </Text>
        )}
        <div style={{ flex: 1 }} />
        <Space.Compact style={{ maxWidth: 380, flex: 1 }}>
          <Input
            size="small"
            value={headerUrl}
            onChange={(e) => setHeaderUrl(e.target.value)}
            onPressEnter={handleHeaderSubmit}
            placeholder="粘贴视频链接，开始新分析..."
            prefix={<SearchOutlined style={{ color: "var(--muted-foreground)", fontSize: 12 }} />}
            disabled={headerLoading}
            allowClear
          />
          <Button
            size="small"
            type="primary"
            onClick={handleHeaderSubmit}
            loading={headerLoading}
            disabled={!headerUrl.trim()}
          >
            分析
          </Button>
        </Space.Compact>
        <div style={{ flex: 1 }} />
        <Button
          icon={<SaveOutlined style={{ color: "bisque" }}/>}
          onClick={handleOpenSaveModal}
          disabled={!subtitleText || !summary}
          style={{ borderColor: "#fb7299",   color: "azure" }}
        >
          保存到笔记本
        </Button>
      </Header>

      <Layout style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Left Sidebar: Video Info + Tabs (字幕/历史) */}
        <Sider
          width={360}
          style={{
            background: "transparent",
            borderRight: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          {/* Video Card */}
          {videoInfo && (
            <div style={{ padding: 16 }}>
              <Card
                size="small"
                cover={
                  <div style={{ width: "100%", aspectRatio: "16/9", background: "var(--card)", borderRadius: 8, overflow: "hidden" }}>
                    <img
                      src={videoInfo.pic}
                      alt={videoInfo.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                }
                styles={{ body: { padding: "12px 0 0" } }}
              >
                <Title level={5} style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.4 }}>
                  {videoInfo.title}
                </Title>
                <Space size={8}>
                  <Tag color="blue">{videoInfo.owner.name}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <PlayCircleOutlined /> {formatDuration(videoInfo.duration)}
                  </Text>
                </Space>
              </Card>
            </div>
          )}

          <Divider style={{ margin: 0 }} />

          {/* 字幕 / 历史 Tab */}
          <Tabs
            activeKey={sidebarTab}
            onChange={(key) => setSidebarTab(key as "subtitle" | "history")}
            style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
            items={[
              {
                key: "subtitle",
                label: <span><FileTextOutlined /> 字幕</span>,
                children: (
                  <div
                    style={{
                      height: "100%",
                      overflowY: "auto",
                      padding: "0 16px 16px",
                      fontSize: 12,
                      color: "var(--muted-foreground)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.8,
                    }}
                  >
                    {subtitleText || "加载中..."}
                  </div>
                ),
              },
              {
                key: "history",
                label: <span><HistoryOutlined /> 历史</span>,
                children: (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "8px 12px", flexShrink: 0 }}>
                      <Input
                        size="small"
                        placeholder="搜索标题或UP主..."
                        prefix={<SearchOutlined />}
                        allowClear
                        value={historyKeyword}
                        onChange={(e) => setHistoryKeyword(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      {historyLoading ? (
                        <div style={{ textAlign: "center", padding: 32 }}>
                          <Spin size="small" />
                        </div>
                      ) : filteredHistory.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={<Text type="secondary">{historyKeyword ? "没有匹配的视频" : "还没有分析过视频"}</Text>}
                          style={{ padding: "24px 0" }}
                        />
                      ) : (
                        <div style={{ padding: "0 12px 12px" }}>
                          {filteredHistory.map((v) => (
                            <div
                              key={v.id}
                              className={`history-item ${v.bvid === bvid ? "history-item-active" : ""}`}
                              onClick={() => handleSelectHistoryVideo(v)}
                            >
                              <div className="history-item-cover">
                                {v.pic ? (
                                  <img src={v.pic} alt={v.title} />
                                ) : (
                                  <div className="history-item-placeholder">
                                    <PlayCircleOutlined />
                                  </div>
                                )}
                                <span className="history-item-duration">{formatDuration(v.duration)}</span>
                              </div>
                              <div className="history-item-info">
                                <div className="history-item-title">{v.title}</div>
                                <div className="history-item-owner">{v.ownerName}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Sider>

        {/* Right Content: Summary + Chat */}
        <Content style={{ display: "flex", flexDirection: "column", background: "transparent", overflow: "hidden", minHeight: 0 }}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as "summary" | "chat")}
            style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
            items={[
              {
                key: "summary",
                label: (
                  <span>
                    <RobotOutlined /> AI 摘要
                  </span>
                ),
                children: (
                  <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
                    {isHistoryMode && !videoInfo ? (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<Text type="secondary">从左侧历史列表中选择一个视频查看摘要</Text>}
                        style={{ paddingTop: 80 }}
                      />
                    ) : summaryLoading && !summary ? (
                      <div style={{ textAlign: "center", padding: 48 }}>
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                        <div style={{ marginTop: 12, color: "var(--muted-foreground)" }}>
                          {transcribing ? transcribeStep : "正在生成摘要..."}
                        </div>
                        {transcribing && downloadProgress > 0 && (
                          <div style={{ maxWidth: 320, margin: "16px auto 0" }}>
                            <Progress percent={downloadProgress} size="small" />
                            {downloadSize && (
                              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{downloadSize}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{
                          __html: marked.parse(summary.replace(/<br\s*\/?>/gi, "\n")) +
                            (summaryLoading
                              ? '<span class="cursor-blink"></span>'
                              : ""),
                        }}
                      />
                    )}
                  </div>
                ),
              },
              {
                key: "chat",
                label: (
                  <span>
                    <MessageOutlined /> 对话
                  </span>
                ),
                children: (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                    {/* Chat Messages */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", minHeight: 0 }}>
                      {messages.length === 0 ? (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            <Space direction="vertical" size={8}>
                              <Text type="secondary">基于字幕内容对话</Text>
                              <Space wrap>
                                {quickQuestions.map((q) => (
                                  <Tag
                                    key={q}
                                    style={{ cursor: "pointer" }}
                                    color="processing"
                                    onClick={() => setChatInput(q)}
                                  >
                                    {q}
                                  </Tag>
                                ))}
                              </Space>
                            </Space>
                          }
                        />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {messages.map((msg, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  maxWidth: "80%",
                                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                                }}
                              >
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "50%",
                                    background: msg.role === "user" ? "#fb7299" : "rgba(255,255,255,0.06)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    color: msg.role === "user" ? "#fff" : "var(--muted-foreground)",
                                    fontSize: 14,
                                  }}
                                >
                                  {msg.role === "user" ? <UserOutlined /> : <RobotOutlined />}
                                </div>
                                <div
                                  style={{
                                    background: msg.role === "user" ? "#fb7299" : "var(--card)",
                                    color: msg.role === "user" ? "#fff" : "var(--foreground)",
                                    padding: "10px 16px",
                                    borderRadius: 12,
                                    fontSize: 14,
                                    lineHeight: 1.7,
                                    borderTopRightRadius: msg.role === "user" ? 4 : 12,
                                    borderTopLeftRadius: msg.role === "assistant" ? 4 : 12,
                                  }}
                                >
                                  {msg.role === "assistant" ? (
                                    <ReactMarkdown>{msg.content.replace(/<br\s*\/?>/gi, "\n\n")}</ReactMarkdown>
                                  ) : (
                                    msg.content
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                          {chatLoading && messages[messages.length - 1]?.role === "user" && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "rgba(255,255,255,0.06)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "var(--muted-foreground)",
                                }}
                              >
                                <RobotOutlined />
                              </div>
                              <div
                                style={{
                                  background: "var(--card)",
                                  padding: "10px 16px",
                                  borderRadius: 12,
                                  borderTopLeftRadius: 4,
                                  color: "var(--muted-foreground)",
                                  fontSize: 13,
                                }}
                              >
                                <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} />} size="small" />
                                <span style={{ marginLeft: 8 }}>思考中...</span>
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>
                      )}
                    </div>

                    {/* Chat Input */}
                    <div
                      style={{
                        flexShrink: 0,
                        borderTop: "1px solid var(--border)",
                        padding: 16,
                        display: "flex",
                        gap: 12,
                        background: "var(--background)",
                      }}
                    >
                      <Input
                        size="large"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onPressEnter={handleChat}
                        placeholder="输入你的问题..."
                        disabled={chatLoading || !subtitleText}
                      />
                      <Button
                        type="primary"
                        size="large"
                        icon={<SendOutlined />}
                        onClick={handleChat}
                        disabled={chatLoading || !chatInput.trim()}
                      >
                        发送
                      </Button>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Content>
      </Layout>

      {/* 保存到笔记本弹窗 */}
      <Modal
        title={<span><BookOutlined /> 保存到笔记本</span>}
        open={saveModalOpen}
        onCancel={() => setSaveModalOpen(false)}
        onOk={handleSaveToNotebook}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        okButtonProps={{ disabled: !selectedNotebook }}
      >
        <div style={{ margin: "16px 0", color: "var(--foreground)" }}>
          <div style={{ marginBottom: 12, color: "var(--muted-foreground)", fontSize: 14 }}>
            选择一个笔记本保存此视频的分析结果：
          </div>
          <Select
            style={{ width: "100%" }}
            placeholder="选择笔记本"
            value={selectedNotebook}
            onChange={setSelectedNotebook}
            options={notebooks.map((nb) => ({ value: nb.id, label: nb.title }))}
            notFoundContent={
              <div style={{ textAlign: "center", padding: 8 }}>
                <Text type="secondary">暂无笔记本，在下方新建一个</Text>
              </div>
            }
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Input
              placeholder="新建笔记本名称..."
              value={newNotebookTitle}
              onChange={(e) => setNewNotebookTitle(e.target.value)}
              onPressEnter={handleCreateNotebook}
              size="small"
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              loading={creating}
              onClick={handleCreateNotebook}
              disabled={!newNotebookTitle.trim()}
            >
              新建
            </Button>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .cursor-blink {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #fb7299;
          animation: blink 1s infinite;
          vertical-align: middle;
          margin-left: 2px;
        }
        .ant-layout-sider { position: static !important; }
        .ant-layout-sider-children { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        .subtitle-scroll { flex: 1; min-height: 0; overflow-y: auto; }

        /* Sidebar Tabs - ensure full height and proper tab switching */
        .ant-layout-sider .ant-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .ant-layout-sider .ant-tabs-nav { padding: 0 12px; margin-bottom: 0; flex-shrink: 0; }
        .ant-layout-sider .ant-tabs-tab { padding: 8px 12px; font-size: 13px; }
        .ant-layout-sider .ant-tabs-content-holder { flex: 1; overflow: hidden; min-height: 0; }
        .ant-layout-sider .ant-tabs-content { height: 100%; }
        .ant-layout-sider .ant-tabs-tabpane { height: 100%; overflow-y: auto; }
        .ant-layout-sider .ant-tabs-tabpane-hidden { display: none !important; }

        /* History list items */
        .history-item {
          display: flex;
          gap: 10px;
          padding: 8px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 4px;
        }
        .history-item:hover {
          background: rgba(251, 114, 153, 0.06);
        }
        .history-item-active {
          background: rgba(251, 114, 153, 0.1);
          border: 1px solid rgba(251, 114, 153, 0.2);
        }
        .history-item-cover {
          position: relative;
          width: 96px;
          min-width: 96px;
          aspect-ratio: 16/9;
          border-radius: 6px;
          overflow: hidden;
          background: rgba(0,0,0,0.2);
        }
        .history-item-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .history-item-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted-foreground);
          font-size: 18px;
        }
        .history-item-duration {
          position: absolute;
          bottom: 2px;
          right: 4px;
          background: rgba(0,0,0,0.75);
          color: #fff;
          font-size: 10px;
          padding: 0 4px;
          border-radius: 3px;
          line-height: 1.6;
        }
        .history-item-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
        }
        .history-item-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.3;
        }
        .history-item-owner {
          font-size: 11px;
          color: var(--muted-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ant-tabs { display: flex; flex-direction: column; height: 100%; }
        .ant-tabs-content-holder { flex: 1; overflow: hidden; display: flex; }
        .ant-tabs-content { flex: 1; display: flex; flex-direction: column; height: 100%; }
        .ant-tabs-tabpane { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

        /* Tab bar styles */
        .ant-tabs-nav { padding: 0 24px; border-bottom: 1px solid var(--border); margin-bottom: 0; }
        .ant-tabs-tab { padding: 12px 20px; font-size: 14px; transition: all 0.2s; border-radius: 8px 8px 0 0; }
        .ant-tabs-tab + .ant-tabs-tab { margin-left: 4px; }
        .ant-tabs-tab .anticon { margin-right: 6px; color: var(--muted-foreground); transition: color 0.2s; }
        .ant-tabs-tab:hover { color: #fb7299; background: rgba(251,114,153,0.06); }
        .ant-tabs-tab:hover .anticon { color: #fb7299; }
        .ant-tabs-tab-active .anticon { color: #fb7299; }
        .ant-tabs-tab-active { font-weight: 600; }
        .ant-tabs-ink-bar { height: 3px; border-radius: 2px; background: #fb7299; }

        .markdown-body {
          font-size: 14px;
          line-height: 1.8;
          color: var(--foreground);
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3,
        .markdown-body h4, .markdown-body h5, .markdown-body h6 {
          margin-top: 20px;
          margin-bottom: 10px;
          font-weight: 600;
          line-height: 1.4;
        }
        .markdown-body h1 { font-size: 20px; }
        .markdown-body h2 { font-size: 17px; }
        .markdown-body h3 { font-size: 15px; }
        .markdown-body p {
          margin-bottom: 12px;
        }
        .markdown-body ul, .markdown-body ol {
          padding-left: 20px;
          margin-bottom: 12px;
        }
        .markdown-body li {
          margin-bottom: 6px;
        }
        .markdown-body strong {
          font-weight: 600;
          color: var(--foreground);
        }
        .markdown-body blockquote {
          margin: 12px 0;
          padding: 8px 16px;
          border-left: 3px solid #fb7299;
          background: rgba(255,255,255,0.04);
          color: #666;
        }
        .markdown-body code {
          background: var(--border);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
        }
        .markdown-body hr {
          margin: 16px 0;
          border: none;
          border-top: 1px solid var(--border);
        }
      `}</style>
    </Layout>
  );
}
