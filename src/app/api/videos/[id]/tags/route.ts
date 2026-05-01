import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

async function getAuthedVideo(userId: string, bvid: string) {
  return prisma.video.findFirst({
    where: {
      bvid,
      userVideos: {
        some: { userId },
      },
    },
    select: { id: true, bvid: true },
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
    const video = await getAuthedVideo(userId, bvid);
    if (!video) return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });

    const tags = await prisma.videoTagRelation.findMany({
      where: { userId, videoId: video.id },
      include: {
        tag: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tags: tags.map((item) => item.tag) });
  } catch (error) {
    console.error("获取视频标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "获取视频标签失败");
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
    const video = await getAuthedVideo(userId, bvid);
    if (!video) return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });

    const body = await req.json();
    const tagId = String(body?.tagId || "").trim();
    if (!tagId) return NextResponse.json({ error: "缺少 tagId" }, { status: 400 });

    const tag = await prisma.videoTag.findFirst({
      where: { id: tagId, userId },
      select: { id: true },
    });
    if (!tag) return NextResponse.json({ error: "标签不存在" }, { status: 404 });

    await prisma.videoTagRelation.upsert({
      where: {
        userId_videoId_tagId: {
          userId,
          videoId: video.id,
          tagId,
        },
      },
      update: {},
      create: {
        userId,
        videoId: video.id,
        tagId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("绑定视频标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "绑定视频标签失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id: bvid } = await params;
    const video = await getAuthedVideo(userId, bvid);
    if (!video) return NextResponse.json({ error: "视频不存在或无权限" }, { status: 404 });

    const body = await req.json();
    const tagId = String(body?.tagId || "").trim();
    if (!tagId) return NextResponse.json({ error: "缺少 tagId" }, { status: 400 });

    await prisma.videoTagRelation.deleteMany({
      where: {
        userId,
        videoId: video.id,
        tagId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("移除视频标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "移除视频标签失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
