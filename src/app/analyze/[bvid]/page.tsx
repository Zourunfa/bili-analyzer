"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Layout, Card, Tabs, Input, Button, Spin, Empty, Typography, Space, Tag, Divider, Progress, Modal, Select, Form, message } from "antd";
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  MessageOutlined,
  ArrowLeftOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  SaveOutlined,
  BookOutlined,
  PlusOutlined,
  HistoryOutlined,
  SearchOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  TagsOutlined,
  FileMarkdownOutlined,
  CopyOutlined,
  ApartmentOutlined,
  SettingOutlined,
  StopOutlined,
  CaretRightOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { marked } from "marked";
import JSZip from "jszip";
import MindMapView from "@/components/MindMapView";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

function getDisplayImageUrl(url?: string | null): string {
  if (!url) return "";
  const normalized = url.startsWith("//") ? `https:${url}` : url.replace(/^http:\/\//, "https://");
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.endsWith("hdslb.com") || parsed.hostname.endsWith("biliimg.com")) {
      return `/api/image-proxy?url=${encodeURIComponent(normalized)}`;
    }
  } catch {
    return normalized;
  }
  return normalized;
}

interface VideoInfo {
  // 多平台通用
  title: string;
  /** 抖音/小红书封面 */
  coverUrl?: string;
  /** 抖音/小红书作者名 */
  authorName?: string;
  duration?: number;
  // B站专用
  pic?: string;
  owner?: { name: string };
  desc?: string;
  cid?: number;
  page?: number;
  pages?: Array<{ bvid?: string; cid: number; page: number; part: string; duration: number }>;
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
  subtitleSource?: string;
  summary: string | null;
  createdAt: string;
}

interface NotebookVideoItem {
  id: string;
  order: number;
  video: HistoryVideo;
}

interface VideoTagItem {
  id: string;
  name: string;
  color?: string | null;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string;
}

interface ModelProviderItem {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name: string;
    model: string;
  }>;
}

type VideoInfoResponse = {
  platform: "bilibili" | "douyin" | "xiaohongshu";
  id: string;
  title?: string;
  cid?: number;
  page?: number;
  pages?: Array<{ bvid?: string; cid: number; page: number; part: string; duration: number }>;
  error?: string;
};

type RuntimeModelKind = "openai-compatible" | "anthropic";

interface RuntimeModelPreset {
  id: string;
  name: string;
  kind: RuntimeModelKind;
  baseURL?: string;
  models: string[];
}

interface RuntimeModelConfig {
  id: string;
  providerId: string;
  providerName: string;
  kind: RuntimeModelKind;
  baseURL?: string;
  model: string;
  apiKey: string;
  displayName?: string;
}

interface TimestampNoteItem {
  id: string;
  timestampSec: number;
  content: string;
}

type ChapterQueueControlState = "running" | "paused" | "stopped";

const SELECTED_MODEL_STORAGE_KEY = "videonote:selected-model-id";
const RUNTIME_MODEL_STORAGE_KEY = "videonote:runtime-model-config";
const LS_BILIBILI_SESSDATA = "bilibili_sessdata";
const LS_BILIBILI_DEDE_USERID = "bilibili_dede_userid";
const LS_BILIBILI_BILI_JCT = "bilibili_bili_jct";
const CHAPTER_QUEUE_CONTROL_PREFIX = "videonote:chapter-queue-control:";

const RUNTIME_MODEL_PRESETS: RuntimeModelPreset[] = [
  {
    id: "dashscope",
    name: "通义千问",
    kind: "openai-compatible",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai-compatible",
    baseURL: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "minimax",
    name: "MiniMax",
    kind: "openai-compatible",
    baseURL: "https://api.minimax.io/v1",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-Text-01"],
  },
  {
    id: "openai",
    name: "OpenAI GPT",
    kind: "openai-compatible",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini", "gpt-4o-mini"],
  },
  {
    id: "kimi",
    name: "Kimi",
    kind: "openai-compatible",
    baseURL: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "kimi-k2-0711-preview"],
  },
  {
    id: "glm",
    name: "智谱 GLM",
    kind: "openai-compatible",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-flash", "glm-4-plus"],
  },
  {
    id: "xiaomi",
    name: "小米 MiMo",
    kind: "openai-compatible",
    baseURL: "https://api.xiaomimimo.com/v1",
    models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2.5-flash"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "anthropic",
    models: ["claude-3-5-haiku-latest", "claude-3-5-sonnet-latest"],
  },
  {
    id: "custom",
    name: "自定义 OpenAI 兼容",
    kind: "openai-compatible",
    baseURL: "",
    models: ["custom-model"],
  },
];

const TRANSCRIBE_STEPS = [
  { key: "prepare", label: "准备" },
  { key: "download", label: "下载音频" },
  { key: "transcribe", label: "语音转写" },
  { key: "summary", label: "生成摘要" },
] as const;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseMmSsToSeconds(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (!Number.isFinite(m) || !Number.isFinite(s) || s > 59) return null;
  return m * 60 + s;
}

function getBilibiliCookieHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const headers: Record<string, string> = {};
  const sessdata = window.localStorage.getItem(LS_BILIBILI_SESSDATA);
  const dedeUserId = window.localStorage.getItem(LS_BILIBILI_DEDE_USERID);
  const biliJct = window.localStorage.getItem(LS_BILIBILI_BILI_JCT);
  if (sessdata) headers["x-bilibili-sessdata"] = sessdata;
  if (dedeUserId) headers["x-bilibili-dede-userid"] = dedeUserId;
  if (biliJct) headers["x-bilibili-bili-jct"] = biliJct;
  return headers;
}

function getChapterQueueControlKey(notebookId?: string | null): string {
  return `${CHAPTER_QUEUE_CONTROL_PREFIX}${notebookId || "default"}`;
}

function readChapterQueueControl(notebookId?: string | null): ChapterQueueControlState {
  if (typeof window === "undefined") return "running";
  const saved = window.localStorage.getItem(getChapterQueueControlKey(notebookId));
  return saved === "paused" || saved === "stopped" ? saved : "running";
}

function writeChapterQueueControl(notebookId: string | null | undefined, state: ChapterQueueControlState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getChapterQueueControlKey(notebookId), state);
}

function clearChapterQueueControl(notebookId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getChapterQueueControlKey(notebookId));
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function formatSecondsToMmSs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseTimestampFromSubtitleLine(line: string): number | null {
  const match = line.match(/^\[(\d{2}):(\d{2})\]/);
  if (!match) return null;
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
  return m * 60 + s;
}

function sanitizeMindmapText(input: string): string {
  return input
    .replace(/[`*#>\[\]\(\){}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function buildMindmapMermaid(summaryText: string): string {
  const rawLines = summaryText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rawLines.length) {
    return "mindmap\n  root((视频摘要))\n    暂无内容";
  }

  const firstMeaningful =
    rawLines.find((line) => !/^[-*]\s*$/.test(line)) || rawLines[0];
  const root = sanitizeMindmapText(
    firstMeaningful.replace(/^#{1,6}\s+/, "") || "视频摘要"
  );

  const sections: Array<{ title: string; items: string[] }> = [];
  let currentSection: { title: string; items: string[] } | null = null;

  const pushSection = () => {
    if (!currentSection) return;
    currentSection.items = currentSection.items.slice(0, 4);
    if (!currentSection.items.length) return;
    sections.push(currentSection);
  };

  for (const raw of rawLines) {
    const line = sanitizeMindmapText(
      raw
        .replace(/^\[(\d{2}):(\d{2})\]\s*/, "")
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+\.\s+/, "")
    );
    if (!line) continue;

    const isHeading =
      /^#{2,6}\s+/.test(raw) ||
      (/^[-*]\s+/.test(raw) && line.length <= 20) ||
      (/^\d+\.\s+/.test(raw) && line.length <= 20);

    if (isHeading) {
      pushSection();
      currentSection = { title: line, items: [] };
      continue;
    }

    if (!currentSection) {
      currentSection = { title: "核心要点", items: [] };
    }

    if (!currentSection.items.includes(line)) {
      currentSection.items.push(line);
    }
  }
  pushSection();

  if (!sections.length) {
    const fallbackItems = rawLines
      .map((line) => sanitizeMindmapText(line))
      .filter(Boolean)
      .slice(0, 6);
    return [
      "mindmap",
      `  root((${root}))`,
      "    核心要点",
      ...fallbackItems.map((item) => `      ${item}`),
    ].join("\n");
  }

  const limitedSections = sections.slice(0, 6);
  const lines = ["mindmap", `  root((${root}))`];
  for (const section of limitedSections) {
    lines.push(`    ${section.title}`);
    for (const point of section.items) {
      lines.push(`      ${point}`);
    }
  }
  return lines.join("\n");
}

export default function AnalyzePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();
  const [modelConfigForm] = Form.useForm();
  const bvid = params.bvid as string;
  const cid = searchParams.get("cid");
  const isHistoryMode = bvid === "history";
  const platform = (searchParams.get("platform") || "bilibili") as "bilibili" | "douyin" | "xiaohongshu";
  const sourceUrl = searchParams.get("sourceUrl") || "";
  const chapterQueue = searchParams.get("chapterQueue");
  const notebookIdFromQueue = searchParams.get("notebookId");
  const activeNotebookId = searchParams.get("notebookId");
  const chapterPage = Number(searchParams.get("chapterPage") || "0");
  const isChapterQueue = platform === "bilibili" && chapterQueue === "all" && !!notebookIdFromQueue && chapterPage > 0;
  const storageBvid = isChapterQueue ? `${bvid}_p${chapterPage}` : bvid;
  const isMultiPlatform = platform !== "bilibili";
  const isNotebookMode = !!activeNotebookId;

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [subtitleText, setSubtitleText] = useState("");
  const [summary, setSummary] = useState("");
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "mindmap" | "chat">("summary");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeStep, setTranscribeStep] = useState<string>("");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSize, setDownloadSize] = useState("");
  const [transcribeVisualProgress, setTranscribeVisualProgress] = useState(0);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [notebooks, setNotebooksList] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportData, setExportData] = useState<{ folderName: string; files: Record<string, string>; stats: Record<string, unknown> } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("collect");
  const [previewTab, setPreviewTab] = useState("SKILL.md");
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileVideoMetaOpen, setMobileVideoMetaOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [allTags, setAllTags] = useState<VideoTagItem[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateExtraPrompt, setTemplateExtraPrompt] = useState("");
  const [templateOutput, setTemplateOutput] = useState("");
  const [templateLoading, setTemplateLoading] = useState(false);
  const [timestampNotes, setTimestampNotes] = useState<TimestampNoteItem[]>([]);
  const [noteTimestampInput, setNoteTimestampInput] = useState("");
  const [noteContentInput, setNoteContentInput] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [mindmapCopied, setMindmapCopied] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [subtitleCopied, setSubtitleCopied] = useState(false);
  const [modelProviders, setModelProviders] = useState<ModelProviderItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [runtimeModelConfig, setRuntimeModelConfig] = useState<RuntimeModelConfig | null>(null);
  const [modelConfigModalOpen, setModelConfigModalOpen] = useState(false);
  const [modelConfigProviderId, setModelConfigProviderId] = useState("minimax");
  const [chapterQueueControl, setChapterQueueControl] = useState<ChapterQueueControlState>("running");

  // 顶部链接输入框
  const [headerUrl, setHeaderUrl] = useState("");
  const [headerLoading, setHeaderLoading] = useState(false);

  const buildAnalyzeUrl = (data: VideoInfoResponse) => {
    const params = new URLSearchParams();
    params.set("platform", data.platform);
    if (data.platform === "bilibili" && data.cid) params.set("cid", String(data.cid));
    if (data.platform !== "bilibili" && headerUrl.trim()) {
      params.set("sourceUrl", headerUrl.trim());
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
      writeChapterQueueControl(notebookData.notebook.id, "running");
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
        setHeaderLoading(false);
        return;
      }
      continueWithVideoInfo(data);
    } catch {
      message.error("网络错误，请重试");
    } finally {
      setHeaderLoading(false);
    }
  };

  // 侧边栏历史视频
  const [sidebarTab, setSidebarTab] = useState<"subtitle" | "history">(isHistoryMode || isMultiPlatform || isNotebookMode ? "history" : "subtitle");
  const [historyVideos, setHistoryVideos] = useState<HistoryVideo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [activeNotebookTitle, setActiveNotebookTitle] = useState("");
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || "";

  const videoInfoRef = useRef<VideoInfo | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chapterQueueAdvanceRef = useRef<string | null>(null);
  const notebookResumePromptRef = useRef<string | null>(null);
  const chapterQueueControlRef = useRef<ChapterQueueControlState>("running");
  const chapterQueueAbortRef = useRef<AbortController | null>(null);
  const chapterQueueNextTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isChapterQueue) {
      setChapterQueueControl("running");
      chapterQueueControlRef.current = "running";
      return;
    }
    const saved = readChapterQueueControl(notebookIdFromQueue);
    setChapterQueueControl(saved);
    chapterQueueControlRef.current = saved;
  }, [isChapterQueue, notebookIdFromQueue, storageBvid]);

  useEffect(() => {
    chapterQueueControlRef.current = chapterQueueControl;
  }, [chapterQueueControl]);

  useEffect(() => {
    return () => {
      if (chapterQueueNextTimerRef.current) {
        window.clearTimeout(chapterQueueNextTimerRef.current);
        chapterQueueNextTimerRef.current = null;
      }
      chapterQueueAbortRef.current?.abort();
      chapterQueueAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const savedRuntime = window.localStorage.getItem(RUNTIME_MODEL_STORAGE_KEY);
    let parsedRuntime: RuntimeModelConfig | null = null;
    if (savedRuntime) {
      try {
        const parsed = JSON.parse(savedRuntime) as RuntimeModelConfig;
        if (parsed?.id && parsed?.providerId && parsed?.model && parsed?.apiKey) {
          parsedRuntime = parsed;
          setRuntimeModelConfig(parsed);
          setModelConfigProviderId(parsed.providerId);
        }
      } catch {
        window.localStorage.removeItem(RUNTIME_MODEL_STORAGE_KEY);
      }
    }

    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const providers = Array.isArray(data.providers) ? data.providers : [];
        setModelProviders(providers);
        const saved = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
        const allModelIds = providers.flatMap((provider: ModelProviderItem) =>
          provider.models.map((model) => model.id)
        );
        if (parsedRuntime && (!saved || saved === parsedRuntime.id)) {
          setSelectedModelId(parsedRuntime.id);
          window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, parsedRuntime.id);
          return;
        }

        const selectableModelIds = parsedRuntime ? [...allModelIds, parsedRuntime.id] : allModelIds;
        const nextModelId = saved && selectableModelIds.includes(saved)
          ? saved
          : String(data.defaultModelId || allModelIds[0] || "");
        setSelectedModelId(nextModelId);
      })
      .catch(() => {
        setModelProviders([]);
        if (parsedRuntime) setSelectedModelId(parsedRuntime.id);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
  };

  const selectedRuntimeModelConfig =
    runtimeModelConfig && selectedModelId === runtimeModelConfig.id ? runtimeModelConfig : null;

  const modelRequestConfig = useMemo(
    () =>
      selectedRuntimeModelConfig
        ? {
            providerId: selectedRuntimeModelConfig.providerId,
            providerName: selectedRuntimeModelConfig.providerName,
            kind: selectedRuntimeModelConfig.kind,
            baseURL: selectedRuntimeModelConfig.baseURL,
            apiKey: selectedRuntimeModelConfig.apiKey,
            model: selectedRuntimeModelConfig.model,
          }
        : undefined,
    [selectedRuntimeModelConfig]
  );

  const selectedModelLabel =
    selectedRuntimeModelConfig
      ? selectedRuntimeModelConfig.displayName || `${selectedRuntimeModelConfig.providerName} / ${selectedRuntimeModelConfig.model}`
      :
    modelProviders
      .flatMap((provider) => provider.models.map((model) => ({
        id: model.id,
        label: `${provider.name} / ${model.name}`,
      })))
      .find((item) => item.id === selectedModelId)?.label || "默认模型";

  const modelSelectOptions = [
    ...(runtimeModelConfig
      ? [
          {
            label: "我的配置",
            options: [
              {
                value: runtimeModelConfig.id,
                label: runtimeModelConfig.displayName || `${runtimeModelConfig.providerName} / ${runtimeModelConfig.model}`,
              },
            ],
          },
        ]
      : []),
    ...modelProviders.map((provider) => ({
      label: provider.name,
      options: provider.models.map((model) => ({
        value: model.id,
        label: model.name,
      })),
    })),
  ];

  const openModelConfigModal = () => {
    const currentPreset =
      RUNTIME_MODEL_PRESETS.find((preset) => preset.id === runtimeModelConfig?.providerId) ||
      RUNTIME_MODEL_PRESETS.find((preset) => preset.id === modelConfigProviderId) ||
      RUNTIME_MODEL_PRESETS[2];
    setModelConfigProviderId(currentPreset.id);
    modelConfigForm.setFieldsValue({
      providerId: currentPreset.id,
      displayName: runtimeModelConfig?.displayName || "",
      model: [runtimeModelConfig?.model || currentPreset.models[0]],
      baseURL: runtimeModelConfig?.baseURL ?? currentPreset.baseURL ?? "",
      apiKey: runtimeModelConfig?.apiKey || "",
    });
    setModelConfigModalOpen(true);
  };

  const handleModelConfigProviderChange = (providerId: string) => {
    const preset = RUNTIME_MODEL_PRESETS.find((item) => item.id === providerId) || RUNTIME_MODEL_PRESETS[0];
    setModelConfigProviderId(providerId);
    modelConfigForm.setFieldsValue({
      providerId,
      model: [preset.models[0]],
      baseURL: preset.baseURL || "",
      displayName: "",
    });
  };

  const handleSaveRuntimeModelConfig = async () => {
    const values = await modelConfigForm.validateFields();
    const preset = RUNTIME_MODEL_PRESETS.find((item) => item.id === values.providerId) || RUNTIME_MODEL_PRESETS[0];
    const model = Array.isArray(values.model) ? String(values.model[0] || "").trim() : String(values.model || "").trim();
    if (!model) {
      message.warning("请填写模型名");
      return;
    }
    const nextConfig: RuntimeModelConfig = {
      id: `runtime:${values.providerId}:${model}`,
      providerId: values.providerId,
      providerName: preset.name,
      kind: preset.kind,
      baseURL: preset.kind === "anthropic" ? String(values.baseURL || "").trim() || undefined : String(values.baseURL || "").trim(),
      model,
      apiKey: String(values.apiKey || "").trim(),
      displayName: String(values.displayName || "").trim() || undefined,
    };
    setRuntimeModelConfig(nextConfig);
    setSelectedModelId(nextConfig.id);
    window.localStorage.setItem(RUNTIME_MODEL_STORAGE_KEY, JSON.stringify(nextConfig));
    window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, nextConfig.id);
    setModelConfigModalOpen(false);
    message.success("模型配置已保存并切换");
  };

  const handleClearRuntimeModelConfig = () => {
    setRuntimeModelConfig(null);
    window.localStorage.removeItem(RUNTIME_MODEL_STORAGE_KEY);
    if (selectedModelId.startsWith("runtime:")) {
      const fallback = modelProviders[0]?.models[0]?.id || "";
      setSelectedModelId(fallback);
      if (fallback) window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, fallback);
      else window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
    }
    setModelConfigModalOpen(false);
    message.success("已清除本地模型配置");
  };

  useEffect(() => {
    if (isMobile) {
      setMobilePanelOpen(false);
      setMobileVideoMetaOpen(false);
      return;
    }
    setMobilePanelOpen(true);
    setMobileVideoMetaOpen(true);
  }, [isMobile]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!transcribing) {
      if (!summaryLoading) setTranscribeVisualProgress(0);
      return;
    }

    const timer = window.setInterval(() => {
      setTranscribeVisualProgress((prev) => {
        const step = transcribeStep || "";
        let target = prev + 1;

        if (step.includes("队列") || step.includes("资源")) {
          target = Math.max(prev, 8);
        } else if (step.includes("下载")) {
          const mappedDownload = downloadProgress > 0 ? 10 + downloadProgress * 0.38 : prev + 2;
          target = Math.min(50, Math.max(prev, mappedDownload));
        } else if (step.includes("转写")) {
          target = Math.min(88, prev + (prev < 64 ? 3 : 1));
        } else if (step.includes("摘要") || step.includes("完成")) {
          target = Math.min(96, Math.max(prev + 2, 92));
        } else {
          target = Math.min(35, prev + 2);
        }

        return Math.round(Math.min(96, target));
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [downloadProgress, summaryLoading, transcribeStep, transcribing]);

  const transcribeActiveStep = useMemo(() => {
    if (transcribeStep.includes("下载")) return "download";
    if (transcribeStep.includes("转写")) return "transcribe";
    if (transcribeStep.includes("摘要") || transcribeStep.includes("完成")) return "summary";
    return "prepare";
  }, [transcribeStep]);

  // 刷新历史视频列表
  const refreshHistory = useCallback(() => {
    fetch("/api/videos?pageSize=50&sort=createdAt_desc")
      .then(async (r) => {
        if (!r.ok) {
          setHistoryVideos([]);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.videos) setHistoryVideos(data.videos);
      })
      .catch(() => {
        setHistoryVideos([]);
      });
  }, []);

  const loadChatHistory = useCallback(async (videoId: string) => {
    try {
      const res = await fetch(`/api/videos/${videoId}/chat`);
      if (!res.ok) {
        setMessages([]);
        return;
      }
      const data = await res.json();
      const history = Array.isArray(data.messages)
        ? data.messages
            .filter((item: { role?: string; content?: unknown }) =>
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
            )
            .map((item: { role: "user" | "assistant"; content: string }) => ({
              role: item.role,
              content: item.content,
            }))
        : [];
      setMessages(history);
    } catch {
      setMessages([]);
    }
  }, []);

  const maybePromptResumeChapterQueue = useCallback(async (
    notebookId: string,
    notebookTitle: string,
    videos: HistoryVideo[]
  ) => {
    if (chapterQueue === "all" || notebookResumePromptRef.current === notebookId) return;

    const chapterVideos = videos
      .map((video) => {
        const match = video.bvid.match(/^(BV[0-9A-Za-z]+)_p(\d+)$/);
        return match ? { baseBvid: match[1], page: Number(match[2]), video } : null;
      })
      .filter((item): item is { baseBvid: string; page: number; video: HistoryVideo } => !!item);

    if (chapterVideos.length === 0) return;

    const baseBvid = chapterVideos[0].baseBvid;
    if (!chapterVideos.every((item) => item.baseBvid === baseBvid)) return;

    notebookResumePromptRef.current = notebookId;

    try {
      const res = await fetch("/api/video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: baseBvid }),
      });
      if (!res.ok) return;
      const data = await res.json() as VideoInfoResponse;
      const pages = data.pages || [];
      if (data.platform !== "bilibili" || pages.length <= chapterVideos.length) return;

      const completedPages = new Set(chapterVideos.map((item) => item.page));
      const firstMissing = pages.find((page) => !completedPages.has(page.page));
      if (!firstMissing) return;

      Modal.confirm({
        title: "检测到章节合集未解析完成",
        content: `${notebookTitle || "当前合集"} 已完成 ${completedPages.size}/${pages.length} 个章节。是否从 P${firstMissing.page} 继续解析未完成章节？`,
        okText: "继续解析",
        cancelText: "暂不解析",
        centered: true,
        onOk: () => {
          writeChapterQueueControl(notebookId, "running");
          const params = new URLSearchParams();
          params.set("platform", "bilibili");
          params.set("cid", String(firstMissing.cid));
          params.set("chapterQueue", "all");
          params.set("chapterPage", String(firstMissing.page));
          params.set("notebookId", notebookId);
          router.push(`/analyze/${firstMissing.bvid || baseBvid}?${params.toString()}`);
        },
      });
    } catch {
      // 恢复提示失败不影响用户查看已有合集内容
    }
  }, [chapterQueue, router]);

  const loadNotebookVideos = useCallback(async (notebookId: string, shouldSelectFirst: boolean) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`);
      if (!res.ok) {
        setHistoryVideos([]);
        setActiveNotebookTitle("");
        return;
      }
      const data = await res.json();
      const notebook = data.notebook as { title?: string; videos?: NotebookVideoItem[] } | undefined;
      const videos = Array.isArray(notebook?.videos)
        ? notebook.videos.map((item) => item.video).filter(Boolean)
        : [];
      const notebookTitle = notebook?.title || "合集";
      setActiveNotebookTitle(notebookTitle);
      setHistoryVideos(videos);
      void maybePromptResumeChapterQueue(notebookId, notebookTitle, videos);

      if (shouldSelectFirst && videos[0]) {
        handleSelectHistoryVideo(videos[0], { preserveNotebook: true, replaceUrl: true });
      }
    } catch {
      setHistoryVideos([]);
      setActiveNotebookTitle("");
    } finally {
      setHistoryLoading(false);
    }
  }, [maybePromptResumeChapterQueue]);

  // 切换到历史 Tab 时加载视频列表
  useEffect(() => {
    if (sidebarTab !== "history") return;
    if (activeNotebookId) {
      loadNotebookVideos(activeNotebookId, isHistoryMode);
      return;
    }
    setHistoryLoading(true);
    fetch("/api/videos?pageSize=50&sort=createdAt_desc")
      .then(async (r) => {
        if (!r.ok) {
          setHistoryVideos([]);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.videos) setHistoryVideos(data.videos);
      })
      .catch(() => {
        setHistoryVideos([]);
      })
      .finally(() => setHistoryLoading(false));
  }, [activeNotebookId, isHistoryMode, loadNotebookVideos, sidebarTab]);

  // 切换账号时，立即清空旧账号历史，避免 UI 残留造成“串号”错觉
  useEffect(() => {
    if (!activeNotebookId) setHistoryVideos([]);
    setHistoryKeyword("");
    if (sidebarTab === "history" && authStatus === "authenticated") {
      if (activeNotebookId) loadNotebookVideos(activeNotebookId, isHistoryMode);
      else refreshHistory();
    }
  }, [activeNotebookId, currentUserId, authStatus, isHistoryMode, loadNotebookVideos, sidebarTab, refreshHistory]);

  // 点击历史视频：加载分析数据
  const handleSelectHistoryVideo = async (
    video: HistoryVideo,
    options: { preserveNotebook?: boolean; replaceUrl?: boolean } = {}
  ) => {
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
    setCurrentVideoId(video.id);
    setMessages([]);
    loadChatHistory(video.id);
    setSidebarTab(options.preserveNotebook || isNotebookMode ? "history" : "subtitle");
    const nextParams = new URLSearchParams();
    if (options.preserveNotebook || isNotebookMode) {
      const notebookId = activeNotebookId || notebookIdFromQueue;
      if (notebookId) nextParams.set("notebookId", notebookId);
    }
    const nextUrl = `/analyze/${video.bvid}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
    if (options.replaceUrl !== false) router.replace(nextUrl);
  };

  // 前端过滤历史视频
  const filteredHistory = historyKeyword
    ? historyVideos.filter(
        (v) =>
          v.title.toLowerCase().includes(historyKeyword.toLowerCase()) ||
          v.ownerName.toLowerCase().includes(historyKeyword.toLowerCase())
      )
    : historyVideos;

  const getCurrentChapterTitle = (info: VideoInfo) => {
    if (!isChapterQueue) return info.title;
    const page = info.pages?.find((item) => item.page === chapterPage || item.cid === Number(cid));
    if (!page) return `${info.title} - P${chapterPage}`;
    return page.part ? `${info.title} - P${page.page} ${page.part}` : `${info.title} - P${page.page}`;
  };

  const addVideoToQueueNotebook = async (videoId: string) => {
    if (!isChapterQueue || !notebookIdFromQueue) return;
    await fetch(`/api/notebooks/${notebookIdFromQueue}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
  };

  const getNextChapterPage = (info: VideoInfo) => {
    const pages = info.pages || [];
    const currentIndex = pages.findIndex((page) => page.page === chapterPage || page.cid === Number(cid));
    return currentIndex >= 0 ? pages[currentIndex + 1] : undefined;
  };

  const updateChapterQueueControl = (state: ChapterQueueControlState) => {
    if (!isChapterQueue) return;
    setChapterQueueControl(state);
    chapterQueueControlRef.current = state;
    writeChapterQueueControl(notebookIdFromQueue, state);
  };

  const pauseChapterQueue = () => {
    updateChapterQueueControl("paused");
    if (chapterQueueNextTimerRef.current) {
      window.clearTimeout(chapterQueueNextTimerRef.current);
      chapterQueueNextTimerRef.current = null;
    }
    message.info("章节队列已暂停，当前章节会保留在本页");
  };

  const resumeChapterQueue = () => {
    updateChapterQueueControl("running");
    const info = videoInfoRef.current;
    if (info && currentVideoId && !summaryLoading && !transcribing) {
      message.info("继续解析下一章节");
      goToNextChapter(info);
    } else {
      message.success("章节队列已继续");
    }
  };

  const stopChapterQueue = () => {
    updateChapterQueueControl("stopped");
    if (chapterQueueNextTimerRef.current) {
      window.clearTimeout(chapterQueueNextTimerRef.current);
      chapterQueueNextTimerRef.current = null;
    }
    chapterQueueAbortRef.current?.abort();
    chapterQueueAbortRef.current = null;
    setTranscribing(false);
    setSummaryLoading(false);
    setTranscribeStep("章节队列已停止");
    message.info("章节队列已停止");
  };

  const goToNextChapter = (info: VideoInfo) => {
    if (!notebookIdFromQueue) return;
    const queueNotebookId = notebookIdFromQueue;
    const nextPage = getNextChapterPage(info);
    if (!nextPage) {
      clearChapterQueueControl(queueNotebookId);
      setChapterQueueControl("running");
      chapterQueueControlRef.current = "running";
      message.success("全部章节解析完成，已保存到章节合集笔记本");
      refreshHistory();
      return;
    }

    if (chapterQueueControlRef.current === "stopped") {
      message.info("章节队列已停止");
      refreshHistory();
      return;
    }

    if (chapterQueueControlRef.current === "paused") {
      message.info(`章节队列已暂停，P${chapterPage} 已保存`);
      refreshHistory();
      return;
    }

    message.info(`P${chapterPage} 已保存，稍后开始解析 P${nextPage.page}`);
    chapterQueueNextTimerRef.current = window.setTimeout(() => {
      chapterQueueNextTimerRef.current = null;
      if (chapterQueueControlRef.current !== "running") {
        message.info(chapterQueueControlRef.current === "paused" ? "章节队列已暂停" : "章节队列已停止");
        return;
      }
      const params = new URLSearchParams();
      params.set("platform", "bilibili");
      params.set("cid", String(nextPage.cid));
      params.set("chapterQueue", "all");
      params.set("chapterPage", String(nextPage.page));
      params.set("notebookId", queueNotebookId);
      router.push(`/analyze/${nextPage.bvid || bvid}?${params.toString()}`);
    }, 1200);
  };

  const advanceChapterQueue = async (info: VideoInfo, videoId: string) => {
    if (!isChapterQueue || !notebookIdFromQueue || chapterQueueAdvanceRef.current === storageBvid) return;
    chapterQueueAdvanceRef.current = storageBvid;

    try {
      await addVideoToQueueNotebook(videoId);
    } catch {
      message.warning("当前章节已保存，但关联到章节合集笔记本失败");
    }

    goToNextChapter(info);
  };

  const handleChapterQueueFailure = (errorMessage: string) => {
    if (!isChapterQueue || !videoInfoRef.current) return false;
    const info = videoInfoRef.current;
    const nextPage = getNextChapterPage(info);

    Modal.confirm({
      title: `P${chapterPage} 解析失败`,
      content: nextPage
        ? `${errorMessage}。可以重试当前章节，或跳过它继续解析 P${nextPage.page}。`
        : `${errorMessage}。这是最后一个章节，可以重试当前章节或停止队列。`,
      okText: "重试当前章节",
      cancelText: nextPage ? "跳过继续" : "停止队列",
      centered: true,
      onOk: () => window.location.reload(),
      onCancel: () => {
        if (nextPage) goToNextChapter(info);
        else message.info("章节队列已停止");
      },
    });

    return true;
  };

  // 自动保存视频记录到数据库（字幕 + 摘要），info 参数避免闭包陷阱
  const autoSaveVideo = async (info: VideoInfo, text: string, source: string, summaryText: string) => {
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bvid: storageBvid,
          title: getCurrentChapterTitle(info),
          pic: info.pic,
          desc: info.desc,
          duration: info.duration,
          ownerName: info.owner?.name || info.authorName || "",
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
      if (res.ok) {
        const data = await res.json();
        if (data.video?.id) {
          setCurrentVideoId(data.video.id);
          void advanceChapterQueue(info, data.video.id);
          return data.video.id as string;
        }
      }
    } catch { /* 静默 */ }
    return null;
  };

  // 生成 AI 摘要（流式），返回最终的摘要文本
  const generateSummary = async (text: string, signal?: AbortSignal): Promise<string> => {
    setSummaryLoading(true);
    let result = "";
    try {
      const sumRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtitleText: text,
          modelId: selectedRuntimeModelConfig ? undefined : selectedModelId || undefined,
          modelConfig: modelRequestConfig,
        }),
        signal,
      });
      if (!sumRes.ok) {
        setError("生成摘要失败");
        return result;
      }
      const reader = sumRes.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        let sseBuffer = "";
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "text") {
                if (signal?.aborted) break;
                result += event.content;
                setSummary(result);
              } else if (event.type === "error") {
                setError(event.message || "生成摘要失败");
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      if (!isAbortError(err)) {
        setError("生成摘要失败");
      }
    } finally {
      setSummaryLoading(false);
    }
    return result;
  };

  // 获取视频信息 + 字幕/摘要（优先从数据库加载已有数据）
  useEffect(() => {
    if (!bvid || isHistoryMode) return;

    let cancelled = false;
    const controller = new AbortController();
    const signal = controller.signal;
    if (isChapterQueue) {
      chapterQueueAbortRef.current?.abort();
      chapterQueueAbortRef.current = controller;
    }
    setCurrentVideoId(null);
    setMessages([]);
    setSubtitleText("");
    setSummary("");
    setError("");

    (async () => {
      if (isChapterQueue && chapterQueueControlRef.current === "stopped") {
        setTranscribeStep("章节队列已停止");
        return;
      }

      // 先查数据库，看是否已有完整的分析数据
      try {
        const dbRes = await fetch(`/api/videos?bvid=${storageBvid}`, { signal });
        if (dbRes.ok && !cancelled) {
          const dbData = await dbRes.json();
          if (dbData.video && dbData.video.subtitleText) {
            // 数据库有完整数据，直接使用
            const v = dbData.video;
            setCurrentVideoId(v.id);
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
            await loadChatHistory(v.id);
            // 如果没有摘要但有字幕，触发摘要生成
            if (!v.summary && v.subtitleText) {
              const summaryText = await generateSummary(v.subtitleText, signal);
              if (cancelled || signal.aborted) return;
              autoSaveVideo(videoInfoRef.current!, v.subtitleText, v.subtitleSource || "cc", summaryText);
            }
            return; // 数据库数据加载完毕，无需再走在线流程
          }
        }
      } catch (err) {
        if (signal.aborted || isAbortError(err)) return;
        /* 查库失败，继续走在线流程 */
      }

      if (cancelled) return;

      // 数据库无数据，走在线获取流程
      // 1. 获取视频信息
      type VideoApiData = { error?: string; videoUrl?: string; description?: string; title: string; duration?: number; [key: string]: unknown };
      let infoData: VideoApiData = { title: "" };
      try {
        const infoRes = await fetch("/api/video-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: platform === "bilibili" ? bvid : sourceUrl || bvid }),
          signal,
        });
        const rawData = await infoRes.json() as VideoApiData;
        infoData = rawData;
        if (rawData.error) {
          setError(rawData.error);
          return;
        }
        if (!cancelled) {
          const vid: VideoInfo | null = rawData as unknown as VideoInfo;
          setVideoInfo(vid);
          videoInfoRef.current = vid;
        }
      } catch (err) {
        if (signal.aborted || isAbortError(err)) return;
        setError("获取视频信息失败");
        return;
      }

      if (cancelled) return;

      // 2. 获取视频内容（B站：字幕 API；多平台：音频转写）
      const videoUrl = infoData.videoUrl;

      if (platform === "bilibili") {
        if (!cid) return;

        try {
          setSummaryLoading(true);
          setTranscribing(true);
          setTranscribeStep("正在检查是否存在 CC 字幕...");
          setTranscribeVisualProgress(4);
          setDownloadProgress(0);
          setDownloadSize("");

          const bilibiliCookieHeaders = getBilibiliCookieHeaders();
          const subRes = await fetch("/api/subtitle", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...bilibiliCookieHeaders },
            body: JSON.stringify({ bvid, cid: Number(cid), skipTranscribeFallback: true }),
            signal,
          });
          const subData = await subRes.json();
          if (subData.error) {
            if (!handleChapterQueueFailure(subData.error)) {
              setError(subData.error);
            }
            setTranscribing(false);
            setSummaryLoading(false);
            return;
          }

          if (subData.subtitleSource === "cc") {
            setTranscribing(false);
            setSubtitleText(subData.text);
            const summaryText = await generateSummary(subData.text, signal);
            if (cancelled || signal.aborted) return;
            autoSaveVideo(videoInfoRef.current!, subData.text, "cc", summaryText);
            return;
          }

          if (subData.subtitleSource === "transcribed") {
            setTranscribing(false);
            setSubtitleText(subData.text);
            const summaryText = await generateSummary(subData.text, signal);
            if (cancelled || signal.aborted) return;
            autoSaveVideo(videoInfoRef.current!, subData.text, "transcribed", summaryText);
            return;
          }

          if (subData.subtitleSource === "none") {
            setTranscribeStep("正在下载音频...");
            setTranscribeVisualProgress(10);

            const transRes = await fetch("/api/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...bilibiliCookieHeaders },
              body: JSON.stringify({ bvid, cid: Number(cid) }),
              signal,
            });

            const reader = transRes.body?.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";

            if (reader) {
              while (true) {
                if (cancelled || signal.aborted) return;
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
                      const message = "语音转写失败：" + event.error;
                      if (!handleChapterQueueFailure(message)) {
                        setError(message);
                      }
                      setTranscribing(false);
                      setSummaryLoading(false);
                      return;
                    } else if (event.type === "done") {
                      const transData = event.data;
                      setTranscribeStep("转写完成，正在生成摘要...");
                      setTranscribeVisualProgress(96);
                      setSubtitleText(transData.text);
                      setTranscribing(false);
                      const summaryText = await generateSummary(transData.text, signal);
                      if (cancelled || signal.aborted) return;
                      autoSaveVideo(videoInfoRef.current!, transData.text, "transcribe", summaryText);
                    }
                  } catch { /* skip invalid JSON */ }
                }
              }
            }
          }
        } catch (err) {
          if (signal.aborted || isAbortError(err)) return;
          const message = err instanceof Error ? err.message : "处理失败，请重试";
          if (!handleChapterQueueFailure(message)) {
            setError(message);
          }
          setSummaryLoading(false);
          setTranscribing(false);
        }
      } else if (videoUrl) {
        // 抖音/小红书：使用 videoUrl 转写音频
        setTranscribing(true);
        setTranscribeStep("正在从视频下载音频...");
        setDownloadProgress(0);
        setTranscribeVisualProgress(4);
        setDownloadSize("");
        setSummaryLoading(true);

        const transRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl, platform }),
          signal,
        });

        const reader = transRes.body?.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        if (reader) {
          while (true) {
            if (cancelled || signal.aborted) return;
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
                  setDownloadSize(`${event.downloaded} / ${event.total}`);
                  setTranscribeStep(event.percent === 100 ? "正在语音转写..." : `正在下载音频 ${event.percent}%`);
                } else if (event.type === "status") {
                  setTranscribeStep(event.message);
                } else if (event.type === "error") {
                  setError("语音转写失败：" + event.error);
                  setTranscribing(false);
                  setSummaryLoading(false);
                  return;
                } else if (event.type === "done") {
                  const transData = event.data;
                  if (!transData.text?.trim()) {
                    setError("语音转写结果为空，无法生成摘要");
                    setTranscribing(false);
                    setSummaryLoading(false);
                    return;
                  }
                  setTranscribeStep("转写完成，正在生成摘要...");
                  setTranscribeVisualProgress(96);
                  setSubtitleText(transData.text);
                  setTranscribing(false);
                  const summaryText = await generateSummary(transData.text, signal);
                  if (cancelled || signal.aborted) return;
                  autoSaveVideo(videoInfoRef.current!, transData.text, "transcribe", summaryText);
                }
              } catch { /* skip invalid JSON */ }
            }
          }
        }
      } else {
        const fallbackText = String(infoData.description || "").trim();
        const titleText = String(infoData.title || "").trim();
        const platformLabel = platform === "douyin" ? "抖音" : "小红书";
        const genericTitle = platform === "douyin" ? "抖音视频" : "小红书笔记";
        if (!fallbackText || titleText === genericTitle) {
          setError(`未能获取到${platformLabel}视频直链或有效描述，请重新粘贴原始分享链接后重试。`);
          setSummaryLoading(false);
          setTranscribing(false);
          return;
        }

        setSummaryLoading(true);
        setTranscribeStep("正在基于视频描述生成摘要...");
        setSubtitleText(fallbackText);
        try {
          const summaryText = await generateSummary(fallbackText, signal);
          if (cancelled || signal.aborted) return;
          await autoSaveVideo(videoInfoRef.current!, fallbackText, "description", summaryText);
        } catch (err) {
          if (signal.aborted || isAbortError(err)) return;
          setError("生成摘要失败");
        } finally {
          setSummaryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (chapterQueueAbortRef.current === controller) {
        chapterQueueAbortRef.current = null;
      }
    };
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
            videoId: currentVideoId,
            modelId: selectedRuntimeModelConfig ? undefined : selectedModelId || undefined,
            modelConfig: modelRequestConfig,
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
          let sseBuffer = "";
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
                if (event.type === "text") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      content: updated[updated.length - 1].content + event.content,
                    };
                    return updated;
                  });
                } else if (event.type === "error") {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    const content = event.message || "抱歉，回复失败。";
                    if (last?.role === "assistant" && !last.content) {
                      updated[updated.length - 1] = { ...last, content };
                      return updated;
                    }
                    return [...updated, { role: "assistant", content }];
                  });
                }
              } catch { /* ignore parse errors */ }
            }
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
    [chatInput, chatLoading, currentVideoId, messages, modelRequestConfig, selectedModelId, selectedRuntimeModelConfig, subtitleText]
  );

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
    if (authStatus !== "authenticated") {
      message.warning("请先登录");
      router.push("/login");
      return;
    }
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
          ownerName: videoInfo.owner?.name || videoInfo.authorName || "",
          ownerMid: "",
          cid: Number(cid),
          subtitleText,
          subtitleSource: "cc",
          summary,
        }),
      });
      const videoData = await videoRes.json();
      if (videoData.video?.id) {
        setCurrentVideoId(videoData.video.id);
      }

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
        body: JSON.stringify({
          bvid,
          modelId: selectedRuntimeModelConfig ? undefined : selectedModelId || undefined,
          modelConfig: modelRequestConfig,
        }),
      }).catch(() => { /* 后台处理，不阻塞 */ });
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 导出视频分析为 Skill（抽屉式交互）
  const EXPORT_STEPS = [
    { key: "collect", title: "收集视频数据" },
    { key: "metadata", title: "生成元数据" },
    { key: "generate", title: "生成导出文件" },
    { key: "done", title: "导出完成" },
  ];

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleExportSkill = async () => {
    if (!bvid) return;
    if (authStatus !== "authenticated") {
      message.warning("请先登录");
      router.push("/login");
      return;
    }
    setDrawerOpen(true);
    setExportData(null);
    setCurrentStep("collect");
    setPreviewTab("SKILL.md");

    await delay(400);
    setCurrentStep("metadata");
    await delay(300);
    setCurrentStep("generate");

    try {
      const res = await fetch("/api/skills/export-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bvid,
          videoData: {
            title: videoInfo?.title ?? "",
            ownerName: videoInfo?.owner?.name ?? "",
            duration: videoInfo?.duration ?? 0,
            subtitleText,
            summary: summary || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "导出失败");
        setDrawerOpen(false);
        return;
      }
      setExportData(data);
      setCurrentStep("done");
    } catch {
      message.error("导出失败");
      setDrawerOpen(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!exportData) return;
    setExportLoading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(exportData.folderName)!;
      for (const [path, content] of Object.entries(exportData.files)) {
        folder.file(path, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportData.folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      message.success("下载成功");
    } catch {
      message.error("打包失败");
    } finally {
      setExportLoading(false);
    }
  };

  const closeDrawer = () => setDrawerOpen(false);

  const handleOpenTagModal = async () => {
    if (authStatus !== "authenticated") {
      message.warning("请先登录");
      router.push("/login");
      return;
    }
    if (!bvid || isHistoryMode) {
      message.warning("请先进入具体视频页再编辑标签");
      return;
    }
    if (!currentVideoId) {
      message.warning("视频分析保存完成后才能编辑标签");
      return;
    }
    try {
      const [tagRes, relationRes] = await Promise.all([
        fetch("/api/tags"),
        fetch(`/api/videos/${bvid}/tags`),
      ]);
      const tagData = await tagRes.json();
      const relationData = await relationRes.json();
      if (!tagRes.ok) {
        message.error(tagData.error || "获取标签失败");
        return;
      }
      setAllTags(tagData.tags || []);
      setSelectedTagIds((relationData.tags || []).map((tag: VideoTagItem) => tag.id));
      setTagModalOpen(true);
    } catch {
      message.error("获取标签失败");
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "创建标签失败");
        return;
      }
      setAllTags((prev) => [data.tag, ...prev]);
      setSelectedTagIds((prev) => Array.from(new Set([data.tag.id, ...prev])));
      setNewTagName("");
    } catch {
      message.error("创建标签失败");
    }
  };

  const handleSaveVideoTags = async () => {
    if (!bvid || isHistoryMode || !currentVideoId) return;
    setTagSubmitting(true);
    try {
      const relationRes = await fetch(`/api/videos/${bvid}/tags`);
      const relationData = await relationRes.json();
      const currentIds = new Set<string>((relationData.tags || []).map((tag: VideoTagItem) => tag.id));
      const selected = new Set<string>(selectedTagIds);

      const toAdd = Array.from(selected).filter((id) => !currentIds.has(id));
      const toRemove = Array.from(currentIds).filter((id) => !selected.has(id));

      await Promise.all([
        ...toAdd.map((tagId) =>
          fetch(`/api/videos/${bvid}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          })
        ),
        ...toRemove.map((tagId) =>
          fetch(`/api/videos/${bvid}/tags`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId }),
          })
        ),
      ]);

      message.success("标签已更新");
      setTagModalOpen(false);
    } catch {
      message.error("保存标签失败");
    } finally {
      setTagSubmitting(false);
    }
  };

  const handleOpenTemplateModal = async () => {
    if (authStatus !== "authenticated") {
      message.warning("请先登录");
      router.push("/login");
      return;
    }
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "获取模板失败");
        return;
      }
      setTemplates(data.templates || []);
      setTemplateId((data.templates || [])[0]?.id || null);
      setTemplateOutput("");
      setTemplateExtraPrompt("");
      setTemplateModalOpen(true);
    } catch {
      message.error("获取模板失败");
    }
  };

  const handleGenerateTemplate = async () => {
    if (!templateId) {
      message.warning("请选择模板");
      return;
    }
    if (!summary || !subtitleText) {
      message.warning("请先完成字幕和摘要分析");
      return;
    }

    setTemplateLoading(true);
    setTemplateOutput("");
    try {
      const res = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          summary,
          subtitleText,
          extraPrompt: templateExtraPrompt,
          modelId: selectedRuntimeModelConfig ? undefined : selectedModelId || undefined,
          modelConfig: modelRequestConfig,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        message.error(data.error || "模板生成失败");
        setTemplateLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let output = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "text" && typeof payload.content === "string") {
            output += payload.content;
            setTemplateOutput(output);
          }
          if (payload.type === "error") {
            message.error(payload.message || "模板生成失败");
          }
        }
      }
    } catch {
      message.error("模板生成失败");
    } finally {
      setTemplateLoading(false);
    }
  };

  const fetchTimestampNotes = useCallback(async () => {
    if (!bvid || isHistoryMode || !currentVideoId) {
      setTimestampNotes([]);
      return;
    }
    setNoteLoading(true);
    try {
      const res = await fetch(`/api/videos/${bvid}/notes`);
      const data = await res.json();
      if (!res.ok) {
        setTimestampNotes([]);
        return;
      }
      setTimestampNotes(data.notes || []);
    } catch {
      setTimestampNotes([]);
    } finally {
      setNoteLoading(false);
    }
  }, [bvid, currentVideoId, isHistoryMode]);

  const handleCreateTimestampNote = async () => {
    if (!bvid || isHistoryMode || !currentVideoId) {
      message.warning("视频分析保存完成后才能记录笔记");
      return;
    }
    const content = noteContentInput.trim();
    if (!content) {
      message.warning("请输入笔记内容");
      return;
    }
    const timestampSec = parseMmSsToSeconds(noteTimestampInput);
    if (timestampSec === null) {
      message.warning("时间戳格式应为 mm:ss，例如 02:15");
      return;
    }

    setNoteSaving(true);
    try {
      const res = await fetch(`/api/videos/${bvid}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestampSec,
          content,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.error(data.error || "保存笔记失败");
        return;
      }
      setNoteContentInput("");
      await fetchTimestampNotes();
      message.success("已记录时间戳笔记");
    } catch {
      message.error("保存笔记失败");
    } finally {
      setNoteSaving(false);
    }
  };

  const jumpToTimestampNote = (sec: number) => {
    setSidebarTab("subtitle");
    const exact = document.querySelector(`[data-ts=\"${sec}\"]`) as HTMLElement | null;
    if (exact) {
      exact.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const all = Array.from(document.querySelectorAll("[data-ts]")) as HTMLElement[];
    const candidate = all
      .map((el) => ({ el, ts: Number(el.dataset.ts || -1) }))
      .filter((item) => Number.isFinite(item.ts) && item.ts >= sec)
      .sort((a, b) => a.ts - b.ts)[0];
    if (candidate?.el) {
      candidate.el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    fetchTimestampNotes();
  }, [fetchTimestampNotes]);

  const mindmapMermaid = useMemo(() => buildMindmapMermaid(summary), [summary]);

  const handleCopyMindmap = async () => {
    if (!mindmapMermaid.trim()) return;
    try {
      await navigator.clipboard.writeText(`\`\`\`mermaid\n${mindmapMermaid}\n\`\`\``);
      setMindmapCopied(true);
      message.success("思维导图代码已复制");
      window.setTimeout(() => setMindmapCopied(false), 1200);
    } catch {
      message.error("复制失败，请重试");
    }
  };

  const handleCopySummary = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setSummaryCopied(true);
    message.success("摘要已复制");
    window.setTimeout(() => setSummaryCopied(false), 2000);
  };

  const handleCopySubtitle = async () => {
    if (!subtitleText) return;
    await navigator.clipboard.writeText(subtitleText);
    setSubtitleCopied(true);
    message.success("字幕已复制");
    window.setTimeout(() => setSubtitleCopied(false), 2000);
  };

  const videoCardNode = videoInfo ? (
    <Card
      className="analyze-video-card"
      size="small"
      cover={
        <div className="analyze-video-cover" style={{ width: "100%", aspectRatio: "16/9", background: "var(--card)", borderRadius: 8, overflow: "hidden" }}>
          {videoInfo.pic || videoInfo.coverUrl ? (
            <img
              src={getDisplayImageUrl(videoInfo.pic || videoInfo.coverUrl)}
              alt={videoInfo.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="video-cover-placeholder">
              <PlayCircleOutlined />
            </div>
          )}
        </div>
      }
      styles={{ body: { padding: "12px 0 0" } }}
    >
      <Title level={5} style={{ marginBottom: 4, fontSize: 14, lineHeight: 1.4 }}>
        {videoInfo.title}
      </Title>
      <Space size={8} wrap>
        <Tag color="blue">{videoInfo.owner?.name || videoInfo.authorName || ""}</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <PlayCircleOutlined /> {formatDuration(videoInfo.duration ?? 0)}
        </Text>
      </Space>
    </Card>
  ) : null;

  const sidebarTabsNode = (
    <Tabs
      activeKey={sidebarTab}
      onChange={(key) => setSidebarTab(key as "subtitle" | "history")}
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      items={
        [
          {
            key: "subtitle",
            label: <span><FileTextOutlined /> 字幕</span>,
            children: (
              <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div className="subtitle-note-toolbar">
                  <Space.Compact style={{ flex: 1 }}>
                    <Input
                      size="small"
                      value={noteTimestampInput}
                      onChange={(e) => setNoteTimestampInput(e.target.value)}
                      placeholder="时间 00:15"
                      style={{ maxWidth: 110 }}
                    />
                    <Input
                      size="small"
                      value={noteContentInput}
                      onChange={(e) => setNoteContentInput(e.target.value)}
                      placeholder="记下这个时间点的关键内容..."
                      onPressEnter={handleCreateTimestampNote}
                    />
                    <Button
                      size="small"
                      type="primary"
                      loading={noteSaving}
                      onClick={handleCreateTimestampNote}
                      disabled={isHistoryMode || !bvid}
                    >
                      记笔记
                    </Button>
                  </Space.Compact>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    type={subtitleCopied ? "primary" : "default"}
                    onClick={handleCopySubtitle}
                    disabled={!subtitleText}
                  >
                    {subtitleCopied ? "已复制" : "复制字幕"}
                  </Button>
                  <div className="timestamp-note-list">
                    {noteLoading ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>加载笔记中...</Text>
                    ) : timestampNotes.length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>还没有时间戳笔记</Text>
                    ) : (
                      timestampNotes.map((note) => (
                        <Tag
                          key={note.id}
                          className="timestamp-note-tag"
                          onClick={() => jumpToTimestampNote(note.timestampSec)}
                        >
                          {formatSecondsToMmSs(note.timestampSec)} {note.content}
                        </Tag>
                      ))
                    )}
                  </div>
                </div>
                <div className="subtitle-lines-scroll">
                  {subtitleText
                    ? subtitleText.split("\n").map((line, idx) => {
                        const sec = parseTimestampFromSubtitleLine(line);
                        return (
                          <div
                            key={`${idx}-${line.slice(0, 12)}`}
                            data-ts={sec !== null ? String(sec) : undefined}
                            className={`subtitle-line-row ${sec !== null ? "has-timestamp" : ""}`}
                          >
                            {line}
                          </div>
                        );
                      })
                    : "加载中..."}
                </div>
              </div>
            ),
          },
          {
            key: "history",
            label: <span><HistoryOutlined /> {activeNotebookTitle || "历史"}</span>,
            children: (
              <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "8px 12px", flexShrink: 0 }}>
                  <Input
                    size="small"
                    placeholder={activeNotebookTitle ? "搜索合集内视频..." : "搜索标题或UP主..."}
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
                      description={<Text type="secondary">{historyKeyword ? "没有匹配的视频" : activeNotebookTitle ? "这个合集还没有视频" : "还没有分析过视频"}</Text>}
                      style={{ padding: "24px 0" }}
                    />
                  ) : (
                    <div style={{ padding: "0 12px 12px" }}>
                      {filteredHistory.map((v) => (
                        <div
                          key={v.id}
                          className={`history-item ${v.bvid === storageBvid ? "history-item-active" : ""}`}
                          onClick={() => handleSelectHistoryVideo(v, { preserveNotebook: isNotebookMode })}
                        >
                          <div className="history-item-cover">
                            {v.pic ? (
                              <img src={getDisplayImageUrl(v.pic)} alt={v.title} />
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
        ].filter((item) => isMultiPlatform ? item.key !== "subtitle" : true)
      }
    />
  );

  const chapterQueueControlsNode = isChapterQueue ? (
    <div className="chapter-queue-controls">
      <Space wrap>
        {chapterQueueControl === "paused" ? (
          <Button
            size="small"
            type="primary"
            icon={<CaretRightOutlined />}
            onClick={resumeChapterQueue}
          >
            继续
          </Button>
        ) : (
          <Button
            size="small"
            icon={<PauseCircleOutlined />}
            onClick={pauseChapterQueue}
            disabled={chapterQueueControl === "stopped"}
          >
            暂停
          </Button>
        )}
        <Button
          size="small"
          danger
          icon={<StopOutlined />}
          onClick={stopChapterQueue}
          disabled={chapterQueueControl === "stopped"}
        >
          停止
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {chapterQueueControl === "paused"
            ? "已暂停"
            : chapterQueueControl === "stopped"
              ? "已停止"
              : `正在解析 P${chapterPage}`}
        </Text>
      </Space>
    </div>
  ) : null;

  // 错误兜底渲染：必须放在所有 hook 之后，避免 Rules of Hooks 违例
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

  return (
    <Layout style={{ height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* Header */}
      <Header
        className="analyze-header"
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
        <Link href="/" className="header-back-link" style={{ fontWeight: 700, fontSize: 16, color: "#fb7299", display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowLeftOutlined /> {isHistoryMode ? "历史分析" : `${platform === "bilibili" ? "B站" : platform === "douyin" ? "抖音" : "小红书"}视频分析`}
        </Link>
        {videoInfo && (
          <Text className="header-video-title" type="secondary" ellipsis style={{ maxWidth: 240, fontSize: 13 }}>
            {videoInfo.title}
          </Text>
        )}
        <Space.Compact className="header-search" style={{ maxWidth: 380, flex: 1 }}>
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
        <div className="header-actions">
        <Select
          size="small"
          value={selectedModelId || undefined}
          onChange={handleModelChange}
          placeholder="模型"
          title={selectedModelLabel}
          style={{ width: 180 }}
          popupMatchSelectWidth={260}
          options={modelSelectOptions}
          disabled={modelSelectOptions.length === 0}
        />
        <Button
          icon={<SettingOutlined />}
          onClick={openModelConfigModal}
          style={{ borderColor: "var(--border)", color: "azure" }}
        >
          配置模型
        </Button>
        <Button
          icon={<TagsOutlined />}
          onClick={handleOpenTagModal}
          disabled={!bvid || isHistoryMode || !currentVideoId}
          style={{ borderColor: "var(--border)", color: "azure" }}
        >
          标签
        </Button>
        <Button
          icon={<FileMarkdownOutlined />}
          onClick={handleOpenTemplateModal}
          disabled={!subtitleText || !summary}
          style={{ borderColor: "#8b5cf6", color: "azure" }}
        >
          模板输出
        </Button>
        <Button
          icon={<BookOutlined />}
          onClick={() => router.push("/notebooks")}
          style={{ borderColor: "var(--border)", color: "azure" }}
        >
          智能合集
        </Button>
        <Button
          icon={<SaveOutlined style={{ color: "bisque" }}/>}
          onClick={handleOpenSaveModal}
          disabled={!subtitleText || !summary}
          style={{ borderColor: "#fb7299",   color: "azure" }}
        >
          保存到笔记本
        </Button>
        <Button
          icon={<ExportOutlined style={{ color: "#fbbf24" }}/>}
          onClick={handleExportSkill}
          loading={exportLoading}
          disabled={!subtitleText}
          style={{ borderColor: "#fbbf24", color: "azure" }}
        >
          导出 Skill
        </Button>
        </div>
      </Header>

      <Layout style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Left Sidebar: Video Info + Tabs (字幕/历史) */}
        {!isMobile && (
          <Sider
            width={360}
            style={{
              background: "transparent",
              borderRight: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            {videoCardNode && <div style={{ padding: 16 }}>{videoCardNode}</div>}
            <Divider style={{ margin: 0 }} />
            {sidebarTabsNode}
          </Sider>
        )}

        {/* Right Content: Summary + Chat */}
        <Content style={{ display: "flex", flexDirection: "column", background: "transparent", overflow: "hidden", minHeight: 0 }}>
          {isMobile && (
            <div className="mobile-side-panel-wrap">
              <div className="mobile-panel-toggle-row">
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => setMobileVideoMetaOpen((v) => !v)}
                >
                  {mobileVideoMetaOpen ? "收起视频信息" : "视频信息"}
                </Button>
                <Button
                  size="small"
                  icon={<FileTextOutlined />}
                  onClick={() => {
                    setSidebarTab("subtitle");
                    setMobilePanelOpen((v) => !v);
                  }}
                >
                  {mobilePanelOpen && sidebarTab === "subtitle" ? "收起字幕" : "展开字幕"}
                </Button>
                <Button
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={() => {
                    setSidebarTab("history");
                    setMobilePanelOpen(true);
                  }}
                >
                  历史
                </Button>
              </div>
              {mobileVideoMetaOpen && videoCardNode && (
                <div className="mobile-video-meta-card">{videoCardNode}</div>
              )}
              <div className="mobile-panel-toggle-row">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  默认优先展示摘要，字幕按需展开
                </Text>
              </div>
              {mobilePanelOpen && (
                <div className="mobile-side-panel-card">
                  {sidebarTabsNode}
                </div>
              )}
            </div>
          )}
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as "summary" | "mindmap" | "chat")}
            className={isMobile ? "main-tabs-mobile" : ""}
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
                      transcribing ? (
                        <div className="transcribe-progress-wrap">
                          <div className="transcribe-progress-card">
                            <div className="transcribe-orbit" aria-hidden="true">
                              <div className="transcribe-orbit-core">
                                <LoadingOutlined spin />
                              </div>
                            </div>
                            <div className="transcribe-progress-title">正在处理语音内容</div>
                            <div className="transcribe-progress-subtitle">
                              {transcribeStep || "正在准备转写任务..."}
                            </div>
                            {chapterQueueControlsNode}
                            <div className="transcribe-wave" aria-hidden="true">
                              {Array.from({ length: 22 }).map((_, index) => (
                                <span key={index} style={{ animationDelay: `${index * 0.06}s` }} />
                              ))}
                            </div>
                            <Progress
                              percent={Math.max(4, transcribeVisualProgress)}
                              strokeColor={{ "0%": "#fb7299", "55%": "#8b5cf6", "100%": "#22d3ee" }}
                              trailColor="rgba(148, 163, 184, 0.18)"
                              size="small"
                              status="active"
                            />
                            {downloadSize && (
                              <div className="transcribe-download-size">{downloadSize}</div>
                            )}
                            <div className="transcribe-step-row">
                              {TRANSCRIBE_STEPS.map((step, index) => {
                                const activeIndex = TRANSCRIBE_STEPS.findIndex((item) => item.key === transcribeActiveStep);
                                const isDone = index < activeIndex;
                                const isActive = step.key === transcribeActiveStep;
                                return (
                                  <div
                                    key={step.key}
                                    className={`transcribe-step ${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                                  >
                                    <span>{index + 1}</span>
                                    {step.label}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", padding: 48 }}>
                          <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                          <div style={{ marginTop: 12, color: "var(--muted-foreground)" }}>
                            正在生成摘要...
                          </div>
                        </div>
                      )
                    ) : (
                      <>
                        {chapterQueueControlsNode}
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                          <Button
                            size="small"
                            icon={<CopyOutlined />}
                            type={summaryCopied ? "primary" : "default"}
                            onClick={handleCopySummary}
                            disabled={!summary}
                          >
                            {summaryCopied ? "已复制" : "复制摘要"}
                          </Button>
                        </div>
                        <div
                          className="markdown-body"
                          dangerouslySetInnerHTML={{
                            __html: marked.parse(summary.replace(/<br\s*\/?>/gi, "\n")) +
                              (summaryLoading
                                ? '<span class="cursor-blink"></span>'
                                : ""),
                          }}
                        />
                      </>
                    )}
                  </div>
                ),
              },
              {
                key: "mindmap",
                label: (
                  <span>
                    <ApartmentOutlined /> 思维导图
                  </span>
                ),
                children: (
                  <div className="mindmap-pane">
                    {!summary ? (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<Text type="secondary">请先完成摘要生成，再查看思维导图</Text>}
                        style={{ paddingTop: 80 }}
                      />
                    ) : (
                      <MindMapView markdown={summary} />
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

      <Modal
        title={<span><SettingOutlined /> 配置模型</span>}
        open={modelConfigModalOpen}
        onCancel={() => setModelConfigModalOpen(false)}
        onOk={handleSaveRuntimeModelConfig}
        okText="保存并使用"
        cancelText="取消"
        width={560}
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button danger onClick={handleClearRuntimeModelConfig} disabled={!runtimeModelConfig}>
              清除配置
            </Button>
            <Space>
              <CancelBtn />
              <OkBtn />
            </Space>
          </Space>
        )}
      >
        <Form
          form={modelConfigForm}
          layout="vertical"
          requiredMark={false}
          initialValues={{
            providerId: "minimax",
            model: ["MiniMax-M2.7"],
            baseURL: "https://api.minimax.io/v1",
          }}
        >
          <Form.Item
            label="供应商"
            name="providerId"
            rules={[{ required: true, message: "请选择供应商" }]}
          >
            <Select
              options={RUNTIME_MODEL_PRESETS.map((preset) => ({
                value: preset.id,
                label: preset.name,
              }))}
              onChange={handleModelConfigProviderChange}
            />
          </Form.Item>

          <Form.Item
            label="模型"
            name="model"
            rules={[{ required: true, message: "请选择或输入模型名" }]}
          >
            <Select
              showSearch
              mode="tags"
              placeholder="选择或输入模型名"
              onChange={(value) => {
                if (Array.isArray(value) && value.length > 1) {
                  modelConfigForm.setFieldValue("model", [value[value.length - 1]]);
                }
              }}
              options={(RUNTIME_MODEL_PRESETS.find((preset) => preset.id === modelConfigProviderId)?.models || []).map((model) => ({
                value: model,
                label: model,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="API Key"
            name="apiKey"
            rules={[{ required: true, message: "请输入 API Key" }]}
          >
            <Input.Password placeholder="填写该模型供应商的 API Key" autoComplete="off" />
          </Form.Item>

          {RUNTIME_MODEL_PRESETS.find((preset) => preset.id === modelConfigProviderId)?.kind !== "anthropic" && (
            <Form.Item
              label="Base URL"
              name="baseURL"
              rules={[
                { required: true, message: "请输入 Base URL" },
                { type: "url", message: "请输入有效的 http(s) 地址" },
              ]}
            >
              <Input placeholder="https://api.example.com/v1" />
            </Form.Item>
          )}

          <Form.Item label="显示名称" name="displayName">
            <Input placeholder="可选，例如：我的 MiniMax" />
          </Form.Item>

          <Text type="secondary" style={{ fontSize: 12 }}>
            API Key 只保存在当前浏览器 localStorage，并在生成摘要、对话、知识提取等请求中发送给本应用后端用于本次调用。
          </Text>
        </Form>
      </Modal>

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

      <Modal
        title={<span><TagsOutlined /> 视频标签</span>}
        open={tagModalOpen}
        onCancel={() => setTagModalOpen(false)}
        onOk={handleSaveVideoTags}
        okText="保存"
        cancelText="取消"
        confirmLoading={tagSubmitting}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Text type="secondary">选择当前视频标签：</Text>
          <Select
            mode="multiple"
            style={{ width: "100%" }}
            value={selectedTagIds}
            onChange={(vals) => setSelectedTagIds(vals)}
            options={allTags.map((tag) => ({
              value: tag.id,
              label: tag.name,
            }))}
            placeholder="选择标签"
          />
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onPressEnter={handleCreateTag}
              placeholder="新建标签名..."
            />
            <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
              新建标签
            </Button>
          </Space.Compact>
        </Space>
      </Modal>

      <Modal
        title={<span><FileMarkdownOutlined /> 模板输出</span>}
        open={templateModalOpen}
        onCancel={() => setTemplateModalOpen(false)}
        footer={null}
        width={760}
      >
        <Space direction="vertical" style={{ width: "100%" }} size={12}>
          <Select
            style={{ width: "100%" }}
            value={templateId || undefined}
            onChange={(v) => setTemplateId(v)}
            options={templates.map((tpl) => ({
              value: tpl.id,
              label: `${tpl.name} - ${tpl.description}`,
            }))}
            placeholder="选择模板"
          />
          <Input.TextArea
            rows={3}
            value={templateExtraPrompt}
            onChange={(e) => setTemplateExtraPrompt(e.target.value)}
            placeholder="可选：补充风格或目标受众要求"
          />
          <Space>
            <Button type="primary" loading={templateLoading} onClick={handleGenerateTemplate}>
              生成
            </Button>
            <Button
              icon={<CopyOutlined />}
              disabled={!templateOutput}
              onClick={async () => {
                await navigator.clipboard.writeText(templateOutput);
                message.success("已复制");
              }}
            >
              复制
            </Button>
          </Space>
          <div className="template-output-box">
            {templateOutput || (templateLoading ? "正在生成..." : "生成结果将显示在这里")}
          </div>
        </Space>
      </Modal>

      {/* 遮罩层 */}
      {drawerOpen && (
        <div className="drawer-overlay" onClick={closeDrawer} />
      )}

      {/* 导出 Skill 右侧抽屉 */}
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
            {EXPORT_STEPS.map((step, i) => {
              const isActive = step.key === currentStep;
              const stepIndex = EXPORT_STEPS.findIndex((s) => s.key === currentStep);
              const isCompleted = i < stepIndex;
              return (
                <div
                  key={step.key}
                  className={`export-step ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                >
                  <div className={`export-step-icon ${isCompleted ? "done" : isActive ? "running" : ""}`}>
                    {isCompleted ? <CheckCircleOutlined /> : <span>{i + 1}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: isActive ? 600 : isCompleted ? 500 : 400,
                      color: isCompleted ? "#34d399" : isActive ? "#fb7299" : "var(--muted-foreground)",
                    }}>
                      {step.title}
                    </div>
                  </div>
                  {isCompleted && (
                    <CheckCircleOutlined style={{ color: "#34d399", fontSize: 16 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* 导出完成 */}
          {currentStep === "done" && exportData && (
            <>
              {/* 统计卡片 */}
              <div className="export-stats-card">
                <div className="export-stats-title">
                  <CheckCircleOutlined style={{ marginRight: 6 }} />
                  导出完成
                </div>
                <Space size={16}>
                  <Text type="secondary">{(exportData.stats as { video?: string }).video || bvid}</Text>
                  <Text type="secondary">{(exportData.stats as { knowledgePoints?: number }).knowledgePoints} 个知识点</Text>
                  <Text type="secondary">{Object.keys(exportData.files).length} 个文件</Text>
                </Space>
              </div>

              {/* 文件 Tab */}
              <div className="export-file-tabs">
                <div style={{ display: "flex", gap: 0 }}>
                  {Object.keys(exportData.files).map((filename) => (
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
                {exportData.files[previewTab]}
              </div>
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className="skill-drawer-footer">
          <Button style={{ flex: 1 }} onClick={closeDrawer}>
            关闭
          </Button>
          {currentStep === "done" && exportData && (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownloadZip}
              loading={exportLoading}
              style={{ flex: 1 }}
            >
              下载 ZIP
            </Button>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* 导出 Skill 抽屉 */
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
        .transcribe-progress-wrap {
          min-height: 420px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 12px;
        }
        .transcribe-progress-card {
          width: min(560px, 100%);
          border: 1px solid rgba(251, 114, 153, 0.26);
          background:
            radial-gradient(circle at 50% 0%, rgba(251, 114, 153, 0.18), transparent 42%),
            linear-gradient(180deg, rgba(24, 24, 54, 0.96), rgba(12, 12, 28, 0.96));
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.34);
          border-radius: 18px;
          padding: 30px;
          text-align: center;
          overflow: hidden;
          position: relative;
        }
        .transcribe-progress-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
          transform: translateX(-100%);
          animation: transcribeShimmer 2.8s ease-in-out infinite;
        }
        .transcribe-orbit {
          width: 86px;
          height: 86px;
          margin: 0 auto 18px;
          border-radius: 50%;
          padding: 2px;
          background: conic-gradient(from 0deg, #fb7299, #8b5cf6, #22d3ee, #fb7299);
          animation: transcribeRotate 2.8s linear infinite;
          position: relative;
        }
        .transcribe-orbit-core {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: #111127;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fb7299;
          font-size: 28px;
        }
        .transcribe-progress-title {
          color: var(--foreground);
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          position: relative;
        }
        .transcribe-progress-subtitle {
          margin-top: 8px;
          color: var(--muted-foreground);
          font-size: 14px;
          min-height: 22px;
          position: relative;
        }
        .chapter-queue-controls {
          margin: 14px 0 2px;
          display: flex;
          justify-content: center;
          position: relative;
        }
        .transcribe-wave {
          height: 68px;
          margin: 24px auto 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          position: relative;
        }
        .transcribe-wave span {
          width: 5px;
          height: 18px;
          border-radius: 99px;
          background: linear-gradient(180deg, #22d3ee, #8b5cf6 48%, #fb7299);
          opacity: 0.82;
          animation: transcribeWave 1.1s ease-in-out infinite;
        }
        .transcribe-download-size {
          margin-top: 8px;
          color: var(--muted-foreground);
          font-size: 12px;
        }
        .transcribe-step-row {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          position: relative;
        }
        .transcribe-step {
          min-width: 0;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted-foreground);
          border-radius: 10px;
          padding: 8px 6px;
          font-size: 12px;
          line-height: 1.2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .transcribe-step span {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(148, 163, 184, 0.14);
          font-size: 11px;
          flex: 0 0 auto;
        }
        .transcribe-step.done {
          color: #8ee6c9;
          border-color: rgba(52, 211, 153, 0.36);
          background: rgba(52, 211, 153, 0.08);
        }
        .transcribe-step.active {
          color: #fff;
          border-color: rgba(251, 114, 153, 0.56);
          background: rgba(251, 114, 153, 0.14);
          box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.08);
        }
        @keyframes transcribeRotate {
          to { transform: rotate(360deg); }
        }
        @keyframes transcribeWave {
          0%, 100% { height: 16px; opacity: 0.55; }
          50% { height: 58px; opacity: 1; }
        }
        @keyframes transcribeShimmer {
          0% { transform: translateX(-100%); }
          55%, 100% { transform: translateX(100%); }
        }
        .video-cover-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted-foreground);
          font-size: 28px;
          background: rgba(255, 255, 255, 0.03);
        }
        .analyze-header .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mobile-side-panel-wrap {
          padding: 12px 12px 0;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
        }
        .mobile-panel-toggle-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .mobile-video-meta-card {
          margin-bottom: 8px;
        }
        .mobile-side-panel-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 12px;
          height: 40vh;
          min-height: 220px;
          max-height: 360px;
          background: rgba(15, 15, 40, 0.6);
          backdrop-filter: blur(6px);
        }
        .subtitle-note-toolbar {
          padding: 10px 12px 8px;
          border-bottom: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }
        .timestamp-note-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 84px;
          overflow: auto;
        }
        .timestamp-note-tag {
          cursor: pointer;
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          border-radius: 999px;
          border-color: rgba(251, 114, 153, 0.2);
          background: rgba(251, 114, 153, 0.08);
          color: #fb7299;
        }
        .subtitle-lines-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 10px 12px 12px;
        }
        .subtitle-line-row {
          padding: 2px 4px;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.8;
          color: var(--muted-foreground);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .subtitle-line-row.has-timestamp:hover {
          background: rgba(251, 114, 153, 0.06);
        }
        .template-output-box {
          min-height: 240px;
          max-height: 420px;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.02);
          padding: 12px;
          white-space: pre-wrap;
          line-height: 1.7;
          font-size: 13px;
          color: var(--foreground);
        }
        .mindmap-pane {
          flex: 1;
          overflow: auto;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mindmap-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .mindmap-code-block {
          margin: 0;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.02);
          color: #cfe2ff;
          font-size: 12px;
          line-height: 1.7;
          overflow: auto;
          white-space: pre;
        }
        @media (max-width: 600px) {
          .skill-drawer {
            width: 100%;
          }
        }

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
        @media (max-width: 900px) {
          .analyze-header {
            height: auto !important;
            line-height: normal !important;
            padding: 10px 12px !important;
            display: grid !important;
            grid-template-columns: 1fr auto;
            grid-template-areas:
              "back actions"
              "search search";
            gap: 10px;
          }
          .analyze-header .header-back-link {
            grid-area: back;
            font-size: 14px !important;
            line-height: 1.2;
          }
          .analyze-header .header-video-title {
            display: none;
          }
          .analyze-header .header-search {
            grid-area: search;
            width: 100%;
            max-width: none !important;
          }
          .analyze-header .header-actions {
            grid-area: actions;
            justify-content: flex-end;
            gap: 6px;
          }
          .analyze-header .header-actions .ant-btn {
            padding: 0 10px;
            font-size: 12px;
          }
          .main-tabs-mobile > .ant-tabs-nav {
            padding: 0 10px;
          }
          .main-tabs-mobile .ant-tabs-tab {
            padding: 10px 12px;
            font-size: 13px;
          }
          .main-tabs-mobile .ant-tabs-tabpane > div {
            padding: 14px !important;
          }
          .main-tabs-mobile .mindmap-pane {
            padding: 12px !important;
          }
          .main-tabs-mobile .markdown-body {
            font-size: 13px;
            line-height: 1.75;
          }
          .main-tabs-mobile .markdown-body h1 {
            font-size: 18px;
          }
          .main-tabs-mobile .markdown-body h2 {
            font-size: 16px;
          }
          .mobile-side-panel-wrap .analyze-video-card {
            margin-bottom: 0;
          }
          .mobile-side-panel-wrap .analyze-video-cover {
            aspect-ratio: 16 / 6 !important;
            max-height: 132px;
          }
          .mobile-side-panel-wrap .analyze-video-card .ant-card-body {
            padding-top: 8px !important;
          }
          .mobile-side-panel-wrap .analyze-video-card .ant-typography {
            margin-bottom: 2px !important;
          }
        }
      `}</style>
    </Layout>
  );
}
