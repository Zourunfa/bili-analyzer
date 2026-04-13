import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

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

    const { id: notebookId } = await params;
    const { videoId } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: "缺少 videoId" }, { status: 400 });
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
    return NextResponse.json({ error: "添加失败" }, { status: 500 });
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

    const { id: notebookId } = await params;
    const { videoId } = await req.json();

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
    return NextResponse.json({ error: "移除失败" }, { status: 500 });
  }
}
