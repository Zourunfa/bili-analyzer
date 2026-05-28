import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { createShareId, getNotebookShareUrl, makeSeoDescription } from "@/lib/share";

type Params = {
  params: Promise<{ notebookId: string }>;
};

function getUserId(session: unknown) {
  return ((session as { user?: { id?: string } } | null)?.user)?.id;
}

async function getOwnedNotebook(userId: string, notebookId: string) {
  return prisma.notebook.findFirst({
    where: { id: notebookId, userId },
    include: {
      videos: {
        orderBy: { order: "asc" },
        take: 1,
        include: {
          video: {
            select: {
              pic: true,
              summary: true,
              desc: true,
            },
          },
        },
      },
      _count: { select: { videos: true } },
    },
  });
}

function buildNotebookDescription(notebook: {
  description: string | null;
  title: string;
  videos: Array<{ video: { summary: string | null; desc: string | null } }>;
}) {
  const firstVideo = notebook.videos[0]?.video;
  return makeSeoDescription(
    notebook.description || firstVideo?.summary,
    firstVideo?.desc || `${notebook.title} 的视频知识笔记合集`
  );
}

function assertManualShareable(notebook: Awaited<ReturnType<typeof getOwnedNotebook>>) {
  if (!notebook) return "笔记本不存在或无权访问";
  if (notebook.mode !== "manual") return "智能笔记本暂不支持公开分享";
  if (notebook._count.videos < 1) return "笔记本中还没有视频，无法公开分享";
  return null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { notebookId } = await params;
  const notebook = await getOwnedNotebook(userId, notebookId);
  if (!notebook) return NextResponse.json({ error: "笔记本不存在或无权访问" }, { status: 404 });

  const share = await prisma.sharePage.findUnique({
    where: {
      userId_targetType_targetId: {
        userId,
        targetType: "notebook",
        targetId: notebookId,
      },
    },
  });

  return NextResponse.json({
    share: share
      ? {
          ...share,
          url: getNotebookShareUrl(share.shareId),
        }
      : null,
    shareable: notebook.mode === "manual" && notebook._count.videos > 0,
    reason: assertManualShareable(notebook),
  });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { notebookId } = await params;
  const notebook = await getOwnedNotebook(userId, notebookId);
  const notShareable = assertManualShareable(notebook);
  if (notShareable || !notebook) {
    return NextResponse.json({ error: notShareable || "笔记本不存在或无权访问" }, { status: notebook ? 400 : 404 });
  }

  const coverImage = notebook.coverImage || notebook.videos[0]?.video.pic || null;
  const description = buildNotebookDescription(notebook);
  const share = await prisma.sharePage.upsert({
    where: {
      userId_targetType_targetId: {
        userId,
        targetType: "notebook",
        targetId: notebookId,
      },
    },
    update: {
      title: notebook.title,
      description,
      coverImage,
      visibility: "public",
    },
    create: {
      shareId: createShareId(),
      userId,
      targetType: "notebook",
      targetId: notebookId,
      title: notebook.title,
      description,
      coverImage,
      visibility: "public",
    },
  });

  return NextResponse.json({ share: { ...share, url: getNotebookShareUrl(share.shareId) } });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const userId = getUserId(session);
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { notebookId } = await params;
  const notebook = await getOwnedNotebook(userId, notebookId);
  if (!notebook) return NextResponse.json({ error: "笔记本不存在或无权访问" }, { status: 404 });

  const share = await prisma.sharePage.update({
    where: {
      userId_targetType_targetId: {
        userId,
        targetType: "notebook",
        targetId: notebookId,
      },
    },
    data: { visibility: "disabled" },
  }).catch(() => null);

  return NextResponse.json({ share });
}
