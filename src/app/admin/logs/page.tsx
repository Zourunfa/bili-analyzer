"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  message,
  Result,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import {
  BugOutlined,
  CopyOutlined,
  DownOutlined,
  FileSearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

type LogEntry = {
  source: "pm2-out" | "pm2-error";
  label: string;
  level: "info" | "error";
  message: string;
};

type LogsResponse = {
  logs: LogEntry[];
  fetchedAt: string;
  error?: string;
};

const lineOptions = [
  { label: "100 行", value: 100 },
  { label: "200 行", value: 200 },
  { label: "500 行", value: 500 },
  { label: "1000 行", value: 1000 },
];

const typeOptions = [
  { label: "全部日志", value: "all" },
  { label: "输出日志", value: "out" },
  { label: "错误日志", value: "error" },
];

function formatTime(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default function AdminLogsPage() {
  const { status } = useSession();
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [type, setType] = useState("all");
  const [lines, setLines] = useState(200);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const params = new URLSearchParams({
        type,
        lines: String(lines),
        keyword,
      });
      const res = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = (await res.json()) as LogsResponse;

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "读取日志失败");
      }

      setLogs(data.logs);
      setFetchedAt(data.fetchedAt);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取日志失败");
    } finally {
      setLoading(false);
    }
  }, [keyword, lines, router, type]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchLogs();
    }
  }, [fetchLogs, router, status]);

  useEffect(() => {
    if (!autoRefresh || status !== "authenticated") return;
    const timer = window.setInterval(fetchLogs, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchLogs, status]);

  const renderedLogs = useMemo(
    () =>
      logs.map((entry, index) => ({
        ...entry,
        key: `${entry.source}-${index}-${entry.message.slice(0, 12)}`,
      })),
    [logs],
  );

  const copyLogs = async () => {
    await navigator.clipboard.writeText(logs.map((entry) => `[${entry.label}] ${entry.message}`).join("\n"));
    message.success("日志已复制");
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  if (forbidden) {
    return (
      <Result
        status="403"
        title="没有日志查看权限"
        subTitle="请确认当前登录邮箱已配置到 ADMIN_EMAILS。"
        extra={<Button onClick={() => router.push("/")}>返回首页</Button>}
      />
    );
  }

  return (
    <div className="admin-logs-page">
      <section className="admin-logs-header">
        <div>
          <div className="admin-eyebrow">
            <FileSearchOutlined />
            后台管理
          </div>
          <h1>日志中心</h1>
          <p>查看 PM2 应用输出和错误日志，方便快速排查线上问题。</p>
        </div>
        <Space wrap>
          <Tooltip title="复制当前筛选后的日志">
            <Button icon={<CopyOutlined />} onClick={copyLogs} disabled={!logs.length}>
              复制
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
            刷新
          </Button>
        </Space>
      </section>

      <section className="admin-log-toolbar">
        <Select value={type} onChange={setType} options={typeOptions} />
        <Select value={lines} onChange={setLines} options={lineOptions} />
        <Input.Search
          allowClear
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onSearch={fetchLogs}
          placeholder="按关键词过滤"
        />
        <div className="auto-refresh">
          <Switch checked={autoRefresh} onChange={setAutoRefresh} />
          <span>5 秒自动刷新</span>
        </div>
      </section>

      <section className="admin-log-status">
        <Space wrap>
          <Tag color="blue">{logs.length} 行</Tag>
          <Tag color="default">更新时间 {formatTime(fetchedAt)}</Tag>
          {keyword ? <Tag color="purple">关键词：{keyword}</Tag> : null}
        </Space>
        <Button size="small" icon={<DownOutlined />} onClick={scrollToBottom}>
          到底部
        </Button>
      </section>

      <section className="log-viewer" aria-busy={loading}>
        {renderedLogs.length ? (
          renderedLogs.map((entry) => (
            <div key={entry.key} className={`log-line ${entry.level === "error" ? "is-error" : ""}`}>
              <span className="log-source">{entry.label}</span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        ) : (
          <div className="log-empty">
            <BugOutlined />
            <span>{loading ? "正在读取日志..." : "没有匹配的日志"}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      <style jsx>{`
        .admin-logs-page {
          max-width: 1240px;
          margin: 0 auto;
          padding: 32px 24px 48px;
        }
        .admin-logs-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
        }
        .admin-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--primary);
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        h1 {
          color: var(--foreground);
          font-size: 28px;
          line-height: 1.25;
          margin: 0 0 6px;
        }
        p {
          color: var(--muted-foreground);
          margin: 0;
        }
        .admin-log-toolbar {
          display: grid;
          grid-template-columns: 140px 120px minmax(220px, 1fr) auto;
          gap: 12px;
          align-items: center;
          margin-bottom: 14px;
        }
        .auto-refresh {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted-foreground);
          font-size: 13px;
          white-space: nowrap;
        }
        .admin-log-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .log-viewer {
          min-height: 560px;
          max-height: calc(100vh - 300px);
          overflow: auto;
          background: #0b1020;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 14px 0;
          color: #d7deef;
          font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          line-height: 1.65;
        }
        .log-line {
          display: grid;
          grid-template-columns: 104px minmax(0, 1fr);
          gap: 12px;
          padding: 2px 16px;
          border-left: 3px solid transparent;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .log-line:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .log-line.is-error {
          background: rgba(255, 71, 87, 0.08);
          border-left-color: #ff6b7a;
          color: #ffd0d6;
        }
        .log-source {
          color: #7dd3fc;
          user-select: none;
        }
        .log-message {
          min-width: 0;
        }
        .log-empty {
          min-height: 420px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: #93a4c7;
        }
        @media (max-width: 780px) {
          .admin-logs-page {
            padding: 24px 16px 40px;
          }
          .admin-logs-header {
            flex-direction: column;
          }
          .admin-log-toolbar {
            grid-template-columns: 1fr;
          }
          .admin-log-status {
            align-items: flex-start;
            flex-direction: column;
          }
          .log-line {
            grid-template-columns: 1fr;
            gap: 0;
          }
        }
      `}</style>
    </div>
  );
}
