import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

async function getAuthedVideoByBvid(userId: string, bvid: string) {
  return prisma.video.findFirst({
    where: {
      bvid,
      userVideos: {
        some: { userId },
      },
    },
    select: {
      id: true,
      bvid: true,
      title: true,
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id: bvid } = await params;
    const video = await getAuthedVideoByBvid(userId, bvid);
    if (!video) return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });

    const notes = await prisma.videoTimestampNote.findMany({
      where: { userId, videoId: video.id },
      orderBy: [{ timestampSec: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ notes });
  } catch (error) {
    console.error("获取时间戳笔记失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "获取时间戳笔记失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id: bvid } = await params;
    const video = await getAuthedVideoByBvid(userId, bvid);
    if (!video) return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });

    const body = await req.json();
    const timestampSec = Number(body?.timestampSec);
    const content = String(body?.content || "").trim();
    const sourceText = typeof body?.sourceText === "string" ? body.sourceText.trim() : null;

    if (!Number.isFinite(timestampSec) || timestampSec < 0) {
      return NextResponse.json({ error: "timestampSec 必须是非负数字" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "笔记内容不能为空" }, { status: 400 });
    }

    const note = await prisma.videoTimestampNote.create({
      data: {
        userId,
        videoId: video.id,
        timestampSec: Math.floor(timestampSec),
        content,
        sourceText,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("创建时间戳笔记失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "创建时间戳笔记失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
