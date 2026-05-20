"use client";

import { useEffect, useRef, useState } from "react";
import { App, Button, Space } from "antd";
import { CompressOutlined, CopyOutlined, ExpandOutlined } from "@ant-design/icons";

interface MindMapViewProps {
  markdown: string;
}

function getCommonJsExport<T>(module: T | { default?: T }): T {
  return (module as { default?: T }).default ?? (module as T);
}

function getMindMapCanvasSize(markdown: string) {
  const lineCount = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;

  return {
    width: 2200,
    height: Math.max(760, lineCount * 42),
  };
}

const BRANCH_COLORS = [
  "#fb7299",
  "#4cc9f0",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#ff7aa2",
];

function getBranchColor(branch: unknown) {
  const index = typeof branch === "number" && Number.isFinite(branch) ? branch : 0;
  return BRANCH_COLORS[Math.abs(index) % BRANCH_COLORS.length];
}

function applyBrandMindMapColors(svg: SVGSVGElement) {
  svg.querySelectorAll<SVGPathElement>("path.markmap-link").forEach((path) => {
    const data = (path as SVGPathElement & { __data__?: { target?: { branch?: unknown } } }).__data__;
    const color = getBranchColor(data?.target?.branch);
    path.style.stroke = color;
    path.style.strokeOpacity = "0.58";
    path.style.strokeLinecap = "round";
    path.style.strokeLinejoin = "round";
    path.style.filter = "var(--mindmap-link-filter)";
  });

  svg.querySelectorAll<SVGGElement>("g.markmap-node").forEach((node) => {
    const data = (node as SVGGElement & { __data__?: { branch?: unknown; depth?: number } }).__data__;
    const color = data?.depth === 0 ? "#fb7299" : getBranchColor(data?.branch);
    const text = node.querySelector<SVGTextElement>("text.markmap-node-text");
    const circle = node.querySelector<SVGCircleElement>("circle.markmap-node-circle");
    const rect = node.querySelector<SVGRectElement>("rect.markmap-node-rect");

    if (text) {
      text.style.fill = data?.depth === 0 ? "var(--mindmap-root-text)" : "var(--mindmap-node-text)";
      text.style.stroke = "var(--mindmap-node-stroke)";
      text.style.strokeWidth = data?.depth === 0 ? "4px" : "3px";
      text.style.paintOrder = "stroke";
      text.style.fontWeight = data?.depth === 0 ? "700" : "500";
    }

    if (circle) {
      circle.style.stroke = color;
      circle.style.fill = color;
      circle.style.filter = `drop-shadow(0 0 8px ${color}88)`;
    }

    if (rect) {
      rect.style.fill = color;
      rect.style.fillOpacity = data?.depth === 0 ? "0.95" : "0.72";
    }
  });
}

export default function MindMapView({ markdown }: MindMapViewProps) {
  const { message } = App.useApp();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!styleTagRef.current) {
      const style = document.createElement("style");
      style.textContent = `
        :root {
          --mindmap-shell-bg: #ffffff;
          --mindmap-canvas-bg: radial-gradient(circle at 12% 8%, rgba(251, 114, 153, 0.12), transparent 30%), radial-gradient(circle at 88% 82%, rgba(76, 201, 240, 0.14), transparent 34%), #ffffff;
          --mindmap-helper-text: #6b7284;
          --mindmap-node-text: #202338;
          --mindmap-root-text: #ffffff;
          --mindmap-node-stroke: rgba(255, 255, 255, 0.9);
          --mindmap-link-filter: none;
          --mindmap-border: rgba(251, 114, 153, 0.16);
        }
        .dark {
          --mindmap-shell-bg: #0a0a1a;
          --mindmap-canvas-bg: radial-gradient(circle at 12% 8%, rgba(251, 114, 153, 0.16), transparent 30%), radial-gradient(circle at 88% 82%, rgba(76, 201, 240, 0.12), transparent 34%), #0a0a1a;
          --mindmap-helper-text: var(--muted-foreground);
          --mindmap-node-text: #f3f4ff;
          --mindmap-root-text: #ffffff;
          --mindmap-node-stroke: #0a0a1a;
          --mindmap-link-filter: drop-shadow(0 0 5px rgba(251, 114, 153, 0.28));
          --mindmap-border: rgba(251, 114, 153, 0.12);
        }
        .markmap { display: block !important; }
        .markmap text {
          font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
          fill: var(--mindmap-node-text);
        }
        .markmap-node-text {
          paint-order: stroke;
          stroke: var(--mindmap-node-stroke);
          stroke-width: 3px;
          stroke-linejoin: round;
        }
        .markmap-node {
          cursor: pointer;
        }
        .markmap-link {
          fill: none;
        }
        .mindmap-view-shell:fullscreen {
          background: var(--mindmap-shell-bg) !important;
        }
        .mindmap-view-shell:fullscreen .mindmap-view-canvas {
          background: var(--mindmap-canvas-bg) !important;
        }
      `;
      document.head.appendChild(style);
      styleTagRef.current = style;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !markdown.trim()) return;

    let cancelled = false;
    const container = containerRef.current;
    container.innerHTML = "";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "markmap");
    const canvasSize = getMindMapCanvasSize(markdown);
    svg.setAttribute("width", String(canvasSize.width));
    svg.setAttribute("height", String(canvasSize.height));
    svg.style.minWidth = `${canvasSize.width}px`;
    svg.style.minHeight = `${canvasSize.height}px`;
    container.appendChild(svg);
    const colorizeAfterClick = () => {
      window.setTimeout(() => applyBrandMindMapColors(svg), 0);
    };

    async function renderMindMap() {
      try {
        const [parseModule, transformModule] = await Promise.all([
          import("markmap/lib/parse.markdown"),
          import("markmap/lib/transform.headings"),
          import("markmap/lib/d3-flextree"),
        ]);
        const viewModule = await import("markmap/lib/view.mindmap");
        if (cancelled || !containerRef.current?.contains(svg)) return;

        const parse = getCommonJsExport<(text: string) => unknown>(parseModule);
        const transform = getCommonJsExport<(data: unknown) => unknown>(transformModule);
        const Markmap = getCommonJsExport<(...args: unknown[]) => unknown>(viewModule as unknown as { default?: (...args: unknown[]) => unknown });
        const data = transform(parse(markdown));

        Markmap(svg, data, {
          preset: "default",
          linkShape: "diagonal",
          autoFit: false,
          duration: 0,
          nodeHeight: 30,
          nodePadding: 10,
          nodeFont: '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          spacingVertical: 16,
          spacingHorizontal: 120,
          truncateLabels: 56,
        });
        applyBrandMindMapColors(svg);
        svg.addEventListener("click", colorizeAfterClick);
      } catch (error) {
        console.error("思维导图渲染失败:", error);
        if (!cancelled) message.error("思维导图渲染失败");
      }
    }

    renderMindMap();

    return () => {
      cancelled = true;
      svg.removeEventListener("click", colorizeAfterClick);
      container.innerHTML = "";
    };
  }, [markdown, message]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleCopyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    message.success("Markdown 已复制");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await wrapperRef.current?.requestFullscreen();
    } catch {
      message.error("全屏切换失败");
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="mindmap-view-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        height: isFullscreen ? "100vh" : "100%",
        background: "var(--mindmap-shell-bg)",
        padding: isFullscreen ? 16 : 0,
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isFullscreen ? "8px 4px 12px" : "8px 4px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: "var(--mindmap-helper-text)" }}>
          点击节点可展开/折叠 | 滚轮缩放 | 拖拽平移
        </span>
        <Space>
          <Button
            size="small"
            icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
            onClick={handleToggleFullscreen}
          >
            {isFullscreen ? "退出全屏" : "全屏"}
          </Button>
          <Button size="small" icon={<CopyOutlined />} type={copied ? "primary" : "default"} onClick={handleCopyMarkdown}>
            {copied ? "已复制" : "复制 Markdown"}
          </Button>
        </Space>
      </div>
      <div
        ref={containerRef}
        className="mindmap-view-canvas"
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--mindmap-canvas-bg)",
          borderRadius: "0 0 12px 12px",
          border: "1px solid var(--mindmap-border)",
          padding: 16,
          minHeight: 0,
        }}
      />
    </div>
  );
}
