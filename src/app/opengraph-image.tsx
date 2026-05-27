import { ImageResponse } from "next/og";
import { HOME_DESCRIPTION, SITE_NAME } from "@/lib/seo";

export const alt = "视记 VideoNote - AI 视频转知识笔记";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#fff7fb",
          color: "#1f2937",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#fb7299" }}>{SITE_NAME}</div>
          <div
            style={{
              padding: "10px 18px",
              border: "2px solid #fb7299",
              borderRadius: 999,
              color: "#be185d",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            B站 / 抖音 / 小红书
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 76, lineHeight: 1.08, fontWeight: 800, letterSpacing: 0 }}>
            AI 视频转知识笔记
          </div>
          <div style={{ maxWidth: 880, fontSize: 31, lineHeight: 1.45, color: "#4b5563" }}>
            视频摘要、思维导图、结构化知识点和个人知识库
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, color: "#6b7280", fontSize: 24 }}>
          <span>AI 摘要</span>
          <span>思维导图</span>
          <span>公开视频分享</span>
          <span>Skill 导出</span>
        </div>
        <div style={{ display: "none" }}>{HOME_DESCRIPTION}</div>
      </div>
    ),
    size,
  );
}
