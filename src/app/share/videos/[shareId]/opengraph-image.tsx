import { ImageResponse } from "next/og";
import prisma from "@/lib/db";
import { makeSeoDescription } from "@/lib/share";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

type Props = {
  params: Promise<{ shareId: string }>;
};

export default async function Image({ params }: Props) {
  const { shareId } = await params;
  const share = await prisma.sharePage.findUnique({ where: { shareId } });
  const video = share?.visibility === "public"
    ? await prisma.video.findUnique({ where: { id: share.targetId } })
    : null;

  const title = video?.title || "视记 VideoNote";
  const description = makeSeoDescription(video?.summary, video?.desc);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0a0a1a 0%, #14142d 55%, #24142a 100%)",
          color: "white",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#fb7299", fontSize: 30, fontWeight: 800 }}>
          <span>◇</span>
          <span>视记 VideoNote</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 58, lineHeight: 1.12, fontWeight: 900, letterSpacing: 0 }}>{title}</div>
          <div style={{ fontSize: 26, lineHeight: 1.45, color: "#cbd5e1", maxWidth: 960 }}>{description}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 24, color: "#93c5fd" }}>
          <span>AI 摘要 · 思维导图 · 结构化知识</span>
          <span>afai.asia</span>
        </div>
      </div>
    ),
    size,
  );
}
