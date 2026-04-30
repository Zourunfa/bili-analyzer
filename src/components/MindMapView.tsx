"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Space, message } from "antd";
import { CopyOutlined, ExpandOutlined, CompressOutlined } from "@ant-design/icons";

interface MindMapViewProps {
  markdown: string;
}

export default function MindMapView({ markdown }: MindMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptTagRef = useRef<HTMLScriptElement | null>(null);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!styleTagRef.current) {
      const style = document.createElement("style");
      style.textContent = `
        .markmap { width: 100% !important; height: 100% !important; min-height: 500px; display: block !important; }
        .markmap > svg { width: 100% !important; height: 100% !important; }
      `;
      document.head.appendChild(style);
      styleTagRef.current = style;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !markdown.trim()) return;

    const container = containerRef.current;
    container.innerHTML = "";

    const markmapDiv = document.createElement("div");
    markmapDiv.className = "markmap";

    const script = document.createElement("script");
    script.type = "text/template";
    script.textContent = markdown;

    markmapDiv.appendChild(script);
    container.appendChild(markmapDiv);

    // markmap-autoloader 通过 MutationObserver 自动检测新增的 .markmap 元素并渲染
    if (!window.markmap?.autoLoader && !scriptTagRef.current) {
      const tag = document.createElement("script");
      tag.src = "https://cdn.jsdelivr.net/npm/markmap-autoloader@latest";
      tag.onerror = () => message.error("思维导图加载失败");
      document.head.appendChild(tag);
      scriptTagRef.current = tag;
    }
  }, [markdown]);

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    message.success("Markdown 已复制");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 4px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          点击节点可展开/折叠 | 滚轮缩放 | 拖拽平移
        </span>
        <Space>
          <Button size="small" icon={<CopyOutlined />} type={copied ? "primary" : "default"} onClick={handleCopyMarkdown}>
            {copied ? "已复制" : "复制 Markdown"}
          </Button>
        </Space>
      </div>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "auto",
          background: "#fff",
          borderRadius: "0 0 12px 12px",
          padding: 16,
          minHeight: 0,
        }}
      />
    </div>
  );
}

declare global {
  interface Window {
    markmap?: {
      autoLoader?: unknown;
    };
  }
}
