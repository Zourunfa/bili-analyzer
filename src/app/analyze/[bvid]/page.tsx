"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Layout, Card, Tabs, Input, Button, Spin, Empty, Typography, Space, Tag, Divider, Progress } from "antd";
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  ArrowLeftOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { marked } from "marked";

const { Header, Sider, Content } = Layout;
const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AnalyzePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const bvid = params.bvid as string;
  const cid = searchParams.get("cid");

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

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 生成 AI 摘要（流式）
  const generateSummary = async (text: string) => {
    setSummaryLoading(true);
    try {
      const sumRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitleText: text }),
      });
      if (!sumRes.ok) {
        setError("生成摘要失败");
        return;
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
      }
    } catch {
      setError("生成摘要失败");
    } finally {
      setSummaryLoading(false);
    }
  };

  // 获取视频信息
  useEffect(() => {
    if (!bvid) return;
    fetch("/api/video-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: bvid }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setVideoInfo(data);
      })
      .catch(() => setError("获取视频信息失败"));
  }, [bvid]);

  // 获取字幕 + 生成摘要
  useEffect(() => {
    if (!bvid || !cid) return;

    (async () => {
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
          await generateSummary(subData.text);
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

              // 解析 SSE 行
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
                    await generateSummary(transData.text);
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
  }, [bvid, cid]);

  const handleChat = useCallback(
    async (e: React.FormEvent) => {
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

  return (
    <Layout style={{ height: "100vh" }}>
      {/* Header */}
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 24px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          height: 52,
          lineHeight: "52px",
        }}
      >
        <a href="/" style={{ fontWeight: 700, fontSize: 16, color: "#1677ff", display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowLeftOutlined /> B站视频分析
        </a>
        {videoInfo && (
          <Text type="secondary" ellipsis style={{ maxWidth: 400, fontSize: 13 }}>
            {videoInfo.title}
          </Text>
        )}
      </Header>

      <Layout style={{ flex: 1, overflow: "hidden" }}>
        {/* Left Sidebar: Video Info + Subtitle */}
        <Sider
          width={360}
          style={{
            background: "#fff",
            borderRight: "1px solid #f0f0f0",
            overflow: "hidden",
          }}
        >
          {/* Video Card */}
          {videoInfo && (
            <div style={{ padding: 16 }}>
              <Card
                size="small"
                cover={
                  <div style={{ width: "100%", aspectRatio: "16/9", background: "#f5f5f5", borderRadius: 8, overflow: "hidden" }}>
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

          <div style={{ padding: "12px 16px 8px" }}>
            <Text strong style={{ fontSize: 13 }}>
              <FileTextOutlined /> 字幕内容
            </Text>
          </div>
          <div
            className="subtitle-scroll"
            style={{
              flex: 1,
              overflowY: "auto",
              minHeight: 0,
              padding: "0 16px 16px",
              fontSize: 12,
              color: "#999",
              whiteSpace: "pre-wrap",
              lineHeight: 1.8,
            }}
          >
            {subtitleText || "加载中..."}
          </div>
        </Sider>

        {/* Right Content: Summary + Chat */}
        <Content style={{ display: "flex", flexDirection: "column", background: "#fff" }}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as "summary" | "chat")}
            style={{ flex: "0 0 auto" }}
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
                    {summaryLoading && !summary ? (
                      <div style={{ textAlign: "center", padding: 48 }}>
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                        <div style={{ marginTop: 12, color: "#999" }}>
                          {transcribing ? transcribeStep : "正在生成摘要..."}
                        </div>
                        {transcribing && downloadProgress > 0 && (
                          <div style={{ maxWidth: 320, margin: "16px auto 0" }}>
                            <Progress percent={downloadProgress} size="small" />
                            {downloadSize && (
                              <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>{downloadSize}</div>
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
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    {/* Chat Messages */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
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
                                    background: msg.role === "user" ? "#1677ff" : "#f0f0f0",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    color: msg.role === "user" ? "#fff" : "#999",
                                    fontSize: 14,
                                  }}
                                >
                                  {msg.role === "user" ? <UserOutlined /> : <RobotOutlined />}
                                </div>
                                <div
                                  style={{
                                    background: msg.role === "user" ? "#1677ff" : "#f5f5f5",
                                    color: msg.role === "user" ? "#fff" : "#333",
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
                                  background: "#f0f0f0",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#999",
                                }}
                              >
                                <RobotOutlined />
                              </div>
                              <div
                                style={{
                                  background: "#f5f5f5",
                                  padding: "10px 16px",
                                  borderRadius: 12,
                                  borderTopLeftRadius: 4,
                                  color: "#999",
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
                        borderTop: "1px solid #f0f0f0",
                        padding: 16,
                        display: "flex",
                        gap: 12,
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

      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .cursor-blink {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #1677ff;
          animation: blink 1s infinite;
          vertical-align: middle;
          margin-left: 2px;
        }
        .ant-layout-sider { position: static !important; }
        .ant-layout-sider-children { height: 100%; display: flex; flex-direction: column; }
        .subtitle-scroll { flex: 1; min-height: 0; overflow-y: auto; }
        .ant-tabs { display: flex; flex-direction: column; height: 100%; }
        .ant-tabs-content-holder { flex: 1; overflow: hidden; display: flex; }
        .ant-tabs-content { flex: 1; display: flex; flex-direction: column; height: 100%; }
        .ant-tabs-tabpane { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

        /* Tab bar styles */
        .ant-tabs-nav { padding: 0 24px; border-bottom: 1px solid #f0f0f0; margin-bottom: 0; }
        .ant-tabs-tab { padding: 12px 20px; font-size: 14px; transition: all 0.2s; border-radius: 8px 8px 0 0; }
        .ant-tabs-tab + .ant-tabs-tab { margin-left: 4px; }
        .ant-tabs-tab .anticon { margin-right: 6px; color: #999; transition: color 0.2s; }
        .ant-tabs-tab:hover { color: #1677ff; background: #f0f5ff; }
        .ant-tabs-tab:hover .anticon { color: #1677ff; }
        .ant-tabs-tab-active .anticon { color: #1677ff; }
        .ant-tabs-tab-active { font-weight: 600; }
        .ant-tabs-ink-bar { height: 3px; border-radius: 2px; background: #1677ff; }

        .markdown-body {
          font-size: 14px;
          line-height: 1.8;
          color: #333;
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
          color: #111;
        }
        .markdown-body blockquote {
          margin: 12px 0;
          padding: 8px 16px;
          border-left: 3px solid #1677ff;
          background: #f6f8fa;
          color: #666;
        }
        .markdown-body code {
          background: #f0f0f0;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
        }
        .markdown-body hr {
          margin: 16px 0;
          border: none;
          border-top: 1px solid #e8e8e8;
        }
      `}</style>
    </Layout>
  );
}
