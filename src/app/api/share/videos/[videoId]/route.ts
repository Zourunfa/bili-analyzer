import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { createShareId, getVideoShareUrl, makeSeoDescription } from "@/lib/share";

type Params = {
  params: Promise<{ videoId: string }>;
};

function getUserId(session: unknown) {
  return ((session as { user?: { id?: string } } | null)?.user)?.id;
}

async function assertOwnsVideo(userId: string, videoId: string) {
  return prisma.userVideo.findUnique({
    where: { userId_videoId: { userId, videoId } },
    include: { video: true },
  });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { videoId } = await params;
  const owned = await assertOwnsVideo(userId, videoId);
  if (!owned) return NextResponse.json({ error: "视频不存在或无权访问" }, { status: 404 });

  const share = await prisma.sharePage.findUnique({
    where: {
      userId_targetType_targetId: {
        userId,
        targetType: "video",
        targetId: videoId,
      },
    },
  });

  return NextResponse.json({
    share: share
      ? {
          ...share,
          url: getVideoShareUrl(share.shareId),
        }
      : null,
  });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { videoId } = await params;
  const owned = await assertOwnsVideo(userId, videoId);
  if (!owned) return NextResponse.json({ error: "视频不存在或无权访问" }, { status: 404 });

  const video = owned.video;
  const share = await prisma.sharePage.upsert({
    where: {
      userId_targetType_targetId: {
        userId,
        targetType: "video",
        targetId: videoId,
      },
    },
    update: {
      title: video.title,
      description: makeSeoDescription(video.summary, video.desc),
      coverImage: video.pic,
      visibility: "public",
    },
    create: {
      shareId: createShareId(),
      userId,
      targetType: "video",
      targetId: videoId,
      title: video.title,
      description: makeSeoDescription(video.summary, video.desc),
      coverImage: video.pic,
      visibility: "public",
    },
  });

  return NextResponse.json({ share: { ...share, url: getVideoShareUrl(share.shareId) } });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { videoId } = await params;
  const owned = await assertOwnsVideo(userId, videoId);
  if (!owned) return NextResponse.json({ error: "视频不存在或无权访问" }, { status: 404 });

  const share = await prisma.sharePage.update({
    where: {
      userId_targetType_targetId: {
        userId,
        targetType: "video",
        targetId: videoId,
      },
    },
    data: { visibility: "disabled" },
  }).catch(() => null);

  return NextResponse.json({ share });
}
