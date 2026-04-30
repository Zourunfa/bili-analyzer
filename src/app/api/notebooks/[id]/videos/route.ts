import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

// 关联视频到笔记本
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();
    const userId = (session.user as { id?: string }).id;

    const { id: notebookId } = await params;
    const { videoId } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: "缺少 videoId" }, { status: 400 });
    }

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true, mode: true },
    });
    if (!notebook) {
      return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });
    }
    if (notebook.mode === "smart") {
      return NextResponse.json({ error: "智能合集不支持手动添加视频" }, { status: 400 });
    }

    const video = await prisma.video.findFirst({
      where: {
        id: videoId,
        userVideos: {
          some: { userId },
        },
      },
      select: { id: true },
    });
    if (!video) {
      return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });
    }

    // 检查是否已关联
    const existing = await prisma.notebookVideo.findUnique({
      where: { notebookId_videoId: { notebookId, videoId } },
    });

    if (existing) {
      return NextResponse.json({ message: "视频已在该笔记本中" });
    }

    // 获取当前最大排序号
    const maxOrder = await prisma.notebookVideo.findFirst({
      where: { notebookId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    await prisma.notebookVideo.create({
      data: {
        notebookId,
        videoId,
        order: (maxOrder?.order ?? 0) + 1,
      },
    });

    // 更新视频计数
    await prisma.notebook.update({
      where: { id: notebookId },
      data: { videoCount: { increment: 1 } },
    });

    return NextResponse.json({ message: "添加成功" });
  } catch (error) {
    console.error("关联视频错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "添加失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

// 从笔记本移除视频
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();
    const userId = (session.user as { id?: string }).id;

    const { id: notebookId } = await params;
    const { videoId } = await req.json();

    const notebook = await prisma.notebook.findFirst({
      where: { id: notebookId, userId },
      select: { id: true, mode: true },
    });
    if (!notebook) {
      return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });
    }
    if (notebook.mode === "smart") {
      return NextResponse.json({ error: "智能合集不支持手动移除视频" }, { status: 400 });
    }

    await prisma.notebookVideo.deleteMany({
      where: { notebookId, videoId },
    });

    await prisma.notebook.update({
      where: { id: notebookId },
      data: { videoCount: { decrement: 1 } },
    });

    return NextResponse.json({ message: "移除成功" });
  } catch (error) {
    console.error("移除视频错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "移除失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
