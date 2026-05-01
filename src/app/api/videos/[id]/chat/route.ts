import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { id: videoId } = await params;
    const owned = await prisma.userVideo.findUnique({
      where: { userId_videoId: { userId, videoId } },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { userId, videoId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("获取对话历史错误:", error);
    return NextResponse.json({ error: "获取对话历史失败" }, { status: 500 });
  }
}
